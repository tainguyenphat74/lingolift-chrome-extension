/**
 * BYOK API provider client for LingoLift.
 *
 * Implements the provider interface documented in `engine/provider.js`
 * against a real LLM backend, using the settings saved by the options page
 * (`engine/settings.js`): provider, apiKey, model, baseUrl.
 *
 * Supports three provider wire formats:
 *   - "openai"             -> OpenAI Chat Completions API
 *   - "anthropic"          -> Anthropic Messages API
 *   - "openai-compatible"  -> Chat Completions API at a user-supplied base URL
 *
 * This module is self-contained (fetch only, no dependencies) and is wired
 * into `engine/index.js` when the user has saved valid provider settings.
 */

import { STYLES, assertValidRequest } from "./provider.js";
import { PROVIDERS, loadSettings } from "./settings.js";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

const STYLE_GUIDANCE = Object.freeze({
  [STYLES.NATURAL]: "natural, conversational English that reads like a native speaker wrote it",
  [STYLES.PROFESSIONAL]: "formal, professional English suitable for business or academic contexts",
  [STYLES.CASUAL]: "relaxed, casual English suitable for chatting with friends",
});

// --- Prompt construction -------------------------------------------------

function buildSystemPrompt(style) {
  const guidance = STYLE_GUIDANCE[style];
  return [
    "You are LingoLift, a writing assistant that rewrites English text for Vietnamese-speaking learners.",
    `Rewrite the user's text in ${guidance}. Preserve the original meaning.`,
    "Then write a brief explanation IN VIETNAMESE of what changed and why, aimed at an English learner.",
    "Respond with ONLY a JSON object, no markdown fences and no extra prose, matching exactly this shape:",
    '{"rewrittenText": "...", "explanationVi": "..."}',
  ].join("\n");
}

function buildUserPrompt(text) {
  return `Rewrite this text:\n\n${text}`;
}

// --- Response parsing ------------------------------------------------------

/**
 * Extracts and validates the {rewrittenText, explanationVi} payload from a
 * model's raw text reply, which is expected to be a JSON object optionally
 * wrapped in markdown code fences.
 * @param {string} rawText
 * @returns {{rewrittenText: string, explanationVi: string}}
 */
function parseModelReply(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("Provider response did not include any reply text.");
  }

  const jsonSlice = extractJsonObject(rawText);
  let parsed;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (err) {
    throw new Error("Provider reply was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Provider reply JSON was not an object.");
  }
  if (typeof parsed.rewrittenText !== "string" || !parsed.rewrittenText.trim()) {
    throw new Error("Provider reply JSON is missing a non-empty `rewrittenText` string.");
  }
  if (typeof parsed.explanationVi !== "string" || !parsed.explanationVi.trim()) {
    throw new Error("Provider reply JSON is missing a non-empty `explanationVi` string.");
  }

  return {
    rewrittenText: parsed.rewrittenText.trim(),
    explanationVi: parsed.explanationVi.trim(),
  };
}

/** Strips optional ```json ... ``` fences and returns the first {...} slice found. */
function extractJsonObject(rawText) {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : rawText;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Provider reply did not contain a JSON object.");
  }
  return candidate.slice(start, end + 1);
}

// --- Settings validation -----------------------------------------------

/**
 * @param {{provider: string, apiKey: string, model: string, baseUrl: string}} settings
 */
function assertUsableSettings(settings) {
  if (!settings || !settings.provider) {
    throw new Error("No provider is configured. Open Options and choose a provider.");
  }
  if (!Object.values(PROVIDERS).includes(settings.provider)) {
    throw new Error(`Unsupported provider: ${settings.provider}`);
  }
  if (!settings.apiKey || !settings.apiKey.trim()) {
    throw new Error("No API key is configured. Open Options and add an API key.");
  }
  if (!settings.model || !settings.model.trim()) {
    throw new Error("No model is configured. Open Options and set a model.");
  }
  if (settings.provider === PROVIDERS.OPENAI_COMPATIBLE && (!settings.baseUrl || !settings.baseUrl.trim())) {
    throw new Error("OpenAI-compatible provider requires a base URL. Open Options and set one.");
  }
}

/** Joins a user-supplied base URL with the `/chat/completions` path, avoiding `//`. */
function buildOpenAiCompatibleUrl(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return `${trimmed}/chat/completions`;
}

// --- HTTP helpers -----------------------------------------------------

/**
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<any>} parsed JSON body
 */
async function postJson(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(`Network request to provider failed: ${err && err.message ? err.message : err}`);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    const detail = extractErrorDetail(bodyText);
    throw new Error(`Provider request failed (HTTP ${response.status}${detail ? `: ${detail}` : ""}).`);
  }

  try {
    return JSON.parse(bodyText);
  } catch (err) {
    throw new Error("Provider returned a response that was not valid JSON.");
  }
}

/** Best-effort extraction of a human-readable message from an error body. */
function extractErrorDetail(bodyText) {
  if (!bodyText) return "";
  try {
    const parsed = JSON.parse(bodyText);
    const message = parsed && parsed.error && (parsed.error.message || parsed.error);
    if (typeof message === "string") return message;
  } catch (_err) {
    // Not JSON; fall through to a truncated raw snippet.
  }
  return bodyText.length > 200 ? `${bodyText.slice(0, 200)}...` : bodyText;
}

// --- Per-provider request/response adapters -----------------------------

async function callOpenAiChatCompletions({ url, apiKey, model, systemPrompt, userPrompt }) {
  const body = await postJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  const choice = body && Array.isArray(body.choices) ? body.choices[0] : undefined;
  const content = choice && choice.message && choice.message.content;
  if (typeof content !== "string") {
    throw new Error("Provider response was missing `choices[0].message.content`.");
  }
  return content;
}

async function callAnthropicMessages({ apiKey, model, systemPrompt, userPrompt }) {
  const body = await postJson(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const block = body && Array.isArray(body.content) ? body.content.find((b) => b && b.type === "text") : undefined;
  if (!block || typeof block.text !== "string") {
    throw new Error("Provider response was missing `content[].text`.");
  }
  return block.text;
}

// --- Public provider -----------------------------------------------------

export const apiProvider = {
  id: "api",
  /**
   * @param {{text: string, style: string}} request
   * @returns {Promise<{rewrittenText: string, explanationVi: string}>}
   */
  async rewrite(request) {
    assertValidRequest(request);
    const settings = await loadSettings();
    assertUsableSettings(settings);

    const systemPrompt = buildSystemPrompt(request.style);
    const userPrompt = buildUserPrompt(request.text);

    let rawReply;
    if (settings.provider === PROVIDERS.OPENAI) {
      rawReply = await callOpenAiChatCompletions({
        url: OPENAI_CHAT_COMPLETIONS_URL,
        apiKey: settings.apiKey,
        model: settings.model,
        systemPrompt,
        userPrompt,
      });
    } else if (settings.provider === PROVIDERS.ANTHROPIC) {
      rawReply = await callAnthropicMessages({
        apiKey: settings.apiKey,
        model: settings.model,
        systemPrompt,
        userPrompt,
      });
    } else if (settings.provider === PROVIDERS.OPENAI_COMPATIBLE) {
      rawReply = await callOpenAiChatCompletions({
        url: buildOpenAiCompatibleUrl(settings.baseUrl),
        apiKey: settings.apiKey,
        model: settings.model,
        systemPrompt,
        userPrompt,
      });
    } else {
      throw new Error(`Unsupported provider: ${settings.provider}`);
    }

    return parseModelReply(rawReply);
  },
};

// Exported for tests only; not part of the provider interface.
export const __testing = {
  buildSystemPrompt,
  buildUserPrompt,
  parseModelReply,
  extractJsonObject,
  assertUsableSettings,
  buildOpenAiCompatibleUrl,
  extractErrorDetail,
};
