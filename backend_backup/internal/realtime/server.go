package realtime

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"claude-punk/internal/protocol"
	"claude-punk/internal/session"
	"claude-punk/internal/watcher"

	"github.com/gorilla/websocket"
)

const (
	pingInterval  = 30 * time.Second
	readDeadline  = 60 * time.Second
	writeDeadline = 10 * time.Second
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow localhost origins for dev.
	},
}

// Server manages WebSocket connections and routes messages between
// clients, the session manager, and the file watcher.
type Server struct {
	sessionMgr *session.Manager
	fileWatch  *watcher.Watcher
	clients    map[*client]bool
	clientsMu  sync.RWMutex
	staticDir  string

	// subscriptions tracks which output subscriptions exist per client.
	// key: client, value: map[sessionID]subscriptionID
	subscriptions   map[*client]map[string]string
	subscriptionsMu sync.Mutex
}

type client struct {
	conn   *websocket.Conn
	send   chan []byte
	server *Server
}

// New creates a new realtime server.
func New(sessionMgr *session.Manager, fileWatch *watcher.Watcher, staticDir string) *Server {
	return &Server{
		sessionMgr:    sessionMgr,
		fileWatch:     fileWatch,
		clients:       make(map[*client]bool),
		staticDir:     staticDir,
		subscriptions: make(map[*client]map[string]string),
	}
}

// Handler returns an http.Handler with all routes configured.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// WebSocket endpoint.
	mux.HandleFunc("/ws", s.handleWebSocket)

	// REST API endpoints.
	mux.HandleFunc("POST /sessions", s.handleCreateSession)
	mux.HandleFunc("GET /sessions", s.handleListSessions)
	mux.HandleFunc("GET /sessions/{id}", s.handleGetSession)
	mux.HandleFunc("POST /sessions/{id}/prompt", s.handleSendPrompt)
	mux.HandleFunc("DELETE /sessions/{id}", s.handleDeleteSession)

	// Static file serving.
	if s.staticDir != "" {
		fileServer := http.FileServer(http.Dir(s.staticDir))
		mux.Handle("/", fileServer)
	}

	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// handleWebSocket upgrades an HTTP connection to WebSocket.
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	c := &client{
		conn:   conn,
		send:   make(chan []byte, 256),
		server: s,
	}

	s.clientsMu.Lock()
	s.clients[c] = true
	s.clientsMu.Unlock()

	s.subscriptionsMu.Lock()
	s.subscriptions[c] = make(map[string]string)
	s.subscriptionsMu.Unlock()

	// Send current session list to new client.
	s.sendSessionList(c)

	// Subscribe new client to all active sessions' output so it receives
	// responses for sessions that already existed before this connection.
	s.subscribeClientToActiveSessions(c)

	go c.writePump()
	go c.readPump()
}

// sendSessionList sends the current session state to a client.
func (s *Server) sendSessionList(c *client) {
	sessions := s.sessionMgr.List()
	for _, sess := range sessions {
		msg, err := protocol.NewMessage(protocol.TypeSessionUpdate, protocol.SessionUpdatePayload{
			ID:        sess.ID,
			State:     string(sess.State),
			WorkDir:   sess.WorkDir,
			Label:     sess.Label,
			CreatedAt: sess.CreatedAt.Format(time.RFC3339Nano),
		})
		if err != nil {
			continue
		}
		data, _ := json.Marshal(msg)
		select {
		case c.send <- data:
		default:
		}
	}
}

// readPump reads messages from the WebSocket connection.
func (c *client) readPump() {
	defer func() {
		c.server.removeClient(c)
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(readDeadline))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(readDeadline))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("websocket read error: %v", err)
			}
			return
		}

		c.server.handleMessage(c, message)
	}
}

// writePump writes messages to the WebSocket connection.
func (c *client) writePump() {
	ticker := time.NewTicker(pingInterval)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// removeClient cleans up a disconnected client.
func (s *Server) removeClient(c *client) {
	s.clientsMu.Lock()
	delete(s.clients, c)
	s.clientsMu.Unlock()

	// Unsubscribe from all session outputs.
	s.subscriptionsMu.Lock()
	subs := s.subscriptions[c]
	delete(s.subscriptions, c)
	s.subscriptionsMu.Unlock()

	for sessionID, subID := range subs {
		s.sessionMgr.Unsubscribe(sessionID, subID)
	}

	close(c.send)
}

// handleMessage processes a validated client message.
func (s *Server) handleMessage(c *client, raw []byte) {
	msg, err := protocol.ValidateClientMessage(raw)
	if err != nil {
		s.sendError(c, protocol.ErrInvalidMessage, err.Error())
		return
	}

	switch msg.Type {
	case protocol.TypeSessionCreate:
		s.handleWSCreateSession(c, msg)
	case protocol.TypeSessionPrompt:
		s.handleWSPrompt(c, msg)
	case protocol.TypeSessionKill:
		s.handleWSKill(c, msg)
	case protocol.TypeFilesRequestTree:
		s.handleWSFilesTree(c, msg)
	case protocol.TypeClaudeRequestConfig:
		s.handleWSClaudeConfig(c, msg)
	}
}

func (s *Server) handleWSCreateSession(c *client, msg *protocol.Message) {
	var payload protocol.SessionCreatePayload
	json.Unmarshal(msg.Payload, &payload)

	sess, err := s.sessionMgr.Create(payload.WorkDir, payload.Label)
	if err != nil {
		errCode := protocol.ErrSpawnFailed
		if err.Error() == "claude CLI not found in PATH" {
			errCode = protocol.ErrSpawnFailed
		}
		s.sendError(c, errCode, err.Error())
		return
	}

	// Start file watching.
	if err := s.fileWatch.Watch(sess.ID, sess.WorkDir); err != nil {
		log.Printf("failed to start file watcher for session %s: %v", sess.ID, err)
	}

	// Broadcast session update to all clients.
	s.broadcastSessionUpdate(sess)

	// Subscribe this client (and all clients) to session output.
	s.subscribeAllClients(sess.ID)
}

func (s *Server) handleWSPrompt(c *client, msg *protocol.Message) {
	var payload protocol.SessionPromptPayload
	json.Unmarshal(msg.Payload, &payload)

	if err := s.sessionMgr.SendPrompt(payload.SessionID, payload.Prompt); err != nil {
		errCode := protocol.ErrSessionNotFound
		if err.Error() == "session terminated: "+payload.SessionID {
			errCode = protocol.ErrSessionTerminated
		}
		s.sendError(c, errCode, err.Error())
	}
}

func (s *Server) handleWSKill(c *client, msg *protocol.Message) {
	var payload protocol.SessionKillPayload
	json.Unmarshal(msg.Payload, &payload)

	if err := s.sessionMgr.Kill(payload.SessionID); err != nil {
		s.sendError(c, protocol.ErrSessionNotFound, err.Error())
	}
}

func (s *Server) handleWSFilesTree(c *client, msg *protocol.Message) {
	var payload protocol.SessionIDPayload
	json.Unmarshal(msg.Payload, &payload)

	workDir, err := s.sessionMgr.GetWorkDir(payload.SessionID)
	if err != nil {
		s.sendError(c, protocol.ErrSessionNotFound, err.Error())
		return
	}

	tree := watcher.BuildFileTree(workDir, 3)

	resp, _ := protocol.NewMessage(protocol.TypeFilesTree, protocol.FilesTreePayload{
		SessionID: payload.SessionID,
		Tree:      tree,
	})
	data, _ := json.Marshal(resp)
	select {
	case c.send <- data:
	default:
	}
}

func (s *Server) handleWSClaudeConfig(c *client, msg *protocol.Message) {
	var payload protocol.SessionIDPayload
	json.Unmarshal(msg.Payload, &payload)

	workDir, err := s.sessionMgr.GetWorkDir(payload.SessionID)
	if err != nil {
		s.sendError(c, protocol.ErrSessionNotFound, err.Error())
		return
	}

	configs := watcher.ReadClaudeConfig(workDir)

	resp, _ := protocol.NewMessage(protocol.TypeClaudeConfig, protocol.ClaudeConfigPayload{
		SessionID: payload.SessionID,
		Files:     configs,
	})
	data, _ := json.Marshal(resp)
	select {
	case c.send <- data:
	default:
	}
}

// broadcastSessionUpdate sends a session update to all connected clients.
func (s *Server) broadcastSessionUpdate(sess *session.Session) {
	msg, err := protocol.NewMessage(protocol.TypeSessionUpdate, protocol.SessionUpdatePayload{
		ID:        sess.ID,
		State:     string(sess.State),
		WorkDir:   sess.WorkDir,
		Label:     sess.Label,
		CreatedAt: sess.CreatedAt.Format(time.RFC3339Nano),
	})
	if err != nil {
		return
	}
	s.broadcast(msg)
}

// broadcast sends a message to all connected clients.
func (s *Server) broadcast(msg *protocol.Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	for c := range s.clients {
		select {
		case c.send <- data:
		default:
			// Client buffer full, skip.
		}
	}
}

// subscribeAllClients subscribes all connected clients to a session's output.
func (s *Server) subscribeAllClients(sessionID string) {
	s.clientsMu.RLock()
	clients := make([]*client, 0, len(s.clients))
	for c := range s.clients {
		clients = append(clients, c)
	}
	s.clientsMu.RUnlock()

	for _, c := range clients {
		s.subscribeClient(c, sessionID)
	}
}

// subscribeClientToActiveSessions subscribes a single client to all non-terminated sessions.
// Called when a new WebSocket connection is established so the client receives
// output from sessions that were created before this connection.
func (s *Server) subscribeClientToActiveSessions(c *client) {
	sessions := s.sessionMgr.List()
	for _, sess := range sessions {
		if sess.State != session.StateTerminated {
			s.subscribeClient(c, sess.ID)
		}
	}
}

// subscribeClient subscribes a single client to a session's output.
func (s *Server) subscribeClient(c *client, sessionID string) {
	s.subscriptionsMu.Lock()
	if _, exists := s.subscriptions[c][sessionID]; exists {
		s.subscriptionsMu.Unlock()
		return // Already subscribed.
	}
	s.subscriptionsMu.Unlock()

	subID, ch, history, err := s.sessionMgr.Subscribe(sessionID)
	if err != nil {
		return
	}

	s.subscriptionsMu.Lock()
	if s.subscriptions[c] == nil {
		s.subscriptions[c] = make(map[string]string)
	}
	s.subscriptions[c][sessionID] = subID
	s.subscriptionsMu.Unlock()

	// Send history.
	for _, event := range history {
		s.sendOutputEvent(c, event)
	}

	// Forward new events.
	go func() {
		for event := range ch {
			s.sendOutputEvent(c, event)

			if event.Type == session.OutputExit {
				// Send termination message.
				exitCode := 0
				fmt.Sscanf(event.Data, "exit_code:%d", &exitCode)
				msg, _ := protocol.NewMessage(protocol.TypeSessionTerminated, protocol.SessionTerminatedPayload{
					SessionID: sessionID,
					ExitCode:  exitCode,
				})
				data, _ := json.Marshal(msg)
				select {
				case c.send <- data:
				default:
				}
			}
		}
	}()
}

func (s *Server) sendOutputEvent(c *client, event session.OutputEvent) {
	if event.Type == session.OutputExit {
		return // Handled separately.
	}

	stream := "stdout"
	if event.Type == session.OutputStderr {
		stream = "stderr"
	}

	msg, _ := protocol.NewMessage(protocol.TypeSessionOutput, protocol.SessionOutputPayload{
		SessionID: event.SessionID,
		Stream:    stream,
		Data:      event.Data,
	})
	data, _ := json.Marshal(msg)
	select {
	case c.send <- data:
	default:
	}
}

func (s *Server) sendError(c *client, code, message string) {
	msg, _ := protocol.NewErrorMessage(code, message)
	data, _ := json.Marshal(msg)
	select {
	case c.send <- data:
	default:
	}
}

// OnFileUpdate is the callback for the file watcher. Call from the Watcher.
func (s *Server) OnFileUpdate(sessionID string, fileCount, drinkCount int) {
	msg, _ := protocol.NewMessage(protocol.TypeFilesUpdate, protocol.FilesUpdatePayload{
		SessionID:  sessionID,
		FileCount:  fileCount,
		DrinkCount: drinkCount,
	})
	s.broadcast(msg)
}
