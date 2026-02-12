/**
 * FileEditor — Monaco editor wrapper with cyberpunk theme for viewing/editing files.
 * Supports:
 *  - Text files: syntax-highlighted code via Monaco
 *  - Images: inline preview (pixelated for pixel art)
 *  - Markdown: rendered preview with cyberpunk styling
 *  - HTML/SVG: sandboxed iframe preview
 *  - CODE/PREVIEW toggle for previewable file types
 */

import * as monaco from 'monaco-editor';
import { marked } from 'marked';
import wsService from '../services/websocket.js';
import { downloadBase64File } from './downloadHelper.js';

// Monaco worker setup via Vite ESM
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Register cyberpunk theme once
let themeRegistered = false;
function ensureTheme() {
  if (themeRegistered) return;
  themeRegistered = true;
  monaco.editor.defineTheme('cyberpunk', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '4a4a5e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff0080' },
      { token: 'string', foreground: 'ffaa00' },
      { token: 'number', foreground: '00f0ff' },
      { token: 'type', foreground: '8040c0' },
      { token: 'function', foreground: '00f0ff' },
      { token: 'variable', foreground: 'e0e0e0' },
      { token: 'operator', foreground: 'ff0080' },
    ],
    colors: {
      'editor.background': '#0a0a14',
      'editor.foreground': '#e0e0e0',
      'editor.lineHighlightBackground': '#1a1a2e',
      'editor.selectionBackground': '#00f0ff33',
      'editorCursor.foreground': '#00f0ff',
      'editorLineNumber.foreground': '#4a4a5e',
      'editorLineNumber.activeForeground': '#00f0ff',
      'editor.selectionHighlightBackground': '#00f0ff1a',
      'editorWidget.background': '#1a1a2e',
      'editorWidget.border': '#00f0ff44',
      'scrollbar.shadow': '#0a0a14',
      'scrollbarSlider.background': '#4a4a5e44',
      'scrollbarSlider.hoverBackground': '#00f0ff44',
      'scrollbarSlider.activeBackground': '#00f0ff66',
    },
  });
}

/** Map file extension to Monaco language */
function detectLanguage(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', jsonc: 'json',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', less: 'less',
    md: 'markdown',
    py: 'python',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    yml: 'yaml', yaml: 'yaml',
    xml: 'xml', svg: 'xml',
    sql: 'sql',
    go: 'go',
    rs: 'rust',
    c: 'c', h: 'c',
    cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    toml: 'ini',
    ini: 'ini',
    dockerfile: 'dockerfile',
  };
  return map[ext] || 'plaintext';
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp']);
const PREVIEW_EXTS = new Set(['md', 'markdown', 'html', 'htm', 'svg']);

/** Cyberpunk CSS injected into markdown preview and HTML iframe */
const PREVIEW_CSS = `
  body {
    background: #0a0a14;
    color: #e0e0e0;
    font-family: 'JetBrains Mono', 'Menlo', monospace;
    font-size: 13px;
    line-height: 1.6;
    padding: 16px 24px;
    margin: 0;
  }
  h1, h2, h3, h4, h5, h6 {
    color: #00f0ff;
    border-bottom: 1px solid #00f0ff33;
    padding-bottom: 4px;
    margin-top: 24px;
  }
  h1 { font-size: 1.8em; }
  h2 { font-size: 1.4em; }
  h3 { font-size: 1.2em; }
  a { color: #ff0080; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    background: #1a1a2e;
    color: #ffaa00;
    padding: 2px 6px;
    border-radius: 2px;
    font-size: 0.9em;
  }
  pre {
    background: #1a1a2e;
    border: 1px solid #00f0ff22;
    padding: 12px;
    overflow-x: auto;
    border-radius: 2px;
  }
  pre code {
    background: none;
    padding: 0;
    color: #e0e0e0;
  }
  blockquote {
    border-left: 3px solid #8040c0;
    margin-left: 0;
    padding-left: 16px;
    color: #8888aa;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
  }
  th, td {
    border: 1px solid #4a4a5e;
    padding: 6px 10px;
    text-align: left;
  }
  th {
    background: #1a1a2e;
    color: #00f0ff;
  }
  tr:nth-child(even) {
    background: #0e0e1a;
  }
  img {
    max-width: 100%;
    image-rendering: pixelated;
  }
  hr {
    border: none;
    border-top: 1px solid #00f0ff33;
    margin: 20px 0;
  }
  ul, ol { padding-left: 24px; }
  li { margin: 4px 0; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0a0a14; }
  ::-webkit-scrollbar-thumb { background: #4a4a5e; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #00f0ff; }
`;

export default class FileEditor {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.el = null;
    this.editor = null;
    this.currentFile = null;
    this.currentContent = null;
    this.readOnly = true;
    this.showingPreview = false;
    this.toolbar = null;
    this.editorContainer = null;
    this.previewContainer = null;
    this.unsubContent = null;
    this.unsubSaved = null;
    this.unsubDownloadReady = null;
  }

  render(container) {
    this.el = document.createElement('div');
    this.el.className = 'file-editor';

    this.el.innerHTML = `
      <div class="fe-toolbar">
        <span class="fe-filename">No file selected</span>
        <div class="fe-actions">
          <button class="fe-download hidden" title="Download file">DOWNLOAD</button>
          <button class="fe-toggle-preview hidden" title="Toggle preview">PREVIEW</button>
          <button class="fe-toggle-edit" title="Toggle edit mode">READ-ONLY</button>
          <button class="fe-save hidden" title="Save file">SAVE</button>
        </div>
      </div>
      <div class="fe-editor-container"></div>
      <div class="fe-preview-container hidden"></div>
    `;

    container.appendChild(this.el);

    this.toolbar = this.el.querySelector('.fe-toolbar');
    this.editorContainer = this.el.querySelector('.fe-editor-container');
    this.previewContainer = this.el.querySelector('.fe-preview-container');

    // Toggle preview
    this.el.querySelector('.fe-toggle-preview').addEventListener('click', () => {
      this.togglePreview();
    });

    // Toggle edit mode
    this.el.querySelector('.fe-toggle-edit').addEventListener('click', () => {
      this.toggleEditMode();
    });

    // Save
    this.el.querySelector('.fe-save').addEventListener('click', () => {
      this.save();
    });

    // Download
    this.el.querySelector('.fe-download').addEventListener('click', () => {
      if (this.currentFile) {
        wsService.downloadFile(this.sessionId, this.currentFile);
      }
    });

    // Listen for file content responses
    this.unsubContent = wsService.on('file.content', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      if (payload.filePath !== this.currentFile) return;
      this._handleContent(payload);
    });

    this.unsubSaved = wsService.on('file.saved', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      if (payload.filePath !== this.currentFile) return;
      const saveBtn = this.el.querySelector('.fe-save');
      saveBtn.textContent = 'SAVED';
      setTimeout(() => { saveBtn.textContent = 'SAVE'; }, 1500);
    });

    this.unsubDownloadReady = wsService.on('file.downloadReady', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      downloadBase64File(payload.filePath, payload.content);
    });
  }

  openFile(filePath) {
    this.currentFile = filePath;
    this.currentContent = null;
    this.readOnly = true;
    this.showingPreview = false;

    const filenameEl = this.el.querySelector('.fe-filename');

    if (!filePath) {
      filenameEl.textContent = 'No file selected';
      filenameEl.title = '';
      this.el.querySelector('.fe-toggle-edit').classList.add('hidden');
      this.el.querySelector('.fe-toggle-preview').classList.add('hidden');
      this.el.querySelector('.fe-save').classList.add('hidden');
      this.el.querySelector('.fe-download').classList.add('hidden');
      this._showEditorMode();
      if (this.editor) { this.editor.setValue(''); }
      return;
    }

    filenameEl.textContent = filePath;
    filenameEl.title = filePath;

    // Reset buttons
    const toggleEdit = this.el.querySelector('.fe-toggle-edit');
    const togglePreview = this.el.querySelector('.fe-toggle-preview');
    toggleEdit.textContent = 'READ-ONLY';
    this.el.querySelector('.fe-save').classList.add('hidden');
    this.el.querySelector('.fe-download').classList.remove('hidden');

    // Check file type
    const ext = filePath.split('.').pop().toLowerCase();

    if (IMAGE_EXTS.has(ext)) {
      // Pure image — no code view, just preview
      toggleEdit.classList.add('hidden');
      togglePreview.classList.add('hidden');
      this._showImagePreview();
    } else if (PREVIEW_EXTS.has(ext)) {
      // Previewable text — default to preview mode
      toggleEdit.classList.remove('hidden');
      togglePreview.classList.remove('hidden');
      togglePreview.textContent = 'CODE';
      this.showingPreview = true;
      this._showRichPreview();
    } else {
      // Regular text — code only
      toggleEdit.classList.remove('hidden');
      togglePreview.classList.add('hidden');
      this._showEditorMode();
    }

    wsService.readFile(this.sessionId, filePath);
  }

  _handleContent(payload) {
    const ext = payload.filePath.split('.').pop().toLowerCase();

    if (payload.fileType === 'image') {
      const mime = ext === 'gif' ? 'image/gif'
        : ext === 'webp' ? 'image/webp'
        : ext === 'png' ? 'image/png'
        : 'image/jpeg';
      this.previewContainer.innerHTML = `<img src="data:${mime};base64,${payload.content}" class="fe-image" />`;
      return;
    }

    // Store text content for toggling between code/preview
    this.currentContent = payload.content;

    if (this.showingPreview && PREVIEW_EXTS.has(ext)) {
      this._renderRichPreview(payload.content, ext);
    } else {
      const lang = detectLanguage(payload.filePath);
      this._setEditorContent(payload.content, lang);
    }
  }

  // --- View modes ---

  _showEditorMode() {
    this.editorContainer.classList.remove('hidden');
    this.previewContainer.classList.add('hidden');
    this.previewContainer.innerHTML = '';
  }

  _showImagePreview() {
    this.editorContainer.classList.add('hidden');
    this.previewContainer.classList.remove('hidden');
    this.el.querySelector('.fe-toggle-edit').classList.add('hidden');
    this.el.querySelector('.fe-save').classList.add('hidden');
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }

  _showRichPreview() {
    this.editorContainer.classList.add('hidden');
    this.previewContainer.classList.remove('hidden');
  }

  // --- Preview rendering ---

  _renderRichPreview(content, ext) {
    this.previewContainer.innerHTML = '';

    if (ext === 'md' || ext === 'markdown') {
      this._renderMarkdown(content);
    } else if (ext === 'html' || ext === 'htm') {
      this._renderHTML(content);
    } else if (ext === 'svg') {
      this._renderSVG(content);
    }
  }

  _renderMarkdown(content) {
    const html = marked.parse(content);
    const iframe = document.createElement('iframe');
    iframe.className = 'fe-preview-iframe';
    iframe.sandbox = 'allow-same-origin';
    this.previewContainer.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>${PREVIEW_CSS}</style></head><body>${html}</body></html>`);
    doc.close();
  }

  _renderHTML(content) {
    const iframe = document.createElement('iframe');
    iframe.className = 'fe-preview-iframe';
    iframe.sandbox = 'allow-scripts allow-same-origin';
    this.previewContainer.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(content);
    doc.close();
  }

  _renderSVG(content) {
    const iframe = document.createElement('iframe');
    iframe.className = 'fe-preview-iframe';
    iframe.sandbox = 'allow-same-origin';
    this.previewContainer.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>${PREVIEW_CSS} body { display:flex; align-items:center; justify-content:center; min-height:100vh; }</style></head><body>${content}</body></html>`);
    doc.close();
  }

  // --- Toggle preview <-> code ---

  togglePreview() {
    this.showingPreview = !this.showingPreview;
    const btn = this.el.querySelector('.fe-toggle-preview');

    if (this.showingPreview) {
      btn.textContent = 'CODE';
      this._showRichPreview();
      if (this.currentContent) {
        const ext = this.currentFile.split('.').pop().toLowerCase();
        // If editor is dirty, use its value
        const content = this.editor ? this.editor.getValue() : this.currentContent;
        this._renderRichPreview(content, ext);
      }
    } else {
      btn.textContent = 'PREVIEW';
      this._showEditorMode();
      if (this.currentContent) {
        const lang = detectLanguage(this.currentFile);
        // Sync from editor if it exists, otherwise from stored content
        const content = this.editor ? this.editor.getValue() : this.currentContent;
        this._setEditorContent(content, lang);
      }
    }
  }

  // --- Monaco editor ---

  _setEditorContent(content, language) {
    ensureTheme();

    if (this.editor) {
      this.editor.setValue(content);
      monaco.editor.setModelLanguage(this.editor.getModel(), language);
      this.editor.updateOptions({ readOnly: this.readOnly });
    } else {
      this.editor = monaco.editor.create(this.editorContainer, {
        value: content,
        language,
        theme: 'cyberpunk',
        readOnly: this.readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line',
        automaticLayout: true,
        lineNumbers: 'on',
        wordWrap: 'on',
        padding: { top: 8 },
      });
    }
  }

  toggleEditMode() {
    this.readOnly = !this.readOnly;
    const toggleBtn = this.el.querySelector('.fe-toggle-edit');
    const saveBtn = this.el.querySelector('.fe-save');
    toggleBtn.textContent = this.readOnly ? 'READ-ONLY' : 'EDITING';
    if (this.readOnly) {
      saveBtn.classList.add('hidden');
    } else {
      saveBtn.classList.remove('hidden');
    }
    if (this.editor) {
      this.editor.updateOptions({ readOnly: this.readOnly });
    }
  }

  save() {
    if (!this.currentFile || !this.editor) return;
    const content = this.editor.getValue();
    wsService.writeFile(this.sessionId, this.currentFile, content);
  }

  destroy() {
    if (this.unsubContent) this.unsubContent();
    if (this.unsubSaved) this.unsubSaved();
    if (this.unsubDownloadReady) this.unsubDownloadReady();
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }
}
