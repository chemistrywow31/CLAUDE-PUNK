/**
 * Claude Punk — Backend Server
 *
 * Single-file Node.js backend that manages Claude CLI sessions via PTY,
 * watches file systems, and communicates with the Phaser.js frontend over
 * raw WebSocket using a JSON envelope protocol: { type, payload, timestamp }.
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import chokidar from 'chokidar';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { execSync } from 'node:child_process';
import http from 'node:http';

// ─── Section 1: Config ───────────────────────────────────────────────────────

const IS_WINDOWS = process.platform === 'win32';

/** Resolve a CLI command to its absolute path, falling back to the bare name. */
function resolveCommand(name) {
  try {
    const cmd = IS_WINDOWS ? `where ${name}` : `which ${name}`;
    const result = execSync(cmd, { encoding: 'utf8' }).trim();
    // `where` on Windows may return multiple lines; take the first
    return result.split(/\r?\n/)[0];
  } catch {
    console.warn(`[config] Could not resolve command "${name}" — using bare name as fallback`);
    return name;
  }
}

/** Detect the default shell for the current platform. */
function detectShell() {
  if (IS_WINDOWS) {
    // Prefer PowerShell if available, fall back to cmd.exe
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/zsh';
}

/** Get shell arguments for the current platform. */
function getShellArgs() {
  if (IS_WINDOWS) return [];          // cmd.exe / powershell don't use -l
  return ['-l'];                       // Unix login shell
}

const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: '127.0.0.1',
  maxSessions: 16,
  fileCountRatio: 20,
  autoRunClaude: process.env.AUTO_RUN_CLAUDE !== 'false',
  shell: detectShell(),
  shellArgs: getShellArgs(),
  lineBufferFlushMs: 100,
  heartbeatIntervalMs: 30_000,
  ringBufferCapacity: 1000,
  ptyDefaultCols: 120,
  ptyDefaultRows: 40,
  autoRunDelayMs: 300,
  agentCommands: {
    claude: `${resolveCommand('claude')} --dangerously-skip-permissions`,
    codex: `${resolveCommand('codex')} --full-auto`,
  },
  fileWatchDebounceMs: 500,
  fileTreeMaxDepth: 10,
  shutdownTimeoutMs: 5000,
  rawBufferMaxBytes: 100_000, // 100KB cap for raw terminal replay buffer
};

// Directories/files to exclude from file watching and tree building
const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'vendor', '__pycache__', '.venv', 'venv',
  '.tox', '.mypy_cache', '.pytest_cache', 'dist', 'build', '.next',
  '.nuxt', 'coverage', '.DS_Store', 'Thumbs.db',
]);

function shouldExclude(name) {
  if (EXCLUDED_DIRS.has(name)) return true;
  // Exclude hidden files/dirs except .claude
  if (name.startsWith('.') && name !== '.claude') return true;
  return false;
}

// ─── Section 2: RingBuffer ───────────────────────────────────────────────────

class RingBuffer {
  constructor(capacity = CONFIG.ringBufferCapacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;
    this.size = 0;
  }

  write(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  readAll() {
    if (this.size === 0) return [];
    const result = new Array(this.size);
    const start = (this.head - this.size + this.capacity) % this.capacity;
    for (let i = 0; i < this.size; i++) {
      result[i] = this.buffer[(start + i) % this.capacity];
    }
    return result;
  }
}

// ─── Section 2b: RawReplayBuffer ─────────────────────────────────────────────

/** Capped string buffer that keeps the most recent N bytes of raw PTY output. */
class RawReplayBuffer {
  constructor(maxBytes = CONFIG.rawBufferMaxBytes) {
    this.maxBytes = maxBytes;
    this.chunks = [];
    this.totalBytes = 0;
  }

  write(data) {
    const len = Buffer.byteLength(data, 'utf8');
    this.chunks.push(data);
    this.totalBytes += len;
    // Evict oldest chunks until under cap
    while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      this.totalBytes -= Buffer.byteLength(removed, 'utf8');
    }
  }

  /** Return all stored output as a single string. */
  read() {
    return this.chunks.join('');
  }
}

// ─── Section 3: LineBuffer ───────────────────────────────────────────────────

class LineBuffer {
  /**
   * Buffers raw PTY chunks and emits clean lines via callback.
   * @param {(stream: string, line: string) => void} onLine
   */
  constructor(onLine) {
    this.onLine = onLine;
    this.rawPartials = new Map(); // stream -> raw (unprocessed) partial string
    this.timers = new Map();     // stream -> timeout id
  }

  /**
   * Strip ANSI sequences that are not useful for display.
   * Keep SGR (color) sequences (\x1b[...m) since the frontend parses them.
   * Remove cursor movement, erase, OSC, and other control sequences.
   */
  static stripNonSGR(str) {
    // 1. Remove OSC sequences: ESC ] ... BEL  or  ESC ] ... ESC \
    str = str.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '');
    // 2. Remove non-SGR CSI sequences (keep \x1b[...m, remove \x1b[...X where X != m)
    str = str.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[A-LN-Za-ln-z]/g, '');
    // 3. Remove single-char escape sequences (ESC + single char that's not '[' or ']')
    str = str.replace(/\x1b[^[\]]/g, '');
    return str;
  }

  /**
   * Handle carriage returns: for each segment between \n, take text after the
   * last \r. This handles spinners/progress bars that overwrite the same line.
   */
  static handleCR(str) {
    const segments = str.split('\n');
    for (let i = 0; i < segments.length; i++) {
      const crIdx = segments[i].lastIndexOf('\r');
      if (crIdx !== -1) {
        segments[i] = segments[i].slice(crIdx + 1);
      }
    }
    return segments.join('\n');
  }

  feed(stream, rawChunk) {
    // Clear any pending flush timer for this stream
    const existingTimer = this.timers.get(stream);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(stream);
    }

    // Combine with any stored raw partial
    const existing = this.rawPartials.get(stream) || '';
    const combined = existing + rawChunk;

    // Split on newlines in the raw data first
    const rawLines = combined.split('\n');
    // Last element is the raw partial (may be empty if chunk ended with \n)
    const rawPartial = rawLines.pop();

    // Clean and emit each complete line
    for (const rawLine of rawLines) {
      // Strip trailing \r (part of PTY's \r\n line ending) before CR handling,
      // so it isn't mistaken for a line-overwrite indicator.
      const trimmed = rawLine.replace(/\r$/, '');
      const cleaned = LineBuffer.handleCR(LineBuffer.stripNonSGR(trimmed));
      if (cleaned.length > 0) {
        this.onLine(stream, cleaned);
      }
    }

    // Store raw partial for next chunk
    if (rawPartial && rawPartial.length > 0) {
      this.rawPartials.set(stream, rawPartial);
      // Set flush timer — emit partial after silence period
      const timer = setTimeout(() => {
        this.timers.delete(stream);
        const remaining = this.rawPartials.get(stream);
        if (remaining && remaining.length > 0) {
          this.rawPartials.set(stream, '');
          const trimmed = remaining.replace(/\r$/, '');
          const cleaned = LineBuffer.handleCR(LineBuffer.stripNonSGR(trimmed));
          if (cleaned.length > 0) {
            this.onLine(stream, cleaned);
          }
        }
      }, CONFIG.lineBufferFlushMs);
      this.timers.set(stream, timer);
    } else {
      this.rawPartials.set(stream, '');
    }
  }

  flush(stream) {
    const timer = this.timers.get(stream);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(stream);
    }
    const remaining = this.rawPartials.get(stream);
    if (remaining && remaining.length > 0) {
      this.rawPartials.set(stream, '');
      const trimmed = remaining.replace(/\r$/, '');
      const cleaned = LineBuffer.handleCR(LineBuffer.stripNonSGR(trimmed));
      if (cleaned.length > 0) {
        this.onLine(stream, cleaned);
      }
    }
  }

  destroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.rawPartials.clear();
  }
}

// ─── Section 4: SessionManager ───────────────────────────────────────────────

class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
  }

  create(workDir, label, agentType = 'claude') {
    console.log(`[session] Creating session: workDir="${workDir}", label="${label}", agentType="${agentType}"`);

    // Validate
    if (!workDir) throw new Error('workDir is required');
    if (!fs.existsSync(workDir)) {
      console.error(`[session] workDir does not exist: "${workDir}"`);
      throw new Error(`workDir does not exist: ${workDir}`);
    }
    if (!fs.statSync(workDir).isDirectory()) {
      console.error(`[session] workDir is not a directory: "${workDir}"`);
      throw new Error(`workDir is not a directory: ${workDir}`);
    }
    if (this.sessions.size >= CONFIG.maxSessions) {
      throw new Error(`Maximum sessions (${CONFIG.maxSessions}) reached`);
    }
    if (!CONFIG.agentCommands[agentType]) {
      console.error(`[session] Unknown agentType: "${agentType}", available: ${Object.keys(CONFIG.agentCommands).join(', ')}`);
      throw new Error(`Unknown agentType: ${agentType}`);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Spawn PTY
    console.log(`[session] Spawning PTY: shell="${CONFIG.shell}", args=${JSON.stringify(CONFIG.shellArgs)}, cwd="${workDir}"`);
    let proc;
    try {
      proc = pty.spawn(CONFIG.shell, CONFIG.shellArgs, {
        name: 'xterm-256color',
        cwd: workDir,
        cols: CONFIG.ptyDefaultCols,
        rows: CONFIG.ptyDefaultRows,
        env: { ...process.env, TERM: 'xterm-256color' },
      });
      console.log(`[session] PTY spawned successfully (pid=${proc.pid})`);
    } catch (spawnErr) {
      console.error(`[session] PTY spawn FAILED: ${spawnErr.message}`);
      console.error(`[session]   shell: ${CONFIG.shell}`);
      console.error(`[session]   args: ${JSON.stringify(CONFIG.shellArgs)}`);
      console.error(`[session]   cwd: ${workDir}`);
      console.error(`[session]   platform: ${process.platform}`);
      throw new Error(`Failed to spawn terminal: ${spawnErr.message}`);
    }

    const ringBuffer = new RingBuffer();
    const rawReplayBuffer = new RawReplayBuffer();

    const lineBuffer = new LineBuffer((stream, line) => {
      const outputMsg = { sessionId: id, stream, data: line, timestamp: new Date().toISOString() };
      ringBuffer.write(outputMsg);
      this.emit('session-output', outputMsg);
    });

    // node-pty merges stdout+stderr into single stream
    proc.onData((data) => {
      lineBuffer.feed('stdout', data);
      rawReplayBuffer.write(data);
      // Also emit raw data for xterm.js rendering
      this.emit('terminal-output', { sessionId: id, data });
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[session] PTY exited: session=${id}, exitCode=${exitCode}`);
      lineBuffer.flush('stdout');
      lineBuffer.destroy();

      const session = this.sessions.get(id);
      if (session) {
        session.state = 'terminated';
        session.exitCode = exitCode;
        if (session._forceKillTimer) {
          clearTimeout(session._forceKillTimer);
          session._forceKillTimer = null;
        }
      }

      this.emit('session-exit', { sessionId: id, exitCode });

      // Clean up terminated session from memory after a short delay
      // (allows the exit event to propagate to WS clients first)
      setTimeout(() => {
        this.sessions.delete(id);
      }, 5000);
    });

    const session = {
      id,
      state: 'active',
      workDir,
      label: label || path.basename(workDir),
      agentType,
      createdAt,
      proc,
      ringBuffer,
      rawReplayBuffer,
      lineBuffer,
      exitCode: null,
      cols: CONFIG.ptyDefaultCols,
      rows: CONFIG.ptyDefaultRows,
    };

    this.sessions.set(id, session);

    // Auto-run agent after a short delay (lets shell init complete)
    if (CONFIG.autoRunClaude) {
      setTimeout(() => {
        if (session.state === 'active') {
          const cmd = CONFIG.agentCommands[agentType];
          console.log(`[session] Auto-running agent command: "${cmd}" (session=${id})`);
          proc.write(cmd + '\n');
        } else {
          console.warn(`[session] Skipping auto-run — session ${id} already ${session.state}`);
        }
      }, CONFIG.autoRunDelayMs);
    }

    return this.toPublic(session);
  }

  sendPrompt(id, prompt) {
    const session = this.getSession(id);
    session.proc.write(prompt + '\n');
  }

  writeRaw(id, data) {
    const session = this.getSession(id);
    session.proc.write(data);
  }

  resize(id, cols, rows) {
    const session = this.getSession(id);
    session.proc.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
  }

  kill(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.state === 'terminated') return;

    console.log(`[session] Killing session ${id} (pid=${session.proc.pid}, platform=${process.platform})`);
    session.state = 'terminated';

    // Graceful kill
    try {
      if (IS_WINDOWS) {
        // Windows: node-pty kill() doesn't accept signals — use taskkill for
        // graceful tree kill (kills child processes too)
        try {
          execSync(`taskkill /PID ${session.proc.pid} /T`, { timeout: 2000 });
        } catch {
          // taskkill may fail if process already exited; fall through to force kill
          session.proc.kill();
        }
      } else {
        session.proc.kill('SIGTERM');
      }
    } catch (err) {
      console.warn(`[session] Graceful kill failed for ${id}: ${err.message}`);
    }

    // Force kill after 3s
    session._forceKillTimer = setTimeout(() => {
      session._forceKillTimer = null;
      try {
        if (IS_WINDOWS) {
          // /F = force, /T = tree (kill child processes)
          execSync(`taskkill /PID ${session.proc.pid} /F /T`, { timeout: 2000 });
        } else {
          session.proc.kill('SIGKILL');
        }
        console.log(`[session] Force-killed session ${id}`);
      } catch (err) {
        console.warn(`[session] Force kill failed for ${id} (likely already dead): ${err.message}`);
      }
    }, 3000);
  }

  getSession(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    if (session.state === 'terminated') throw new Error('SESSION_TERMINATED');
    return session;
  }

  getHistory(id) {
    const session = this.sessions.get(id);
    if (!session) return [];
    return session.ringBuffer.readAll();
  }

  getRawReplay(id) {
    const session = this.sessions.get(id);
    if (!session) return '';
    return session.rawReplayBuffer.read();
  }

  list() {
    return Array.from(this.sessions.values())
      .filter((s) => s.state !== 'terminated')
      .map((s) => this.toPublic(s));
  }

  /** Return all sessions including terminated ones (for debugging). */
  listAll() {
    return Array.from(this.sessions.values()).map((s) => this.toPublic(s));
  }

  /** Remove terminated sessions from memory. */
  pruneTerminated() {
    for (const [id, session] of this.sessions) {
      if (session.state === 'terminated') {
        this.sessions.delete(id);
      }
    }
  }

  get(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    return this.toPublic(session);
  }

  toPublic(session) {
    return {
      id: session.id,
      state: session.state,
      workDir: session.workDir,
      label: session.label,
      agentType: session.agentType,
      createdAt: session.createdAt,
    };
  }

  killAll() {
    for (const [id, session] of this.sessions) {
      if (session.state !== 'terminated') {
        this.kill(id);
      }
    }
  }
}

// ─── Section 5: FileWatcher ──────────────────────────────────────────────────

class FileWatcher extends EventEmitter {
  constructor() {
    super();
    this.watchers = new Map(); // sessionId -> { watcher, workDir, debounceTimer }
    this.latestCounts = new Map(); // sessionId -> { fileCount, drinkCount }
  }

  watch(sessionId, workDir) {
    if (this.watchers.has(sessionId)) return;

    const watcher = chokidar.watch(workDir, {
      ignored: (filePath) => {
        const rel = path.relative(workDir, filePath);
        const parts = rel.split(path.sep);
        return parts.some((p) => shouldExclude(p));
      },
      persistent: true,
      ignoreInitial: false,
      depth: 99,
    });

    const entry = { watcher, workDir, debounceTimer: null };

    const debouncedUpdate = () => {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(async () => {
        try {
          const fileCount = await this.countFiles(workDir);
          const drinkCount = Math.floor(fileCount / CONFIG.fileCountRatio);
          this.latestCounts.set(sessionId, { fileCount, drinkCount });
          this.emit('files-update', { sessionId, fileCount, drinkCount });
        } catch (err) {
          console.error(`[FileWatcher] Error counting files for ${sessionId}:`, err.message);
        }
      }, CONFIG.fileWatchDebounceMs);
    };

    watcher.on('add', debouncedUpdate);
    watcher.on('unlink', debouncedUpdate);
    watcher.on('ready', debouncedUpdate);

    this.watchers.set(sessionId, entry);
  }

  async countFiles(dir) {
    let count = 0;
    const walk = async (d) => {
      let entries;
      try {
        entries = await fs.promises.readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (shouldExclude(entry.name)) continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          count++;
        }
      }
    };
    await walk(dir);
    return count;
  }

  unwatch(sessionId) {
    const entry = this.watchers.get(sessionId);
    if (!entry) return;
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.watcher.close();
    this.watchers.delete(sessionId);
    this.latestCounts.delete(sessionId);
  }

  unwatchAll() {
    for (const sessionId of this.watchers.keys()) {
      this.unwatch(sessionId);
    }
  }
}

// ─── Section 6: buildFileTree ────────────────────────────────────────────────

async function buildFileTree(dir, currentDepth = 0, baseDir = null) {
  if (baseDir === null) baseDir = dir;
  if (currentDepth >= CONFIG.fileTreeMaxDepth) return [];

  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  // Filter out excluded entries
  entries = entries.filter((e) => !shouldExclude(e.name));

  // Sort: dirs first, then files, alphabetical within each group
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const nodes = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    // Resolve symlinks via stat (follows links) to get real type
    let realStat;
    try {
      realStat = await fs.promises.stat(fullPath);
    } catch {
      continue; // skip broken symlinks or inaccessible entries
    }

    if (realStat.isDirectory()) {
      const children = await buildFileTree(fullPath, currentDepth + 1, baseDir);
      nodes.push({
        name: entry.name,
        path: relPath,
        isDir: true,
        children,
      });
    } else if (realStat.isFile()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        isDir: false,
        size: realStat.size,
      });
    }
  }

  return nodes;
}

// ─── Section 7: readClaudeConfig ─────────────────────────────────────────────

async function readClaudeConfig(workDir) {
  const claudeDir = path.join(workDir, '.claude');
  const files = [];

  async function walk(dir, prefix = '') {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = await fs.promises.readFile(full, 'utf-8');
          files.push({ name: rel, content });
        } catch {
          // skip unreadable
        }
      }
    }
  }

  await walk(claudeDir);
  return files;
}

// ─── Section 8: WebSocket Server ─────────────────────────────────────────────

function createWSS(server, sessionManager, fileWatcher) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // --- Helpers ---

  function sendToClient(ws, type, payload) {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
  }

  function broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(msg);
      }
    }
  }

  // --- Heartbeat ---

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws._alive === false) {
        ws.terminate();
        continue;
      }
      ws._alive = false;
      ws.ping();
    }
  }, CONFIG.heartbeatIntervalMs);

  wss.on('close', () => clearInterval(heartbeat));

  // --- Wire SessionManager events to WS broadcast ---

  sessionManager.on('session-output', (payload) => {
    broadcast('session.output', payload);
  });

  sessionManager.on('terminal-output', (payload) => {
    broadcast('terminal.output', payload);
  });

  sessionManager.on('session-exit', (payload) => {
    broadcast('session.terminated', payload);
  });

  fileWatcher.on('files-update', (payload) => {
    broadcast('files.update', payload);
  });

  // --- Connection handling ---

  wss.on('connection', (ws) => {
    ws._alive = true;
    ws.on('pong', () => { ws._alive = true; });

    // Replay: send all active session states (resume support)
    const activeSessions = sessionManager.list();
    for (const session of activeSessions) {
      sendToClient(ws, 'session.update', session);
    }

    // Replay: send raw terminal output for xterm.js rendering.
    // Uses a dedicated 'terminal.replay' event so the frontend can defer
    // writing until the xterm is attached to the DOM and properly sized,
    // preventing layout corruption from size mismatches.
    for (const session of activeSessions) {
      const rawData = sessionManager.getRawReplay(session.id);
      if (rawData) {
        const s = sessionManager.sessions.get(session.id);
        sendToClient(ws, 'terminal.replay', {
          sessionId: session.id,
          data: rawData,
          cols: s?.cols || CONFIG.ptyDefaultCols,
          rows: s?.rows || CONFIG.ptyDefaultRows,
        });
      }
    }

    // Replay: send current file counts (drinks)
    for (const session of activeSessions) {
      const counts = fileWatcher.latestCounts.get(session.id);
      if (counts) {
        sendToClient(ws, 'files.update', {
          sessionId: session.id,
          fileCount: counts.fileCount,
          drinkCount: counts.drinkCount,
        });
      }
    }

    // Message router
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendToClient(ws, 'error', { message: 'Invalid JSON', code: 'INVALID_MESSAGE' });
        return;
      }

      if (!msg.type || msg.payload === undefined) {
        sendToClient(ws, 'error', { message: 'Missing type or payload', code: 'INVALID_MESSAGE' });
        return;
      }

      try {
        switch (msg.type) {
          case 'session.create': {
            const { workDir, label, agentType = 'claude' } = msg.payload;
            if (!workDir) {
              sendToClient(ws, 'error', { message: 'workDir is required', code: 'INVALID_MESSAGE' });
              return;
            }
            const session = sessionManager.create(workDir, label, agentType);
            broadcast('session.update', session);
            fileWatcher.watch(session.id, workDir);
            break;
          }

          case 'session.prompt': {
            const { sessionId, prompt } = msg.payload;
            if (!sessionId || !prompt) {
              sendToClient(ws, 'error', { message: 'sessionId and prompt are required', code: 'INVALID_MESSAGE' });
              return;
            }
            sessionManager.sendPrompt(sessionId, prompt);
            break;
          }

          case 'terminal.input': {
            const { sessionId, data } = msg.payload;
            if (!sessionId || data === undefined) {
              sendToClient(ws, 'error', { message: 'sessionId and data are required', code: 'INVALID_MESSAGE' });
              return;
            }
            sessionManager.writeRaw(sessionId, data);
            break;
          }

          case 'terminal.resize': {
            const { sessionId, cols, rows } = msg.payload;
            if (!sessionId || !cols || !rows) {
              sendToClient(ws, 'error', { message: 'sessionId, cols, and rows are required', code: 'INVALID_MESSAGE' });
              return;
            }
            sessionManager.resize(sessionId, cols, rows);
            break;
          }

          case 'session.kill': {
            const { sessionId } = msg.payload;
            if (!sessionId) {
              sendToClient(ws, 'error', { message: 'sessionId is required', code: 'INVALID_MESSAGE' });
              return;
            }
            sessionManager.kill(sessionId);
            fileWatcher.unwatch(sessionId);
            break;
          }

          case 'files.requestTree': {
            const { sessionId } = msg.payload;
            if (!sessionId) {
              sendToClient(ws, 'error', { message: 'sessionId is required', code: 'INVALID_MESSAGE' });
              return;
            }
            const session = sessionManager.get(sessionId);
            if (!session) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            const tree = await buildFileTree(session.workDir);
            sendToClient(ws, 'files.tree', { sessionId, tree });
            break;
          }

          case 'fs.browse': {
            const { path: dirPath } = msg.payload;
            const targetPath = dirPath || process.env.HOME || process.env.USERPROFILE || (IS_WINDOWS ? 'C:\\' : '/');
            try {
              const resolved = path.resolve(targetPath);
              const stat = await fs.promises.stat(resolved);
              if (!stat.isDirectory()) {
                sendToClient(ws, 'error', { message: `Not a directory: ${resolved}`, code: 'INVALID_PATH' });
                return;
              }
              const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
              const filtered = entries
                .filter((e) => !shouldExclude(e.name))
                .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
                .sort((a, b) => {
                  if (a.isDir && !b.isDir) return -1;
                  if (!a.isDir && b.isDir) return 1;
                  return a.name.localeCompare(b.name);
                });
              // Root detection: Unix "/" or Windows "C:\"
              const isRoot = resolved === '/' || /^[A-Z]:\\?$/i.test(resolved);
              const parent = isRoot ? null : path.dirname(resolved);
              sendToClient(ws, 'fs.browse.result', { path: resolved, parent, entries: filtered });
            } catch (err) {
              sendToClient(ws, 'error', { message: `Cannot read directory: ${err.message}`, code: 'INVALID_PATH' });
            }
            break;
          }

          case 'file.read': {
            const { sessionId, filePath } = msg.payload;
            if (!sessionId || !filePath) {
              sendToClient(ws, 'error', { message: 'sessionId and filePath are required', code: 'INVALID_MESSAGE' });
              return;
            }
            const readSession = sessionManager.get(sessionId);
            if (!readSession) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            const absPath = path.resolve(readSession.workDir, filePath);
            if (!absPath.startsWith(readSession.workDir)) {
              sendToClient(ws, 'error', { message: 'Path traversal not allowed', code: 'INVALID_MESSAGE' });
              return;
            }
            try {
              const stat = await fs.promises.stat(absPath);
              if (stat.size > 5 * 1024 * 1024) {
                sendToClient(ws, 'error', { message: 'File too large (max 5MB)', code: 'INVALID_MESSAGE' });
                return;
              }
              const ext = path.extname(absPath).toLowerCase();
              const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']);
              const isImage = imageExts.has(ext);
              if (isImage) {
                const buf = await fs.promises.readFile(absPath);
                sendToClient(ws, 'file.content', {
                  sessionId,
                  filePath,
                  content: buf.toString('base64'),
                  encoding: 'base64',
                  fileType: 'image',
                  size: stat.size,
                });
              } else {
                const content = await fs.promises.readFile(absPath, 'utf-8');
                sendToClient(ws, 'file.content', {
                  sessionId,
                  filePath,
                  content,
                  encoding: 'utf-8',
                  fileType: 'text',
                  size: stat.size,
                });
              }
            } catch (err) {
              sendToClient(ws, 'error', { message: `Cannot read file: ${err.message}`, code: 'INVALID_MESSAGE' });
            }
            break;
          }

          case 'file.write': {
            const { sessionId, filePath, content } = msg.payload;
            if (!sessionId || !filePath || content === undefined) {
              sendToClient(ws, 'error', { message: 'sessionId, filePath, and content are required', code: 'INVALID_MESSAGE' });
              return;
            }
            const writeSession = sessionManager.get(sessionId);
            if (!writeSession) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            const writeAbsPath = path.resolve(writeSession.workDir, filePath);
            if (!writeAbsPath.startsWith(writeSession.workDir)) {
              sendToClient(ws, 'error', { message: 'Path traversal not allowed', code: 'INVALID_MESSAGE' });
              return;
            }
            try {
              await fs.promises.writeFile(writeAbsPath, content, 'utf-8');
              sendToClient(ws, 'file.saved', { sessionId, filePath });
            } catch (err) {
              sendToClient(ws, 'error', { message: `Cannot write file: ${err.message}`, code: 'INVALID_MESSAGE' });
            }
            break;
          }

          case 'file.create': {
            const { sessionId, filePath, isDir } = msg.payload;
            if (!sessionId || !filePath) {
              sendToClient(ws, 'error', { message: 'sessionId and filePath are required', code: 'INVALID_MESSAGE' });
              return;
            }
            const createSession = sessionManager.get(sessionId);
            if (!createSession) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            const createAbsPath = path.resolve(createSession.workDir, filePath);
            if (!createAbsPath.startsWith(createSession.workDir)) {
              sendToClient(ws, 'error', { message: 'Path traversal not allowed', code: 'INVALID_MESSAGE' });
              return;
            }
            try {
              if (isDir) {
                await fs.promises.mkdir(createAbsPath, { recursive: true });
              } else {
                // Ensure parent directory exists
                await fs.promises.mkdir(path.dirname(createAbsPath), { recursive: true });
                // Create empty file (fail if already exists)
                await fs.promises.writeFile(createAbsPath, '', { flag: 'wx' });
              }
              sendToClient(ws, 'file.created', { sessionId, filePath, isDir: !!isDir });
            } catch (err) {
              if (err.code === 'EEXIST') {
                sendToClient(ws, 'error', { message: 'File already exists', code: 'INVALID_MESSAGE' });
              } else {
                sendToClient(ws, 'error', { message: `Cannot create: ${err.message}`, code: 'INVALID_MESSAGE' });
              }
            }
            break;
          }

          case 'file.delete': {
            const { sessionId, filePath } = msg.payload;
            if (!sessionId || !filePath) {
              sendToClient(ws, 'error', { message: 'sessionId and filePath are required', code: 'INVALID_MESSAGE' });
              return;
            }
            const delSession = sessionManager.get(sessionId);
            if (!delSession) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            const delAbsPath = path.resolve(delSession.workDir, filePath);
            if (!delAbsPath.startsWith(delSession.workDir)) {
              sendToClient(ws, 'error', { message: 'Path traversal not allowed', code: 'INVALID_MESSAGE' });
              return;
            }
            // Prevent deleting the workDir itself
            if (delAbsPath === delSession.workDir) {
              sendToClient(ws, 'error', { message: 'Cannot delete root directory', code: 'INVALID_MESSAGE' });
              return;
            }
            try {
              const stat = await fs.promises.stat(delAbsPath);
              if (stat.isDirectory()) {
                await fs.promises.rm(delAbsPath, { recursive: true });
              } else {
                await fs.promises.unlink(delAbsPath);
              }
              sendToClient(ws, 'file.deleted', { sessionId, filePath });
            } catch (err) {
              sendToClient(ws, 'error', { message: `Cannot delete: ${err.message}`, code: 'INVALID_MESSAGE' });
            }
            break;
          }

          case 'claude.requestConfig': {
            const { sessionId } = msg.payload;
            if (!sessionId) {
              sendToClient(ws, 'error', { message: 'sessionId is required', code: 'INVALID_MESSAGE' });
              return;
            }
            const session = sessionManager.get(sessionId);
            if (!session) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            const files = await readClaudeConfig(session.workDir);
            sendToClient(ws, 'claude.config', { sessionId, files });
            break;
          }

          default:
            sendToClient(ws, 'error', { message: `Unknown message type: ${msg.type}`, code: 'INVALID_MESSAGE' });
        }
      } catch (err) {
        const code = err.message === 'SESSION_NOT_FOUND' ? 'SESSION_NOT_FOUND'
          : err.message === 'SESSION_TERMINATED' ? 'SESSION_TERMINATED'
          : err.message.includes('Maximum sessions') ? 'MAX_SESSIONS'
          : (err.message.includes('workDir') || err.message.includes('spawn')) ? 'SPAWN_FAILED'
          : 'INVALID_MESSAGE';
        console.error(`[ws] Error handling "${msg.type}": ${err.message}`);
        if (code === 'SPAWN_FAILED') {
          console.error(`[ws] Stack: ${err.stack}`);
        }
        sendToClient(ws, 'error', { message: err.message, code });
      }
    });

    ws.on('close', () => {
      // Cleanup if needed
    });
  });

  return { wss, broadcast };
}

// ─── Section 9: REST API ─────────────────────────────────────────────────────

function createRESTRouter(sessionManager, fileWatcher, broadcastFn) {
  const router = express.Router();

  router.post('/sessions', (req, res) => {
    try {
      const { cwd, workDir, label, agentType } = req.body;
      const dir = cwd || workDir;
      if (!dir) {
        return res.status(400).json({ error: 'cwd or workDir is required' });
      }
      const session = sessionManager.create(dir, label, agentType);
      broadcastFn('session.update', session);
      fileWatcher.watch(session.id, dir);
      res.status(201).json(session);
    } catch (err) {
      const status = err.message.includes('Maximum sessions') ? 429
        : err.message.includes('does not exist') ? 400
        : 500;
      res.status(status).json({ error: err.message });
    }
  });

  router.get('/sessions', (req, res) => {
    const all = req.query.all === 'true';
    res.json(all ? sessionManager.listAll() : sessionManager.list());
  });

  router.get('/sessions/:id', (req, res) => {
    const session = sessionManager.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  });

  router.delete('/sessions/:id', (req, res) => {
    const session = sessionManager.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    sessionManager.kill(req.params.id);
    fileWatcher.unwatch(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

// ─── Section 10: Startup & Shutdown ──────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);

const sessionManager = new SessionManager();
const fileWatcher = new FileWatcher();

const { wss, broadcast } = createWSS(httpServer, sessionManager, fileWatcher);

app.use('/api', createRESTRouter(sessionManager, fileWatcher, broadcast));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

httpServer.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`[Claude Punk] Backend running on http://${CONFIG.host}:${CONFIG.port}`);
  console.log(`[Claude Punk] WebSocket at ws://${CONFIG.host}:${CONFIG.port}/ws`);
  console.log(`[Claude Punk] Platform: ${process.platform} (${IS_WINDOWS ? 'Windows' : 'Unix'})`);
  console.log(`[Claude Punk] Shell: ${CONFIG.shell} ${JSON.stringify(CONFIG.shellArgs)}`);
  console.log(`[Claude Punk] Agent commands: ${JSON.stringify(CONFIG.agentCommands)}`);
  console.log(`[Claude Punk] Auto-run Claude: ${CONFIG.autoRunClaude}`);
  console.log(`[Claude Punk] Max sessions: ${CONFIG.maxSessions}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[Claude Punk] Received ${signal}, shutting down...`);

  sessionManager.killAll();
  fileWatcher.unwatchAll();

  wss.close(() => {
    httpServer.close(() => {
      console.log('[Claude Punk] Server closed cleanly.');
      process.exit(0);
    });
  });

  // Force exit after timeout
  setTimeout(() => {
    console.log('[Claude Punk] Forcing exit after timeout.');
    process.exit(1);
  }, CONFIG.shutdownTimeoutMs).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Windows: Ctrl+C fires SIGINT, but closing the terminal fires 'exit' — no SIGTERM support
if (IS_WINDOWS) {
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}
