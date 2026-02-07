# Claude Punk — Project Specification

## 1. Project Overview & Vision

### Concept

Claude Punk  is a cyberpunk pixel-art web game that serves as a gamified interface for managing Claude Code CLI instances. Each running Claude session appears as a character sitting in a neon-lit bar, drinking cyberpunk cocktails. The number of drinks on the table reflects the file count in that session's working directory. Clicking a character opens a dialog box for real-time CLI interaction, file browsing, and `.claude` config viewing.

### Why This Exists

Managing multiple Claude Code CLI sessions in separate terminals is tedious. This project turns that workflow into a visual, interactive experience — a cyberpunk bar where each AI agent is a patron, and the user is the bartender orchestrating them all from a single browser tab.

### Target User

Individual Claude users (Pro or Max subscribers) who run multiple CLI sessions simultaneously and want a unified visual interface.

---

## 2. System Architecture

```
┌──────────────────────┐
│  Browser / Phaser.js  │
│  (Game Scene + UI)    │
└─────────┬────────────┘
          │ WebSocket (ws://localhost:8420/ws)
          │
┌─────────▼────────────┐
│   Golang Backend      │
│  ┌─────────────────┐  │
│  │ Realtime Server  │  │  ← WebSocket server + message routing
│  │ Session Manager  │  │  ← CLI subprocess lifecycle
│  │ File Watcher     │  │  ← fsnotify directory monitoring
│  └─────────────────┘  │
└─────────┬────────────┘
          │ subprocess (stdin/stdout/stderr)
          │
┌─────────▼────────────┐
│  Claude Code CLI      │
│  (one process per     │
│   session)            │
└──────────────────────┘
```

### Data Flow

1. User clicks "create session" → frontend sends `session.create` via WebSocket
2. Backend spawns `claude --dangerously-skip-permissions` as a subprocess
3. Backend subscribes to stdout/stderr and streams lines to frontend via `session.output`
4. Backend monitors the session's working directory via fsnotify
5. File count changes → backend computes drink count → broadcasts `files.update`
6. Frontend renders/removes character sprites and drink objects in real time

---

## 3. MVP Scope & Future Roadmap

### MVP (v1.0)

- Golang backend spawns and manages Claude Code CLI processes
- WebSocket server pushes real-time CLI output to browser
- Phaser.js renders a cyberpunk bar scene with pixel art
- Each Claude instance = a character sitting at a table, drinking
- File count in monitored folder → drink count on table (~20 files = 1 drink)
- Click character/table → dialog box with tabs: Terminal | Files | Claude Config
- User can send prompts to any session via the dialog

### Future (Non-MVP)

- **Claude API mode** with sub-agent visualization (multiple characters at same table)
- **Drag-and-drop** task assignment to characters
- **Batch command panel** for sending prompts to multiple sessions
- **Automated art generation** via MCP tools
- **Game progression** and scoring systems
- Advanced character behaviors and animations

---

## 4. Backend Spec (Golang)

### Session Manager

Manages Claude Code CLI subprocess lifecycle and state tracking.

#### Session States

```go
type SessionState string

const (
    SessionCreating   SessionState = "creating"
    SessionActive     SessionState = "active"
    SessionIdle       SessionState = "idle"
    SessionTerminated SessionState = "terminated"
)
```

#### Session Struct

```go
type Session struct {
    ID        string       `json:"id"`
    State     SessionState `json:"state"`
    WorkDir   string       `json:"workDir"`
    CreatedAt time.Time    `json:"createdAt"`
    Label     string       `json:"label"`
}
```

#### SessionManager Interface

```go
type SessionManager interface {
    Create(workDir string, label string) (*Session, error)
    Get(id string) (*Session, error)
    List() ([]*Session, error)
    SendPrompt(id string, prompt string) error
    Kill(id string) error
    Subscribe(id string) (<-chan OutputEvent, error)
}
```

#### OutputEvent

```go
type OutputEventType string

const (
    OutputStdout OutputEventType = "stdout"
    OutputStderr OutputEventType = "stderr"
    OutputExit   OutputEventType = "exit"
)

type OutputEvent struct {
    SessionID string          `json:"sessionId"`
    Type      OutputEventType `json:"type"`
    Data      string          `json:"data"`
    Timestamp time.Time       `json:"timestamp"`
}
```

#### Subprocess Management

- Use `os/exec.CommandContext` with a cancellable context per session
- Pipe stdout and stderr separately using `cmd.StdoutPipe()` and `cmd.StderrPipe()`
- Use `cmd.StdinPipe()` for sending user prompts
- Launch CLI with: `claude --dangerously-skip-permissions` (configurable binary path)
- Set the working directory via `cmd.Dir`

#### Output Streaming

- Read stdout/stderr line-by-line using `bufio.Scanner` with 1MB buffer
- Fan out each line as an `OutputEvent` to all subscribers via Go channels (buffered, capacity 100)
- Use a ring buffer (capacity: 1000 lines) to allow late subscribers to catch up on recent output
- Handle subprocess exit: send an `OutputExit` event, update session state to `terminated`

#### Concurrency

- Protect the session map with `sync.RWMutex`
- Each session's output scanner runs in its own goroutine
- Channel-based subscriber pattern: create a new channel per subscriber, remove on unsubscribe
- Use `context.WithCancel` to propagate session termination to all goroutines

#### Error Handling

- If `claude` binary is not found in PATH → return: `"claude CLI not found in PATH"`
- If working directory does not exist → return error before attempting to spawn
- If subprocess crashes unexpectedly → log exit code, update state to `terminated`
- Graceful shutdown: SIGTERM to all active subprocesses → wait 5 seconds → SIGKILL

#### REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sessions` | Create a new session (body: `{workDir, label}`) |
| GET | `/sessions` | List all sessions |
| GET | `/sessions/:id` | Get session details |
| POST | `/sessions/:id/prompt` | Send prompt to session (body: `{prompt}`) |
| DELETE | `/sessions/:id` | Kill and remove session |

### Realtime Server

Bridges WebSocket clients (browser) to the Session Manager and file system watcher.

#### WebSocket Connection

- Endpoint: `ws://localhost:{port}/ws`
- One WebSocket connection per browser tab
- A single connection receives updates for all sessions (client filters by session ID)

#### Integration with Session Manager

- On `session.create` → call `SessionManager.Create()`, subscribe to output, broadcast `session.update`
- On `session.prompt` → call `SessionManager.SendPrompt()`
- On `session.kill` → call `SessionManager.Kill()`
- Subscribe to each session's output channel and forward as `session.output` messages

#### WebSocket Management

- Use `gorilla/websocket` library
- Ping/pong heartbeat: 30-second interval
- Read deadline: 60 seconds (reset on pong)
- Write deadline: 10 seconds
- Maintain a client registry with `sync.RWMutex` protection
- Clean up subscribers when a WebSocket disconnects

#### HTTP Static Server

- Serve frontend build directory at `/`
- Serve WebSocket endpoint at `/ws`
- CORS: allow `localhost` origins for development

#### Startup Sequence

1. Initialize Session Manager
2. Start file system watchers for any persisted sessions
3. Start HTTP server with WebSocket upgrade handler
4. Log: `"Claude Bar Game server running on http://localhost:{port}"`

### File System Watcher

- Use `fsnotify` library to watch each session's working directory recursively
- Calculate total file count on every change event (debounce: 500ms)
- Compute drink count: `drinkCount = floor(fileCount / 20)`
- When drink count changes, broadcast `files.update` to all connected clients
- Exclude hidden files except `.claude` directory from count
- Exclude `node_modules`, `.git`, `vendor` directories from count

#### File Tree Generation

When client requests a file tree (`files.requestTree`):

```go
type FileNode struct {
    Name     string     `json:"name"`
    Path     string     `json:"path"`
    IsDir    bool       `json:"isDir"`
    Children []FileNode `json:"children,omitempty"`
    Size     int64      `json:"size,omitempty"`
}
```

- Recursively walk the directory up to 3 levels deep
- Exclude `.git`, `node_modules`, `vendor`
- Include `.claude` directory contents
- Sort: directories first, then files alphabetically

#### .claude Config Reader

When client requests `.claude` contents:
- Read all `.md` files in the `.claude` directory
- Return file names and contents as a map
- Include subdirectories: `rules/`, `agents/`, `skills/`

---

## 5. Frontend Spec

### Game Scene (Phaser.js)

#### Technical Stack

- **Framework**: Phaser 3 (latest stable)
- **Renderer**: WebGL with Canvas fallback
- **Resolution**: 640x360 base (scaled up with pixel-perfect rendering)
- **Scale mode**: `Phaser.Scale.FIT` with `pixelArt: true`
- **Build tool**: Vite

#### Game Configuration

```javascript
const config = {
    type: Phaser.AUTO,
    width: 640,
    height: 360,
    pixelArt: true,
    roundPixels: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BarScene],
    parent: 'game-container',
    backgroundColor: '#0a0a14'
};
```

#### Bar Layout

Single screen, no scrolling (MVP):

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

#### Seat Registry

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

#### Rendering Rules

- `pixelArt: true` in game config to prevent texture smoothing
- `setOrigin(0.5, 1)` for character sprites (anchor at feet)
- Render order (depth): background(0) < tables(1-5) < drinks(6-9) < characters(10-14) < neon overlay(15-19)
- All sprites use nearest-neighbor scaling

#### Event Interface

Events emitted by Game Renderer:

| Event | Payload | Trigger |
|-------|---------|---------|
| `character-clicked` | `{ sessionId, x, y }` | Player clicks a character |
| `table-clicked` | `{ tableId, x, y }` | Player clicks a table |
| `seat-available` | `{ count }` | Available seat count changes |

Events consumed from WebSocket:

| Event | Action |
|-------|--------|
| `session.update` | Add/update character |
| `session.terminated` | Remove character |
| `files.update` | Update drink count |

### UI Overlay (HTML/CSS)

The dialog system and file browser are HTML/CSS DOM overlays positioned above the Phaser canvas. This provides better text rendering, scrollable containers, standard input fields, and easier CSS styling.

#### Dialog Box Structure

```html
<div id="dialog-overlay" class="hidden">
  <div id="dialog-box" class="cyberpunk-panel">
    <div id="dialog-header">
      <span id="dialog-title">Session: {label}</span>
      <span id="dialog-status" class="status-badge">active</span>
      <button id="dialog-close">&times;</button>
    </div>
    <div id="dialog-tabs">
      <button class="tab active" data-tab="cli">Terminal</button>
      <button class="tab" data-tab="files">Files</button>
      <button class="tab" data-tab="claude">Claude Config</button>
    </div>
    <div id="dialog-content">
      <!-- Tab content rendered here -->
    </div>
    <div id="dialog-input">
      <input type="text" id="prompt-input" placeholder="Enter prompt..." />
      <button id="prompt-send">Send</button>
    </div>
  </div>
</div>
```

#### Dialog Behavior

- **Open**: Listen for `character-clicked` or `table-clicked` from Game Renderer
- **Position**: Centered on screen (not anchored to character position)
- **Close**: Click ×, press Escape, or click outside dialog
- **Single instance**: Only one dialog open at a time

#### Tab: Terminal

- Display CLI stdout (white) / stderr (red-tinted) as a scrolling log
- Auto-scroll to bottom on new messages
- Maximum 500 visible DOM lines (older removed from DOM, kept in 2000-line memory buffer)
- Timestamps shown on hover (not inline)
- Prompt input at bottom: Enter or click Send to dispatch, clear after sending, disable if session terminated
- ANSI color codes converted to CSS classes
- Long lines wrap (no horizontal scroll)

#### Tab: Files

- On activation, send `files.requestTree` via WebSocket
- Render as collapsible tree (directories toggleable)
- Show file size next to each file
- Click a file → display read-only content with basic syntax highlighting
- Header shows: `142 files → 7 drinks`

#### Tab: Claude Config

- On activation, send `claude.requestConfig` via WebSocket
- Display `.claude` directory as a list of expandable files
- Render Markdown content with a lightweight renderer

#### Accessibility

- Dialog is keyboard navigable (Tab to cycle elements)
- Escape closes dialog
- Focus trapped inside dialog when open
- Terminal output has `role="log"` and `aria-live="polite"`

---

## 6. WebSocket Message Protocol

### Message Envelope

Every WebSocket message follows this JSON format:

```json
{
    "type": "category.action",
    "payload": {},
    "timestamp": "2024-01-01T00:00:00.000Z"
}
```

- `type`: Always `category.action` format
- `payload`: Message-specific data object. Never null — use `{}` if no data
- `timestamp`: ISO 8601 with milliseconds. Server-generated for server→client, client-generated for client→server

### Server → Client Messages

| Type | Payload Fields | Description |
|------|---------------|-------------|
| `session.update` | `id`, `state`, `workDir`, `label`, `createdAt` | Session created or state changed |
| `session.output` | `sessionId`, `stream` ("stdout"\|"stderr"), `data` | One line of CLI output |
| `session.terminated` | `sessionId`, `exitCode` | Session process exited |
| `files.update` | `sessionId`, `fileCount`, `drinkCount` | File count changed in session directory |
| `files.tree` | `sessionId`, `tree` (FileNode[]) | Directory tree response |
| `claude.config` | `sessionId`, `files` ({name, content}[]) | .claude directory contents |
| `error` | `message`, `code` | Error notification |

### Client → Server Messages

| Type | Payload Fields | Description |
|------|---------------|-------------|
| `session.create` | `workDir`, `label` | Request to create a new session |
| `session.prompt` | `sessionId`, `prompt` | Send prompt to a session |
| `session.kill` | `sessionId` | Request to terminate a session |
| `files.requestTree` | `sessionId` | Request directory tree |
| `claude.requestConfig` | `sessionId` | Request .claude directory contents |

### FileNode Structure

```json
{
    "name": "string",
    "path": "string (relative to session workDir)",
    "isDir": "boolean",
    "children": "FileNode[] (only if isDir)",
    "size": "number (bytes, only if not isDir)"
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| `SESSION_NOT_FOUND` | Requested session ID does not exist |
| `SESSION_TERMINATED` | Attempted action on a terminated session |
| `INVALID_MESSAGE` | Message failed schema validation |
| `MAX_SESSIONS` | Maximum session limit reached |
| `SPAWN_FAILED` | Failed to start Claude CLI process |

### Validation Rules

- Every incoming client message must be validated against the schema before processing
- Unknown `type` values are rejected with `INVALID_MESSAGE`
- Missing required payload fields are rejected with `INVALID_MESSAGE`
- `sessionId` fields must reference an existing session or return `SESSION_NOT_FOUND`

---

## 7. Game Mechanics

### Scene Layout

- Single-screen bar interior (640x360 base, no scrolling)
- Elements: counter, bar stools, tables, neon signs, ceiling lights, cyberpunk wall decorations
- Characters are static (no walking) — they sit at assigned seats

### Seat System

- 12 total seats: 3 bar stools + 8 table chairs + 1 extra
- Seats assigned in order as sessions are created (first available)
- When a session terminates, its seat becomes available
- `sessionId → { sprite, seatId, drinkSprites[] }` mapping maintained

### Character Lifecycle

1. **Session created** (`session.update` with state `"active"`):
    - Find first unoccupied seat
    - Create sprite at seat coordinates
    - Play entrance tween: alpha 0→1, scale 0.5→1, 300ms, `Back.easeOut`
    - Start `character-drinking` animation (4 frames, 4 FPS, loop)
    - Randomize animation start frame to avoid synchronized drinking

2. **Session active**:
    - Character plays drinking animation on loop
    - `setInteractive()` enabled — `pointerdown` opens dialog
    - `pointerover` shows cyan tint highlight (`0x44ffff`)
    - `pointerout` clears tint

3. **Session terminated** (`session.terminated`):
    - Play fade-out tween: alpha 1→0, 500ms
    - Destroy sprite and all associated drink sprites
    - Mark seat as unoccupied

### Drink System

- **Formula**: `drinkCount = floor(fileCount / 20)`
- File count excludes: hidden files (except `.claude`), `node_modules`, `.git`, `vendor`
- File watcher debounce: 500ms

#### Drink Placement

Drinks placed on table surface near the character using offset array:

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

- Drink count increased → add sprites with pop-in tween (scale 0→1)
- Drink count decreased → remove excess sprites with fade-out tween
- If drinks exceed offset slots, stack them (add small y offset per extra)

### Neon Flicker Effect

- Bar neon signs use a tween randomizing alpha between 0.7 and 1.0
- Random interval: 2000ms–5000ms
- Adds cyberpunk atmosphere to the scene

---

## 8. Art Assets

### Art Style

- **Style**: Pixel art, 16x16 or 32x32 base tile size
- **Theme**: Cyberpunk bar — neon lights, dark atmosphere, holographic elements, metallic surfaces
- **Character style**: Chibi proportions (head ~40% of body height), 32x64 pixels per frame
- **Consistency**: All assets share the same pixel density and color palette
- **References**: VA-11 Hall-A, Coffee Talk, Chrono Trigger, Final Fantasy VI

### Required Assets (MVP)

#### Background
- Bar interior scene (320x180 base resolution, scalable to 640x360)
- Elements: counter, bar stools, tables, neon signs, ceiling lights, wall decorations

#### Characters
- Sitting character sprite sheet (idle + drinking animation)
- 4 frames per drinking animation cycle
- At least 3 distinct character appearances (hair/clothing color variations)
- Frame size: 32x64 pixels each
- Sprite sheet: 128x64 (4 frames in horizontal strip)

#### Objects
- Drink sprites: cyberpunk-styled neon-glowing cocktail glasses
- Table sprite: large enough for 6+ drinks and 4+ characters
- Bar stool / chair sprite

#### UI Elements
- Dialog box frame (cyberpunk panel with neon borders)
- Tab buttons (active/inactive states)
- Scrollbar (matching cyberpunk theme)
- Close button

### Asset Pipeline

1. **Prompt creation**: Art Producer writes AI image generation prompts (for Banana, Midjourney, DALL-E, etc.)
2. **Image generation**: User generates images from prompts
3. **Validation**: Check dimensions, PNG format, alpha channel, color count
4. **Color quantization**: Reduce to target palette using Sharp (Node.js) with no dithering
5. **Atlas generation**: Create Phaser.js-compatible texture atlas JSON
6. **Animation config**: Generate animation definition JSON files

### Sprite Sheet Format

Texture atlas JSON (Phaser-compatible):

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

### Animation Config Format

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

---

## 9. Visual Design — Cyberpunk Style Guide

### Color Palette

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

Colors outside this palette require coordinator approval.

### CSS Design Tokens

```css
:root {
    --bg-primary: #0a0a14;
    --bg-secondary: #12121f;
    --bg-panel: #1a1a2e;
    --border-neon: #00f0ff;
    --border-glow: 0 0 10px rgba(0, 240, 255, 0.3);
    --text-primary: #e0e0e0;
    --text-secondary: #8888aa;
    --accent-pink: #ff0080;
    --accent-amber: #ffaa00;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    --font-ui: 'Rajdhani', 'Orbitron', sans-serif;
}
```

### Pixel Art Constraints

- No anti-aliasing on any sprite or tile edge
- No gradient fills — use dithering (checkerboard pattern) for transitions
- No sub-pixel rendering
- All sprites must be pixel-aligned (no fractional coordinates)
- Neon glow = 1-pixel bright outline, not a blur effect
- Shadows are solid darker pixels, never transparency-based

### UI Panel Style

- Dark semi-transparent background (`rgba(10, 10, 20, 0.95)`)
- 1px border with neon cyan glow
- Corner decorations: small diagonal neon accents (2-3 pixels)
- Drop shadow with colored glow
- Buttons: dark background, neon border, glow on hover
- Tabs: underline active tab with neon cyan
- Input fields: dark background, neon border on focus, monospace font
- Scrollbar: thin, styled to match theme (webkit-scrollbar CSS)

### Scene Depth Layers

| Layer | Depth Range | Contents |
|-------|-------------|----------|
| Background | 0 | Static bar interior image |
| Furniture | 1–5 | Tables, chairs, counter |
| Objects | 6–9 | Drinks, items on tables |
| Characters | 10–14 | Sitting character sprites |
| Effects | 15–19 | Neon flicker overlays |
| UI | Above canvas | HTML overlay (dialog, tabs) |

### Font Rules

- **Game canvas**: Pixel fonts only
- **HTML overlay code/terminal**: `JetBrains Mono` / `Fira Code`
- **HTML overlay UI labels**: `Rajdhani` / `Orbitron`

---

## 10. Project Structure

### Directory Layout

```
claude-bar-game/
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go              ← Entry point
│   ├── internal/
│   │   ├── session/                  ← Session CRUD, subprocess lifecycle
│   │   ├── realtime/                 ← WebSocket server, client registry
│   │   ├── watcher/                  ← File system watcher, debounce
│   │   └── protocol/                 ← Message types, serialization
│   ├── go.mod
│   └── go.sum
├── frontend/
│   ├── src/
│   │   ├── scenes/
│   │   │   └── BarScene.js           ← Main Phaser scene
│   │   ├── entities/
│   │   │   ├── Character.js          ← Character sprite wrapper
│   │   │   └── DrinkManager.js       ← Drink placement logic
│   │   ├── ui/
│   │   │   ├── DialogBox.js          ← Dialog lifecycle, open/close
│   │   │   ├── TerminalTab.js        ← CLI output display + prompt input
│   │   │   ├── FilesTab.js           ← File tree + file viewer
│   │   │   ├── ClaudeConfigTab.js    ← .claude config reader
│   │   │   └── AnsiParser.js         ← ANSI code to CSS converter
│   │   ├── config/
│   │   │   ├── seats.js              ← Seat registry
│   │   │   └── animations.js         ← Animation definitions
│   │   ├── services/
│   │   │   └── websocket.js          ← WebSocket client (shared)
│   │   └── styles/
│   │       ├── cyberpunk.css         ← Theme variables + base styles
│   │       ├── dialog.css            ← Dialog box layout
│   │       └── terminal.css          ← Terminal output styles
│   ├── public/
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── assets/
│   ├── sprites/
│   │   ├── characters/
│   │   │   ├── character-drink.png
│   │   │   └── character-drink.json
│   │   ├── objects/
│   │   │   ├── drinks.png
│   │   │   ├── drinks.json
│   │   │   ├── table.png
│   │   │   └── chair.png
│   │   └── ui/
│   │       ├── dialog-frame.png
│   │       └── dialog-frame.json
│   ├── backgrounds/
│   │   └── bar-interior.png
│   └── scripts/
│       ├── process-sprites.sh
│       └── generate-atlas.js
├── .claude/                          ← Team agent definitions
└── README.md
```

### Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Go files | `snake_case.go` | `session_manager.go` |
| Go packages | single lowercase | `session`, `realtime` |
| JS classes | `PascalCase.js` | `BarScene.js`, `Character.js` |
| JS utilities | `camelCase.js` | `websocket.js`, `seats.js` |
| CSS / Assets / Dirs | `kebab-case` | `cyberpunk.css`, `bar-interior.png` |

### Placement Rules

- All Go source files in `backend/`
- All frontend source files in `frontend/src/`
- All game assets in `assets/` at project root (not inside `frontend/`)
- Sprite sheets: PNG + JSON atlas in the same directory, same base name
- Every exported Go function must have a corresponding `_test.go` in the same package

---

## 11. Configuration Reference

```go
type ServerConfig struct {
    Port           int    `env:"PORT" default:"8420"`
    StaticDir      string `env:"STATIC_DIR" default:"./frontend/dist"`
    ClaudeBinary   string `env:"CLAUDE_BINARY" default:"claude"`
    MaxSessions    int    `env:"MAX_SESSIONS" default:"10"`
    FileCountRatio int    `env:"FILE_COUNT_RATIO" default:"20"`
}
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8420` | HTTP/WebSocket server port |
| `STATIC_DIR` | `./frontend/dist` | Path to frontend build output |
| `CLAUDE_BINARY` | `claude` | Path or name of Claude CLI binary |
| `MAX_SESSIONS` | `10` | Maximum concurrent sessions |
| `FILE_COUNT_RATIO` | `20` | Files per drink (drinkCount = floor(fileCount / ratio)) |

### WebSocket Timing

| Parameter | Value |
|-----------|-------|
| Ping/pong heartbeat interval | 30 seconds |
| Read deadline | 60 seconds (reset on pong) |
| Write deadline | 10 seconds |
| File watcher debounce | 500 milliseconds |

### Subprocess Limits

| Parameter | Value |
|-----------|-------|
| Output ring buffer capacity | 1000 lines |
| Scanner buffer size | 1 MB |
| Subscriber channel buffer | 100 events |
| Graceful shutdown timeout | 5 seconds (SIGTERM → SIGKILL) |

### UI Limits

| Parameter | Value |
|-----------|-------|
| Max DOM lines in terminal | 500 |
| Terminal memory buffer | 2000 lines |
| File tree max depth | 3 levels |
| Max seats in bar | 12 |
| Dialog minimum resolution | 1280x720 |

---

## 12. Technical Stack & Dependencies

### Backend (Go)

| Dependency | Purpose |
|------------|---------|
| Go 1.22+ | Language runtime |
| `gorilla/websocket` | WebSocket server |
| `fsnotify/fsnotify` | File system watching |
| `os/exec` (stdlib) | Subprocess management |
| `bufio` (stdlib) | Line-by-line output streaming |
| `sync` (stdlib) | Concurrency primitives |

### Frontend (JavaScript)

| Dependency | Purpose |
|------------|---------|
| Phaser 3 (latest) | 2D game framework |
| Vite | Build tool & dev server |

### Art Pipeline (Node.js)

| Dependency | Purpose |
|------------|---------|
| Sharp | Image processing, color quantization |
| ImageMagick (CLI) | Image validation, format checking |

---

## 13. Testing Strategy

### Backend Unit Tests

- Session state transitions: creating → active → idle → terminated
- Output event serialization/deserialization
- Message protocol validation (valid and invalid messages)
- File count calculation logic
- Drink count formula

### Backend Integration Tests

- Spawn a mock CLI process (simple echo script) and validate:
    - Output streaming works
    - Prompt forwarding works
    - Process termination is handled
- Connect WebSocket client → create session → receive output events
- File watcher debouncing: create 50 files rapidly → verify only 1-2 update messages
- WebSocket reconnection: disconnect and reconnect → verify state resynchronization

### Backend Load Tests

- Concurrent session creation (10 sessions simultaneously)
- Subscriber fan-out (3 subscribers receiving the same output)
- 5 concurrent WebSocket clients with 3 active sessions

### Frontend Tests

- All frontend code must run without console errors
- Sprite sheets match defined animation frame specifications
- Dialog UI renders correctly at 1280x720 minimum resolution

### End-to-End Tests

- Create instance → character appears → CLI output streams → drinks update
- Cross-browser validation
- Performance check for multiple simultaneous instances

---

## 14. Performance Targets

| Metric | Target |
|--------|--------|
| WebSocket message latency (server → client) | < 50ms |
| File watcher → drink update displayed | < 1 second (including 500ms debounce) |
| Character entrance animation | 300ms |
| Character exit animation | 500ms |
| Concurrent sessions supported | 10 (configurable) |
| Concurrent WebSocket clients | 5+ |
| Phaser frame rate | 60 FPS stable |
| Terminal output append | < 16ms per line (no frame drops) |
| Go backend memory per session | < 50 MB |
| Browser memory (10 sessions) | < 200 MB |

### Quality Gates

- All Golang code must pass `go vet` and `golint` with zero warnings
- All frontend code must run without console errors
- Every WebSocket message type must have a documented schema in the message protocol
- Sprite sheets must match the defined animation frame specifications
- Dialog UI must render correctly at 1280x720 minimum resolution
