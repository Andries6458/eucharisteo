/**
 * Minimal Electron shell for the Windows desktop build.
 *
 * Usage:
 *   npm run build:web        # exports the Expo web bundle to ./dist
 *   npx electron electron/main.js
 *
 * Package for Windows with electron-builder or electron-packager pointing at
 * this file, bundling the ./dist directory alongside it.
 */
const path = require('path');
const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: '#0B1220',
    autoHideMenuBar: true,
    title: 'Financial Advisor',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
