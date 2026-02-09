/**
 * CLAUDE PUNK - Electron Main Process
 *
 * Auto-starts backend and frontend services with intelligent port management:
 * - Detects if services are already running (no duplicate processes)
 * - Gracefully shuts down services on app quit
 * - Manages application window and configuration
 */

import { app, BrowserWindow, Menu, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import log from 'electron-log';
import { loadConfig, saveConfig, updatePorts, getLastPorts } from './config-manager.js';
import { createMenu } from './menu.js';
import { startAll, stopAll, restartAll, getStatus } from './process-manager.js';
import { ensureAllDependencies } from './dependency-manager.js';
import { allocatePorts, validatePorts } from './port-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──── Global State ──────────────────────────────────────────────────────────

let mainWindow = null;
let servicesStarted = false;

// ──── Logging Setup ─────────────────────────────────────────────────────────

log.transports.file.level = 'info';
log.info('🎮 CLAUDE PUNK starting...');

// ──── Single Instance Lock ──────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.info('Another instance is already running, focusing existing window...');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    log.info('Second instance detected, focusing main window');
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
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
      `Error: ${err.message}\n\n` +
      `This might be a temporary issue. The frontend may still be starting up.`
    );
  });

  // Open DevTools automatically (unless app is packaged)
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
    log.info('🔧 DevTools opened (press F12 or Cmd+Alt+I to toggle)');
  }

  // Log frontend console messages to electron log
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelMap = ['[Frontend]', '[Frontend Warning]', '[Frontend Error]'];
    const logLevel = levelMap[level] || '[Frontend]';
    log.info(`${logLevel} ${message}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ──── Application Lifecycle ─────────────────────────────────────────────────

app.whenReady().then(async () => {
  log.info('Electron app ready');

  // Load config
  let config = loadConfig();
  log.info('Config loaded:', JSON.stringify(config, null, 2));

  // Create menu
  const menu = createMenu(handlePreferences, handleRestart, app);
  Menu.setApplicationMenu(menu);

  // ──── Step 1: Dynamic Port Allocation ────────────────────────────────────
  log.info('🔌 Allocating ports...');

  try {
    // Get last allocated ports
    const lastPorts = getLastPorts();

    // Allocate ports (will try to reuse last ports if available)
    const allocatedPorts = await allocatePorts(lastPorts);

    if (!allocatedPorts) {
      log.error('❌ Failed to allocate ports');

      await dialog.showMessageBox({
        type: 'error',
        title: 'Port Allocation Failed',
        message: 'Unable to find available ports',
        detail: 'All ports in the safe range (13000-13999, 15000-15999) appear to be occupied.\n\n' +
                'This could be due to:\n' +
                '- Too many services running on your system\n' +
                '- Firewall or security software blocking ports\n\n' +
                'Try closing other applications and restarting.',
        buttons: ['Quit'],
      });

      app.quit();
      return;
    }

    // Update config with allocated ports
    updatePorts(allocatedPorts);
    config = loadConfig(); // Reload config with updated ports

    log.info(`✅ Ports allocated: Backend=${allocatedPorts.backend}, Frontend=${allocatedPorts.frontend}`);
  } catch (error) {
    log.error('Error during port allocation:', error);

    await dialog.showErrorBox(
      'Port Allocation Error',
      `Failed to allocate ports:\n\n${error.message}\n\nThe app will now quit.`
    );

    app.quit();
    return;
  }

  // ──── Step 2: Ensure Dependencies ────────────────────────────────────────
  log.info('📦 Checking dependencies...');

  let progressWindow = null;

  // Show progress dialog for dependency installation
  const showProgress = (message) => {
    log.info(`[Progress] ${message}`);
    if (progressWindow) {
      progressWindow.webContents.send('progress-update', message);
    }
  };

  try {
    const depResult = await ensureAllDependencies(showProgress);

    if (!depResult.backend || !depResult.frontend) {
      log.error('❌ Failed to ensure dependencies');

      await dialog.showMessageBox({
        type: 'error',
        title: 'Dependency Error',
        message: 'Failed to install required dependencies',
        detail: `Backend dependencies: ${depResult.backend ? '✅' : '❌'}\n` +
                `Frontend dependencies: ${depResult.frontend ? '✅' : '❌'}\n\n` +
                `This may be due to:\n` +
                `- No internet connection\n` +
                `- npm not properly installed\n` +
                `- Insufficient disk space\n\n` +
                `Check the log file for details.`,
        buttons: ['Quit', 'Open Log'],
      });

      app.quit();
      return;
    }

    log.info('✅ All dependencies verified');
  } catch (error) {
    log.error('Unexpected error checking dependencies:', error);

    await dialog.showErrorBox(
      'Dependency Check Failed',
      `Failed to verify dependencies:\n\n${error.message}\n\nCheck the log file for details.`
    );

    app.quit();
    return;
  }

  // ──── Step 3: Start Services ─────────────────────────────────────────────
  log.info('🚀 Starting services...');

  try {
    const result = await startAll(config);

    if (result.backend && result.frontend) {
      servicesStarted = true;
      log.info('✅ All services started successfully');
      log.info(`🌐 Services running on:`);
      log.info(`   Backend:  http://127.0.0.1:${config.backend.port}`);
      log.info(`   Frontend: http://127.0.0.1:${config.frontend.port}`);

      // Give services a moment to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create window
      createWindow();

      // Open external browser if configured
      if (config.app.openBrowserOnStart) {
        log.info('Opening external browser...');
        const { shell } = await import('electron');
        shell.openExternal(`http://127.0.0.1:${config.frontend.port}`);
      }
    } else {
      // Services failed to start
      log.error('❌ Failed to start services');

      const errorResult = await dialog.showMessageBox({
        type: 'error',
        title: 'Startup Failed',
        message: 'Failed to start CLAUDE PUNK services',
        detail: `Status:\n` +
                `   Backend: ${result.backend ? '✅ Running' : '❌ Failed'}\n` +
                `   Frontend: ${result.frontend ? '✅ Running' : '❌ Failed'}\n\n` +
                `Possible causes:\n` +
                `   - Ports ${config.backend.port} or ${config.frontend.port} are in use by another app\n` +
                `   - Node.js or npm not properly installed\n` +
                `   - Missing dependencies (run 'npm install' in backend and frontend)\n\n` +
                `Check the log file for details:\n` +
                `${log.transports.file.getFile().path}`,
        buttons: ['Quit', 'Open Log', 'Retry'],
        defaultId: 2,
      });

      if (errorResult.response === 1) {
        // Open log file
        const { shell } = await import('electron');
        shell.showItemInFolder(log.transports.file.getFile().path);
      } else if (errorResult.response === 2) {
        // Retry
        app.relaunch();
      }

      app.quit();
      return;
    }
  } catch (error) {
    log.error('Unexpected error during startup:', error);

    await dialog.showErrorBox(
      'Startup Error',
      `An unexpected error occurred:\n\n${error.message}\n\nCheck the log file for details.`
    );

    app.quit();
    return;
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
  // Services will keep running until app quits
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (servicesStarted) {
    log.info('App quitting, stopping services...');
    event.preventDefault();

    await stopAll();
    servicesStarted = false;

    // Now actually quit
    app.quit();
  }
});

// ──── Preferences Dialog ────────────────────────────────────────────────────

async function handlePreferences() {
  const config = loadConfig();
  const status = getStatus();

  // Show settings dialog
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Preferences',
    message: 'CLAUDE PUNK Settings',
    detail: `Current configuration:

🔌 Dynamic Port Allocation (Auto-assigned):
Backend Port: ${config.backend.port || 'Not allocated'}
Frontend Port: ${config.frontend.port || 'Not allocated'}
Safe Range: Backend (13000-13999), Frontend (15000-15999)

⚙️ Backend Settings:
Claude CLI Path: ${config.backend.claudePath}
Auto-run Claude: ${config.backend.autoRunClaude ? 'Yes' : 'No'}

📊 Services Status:
Backend: ${status.backend.running ? `✅ Running (PID: ${status.backend.pid})` : '❌ Not running'}
Frontend: ${status.frontend.running ? `✅ Running (PID: ${status.frontend.pid})` : '❌ Not running'}

📁 Config file location:
${app.getPath('userData')}/config.json

💡 Note: Ports are dynamically allocated on each start to avoid conflicts.
After changing configuration, use "Restart Services" from the menu.`,
    buttons: ['OK', 'Open Config File', 'Restart Services'],
  });

  if (result.response === 1) {
    // Open config file in Finder
    const { shell } = await import('electron');
    shell.showItemInFolder(path.join(app.getPath('userData'), 'config.json'));
  } else if (result.response === 2) {
    // Restart services
    await handleRestart();
  }
}

async function handleRestart() {
  const config = loadConfig();

  log.info('User requested service restart');

  const confirmResult = await dialog.showMessageBox({
    type: 'question',
    title: 'Restart Services',
    message: 'Restart backend and frontend services?',
    detail: 'This will stop and restart both services with the current configuration.',
    buttons: ['Cancel', 'Restart'],
    defaultId: 1,
  });

  if (confirmResult.response !== 1) {
    return;
  }

  try {
    log.info('Restarting services...');

    const result = await restartAll(config);

    if (result.backend && result.frontend) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Restart Complete',
        message: 'Services restarted successfully',
        buttons: ['OK'],
      });

      // Reload window
      if (mainWindow) {
        mainWindow.reload();
      }
    } else {
      dialog.showMessageBox({
        type: 'error',
        title: 'Restart Failed',
        message: 'Failed to restart services',
        detail: `Backend: ${result.backend ? '✅' : '❌'}\nFrontend: ${result.frontend ? '✅' : '❌'}`,
        buttons: ['OK'],
      });
    }
  } catch (error) {
    log.error('Error restarting services:', error);
    dialog.showErrorBox('Restart Error', `Failed to restart services:\n\n${error.message}`);
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
