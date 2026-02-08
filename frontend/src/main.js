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
import HotkeyManager from './managers/HotkeyManager.js';
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
  backgroundColor: '#0a0a14',
};

// ─── Initialize ─────────────────────────────────────────────────

const game = new Phaser.Game(config);

// Wait for scene to be ready, then wire up UI overlays
game.events.on('ready', () => {
  const scene = game.scene.getScene('BarScene');
  import('./services/retroTvPlayer.js').then(({ default: retroTvPlayer }) => {
    retroTvPlayer.ensurePlayers('retro-tv-player');
  });

  // Initialize UI overlays
  const dialogBox = new DialogBox();
  const folderPicker = new FolderPicker();
  const jukeboxUI = new Jukebox();
  const retroTvUI = new RetroTV();

  // Wire overlays to scene
  scene.dialogBox = dialogBox;
  scene.folderPicker = folderPicker;
  scene.jukeboxUI = jukeboxUI;
  scene.retroTvUI = retroTvUI;

  // Hotkey manager — assigns letters to patrons, Ctrl+` closes overlays
  scene.hotkeyManager = new HotkeyManager(scene, dialogBox, folderPicker, jukeboxUI, retroTvUI);

  // Disable Phaser input when HTML overlays are visible (prevents click-through)
  folderPicker.onShow = () => { scene.input.enabled = false; };
  folderPicker.onHide = () => { scene.input.enabled = true; };
  dialogBox.onOpen = () => { scene.input.enabled = false; };
  dialogBox.onClose = () => { scene.input.enabled = true; };
  jukeboxUI.onShow = () => { scene.input.enabled = false; };
  jukeboxUI.onHide = () => { scene.input.enabled = true; };
  retroTvUI.onShow = () => { scene.input.enabled = false; };
  retroTvUI.onHide = () => { scene.input.enabled = true; };

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
