---
name: Sprite Pipeline
description: Processes AI-generated images into game-ready sprite sheets and animation configs
---

# Sprite Pipeline

## Purpose

Transform raw AI-generated pixel art images into Phaser.js-compatible sprite sheets, texture atlases, and animation configuration files.

## Pipeline Steps

### Step 1: Validate Input Image

Check the generated image against specifications:

```bash
# Using ImageMagick
identify -format "%wx%h %[colorspace] %[type]" input.png
# Expected: "128x64 sRGB TrueColor" (for a 4-frame 32x64 sprite sheet)
```

Validation rules:
- Dimensions must match the prompt specification exactly
- Image must be PNG format with alpha channel
- Color count must not exceed the specified palette limit

### Step 2: Color Quantization (when input image exceeds the palette color limit)

Reduce colors to the target palette:

```javascript
// Using Sharp (Node.js)
const sharp = require('sharp');

async function quantize(inputPath, outputPath, maxColors) {
    await sharp(inputPath)
        .png({ palette: true, colours: maxColors, dither: 0 })
        .toFile(outputPath);
}
```

### Step 3: Generate Texture Atlas JSON

For sprite sheets with multiple frames, produce a Phaser-compatible atlas:

```javascript
function generateAtlas(spriteKey, frameWidth, frameHeight, frameCount) {
    const frames = {};
    for (let i = 0; i < frameCount; i++) {
        frames[`${spriteKey}-${i}`] = {
            frame: { x: i * frameWidth, y: 0, w: frameWidth, h: frameHeight }
        };
    }
    return {
        frames,
        meta: {
            image: `${spriteKey}.png`,
            size: { w: frameWidth * frameCount, h: frameHeight },
            scale: 1
        }
    };
}
```

### Example

Input: `character-drink.png` (128x64, 4 frames of 32x64)

Output `character-drink.json`:

```json
{
    "frames": {
        "character-drink-0": { "frame": { "x": 0, "y": 0, "w": 32, "h": 64 } },
        "character-drink-1": { "frame": { "x": 32, "y": 0, "w": 32, "h": 64 } },
        "character-drink-2": { "frame": { "x": 64, "y": 0, "w": 32, "h": 64 } },
        "character-drink-3": { "frame": { "x": 96, "y": 0, "w": 32, "h": 64 } }
    },
    "meta": {
        "image": "character-drink.png",
        "size": { "w": 128, "h": 64 },
        "scale": 1
    }
}
```

### Step 4: Generate Animation Config

```javascript
function generateAnimConfig(key, spriteKey, frameCount, frameRate, repeat) {
    return {
        key: key,
        frames: Array.from({ length: frameCount }, (_, i) => `${spriteKey}-${i}`),
        frameRate: frameRate,
        repeat: repeat  // -1 for infinite loop
    };
}
```

Output `animations.json`:

```json
[
    {
        "key": "character-drinking",
        "frames": ["character-drink-0", "character-drink-1", "character-drink-2", "character-drink-3"],
        "frameRate": 4,
        "repeat": -1
    }
]
```

## Batch Processing Script

```bash
#!/bin/bash
# process-sprites.sh — Run after all images are generated

ASSETS_DIR="./assets/sprites"

# Validate all images
for img in "$ASSETS_DIR"/**/*.png; do
    echo "Validating: $img"
    node scripts/validate-sprite.js "$img"
done

# Generate atlas files
node scripts/generate-atlases.js "$ASSETS_DIR"

# Generate animation configs
node scripts/generate-animations.js "$ASSETS_DIR"

echo "Sprite pipeline complete."
```

## Output Directory Structure

```
assets/sprites/
├── characters/
│   ├── character-drink.png        ← raw sprite sheet
│   ├── character-drink.json       ← texture atlas
│   └── character-drink-anims.json ← animation config
├── objects/
│   ├── drinks.png
│   └── drinks.json
└── ui/
    ├── dialog-frame.png
    └── dialog-frame.json
```
