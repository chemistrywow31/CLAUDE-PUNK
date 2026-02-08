/**
 * CLAUDE PUNK - Electron Main Process (Window + Settings Manager)
 *
 * This app does NOT manage backend/frontend processes.
 * User should start services manually with ./start.sh
 *
 * Manages:
 * - Application window creation
 * - Configuration management (ports, paths)
 * - Application menu
 */

import { app, BrowserWindow, Menu, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import log from 'electron-log';
import { loadConfig, saveConfig } from './config-manager.js';
import { createMenu } from './menu.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──── Global State ──────────────────────────────────────────────────────────

let mainWindow = null;

// ──── Logging Setup ─────────────────────────────────────────────────────────

log.transports.file.level = 'info';
log.info('CLAUDE PUNK starting...');

// ──── Utility: Check if Port is Open ───────────────────────────────────────

async function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.setTimeout(1000);
    req.end();
  });
}

// ──── Main Window Creation ──────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#0a0a14',
    title: 'CLAUDE PUNK',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load frontend
  const config = loadConfig();
  const frontendURL = `http://127.0.0.1:${config.frontend.port}`;

  log.info(`Loading frontend from ${frontendURL}...`);

  mainWindow.loadURL(frontendURL).catch((err) => {
    log.error('Failed to load frontend:', err);
    dialog.showErrorBox(
      'Connection Error',
      `Failed to connect to frontend at ${frontendURL}\n\n` +
      `Make sure ./start.sh is running.\n\n` +
      `Error: ${err.message}`
    );
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ──── Application Lifecycle ─────────────────────────────────────────────────

app.whenReady().then(async () => {
  log.info('Electron app ready');

  // Load config
  const config = loadConfig();
  log.info('Config loaded:', config);

  // Create menu
  const menu = createMenu(handlePreferences, app);
  Menu.setApplicationMenu(menu);

  // Check if backend and frontend are already running
  log.info('Checking if services are running...');
  const backendRunning = await checkPort(config.backend.port);
  const frontendRunning = await checkPort(config.frontend.port);

  log.info(`Backend (port ${config.backend.port}): ${backendRunning ? '✅' : '❌'}`);
  log.info(`Frontend (port ${config.frontend.port}): ${frontendRunning ? '✅' : '❌'}`);

  if (!backendRunning || !frontendRunning) {
    log.warn('Services not detected. Showing startup instructions...');
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: 'Services Not Running',
      message: 'CLAUDE PUNK requires backend and frontend services',
      detail: `Please start the services first:\n\n` +
              `   cd ${process.cwd()}\n` +
              `   ./start.sh\n\n` +
              `Status:\n` +
              `   Backend (port ${config.backend.port}): ${backendRunning ? '✅ Running' : '❌ Not running'}\n` +
              `   Frontend (port ${config.frontend.port}): ${frontendRunning ? '✅ Running' : '❌ Not running'}\n\n` +
              `After starting services, click "Retry".`,
      buttons: ['Retry', 'Quit', 'Open Terminal'],
      defaultId: 0,
    });

    if (result.response === 0) {
      // Retry - relaunch app
      app.relaunch();
      app.quit();
      return;
    } else if (result.response === 2) {
      // Open terminal at project directory
      const { spawn } = await import('node:child_process');
      spawn('open', ['-a', 'Terminal', process.cwd()]);
      app.quit();
      return;
    } else {
      // Quit
      app.quit();
      return;
    }
  }

  log.info('✅ Services detected! Creating window...');
  createWindow();

  // Open external browser if configured
  if (config.app.openBrowserOnStart) {
    log.info('Opening external browser...');
    const { shell } = await import('electron');
    shell.openExternal(`http://127.0.0.1:${config.frontend.port}`);
  }
});

app.on('activate', () => {
  // macOS: recreate window when dock icon is clicked and no windows open
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  // macOS: keep app running when all windows closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ──── Preferences Dialog ────────────────────────────────────────────────────

async function handlePreferences() {
  const config = loadConfig();

  // Show settings dialog
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Preferences',
    message: 'CLAUDE PUNK Settings',
    detail: `Current configuration:

Backend Port: ${config.backend.port}
Frontend Port: ${config.frontend.port}
Claude CLI Path: ${config.backend.claudePath}
Auto-run Claude: ${config.backend.autoRunClaude ? 'Yes' : 'No'}

Config file location:
${app.getPath('userData')}/config.json

Note: After changing ports, restart ./start.sh for changes to take effect.`,
    buttons: ['OK', 'Open Config File', 'Edit Ports...'],
  });

  if (result.response === 1) {
    // Open config file in Finder
    const { shell } = await import('electron');
    shell.showItemInFolder(path.join(app.getPath('userData'), 'config.json'));
  } else if (result.response === 2) {
    // Edit ports (simple prompt for now, can be improved with proper dialog)
    await editPorts(config);
  }
}

async function editPorts(config) {
  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Edit Ports',
    message: 'Change Port Configuration',
    detail: `Current ports:
  Backend: ${config.backend.port}
  Frontend: ${config.frontend.port}

To change ports:
1. Edit the config file manually
2. Restart ./start.sh with new ports
3. Relaunch this app

Open config file now?`,
    buttons: ['Cancel', 'Open Config File'],
  });

  if (result.response === 1) {
    const { shell } = await import('electron');
    const configPath = path.join(app.getPath('userData'), 'config.json');
    shell.showItemInFolder(configPath);
  }
}

// ──── Error Handling ────────────────────────────────────────────────────────

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
  dialog.showErrorBox('Unexpected Error', error.message);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});
