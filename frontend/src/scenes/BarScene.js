/**
 * BarScene -- main Phaser scene for the cyberpunk bar.
 *
 * Layout:
 * - Background bar interior
 * - Door on the right side (click to add a new patron)
 * - Bar counter with stools at top
 * - Tables with chairs below (3x2 grid = 6 tables)
 * - Characters sit at assigned seats with drinks
 * - Neon flicker effects for atmosphere
 *
 * Resolution: 1920x1080 (scaled from original 640x360 design x3)
 */

import Phaser from 'phaser';
import { SEATS, DOOR_POSITION } from '../config/seats.js';
import { NEON_FLICKER_MIN, NEON_FLICKER_MAX } from '../config/animations.js';
import Character from '../entities/Character.js';
import DrinkManager from '../entities/DrinkManager.js';
import CostDisplay from '../entities/CostDisplay.js';
import CostDashboard from '../entities/CostDashboard.js';
import Bartender from '../entities/Bartender.js';
import TerminalTab from '../ui/TerminalTab.js';
import wsService from '../services/websocket.js';
import jukeboxAudio from '../services/jukeboxAudio.js';
import retroTvPlayer from '../services/retroTvPlayer.js';
import costTracker from '../services/costTracker.js';

export default class BarScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BarScene' });

    // Session -> { character, drinkManager, seat } mapping
    this.patrons = new Map();

    // Track occupied seats
    this.occupiedSeats = new Set();

    // UI references (set by main.js)
    this.folderPicker = null;
    this.dialogBox = null;
    this.jukeboxUI = null;
    this.retroTvUI = null;
    this.themeSettingsUI = null;

    // Session metadata
    this.sessionMeta = new Map();
  }

  preload() {
    this.load.image('bar-bg', '/assets/backgrounds/bar-interior.png');
    this.load.spritesheet('door-sheet', '/assets/sprites/objects/door.png', {
      frameWidth: 140,
      frameHeight: 240,
    });
    this.load.spritesheet('jukebox', '/assets/sprites/objects/jukebox.png', {
      frameWidth: 125,
      frameHeight: 192,
    });
    for (let i = 0; i < 8; i++) {
      this.load.atlas(`character-${i}`, `/assets/sprites/characters/character-${i}.png`, `/assets/sprites/characters/character-${i}.json`);
    }
    this.load.atlas('bartender', '/assets/sprites/characters/bartender.png', '/assets/sprites/characters/bartender.json');
    this.load.atlas('drinks', '/assets/sprites/objects/drinks.png', '/assets/sprites/objects/drinks.json');
    this.load.image('neon-sign', '/assets/sprites/ui/neon-sign-main.png');
    this.load.spritesheet('retro-tv-sheet', '/assets/sprites/objects/retro-tv.png', {
      frameWidth: 320,
      frameHeight: 180,
    });
  }

  create() {
    this.generatePlaceholderTextures();
    this.hasRealBackground = this.textures.exists('bar-bg');
    this.drawBackground();
    // Skip code-drawn furniture when real background includes it
    if (!this.hasRealBackground) {
      this.drawFurniture();
    }
    this.createBartender();
    this.createCostDashboard();
    this.drawDoor();
    this.drawJukebox();
    this.drawRetroTV();
    this.drawNeonSigns();
    this.setupWebSocketListeners();
    this.setupDemoMode();
    this.setupMusicNotePolling();
  }

  // --- Placeholder Texture Generation ---------------------------------

  generatePlaceholderTextures() {
    // Character variants (8 different color schemes)
    // Skip if real atlas was loaded in preload()
    const charColors = [
      { body: 0x2a2a3a, hair: 0x8040c0, skin: 0xd4a574 },
      { body: 0x2a3a2a, hair: 0x00f0ff, skin: 0xd4a574 },
      { body: 0x3a2a2a, hair: 0xff0080, skin: 0xc49464 },
      { body: 0x2a2a4a, hair: 0xffaa00, skin: 0xb48454 },
      { body: 0x3a2a3a, hair: 0x40c080, skin: 0xd4a574 },
      { body: 0x2a2a2a, hair: 0xf04040, skin: 0xc49464 },
      { body: 0x3a3a2a, hair: 0x6060ff, skin: 0xb48454 },
      { body: 0x2a3a3a, hair: 0xe0e0e0, skin: 0xd4a574 },
    ];

    charColors.forEach((colors, i) => {
      const key = `character-${i}`;
      if (!this.textures.exists(key)) {
        this.generateCharacterTexture(key, colors);
      }
    });

    // Drink texture (skip if atlas loaded as 'drinks')
    if (!this.textures.exists('drinks')) {
      this.generateDrinkTexture();
    }

    // Door texture — prefer loaded spritesheet, fallback to procedural
    const doorSheet = this.textures.exists('door-sheet') ? this.textures.get('door-sheet') : null;
    if (doorSheet && doorSheet.frameTotal > 2) {
      this._doorKey = 'door-sheet';
    } else {
      if (doorSheet) this.textures.remove('door-sheet');
      if (!this.textures.exists('door')) {
        this.generateDoorTexture();
      }
      this._doorKey = 'door';
    }

    // Jukebox texture — check frameTotal to detect failed spritesheet loads
    const jbTex = this.textures.exists('jukebox') ? this.textures.get('jukebox') : null;
    if (!jbTex || jbTex.frameTotal <= 2) {
      if (jbTex) this.textures.remove('jukebox');
      this.generateJukeboxTexture();
    }

    // Retro TV texture — prefer loaded sprite sheet, fallback to generated
    const tvSheet = this.textures.exists('retro-tv-sheet') ? this.textures.get('retro-tv-sheet') : null;
    if (tvSheet && tvSheet.frameTotal > 1) {
      // Use loaded sprite sheet
      this._retroTvKey = 'retro-tv-sheet';
    } else {
      // Fallback to procedural
      const tvTex = this.textures.exists('retro-tv') ? this.textures.get('retro-tv') : null;
      if (!tvTex || tvTex.frameTotal <= 1) {
        if (tvTex) this.textures.remove('retro-tv');
        this.generateRetroTVTexture();
      }
      this._retroTvKey = 'retro-tv';
    }
  }

  generateCharacterTexture(key, colors) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const w = 96;
    const h = 192;

    // 4 frames for 4 poses
    for (let frame = 0; frame < 4; frame++) {
      const ox = frame * w;

      // Body (sitting shape)
      g.fillStyle(colors.body);
      g.fillRect(ox + 24, h - 96, 48, 60);  // torso
      g.fillRect(ox + 12, h - 36, 72, 36);  // legs (sitting)

      // Head (chibi - large head ~40% of height)
      g.fillStyle(colors.skin);
      g.fillRect(ox + 24, h - 156, 48, 60); // face

      // Hair
      g.fillStyle(colors.hair);
      g.fillRect(ox + 18, h - 168, 60, 30); // top hair

      // Eyes
      g.fillStyle(0xe0e0e0);
      g.fillRect(ox + 33, h - 138, 9, 9);
      g.fillRect(ox + 54, h - 138, 9, 9);

      // Pose-specific detail
      switch (frame) {
        case 1: // Drinking -- arm up
          g.fillStyle(colors.body);
          g.fillRect(ox + 72, h - 132, 12, 36);
          g.fillStyle(0xffaa00);
          g.fillRect(ox + 72, h - 144, 18, 18); // glass
          break;
        case 2: // Leaning -- shifted torso
          g.fillStyle(colors.body);
          g.fillRect(ox + 72, h - 84, 12, 24); // arm on table
          break;
        case 3: // Looking -- head turned
          g.fillStyle(colors.skin);
          g.fillRect(ox + 30, h - 156, 48, 60);
          g.fillStyle(0xe0e0e0);
          g.fillRect(ox + 42, h - 138, 9, 9); // shifted eyes
          g.fillRect(ox + 63, h - 138, 9, 9);
          break;
      }
    }

    g.generateTexture(key, w * 4, h);
    g.destroy();

    // Create frames from the generated texture
    const texture = this.textures.get(key);
    if (texture) {
      for (let i = 0; i < 4; i++) {
        texture.add(i, 0, i * w, 0, w, h);
      }
    }
  }

  generateDrinkTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Neon cocktail glass
    g.fillStyle(0xffaa00, 0.8);
    g.fillRect(6, 0, 24, 30);   // glass body
    g.fillStyle(0xff0080, 0.9);
    g.fillRect(9, 3, 18, 12);   // liquid
    g.fillStyle(0x4a4a5e);
    g.fillRect(12, 30, 12, 6);  // stem
    g.fillRect(6, 36, 24, 6);   // base

    // Neon glow outline
    g.lineStyle(1, 0x00f0ff, 0.6);
    g.strokeRect(3, 0, 30, 42);

    g.generateTexture('drink', 36, 42);
    g.destroy();
  }

  generateDoorTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const fw = 140;
    const fh = 240;

    // 4 frames: idle → progressively opening with neon intensifying
    // Frame 0: closed, dim neon
    // Frame 1: slight crack, neon warming up
    // Frame 2: wider crack, bright neon + light spill
    // Frame 3: open crack, full glow + bright light bleed
    const crackWidths = [0, 4, 10, 18];
    const neonAlphas = [0.5, 0.7, 0.9, 1.0];
    const lightSpill = [0, 0.02, 0.06, 0.12];
    const handleGlow = [0.6, 0.75, 0.9, 1.0];
    const signAlphas = [0.6, 0.75, 0.9, 1.0];

    for (let frame = 0; frame < 4; frame++) {
      const ox = frame * fw;
      const crack = crackWidths[frame];
      const border = 12; // frame border thickness

      // Door frame — drawn as border pieces, NOT a solid fill.
      // The crack gap stays transparent so the game scene shows through.
      g.fillStyle(0x4a4a5e);
      g.fillRect(ox, 0, fw, border);                          // top
      g.fillRect(ox, fh - border, fw, border);                // bottom
      g.fillRect(ox, 0, border, fh);                          // left
      g.fillRect(ox + fw - border, 0, border, fh);            // right

      // Door panel — shifts left to reveal crack on right side
      const panelW = fw - border * 2; // 116 for fw=140
      g.fillStyle(0x2a2a3a);
      g.fillRect(ox + border, border, panelW - crack, fh - border * 2);

      // Crack edge glow (thin neon lines along the crack border, not filling it)
      if (crack > 0) {
        // Cyan edge on the panel side of the crack
        g.fillStyle(0x00f0ff, neonAlphas[frame] * 0.6);
        g.fillRect(ox + border + panelW - crack, border, 1, fh - border * 2);
        // Cyan edge on the frame side of the crack
        g.fillStyle(0x00f0ff, neonAlphas[frame] * 0.4);
        g.fillRect(ox + fw - border - 1, border, 1, fh - border * 2);
      }

      // Neon border — intensifies per frame
      g.lineStyle(1, 0x00f0ff, neonAlphas[frame]);
      g.strokeRect(ox + 6, 6, fw - 12, fh - 12);
      // Second border line for frames 2-3 (double glow)
      if (frame >= 2) {
        g.lineStyle(1, 0x00f0ff, neonAlphas[frame] * 0.3);
        g.strokeRect(ox + 4, 4, fw - 8, fh - 8);
      }

      // Door handle — glows warmer
      g.fillStyle(0xffaa00, handleGlow[frame]);
      g.fillRect(ox + fw - border - 24 - crack, 108, 12, 24);
      if (frame >= 2) {
        // Handle glow halo
        g.fillStyle(0xffaa00, handleGlow[frame] * 0.15);
        g.fillCircle(ox + fw - border - 18 - crack, 120, 18);
      }

      // "ENTER" neon sign above door
      g.fillStyle(0xff0080, signAlphas[frame]);
      g.fillRect(ox + (fw - 72) / 2, 24, 72, 24);
      if (frame >= 1) {
        // Sign glow
        g.fillStyle(0xff0080, signAlphas[frame] * 0.1);
        g.fillCircle(ox + fw / 2, 36, 42 + frame * 6);
      }
    }

    const tmpKey = '__door_tmp';
    g.generateTexture(tmpKey, fw * 4, fh);
    g.destroy();

    const source = this.textures.get(tmpKey).getSourceImage();
    this.textures.addSpriteSheet('door', source, {
      frameWidth: fw,
      frameHeight: fh,
    });
    this.textures.remove(tmpKey);
  }

  generateJukeboxTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const fw = 56;  // frame width
    const fh = 96;  // frame height

    // Equalizer bar patterns per frame (7 bars, heights in pixels from bottom of display)
    // Frame 0: idle/off — all bars dim and low
    // Frame 1-3: playing — different wave patterns for animation
    const eqPatterns = [
      [4, 6, 4, 6, 4, 6, 4],      // idle: low flat bars
      [8, 20, 12, 24, 10, 18, 6],  // wave A: rising peak center-right
      [14, 10, 22, 8, 24, 12, 16], // wave B: peaks shift
      [6, 18, 10, 16, 8, 22, 14],  // wave C: peaks move left
    ];

    const eqColors = [0xff0080, 0x00f0ff, 0xffaa00, 0xff0080, 0x00f0ff, 0xffaa00, 0xff0080];

    for (let frame = 0; frame < 4; frame++) {
      const ox = frame * fw;

      // Cabinet body
      g.fillStyle(0x2a2a3a);
      g.fillRect(ox + 4, 16, 48, 76);

      // Dome top
      g.fillStyle(0x3a3a4e);
      g.fillRect(ox + 8, 4, 40, 16);
      g.fillRect(ox + 12, 0, 32, 8);

      // Display window background
      g.fillStyle(0x0a0a14);
      g.fillRect(ox + 8, 20, 40, 32);

      // Equalizer bars inside display
      const bars = eqPatterns[frame];
      const barW = 4;
      const barGap = 2;
      const barStartX = ox + 10;
      const barBottomY = 50; // bottom of display area
      bars.forEach((h, i) => {
        const bx = barStartX + i * (barW + barGap);
        const alpha = frame === 0 ? 0.3 : 0.85;
        g.fillStyle(eqColors[i], alpha);
        g.fillRect(bx, barBottomY - h, barW, h);
        // Bright tip pixel
        if (frame > 0) {
          g.fillStyle(0xe0e0e0, 0.9);
          g.fillRect(bx, barBottomY - h, barW, 2);
        }
      });

      // Speaker grille
      g.fillStyle(0x1a1a2e);
      g.fillRect(ox + 8, 56, 40, 24);
      for (let i = 0; i < 4; i++) {
        g.fillStyle(0x2a2a3a);
        g.fillRect(ox + 12, 58 + i * 5, 32, 2);
      }

      // Base
      g.fillStyle(0x4a4a5e);
      g.fillRect(ox + 4, 84, 48, 12);

      // Neon border (pink)
      g.lineStyle(1, 0xff0080, frame === 0 ? 0.4 : 0.8);
      g.strokeRect(ox + 4, 16, 48, 76);

      // Top neon accent (cyan)
      g.lineStyle(1, 0x00f0ff, frame === 0 ? 0.3 : 0.6);
      g.strokeRect(ox + 8, 4, 40, 16);
    }

    // Render to a temporary texture, then create a proper spritesheet from it
    const tmpKey = '__jukebox_tmp';
    g.generateTexture(tmpKey, fw * 4, fh);
    g.destroy();

    const source = this.textures.get(tmpKey).getSourceImage();
    this.textures.addSpriteSheet('jukebox', source, {
      frameWidth: fw,
      frameHeight: fh,
    });
    this.textures.remove(tmpKey);
  }

  generateRetroTVTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const fw = 72;
    const fh = 52;

    const screenColors = [0x0b1a24, 0x103048, 0x0f2a3a];
    const glowAlpha = [0.25, 0.5, 0.4];

    for (let frame = 0; frame < 3; frame++) {
      const ox = frame * fw;

      // Body
      g.fillStyle(0x2a2a3a);
      g.fillRoundedRect(ox + 2, 4, 68, 44, 6);

      // Bezel
      g.fillStyle(0x3a3a4e);
      g.fillRoundedRect(ox + 6, 8, 60, 30, 4);

      // Screen glow
      g.fillStyle(screenColors[frame], glowAlpha[frame]);
      g.fillRect(ox + 10, 12, 52, 22);

      // Screen dark layer
      g.fillStyle(0x06070d, 0.9);
      g.fillRect(ox + 12, 14, 48, 18);

      // Scanline hints
      g.fillStyle(0x00f0ff, 0.12 + frame * 0.05);
      for (let i = 0; i < 4; i++) {
        g.fillRect(ox + 14, 16 + i * 4, 44, 1);
      }

      // Control panel
      g.fillStyle(0x1a1a2e);
      g.fillRect(ox + 8, 40, 56, 6);

      // Knobs
      g.fillStyle(0xffaa00, 0.7);
      g.fillCircle(ox + 18, 43, 2);
      g.fillStyle(0x00f0ff, 0.7);
      g.fillCircle(ox + 28, 43, 2);

      // Feet
      g.fillStyle(0x4a4a5e);
      g.fillRect(ox + 10, 48, 12, 4);
      g.fillRect(ox + 50, 48, 12, 4);

      // Border
      g.lineStyle(1, 0xff0080, frame === 0 ? 0.4 : 0.7);
      g.strokeRoundedRect(ox + 2, 4, 68, 44, 6);
    }

    const tmpKey = '__retro_tv_tmp';
    g.generateTexture(tmpKey, fw * 3, fh);
    g.destroy();

    const source = this.textures.get(tmpKey).getSourceImage();
    this.textures.addSpriteSheet('retro-tv', source, {
      frameWidth: fw,
      frameHeight: fh,
    });
    this.textures.remove(tmpKey);
  }

  // --- Scene Drawing --------------------------------------------------

  drawBackground() {
    // Check if real background exists
    if (this.textures.exists('bar-bg')) {
      this.add.image(960, 540, 'bar-bg').setDepth(0);
      return;
    }

    // -- Placeholder 2.5D isometric background --
    // Camera: 3/4 top-down oblique view looking slightly down and to the right
    // Visible faces: top + front (+ left side where applicable)
    const g = this.add.graphics();
    g.setDepth(0);

    // -- Back wall (angled, recedes to the right for perspective) --
    // The back wall goes from top-left toward upper-right with slight depth
    const wallTop = 90;
    const wallBot = 390;  // where wall meets floor
    const skew = 90;      // isometric skew offset

    // Back wall fill (dark)
    g.fillStyle(0x0a0a14);
    g.beginPath();
    g.moveTo(0, wallTop);
    g.lineTo(1920 - skew, wallTop);
    g.lineTo(1920, wallTop - 30);   // slight upward angle on right
    g.lineTo(1920, wallBot + 60);    // right side lower
    g.lineTo(0, wallBot);
    g.closePath();
    g.fill();

    // Wall paneling -- angled vertical strips
    for (let i = 0; i < 8; i++) {
      const x = i * 240;
      const topY = wallTop;
      const botY = wallBot + (x / 1920) * 60; // lower toward right
      g.fillStyle(0x0e0e1a);
      g.fillRect(x, topY, 6, botY - topY);
    }

    // -- Left wall (visible in 2.5D, recedes toward back) --
    g.fillStyle(0x0c0c1a);
    g.beginPath();
    g.moveTo(0, wallTop);
    g.lineTo(180, wallBot);
    g.lineTo(0, wallBot);
    g.closePath();
    g.fill();

    // Left wall accent line
    g.lineStyle(1, 0x00f0ff, 0.12);
    g.lineBetween(0, wallTop, 180, wallBot);

    // -- Right wall (recedes more steeply for depth) --
    g.fillStyle(0x080814);
    g.beginPath();
    g.moveTo(1920, wallTop - 30);
    g.lineTo(1920, 1080);
    g.lineTo(1710, 1080);
    g.lineTo(1710, wallBot + 60);
    g.closePath();
    g.fill();

    // Right wall accent
    g.lineStyle(1, 0x00f0ff, 0.10);
    g.lineBetween(1710, wallBot + 60, 1710, 1080);

    // -- Wall-floor baseboard --
    g.lineStyle(1, 0x2a1052);
    g.beginPath();
    g.moveTo(0, wallBot);
    g.lineTo(1710, wallBot + 60);
    g.stroke();
    g.lineStyle(1, 0x00f0ff, 0.2);
    g.beginPath();
    g.moveTo(0, wallBot + 3);
    g.lineTo(1710, wallBot + 63);
    g.stroke();

    // -- Floor -- isometric diamond tiles --
    g.fillStyle(0x1a1a2e);
    g.beginPath();
    g.moveTo(0, wallBot);
    g.lineTo(1710, wallBot + 60);
    g.lineTo(1920, 1080);
    g.lineTo(0, 1080);
    g.closePath();
    g.fill();

    // Diamond tile grid
    const tileW = 144;
    const tileH = 72;
    for (let row = 0; row < 12; row++) {
      for (let col = -2; col < 16; col++) {
        const offsetX = (row % 2) * (tileW / 2);
        // Slight rightward skew per row for perspective
        const perspSkew = row * 4.5;
        const tx = col * tileW + offsetX + perspSkew;
        const ty = wallBot + 6 + row * tileH;

        const shade = (row + col) % 2 === 0 ? 0x16162a : 0x1e1e34;
        g.fillStyle(shade);
        g.fillTriangle(
          tx + tileW / 2, ty,
          tx + tileW, ty + tileH / 2,
          tx + tileW / 2, ty + tileH
        );
        g.fillTriangle(
          tx + tileW / 2, ty,
          tx, ty + tileH / 2,
          tx + tileW / 2, ty + tileH
        );
      }
    }

    // Floor neon reflections (angled lines matching perspective)
    g.lineStyle(1, 0x00f0ff, 0.04);
    for (let y = wallBot + 90; y < 1080; y += 120) {
      g.lineBetween(60, y, 1680, y + 18);
    }
    g.lineStyle(1, 0xff0080, 0.02);
    for (let y = wallBot + 150; y < 1080; y += 180) {
      g.lineBetween(120, y, 1620, y + 12);
    }

    // -- Ceiling shadow (darker strip at top) --
    g.fillStyle(0x050510, 0.7);
    g.fillRect(0, 0, 1920, wallTop);

    // -- Ambient neon glow on back wall --
    g.fillStyle(0x00f0ff, 0.03);
    g.fillCircle(600, wallTop + 90, 210);
    g.fillCircle(1380, wallTop + 75, 165);
    g.fillStyle(0xff0080, 0.03);
    g.fillCircle(960, wallTop + 60, 240);
  }

  drawFurniture() {
    const g = this.add.graphics();

    // -- Shelf with bottles (on back wall, follows wall angle) --
    g.setDepth(1);
    const shelfY = 225;
    // Shelf top (isometric parallelogram)
    g.fillStyle(0x5a5a6e);
    g.beginPath();
    g.moveTo(240, shelfY);
    g.lineTo(1260, shelfY + 12);   // slight downward slope right
    g.lineTo(1260, shelfY + 24);
    g.lineTo(240, shelfY + 12);
    g.closePath();
    g.fill();
    // Shelf front face
    g.fillStyle(0x3a3a4e);
    g.beginPath();
    g.moveTo(240, shelfY + 12);
    g.lineTo(1260, shelfY + 24);
    g.lineTo(1260, shelfY + 42);
    g.lineTo(240, shelfY + 30);
    g.closePath();
    g.fill();

    // Bottles (angled to match shelf)
    const bottleColors = [0xff0080, 0x00f0ff, 0xffaa00, 0x8040c0, 0x00f0ff, 0xff0080, 0xffaa00, 0x8040c0];
    bottleColors.forEach((color, i) => {
      const bx = 285 + i * 120;
      const by = shelfY - 66 + (bx / 1920) * 12; // follow wall angle
      g.fillStyle(color, 0.7);
      g.fillRect(bx, by, 30, 66);
      g.fillStyle(color, 0.9);
      g.fillRect(bx + 6, by - 18, 18, 24);
      g.fillStyle(0x4a4a5e);
      g.fillRect(bx + 3, by - 24, 24, 9);
      g.fillStyle(color, 0.06);
      g.fillCircle(bx + 15, shelfY + 6, 30);
    });

    // -- L-shaped Bar Counter (isometric, visible from above) --
    // Layout from top to bottom of screen:
    //   back wall + shelf (y:225)
    //   bartender working area (y:300-495) -- clearly visible from 2.5D above
    //   bar counter top face (y:495-540) -- we look DOWN onto this surface
    //   bar counter front face (y:540-594) -- vertical face toward customers
    //   stools (y:630+) -- customers sit here facing bartender
    //
    // L-shape: horizontal across, with a short arm going DOWN on the LEFT side.
    // Bartender works INSIDE the L (back-left area). Customers sit OUTSIDE.
    g.setDepth(2);

    // Bar layout constants
    const barFront = 540;    // counter front edge Y
    const barTopW = 48;      // counter top face visible depth
    const barBack = barFront - barTopW; // counter back edge
    const barH = 54;         // counter front face height
    const barSkew = 6;       // perspective slope

    // - Horizontal bar section (runs most of the width) -
    const barL = 240;
    const barR = 1440;

    // Counter top face (lighter -- the surface we see from above)
    g.fillStyle(0x5a5a6e);
    g.beginPath();
    g.moveTo(barL, barBack);
    g.lineTo(barR, barBack + barSkew);
    g.lineTo(barR, barFront + barSkew);
    g.lineTo(barL, barFront);
    g.closePath();
    g.fill();

    // Counter front face (darker -- vertical face customers see)
    g.fillStyle(0x3a3a4e);
    g.beginPath();
    g.moveTo(barL, barFront);
    g.lineTo(barR, barFront + barSkew);
    g.lineTo(barR, barFront + barSkew + barH);
    g.lineTo(barL, barFront + barH);
    g.closePath();
    g.fill();

    // Neon cyan strip along front top edge
    g.lineStyle(1, 0x00f0ff, 0.5);
    g.beginPath();
    g.moveTo(barL, barFront);
    g.lineTo(barR, barFront + barSkew);
    g.stroke();

    // Under-counter pink neon
    g.lineStyle(1, 0xff0080, 0.15);
    g.beginPath();
    g.moveTo(barL + 12, barFront + barH - 6);
    g.lineTo(barR - 12, barFront + barSkew + barH - 6);
    g.stroke();

    // - L-arm going DOWN on the LEFT side -
    // This creates the L shape and encloses the bartender work area
    const armLeft = barL;
    const armRight = barL + 84;
    const armTop = barFront;       // starts where horizontal section front is
    const armBot = armTop + 180;   // extends downward

    // Arm top face (counter surface continuing down)
    g.fillStyle(0x5a5a6e);
    g.beginPath();
    g.moveTo(armLeft, armTop - barTopW);
    g.lineTo(armRight, armTop - barTopW);
    g.lineTo(armRight + 3, armBot - barTopW);
    g.lineTo(armLeft + 3, armBot - barTopW);
    g.closePath();
    g.fill();

    // Arm right face (customers see this -- the inner side of the L)
    g.fillStyle(0x3a3a4e);
    g.beginPath();
    g.moveTo(armRight, armTop);
    g.lineTo(armRight + 3, armBot);
    g.lineTo(armRight + 3, armBot + barH);
    g.lineTo(armRight, armTop + barH);
    g.closePath();
    g.fill();

    // Arm bottom cap (front face of the arm's end)
    g.fillStyle(0x333348);
    g.beginPath();
    g.moveTo(armLeft + 3, armBot);
    g.lineTo(armRight + 3, armBot);
    g.lineTo(armRight + 3, armBot + barH);
    g.lineTo(armLeft + 3, armBot + barH);
    g.closePath();
    g.fill();

    // Neon accent on arm right edge
    g.lineStyle(1, 0x00f0ff, 0.35);
    g.beginPath();
    g.moveTo(armRight, armTop);
    g.lineTo(armRight + 3, armBot);
    g.stroke();

    // Counter bottom shadow
    g.fillStyle(0x1a1a2e);
    g.beginPath();
    g.moveTo(barL, barFront + barH);
    g.lineTo(barR, barFront + barSkew + barH);
    g.lineTo(barR, barFront + barSkew + barH + 6);
    g.lineTo(barL, barFront + barH + 6);
    g.closePath();
    g.fill();

    // -- Bar Stools (isometric diamond seats) --
    const stoolG = this.add.graphics();
    stoolG.setDepth(4);
    const stoolSeats = SEATS.filter((s) => s.type === 'stool');
    stoolSeats.forEach((stool) => {
      const sx = stool.x;
      const sy = stool.y;

      // Stool leg (center post)
      stoolG.fillStyle(0x2a2a3a);
      stoolG.fillRect(sx - 6, sy + 12, 12, 42);
      // Front foot
      stoolG.fillStyle(0x333344);
      stoolG.fillRect(sx - 18, sy + 42, 9, 12);
      stoolG.fillRect(sx + 9, sy + 42, 9, 12);

      // Stool seat -- isometric diamond (top face visible)
      stoolG.fillStyle(0x5a5a6e);
      stoolG.fillTriangle(sx, sy - 12, sx + 30, sy, sx, sy + 12);
      stoolG.fillTriangle(sx, sy - 12, sx - 30, sy, sx, sy + 12);
      // Seat front face
      stoolG.fillStyle(0x4a4a5e);
      stoolG.fillTriangle(sx - 30, sy, sx, sy + 12, sx + 30, sy);
      stoolG.fillRect(sx - 30, sy, 60, 9);

      // Foot rest bar
      stoolG.fillStyle(0x3a3a4e);
      stoolG.fillRect(sx - 18, sy + 36, 36, 6);
    });

    // -- Tables (isometric diamond tops with visible front + right faces) --
    // 6 tables in a 3x2 grid layout
    const tablePositions = [
      { id: 'table1', x: 400, y: 790 },
      { id: 'table2', x: 760, y: 790 },
      { id: 'table3', x: 1120, y: 790 },
      { id: 'table4', x: 400, y: 950 },
      { id: 'table5', x: 760, y: 950 },
      { id: 'table6', x: 1120, y: 950 },
    ];

    tablePositions.forEach((table) => {
      const tg = this.add.graphics();
      tg.setDepth(3);
      const tx = table.x;
      const ty = table.y;
      const tw = 132; // half-width of diamond
      const th = 42;  // half-height of diamond

      // Table legs (4 corners, slightly inset)
      tg.fillStyle(0x2a2a3a);
      tg.fillRect(tx - tw + 24, ty + 12, 9, 42);
      tg.fillRect(tx + tw - 30, ty + 12, 9, 42);
      tg.fillStyle(0x333344);
      tg.fillRect(tx - tw + 24, ty + th + 6, 9, 42);
      tg.fillRect(tx + tw - 30, ty + th + 6, 9, 42);

      // Table top -- isometric diamond
      tg.fillStyle(0x55556a);
      tg.beginPath();
      tg.moveTo(tx, ty - th);           // top
      tg.lineTo(tx + tw, ty);            // right
      tg.lineTo(tx, ty + th);            // bottom
      tg.lineTo(tx - tw, ty);            // left
      tg.closePath();
      tg.fill();

      // Table front face (visible below diamond)
      tg.fillStyle(0x3a3a4e);
      tg.beginPath();
      tg.moveTo(tx - tw, ty);
      tg.lineTo(tx, ty + th);
      tg.lineTo(tx, ty + th + 18);       // thickness
      tg.lineTo(tx - tw, ty + 18);
      tg.closePath();
      tg.fill();

      // Table right face
      tg.fillStyle(0x444458);
      tg.beginPath();
      tg.moveTo(tx + tw, ty);
      tg.lineTo(tx, ty + th);
      tg.lineTo(tx, ty + th + 18);
      tg.lineTo(tx + tw, ty + 18);
      tg.closePath();
      tg.fill();

      // Neon accent on table top edge
      tg.lineStyle(1, 0x00f0ff, 0.12);
      tg.beginPath();
      tg.moveTo(tx, ty - th);
      tg.lineTo(tx + tw, ty);
      tg.lineTo(tx, ty + th);
      tg.lineTo(tx - tw, ty);
      tg.closePath();
      tg.stroke();

      // Chairs -- small isometric diamonds flanking table
      const chairOffsets = [
        { dx: -tw - 42, dy: 0 },   // left chair
        { dx: tw + 42, dy: 0 },    // right chair
      ];
      chairOffsets.forEach((off) => {
        const cx = tx + off.dx;
        const cy = ty + off.dy;
        // Chair seat (small diamond)
        tg.fillStyle(0x4a4a5e);
        tg.beginPath();
        tg.moveTo(cx, cy - 18);
        tg.lineTo(cx + 24, cy);
        tg.lineTo(cx, cy + 18);
        tg.lineTo(cx - 24, cy);
        tg.closePath();
        tg.fill();
        // Chair back (small parallelogram behind seat)
        tg.fillStyle(0x3a3a4e);
        tg.fillRect(cx - 18, cy - 30, 36, 15);
        // Chair leg
        tg.fillStyle(0x2a2a3a);
        tg.fillRect(cx - 3, cy + 12, 9, 24);
      });
    });
  }

  createBartender() {
    const btX = this.hasRealBackground ? 326 : 840;
    const btY = this.hasRealBackground ? 642 : 486;
    this.bartenderPos = { x: btX, y: btY };
    this.bartender = new Bartender(this, btX, btY);
    this.bartender.create();
  }

  createCostDashboard() {
    const { x, y } = this.bartenderPos;
    this.costDashboard = new CostDashboard(this, x + 10, y - 580, this.patrons);
  }

  drawDoor() {
    const doorX = DOOR_POSITION.x;
    const doorY = DOOR_POSITION.y;

    const door = this.add.sprite(doorX, doorY, this._doorKey, 0);
    door.setOrigin(0.5, 1);
    door.setScale(1.3);
    door.setDepth(2);
    door.setInteractive({ useHandCursor: true });

    // Subtle breathing animation on idle frame
    this.tweens.add({
      targets: door,
      alpha: { from: 0.85, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Hover animation: step through frames 0→3 progressively
    let doorFrame = 0;
    let doorHovered = false;
    const FRAME_DELAY = 80; // ms between each frame step
    const frameOffsetX = [0, 7, 14, 21]; // per-frame x compensation for sprite alignment

    const stepDoorFrame = () => {
      if (door.active === false) return;
      const target = doorHovered ? 3 : 0;
      if (doorFrame === target) return;

      doorFrame += doorHovered ? 1 : -1;
      door.setFrame(doorFrame);
      door.x = doorX + frameOffsetX[doorFrame];

      if (doorFrame !== target) {
        this.time.delayedCall(FRAME_DELAY, stepDoorFrame);
      }
    };

    door.on('pointerover', () => {
      doorHovered = true;
      // Stop breathing tween and snap to full alpha during hover
      this.tweens.killTweensOf(door);
      door.setAlpha(1);
      stepDoorFrame();
    });

    door.on('pointerout', () => {
      doorHovered = false;
      stepDoorFrame();
      // Restart breathing once fully closed (frame 0)
      this.time.delayedCall(FRAME_DELAY * 4, () => {
        if (!doorHovered && door.active !== false) {
          this.tweens.add({
            targets: door,
            alpha: { from: 0.85, to: 1 },
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      });
    });

    door.on('pointerdown', () => {
      if (this.folderPicker) this.folderPicker.show();
    });
  }

  drawJukebox() {
    const jbX = 245;
    const jbY = 930;

    const jukebox = this.add.sprite(jbX, jbY, 'jukebox', 0);
    jukebox.setOrigin(0.5, 1);
    // Procedural texture is 56x96, real sprite is 125x192 — both need ~3.5x to fill display
    const jbFrame = this.textures.get('jukebox').get(0);
    const jbScale = (56 * 3.5) / jbFrame.width;
    jukebox.setScale(jbScale);
    jukebox.setDepth(5);
    jukebox.setInteractive({ useHandCursor: true });

    // Neon glow layers (pink accent, matching jukebox theme)
    const glowG = this.add.graphics();
    glowG.setDepth(4);
    glowG.fillStyle(0xff0080, 0.06);
    glowG.fillCircle(jbX, jbY - 168, 180);
    glowG.fillStyle(0x00f0ff, 0.03);
    glowG.fillCircle(jbX, jbY - 168, 120);

    // Equalizer animation — cycle frames 1-3 when playing, frame 0 when idle
    let eqFrame = 1;
    this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        if (jukebox.active === false) return;
        if (jukeboxAudio.playing) {
          jukebox.setFrame(eqFrame);
          eqFrame = eqFrame >= 3 ? 1 : eqFrame + 1;
        } else {
          jukebox.setFrame(0);
          eqFrame = 1;
        }
      },
    });

    // Hover effect
    jukebox.on('pointerover', () => jukebox.setTint(0xff44aa));
    jukebox.on('pointerout', () => jukebox.clearTint());

    // Click to open jukebox UI
    jukebox.on('pointerdown', () => {
      if (this.jukeboxUI) this.jukeboxUI.toggle();
    });

    // Small label under jukebox
    const label = this.add.text(jbX, jbY + 6, 'JUKEBOX', {
      fontSize: '15px',
      fontFamily: 'Rajdhani, sans-serif',
      fontStyle: 'bold',
      color: '#ff0080',
      stroke: '#0a0a14',
      strokeThickness: 4,
    });
    label.setOrigin(0.5, 0);
    label.setDepth(15);
  }

  drawRetroTV() {
    const tvX = 1413;
    const tvY = 233;
    const useSheet = this._retroTvKey === 'retro-tv-sheet';
    const tvScale = useSheet ? 1.1745 : 2.43;

    const tv = this.add.sprite(tvX, tvY, this._retroTvKey, 0);
    tv.setOrigin(0.5, 1);
    tv.setScale(tvScale);
    tv.setDepth(6);
    tv.setInteractive({ useHandCursor: true });

    const glow = this.add.graphics();
    glow.setDepth(5);
    glow.fillStyle(0x00f0ff, 0.06);
    glow.fillCircle(tvX, tvY - 144, 260);
    glow.fillStyle(0xff0080, 0.04);
    glow.fillCircle(tvX, tvY - 144, 180);

    let frame = 1;
    this.time.addEvent({
      delay: 320,
      loop: true,
      callback: () => {
        if (tv.active === false) return;
        if (retroTvPlayer.playing) {
          tv.setFrame(frame);
          frame = frame >= 2 ? 1 : frame + 1;
        } else {
          tv.setFrame(0);
          frame = 1;
        }
      },
    });

    tv.on('pointerover', () => tv.setTint(0x44ffff));
    tv.on('pointerout', () => tv.clearTint());

    tv.on('pointerdown', () => {
      if (this.retroTvUI) this.retroTvUI.toggle();
    });

    const label = this.add.text(tvX, tvY + 10, 'RETRO TV', {
      fontSize: '15px',
      fontFamily: 'Rajdhani, sans-serif',
      fontStyle: 'bold',
      color: '#00f0ff',
      stroke: '#0a0a14',
      strokeThickness: 4,
    });
    label.setOrigin(0.5, 0);
    label.setDepth(15);

  }

  setupMusicNotePolling() {
    this._musicWasPlaying = false;

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        const isPlaying = jukeboxAudio.playing || retroTvPlayer.playing;
        if (isPlaying === this._musicWasPlaying) return;
        this._musicWasPlaying = isPlaying;

        for (const [, patron] of this.patrons) {
          if (isPlaying) {
            patron.character.showMusicNote();
          } else {
            patron.character.hideMusicNote();
          }
        }
      },
    });
  }

  drawNeonSigns() {
    // -- "CLAUDE PUNK" neon sign -- isometric tilt matching 2.5D perspective --
    // The sign is mounted on the back wall which has a slight angle,
    // so the sign plate is a parallelogram, not a rectangle.
    const signX = 945;
    const signY = 170;
    const tilt = 12; // isometric skew (pixels offset for right side)

    const sg = this.add.graphics();
    sg.setDepth(15);

    // Skip backing plate + brackets when real background has them
    if (!this.hasRealBackground) {
      // Sign backing board (dark metal plate, parallelogram for perspective)
      sg.fillStyle(0x12121f);
      sg.beginPath();
      sg.moveTo(signX - 285, signY - 54);
      sg.lineTo(signX + 285 + tilt, signY - 54 + 6);
      sg.lineTo(signX + 285 + tilt, signY + 66 + 6);
      sg.lineTo(signX - 285, signY + 66);
      sg.closePath();
      sg.fill();

      // Board edge (3D bevel)
      sg.lineStyle(1, 0x3a3a4e);
      sg.beginPath();
      sg.moveTo(signX - 285, signY - 54);
      sg.lineTo(signX + 285 + tilt, signY - 54 + 6);
      sg.stroke();
      sg.lineStyle(1, 0x1a1a2e);
      sg.beginPath();
      sg.moveTo(signX + 285 + tilt, signY - 54 + 6);
      sg.lineTo(signX + 285 + tilt, signY + 66 + 6);
      sg.lineTo(signX - 285, signY + 66);
      sg.stroke();

      // Board bottom face
      sg.fillStyle(0x0a0a14);
      sg.beginPath();
      sg.moveTo(signX - 285, signY + 66);
      sg.lineTo(signX + 285 + tilt, signY + 66 + 6);
      sg.lineTo(signX + 285 + tilt, signY + 78 + 6);
      sg.lineTo(signX - 285, signY + 78);
      sg.closePath();
      sg.fill();
    }

    // Outer glow halo (still drawn -- adds atmosphere on top of background)
    sg.fillStyle(0xffaa00, 0.04);
    sg.fillCircle(signX + 6, signY + 6, 330);
    sg.fillStyle(0xffaa00, 0.06);
    sg.fillCircle(signX + 6, signY + 6, 195);

    if (!this.hasRealBackground) {
      // Neon tube mounting brackets
      const brackets = [signX - 240, signX - 105, signX + 105, signX + 240];
      brackets.forEach((bx, i) => {
        const by = signY - 48 + (i * 1.5);
        sg.fillStyle(0x4a4a5e);
        sg.fillRect(bx, by, 9, 9);
      });
    }

    const signRotation = 0.015; // subtle tilt matching wall angle

    // Use the loaded neon-sign image if available, otherwise fall back to text
    if (this.textures.exists('neon-sign')) {
      // Single image contains both "CLAUDE PUNK" and "BAR & SESSIONS"
      const signImg = this.add.image(signX, signY, 'neon-sign');
      signImg.setOrigin(0.5, 0.5);
      signImg.setDepth(18);
      signImg.setRotation(signRotation);

      // Scale the 600x168 image to fit the sign area (~570px wide)
      const targetWidth = 570;
      signImg.setScale(targetWidth / signImg.width);

      signImg._baseAlpha = 1;
      this.neonSignLayers = [signImg];
      this.createSignFlicker(this.neonSignLayers);
    } else {
      // Fallback: text-based neon sign
      const glowText = this.add.text(signX, signY, 'CLAUDE PUNK', {
        fontSize: '54px',
        fontFamily: 'Rajdhani, sans-serif',
        fontStyle: 'bold',
        color: '#00f0ff',
        stroke: '#00f0ff',
        strokeThickness: 18,
      });
      glowText.setOrigin(0.5, 0.5);
      glowText.setDepth(16);
      glowText.setAlpha(0.25);
      glowText.setRotation(signRotation);

      const midText = this.add.text(signX, signY, 'CLAUDE PUNK', {
        fontSize: '54px',
        fontFamily: 'Rajdhani, sans-serif',
        fontStyle: 'bold',
        color: '#00f0ff',
        stroke: '#00f0ff',
        strokeThickness: 9,
      });
      midText.setOrigin(0.5, 0.5);
      midText.setDepth(17);
      midText.setAlpha(0.5);
      midText.setRotation(signRotation);

      const coreText = this.add.text(signX, signY, 'CLAUDE PUNK', {
        fontSize: '54px',
        fontFamily: 'Rajdhani, sans-serif',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#00f0ff',
        strokeThickness: 3,
      });
      coreText.setOrigin(0.5, 0.5);
      coreText.setDepth(18);
      coreText.setRotation(signRotation);

      glowText._baseAlpha = 0.25;
      midText._baseAlpha = 0.5;
      coreText._baseAlpha = 1;

      this.neonSignLayers = [glowText, midText, coreText];
      this.createSignFlicker(this.neonSignLayers);

      // Subtext "BAR & SESSIONS" in pink neon (only for text fallback)
      const subY = signY + 48;
      const subGlow = this.add.text(signX, subY, 'BAR & SESSIONS', {
        fontSize: '21px',
        fontFamily: 'Rajdhani, sans-serif',
        fontStyle: 'bold',
        color: '#ff0080',
        stroke: '#ff0080',
        strokeThickness: 12,
      });
      subGlow.setOrigin(0.5, 0.5);
      subGlow.setDepth(16);
      subGlow.setAlpha(0.2);
      subGlow.setRotation(signRotation);

      const subCore = this.add.text(signX, subY, 'BAR & SESSIONS', {
        fontSize: '21px',
        fontFamily: 'Rajdhani, sans-serif',
        fontStyle: 'bold',
        color: '#ffccee',
        stroke: '#ff0080',
        strokeThickness: 3,
      });
      subCore.setOrigin(0.5, 0.5);
      subCore.setDepth(17);
      subCore.setRotation(signRotation);

      subGlow._baseAlpha = 0.2;
      subCore._baseAlpha = 1;
      this.createSignFlicker([subGlow, subCore]);
    }

    // -- Agent type legend --
    const legendY = 16;
    const claudeLabel = this.add.text(30, legendY, '● claude', {
      fontSize: '18px',
      fontFamily: 'JetBrains Mono, monospace',
      color: '#ffaa00',
    });
    claudeLabel.setDepth(20);

    const codexLabel = this.add.text(30 + claudeLabel.width + 24, legendY, '● codex', {
      fontSize: '18px',
      fontFamily: 'JetBrains Mono, monospace',
      color: '#00a0ff',
    });
    codexLabel.setDepth(20);

    // -- Connection status indicator --
    this.connectionText = this.add.text(30, 46, '● OFFLINE', {
      fontSize: '21px',
      fontFamily: 'JetBrains Mono, monospace',
      color: '#ff0080',
    });
    this.connectionText.setDepth(20);

    // -- Theme settings link (below connection status) --
    this.themeSettingsText = this.add.text(30, 92, '⚙ THEME SETTINGS', {
      fontSize: '17px',
      fontFamily: 'JetBrains Mono, monospace',
      color: '#545480',
    });
    this.themeSettingsText.setDepth(20);
    this.themeSettingsText.setInteractive({ useHandCursor: true });
    this.themeSettingsText.on('pointerover', () => this.themeSettingsText.setColor('#6a6aa6'));
    this.themeSettingsText.on('pointerout', () => this.themeSettingsText.setColor('#545480'));
    this.themeSettingsText.on('pointerdown', () => {
      if (this.themeSettingsUI) this.themeSettingsUI.toggle();
    });

    // -- Seat count --
    this.seatCountText = this.add.text(1890, 16, `${SEATS.length - this.occupiedSeats.size} seats open`, {
      fontSize: '21px',
      fontFamily: 'JetBrains Mono, monospace',
      color: '#8888aa',
    });
    this.seatCountText.setOrigin(1, 0);
    this.seatCountText.setDepth(20);
  }

  /**
   * Simple subtle flicker for small neon elements (door "ENTER" sign, etc.)
   */
  createNeonFlicker(target) {
    const flicker = () => {
      if (target.active === false) return;

      this.tweens.add({
        targets: target,
        alpha: { from: Phaser.Math.FloatBetween(0.7, 0.9), to: 1 },
        duration: Phaser.Math.Between(50, 150),
        yoyo: true,
        onComplete: () => {
          this.time.delayedCall(
            Phaser.Math.Between(NEON_FLICKER_MIN, NEON_FLICKER_MAX),
            flicker
          );
        },
      });
    };

    this.time.delayedCall(Phaser.Math.Between(0, 3000), flicker);
  }

  /**
   * Dramatic neon sign flicker -- synchronized across a group of layers.
   * Patterns:
   *  - Normal glow with subtle breathing
   *  - Rapid multi-blink (2-4 quick flashes like a struggling tube)
   *  - Occasional deep dim (sign nearly goes dark, then snaps back)
   *  - Buzz sequence (very fast micro-flickers)
   */
  createSignFlicker(layers) {
    const schedule = () => {
      if (layers.some((l) => l.active === false)) return;

      // Pick a random flicker pattern
      const roll = Math.random();
      if (roll < 0.4) {
        // 40%: Subtle breathe (gentle pulse)
        this.flickerBreathe(layers, schedule);
      } else if (roll < 0.7) {
        // 30%: Rapid multi-blink (2-4 quick on/off flashes)
        this.flickerMultiBlink(layers, schedule);
      } else if (roll < 0.88) {
        // 18%: Buzz sequence (fast micro-flickers)
        this.flickerBuzz(layers, schedule);
      } else {
        // 12%: Deep dim (sign almost goes dark, snaps back)
        this.flickerDeepDim(layers, schedule);
      }
    };

    // Start after a random initial delay
    this.time.delayedCall(Phaser.Math.Between(500, 2000), schedule);
  }

  /** Gentle alpha pulse -- the "idle" state between dramatic flickers */
  flickerBreathe(layers, next) {
    const target = Phaser.Math.FloatBetween(0.85, 0.95);
    layers.forEach((l) => {
      this.tweens.add({
        targets: l,
        alpha: l._baseAlpha * target,
        duration: Phaser.Math.Between(800, 1500),
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          l.setAlpha(l._baseAlpha);
        },
      });
    });
    // Next event after the breathe completes + pause
    this.time.delayedCall(
      Phaser.Math.Between(2000, 5000),
      next
    );
  }

  /** Rapid 2-4 blinks -- like a neon tube struggling to stay lit */
  flickerMultiBlink(layers, next) {
    const blinkCount = Phaser.Math.Between(2, 4);
    let delay = 0;

    for (let i = 0; i < blinkCount; i++) {
      // Dim phase
      this.time.delayedCall(delay, () => {
        layers.forEach((l) => {
          if (l.active === false) return;
          l.setAlpha(l._baseAlpha * Phaser.Math.FloatBetween(0.05, 0.2));
        });
      });
      delay += Phaser.Math.Between(40, 80);

      // Bright snap-back
      this.time.delayedCall(delay, () => {
        layers.forEach((l) => {
          if (l.active === false) return;
          l.setAlpha(l._baseAlpha * Phaser.Math.FloatBetween(0.95, 1.0));
        });
      });
      delay += Phaser.Math.Between(60, 120);
    }

    // Restore to full and schedule next
    this.time.delayedCall(delay, () => {
      layers.forEach((l) => {
        if (l.active !== false) l.setAlpha(l._baseAlpha);
      });
      this.time.delayedCall(Phaser.Math.Between(1500, 4000), next);
    });
  }

  /** Fast micro-flickers -- buzzing effect like electrical interference */
  flickerBuzz(layers, next) {
    const buzzCount = Phaser.Math.Between(6, 12);
    let delay = 0;

    for (let i = 0; i < buzzCount; i++) {
      this.time.delayedCall(delay, () => {
        layers.forEach((l) => {
          if (l.active === false) return;
          l.setAlpha(l._baseAlpha * Phaser.Math.FloatBetween(0.3, 1.0));
        });
      });
      delay += Phaser.Math.Between(20, 50);
    }

    // Snap to full brightness after buzz
    this.time.delayedCall(delay, () => {
      layers.forEach((l) => {
        if (l.active !== false) l.setAlpha(l._baseAlpha);
      });
      this.time.delayedCall(Phaser.Math.Between(3000, 7000), next);
    });
  }

  /** Deep dim -- sign nearly goes dark, holds, then snaps back bright */
  flickerDeepDim(layers, next) {
    // Quick dim down
    layers.forEach((l) => {
      this.tweens.add({
        targets: l,
        alpha: l._baseAlpha * 0.05,
        duration: Phaser.Math.Between(60, 120),
        ease: 'Power2',
      });
    });

    // Hold in near-darkness
    const holdTime = Phaser.Math.Between(200, 600);
    this.time.delayedCall(150 + holdTime, () => {
      // Snap back to full (bright pop)
      layers.forEach((l) => {
        if (l.active === false) return;
        l.setAlpha(l._baseAlpha * 1.1); // brief over-bright
      });

      // Settle to normal
      this.time.delayedCall(80, () => {
        layers.forEach((l) => {
          if (l.active !== false) l.setAlpha(l._baseAlpha);
        });
        this.time.delayedCall(Phaser.Math.Between(4000, 8000), next);
      });
    });
  }

  // --- WebSocket Event Handling ---------------------------------------

  // --- Demo Mode (Shift+D) -------------------------------------------

  setupDemoMode() {
    // Demo terminal output samples for testing speech bubbles
    const DEMO_LINES = [
      'Read src/components/App.tsx\n',
      'Edit src/utils/helpers.js\n',
      'Write src/config/settings.json\n',
      'Bash: npm run build\n',
      'Grep: searching for "handleClick"\n',
      'Glob: **/*.test.ts\n',
      'thinking...\n',
      'error: Cannot find module "foo"\n',
      '15 tests passed\n',
      'commit abc1234 feat: add login\n',
      'npm install express\n',
      '$ git status\n',
      'compiling TypeScript...\n',
      'Created src/new-file.ts\n',
      'Running migrations...\n',
      'Task: delegating to subagent\n',
    ];

    let demoIndex = 0;

    this._demoKeyHandler = (e) => {
      // Shift+D to spawn a demo patron or feed output to existing ones
      if (e.key === 'D' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Don't trigger when typing in inputs
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        e.preventDefault();

        // If no patrons exist, create a demo one
        if (this.patrons.size === 0) {
          const demoId = `demo-${Date.now()}`;
          this.handleSessionUpdate({
            id: demoId,
            state: 'active',
            label: 'Demo Agent',
            agentType: 'claude',
          });
        }

        // Feed demo output to all patrons
        for (const [sessionId, patron] of this.patrons) {
          const line = DEMO_LINES[demoIndex % DEMO_LINES.length];
          this.handleTerminalOutput({ sessionId, data: line });
        }
        demoIndex++;
      }
    };
    document.addEventListener('keydown', this._demoKeyHandler);
  }

  setupWebSocketListeners() {
    // Track session IDs received during backend replay for reconciliation
    this._replaySessionIds = null;
    this._replayTimer = null;

    wsService.on('connection.open', () => {
      this.connectionText.setText('● ONLINE');
      this.connectionText.setColor('#00f0ff');

      // Start replay reconciliation: track which sessions the backend tells us about.
      // After the replay window closes, remove patrons for sessions that no longer exist.
      this._replaySessionIds = new Set();
      if (this._replayTimer) clearTimeout(this._replayTimer);
      this._replayTimer = setTimeout(() => {
        this._reconcileSessions();
      }, 1500);
    });

    wsService.on('connection.close', () => {
      this.connectionText.setText('● OFFLINE');
      this.connectionText.setColor('#ff0080');
      // Cancel pending reconciliation — we lost the connection mid-replay
      if (this._replayTimer) {
        clearTimeout(this._replayTimer);
        this._replayTimer = null;
      }
      this._replaySessionIds = null;
    });

    wsService.on('session.update', (payload) => {
      // Track replayed sessions for reconciliation
      if (this._replaySessionIds) {
        this._replaySessionIds.add(payload.id);
      }
      this.handleSessionUpdate(payload);
    });

    wsService.on('session.terminated', (payload) => {
      this.handleSessionTerminated(payload);
    });

    wsService.on('files.update', (payload) => {
      this.handleFilesUpdate(payload);
    });

    wsService.on('terminal.output', (payload) => {
      this.handleTerminalOutput(payload);
    });

    // Character click -> open dialog
    this.events.on('character-clicked', (data) => {
      if (this.dialogBox) {
        const meta = this.sessionMeta.get(data.sessionId) || {};
        this.dialogBox.open(data.sessionId, meta.label, meta.state, meta.agentType);
      }
    });

    // Connect AFTER all listeners are registered, ensuring no replay messages are lost.
    wsService.connect();
  }

  /**
   * After a reconnect, remove patrons for sessions that the backend no longer
   * knows about (e.g., killed while the frontend was disconnected).
   */
  _reconcileSessions() {
    this._replayTimer = null;
    const replayIds = this._replaySessionIds;
    this._replaySessionIds = null;
    if (!replayIds) return;

    // Find patrons whose sessions were NOT in the replay (no longer on backend)
    const staleIds = [];
    for (const sessionId of this.patrons.keys()) {
      if (!replayIds.has(sessionId)) {
        staleIds.push(sessionId);
      }
    }

    for (const sessionId of staleIds) {
      console.log(`[BarScene] Reconcile: removing stale patron ${sessionId}`);
      this.handleSessionTerminated({ sessionId });
    }
  }

  handleSessionUpdate(payload) {
    const { id, state, label, agentType } = payload;

    // Store metadata
    this.sessionMeta.set(id, { ...payload });

    // If character already exists, just update state
    if (this.patrons.has(id)) {
      const patron = this.patrons.get(id);
      // Could update visual state here
      return;
    }

    // New session -- create character and start buffering terminal output
    if (state === 'active' || state === 'creating') {
      TerminalTab.getOrCreate(id);
      this.addPatron(id, label, agentType);
    }
  }

  handleSessionTerminated(payload) {
    const { sessionId } = payload;
    const patron = this.patrons.get(sessionId);
    if (!patron) return;

    // Update metadata
    const meta = this.sessionMeta.get(sessionId);
    if (meta) meta.state = 'terminated';

    // Free hotkey
    if (this.hotkeyManager) {
      this.hotkeyManager.free(sessionId);
    }

    // Remove character and cost display
    patron.character.exit();
    patron.drinkManager.destroy();
    if (patron.costDisplay) patron.costDisplay.destroy();
    costTracker.removeSession(sessionId);

    // Free seat
    this.occupiedSeats.delete(patron.seat.id);
    this.updateSeatCount();

    this.patrons.delete(sessionId);
  }

  handleFilesUpdate(payload) {
    const { sessionId, drinkCount } = payload;
    const patron = this.patrons.get(sessionId);
    if (!patron) return;

    patron.drinkManager.setDrinkCount(drinkCount);
  }

  handleTerminalOutput(payload) {
    const { sessionId, data } = payload;
    const patron = this.patrons.get(sessionId);
    if (!patron) return;

    // Feed to speech bubble
    patron.character.onTerminalOutput(data);

    // Feed to cost tracker
    costTracker.onTerminalOutput(sessionId, data);
  }

  // --- Patron Management ----------------------------------------------

  addPatron(sessionId, label, agentType) {
    const seat = this.findAvailableSeat();
    if (!seat) {
      console.warn('No available seats!');
      return;
    }

    this.occupiedSeats.add(seat.id);
    this.updateSeatCount();

    const character = new Character(this, sessionId, seat, label || sessionId.slice(0, 8), agentType);
    character.create();

    // Assign hotkey letter
    if (this.hotkeyManager) {
      const letter = this.hotkeyManager.assign(sessionId);
      if (letter) character.setHotkey(letter);
    }

    const drinkManager = new DrinkManager(this, character, seat);

    // Initialize cost tracking and display
    costTracker.initSession(sessionId, agentType);
    const costDisplay = new CostDisplay(this, sessionId, seat.drinkAnchor);

    this.patrons.set(sessionId, { character, drinkManager, costDisplay, seat });

    // If music is already playing, queue music note for this character
    if (this._musicWasPlaying) {
      character.showMusicNote();
    }
  }

  findAvailableSeat() {
    const available = SEATS.filter((s) => !this.occupiedSeats.has(s.id));
    if (available.length === 0) return null;
    return Phaser.Utils.Array.GetRandom(available);
  }

  updateSeatCount() {
    const available = SEATS.length - this.occupiedSeats.size;
    if (this.seatCountText) {
      this.seatCountText.setText(`${available} seats open`);
    }
    this.events.emit('seat-available', { count: available });
  }

}
