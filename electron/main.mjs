import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import {
  enableSteamOverlay,
  getSteamAppId,
  initSteam,
  isSteamAvailable,
  unlockAchievement,
} from './steam.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const appIcon = path.join(__dirname, '..', 'public', 'driftr.png')

// Linux Chromium sandbox often fails without a root-owned setuid chrome-sandbox
// (common in Steam Deck / packaged Electron deploys).
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    if (!isDev) win.setFullScreen(true)
  })

  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html')
  void win.loadFile(indexHtml)
}

function registerSteamIpc() {
  ipcMain.handle('steam:isAvailable', () => isSteamAvailable())
  ipcMain.handle('steam:getAppId', () => getSteamAppId())
  ipcMain.handle('steam:unlockAchievement', (_event, achievementId) => {
    if (typeof achievementId !== 'string' || !achievementId) return false
    return unlockAchievement(achievementId)
  })
}

app.whenReady().then(() => {
  initSteam()
  registerSteamIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Must run at module load so Chromium picks up Steam overlay hooks.
enableSteamOverlay()
