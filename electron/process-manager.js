/**
 * CLAUDE PUNK - Process Manager
 *
 * Manages backend (Node.js server) and frontend (Vite dev server) child processes.
 * Injects configuration via environment variables.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import log from 'electron-log';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// ──── Global State ──────────────────────────────────────────────────────────

let backendProcess = null;
let frontendProcess = null;

// ──── Utility: Wait for Port ───────────────────────────────────────────────

async function waitForPort(port, maxAttempts = 30, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        // Use 127.0.0.1 to force IPv4 (avoid IPv6 ::1 which may not be bound)
        const req = http.get(`http://127.0.0.1:${port}`, (res) => {
          res.resume(); // Consume response data
          resolve();
        });
        req.on('error', (err) => {
          reject(err);
        });
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        req.setTimeout(1000); // 1 second timeout
        req.end();
      });
      log.info(`✓ Port ${port} is now available (attempt ${i + 1}/${maxAttempts})`);
      return true;
    } catch (error) {
      if (i === maxAttempts - 1) {
        log.error(`✗ Port ${port} did not become available after ${maxAttempts} attempts`);
        log.error(`Last error:`, error.message);
        throw new Error(`Port ${port} did not become available after ${maxAttempts} attempts`);
      }
      if ((i + 1) % 5 === 0) {
        log.info(`⏳ Still waiting for port ${port}... (attempt ${i + 1}/${maxAttempts}) - error: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}

// ──── Start Backend ─────────────────────────────────────────────────────────

export async function startBackend(config) {
  if (backendProcess) {
    log.warn('Backend already running');
    return;
  }

  const backendDir = path.join(PROJECT_ROOT, 'backend');

  log.info('Spawning backend process...');
  backendProcess = spawn('node', ['server.js'], {
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

  backendProcess.stdout.on('data', (data) => {
    log.info('[Backend]', data.toString().trim());
  });

  backendProcess.stderr.on('data', (data) => {
    log.error('[Backend]', data.toString().trim());
  });

  backendProcess.on('exit', (code, signal) => {
    log.warn(`Backend exited with code ${code}, signal ${signal}`);
    backendProcess = null;
  });

  // Give backend a moment to initialize
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Wait for backend to be ready
  log.info(`Waiting for backend on port ${config.backend.port}...`);
  await waitForPort(config.backend.port);
  log.info('Backend ready');
}

// ──── Start Frontend ────────────────────────────────────────────────────────

export async function startFrontend(config) {
  if (frontendProcess) {
    log.warn('Frontend already running');
    return;
  }

  const frontendDir = path.join(PROJECT_ROOT, 'frontend');

  log.info('Spawning frontend process...');
  frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: frontendDir,
    env: {
      ...process.env,
      VITE_PORT: config.frontend.port.toString(),
      BACKEND_URL: `http://localhost:${config.backend.port}`,
    },
    stdio: 'pipe',
    shell: true,
  });

  frontendProcess.stdout.on('data', (data) => {
    log.info('[Frontend]', data.toString().trim());
  });

  frontendProcess.stderr.on('data', (data) => {
    // Vite logs to stderr, so we treat it as info
    log.info('[Frontend]', data.toString().trim());
  });

  frontendProcess.on('exit', (code, signal) => {
    log.warn(`Frontend exited with code ${code}, signal ${signal}`);
    frontendProcess = null;
  });

  // Give frontend a moment to initialize
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Wait for frontend to be ready (Vite takes longer to start)
  log.info(`Waiting for frontend on port ${config.frontend.port}...`);
  await waitForPort(config.frontend.port, 60, 1000); // 60 seconds timeout for Vite
  log.info('Frontend ready');
}

// ──── Stop All ──────────────────────────────────────────────────────────────

export function stopAll() {
  log.info('Stopping all processes...');

  if (backendProcess) {
    log.info('Killing backend process...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }

  if (frontendProcess) {
    log.info('Killing frontend process...');
    frontendProcess.kill('SIGTERM');
    frontendProcess = null;
  }

  log.info('All processes stopped');
}

// ──── Restart All ───────────────────────────────────────────────────────────

export async function restartAll(config) {
  log.info('Restarting all processes...');

  stopAll();

  // Wait a bit for ports to be released
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await startBackend(config);
  await startFrontend(config);

  log.info('All processes restarted');
}
