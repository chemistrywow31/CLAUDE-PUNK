/**
 * Folder picker overlay — appears when the bar door is clicked.
 * Server-side directory browser with recent folders, breadcrumb navigation,
 * and manual path entry. Creates a new session on confirm.
 */

import wsService from '../services/websocket.js';

const STORAGE_KEY = 'claude-punk-recent-folders';
const MAX_RECENT = 10;

export default class FolderPicker {
  constructor() {
    this.overlay = document.getElementById('folder-picker-overlay');
    this.onSessionCreated = null;
    this.onShow = null;
    this.onHide = null;
    this.visible = false;
    this.currentPath = '';
    this.loading = false;
    this._onBrowseResult = null;
    this._onBrowseError = null;
    this._labelManuallyEdited = false;
    this.init();
  }

  init() {
    this.overlay.innerHTML = `
      <div class="folder-picker-panel cyberpunk-panel">
        <div class="fp-header">
          <span class="fp-title">NEW PATRON</span>
          <button class="fp-close">&times;</button>
        </div>

        <div class="fp-breadcrumb">
          <button class="fp-back" title="Parent directory">&#9666;</button>
          <div class="fp-breadcrumb-path"></div>
        </div>

        <div class="fp-browser">
          <div class="fp-recent-section hidden">
            <div class="fp-section-label">RECENT FOLDERS</div>
            <div class="fp-recent-list"></div>
          </div>

          <div class="fp-section-label">DIRECTORY</div>
          <div class="fp-listing">
            <div class="fp-loading hidden">Loading...</div>
            <div class="fp-entries"></div>
          </div>
        </div>

        <div class="fp-footer">
          <div class="fp-field">
            <label for="fp-path">Path</label>
            <input type="text" id="fp-path" placeholder="/path/to/project" spellcheck="false" />
          </div>
          <div class="fp-field">
            <label for="fp-label">Name</label>
            <input type="text" id="fp-label" placeholder="optional label" spellcheck="false" />
          </div>
          <div class="fp-agent-select">
            <label class="fp-agent-option">
              <input type="radio" name="fp-agent" value="claude" checked />
              <span class="fp-agent-label fp-agent-claude">Claude Code</span>
            </label>
            <label class="fp-agent-option">
              <input type="radio" name="fp-agent" value="codex" />
              <span class="fp-agent-label fp-agent-codex">Codex</span>
            </label>
          </div>
          <div class="fp-actions">
            <button class="fp-cancel">Cancel</button>
            <button class="fp-confirm">Enter Bar</button>
          </div>
          <div class="fp-error hidden"></div>
        </div>
      </div>
    `;

    // Event: close / cancel
    this.overlay.querySelector('.fp-close').addEventListener('click', () => this.hide());
    this.overlay.querySelector('.fp-cancel').addEventListener('click', () => this.hide());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    // Event: confirm
    this.overlay.querySelector('.fp-confirm').addEventListener('click', () => this.submit());

    // Event: back button
    this.overlay.querySelector('.fp-back').addEventListener('click', () => {
      if (this.currentPath && this.currentPath !== '/') {
        const parent = this.currentPath.replace(/\/[^/]+\/?$/, '') || '/';
        this.navigateTo(parent);
      }
    });

    // Event: path input Enter → navigate browser
    const pathInput = this.overlay.querySelector('#fp-path');
    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = pathInput.value.trim();
        if (val) {
          this.navigateTo(val);
        } else {
          this.submit();
        }
      }
      if (e.key === 'Escape') this.hide();
    });

    const labelInput = this.overlay.querySelector('#fp-label');
    labelInput.addEventListener('input', () => {
      this._labelManuallyEdited = true;
    });
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
      if (e.key === 'Escape') this.hide();
    });
  }

  show() {
    this.overlay.classList.remove('hidden');
    this.visible = true;
    this._labelManuallyEdited = false;
    this.clearError();
    if (this.onShow) this.onShow();

    // Subscribe to browse results
    this._onBrowseResult = (payload) => this.handleBrowseResult(payload);
    this._onBrowseError = (payload) => {
      if (payload.code === 'INVALID_PATH') {
        this.showError(payload.message);
        this.setLoading(false);
      }
    };
    wsService.on('fs.browse.result', this._onBrowseResult);
    wsService.on('error', this._onBrowseError);

    // Render recent folders
    this.renderRecent();

    // Navigate to last-used path or HOME
    const recent = this.getRecentFolders();
    const startPath = recent.length > 0 ? recent[0].path : '';
    // Start with parent of last-used folder (or let backend default to $HOME / %USERPROFILE%)
    // Handles both Unix (/) and Windows (\) path separators
    const browsePath = startPath ? startPath.replace(/[/\\][^/\\]+[/\\]?$/, '') || '' : '';
    this.navigateTo(browsePath);

    // Focus path input
    setTimeout(() => {
      this.overlay.querySelector('#fp-path').focus();
    }, 100);
  }

  hide() {
    this.overlay.classList.add('hidden');
    this.visible = false;
    if (this.onHide) this.onHide();

    // Unsubscribe
    if (this._onBrowseResult) {
      wsService.off('fs.browse.result', this._onBrowseResult);
      this._onBrowseResult = null;
    }
    if (this._onBrowseError) {
      wsService.off('error', this._onBrowseError);
      this._onBrowseError = null;
    }

    // Clear inputs
    this.overlay.querySelector('#fp-path').value = '';
    this.overlay.querySelector('#fp-label').value = '';
    this.clearError();
  }

  navigateTo(dirPath) {
    this.setLoading(true);
    this.clearError();
    wsService.browseDirectory(dirPath);
  }

  handleBrowseResult(payload) {
    this.setLoading(false);
    this.currentPath = payload.path;

    // Update path input
    this.overlay.querySelector('#fp-path').value = payload.path;

    // Auto-fill label from folder name (always sync unless user manually edited)
    const labelInput = this.overlay.querySelector('#fp-label');
    if (!this._labelManuallyEdited) {
      labelInput.value = payload.path.split('/').pop() || '';
    }

    // Render breadcrumb
    this.renderBreadcrumb(payload.path);

    // Render entries
    this.renderEntries(payload.entries);
  }

  renderBreadcrumb(fullPath) {
    const container = this.overlay.querySelector('.fp-breadcrumb-path');
    container.innerHTML = '';

    if (!fullPath) return;

    const parts = fullPath.split('/').filter(Boolean);
    let accumulated = '';

    // Root slash
    const rootSpan = document.createElement('span');
    rootSpan.className = 'fp-crumb';
    rootSpan.textContent = '/';
    rootSpan.addEventListener('click', () => this.navigateTo('/'));
    container.appendChild(rootSpan);

    parts.forEach((part, i) => {
      accumulated += '/' + part;
      const sep = document.createElement('span');
      sep.className = 'fp-crumb-sep';
      sep.textContent = '/';
      container.appendChild(sep);

      const span = document.createElement('span');
      span.className = 'fp-crumb';
      if (i === parts.length - 1) {
        span.classList.add('fp-crumb-current');
      }
      span.textContent = part;
      const target = accumulated;
      span.addEventListener('click', () => this.navigateTo(target));
      container.appendChild(span);
    });
  }

  renderEntries(entries) {
    const container = this.overlay.querySelector('.fp-entries');
    container.innerHTML = '';

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'fp-empty';
      empty.textContent = 'Empty directory';
      container.appendChild(empty);
      return;
    }

    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = entry.isDir ? 'fp-entry fp-entry-dir' : 'fp-entry fp-entry-file';

      const icon = document.createElement('span');
      icon.className = 'fp-entry-icon';
      icon.textContent = entry.isDir ? '\u{1F4C1}' : '\u2500\u2500';

      const name = document.createElement('span');
      name.className = 'fp-entry-name';
      name.textContent = entry.isDir ? entry.name + '/' : entry.name;

      row.appendChild(icon);
      row.appendChild(name);

      if (entry.isDir) {
        row.addEventListener('click', () => {
          const target = this.currentPath === '/'
            ? '/' + entry.name
            : this.currentPath + '/' + entry.name;
          this.navigateTo(target);
        });
      }

      container.appendChild(row);
    });
  }

  renderRecent() {
    const recent = this.getRecentFolders();
    const section = this.overlay.querySelector('.fp-recent-section');
    const list = this.overlay.querySelector('.fp-recent-list');

    if (recent.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    list.innerHTML = '';

    recent.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'fp-recent-item';

      const info = document.createElement('div');
      info.className = 'fp-recent-info';

      const name = document.createElement('span');
      name.className = 'fp-recent-name';
      name.textContent = item.label || item.path.split('/').pop();

      const pathSpan = document.createElement('span');
      pathSpan.className = 'fp-recent-path';
      pathSpan.textContent = item.path;

      info.appendChild(name);
      info.appendChild(pathSpan);

      const delBtn = document.createElement('button');
      delBtn.className = 'fp-recent-delete';
      delBtn.textContent = '\u00d7';
      delBtn.title = 'Remove from recent';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeRecentFolder(item.path);
        this.renderRecent();
      });

      row.appendChild(info);
      row.appendChild(delBtn);

      row.addEventListener('click', () => {
        this.overlay.querySelector('#fp-path').value = item.path;
        this.overlay.querySelector('#fp-label').value = item.label || '';
        this.navigateTo(item.path);
      });

      list.appendChild(row);
    });
  }

  setLoading(on) {
    this.loading = on;
    const loadingEl = this.overlay.querySelector('.fp-loading');
    const entriesEl = this.overlay.querySelector('.fp-entries');
    if (on) {
      loadingEl.classList.remove('hidden');
      entriesEl.classList.add('hidden');
    } else {
      loadingEl.classList.add('hidden');
      entriesEl.classList.remove('hidden');
    }
  }

  showError(msg) {
    const el = this.overlay.querySelector('.fp-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  clearError() {
    const el = this.overlay.querySelector('.fp-error');
    if (el) {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  submit() {
    const pathInput = this.overlay.querySelector('#fp-path');
    const labelInput = this.overlay.querySelector('#fp-label');
    const agentRadio = this.overlay.querySelector('input[name="fp-agent"]:checked');

    const workDir = pathInput.value.trim();
    const label = labelInput.value.trim() || workDir.split(/[/\\]/).pop() || 'session';
    const agentType = agentRadio ? agentRadio.value : 'claude';

    if (!workDir) {
      this.showError('Please enter a working directory path.');
      pathInput.focus();
      return;
    }

    const sent = wsService.createSession(workDir, label, agentType);
    if (!sent) {
      this.showError('Not connected to server. Check if the backend is running.');
      return;
    }

    // Listen for spawn errors before closing the dialog
    const onSpawnError = (payload) => {
      if (payload.code === 'SPAWN_FAILED' || payload.code === 'INVALID_MESSAGE' || payload.code === 'MAX_SESSIONS') {
        console.error(`[FolderPicker] Session creation failed: ${payload.message}`);
        this.show();
        this.showError(payload.message);
        wsService.off('error', onSpawnError);
        wsService.off('session.update', onSpawnSuccess);
      }
    };
    const onSpawnSuccess = () => {
      wsService.off('error', onSpawnError);
      wsService.off('session.update', onSpawnSuccess);
    };
    wsService.on('error', onSpawnError);
    wsService.on('session.update', onSpawnSuccess);

    // Auto-cleanup listener after 5s to avoid memory leak
    setTimeout(() => {
      wsService.off('error', onSpawnError);
      wsService.off('session.update', onSpawnSuccess);
    }, 5000);

    // Save to recent folders
    this.addRecentFolder(workDir, label);

    this.hide();

    if (this.onSessionCreated) {
      this.onSessionCreated({ workDir, label, agentType });
    }
  }

  // --- Recent folders (localStorage) ---

  getRecentFolders() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  addRecentFolder(folderPath, label) {
    let recent = this.getRecentFolders();
    // Remove existing entry with same path
    recent = recent.filter((r) => r.path !== folderPath);
    // Add to front
    recent.unshift({ path: folderPath, label: label || '' });
    // Cap at MAX_RECENT
    if (recent.length > MAX_RECENT) {
      recent = recent.slice(0, MAX_RECENT);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  }

  removeRecentFolder(folderPath) {
    let recent = this.getRecentFolders();
    recent = recent.filter((r) => r.path !== folderPath);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  }
}
