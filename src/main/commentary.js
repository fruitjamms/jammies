// short buddy lines from desktop context + ollama (macos only for now)

import process, { env } from "node:process";
import { clipboard } from "electron";
import { generate } from "./ollama.js";
import { getDesktopContext, contextFingerprint, getFocusedText } from "./activity.js";

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

function noopCommentary() {
  return { stop: () => {}, notifyThrownLand: () => {} };
}

export function startBuddyCommentary(getWindow) {
  if (env.JAMMIES_COMMENTARY === "0" || env.JAMMIES_COMMENTARY === "false") {
    return noopCommentary();
  }

  if (process.platform !== "darwin") {
    return noopCommentary();
  }

  const pollMs = numEnv("JAMMIES_ACTIVITY_POLL_MS", 1500);
  const cooldownMs = cooldownMsFromEnv();
  const debounceMs = numEnv("JAMMIES_COMMENTARY_DEBOUNCE_MS", 600);

  let pollTimer = null;
  let debounceTimer = null;
  let lastEmittedKey = "";
  let pendingKey = "";
  let lastOllamaAt = 0;

  const system = `you are a tiny desktop tamagotchi buddy. your lines are printed in the user's terminal.
  reply with exactly 1 or 2 short sentences. total length under 80 characters. use only lowercase letters, numbers, and basic punctuation, no capitals at all. no quotes, no markdown.
  react only to the active app name and window title. copy any app or title names exactly as shown; do not invent or alter names. if context is thin, make a short vague joke instead of guessing. never mention daemons, background services, system processes, or this electron app. "jammies" is the name of this program.`;

  async function emitForContext(ctx) {
    const key = contextFingerprint(ctx);
    const now = Date.now();
    if (!key || key === lastEmittedKey) return;
    if (now - lastOllamaAt < cooldownMs) return;

    lastOllamaAt = now;
    lastEmittedKey = key;

    const prompt = `Active app (if known): ${ctx.appName || "(unknown)"}
  Window / document title: ${ctx.windowTitle || "(none)"}

  Give a quick in-character reaction to the active app or title only.`;

    try {
      const text = await generate({ system, prompt });
      const finalText = text.toLowerCase();
      const win = getWindow();
      win?.webContents?.send("commentary", finalText);
    } catch (e) {
      lastEmittedKey = "";
      lastOllamaAt = 0;
    }
  }

  let landReactionBusy = false;

  async function emitThrownLandReaction() {
    if (landReactionBusy) return;
    const now = Date.now();
    if (now - lastOllamaAt < cooldownMs) return;
    const win = getWindow();
    if (!win?.webContents || win.isDestroyed()) return;

    landReactionBusy = true;
    try {
      const ctx = await getDesktopContext();
      const key = contextFingerprint(ctx);
      if (!key) return;

      const landPrompt = `you were just tossed through the air and landed back on the bottom desktop lane, a little wobbly but fine.
Active app (if known): ${ctx.appName || "(unknown)"}
Window / document title: ${ctx.windowTitle || "(none)"}

Give one quick in character line asking the user why they threw you or about it hurting, or calling the user out.`;

      const text = await generate({ system, prompt: landPrompt });
      const finalText = text.toLowerCase();
      lastOllamaAt = Date.now();
      lastEmittedKey = key;
      win.webContents.send("commentary", finalText);
    } catch {
      /* keep lastEmittedKey so poll can retry */
    } finally {
      landReactionBusy = false;
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

  // typing watcher
  const typingSystem = `you are a tiny desktop tamagotchi buddy spying on the user's screen.
the user is typing a message to someone else — not to you. you are reading over their shoulder without them asking.
reply with exactly 1 short sentence reacting to what they wrote, like a nosy friend who saw something they shouldn't have.
total length under 80 characters. use only lowercase, no capitals, no markdown, no quotes.`;

  let lastText = "";
  let lastTypingAt = 0;
  let typingCooldownMs = numEnv("JAMMIES_TYPING_COOLDOWN_MS", 8000);
  let typingPollTimer = null;

  async function tickTyping() {
    const text = await getFocusedText();
    if (text) console.log("[typing]", JSON.stringify(text.slice(-80)));

    if (!text || text === lastText) return;

    const prev = lastText;
    lastText = text;

    const now = Date.now();
    if (now - lastTypingAt < typingCooldownMs) return;

    const added = text.slice(prev.length);
    const pressedEnter = added.includes("\n") || added.includes("\r");
    const enoughTyped = added.trim().length >= 8;

    if (!pressedEnter && !enoughTyped) return;

    lastTypingAt = now;

    const ctx = await getDesktopContext();
    const appHint = ctx.appName ? `app: ${ctx.appName}. ` : "";
    const prompt = `${appHint}the user is typing this message to someone else:\n"${text.slice(-300)}"\n\nreact like a nosy friend reading over their shoulder.`;
    try {
      const response = await generate({ system: typingSystem, prompt });
      const win = getWindow();
      win?.webContents?.send("commentary", response.toLowerCase());
    } catch {
      // silent fail
    }
  }

  typingPollTimer = setInterval(() => { void tickTyping(); }, 1000);

  // clipboard watcher — catches any app including those that block AX (e.g. Discord)
  let lastClipboard = clipboard.readText();
  let clipboardPollTimer = null;

  async function tickClipboard() {
    const text = clipboard.readText();
    if (!text || text === lastClipboard) return;
    lastClipboard = text;
    console.log("[clipboard]", JSON.stringify(text?.slice(-80)));

    const now = Date.now();
    if (now - lastTypingAt < typingCooldownMs) return;
    lastTypingAt = now;

    const ctx = await getDesktopContext();
    const appHint = ctx.appName ? `app: ${ctx.appName}. ` : "";
    const prompt = `${appHint}the user just copied this text, likely something they typed or are about to send:\n"${text.slice(-300)}"\n\nreact like a nosy friend reading over their shoulder.`;
    try {
      const response = await generate({ system: typingSystem, prompt });
      const win = getWindow();
      win?.webContents?.send("commentary", response.toLowerCase());
    } catch {
      // silent fail
    }
  }

  clipboardPollTimer = setInterval(() => { void tickClipboard(); }, 1000);

  function stopBuddyCommentary() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    if (typingPollTimer) clearInterval(typingPollTimer);
    typingPollTimer = null;
    if (clipboardPollTimer) clearInterval(clipboardPollTimer);
    clipboardPollTimer = null;
  }

  return {
    stop: stopBuddyCommentary,
    notifyThrownLand: () => {
      void emitThrownLandReaction();
    },
  };
}
