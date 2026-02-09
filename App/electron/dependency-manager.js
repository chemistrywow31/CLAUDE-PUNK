/**
 * CLAUDE PUNK - Dependency Manager
 *
 * Ensures backend and frontend dependencies are installed before starting services.
 * Features:
 * - Auto-detect missing node_modules
 * - Install dependencies on first run or when missing
 * - Progress reporting via callback
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import { app } from 'electron';

const PROJECT_ROOT = app.isPackaged
  ? path.join(process.resourcesPath)
  : path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');

// ──── Dependency Checking ───────────────────────────────────────────────────

/**
 * Check if node_modules exists and has required packages
 * @param {string} directory - Directory to check (backend or frontend)
 * @returns {boolean} - true if dependencies are installed
 */
function checkDependencies(directory) {
  const nodeModulesPath = path.join(directory, 'node_modules');
  const packageJsonPath = path.join(directory, 'package.json');

  // Check if package.json exists
  if (!fs.existsSync(packageJsonPath)) {
    log.warn(`package.json not found in ${directory}`);
    return false;
  }

  // Check if node_modules exists
  if (!fs.existsSync(nodeModulesPath)) {
    log.info(`node_modules not found in ${directory}`);
    return false;
  }

  // Read package.json to check key dependencies
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check if at least some key packages are installed
    for (const dep of Object.keys(dependencies).slice(0, 3)) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        log.info(`Dependency ${dep} missing in ${directory}`);
        return false;
      }
    }

    log.info(`✓ Dependencies verified in ${directory}`);
    return true;
  } catch (error) {
    log.error(`Error checking dependencies in ${directory}:`, error);
    return false;
  }
}

/**
 * Install dependencies in a directory
 * @param {string} directory - Directory where to run npm install
 * @param {function} onProgress - Callback for progress updates (message: string)
 * @returns {Promise<boolean>} - true if installation succeeded
 */
async function installDependencies(directory, onProgress = null) {
  return new Promise((resolve) => {
    const dirName = path.basename(directory);
    log.info(`Installing dependencies in ${dirName}...`);
    onProgress?.(`Installing ${dirName} dependencies...`);

    // Use npm from Electron's Node.js
    const npmPath = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const installProcess = spawn(npmPath, ['install'], {
      cwd: directory,
      stdio: 'pipe',
      env: {
        ...process.env,
      },
    });

    let output = '';

    installProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      output += message + '\n';
      log.info(`[${dirName} npm]`, message);

      // Report progress for key milestones
      if (message.includes('added') || message.includes('packages')) {
        onProgress?.(message);
      }
    });

    installProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      output += message + '\n';
      // npm outputs progress to stderr, not always errors
      if (message.toLowerCase().includes('error')) {
        log.error(`[${dirName} npm error]`, message);
      } else {
        log.info(`[${dirName} npm]`, message);
      }
    });

    installProcess.on('error', (error) => {
      log.error(`Failed to spawn npm in ${dirName}:`, error);
      onProgress?.(`❌ Failed to install ${dirName} dependencies`);
      resolve(false);
    });

    installProcess.on('exit', (code) => {
      if (code === 0) {
        log.info(`✅ Successfully installed ${dirName} dependencies`);
        onProgress?.(`✅ ${dirName} dependencies installed`);
        resolve(true);
      } else {
        log.error(`❌ npm install failed in ${dirName} with code ${code}`);
        log.error(`Output:\n${output}`);
        onProgress?.(`❌ Failed to install ${dirName} dependencies (exit code ${code})`);
        resolve(false);
      }
    });
  });
}

// ──── Public API ────────────────────────────────────────────────────────────

/**
 * Ensure all dependencies are installed (backend + frontend)
 * @param {function} onProgress - Callback for progress updates
 * @returns {Promise<{backend: boolean, frontend: boolean}>}
 */
export async function ensureAllDependencies(onProgress = null) {
  const backendDir = path.join(PROJECT_ROOT, 'backend');
  const frontendDir = path.join(PROJECT_ROOT, 'frontend');

  log.info('🔍 Checking dependencies...');
  onProgress?.('Checking dependencies...');

  const results = {
    backend: true,
    frontend: true,
  };

  // Check backend
  if (!checkDependencies(backendDir)) {
    log.info('📦 Installing backend dependencies...');
    results.backend = await installDependencies(backendDir, onProgress);
  }

  // Check frontend
  if (!checkDependencies(frontendDir)) {
    log.info('📦 Installing frontend dependencies...');
    results.frontend = await installDependencies(frontendDir, onProgress);
  }

  if (results.backend && results.frontend) {
    log.info('✅ All dependencies are ready');
    onProgress?.('✅ All dependencies ready');
  } else {
    log.error('❌ Some dependencies failed to install');
    onProgress?.('❌ Dependency installation failed');
  }

  return results;
}

/**
 * Force reinstall all dependencies (clean install)
 * @param {function} onProgress - Callback for progress updates
 * @returns {Promise<{backend: boolean, frontend: boolean}>}
 */
export async function reinstallAllDependencies(onProgress = null) {
  const backendDir = path.join(PROJECT_ROOT, 'backend');
  const frontendDir = path.join(PROJECT_ROOT, 'frontend');

  log.info('🔄 Forcing reinstall of all dependencies...');
  onProgress?.('Reinstalling all dependencies...');

  const results = {
    backend: await installDependencies(backendDir, onProgress),
    frontend: await installDependencies(frontendDir, onProgress),
  };

  return results;
}
