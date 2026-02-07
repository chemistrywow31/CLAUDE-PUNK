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

## 3. Door Sprite (Flat Front View)

**File**: `assets/sprites/objects/door.png`
**Dimensions**: 90x150 pixels (game-ready at 1920x1080)
**Format**: PNG with alpha

**Prompt**:
```
Pixel art cyberpunk sliding door, flat front view, on a solid black (#000000) background.
Dark metal door panels (#2a2a3a) with gray metallic frame (#4a4a5e).
Bright neon cyan (#00f0ff) 1-pixel outline along the door frame edges.
Amber (#ffaa00) door handle on the right side.
Small neon pink (#ff0080) "ENTER" text label above the door frame.
Style: crisp pixel art, hard edges, no anti-aliasing, no gradients, no blur.
The background must be pure solid black with no patterns or textures.
```

**Post-processing**: Replace solid black (#000000) background with transparency, then resize to 90x150.

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

## 6. Neon Sign — "CLAUDE PUNK" (2.5D Angled)

**File**: `assets/sprites/ui/neon-sign-main.png`
**Dimensions**: 200x56 pixels
**Format**: PNG with alpha

**Prompt**:
```
Pixel art neon bar sign, 200x56 pixels, cyberpunk style, 2.5D ANGLED perspective.
A wall-mounted sign with the text "CLAUDE PUNK" formed by neon tubes.
The sign has a slight ISOMETRIC TILT — the right side is ~4 pixels lower than the left,
matching a 3/4 top-down perspective where the back wall recedes to the right.

The backing plate is a PARALLELOGRAM (not rectangle):
- Top-left corner at (4, 4), top-right at (196, 8)
- Bottom-left at (4, 44), bottom-right at (196, 48)
- Filled with dark metal (#12121f) with a gray (#2a2a3a) border
- A 4px-tall bottom face is visible below the plate (even darker #0a0a14)
  to give it physical thickness on the wall.

The neon text follows the tilt angle:
- "CLAUDE PUNK" in bright white (#ffffff) core with 1-pixel cyan (#00f0ff) outline
- "BAR & SESSIONS" below in pink (#ff0080) with white core, smaller
- Mounting brackets (gray metal dots #4a4a5e) at 4 points along the top

Glow effect: additional bright pixels (1-2px) around letters, NOT blur/gradient.
Strict pixel art, no anti-aliasing. Transparent background outside the plate.
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
| Drinks | `assets/sprites/objects/drinks.png` + `.json` |
| Walk cycle (opt.) | `assets/sprites/characters/character-walk.png` |
| Neon sign | `assets/sprites/ui/neon-sign-main.png` |
| BGM Track 1 (Midnight Sax) | `assets/audio/bgm-bar-ambient-1.mp3` |
| BGM Track 2 (Neon Rain) | `assets/audio/bgm-bar-ambient-2.mp3` |
| BGM Track 3 (Terminal Groove) | `assets/audio/bgm-bar-ambient-3.mp3` |
| BGM Track 4 (Deep Protocol) | `assets/audio/bgm-bar-ambient-4.mp3` |
