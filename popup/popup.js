import { rewrite, STYLES, STYLE_LABELS } from "../engine/index.js";

const HISTORY_KEY = "lingolift_history";
const HISTORY_LIMIT = 8;

const els = {
  input: document.getElementById("input-text"),
  charCount: document.getElementById("char-count"),
  styleSelector: document.getElementById("style-selector"),
  rewriteBtn: document.getElementById("rewrite-btn"),
  rewriteBtnLabel: document.getElementById("rewrite-btn-label"),
  errorMessage: document.getElementById("error-message"),
  resultSection: document.getElementById("result-section"),
  resultText: document.getElementById("result-text"),
  copyBtn: document.getElementById("copy-btn"),
  explanationText: document.getElementById("explanation-text"),
  historySection: document.getElementById("history-section"),
  historyList: document.getElementById("history-list"),
  clearHistoryBtn: document.getElementById("clear-history-btn"),
  optionsBtn: document.getElementById("options-btn"),
};

let currentStyle = STYLES.NATURAL;
let isRewriting = false;
let copyResetTimer = null;

// --- Style selector -------------------------------------------------------

els.styleSelector.addEventListener("click", (event) => {
  const chip = event.target.closest(".style-chip");
  if (!chip) return;
  setStyle(chip.dataset.style);
});

function setStyle(style) {
  currentStyle = style;
  for (const chip of els.styleSelector.querySelectorAll(".style-chip")) {
    chip.setAttribute("aria-checked", String(chip.dataset.style === style));
  }
}

// --- Input handling ---------------------------------------------------

els.input.addEventListener("input", () => {
  els.charCount.textContent = String(els.input.value.length);
  if (!els.errorMessage.hidden) hideError();
});

els.input.addEventListener("keydown", (event) => {
  const isSubmitCombo = (event.metaKey || event.ctrlKey) && event.key === "Enter";
  if (isSubmitCombo) {
    event.preventDefault();
    handleRewrite();
  }
});

els.rewriteBtn.addEventListener("click", handleRewrite);
els.optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// --- Rewrite flow -------------------------------------------------------

async function handleRewrite() {
  if (isRewriting) return;

  const text = els.input.value.trim();
  if (!text) {
    showError("Please enter some English text first.");
    return;
  }

  hideError();
  setLoading(true);

  try {
    const { rewrittenText, explanationVi } = await rewrite({ text, style: currentStyle });
    showResult(rewrittenText, explanationVi);
    await saveHistoryEntry({ input: text, style: currentStyle, output: rewrittenText, explanationVi });
    await renderHistory();
  } catch (err) {
    showError(err && err.message ? err.message : "Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  isRewriting = loading;
  els.rewriteBtn.disabled = loading;
  els.rewriteBtnLabel.textContent = loading ? "Rewriting…" : "Rewrite";
}

function showResult(text, explanationVi) {
  els.resultText.value = text;
  els.explanationText.textContent = explanationVi;
  els.resultSection.hidden = false;
}

function showError(message) {
  els.errorMessage.textContent = message;
  els.errorMessage.hidden = false;
}

function hideError() {
  els.errorMessage.hidden = true;
  els.errorMessage.textContent = "";
}

// --- Copy button ----------------------------------------------------------

els.copyBtn.addEventListener("click", async () => {
  if (!els.resultText.value) return;
  try {
    await navigator.clipboard.writeText(els.resultText.value);
    flashCopySuccess();
  } catch (err) {
    // Fallback for environments without Clipboard API permission.
    els.resultText.select();
    document.execCommand("copy");
    flashCopySuccess();
  }
});

function flashCopySuccess() {
  clearTimeout(copyResetTimer);
  els.copyBtn.textContent = "Copied!";
  els.copyBtn.classList.add("is-success");
  copyResetTimer = setTimeout(() => {
    els.copyBtn.textContent = "Copy";
    els.copyBtn.classList.remove("is-success");
  }, 1500);
}

// --- History (chrome.storage.local) ---------------------------------------

async function getHistory() {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
}

async function saveHistoryEntry(entry) {
  const history = await getHistory();
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...entry,
  };
  const next = [record, ...history].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
}

async function renderHistory() {
  const history = await getHistory();
  els.historySection.hidden = history.length === 0;
  els.historyList.innerHTML = "";

  for (const entry of history) {
    const item = document.createElement("li");
    item.className = "history__item";
    item.tabIndex = 0;

    const top = document.createElement("div");
    top.className = "history__item-top";

    const styleLabel = document.createElement("span");
    styleLabel.className = "history__item-style";
    styleLabel.textContent = STYLE_LABELS[entry.style] || entry.style;

    const time = document.createElement("span");
    time.className = "history__item-time";
    time.textContent = formatTime(entry.timestamp);

    top.append(styleLabel, time);

    const text = document.createElement("p");
    text.className = "history__item-text";
    text.textContent = entry.input;

    item.append(top, text);

    const restore = () => restoreHistoryEntry(entry);
    item.addEventListener("click", restore);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        restore();
      }
    });

    els.historyList.appendChild(item);
  }
}

function restoreHistoryEntry(entry) {
  els.input.value = entry.input;
  els.charCount.textContent = String(entry.input.length);
  setStyle(entry.style);
  showResult(entry.output, entry.explanationVi);
  hideError();
}

function formatTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

els.clearHistoryBtn.addEventListener("click", async () => {
  if (!window.confirm("Clear recent history?")) return;
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  await renderHistory();
});

// --- Init -------------------------------------------------------------

setStyle(currentStyle);
renderHistory();
