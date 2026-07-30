/**
 * LingoLift inline content script.
 *
 * Runs as a classic (non-module) MV3 content script on every http(s) page.
 * It watches for focus on text fields, offers a small floating action
 * button (FAB) near the focused field, and — on click — opens a compact
 * popover to rewrite the selection (or the whole field) through the
 * configured BYOK provider via the background service worker, since content
 * scripts cannot `import` ES modules directly.
 *
 * Everything the widget renders lives inside a closed Shadow DOM so the
 * host page's CSS can never bleed in, and our styles can never leak out.
 *
 * NOTE: the pure helper functions below intentionally avoid touching
 * `document`/`window` so they can be unit-tested from Node (see
 * tests/content-helpers.test.js) via `module.exports` at the bottom of
 * this file. Everything that touches the live DOM is guarded behind an
 * `if (typeof document !== "undefined" ...)` bootstrap block so this file
 * is also safe to `require()` outside a browser.
 */

// --- Pure helpers (DOM-free, unit-testable) --------------------------------

const SUPPORTED_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel"]);

const STYLES = Object.freeze({
  NATURAL: "natural",
  PROFESSIONAL: "professional",
  CASUAL: "casual",
});

const STYLE_LABELS = Object.freeze({
  [STYLES.NATURAL]: "Natural",
  [STYLES.PROFESSIONAL]: "Professional",
  [STYLES.CASUAL]: "Casual",
});

/**
 * Whether `el` is a field LingoLift knows how to read from / write back to.
 * Accepts a plain object with the same shape as an element, so it can be
 * unit-tested without a real DOM.
 */
function isSupportedField(el) {
  if (!el || typeof el !== "object") return false;
  if (el.disabled) return false;
  if (el.tagName === "TEXTAREA") return !el.readOnly;
  if (el.tagName === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    return SUPPORTED_INPUT_TYPES.has(type) && !el.readOnly;
  }
  return el.isContentEditable === true;
}

/**
 * Slices out the selected substring of a text/textarea value given
 * selectionStart/selectionEnd, or returns null when there is no
 * (non-empty) selection.
 */
function getInputSelectionSlice(value, start, end) {
  if (typeof value !== "string") return null;
  if (typeof start !== "number" || typeof end !== "number") return null;
  if (start === end) return null;
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const text = value.slice(from, to);
  if (!text) return null;
  return { start: from, end: to, text };
}

/** The text to send to the rewrite engine: the selection if present, else the whole field. */
function computeSourceText(fieldValue, selectionText) {
  const selection = (selectionText || "").trim();
  if (selection) return selectionText;
  return fieldValue || "";
}

// --- Browser bootstrap -------------------------------------------------

if (typeof document !== "undefined" && document.addEventListener && !window.__lingolift_injected) {
  window.__lingolift_injected = true;
  initLingoLift();
}

function initLingoLift() {
  const FAB_SIZE = 32;
  const POPOVER_WIDTH = 280;
  const POPOVER_MAX_HEIGHT = 360;
  const VIEWPORT_MARGIN = 8;

  let activeField = null;
  let capturedSelection = null; // { text, input?: {start,end}, range?: Range } | null
  let sourceText = "";
  let currentStyle = STYLES.NATURAL;
  let isRewriting = false;
  let lastResult = null; // { rewrittenText, explanationVi }

  // --- Shadow DOM widget setup -----------------------------------------

  const host = document.createElement("div");
  host.style.all = "initial";
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .ll-fab, .ll-pop {
        position: fixed;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 2147483647;
      }
      .ll-fab {
        display: none;
        width: ${FAB_SIZE}px;
        height: ${FAB_SIZE}px;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(138, 124, 255, 0.35);
        border-radius: 999px;
        background: #17171d;
        color: #b3a8ff;
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        padding: 0;
        transition: transform 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      }
      .ll-fab.is-visible { display: flex; }
      .ll-fab:hover { transform: scale(1.06); border-color: rgba(138, 124, 255, 0.6); color: #d5cfff; }
      .ll-fab:active { transform: scale(0.96); }

      .ll-pop {
        display: none;
        width: ${POPOVER_WIDTH}px;
        max-height: ${POPOVER_MAX_HEIGHT}px;
        overflow-y: auto;
        background: #131318;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
        padding: 10px;
        color: #f1f1f4;
        font-size: 12.5px;
      }
      .ll-pop.is-visible { display: block; }

      .ll-pop__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .ll-pop__title {
        font-weight: 700;
        font-size: 12.5px;
        letter-spacing: -0.01em;
        color: #b3a8ff;
      }
      .ll-pop__close {
        border: none;
        background: none;
        color: #96969f;
        font-size: 15px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
      }
      .ll-pop__close:hover { background: #1c1c24; color: #f1f1f4; }

      .ll-pop__source {
        margin: 0 0 8px;
        padding: 6px 8px;
        max-height: 60px;
        overflow-y: auto;
        background: #191920;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        font-size: 11.5px;
        color: #96969f;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .ll-styles {
        display: flex;
        gap: 4px;
        margin-bottom: 8px;
      }
      .ll-style-chip {
        flex: 1;
        padding: 6px 4px;
        font-size: 11px;
        font-weight: 600;
        color: #96969f;
        background: #191920;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        cursor: pointer;
      }
      .ll-style-chip:hover { border-color: rgba(138, 124, 255, 0.28); color: #f1f1f4; }
      .ll-style-chip[aria-checked="true"] {
        background: linear-gradient(135deg, #8a7cff 0%, #5b8cff 100%);
        border-color: transparent;
        color: #fff;
      }

      .ll-btn {
        width: 100%;
        padding: 7px 10px;
        font-size: 12.5px;
        font-weight: 600;
        color: #fff;
        background: linear-gradient(135deg, #8a7cff 0%, #5b8cff 100%);
        border: none;
        border-radius: 8px;
        cursor: pointer;
      }
      .ll-btn:hover:not(:disabled) { filter: brightness(1.08); }
      .ll-btn:disabled { cursor: not-allowed; opacity: 0.6; }

      .ll-error {
        margin: 8px 0 0;
        padding: 6px 8px;
        font-size: 11.5px;
        color: #fb7185;
        background: rgba(251, 113, 133, 0.1);
        border: 1px solid rgba(251, 113, 133, 0.28);
        border-radius: 6px;
      }
      .ll-error.is-hidden { display: none; }

      .ll-result { margin-top: 8px; display: none; }
      .ll-result.is-visible { display: block; }
      .ll-result__text {
        margin: 0 0 6px;
        padding: 6px 8px;
        max-height: 90px;
        overflow-y: auto;
        background: #17171d;
        border: 1px solid rgba(138, 124, 255, 0.28);
        border-radius: 8px;
        white-space: pre-wrap;
        word-break: break-word;
        color: #f1f1f4;
      }
      .ll-result__explanation {
        margin: 0 0 8px;
        padding: 6px 8px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        color: #96969f;
        font-size: 11px;
      }
      .ll-result__actions { display: flex; gap: 6px; }
      .ll-result__actions .ll-btn--ghost {
        background: rgba(138, 124, 255, 0.12);
        color: #b3a8ff;
      }
      .ll-result__actions .ll-btn--ghost:hover:not(:disabled) { filter: none; background: rgba(138, 124, 255, 0.2); }
    </style>
    <button type="button" class="ll-fab" aria-label="Rewrite with LingoLift" title="Rewrite with LingoLift">✨</button>
    <div class="ll-pop" role="dialog" aria-label="LingoLift rewrite">
      <div class="ll-pop__header">
        <span class="ll-pop__title">LingoLift</span>
        <button type="button" class="ll-pop__close" aria-label="Close">×</button>
      </div>
      <p class="ll-pop__source"></p>
      <div class="ll-styles" role="radiogroup" aria-label="Rewrite style">
        <button type="button" class="ll-style-chip" data-style="natural" role="radio" aria-checked="true">Natural</button>
        <button type="button" class="ll-style-chip" data-style="professional" role="radio" aria-checked="false">Professional</button>
        <button type="button" class="ll-style-chip" data-style="casual" role="radio" aria-checked="false">Casual</button>
      </div>
      <button type="button" class="ll-btn ll-rewrite-btn">Rewrite</button>
      <p class="ll-error is-hidden"></p>
      <div class="ll-result">
        <p class="ll-result__text"></p>
        <p class="ll-result__explanation"></p>
        <div class="ll-result__actions">
          <button type="button" class="ll-btn ll-apply-btn">Apply</button>
          <button type="button" class="ll-btn ll-btn--ghost ll-cancel-btn">Dismiss</button>
        </div>
      </div>
    </div>
  `;

  const fab = shadow.querySelector(".ll-fab");
  const pop = shadow.querySelector(".ll-pop");
  const sourceEl = shadow.querySelector(".ll-pop__source");
  const styleRow = shadow.querySelector(".ll-styles");
  const rewriteBtn = shadow.querySelector(".ll-rewrite-btn");
  const errorEl = shadow.querySelector(".ll-error");
  const resultBox = shadow.querySelector(".ll-result");
  const resultTextEl = shadow.querySelector(".ll-result__text");
  const explanationEl = shadow.querySelector(".ll-result__explanation");
  const applyBtn = shadow.querySelector(".ll-apply-btn");
  const closeBtn = shadow.querySelector(".ll-pop__close");
  const cancelBtn = shadow.querySelector(".ll-cancel-btn");

  document.documentElement.appendChild(host);

  // --- Field detection ---------------------------------------------------

  function getFieldText(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
    return el.innerText || el.textContent || "";
  }

  function captureSelection(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const slice = getInputSelectionSlice(el.value, el.selectionStart, el.selectionEnd);
      if (!slice) return null;
      return { text: slice.text, input: { start: slice.start, end: slice.end } };
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return null;
    const text = range.toString();
    if (!text) return null;
    return { text, range: range.cloneRange() };
  }

  // --- Positioning ---------------------------------------------------------

  function positionFab(el) {
    const rect = el.getBoundingClientRect();
    const top = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.top + 4),
      window.innerHeight - FAB_SIZE - VIEWPORT_MARGIN
    );
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - FAB_SIZE - 4),
      window.innerWidth - FAB_SIZE - VIEWPORT_MARGIN
    );
    fab.style.top = `${top}px`;
    fab.style.left = `${left}px`;
  }

  function positionPopover() {
    const fabRect = fab.getBoundingClientRect();
    let top = fabRect.bottom + 6;
    if (top + POPOVER_MAX_HEIGHT > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, fabRect.top - POPOVER_MAX_HEIGHT - 6);
    }
    let left = fabRect.right - POPOVER_WIDTH;
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }

  function reposition() {
    if (fab.classList.contains("is-visible")) positionFab(activeField);
    if (pop.classList.contains("is-visible")) positionPopover();
  }

  // --- Show / hide ---------------------------------------------------------

  function showFab(el) {
    positionFab(el);
    fab.classList.add("is-visible");
  }

  function hideFab() {
    fab.classList.remove("is-visible");
  }

  function closePopover() {
    pop.classList.remove("is-visible");
    resetPopoverState();
  }

  function hideAll() {
    hideFab();
    closePopover();
    activeField = null;
  }

  function resetPopoverState() {
    isRewriting = false;
    lastResult = null;
    hideError();
    resultBox.classList.remove("is-visible");
    rewriteBtn.disabled = false;
    rewriteBtn.textContent = "Rewrite";
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("is-hidden");
  }

  function hideError() {
    errorEl.textContent = "";
    errorEl.classList.add("is-hidden");
  }

  function setStyle(style) {
    currentStyle = style;
    for (const chip of styleRow.querySelectorAll(".ll-style-chip")) {
      chip.setAttribute("aria-checked", String(chip.dataset.style === style));
    }
  }

  function openPopover() {
    if (!activeField) return;
    capturedSelection = captureSelection(activeField);
    sourceText = computeSourceText(getFieldText(activeField), capturedSelection && capturedSelection.text);
    if (!sourceText.trim()) return;

    resetPopoverState();
    setStyle(currentStyle);
    sourceEl.textContent = sourceText;
    sourceEl.title = capturedSelection ? "Selected text to rewrite" : "Whole field will be rewritten";
    pop.classList.add("is-visible");
    positionPopover();
  }

  // --- Rewrite flow ----------------------------------------------------

  function handleRewrite() {
    if (isRewriting || !sourceText.trim()) return;
    isRewriting = true;
    hideError();
    resultBox.classList.remove("is-visible");
    rewriteBtn.disabled = true;
    rewriteBtn.textContent = "Rewriting…";

    chrome.runtime.sendMessage(
      { type: "LINGOLIFT_REWRITE", text: sourceText, style: currentStyle },
      (response) => {
        isRewriting = false;
        rewriteBtn.disabled = false;
        rewriteBtn.textContent = "Rewrite";

        if (chrome.runtime.lastError) {
          showError("LingoLift couldn't reach its background worker. Try again.");
          return;
        }
        if (!response || !response.ok) {
          showError((response && response.error) || "Something went wrong. Please try again.");
          return;
        }
        lastResult = response;
        resultTextEl.textContent = response.rewrittenText;
        explanationEl.textContent = response.explanationVi;
        resultBox.classList.add("is-visible");
        positionPopover();
      }
    );
  }

  // --- Apply back into the page ---------------------------------------

  function dispatchInputEvents(el) {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertReplacementText" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyToInputLike(el, text) {
    if (capturedSelection && capturedSelection.input) {
      const { start, end } = capturedSelection.input;
      if (typeof el.setRangeText === "function") {
        el.setRangeText(text, start, end, "end");
      } else {
        el.value = el.value.slice(0, start) + text + el.value.slice(end);
      }
    } else {
      el.value = text;
      if (typeof el.setSelectionRange === "function") {
        el.setSelectionRange(text.length, text.length);
      }
    }
    dispatchInputEvents(el);
  }

  function applyToContentEditable(el, text) {
    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();

    const range = capturedSelection && capturedSelection.range ? capturedSelection.range : document.createRange();
    if (!capturedSelection || !capturedSelection.range) {
      range.selectNodeContents(el);
    }
    sel.addRange(range);

    const inserted = document.execCommand && document.execCommand("insertText", false, text);
    if (!inserted) {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      sel.removeAllRanges();
      sel.collapse(el, el.childNodes.length);
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertReplacementText" }));
  }

  function handleApply() {
    if (!lastResult || !activeField) return;
    const el = activeField;
    const text = lastResult.rewrittenText;

    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.focus();
      applyToInputLike(el, text);
    } else {
      applyToContentEditable(el, text);
    }

    closePopover();
    showFab(el);
  }

  // --- Event wiring ---------------------------------------------------

  document.addEventListener("focusin", (event) => {
    if (event.target === host) return; // Focus moved inside our own widget; ignore.
    const el = event.target;
    if (isSupportedField(el) && getFieldText(el).trim().length > 0) {
      if (el !== activeField) {
        activeField = el;
        closePopover();
      }
      showFab(el);
    } else {
      activeField = null;
      hideAll();
    }
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (path.includes(host)) return; // Click landed on our widget.
      if (activeField && path.includes(activeField)) return; // Click landed on the active field.
      hideAll();
    },
    true
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (fab.classList.contains("is-visible") || pop.classList.contains("is-visible"))) {
      hideAll();
    }
  });

  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);

  fab.addEventListener("click", openPopover);
  closeBtn.addEventListener("click", closePopover);
  cancelBtn.addEventListener("click", closePopover);
  rewriteBtn.addEventListener("click", handleRewrite);
  applyBtn.addEventListener("click", handleApply);
  styleRow.addEventListener("click", (event) => {
    const chip = event.target.closest(".ll-style-chip");
    if (chip) setStyle(chip.dataset.style);
  });
}

// --- Node-only export for unit tests (no-op in the browser) ---------------

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isSupportedField,
    getInputSelectionSlice,
    computeSourceText,
    STYLES,
    STYLE_LABELS,
  };
}
