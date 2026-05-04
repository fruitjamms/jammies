import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function trimSample(str, maxLen = 900) {
  const s = String(str ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

// macos ps
async function sampleProcessNames() {
  if (process.platform !== "darwin") return "";

  const { stdout } = await execFileAsync("ps", ["-ax", "-o", "comm="]);
  const seen = new Set();
  for (const line of stdout.split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    const base = raw.replace(/^.*\//, "");
    if (base && base !== "ps" && !seen.has(base)) seen.add(base);
    if (seen.size >= 48) break;
  }
  return [...seen].sort().join(", ");
}

async function getDarwinForeground() {
  const script = `
tell application "System Events"
  tell (first process whose frontmost is true)
    set appName to name
    set appPid to unix id
    try
      set winTitle to name of first window
    on error
      set winTitle to ""
    end try
    return appName & tab & winTitle & tab & appPid
  end tell
end tell
`.trim();
  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  const line = stdout.trim();
  const parts = line.split("\t");
  const appName = (parts[0] ?? "").trim();
  const windowTitle = (parts[1] ?? "").trim();
  const pidRaw = (parts[2] ?? "").trim();
  const frontPid = /^\d+$/.test(pidRaw) ? Number(pidRaw) : null;
  return { appName, windowTitle, frontPid };
}

export async function getDesktopContext() {
  if (process.platform !== "darwin") {
    return {
      platform: process.platform,
      appName: "",
      windowTitle: "",
      processSample: "",
      frontPid: null,
    };
  }

  let appName = "";
  let windowTitle = "";
  let frontPid = null; // os pid of focused app when we can resolve it

  try {
    const fg = await getDarwinForeground();
    appName = fg.appName;
    windowTitle = fg.windowTitle;
    frontPid = fg.frontPid;
  } catch {
    // accessibility / permissions / no gui session
  }

  let processSample = "";
  try {
    processSample = await sampleProcessNames();
  } catch {
    processSample = "";
  }

  return {
    platform: process.platform,
    appName: trimSample(appName, 120),
    windowTitle: trimSample(windowTitle, 200),
    processSample: trimSample(processSample),
    frontPid,
  };
}

const AX_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  try
    set focusedEl to value of attribute "AXFocusedUIElement" of frontApp
    set elValue to value of attribute "AXValue" of focusedEl
    return elValue
  on error
    return ""
  end try
end tell
`.trim();

// apps where AX reads are blocked or would cause feedback loops
const BLOCKED_APPS = new Set([
  "ghostty", "terminal", "iterm2", "iterm", "alacritty", "warp",
  "electron", "jammies", "code", "cursor",
]);

// returns the current text value of the focused UI element, or "" if unavailable
export async function getFocusedText() {
  if (process.platform !== "darwin") return "";
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", AX_SCRIPT], {
      timeout: 1500,
    });
    const result = stdout.trim();
    if (!result || result === "missing value") return "";

    // get frontmost app name to check blocklist
    const { appName } = await getDarwinForeground().catch(() => ({ appName: "" }));
    if (BLOCKED_APPS.has(appName.toLowerCase())) return "";

    return result;
  } catch {
    return "";
  }
}

// stable while the same focused app (pid) or title bundle stays put
export function contextFingerprint(ctx) {
  const w = ctx.windowTitle || "";
  if (ctx.frontPid != null && Number.isFinite(ctx.frontPid)) {
    return `pid:${ctx.frontPid}|${w}`;
  }
  const a = ctx.appName || "";
  const fallback = `${a}|${w}`;
  return fallback === "|" ? "" : fallback;
}
