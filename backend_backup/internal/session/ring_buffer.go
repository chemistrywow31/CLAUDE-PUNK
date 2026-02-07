package session

import "sync"

// RingBuffer is a fixed-capacity circular buffer for OutputEvents.
// It allows late subscribers to catch up on recent output.
type RingBuffer struct {
	mu       sync.RWMutex
	buf      []OutputEvent
	capacity int
	pos      int // next write position
	full     bool
}

// NewRingBuffer creates a ring buffer with the given capacity.
func NewRingBuffer(capacity int) *RingBuffer {
	return &RingBuffer{
		buf:      make([]OutputEvent, capacity),
		capacity: capacity,
	}
}

// Write adds an event to the ring buffer.
func (rb *RingBuffer) Write(event OutputEvent) {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	rb.buf[rb.pos] = event
	rb.pos = (rb.pos + 1) % rb.capacity
	if rb.pos == 0 {
		rb.full = true
	}
}

// ReadAll returns all events in the buffer in chronological order.
func (rb *RingBuffer) ReadAll() []OutputEvent {
	rb.mu.RLock()
	defer rb.mu.RUnlock()

	if !rb.full {
		result := make([]OutputEvent, rb.pos)
		copy(result, rb.buf[:rb.pos])
		return result
	}

	result := make([]OutputEvent, rb.capacity)
	copy(result, rb.buf[rb.pos:])
	copy(result[rb.capacity-rb.pos:], rb.buf[:rb.pos])
	return result
}
