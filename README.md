# LLM Bridge

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
