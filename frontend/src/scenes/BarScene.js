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

    // Session metadata
    this.sessionMeta = new Map();
  }

  preload() {
    this.load.image('bar-bg', '/assets/backgrounds/bar-interior.png');
    this.load.image('door', '/assets/sprites/objects/door.png');
    this.load.atlas('jukebox', '/assets/sprites/objects/jukebox.png', '/assets/sprites/objects/jukebox.json');
    for (let i = 0; i < 8; i++) {
      this.load.atlas(`character-${i}`, `/assets/sprites/characters/character-${i}.png`, `/assets/sprites/characters/character-${i}.json`);
    }
    this.load.atlas('bartender', '/assets/sprites/characters/bartender.png', '/assets/sprites/characters/bartender.json');
    this.load.atlas('drinks', '/assets/sprites/objects/drinks.png', '/assets/sprites/objects/drinks.json');
    this.load.image('neon-sign', '/assets/sprites/ui/neon-sign-main.png');
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
    this.drawNeonSigns();
    this.setupWebSocketListeners();
    this.setupDemoMode();
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

    // Door texture
    if (!this.textures.exists('door')) {
      this.generateDoorTexture();
    }

    // Jukebox texture — check frameTotal to detect failed atlas loads
    const jbTex = this.textures.exists('jukebox') ? this.textures.get('jukebox') : null;
    if (!jbTex || jbTex.frameTotal <= 2) {
      if (jbTex) this.textures.remove('jukebox');
      this.generateJukeboxTexture();
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

    // Door frame
    g.fillStyle(0x4a4a5e);
    g.fillRect(0, 0, 120, 240);

    // Door panel
    g.fillStyle(0x2a2a3a);
    g.fillRect(12, 12, 96, 216);

    // Neon border
    g.lineStyle(1, 0x00f0ff, 0.8);
    g.strokeRect(6, 6, 108, 228);

    // Door handle
    g.fillStyle(0xffaa00);
    g.fillRect(84, 108, 12, 24);

    // "ENTER" text area (neon sign above door)
    g.fillStyle(0xff0080);
    g.fillRect(24, 24, 72, 24);

    g.generateTexture('door', 120, 240);
    g.destroy();
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

    // Always show the door sprite (with real bg it overlays the frame)
    const door = this.add.sprite(doorX, doorY, 'door');
    door.setOrigin(0.5, 1);
    door.setScale(1.3);
    door.setDepth(2);
    door.setInteractive({ useHandCursor: true });

    // Subtle breathing animation
    this.tweens.add({
      targets: door,
      alpha: { from: 0.85, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    door.on('pointerover', () => door.setTint(0x44ffff));
    door.on('pointerout', () => door.clearTint());
    door.on('pointerdown', () => {
      if (this.folderPicker) this.folderPicker.show();
    });
  }

  drawJukebox() {
    const jbX = 245;
    const jbY = 920;

    const jukebox = this.add.sprite(jbX, jbY, 'jukebox', 0);
    jukebox.setOrigin(0.5, 1);
    jukebox.setScale(3.5);
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
    sg.fillStyle(0x00f0ff, 0.04);
    sg.fillCircle(signX + 6, signY + 6, 330);
    sg.fillStyle(0x00f0ff, 0.06);
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

    // Main neon text -- triple-layered with slight rotation for 2.5D tilt
    const signRotation = 0.015; // subtle tilt matching wall angle

    // Layer 1: outer glow
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

    // Layer 2: mid glow
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

    // Layer 3: bright core
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

    // Store base alphas for flicker restoration
    glowText._baseAlpha = 0.25;
    midText._baseAlpha = 0.5;
    coreText._baseAlpha = 1;

    // Flicker all main sign layers as a synchronized group
    this.neonSignLayers = [glowText, midText, coreText];
    this.createSignFlicker(this.neonSignLayers);

    // -- Subtext "BAR & SESSIONS" in pink neon --
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

    // -- Agent type legend --
    const legendY = 1002;
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
    this.connectionText = this.add.text(30, 1050, '● OFFLINE', {
      fontSize: '21px',
      fontFamily: 'JetBrains Mono, monospace',
      color: '#ff0080',
    });
    this.connectionText.setDepth(20);

    // -- Seat count --
    this.seatCountText = this.add.text(1890, 1050, `${SEATS.length - this.occupiedSeats.size} seats open`, {
      fontSize: '21px',
      fontFamily: 'JetBrains Mono, monospace',
      color: '#8888aa',
    });
    this.seatCountText.setOrigin(1, 1);
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
