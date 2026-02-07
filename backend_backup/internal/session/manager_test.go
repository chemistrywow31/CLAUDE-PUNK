package session

import (
	"os"
	"testing"
)

func TestNewManager(t *testing.T) {
	mgr := NewManager(10)
	if mgr == nil {
		t.Fatal("expected non-nil manager")
	}
}

func TestManager_CreateInvalidWorkDir(t *testing.T) {
	mgr := NewManager(10)
	_, err := mgr.Create("/nonexistent/path/xyz", "test")
	if err == nil {
		t.Fatal("expected error for nonexistent work dir")
	}
}

func TestManager_CreateWorkDirIsFile(t *testing.T) {
	// Create a temp file (not a directory).
	f, err := os.CreateTemp("", "test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	f.Close()

	mgr := NewManager(10)
	_, err = mgr.Create(f.Name(), "test")
	if err == nil {
		t.Fatal("expected error for file path")
	}
}

func TestManager_MaxSessionsLimit(t *testing.T) {
	mgr := NewManager(0)
	_, err := mgr.Create(os.TempDir(), "test")
	if err == nil {
		t.Fatal("expected error for max sessions limit")
	}
}

func TestManager_GetNotFound(t *testing.T) {
	mgr := NewManager(10)
	_, err := mgr.Get("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}

func TestManager_ListEmpty(t *testing.T) {
	mgr := NewManager(10)
	sessions := mgr.List()
	if len(sessions) != 0 {
		t.Errorf("expected empty list, got %d sessions", len(sessions))
	}
}

func TestManager_SendPromptNotFound(t *testing.T) {
	mgr := NewManager(10)
	err := mgr.SendPrompt("nonexistent", "hello")
	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}

func TestManager_KillNotFound(t *testing.T) {
	mgr := NewManager(10)
	err := mgr.Kill("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}

func TestManager_SubscribeNotFound(t *testing.T) {
	mgr := NewManager(10)
	_, _, _, err := mgr.Subscribe("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}

func TestManager_UnsubscribeNotFound(t *testing.T) {
	mgr := NewManager(10)
	// Should not panic.
	mgr.Unsubscribe("nonexistent", "sub-id")
}

func TestManager_GetWorkDirNotFound(t *testing.T) {
	mgr := NewManager(10)
	_, err := mgr.GetWorkDir("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}

func TestManager_CreateWithEcho(t *testing.T) {
	mgr := NewManager(10)
	sess, err := mgr.Create(os.TempDir(), "echo-test")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if sess.ID == "" {
		t.Error("expected non-empty session ID")
	}
	if sess.State != StateActive {
		t.Errorf("expected state active, got %s", sess.State)
	}
	if sess.Label != "echo-test" {
		t.Errorf("expected label 'echo-test', got %s", sess.Label)
	}

	// Verify it's listed.
	sessions := mgr.List()
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}

	// Verify we can get it.
	got, err := mgr.Get(sess.ID)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if got.ID != sess.ID {
		t.Errorf("expected ID %s, got %s", sess.ID, got.ID)
	}

	// Clean up.
	mgr.Shutdown()
}
