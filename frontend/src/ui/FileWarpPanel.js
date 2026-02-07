/**
 * FileWarpPanel — left sidebar inside the Terminal tab.
 * Displays a collapsible file tree; clicking a file or folder name
 * inserts its path into the xterm terminal as typed input.
 */

import wsService from '../services/websocket.js';

export default class FileWarpPanel {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.el = null;
    this.treeEl = null;
    this.unsubTree = null;
    this.unsubFiles = null;
  }

  render(container) {
    this.el = document.createElement('div');
    this.el.className = 'file-warp-panel';
    this.el.innerHTML = `
      <div class="fwp-header">
        <span class="fwp-title">FILE WARP</span>
        <button class="fwp-refresh" title="Refresh">&#x21bb;</button>
      </div>
      <div class="fwp-tree"></div>
    `;
    container.appendChild(this.el);
    this.treeEl = this.el.querySelector('.fwp-tree');

    this.el.querySelector('.fwp-refresh').addEventListener('click', () => {
      this.requestTree();
    });

    this.unsubTree = wsService.on('files.tree', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.renderTree(payload.tree);
    });

    // Auto-refresh tree when files change
    this.unsubFiles = wsService.on('files.update', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      wsService.requestFileTree(this.sessionId);
    });

    this.requestTree();
  }

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
        // Toggle button for expand/collapse
        const toggle = document.createElement('span');
        toggle.className = 'fwp-toggle';
        toggle.textContent = '\u25b8'; // ▸
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          li.classList.toggle('expanded');
          toggle.textContent = li.classList.contains('expanded') ? '\u25be' : '\u25b8';
        });
        row.appendChild(toggle);

        // Folder name — click inserts path
        const name = document.createElement('span');
        name.className = 'fwp-name fwp-folder-name';
        name.textContent = node.name + '/';
        name.addEventListener('click', () => {
          this._insertPath(node.path);
        });
        row.appendChild(name);
      } else {
        // Spacer for alignment
        const spacer = document.createElement('span');
        spacer.className = 'fwp-toggle fwp-spacer';
        spacer.textContent = ' ';
        row.appendChild(spacer);

        // File name — click inserts path
        const name = document.createElement('span');
        name.className = 'fwp-name fwp-file-name';
        name.textContent = node.name;
        name.addEventListener('click', () => {
          this._insertPath(node.path);
        });
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
  }

  destroy() {
    if (this.unsubTree) {
      this.unsubTree();
      this.unsubTree = null;
    }
    if (this.unsubFiles) {
      this.unsubFiles();
      this.unsubFiles = null;
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    this.treeEl = null;
  }
}
