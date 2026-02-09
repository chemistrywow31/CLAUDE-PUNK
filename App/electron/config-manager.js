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
    port: null, // Will be dynamically allocated
    autoRunClaude: true,
    claudePath: detectClaudePath(),
  },
  frontend: {
    port: null, // Will be dynamically allocated
  },
  app: {
    openBrowserOnStart: false, // Default to false for Electron app
  },
  ports: {
    lastAllocated: null, // Timestamp of last port allocation
    backend: null, // Last allocated backend port
    frontend: null, // Last allocated frontend port
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
        port: { type: ['number', 'null'], minimum: 1024, maximum: 65535 },
        autoRunClaude: { type: 'boolean', default: true },
        claudePath: { type: 'string' },
      },
    },
    frontend: {
      type: 'object',
      properties: {
        port: { type: ['number', 'null'], minimum: 1024, maximum: 65535 },
      },
    },
    app: {
      type: 'object',
      properties: {
        openBrowserOnStart: { type: 'boolean', default: false },
      },
    },
    ports: {
      type: 'object',
      properties: {
        lastAllocated: { type: ['number', 'null'] },
        backend: { type: ['number', 'null'] },
        frontend: { type: ['number', 'null'] },
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

/**
 * Update allocated ports in config
 * @param {Object} ports - {backend: number, frontend: number}
 */
export function updatePorts(ports) {
  const config = store.store;
  config.backend.port = ports.backend;
  config.frontend.port = ports.frontend;
  config.ports.backend = ports.backend;
  config.ports.frontend = ports.frontend;
  config.ports.lastAllocated = Date.now();
  store.store = config;
  log.info(`Ports updated: backend=${ports.backend}, frontend=${ports.frontend}`);
}

/**
 * Get last allocated ports
 * @returns {Object|null} - {backend: number, frontend: number} or null
 */
export function getLastPorts() {
  const config = store.store;
  if (config.ports?.backend && config.ports?.frontend) {
    return {
      backend: config.ports.backend,
      frontend: config.ports.frontend,
    };
  }
  return null;
}
