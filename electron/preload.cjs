const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('steam', {
  isAvailable: () => ipcRenderer.invoke('steam:isAvailable'),
  getAppId: () => ipcRenderer.invoke('steam:getAppId'),
  unlockAchievement: (achievementId) =>
    ipcRenderer.invoke('steam:unlockAchievement', achievementId),
})
