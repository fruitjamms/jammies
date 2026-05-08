import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getBuddyHatchedSync: () => ipcRenderer.sendSync("buddy-get-hatched-sync"),
  getSettingsSync: () => ipcRenderer.sendSync("buddy-get-settings-sync"),
  onSystemResume: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("buddy-system-resume", handler);
    return () => ipcRenderer.removeListener("buddy-system-resume", handler);
  },
  onWindowBlur: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("buddy-window-blur", handler);
    return () => ipcRenderer.removeListener("buddy-window-blur", handler);
  },
  onCommentary: (callback) => ipcRenderer.on("commentary", (event, text) => callback(text)),
  setPanelOpen: (active) => ipcRenderer.send("buddy-panel-active", !!active),
  setCommentaryActive: (active) => ipcRenderer.send("buddy-commentary-active", !!active),
  setPettingActive: (active) => ipcRenderer.send("buddy-petting-active", !!active),
  setStationary: (value) => ipcRenderer.send("set-stationary", !!value),
  setIgnoreMouse: (ignore) => ipcRenderer.send("set-ignore-mouse", !!ignore),
  sendDragStart: (payload) => ipcRenderer.send("drag-start", payload),
  sendDragging: (payload) => ipcRenderer.send("dragging", payload),
  sendDragEnd: () => ipcRenderer.send("drag-end"),
  buddyHatched: () => ipcRenderer.send("buddy-hatched"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  updateSettings: (patch) => ipcRenderer.send("update-settings", patch),
  resetToEgg: () => ipcRenderer.send("reset-to-egg"),
  openSettings: () => ipcRenderer.send("open-settings"),
  onSettingsMenuClick: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("settings-menu-click", handler);
    return () => ipcRenderer.removeListener("settings-menu-click", handler);
  },
  onPanelLayout: (callback) => {
    const handler = (_event, layout) => callback(layout);
    ipcRenderer.on("buddy-panel-layout", handler);
    return () => ipcRenderer.removeListener("buddy-panel-layout", handler);
  },
  onBuddyState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("buddy-state", handler);
    return () => ipcRenderer.removeListener("buddy-state", handler);
  },
  onBuddyFx: (callback) => {
    const handler = (_event, fx) => callback(fx);
    ipcRenderer.on("buddy-fx", handler);
    return () => ipcRenderer.removeListener("buddy-fx", handler);
  },
});
