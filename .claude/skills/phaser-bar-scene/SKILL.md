---
name: Phaser Bar Scene
description: Phaser.js patterns for building the pixel art bar game scene with sprites and UI overlays
---

# Phaser Bar Scene

## Purpose

Provide reusable Phaser.js patterns specific to the Claude Bar Game: pixel-perfect rendering, sprite management, DOM overlay integration, and WebSocket-driven state updates.

## Game Configuration

```javascript
const config = {
    type: Phaser.AUTO,
    width: 640,
    height: 360,
    pixelArt: true,              // Disable anti-aliasing for crisp pixels
    roundPixels: true,            // Prevent sub-pixel rendering
    scale: {
        mode: Phaser.Scale.FIT,   // Scale to fit container
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BarScene],
    parent: 'game-container',     // DOM element ID
    backgroundColor: '#0a0a14'
};

const game = new Phaser.Game(config);
```

## Loading Assets with Atlas

```javascript
preload() {
    // Sprite sheet with JSON atlas
    this.load.atlas(
        'character-drink',
        'assets/sprites/characters/character-drink.png',
        'assets/sprites/characters/character-drink.json'
    );

    // Static image
    this.load.image('bar-bg', 'assets/backgrounds/bar-interior.png');
    this.load.image('drink', 'assets/sprites/objects/drink.png');
}
```

## Creating Animations from Config

```javascript
create() {
    // Load animation configs from JSON
    const animConfigs = this.cache.json.get('animations');
    animConfigs.forEach(anim => {
        this.anims.create({
            key: anim.key,
            frames: anim.frames.map(f => ({ key: 'character-drink', frame: f })),
            frameRate: anim.frameRate,
            repeat: anim.repeat
        });
    });
}
```

## Sprite with Interactive Click

```javascript
addCharacter(sessionId, seatX, seatY) {
    const sprite = this.add.sprite(seatX, seatY, 'character-drink');
    sprite.setOrigin(0.5, 1);        // Anchor at feet
    sprite.setInteractive({ useHandCursor: true });
    sprite.setDepth(10);              // Above tables, below UI

    // Randomize start frame to avoid synchronized animation
    sprite.anims.play({ key: 'character-drinking', startFrame: Phaser.Math.Between(0, 3) });

    sprite.on('pointerdown', () => {
        this.events.emit('character-clicked', { sessionId, x: seatX, y: seatY });
    });

    sprite.on('pointerover', () => {
        sprite.setTint(0x44ffff);     // Cyan highlight
    });

    sprite.on('pointerout', () => {
        sprite.clearTint();
    });

    return sprite;
}
```

## Entrance Tween (New Character)

```javascript
animateEntrance(sprite) {
    sprite.setAlpha(0);
    sprite.setScale(0.5);
    this.tweens.add({
        targets: sprite,
        alpha: 1,
        scale: 1,
        duration: 300,
        ease: 'Back.easeOut'
    });
}
```

## DOM Overlay Integration

Phaser and HTML overlays share a common event bus:

```javascript
// In BarScene — emit event for DOM layer
this.events.emit('character-clicked', { sessionId, x, y });

// In DOM layer — listen to Phaser events
const scene = game.scene.getScene('BarScene');
scene.events.on('character-clicked', ({ sessionId }) => {
    openDialog(sessionId);
});
```

## Example: Full Scene Setup

```javascript
class BarScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BarScene' });
        this.characters = new Map(); // sessionId → { sprite, drinks[] }
    }

    preload() {
        this.load.image('bar-bg', 'assets/backgrounds/bar-interior.png');
        this.load.atlas('character', 'assets/sprites/characters/character-drink.png',
                        'assets/sprites/characters/character-drink.json');
        this.load.image('drink', 'assets/sprites/objects/drink.png');
    }

    create() {
        // Background
        this.add.image(320, 180, 'bar-bg').setDepth(0);

        // Register animations
        this.anims.create({
            key: 'drinking',
            frames: this.anims.generateFrameNames('character', {
                prefix: 'character-drink-', start: 0, end: 3
            }),
            frameRate: 4,
            repeat: -1
        });

        // Listen to WebSocket events (injected via registry)
        const ws = this.registry.get('websocket');
        ws.on('session.update', (data) => this.handleSessionUpdate(data));
        ws.on('session.terminated', (data) => this.handleSessionTerminated(data));
        ws.on('files.update', (data) => this.handleFilesUpdate(data));
    }
}
```
