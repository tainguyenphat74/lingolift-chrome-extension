import { apiProvider } from "./apiProvider.js";
import { loadSettings } from "./settings.js";
import { localDemoProvider } from "./localDemoProvider.js";

export { STYLES, STYLE_LABELS } from "./provider.js";

/**
 * Selects the real BYOK provider when the user has saved the minimum
 * configuration. Until demo mode is removed in a follow-up commit, requests
 * without a saved API key/model continue using the local provider.
 */
export async function rewrite(request) {
  const settings = await loadSettings();
  const provider = settings.apiKey.trim() && settings.model.trim()
    ? apiProvider
    : localDemoProvider;
  return provider.rewrite(request);
}

export const activeProviderId = "configured-at-runtime";
