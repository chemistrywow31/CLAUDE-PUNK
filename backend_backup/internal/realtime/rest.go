package realtime

import (
	"encoding/json"
	"net/http"
)

type createSessionRequest struct {
	WorkDir string `json:"workDir"`
	Label   string `json:"label"`
}

type sendPromptRequest struct {
	Prompt string `json:"prompt"`
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.WorkDir == "" {
		http.Error(w, `{"error":"workDir is required"}`, http.StatusBadRequest)
		return
	}

	sess, err := s.sessionMgr.Create(req.WorkDir, req.Label)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	// Start file watching.
	if watchErr := s.fileWatch.Watch(sess.ID, sess.WorkDir); watchErr != nil {
		// Non-fatal: log but continue.
		_ = watchErr
	}

	// Broadcast to WebSocket clients.
	s.broadcastSessionUpdate(sess)
	s.subscribeAllClients(sess.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(sess)
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	sessions := s.sessionMgr.List()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.sessionMgr.Get(id)
	if err != nil {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sess)
}

func (s *Server) handleSendPrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var req sendPromptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Prompt == "" {
		http.Error(w, `{"error":"prompt is required"}`, http.StatusBadRequest)
		return
	}

	if err := s.sessionMgr.SendPrompt(id, req.Prompt); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"sent"}`))
}

func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if err := s.sessionMgr.Kill(id); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
		return
	}

	s.fileWatch.Unwatch(id)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"terminated"}`))
}
