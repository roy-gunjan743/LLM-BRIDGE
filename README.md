# LLM Bridge

LLM Bridge is a Chrome Manifest V3 extension that extracts supported AI chat pages, summarizes long conversations, and stores reusable memory in `chrome.storage.local`.

**No local software required.** By default, LLM Bridge uses the free Google Gemini API. You can also use Chrome's built-in AI or a local Ollama server.

## Features

- Declarative MV3 content script injection only
- Resilient ChatGPT extraction with fallback selectors and hidden-element filtering
- **3 AI providers:** Google Gemini API (free), Chrome Built-in AI (zero setup), Ollama (local)
- Connection test, request timeout, and retry handling
- Smart paragraph and sentence-aware chunking
- Persistent extracted chats, summaries, memory, settings, and progress
- Popup state restore after refresh or close
- Copy, TXT export, and Markdown export
- Send summary directly to ChatGPT, Claude, or Grok
- Options page for provider, API key, model, chunk size, temperature, and system prompt

## AI Providers

| Provider | Setup | Cost | Privacy | Quality |
| --- | --- | --- | --- | --- |
| **Google Gemini API** (default) | Paste a free API key | Free tier | Cloud-based | ⭐⭐⭐ High |
| **Chrome Built-in AI** | Zero setup | Always free | On-device | ⭐⭐ Good |
| **Ollama** (optional) | Install Ollama locally | Free | Fully local | ⭐⭐⭐ Depends on model |

---

## Installation

### Step 1: Load the Extension

1. Open Chrome (or any Chromium browser supporting Manifest V3).
2. Go to `chrome://extensions/`.
3. Enable **Developer Mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select this repository folder.

### Step 2: Get a Free Gemini API Key (Recommended)

> This is required only if you use the **Gemini API** provider (the default).

1. Open **Google AI Studio**: <https://aistudio.google.com/>
2. Sign in with your Google account (any free Gmail account works).
3. Click **"Get API Key"** in the left sidebar.
4. Click **"Create API key"**.
5. Select any Google Cloud project (or let it create one for you).
6. **Copy the generated API key** — it looks like: `AIzaSy...`
7. Open the LLM Bridge extension **Settings** page (click the ⚙ icon in the popup).
8. Make sure **Provider** is set to **"Google Gemini API (free)"**.
9. Paste your API key into the **"gemini api key"** field.
10. Click **"save settings"**.
11. Click **"test connection"** — you should see **"Gemini ready"**.

**That's it! No Ollama, no downloads, no terminal commands.**

> **Free tier limits:** ~15 requests/minute, ~1 million tokens/minute. More than enough for normal usage.

### Alternative: Chrome Built-in AI (Zero Setup)

If you don't want any API key at all:

1. Open LLM Bridge **Settings**.
2. Set **Provider** to **"Chrome Built-in AI (zero setup)"**.
3. Click **"save settings"**.
4. Click **"test connection"**.

**Requirements:**
- Chrome 138 or newer
- 16 GB RAM minimum
- 22 GB free disk space (model downloads on first use, ~1.7 GB)

### Alternative: Ollama (Local, Optional)

If you prefer fully local processing:

1. Install Ollama from <https://ollama.com>.
2. Pull a model:

```bash
ollama pull llama3.2
```

3. Start Ollama with extension origins enabled:

PowerShell:
```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve
```

macOS or Linux:
```bash
OLLAMA_ORIGINS=chrome-extension://* ollama serve
```

#### Configuring Ollama Environment Variables on Windows

To configure Ollama permanently on Windows (e.g., to store models on another drive and allow Chrome extension access):

- **`OLLAMA_MODELS`**: Set to `D:\OllamaModels` (or your preferred path) to change the model storage directory.
- **`OLLAMA_ORIGINS`**: Set to `chrome-extension://*` (or `*`) to authorize browser extensions.

**How to set them permanently:**
1. Open the Start Menu, search for **"Environment Variables"**, and select **Edit the system environment variables**.
2. Click the **Environment Variables...** button.
3. In the **User variables** section, click **New...** to add each variable:
   - **Variable name:** `OLLAMA_MODELS` | **Variable value:** `D:\OllamaModels`
   - **Variable name:** `OLLAMA_ORIGINS` | **Variable value:** `chrome-extension://*`
4. Click **OK** on all dialogs to save.
5. **Important:** Fully quit Ollama (from the Windows system tray) and restart it for the environment variables to take effect.

Alternatively, set them via PowerShell (User level):
```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "D:\OllamaModels", "User")
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*", "User")
```

4. Open LLM Bridge **Settings**.
5. Set **Provider** to **"Ollama (local)"**.
6. Confirm your Ollama URL and model name.
7. Click **"save settings"** → **"test connection"**.

Default Ollama settings:

```text
Ollama URL: http://127.0.0.1:11434
Model: llama3.2
Chunk size: 4000
Temperature: 0.2
```

## Architecture

```text
Supported chat tab
  |
  | manifest content script
  v
content.js
  | extractChat
  v
background.js
  | storage, chunking, AI provider (Gemini/Chrome/Ollama), memory, progress
  v
chrome.storage.local
  ^
  | getState / summarizeChats / extractChat
  |
popup.js
```

### File Map

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 config, permissions, content script registration, options page |
| `content.js` | DOM extraction from supported chat pages |
| `background.js` | Processing pipeline, multi-provider AI client, storage, progress state |
| `memory.js` | Persistent memory generation and retrieval API |
| `popup.html` / `popup.js` | UI-only popup |
| `options.html` / `options.js` | User-configurable provider, API key, and summarization settings |

## Usage

1. Open a supported chat page, such as `https://chatgpt.com/`.
2. Refresh the chat tab after installing or reloading the extension so the declarative content script is present.
3. Open LLM Bridge.
4. Click Import.
5. Click Summarize.
6. Keep using the browser while processing continues in the background.
7. Reopen the popup to see persisted progress and the latest summary.
8. Copy the summary or export it as TXT or Markdown.
9. Use the **Send to** buttons to open the summary in ChatGPT, Claude, or Grok.

## Supported Pages

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://www.perplexity.ai/*`
- `https://grok.com/*`

Extraction is most complete on ChatGPT. Other hosts are registered for future compatibility and may need selector tuning.

## Storage

LLM Bridge stores data in `chrome.storage.local`:

| Key | Contents |
| --- | --- |
| `extractedChats` | Last extracted role/content message array |
| `latestSummary` | Latest final summary |
| `savedSummaries` | Recent summary history |
| `projectMemory` | Generated persistent memory |
| `progressState` | Current or last processing state |
| `settings` | Options page configuration |

## Error Messages

The extension surfaces explicit errors instead of failing silently:

- `Ollama Offline` / `Gemini Offline` / `Chrome AI Unavailable`
- `Chat Extraction Failed`
- `No Chats Found`
- `Storage Error`
- `Timeout Error`
- `Summary Failure`

## Troubleshooting

### Gemini API errors

- **"Enter your Gemini API key"** → Open Settings, paste your API key, and save.
- **HTTP 400/403** → Your API key may be invalid. Generate a new one at <https://aistudio.google.com/>.
- **HTTP 429** → You hit the free tier rate limit. Wait a minute and try again.

### Chrome Built-in AI not available

- Make sure you're running Chrome 138+ on a desktop OS.
- Check that you have at least 16 GB RAM and 22 GB free disk space.
- The Gemini Nano model downloads on first use. Check `chrome://components` for "Optimization Guide On Device Model".

### Ollama Offline

Run:

```bash
ollama serve
```

Then open the extension options page and click Test Connection.

### 403 or CORS error from Ollama

Restart Ollama with:

```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve
```

Alternatively, configure the environment variables permanently on Windows:

- **`OLLAMA_ORIGINS`**: Set to `chrome-extension://*` (or `*` to allow all origins).
- **`OLLAMA_MODELS`**: Set to `D:\OllamaModels` (or your preferred path) if you want to store your models on a different drive.

To set these permanently, refer to the [Configuring Ollama Environment Variables on Windows](#configuring-ollama-environment-variables-on-windows) section above.

### Receiving end does not exist

The extension uses only declarative content script injection. If you installed or reloaded the extension while the chat tab was already open, refresh the chat tab once and try Import again.

### No Chats Found

Make sure the conversation is visible in the page, not hidden behind a modal, login wall, or unloaded virtualized region. Scroll through very long chats before importing if the site lazily renders older turns.

### Timeout Error

Use a smaller chunk size or a faster model in the options page. Large chats and slower CPU-only models can exceed the request timeout.

### Summary Failure

If using Ollama, check that the configured model exists:

```bash
ollama list
```

Pull it if needed:

```bash
ollama pull llama3.2
```

## Security Notes

- The extension connects only to the selected AI provider (Gemini API, Chrome on-device AI, or local Ollama).
- When using Gemini API free tier, your data may be used by Google to improve their products. Use Chrome Built-in AI or Ollama for full privacy.
- Extracted text is cleaned before storage and rendering.
- Popup output is written through textarea text values, not `innerHTML`.
- Message payloads and stored data are validated in the background service worker.
- Host permissions are limited to supported chat sites, the Gemini API endpoint, and local Ollama hosts.

## Development

Syntax check JavaScript files:

```bash
node --check background.js
node --check content.js
node --check memory.js
node --check popup.js
node --check options.js
```

After editing extension files:

1. Open `chrome://extensions/`.
2. Click Reload on LLM Bridge.
3. Refresh any already-open supported chat tabs.

## Notes On Large Chats

LLM Bridge is designed for long conversations by chunking progressively and persisting progress. Browser pages may still virtualize older messages, so the extractor can only read messages currently present in the DOM.


LLM Bridge is a Chrome Manifest V3 extension that extracts supported AI chat pages, summarizes long conversations through a local Ollama model, and stores reusable memory in `chrome.storage.local`.

Processing is local. The popup is only the control surface; extraction, chunking, Ollama calls, summary persistence, memory generation, and progress tracking run in the background service worker.

## Features

- Declarative MV3 content script injection only
- Resilient ChatGPT extraction with fallback selectors and hidden-element filtering
- Local summarization through Ollama
- Connection test, request timeout, and retry handling
- Smart paragraph and sentence-aware chunking
- Persistent extracted chats, summaries, memory, settings, and progress
- Popup state restore after refresh or close
- Copy, TXT export, and Markdown export
- Options page for Ollama URL, model, chunk size, temperature, and system prompt

## Architecture

```text
Supported chat tab
  |
  | manifest content script
  v
content.js
  | extractChat
  v
background.js
  | storage, chunking, Ollama, memory, progress
  v
chrome.storage.local
  ^
  | getState / summarizeChats / extractChat
  |
popup.js
```

### File Map

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 config, permissions, content script registration, options page |
| `content.js` | DOM extraction from supported chat pages |
| `background.js` | Processing pipeline, Ollama client, storage, progress state |
| `memory.js` | Persistent memory generation and retrieval API |
| `popup.html` / `popup.js` | UI-only popup |
| `options.html` / `options.js` | User-configurable Ollama and summarization settings |

## Installation

1. Install Chrome or another Chromium browser that supports Manifest V3 extensions.
2. Install Ollama from <https://ollama.com>.
3. Pull a model:

```bash
ollama pull llama3.2
```

4. Start Ollama with extension origins enabled.

PowerShell:

```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve
```

macOS or Linux:

```bash
OLLAMA_ORIGINS=chrome-extension://* ollama serve
```

#### Configuring Ollama Environment Variables on Windows

To configure Ollama permanently on Windows (e.g., to store models on another drive and allow Chrome extension access):

- **`OLLAMA_MODELS`**: Set to `D:\OllamaModels` (or your preferred path) to change the model storage directory.
- **`OLLAMA_ORIGINS`**: Set to `chrome-extension://*` (or `*`) to authorize browser extensions.

**How to set them permanently:**
1. Open the Start Menu, search for **"Environment Variables"**, and select **Edit the system environment variables**.
2. Click the **Environment Variables...** button.
3. In the **User variables** section, click **New...** to add each variable:
   - **Variable name:** `OLLAMA_MODELS` | **Variable value:** `D:\OllamaModels`
   - **Variable name:** `OLLAMA_ORIGINS` | **Variable value:** `chrome-extension://*`
4. Click **OK** on all dialogs to save.
5. **Important:** Fully quit Ollama (from the Windows system tray) and restart it for the environment variables to take effect.

Alternatively, set them via PowerShell (User level):
```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "D:\OllamaModels", "User")
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*", "User")
```

5. Open `chrome://extensions/`.
6. Enable Developer Mode.
7. Click Load unpacked.
8. Select this repository folder.
9. Open the extension options page and confirm your Ollama URL and model.

Default settings:

```text
Ollama URL: http://127.0.0.1:11434
Model: llama3.2
Chunk size: 4000
Temperature: 0.2
```

## Usage

1. Open a supported chat page, such as `https://chatgpt.com/`.
2. Refresh the chat tab after installing or reloading the extension so the declarative content script is present.
3. Open LLM Bridge.
4. Click Import.
5. Click Summarize.
6. Keep using the browser while processing continues in the background.
7. Reopen the popup to see persisted progress and the latest summary.
8. Copy the summary or export it as TXT or Markdown.

## Supported Pages

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://www.perplexity.ai/*`
- `https://grok.com/*`

Extraction is most complete on ChatGPT. Other hosts are registered for future compatibility and may need selector tuning.

## Storage

LLM Bridge stores data in `chrome.storage.local`:

| Key | Contents |
| --- | --- |
| `extractedChats` | Last extracted role/content message array |
| `latestSummary` | Latest final summary |
| `savedSummaries` | Recent summary history |
| `projectMemory` | Generated persistent memory |
| `progressState` | Current or last processing state |
| `settings` | Options page configuration |

## Error Messages

The extension surfaces explicit errors instead of failing silently:

- `Ollama Offline`
- `Chat Extraction Failed`
- `No Chats Found`
- `Storage Error`
- `Timeout Error`
- `Summary Failure`

## Troubleshooting

### Ollama Offline

Run:

```bash
ollama serve
```

Then open the extension options page and click Test Ollama.

### 403 or CORS error from Ollama

Restart Ollama with:

```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve
```

Alternatively, configure the environment variables permanently on Windows:

- **`OLLAMA_ORIGINS`**: Set to `chrome-extension://*` (or `*` to allow all origins).
- **`OLLAMA_MODELS`**: Set to `D:\OllamaModels` (or your preferred path) if you want to store your models on a different drive.

To set these permanently, refer to the [Configuring Ollama Environment Variables on Windows](#configuring-ollama-environment-variables-on-windows) section above.

### Receiving end does not exist

The extension uses only declarative content script injection. If you installed or reloaded the extension while the chat tab was already open, refresh the chat tab once and try Import again.

### No Chats Found

Make sure the conversation is visible in the page, not hidden behind a modal, login wall, or unloaded virtualized region. Scroll through very long chats before importing if the site lazily renders older turns.

### Timeout Error

Use a smaller chunk size or a faster model in the options page. Large chats and slower CPU-only models can exceed the request timeout.

### Summary Failure

Check that the configured model exists:

```bash
ollama list
```

Pull it if needed:

```bash
ollama pull llama3.2
```

## Security Notes

- The extension does not use remote AI APIs.
- Extracted text is cleaned before storage and rendering.
- Popup output is written through textarea text values, not `innerHTML`.
- Message payloads and stored data are validated in the background service worker.
- Host permissions are limited to supported chat sites plus local Ollama hosts.

## Development

Syntax check JavaScript files:

```bash
node --check background.js
node --check content.js
node --check memory.js
node --check popup.js
node --check options.js
```

After editing extension files:

1. Open `chrome://extensions/`.
2. Click Reload on LLM Bridge.
3. Refresh any already-open supported chat tabs.

## Notes On Large Chats

LLM Bridge is designed for long conversations by chunking progressively and persisting progress. Browser pages may still virtualize older messages, so the extractor can only read messages currently present in the DOM.
