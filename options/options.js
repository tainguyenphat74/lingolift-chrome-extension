import {
  PROVIDERS,
  PROVIDERS_REQUIRING_BASE_URL,
  loadSettings,
  saveSettings,
  clearSettings,
} from "../engine/settings.js";

const MODEL_PLACEHOLDERS = {
  [PROVIDERS.OPENAI]: "e.g. gpt-4o-mini",
  [PROVIDERS.ANTHROPIC]: "e.g. claude-sonnet-4-5",
  [PROVIDERS.OPENAI_COMPATIBLE]: "e.g. llama-3.1-70b-instruct",
};

const els = {
  providerSelect: document.getElementById("provider-select"),
  apiKeyInput: document.getElementById("api-key-input"),
  toggleKeyBtn: document.getElementById("toggle-key-btn"),
  modelInput: document.getElementById("model-input"),
  baseUrlField: document.getElementById("base-url-field"),
  baseUrlInput: document.getElementById("base-url-input"),
  saveBtn: document.getElementById("save-btn"),
  clearBtn: document.getElementById("clear-btn"),
  statusMessage: document.getElementById("status-message"),
};

let statusResetTimer = null;

function requiresBaseUrl(provider) {
  return PROVIDERS_REQUIRING_BASE_URL.includes(provider);
}

function updateProviderDependentFields() {
  const provider = els.providerSelect.value;
  els.baseUrlField.hidden = !requiresBaseUrl(provider);
  els.modelInput.placeholder = MODEL_PLACEHOLDERS[provider] || "";
}

function showStatus(message, kind) {
  clearTimeout(statusResetTimer);
  els.statusMessage.textContent = message;
  els.statusMessage.hidden = false;
  els.statusMessage.classList.remove("is-success", "is-error");
  els.statusMessage.classList.add(kind === "error" ? "is-error" : "is-success");
  statusResetTimer = setTimeout(() => {
    els.statusMessage.hidden = true;
  }, 4000);
}

function applySettingsToForm(settings) {
  els.providerSelect.value = settings.provider;
  els.apiKeyInput.value = settings.apiKey;
  els.modelInput.value = settings.model;
  els.baseUrlInput.value = settings.baseUrl;
  updateProviderDependentFields();
}

// --- Events -----------------------------------------------------------

els.providerSelect.addEventListener("change", updateProviderDependentFields);

els.toggleKeyBtn.addEventListener("click", () => {
  const revealing = els.apiKeyInput.type === "password";
  els.apiKeyInput.type = revealing ? "text" : "password";
  els.toggleKeyBtn.textContent = revealing ? "Hide" : "Show";
});

els.saveBtn.addEventListener("click", async () => {
  const provider = els.providerSelect.value;
  const apiKey = els.apiKeyInput.value.trim();
  const model = els.modelInput.value.trim();
  const baseUrl = els.baseUrlInput.value.trim();

  if (requiresBaseUrl(provider) && !baseUrl) {
    showStatus("Base URL is required for an OpenAI-compatible provider.", "error");
    els.baseUrlInput.focus();
    return;
  }

  await saveSettings({ provider, apiKey, model, baseUrl: requiresBaseUrl(provider) ? baseUrl : "" });
  showStatus("Settings saved locally.", "success");
});

els.clearBtn.addEventListener("click", async () => {
  if (!window.confirm("Clear your saved provider, API key, model, and base URL from this browser?")) return;
  const defaults = await clearSettings();
  applySettingsToForm(defaults);
  showStatus("Settings cleared.", "success");
});

// --- Init ---------------------------------------------------------------

loadSettings().then(applySettingsToForm);
