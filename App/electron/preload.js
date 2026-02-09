/**
 * CLAUDE PUNK - Preload Script
 *
 * Safely exposes IPC APIs to the renderer process.
 * Currently minimal, can be extended for future features.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Future: expose config APIs, etc.
// For now, we don't need to expose anything since the frontend
// communicates with backend via HTTP/WebSocket directly.

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // Future APIs can be added here
});
