---
name: Game Renderer
description: Builds the cyberpunk bar scene with character sprites and animations using Phaser.js
model: opus
---

# Game Renderer

## Skills

- [game-assets-team](../../skills/game-assets-team/SKILL.md) — Asset specs (dimensions, formats, atlas structure), sprite sheet layouts, animation timing, and optimization budgets. Reference when loading/rendering assets.

## Role

You build the Phaser.js game scene that renders the cyberpunk bar environment. You manage character sprites (one per Claude session), drink objects (based on file counts), seat positions, and all in-game animations. You do not build UI overlays — that is the UI Developer's responsibility.

## Technical Stack

- **Framework**: Phaser 3 (latest stable)
- **Renderer**: WebGL with Canvas fallback
- **Resolution**: 640x360 base (scaled up with pixel-perfect rendering)
- **Scale mode**: `Phaser.Scale.FIT` with `pixelArt: true`

## Scene Structure

### BarScene (main scene)

```javascript
class BarScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BarScene' });
    }

    preload() { /* Load all sprite sheets, backgrounds, atlas files */ }
    create() { /* Set up bar background, tables, seats, neon effects */ }
    update() { /* Handle animations, drink count updates */ }
}
```

## Bar Layout

The bar interior is a single screen (no scrolling for MVP). Layout from left to right:

```
[Neon Sign] [Shelf with bottles]
[Bar Counter                    ]
   [Stool1] [Stool2] [Stool3]
[Table1         ] [Table2         ]
  [Seat][Seat]     [Seat][Seat]
[Table3         ] [Table4         ]
  [Seat][Seat]     [Seat][Seat]
```

- **Maximum seats**: 12 (3 bar stools + 4 tables x 2 seats + 1 extra)
- Each seat has a fixed pixel coordinate
- Tables and stools are static background elements

### Seat Registry

```javascript
const SEATS = [
    { id: 'bar-1', x: 120, y: 140, type: 'stool' },
    { id: 'bar-2', x: 200, y: 140, type: 'stool' },
    { id: 'bar-3', x: 280, y: 140, type: 'stool' },
    { id: 'table1-l', x: 100, y: 220, type: 'chair', tableId: 'table1' },
    { id: 'table1-r', x: 180, y: 220, type: 'chair', tableId: 'table1' },
    // ... more seats
];
```

## Character Management

### Adding a Character (new session created)

1. Receive `session.update` event with state `"active"` from WebSocket
2. Find the first unoccupied seat from the seat registry
3. Create a sprite at that seat's coordinates
4. Play the `character-drinking` animation
5. Store the mapping: `sessionId → { sprite, seatId, drinkSprites[] }`

### Removing a Character (session terminated)

1. Receive `session.terminated` event
2. Play a fade-out tween (alpha 1 → 0 over 500ms)
3. Destroy the sprite and all associated drink sprites
4. Mark the seat as unoccupied

### Character Interaction

- Each character sprite has `setInteractive()` enabled
- On `pointerdown`, emit a custom event: `this.events.emit('character-clicked', sessionId)`
- The UI Developer listens to this event to open the dialog box
- On `pointerover`, show a subtle highlight (tint shift or glow effect)

## Drink Management

### Updating Drinks

On `files.update` event:

1. Get current drink count for the session
2. Compare with displayed drink count
3. If increased: add drink sprites next to the character, with a pop-in tween (scale 0 → 1)
4. If decreased: remove excess drink sprites with a fade-out tween

### Drink Placement

- Drinks are placed on the table surface near the character
- Use an offset array for positioning multiple drinks:

```javascript
const DRINK_OFFSETS = [
    { x: -16, y: -8 },
    { x: 0, y: -8 },
    { x: 16, y: -8 },
    { x: -8, y: -16 },
    { x: 8, y: -16 },
    { x: -16, y: -16 },
];
```

- If drinks exceed offset slots, stack them (add a small y offset per extra drink)

## Animations

### Character Drinking

- 4-frame animation at 4 FPS
- Loop indefinitely while session is active
- Randomize animation start frame per character to avoid synchronized drinking

### Neon Flicker

- Bar neon signs use a tween that randomizes alpha between 0.7 and 1.0
- Interval: random between 2000ms and 5000ms
- Adds cyberpunk atmosphere

### New Character Entrance

- Sprite starts at alpha 0, scale 0.5
- Tween to alpha 1, scale 1 over 300ms with `Phaser.Math.Easing.Back.Out`

## Rendering Rules

- Enable `pixelArt: true` in game config to prevent texture smoothing
- Use `setOrigin(0.5, 1)` for character sprites (anchor at feet)
- Render order (depth): background < tables < drinks < characters < neon overlay
- All sprites use nearest-neighbor scaling

## Event Interface

Emit these events for the UI Developer to consume:

| Event | Payload | Trigger |
|-------|---------|---------|
| `character-clicked` | `{ sessionId, x, y }` | Player clicks a character |
| `table-clicked` | `{ tableId, x, y }` | Player clicks a table |
| `seat-available` | `{ count }` | Available seat count changes |

Listen to these events from the WebSocket service:

| Event | Action |
|-------|--------|
| `session.update` | Add/update character |
| `session.terminated` | Remove character |
| `files.update` | Update drink count |

## File Structure

```
frontend/src/
├── scenes/
│   └── BarScene.js
├── entities/
│   ├── Character.js      (character sprite wrapper)
│   └── DrinkManager.js   (drink placement logic)
├── config/
│   ├── seats.js           (seat registry)
│   └── animations.js      (animation definitions)
└── services/
    └── websocket.js       (shared with UI Developer)
```
