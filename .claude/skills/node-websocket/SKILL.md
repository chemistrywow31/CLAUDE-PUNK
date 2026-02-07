---
name: Node WebSocket Server
description: Node.js patterns for ws WebSocket server with Express, JSON envelope protocol, and chokidar file watching
---

# Node WebSocket Server

## Purpose

Provide reusable Node.js patterns for serving raw WebSocket connections to browser clients using the `ws` library, following the project's JSON envelope protocol, and monitoring file system changes with chokidar.

## Express + ws Setup

```javascript
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

const wss = new WebSocketServer({ server, path: '/ws' });

server.listen(3000, '127.0.0.1', () => {
  console.log('Claude Bar Game server running on http://127.0.0.1:3000');
});
```

## JSON Envelope Protocol

Every message follows the project's envelope format:

```javascript
// Send a message to a client
function sendMessage(ws, type, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      type,
      payload,
      timestamp: new Date().toISOString(),
    }));
  }
}

// Broadcast to all connected clients
function broadcast(wss, type, payload) {
  const msg = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  }
}
```

## WebSocket Connection Handler

```javascript
wss.on('connection', (ws) => {
  // Heartbeat to detect stale connections
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (!msg.type || msg.payload === undefined) {
        sendMessage(ws, 'error', { message: 'Invalid message format', code: 'INVALID_MESSAGE' });
        return;
      }
      handleClientMessage(ws, msg);
    } catch (e) {
      sendMessage(ws, 'error', { message: 'Failed to parse message', code: 'INVALID_MESSAGE' });
    }
  });

  ws.on('close', () => {
    // Cleanup subscriptions for this client
  });
});

// Heartbeat interval
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
```

## Client Message Router

```javascript
function handleClientMessage(ws, msg) {
  switch (msg.type) {
    case 'session.create':
      handleSessionCreate(ws, msg.payload);
      break;
    case 'session.prompt':
      handleSessionPrompt(ws, msg.payload);
      break;
    case 'session.kill':
      handleSessionKill(ws, msg.payload);
      break;
    case 'files.requestTree':
      handleFilesRequestTree(ws, msg.payload);
      break;
    case 'claude.requestConfig':
      handleClaudeRequestConfig(ws, msg.payload);
      break;
    default:
      sendMessage(ws, 'error', { message: `Unknown type: ${msg.type}`, code: 'INVALID_MESSAGE' });
  }
}
```

## File System Watcher with Debounce (chokidar)

```javascript
import chokidar from 'chokidar';

function watchDirectory(dir, ratio, onChange) {
  const watcher = chokidar.watch(dir, {
    ignored: /(^|[\/\\])(\.|node_modules|\.git|vendor)/,
    persistent: true,
    ignoreInitial: false,
    depth: 10,
  });

  let debounceTimer = null;

  const countAndNotify = () => {
    let fileCount = 0;
    const watched = watcher.getWatched();
    for (const dirPath of Object.keys(watched)) {
      fileCount += watched[dirPath].filter(f => !f.startsWith('.')).length;
    }
    onChange(fileCount, Math.floor(fileCount / ratio));
  };

  watcher.on('all', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(countAndNotify, 500);
  });

  return watcher;
}
```

## Broadcast File Updates

```javascript
function setupFileWatcher(wss, sessionId, workDir, ratio) {
  return watchDirectory(workDir, ratio, (fileCount, drinkCount) => {
    broadcast(wss, 'files.update', { sessionId, fileCount, drinkCount });
  });
}
```

## PTY Output Line Buffering

node-pty outputs raw terminal chunks. Buffer them into lines for the frontend:

```javascript
class LineBuffer {
  #partial = '';

  /**
   * Feed raw PTY data, get back complete lines.
   * Strips non-SGR ANSI sequences (cursor movement, screen clear, etc.)
   */
  feed(data) {
    const lines = [];
    const text = this.#partial + data;
    const parts = text.split(/\r?\n/);

    // Last part may be incomplete
    this.#partial = parts.pop() || '';

    for (const line of parts) {
      const cleaned = this.#stripNonColorAnsi(line);
      if (cleaned.length > 0) {
        lines.push(cleaned);
      }
    }
    return lines;
  }

  /** Flush any remaining partial line */
  flush() {
    if (this.#partial) {
      const line = this.#stripNonColorAnsi(this.#partial);
      this.#partial = '';
      return line || null;
    }
    return null;
  }

  #stripNonColorAnsi(text) {
    // Keep SGR (color) codes: \x1b[...m
    // Strip everything else: cursor move, erase, scroll, etc.
    return text.replace(/\x1b\[[0-9;]*[ABCDEFGHJKSTfn]/g, '')
               .replace(/\x1b\[\?[0-9;]*[hl]/g, '')
               .replace(/\x1b\[[0-9;]*[X@PLM]/g, '')
               .replace(/\r/g, '');
  }
}
```
