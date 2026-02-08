/**
 * JukeboxAudio — independent audio service for user-uploaded music.
 * Manages a playlist of uploaded tracks with its own Audio element and volume.
 * Persists tracks to IndexedDB so they survive page reloads.
 * Validates blob URLs before playback — removes dead tracks automatically.
 * Coordinates with audioManager: pauses background music when jukebox plays,
 * resumes it when jukebox stops.
 */

import audioManager from './audioManager.js';

const LOOP_ALL = 'all';
const LOOP_SINGLE = 'single';

const DB_NAME = 'claude-punk-jukebox';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

/** Open (or create) the IndexedDB database */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class JukeboxAudio {
  constructor() {
    this.audio = new Audio();
    this.audio.loop = false;
    this.volume = 0.6;
    this.audio.volume = this.volume;
    this.muted = false;
    this.playing = false;
    this.playlist = []; // { id, name, url }
    this.currentIndex = -1;
    this.loopMode = LOOP_ALL;
    this.onChange = null; // callback for UI re-render
    this._db = null;
    this._externalSuspend = false;
    this._externalWasPlaying = false;
    this._retroSuspend = false;
    this._retroWasPlaying = false;

    this.audio.addEventListener('ended', () => {
      this._onTrackEnded();
    });

    // Handle playback errors (dead blob URL, corrupted data, etc.)
    this.audio.addEventListener('error', () => {
      if (this.playing && this.playlist.length > 0) {
        const badIndex = this.currentIndex;
        console.warn(`[Jukebox] Track failed to load, removing: ${this.playlist[badIndex]?.name}`);
        this._removeTrackInternal(badIndex);
      }
    });

    // Load persisted tracks on startup
    this._loadFromDB();
  }

  async _getDB() {
    if (!this._db) {
      this._db = await openDB();
    }
    return this._db;
  }

  /** Load all tracks from IndexedDB and recreate blob URLs */
  async _loadFromDB() {
    try {
      const db = await this._getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = req.result || [];
        for (const rec of records) {
          const blob = new Blob([rec.data], { type: rec.mimeType || 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          this.playlist.push({ id: rec.id, name: rec.name, url });
        }
        this._notify();
      };
    } catch (e) {
      console.warn('[Jukebox] Failed to load tracks from IndexedDB:', e);
    }
  }

  /** Save a track's raw data to IndexedDB, returns the assigned id */
  async _saveToDB(name, arrayBuffer, mimeType) {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add({ name, data: arrayBuffer, mimeType });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[Jukebox] Failed to save track:', e);
      return null;
    }
  }

  /** Delete a track from IndexedDB by its id */
  async _deleteFromDB(id) {
    try {
      const db = await this._getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
    } catch (e) {
      console.warn('[Jukebox] Failed to delete track:', e);
    }
  }

  /** Rewrite the order of all tracks in IndexedDB to match current playlist */
  async _rewriteOrder() {
    try {
      const db = await this._getDB();
      // Read all records, then clear and re-insert in current playlist order
      const tx1 = db.transaction(STORE_NAME, 'readonly');
      const store1 = tx1.objectStore(STORE_NAME);
      const allReq = store1.getAll();
      allReq.onsuccess = () => {
        const byId = new Map();
        for (const rec of allReq.result) byId.set(rec.id, rec);

        const tx2 = db.transaction(STORE_NAME, 'readwrite');
        const store2 = tx2.objectStore(STORE_NAME);
        store2.clear();
        for (const track of this.playlist) {
          const rec = byId.get(track.id);
          if (rec) {
            // Re-add without id so autoIncrement assigns fresh sequential ids
            const newRec = { name: rec.name, data: rec.data, mimeType: rec.mimeType };
            const addReq = store2.add(newRec);
            addReq.onsuccess = () => { track.id = addReq.result; };
          }
        }
      };
    } catch (e) {
      console.warn('[Jukebox] Failed to rewrite track order:', e);
    }
  }

  async addTrack(file) {
    const name = file.name.replace(/\.[^/.]+$/, '');
    const arrayBuffer = await file.arrayBuffer();
    const id = await this._saveToDB(name, arrayBuffer, file.type);
    const blob = new Blob([arrayBuffer], { type: file.type });
    const url = URL.createObjectURL(blob);
    this.playlist.push({ id, name, url });
    this._notify();
  }

  removeTrack(index) {
    this._removeTrackInternal(index);
  }

  _removeTrackInternal(index) {
    if (index < 0 || index >= this.playlist.length) return;
    const removed = this.playlist.splice(index, 1)[0];
    URL.revokeObjectURL(removed.url);
    if (removed.id != null) this._deleteFromDB(removed.id);

    if (this.playlist.length === 0) {
      this.stop();
      this.currentIndex = -1;
    } else if (index === this.currentIndex) {
      if (this.currentIndex >= this.playlist.length) {
        this.currentIndex = 0;
      }
      if (this.playing) {
        this._playCurrentTrack();
      }
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    }
    this._notify();
  }

  moveTrack(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.playlist.length) return;
    if (toIndex < 0 || toIndex >= this.playlist.length) return;
    const [track] = this.playlist.splice(fromIndex, 1);
    this.playlist.splice(toIndex, 0, track);

    // Adjust currentIndex to follow the playing track
    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex--;
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex++;
    }
    this._rewriteOrder();
    this._notify();
  }

  play() {
    if (this.playlist.length === 0) return;
    if (this.currentIndex < 0) this.currentIndex = 0;
    this.playing = true;
    this._suspendRetroTv();
    this._pauseBackgroundMusic();
    this._playCurrentTrack();
    this._notify();
  }

  pause() {
    this.playing = false;
    this.audio.pause();
    this._resumeBackgroundMusic();
    this._resumeRetroTv();
    this._notify();
  }

  togglePlayPause() {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  suspendForExternalPlayback() {
    if (this._externalSuspend) return;
    this._externalSuspend = true;
    this._externalWasPlaying = this.playing;
    if (this.playing) {
      this.playing = false;
      this.audio.pause();
    }
    this._notify();
  }

  resumeAfterExternalPlayback() {
    if (!this._externalSuspend) return false;
    this._externalSuspend = false;
    if (this._externalWasPlaying && this.playlist.length > 0 && this.currentIndex >= 0) {
      this.playing = true;
      this._pauseBackgroundMusic();
      this.audio.play().catch(() => {});
      this._notify();
      return true;
    }
    this._externalWasPlaying = false;
    this._notify();
    return false;
  }

  stop() {
    this.playing = false;
    this.audio.pause();
    this.audio.currentTime = 0;
    this._resumeBackgroundMusic();
    this._resumeRetroTv();
    this._notify();
  }

  next() {
    if (this.playlist.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    if (this.playing) {
      this._playCurrentTrack();
    }
    this._notify();
  }

  playTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentIndex = index;
    this.playing = true;
    this._pauseBackgroundMusic();
    this._playCurrentTrack();
    this._notify();
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (!this.muted) {
      this.audio.volume = this.volume;
    }
    this._notify();
  }

  setMuted(isMuted) {
    this.muted = Boolean(isMuted);
    this.audio.volume = this.muted ? 0 : this.volume;
    this._notify();
  }

  isMuted() {
    return this.muted;
  }

  toggleLoopMode() {
    this.loopMode = this.loopMode === LOOP_ALL ? LOOP_SINGLE : LOOP_ALL;
    this._notify();
  }

  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.playlist.length) {
      return this.playlist[this.currentIndex];
    }
    return null;
  }

  _playCurrentTrack() {
    if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) return;
    const track = this.playlist[this.currentIndex];
    this.audio.src = track.url;
    this.audio.play().catch(() => {});
  }

  _onTrackEnded() {
    if (this.loopMode === LOOP_SINGLE) {
      this._playCurrentTrack();
    } else {
      // LOOP_ALL: advance and wrap
      this.currentIndex++;
      if (this.currentIndex >= this.playlist.length) {
        this.currentIndex = 0;
      }
      this._playCurrentTrack();
    }
    this._notify();
  }

  _pauseBackgroundMusic() {
    if (audioManager.playing) {
      audioManager.audio.pause();
      this._bgWasPaused = true;
    }
  }

  _resumeBackgroundMusic() {
    if (this._bgWasPaused && audioManager.playing) {
      audioManager.audio.play().catch(() => {});
      this._bgWasPaused = false;
    }
  }

  _notify() {
    if (this.onChange) this.onChange();
  }

  async _suspendRetroTv() {
    if (this._retroSuspend) return;
    this._retroSuspend = true;
    try {
      const { default: retroTvPlayer } = await import('./retroTvPlayer.js');
      this._retroWasPlaying = retroTvPlayer.playing;
      if (retroTvPlayer.playing) {
        retroTvPlayer.pause();
      }
    } catch (e) {
      this._retroSuspend = false;
    }
  }

  async _resumeRetroTv() {
    if (!this._retroSuspend) return;
    this._retroSuspend = false;
    try {
      const { default: retroTvPlayer } = await import('./retroTvPlayer.js');
      if (this._retroWasPlaying) {
        retroTvPlayer.play();
      }
    } finally {
      this._retroWasPlaying = false;
    }
  }
}

const jukeboxAudio = new JukeboxAudio();
export default jukeboxAudio;
