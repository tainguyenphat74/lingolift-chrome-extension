import { localDemoProvider } from "./localDemoProvider.js";

export { STYLES, STYLE_LABELS } from "./provider.js";

/**
 * Single switch point for which rewrite provider LingoLift uses.
 *
 * Today this is the offline `localDemoProvider`. To integrate a real
 * backend/LLM later:
 *   1. Create e.g. `engine/apiProvider.js` implementing the interface
 *      documented in `engine/provider.js`.
 *   2. Import it here and change ACTIVE_PROVIDER below.
 * No changes are needed in popup.js — it only calls `rewrite()` below.
 */
const ACTIVE_PROVIDER = localDemoProvider;

/**
 * @param {{text: string, style: string}} request
 * @returns {Promise<{rewrittenText: string, explanationVi: string}>}
 */
export function rewrite(request) {
  return ACTIVE_PROVIDER.rewrite(request);
}

export const activeProviderId = ACTIVE_PROVIDER.id;
