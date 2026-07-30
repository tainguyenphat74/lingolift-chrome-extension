# LingoLift

A Chrome extension that helps non-native English speakers rewrite sentences naturally, professionally, or casually—with a short Vietnamese explanation.

## Features

- Rewrite text from the popup or directly inside webpages.
- Supports `textarea`, text `input`, and `contenteditable` fields.
- Rewrite selected text or the complete field.
- Natural, Professional, and Casual styles.
- Vietnamese explanations.
- Dark premium interface.
- Bring Your Own Key (BYOK) provider settings.
- Local popup history for the eight most recent rewrites.

## Providers

LingoLift supports settings for:

- OpenAI
- Anthropic
- OpenAI-compatible providers

Provider settings are saved in the browser with `chrome.storage.local`. API keys are not sent to LingoLift or a LingoLift server. Browser extension storage is not an encrypted vault, so use a dedicated key with spending limits and avoid shared or untrusted computers.

Provider adapters are active when valid settings are saved. LingoLift sends requests
directly from the extension to the selected provider; it does not proxy requests
through a LingoLift server.

## Installation

1. Open `chrome://extensions` in Chrome or Chromium.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project folder containing `manifest.json`.

No install or build step is required.

## Usage

### Popup

1. Open LingoLift from the toolbar.
2. Enter or paste English text.
3. Select a style.
4. Click **Rewrite**.
5. Review the result and Vietnamese explanation, then click **Copy**.

### Inline rewriting

1. Focus a supported text field on a webpage.
2. Click the LingoLift floating button.
3. Select a style and click **Rewrite**.
4. Click **Apply** to replace the selection or the whole field.

### Settings

Click **Options** in the popup to select a provider and save the model, API key, and compatible-provider base URL locally.

## Testing

From the project root:

```bash
node --check popup/popup.js
node --check content/content.js
node --check background/background.js
node --check engine/settings.js
node --check engine/apiProvider.js
node --check options/options.js
```

Then load the extension unpacked and test both popup and inline rewriting in Chrome.

## Limitations

- A valid provider API key and model are required to rewrite text.
- Custom rich-text editors may need additional compatibility work.
- History is stored locally and limited to eight popup rewrites.

## License

MIT — see [LICENSE](./LICENSE).

See [SPEC.md](./SPEC.md) for product scope and acceptance criteria.
