/**
 * Character entity — wraps a Phaser sprite representing a session patron.
 * Handles entrance walk animation, 4 sitting poses, and interactive behavior.
 *
 * Poses: idle, drinking, leaning, looking around
 * Characters randomly switch poses every 3-8 seconds for liveliness.
 */

import { POSE, CHARACTER_POSES, POSE_MIN_DURATION, POSE_MAX_DURATION, WALK_SPEED } from '../config/animations.js';
import { DOOR_POSITION } from '../config/seats.js';

export default class Character {
  constructor(scene, sessionId, seat, label, agentType = 'claude') {
    this.scene = scene;
    this.sessionId = sessionId;
    this.seat = seat;
    this.label = label;
    this.agentType = agentType;
    this.sprite = null;
    this.nameText = null;
    this.agentBadge = null;
    this.currentPose = POSE.IDLE;
    this.poseTimer = null;
    this.isWalking = false;
    this.isSeated = false;
    this.destroyed = false;

    // Pick a random character variant (for visual diversity)
    this.variant = Phaser.Math.Between(0, 3);
  }

  create() {
    const textureKey = `character-${this.variant}`;

    // Create sprite at the door position
    this.sprite = this.scene.add.sprite(DOOR_POSITION.x, DOOR_POSITION.y, textureKey);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setScale(1.5);
    this.sprite.setDepth(10);
    this.sprite.setAlpha(0);

    // Name label above character
    this.nameText = this.scene.add.text(DOOR_POSITION.x, DOOR_POSITION.y - 204, this.label, {
      fontSize: '24px',
      fontFamily: 'Rajdhani, sans-serif',
      color: '#00f0ff',
      stroke: '#0a0a14',
      strokeThickness: 6,
    });
    this.nameText.setOrigin(0.5, 1);
    this.nameText.setDepth(15);
    this.nameText.setAlpha(0);

    // Agent type badge below name
    const badgeColor = this.agentType === 'codex' ? '#00a0ff' : '#ffaa00';
    const badgeLabel = this.agentType === 'codex' ? 'CODEX' : 'CLAUDE';
    this.agentBadge = this.scene.add.text(DOOR_POSITION.x, DOOR_POSITION.y - 180, badgeLabel, {
      fontSize: '14px',
      fontFamily: 'JetBrains Mono, monospace',
      fontStyle: 'bold',
      color: badgeColor,
      stroke: '#0a0a14',
      strokeThickness: 4,
    });
    this.agentBadge.setOrigin(0.5, 1);
    this.agentBadge.setDepth(15);
    this.agentBadge.setAlpha(0);

    // Entrance: fade in at door
    this.scene.tweens.add({
      targets: [this.sprite, this.nameText, this.agentBadge],
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

    const distance = Phaser.Math.Distance.Between(
      this.sprite.x, this.sprite.y,
      this.seat.x, this.seat.y
    );
    const duration = (distance / WALK_SPEED) * 1000;

    // Walk tween
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.seat.x,
      y: this.seat.y,
      duration: Math.max(duration, 400),
      ease: 'Power1',
    });

    this.scene.tweens.add({
      targets: this.nameText,
      x: this.seat.x,
      y: this.seat.y - 204,
      duration: Math.max(duration, 400),
      ease: 'Power1',
      onComplete: () => {
        this.onSeated();
      },
    });

    this.scene.tweens.add({
      targets: this.agentBadge,
      x: this.seat.x,
      y: this.seat.y - 180,
      duration: Math.max(duration, 400),
      ease: 'Power1',
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
    if (texture && texture.has(atlasFrame)) {
      this.sprite.setFrame(atlasFrame);
      this.sprite.setRotation(0);
      return;
    }

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

    if (this.sprite) {
      this.sprite.disableInteractive();
      this.scene.tweens.add({
        targets: [this.sprite, this.nameText, this.agentBadge].filter(Boolean),
        alpha: 0,
        duration: 500,
        onComplete: () => {
          this.sprite.destroy();
          if (this.nameText) this.nameText.destroy();
          if (this.agentBadge) this.agentBadge.destroy();
        },
      });
    }
  }

  getPosition() {
    return { x: this.sprite?.x || 0, y: this.sprite?.y || 0 };
  }
}
