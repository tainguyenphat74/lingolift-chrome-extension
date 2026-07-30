# LingoLift Product Specification

## 1. Product summary

LingoLift is a Chrome extension that helps Vietnamese and other non-native English speakers quickly improve English sentences where they write them.

The extension accepts a sentence, rewrites it in a selected style, and explains the main changes in Vietnamese. Users bring their own AI provider key; LingoLift does not receive or proxy the key.

**Product promise:** Lift your English writing without leaving the page.

## 2. Target users

- Vietnamese learners and professionals writing in English.
- Non-native English speakers who want fast, practical corrections.
- Users who prefer to keep their AI provider key under their own control.

## 3. Primary workflows

### Popup workflow

1. Open LingoLift from the Chrome toolbar.
2. Enter or paste English text.
3. Choose Natural, Professional, or Casual.
4. Rewrite the text.
5. Review the improved sentence and Vietnamese explanation.
6. Copy the result.

### Inline workflow

1. Focus a supported webpage field: `textarea`, text `input`, or `contenteditable`.
2. Open the LingoLift inline action.
3. Choose a style and rewrite.
4. Apply the result to the selected text, or to the whole field when there is no selection.

### Provider setup workflow

1. Open Options from the popup.
2. Choose OpenAI, Anthropic, or an OpenAI-compatible provider.
3. Enter the model, API key, and compatible-provider base URL when required.
4. Save settings locally.
5. The extension calls the selected provider directly from the browser.

## 4. MVP scope

### Included

- Manifest V3 Chrome extension.
- Popup rewriting experience.
- Inline rewriting in standard webpage text fields.
- Natural, Professional, and Casual styles.
- Vietnamese explanations.
- Selection-aware replacement and Apply behavior.
- Multiple BYOK providers:
  - OpenAI Chat Completions.
  - Anthropic Messages API.
  - OpenAI-compatible Chat Completions.
- Local provider settings using `chrome.storage.local`.
- Dark premium visual design.
- Local rewrite history for the popup.
- Clear loading, success, and error states.

### Final MVP provider behavior

- If no provider settings exist, show setup guidance and do not attempt a rewrite.
- If provider settings are valid, call the selected provider directly.
- Do not send API keys or user text to a LingoLift-owned backend.
- The offline demo provider is not part of the active product flow.

## 5. Explicit exclusions

- LingoLift-owned AI proxy or backend in the MVP.
- Automatic rewriting without user action.
- User accounts, subscriptions, billing, or hosted history.
- Server-side storage of API keys or sentence text.
- Guaranteed compatibility with every custom rich-text editor.
- Full English lessons, pronunciation training, or translation as primary features.
- Automatic detection of the user's best provider or model.

## 6. Functional requirements

### FR-1: Rewrite request

The system must accept non-empty English text and one supported style.

### FR-2: Provider selection

The system must route a request to the provider configured in local settings.

### FR-3: OpenAI

The client must use the OpenAI Chat Completions endpoint with Bearer authentication.

### FR-4: Anthropic

The client must use the Anthropic Messages endpoint with the required API headers.

### FR-5: OpenAI-compatible providers

The client must use the configured base URL and append the Chat Completions path safely.

### FR-6: Structured result

The provider prompt must request a structured result containing:

- `rewrittenText`
- `explanationVi`

The client must validate both fields before showing a result.

### FR-7: Local key storage

Provider, model, base URL, and API key must be stored only in the browser's extension storage. The UI must warn that this storage is not an encrypted vault.

### FR-8: Inline replacement

Apply must replace only the current selection when text is selected. Without a selection, Apply must replace the full supported field.

### FR-9: Error handling

The UI must show a useful message for missing settings, network errors, non-success provider responses, malformed provider responses, and unsupported providers. API keys must not appear in error messages or logs.

### FR-10: Privacy

The extension must not send provider keys or sentence text to LingoLift infrastructure.

## 7. Non-functional requirements

- Chrome Manifest V3.
- Plain HTML, CSS, and JavaScript; no external runtime dependencies.
- No API key committed to the repository.
- Shadow DOM or equivalent isolation for the inline widget.
- Readable dark UI with keyboard and focus states.
- No console logging of prompts, results, or credentials in production code.

## 8. Acceptance criteria

- Given valid OpenAI settings, a popup rewrite returns an improved sentence and Vietnamese explanation.
- Given valid Anthropic settings, the same workflow returns the normalized result shape.
- Given valid OpenAI-compatible settings, the client calls the configured endpoint without creating a duplicate slash in the URL.
- Given missing or invalid settings, the user receives setup guidance and no request is attempted.
- Given a selected sentence in a webpage field, Apply changes only that selection.
- Given no selection, Apply changes the complete field value.
- Given an API failure, the UI shows a safe error without exposing the key.
- Given the extension is installed from the repository, no build step or API key is required to load it.
- Given a user inspects network traffic, requests go directly to the selected provider and not to a LingoLift backend.

## 9. Current implementation status

Completed:

- Chrome extension MVP and inline webpage workflow.
- Dark premium theme.
- Local BYOK settings page.
- Provider adapter layer for OpenAI, Anthropic, and OpenAI-compatible APIs.
- Active provider routing with no demo fallback.

Next implementation boundary:

- Test real requests with user-supplied keys without committing credentials.
- Add provider-aware UI status and setup shortcuts.
- Improve compatibility with custom rich-text editors.

## 10. Security and privacy risks

`chrome.storage.local` is convenient but is not an encrypted secret vault. Users should use a dedicated provider key, configure provider-side spending limits, avoid shared or untrusted computers, and clear the key when it is no longer needed.

A future backend is not part of this MVP. If one is added later, its authentication, data retention, prompt handling, and key ownership must be specified separately before implementation.
