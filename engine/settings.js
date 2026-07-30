/**
 * LingoLift BYOK settings storage.
 *
 * Settings are persisted to `chrome.storage.local` only. They are never
 * sent to LingoLift or any third party by this module — see the options
 * page for the full disclosure shown to the user. `chrome.storage.local`
 * is plain local storage, not an encrypted vault: anything else able to
 * read the extension's storage on this device could read it too.
 *
 * This module only reads/writes settings. Nothing here makes network
 * calls or changes which rewrite provider `engine/index.js` uses yet.
 */

export const PROVIDERS = Object.freeze({
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  OPENAI_COMPATIBLE: "openai-compatible",
});

export const PROVIDER_LABELS = Object.freeze({
  [PROVIDERS.OPENAI]: "OpenAI",
  [PROVIDERS.ANTHROPIC]: "Anthropic",
  [PROVIDERS.OPENAI_COMPATIBLE]: "OpenAI-compatible",
});

/** Providers that need a user-supplied base URL to know where to send requests. */
export const PROVIDERS_REQUIRING_BASE_URL = Object.freeze([PROVIDERS.OPENAI_COMPATIBLE]);

const SETTINGS_KEY = "lingolift_settings";

const DEFAULT_SETTINGS = Object.freeze({
  provider: PROVIDERS.OPENAI,
  apiKey: "",
  model: "",
  baseUrl: "",
});

/** @returns {Promise<{provider: string, apiKey: string, model: string, baseUrl: string}>} */
export async function loadSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

/**
 * @param {{provider: string, apiKey?: string, model?: string, baseUrl?: string}} settings
 * @returns {Promise<{provider: string, apiKey: string, model: string, baseUrl: string}>}
 */
export async function saveSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function clearSettings() {
  await chrome.storage.local.remove(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS };
}
