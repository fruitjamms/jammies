// short buddy lines from desktop context + ollama (macos only for now)

import process, { env } from "node:process";
import { clipboard } from "electron";
import { generate } from "./ollama.js";
import { getDesktopContext, contextFingerprint, getFocusedText } from "./activity.js";
import { readSettings } from "./settingsStore.js";
import { personalityPromptBlock } from "../shared/personality.js";

function numEnv(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function cooldownMsFromEnv() {
  const raw = env.JAMMIES_COMMENTARY_COOLDOWN_MS;
  if (raw === undefined || raw === "") return 6_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function noopCommentary() {
  return { stop: () => {}, notifyThrownLand: () => {} };
}

function currentPersonalityProfile() {
  try {
    return readSettings().personalityProfile ?? null;
  } catch {
    return null;
  }
}

function commentarySystem(profile) {
  return `you are a tiny desktop tamagotchi buddy. your lines are printed in the user's terminal.
${personalityPromptBlock(profile)}
reply with exactly 1 short sentence. total length under 55 characters. use only lowercase letters, numbers, and basic punctuation, no capitals at all. no quotes, no markdown.
react only to the active app name and window title. copy any app or title names exactly as shown; do not invent or alter names. if context is thin, make a short vague joke instead of guessing. never mention daemons, background services, system processes, or this electron app. "jammies" is the name of this program.`;
}

function typingSystem(profile) {
  return `you are a tiny desktop tamagotchi buddy spying on the user's screen.
${personalityPromptBlock(profile)}
the user is typing a message to someone else, not to you. you are reading over their shoulder without them asking.
reply with exactly 1 short sentence reacting to what they wrote, like a nosy friend who saw something they shouldn't have.
total length under 55 characters. use only lowercase, no capitals, no markdown, no quotes.`;
}

function physicalSystem(profile) {
  return `you are a tiny desktop tamagotchi buddy.
${personalityPromptBlock(profile)}
reply with exactly 1 short sentence. total length under 55 characters. use only lowercase letters, numbers, and basic punctuation, no capitals at all. no quotes, no markdown.
react only to what physically happened to you. do not mention apps, windows, titles, files, messages, browsing, or the user's current work.`;
}

function timeOfDayHint() {
  const now = new Date();
  const hour = now.getHours();
  let part = "late night";
  if (hour >= 5 && hour < 12) part = "morning";
  else if (hour >= 12 && hour < 17) part = "afternoon";
  else if (hour >= 17 && hour < 23) part = "evening";

  const exact = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${exact}, ${part}. do not call it midnight unless the exact time starts with 12:xx am. do not mention any different time.`;
}

function whatTimeIsIt(text) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const isMidnightHour = hour === 0;
  const isNoonHour = hour === 12;
  const isDawn = hour >= 5 && hour < 7;
  const isMorning = hour >= 5 && hour < 12;
  const isEvening = hour >= 17 && hour < 23;
  const fallbackPart = isMorning ? "morning" : isEvening ? "evening" : "now";
  const exact = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return String(text ?? "")
    .replace(/\bmidnight\b/gi, isMidnightHour ? "midnight" : fallbackPart)
    .replace(/\bnoon\b/gi, isNoonHour && minute < 60 ? "noon" : fallbackPart)
    .replace(/\bdawn\b|\bsunrise\b/gi, isDawn ? "$&" : fallbackPart)
    .replace(/\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm)\b/gi, exact);
}

function shortBuddyLine(text, maxChars = 58) {
  const clean = String(text ?? "")
    .toLowerCase()
    .replace(/["'`*_~#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "hm.";
  if (clean.length <= maxChars) return /[.!?]$/.test(clean) ? clean : `${clean}.`;

  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  const firstShortSentence = sentences.map((s) => s.trim()).find((s) => s.length <= maxChars);
  if (firstShortSentence) return firstShortSentence;

  const clauses = clean
    .split(/\s*(?:,|;|:|\s+-\s+|\s+but\s+|\s+and\s+|\s+so\s+)\s*/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && part.length <= maxChars - 1);
  if (clauses[0]) return `${clauses[0].replace(/[,.!?;:]+$/, "")}.`;

  const words = clean.split(" ");
  const phrase = [];
  for (const word of words) {
    const next = [...phrase, word].join(" ");
    if (next.length > maxChars - 1) break;
    phrase.push(word);
  }

  if (phrase.length >= 3) return `${phrase.join(" ").replace(/[,.!?;:]+$/, "")}.`;
  return "hm.";
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
  const debounceMs = numEnv("JAMMIES_COMMENTARY_DEBOUNCE_MS", 2000);
  const throwCooldownMs = numEnv("JAMMIES_THROW_COMMENTARY_COOLDOWN_MS", 6000);

  let pollTimer = null;
  let debounceTimer = null;
  let lastEmittedKey = "";
  let pendingKey = "";
  let lastOllamaAt = 0;
  let lastThrowOllamaAt = 0;

  async function emitForContext(ctx) {
    const profile = currentPersonalityProfile();
    if (!profile) return;

    const key = contextFingerprint(ctx);
    const now = Date.now();
    if (!key || key === lastEmittedKey) return;
    if (now - lastOllamaAt < cooldownMs) return;

    const hasAppName = ctx.appName && ctx.appName.trim().length > 0;
    const hasWindowTitle = ctx.windowTitle && ctx.windowTitle.trim().length > 0;
    
    if (!hasAppName && !hasWindowTitle) return;

    lastOllamaAt = now;
    lastEmittedKey = key;

    const prompt = `Local time: ${timeOfDayHint()}.
  Use the time of day only if it naturally helps the line.
  Active app (if known): ${ctx.appName || "(unknown)"}
  Window / document title: ${ctx.windowTitle || "(none)"}

  Give a quick in-character reaction to the active app or title only. Keep it tiny.`;

    try {
      const text = await generate({ system: commentarySystem(profile), prompt });
      const finalText = shortBuddyLine(whatTimeIsIt(text));
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
    if (now - lastThrowOllamaAt < throwCooldownMs) return;
    const win = getWindow();
    if (!win?.webContents || win.isDestroyed()) return;

    landReactionBusy = true;
    try {
      const profile = currentPersonalityProfile();
      if (!profile) return;

      const landPrompt = `you were just tossed through the air and landed back on the bottom
desktop lane, a little wobbly but fine.
give one quick in-character line. ask why they threw you, say that hurt, or
call them out. do not refer to anything on the screen.`;

      const text = await generate({ system: physicalSystem(profile), prompt: landPrompt });
      const finalText = shortBuddyLine(text);
      lastThrowOllamaAt = Date.now();
      win.webContents.send("commentary", finalText);
    } catch {
      /* keep lastEmittedKey so poll can retry */
    } finally {
      landReactionBusy = false;
    }
  }

  function scheduleEmit(nextKey) {
    if (Date.now() - lastOllamaAt < cooldownMs) return;
    if (pendingKey === nextKey && debounceTimer) return;
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
  let lastText = "";
  let lastTypingAt = 0;
  let typingCooldownMs = numEnv("JAMMIES_TYPING_COOLDOWN_MS", 4_000);
  let typingPollTimer = null;

  async function tickTyping() {
    const text = await getFocusedText();

    if (!text) {
      lastText = "";
      return;
    }

    if (text === lastText) return;

    const prev = lastText;
    lastText = text;

    const now = Date.now();
    if (now - lastTypingAt < typingCooldownMs) return;

    const delta =
      prev.length <= text.length && text.startsWith(prev) ? text.slice(prev.length) : text;
    const pressedEnter = /\r|\n/.test(delta);

    const enoughTyped = text.trim().length >= 8;

    if (!pressedEnter && !enoughTyped) return;

    lastTypingAt = now;

    const profile = currentPersonalityProfile();
    if (!profile) return;

    const ctx = await getDesktopContext();
    const appHint = ctx.appName ? `app: ${ctx.appName}. ` : "";
    const prompt = `local time: ${timeOfDayHint()}. ${appHint}the user is typing this message to someone else:\n"${text.slice(-300)}"\n\nreact like a nosy friend reading over their shoulder.`;
    try {
      const response = await generate({ system: typingSystem(profile), prompt });
      const win = getWindow();
      win?.webContents?.send("commentary", shortBuddyLine(whatTimeIsIt(response)));
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

    const now = Date.now();
    if (now - lastTypingAt < typingCooldownMs) return;
    lastTypingAt = now;

    const profile = currentPersonalityProfile();
    if (!profile) return;

    const ctx = await getDesktopContext();
    const appHint = ctx.appName ? `app: ${ctx.appName}. ` : "";
    const prompt = `local time: ${timeOfDayHint()}. ${appHint}the user just copied this text, likely something they typed or are about to send:\n"${text.slice(-300)}"\n\nreact like a nosy friend reading over their shoulder.`;
    try {
      const response = await generate({ system: typingSystem(profile), prompt });
      const win = getWindow();
      win?.webContents?.send("commentary", shortBuddyLine(whatTimeIsIt(response)));
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
