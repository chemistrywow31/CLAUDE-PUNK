/**
 * Character entity — wraps a Phaser sprite representing a session patron.
 * Handles entrance walk animation, 4 sitting poses, and interactive behavior.
 *
 * Poses: idle, drinking, leaning, looking around
 * Characters randomly switch poses every 3-8 seconds for liveliness.
 */

import { POSE, CHARACTER_POSES, POSE_MIN_DURATION, POSE_MAX_DURATION, CHARACTER_VARIANT_COUNT } from '../config/animations.js';
import { DOOR_POSITION } from '../config/seats.js';
import { BUBBLE_ENABLED } from '../config/bubbles.js';
import SpeechBubble from './SpeechBubble.js';

// Per-variant, per-frame corrections for sprite size/position consistency.
// scale: compensates oversized frames (e.g., 0.77 = frame is 30% too large)
// offsetY: compensates vertical misalignment in world pixels (positive = down)
const FRAME_CORRECTIONS = {
  1: {
    [POSE.IDLE]: { offsetY: 30 },
    [POSE.DRINKING]: { offsetY: -10 },
  },
  3: {
    [POSE.IDLE]: { scale: 0.77 },
    [POSE.DRINKING]: { scale: 0.71 },
    [POSE.LOOKING]: { scale: 0.71 },
  },
  5: {
    [POSE.IDLE]: { scale: 0.77 },
    [POSE.LEANING]: { scale: 0.77 },
    [POSE.LOOKING]: { scale: 0.77 },
  },
  6: {
    [POSE.IDLE]: { scale: 0.71 },
  },
  7: {
    [POSE.IDLE]: { scale: 0.91 },
    [POSE.LEANING]: { scale: 0.91 },
    [POSE.LOOKING]: { scale: 0.91 },
  },
};

export default class Character {
  constructor(scene, sessionId, seat, label, agentType = 'claude') {
    this.scene = scene;
    this.sessionId = sessionId;
    this.seat = seat;
    this.label = label;
    this.agentType = agentType;
    this.sprite = null;
    this.nameText = null;
    this.currentPose = POSE.IDLE;
    this.poseTimer = null;
    this.isWalking = false;
    this.isSeated = false;
    this.destroyed = false;

    // Pick a random character variant (for visual diversity)
    this.variant = Phaser.Math.Between(0, CHARACTER_VARIANT_COUNT - 1);

    // Speech bubble (created after sprite + label exist)
    this.speechBubble = null;
  }

  create() {
    const textureKey = `character-${this.variant}`;

    // Create sprite at the door position
    this.sprite = this.scene.add.sprite(DOOR_POSITION.x, DOOR_POSITION.y, textureKey);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setScale(1.5);
    this.sprite.setDepth(10);
    this.sprite.setAlpha(0);

    // Name label below character (colored by agent type)
    const nameColor = this.agentType === 'codex' ? '#00a0ff' : '#ffaa00';
    this.nameText = this.scene.add.text(DOOR_POSITION.x, DOOR_POSITION.y + 6, this.label, {
      fontSize: '18px',
      fontFamily: 'Rajdhani, sans-serif',
      color: nameColor,
      stroke: '#0a0a14',
      strokeThickness: 4,
    });
    this.nameText.setOrigin(0.5, 0);
    this.nameText.setDepth(15);
    this.nameText.setAlpha(0);

    // Entrance: fade in at door
    this.scene.tweens.add({
      targets: [this.sprite, this.nameText],
      alpha: 1,
      scale: { from: 0.5, to: 1.5 },
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.walkToSeat();
      },
    });
  }

  walkToSeat() {
    this.isWalking = true;

    // Flip sprite to face walking direction
    if (this.seat.x < this.sprite.x) {
      this.sprite.setFlipX(true);
    }

    // Set walk frame
    this.setPoseFrame('walk');

    // Fixed 1s walk regardless of distance
    const duration = 1000;

    // Walk tween
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.seat.x,
      y: this.seat.y,
      duration,
      ease: 'Power2',
    });

    this.scene.tweens.add({
      targets: this.nameText,
      x: this.seat.x,
      y: this.seat.y + 6,
      duration,
      ease: 'Power1',
      onComplete: () => {
        this.onSeated();
      },
    });
  }

  onSeated() {
    this.isWalking = false;
    this.isSeated = true;
    this.sprite.setFlipX(!!this.seat.faceLeft);

    // Make interactive
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerover', () => {
      if (!this.destroyed) this.sprite.setTint(0x44ffff);
    });
    this.sprite.on('pointerout', () => {
      if (!this.destroyed) this.sprite.clearTint();
    });
    this.sprite.on('pointerdown', () => {
      if (!this.destroyed) {
        this.scene.events.emit('character-clicked', {
          sessionId: this.sessionId,
          x: this.sprite.x,
          y: this.sprite.y,
        });
      }
    });

    // Start pose cycling
    this.setPose(POSE.IDLE);
    this.schedulePoseChange();

    // Create speech bubble once seated
    if (BUBBLE_ENABLED) {
      this.speechBubble = new SpeechBubble(this.scene, this);
    }

    // Show music note if music is already playing when this character sits down
    if (this._pendingMusicNote) {
      this._pendingMusicNote = false;
      this.showMusicNote();
    }
  }

  setPose(pose) {
    this.currentPose = pose;
    this.setPoseFrame(pose);
  }

  /**
   * Set the visual frame for a pose.
   * Uses atlas frame names (char-idle-N, etc.) when real sprites are loaded,
   * falls back to numeric indices + rotation hacks for placeholders.
   */
  setPoseFrame(pose) {
    if (this.destroyed || !this.sprite) return;

    const textureKey = `character-${this.variant}`;
    const texture = this.scene.textures.get(textureKey);

    // Atlas frame names from the JSON atlas
    const atlasFrameMap = {
      [POSE.IDLE]: `char-idle-${this.variant}`,
      [POSE.DRINKING]: `char-drink-${this.variant}`,
      [POSE.LEANING]: `char-lean-${this.variant}`,
      [POSE.LOOKING]: `char-look-${this.variant}`,
      'walk': `char-idle-${this.variant}`,
    };

    const atlasFrame = atlasFrameMap[pose];
    let usedAtlas = false;

    if (texture && texture.has(atlasFrame)) {
      this.sprite.setFrame(atlasFrame);
      this.sprite.setRotation(0);
      usedAtlas = true;
    } else {
      // Fallback: placeholder pose differentiation via frame index
      const frameMap = {
        [POSE.IDLE]: 0,
        [POSE.DRINKING]: 1,
        [POSE.LEANING]: 2,
        [POSE.LOOKING]: 3,
        'walk': 0,
      };

      const frameIndex = frameMap[pose] ?? 0;

      if (texture && texture.frameTotal > 1) {
        this.sprite.setFrame(frameIndex % texture.frameTotal);
      }

      const baseFaceLeft = !!this.seat.faceLeft;
      switch (pose) {
        case POSE.DRINKING:
          this.sprite.setRotation(-0.05);
          this.sprite.setFlipX(baseFaceLeft);
          break;
        case POSE.LEANING:
          this.sprite.setRotation(0.08);
          this.sprite.setFlipX(baseFaceLeft);
          break;
        case POSE.LOOKING:
          this.sprite.setRotation(0);
          this.sprite.setFlipX(!baseFaceLeft);
          break;
        default:
          this.sprite.setRotation(0);
          this.sprite.setFlipX(baseFaceLeft);
          break;
      }
    }

    // Apply per-frame corrections for real sprites
    if (usedAtlas) {
      const poseKey = pose === 'walk' ? POSE.IDLE : pose;
      const correction = FRAME_CORRECTIONS[this.variant]?.[poseKey];
      this.sprite.setScale(1.5 * (correction?.scale ?? 1.0));

      if (this.isSeated) {
        this.sprite.y = this.seat.y + (correction?.offsetY ?? 0);
      }
    }
  }

  schedulePoseChange() {
    if (this.destroyed) return;

    const delay = Phaser.Math.Between(POSE_MIN_DURATION, POSE_MAX_DURATION);
    this.poseTimer = this.scene.time.delayedCall(delay, () => {
      if (this.destroyed || !this.isSeated) return;

      // Pick a random different pose
      const otherPoses = CHARACTER_POSES.filter((p) => p !== this.currentPose);
      const newPose = Phaser.Utils.Array.GetRandom(otherPoses);
      this.setPose(newPose);
      this.schedulePoseChange();
    });
  }

  /**
   * Play exit animation and destroy.
   */
  exit() {
    this.destroyed = true;

    if (this.poseTimer) {
      this.poseTimer.remove();
    }

    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = null;
    }

    if (this.musicNote) {
      if (this.musicNoteTween) this.musicNoteTween.stop();
      this.musicNote.destroy();
      this.musicNote = null;
      this.musicNoteTween = null;
    }

    if (this.sprite) {
      this.sprite.disableInteractive();
      this.scene.tweens.add({
        targets: [this.sprite, this.nameText].filter(Boolean),
        alpha: 0,
        duration: 500,
        onComplete: () => {
          this.sprite.destroy();
          if (this.nameText) this.nameText.destroy();
        },
      });
    }
  }

  /**
   * Set a hotkey letter and update the name label to show it.
   * @param {string} letter - Single letter hotkey (e.g. 'a')
   */
  setHotkey(letter) {
    this.hotkey = letter;
    if (this.nameText) {
      this.nameText.setText(`(${letter}) ${this.label}`);
    }
  }

  /**
   * Feed raw terminal output to the speech bubble for summary extraction.
   * @param {string} data - Raw PTY output chunk
   */
  onTerminalOutput(data) {
    if (this.speechBubble) {
      this.speechBubble.onTerminalOutput(data);
    }
  }

  /**
   * Show a small swaying music note next to the character.
   * Randomly picks left or right side each time.
   */
  showMusicNote() {
    if (this.destroyed || this.musicNote) return;
    if (!this.isSeated) {
      this._pendingMusicNote = true;
      return;
    }

    const side = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    const offsetX = side * 35;
    const noteX = this.sprite.x + offsetX;
    const noteY = this.sprite.y - 100;

    this.musicNote = this.scene.add.text(noteX, noteY, '\u266A', {
      fontSize: '22px',
      fontFamily: 'Rajdhani, sans-serif',
      color: '#ff0080',
      stroke: '#0a0a14',
      strokeThickness: 3,
    });
    this.musicNote.setOrigin(0.5, 0.5);
    this.musicNote.setDepth(12);
    this.musicNote.setAlpha(0);

    // Fade in
    this.scene.tweens.add({
      targets: this.musicNote,
      alpha: 1,
      duration: 300,
    });

    // Sway: oscillate rotation and y position
    this.musicNoteTween = this.scene.tweens.add({
      targets: this.musicNote,
      y: noteY - 6,
      rotation: { from: -0.25, to: 0.25 },
      duration: 600 + Phaser.Math.Between(0, 200),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Hide and destroy the music note. */
  hideMusicNote() {
    this._pendingMusicNote = false;
    if (!this.musicNote) return;

    if (this.musicNoteTween) {
      this.musicNoteTween.stop();
      this.musicNoteTween = null;
    }

    const note = this.musicNote;
    this.musicNote = null;

    this.scene.tweens.add({
      targets: note,
      alpha: 0,
      duration: 300,
      onComplete: () => note.destroy(),
    });
  }

  getPosition() {
    return { x: this.sprite?.x || 0, y: this.sprite?.y || 0 };
  }
}
