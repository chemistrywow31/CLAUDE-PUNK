package session

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	defaultScannerBufSize   = 1024 * 1024 // 1 MB
	defaultRingBufCapacity  = 1000
	defaultSubscriberBufCap = 100
	defaultGracefulTimeout  = 5 * time.Second
)

const claudeCommand = "claude"

// Manager manages the lifecycle of Claude CLI subprocess sessions.
type Manager struct {
	mu          sync.RWMutex
	sessions    map[string]*managedSession
	maxSessions int
}

type managedSession struct {
	Session     *Session
	cmd         *exec.Cmd
	cancel      context.CancelFunc
	stdin       *stdinWriter
	ringBuf     *RingBuffer
	subscribers map[string]chan OutputEvent
	subMu       sync.RWMutex
}

// stdinWriter wraps a pipe writer with mutex protection.
type stdinWriter struct {
	mu     sync.Mutex
	writer *os.File
	closed bool
}

func (sw *stdinWriter) Write(data []byte) error {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	if sw.closed {
		return fmt.Errorf("stdin pipe closed")
	}
	_, err := sw.writer.Write(data)
	return err
}

func (sw *stdinWriter) Close() {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	if !sw.closed {
		sw.writer.Close()
		sw.closed = true
	}
}

// NewManager creates a new session manager.
func NewManager(maxSessions int) *Manager {
	return &Manager{
		sessions:    make(map[string]*managedSession),
		maxSessions: maxSessions,
	}
}

// Create spawns a new Claude CLI subprocess in the given working directory.
func (m *Manager) Create(workDir, label string) (*Session, error) {
	// Validate working directory.
	info, err := os.Stat(workDir)
	if err != nil {
		return nil, fmt.Errorf("working directory does not exist: %s", workDir)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("path is not a directory: %s", workDir)
	}

	// Check max sessions.
	m.mu.Lock()
	activeCount := 0
	for _, ms := range m.sessions {
		if ms.Session.State != StateTerminated {
			activeCount++
		}
	}
	if activeCount >= m.maxSessions {
		m.mu.Unlock()
		return nil, fmt.Errorf("maximum session limit reached (%d)", m.maxSessions)
	}

	// Check claude binary.
	binaryPath, err := exec.LookPath(claudeCommand)
	if err != nil {
		m.mu.Unlock()
		return nil, fmt.Errorf("claude CLI not found in PATH")
	}

	id := uuid.New().String()
	sess := &Session{
		ID:        id,
		State:     StateCreating,
		WorkDir:   workDir,
		CreatedAt: time.Now().UTC(),
		Label:     label,
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, binaryPath, "--dangerously-skip-permissions")
	cmd.Dir = workDir

	// Set up pipes.
	stdinR, stdinW, err := os.Pipe()
	if err != nil {
		cancel()
		m.mu.Unlock()
		return nil, fmt.Errorf("create stdin pipe: %w", err)
	}
	cmd.Stdin = stdinR

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		stdinW.Close()
		stdinR.Close()
		m.mu.Unlock()
		return nil, fmt.Errorf("create stdout pipe: %w", err)
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		stdinW.Close()
		stdinR.Close()
		m.mu.Unlock()
		return nil, fmt.Errorf("create stderr pipe: %w", err)
	}

	ms := &managedSession{
		Session:     sess,
		cmd:         cmd,
		cancel:      cancel,
		stdin:       &stdinWriter{writer: stdinW},
		ringBuf:     NewRingBuffer(defaultRingBufCapacity),
		subscribers: make(map[string]chan OutputEvent),
	}

	m.sessions[id] = ms
	m.mu.Unlock()

	// Start the process.
	if err := cmd.Start(); err != nil {
		stdinW.Close()
		stdinR.Close()
		cancel()
		m.mu.Lock()
		delete(m.sessions, id)
		m.mu.Unlock()
		return nil, fmt.Errorf("failed to start claude CLI: %w", err)
	}

	// Close the read end of stdin pipe (the child process has it now).
	stdinR.Close()

	sess.State = StateActive

	// Start output scanners.
	go m.scanOutput(ms, stdoutPipe, OutputStdout)
	go m.scanOutput(ms, stderrPipe, OutputStderr)

	// Wait for process exit in background.
	go m.waitForExit(ms)

	return sess, nil
}

// scanOutput reads lines from a pipe and distributes them as OutputEvents.
func (m *Manager) scanOutput(ms *managedSession, pipe interface{ Read([]byte) (int, error) }, stream OutputEventType) {
	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(make([]byte, defaultScannerBufSize), defaultScannerBufSize)

	for scanner.Scan() {
		event := OutputEvent{
			SessionID: ms.Session.ID,
			Type:      stream,
			Data:      scanner.Text(),
			Timestamp: time.Now().UTC(),
		}

		ms.ringBuf.Write(event)
		m.fanOut(ms, event)
	}

	if err := scanner.Err(); err != nil {
		log.Printf("session %s: %s scanner error: %v", ms.Session.ID, stream, err)
	}
}

// fanOut sends an event to all subscribers.
func (m *Manager) fanOut(ms *managedSession, event OutputEvent) {
	ms.subMu.RLock()
	defer ms.subMu.RUnlock()

	for _, ch := range ms.subscribers {
		select {
		case ch <- event:
		default:
			// Subscriber channel full, drop the event.
		}
	}
}

// waitForExit waits for the subprocess to exit and updates the session state.
func (m *Manager) waitForExit(ms *managedSession) {
	err := ms.cmd.Wait()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}

	ms.stdin.Close()

	m.mu.Lock()
	ms.Session.State = StateTerminated
	m.mu.Unlock()

	exitEvent := OutputEvent{
		SessionID: ms.Session.ID,
		Type:      OutputExit,
		Data:      fmt.Sprintf("exit_code:%d", exitCode),
		Timestamp: time.Now().UTC(),
	}
	ms.ringBuf.Write(exitEvent)
	m.fanOut(ms, exitEvent)
}

// Get returns a session by ID.
func (m *Manager) Get(id string) (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ms, ok := m.sessions[id]
	if !ok {
		return nil, fmt.Errorf("session not found: %s", id)
	}
	return ms.Session, nil
}

// List returns all sessions.
func (m *Manager) List() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Session, 0, len(m.sessions))
	for _, ms := range m.sessions {
		result = append(result, ms.Session)
	}
	return result
}

// SendPrompt writes a prompt to a session's stdin.
func (m *Manager) SendPrompt(id, prompt string) error {
	m.mu.RLock()
	ms, ok := m.sessions[id]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("session not found: %s", id)
	}
	if ms.Session.State == StateTerminated {
		return fmt.Errorf("session terminated: %s", id)
	}

	return ms.stdin.Write([]byte(prompt + "\n"))
}

// Kill terminates a session's subprocess.
func (m *Manager) Kill(id string) error {
	m.mu.RLock()
	ms, ok := m.sessions[id]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("session not found: %s", id)
	}
	if ms.Session.State == StateTerminated {
		return nil // Already terminated.
	}

	// Cancel the context which sends SIGKILL.
	// For graceful shutdown, we send SIGTERM first.
	if ms.cmd.Process != nil {
		ms.cmd.Process.Signal(os.Interrupt)

		// Give it time to exit gracefully, then force kill.
		go func() {
			time.Sleep(defaultGracefulTimeout)
			ms.cancel()
		}()
	}

	return nil
}

// Subscribe creates a channel that receives output events for a session.
// Returns the channel and a subscription ID for unsubscribing.
func (m *Manager) Subscribe(id string) (string, <-chan OutputEvent, []OutputEvent, error) {
	m.mu.RLock()
	ms, ok := m.sessions[id]
	m.mu.RUnlock()

	if !ok {
		return "", nil, nil, fmt.Errorf("session not found: %s", id)
	}

	subID := uuid.New().String()
	ch := make(chan OutputEvent, defaultSubscriberBufCap)

	// Get buffered history before subscribing to avoid race.
	history := ms.ringBuf.ReadAll()

	ms.subMu.Lock()
	ms.subscribers[subID] = ch
	ms.subMu.Unlock()

	return subID, ch, history, nil
}

// Unsubscribe removes a subscriber from a session.
func (m *Manager) Unsubscribe(sessionID, subID string) {
	m.mu.RLock()
	ms, ok := m.sessions[sessionID]
	m.mu.RUnlock()

	if !ok {
		return
	}

	ms.subMu.Lock()
	if ch, exists := ms.subscribers[subID]; exists {
		close(ch)
		delete(ms.subscribers, subID)
	}
	ms.subMu.Unlock()
}

// Shutdown gracefully terminates all active sessions.
func (m *Manager) Shutdown() {
	m.mu.RLock()
	ids := make([]string, 0, len(m.sessions))
	for id, ms := range m.sessions {
		if ms.Session.State != StateTerminated {
			ids = append(ids, id)
		}
	}
	m.mu.RUnlock()

	for _, id := range ids {
		m.Kill(id)
	}

	// Wait for graceful timeout then force-kill any remaining.
	time.Sleep(defaultGracefulTimeout)

	m.mu.RLock()
	for _, ms := range m.sessions {
		if ms.Session.State != StateTerminated {
			ms.cancel()
		}
	}
	m.mu.RUnlock()
}

// GetWorkDir returns the working directory for a session.
func (m *Manager) GetWorkDir(id string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ms, ok := m.sessions[id]
	if !ok {
		return "", fmt.Errorf("session not found: %s", id)
	}
	return ms.Session.WorkDir, nil
}
