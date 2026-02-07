package protocol

import (
	"encoding/json"
	"fmt"
	"time"
)

// Message is the envelope for all WebSocket messages.
type Message struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	Timestamp time.Time       `json:"timestamp"`
}

// NewMessage creates a server-originated message with the current timestamp.
func NewMessage(msgType string, payload interface{}) (*Message, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}
	return &Message{
		Type:      msgType,
		Payload:   data,
		Timestamp: time.Now().UTC(),
	}, nil
}

// Server → Client message types.
const (
	TypeSessionUpdate     = "session.update"
	TypeSessionOutput     = "session.output"
	TypeSessionTerminated = "session.terminated"
	TypeFilesUpdate       = "files.update"
	TypeFilesTree         = "files.tree"
	TypeClaudeConfig      = "claude.config"
	TypeError             = "error"
)

// Client → Server message types.
const (
	TypeSessionCreate       = "session.create"
	TypeSessionPrompt       = "session.prompt"
	TypeSessionKill         = "session.kill"
	TypeFilesRequestTree    = "files.requestTree"
	TypeClaudeRequestConfig = "claude.requestConfig"
)

// Error codes.
const (
	ErrSessionNotFound  = "SESSION_NOT_FOUND"
	ErrSessionTerminated = "SESSION_TERMINATED"
	ErrInvalidMessage   = "INVALID_MESSAGE"
	ErrMaxSessions      = "MAX_SESSIONS"
	ErrSpawnFailed      = "SPAWN_FAILED"
)

// Server → Client payloads.

type SessionUpdatePayload struct {
	ID        string `json:"id"`
	State     string `json:"state"`
	WorkDir   string `json:"workDir"`
	Label     string `json:"label"`
	CreatedAt string `json:"createdAt"`
}

type SessionOutputPayload struct {
	SessionID string `json:"sessionId"`
	Stream    string `json:"stream"` // "stdout" | "stderr"
	Data      string `json:"data"`
}

type SessionTerminatedPayload struct {
	SessionID string `json:"sessionId"`
	ExitCode  int    `json:"exitCode"`
}

type FilesUpdatePayload struct {
	SessionID  string `json:"sessionId"`
	FileCount  int    `json:"fileCount"`
	DrinkCount int    `json:"drinkCount"`
}

type FilesTreePayload struct {
	SessionID string     `json:"sessionId"`
	Tree      []FileNode `json:"tree"`
}

type ClaudeConfigPayload struct {
	SessionID string       `json:"sessionId"`
	Files     []ConfigFile `json:"files"`
}

type ConfigFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type ErrorPayload struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}

// Client → Server payloads.

type SessionCreatePayload struct {
	WorkDir string `json:"workDir"`
	Label   string `json:"label"`
}

type SessionPromptPayload struct {
	SessionID string `json:"sessionId"`
	Prompt    string `json:"prompt"`
}

type SessionKillPayload struct {
	SessionID string `json:"sessionId"`
}

type SessionIDPayload struct {
	SessionID string `json:"sessionId"`
}

// FileNode represents a file or directory in the tree.
type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"isDir"`
	Children []FileNode `json:"children,omitempty"`
	Size     int64      `json:"size,omitempty"`
}
