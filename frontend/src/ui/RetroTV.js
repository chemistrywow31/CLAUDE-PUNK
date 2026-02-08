/**
 * RetroTV — HTML overlay for YouTube search + playback.
 */

import retroTvPlayer from '../services/retroTvPlayer.js';

export default class RetroTV {
  constructor() {
    this.overlay = document.getElementById('retro-tv-overlay');
    this.visible = false;
    this.onShow = null;
    this.onHide = null;

    this.searchResults = [];
    this.searching = false;
    this.searchError = '';
    this.urlError = '';
    this.searchQuery = '';
    this.searchNextToken = '';
    this.searchPrevToken = '';
    this.searchPageIndex = 1;

    this._build();
    this._bindEvents();

    retroTvPlayer.onChange = () => this._render();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'retro-tv-panel';
    panel.innerHTML = `
      <div class="retro-tv-header">
        <span class="retro-tv-title">Retro TV</span>
        <button class="retro-tv-gear" title="Settings">\u2699</button>
        <button class="retro-tv-close">\u00D7</button>
      </div>
      <div class="retro-tv-settings hidden">
        <div class="retro-tv-settings-card">
          <div class="retro-tv-settings-sidebar">
            <button class="retro-tv-settings-tab active" data-tab="api">API Key</button>
          </div>
          <div class="retro-tv-settings-content">
            <div class="retro-tv-settings-header">
              <span>Settings</span>
              <button class="retro-tv-settings-close">\u00D7</button>
            </div>
            <div class="retro-tv-settings-panel" data-panel="api">
              <div class="retro-tv-section-title">YouTube API Key</div>
              <div class="retro-tv-url-row">
                <input class="retro-tv-input retro-tv-api-input" type="password" placeholder="YouTube API Key" />
                <button class="retro-tv-action retro-tv-api-btn">Set</button>
                <button class="retro-tv-action retro-tv-api-remove">Remove</button>
              </div>
              <div class="retro-tv-hint retro-tv-api-hint"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="retro-tv-body">
        <div class="retro-tv-main">
          <div class="retro-tv-screen">
            <div id="retro-tv-player"></div>
          </div>
          <div class="retro-tv-now-playing">No video loaded</div>
          <div class="retro-tv-controls">
            <button class="retro-tv-btn retro-tv-prev" title="Previous">\u23EE</button>
            <button class="retro-tv-btn retro-tv-play" title="Play / Pause">\u25B6</button>
            <button class="retro-tv-btn retro-tv-next" title="Next">\u23ED</button>
            <button class="retro-tv-btn retro-tv-loop" title="Loop Mode">ALL</button>
            <div class="retro-tv-progress">
              <span class="retro-tv-time retro-tv-time-current">0:00</span>
              <input type="range" min="0" max="100" value="0" />
              <span class="retro-tv-time retro-tv-time-duration">0:00</span>
            </div>
            <div class="retro-tv-volume">
              <label>VOL</label>
              <input type="range" min="0" max="100" value="60" />
            </div>
          </div>
          <div class="retro-tv-section">
            <div class="retro-tv-section-title">Add by URL / ID</div>
            <div class="retro-tv-url-row">
              <input class="retro-tv-input retro-tv-url-input" type="text" placeholder="https://youtu.be/... or Video ID" />
              <button class="retro-tv-action retro-tv-url-btn">Add</button>
            </div>
            <div class="retro-tv-error retro-tv-url-error"></div>
          </div>
          <div class="retro-tv-section">
            <div class="retro-tv-section-title">YouTube Search</div>
            <div class="retro-tv-search-row">
              <input class="retro-tv-input retro-tv-search-input" type="text" placeholder="Search YouTube..." />
              <button class="retro-tv-action retro-tv-search-btn">Search</button>
            </div>
            <div class="retro-tv-hint retro-tv-search-hint"></div>
            <div class="retro-tv-error retro-tv-search-error"></div>
            <div class="retro-tv-results"></div>
            <div class="retro-tv-pagination is-hidden">
              <button class="retro-tv-btn retro-tv-page-prev">Prev</button>
              <span class="retro-tv-page-label">Page 1</span>
              <button class="retro-tv-btn retro-tv-page-next">Next</button>
            </div>
          </div>
        </div>
        <div class="retro-tv-sidebar">
          <div class="retro-tv-section-title">Playlist</div>
          <div class="retro-tv-playlist"></div>
        </div>
      </div>
    `;

    this.overlay.appendChild(panel);
    this.panel = panel;
  }

  _bindEvents() {
    this.panel.querySelector('.retro-tv-close').addEventListener('click', () => this.hide());
    this.panel.querySelector('.retro-tv-gear').addEventListener('click', () => {
      this._toggleSettings();
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.panel.querySelector('.retro-tv-play').addEventListener('click', () => {
      if (retroTvPlayer.playing) {
        retroTvPlayer.pause();
      } else {
        retroTvPlayer.play();
      }
    });

    this.panel.querySelector('.retro-tv-prev').addEventListener('click', () => {
      retroTvPlayer.prev();
    });

    this.panel.querySelector('.retro-tv-next').addEventListener('click', () => {
      retroTvPlayer.next();
    });

    this.panel.querySelector('.retro-tv-loop').addEventListener('click', () => {
      retroTvPlayer.toggleLoopMode();
    });

    this.panel.querySelector('.retro-tv-volume input').addEventListener('input', (e) => {
      retroTvPlayer.setVolume(parseInt(e.target.value, 10) / 100);
    });

    this.panel.querySelector('.retro-tv-progress input').addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10) / 100;
      const seekTo = retroTvPlayer.duration * pct;
      if (Number.isFinite(seekTo)) {
        retroTvPlayer.seekTo(seekTo);
      }
    });

    const searchInput = this.panel.querySelector('.retro-tv-search-input');
    const searchBtn = this.panel.querySelector('.retro-tv-search-btn');
    const apiInput = this.panel.querySelector('.retro-tv-api-input');
    const apiBtn = this.panel.querySelector('.retro-tv-api-btn');
    const apiRemove = this.panel.querySelector('.retro-tv-api-remove');
    const settingsClose = this.panel.querySelector('.retro-tv-settings-close');

    searchBtn.addEventListener('click', () => {
      this._runSearch();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._runSearch();
      }
    });

    apiBtn.addEventListener('click', () => {
      this._setApiKey();
    });

    apiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._setApiKey();
      }
    });

    apiRemove.addEventListener('click', () => {
      retroTvPlayer.setApiKey('');
      this._render();
    });

    settingsClose.addEventListener('click', () => {
      this._toggleSettings(false);
    });

    const urlInput = this.panel.querySelector('.retro-tv-url-input');
    const urlBtn = this.panel.querySelector('.retro-tv-url-btn');

    urlBtn.addEventListener('click', () => {
      this._addFromUrl();
    });

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._addFromUrl();
      }
    });

    this.panel.querySelector('.retro-tv-page-prev').addEventListener('click', () => {
      if (this.searchPrevToken) {
        this.searchPageIndex = Math.max(1, this.searchPageIndex - 1);
        this._runSearch(this.searchPrevToken);
      }
    });

    this.panel.querySelector('.retro-tv-page-next').addEventListener('click', () => {
      if (this.searchNextToken) {
        this.searchPageIndex += 1;
        this._runSearch(this.searchNextToken);
      }
    });
  }

  async _runSearch(pageToken = '') {
    const input = this.panel.querySelector('.retro-tv-search-input');
    const query = input.value.trim();
    if (!query) return;

    this.searchError = '';
    this.urlError = '';

    if (query !== this.searchQuery && !pageToken) {
      this.searchPageIndex = 1;
    }

    if (!retroTvPlayer.hasApiKey()) {
      this.searchError = 'YouTube API Key 尚未設定';
      this.searchResults = [];
      this.searchNextToken = '';
      this.searchPrevToken = '';
      this._render();
      return;
    }

    this.searching = true;
    this.searchResults = [];
    this.searchNextToken = '';
    this.searchPrevToken = '';
    this.searchQuery = query;
    this._render();

    try {
      const result = await retroTvPlayer.search(query, pageToken);
      this.searchResults = result.items;
      this.searchNextToken = result.nextPageToken;
      this.searchPrevToken = result.prevPageToken;
      if (result.items.length === 0) {
        this.searchError = '沒有找到結果';
      }
    } catch (e) {
      this.searchError = '搜尋失敗，請稍後再試';
    } finally {
      this.searching = false;
      this._render();
    }
  }

  _setApiKey() {
    const input = this.panel.querySelector('.retro-tv-api-input');
    const value = input.value.trim();
    retroTvPlayer.setApiKey(value);
    input.value = '';
    this._render();
  }

  _toggleSettings(force) {
    const settings = this.panel.querySelector('.retro-tv-settings');
    const show = typeof force === 'boolean' ? force : settings.classList.contains('hidden');
    settings.classList.toggle('hidden', !show);
  }

  async _addFromUrl() {
    const input = this.panel.querySelector('.retro-tv-url-input');
    const value = input.value.trim();
    if (!value) return;

    const result = await retroTvPlayer.addFromUrl(value);
    if (!result.ok) {
      this.urlError = result.error || '無法加入該影片';
    } else {
      this.urlError = '';
      input.value = '';
    }
    this._render();
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  async show() {
    this.visible = true;
    this.overlay.classList.remove('hidden');
    await retroTvPlayer.ensurePlayers('retro-tv-player');
    this._render();
    if (this.onShow) this.onShow();
  }

  hide() {
    this.visible = false;
    this.overlay.classList.add('hidden');
    if (this.onHide) this.onHide();
  }

  _render() {
    if (!this.visible) return;

    const track = retroTvPlayer.getCurrentTrack();
    const npEl = this.panel.querySelector('.retro-tv-now-playing');
    if (track) {
      const status = retroTvPlayer.playing ? 'Playing' : 'Paused';
      npEl.innerHTML = `${status}: <span class="track-name">${this._esc(track.title)}</span>`;
    } else {
      npEl.textContent = 'No video loaded';
    }

    const playBtn = this.panel.querySelector('.retro-tv-play');
    playBtn.textContent = retroTvPlayer.playing ? '\u23F8' : '\u25B6';
    playBtn.title = retroTvPlayer.playing ? 'Pause' : 'Play';

    const loopBtn = this.panel.querySelector('.retro-tv-loop');
    if (retroTvPlayer.loopMode === 'single') {
      loopBtn.textContent = 'ONE';
      loopBtn.title = 'Loop One';
      loopBtn.classList.add('active');
    } else {
      loopBtn.textContent = 'ALL';
      loopBtn.title = 'Loop All';
      loopBtn.classList.remove('active');
    }

    const progress = this.panel.querySelector('.retro-tv-progress input');
    const duration = retroTvPlayer.duration || 0;
    const current = retroTvPlayer.currentTime || 0;
    const pct = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
    progress.value = String(Math.round(pct));

    this.panel.querySelector('.retro-tv-time-current').textContent = this._fmtTime(current);
    this.panel.querySelector('.retro-tv-time-duration').textContent = this._fmtTime(duration);

    this.panel.querySelector('.retro-tv-volume input').value = String(Math.round(retroTvPlayer.volume * 100));

    const searchInput = this.panel.querySelector('.retro-tv-search-input');
    const searchBtn = this.panel.querySelector('.retro-tv-search-btn');
    const searchHint = this.panel.querySelector('.retro-tv-search-hint');
    const searchErr = this.panel.querySelector('.retro-tv-search-error');
    const resultsEl = this.panel.querySelector('.retro-tv-results');
    const apiHint = this.panel.querySelector('.retro-tv-api-hint');
    const paginationEl = this.panel.querySelector('.retro-tv-pagination');
    const pageLabel = this.panel.querySelector('.retro-tv-page-label');
    const pagePrev = this.panel.querySelector('.retro-tv-page-prev');
    const pageNext = this.panel.querySelector('.retro-tv-page-next');

    if (!retroTvPlayer.hasApiKey()) {
      searchInput.disabled = true;
      searchBtn.disabled = true;
      searchHint.textContent = '需要設定 API Key 才能搜尋';
      apiHint.textContent = 'Set API key to enable search';
      apiHint.classList.remove('active');
      searchHint.classList.add('warning');
    } else {
      searchInput.disabled = false;
      searchBtn.disabled = false;
      searchHint.textContent = this.searching ? '搜尋中...' : '';
      apiHint.textContent = 'API key is set';
      apiHint.classList.add('active');
      searchHint.classList.remove('warning');
    }

    searchErr.textContent = this.searchError || '';

    if (this.searchResults.length > 0) {
      resultsEl.innerHTML = this.searchResults.map((item, idx) => {
        return `
          <div class="retro-tv-result" data-index="${idx}">
            <div class="retro-tv-result-info">
              <div class="retro-tv-result-title">${this._esc(item.title)}</div>
              <div class="retro-tv-result-channel">${this._esc(item.channelTitle || '')}</div>
            </div>
            <button class="retro-tv-result-action">Add</button>
          </div>
        `;
      }).join('');

      resultsEl.querySelectorAll('.retro-tv-result').forEach((el) => {
        const idx = parseInt(el.dataset.index, 10);
        const btn = el.querySelector('.retro-tv-result-action');
        btn.addEventListener('click', async () => {
          const item = this.searchResults[idx];
          await retroTvPlayer.addTrack(item);
          this._render();
        });
      });
    } else {
      resultsEl.innerHTML = '<div class="retro-tv-results-empty">No results found</div>';
    }

    if (this.searchResults.length > 0) {
      paginationEl.classList.remove('is-hidden');
      pageLabel.textContent = `Page ${this.searchPageIndex}`;
      pagePrev.disabled = !this.searchPrevToken;
      pageNext.disabled = !this.searchNextToken;
    } else {
      paginationEl.classList.add('is-hidden');
    }

    const urlErr = this.panel.querySelector('.retro-tv-url-error');
    urlErr.textContent = this.urlError || '';

    const plEl = this.panel.querySelector('.retro-tv-playlist');
    if (retroTvPlayer.playlist.length === 0) {
      plEl.innerHTML = '<div class="retro-tv-playlist-empty">No videos added yet</div>';
      return;
    }

    plEl.innerHTML = retroTvPlayer.playlist.map((t, i) => {
      const isCurrent = i === retroTvPlayer.currentIndex && retroTvPlayer.playing;
      return `
        <div class="retro-tv-track${isCurrent ? ' playing' : ''}" data-index="${i}">
          <span class="retro-tv-track-index">${isCurrent ? '\u25B6' : i + 1}</span>
          <span class="retro-tv-track-name">${this._esc(t.title)}</span>
          <div class="retro-tv-track-actions">
            <button data-action="delete" title="Remove">\u2715</button>
          </div>
        </div>
      `;
    }).join('');

    plEl.querySelectorAll('.retro-tv-track').forEach((el) => {
      const idx = parseInt(el.dataset.index, 10);
      el.querySelector('.retro-tv-track-name').addEventListener('click', () => {
        retroTvPlayer.playTrack(idx);
      });

      el.querySelectorAll('.retro-tv-track-actions button').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.dataset.action === 'delete') {
            retroTvPlayer.removeTrack(idx);
          }
        });
      });
    });
  }

  _fmtTime(seconds) {
    const sec = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  _esc(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }
}
