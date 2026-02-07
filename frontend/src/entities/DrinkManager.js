/**
 * DrinkManager — manages drink sprites for a character.
 * Drinks are placed on the table surface near the character.
 * Formula: drinkCount = floor(fileCount / 20)
 */

import { DRINK_OFFSETS } from '../config/seats.js';

const DRINK_FRAMES = ['drink-cyan', 'drink-pink', 'drink-amber', 'drink-purple'];

export default class DrinkManager {
  constructor(scene, character, seat) {
    this.scene = scene;
    this.character = character;
    this.seat = seat;
    this.sprites = [];
    this.currentCount = 0;
    this.useAtlas = scene.textures.exists('drinks');
  }

  /**
   * Update drink count — adds or removes drink sprites as needed.
   */
  setDrinkCount(count) {
    if (count === this.currentCount) return;

    if (count > this.currentCount) {
      this.addDrinks(count - this.currentCount);
    } else {
      this.removeDrinks(this.currentCount - count);
    }

    this.currentCount = count;
  }

  addDrinks(count) {
    const pos = this.seat.drinkAnchor || this.character.getPosition();

    for (let i = 0; i < count; i++) {
      const idx = this.sprites.length;
      const offset = this.getDrinkOffset(idx);

      const textureKey = this.useAtlas ? 'drinks' : 'drink';
      const frame = this.useAtlas ? DRINK_FRAMES[idx % DRINK_FRAMES.length] : undefined;

      const drink = this.scene.add.sprite(
        pos.x + offset.x,
        pos.y + offset.y,
        textureKey,
        frame
      );
      drink.setOrigin(0.5, 1);
      drink.setDepth(7);
      drink.setScale(0);

      // Pop-in animation
      this.scene.tweens.add({
        targets: drink,
        scale: 1,
        duration: 200,
        ease: 'Back.easeOut',
        delay: i * 100,
      });

      this.sprites.push(drink);
    }
  }

  removeDrinks(count) {
    for (let i = 0; i < count && this.sprites.length > 0; i++) {
      const drink = this.sprites.pop();
      this.scene.tweens.add({
        targets: drink,
        alpha: 0,
        scale: 0,
        duration: 200,
        onComplete: () => drink.destroy(),
      });
    }
  }

  getDrinkOffset(index) {
    if (index < DRINK_OFFSETS.length) {
      return DRINK_OFFSETS[index];
    }
    // Stack extra drinks with slight y offset
    const base = DRINK_OFFSETS[index % DRINK_OFFSETS.length];
    const stackLevel = Math.floor(index / DRINK_OFFSETS.length);
    return {
      x: base.x,
      y: base.y - (stackLevel * 8),
    };
  }

  destroy() {
    this.sprites.forEach((s) => s.destroy());
    this.sprites = [];
  }
}
