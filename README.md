# LingoLift

A Chrome extension (Manifest V3) that rewrites English text in a chosen
style — **Natural**, **Professional**, or **Casual** — and gives a short
Vietnamese explanation of what changed. It ships with a fully offline,
deterministic demo rewrite engine, so it works immediately with **no API
key, no build step, and no external dependencies**.

## Features

- Popup UI branded LingoLift, plain HTML/CSS/JS
- Textarea for English input with live character count
- Style selector: Natural / Professional / Casual
- Rewrite button, or `Ctrl`/`Cmd`+`Enter` from the textarea
- Result area with a one-click Copy button
- Short Vietnamese explanation of the rewrite for each result
- Recent history (last 8 rewrites) persisted via `chrome.storage.local`,
  click any entry to restore it
- Inline rewrite button on focused `textarea`, text `input`, and
  `contenteditable` fields on webpages
- Rewrite selected text only, or the whole field when no text is selected
- Apply the result directly back to the original webpage field
- Deterministic local "demo provider" so the extension is fully usable
  without a backend or API key

## Installation (load unpacked)

1. Open `chrome://extensions` in Chrome (or any Chromium-based browser).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select this project's root folder (the one containing `manifest.json`).
5. Click the LingoLift icon in the toolbar to open the popup.

No `npm install`, no build/bundle step — the files are loaded as-is.

## Provider settings (BYOK)

Open **Options** from the popup to save your own provider settings locally.
LingoLift currently supports these provider choices:

- OpenAI
- Anthropic
- OpenAI-compatible endpoints

The settings page stores the provider, model, base URL, and API key in this
browser's `chrome.storage.local`. The API key is never sent to LingoLift or a
LingoLift server. Chrome extension storage is not an encrypted vault, so use a
separate key with provider-side spending limits and do not use this feature on
shared or untrusted computers. The provider adapters now exist in
`engine/apiProvider.js`, but they are not active yet; the extension still uses
the local demo provider until the integration commit is completed.

## Usage

### Popup

1. Click the LingoLift icon in the Chrome toolbar.
2. Type or paste English text into the input box.
3. Pick a style: Natural, Professional, or Casual.
4. Click **Rewrite**, or press `Ctrl`+`Enter` (`Cmd`+`Enter` on macOS).
5. Read the rewritten text and its Vietnamese explanation; click **Copy**
   to copy the result.

### Inline webpage rewrite

1. Focus a `textarea`, text input, or `contenteditable` field on a webpage.
2. Click the small **LingoLift** button beside the field.
3. Select a rewrite style and click **Rewrite**.
4. Click **Apply** to replace the selected text, or the whole field when
   nothing is selected.

The inline widget uses Shadow DOM so its styles do not interfere with the
website. It dismisses with **Escape**, the close button, or a click outside.

## Project structure

```
lingolift-chrome-extension/
├── manifest.json              # MV3 manifest (popup action, icons, storage permission)
├── popup/
│   ├── popup.html             # Popup markup
│   ├── popup.css              # Popup styling
│   └── popup.js                # UI wiring: input, style selector, rewrite,
│                                #   copy, chrome.storage.local history
├── engine/
│   ├── provider.js            # Provider interface/contract + shared style constants
│   ├── localDemoProvider.js   # Deterministic offline rewrite engine (the default provider)
│   ├── apiProvider.js         # BYOK adapters for OpenAI, Anthropic, and compatible APIs
│   ├── settings.js            # Local provider settings storage
│   └── index.js               # Single switch point selecting the active provider
├── background/
│   └── background.js          # Message bridge to the rewrite engine
├── content/
│   └── content.js             # Inline webpage button, popover, and Apply flow
├── icons/                     # PNG icons (16/32/48/128)
├── .gitignore
└── README.md
```

The popup and inline UI both use the same provider interface through
`engine/index.js`. The current provider is local and deterministic, so text
stays in the browser and no API key is required.

## Privacy and permissions

The inline feature is injected into HTTP(S) webpages so it can detect supported
text fields and apply rewrites directly. This requires webpage access in the
extension manifest. In this MVP, all rewriting uses the local demo engine; no
text is sent to a server. A future remote provider must use a secure backend
rather than embedding an API key in the extension.

## Current limitations

- The demo engine uses fixed phrase substitutions and basic formatting; it
  does not understand context or perform full AI paraphrasing.
- The inline widget supports standard `textarea`, text `input`, and
  `contenteditable` fields. Some custom editors may need additional adapters.
- History is capped at the 8 most recent popup rewrites and is stored only in
  `chrome.storage.local`.

## Testing

Run the static checks from the project root:

```bash
node --check popup/popup.js
node --check content/content.js
node --check background/background.js
```

Then load the project unpacked in Chrome and test both the popup and an inline
rewrite on a page containing a standard text field.

## License

MIT — see [LICENSE](./LICENSE).
