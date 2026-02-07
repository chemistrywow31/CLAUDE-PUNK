/**
 * Files tab — displays directory tree with collapsible folders.
 * Requests file tree from backend when activated.
 */

import wsService from '../services/websocket.js';

export default class FilesTab {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.el = null;
    this.treeEl = null;
    this.fileCount = 0;
    this.drinkCount = 0;
    this.unsubFiles = null;
    this.unsubTree = null;
  }

  render(container) {
    this.el = document.createElement('div');
    this.el.className = 'files-tab';
    this.el.innerHTML = `
      <div class="files-header">
        <span class="files-count">${this.fileCount} files → ${this.drinkCount} drinks</span>
        <button class="files-refresh" title="Refresh">↻</button>
      </div>
      <div class="files-tree"></div>
    `;
    container.appendChild(this.el);
    this.treeEl = this.el.querySelector('.files-tree');

    this.el.querySelector('.files-refresh').addEventListener('click', () => {
      this.requestTree();
    });

    // Listen for tree response
    this.unsubTree = wsService.on('files.tree', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.renderTree(payload.tree);
    });

    // Listen for file count updates
    this.unsubFiles = wsService.on('files.update', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.fileCount = payload.fileCount;
      this.drinkCount = payload.drinkCount;
      const countEl = this.el.querySelector('.files-count');
      if (countEl) {
        countEl.textContent = `${this.fileCount} files → ${this.drinkCount} drinks`;
      }
    });

    // Request tree on render
    this.requestTree();
  }

  requestTree() {
    this.treeEl.innerHTML = '<div class="files-loading">Loading...</div>';
    wsService.requestFileTree(this.sessionId);
  }

  renderTree(nodes) {
    if (!this.treeEl) return;
    this.treeEl.innerHTML = '';
    if (!nodes || nodes.length === 0) {
      this.treeEl.innerHTML = '<div class="files-empty">No files</div>';
      return;
    }
    const ul = this.buildTreeDOM(nodes);
    this.treeEl.appendChild(ul);
  }

  buildTreeDOM(nodes) {
    const ul = document.createElement('ul');
    ul.className = 'file-list';

    for (const node of nodes) {
      const li = document.createElement('li');
      li.className = node.isDir ? 'file-node dir' : 'file-node file';

      const label = document.createElement('span');
      label.className = 'file-label';

      if (node.isDir) {
        label.textContent = `▸ ${node.name}/`;
        label.addEventListener('click', () => {
          li.classList.toggle('expanded');
          label.textContent = li.classList.contains('expanded')
            ? `▾ ${node.name}/`
            : `▸ ${node.name}/`;
        });
      } else {
        const size = this.formatSize(node.size || 0);
        label.textContent = `  ${node.name}`;
        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = size;
        label.appendChild(sizeSpan);
      }

      li.appendChild(label);

      if (node.isDir && node.children && node.children.length > 0) {
        const childUl = this.buildTreeDOM(node.children);
        li.appendChild(childUl);
      }

      ul.appendChild(li);
    }

    return ul;
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  }

  destroy() {
    if (this.unsubTree) this.unsubTree();
    if (this.unsubFiles) this.unsubFiles();
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
