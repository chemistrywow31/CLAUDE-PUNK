# Claude Punk — Art Asset Prompts

All generated images should be placed in the corresponding file paths listed below.
The frontend currently uses procedurally generated placeholder textures and will
automatically use real assets once they're placed in the correct locations.

---

## Color Palette Reference

Use these colors consistently across ALL assets:

| Role | Hex |
|------|-----|
| Base dark | `#0a0a14` |
| Panel dark | `#1a1a2e` |
| Surface gray | `#4a4a5e` |
| Neon cyan | `#00f0ff` |
| Neon pink | `#ff0080` |
| Electric purple | `#8040c0` |
| Deep purple | `#2a1052` |
| Warm amber | `#ffaa00` |
| Text white | `#e0e0e0` |
| Skin tone | `#d4a574` |
| Dark clothing | `#2a2a3a` |

---

## 1. Bar Interior Background (2.5D Isometric)

**File**: `assets/backgrounds/bar-interior.png`
**Dimensions**: 1920x1080 pixels
**Format**: PNG with no alpha channel

**What this image contains**: The full static bar interior — room shell, all furniture,
bottles, and decorative elements. Everything that does NOT move or change at runtime.

The following are rendered separately by the game engine and must NOT appear in this image:
- Neon sign "CLAUDE PUNK" text (animated flicker — separate sprite overlay)
- Door panel (interactive clickable sprite — only the door FRAME should be drawn)
- Bartender (animated character sprite)
- Patron characters (animated sprites, they sit on stools/chairs)
- Drinks on tables (dynamic, managed by code)

**Prompt**:
```
Pixel art cyberpunk bar interior, TRUE 2.5D isometric perspective (3/4 top-down
oblique view), 1920x1080 pixels. The camera looks down at approximately 30 degrees
from above, slightly to the right. This image contains the FULL STATIC SCENE —
room structure plus all furniture, shelves, and bottles. No people, no door panel,
no neon sign text, no drinks on tables.

ROOM STRUCTURE:
- BACK WALL (top ~30%): Dark wall (#0a0a14) receding slightly from left to right.
  A RECTANGULAR DARK METAL MOUNTING PLATE (#12121f) centered on the wall (for a
  neon sign that is overlaid separately — do NOT draw any text or neon tubes on it).
  Wall paneling with subtle vertical dark strips (#0e0e1a) for texture.
- LEFT WALL (visible): A narrow strip of the left wall recedes into the back-left
  corner, establishing 3D depth. Slightly lighter shade (#0c0c1a).
- RIGHT WALL: A receding side wall (#080814) showing depth. A DOOR FRAME is cut
  into the wall (empty dark rectangle #0a0a14 with gray metal frame #4a4a5e) — but
  NO door panel inside the frame (the door is a separate interactive sprite). A small
  mounting bracket above the frame where an "ENTER" sign would go.
- FLOOR AREA (lower ~60%): Diamond/rhombus floor tiles in alternating dark shades
  (#16162a, #1e1e34) with slight rightward skew per row for perspective convergence.
  Subtle cyan (#00f0ff, very low opacity) and pink (#ff0080, very low opacity) neon
  light reflections on the floor tiles, as if cast by unseen neon sources above.
- CEILING: Dark strip (#050510) at the very top.

SHELF WITH BOTTLES (on back wall, below the mounting plate):
- A long horizontal shelf bracket (gray metal #3a3a4e top surface, #2a2a3a front
  face), running from roughly x:240 to x:1260.
- 8 bottles sitting on the shelf, evenly spaced. Each bottle is a small upright
  rectangle with a neck. Alternate colors: neon pink (#ff0080), cyan (#00f0ff),
  amber (#ffaa00), electric purple (#8040c0), repeating. Bottles have a subtle
  glow halo (1-2 bright pixels around them) matching their color.

L-SHAPED BAR COUNTER (the main serving area):
- Horizontal section runs from x:240 to x:1440, front edge at roughly y:540.
  The counter is an isometric slab: lighter top surface (#5a5a6e) visible from
  above, darker front face (#3a3a4e) visible below.
- A thin cyan neon strip (#00f0ff, 1px) runs along the front top edge.
- A faint pink neon strip (#ff0080, very low opacity) runs along the bottom of
  the front face.
- L-arm extends downward on the LEFT side from x:240 to x:324, from y:540 to
  y:720, enclosing the bartender work area.
- The counter has visible thickness (front face ~54px tall).

4 BAR STOOLS (in front of the counter, where patrons sit):
- Positioned at approximately x:510, x:780, x:1050, x:1320, y:648.
- Each stool: isometric diamond seat (#5a5a6e top, #4a4a5e front face), single
  center leg (#2a2a3a), two small feet, and a foot rest bar (#3a3a4e).
- Stools are EMPTY (no people sitting on them).

6 TABLES with CHAIRS (arranged in a 3x2 grid on the floor):
- Row 1 (y~790): tables centered at x:400, x:760, x:1120.
- Row 2 (y~950): tables centered at x:400, x:760, x:1120.
- Each table: isometric diamond top (#55556a), visible front face (#3a3a4e) and
  right face (#444458), 4 legs (#2a2a3a). A thin cyan neon accent (#00f0ff,
  very low opacity) outlines the diamond top edge.
- Each table has 2 chairs flanking it (left and right, offset ~174px from center).
  Chairs: small isometric diamond seat (#4a4a5e), small backrest (#3a3a4e), single
  leg (#2a2a3a). Chairs are EMPTY.
- Tables have NO drinks on them (drinks are placed dynamically by the game).

CRITICAL STYLE RULES:
- Include ALL furniture (counter, stools, tables, chairs, shelf, bottles)
- Do NOT include people, door panel, neon sign text, or drinks on tables
- Every surface is an ISOMETRIC SHAPE (parallelogram), not axis-aligned
- Walls show 2 faces where visible (front + side)
- Floor tiles are diamonds/rhombuses, not squares
- Lines going "into" the scene angle slightly downward-right
- Strict pixel art, NO anti-aliasing, NO gradients, NO blur
- Neon glow = extra bright pixels, NOT transparency gradients
- Color palette: #0a0a14, #1a1a2e, #16162a, #1e1e34, #4a4a5e, #5a5a6e, #3a3a4e,
  #0c0c1a, #080814, #55556a, #444458, #2a2a3a, #333344
  Neon accents: #00f0ff, #ff0080, #ffaa00, #8040c0 (on bottles and subtle reflections)
- References: VA-11 Hall-A bar interior, Coffee Talk, Hyper Light Drifter environments
```

---

## 2. Character Sprite Sheets (8 variants)

Each character has 4 frames arranged horizontally for 4 sitting poses.
**IMPORTANT**: Characters must be drawn as CHARACTER ONLY — no chairs, stools,
tables, or any furniture. The background already contains all furniture.
The character should appear to be in a sitting pose but with nothing underneath them.

- Frame 0: **Idle sitting** — relaxed posture, looking forward
- Frame 1: **Drinking** — arm raised with glass near mouth
- Frame 2: **Leaning** — leaning on arm, casual pose
- Frame 3: **Looking around** — head turned slightly, curious expression

### Character Variant 0 (Purple Hair)

**File**: `assets/sprites/characters/character-0.png`
**Atlas**: `assets/sprites/characters/character-0.json`
**Dimensions**: 128x64 pixels (4 frames x 32x64 each)

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip.
Cyberpunk chibi character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture of any kind. Large head (~40% body height).
Purple hair (#8040c0), light skin (#d4a574), dark jacket (#2a2a3a).
White eyes on dark face.
Frame 1: sitting idle, arms resting. Frame 2: drinking from glowing glass,
arm raised. Frame 3: leaning on one arm, relaxed. Frame 4: head turned sideways, looking around.
Style: strict pixel art, no anti-aliasing, no gradients, 1px outlines.
Dark background transparent (alpha channel).
```

### Character Variant 1 (Cyan Hair)

**File**: `assets/sprites/characters/character-1.png`
**Atlas**: `assets/sprites/characters/character-1.json`
**Dimensions**: 128x64 pixels

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip.
Cyberpunk chibi character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture. Large head (~40% body height).
Bright cyan hair (#00f0ff), light skin (#d4a574), dark green-tinted jacket (#2a3a2a).
White eyes on dark face.
Frame 1: sitting idle. Frame 2: drinking from neon cocktail.
Frame 3: leaning back casually. Frame 4: looking to the side curiously.
Style: strict pixel art, no anti-aliasing, transparent background.
```

### Character Variant 2 (Pink Hair)

**File**: `assets/sprites/characters/character-2.png`
**Atlas**: `assets/sprites/characters/character-2.json`
**Dimensions**: 128x64 pixels

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip.
Cyberpunk chibi character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture. Large head (~40% body height).
Neon pink hair (#ff0080), slightly darker skin (#c49464), dark red-tinted jacket (#3a2a2a).
Frame 1: idle sitting. Frame 2: sipping from glowing cocktail.
Frame 3: leaning forward, relaxed. Frame 4: turning head to look at something.
Strict pixel art, no smoothing, transparent background.
```

### Character Variant 3 (Amber/Gold Hair)

**File**: `assets/sprites/characters/character-3.png`
**Atlas**: `assets/sprites/characters/character-3.json`
**Dimensions**: 128x64 pixels

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip.
Cyberpunk chibi character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture. Large head (~40% body height).
Warm amber/gold hair (#ffaa00), warm skin (#b48454), dark blue-tinted jacket (#2a2a4a).
Frame 1: sitting relaxed. Frame 2: drinking neon cocktail.
Frame 3: leaning on arm, looking content. Frame 4: glancing around the bar.
Strict pixel art, no anti-aliasing, transparent background.
```

### Character Variant 4 (Green Hair)

**File**: `assets/sprites/characters/character-4.png`
**Atlas**: `assets/sprites/characters/character-4.json`
**Dimensions**: 128x64 pixels

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip.
Cyberpunk chibi character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture. Large head (~40% body height).
Bright green hair (#40c080), light skin (#d4a574), dark purple-tinted jacket (#3a2a3a).
Frame 1: sitting idle, relaxed. Frame 2: raising a neon cocktail to drink.
Frame 3: leaning sideways on one arm. Frame 4: head turned, scanning the room.
Strict pixel art, no anti-aliasing, transparent background.
```

### Character Variant 5 (Red Hair)

**File**: `assets/sprites/characters/character-5.png`
**Atlas**: `assets/sprites/characters/character-5.json`
**Dimensions**: 128x64 pixels

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip.
Cyberpunk chibi character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture. Large head (~40% body height).
Fiery red hair (#f04040), slightly darker skin (#c49464), dark charcoal jacket (#2a2a2a).
Frame 1: sitting idle, arms resting. Frame 2: sipping from a glowing glass.
Frame 3: leaning back casually. Frame 4: looking around with curiosity.
Strict pixel art, no anti-aliasing, transparent background.
```

### Character Variant 6 (Blue Hair)

**File**: `assets/sprites/characters/character-6.png`
**Atlas**: `assets/sprites/characters/character-6.json`
**Dimensions**: 128x64 pixels

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip.
Cyberpunk chibi character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture. Large head (~40% body height).
Electric blue hair (#6060ff), warm skin (#b48454), dark olive-tinted jacket (#3a3a2a).
Frame 1: sitting idle. Frame 2: drinking from glowing cocktail.
Frame 3: leaning forward on one arm. Frame 4: head turned, watching something.
Strict pixel art, no anti-aliasing, transparent background.
```

### Character Variant 7 (Silver/White Hair)

**File**: `assets/sprites/characters/character-7.png`
**Atlas**: `assets/sprites/characters/character-7.json`
**Dimensions**: 128x64 pixels

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip.
Cyberpunk chibi character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture. Large head (~40% body height).
Silver/white hair (#e0e0e0), light skin (#d4a574), dark teal-tinted jacket (#2a3a3a).
Frame 1: sitting idle, calm expression. Frame 2: raising glowing drink.
Frame 3: leaning to one side, relaxed. Frame 4: looking sideways curiously.
Strict pixel art, no anti-aliasing, transparent background.
```

### Atlas JSON Template (same structure for all 8 variants)

Place this as `character-{N}.json` next to each PNG, replacing `{N}` with the variant number:

```json
{
  "frames": {
    "char-idle-{N}":  { "frame": { "x": 0,  "y": 0, "w": 32, "h": 64 } },
    "char-drink-{N}": { "frame": { "x": 32, "y": 0, "w": 32, "h": 64 } },
    "char-lean-{N}":  { "frame": { "x": 64, "y": 0, "w": 32, "h": 64 } },
    "char-look-{N}":  { "frame": { "x": 96, "y": 0, "w": 32, "h": 64 } }
  },
  "meta": {
    "image": "character-{N}.png",
    "size": { "w": 128, "h": 64 },
    "scale": 1
  }
}
```

---

## 3. Door Sprite Sheet (4-Frame Hover Animation)

**File**: `assets/sprites/objects/door.png`
**Dimensions**: 480x240 pixels (4 frames × 120x240 each, game-ready at 1920x1080)
**Format**: PNG with alpha
**Layout**: Horizontal strip, 4 frames left-to-right

**Prompt**:
```
Pixel art cyberpunk sliding door sprite sheet, 4 frames in a horizontal strip on a solid bright green (#00ff00) background.
Each frame is 120x240 pixels. The door progressively cracks open from left to right.
IMPORTANT: The bright green (#00ff00) is the chroma key color — use it for ALL areas that should become
transparent: the background around the door AND the visible gap/crack when the door opens.

Frame 1 (idle): Door fully closed. Dark metal panels (#2a2a3a), gray metallic frame (#4a4a5e).
  Dim neon cyan (#00f0ff) 1-pixel border. Amber (#ffaa00) door handle on right. Dim pink (#ff0080) "ENTER" sign above.
  No crack — door fully sealed. Green background visible only around the door exterior.

Frame 2 (slight crack): Door panel shifts left ~4px, revealing a thin gap on the right edge.
  The gap is filled with bright green (#00ff00) — this will become see-through in-game.
  Thin cyan (#00f0ff) glow line along the crack edges. Neon border slightly brighter.

Frame 3 (opening): Door panel shifts left ~10px, wider green (#00ff00) gap visible through the crack.
  Cyan glow lines on both edges of the gap. Double neon border glow. Handle has a warm amber halo.

Frame 4 (fully open): Door panel shifted left ~18px, wide green (#00ff00) gap showing through.
  The player sees through the door opening in-game. Bright cyan edge glow.
  Maximum neon glow, handle halo, "ENTER" sign at full brightness.

Style: crisp pixel art, hard edges, no anti-aliasing, no gradients, no blur.
The background must be pure solid bright green (#00ff00) with no patterns or textures.
Do NOT use any green (#00ff00) on the door itself — only for transparent areas.
```

**Post-processing**: Replace bright green (#00ff00) with transparency. Final sheet: 480x240.

---

## 4. Drink Sprites

**File**: `assets/sprites/objects/drinks.png`
**Atlas**: `assets/sprites/objects/drinks.json`
**Dimensions**: 48x14 pixels (4 drink variants x 12x14 each)

**Prompt**:
```
Pixel art sprite sheet, 48x14 pixels total, 4 small cocktail glasses in a row.
Each glass is 12x14 pixels. Cyberpunk neon-lit cocktail glasses.
Variant 1: cyan glowing drink (#00f0ff) in clear glass.
Variant 2: pink glowing drink (#ff0080) in tall glass.
Variant 3: amber glowing drink (#ffaa00) in short tumbler.
Variant 4: purple glowing drink (#8040c0) in martini glass.
Each has a 1-pixel neon glow outline. Gray stem/base (#4a4a5e).
Dark background transparent. Strict pixel art, no smoothing.
```

### Drinks Atlas JSON

```json
{
  "frames": {
    "drink-cyan":   { "frame": { "x": 0,  "y": 0, "w": 12, "h": 14 } },
    "drink-pink":   { "frame": { "x": 12, "y": 0, "w": 12, "h": 14 } },
    "drink-amber":  { "frame": { "x": 24, "y": 0, "w": 12, "h": 14 } },
    "drink-purple": { "frame": { "x": 36, "y": 0, "w": 12, "h": 14 } }
  },
  "meta": {
    "image": "drinks.png",
    "size": { "w": 48, "h": 14 },
    "scale": 1
  }
}
```

---

## 5. Bartender Character Sprite Sheet

**File**: `assets/sprites/characters/bartender.png`
**Atlas**: `assets/sprites/characters/bartender.json`
**Dimensions**: 140x52 pixels (5 frames x 28x52 each)
**Format**: PNG with alpha

**Prompt**:
```
Pixel art sprite sheet, 140x52 pixels total, 5 frames of 28x52 each, horizontal strip.
Cyberpunk bartender character, chibi style (large head ~40% body height), facing FORWARD
(toward the camera/customers). The bartender has a strong personality and distinctive look:

CHARACTER DESIGN:
- Slicked-back silver/white hair (#aaaacc) with a single bright CYAN STREAK (#00f0ff)
  running through the center
- Sharp, confident eyes with glowing cyan (#00f0ff) pupils on dark face
- Small pink (#ff0080) earring on left ear
- Dark fitted vest (#1a1a2e) with a vertical cyan accent stripe down the center
- Lean build, standing pose (not sitting)
- Light skin (#d4a574)

PERSONALITY: Cool, collected, slightly aloof — the kind of bartender who knows
everyone's secrets. Think Jill from VA-11 Hall-A meets a cyberpunk aesthetic.

5 FRAMES (left to right):
Frame 1: IDLE — standing straight, arms at sides, calm confident expression
Frame 2: WIPING GLASS — right arm raised holding a glass, left hand wiping with cloth
Frame 3: LOOKING LEFT — head turned to the left, watching a customer
Frame 4: LOOKING RIGHT — head turned to the right, observing the bar
Frame 5: LEANING — leaning forward slightly on counter with one arm, relaxed pose

Style: strict pixel art, no anti-aliasing, no gradients, 1px outlines.
Transparent background (alpha channel).
```

### Bartender Atlas JSON

```json
{
  "frames": {
    "bartender-idle":   { "frame": { "x": 0,   "y": 0, "w": 28, "h": 52 } },
    "bartender-wipe":   { "frame": { "x": 28,  "y": 0, "w": 28, "h": 52 } },
    "bartender-look-l": { "frame": { "x": 56,  "y": 0, "w": 28, "h": 52 } },
    "bartender-look-r": { "frame": { "x": 84,  "y": 0, "w": 28, "h": 52 } },
    "bartender-lean":   { "frame": { "x": 112, "y": 0, "w": 28, "h": 52 } }
  },
  "meta": {
    "image": "bartender.png",
    "size": { "w": 140, "h": 52 },
    "scale": 1
  }
}
```

---

## 6. Walking Character Sprite (optional)

**File**: `assets/sprites/characters/character-walk.png`
**Dimensions**: 128x64 pixels (4 frames of 32x64)

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4-frame walk cycle of 32x64 each.
Cyberpunk chibi character walking, side view. Large head (~40% body height).
Generic dark clothing (#2a2a3a), light skin (#d4a574).
Frame 1: standing, Frame 2: right foot forward, Frame 3: standing, Frame 4: left foot forward.
Simple 4-frame walk cycle loop. Strict pixel art, transparent background.
```

---

## 6. Neon Sign — "CLAUDE PUNK" (Wild Fancy Style)

**File**: `assets/sprites/ui/neon-sign-main.png`
**Dimensions**: 200x56 pixels
**Format**: PNG with alpha

**Prompt**:
```
Pixel art neon bar sign, 200x56 pixels, EXTRAVAGANT cyberpunk style, 2.5D ANGLED perspective.
A wild, eye-catching wall-mounted neon sign — the kind of flashy centerpiece that
dominates a legendary underground bar. The text "CLAUDE PUNK" is formed by DOUBLE-TUBE
neon with staggered letter heights, giving it an uneven, hand-bent punk attitude.

The sign has a slight ISOMETRIC TILT — right side ~4 pixels lower than left, matching
a 3/4 top-down view where the back wall recedes to the right.

BACKING PLATE (parallelogram, not rectangle):
- Top-left (4,4), top-right (196,8), bottom-left (4,44), bottom-right (196,48)
- Filled with dark metal (#12121f) covered in RIVET DOTS and faint scratches
- A 4px-tall bottom face (#0a0a14) gives it physical thickness
- Gray (#2a2a3a) border with decorative DIAGONAL CUT corners (2-3px notches)

MAIN TEXT — "CLAUDE PUNK":
- Letters are WILD and UNEVEN — some tilt left, some tilt right, varying baselines
  like hand-bent glass tubes with punk energy
- Double-tube neon effect: outer tube cyan (#00f0ff), inner tube bright white (#ffffff)
- Each letter has a 2-pixel bright halo in alternating colors:
  C=cyan, L=pink, A=cyan, U=pink, D=cyan, E=pink, (space),
  P=pink, U=cyan, N=pink, K=cyan
- The "K" at the end kicks out with an exaggerated DIAGONAL SLASH extending
  2-3 pixels beyond the plate edge — rebellious, breaking the frame

DECORATIVE ELEMENTS:
- A small pixel-art LIGHTNING BOLT (#ffaa00 amber) between "CLAUDE" and "PUNK"
  replacing the space — electrified divider
- DRIPPING NEON PIXELS: 2-3 bright cyan (#00f0ff) pixels hanging below random
  letters like molten neon dripping down — raw, unfinished aesthetic
- Tiny STAR SPARKLE marks (3-pixel cross shape, #ffffff) at 2 random positions
  around the text — one top-left area, one bottom-right
- CORNER FLOURISHES: small neon pink (#ff0080) zigzag accents (3-4px) at the
  top-left and bottom-right corners of the plate

SUBTEXT — "BAR & SESSIONS":
- Below main text in smaller neon pink (#ff0080) with white (#ffffff) core
- Letters are more uniform but with a slight WAVE — baseline undulates gently
- An underline made of alternating cyan and pink dashes (1px each)

MOUNTING:
- 4 mounting brackets (gray metal #4a4a5e) along the top, but 2 of them are
  BENT/CROOKED — suggesting the sign has been through some rough nights
- Thin EXPOSED WIRES (1px lines, #4a4a5e) visible between some brackets,
  connecting to the neon tubes

Glow effect: 2-3px of extra bright pixels around letters in matching colors,
NOT blur/gradient. The glow is INTENSE — this sign screams for attention.
Strict pixel art, no anti-aliasing. Transparent background outside the plate.
References: Akira neon signs, Blade Runner bar signage, punk rock concert posters,
Tokyo Kabukicho alley neon chaos.
```

---

## 8. Jukebox Sprite Sheet (4 frames)

**File**: `assets/sprites/objects/jukebox.png`
**Dimensions**: 224x96 pixels total (4 frames of 56x96 each, horizontal strip)
**Format**: PNG with alpha

The jukebox has 4 frames — the game cycles through frames 2-4 when music is
playing to animate the equalizer, and shows frame 1 when idle.

- **Frame 1 (Idle/Off)**: Equalizer bars are dim and low, neon outline faint
- **Frame 2 (Playing A)**: Bars rise in a wave pattern peaking center-right
- **Frame 3 (Playing B)**: Bars shift — peaks move to different positions
- **Frame 4 (Playing C)**: Bars shift again — peaks swing to the left side

**Prompt**:
```
Pixel art sprite sheet, 224x96 pixels total, 4 frames of 56x96 each, horizontal
strip. Cyberpunk jukebox machine, front view. Classic arcade jukebox form factor
— domed/arched top, wide cabinet body, speaker grille on the lower half.

CABINET DESIGN (same across all 4 frames):
- Cabinet body: dark metal (#2a2a3a) with gray metallic trim (#4a4a5e)
- Arched top section: darker panel (#3a3a4e) with a rounded crown
- Display window (upper half): dark glass (#0a0a14) — this is where the
  equalizer bars are drawn (see below)
- Speaker grille (lower half): dark recessed area (#1a1a2e) with horizontal
  slat lines (#2a2a3a) for texture
- Base: solid gray metal (#4a4a5e), slightly wider than the body
- Neon pink (#ff0080) 1-pixel outline around the cabinet body
- Cyan (#00f0ff) 1-pixel accent on the arched top

EQUALIZER BARS (the key difference between frames):
Inside the display window, draw 7 vertical bars side by side. Each bar is 4px
wide with 2px gap between them. Bar colors alternate: pink (#ff0080), cyan
(#00f0ff), amber (#ffaa00), repeating. Each bar has a bright white (#e0e0e0)
tip (top 2px). The bars grow upward from the bottom of the display window.

Frame 1 (Idle): All bars short (4-6px), dim (low opacity ~30%), no bright tips.
  The neon outline is also dimmer (faint pink, faint cyan).
Frame 2 (Playing A): Bar heights: 8, 20, 12, 24, 10, 18, 6 — a wave peaking
  toward the right. Bars are bright (85% opacity), white tips visible.
Frame 3 (Playing B): Bar heights: 14, 10, 22, 8, 24, 12, 16 — peaks shift
  position. Different wave shape from frame 2.
Frame 4 (Playing C): Bar heights: 6, 18, 10, 16, 8, 22, 14 — peaks swing
  left. Creates a flowing wave animation when frames 2-4 cycle.

GLOW: The jukebox emits a subtle pink neon aura. Add 1-2 extra bright pixels
around the edges to suggest glow, NOT blur or gradients.

Style: strict pixel art, no anti-aliasing, no gradients, no blur.
Transparent background (alpha channel). References: retro Wurlitzer jukebox
meets cyberpunk neon aesthetic, like a VA-11 Hall-A prop.
```

**Post-processing**: Replace solid black (#000000) background with transparency. Final dimensions must be exactly 224x96 (4 frames x 56x96).

---

## 9. Background Music (Suno) — 4 Tracks

The game randomly shuffles and plays these 4 tracks in sequence.
Each track should be **2-4 minutes**, loopable feel (smooth fade at end).

### Track 1 — Midnight Sax

**File**: `assets/audio/bgm-bar-ambient-1.mp3`

**Suno Prompt**:
```
lo-fi cyberpunk jazz, smooth saxophone solo over muted synth pads,
vinyl crackle texture, slow tempo 70 BPM, minor key, midnight mood,
subtle electronic bass pulse, warm analog warmth, noir detective vibes
```
**Tags**: `lo-fi` `jazz` `cyberpunk` `saxophone` `chill`

### Track 2 — Neon Rain

**File**: `assets/audio/bgm-bar-ambient-2.mp3`

**Suno Prompt**:
```
ambient cyberpunk downtempo, soft rain-on-window atmosphere, gentle piano chords
with reverb, glitchy electronic textures underneath, 75 BPM, dreamy and melancholic,
subtle bass drone, distant city sounds, neon reflections in puddles
```
**Tags**: `ambient` `cyberpunk` `downtempo` `piano` `rain`

### Track 3 — Terminal Groove

**File**: `assets/audio/bgm-bar-ambient-3.mp3`

**Suno Prompt**:
```
lo-fi hip hop cyberpunk beat, chill head-nodding groove, dusty drum samples,
warm Rhodes electric piano chords, subtle synth arpeggios, 80 BPM,
tape saturation, late night coding session vibe, mellow and focused
```
**Tags**: `lo-fi` `hip-hop` `cyberpunk` `chill` `beats`

### Track 4 — Deep Protocol

**File**: `assets/audio/bgm-bar-ambient-4.mp3`

**Suno Prompt**:
```
dark ambient electronic, deep bass drones with slow evolving pads,
occasional glitchy digital artifacts, 65 BPM, mysterious atmosphere,
sparse minimal beats, underground cyberpunk bar closing time,
haunting distant vocals processed through reverb
```
**Tags**: `dark-ambient` `electronic` `cyberpunk` `minimal` `atmospheric`

### Reference Vibe
VA-11 Hall-A soundtrack meets lo-fi hip hop beats, with a cyberpunk edge.
The kind of music that plays in a dimly-lit neon bar at 2AM while a bartender
polishes glasses and patrons quietly talk to their terminals.

---

## Post-Processing Steps

After generating each image:

1. **Verify dimensions** match the spec exactly
2. **Check transparency** — character/object sprites need alpha channel
3. **Color quantize** — reduce to palette colors if needed (use Sharp with no dithering)
4. **Pixel-align** — ensure no sub-pixel or anti-aliased edges
5. **Save as PNG** — no compression artifacts

### Validation Command (requires ImageMagick)

```bash
# Check image dimensions
identify assets/sprites/characters/character-0.png
# Expected: PNG 128x64 ...

# Check for unwanted colors (should return empty for strict palette)
convert assets/sprites/characters/character-0.png -unique-colors txt: | wc -l
```

---

## 10. Wall-Mounted Digital Display (3 frames)

**File**: `assets/sprites/objects/retro-tv.png`
**Dimensions**: 960x180 pixels total (3 frames of 320x180 each, horizontal strip)
**Format**: PNG with alpha

A sleek wall-mounted flat panel display for the cyberpunk bar. The game shows
frame 1 when idle/off, and cycles frames 2-3 when a YouTube video is playing
(neon edge-glow pulse animation). A live YouTube iframe is overlaid on the
screen area at runtime.

- **Frame 1 (Off)**: Screen dark, edge lighting dim
- **Frame 2 (On A)**: Screen faint glow, edge neon bright
- **Frame 3 (On B)**: Screen alternate glow, edge neon pulses

**Screen area** (where YouTube iframe overlays): **x=8, y=8, w=304, h=152**
(relative to each 320x180 frame). This MUST be a clean, dark, rectangular area
with no decorations inside it.

**Prompt**:
```
Pixel art sprite sheet, 960x180 pixels total, 3 frames of 320x180 each, horizontal
strip. Cyberpunk wall-mounted flat panel digital display, front-facing view.
Futuristic slim design — think holographic-edge monitor in a neon-lit bar.

DISPLAY STRUCTURE (identical across all 3 frames):
- FRAME/HOUSING: Ultra-thin bezel (~4-6px) surrounding the screen. Dark metallic
  (#2a2a3a) with brushed-metal pixel texture. Slightly rounded corners (3px radius).
  The frame is nearly edge-to-edge — this is a modern display, NOT a bulky CRT.
- SCREEN AREA: Large dark rectangle from (8,8) to (312,160), size 304x152.
  This area MUST be kept perfectly clean and dark — no text, no reflections,
  no decorations, no scan patterns. A live video will be overlaid here at runtime.
- NEON EDGE TRIM: A 1px neon light strip runs along the outer edge of the frame:
  - Top edge: cyan (#00f0ff)
  - Bottom edge: neon pink (#ff0080)
  - Left & right edges: gradient transition from cyan (top) to pink (bottom),
    done with alternating pixel dithering (NOT smooth gradient)
- WALL MOUNT: A thin horizontal bracket visible behind the top edge — dark gray
  (#1a1a2e) strip ~4px tall peeking above the frame, with 2 small mounting bolt
  dots (#4a4a5e) at x~80 and x~240.
- STATUS BAR: A very thin strip (4-6px) along the inside-bottom of the frame,
  below the screen area, dark (#1a1a2e) containing:
  - A tiny power LED dot (2x2px, cyan #00f0ff) on the left
  - A tiny signal/wifi indicator (3 small dots, amber #ffaa00) on the right
- CORNER ACCENTS: Small diagonal neon marks at all 4 outer corners of the frame
  (2-3px each) — top corners cyan, bottom corners pink. Cyberpunk tech aesthetic.
- AMBIENT GLOW: 1-2px of bright neon pixels extending outward from the frame edge
  (representing light cast onto the wall behind). Cyan on top, pink on bottom.
  This is NOT blur — it is distinct bright pixels only.

FRAME DIFFERENCES (screen tint & edge glow intensity):

Frame 1 (Off / Standby):
- Screen: solid dark (#06070d), completely black, no glow
- Neon edge trim: dim, ~30% opacity (barely visible)
- Power LED: dim cyan at 40% opacity
- Ambient wall glow: none
- Overall feel: powered off, dormant

Frame 2 (On / Glow A):
- Screen: dark base (#06070d) with very faint teal wash (#0b1a24 at 35% opacity)
- Neon edge trim: bright, ~80% opacity — cyan top, pink bottom vivid
- Power LED: bright cyan 100%
- Ambient wall glow: visible — 1-2px bright pixels around frame exterior
- Faint horizontal scanlines across screen (#00f0ff at 8% opacity), spaced 6px

Frame 3 (On / Glow B):
- Screen: dark base (#06070d) with slightly shifted teal wash (#0f2a3a at 25% opacity)
- Neon edge trim: ~60% opacity (creates breathing pulse when cycling 2↔3)
- Power LED: bright cyan 100%
- Ambient wall glow: slightly dimmer than Frame 2
- Scanlines offset 2px from Frame 2, slightly different opacity (10%)

CRITICAL STYLE RULES:
- Pure pixel art, NO anti-aliasing, NO gradients, NO blur, NO glow effects
- All edges crisp, pixel-aligned, hard pixel boundaries
- Use dithering (checkerboard pattern) for color transitions on the side edges
- Neon glow = extra bright pixels (1-2px), NOT transparency or gaussian blur
- The screen rectangle (8,8,304,152) must be CLEAN FLAT DARK — no curved edges,
  no reflections, no content. The game engine overlays a YouTube iframe on it.
- The display should look THIN and SLEEK, mounted flush against a dark wall
- Color palette: #0a0a14, #06070d, #0b1a24, #0f2a3a, #1a1a2e, #2a2a3a, #3a3a4e,
  #4a4a5e, #00f0ff, #ff0080, #ffaa00, #8040c0, #e0e0e0
- References: Cyberpunk 2077 in-game screens, Blade Runner 2049 wall displays,
  VA-11 Hall-A bar TV, Ghost in the Shell digital signage, futuristic thin bezels
```

**Post-processing**: Verify exactly 960x180 total. Replace any near-black background outside the frame with transparency. Ensure screen area (8,8,304,152) per frame is clean dark with no stray pixels.

### Display Atlas JSON (optional — code uses spritesheet loader)

```json
{
  "frames": {
    "tv-off":  { "frame": { "x": 0,   "y": 0, "w": 320, "h": 180 } },
    "tv-on-a": { "frame": { "x": 320, "y": 0, "w": 320, "h": 180 } },
    "tv-on-b": { "frame": { "x": 640, "y": 0, "w": 320, "h": 180 } }
  },
  "meta": {
    "image": "retro-tv.png",
    "size": { "w": 960, "h": 180 },
    "scale": 1
  }
}
```

---

## Quick Reference: File → Location Map

| Asset | File Path |
|-------|-----------|
| Bar background | `assets/backgrounds/bar-interior.png` |
| **Bartender** | `assets/sprites/characters/bartender.png` + `.json` |
| Character 0 (purple) | `assets/sprites/characters/character-0.png` + `.json` |
| Character 1 (cyan) | `assets/sprites/characters/character-1.png` + `.json` |
| Character 2 (pink) | `assets/sprites/characters/character-2.png` + `.json` |
| Character 3 (amber) | `assets/sprites/characters/character-3.png` + `.json` |
| Character 4 (green) | `assets/sprites/characters/character-4.png` + `.json` |
| Character 5 (red) | `assets/sprites/characters/character-5.png` + `.json` |
| Character 6 (blue) | `assets/sprites/characters/character-6.png` + `.json` |
| Character 7 (silver) | `assets/sprites/characters/character-7.png` + `.json` |
| Door | `assets/sprites/objects/door.png` |
| Jukebox | `assets/sprites/objects/jukebox.png` |
| **Retro TV** | `assets/sprites/objects/retro-tv.png` |
| Drinks | `assets/sprites/objects/drinks.png` + `.json` |
| Walk cycle (opt.) | `assets/sprites/characters/character-walk.png` |
| Neon sign | `assets/sprites/ui/neon-sign-main.png` |
| BGM Track 1 (Midnight Sax) | `assets/audio/bgm-bar-ambient-1.mp3` |
| BGM Track 2 (Neon Rain) | `assets/audio/bgm-bar-ambient-2.mp3` |
| BGM Track 3 (Terminal Groove) | `assets/audio/bgm-bar-ambient-3.mp3` |
| BGM Track 4 (Deep Protocol) | `assets/audio/bgm-bar-ambient-4.mp3` |
| **Hidden: Johnny Silverhand** | `assets/sprites/characters/character-8-silverhand.png` + `.json` |
| **Hidden: Michael Jackson** | `assets/sprites/characters/character-9-mj.png` + `.json` |

---

## 11. Hidden Character 8 — Johnny Silverhand (Keanu Reeves)

**File**: `assets/sprites/characters/character-8-silverhand.png`
**Atlas**: `assets/sprites/characters/character-8-silverhand.json`
**Dimensions**: 128x64 pixels (4 frames x 32x64 each)

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip
on a solid bright green (#00ff00) background.
Cyberpunk chibi FULL-BODY character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture of any kind. Large head (~40% body height).
CRITICAL: Draw the COMPLETE FULL BODY from head to feet — head, torso, arms, hands,
legs, and feet/shoes must ALL be visible. Do NOT crop at the waist or chest.
The character should fill most of the 32x64 frame vertically: head at top, feet near bottom.
IMPORTANT: The bright green (#00ff00) is the chroma key color — use it for ALL areas
that are not part of the character. Do NOT use any green (#00ff00) on the character itself.

CHARACTER DESIGN — Johnny Silverhand (Keanu Reeves from Cyberpunk 2077):
- Long, messy jet-black hair (#1a1a2a) past the shoulders, with a slight wave
- Dark aviator sunglasses (#0a0a14) with faint cyan lens reflection (#00f0ff, 1px)
- Rugged stubble/short beard on jawline (#2a2a3a)
- LEFT ARM is a CHROME CYBERNETIC PROSTHETIC — bright silver metal (#aaaacc) with
  cyan (#00f0ff) glowing joints and seam lines. Segmented mechanical fingers.
  This is his most iconic feature — make it clearly metallic and distinct from skin.
- Right arm: normal, light skin (#d4a574)
- Dark leather jacket (#1a1a2a) with popped collar, over a faded black tank top
- Military dog tags (#8888aa) hanging from neck — 2 small metallic rectangles
- Silver ring on right hand (#aaaacc, 1px)
- Dark jeans (#1a1a2a) with a chain detail (#8888aa, 1px) at the hip
- Heavy black combat boots (#0a0a14) with silver buckle accents (#aaaacc)
- Lean, rock-star build

FULL BODY LAYOUT (within each 32x64 frame):
- Head + hair: rows 0-24 (top)
- Torso + arms: rows 24-42 (middle)
- Legs + boots: rows 42-62 (bottom, feet touching near frame bottom)

PERSONALITY: Rebellious rocker ghost, intense and brooding. The kind of guy
who lights a cigarette in a no-smoking bar and nobody dares say a word.

4 FRAMES (left to right):
Frame 1: IDLE SITTING — slouched back, chrome left arm resting on knee,
  right arm on thigh, sunglasses reflecting faint cyan glow, cool detached expression.
Frame 2: DRINKING — chrome left arm holds a glowing amber (#ffaa00) whiskey glass,
  raised to mouth, metallic fingers wrapped around glass with cyan joint glow visible.
Frame 3: LEANING — leaning forward on chrome left arm, right hand touching dog tags,
  contemplative pose, hair falling forward slightly.
Frame 4: LOOKING AROUND — head turned right, sunglasses catching pink neon reflection
  (#ff0080, 1px on lens), chrome arm resting on counter, alert and scanning the room.

Style: strict pixel art, no anti-aliasing, no gradients, 1px outlines.
The chrome arm should clearly contrast with skin — use bright metallic pixels (#aaaacc, #8888aa)
with cyan (#00f0ff) accent lines at joints and knuckles.
The background must be pure solid bright green (#00ff00) with no patterns or textures.
Do NOT use any green (#00ff00) on the character itself — only for the background.
References: Keanu Reeves as Johnny Silverhand in Cyberpunk 2077,
cyberpunk rocker aesthetic, chrome prosthetic arm prominently visible.
```

**Post-processing**: Replace bright green (#00ff00) with transparency. Final sheet: 128x64.

### Silverhand Atlas JSON

```json
{
  "frames": {
    "char-idle-8":  { "frame": { "x": 0,  "y": 0, "w": 32, "h": 64 } },
    "char-drink-8": { "frame": { "x": 32, "y": 0, "w": 32, "h": 64 } },
    "char-lean-8":  { "frame": { "x": 64, "y": 0, "w": 32, "h": 64 } },
    "char-look-8":  { "frame": { "x": 96, "y": 0, "w": 32, "h": 64 } }
  },
  "meta": {
    "image": "character-8-silverhand.png",
    "size": { "w": 128, "h": 64 },
    "scale": 1
  }
}
```

---

## 12. Hidden Character 9 — Michael Jackson (Neon Thriller)

**File**: `assets/sprites/characters/character-9-mj.png`
**Atlas**: `assets/sprites/characters/character-9-mj.json`
**Dimensions**: 128x64 pixels (4 frames x 32x64 each)

**Prompt**:
```
Pixel art sprite sheet, 128x64 pixels total, 4 frames of 32x64 each, horizontal strip
on a solid bright green (#00ff00) background.
Cyberpunk chibi FULL-BODY character in sitting pose, CHARACTER ONLY — NO chair, NO stool,
NO table, NO furniture of any kind. Large head (~40% body height).
CRITICAL: Draw the COMPLETE FULL BODY from head to feet — head, torso, arms, hands,
legs, and feet/shoes must ALL be visible. Do NOT crop at the waist or chest.
The character should fill most of the 32x64 frame vertically: head at top, feet near bottom.
IMPORTANT: The bright green (#00ff00) is the chroma key color — use it for ALL areas
that are not part of the character. Do NOT use any green (#00ff00) on the character itself.

CHARACTER DESIGN — Michael Jackson (cyberpunk Thriller era):
- Iconic curly black hair (#0a0a14) with volume, swept to the right side,
  with subtle purple highlights (#8040c0) catching neon light on the curls
- Lighter skin (#d4a574), sharp angular face, thin eyebrows
- Dark eyes with a charismatic, confident sparkle (white pixel highlight)
- BLACK FEDORA HAT (#1a1a2a) with a thin cyan (#00f0ff) neon band around
  the crown — tilted slightly forward at a stylish angle
- ICONIC RED JACKET: bright neon pink/red (#ff0080) military-style jacket
  with multiple horizontal black buckle straps across the chest (#0a0a14),
  sharp shoulder pads, and high collar. The jacket has cyan (#00f0ff) 1-pixel
  accent stitching along the shoulder seams and collar edge.
- RIGHT HAND wears a single WHITE SEQUINED GLOVE (#e0e0e0) with sparkle
  pixels — tiny alternating bright white (#ffffff) dots to suggest glitter.
  Left hand is bare with light skin.
- Black high-waisted pants (#1a1a2a) with a thin silver belt (#8888aa)
- Iconic white socks (#e0e0e0) visible at ankles — a signature MJ detail
- Black penny loafers (#0a0a14) with a subtle shine pixel (#2a2a3a)
- Slim, dancer's build — even while sitting, posture has an elegant energy

FULL BODY LAYOUT (within each 32x64 frame):
- Fedora + head + hair: rows 0-24 (top)
- Torso + red jacket + arms: rows 24-42 (middle)
- Legs + white socks + loafers: rows 42-62 (bottom, feet touching near frame bottom)

PERSONALITY: The King of Pop, even in a cyberpunk bar he commands the room.
Effortlessly cool, every gesture is a performance.

4 FRAMES (left to right):
Frame 1: IDLE SITTING — elegant upright posture, gloved right hand resting
  on knee with sparkle pixels visible, left hand on thigh, fedora tilted forward,
  slight confident smile, one leg crossed over the other.
Frame 2: DRINKING — gloved right hand elegantly holds a glowing purple (#8040c0)
  cocktail glass, pinky finger slightly extended, raised toward lips with grace,
  fedora brim casting a small shadow pixel on the face.
Frame 3: LEANING — leaning to the right on bare left arm, gloved right hand
  touching the brim of the fedora in an iconic tip-the-hat gesture, relaxed
  but stylish pose, slight head tilt.
Frame 4: LOOKING AROUND — head turned left, fedora profile visible, gloved hand
  raised near chin in a thoughtful pose (like about to snap fingers), scanning
  the bar with star-quality composure.

Style: strict pixel art, no anti-aliasing, no gradients, 1px outlines.
The red jacket (#ff0080) must POP against the bright green background — it's his signature.
The single white glove (#e0e0e0) should be clearly visible on only the RIGHT hand.
The background must be pure solid bright green (#00ff00) with no patterns or textures.
Do NOT use any green (#00ff00) on the character itself — only for the background.
References: Michael Jackson Thriller/Bad era red jacket, single white glove,
black fedora, military buckle jacket, cyberpunk neon reinterpretation.
```

**Post-processing**: Replace bright green (#00ff00) with transparency. Final sheet: 128x64.

### MJ Atlas JSON

```json
{
  "frames": {
    "char-idle-9":  { "frame": { "x": 0,  "y": 0, "w": 32, "h": 64 } },
    "char-drink-9": { "frame": { "x": 32, "y": 0, "w": 32, "h": 64 } },
    "char-lean-9":  { "frame": { "x": 64, "y": 0, "w": 32, "h": 64 } },
    "char-look-9":  { "frame": { "x": 96, "y": 0, "w": 32, "h": 64 } }
  },
  "meta": {
    "image": "character-9-mj.png",
    "size": { "w": 128, "h": 64 },
    "scale": 1
  }
}
