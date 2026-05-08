import { app, BrowserWindow, globalShortcut, ipcMain, powerMonitor } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { startBuddyCommentary } from "./commentary.js";
import {
  configureBuddyWindowGetter,
  configureThrownLandCommentary,
  initBuddyShellIpc,
  initialBuddyLanePosition,
  stopBuddyShell,
  toggleStationary,
} from "./buddyShell.js";
import { readSettings } from "./settingsStore.js";
import { BUDDY_WINDOW_WIDTH, BUDDY_WINDOW_HEIGHT } from "../shared/buddyLayout.js";

let mainWindow = null;

function createWindow() {
  const { x, y } = initialBuddyLanePosition();

  mainWindow = new BrowserWindow({
    width: BUDDY_WINDOW_WIDTH,
    height: BUDDY_WINDOW_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    enableLargerThanScreen: true,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setIgnoreMouseEvents(false);

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
  });

  mainWindow.on("blur", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("buddy-window-blur");
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

let stopBuddyCommentary = () => {};

app.whenReady().then(async () => {
  ipcMain.on("buddy-get-hatched-sync", (event) => {
    event.returnValue = readSettings().buddyHatched === true;
  });

  ipcMain.on("buddy-get-settings-sync", (event) => {
    event.returnValue = readSettings();
  });

  powerMonitor.on("resume", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("buddy-system-resume");
    }
  });

  configureBuddyWindowGetter(() => mainWindow);
  const commentary = startBuddyCommentary(() => mainWindow);
  configureThrownLandCommentary(commentary.notifyThrownLand);
  stopBuddyCommentary = commentary.stop;
  initBuddyShellIpc();
  createWindow();

  globalShortcut.register("CommandOrControl+Option+Shift+S", toggleStationary);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  stopBuddyCommentary();
  stopBuddyShell();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
