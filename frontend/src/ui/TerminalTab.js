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
import FileWarpPanel from './FileWarpPanel.js';
import { createResizeHandle } from './resizeHandle.js';

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
    this.agentType = 'claude'; // set externally after getOrCreate()
    this.el = null;
    this.term = null;
    this.fitAddon = null;
    this.unsubOutput = null;
    this.unsubReplay = null;
    this.resizeObserver = null;
    this.initialized = false;
    this._pendingReplay = null; // deferred replay data + dimensions

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

    // Subscribe to replay events (sent on reconnect with PTY dimensions).
    // Defer writing until the terminal is attached to the DOM and fit(),
    // so line wrapping and cursor positioning match the actual size.
    this.unsubReplay = wsService.on('terminal.replay', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this._pendingReplay = payload;
      // If already attached to DOM, apply immediately
      if (this.el && this.el.parentNode) {
        this._applyReplay();
      }
    });

    // Keyboard input → PTY
    this.term.onData((data) => {
      wsService.sendTerminalInput(this.sessionId, data);
    });
  }

  /**
   * Apply a deferred replay: reset the terminal, resize to the PTY dimensions
   * the output was generated at, write the replay data, then fit to container.
   */
  _applyReplay() {
    const replay = this._pendingReplay;
    if (!replay) return;
    this._pendingReplay = null;

    // Full reset: clear screen, scrollback, and terminal state
    this.term.reset();

    // Resize xterm to the PTY dimensions so replay renders correctly
    if (replay.cols && replay.rows) {
      this.term.resize(replay.cols, replay.rows);
    }

    // Write replay data
    this.term.write(replay.data);

    // Now fit to the actual container and sync PTY
    requestAnimationFrame(() => {
      try {
        this.fitAddon.fit();
        wsService.resizeTerminal(this.sessionId, this.term.cols, this.term.rows);
      } catch {
        // ignore
      }
    });
  }

  /**
   * Attach (or re-attach) to a visible DOM container.
   * Called by DialogBox each time the Terminal tab is shown.
   */
  render(container) {
    // Wrapper: sidebar + terminal side by side
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'terminal-with-sidebar';
    container.appendChild(this.wrapper);

    // File Warp sidebar (with quick-commands tab)
    this.fileWarpPanel = new FileWarpPanel(this.sessionId, this.agentType, () => {
      this.term?.focus();
    });
    this.fileWarpPanel.render(this.wrapper);

    // Resize handle between sidebar and terminal
    const fwpEl = this.fileWarpPanel.el;
    const resizeHandle = createResizeHandle({
      direction: 'horizontal',
      target: fwpEl,
      property: 'width',
      min: 150,
      max: 500,
      storageKey: 'claudePunk_fileWarpWidth',
    });
    this.wrapper.appendChild(resizeHandle);

    // Terminal container
    this.el = document.createElement('div');
    this.el.className = 'terminal-tab';
    this.wrapper.appendChild(this.el);

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
        // If there's a pending replay, apply it (reset → resize → write → fit)
        if (this._pendingReplay) {
          this._applyReplay();
        } else {
          this.fitAddon.fit();
          wsService.resizeTerminal(this.sessionId, this.term.cols, this.term.rows);
        }
      } catch {
        // ignore
      }
    });

    // Watch for terminal container resize (not the wrapper)
    // Debounced via rAF guard to prevent rapid-fire fit()/resize loops
    // (fit() can trigger layout changes that re-fire the ResizeObserver)
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this._resizeRafId = null;
    this.resizeObserver = new ResizeObserver(() => {
      if (this._resizeRafId) return;
      this._resizeRafId = requestAnimationFrame(() => {
        this._resizeRafId = null;
        try {
          this.fitAddon.fit();
          wsService.resizeTerminal(this.sessionId, this.term.cols, this.term.rows);
        } catch {
          // ignore
        }
      });
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
    if (this._resizeRafId) {
      cancelAnimationFrame(this._resizeRafId);
      this._resizeRafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.fileWarpPanel) {
      this.fileWarpPanel.destroy();
      this.fileWarpPanel = null;
    }
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
    this.wrapper = null;
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
    if (this.unsubReplay) {
      this.unsubReplay();
      this.unsubReplay = null;
    }
    if (this._resizeRafId) {
      cancelAnimationFrame(this._resizeRafId);
      this._resizeRafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.fileWarpPanel) {
      this.fileWarpPanel.destroy();
      this.fileWarpPanel = null;
    }
    if (this.term) {
      this.term.dispose();
      this.term = null;
    }
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
    this.wrapper = null;
    this.el = null;
    this.initialized = false;
  }
}
