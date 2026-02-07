/**
 * Files tab — split layout with directory tree sidebar (left) and
 * FileEditor pane (right) for viewing/editing files.
 */

import wsService from '../services/websocket.js';
import FileEditor from './FileEditor.js';

export default class FilesTab {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.el = null;
    this.treeEl = null;
    this.fileCount = 0;
    this.drinkCount = 0;
    this.unsubFiles = null;
    this.unsubTree = null;
    this.fileEditor = null;
    this.selectedNode = null;
  }

  render(container) {
    this.el = document.createElement('div');
    this.el.className = 'files-tab';

    // Left sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'files-sidebar';
    sidebar.innerHTML = `
      <div class="files-header">
        <span class="files-count">${this.fileCount} files \u2192 ${this.drinkCount} drinks</span>
        <button class="files-refresh" title="Refresh">\u21bb</button>
      </div>
      <div class="files-tree"></div>
    `;
    this.el.appendChild(sidebar);

    // Right editor pane
    this.fileEditor = new FileEditor(this.sessionId);
    this.fileEditor.render(this.el);

    container.appendChild(this.el);
    this.treeEl = sidebar.querySelector('.files-tree');

    sidebar.querySelector('.files-refresh').addEventListener('click', () => {
      this.requestTree();
    });

    // Listen for tree response
    this.unsubTree = wsService.on('files.tree', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.renderTree(payload.tree);
    });

    // Listen for file count updates and auto-refresh tree
    this.unsubFiles = wsService.on('files.update', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.fileCount = payload.fileCount;
      this.drinkCount = payload.drinkCount;
      const countEl = sidebar.querySelector('.files-count');
      if (countEl) {
        countEl.textContent = `${this.fileCount} files \u2192 ${this.drinkCount} drinks`;
      }
      // Auto-refresh tree when files change (debounced by backend already)
      wsService.requestFileTree(this.sessionId);
    });

    // Request tree on render
    this.requestTree();
  }

  requestTree() {
    if (this.treeEl) {
      this.treeEl.innerHTML = '<div class="files-loading">Loading...</div>';
    }
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
        label.textContent = `\u25b8 ${node.name}/`;
        label.addEventListener('click', () => {
          li.classList.toggle('expanded');
          label.textContent = li.classList.contains('expanded')
            ? `\u25be ${node.name}/`
            : `\u25b8 ${node.name}/`;
        });
      } else {
        const size = this.formatSize(node.size || 0);
        label.textContent = `  ${node.name}`;

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = size;
        label.appendChild(sizeSpan);

        // Click file to open in editor
        label.addEventListener('click', () => {
          // Deselect previous
          if (this.selectedNode) {
            this.selectedNode.classList.remove('selected');
          }
          li.classList.add('selected');
          this.selectedNode = li;
          this.fileEditor.openFile(node.path);
        });
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
    if (this.fileEditor) this.fileEditor.destroy();
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
