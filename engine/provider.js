/**
 * LingoLift rewrite provider interface.
 *
 * A "provider" is anything that can take English text + a target style and
 * return a rewritten version plus a short Vietnamese explanation of what
 * changed. LingoLift ships with `localDemoProvider.js`, a fully offline,
 * deterministic provider so the extension works out of the box with no
 * API key and no network access.
 *
 * To plug in a real backend/LLM later, create a new provider module that
 * exports an object matching this shape:
 *
 *   {
 *     id: "my-provider",
 *     rewrite({ text, style }) -> Promise<{
 *       rewrittenText: string,
 *       explanationVi: string,
 *     }>
 *   }
 *
 * `style` is one of "natural" | "professional" | "casual".
 *
 * Then register it in `engine/index.js` (see ACTIVE_PROVIDER_ID) instead of
 * changing any popup/UI code. The popup only ever talks to
 * `engine/index.js`, never to a specific provider directly, so swapping the
 * backend is a one-line change. See README.md "Next steps: secure API
 * integration" for guidance on keeping API keys off the client.
 */

export const STYLES = Object.freeze({
  NATURAL: "natural",
  PROFESSIONAL: "professional",
  CASUAL: "casual",
});

export const STYLE_LABELS = Object.freeze({
  [STYLES.NATURAL]: "Natural",
  [STYLES.PROFESSIONAL]: "Professional",
  [STYLES.CASUAL]: "Casual",
});

/**
 * Validates a rewrite request shape. Providers can call this defensively.
 * @param {{text: string, style: string}} request
 */
export function assertValidRequest(request) {
  if (!request || typeof request.text !== "string" || !request.text.trim()) {
    throw new Error("Rewrite request requires non-empty `text`.");
  }
  if (!Object.values(STYLES).includes(request.style)) {
    throw new Error(`Rewrite request has unknown style: ${request.style}`);
  }
}
