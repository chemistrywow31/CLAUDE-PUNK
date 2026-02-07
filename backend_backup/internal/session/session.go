package session

import "time"

// State represents the lifecycle state of a session.
type State string

const (
	StateCreating   State = "creating"
	StateActive     State = "active"
	StateIdle       State = "idle"
	StateTerminated State = "terminated"
)

// Session holds metadata and state for a single Claude CLI instance.
type Session struct {
	ID        string    `json:"id"`
	State     State     `json:"state"`
	WorkDir   string    `json:"workDir"`
	CreatedAt time.Time `json:"createdAt"`
	Label     string    `json:"label"`
}

// OutputEventType distinguishes stdout, stderr, and exit events.
type OutputEventType string

const (
	OutputStdout OutputEventType = "stdout"
	OutputStderr OutputEventType = "stderr"
	OutputExit   OutputEventType = "exit"
)

// OutputEvent is a single line of output from a CLI subprocess.
type OutputEvent struct {
	SessionID string          `json:"sessionId"`
	Type      OutputEventType `json:"type"`
	Data      string          `json:"data"`
	Timestamp time.Time       `json:"timestamp"`
}
