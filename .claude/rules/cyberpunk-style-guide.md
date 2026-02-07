---
name: Cyberpunk Style Guide
description: Visual style constraints ensuring consistent cyberpunk pixel art across all game assets
---

# Cyberpunk Style Guide

## Applicability

- Applies to: `art-producer`, `game-renderer`, `ui-developer`

## Rule Content

### Color Palette

All visual assets must use only these color groups:

| Role | Hex | Usage |
|------|-----|-------|
| Base dark | `#0a0a14` | Background, deep shadows |
| Panel dark | `#1a1a2e` | UI panels, secondary backgrounds |
| Surface gray | `#4a4a5e` | Metallic surfaces, counters, tables |
| Light gray | `#8888aa` | Secondary text, inactive elements |
| Neon cyan | `#00f0ff` | Primary neon, borders, highlights |
| Neon pink | `#ff0080` | Accent neon, signs, alerts |
| Electric purple | `#8040c0` | Hair highlights, decorative elements |
| Deep purple | `#2a1052` | Shadows, atmospheric lighting |
| Warm amber | `#ffaa00` | Drink glow, warm light sources |
| Text white | `#e0e0e0` | Primary text, bright highlights |
| Skin tone | `#d4a574` | Character skin |
| Dark clothing | `#2a2a3a` | Character jackets, pants |

Adding colors outside this palette requires explicit justification and coordinator approval.

### Pixel Art Constraints

- No anti-aliasing on any sprite or tile edge
- No gradient fills — use dithering (checkerboard pattern) for transitions
- No sub-pixel rendering
- All sprites must be pixel-aligned (no fractional coordinates)
- Neon glow is represented as a 1-pixel bright outline, not a blur effect
- Shadows are solid darker pixels, never transparency-based

### Character Proportions

- Chibi style: head is approximately 40% of total body height
- Base frame size: 32x64 pixels
- All characters share the same base skeleton for animation consistency
- Differentiate characters by: hair style, hair color, clothing color, accessories

### UI Elements

- All dialog panels use `#1a1a2e` background with `#00f0ff` 1px border
- Corner decorations: small diagonal neon accents (2-3 pixels)
- Buttons: dark background with neon border, brighter on hover
- Fonts in the game canvas: pixel font only. Fonts in HTML overlay: `JetBrains Mono` for code, `Rajdhani` for UI labels

### Scene Composition

- Background layer: static, full-scene image
- Furniture layer: tables, chairs, counter (depth 1-5)
- Object layer: drinks, items on tables (depth 6-9)
- Character layer: sitting characters (depth 10-14)
- Effect layer: neon flicker overlays (depth 15-19)
- UI layer: HTML overlay (above canvas)

## Violation Determination

- Using a color not in the defined palette without coordinator approval → Violation
- Sprite with anti-aliased or blurred edges → Violation
- Character not following chibi proportions (head < 35% or > 45% of body) → Violation
- UI panel using a border color other than `#00f0ff` → Violation
- Depth ordering not following the defined layer structure → Violation

## Exceptions

- The HTML overlay layer (terminal text, file browser) may use standard system fonts for readability, but must still follow the color palette for backgrounds and borders
