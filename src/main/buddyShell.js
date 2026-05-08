// lane roaming, drag, throw physics

import { ipcMain, screen } from "electron";
import { readSettings, writeSettings } from "./settingsStore.js";
import { BUDDY_SPRITE_SIZE, BUDDY_WINDOW_WIDTH, BUDDY_WINDOW_HEIGHT } from "../shared/buddyLayout.js";

let getBuddyWindow = () => null;

const WIN_W = BUDDY_WINDOW_WIDTH;
const WIN_H = BUDDY_WINDOW_HEIGHT;
const SPRITE_W = BUDDY_SPRITE_SIZE;
const BOTTOM_MARGIN = 4;
const WALK_SPEED = 1;
const TICK_MS = 17;
const PANEL_W = 300;
const PANEL_H = 340;
const EDGE_PAUSE_MS = 650;

const GRAVITY = 0.56;
const WALL_BOUNCE = 0.74;
const FLOOR_BOUNCE = 0.36;
const AIR_DRAG = 0.9945;
const GROUND_DRAG = 0.86;
const MAX_THROW_VEL = 26;
const VEL_SCALE = 0.2;

// before hatching
let shellFrozen = true;

// pause roaming while commentary bubble is visible
let holdForCommentary = false;

// pause lane walk while the user is rubbing the pet
let holdForPetting = false;

// pin buddy in place — no walking, no gravity
let stationary = false;
let panelOpen = false;
let panelBoundsBeforeOpen = null;

let behaviorTimer = null;
let moveDirection = 1;
let edgePauseUntil = 0;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
const dragSamples = [];
let throwState = null;

let notifyThrownLandCommentary = () => {};

export function configureBuddyWindowGetter(fn) {
  getBuddyWindow = fn;
}

export function configureThrownLandCommentary(fn) {
  notifyThrownLandCommentary = typeof fn === "function" ? fn : () => {};
}

function ok(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function intRound(n) {
  const r = Math.round(n);
  return ok(r) ? r : null;
}

function moveTo(x, y) {
  const buddyWindow = getBuddyWindow();
  if (!buddyWindow || buddyWindow.isDestroyed()) return;
  const ix = intRound(x);
  const iy = intRound(y);
  if (ix == null || iy == null) return;
  try {
    buddyWindow.setPosition(ix, iy);
  } catch {

  }
}

function resizeTo(x, y, w, h) {
  const buddyWindow = getBuddyWindow();
  if (!buddyWindow || buddyWindow.isDestroyed()) return;
  const ix = intRound(x);
  const iy = intRound(y);
  if (ix == null || iy == null) return;
  try {
    buddyWindow.setBounds({ x: ix, y: iy, width: w, height: h });
  } catch {

  }
}

function fitBoundsInWorkArea(bounds, display) {
  const wa = display.workArea;
  const width = Math.min(bounds.width, wa.width);
  const height = Math.min(bounds.height, wa.height);
  return {
    x: clamp(bounds.x, wa.x, wa.x + wa.width - width),
    y: clamp(bounds.y, wa.y, wa.y + wa.height - height),
    width,
    height,
  };
}

function setPanelActive(active) {
  const buddyWindow = getBuddyWindow();
  if (!buddyWindow || buddyWindow.isDestroyed()) return;
  panelOpen = !!active;

  if (active) {
    if (!panelBoundsBeforeOpen) panelBoundsBeforeOpen = buddyWindow.getBounds();
    const b = panelBoundsBeforeOpen;
    const display = displayFor(b.x + Math.floor(b.width / 2), b.y + Math.floor(b.height / 2));
    const next = fitBoundsInWorkArea(
      {
        x: b.x + Math.floor(b.width / 2) - Math.floor(PANEL_W / 2),
        y: b.y + b.height - PANEL_H,
        width: PANEL_W,
        height: PANEL_H,
      },
      display,
    );
    const anchor = {
      x: b.x + Math.floor(b.width / 2) - next.x,
      bottom: next.y + next.height - (b.y + b.height),
    };
    try {
      buddyWindow.setBounds(next);
      buddyWindow.setIgnoreMouseEvents(false);
      buddyWindow.moveTop();
      buddyWindow.focus();
      sendToRenderer("buddy-panel-layout", anchor);
    } catch {

    }
    return;
  }

  if (!panelBoundsBeforeOpen) return;
  const restore = panelBoundsBeforeOpen;
  panelBoundsBeforeOpen = null;
  try {
    buddyWindow.setBounds(restore);
    sendToRenderer("buddy-panel-layout", null);
  } catch {

  }
}

function sendToRenderer(channel, payload) {
  const buddyWindow = getBuddyWindow();
  if (!buddyWindow || buddyWindow.isDestroyed()) return;
  const wc = buddyWindow.webContents;
  if (wc && !wc.isDestroyed()) wc.send(channel, payload);
}

function sendFx(payload) {
  sendToRenderer("buddy-fx", payload);
}

function laneY(display) {
  const wa = display.workArea;
  return wa.y + wa.height - WIN_H - BOTTOM_MARGIN;
}

function hBounds(display) {
  const wa = display.workArea;
  const halfW = Math.floor(WIN_W / 2);
  const halfS = Math.floor(SPRITE_W / 2);
  let lo = wa.x - halfW + halfS;
  let hi = wa.x + wa.width - halfW - halfS;
  if (hi < lo) lo = hi = Math.floor((lo + hi) / 2);
  return { lo, hi };
}

function displayFor(x, y) {
  return screen.getDisplayNearestPoint({ x: ok(x) ? x : 0, y: ok(y) ? y : 0 });
}

function estimateVelocity() {
  if (dragSamples.length < 2) return { vx: 0, vy: 0 };
  const a = dragSamples[0];
  const b = dragSamples[dragSamples.length - 1];
  if (!ok(a.x) || !ok(a.y) || !ok(b.x) || !ok(b.y)) return { vx: 0, vy: 0 };
  const dt = Math.max(12, b.t - a.t);
  return {
    vx: clamp(((b.x - a.x) / dt) * VEL_SCALE * TICK_MS, -MAX_THROW_VEL, MAX_THROW_VEL),
    vy: clamp(((b.y - a.y) / dt) * VEL_SCALE * TICK_MS, -MAX_THROW_VEL, MAX_THROW_VEL),
  };
}

function slotIndex(display, centerX) {
  const w = display.workArea.width;
  const rel = centerX - display.workArea.x;
  return clamp(Math.floor((rel / w) * 7), 0, 6);
}

function stepThrow() {
  const buddyWindow = getBuddyWindow();
  if (!throwState || !buddyWindow || buddyWindow.isDestroyed()) return;

  let { vx, vy, x, y } = throwState;
  if (!ok(x) || !ok(y) || !ok(vx) || !ok(vy)) {
    throwState = null;
    return;
  }

  const display = displayFor(x, y);
  const { lo: minX, hi: maxX } = hBounds(display);
  const floorY = laneY(display);

  vy += GRAVITY;
  vx *= AIR_DRAG;
  vy *= AIR_DRAG;
  x += vx;
  y += vy;

  let wallBonk = null;

  if (x < minX) {
    x = minX;
    vx = -vx * WALL_BOUNCE;
    wallBonk = "left";
  } else if (x > maxX) {
    x = maxX;
    vx = -vx * WALL_BOUNCE;
    wallBonk = "right";
  }

  const onFloor = y >= floorY;
  if (onFloor) {
    y = floorY;
    if (vy > 0.35) {
      const impact = vy;
      vy = -vy * FLOOR_BOUNCE;
      vx *= GROUND_DRAG;
      sendFx({ kind: "tap", intensity: clamp(impact / 10, 0.12, 0.9) });
    } else {
      vy = 0;
      vx *= GROUND_DRAG;
    }
  }

  if (!ok(x) || !ok(y) || !ok(vx) || !ok(vy)) {
    throwState = null;
    return;
  }

  throwState = { vx, vy, x, y };
  moveTo(x, y);

  const speed = Math.hypot(vx, vy);
  if (wallBonk) sendFx({ kind: "wall", side: wallBonk, speed: clamp(speed / 12, 0.2, 1) });

  if (onFloor && speed < 1.05 && Math.abs(vy) < 0.2) {
    throwState = null;
    moveTo(x, floorY);
    sendFx({ kind: "land", intensity: clamp(speed / 9, 0.25, 1) });
    notifyThrownLandCommentary();
  }
}

function nudgeBuddy() {
  const buddyWindow = getBuddyWindow();
  if (!buddyWindow || buddyWindow.isDestroyed() || shellFrozen) return;
  if (isDragging) return;
  if (panelOpen) return;

  if (stationary) {
    if (throwState) {
      throwState = null;
      sendFx({ kind: "land" });
    }
    const b = buddyWindow.getBounds();
    const display = displayFor(b.x, b.y);
    sendToRenderer("buddy-state", {
      mode: "roaming",
      direction: moveDirection,
      airborne: false,
      laneSlot: slotIndex(display, b.x + Math.floor(b.width / 2)),
    });
    return;
  }

  if (throwState) {
    stepThrow();
    if (!throwState) return;
    if (!buddyWindow || buddyWindow.isDestroyed()) return;
    const b = buddyWindow.getBounds();
    const display = displayFor(b.x, b.y);
    const facing = throwState.vx > 0 ? 1 : throwState.vx < 0 ? -1 : moveDirection;
    sendToRenderer("buddy-state", {
      mode: "airborne",
      direction: facing,
      airborne: true,
      laneSlot: slotIndex(display, b.x + Math.floor(b.width / 2)),
      vx: throwState.vx,
      vy: throwState.vy,
    });
    return;
  }

  if (holdForCommentary) return;
  if (holdForPetting) return;

  const b = buddyWindow.getBounds();
  const display = displayFor(b.x, b.y);
  const { lo: minX, hi: maxX } = hBounds(display);
  const floor = laneY(display);

  let nextX = b.x;
  const now = Date.now();
  if (now < edgePauseUntil) {
    sendToRenderer("buddy-state", {
      mode: "roaming",
      direction: moveDirection,
      airborne: false,
      laneSlot: slotIndex(display, b.x + Math.floor(b.width / 2)),
    });
    return;
  }

  nextX += WALK_SPEED * moveDirection;
  if (nextX <= minX) {
    nextX = minX;
    moveDirection = 1;
    edgePauseUntil = now + EDGE_PAUSE_MS;
  } else if (nextX >= maxX) {
    nextX = maxX;
    moveDirection = -1;
    edgePauseUntil = now + EDGE_PAUSE_MS;
  }
  nextX = clamp(nextX, minX, maxX);

  resizeTo(nextX, floor, b.width, b.height);

  sendToRenderer("buddy-state", {
    mode: "roaming",
    direction: moveDirection,
    airborne: false,
    laneSlot: slotIndex(display, nextX + Math.floor(b.width / 2)),
  });
}

function startBehaviorLoop() {
  if (behaviorTimer) clearInterval(behaviorTimer);
  behaviorTimer = setInterval(nudgeBuddy, TICK_MS);
}

function stopBehaviorLoop() {
  if (behaviorTimer) {
    clearInterval(behaviorTimer);
    behaviorTimer = null;
  }
}

function applyDrag(px, py) {
  const buddyWindow = getBuddyWindow();
  if (!buddyWindow || buddyWindow.isDestroyed() || !isDragging) return;
  if (!ok(px) || !ok(py) || !ok(dragOffset.x) || !ok(dragOffset.y)) return;
  const nx = Math.round(px - dragOffset.x);
  const ny = Math.round(py - dragOffset.y);
  if (!ok(nx) || !ok(ny)) return;
  moveTo(nx, ny);
  dragSamples.push({ t: Date.now(), x: nx, y: ny });
  if (dragSamples.length > 18) dragSamples.shift();
}

export function initBuddyShellIpc() {
  ipcMain.on("drag-start", (_ev, payload) => {
    const buddyWindow = getBuddyWindow();
    if (!buddyWindow || buddyWindow.isDestroyed() || shellFrozen) return;
    isDragging = true;
    throwState = null;
    dragSamples.length = 0;

    const sx = Number(payload?.screenX);
    const sy = Number(payload?.screenY);
    const b = buddyWindow.getBounds();

    dragOffset = {
      x: ok(sx) ? sx - b.x : Math.floor(WIN_W / 2),
      y: ok(sy) ? sy - b.y : Math.floor(WIN_H / 2),
    };

    if (ok(sx) && ok(sy)) applyDrag(sx, sy);
  });

  ipcMain.on("dragging", (_ev, payload) => {
    if (!isDragging) return;
    const px = Number(payload?.x);
    const py = Number(payload?.y);
    if (ok(px) && ok(py)) applyDrag(px, py);
  });

  ipcMain.on("drag-end", () => {
    const buddyWindow = getBuddyWindow();
    if (!buddyWindow || !isDragging) return;
    isDragging = false;

    const b = buddyWindow.getBounds();
    const display = displayFor(b.x, b.y);
    const floor = laneY(display);
    const v = estimateVelocity();
    dragSamples.length = 0;

    const speed = Math.hypot(v.vx, v.vy);
    const onLane = Math.abs(b.y - floor) <= 4;

    if (stationary) {
      sendFx({ kind: "drop", intensity: 0.15 });
      return;
    }

    if (onLane && speed < 1.4) {
      moveTo(b.x, floor);
      sendFx({ kind: "drop", intensity: 0.15 });
      return;
    }

    throwState = { vx: v.vx, vy: v.vy, x: b.x, y: b.y };
    sendFx({
      kind: "throw",
      speed: clamp(speed / 14, 0.2, 1),
    });
  });

  ipcMain.on("set-ignore-mouse", (_ev, ignore) => {
    const buddyWindow = getBuddyWindow();
    if (!buddyWindow || buddyWindow.isDestroyed()) return;
    try {
      if (ignore && panelOpen) {
        buddyWindow.setIgnoreMouseEvents(false);
      } else if (ignore) {
        buddyWindow.setIgnoreMouseEvents(true, { forward: true });
      }
      else buddyWindow.setIgnoreMouseEvents(false);
    } catch {

    }
  });

  ipcMain.on("buddy-commentary-active", (_ev, active) => {
    try {
      const settings = readSettings();
      holdForCommentary = !!active && !settings.walkWhileTalking;
    } catch {
      holdForCommentary = !!active;
    }
  });

  ipcMain.on("set-stationary", (_ev, value) => {
    stationary = !!value;
    if (!stationary || panelOpen) return;
    const buddyWindow = getBuddyWindow();
    if (!buddyWindow || buddyWindow.isDestroyed()) return;
    throwState = null;
    const b = buddyWindow.getBounds();
    const display = displayFor(b.x, b.y);
    const floor = laneY(display);
    moveTo(b.x, floor);
    sendFx({ kind: "land" });
  });

  ipcMain.on("buddy-panel-active", (_ev, active) => {
    setPanelActive(!!active);
  });

  ipcMain.on("buddy-petting-active", (_ev, active) => {
    holdForPetting = !!active;
  });

  ipcMain.on("buddy-hatched", () => {
    shellFrozen = false;
    try {
      writeSettings({ buddyHatched: true });
    } catch {

    }
    const buddyWindow = getBuddyWindow();
    if (buddyWindow && !buddyWindow.isDestroyed()) {
      try {
        if (panelOpen) buddyWindow.setIgnoreMouseEvents(false);
        else buddyWindow.setIgnoreMouseEvents(true, { forward: true });
      } catch {

      }
    }

    throwState = null;
  });

  ipcMain.handle("get-settings", () => {
    try {
      return readSettings();
    } catch {
      return {};
    }
  });

  ipcMain.on("update-settings", (_ev, patch) => {
    try {
      writeSettings(patch);
    } catch {

    }
  });

  ipcMain.on("reset-to-egg", () => {
    try {
      setPanelActive(false);
      writeSettings({ buddyHatched: false, personalityAnswers: null, personalityProfile: null });
      shellFrozen = true;
      const buddyWindow = getBuddyWindow();
      if (buddyWindow && !buddyWindow.isDestroyed()) {
        try {
          buddyWindow.setIgnoreMouseEvents(false);
        } catch {

        }
        buddyWindow.reload();
      }
    } catch {

    }
  });

  ipcMain.on("open-settings", () => {
    const buddyWindow = getBuddyWindow();
    if (buddyWindow && !buddyWindow.isDestroyed()) {
      setPanelActive(true);
      buddyWindow.webContents.send("settings-menu-click");
    }
  });

  startBehaviorLoop();
}

export function toggleStationary() {
  stationary = !stationary;
  if (!stationary) return;
  const buddyWindow = getBuddyWindow();
  if (!buddyWindow || buddyWindow.isDestroyed()) return;
  throwState = null;
  const b = buddyWindow.getBounds();
  const display = displayFor(b.x, b.y);
  const floor = laneY(display);
  moveTo(b.x, floor);
  sendFx({ kind: "land" });
}

export function stopBuddyShell() {
  stopBehaviorLoop();
}

export function initialBuddyLanePosition() {
  const primary = screen.getPrimaryDisplay();
  const x = primary.workArea.x + Math.floor(primary.workArea.width * 0.2);
  const y = laneY(primary);
  return { x, y };
}
