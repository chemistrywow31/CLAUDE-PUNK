/**
 * Terminal tab — real terminal emulator using xterm.js.
 * Receives raw PTY data and renders it properly, including TUI apps like Claude CLI.
 * Keyboard input is sent directly to the PTY as raw keystrokes.
 *
 * Instances are cached per session so the terminal survives dialog close/reopen.
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import wsService from '../services/websocket.js';

/** sessionId → TerminalTab  (survives dialog close / reopen) */
const cache = new Map();

export default class TerminalTab {
  /**
   * Return a cached instance for this session, or create a new one.
   */
  static getOrCreate(sessionId) {
    if (cache.has(sessionId)) return cache.get(sessionId);
    const tab = new TerminalTab(sessionId);
    cache.set(sessionId, tab);
    return tab;
  }

  /** Remove a session's cached tab and fully tear it down. */
  static purge(sessionId) {
    const tab = cache.get(sessionId);
    if (tab) {
      tab.dispose();
      cache.delete(sessionId);
    }
  }

  constructor(sessionId) {
    this.sessionId = sessionId;
    this.el = null;
    this.term = null;
    this.fitAddon = null;
    this.unsubOutput = null;
    this.resizeObserver = null;
    this.initialized = false;

    // Start listening for PTY output immediately so output is buffered
    // in the xterm.js screen buffer even while the dialog is closed.
    this._initTerminal();
  }

  /** Create the xterm Terminal and subscribe to PTY output. */
  _initTerminal() {
    this.term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      theme: {
        background: '#0a0a14',
        foreground: '#e0e0e0',
        cursor: '#00f0ff',
        cursorAccent: '#0a0a14',
        selectionBackground: '#00f0ff44',
        black: '#0a0a14',
        red: '#ff0080',
        green: '#00f0ff',
        yellow: '#ffaa00',
        blue: '#8040c0',
        magenta: '#ff0080',
        cyan: '#00f0ff',
        white: '#e0e0e0',
        brightBlack: '#4a4a5e',
        brightRed: '#ff0080',
        brightGreen: '#00f0ff',
        brightYellow: '#ffaa00',
        brightBlue: '#8040c0',
        brightMagenta: '#ff0080',
        brightCyan: '#00f0ff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
      scrollback: 5000,
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);

    // Subscribe to PTY output (persists across attach/detach cycles)
    this.unsubOutput = wsService.on('terminal.output', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.term.write(payload.data);
    });

    // Keyboard input → PTY
    this.term.onData((data) => {
      wsService.sendTerminalInput(this.sessionId, data);
    });
  }

  /**
   * Attach (or re-attach) to a visible DOM container.
   * Called by DialogBox each time the Terminal tab is shown.
   */
  render(container) {
    this.el = document.createElement('div');
    this.el.className = 'terminal-tab';
    container.appendChild(this.el);

    if (!this.initialized) {
      // First time: open xterm into the DOM
      this.term.open(this.el);
      this.initialized = true;
    } else {
      // Re-attach: move the xterm DOM tree into the new container
      const xtermEl = this.term.element;
      if (xtermEl) {
        this.el.appendChild(xtermEl);
      }
    }

    // Fit after a frame so the container has its final size
    requestAnimationFrame(() => {
      try {
        this.fitAddon.fit();
        wsService.resizeTerminal(this.sessionId, this.term.cols, this.term.rows);
      } catch {
        // ignore
      }
    });

    // Watch for container resize
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      try {
        this.fitAddon.fit();
        wsService.resizeTerminal(this.sessionId, this.term.cols, this.term.rows);
      } catch {
        // ignore
      }
    });
    this.resizeObserver.observe(this.el);

    // Focus the terminal
    this.term.focus();
  }

  /**
   * Detach from the DOM but keep the Terminal alive so output keeps buffering.
   * Called by DialogBox when the dialog closes or the tab switches.
   */
  detach() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }

  /**
   * Alias for detach — DialogBox calls destroy() on tab objects,
   * but for TerminalTab we only want a detach (keep alive in cache).
   */
  destroy() {
    this.detach();
  }

  /**
   * Full teardown — called via TerminalTab.purge() when the session ends.
   */
  dispose() {
    if (this.unsubOutput) {
      this.unsubOutput();
      this.unsubOutput = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.term) {
      this.term.dispose();
      this.term = null;
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    this.initialized = false;
  }
}
