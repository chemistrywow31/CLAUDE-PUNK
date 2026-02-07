package session

import (
	"fmt"
	"testing"
	"time"
)

func makeEvent(id int) OutputEvent {
	return OutputEvent{
		SessionID: "test",
		Type:      OutputStdout,
		Data:      fmt.Sprintf("line-%d", id),
		Timestamp: time.Now().UTC(),
	}
}

func TestRingBuffer_EmptyRead(t *testing.T) {
	rb := NewRingBuffer(10)
	events := rb.ReadAll()
	if len(events) != 0 {
		t.Errorf("expected empty buffer, got %d events", len(events))
	}
}

func TestRingBuffer_PartialFill(t *testing.T) {
	rb := NewRingBuffer(10)
	for i := 0; i < 5; i++ {
		rb.Write(makeEvent(i))
	}

	events := rb.ReadAll()
	if len(events) != 5 {
		t.Fatalf("expected 5 events, got %d", len(events))
	}

	for i, e := range events {
		expected := fmt.Sprintf("line-%d", i)
		if e.Data != expected {
			t.Errorf("event %d: expected %s, got %s", i, expected, e.Data)
		}
	}
}

func TestRingBuffer_Overflow(t *testing.T) {
	rb := NewRingBuffer(5)
	for i := 0; i < 8; i++ {
		rb.Write(makeEvent(i))
	}

	events := rb.ReadAll()
	if len(events) != 5 {
		t.Fatalf("expected 5 events, got %d", len(events))
	}

	// Should have events 3,4,5,6,7 (oldest dropped).
	for i, e := range events {
		expected := fmt.Sprintf("line-%d", i+3)
		if e.Data != expected {
			t.Errorf("event %d: expected %s, got %s", i, expected, e.Data)
		}
	}
}

func TestRingBuffer_ExactCapacity(t *testing.T) {
	rb := NewRingBuffer(3)
	for i := 0; i < 3; i++ {
		rb.Write(makeEvent(i))
	}

	events := rb.ReadAll()
	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}

	for i, e := range events {
		expected := fmt.Sprintf("line-%d", i)
		if e.Data != expected {
			t.Errorf("event %d: expected %s, got %s", i, expected, e.Data)
		}
	}
}
