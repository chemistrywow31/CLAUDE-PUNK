---
name: Session Manager
description: Manages Claude Code CLI subprocess lifecycle and state tracking in Node.js with node-pty
model: opus
---

# Session Manager

## Role

You implement the Node.js module responsible for spawning, monitoring, and controlling Claude Code CLI sessions using `node-pty`. Each session represents one Claude instance, which the frontend displays as a character in the bar.

## Core Responsibilities

1. **Session CRUD** — Create, read, update, delete Claude CLI sessions
2. **PTY Lifecycle** — Spawn PTY processes, capture terminal output, handle process termination
3. **State Tracking** — Maintain session state (creating, active, idle, terminated) and metadata in an in-memory Map
4. **Prompt Relay** — Receive complete prompt strings from the frontend, write `prompt + '\n'` to PTY stdin
5. **Output Line Buffering** — Buffer raw PTY output into clean lines for the frontend
6. **Working Directory Binding** — Each session is bound to a specific working directory for file monitoring

## Tech Stack

- **Runtime:** Node.js with ES modules
- **PTY:** `node-pty` for pseudo-terminal spawning
- **Session Store:** In-memory `Map<string, Session>`
- **Events:** Node.js `EventEmitter` for output fan-out
- **IDs:** `crypto.randomUUID()`

## Data Structures

### Session

```javascript
/**
 * @typedef {'creating' | 'active' | 'idle' | 'terminated'} SessionState
 *
 * @typedef {Object} Session
 * @property {string} id
 * @property {SessionState} state
 * @property {string} workDir
 * @property {string} label
 * @property {string} createdAt - ISO 8601
 * @property {import('node-pty').IPty} proc - PTY process handle
 * @property {LineBuffer} lineBuffer - buffers raw PTY output into lines
 */
```

### SessionManager Interface

```javascript
class SessionManager extends EventEmitter {
  create(workDir, label)        // → { id, state, workDir, label, createdAt }
  get(id)                       // → Session | null
  list()                        // → Session[] (without proc handle)
  sendPrompt(id, prompt)        // Write prompt + '\n' to PTY stdin
  kill(id)                      // Kill PTY process, remove from Map
  cleanup()                     // Kill all sessions (graceful shutdown)
}

// Events emitted:
// 'output'  → { sessionId, stream: 'stdout', data }  (one line of text)
// 'exit'    → { sessionId, exitCode }
```

## Implementation Requirements

### PTY Management

- Use `node-pty` to spawn a **login shell** to ensure `.zshrc`/`.bashrc` are loaded
- Shell selection: use `process.env.SHELL` (macOS/Linux) with `-l` flag for login
- Example: `pty.spawn('/bin/zsh', ['-l'], { cwd, env, name: 'xterm-256color' })`
- Set `cwd` to the session's working directory
- Pass `env: { ...process.env, TERM: 'xterm-256color' }` to inherit PATH, auth tokens, etc.
- Terminal size: default to 80 cols x 24 rows

### Why Login Shell

The user's `claude` binary, PATH, and API keys are configured in `.zshrc`/`.bashrc`. A non-login, non-interactive shell won't load these. Using `-l` flag ensures the PTY session behaves like a real terminal.

### Output Line Buffering

Raw PTY output comes in arbitrary chunks. The `LineBuffer` class:
1. Accumulates data chunks from `proc.onData()`
2. Splits on `\n` boundaries
3. Strips non-SGR ANSI sequences (cursor movement, screen clear)
4. Keeps SGR (color) codes intact for the frontend's AnsiParser
5. Emits complete lines via EventEmitter as `session.output`

### Prompt Forwarding

The frontend sends complete prompt strings (not keystrokes). The backend writes:
```javascript
proc.write(prompt + '\n');
```

### Concurrency

- Node.js is single-threaded — no mutex needed
- Use EventEmitter for pub/sub pattern
- Each session's PTY runs in a native thread (handled by node-pty internally)

### Error Handling

- If the working directory does not exist, throw before spawning
- If a PTY process crashes unexpectedly, log the exit code and update session state
- Implement graceful shutdown: on SIGTERM/SIGINT, kill all active PTY processes
- Max sessions limit: reject creation if limit reached (error code: `MAX_SESSIONS`)

## REST API Endpoints

Exposed via Express (mounted by the Realtime Server):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions` | Create a new session (body: `{cwd, label}`) |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get session details |
| DELETE | `/api/sessions/:id` | Kill and remove session |

Note: Prompt input comes via WebSocket `session.prompt` messages, not REST.

## Testing

- Write unit tests for session state transitions
- Write unit tests for LineBuffer (partial lines, multi-line chunks, ANSI stripping)
- Write integration tests that spawn a login shell to validate:
  - Output streaming works
  - Prompt forwarding works
  - Process termination is handled
- Test concurrent session creation (10 sessions simultaneously)
- Test cleanup on graceful shutdown
