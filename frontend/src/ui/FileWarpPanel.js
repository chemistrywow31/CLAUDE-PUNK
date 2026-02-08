/**
 * FileWarpPanel — left sidebar inside the Terminal tab.
 * Two panels switchable via tabs:
 *   FILES — collapsible file tree; clicking inserts path into terminal.
 *   CMDS  — quick commands saved per agentType; clicking sends to PTY.
 */

import wsService from '../services/websocket.js';

// ── Quick-command persistence ───────────────────────────────────────
const STORAGE_KEY = 'quickCmds';
let _idSeq = 0;
function _id() { return `qc_${Date.now()}_${_idSeq++}`; }

function loadCommands(agentType) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${agentType}`);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted – fall through to defaults */ }
  return getDefaults(agentType);
}

function saveCommands(agentType, commands) {
  localStorage.setItem(`${STORAGE_KEY}_${agentType}`, JSON.stringify(commands));
}

function getDefaults(agentType) {
  if (agentType === 'codex') {
    return [
      { id: 'default_codex_help', label: '/help', command: '/help' },
    ];
  }
  return [
    { id: 'default_claude_cost', label: '/cost', command: '/cost' },
    { id: 'default_claude_compact', label: '/compact', command: '/compact' },
  ];
}

// ── Panel ───────────────────────────────────────────────────────────
export default class FileWarpPanel {
  /**
   * @param {string} sessionId
   * @param {string} agentType - 'claude' | 'codex'
   * @param {() => void} [onInsert] - called after inserting text so caller can focus terminal
   */
  constructor(sessionId, agentType = 'claude', onInsert) {
    this.sessionId = sessionId;
    this.agentType = agentType;
    this.onInsert = onInsert || null;
    this.el = null;
    this.treeEl = null;
    this.cmdsEl = null;
    this.activePanel = 'files'; // 'files' | 'cmds'
    this.unsubTree = null;
    this.unsubFiles = null;
  }

  render(container) {
    this.el = document.createElement('div');
    this.el.className = 'file-warp-panel';
    this.el.innerHTML = `
      <div class="fwp-header">
        <div class="fwp-tabs">
          <button class="fwp-tab active" data-panel="files">FILES</button>
          <button class="fwp-tab" data-panel="cmds">CMDS</button>
        </div>
        <button class="fwp-refresh" title="Refresh">&#x21bb;</button>
      </div>
      <div class="fwp-tree"></div>
      <div class="fwp-commands hidden"></div>
    `;
    container.appendChild(this.el);

    this.treeEl = this.el.querySelector('.fwp-tree');
    this.cmdsEl = this.el.querySelector('.fwp-commands');

    // Tab switching
    this.el.querySelectorAll('.fwp-tab').forEach((btn) => {
      btn.addEventListener('click', () => this._switchPanel(btn.dataset.panel));
    });

    // Refresh (only meaningful for FILES panel)
    this.el.querySelector('.fwp-refresh').addEventListener('click', () => {
      if (this.activePanel === 'files') this.requestTree();
    });

    // WS listeners — file tree
    this.unsubTree = wsService.on('files.tree', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.renderTree(payload.tree);
    });
    this.unsubFiles = wsService.on('files.update', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      wsService.requestFileTree(this.sessionId);
    });

    // Initial data
    this.requestTree();
    this._renderCommands();
  }

  // ── Panel switching ─────────────────────────────────────────────
  _switchPanel(panel) {
    this.activePanel = panel;
    this.el.querySelectorAll('.fwp-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.panel === panel);
    });
    this.treeEl.classList.toggle('hidden', panel !== 'files');
    this.cmdsEl.classList.toggle('hidden', panel !== 'cmds');
    // Refresh button only relevant for FILES
    this.el.querySelector('.fwp-refresh').style.display =
      panel === 'files' ? '' : 'none';
  }

  // ── File Tree (unchanged logic) ─────────────────────────────────
  requestTree() {
    if (this.treeEl) {
      this.treeEl.innerHTML = '<div class="fwp-loading">Loading...</div>';
    }
    wsService.requestFileTree(this.sessionId);
  }

  renderTree(nodes) {
    if (!this.treeEl) return;
    this.treeEl.innerHTML = '';
    if (!nodes || nodes.length === 0) {
      this.treeEl.innerHTML = '<div class="fwp-empty">No files</div>';
      return;
    }
    const ul = this._buildTreeDOM(nodes);
    this.treeEl.appendChild(ul);
  }

  _buildTreeDOM(nodes) {
    const ul = document.createElement('ul');
    ul.className = 'fwp-list';

    for (const node of nodes) {
      const li = document.createElement('li');
      li.className = node.isDir ? 'fwp-node fwp-dir' : 'fwp-node fwp-file';

      const row = document.createElement('div');
      row.className = 'fwp-row';

      if (node.isDir) {
        const toggle = document.createElement('span');
        toggle.className = 'fwp-toggle';
        toggle.textContent = '\u25b8'; // ▸
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          li.classList.toggle('expanded');
          toggle.textContent = li.classList.contains('expanded') ? '\u25be' : '\u25b8';
        });
        row.appendChild(toggle);

        const name = document.createElement('span');
        name.className = 'fwp-name fwp-folder-name';
        name.textContent = node.name + '/';
        name.addEventListener('click', () => this._insertPath(node.path));
        row.appendChild(name);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'fwp-toggle fwp-spacer';
        spacer.textContent = ' ';
        row.appendChild(spacer);

        const name = document.createElement('span');
        name.className = 'fwp-name fwp-file-name';
        name.textContent = node.name;
        name.addEventListener('click', () => this._insertPath(node.path));
        row.appendChild(name);
      }

      li.appendChild(row);

      if (node.isDir && node.children && node.children.length > 0) {
        const childUl = this._buildTreeDOM(node.children);
        li.appendChild(childUl);
      }

      ul.appendChild(li);
    }

    return ul;
  }

  _insertPath(filePath) {
    wsService.sendTerminalInput(this.sessionId, filePath);
    if (this.onInsert) this.onInsert();
  }

  // ── Quick Commands ──────────────────────────────────────────────
  _renderCommands() {
    if (!this.cmdsEl) return;
    const commands = loadCommands(this.agentType);
    this.cmdsEl.innerHTML = '';

    // "+ ADD" row
    const addRow = document.createElement('div');
    addRow.className = 'fwp-cmd-add-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'fwp-cmd-add-btn';
    addBtn.textContent = '+ ADD';
    addBtn.addEventListener('click', () => this._showAddForm());
    addRow.appendChild(addBtn);
    this.cmdsEl.appendChild(addRow);

    // Command list
    const list = document.createElement('div');
    list.className = 'fwp-cmd-list';
    for (const cmd of commands) {
      list.appendChild(this._buildCmdItem(cmd));
    }
    this.cmdsEl.appendChild(list);
  }

  _buildCmdItem(cmd) {
    const item = document.createElement('div');
    item.className = 'fwp-cmd-item';

    const label = document.createElement('span');
    label.className = 'fwp-cmd-label';
    label.textContent = cmd.label;
    label.title = cmd.command;
    label.addEventListener('click', () => {
      wsService.sendTerminalInput(this.sessionId, cmd.command);
      if (this.onInsert) this.onInsert();
    });

    const del = document.createElement('button');
    del.className = 'fwp-cmd-del';
    del.textContent = '\u00d7'; // ×
    del.title = 'Delete';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      this._deleteCommand(cmd.id);
    });

    item.appendChild(label);
    item.appendChild(del);
    return item;
  }

  _showAddForm() {
    // Toggle: remove if already open
    const existing = this.cmdsEl.querySelector('.fwp-cmd-form');
    if (existing) { existing.remove(); return; }

    const form = document.createElement('div');
    form.className = 'fwp-cmd-form';
    form.innerHTML = `
      <input class="fwp-cmd-input" placeholder="Label" data-field="label" />
      <input class="fwp-cmd-input" placeholder="Command" data-field="command" />
      <div class="fwp-cmd-form-actions">
        <button class="fwp-cmd-save">SAVE</button>
        <button class="fwp-cmd-cancel">ESC</button>
      </div>
    `;

    const labelInput = form.querySelector('[data-field="label"]');
    const cmdInput = form.querySelector('[data-field="command"]');

    const save = () => {
      const l = labelInput.value.trim();
      const c = cmdInput.value.trim();
      if (l && c) { this._addCommand(l, c); form.remove(); }
    };

    form.querySelector('.fwp-cmd-save').addEventListener('click', save);
    form.querySelector('.fwp-cmd-cancel').addEventListener('click', () => form.remove());

    // Keyboard: Enter to advance / save, Escape to close
    // stopPropagation prevents xterm from swallowing keystrokes
    labelInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') cmdInput.focus();
      if (e.key === 'Escape') form.remove();
    });
    cmdInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') form.remove();
    });

    const addRow = this.cmdsEl.querySelector('.fwp-cmd-add-row');
    addRow.after(form);
    labelInput.focus();
  }

  _addCommand(label, command) {
    const commands = loadCommands(this.agentType);
    commands.push({ id: _id(), label, command });
    saveCommands(this.agentType, commands);
    this._renderCommands();
  }

  _deleteCommand(id) {
    const commands = loadCommands(this.agentType).filter((c) => c.id !== id);
    saveCommands(this.agentType, commands);
    this._renderCommands();
  }

  // ── Cleanup ─────────────────────────────────────────────────────
  destroy() {
    if (this.unsubTree) { this.unsubTree(); this.unsubTree = null; }
    if (this.unsubFiles) { this.unsubFiles(); this.unsubFiles = null; }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    this.treeEl = null;
    this.cmdsEl = null;
  }
}
