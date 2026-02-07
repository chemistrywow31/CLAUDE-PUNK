---
name: Message Protocol
description: Socket.io event and REST API specification between Node.js backend and Phaser.js frontend
---

# Message Protocol

## Applicability

- Applies to: `session-manager`, `realtime-server`, `game-renderer`, `ui-developer`

## Rule Content

### Transport Layer

- **REST API** (Express): Session CRUD operations (`POST /api/sessions`, `GET /api/sessions`, etc.)
- **Socket.io** (default namespace `/`): Game state events (session updates, file changes, errors)
- **Socket.io** (`/terminals` namespace): Real-time terminal I/O (raw keystrokes ↔ PTY output)

### REST API Endpoints

| Method | Path | Body / Params | Response |
|--------|------|--------------|----------|
| POST | `/api/sessions` | `{ cwd, label, shell }` | `{ sessionId, id, state, workDir, label, createdAt }` |
| GET | `/api/sessions` | — | `Session[]` |
| GET | `/api/sessions/:id` | — | `Session` or 404 |
| DELETE | `/api/sessions/:id` | — | `{ ok: true }` or 404 |

### Socket.io Events — Default Namespace (`/`)

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `session.update` | `{ id, state, workDir, label, createdAt }` | Session created or state changed |
| `session.terminated` | `{ sessionId, exitCode }` | Session process exited |
| `files.update` | `{ sessionId, fileCount, drinkCount }` | File count changed in session directory |
| `files.tree` | `{ sessionId, tree: FileNode[] }` | Directory tree response |
| `claude.config` | `{ sessionId, files: {name, content}[] }` | .claude directory contents |
| `error` | `{ message, code }` | Error notification |

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `files.requestTree` | `{ sessionId }` | Request directory tree |
| `claude.requestConfig` | `{ sessionId }` | Request .claude directory contents |

### Socket.io Events — Terminal Namespace (`/terminals`)

Clients connect with query: `{ sessionId }` to bind to a specific PTY session.

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `input` | `string` (raw keystrokes) | Client sends keystrokes → Server writes to PTY |
| `resize` | `{ cols, rows }` | Client sends terminal dimensions → Server resizes PTY |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `output` | `string` (raw terminal data) | PTY output chunk → streamed to client |
| `exit` | `{ exitCode }` | PTY process exited |

### FileNode Structure

```json
{
    "name": "string",
    "path": "string (relative to session workDir)",
    "isDir": "boolean",
    "children": "FileNode[] (only if isDir)",
    "size": "number (bytes, only if not isDir)"
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| `SESSION_NOT_FOUND` | Requested session ID does not exist |
| `SESSION_TERMINATED` | Attempted action on a terminated session |
| `INVALID_MESSAGE` | Message failed schema validation |
| `MAX_SESSIONS` | Maximum session limit reached |
| `SPAWN_FAILED` | Failed to start Claude CLI process |

### Validation Rules

- Every incoming Socket.io event must be validated before processing
- Unknown event names on the default namespace must be rejected with an `error` event
- Missing required payload fields must be rejected with an `error` event
- `sessionId` fields must reference an existing session or return `SESSION_NOT_FOUND`

## Violation Determination

- Using a Socket.io event name not listed in this protocol → Violation (add new events to this document first)
- Emitting an event with null/undefined payload → Violation
- Backend processing an invalid event without returning an error → Violation

## Exceptions

- During Socket.io handshake, no custom events are exchanged — this rule applies only after the connection is established
