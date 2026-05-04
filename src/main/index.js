import { app, BrowserWindow } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { startBuddyCommentary } from "./commentary.js";
import {
  configureBuddyWindowGetter,
  configureThrownLandCommentary,
  initBuddyShellIpc,
  initialBuddyLanePosition,
  stopBuddyShell,
} from "./buddyShell.js";

let mainWindow = null;

function createWindow() {
  const { x, y } = initialBuddyLanePosition();

  mainWindow = new BrowserWindow({
    width: 200,
    height: 200,
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
  configureBuddyWindowGetter(() => mainWindow);
  const commentary = startBuddyCommentary(() => mainWindow);
  configureThrownLandCommentary(commentary.notifyThrownLand);
  stopBuddyCommentary = commentary.stop;
  initBuddyShellIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopBuddyCommentary();
  stopBuddyShell();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
