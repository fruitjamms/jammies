import { env } from "node:process";

const DEFAULT_HOST = "http://127.0.0.1:11434"; // ollama listens here by default
export const DEFAULT_MODEL = env.OLLAMA_MODEL ?? "llama3.2"; // model tag

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000; 
const GENERATE_TIMEOUT_MS = Number(env.OLLAMA_TIMEOUT_MS) || 120_000; 
const REACHABLE_TIMEOUT_MS = Number(env.OLLAMA_PING_MS) || 4_000;

export class OllamaHttpError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "OllamaHttpError";
    this.path = detail.path;
    this.status = detail.status;
    this.body = detail.body;
  }
}

function normalizeBaseUrl(raw) {
  // user env into origin string
  const trimmed = String(raw ?? "").trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    throw new Error(`host must be a proper url (got ${JSON.stringify(raw)})`); // for inevitable typos
  }
}

const baseUrl = normalizeBaseUrl(env.OLLAMA_HOST ?? DEFAULT_HOST);

export function getOllamaConfig() {
  // for doing ipc later 
  return { host: baseUrl, model: DEFAULT_MODEL };
}

function apiUrl(path) {
  return new URL(path, `${baseUrl}/`).toString();
}

async function ollamaRequest(path, options = {}) {
  // fetch w/ hard timeout
  const { json: body, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl(path), {
      ...init,
      headers:
        body !== undefined
          ? { "Content-Type": "application/json", ...init.headers }
          : init.headers,
      body: body !== undefined ? JSON.stringify(body) : init.body,
      signal: controller.signal,
    });

    return res;
  } finally {
    clearTimeout(t);
  }
}

async function ollamaJson(path, options = {}) {
  const res = await ollamaRequest(path, options);
  const text = await res.text();

  if (!res.ok) {
    throw new OllamaHttpError(`ollama ${path} failed`, {
      path,
      status: res.status,
      body: text,
    });
  }

  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new OllamaHttpError(`erm response was not json`, {
      path,
      status: res.status,
      body: text,
    });
  }
}

export async function isOllamaReachable() {
  try {
    const res = await ollamaRequest("/api/tags", {
      method: "GET", 
      timeoutMs: REACHABLE_TIMEOUT_MS,
    });
    if (!res.ok) return false;
    await res.text();
    return true;
  } catch {
    return false; // timeout or network or whatever
  }
}

export async function listLocalModels() {
  const data = await ollamaJson("/api/tags", { method: "GET" });
  return Array.isArray(data.models) ? data.models : []; 
}

export async function generate({ model = DEFAULT_MODEL, system, prompt }) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new TypeError("generate has no prompt");
  }

  const data = await ollamaJson("/api/generate", {
    method: "POST",
    timeoutMs: GENERATE_TIMEOUT_MS,
    json: {
      model,
      system: system ?? "",
      prompt,
      stream: false,
    },
  });

  const out = data.response;
  if (typeof out !== "string") {
    throw new Error("missing response text");
  }
  return out.trim();
}
