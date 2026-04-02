/**
 * server/shared/ai.js
 * Multi-provider LLM caller — single interface over OpenAI, OpenRouter, Groq,
 * Gemini, DeepSeek, Ollama, and xAI Grok.
 *
 * Usage:
 *   const { runLLM, tryParseJSON } = require('./shared/ai');
 *   const text = await runLLM(messages, { temperature: 0.25 });
 *   const parsed = tryParseJSON(text);
 */

import { createLogger } from './logger.js';
const log = createLogger("ai");

// ─── Provider implementations ─────────────────────────────────────────────────

async function openaiChat(messages, { temperature = 0.4, model } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error("OPENAI_API_KEY missing"), { statusCode: 500 });
  const useModel = model || "gpt-4o-mini";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: useModel, temperature, messages }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`OpenAI ${r.status}`), { statusCode: r.status, details: data });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function openrouterChat(messages, { temperature = 0.4, model } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw Object.assign(new Error("OPENROUTER_API_KEY missing"), { statusCode: 500 });
  const useModel = model || process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: useModel, temperature, messages }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`OpenRouter ${r.status}`), { statusCode: r.status, details: data });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function groqChat(messages, { temperature = 0.4, model } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw Object.assign(new Error("GROQ_API_KEY missing"), { statusCode: 500 });
  const useModel = model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: useModel, temperature, messages }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Groq ${r.status}`), { statusCode: r.status, details: data });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function geminiChat(messages, { temperature = 0.4, model } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("GEMINI_API_KEY missing"), { statusCode: 500 });
  const useModel = model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: useModel, temperature, messages }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}`), { statusCode: r.status, details: data });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function deepseekChat(messages, { temperature = 0.4 } = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw Object.assign(new Error("DEEPSEEK_API_KEY missing"), { statusCode: 500 });
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature, messages, stream: false }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`DeepSeek ${r.status}`), { statusCode: r.status, details: data });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function ollamaChat(messages, { temperature = 0.35, model } = {}) {
  const base = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const useModel = model || process.env.OLLAMA_MODEL || "llama3.1:8b-instruct";
  const r = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: useModel, stream: false, options: { temperature }, messages }),
    signal: AbortSignal.timeout(5_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Ollama ${r.status}`), { statusCode: r.status });
  return data?.message?.content ?? "";
}

async function xaiChat(messages, { temperature = 0.35, model } = {}) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw Object.assign(new Error("XAI_API_KEY missing"), { statusCode: 500 });
  const useModel = model || process.env.XAI_MODEL || "grok-3-mini";
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: useModel, temperature, messages }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`xAI ${r.status}`), { statusCode: r.status });
  return data?.choices?.[0]?.message?.content ?? "";
}

// ─── Provider priority list ────────────────────────────────────────────────────

/**
 * Build the ordered provider list based on available env keys.
 * Priority: Ollama (local, free) > DeepSeek > OpenRouter > Groq > Gemini > OpenAI > xAI
 * opts.temperature and opts.model are forwarded to each provider.
 */
function buildProviders(opts = {}) {
  const providers = [];
  if (process.env.OLLAMA_MODEL) providers.push({ name: "ollama", fn: () => ollamaChat(null, opts) });
  if (process.env.DEEPSEEK_API_KEY) providers.push({ name: "deepseek", fn: () => deepseekChat(null, opts) });
  if (process.env.OPENROUTER_API_KEY) providers.push({ name: "openrouter", fn: () => openrouterChat(null, opts) });
  if (process.env.GROQ_API_KEY) providers.push({ name: "groq", fn: () => groqChat(null, opts) });
  if (process.env.GEMINI_API_KEY) providers.push({ name: "gemini", fn: () => geminiChat(null, opts) });
  if (process.env.OPENAI_API_KEY) providers.push({ name: "openai", fn: () => openaiChat(null, opts) });
  if (process.env.XAI_API_KEY) providers.push({ name: "xai", fn: () => xaiChat(null, opts) });
  return providers;
}

/**
 * Run LLM with automatic provider fallback.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [opts]
 * @param {number}  [opts.temperature]
 * @param {string}  [opts.model]  If set, forwards to every provider
 * @returns {Promise<string>}  Raw LLM text output or "" if all providers fail
 */
async function runLLM(messages, opts = {}) {
  const hasProvider = Boolean(
    process.env.OLLAMA_MODEL ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.XAI_API_KEY,
  );
  if (!hasProvider) return "";

  const runners = {
    ollama: (m, o) => ollamaChat(m, o),
    deepseek: (m, o) => deepseekChat(m, o),
    openrouter: (m, o) => openrouterChat(m, o),
    groq: (m, o) => groqChat(m, o),
    gemini: (m, o) => geminiChat(m, o),
    openai: (m, o) => openaiChat(m, o),
    xai: (m, o) => xaiChat(m, o),
  };

  const order = ["ollama", "deepseek", "openrouter", "groq", "gemini", "openai", "xai"];
  const envKeys = {
    ollama: process.env.OLLAMA_MODEL,
    deepseek: process.env.DEEPSEEK_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    xai: process.env.XAI_API_KEY,
  };

  for (const name of order) {
    if (!envKeys[name]) continue;
    try {
      const text = await runners[name](messages, opts);
      const result = String(text ?? "").trim();
      if (result) {
        log.debug("LLM provider succeeded", { provider: name });
        return result;
      }
    } catch (err) {
      log.warn("LLM provider failed, trying next", { provider: name, error: err?.message });
    }
  }

  log.warn("All LLM providers failed");
  return "";
}

/**
 * Try to parse LLM output as JSON — handles markdown-fenced blocks.
 * @param {string} text
 * @returns {any|null}
 */
function tryParseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fenced = String(text || "").match(/```json\s*([\s\S]*?)```/i)
    || String(text || "").match(/```([\s\S]*?)```/);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  return null;
}

/**
 * Returns true if at least one LLM provider is configured.
 */
function hasAnyProvider() {
  return Boolean(
    process.env.OLLAMA_MODEL ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.XAI_API_KEY,
  );
}

export { runLLM, tryParseJSON, hasAnyProvider };
