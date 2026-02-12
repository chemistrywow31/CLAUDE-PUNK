/**
 * Files tab — split layout with directory tree sidebar (left) and
 * FileEditor pane (right) for viewing/editing files.
 */

import wsService from '../services/websocket.js';
import FileEditor from './FileEditor.js';
import { createResizeHandle } from './resizeHandle.js';
import { downloadBase64File } from './downloadHelper.js';

export default class FilesTab {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.el = null;
    this.treeEl = null;
    this.fileCount = 0;
    this.drinkCount = 0;
    this.unsubFiles = null;
    this.unsubTree = null;
    this.unsubCreated = null;
    this.unsubDeleted = null;
    this.unsubUploaded = null;
    this.unsubDownloadReady = null;
    this.fileEditor = null;
    this.selectedNode = null;
    this.treeData = null;
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
        <div class="files-header-actions">
          <button class="files-upload" title="Upload files">\u2191</button>
          <button class="files-new-file" title="New File">+</button>
          <button class="files-new-dir" title="New Folder">+\u25a1</button>
          <button class="files-refresh" title="Refresh">\u21bb</button>
        </div>
      </div>
      <div class="files-tree"></div>
      <div class="files-upload-status hidden"></div>
    `;
    this.el.appendChild(sidebar);

    // Hidden file input for upload
    this._fileInput = document.createElement('input');
    this._fileInput.type = 'file';
    this._fileInput.multiple = true;
    this._fileInput.style.display = 'none';
    this.el.appendChild(this._fileInput);

    this._fileInput.addEventListener('change', () => {
      if (this._fileInput.files.length > 0) {
        this._handleFiles(this._fileInput.files);
        this._fileInput.value = '';
      }
    });

    // Resize handle between sidebar and editor
    const resizeHandle = createResizeHandle({
      direction: 'horizontal',
      target: sidebar,
      property: 'width',
      min: 150,
      max: 500,
      storageKey: 'claudePunk_filesSidebarWidth',
    });
    this.el.appendChild(resizeHandle);

    // Right editor pane
    this.fileEditor = new FileEditor(this.sessionId);
    this.fileEditor.render(this.el);

    container.appendChild(this.el);
    this.treeEl = sidebar.querySelector('.files-tree');

    sidebar.querySelector('.files-refresh').addEventListener('click', () => {
      this.requestTree();
    });

    sidebar.querySelector('.files-new-file').addEventListener('click', () => {
      this.showCreateInput(false);
    });

    sidebar.querySelector('.files-new-dir').addEventListener('click', () => {
      this.showCreateInput(true);
    });

    // Upload button
    sidebar.querySelector('.files-upload').addEventListener('click', () => {
      this._fileInput.click();
    });

    // Drag-and-drop on sidebar
    sidebar.addEventListener('dragover', (e) => {
      e.preventDefault();
      sidebar.classList.add('drop-active');
    });
    sidebar.addEventListener('dragleave', (e) => {
      if (!sidebar.contains(e.relatedTarget)) {
        sidebar.classList.remove('drop-active');
      }
    });
    sidebar.addEventListener('drop', (e) => {
      e.preventDefault();
      sidebar.classList.remove('drop-active');
      if (e.dataTransfer.files.length > 0) {
        this._handleFiles(e.dataTransfer.files);
      }
    });

    // Listen for tree response
    this.unsubTree = wsService.on('files.tree', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.treeData = payload.tree;
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

    // Listen for create/delete confirmations and refresh tree
    this.unsubCreated = wsService.on('file.created', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.requestTree();
      // Open newly created file in editor
      if (!payload.isDir) {
        this.fileEditor.openFile(payload.filePath);
      }
    });

    this.unsubDeleted = wsService.on('file.deleted', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      // If the deleted file is currently open, clear editor
      if (this.fileEditor.currentFile === payload.filePath) {
        this.fileEditor.openFile(null);
      }
      this.requestTree();
    });

    // Upload confirmation
    this.unsubUploaded = wsService.on('file.uploaded', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this._showUploadStatus(`Uploaded ${payload.filePath}`, false);
      this.requestTree();
    });

    // Download ready
    this.unsubDownloadReady = wsService.on('file.downloadReady', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      downloadBase64File(payload.filePath, payload.content);
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

      const row = document.createElement('div');
      row.className = 'file-row';

      const label = document.createElement('span');
      label.className = 'file-label';

      // Delete button (shown on hover via CSS)
      const delBtn = document.createElement('button');
      delBtn.className = 'file-delete-btn';
      delBtn.title = `Delete ${node.name}`;
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmDelete(node);
      });

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

      row.appendChild(label);

      // Download button (files only, visible on hover)
      if (!node.isDir) {
        const dlBtn = document.createElement('button');
        dlBtn.className = 'file-download-btn';
        dlBtn.title = `Download ${node.name}`;
        dlBtn.textContent = '\u2193';
        dlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          wsService.downloadFile(this.sessionId, node.path);
        });
        row.appendChild(dlBtn);
      }

      row.appendChild(delBtn);
      li.appendChild(row);

      if (node.isDir && node.children && node.children.length > 0) {
        const childUl = this.buildTreeDOM(node.children);
        li.appendChild(childUl);
      }

      ul.appendChild(li);
    }

    return ul;
  }

  /** Show inline input at top of tree for creating a new file or folder */
  showCreateInput(isDir) {
    // Remove any existing input
    const existing = this.treeEl?.querySelector('.file-create-input');
    if (existing) existing.remove();

    const row = document.createElement('div');
    row.className = 'file-create-input';

    const icon = document.createElement('span');
    icon.className = 'file-create-icon';
    icon.textContent = isDir ? '\u25a1 ' : '+ ';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = isDir ? 'folder/path' : 'path/to/file.ext';
    input.className = 'file-create-field';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'file-create-cancel';
    cancelBtn.textContent = '\u00d7';
    cancelBtn.addEventListener('click', () => row.remove());

    const submit = () => {
      const name = input.value.trim();
      if (!name) { row.remove(); return; }
      wsService.createFile(this.sessionId, name, isDir);
      row.remove();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') row.remove();
    });

    row.appendChild(icon);
    row.appendChild(input);
    row.appendChild(cancelBtn);

    if (this.treeEl) {
      this.treeEl.prepend(row);
      input.focus();
    }
  }

  /** Show delete confirmation overlay */
  confirmDelete(node) {
    // Remove any existing confirmation
    const existing = this.el?.querySelector('.file-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'file-confirm-overlay';

    const typeLabel = node.isDir ? 'folder' : 'file';
    overlay.innerHTML = `
      <div class="file-confirm-box">
        <div class="file-confirm-msg">Delete ${typeLabel} <strong>${node.name}</strong>${node.isDir ? ' and all contents' : ''}?</div>
        <div class="file-confirm-actions">
          <button class="file-confirm-yes">DELETE</button>
          <button class="file-confirm-no">CANCEL</button>
        </div>
      </div>
    `;

    overlay.querySelector('.file-confirm-yes').addEventListener('click', () => {
      wsService.deleteFile(this.sessionId, node.path);
      overlay.remove();
    });
    overlay.querySelector('.file-confirm-no').addEventListener('click', () => {
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    this.el.appendChild(overlay);
  }

  /** Handle file uploads from input or drag-drop */
  _handleFiles(fileList) {
    const BINARY_EXTS = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg',
      'pdf', 'zip', 'gz', 'tar', 'woff', 'woff2', 'ttf', 'otf',
      'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov',
    ]);

    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase();
      const isBinary = BINARY_EXTS.has(ext);

      this._showUploadStatus(`Uploading ${file.name}...`, false);

      const reader = new FileReader();
      reader.onload = () => {
        let content, encoding;
        if (isBinary) {
          // readAsDataURL returns "data:mime;base64,XXXXX" — strip prefix
          const dataUrl = reader.result;
          content = dataUrl.split(',')[1];
          encoding = 'base64';
        } else {
          content = reader.result;
          encoding = 'utf-8';
        }
        wsService.uploadFile(this.sessionId, file.name, content, encoding);
      };
      reader.onerror = () => {
        this._showUploadStatus(`Failed to read ${file.name}`, true);
      };

      if (isBinary) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    }
  }

  /** Show upload status bar at bottom of sidebar */
  _showUploadStatus(message, isError) {
    const statusEl = this.el?.querySelector('.files-upload-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('hidden');
    statusEl.style.color = isError ? '#ff0080' : '#00f0ff';
    clearTimeout(this._uploadStatusTimer);
    this._uploadStatusTimer = setTimeout(() => {
      statusEl.classList.add('hidden');
    }, 3000);
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  }

  destroy() {
    if (this.unsubTree) this.unsubTree();
    if (this.unsubFiles) this.unsubFiles();
    if (this.unsubCreated) this.unsubCreated();
    if (this.unsubDeleted) this.unsubDeleted();
    if (this.unsubUploaded) this.unsubUploaded();
    if (this.unsubDownloadReady) this.unsubDownloadReady();
    if (this._uploadStatusTimer) clearTimeout(this._uploadStatusTimer);
    if (this.fileEditor) this.fileEditor.destroy();
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
