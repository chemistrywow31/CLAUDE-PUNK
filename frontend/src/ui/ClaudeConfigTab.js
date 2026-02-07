/**
 * Claude Config tab — displays .claude directory contents.
 * Shows expandable markdown files from the session's .claude directory.
 */

import wsService from '../services/websocket.js';

export default class ClaudeConfigTab {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.el = null;
    this.listEl = null;
    this.unsubConfig = null;
  }

  render(container) {
    this.el = document.createElement('div');
    this.el.className = 'claude-config-tab';
    this.el.innerHTML = `
      <div class="config-header">
        <span class="config-title">.claude configuration</span>
        <button class="config-refresh" title="Refresh">↻</button>
      </div>
      <div class="config-list"></div>
    `;
    container.appendChild(this.el);
    this.listEl = this.el.querySelector('.config-list');

    this.el.querySelector('.config-refresh').addEventListener('click', () => {
      this.requestConfig();
    });

    this.unsubConfig = wsService.on('claude.config', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.renderConfig(payload.files);
    });

    this.requestConfig();
  }

  requestConfig() {
    this.listEl.innerHTML = '<div class="config-loading">Loading...</div>';
    wsService.requestClaudeConfig(this.sessionId);
  }

  renderConfig(files) {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    if (!files || files.length === 0) {
      this.listEl.innerHTML = '<div class="config-empty">No .claude config found</div>';
      return;
    }

    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'config-item';

      const header = document.createElement('div');
      header.className = 'config-item-header';
      header.textContent = `▸ ${file.name}`;
      header.addEventListener('click', () => {
        item.classList.toggle('expanded');
        header.textContent = item.classList.contains('expanded')
          ? `▾ ${file.name}`
          : `▸ ${file.name}`;
      });

      const content = document.createElement('pre');
      content.className = 'config-item-content';
      content.textContent = file.content;

      item.appendChild(header);
      item.appendChild(content);
      this.listEl.appendChild(item);
    }
  }

  destroy() {
    if (this.unsubConfig) this.unsubConfig();
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
