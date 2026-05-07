import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

const defaults = {

  walkWhileTalking: false,

  buddyHatched: false,
};

function settingsPath() {
  return join(app.getPath("userData"), "settings.json");
}

export function readSettings() {
  const p = settingsPath();
  if (!existsSync(p)) return { ...defaults };
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  writeFileSync(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function resetToEggSettings() {
  return writeSettings({ buddyHatched: false });
}
