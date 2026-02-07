---
name: Project Structure
description: Directory layout and file organization conventions for the Claude Bar Game codebase
---

# Project Structure

## Applicability

- Applies to: `session-manager`, `realtime-server`, `game-renderer`, `ui-developer`, `art-producer`

## Rule Content

### Root Directory Layout

```
claude-bar-game/
├── backend/          ← Node.js source (src/, package.json)
├── frontend/         ← Phaser.js source (src/, public/, package.json)
├── assets/           ← Game assets (sprites/, backgrounds/, scripts/)
└── README.md
```

- `backend/server.js` — Entry point (single-file for initial development)
- `backend/src/{session,realtime,watcher}/` — Domain modules (when modularized)
- `frontend/src/{scenes,entities,ui,services,config,styles}/` — Source modules
- `assets/{sprites,backgrounds}/` — Game art; `assets/scripts/` — Processing tools

### Backend Conventions

- Node.js with Express + Socket.io + node-pty
- Single `server.js` entry point initially; modularize into `src/` as complexity grows
- Use ES modules (`import`/`export`) with `"type": "module"` in package.json
- One module per domain concern: `session`, `realtime`, `watcher`
- Use JSDoc for type annotations
- Tests in `__tests__/` or adjacent `.test.js` files

### Frontend Conventions

- Use Vite as the build tool
- One class per file; JS files use `PascalCase.js`, utilities use `camelCase.js`
- CSS files in `frontend/src/styles/`, one per component area

### Asset Conventions

- All game assets live in `assets/` at the project root (not inside `frontend/`)
- Sprite sheets: PNG + JSON atlas in the same directory, same base name
- Processing scripts in `assets/scripts/`

### Naming Rules

- Backend JS: `camelCase.js` (modules), `PascalCase.js` (classes)
- Frontend JS: `PascalCase.js` (classes), `camelCase.js` (utilities)
- CSS/Assets/Directories: `kebab-case`

## Violation Determination

- Backend source files outside `backend/` → Violation
- Frontend source files outside `frontend/src/` → Violation
- Asset files inside `frontend/src/` instead of `assets/` → Violation
- File name not following the naming convention for its type → Violation

## Exceptions

- `README.md`, `.gitignore`, `Makefile` live at the project root
- `package.json` and `package-lock.json` live in `backend/` root
