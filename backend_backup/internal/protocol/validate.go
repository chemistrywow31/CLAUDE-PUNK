package protocol

import (
	"encoding/json"
	"fmt"
)

// validClientTypes is the set of allowed client→server message types.
var validClientTypes = map[string]bool{
	TypeSessionCreate:       true,
	TypeSessionPrompt:       true,
	TypeSessionKill:         true,
	TypeFilesRequestTree:    true,
	TypeClaudeRequestConfig: true,
}

// ValidateClientMessage validates a raw JSON message from a client.
// Returns the parsed Message and any validation error.
func ValidateClientMessage(raw []byte) (*Message, error) {
	var msg Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}

	if msg.Type == "" {
		return nil, fmt.Errorf("missing 'type' field")
	}

	if !validClientTypes[msg.Type] {
		return nil, fmt.Errorf("unknown message type: %s", msg.Type)
	}

	if msg.Payload == nil {
		return nil, fmt.Errorf("missing 'payload' field")
	}

	// Validate required payload fields per type.
	switch msg.Type {
	case TypeSessionCreate:
		var p SessionCreatePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload for %s: %w", msg.Type, err)
		}
		if p.WorkDir == "" {
			return nil, fmt.Errorf("missing required field 'workDir' in %s payload", msg.Type)
		}

	case TypeSessionPrompt:
		var p SessionPromptPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload for %s: %w", msg.Type, err)
		}
		if p.SessionID == "" {
			return nil, fmt.Errorf("missing required field 'sessionId' in %s payload", msg.Type)
		}
		if p.Prompt == "" {
			return nil, fmt.Errorf("missing required field 'prompt' in %s payload", msg.Type)
		}

	case TypeSessionKill:
		var p SessionKillPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload for %s: %w", msg.Type, err)
		}
		if p.SessionID == "" {
			return nil, fmt.Errorf("missing required field 'sessionId' in %s payload", msg.Type)
		}

	case TypeFilesRequestTree, TypeClaudeRequestConfig:
		var p SessionIDPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload for %s: %w", msg.Type, err)
		}
		if p.SessionID == "" {
			return nil, fmt.Errorf("missing required field 'sessionId' in %s payload", msg.Type)
		}
	}

	return &msg, nil
}

// NewErrorMessage creates an error message ready to send to the client.
func NewErrorMessage(code, message string) (*Message, error) {
	return NewMessage(TypeError, ErrorPayload{
		Code:    code,
		Message: message,
	})
}
