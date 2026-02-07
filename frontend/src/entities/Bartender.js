/**
 * Bartender — the bar's resident character. Stands behind the counter
 * facing customers, with idle behavior (wiping glass, looking around,
 * leaning on counter).
 *
 * The bartender is always present and is NOT tied to a session.
 */

import Phaser from 'phaser';

// Bartender action states
const ACTION = {
  IDLE: 'idle',
  WIPING: 'wiping',
  LOOKING_LEFT: 'looking-left',
  LOOKING_RIGHT: 'looking-right',
  LEANING: 'leaning',
};

const ALL_ACTIONS = [ACTION.IDLE, ACTION.WIPING, ACTION.LOOKING_LEFT, ACTION.LOOKING_RIGHT, ACTION.LEANING];

export default class Bartender {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.sprite = null;
    this.currentAction = ACTION.IDLE;
    this.actionTimer = null;
  }

  create() {
    // Generate placeholder texture if no real sprite loaded
    if (!this.scene.textures.exists('bartender')) {
      this.generateTexture();
    }

    this.sprite = this.scene.add.sprite(this.x, this.y, 'bartender');
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setScale(1.5);
    this.sprite.setDepth(5); // behind counter front face but above shelf

    // Fade in
    this.sprite.setAlpha(0);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 1,
      duration: 600,
      ease: 'Power1',
    });

    // Start idle behavior
    this.scheduleAction();
  }

  generateTexture() {
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
    const w = 84;
    const h = 156;
    const frames = 5; // one per action

    for (let f = 0; f < frames; f++) {
      const ox = f * w;

      // Body — dark vest with neon accent
      g.fillStyle(0x1a1a2e);
      g.fillRect(ox + 18, h - 84, 48, 54); // torso

      // Vest accent stripe (cyan)
      g.fillStyle(0x00f0ff, 0.6);
      g.fillRect(ox + 39, h - 84, 6, 48);

      // Arms
      g.fillStyle(0x1a1a2e);
      g.fillRect(ox + 6, h - 72, 15, 42);  // left arm
      g.fillRect(ox + 63, h - 72, 15, 42); // right arm

      // Hands (skin)
      g.fillStyle(0xd4a574);
      g.fillRect(ox + 9, h - 36, 12, 12);
      g.fillRect(ox + 63, h - 36, 12, 12);

      // Head — larger, more defined (chibi proportions)
      g.fillStyle(0xd4a574);
      g.fillRect(ox + 18, h - 144, 48, 60); // face

      // Signature hairstyle — slicked back, white/silver with cyan streak
      g.fillStyle(0xaaaacc);
      g.fillRect(ox + 12, h - 156, 60, 24);  // top hair
      g.fillRect(ox + 12, h - 144, 12, 36);  // side hair left
      g.fillRect(ox + 60, h - 144, 12, 36); // side hair right
      // Cyan streak
      g.fillStyle(0x00f0ff);
      g.fillRect(ox + 30, h - 156, 12, 18);

      // Eyes — distinctive sharp look
      g.fillStyle(0x0a0a14);
      g.fillRect(ox + 27, h - 126, 12, 9);   // left eye
      g.fillRect(ox + 45, h - 126, 12, 9);  // right eye
      // Eye glow (cyan pupils)
      g.fillStyle(0x00f0ff);
      g.fillRect(ox + 30, h - 123, 6, 6);
      g.fillRect(ox + 48, h - 123, 6, 6);

      // Mouth — slight smirk
      g.fillStyle(0xb48454);
      g.fillRect(ox + 33, h - 105, 18, 3);

      // Earring (left ear, neon pink)
      g.fillStyle(0xff0080);
      g.fillRect(ox + 12, h - 120, 6, 6);

      // Action-specific details
      switch (f) {
        case 1: // Wiping — arm raised with cloth
          g.fillStyle(0xe0e0e0);
          g.fillRect(ox + 63, h - 54, 18, 12); // cloth/glass
          g.fillStyle(0x00f0ff, 0.3);
          g.fillRect(ox + 66, h - 66, 12, 18); // glass outline
          break;
        case 2: // Looking left — head shifted
          g.fillStyle(0xd4a574);
          g.fillRect(ox + 12, h - 144, 48, 60);
          g.fillStyle(0x0a0a14);
          g.fillRect(ox + 21, h - 126, 12, 9);
          g.fillRect(ox + 39, h - 126, 12, 9);
          g.fillStyle(0x00f0ff);
          g.fillRect(ox + 21, h - 123, 6, 6);
          g.fillRect(ox + 39, h - 123, 6, 6);
          break;
        case 3: // Looking right — head shifted
          g.fillStyle(0xd4a574);
          g.fillRect(ox + 24, h - 144, 48, 60);
          g.fillStyle(0x0a0a14);
          g.fillRect(ox + 33, h - 126, 12, 9);
          g.fillRect(ox + 51, h - 126, 12, 9);
          g.fillStyle(0x00f0ff);
          g.fillRect(ox + 36, h - 123, 6, 6);
          g.fillRect(ox + 54, h - 123, 6, 6);
          break;
        case 4: // Leaning — torso tilted, arm on counter
          g.fillStyle(0x1a1a2e);
          g.fillRect(ox + 60, h - 42, 18, 12); // arm resting on counter
          break;
      }
    }

    g.generateTexture('bartender', w * frames, h);
    g.destroy();

    // Create frames
    const texture = this.scene.textures.get('bartender');
    if (texture) {
      for (let i = 0; i < frames; i++) {
        texture.add(i, 0, i * w, 0, w, h);
      }
    }
  }

  scheduleAction() {
    const delay = Phaser.Math.Between(2500, 6000);
    this.actionTimer = this.scene.time.delayedCall(delay, () => {
      const others = ALL_ACTIONS.filter((a) => a !== this.currentAction);
      const next = Phaser.Utils.Array.GetRandom(others);
      this.setAction(next);
      this.scheduleAction();
    });
  }

  setAction(action) {
    this.currentAction = action;
    if (!this.sprite || this.sprite.active === false) return;

    const texture = this.scene.textures.get('bartender');

    // Atlas frame names from bartender.json
    const atlasFrameMap = {
      [ACTION.IDLE]: 'bartender-idle',
      [ACTION.WIPING]: 'bartender-wipe',
      [ACTION.LOOKING_LEFT]: 'bartender-look-l',
      [ACTION.LOOKING_RIGHT]: 'bartender-look-r',
      [ACTION.LEANING]: 'bartender-lean',
    };

    const atlasFrame = atlasFrameMap[action];
    if (texture && texture.has(atlasFrame)) {
      this.sprite.setFrame(atlasFrame);
      this.sprite.setRotation(0);
      return;
    }

    // Fallback: numeric frames for placeholder texture
    const frameMap = {
      [ACTION.IDLE]: 0,
      [ACTION.WIPING]: 1,
      [ACTION.LOOKING_LEFT]: 2,
      [ACTION.LOOKING_RIGHT]: 3,
      [ACTION.LEANING]: 4,
    };

    if (texture && texture.frameTotal > 1) {
      this.sprite.setFrame(frameMap[action] ?? 0);
    }

    // Subtle body language via rotation
    switch (action) {
      case ACTION.WIPING:
        this.sprite.setRotation(-0.03);
        break;
      case ACTION.LEANING:
        this.sprite.setRotation(0.05);
        break;
      case ACTION.LOOKING_LEFT:
        this.sprite.setFlipX(false);
        this.sprite.setRotation(0);
        break;
      case ACTION.LOOKING_RIGHT:
        this.sprite.setFlipX(false);
        this.sprite.setRotation(0);
        break;
      default:
        this.sprite.setRotation(0);
        break;
    }
  }

  destroy() {
    if (this.actionTimer) this.actionTimer.remove();
    if (this.sprite) this.sprite.destroy();
  }
}
