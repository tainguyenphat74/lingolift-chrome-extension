import { apiProvider } from "./apiProvider.js";
import { loadSettings } from "./settings.js";

export { STYLES, STYLE_LABELS } from "./provider.js";

/**
 * Route every rewrite through the user's configured BYOK provider.
 */
export async function rewrite(request) {
  const settings = await loadSettings();
  if (!settings.apiKey.trim()) {
    throw new Error("No API key is configured. Open Options and add your provider API key.");
  }
  if (!settings.model.trim()) {
    throw new Error("No model is configured. Open Options and set a model.");
  }
  return apiProvider.rewrite(request);
}

export const activeProviderId = "configured-at-runtime";
