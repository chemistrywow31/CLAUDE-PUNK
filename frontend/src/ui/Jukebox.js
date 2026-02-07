/**
 * Jukebox — HTML overlay for music upload, playlist management, and playback.
 * Cyberpunk-styled with pink accent theme.
 */

import jukeboxAudio from '../services/jukeboxAudio.js';

export default class Jukebox {
  constructor() {
    this.overlay = document.getElementById('jukebox-overlay');
    this.visible = false;
    this.onShow = null;
    this.onHide = null;
    this.fileInput = null;

    this._build();
    this._bindEvents();

    // Re-render UI when audio state changes
    jukeboxAudio.onChange = () => this._render();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'jukebox-panel';

    panel.innerHTML = `
      <div class="jukebox-header">
        <span class="jukebox-title">Jukebox</span>
        <button class="jukebox-close">\u00D7</button>
      </div>
      <div class="jukebox-now-playing">No track loaded</div>
      <div class="jukebox-controls">
        <button class="jukebox-btn jukebox-play" title="Play / Pause">\u25B6</button>
        <button class="jukebox-btn jukebox-next" title="Next">\u23ED</button>
        <button class="jukebox-btn jukebox-loop" title="Loop mode: ALL">ALL</button>
        <div class="jukebox-volume">
          <label>VOL</label>
          <input type="range" min="0" max="100" value="60" />
        </div>
      </div>
      <div class="jukebox-upload">
        <button class="jukebox-upload-btn">+ Upload Tracks</button>
      </div>
      <div class="jukebox-playlist">
        <div class="jukebox-playlist-empty">No tracks uploaded yet</div>
      </div>
    `;

    this.overlay.appendChild(panel);
    this.panel = panel;
  }

  _bindEvents() {
    // Close button
    this.panel.querySelector('.jukebox-close').addEventListener('click', () => this.hide());

    // Backdrop click to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    // Escape to close
    this._escHandler = (e) => {
      if (e.key === 'Escape' && this.visible) this.hide();
    };
    document.addEventListener('keydown', this._escHandler);

    // Play/Pause
    this.panel.querySelector('.jukebox-play').addEventListener('click', () => {
      jukeboxAudio.togglePlayPause();
    });

    // Next
    this.panel.querySelector('.jukebox-next').addEventListener('click', () => {
      jukeboxAudio.next();
    });

    // Loop toggle
    this.panel.querySelector('.jukebox-loop').addEventListener('click', () => {
      jukeboxAudio.toggleLoopMode();
    });

    // Volume
    this.panel.querySelector('.jukebox-volume input').addEventListener('input', (e) => {
      jukeboxAudio.setVolume(parseInt(e.target.value, 10) / 100);
    });

    // Upload
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'audio/*';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    this.panel.querySelector('.jukebox-upload-btn').addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', () => {
      const files = Array.from(this.fileInput.files);
      files.forEach((f) => jukeboxAudio.addTrack(f));
      this.fileInput.value = '';
    });
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.visible = true;
    this.overlay.classList.remove('hidden');
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

    // Now playing
    const npEl = this.panel.querySelector('.jukebox-now-playing');
    const track = jukeboxAudio.getCurrentTrack();
    if (track && jukeboxAudio.playing) {
      npEl.innerHTML = `Now playing: <span class="track-name">${this._esc(track.name)}</span>`;
    } else if (track) {
      npEl.innerHTML = `Paused: <span class="track-name">${this._esc(track.name)}</span>`;
    } else {
      npEl.textContent = 'No track loaded';
    }

    // Play/Pause button
    const playBtn = this.panel.querySelector('.jukebox-play');
    playBtn.textContent = jukeboxAudio.playing ? '\u23F8' : '\u25B6';
    playBtn.title = jukeboxAudio.playing ? 'Pause' : 'Play';

    // Loop button
    const loopBtn = this.panel.querySelector('.jukebox-loop');
    const isLoopSingle = jukeboxAudio.loopMode === 'single';
    loopBtn.textContent = isLoopSingle ? '1' : 'ALL';
    loopBtn.title = `Loop mode: ${isLoopSingle ? 'SINGLE' : 'ALL'}`;
    loopBtn.classList.toggle('active', isLoopSingle);

    // Volume slider sync
    this.panel.querySelector('.jukebox-volume input').value = String(Math.round(jukeboxAudio.volume * 100));

    // Playlist
    const plEl = this.panel.querySelector('.jukebox-playlist');
    if (jukeboxAudio.playlist.length === 0) {
      plEl.innerHTML = '<div class="jukebox-playlist-empty">No tracks uploaded yet</div>';
      return;
    }

    plEl.innerHTML = jukeboxAudio.playlist.map((t, i) => {
      const isCurrent = i === jukeboxAudio.currentIndex && jukeboxAudio.playing;
      return `
        <div class="jukebox-track${isCurrent ? ' playing' : ''}" data-index="${i}">
          <span class="track-index">${isCurrent ? '\u25B6' : i + 1}</span>
          <span class="track-name">${this._esc(t.name)}</span>
          <div class="jukebox-track-actions">
            <button data-action="up" title="Move up">\u25B2</button>
            <button data-action="down" title="Move down">\u25BC</button>
            <button data-action="delete" title="Remove">\u2715</button>
          </div>
        </div>
      `;
    }).join('');

    // Delegate playlist clicks
    plEl.querySelectorAll('.jukebox-track').forEach((el) => {
      const idx = parseInt(el.dataset.index, 10);

      // Click track name to play
      el.querySelector('.track-name').addEventListener('click', () => {
        jukeboxAudio.playTrack(idx);
      });

      // Action buttons
      el.querySelectorAll('.jukebox-track-actions button').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === 'up' && idx > 0) {
            jukeboxAudio.moveTrack(idx, idx - 1);
          } else if (action === 'down' && idx < jukeboxAudio.playlist.length - 1) {
            jukeboxAudio.moveTrack(idx, idx + 1);
          } else if (action === 'delete') {
            jukeboxAudio.removeTrack(idx);
          }
        });
      });
    });
  }

  _esc(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }
}
