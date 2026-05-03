// short buddy lines to the terminal from desktop context + ollama (macos only for now)

import process, { env } from "node:process";
import { generate } from "./ollama.js";
import { getDesktopContext, contextFingerprint } from "./activity.js";

function numEnv(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function cooldownMsFromEnv() {
  const raw = env.JAMMIES_COMMENTARY_COOLDOWN_MS;
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function startTerminalCommentary() {
  if (env.JAMMIES_COMMENTARY === "0" || env.JAMMIES_COMMENTARY === "false") {
    return () => {};
  }

  if (process.platform !== "darwin") {
    console.log(
      `[jammies] terminal commentary skipped (macos only for now, you are on ${process.platform})`,
    );
    return () => {};
  }

  const pollMs = numEnv("JAMMIES_ACTIVITY_POLL_MS", 1500);
  const cooldownMs = cooldownMsFromEnv();
  const debounceMs = numEnv("JAMMIES_COMMENTARY_DEBOUNCE_MS", 600);

  console.log(
    `[jammies] terminal commentary on · poll ${pollMs}ms · cooldown ${cooldownMs}ms (set JAMMIES_COMMENTARY=0 to disable)`,
  );

  let pollTimer = null;
  let debounceTimer = null;
  let lastEmittedKey = "";
  let pendingKey = "";
  let lastOllamaAt = 0;

  const system = `you are a tiny desktop tamagotchi buddy. your lines are printed in the user's terminal.
reply with exactly 1 or 2 short sentences. total length under 220 characters. use only lowercase letters, numbers, and basic punctuation, no capitals at all. no quotes, no markdown.
be specific and react to the active app or window title when present. if context is thin, joke about the mystery. never refuse. "jammies" is the name of this program.`;

  async function emitForContext(ctx) {
    const key = contextFingerprint(ctx);
    const now = Date.now();
    if (!key || key === lastEmittedKey) return;
    if (now - lastOllamaAt < cooldownMs) return;

    lastOllamaAt = now;
    lastEmittedKey = key;

    const prompt = `Active app (if known): ${ctx.appName || "(unknown)"}
Window / document title: ${ctx.windowTitle || "(none)"}
Sample of other processes: ${ctx.processSample || "(none)"}

Give a quick in-character reaction.`;

    try {
      const text = await generate({ system, prompt });
      console.log(`[jammies][buddy] ${text.toLowerCase()}`);
    } catch (e) {
      console.warn(
        `[jammies][buddy] (ollama quiet: ${e?.message ?? e})`,
      );
      lastEmittedKey = "";
      lastOllamaAt = 0;
    }
  }

  function scheduleEmit(nextKey) {
    pendingKey = nextKey;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void (async () => {
        const ctx = await getDesktopContext();
        const key = contextFingerprint(ctx);
        if (!key) return;
        if (key !== pendingKey) return;
        await emitForContext(ctx);
      })();
    }, debounceMs);
  }

  async function tick() {
    const ctx = await getDesktopContext();
    const key = contextFingerprint(ctx);
    if (!key) return;
    if (key !== lastEmittedKey) scheduleEmit(key);
  }

  pollTimer = setInterval(() => {
    void tick();
  }, pollMs);
  void tick();

  return function stopTerminalCommentary() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  };
}
