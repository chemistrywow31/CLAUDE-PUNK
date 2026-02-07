/**
 * Dialog box — HTML overlay for interacting with a session.
 * Tabs: Terminal | Files | Claude Config
 * Opens when a character is clicked.
 */

import wsService from '../services/websocket.js';
import TerminalTab from './TerminalTab.js';
import FilesTab from './FilesTab.js';
import ClaudeConfigTab from './ClaudeConfigTab.js';

export default class DialogBox {
  constructor() {
    this.overlay = document.getElementById('dialog-overlay');
    this.currentSessionId = null;
    this.currentTab = null;
    this.tabs = {};
    this.visible = false;
    this.onOpen = null;
    this.onClose = null;
    this.init();
  }

  init() {
    this.overlay.innerHTML = `
      <div id="dialog-box" class="cyberpunk-panel">
        <div id="dialog-header">
          <span id="dialog-title">Session</span>
          <span id="dialog-status" class="status-badge">active</span>
          <button id="dialog-kill" class="kill-btn" title="Terminate session">KILL</button>
          <button id="dialog-close">&times;</button>
        </div>
        <div id="dialog-tabs">
          <button class="tab active" data-tab="cli">Terminal</button>
          <button class="tab" data-tab="files">Files</button>
          <button class="tab" data-tab="claude">Config</button>
        </div>
        <div id="dialog-content"></div>
        <div id="dialog-input">
          <input type="text" id="prompt-input" placeholder="Enter prompt..." spellcheck="false" />
          <button id="prompt-send">Send</button>
        </div>
      </div>
    `;

    // Close
    this.overlay.querySelector('#dialog-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Kill session
    this.overlay.querySelector('#dialog-kill').addEventListener('click', () => {
      if (this.currentSessionId) {
        wsService.killSession(this.currentSessionId);
      }
    });

    // Tab switching
    this.overlay.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Prompt input
    const promptInput = this.overlay.querySelector('#prompt-input');
    const promptSend = this.overlay.querySelector('#prompt-send');

    promptSend.addEventListener('click', () => this.sendPrompt());
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendPrompt();
      if (e.key === 'Escape') this.close();
    });

    // Keyboard: Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) {
        this.close();
      }
    });

    // Listen for session state changes
    wsService.on('session.terminated', (payload) => {
      if (payload.sessionId === this.currentSessionId) {
        const statusEl = this.overlay.querySelector('#dialog-status');
        statusEl.textContent = 'terminated';
        statusEl.className = 'status-badge terminated';
        this.overlay.querySelector('#prompt-input').disabled = true;
        this.overlay.querySelector('#prompt-send').disabled = true;
        this.overlay.querySelector('#dialog-kill').classList.add('hidden');
      }
      // Fully tear down the cached terminal for this session
      TerminalTab.purge(payload.sessionId);
    });
  }

  open(sessionId, label, state) {
    this.currentSessionId = sessionId;
    this.visible = true;

    // Update header
    this.overlay.querySelector('#dialog-title').textContent = label || sessionId;
    const statusEl = this.overlay.querySelector('#dialog-status');
    statusEl.textContent = state || 'active';
    statusEl.className = `status-badge ${state || 'active'}`;

    // Enable/disable based on session state
    const isActive = state !== 'terminated';
    this.overlay.querySelector('#prompt-input').disabled = !isActive;
    this.overlay.querySelector('#prompt-send').disabled = !isActive;
    const killBtn = this.overlay.querySelector('#dialog-kill');
    if (isActive) {
      killBtn.classList.remove('hidden');
    } else {
      killBtn.classList.add('hidden');
    }

    // Show
    this.overlay.classList.remove('hidden');
    if (this.onOpen) this.onOpen();

    // Detach any currently attached tabs (in case we're switching sessions)
    this.detachTabs();

    // Build tab set — reuse cached TerminalTab, fresh instances for others
    this.tabs = {
      cli: TerminalTab.getOrCreate(sessionId),
      files: new FilesTab(sessionId),
      claude: new ClaudeConfigTab(sessionId),
    };

    // Activate default tab
    this.switchTab('cli');
  }

  close() {
    this.visible = false;
    this.overlay.classList.add('hidden');
    this.currentSessionId = null;
    // Detach tabs from DOM (TerminalTab stays alive in cache)
    this.detachTabs();
    if (this.onClose) this.onClose();
  }

  switchTab(tabName) {
    // Update tab buttons
    this.overlay.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Detach current tab content
    const content = this.overlay.querySelector('#dialog-content');
    if (this.currentTab && this.tabs[this.currentTab]) {
      this.tabs[this.currentTab].destroy();
    }
    content.innerHTML = '';

    // Hide prompt input bar — xterm.js handles terminal input directly
    const inputBar = this.overlay.querySelector('#dialog-input');
    inputBar.style.display = 'none';

    // Render new tab
    this.currentTab = tabName;
    if (this.tabs[tabName]) {
      this.tabs[tabName].render(content);
    }
  }

  sendPrompt() {
    const input = this.overlay.querySelector('#prompt-input');
    const prompt = input.value.trim();
    if (!prompt || !this.currentSessionId) return;

    const sent = wsService.sendPrompt(this.currentSessionId, prompt);
    if (sent) {
      input.value = '';
    }
  }

  /** Detach all tabs from DOM without destroying cached TerminalTabs. */
  detachTabs() {
    Object.values(this.tabs).forEach((tab) => tab.destroy());
    this.tabs = {};
    this.currentTab = null;
  }
}
