/**
 * CLAUDE PUNK - Process Manager
 *
 * Manages backend (Node.js server) and frontend (Vite dev server) child processes.
 * Features:
 * - Auto-start services on app launch
 * - Port conflict detection (no duplicate services)
 * - Graceful shutdown on app quit
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import log from 'electron-log';
import http from 'node:http';
import { app } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine project root based on whether app is packaged
// - Packaged: backend/frontend are in app.asar.unpacked or Resources/
// - Development: backend/frontend are in parent directories
const PROJECT_ROOT = app.isPackaged
  ? path.join(process.resourcesPath)  // /Applications/CLAUDE PUNK.app/Contents/Resources/
  : path.join(__dirname, '..', '..');  // App/electron → App → CLAUDE-PUNK

log.info(`[ProcessManager] App packaged: ${app.isPackaged}`);
log.info(`[ProcessManager] PROJECT_ROOT: ${PROJECT_ROOT}`);

// ──── Global State ──────────────────────────────────────────────────────────

let backendProcess = null;
let frontendProcess = null;
let isShuttingDown = false;

// ──── Port Checking ─────────────────────────────────────────────────────────

/**
 * Check if a port is already in use and responding
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - true if port is in use and responding
 */
async function checkPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      res.resume();
      resolve(true); // Port is in use and responding
    });

    req.on('error', () => {
      resolve(false); // Port is not in use or not responding
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.setTimeout(1000);
    req.end();
  });
}

/**
 * Wait for a service to be ready by polling the port
 * @param {number} port - Port to check
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} intervalMs - Interval between attempts
 * @returns {Promise<boolean>} - true if service became ready
 */
async function waitForPort(port, maxAttempts = 30, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await checkPortInUse(port);
    if (ready) {
      log.info(`✓ Port ${port} is ready (attempt ${i + 1}/${maxAttempts})`);
      return true;
    }

    if ((i + 1) % 5 === 0) {
      log.info(`⏳ Waiting for port ${port}... (attempt ${i + 1}/${maxAttempts})`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  log.error(`✗ Port ${port} did not become available after ${maxAttempts} attempts`);
  return false;
}

// ──── Start Backend ─────────────────────────────────────────────────────────

export async function startBackend(config) {
  // Check if backend is already running
  if (backendProcess) {
    log.warn('Backend process already running (PID: ' + backendProcess.pid + ')');
    return true;
  }

  // Check if port is already in use (maybe started externally)
  const portInUse = await checkPortInUse(config.backend.port);
  if (portInUse) {
    log.info(`✅ Backend port ${config.backend.port} already in use - reusing existing service`);
    return true;
  }

  const backendDir = path.join(PROJECT_ROOT, 'backend');

  log.info(`🚀 Starting backend on port ${config.backend.port}...`);

  // Use process.execPath (Node.js binary from Electron) instead of 'node'
  // This ensures Node.js is found even when app is packaged
  const nodePath = process.execPath;
  log.info(`Using Node.js: ${nodePath}`);

  backendProcess = spawn(nodePath, ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: config.backend.port.toString(),
      CLAUDE_PATH: config.backend.claudePath,
      AUTO_RUN_CLAUDE: config.backend.autoRunClaude.toString(),
      SHELL: process.env.SHELL || '/bin/zsh',
    },
    stdio: 'pipe',
  });

  // Log backend output
  backendProcess.stdout.on('data', (data) => {
    log.info('[Backend]', data.toString().trim());
  });

  backendProcess.stderr.on('data', (data) => {
    log.error('[Backend Error]', data.toString().trim());
  });

  backendProcess.on('error', (error) => {
    log.error('Failed to start backend:', error);
    backendProcess = null;
  });

  backendProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      log.error(`Backend exited unexpectedly. Code: ${code}, Signal: ${signal}`);
    } else {
      log.info('Backend stopped gracefully');
    }
    backendProcess = null;
  });

  // Wait for backend to be ready
  log.info(`Waiting for backend on port ${config.backend.port}...`);
  const ready = await waitForPort(config.backend.port, 20, 500);

  if (!ready) {
    log.error('❌ Backend failed to start within timeout');
    if (backendProcess) {
      backendProcess.kill('SIGTERM');
      backendProcess = null;
    }
    return false;
  }

  log.info('✅ Backend started successfully (PID: ' + backendProcess.pid + ')');
  return true;
}

// ──── Start Frontend ────────────────────────────────────────────────────────

export async function startFrontend(config) {
  // Check if frontend is already running
  if (frontendProcess) {
    log.warn('Frontend process already running (PID: ' + frontendProcess.pid + ')');
    return true;
  }

  // Check if port is already in use (maybe started externally)
  const portInUse = await checkPortInUse(config.frontend.port);
  if (portInUse) {
    log.info(`✅ Frontend port ${config.frontend.port} already in use - reusing existing service`);
    return true;
  }

  const frontendDir = path.join(PROJECT_ROOT, 'frontend');
  const viteExecutable = path.join(frontendDir, 'node_modules', '.bin', 'vite');

  log.info(`🚀 Starting frontend on port ${config.frontend.port}...`);
  log.info(`Using vite: ${viteExecutable}`);

  // Use vite directly from node_modules/.bin
  frontendProcess = spawn(viteExecutable, [], {
    cwd: frontendDir,
    env: {
      ...process.env,
      PORT: config.frontend.port.toString(),
      VITE_PORT: config.frontend.port.toString(),
      BACKEND_URL: `http://127.0.0.1:${config.backend.port}`,
    },
    stdio: 'pipe',
  });

  // Log frontend output
  frontendProcess.stdout.on('data', (data) => {
    log.info('[Frontend]', data.toString().trim());
  });

  frontendProcess.stderr.on('data', (data) => {
    // Vite logs to stderr by default, so don't treat everything as error
    const output = data.toString().trim();
    if (output.toLowerCase().includes('error')) {
      log.error('[Frontend Error]', output);
    } else {
      log.info('[Frontend]', output);
    }
  });

  frontendProcess.on('error', (error) => {
    log.error('Failed to start frontend:', error);
    frontendProcess = null;
  });

  frontendProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      log.error(`Frontend exited unexpectedly. Code: ${code}, Signal: ${signal}`);
    } else {
      log.info('Frontend stopped gracefully');
    }
    frontendProcess = null;
  });

  // Wait for frontend to be ready (Vite takes longer to start)
  log.info(`Waiting for frontend on port ${config.frontend.port}...`);
  const ready = await waitForPort(config.frontend.port, 60, 1000);

  if (!ready) {
    log.error('❌ Frontend failed to start within timeout');
    if (frontendProcess) {
      frontendProcess.kill('SIGTERM');
      frontendProcess = null;
    }
    return false;
  }

  log.info('✅ Frontend started successfully (PID: ' + frontendProcess.pid + ')');
  return true;
}

// ──── Start All ─────────────────────────────────────────────────────────────

/**
 * Start both backend and frontend services
 * @param {Object} config - Configuration object
 * @returns {Promise<{backend: boolean, frontend: boolean}>}
 */
export async function startAll(config) {
  log.info('🚀 Starting all services...');

  const backendStarted = await startBackend(config);
  if (!backendStarted) {
    log.error('❌ Failed to start backend');
    return { backend: false, frontend: false };
  }

  const frontendStarted = await startFrontend(config);
  if (!frontendStarted) {
    log.error('❌ Failed to start frontend');
    // Backend started but frontend failed - decide whether to keep backend running
    // For now, keep backend running as it might be useful for debugging
    return { backend: true, frontend: false };
  }

  log.info('✅ All services started successfully');
  return { backend: true, frontend: true };
}

// ──── Stop All ──────────────────────────────────────────────────────────────

/**
 * Stop all services gracefully
 */
export async function stopAll() {
  log.info('🛑 Stopping all services...');
  isShuttingDown = true;

  if (frontendProcess) {
    log.info('Stopping frontend...');
    frontendProcess.kill('SIGTERM');
    frontendProcess = null;
  }

  if (backendProcess) {
    log.info('Stopping backend...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }

  // Give processes time to clean up
  await new Promise(resolve => setTimeout(resolve, 1000));

  log.info('All services stopped');
}

// ──── Restart All ───────────────────────────────────────────────────────────

/**
 * Restart all services
 * @param {Object} config - Configuration object
 * @returns {Promise<{backend: boolean, frontend: boolean}>}
 */
export async function restartAll(config) {
  log.info('🔄 Restarting all services...');

  await stopAll();

  // Wait a bit for ports to be released
  await new Promise((resolve) => setTimeout(resolve, 2000));

  isShuttingDown = false;
  return startAll(config);
}

// ──── Get Status ────────────────────────────────────────────────────────────

/**
 * Get the current status of services
 * @returns {Object} - Status of backend and frontend processes
 */
export function getStatus() {
  return {
    backend: {
      running: backendProcess !== null,
      pid: backendProcess?.pid,
    },
    frontend: {
      running: frontendProcess !== null,
      pid: frontendProcess?.pid,
    },
  };
}
