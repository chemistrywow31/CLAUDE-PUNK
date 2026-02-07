---
name: Node PTY Session
description: Node.js patterns for spawning and managing Claude Code CLI sessions with node-pty and output streaming
---

# Node PTY Session

## Purpose

Provide reusable Node.js patterns for spawning Claude Code CLI processes using `node-pty`, capturing terminal output, and forwarding user input with full PTY support.

## Spawning a PTY Process

```javascript
import * as pty from 'node-pty';
import os from 'node:os';

function spawnClaude(workDir, shell) {
  const defaultShell = shell || (os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash');

  const proc = pty.spawn(defaultShell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: workDir,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  return proc;
}
```

## Session Manager with Map Store

```javascript
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

class SessionManager extends EventEmitter {
  #sessions = new Map();

  create(workDir, label, shell) {
    const id = randomUUID();
    const proc = spawnClaude(workDir, shell);

    const session = { id, proc, workDir, label, state: 'active', createdAt: new Date().toISOString() };
    this.#sessions.set(id, session);

    proc.onData((data) => {
      this.emit('output', { sessionId: id, stream: 'stdout', data, timestamp: new Date().toISOString() });
    });

    proc.onExit(({ exitCode }) => {
      session.state = 'terminated';
      this.emit('exit', { sessionId: id, exitCode, timestamp: new Date().toISOString() });
    });

    return { id, state: session.state, workDir, label, createdAt: session.createdAt };
  }

  write(id, data) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    if (session.state === 'terminated') throw new Error('SESSION_TERMINATED');
    session.proc.write(data);
  }

  resize(id, cols, rows) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    session.proc.resize(cols, rows);
  }

  kill(id) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    session.proc.kill();
    this.#sessions.delete(id);
  }

  get(id) {
    return this.#sessions.get(id) || null;
  }

  list() {
    return [...this.#sessions.values()].map(({ id, state, workDir, label, createdAt }) =>
      ({ id, state, workDir, label, createdAt })
    );
  }

  cleanup() {
    for (const [id, session] of this.#sessions) {
      session.proc.kill();
      this.#sessions.delete(id);
    }
  }
}
```

## Ring Buffer for Late Subscribers

```javascript
class RingBuffer {
  #buf;
  #head = 0;
  #size = 0;

  constructor(capacity = 1000) {
    this.#buf = new Array(capacity);
  }

  push(item) {
    this.#buf[this.#head] = item;
    this.#head = (this.#head + 1) % this.#buf.length;
    if (this.#size < this.#buf.length) this.#size++;
  }

  toArray() {
    if (this.#size < this.#buf.length) return this.#buf.slice(0, this.#size);
    return [...this.#buf.slice(this.#head), ...this.#buf.slice(0, this.#head)];
  }
}
```

## Graceful Shutdown

```javascript
function setupGracefulShutdown(manager) {
  const shutdown = () => {
    console.log('Shutting down — killing all sessions...');
    manager.cleanup();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
```
