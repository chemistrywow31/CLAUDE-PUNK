package protocol

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNewMessage(t *testing.T) {
	payload := SessionUpdatePayload{
		ID:    "test-id",
		State: "active",
		Label: "test",
	}

	msg, err := NewMessage(TypeSessionUpdate, payload)
	if err != nil {
		t.Fatalf("NewMessage failed: %v", err)
	}

	if msg.Type != TypeSessionUpdate {
		t.Errorf("expected type %s, got %s", TypeSessionUpdate, msg.Type)
	}

	if msg.Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}

	var p SessionUpdatePayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if p.ID != "test-id" {
		t.Errorf("expected ID 'test-id', got %s", p.ID)
	}
}

func TestValidateClientMessage_ValidSessionCreate(t *testing.T) {
	msg := map[string]interface{}{
		"type":      TypeSessionCreate,
		"payload":   map[string]interface{}{"workDir": "/tmp/test", "label": "test"},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	result, err := ValidateClientMessage(data)
	if err != nil {
		t.Fatalf("expected valid message, got error: %v", err)
	}
	if result.Type != TypeSessionCreate {
		t.Errorf("expected type %s, got %s", TypeSessionCreate, result.Type)
	}
}

func TestValidateClientMessage_ValidSessionPrompt(t *testing.T) {
	msg := map[string]interface{}{
		"type":      TypeSessionPrompt,
		"payload":   map[string]interface{}{"sessionId": "abc-123", "prompt": "hello"},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	_, err := ValidateClientMessage(data)
	if err != nil {
		t.Fatalf("expected valid message, got error: %v", err)
	}
}

func TestValidateClientMessage_InvalidJSON(t *testing.T) {
	_, err := ValidateClientMessage([]byte("not json"))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestValidateClientMessage_MissingType(t *testing.T) {
	msg := map[string]interface{}{
		"payload":   map[string]interface{}{},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	_, err := ValidateClientMessage(data)
	if err == nil {
		t.Fatal("expected error for missing type")
	}
}

func TestValidateClientMessage_UnknownType(t *testing.T) {
	msg := map[string]interface{}{
		"type":      "unknown.action",
		"payload":   map[string]interface{}{},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	_, err := ValidateClientMessage(data)
	if err == nil {
		t.Fatal("expected error for unknown type")
	}
}

func TestValidateClientMessage_MissingPayload(t *testing.T) {
	data := []byte(`{"type":"session.create","timestamp":"2024-01-01T00:00:00.000Z"}`)

	_, err := ValidateClientMessage(data)
	if err == nil {
		t.Fatal("expected error for missing payload")
	}
}

func TestValidateClientMessage_MissingWorkDir(t *testing.T) {
	msg := map[string]interface{}{
		"type":      TypeSessionCreate,
		"payload":   map[string]interface{}{"label": "test"},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	_, err := ValidateClientMessage(data)
	if err == nil {
		t.Fatal("expected error for missing workDir")
	}
}

func TestValidateClientMessage_MissingSessionID(t *testing.T) {
	msg := map[string]interface{}{
		"type":      TypeSessionPrompt,
		"payload":   map[string]interface{}{"prompt": "hello"},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	_, err := ValidateClientMessage(data)
	if err == nil {
		t.Fatal("expected error for missing sessionId")
	}
}

func TestValidateClientMessage_MissingPrompt(t *testing.T) {
	msg := map[string]interface{}{
		"type":      TypeSessionPrompt,
		"payload":   map[string]interface{}{"sessionId": "abc"},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	_, err := ValidateClientMessage(data)
	if err == nil {
		t.Fatal("expected error for missing prompt")
	}
}

func TestValidateClientMessage_SessionKillValid(t *testing.T) {
	msg := map[string]interface{}{
		"type":      TypeSessionKill,
		"payload":   map[string]interface{}{"sessionId": "abc"},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	_, err := ValidateClientMessage(data)
	if err != nil {
		t.Fatalf("expected valid message, got error: %v", err)
	}
}

func TestValidateClientMessage_FilesRequestTreeValid(t *testing.T) {
	msg := map[string]interface{}{
		"type":      TypeFilesRequestTree,
		"payload":   map[string]interface{}{"sessionId": "abc"},
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(msg)

	_, err := ValidateClientMessage(data)
	if err != nil {
		t.Fatalf("expected valid message, got error: %v", err)
	}
}

func TestNewErrorMessage(t *testing.T) {
	msg, err := NewErrorMessage(ErrSessionNotFound, "session xyz not found")
	if err != nil {
		t.Fatalf("NewErrorMessage failed: %v", err)
	}
	if msg.Type != TypeError {
		t.Errorf("expected type %s, got %s", TypeError, msg.Type)
	}

	var p ErrorPayload
	json.Unmarshal(msg.Payload, &p)
	if p.Code != ErrSessionNotFound {
		t.Errorf("expected code %s, got %s", ErrSessionNotFound, p.Code)
	}
}
