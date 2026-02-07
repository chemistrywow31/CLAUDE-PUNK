package realtime

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"claude-punk/internal/protocol"
	"claude-punk/internal/session"
	"claude-punk/internal/watcher"

	"github.com/gorilla/websocket"
)

func newTestServer() (*Server, *session.Manager) {
	sessMgr := session.NewManager(10)
	fileWatch := watcher.New(20, nil)
	srv := New(sessMgr, fileWatch, "")
	return srv, sessMgr
}

func TestServer_Handler(t *testing.T) {
	srv, _ := newTestServer()
	handler := srv.Handler()
	if handler == nil {
		t.Fatal("expected non-nil handler")
	}
}

func TestServer_ListSessionsEmpty(t *testing.T) {
	srv, _ := newTestServer()
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/sessions", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var sessions []*session.Session
	json.NewDecoder(w.Body).Decode(&sessions)
	if len(sessions) != 0 {
		t.Errorf("expected empty list, got %d sessions", len(sessions))
	}
}

func TestServer_CreateSessionBadBody(t *testing.T) {
	srv, _ := newTestServer()
	handler := srv.Handler()

	req := httptest.NewRequest("POST", "/sessions", strings.NewReader("invalid json"))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestServer_CreateSessionMissingWorkDir(t *testing.T) {
	srv, _ := newTestServer()
	handler := srv.Handler()

	body := `{"label":"test"}`
	req := httptest.NewRequest("POST", "/sessions", strings.NewReader(body))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestServer_GetSessionNotFound(t *testing.T) {
	srv, _ := newTestServer()
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/sessions/nonexistent", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestServer_PromptBadBody(t *testing.T) {
	srv, _ := newTestServer()
	handler := srv.Handler()

	req := httptest.NewRequest("POST", "/sessions/test/prompt", strings.NewReader("bad"))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestServer_DeleteSessionNotFound(t *testing.T) {
	srv, _ := newTestServer()
	handler := srv.Handler()

	req := httptest.NewRequest("DELETE", "/sessions/nonexistent", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestServer_WebSocketConnection(t *testing.T) {
	srv, _ := newTestServer()
	httpSrv := httptest.NewServer(srv.Handler())
	defer httpSrv.Close()

	// Connect WebSocket.
	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("websocket dial failed: %v", err)
	}
	defer ws.Close()

	// Send a valid session.create message (will fail since echo doesn't have --dangerously-skip-permissions).
	msg := map[string]interface{}{
		"type": protocol.TypeSessionCreate,
		"payload": map[string]interface{}{
			"workDir": "/tmp",
			"label":   "test",
		},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)
	ws.WriteMessage(websocket.TextMessage, data)

	// Read the response (should be either session.update or error).
	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, respData, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("read message failed: %v", err)
	}

	var resp protocol.Message
	json.Unmarshal(respData, &resp)
	// It should be a session.update (echo binary found) or error.
	if resp.Type != protocol.TypeSessionUpdate && resp.Type != protocol.TypeError {
		t.Errorf("expected session.update or error, got %s", resp.Type)
	}
}

func TestServer_WebSocketInvalidMessage(t *testing.T) {
	srv, _ := newTestServer()
	httpSrv := httptest.NewServer(srv.Handler())
	defer httpSrv.Close()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("websocket dial failed: %v", err)
	}
	defer ws.Close()

	// Send invalid message.
	ws.WriteMessage(websocket.TextMessage, []byte("not json"))

	// Should get an error message back.
	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, respData, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("read message failed: %v", err)
	}

	var resp protocol.Message
	json.Unmarshal(respData, &resp)
	if resp.Type != protocol.TypeError {
		t.Errorf("expected error type, got %s", resp.Type)
	}
}

func TestServer_CORSHeaders(t *testing.T) {
	srv, _ := newTestServer()
	handler := srv.Handler()

	req := httptest.NewRequest("OPTIONS", "/sessions", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("expected CORS Allow-Origin header")
	}
}
