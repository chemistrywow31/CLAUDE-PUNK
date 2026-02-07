# Claude Punk
![neon-sign-main.png](frontend/public/assets/sprites/ui/neon-sign-main.png) <br>
A cyberpunk pixel-art bar game that turns AI coding agents into bar patrons. Each agent (Claude / Codex) spawns as a chibi character, walks to a seat, and works on your codebase — you can watch their terminal output in real time while they sip drinks at the bar.

![Phaser 3](https://img.shields.io/badge/Phaser-3.80-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

## Screenshots

<p align="center">
  <img src="frontend/public/assets/screenshots/screenshot-1.png" width="600"><br>
  <em>caption 1</em>
</p>

<p align="center">
  <img src="frontend/public/assets/screenshots/screenshot-2.png" width="600"><br>
  <em>caption 2</em>
</p>

<p align="center">
  <img src="frontend/public/assets/screenshots/screenshot-3.png" width="600"><br>
  <em>caption 3</em>
</p>

<p align="center">
  <img src="frontend/public/assets/screenshots/screenshot-4.png" width="600"><br>
  <em>caption 4</em>
</p>

## How It Works

1. You pick a project folder via the in-game door
2. A coding agent (Claude or Codex) spawns in a terminal session
3. The agent appears as a character in the bar, walks to a seat and starts working
4. Each character shows a hotkey label like `(a)` above their name — press the letter to open their dialog instantly
5. Click on a character (or press their hotkey) to interact: terminal, file editor, config
6. The more files in the project, the more drinks appear on the table

## Prerequisites

Before you begin, make sure you have the following installed:

### Node.js (v20+)

```bash
# macOS (Homebrew)
brew install node

# Or use nvm
nvm install 20
nvm use 20
```

### node-pty dependencies
```
sudo apt-get update
sudo apt-get install -y make python build-essential
```

### Claude Code CLI

This project spawns Claude Code as a subprocess. Install it globally:

```bash
npm install -g @anthropic-ai/claude-code
```

After installing, run `claude` once to complete the authentication flow (you'll need an Anthropic API key or a Claude Pro/Team subscription).

### OpenAI Codex CLI (optional)

If you want to use Codex agents in addition to Claude:

```bash
npm install -g @openai/codex
```

Run `codex` once to authenticate with your OpenAI API key.

## Getting Started

### 1. Clone the repo

```bash
git clone <repo-url>
cd claude-punk
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

> **Note:** `node-pty` is a native module and requires build tools. On macOS you need Xcode Command Line Tools (`xcode-select --install`). On Linux you need `build-essential` and `python3`.

### 3. Install frontend dependencies

```bash
cd ../frontend
npm install
```

### 4. Start the backend

```bash
cd ../backend
npm run dev
```

The backend starts on `http://127.0.0.1:3000`. You should see:

```
[Claude Punk] Backend running on http://127.0.0.1:3000
[Claude Punk] WebSocket at ws://127.0.0.1:3000/ws
```

### 5. Start the frontend (in a new terminal)

```bash
cd frontend
npm run dev
```

The frontend starts on `http://localhost:5173`. Open it in your browser.

Vite automatically proxies `/ws` and `/api` requests to the backend, so everything works through a single URL.

## Usage

1. Open `http://localhost:5173` in your browser
2. Click the **door** on the right side of the bar to open the folder picker
3. Select a project directory — a new agent session spawns
4. The character walks from the door to an empty seat, with a hotkey label `(a)` above their name
5. Press the hotkey letter (e.g. `a`) to open the dialog, or click on the character directly
6. The dialog panel has 3 tabs:
   - **Terminal** — live xterm.js terminal with a **File Warp** sidebar on the left. Click any file or folder name in the sidebar to insert its path into the terminal.
   - **Files** — split view with a file tree sidebar (left) and a **Monaco code editor + preview** pane (right). Click a file to open it. Markdown, HTML, and SVG files open in rendered preview by default — toggle the `CODE` button to see source. Toggle `READ-ONLY` to `EDITING` mode and hit `SAVE` to write changes back to disk.
   - **Config** — `.claude/` configuration files
7. Press `Ctrl+`` ` to close the dialog (works even when the terminal has focus), or click the X button

## Keyboard Shortcuts

| Shortcut | Context | Action |
|----------|---------|--------|
| `Ctrl+`` ` | Anywhere | Close any open overlay (dialog, folder picker, jukebox) |
| `Escape` | When not focused in terminal | Close current overlay |
| `a` - `z` | Bar scene (no overlay open) | Open dialog for the patron with that hotkey letter |

- Hotkey letters are assigned in order (`a`, `b`, `c`...) as patrons enter the bar
- When a session terminates, its letter is freed and recycled for the next patron
- The assigned letter appears as `(a) label` above each character's head

## Project Structure

```
claude-punk/
├── backend/                # Node.js backend
│   ├── server.js           # Single-file entry point (Express + WebSocket + PTY)
│   └── package.json
├── frontend/               # Phaser.js + Vite frontend
│   ├── src/
│   │   ├── main.js         # Phaser game bootstrap
│   │   ├── scenes/         # Game scenes (BarScene)
│   │   ├── entities/       # Character, Bartender, DrinkManager
│   │   ├── managers/       # HotkeyManager (keyboard shortcuts)
│   │   ├── ui/             # HTML/CSS overlay panels
│   │   │   ├── DialogBox.js
│   │   │   ├── TerminalTab.js
│   │   │   ├── FilesTab.js
│   │   │   ├── FileEditor.js      # Monaco editor + rich preview
│   │   │   ├── FileWarpPanel.js   # Terminal sidebar file tree
│   │   │   ├── FolderPicker.js
│   │   │   ├── Jukebox.js
│   │   │   └── ClaudeConfigTab.js
│   │   ├── services/       # WebSocket client, audio
│   │   ├── config/         # Game constants and configuration
│   │   └── styles/         # CSS files
│   ├── index.html
│   └── vite.config.js
└── assets/                 # Game art (sprites, backgrounds)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Game engine | Phaser 3 (1920x1080, pixel-perfect scaling) |
| Terminal UI | xterm.js |
| Code editor | Monaco Editor |
| Markdown preview | marked |
| Frontend build | Vite |
| Backend runtime | Node.js (ES modules) |
| HTTP server | Express |
| WebSocket | ws (raw WebSocket, JSON envelope protocol) |
| PTY management | node-pty |
| File watching | chokidar |

## Configuration

The backend has a `CONFIG` object at the top of `server.js` with tunable values:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Backend port (env var) |
| `AUTO_RUN_CLAUDE` | `true` | Auto-start the agent when a session is created |
| `maxSessions` | `16` | Maximum concurrent agent sessions |
| `fileCountRatio` | `20` | Files per drink (`drinkCount = floor(fileCount / 20)`) |

## Troubleshooting

**`node-pty` fails to install**
Make sure you have native build tools: `xcode-select --install` on macOS, or `sudo apt install build-essential python3` on Ubuntu/Debian.

**"claude: command not found" when a session starts**
Install the Claude CLI globally: `npm install -g @anthropic-ai/claude-code`, then run `claude` once to authenticate.

**WebSocket connection fails**
Make sure the backend is running on port 3000 before starting the frontend. Vite proxies WebSocket traffic to the backend.

**Port already in use**
Kill the existing process or change the port: `PORT=3001 node server.js` (and update `vite.config.js` proxy target accordingly).

## dev team
  - dev team agent created by [A-Team](https://github.com/chemistrywow31/A-Team) (Claude Code multi-agent system for team design)
