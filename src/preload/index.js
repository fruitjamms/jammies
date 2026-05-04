import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  onCommentary: (callback) => ipcRenderer.on("commentary", (event, text) => callback(text)),
  setCommentaryActive: (active) => ipcRenderer.send("buddy-commentary-active", !!active),
  setIgnoreMouse: (ignore) => ipcRenderer.send("set-ignore-mouse", !!ignore),
  sendDragStart: (payload) => ipcRenderer.send("drag-start", payload),
  sendDragging: (payload) => ipcRenderer.send("dragging", payload),
  sendDragEnd: () => ipcRenderer.send("drag-end"),
  buddyHatched: () => ipcRenderer.send("buddy-hatched"),
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
