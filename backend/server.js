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
import os from 'node:os';

// ─── Section 1: Config ───────────────────────────────────────────────────────

const IS_WINDOWS = process.platform === 'win32';

// ── Shell detection (runs once at startup, sets flags for everything else) ───

/** Detect the default shell for the current platform. */
function detectShell() {
  if (IS_WINDOWS) {
    if (process.env.CLAUDE_PUNK_SHELL) return process.env.CLAUDE_PUNK_SHELL;

    const gitBashPaths = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
    ];
    for (const p of gitBashPaths) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        console.log(`[config] Found Git Bash at ${p}`);
        return p;
      } catch { /* not found, try next */ }
    }

    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/zsh';
}

const DETECTED_SHELL = detectShell();
const IS_GIT_BASH = IS_WINDOWS && DETECTED_SHELL.toLowerCase().includes('bash');

console.log(`[config] Shell: ${DETECTED_SHELL} (IS_GIT_BASH=${IS_GIT_BASH})`);

/** Get shell arguments for the current platform. */
function getShellArgs() {
  if (IS_WINDOWS) return IS_GIT_BASH ? ['--login'] : [];
  return ['-l'];
}

/** Resolve a CLI command to its absolute path, falling back to the bare name. */
function resolveCommand(name) {
  if (IS_GIT_BASH) {
    // Git Bash: `which` first (matches what the PTY shell actually sees)
    try {
      const result = execSync(`"${DETECTED_SHELL}" -lc "which ${name}"`, { encoding: 'utf8' }).trim();
      if (result && !result.includes('not found')) return result;
    } catch { /* not found via Git Bash PATH */ }
    // Fallback to Windows `where`
    try {
      const result = execSync(`where ${name}`, { encoding: 'utf8' }).trim();
      const resolved = result.split(/\r?\n/)[0];
      if (resolved) return resolved;
    } catch { /* not found via Windows PATH either */ }
  } else if (IS_WINDOWS) {
    // cmd.exe / PowerShell: `where` only
    try {
      const result = execSync(`where ${name}`, { encoding: 'utf8' }).trim();
      const resolved = result.split(/\r?\n/)[0];
      if (resolved) return resolved;
    } catch { /* not found */ }
  } else {
    // Unix: `which`
    try {
      const result = execSync(`which ${name}`, { encoding: 'utf8' }).trim();
      if (result) return result;
    } catch { /* not found */ }
  }

  console.warn(`[config] Could not resolve command "${name}" — using bare name as fallback`);
  return name;
}

/**
 * Build a PATH string that includes directories of all resolved agent commands.
 * On Windows, Git Bash's login profile can rebuild PATH and drop user-specific
 * directories (e.g. ~/.local/bin), causing agent commands to be unfindable.
 */
function buildEnhancedPath() {
  const currentPath = process.env.PATH || '';
  const extraDirs = new Set();

  for (const name of ['claude', 'codex']) {
    const resolved = resolveCommand(name);
    if (resolved && resolved !== name) {
      extraDirs.add(path.dirname(resolved));
    }
  }

  if (extraDirs.size === 0) return currentPath;

  const sep = IS_WINDOWS ? ';' : ':';
  const existing = new Set(currentPath.split(sep).map(p => p.toLowerCase()));
  const toAdd = [...extraDirs].filter(d => !existing.has(d.toLowerCase()));

  if (toAdd.length === 0) return currentPath;

  console.log(`[config] Adding to PATH for PTY: ${toAdd.join(sep)}`);
  return toAdd.join(sep) + sep + currentPath;
}

const _enhancedPath = buildEnhancedPath();

const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: '127.0.0.1',
  maxSessions: 16,
  fileCountRatio: 20,
  autoRunClaude: process.env.AUTO_RUN_CLAUDE !== 'false',
  shell: DETECTED_SHELL,
  shellArgs: getShellArgs(),
  lineBufferFlushMs: 100,
  heartbeatIntervalMs: 30_000,
  ringBufferCapacity: 1000,
  ptyDefaultCols: 120,
  ptyDefaultRows: 40,
  autoRunDelayMs: 300,
  enhancedPath: _enhancedPath,
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

// ─── Claude Activity Helpers ────────────────────────────────────────────────

function encodeProjectPath(workDir) {
  return workDir.replace(/\//g, '-');
}

function getClaudeProjectDir(workDir) {
  return path.join(os.homedir(), '.claude', 'projects', encodeProjectPath(workDir));
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
        env: { ...process.env, TERM: 'xterm-256color', PATH: CONFIG.enhancedPath },
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
    // NOTE: On Windows, never call session.proc.kill() directly — node-pty's
    // windowsPtyAgent crashes with "Cannot read properties of undefined (reading
    // 'forEach')" when the process is already dead. Always use taskkill instead.
    try {
      if (IS_WINDOWS) {
        execSync(`taskkill /PID ${session.proc.pid} /T`, { timeout: 2000 });
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

// ─── Section 5b: ClaudeActivityWatcher ───────────────────────────────────────

class ClaudeActivityWatcher extends EventEmitter {
  constructor() {
    super();
    // Deduplicated: one chokidar watcher per projectDir
    this.dirWatchers = new Map();  // projectDir → { watcher, fileStates, gameSessionIds: Set, fileOwners: Map<filePath, gameSessionId> }
    // Reverse lookup: gameSessionId → projectDir
    this.sessionDirs = new Map();
    this.debounceTimers = new Map(); // filePath → timer
  }

  watch(gameSessionId, workDir) {
    if (this.sessionDirs.has(gameSessionId)) return;

    const projectDir = getClaudeProjectDir(workDir);

    // Check if directory exists
    try {
      fs.accessSync(projectDir);
    } catch {
      console.log(`[ClaudeActivity] Project dir not found (yet): ${projectDir}`);
      return;
    }

    this.sessionDirs.set(gameSessionId, projectDir);

    // If this projectDir is already watched, just add this session
    if (this.dirWatchers.has(projectDir)) {
      const entry = this.dirWatchers.get(projectDir);
      entry.gameSessionIds.add(gameSessionId);
      console.log(`[ClaudeActivity] Added session ${gameSessionId} to existing watcher for ${projectDir}`);
      return;
    }

    console.log(`[ClaudeActivity] Watching ${projectDir} for session ${gameSessionId}`);

    const fileStates = new Map();   // filePath → { byteOffset, claudeSessionId }
    const fileOwners = new Map();   // filePath → gameSessionId (which session owns this JSONL)
    const gameSessionIds = new Set([gameSessionId]);

    const watcher = chokidar.watch(path.join(projectDir, '*.jsonl'), {
      persistent: true,
      ignoreInitial: false,
      depth: 0,
    });

    const watcherReady = { value: false };
    watcher.on('ready', () => { watcherReady.value = true; });

    watcher.on('add', (filePath) => {
      try {
        const stat = fs.statSync(filePath);
        const claudeSessionId = path.basename(filePath, '.jsonl');
        fileStates.set(filePath, { byteOffset: stat.size, claudeSessionId });

        if (!watcherReady.value) {
          // Existing file discovered during initial scan — track but don't assign
          console.log(`[ClaudeActivity] Tracking existing file: ${path.basename(filePath)} (${stat.size} bytes, unassigned)`);
          return;
        }

        // Truly new file created after watcher started — assign to most recent unassigned session
        console.log(`[ClaudeActivity] New file detected: ${path.basename(filePath)} (${stat.size} bytes)`);
        const ownedFiles = new Set(fileOwners.values());
        for (const sid of [...gameSessionIds].reverse()) {
          if (!ownedFiles.has(sid)) {
            fileOwners.set(filePath, sid);
            console.log(`[ClaudeActivity] Assigned ${path.basename(filePath)} → session ${sid}`);
            break;
          }
        }
      } catch {
        // file may have been removed already
      }
    });

    watcher.on('change', (filePath) => {
      if (!filePath.endsWith('.jsonl')) return;

      // Debounce reads per file (single read, then emit to owner)
      const existing = this.debounceTimers.get(filePath);
      if (existing) clearTimeout(existing);
      this.debounceTimers.set(filePath, setTimeout(() => {
        this.debounceTimers.delete(filePath);
        this._readNewLines(filePath, projectDir);
      }, 200));
    });

    this.dirWatchers.set(projectDir, { watcher, fileStates, gameSessionIds, fileOwners });
  }

  _readNewLines(filePath, projectDir) {
    const dirEntry = this.dirWatchers.get(projectDir);
    if (!dirEntry) return;

    const state = dirEntry.fileStates.get(filePath);
    if (!state) return;

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }

    if (stat.size <= state.byteOffset) return;

    const bytesToRead = stat.size - state.byteOffset;
    const buf = Buffer.alloc(bytesToRead);

    let fd;
    try {
      fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buf, 0, bytesToRead, state.byteOffset);
      fs.closeSync(fd);
    } catch {
      if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
      return;
    }

    state.byteOffset = stat.size;

    const lines = buf.toString('utf-8').split('\n').filter(Boolean);
    const events = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const parsed = this._parseEntry(entry);
        if (parsed.length > 0) events.push(...parsed);
      } catch {
        // skip malformed lines
      }
    }

    if (events.length === 0) return;

    // Determine which session owns this file
    const owner = dirEntry.fileOwners.get(filePath);
    if (owner) {
      // Emit only to the owning session
      this.emit('activity', { gameSessionId: owner, events });
    } else {
      // Unassigned file: try to assign now
      const ownedFiles = new Set(dirEntry.fileOwners.values());
      for (const sid of [...dirEntry.gameSessionIds].reverse()) {
        if (!ownedFiles.has(sid)) {
          dirEntry.fileOwners.set(filePath, sid);
          console.log(`[ClaudeActivity] Late-assigned ${path.basename(filePath)} → session ${sid}`);
          this.emit('activity', { gameSessionId: sid, events });
          return;
        }
      }
      // All sessions have files — drop events rather than broadcast to wrong sessions
      console.log(`[ClaudeActivity] Dropping events from unassigned file ${path.basename(filePath)} (all sessions already have files)`);
    }
  }

  _parseEntry(entry) {
    const results = [];
    const ts = entry.timestamp || new Date().toISOString();

    switch (entry.type) {
      case 'assistant': {
        const msg = entry.message;
        if (!msg || !msg.content) break;

        // Extract usage info
        const usage = msg.usage ? {
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          cacheRead: msg.usage.cache_read_input_tokens,
          cacheCreation: msg.usage.cache_creation_input_tokens,
        } : undefined;

        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            results.push({
              timestamp: ts,
              kind: 'assistant_text',
              text: block.text.slice(0, 500),
              usage,
            });
          } else if (block.type === 'tool_use') {
            const toolEvent = {
              timestamp: ts,
              kind: 'tool_use',
              toolName: block.name,
              toolId: block.id,
              input: this._summarizeToolInput(block.name, block.input),
            };
            // Tool-specific extra fields
            switch (block.name) {
              case 'ExitPlanMode':
                toolEvent.plan = (block.input?.plan || JSON.stringify(block.input || {})).slice(0, 20000);
                break;
              case 'AskUserQuestion':
                toolEvent.questions = block.input?.questions;
                break;
              case 'Task':
                toolEvent.subagentType = block.input?.subagent_type;
                toolEvent.agentName = block.input?.name;
                toolEvent.description = block.input?.description;
                break;
              case 'Skill':
                toolEvent.skill = block.input?.skill;
                toolEvent.args = block.input?.args;
                break;
              case 'TeamCreate':
                toolEvent.teamName = block.input?.team_name;
                toolEvent.teamDescription = block.input?.description;
                break;
              case 'SendMessage':
                toolEvent.recipient = block.input?.recipient;
                toolEvent.messageType = block.input?.type;
                break;
              case 'TaskCreate':
                toolEvent.taskSubject = block.input?.subject;
                toolEvent.taskDescription = (block.input?.description || '').slice(0, 500);
                toolEvent.taskActiveForm = block.input?.activeForm;
                break;
              case 'TaskUpdate':
                toolEvent.taskId = block.input?.taskId;
                toolEvent.taskStatus = block.input?.status;
                toolEvent.taskSubject = block.input?.subject;
                toolEvent.taskOwner = block.input?.owner;
                break;
            }
            results.push(toolEvent);
          } else if (block.type === 'thinking' && block.thinking) {
            results.push({
              timestamp: ts,
              kind: 'thinking',
              text: block.thinking.slice(0, 10000),
            });
          }
        }

        // If there's usage but no text/tool blocks emitted yet, emit a standalone usage event
        if (usage && results.length === 0) {
          results.push({ timestamp: ts, kind: 'assistant_text', text: '', usage });
        }
        break;
      }

      case 'progress': {
        const data = entry.data;
        if (!data) break;

        // Skip hook events entirely
        if (data.type === 'hook_progress') break;

        if (data.type === 'agent_progress' && data.content) {
          // Sub-agent progress — extract tool_use blocks
          const content = Array.isArray(data.content) ? data.content : [];
          let hasToolUse = false;
          for (const block of content) {
            if (block.type === 'tool_use') {
              hasToolUse = true;
              results.push({
                timestamp: ts,
                kind: 'subagent_tool_use',
                slug: data.slug,
                toolName: block.name,
                toolId: block.id,
                input: this._summarizeToolInput(block.name, block.input),
              });
            }
          }
          // If no tool_use blocks found, emit standalone agent_progress
          if (!hasToolUse) {
            results.push({
              timestamp: ts,
              kind: 'agent_progress',
              agentId: data.slug || data.agentId,
              prompt: (data.prompt || '').slice(0, 200),
            });
          }
        }
        break;
      }

      case 'user': {
        const msg = entry.message;
        if (!msg || !msg.content) break;
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content.slice(0, 200);
        } else if (Array.isArray(msg.content)) {
          const textBlock = msg.content.find(b => b.type === 'text');
          if (textBlock) text = textBlock.text?.slice(0, 200) || '';
        }
        if (text) {
          results.push({ timestamp: ts, kind: 'user_message', text });
        }
        break;
      }

      case 'system': {
        if (entry.subtype === 'api_error') {
          results.push({
            timestamp: ts,
            kind: 'error',
            error: entry.error || entry.message || 'API error',
            retryAttempt: entry.retryAttempt,
          });
        }
        break;
      }
      // skip: 'result', 'file-history-snapshot', etc.
    }

    return results;
  }

  _summarizeToolInput(toolName, input) {
    if (!input) return '';
    switch (toolName) {
      case 'Read':
      case 'Write':
      case 'Edit':
        return input.file_path || input.path || '';
      case 'Glob':
        return input.pattern || '';
      case 'Bash':
        return (input.command || '').slice(0, 120);
      case 'Grep':
        return `"${input.pattern || ''}" in ${input.path || '.'}`;
      case 'Task':
        return `[${input.subagent_type || ''}] ${(input.description || '').slice(0, 100)}`;
      case 'ExitPlanMode':
        return 'Plan submitted';
      case 'EnterPlanMode':
        return 'Entering plan mode';
      case 'AskUserQuestion':
        return (input.questions?.[0]?.question || '').slice(0, 120);
      case 'Skill':
        return input.skill || '';
      case 'TeamCreate':
        return input.team_name || '';
      case 'SendMessage':
        return `→ ${input.recipient || ''}: ${(input.content || '').slice(0, 80)}`;
      case 'TaskCreate':
        return input.subject || '';
      case 'TaskUpdate':
        return `#${input.taskId || ''} → ${input.status || input.subject || ''}`;
      case 'TaskList':
        return 'List tasks';
      case 'TaskGet':
        return `#${input.taskId || ''}`;
      case 'WebSearch':
        return input.query || '';
      case 'WebFetch':
        return input.url || '';
      default:
        return JSON.stringify(input).slice(0, 100);
    }
  }

  unwatch(gameSessionId) {
    const projectDir = this.sessionDirs.get(gameSessionId);
    if (!projectDir) return;
    this.sessionDirs.delete(gameSessionId);

    const dirEntry = this.dirWatchers.get(projectDir);
    if (!dirEntry) return;

    dirEntry.gameSessionIds.delete(gameSessionId);

    // Remove file ownership for this session
    for (const [filePath, owner] of dirEntry.fileOwners) {
      if (owner === gameSessionId) {
        dirEntry.fileOwners.delete(filePath);
      }
    }

    console.log(`[ClaudeActivity] Unwatching session ${gameSessionId} (${dirEntry.gameSessionIds.size} remaining)`);

    // If no sessions left watching this dir, close the watcher entirely
    if (dirEntry.gameSessionIds.size === 0) {
      dirEntry.watcher.close();
      this.dirWatchers.delete(projectDir);

      // Clean up debounce timers for files in this dir
      for (const [filePath, timer] of this.debounceTimers) {
        if (filePath.startsWith(projectDir)) {
          clearTimeout(timer);
          this.debounceTimers.delete(filePath);
        }
      }
    }
  }

  /**
   * Read the most recent `count` parsed activity events from JSONL files.
   * Used to backfill the Activity panel on initial subscribe.
   * If gameSessionId is provided, only reads from the file owned by that session.
   */
  async getRecentEvents(workDir, count = 50, afterTimestamp = 0, gameSessionId = null) {
    const projectDir = getClaudeProjectDir(workDir);

    let fileNames;
    try {
      const entries = await fs.promises.readdir(projectDir);
      fileNames = entries.filter(f => f.endsWith('.jsonl'));
    } catch {
      return [];
    }
    if (fileNames.length === 0) return [];

    // If we have a file-owner mapping for this session, prefer that specific file
    let targetFile = null;
    if (gameSessionId) {
      const dirEntry = this.dirWatchers.get(projectDir);
      if (dirEntry) {
        for (const [fp, owner] of dirEntry.fileOwners) {
          if (owner === gameSessionId) {
            targetFile = fp;
            break;
          }
        }
      }
    }

    if (!targetFile) {
      // Fallback: find the most recently modified JSONL file after session creation
      // BUT skip files already owned by other sessions to prevent cross-session leakage
      const dirEntry = this.dirWatchers.get(projectDir);
      const ownedFiles = dirEntry ? new Set(dirEntry.fileOwners.values()) : new Set();
      const ownedPaths = dirEntry ? new Set(dirEntry.fileOwners.keys()) : new Set();

      let latest = null;
      for (const f of fileNames) {
        const fullPath = path.join(projectDir, f);
        // Skip files already assigned to a different session
        if (ownedPaths.has(fullPath) && dirEntry?.fileOwners.get(fullPath) !== gameSessionId) continue;
        try {
          const stat = await fs.promises.stat(fullPath);
          if (afterTimestamp && stat.mtimeMs < afterTimestamp) continue;
          if (!latest || stat.mtimeMs > latest.mtime) {
            latest = { name: f, mtime: stat.mtimeMs, size: stat.size, fullPath };
          }
        } catch { /* skip */ }
      }
      if (!latest || latest.size === 0) return [];
      targetFile = latest.fullPath;
    }

    let stat;
    try {
      stat = fs.statSync(targetFile);
    } catch {
      return [];
    }
    if (stat.size === 0) return [];

    console.log(`[ClaudeActivity] Reading recent events from ${path.basename(targetFile)} for session ${gameSessionId || '(any)'} (${stat.size} bytes)`);

    // Read last 200KB — more than enough for 50+ events
    const readSize = Math.min(stat.size, 200 * 1024);
    const startOffset = stat.size - readSize;

    const buf = Buffer.alloc(readSize);
    let fd;
    try {
      fd = fs.openSync(targetFile, 'r');
      fs.readSync(fd, buf, 0, readSize, startOffset);
      fs.closeSync(fd);
    } catch {
      if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
      return [];
    }

    const text = buf.toString('utf-8');
    const lines = text.split('\n').filter(Boolean);

    // If we started mid-file, first line might be partial — skip it
    const startIdx = startOffset > 0 ? 1 : 0;

    // Parse from end to collect most recent first
    const events = [];
    for (let i = lines.length - 1; i >= startIdx; i--) {
      if (events.length >= count) break;
      try {
        const entry = JSON.parse(lines[i]);
        const parsed = this._parseEntry(entry);
        if (parsed.length > 0) events.unshift(...parsed);
      } catch { /* skip malformed */ }
    }

    return events.slice(-count);
  }

  unwatchAll() {
    for (const id of [...this.sessionDirs.keys()]) {
      this.unwatch(id);
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
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 * 1024 });

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
            activityWatcher.watch(session.id, workDir);
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
            activityWatcher.unwatch(sessionId);
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

          case 'file.upload': {
            const { sessionId, filePath, content, encoding } = msg.payload;
            if (!sessionId || !filePath || content === undefined) {
              sendToClient(ws, 'error', { message: 'sessionId, filePath, and content are required', code: 'INVALID_MESSAGE' });
              return;
            }
            const uploadSession = sessionManager.get(sessionId);
            if (!uploadSession) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            const uploadAbsPath = path.resolve(uploadSession.workDir, filePath);
            if (!uploadAbsPath.startsWith(uploadSession.workDir)) {
              sendToClient(ws, 'error', { message: 'Path traversal not allowed', code: 'INVALID_MESSAGE' });
              return;
            }
            try {
              let buf;
              if (encoding === 'base64') {
                buf = Buffer.from(content, 'base64');
              } else {
                buf = Buffer.from(content, 'utf-8');
              }
              // 5MB decoded size limit
              if (buf.length > 5 * 1024 * 1024) {
                sendToClient(ws, 'error', { message: 'File too large (max 5MB decoded)', code: 'INVALID_MESSAGE' });
                return;
              }
              // Ensure parent directory exists
              await fs.promises.mkdir(path.dirname(uploadAbsPath), { recursive: true });
              await fs.promises.writeFile(uploadAbsPath, buf);
              sendToClient(ws, 'file.uploaded', { sessionId, filePath });
            } catch (err) {
              sendToClient(ws, 'error', { message: `Upload failed: ${err.message}`, code: 'INVALID_MESSAGE' });
            }
            break;
          }

          case 'file.download': {
            const { sessionId, filePath } = msg.payload;
            if (!sessionId || !filePath) {
              sendToClient(ws, 'error', { message: 'sessionId and filePath are required', code: 'INVALID_MESSAGE' });
              return;
            }
            const dlSession = sessionManager.get(sessionId);
            if (!dlSession) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            const dlAbsPath = path.resolve(dlSession.workDir, filePath);
            if (!dlAbsPath.startsWith(dlSession.workDir)) {
              sendToClient(ws, 'error', { message: 'Path traversal not allowed', code: 'INVALID_MESSAGE' });
              return;
            }
            try {
              const stat = await fs.promises.stat(dlAbsPath);
              if (stat.size > 5 * 1024 * 1024) {
                sendToClient(ws, 'error', { message: 'File too large (max 5MB)', code: 'INVALID_MESSAGE' });
                return;
              }
              const buf = await fs.promises.readFile(dlAbsPath);
              sendToClient(ws, 'file.downloadReady', {
                sessionId,
                filePath,
                content: buf.toString('base64'),
                size: stat.size,
              });
            } catch (err) {
              sendToClient(ws, 'error', { message: `Download failed: ${err.message}`, code: 'INVALID_MESSAGE' });
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

          case 'claude.watchActivity': {
            const { sessionId } = msg.payload;
            if (!sessionId) {
              sendToClient(ws, 'error', { message: 'sessionId is required', code: 'INVALID_MESSAGE' });
              return;
            }
            const watchSession = sessionManager.get(sessionId);
            if (!watchSession) {
              sendToClient(ws, 'error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
              return;
            }
            activityWatcher.watch(sessionId, watchSession.workDir);

            // Backfill: send recent events, but only from files modified after this
            // session was created — prevents showing events from old conversations
            const sessionCreatedMs = new Date(watchSession.createdAt).getTime();
            const recentEvents = await activityWatcher.getRecentEvents(watchSession.workDir, 50, sessionCreatedMs, sessionId);
            if (recentEvents.length > 0) {
              sendToClient(ws, 'claude.activity', { gameSessionId: sessionId, events: recentEvents });
            }
            break;
          }

          case 'claude.unwatchActivity': {
            const { sessionId } = msg.payload;
            if (!sessionId) {
              sendToClient(ws, 'error', { message: 'sessionId is required', code: 'INVALID_MESSAGE' });
              return;
            }
            activityWatcher.unwatch(sessionId);
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
      activityWatcher.watch(session.id, dir);
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
    activityWatcher.unwatch(req.params.id);
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
const activityWatcher = new ClaudeActivityWatcher();

const { wss, broadcast } = createWSS(httpServer, sessionManager, fileWatcher);

// Wire ClaudeActivityWatcher events to WS broadcast
activityWatcher.on('activity', (payload) => {
  broadcast('claude.activity', payload);
});

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
  activityWatcher.unwatchAll();

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
