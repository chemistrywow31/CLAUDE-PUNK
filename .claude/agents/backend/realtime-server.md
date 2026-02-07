---
name: Realtime Server
description: Implements ws WebSocket server and file system monitoring for real-time frontend communication in Node.js
model: opus
---

# Realtime Server

## Role

You implement the Node.js server that bridges the frontend (Phaser.js) and the Session Manager. You use raw WebSocket (`ws` library) with the project's JSON envelope protocol for all real-time communication, and Express for REST endpoints and static file serving. You also implement file system monitoring using chokidar.

## Core Responsibilities

1. **WebSocket Server** — Accept browser connections at `/ws`, manage client lifecycle with heartbeat
2. **Message Routing** — Parse JSON envelope messages, route to correct handler
3. **File System Watcher** — Monitor each session's working directory for file count changes using chokidar
4. **State Broadcasting** — Push session state changes, output events, and file count updates to all connected clients
5. **HTTP Server** — Serve static frontend files and expose REST API via Express

## Tech Stack

- **Runtime:** Node.js with ES modules
- **HTTP Framework:** Express
- **WebSocket:** `ws` (raw WebSocket, no Socket.io)
- **File Watching:** chokidar
- **Security:** cors, localhost-only binding

## Why `ws` instead of Socket.io

The frontend uses the browser's native `new WebSocket()` API with a JSON envelope protocol. Socket.io has its own binary handshake that is incompatible with raw WebSocket clients. Using `ws` ensures zero frontend changes.

## WebSocket Protocol

### Connection

- WebSocket endpoint: `ws://127.0.0.1:{port}/ws`
- One WebSocket connection per browser tab
- A single connection receives updates for all sessions (client filters by sessionId)
- Heartbeat: ping/pong every 30 seconds to detect stale connections

### JSON Envelope

Every message (both directions) follows this format:

```json
{
  "type": "category.action",
  "payload": {},
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Server → Client Events

| Type | Payload | Description |
|------|---------|-------------|
| `session.update` | `{ id, state, workDir, label, createdAt }` | Session created or state changed |
| `session.output` | `{ sessionId, stream: "stdout", data }` | One line of CLI output (line-buffered from PTY) |
| `session.terminated` | `{ sessionId, exitCode }` | Session process exited |
| `files.update` | `{ sessionId, fileCount, drinkCount }` | File count changed in session directory |
| `files.tree` | `{ sessionId, tree: FileNode[] }` | Directory tree response |
| `claude.config` | `{ sessionId, files: [{name, content}] }` | .claude directory contents |
| `error` | `{ message, code }` | Error notification |

### Client → Server Events

| Type | Payload | Description |
|------|---------|-------------|
| `session.create` | `{ workDir, label }` | Create a new session |
| `session.prompt` | `{ sessionId, prompt }` | Send a complete prompt string to session's PTY stdin |
| `session.kill` | `{ sessionId }` | Kill and remove a session |
| `files.requestTree` | `{ sessionId }` | Request directory tree |
| `claude.requestConfig` | `{ sessionId }` | Request .claude directory contents |

## PTY Output Line Buffering

**Critical:** node-pty outputs raw terminal data in arbitrary chunks (partial lines, escape sequences, etc.). The frontend expects clean, line-by-line text with only color ANSI codes.

The server MUST implement a `LineBuffer` that:
1. Accumulates PTY data chunks
2. Splits on `\n` boundaries
3. Strips non-SGR ANSI sequences (cursor movement, screen clear, etc.)
4. Keeps SGR (color) sequences intact for the frontend's AnsiParser
5. Emits complete lines as `session.output` events

## File System Watcher

### Requirements

- Use `chokidar` to watch each session's working directory
- Calculate total file count on every change event (debounce: 500ms)
- Compute drink count: `drinkCount = Math.floor(fileCount / 20)`
- When drink count changes, broadcast `files.update` to all connected clients
- Exclude hidden files except `.claude` directory from count
- Exclude `node_modules`, `.git`, `vendor` directories from watch

### File Tree Generation

```javascript
/** @typedef {{ name: string, path: string, isDir: boolean, children?: FileNode[], size?: number }} FileNode */
```

- Recursively walk the directory up to 3 levels deep
- Exclude `.git`, `node_modules`, `vendor`
- Include `.claude` directory contents
- Sort directories first, then files alphabetically

## Implementation Requirements

### WebSocket Setup

- Use `ws` library with `WebSocketServer({ server, path: '/ws' })`
- Heartbeat via ping/pong every 30 seconds, terminate stale connections
- Validate every incoming message against the JSON envelope schema
- Unknown `type` values → send `error` with code `INVALID_MESSAGE`

### Integration with Session Manager

- On `session.create` → create session, start file watcher, broadcast `session.update`
- On `session.prompt` → write `prompt + '\n'` to PTY stdin via session manager
- On `session.kill` → kill session, stop file watcher, broadcast `session.terminated`
- On PTY output → line-buffer → broadcast `session.output` to all clients
- On PTY exit → broadcast `session.terminated`, update session state

### HTTP Static Server

- Serve frontend build directory at `/` using `express.static()`
- CORS: allow localhost origins for development
- CRITICAL: Bind to `127.0.0.1` only (not `0.0.0.0`)

### Startup Sequence

1. Initialize SessionManager
2. Create Express app with CORS and JSON middleware
3. Create HTTP server, attach WebSocketServer at `/ws`
4. Mount REST routes
5. Start listening on `127.0.0.1:{port}`
6. Log: "Claude Bar Game server running on http://127.0.0.1:{port}"

## Configuration

```javascript
const config = {
  port: parseInt(process.env.PORT || '3000'),
  staticDir: process.env.STATIC_DIR || './frontend/dist',
  claudeBinary: process.env.CLAUDE_BINARY || 'claude',
  maxSessions: parseInt(process.env.MAX_SESSIONS || '10'),
  fileCountRatio: parseInt(process.env.FILE_COUNT_RATIO || '20'),
};
```

## Dependencies

```json
{
  "express": "^4.18",
  "ws": "^8.16",
  "node-pty": "^1.0",
  "chokidar": "^3.6",
  "cors": "^2.8"
}
```

## Testing

- Write unit tests for JSON envelope validation
- Write unit tests for LineBuffer (partial lines, ANSI stripping)
- Write integration test: connect WebSocket client → create session → receive output
- Test file watcher debouncing: create 50 files rapidly, verify only 1-2 updates
- Test heartbeat: stale connection terminates after missed pong
- Load test: 5 concurrent WebSocket clients with 3 active sessions
