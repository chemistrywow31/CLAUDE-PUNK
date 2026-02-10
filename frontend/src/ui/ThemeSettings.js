/**
 * Theme Settings overlay — background selection with tabs.
 */

export default class ThemeSettings {
  constructor() {
    this.overlay = document.getElementById('theme-settings-overlay');
    this.visible = false;
    this.activeTab = 'background';
    this.onShow = null;
    this.onHide = null;
    this._bgOptions = Array.isArray(window.CLAUDE_PUNK_BG_OPTIONS)
      ? window.CLAUDE_PUNK_BG_OPTIONS.slice()
      : [];
    this.init();
  }

  init() {
    this.overlay.innerHTML = `
      <div class="theme-settings-panel cyberpunk-panel">
        <div class="ts-header">
          <span class="ts-title">THEME SETTINGS</span>
          <button class="ts-close">&times;</button>
        </div>
        <div class="ts-body">
          <div class="ts-sidebar">
            <button class="ts-tab active" data-tab="background">Background</button>
          </div>
          <div class="ts-content">
            <div class="ts-tab-panel active" data-tab="background">
              <div class="ts-section-label">BACKGROUND</div>
              <div class="ts-bg-list"></div>
              <div class="ts-bg-empty hidden">No backgrounds found.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.overlay.querySelector('.ts-close').addEventListener('click', () => this.hide());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.overlay.querySelectorAll('.ts-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setActiveTab(btn.dataset.tab);
      });
    });
  }

  show() {
    this.overlay.classList.remove('hidden');
    this.visible = true;
    this.renderBackgroundList();
    if (this.onShow) this.onShow();
  }

  hide() {
    this.overlay.classList.add('hidden');
    this.visible = false;
    if (this.onHide) this.onHide();
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  setActiveTab(tab) {
    this.activeTab = tab;
    this.overlay.querySelectorAll('.ts-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.overlay.querySelectorAll('.ts-tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.tab === tab);
    });
  }

  renderBackgroundList() {
    const list = this.overlay.querySelector('.ts-bg-list');
    const empty = this.overlay.querySelector('.ts-bg-empty');
    list.innerHTML = '';

    if (!this._bgOptions.length) {
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    const current = typeof window.CLAUDE_PUNK_GET_BG === 'function'
      ? window.CLAUDE_PUNK_GET_BG()
      : '';

    this._bgOptions.forEach((bg) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ts-bg-item' + (bg === current ? ' active' : '');
      btn.textContent = bg;
      btn.addEventListener('click', () => {
        if (typeof window.CLAUDE_PUNK_SET_BG === 'function') {
          window.CLAUDE_PUNK_SET_BG(bg);
        }
        this.updateActiveBackground(bg);
      });
      list.appendChild(btn);
    });
  }

  updateActiveBackground(bg) {
    this.overlay.querySelectorAll('.ts-bg-item').forEach((btn) => {
      btn.classList.toggle('active', btn.textContent === bg);
    });
  }
}
