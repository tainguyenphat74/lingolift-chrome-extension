import { rewrite } from "../engine/index.js";

/**
 * Central message hub for the inline (in-page) rewrite UI in
 * `content/content.js`. Content scripts run as classic (non-module)
 * scripts, so they can't `import` `engine/index.js` directly — the
 * background service worker (which *can* be an ES module) does that
 * import once and exposes it over `chrome.runtime.onMessage`.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "LINGOLIFT_REWRITE") return undefined;

  rewrite({ text: message.text, style: message.style })
    .then((result) => {
      sendResponse({ ok: true, rewrittenText: result.rewrittenText, explanationVi: result.explanationVi });
    })
    .catch((err) => {
      sendResponse({ ok: false, error: err && err.message ? err.message : "Rewrite failed." });
    });

  return true; // Keep the message channel open for the async sendResponse above.
});
