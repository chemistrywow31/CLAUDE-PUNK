/**
 * AudioManager — handles background music playback.
 * 4 tracks play in random order. Supports volume control and mute.
 * Uses HTML5 Audio (not Phaser audio) so it works independently of the game scene.
 */

const TRACKS = [
  '/assets/audio/bgm-bar-ambient-1.mp3',
  '/assets/audio/bgm-bar-ambient-2.mp3',
  '/assets/audio/bgm-bar-ambient-3.mp3',
  '/assets/audio/bgm-bar-ambient-0.mp3',
];

class AudioManager {
  constructor() {
    this.audio = new Audio();
    this.audio.loop = false;
    this.volume = 0.4;
    this.audio.volume = this.volume;
    this.muted = false;
    this.playing = false;
    this.playlist = [];
    this.currentIndex = 0;

    // When a track ends, play the next one
    this.audio.addEventListener('ended', () => {
      this.playNext();
    });
  }

  /** Shuffle the playlist and start playing */
  start() {
    if (this.playing) return;
    this.playlist = this.shuffle([...TRACKS]);
    this.currentIndex = 0;
    this.playing = true;
    this.playCurrentTrack();
  }

  playCurrentTrack() {
    if (!this.playing || this.playlist.length === 0) return;
    this.audio.src = this.playlist[this.currentIndex];
    this.audio.play().catch(() => {
      // Browser may block autoplay — will retry on user interaction
    });
  }

  playNext() {
    this.currentIndex++;
    if (this.currentIndex >= this.playlist.length) {
      // Re-shuffle and loop
      this.playlist = this.shuffle([...TRACKS]);
      this.currentIndex = 0;
    }
    this.playCurrentTrack();
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (!this.muted) {
      this.audio.volume = this.volume;
    }
  }

  getVolume() {
    return this.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    this.audio.volume = this.muted ? 0 : this.volume;
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

const audioManager = new AudioManager();
export default audioManager;
