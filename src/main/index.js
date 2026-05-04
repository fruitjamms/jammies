import { app, BrowserWindow } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { startBuddyCommentary } from "./commentary.js";

let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 200,
    height: 200,
    x: 100,
    y: 100,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, "floating");
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

let stopBuddyCommentary = () => {};

app.whenReady().then(async () => {
  createWindow();
  stopBuddyCommentary = startBuddyCommentary(mainWindow);


  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopBuddyCommentary();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
