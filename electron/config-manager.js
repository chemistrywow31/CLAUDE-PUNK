/**
 * CLAUDE PUNK - Configuration Manager
 *
 * Uses electron-store to persist user preferences.
 */

import Store from 'electron-store';
import { app } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import log from 'electron-log';

// ──── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  backend: {
    port: 3000,
    autoRunClaude: true,
    claudePath: detectClaudePath(),
  },
  frontend: {
    port: 5173,
  },
  app: {
    openBrowserOnStart: false, // Default to false for Electron app
  },
};

// ──── Claude CLI Path Detection ────────────────────────────────────────────

function detectClaudePath() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      log.info(`Detected Claude CLI at: ${candidate}`);
      return candidate;
    }
  }

  log.warn('Claude CLI not found in default locations');
  return path.join(os.homedir(), '.local', 'bin', 'claude'); // Fallback
}

// ──── Store Setup ───────────────────────────────────────────────────────────

const store = new Store({
  name: 'config',
  defaults: DEFAULT_CONFIG,
  schema: {
    backend: {
      type: 'object',
      properties: {
        port: { type: 'number', minimum: 1024, maximum: 65535, default: 3000 },
        autoRunClaude: { type: 'boolean', default: true },
        claudePath: { type: 'string' },
      },
    },
    frontend: {
      type: 'object',
      properties: {
        port: { type: 'number', minimum: 1024, maximum: 65535, default: 5173 },
      },
    },
    app: {
      type: 'object',
      properties: {
        openBrowserOnStart: { type: 'boolean', default: false },
      },
    },
  },
});

// ──── API ───────────────────────────────────────────────────────────────────

export function loadConfig() {
  const config = store.store;
  log.info('Config loaded from:', store.path);
  return config;
}

export function saveConfig(config) {
  store.store = config;
  log.info('Config saved to:', store.path);
}

export function resetConfig() {
  store.clear();
  log.info('Config reset to defaults');
  return DEFAULT_CONFIG;
}

export function getConfigPath() {
  return store.path;
}
