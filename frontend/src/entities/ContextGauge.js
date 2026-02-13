/**
 * ContextGauge — small Phaser Graphics bar above a character's name label
 * showing context window usage percentage.
 *
 * Pixel-perfect: fillRect + strokeRect, no anti-aliasing.
 * Colors follow the cyberpunk style guide palette.
 *
 * Uses a scene update listener to track the nameText position,
 * so the gauge follows the character during the walk tween.
 */

import contextTracker, { contextColorForPercentage, formatContextTokens } from '../services/contextTracker.js';

const BAR_W = 54;
const BAR_H = 5;

// Palette colors
const BG_COLOR = 0x0a0a14;
const BG_ALPHA = 0.7;
const BORDER_COLOR = 0x4a4a5e;
const BORDER_ALPHA = 0.5;

// Fill colors mapped from hex strings to numbers
const COLOR_MAP = {
  '#00f0ff': 0x00f0ff,
  '#ffaa00': 0xffaa00,
  '#ff0080': 0xff0080,
};

export default class ContextGauge {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} sessionId
   * @param {Phaser.GameObjects.Text} nameText - character's name label (positioning anchor)
   */
  constructor(scene, sessionId, nameText) {
    this.scene = scene;
    this.sessionId = sessionId;
    this.nameText = nameText;
    this.destroyed = false;
    this._pct = 0;
    this._colorHex = '#00f0ff';
    this._hasData = false;

    // Track last drawn position to avoid unnecessary redraws
    this._drawnX = -1;
    this._drawnY = -1;

    // Create graphics object
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(15);
    this.graphics.setAlpha(0);

    // Percentage label above the bar
    this.label = scene.add.text(0, 0, '', {
      fontSize: '11px',
      fontFamily: 'JetBrains Mono, monospace',
      color: '#00f0ff',
      stroke: '#0a0a14',
      strokeThickness: 3,
    });
    this.label.setOrigin(0.5, 1);
    this.label.setDepth(15);
    this.label.setAlpha(0);

    // Subscribe to context updates
    this.unsub = contextTracker.onChange((changedId) => {
      if (changedId === this.sessionId) this._onData();
    });

    // Scene update listener to follow nameText position
    this._updateHandler = () => this._followPosition();
    scene.events.on('update', this._updateHandler);
  }

  /** Called when contextTracker has new data. */
  _onData() {
    if (this.destroyed) return;

    const ctx = contextTracker.getContext(this.sessionId);
    if (!ctx) return;

    this._pct = ctx.percentage;
    this._colorHex = contextColorForPercentage(this._pct);

    // Update label text
    const tokenStr = formatContextTokens(ctx.totalTokens);
    this.label.setText(`${tokenStr}`);
    this.label.setColor(this._colorHex);

    // Fade in on first data
    if (!this._hasData) {
      this._hasData = true;
      this.scene.tweens.add({
        targets: [this.graphics, this.label],
        alpha: 0.9,
        duration: 400,
        ease: 'Power1',
      });
    }

    // Force redraw at current position
    this._drawnX = -1;
    this._drawnY = -1;
  }

  /** Called every frame to track nameText position. */
  _followPosition() {
    if (this.destroyed || !this._hasData) return;

    const x = Math.round(this.nameText.x);
    const y = Math.round(this.nameText.y);

    // Only redraw if position changed
    if (x === this._drawnX && y === this._drawnY) return;
    this._draw(x, y);
  }

  _draw(anchorX, anchorY) {
    this._drawnX = anchorX;
    this._drawnY = anchorY;

    const g = this.graphics;
    g.clear();

    const x = anchorX - BAR_W / 2;
    const y = anchorY - 8;

    // Background
    g.fillStyle(BG_COLOR, BG_ALPHA);
    g.fillRect(x, y, BAR_W, BAR_H);

    // Fill bar
    const fillW = Math.round((this._pct / 100) * BAR_W);
    if (fillW > 0) {
      const fillColor = COLOR_MAP[this._colorHex] || 0x00f0ff;
      g.fillStyle(fillColor, 0.85);
      g.fillRect(x, y, fillW, BAR_H);
    }

    // Border
    g.lineStyle(1, BORDER_COLOR, BORDER_ALPHA);
    g.strokeRect(x, y, BAR_W, BAR_H);

    // Position label above bar
    this.label.setPosition(anchorX, y - 2);
  }

  destroy() {
    this.destroyed = true;
    if (this.unsub) this.unsub();
    if (this._updateHandler) {
      this.scene.events.off('update', this._updateHandler);
      this._updateHandler = null;
    }
    if (this.graphics) this.graphics.destroy();
    if (this.label) this.label.destroy();
  }
}
