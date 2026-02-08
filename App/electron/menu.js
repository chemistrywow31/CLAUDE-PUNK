/**
 * CLAUDE PUNK - Application Menu
 *
 * Creates macOS-style application menu with Preferences option.
 */

import { Menu } from 'electron';

export function createMenu(onPreferences, onRestart, app) {
  const template = [
    {
      label: 'CLAUDE PUNK',
      submenu: [
        {
          label: 'About CLAUDE PUNK',
          role: 'about',
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: onPreferences,
        },
        {
          label: 'Restart Services',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: onRestart,
        },
        { type: 'separator' },
        {
          label: 'Hide CLAUDE PUNK',
          accelerator: 'CmdOrCtrl+H',
          role: 'hide',
        },
        {
          label: 'Hide Others',
          accelerator: 'CmdOrCtrl+Alt+H',
          role: 'hideOthers',
        },
        {
          label: 'Show All',
          role: 'unhide',
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+CmdOrCtrl+I',
          role: 'toggleDevTools',
        },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'Ctrl+Cmd+F', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
        { type: 'separator' },
        { label: 'Bring All to Front', role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'View Logs',
          click: async () => {
            const { shell } = await import('electron');
            const log = await import('electron-log');
            shell.showItemInFolder(log.default.transports.file.getFile().path);
          },
        },
        { type: 'separator' },
        {
          label: 'GitHub Repository',
          click: async () => {
            const { shell } = await import('electron');
            await shell.openExternal('https://github.com/yourusername/claude-punk');
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
