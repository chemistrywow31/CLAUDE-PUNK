/**
 * VolumeControl — small floating UI for music volume + mute.
 * Positioned in the bottom-right corner above the game canvas.
 * Cyberpunk styled to match the bar aesthetic.
 */

import audioManager from '../services/audioManager.js';
import jukeboxAudio from '../services/jukeboxAudio.js';
import retroTvPlayer from '../services/retroTvPlayer.js';

export default class VolumeControl {
  constructor() {
    this.el = null;
    this.slider = null;
    this.muteBtn = null;
    this.build();
  }

  build() {
    this.el = document.createElement('div');
    this.el.className = 'volume-control';

    // Mute button
    this.muteBtn = document.createElement('button');
    this.muteBtn.className = 'volume-mute-btn';
    this.muteBtn.textContent = '\u266B'; // ♫
    this.muteBtn.title = 'Mute / Unmute';
    this.muteBtn.addEventListener('click', () => {
      const muted = !audioManager.isMuted();
      audioManager.setMuted(muted);
      jukeboxAudio.setMuted(muted);
      retroTvPlayer.setMuted(muted);
      this.updateMuteIcon(muted);
    });

    // Volume slider
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.className = 'volume-slider';
    this.slider.min = '0';
    this.slider.max = '100';
    this.slider.value = String(Math.round(audioManager.getVolume() * 100));
    this.slider.addEventListener('input', () => {
      const val = parseInt(this.slider.value, 10) / 100;
      audioManager.setVolume(val);
      jukeboxAudio.setVolume(val);
      retroTvPlayer.setVolume(val);
      if (audioManager.isMuted() && val > 0) {
        audioManager.setMuted(false);
        jukeboxAudio.setMuted(false);
        retroTvPlayer.setMuted(false);
        this.updateMuteIcon(false);
      }
    });

    this.el.appendChild(this.muteBtn);
    this.el.appendChild(this.slider);

    document.getElementById('game-container').appendChild(this.el);
  }

  updateMuteIcon(muted) {
    this.muteBtn.textContent = muted ? '\u2715' : '\u266B'; // ✕ or ♫
    this.muteBtn.classList.toggle('muted', muted);
  }
}
