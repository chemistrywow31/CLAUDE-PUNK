/**
 * RetroTvPlayer — YouTube playback + playlist for the Retro TV overlay.
 * Uses YouTube IFrame API and coordinates audio with background + jukebox.
 */

import audioManager from './audioManager.js';
import jukeboxAudio from './jukeboxAudio.js';

const YT_API_SRC = 'https://www.youtube.com/iframe_api';
const SEARCH_API = 'https://www.googleapis.com/youtube/v3/search';
const VIDEO_API = 'https://www.googleapis.com/youtube/v3/videos';
const API_KEY_STORAGE = 'retro_tv_youtube_api_key';
const DB_NAME = 'claude-punk-retrotv';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';
const LOOP_ALL = 'all';
const LOOP_SINGLE = 'single';

let apiReadyPromise = null;

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

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${YT_API_SRC}"]`);
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = YT_API_SRC;
      document.head.appendChild(tag);
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve();
    };
  });

  return apiReadyPromise;
}

function parseYouTubeId(input) {
  const value = String(input || '').trim();
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const host = url.hostname.replace('www.', '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/')[1];
      return id || null;
    }
    if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }
      const parts = url.pathname.split('/');
      if (parts[1] === 'shorts' || parts[1] === 'embed') {
        return parts[2] || null;
      }
    }
  } catch (e) {
    // Ignore URL parsing failures
  }

  return null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

class RetroTvPlayer {
  constructor() {
    this.primaryPlayer = null;
    this.tvPlayer = null;
    this.primaryReady = false;
    this.tvReady = false;
    this.primaryContainerId = null;
    this.tvContainerId = null;

    this.playlist = []; // { videoId, title, channelTitle }
    this.currentIndex = -1;
    this.playing = false;
    this.volume = 0.6;
    this.duration = 0;
    this.currentTime = 0;
    this.muted = false;
    this.loopMode = LOOP_ALL;

    this.onChange = null;

    this._progressTimer = null;
    this._otherAudioSuspended = false;
    this._db = null;

    this._loadFromDB();
  }

  async _getDB() {
    if (!this._db) {
      this._db = await openDB();
    }
    return this._db;
  }

  async _loadFromDB() {
    try {
      const db = await this._getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = req.result || [];
        this.playlist = records.map((rec) => ({
          id: rec.id,
          videoId: rec.videoId,
          title: rec.title,
          channelTitle: rec.channelTitle || '',
        }));
        this.currentIndex = this.playlist.length > 0 ? 0 : -1;
        this._notify();
      };
    } catch (e) {
      console.warn('[RetroTV] Failed to load playlist from IndexedDB:', e);
    }
  }

  async _saveToDB(track) {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add(track);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[RetroTV] Failed to save track:', e);
      return null;
    }
  }

  async _deleteFromDB(id) {
    if (id == null) return;
    try {
      const db = await this._getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
    } catch (e) {
      console.warn('[RetroTV] Failed to delete track:', e);
    }
  }

  hasApiKey() {
    return Boolean(this.getApiKey());
  }

  getApiKey() {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (stored) return stored;
    return import.meta.env.VITE_YT_API_KEY || '';
  }

  setApiKey(key) {
    const value = String(key || '').trim();
    if (value) {
      localStorage.setItem(API_KEY_STORAGE, value);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
    this._notify();
  }

  async ensurePlayers(primaryContainerId, tvContainerId) {
    this.primaryContainerId = primaryContainerId;
    this.tvContainerId = tvContainerId;
    await loadYouTubeAPI();

    if (!this.primaryPlayer) {
      const primaryHost = document.getElementById(primaryContainerId);
      if (!primaryHost) return;
      this.primaryPlayer = new window.YT.Player(primaryHost, {
        width: '100%',
        height: '100%',
        videoId: '',
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            this.primaryReady = true;
            const vol = this.muted ? 0 : this.volume;
            this.primaryPlayer.setVolume(Math.round(vol * 100));
            this._notify();
          },
          onStateChange: (e) => this._handleStateChange(e),
        },
      });
    }

    if (!this.tvPlayer && tvContainerId) {
      const tvHost = document.getElementById(tvContainerId);
      if (!tvHost) return;
      this.tvPlayer = new window.YT.Player(tvHost, {
        width: '100%',
        height: '100%',
        videoId: '',
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          mute: 1,
        },
        events: {
          onReady: () => {
            this.tvReady = true;
            this.tvPlayer.mute();
            const track = this.getCurrentTrack();
            if (track) {
              const startSeconds = this.primaryPlayer?.getCurrentTime?.() || 0;
              this._syncTvLoad(track.videoId, startSeconds);
              if (this.playing) {
                this._syncTvPlay();
              }
            }
          },
        },
      });
    }
  }

  async search(query, pageToken = '') {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('API key missing');
    }
    const q = encodeURIComponent(query);
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `${SEARCH_API}?part=snippet&type=video&maxResults=10&q=${q}&key=${apiKey}${tokenParam}`;
    const data = await fetchJson(url);
    const items = (data.items || []).map((item) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title || 'Untitled',
      channelTitle: item.snippet?.channelTitle || '',
      thumbUrl: item.snippet?.thumbnails?.default?.url || '',
    })).filter((item) => item.videoId);
    return {
      items,
      nextPageToken: data.nextPageToken || '',
      prevPageToken: data.prevPageToken || '',
    };
  }

  async _fetchVideoDetails(videoId) {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    const url = `${VIDEO_API}?part=snippet&id=${encodeURIComponent(videoId)}&key=${apiKey}`;
    const data = await fetchJson(url);
    const item = (data.items || [])[0];
    if (!item) return null;
    return {
      title: item.snippet?.title || `YouTube ${videoId}`,
      channelTitle: item.snippet?.channelTitle || '',
    };
  }

  async addFromUrl(input) {
    const videoId = parseYouTubeId(input);
    if (!videoId) {
      return { ok: false, error: '無法解析 YouTube 連結或 ID' };
    }
    let title = `YouTube ${videoId}`;
    let channelTitle = '';
    try {
      const info = await this._fetchVideoDetails(videoId);
      if (info) {
        title = info.title;
        channelTitle = info.channelTitle;
      }
    } catch (e) {
      // ignore, fallback to generic title
    }
    const record = { videoId, title, channelTitle };
    const id = await this._saveToDB(record);
    this.playlist.push({ id, ...record });
    if (this.currentIndex === -1) this.currentIndex = 0;
    this._notify();
    return { ok: true };
  }

  async addTrack(track) {
    if (!track?.videoId) return;
    const record = {
      videoId: track.videoId,
      title: track.title || 'Untitled',
      channelTitle: track.channelTitle || '',
    };
    const id = await this._saveToDB(record);
    this.playlist.push({ id, ...record });
    if (this.currentIndex === -1) this.currentIndex = 0;
    this._notify();
  }

  removeTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;
    const removed = this.playlist.splice(index, 1)[0];
    if (removed?.id != null) this._deleteFromDB(removed.id);
    if (index === this.currentIndex) {
      if (this.playlist.length === 0) {
        this.currentIndex = -1;
        this.stop();
      } else {
        this.currentIndex = Math.min(this.currentIndex, this.playlist.length - 1);
        this.playTrack(this.currentIndex);
      }
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    }
    this._notify();
  }

  async playTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;
    await this.ensurePlayers(this.primaryContainerId, this.tvContainerId);
    this.currentIndex = index;
    const track = this.playlist[this.currentIndex];
    this._suspendOtherAudio();
    this.primaryPlayer.loadVideoById(track.videoId);
    this._syncTvLoad(track.videoId, 0);
    this.playing = true;
    this._notify();
  }

  async play() {
    if (this.playlist.length === 0) return;
    await this.ensurePlayers(this.primaryContainerId, this.tvContainerId);
    if (this.currentIndex < 0) this.currentIndex = 0;
    if (!this.primaryReady) return;
    const track = this.playlist[this.currentIndex];
    const currentVideo = this.primaryPlayer.getVideoData ? this.primaryPlayer.getVideoData().video_id : '';
    if (currentVideo !== track.videoId) {
      this._suspendOtherAudio();
      this.primaryPlayer.loadVideoById(track.videoId);
      this._syncTvLoad(track.videoId, 0);
    } else {
      this._suspendOtherAudio();
      this.primaryPlayer.playVideo();
      this._syncTvPlay();
    }
    this.playing = true;
    this._notify();
  }

  pause() {
    if (!this.primaryReady) return;
    this.primaryPlayer.pauseVideo();
    this._syncTvPause();
    this.playing = false;
    this._stopProgressTimer();
    this._notify();
  }

  stop() {
    if (!this.primaryReady) return;
    this.primaryPlayer.stopVideo();
    this._syncTvStop();
    this.playing = false;
    this.currentTime = 0;
    this._stopProgressTimer();
    this._resumeOtherAudio();
    this._notify();
  }

  async next() {
    if (this.playlist.length === 0) return;
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.playlist.length) {
      if (this.loopMode === LOOP_ALL) {
        await this.playTrack(0);
        return;
      }
      this.stop();
      return;
    }
    await this.playTrack(nextIndex);
  }

  async prev() {
    if (this.playlist.length === 0) return;
    const prevIndex = this.currentIndex - 1;
    if (prevIndex < 0) {
      await this.playTrack(0);
      return;
    }
    await this.playTrack(prevIndex);
  }

  seekTo(seconds) {
    if (!this.primaryReady) return;
    this.primaryPlayer.seekTo(seconds, true);
    this._syncTvSeek(seconds);
    this.currentTime = seconds;
    this._notify();
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.primaryReady) {
      const vol = this.muted ? 0 : this.volume;
      this.primaryPlayer.setVolume(Math.round(vol * 100));
    }
    this._notify();
  }

  setMuted(isMuted) {
    this.muted = Boolean(isMuted);
    if (this.primaryReady) {
      const vol = this.muted ? 0 : this.volume;
      this.primaryPlayer.setVolume(Math.round(vol * 100));
    }
    this._notify();
  }

  isMuted() {
    return this.muted;
  }

  getCurrentTrack() {
    if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) return null;
    return this.playlist[this.currentIndex];
  }

  _handleStateChange(e) {
    if (!window.YT || !window.YT.PlayerState) return;
    const state = e.data;
    if (state === window.YT.PlayerState.PLAYING) {
      this.playing = true;
      this._suspendOtherAudio();
      this._startProgressTimer();
      this._syncTvPlay();
    } else if (state === window.YT.PlayerState.PAUSED) {
      this.playing = false;
      this._stopProgressTimer();
      this._syncTvPause();
    } else if (state === window.YT.PlayerState.ENDED) {
      this.playing = false;
      this._stopProgressTimer();
      this._syncTvStop();
      this._onEnded();
    }
    this._notify();
  }

  _onEnded() {
    if (this.loopMode === LOOP_SINGLE) {
      this.playTrack(this.currentIndex);
      return;
    }
    const nextIndex = this.currentIndex + 1;
    if (nextIndex < this.playlist.length) {
      this.playTrack(nextIndex);
    } else if (this.loopMode === LOOP_ALL) {
      this.playTrack(0);
    } else {
      this.stop();
    }
  }

  _startProgressTimer() {
    if (this._progressTimer) return;
    this._progressTimer = window.setInterval(() => {
      if (!this.primaryReady || !this.primaryPlayer) return;
      const duration = this.primaryPlayer.getDuration?.() || 0;
      const current = this.primaryPlayer.getCurrentTime?.() || 0;
      this.duration = duration;
      this.currentTime = current;
      this._notify();
    }, 500);
  }

  _stopProgressTimer() {
    if (!this._progressTimer) return;
    clearInterval(this._progressTimer);
    this._progressTimer = null;
  }

  _suspendOtherAudio() {
    if (this._otherAudioSuspended) return;
    this._otherAudioSuspended = true;
    audioManager.pauseForExternal();
    jukeboxAudio.suspendForExternalPlayback();
  }

  _resumeOtherAudio() {
    if (!this._otherAudioSuspended) return;
    this._otherAudioSuspended = false;
    const jukeboxResumed = jukeboxAudio.resumeAfterExternalPlayback();
    if (!jukeboxResumed) {
      audioManager.resumeFromExternal();
    }
  }

  _notify() {
    if (this.onChange) this.onChange();
  }

  toggleLoopMode() {
    this.loopMode = this.loopMode === LOOP_ALL ? LOOP_SINGLE : LOOP_ALL;
    this._notify();
  }

  _syncTvLoad(videoId, startSeconds) {
    if (!this.tvPlayer || !this.tvReady) return;
    this.tvPlayer.loadVideoById({ videoId, startSeconds });
    this.tvPlayer.mute();
  }

  _syncTvPlay() {
    if (!this.tvPlayer || !this.tvReady) return;
    this.tvPlayer.playVideo();
  }

  _syncTvPause() {
    if (!this.tvPlayer || !this.tvReady) return;
    this.tvPlayer.pauseVideo();
  }

  _syncTvStop() {
    if (!this.tvPlayer || !this.tvReady) return;
    this.tvPlayer.stopVideo();
  }

  _syncTvSeek(seconds) {
    if (!this.tvPlayer || !this.tvReady) return;
    this.tvPlayer.seekTo(seconds, true);
  }
}

const retroTvPlayer = new RetroTvPlayer();
export default retroTvPlayer;
