/**
 * Claude Punk — Entry point
 * Initializes Phaser game, WebSocket connection, and UI overlays.
 */

import Phaser from 'phaser';
import BarScene from './scenes/BarScene.js';
import DialogBox from './ui/DialogBox.js';
import FolderPicker from './ui/FolderPicker.js';
import VolumeControl from './ui/VolumeControl.js';
import Jukebox from './ui/Jukebox.js';
import RetroTV from './ui/RetroTV.js';
import ThemeSettings from './ui/ThemeSettings.js';
import HotkeyManager from './managers/HotkeyManager.js';
import retroTvPlayer from './services/retroTvPlayer.js';
import wsService from './services/websocket.js';
import audioManager from './services/audioManager.js';

// Import styles
import '@xterm/xterm/css/xterm.css';
import './styles/cyberpunk.css';
import './styles/dialog.css';
import './styles/terminal.css';
import './styles/folder-picker.css';
import './styles/volume-control.css';
import './styles/jukebox.css';
import './styles/retro-tv.css';
import './styles/file-warp.css';
import './styles/file-editor.css';
import './styles/theme-settings.css';
import './styles/activity-monitor.css';

// ─── Game Configuration ─────────────────────────────────────────

const config = {
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BarScene],
  parent: 'game-container',
  transparent: true,
};

// ─── Initialize ─────────────────────────────────────────────────

const game = new Phaser.Game(config);

// ─── Video Background Sync ──────────────────────────────────────
// Keep the bg-video element sized and positioned to match the Phaser canvas exactly.
function syncVideoToCanvas() {
  const video = document.getElementById('bg-video');
  const canvas = game.canvas;
  if (!video || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  video.style.position = 'absolute';
  video.style.left = `${rect.left}px`;
  video.style.top = `${rect.top}px`;
  video.style.width = `${rect.width}px`;
  video.style.height = `${rect.height}px`;
  video.style.minWidth = 'unset';
  video.style.minHeight = 'unset';
  video.style.transform = 'none';
  video.style.objectFit = 'fill';
}
window.addEventListener('resize', syncVideoToCanvas);
// Run once after Phaser finishes initial layout
setTimeout(syncVideoToCanvas, 100);

// Wait for scene to be ready, then wire up UI overlays
game.events.on('ready', () => {
  syncVideoToCanvas();
  const scene = game.scene.getScene('BarScene');
  retroTvPlayer.ensurePlayers('retro-tv-player', 'retro-tv-mini-yt');

  // Initialize UI overlays
  const dialogBox = new DialogBox();
  const folderPicker = new FolderPicker();
  const jukeboxUI = new Jukebox();
  const retroTvUI = new RetroTV();
  const themeSettingsUI = new ThemeSettings();

  // Wire overlays to scene
  scene.dialogBox = dialogBox;
  scene.folderPicker = folderPicker;
  scene.jukeboxUI = jukeboxUI;
  scene.retroTvUI = retroTvUI;
  scene.themeSettingsUI = themeSettingsUI;

  // Hotkey manager — assigns letters to patrons, Ctrl+` closes overlays
  scene.hotkeyManager = new HotkeyManager(scene, dialogBox, folderPicker, jukeboxUI, retroTvUI);

  // Disable Phaser input when HTML overlays are visible (prevents click-through)
  folderPicker.onShow = () => { scene.input.enabled = false; };
  folderPicker.onHide = () => { scene.input.enabled = true; };
  dialogBox.onOpen = () => { scene.input.enabled = false; };
  dialogBox.onClose = () => { scene.input.enabled = true; };
  jukeboxUI.onShow = () => { scene.input.enabled = false; };
  jukeboxUI.onHide = () => { scene.input.enabled = true; };
  themeSettingsUI.onShow = () => { scene.input.enabled = false; };
  themeSettingsUI.onHide = () => { scene.input.enabled = true; };
  // ─── Retro TV Mini Player (synced YouTube on bar scene TV sprite) ───
  const miniTv = document.getElementById('retro-tv-mini');

  // TV screen area in game world coords
  // 320x180 sprite at (1413,245) origin(0.5,1) scale 1.1745
  // Sprite top-left: x = 1413 - 187.9 = 1225.1, y = 233 - 211.4 = 21.6
  // Screen in sprite: x=34 y=13 w=252 h=154 (all * 1.1745)
  const TV_SCREEN = { x: 1225.1 + 39.9, y: 21.6 + 15.3, w: 296.0, h: 180.9 };

  function updateMiniTv() {
    const shouldShow = retroTvPlayer.playing && !retroTvUI.visible;
    miniTv.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) return;

    const rect = game.canvas.getBoundingClientRect();
    const sx = rect.width / 1920;
    const sy = rect.height / 1080;
    miniTv.style.left = (rect.left + TV_SCREEN.x * sx) + 'px';
    miniTv.style.top = (rect.top + TV_SCREEN.y * sy) + 'px';
    miniTv.style.width = (TV_SCREEN.w * sx) + 'px';
    miniTv.style.height = (TV_SCREEN.h * sy) + 'px';
  }

  // Chain onto retroTvPlayer.onChange so both RetroTV UI and mini player update
  const prevOnChange = retroTvPlayer.onChange;
  retroTvPlayer.onChange = () => {
    if (prevOnChange) prevOnChange();
    updateMiniTv();
  };

  window.addEventListener('resize', updateMiniTv);

  retroTvUI.onShow = () => { scene.input.enabled = false; updateMiniTv(); };
  retroTvUI.onHide = () => { scene.input.enabled = true; updateMiniTv(); };

  // WebSocket connection is initiated by BarScene.setupWebSocketListeners()
  // after all event listeners are registered, ensuring no replay messages are lost.

  // Folder picker callback — visual feedback when session requested
  folderPicker.onSessionCreated = ({ label }) => {
    console.log(`[UI] Session requested: ${label}`);
  };

  // Volume control UI
  new VolumeControl();

  // Start background music on first user interaction (browser autoplay policy)
  const startMusic = () => {
    audioManager.start();
    document.removeEventListener('click', startMusic);
    document.removeEventListener('keydown', startMusic);
  };
  document.addEventListener('click', startMusic);
  document.addEventListener('keydown', startMusic);
});
