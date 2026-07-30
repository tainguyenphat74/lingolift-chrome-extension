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
- Deterministic local "demo provider" so the extension is fully usable
  without a backend, structured so a real API-backed provider can be
  swapped in later without touching the UI code

## Installation (load unpacked)

1. Open `chrome://extensions` in Chrome (or any Chromium-based browser).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select this project's root folder (the one containing `manifest.json`).
5. Click the LingoLift icon in the toolbar to open the popup.

No `npm install`, no build/bundle step — the files are loaded as-is.

## Usage

1. Type or paste English text into the input box.
2. Pick a style: Natural, Professional, or Casual.
3. Click **Rewrite**, or press `Ctrl`+`Enter` (`Cmd`+`Enter` on macOS).
4. Read the rewritten text and its Vietnamese explanation; click **Copy**
   to copy the result to your clipboard.
5. Previous rewrites appear under **Recent** — click one to restore it.

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
│   └── index.js               # Single switch point selecting the active provider
├── icons/                     # Generated PNG icons (16/32/48/128)
├── .gitignore
└── README.md
```

`popup.js` only ever calls `engine/index.js`'s `rewrite()` function — it
never talks to a specific provider directly. That indirection is what
makes it possible to add a real backend later without touching any UI code
(see below).

## How the demo rewrite engine works

`engine/localDemoProvider.js` is **not** a machine-translation or LLM
model. It's a small set of deterministic, rule-based text transforms:

1. Whitespace/punctuation cleanup (collapse extra spaces, tighten spacing
   around punctuation, capitalize sentence starts, ensure a trailing
   period).
2. A fixed phrase-substitution dictionary per style:
   - **Natural**: expands common texting shorthand (`u` → `you`, `pls` →
     `please`, `b4` → `before`, …) without pushing tone toward formal or
     casual.
   - **Professional**: expands contractions and swaps informal words for
     more formal ones (`don't` → `do not`, `thanks` → `Thank you`, `asap`
     → `as soon as possible`, …).
   - **Casual**: the inverse — contracts formal phrasing and swaps in
     everyday words (`cannot` → `can't`, `for your information` → `FYI`,
     …).
3. A short Vietnamese explanation is generated from the same style and
   the concrete substitutions that were applied, so it's always
   consistent with the actual output.

Because there's no randomness and no network call, the same input +
style always produces the same output — useful for demos, tests, and for
usage with no internet connection.

## Current limitations

- The demo engine does word/phrase substitution, not true paraphrasing —
  it will not restructure sentences, fix grammar beyond basic
  capitalization/punctuation, or handle nuance the way an LLM would.
- Vietnamese explanations are template-based summaries of what the
  dictionary changed, not a full translation of the English text.
- History is capped at the 8 most recent rewrites and stored only in
  `chrome.storage.local` (per-browser-profile, not synced).
- No options page yet — there is nothing to configure since there's no
  API key in this MVP.
- Not yet tested across every Chromium-based browser; developed and
  verified against Chrome's `chrome://extensions` unpacked-load flow.

## Next steps: secure API integration

The provider abstraction in `engine/provider.js` / `engine/index.js` is
designed so a real backend can be dropped in without changing
`popup.js`. When you're ready to move beyond the offline demo:

1. **Never ship a raw LLM/API key inside the extension bundle.** Chrome
   extension code (including popup JS) is fully readable by anyone who
   installs it, so any key embedded there is effectively public.
2. Build a small backend service you control (e.g. a serverless function)
   that holds the real API key server-side, exposes a narrow endpoint
   like `POST /rewrite { text, style }`, and returns
   `{ rewrittenText, explanationVi }`.
3. Add that origin to `host_permissions` in `manifest.json` (least
   privilege — scope it to your backend's domain only, not `<all_urls>`).
4. Create `engine/apiProvider.js` implementing the same interface as
   `localDemoProvider.js`:
   ```js
   export const apiProvider = {
     id: "api",
     async rewrite({ text, style }) {
       const res = await fetch("https://your-backend.example.com/rewrite", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ text, style }),
       });
       if (!res.ok) throw new Error("Rewrite request failed.");
       return res.json(); // { rewrittenText, explanationVi }
     },
   };
   ```
5. Switch `ACTIVE_PROVIDER` in `engine/index.js` to `apiProvider`. No
   other file needs to change.
6. On the backend: apply authentication (e.g. per-user tokens issued at
   install/sign-in), rate limiting, and input length limits before
   calling the upstream LLM provider, and log/monitor for abuse.
7. Consider a graceful fallback to `localDemoProvider` if the network
   request fails, so the extension degrades instead of breaking.
8. Update the "Demo mode" footer text in `popup.html` once a real
   provider is active, so users know rewrites now leave the device.

## License

MIT — see [LICENSE](./LICENSE).
