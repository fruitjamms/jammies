import { contextBridge } from "electron";
import { ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
	onCommentary: (callback) => ipcRenderer.on("commentary", (event, text) => callback(text)),
});
