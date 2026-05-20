# 🌉 LLM Bridge

> **Transfer, summarize, and compress AI conversations between different LLMs.**

LLM Bridge is a Chrome extension that extracts entire ChatGPT conversations, summarizes them using local AI models with Ollama, and prepares them to be sent into another AI system.

![License](https://img.shields.io/badge/license-MIT-purple) ![Platform](https://img.shields.io/badge/platform-Chrome-blue) ![Model](https://img.shields.io/badge/model-Llama%203.2-green) ![Local](https://img.shields.io/badge/processing-100%25%20local-orange)

---

## 🧠 What Is LLM Bridge?

Large conversations are difficult to move between AI systems because of token limits. LLM Bridge solves this by compressing your full conversation into a transferable memory block using a local LLM — no cloud, no API keys, no data leaks.

```
Long Chat
   ↓
Extract Messages
   ↓
Chunk Conversation
   ↓
AI Summarization (Llama 3.2 via Ollama)
   ↓
Compressed Context
   ↓
Send To Another AI
```

This allows one AI conversation to continue inside another AI model without losing important context.

---

## ✨ Features

- ✅ Extract full ChatGPT conversations
- ✅ Summarize huge chats automatically
- ✅ Compress context for another AI
- ✅ Local AI processing with Ollama
- ✅ Supports long conversations (unlimited length)
- ✅ Chunk-based summarization (4000 chars/chunk)
- ✅ One-click copy / export
- ✅ Fast and lightweight

---

## 🔥 Example Use Cases

### AI Migration
Move a ChatGPT conversation into Claude, Gemini, DeepSeek, Grok, or any local LLM — without losing context.

### Context Compression
Compress 100k+ token conversations into compact, meaningful summaries that fit any model's context window.

### AI Memory System
Store summarized conversations for long-term AI memory across sessions and platforms.

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Extension API (Manifest V3) |
| Frontend | JavaScript, HTML, CSS |
| AI Backend | Ollama + Llama 3.2 |
| Inference | `http://127.0.0.1:11434/api/generate` |

---

## 📂 Project Structure

```
LLM-Bridge/
│
├── manifest.json       # Extension config & permissions
├── popup.html          # Extension popup UI
├── popup.js            # Chunking & summarization logic
├── content.js          # Conversation extraction from DOM
├── background.js       # Service worker / Ollama bridge
├── style.css           # Popup styles
└── icons/              # Extension icons
```

---

## 🚀 Installation

### Step 1 — Install Ollama

Download from the [Ollama Official Website](https://ollama.com) and install it on your machine.

### Step 2 — Pull Llama 3.2

```bash
ollama pull llama3.2
```

### Step 3 — Start Ollama

```bash
ollama serve
```

Expected output:

```
Listening on 127.0.0.1:11434
```

### Step 4 — Fix Cross-Origin Permissions

To allow the Chrome extension to communicate with your local Ollama server, set this environment variable before starting Ollama:

```bash
# macOS / Linux
OLLAMA_ORIGINS=chrome-extension://* ollama serve

# Windows (PowerShell)
$env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve
```

### Step 5 — Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/LLM-Bridge.git
```

Or download the ZIP directly from GitHub.

### Step 6 — Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `LLM-Bridge` project folder

The LLM Bridge icon will appear in your Chrome toolbar.

---

## ▶️ Usage

1. Open any ChatGPT conversation in Chrome
2. Click the **LLM Bridge** extension icon
3. Press **Import Conversation**
4. The extension will:
   - Extract the entire conversation from the page
   - Split it into 4000-character chunks
   - Send each chunk to Ollama for summarization
   - Combine all chunk summaries into one final memory block
5. Copy the compressed context and paste it into Claude, Gemini, or any other AI

---

## 🧩 How It Works

### 1. Conversation Extraction
`content.js` injects into the active tab and collects all visible conversation messages from the DOM.

### 2. Smart Chunking
Large conversations are split into manageable pieces:

```js
// popup.js
const CHUNK_SIZE = 4000; // characters per chunk
const chunks = chunkText(fullConversation, CHUNK_SIZE);
```

### 3. AI Summarization
Each chunk is sent to the local Ollama API:

```
POST http://127.0.0.1:11434/api/generate
Model: llama3.2
```

### 4. Final Compression
All chunk summaries are merged into one transferable AI memory block — ready to be injected into any new AI conversation.

---

## ❗ Troubleshooting

**Error: `Empty response from Ollama`**

Make sure Ollama is running:
```bash
ollama serve
```

---

**Error: `403 Forbidden`**

Check that `host_permissions` in `manifest.json` includes:
```json
"host_permissions": ["http://127.0.0.1:11434/*"]
```

Also ensure the `OLLAMA_ORIGINS` environment variable is set (see Step 4 above).

---

**Extension not working / no output**

- Reload the extension at `chrome://extensions/`
- Refresh the ChatGPT tab
- Try again

---

## 🔐 Permissions

```json
"permissions": [
  "tabs",
  "activeTab",
  "scripting",
  "storage"
],
"host_permissions": [
  "http://127.0.0.1:11434/*"
]
```

---

## 🛣️ Roadmap

- [ ] Multi-AI export (Claude, Gemini, DeepSeek, Grok)
- [ ] PDF export
- [ ] Markdown export
- [ ] Cloud sync
- [ ] AI memory database
- [ ] Auto conversation detection
- [ ] Streaming summaries
- [ ] Multi-model summarization pipeline

---

## 👨‍💻 Developer

**Gunjan Roy**

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

## ⭐ Support

If LLM Bridge helps you, please consider:

- ⭐ **Star** the repository
- 🍴 **Fork** it and build on top
- 🐛 **Open issues** for bugs or feature requests

Every star helps others discover the project. Thank you!
