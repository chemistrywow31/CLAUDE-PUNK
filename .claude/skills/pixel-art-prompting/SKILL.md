---
name: Pixel Art Prompting
description: Generates AI image generation prompts for cyberpunk pixel art game assets
---

# Pixel Art Prompting

## Purpose

Produce structured prompts that the user can paste into AI image generation tools (e.g., Gemini, Midjourney, DALL-E) to create consistent cyberpunk pixel art assets for the Claude Bar Game.

## Prompt Template

Use this template for every asset prompt:

```
[SUBJECT]: {Exact description of the asset}
[STYLE]: Pixel art, {tile_size} pixels, cyberpunk theme, limited color palette ({max_colors} colors)
[DIMENSIONS]: {width}x{height} pixels total canvas
[LAYOUT]: {Single image / Horizontal strip of N frames / Grid NxN}
[COLORS]: {Specific palette requirements — neon cyan, electric purple, dark navy, warm amber, etc.}
[BACKGROUND]: Transparent / {Color}
[CONSTRAINTS]: No anti-aliasing, no gradients, no sub-pixel rendering, crisp pixel edges only, no blurring
[REFERENCE]: {Optional style reference — "similar to classic SNES RPG sprites" etc.}
```

## Examples

### Input: Background asset for the bar interior

### Output:

```
[SUBJECT]: Interior of a cyberpunk bar viewed from the front. Features a long bar counter
with 3 stools, 4 small tables with 2 chairs each, neon signs on the walls reading
"CYBER" and "BAR", glowing bottles on shelves behind the counter, ceiling has exposed
pipes and dim purple lighting, floor is dark metallic tiles.
[STYLE]: Pixel art, 16x16 tile base, cyberpunk theme, limited color palette (24 colors)
[DIMENSIONS]: 640x360 pixels total canvas
[LAYOUT]: Single image
[COLORS]: Deep purple (#2a1052) for shadows, electric cyan (#00f0ff) for neon,
neon pink (#ff0080) for accent lights, dark navy (#0a0a14) for base,
warm amber (#ffaa00) for drink glow, metallic gray (#4a4a5e) for surfaces
[BACKGROUND]: Dark navy (#0a0a14)
[CONSTRAINTS]: No anti-aliasing, no gradients, no sub-pixel rendering, crisp pixel edges
only, no blurring. Every element must be pixel-aligned.
[REFERENCE]: Similar to VA-11 Hall-A or Coffee Talk pixel art bar scenes
```

### Input: Character sprite sheet for drinking animation

### Output:

```
[SUBJECT]: A cyberpunk character sitting on a stool, drinking from a glowing cocktail glass.
4-frame animation sequence: (1) sitting idle holding glass at table, (2) lifting glass toward
mouth, (3) tilting glass while drinking, (4) lowering glass back to table.
Character wears a dark jacket with neon cyan trim, has short spiky hair with purple highlights.
[STYLE]: Pixel art, 32x64 per frame, cyberpunk theme, limited color palette (16 colors)
[DIMENSIONS]: 128x64 pixels total canvas (4 frames side by side)
[LAYOUT]: Horizontal strip of 4 frames, each 32x64
[COLORS]: Dark gray (#2a2a3a) for jacket, neon cyan (#00f0ff) for trim and glass glow,
skin tone (#d4a574), purple (#8040c0) for hair highlights, amber (#ffaa00) for drink liquid
[BACKGROUND]: Transparent
[CONSTRAINTS]: No anti-aliasing, no gradients, no sub-pixel rendering, crisp pixel edges only.
Each frame must have the character in the exact same seated position with only arms and glass moving.
[REFERENCE]: Similar to classic 16-bit RPG character sprites (Chrono Trigger, Final Fantasy VI)
```

## Style Consistency Rules

- Always reference the same base color palette across all prompts
- Character proportions: chibi style, head is ~40% of body height
- All sprites use the same pixel density (1 pixel = 1 pixel, no mixed resolutions)
- Neon glow effects are represented by 1-pixel bright outlines, not actual glow/blur
- Shadows are solid darker pixels, not transparency-based
