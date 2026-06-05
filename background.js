importScripts("memory.js");
importScripts("graph_engine.js");

MemoryEngine.initialize().catch((error) => {
    console.warn("Memory initialization failed", error);
});

const DEFAULT_SETTINGS = {
    provider: "gemini",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    ollamaUrl: "http://127.0.0.1:11434",
    model: "llama3.2",
    chunkSize: 4000,
    temperature: 0.2,
    systemPrompt:
        "Create an extremely detailed and comprehensive high-density structured memory block for long-term retrieval from the imported chat. Return only valid minified JSON with these exact keys: MEMORY_ID, FACTS, GOALS, CURRENT_TASK, TECH_STACK, DECISIONS, OPEN_ISSUES, NEXT_STEPS. Use arrays of descriptive strings for every key except MEMORY_ID. Capture all facts, detailed concepts, definitions, questions, solutions, and technical details discussed in the chat, ensuring no important details are omitted. Generate as many items as needed in each array to represent the full depth of the conversation. Do not inject facts about LLM Bridge, Chrome extensions, or project files unless the imported chat is actually about them. Exclude generic chat commands, greetings, explanations of the schema, and prompts that only ask the assistant what to do. Do not return plain paragraphs, markdown, code fences, or invented details."
};

const MEMORY_BLOCK_KEYS = [
    "MEMORY_ID",
    "FACTS",
    "GOALS",
    "CURRENT_TASK",
    "TECH_STACK",
    "DECISIONS",
    "OPEN_ISSUES",
    "NEXT_STEPS"
];

const PROJECT_BASELINE_MEMORY = {
    FACTS: [
        "LLM Bridge is a Chrome Extension project for importing chat conversations, summarizing them locally with Ollama, and preserving reusable memory.",
        "Project files include manifest.json, background.js, content.js, popup.html, popup.js, options.html, options.js, memory.js, README.md, and .vscode settings.",
        "manifest.json defines the Manifest V3 extension metadata, permissions, host permissions, background service worker, popup, options page, and content script matches.",
        "background.js is the service worker that coordinates extraction, settings, storage, Ollama calls, chunking, summarization, progress, and memory generation.",
        "content.js runs on supported chat sites and extracts visible conversation messages from the page DOM.",
        "popup.html and popup.js implement the extension popup UI for Import, Summarize, Copy, TXT/Markdown export, progress, stats, and Ollama status.",
        "options.html and options.js implement the settings page for Ollama URL, model, chunk size, temperature, system prompt, and connection testing.",
        "memory.js implements the MemoryEngine for loading, saving, and generating persistent project memory."
    ],
    GOALS: [
        "Generate compact structured memory that can be reused as context in future LLM chats.",
        "Make copied memory useful in another chat without requiring the user to explain the project again.",
        "Keep the memory JSON compact, deterministic, appendable, and optimized for retrieval."
    ],
    TECH_STACK: [
        "Chrome extension",
        "Manifest V3",
        "JavaScript",
        "HTML/CSS",
        "Chrome storage API",
        "Chrome tabs API",
        "Chrome scripting API",
        "Ollama",
        "ChatGPT"
    ]
};

const STORAGE_KEYS = {
    chats: "extractedChats",
    summary: "latestSummary",
    summaries: "savedSummaries",
    memory: "projectMemory",
    graph: "memoryGraph",
    progress: "progressState",
    settings: "settings",
    importMeta: "importMeta"
};

const ERROR_MESSAGES = {
    OLLAMA_OFFLINE: "Ollama Offline",
    EXTRACTION_FAILED: "Chat Extraction Failed",
    NO_CHATS: "No Chats Found",
    STORAGE: "Storage Error",
    TIMEOUT: "Timeout Error",
    SUMMARY: "Summary Failure"
};

let activeJob = null;

chrome.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings();
    await setStorage({ [STORAGE_KEYS.settings]: settings });
    await ensureProgress("idle", "Ready", 0);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender)
        .then(sendResponse)
        .catch((error) => {
            sendResponse(fail("SUMMARY", error.message));
        });
    return true;
});

async function handleMessage(request) {
    if (!isPlainObject(request) || typeof request.action !== "string") {
        return fail("SUMMARY", "Invalid request.");
    }

    switch (request.action) {
        case "getState":
            return getState();
        case "extractChat":
            return extractActiveChat();
        case "summarizeChats":
            return startSummaryJob();
        case "testOllama":
            return testConnection();
        case "getSettings":
            return { success: true, settings: await getSettings() };
        case "saveSettings":
            return saveSettings(request.settings);
        case "getMemory":
            return { success: true, memory: await MemoryEngine.getMemory() };
        case "getGraph":
            return { success: true, graph: await GraphEngine.getGraph() };
        case "searchGraph": {
            const graph = await GraphEngine.getGraph();
            return { success: true, graph: GraphEngine.searchGraph(graph, request.query || "") };
        }
        case "clearGraph":
            await GraphEngine.clearGraph();
            return { success: true };
        case "clearError":
            await updateProgress({ error: "" });
            return { success: true };
        case "smartRecall": {
            if (typeof request.prompt !== "string" || !request.prompt.trim()) {
                return fail("SUMMARY", "No prompt provided.");
            }
            try {
                const settings = await getSettings();
                const answer = await generateText(request.prompt.trim(), settings);
                return { success: true, answer: cleanText(answer) };
            } catch (err) {
                return fail("SUMMARY", err.message);
            }
        }
        case "sendToChat":
            return startSendToChatJob(request.target, request.text);
        default:
            return fail("SUMMARY", "Unknown action.");
    }
}

async function getState() {
    const data = await getStorage([
        STORAGE_KEYS.chats,
        STORAGE_KEYS.summary,
        STORAGE_KEYS.summaries,
        STORAGE_KEYS.memory,
        STORAGE_KEYS.graph,
        STORAGE_KEYS.progress,
        STORAGE_KEYS.settings,
        STORAGE_KEYS.importMeta
    ]);

    const rawGraph = data[STORAGE_KEYS.graph];
    const graph = rawGraph && typeof rawGraph === "object"
        ? rawGraph
        : { nodes: [], edges: [], updatedAt: 0 };

    return {
        success: true,
        chats: validateChats(data[STORAGE_KEYS.chats]),
        summary: typeof data[STORAGE_KEYS.summary] === "string" ? data[STORAGE_KEYS.summary] : "",
        summaries: Array.isArray(data[STORAGE_KEYS.summaries]) ? data[STORAGE_KEYS.summaries] : [],
        memory: typeof data[STORAGE_KEYS.memory] === "string" ? data[STORAGE_KEYS.memory] : "",
        graph,
        progress: normalizeProgress(data[STORAGE_KEYS.progress]),
        settings: await getSettings(),
        importMeta: normalizeImportMeta(data[STORAGE_KEYS.importMeta])
    };
}

async function extractActiveChat() {
    try {
        await ensureProgress("extracting", "Reading active tab", 5);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab?.id || !isSupportedChatUrl(tab.url || "")) {
            await ensureProgress("error", ERROR_MESSAGES.EXTRACTION_FAILED, 0, "Open a supported chat page first.");
            return fail("EXTRACTION_FAILED", "Open a supported chat page first.");
        }

        const response = await sendTabMessageWithInjection(tab.id, { action: "extractChat" });
        if (!response?.success) {
            throw new Error(response?.error || "Could not read messages from the page.");
        }

        const chats = validateChats(response.chats);
        if (!chats.length) {
            await ensureProgress("error", ERROR_MESSAGES.NO_CHATS, 0, "No visible chat messages were found.");
            return fail("NO_CHATS", "No visible chat messages were found.");
        }

        const text = formatConversation(chats);
        const settings = await getSettings();
        const chunks = chunkText(text, settings.chunkSize);

        await setStorage({
            [STORAGE_KEYS.chats]: chats,
            [STORAGE_KEYS.summary]: "",
            [STORAGE_KEYS.memory]: "",
            [STORAGE_KEYS.importMeta]: buildImportMeta(tab, chats),
            [STORAGE_KEYS.progress]: normalizeProgress({
                status: "extracted",
                label: `Extracted ${chats.length} messages`,
                percent: 100,
                totalChunks: chunks.length,
                completedChunks: 0,
                error: "",
                updatedAt: Date.now()
            })
        });

        return { success: true, chats, stats: buildStats(chats, chunks, text) };
    } catch (error) {
        const detail = normalizeExtractionError(error);
        await ensureProgress("error", ERROR_MESSAGES.EXTRACTION_FAILED, 0, detail);
        return fail("EXTRACTION_FAILED", detail);
    }
}

async function startSummaryJob() {
    if (activeJob) {
        return fail("SUMMARY", "A summary is already running.");
    }

    activeJob = runSummaryJob().finally(() => {
        activeJob = null;
    });

    return { success: true, message: "Summary started." };
}

async function runSummaryJob() {
    try {
        const chats = await getChatsForSummary();
        if (chats === null) {
            return;
        }

        if (!chats.length) {
            await ensureProgress("error", ERROR_MESSAGES.NO_CHATS, 0, "Import a chat before summarizing.");
            return;
        }

        const settings = await getSettings();
        const fullText = formatConversation(chats);
        const chunks = chunkText(fullText, settings.chunkSize);

        if (!chunks.length) {
            await ensureProgress("error", ERROR_MESSAGES.NO_CHATS, 0, "The imported chat is empty.");
            return;
        }

        await ensureProgress("summarizing", "Testing Ollama connection", 3, "", chunks.length, 0);
        await callOllama("/api/tags", { method: "GET" }, settings, 6000, 1);

        let finalSummaryRaw = "";

        if (chunks.length === 1) {
            await ensureProgress("summarizing", "Summarizing chat", 30, "", 1, 0);

            const prompt = [
                settings.systemPrompt,
                "",
                "Summarize this conversation as a structured memory block.",
                "Return only valid JSON using the required memory keys.",
                "",
                "Conversation:",
                chunks[0]
            ].join("\n");

            finalSummaryRaw = await generateText(prompt, settings);

            await ensureProgress("summarizing", "Finalizing summary", 80, "", 1, 1);
        } else {
            const partials = [];
            for (let index = 0; index < chunks.length; index += 1) {
                const percent = Math.max(5, Math.round((index / chunks.length) * 80));
                await ensureProgress(
                    "summarizing",
                    `Summarizing chunk ${index + 1} of ${chunks.length}`,
                    percent,
                    "",
                    chunks.length,
                    index
                );

                const prompt = [
                    settings.systemPrompt,
                    "",
                    "Summarize this chunk as a partial memory block.",
                    "Return only valid JSON using the required memory keys.",
                    "",
                    `Chunk ${index + 1} of ${chunks.length}:`,
                    chunks[index]
                ].join("\n");

                const result = await generateText(prompt, settings);
                partials.push(cleanText(result));

                await ensureProgress(
                    "summarizing",
                    `Completed chunk ${index + 1} of ${chunks.length}`,
                    Math.round(((index + 1) / chunks.length) * 80),
                    "",
                    chunks.length,
                    index + 1
                );
            }

            await ensureProgress("summarizing", "Merging summary", 90, "", chunks.length, chunks.length);
            const finalPrompt = [
                settings.systemPrompt,
                "",
                "Combine these partial memory blocks into one highly detailed and comprehensive final memory block.",
                "The result must be extremely detailed, high-density, JSON-serializable, appendable to a memory database, and reusable as context in future LLM prompts.",
                "Return only valid JSON using the exact required keys.",
                `Use MEMORY_ID "${buildMemoryId(chats)}".`,
                "Deduplicate repeated facts. Preserve all unique facts, definitions, technical details, goals, and decisions from all partial blocks. Do not summarize them away.",
                "Do not include lines that merely ask for a list, ask to continue, ask what something means, or describe the memory schema.",
                "",
                partials.join("\n\n---\n\n")
            ].join("\n");

            finalSummaryRaw = await generateWithOllama(finalPrompt, settings);
        }

        const summary = normalizeSummaryBlock(
            finalSummaryRaw,
            buildMemoryId(chats),
            chats
        );
        const memory = await MemoryEngine.generateMemory(chats, summary, {
            generate: (prompt) => generateText(prompt, settings)
        });

        // Build and merge memory graph
        try {
            const subgraph = GraphEngine.buildFromMemory(memory);
            await GraphEngine.mergeAndSave(subgraph);
        } catch (graphError) {
            console.warn("Graph build failed (non-fatal)", graphError);
        }

        const savedSummary = {
            id: String(Date.now()),
            createdAt: new Date().toISOString(),
            model: settings.model,
            summary,
            messageCount: chats.length,
            chunkCount: chunks.length
        };

        const existing = await getStorage([STORAGE_KEYS.summaries]);
        const summaries = Array.isArray(existing[STORAGE_KEYS.summaries])
            ? existing[STORAGE_KEYS.summaries]
            : [];

        await setStorage({
            [STORAGE_KEYS.summary]: summary,
            [STORAGE_KEYS.summaries]: [savedSummary, ...summaries].slice(0, 20),
            [STORAGE_KEYS.memory]: memory,
            [STORAGE_KEYS.progress]: normalizeProgress({
                status: "complete",
                label: "Summary ready",
                percent: 100,
                totalChunks: chunks.length,
                completedChunks: chunks.length,
                error: "",
                updatedAt: Date.now()
            })
        });
    } catch (error) {
        const code = error.name === "AbortError" ? "TIMEOUT" : "SUMMARY";
        const message = error.message || ERROR_MESSAGES[code];
        await ensureProgress("error", ERROR_MESSAGES[code], 0, message);
    }
}

async function testConnection() {
    try {
        const settings = await getSettings();
        if (settings.provider === "gemini") {
            if (!settings.geminiApiKey) {
                return fail("OLLAMA_OFFLINE", "Enter your Gemini API key in Settings.");
            }
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${settings.geminiApiKey}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);
            return { success: true, message: "Gemini ready" };
        } else if (settings.provider === "chrome") {
            if (typeof self.Summarizer === "undefined") {
                return fail("OLLAMA_OFFLINE", "Chrome Built-in AI is not available. Use Chrome 138+ with 16GB RAM.");
            }
            return { success: true, message: "Chrome AI ready" };
        } else {
            await callOllama("/api/tags", { method: "GET" }, settings, 4000, 1);
            return { success: true, message: "Ollama running" };
        }
    } catch (error) {
        return fail(error.name === "AbortError" ? "TIMEOUT" : "OLLAMA_OFFLINE", "Check your provider settings.");
    }
}

async function generateWithOllama(prompt, settings) {
    const response = await callOllama(
        "/api/generate",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: settings.model,
                prompt,
                format: "json",
                stream: false,
                options: { temperature: settings.temperature }
            })
        },
        settings,
        90000,
        2
    );

    const data = await response.json();
    if (!data?.response) {
        throw new Error("Ollama returned an empty response.");
    }
    return data.response;
}

async function generateWithGemini(prompt, settings) {
    if (!settings.geminiApiKey) {
        throw new Error("Gemini API key is not set. Open Settings and enter your key.");
    }
    const model = settings.geminiModel || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    let lastError;
    for (let attempt = 0; attempt <= 2; attempt++) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: settings.temperature
                    }
                })
            });
            clearTimeout(timeout);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData?.error?.message || `Gemini returned HTTP ${response.status}`);
            }
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("Gemini returned an empty response.");
            return text;
        } catch (error) {
            clearTimeout(timeout);
            lastError = error;
            if (attempt < 2) await delay(600 * (attempt + 1));
        }
    }
    throw lastError;
}

async function generateWithChromeAI(prompt) {
    if (typeof self.Summarizer === "undefined") {
        throw new Error("Chrome Built-in AI is not available in this browser. Use Chrome 138+ with sufficient hardware.");
    }
    const summarizer = await Summarizer.create({
        type: "key-points",
        format: "plain-text",
        length: "long"
    });
    const result = await summarizer.summarize(prompt);
    if (!result) throw new Error("Chrome AI returned an empty response.");
    return result;
}

async function generateText(prompt, settings) {
    if (settings.provider === "gemini") {
        return generateWithGemini(prompt, settings);
    } else if (settings.provider === "chrome") {
        return generateWithChromeAI(prompt);
    } else {
        return generateWithOllama(prompt, settings);
    }
}

async function callOllama(path, options, settings, timeoutMs, retries) {
    const baseUrl = settings.ollamaUrl.replace(/\/+$/, "");
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(baseUrl + path, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`Ollama returned HTTP ${response.status}.`);
            }
            return response;
        } catch (error) {
            clearTimeout(timeout);
            lastError = error;
            if (attempt < retries) {
                await delay(600 * (attempt + 1));
            }
        }
    }

    if (lastError?.name === "AbortError") {
        throw lastError;
    }
    throw new Error("Ollama appears to be offline.");
}

function chunkText(text, tokenLimit) {
    const maxChars = Math.max(1200, Math.floor(Number(tokenLimit || 4000)));
    const paragraphs = cleanText(text).split(/\n{2,}/).filter(Boolean);
    const chunks = [];
    let current = "";

    for (const paragraph of paragraphs) {
        const pieces = splitSentences(paragraph);
        for (const piece of pieces) {
            if (!piece) continue;
            if (piece.length > maxChars) {
                if (current) {
                    chunks.push(current.trim());
                    current = "";
                }
                chunks.push(...splitLongText(piece, maxChars));
                continue;
            }
            const next = current ? `${current}\n\n${piece}` : piece;
            if (next.length > maxChars && current) {
                chunks.push(current.trim());
                current = piece;
            } else {
                current = next;
            }
        }
    }

    if (current.trim()) {
        chunks.push(current.trim());
    }
    return chunks;
}

function splitSentences(paragraph) {
    return paragraph
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

function splitLongText(text, maxChars) {
    const words = text.split(/\s+/);
    const chunks = [];
    let current = "";

    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars && current) {
            chunks.push(current.trim());
            current = word;
        } else {
            current = next;
        }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

function formatConversation(chats) {
    return validateChats(chats)
        .map((chat) => `${chat.role}: ${chat.content}`)
        .join("\n\n");
}

function validateChats(chats) {
    if (!Array.isArray(chats)) return [];
    return chats
        .map((chat) => ({
            role: normalizeRole(chat?.role),
            content: cleanText(chat?.content || "")
        }))
        .filter((chat) => chat.content.length > 0);
}

function normalizeRole(role) {
    const value = String(role || "unknown").toLowerCase();
    if (["user", "assistant", "system", "tool"].includes(value)) return value;
    if (value.includes("human")) return "user";
    if (value.includes("ai") || value.includes("bot")) return "assistant";
    return "unknown";
}

function cleanText(value) {
    return String(value || "")
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function buildStats(chats, chunks, text) {
    return {
        messageCount: chats.length,
        chunkCount: chunks.length,
        charCount: text.length
    };
}

function buildMemoryId(chats) {
    const text = formatConversation(chats);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `mem_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getValueCaseInsensitive(obj, key) {
    if (!isPlainObject(obj)) return undefined;
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const k of Object.keys(obj)) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanKey) {
            return obj[k];
        }
    }
    return undefined;
}

function normalizeMemoryBlock(value, memoryId) {
    const parsed = parseJsonObject(value);
    let source = isPlainObject(parsed) ? parsed : null;
    if (!source && Array.isArray(parsed) && parsed.length > 0 && isPlainObject(parsed[0])) {
        source = parsed[0];
    }
    if (!source) {
        source = { FACTS: [cleanText(value)] };
    }

    const block = {};
    for (const key of MEMORY_BLOCK_KEYS) {
        const val = getValueCaseInsensitive(source, key);
        if (key === "MEMORY_ID") {
            block[key] = typeof val === "string" && val.trim()
                ? cleanText(val)
                : memoryId;
            continue;
        }

        block[key] = normalizeStringArray(val);
    }

    return JSON.stringify(block, null, 2);
}

function normalizeSummaryBlock(value, memoryId, chats) {
    const normalized = JSON.parse(normalizeMemoryBlock(value, memoryId));
    const enriched = enrichMemoryBlock(normalized, chats);
    if (!isEmptyMemoryBlock(enriched)) {
        return JSON.stringify(enriched, null, 2);
    }

    return JSON.stringify(enrichMemoryBlock(buildFallbackMemoryBlock(memoryId, chats), chats), null, 2);
}

function enrichMemoryBlock(block, chats) {
    if (!isLlmBridgeChat(chats)) {
        return block;
    }

    return {
        ...block,
        FACTS: mergeMemoryItems(PROJECT_BASELINE_MEMORY.FACTS, block.FACTS, 100),
        GOALS: mergeMemoryItems(block.GOALS, PROJECT_BASELINE_MEMORY.GOALS, 100),
        TECH_STACK: mergeMemoryItems(block.TECH_STACK, PROJECT_BASELINE_MEMORY.TECH_STACK, 100)
    };
}

function isLlmBridgeChat(chats) {
    const text = formatConversation(chats).toLowerCase();
    return text.includes("llm bridge") || text.includes("llm-bridge");
}

function mergeMemoryItems(primary, secondary, limit) {
    const seen = new Set();
    const result = [];
    const values = [...normalizeStringArray(primary), ...normalizeStringArray(secondary)];

    for (const value of values) {
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(value);
        if (result.length >= limit) break;
    }

    return result;
}

function isEmptyMemoryBlock(block) {
    return MEMORY_BLOCK_KEYS
        .filter((key) => key !== "MEMORY_ID")
        .every((key) => !Array.isArray(block[key]) || block[key].length === 0);
}

function buildFallbackMemoryBlock(memoryId, chats) {
    const lines = validateChats(chats)
        .map((chat) => cleanText(chat.content))
        .filter(Boolean);
    const allText = lines.join("\n");

    return {
        MEMORY_ID: memoryId,
        FACTS: pickLines(lines, /(?:is|are|uses|using|has|have|shows|contains|created|updated|changed|fixed|added|removed|error|failed|working|running)/i, 8),
        GOALS: pickLines(lines, /(?:want|need|goal|should|must|make|build|create|convert|optimi[sz]e)/i, 6),
        CURRENT_TASK: pickLines(lines, /(?:currently|fix|debug|not working|stuck|showing|generating|summary|memory)/i, 4),
        TECH_STACK: detectTechStack(allText),
        DECISIONS: pickLines(lines, /(?:decided|decision|use|use only|do not|don't|must|schema|json|memory block)/i, 6),
        OPEN_ISSUES: pickLines(lines, /(?:not working|failed|error|stuck|empty|no memory|issue|bug|problem|404|offline|timeout)/i, 6),
        NEXT_STEPS: pickLines(lines, /(?:next|reload|try|test|verify|check|open|click|run|fix)/i, 6)
    };
}

function pickLines(lines, pattern, limit) {
    const seen = new Set();
    const results = [];

    for (const line of lines) {
        const sentence = firstUsefulSentence(line);
        const key = sentence.toLowerCase();
        if (!sentence || seen.has(key) || !pattern.test(sentence)) continue;
        seen.add(key);
        results.push(sentence.slice(0, 220));
        if (results.length >= limit) break;
    }

    return results;
}

function firstUsefulSentence(text) {
    return cleanText(text)
        .split(/(?<=[.!?])\s+|\n+/)
        .map((sentence) => sentence.trim())
        .find((sentence) => sentence.length >= 8 && sentence.length <= 500 && !isLowValueMemoryLine(sentence)) || "";
}

function isLowValueMemoryLine(text) {
    return /^(continue|ok|okay|thanks|thank you|what is this|explain|give me|list|here is|use this prompt|when generating summaries)/i.test(text);
}

function detectTechStack(text) {
    const tech = [];
    const checks = [
        ["Chrome extension", /chrome\.runtime|manifest\.json|content script|service_worker|popup/i],
        ["Manifest V3", /manifest_version["']?\s*:\s*3|manifest v3/i],
        ["JavaScript", /\bjavascript\b|\.js\b|background\.js|popup\.js|content\.js|memory\.js/i],
        ["HTML/CSS", /\bhtml\b|\bcss\b|popup\.html|options\.html/i],
        ["Ollama", /\bollama\b|\/api\/generate|\/api\/tags/i],
        ["ChatGPT", /\bchatgpt\b|chat\.openai\.com|chatgpt\.com/i]
    ];

    for (const [label, pattern] of checks) {
        if (pattern.test(text)) tech.push(label);
    }

    return tech;
}

function parseJsonObject(value) {
    const text = cleanText(value)
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();

    const cleanJson = text.replace(/,\s*([\]}])/g, '$1');

    try {
        return JSON.parse(cleanJson);
    } catch (_) {
        const start = cleanJson.indexOf("{");
        const end = cleanJson.lastIndexOf("}");
        if (start < 0 || end <= start) return null;

        try {
            return JSON.parse(cleanJson.slice(start, end + 1));
        } catch (__) {
            return null;
        }
    }
}

function normalizeStringArray(value) {
    const result = [];
    const seen = new Set();

    function collectStrings(val) {
        if (typeof val === 'string') {
            const text = cleanText(val).slice(0, 500);
            const key = text.toLowerCase();
            if (text && !seen.has(key)) {
                seen.add(key);
                result.push(text);
            }
        } else if (Array.isArray(val)) {
            for (const item of val) {
                collectStrings(item);
            }
        } else if (val !== null && typeof val === 'object') {
            for (const k of Object.keys(val)) {
                collectStrings(val[k]);
            }
        }
    }

    collectStrings(value);
    return result.slice(0, 100);
}

async function getChatsForSummary() {
    const data = await getStorage([STORAGE_KEYS.chats, STORAGE_KEYS.importMeta]);
    const storedChats = validateChats(data[STORAGE_KEYS.chats]);

    const tab = await getActiveTab();
    if (!tab?.id || !isSupportedChatUrl(tab.url || "")) {
        return storedChats;
    }

    const response = await extractActiveChat();
    if (response?.success) {
        return response.chats;
    }

    return storedChats;
}

async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return Array.isArray(tabs) && tabs.length ? tabs[0] : null;
}

function buildImportMeta(tab, chats) {
    return normalizeImportMeta({
        url: normalizeChatUrl(tab?.url || ""),
        title: cleanText(tab?.title || "").slice(0, 160),
        importedAt: Date.now(),
        messageCount: Array.isArray(chats) ? chats.length : 0
    });
}

function normalizeImportMeta(value) {
    const source = isPlainObject(value) ? value : {};
    return {
        url: typeof source.url === "string" ? source.url : "",
        title: typeof source.title === "string" ? source.title : "",
        importedAt: Number(source.importedAt) || 0,
        messageCount: clampInt(source.messageCount, 0, 1000000, 0)
    };
}

function normalizeChatUrl(url) {
    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        return `${parsed.origin}${pathname}`;
    } catch (_) {
        return "";
    }
}

function isSupportedChatUrl(url) {
    return /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|www\.perplexity\.ai|grok\.com)\//.test(url);
}

async function sendTabMessageWithInjection(tabId, message) {
    try {
        return await sendTabMessage(tabId, message);
    } catch (error) {
        if (!isMissingContentScriptError(error)) {
            throw error;
        }

        await injectContentScript(tabId);
        await delay(120);
        return sendTabMessage(tabId, message);
    }
}

function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || "Could not contact the page."));
                return;
            }
            resolve(response);
        });
    });
}

function injectContentScript(tabId) {
    return chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
    });
}

function isMissingContentScriptError(error) {
    const message = String(error?.message || "");
    return (
        message.includes("Receiving end does not exist") ||
        message.includes("Could not establish connection")
    );
}

function normalizeExtractionError(error) {
    const message = String(error?.message || "");
    if (isMissingContentScriptError(error)) {
        return "Could not attach to the chat page. Refresh the chat tab once, then click Import again.";
    }
    return message || "Could not extract messages from this page.";
}

async function getSettings() {
    const data = await getStorage([STORAGE_KEYS.settings]);
    return normalizeSettings(data[STORAGE_KEYS.settings]);
}

async function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    await setStorage({ [STORAGE_KEYS.settings]: normalized });
    return { success: true, settings: normalized };
}

function normalizeSettings(settings) {
    const source = isPlainObject(settings) ? settings : {};
    let systemPrompt = typeof source.systemPrompt === "string" && source.systemPrompt.trim()
        ? cleanText(source.systemPrompt).slice(0, 4000)
        : DEFAULT_SETTINGS.systemPrompt;

    if (!systemPrompt.includes("extremely detailed and comprehensive")) {
        systemPrompt = DEFAULT_SETTINGS.systemPrompt;
    }

    const provider = ["gemini", "chrome", "ollama"].includes(source.provider)
        ? source.provider
        : DEFAULT_SETTINGS.provider;

    return {
        provider,
        geminiApiKey: typeof source.geminiApiKey === "string" ? source.geminiApiKey.trim() : DEFAULT_SETTINGS.geminiApiKey,
        geminiModel: typeof source.geminiModel === "string" && source.geminiModel.trim()
            ? source.geminiModel.trim()
            : DEFAULT_SETTINGS.geminiModel,
        ollamaUrl: typeof source.ollamaUrl === "string" && source.ollamaUrl.trim()
            ? source.ollamaUrl.trim()
            : DEFAULT_SETTINGS.ollamaUrl,
        model: typeof source.model === "string" && source.model.trim()
            ? source.model.trim()
            : DEFAULT_SETTINGS.model,
        chunkSize: clampInt(source.chunkSize, 1200, 20000, DEFAULT_SETTINGS.chunkSize),
        temperature: clampNumber(source.temperature, 0, 2, DEFAULT_SETTINGS.temperature),
        systemPrompt
    };
}

function normalizeProgress(progress) {
    const source = isPlainObject(progress) ? progress : {};
    const normalized = {
        status: typeof source.status === "string" ? source.status : "idle",
        label: typeof source.label === "string" ? source.label : "Ready",
        percent: clampInt(source.percent, 0, 100, 0),
        totalChunks: clampInt(source.totalChunks, 0, 100000, 0),
        completedChunks: clampInt(source.completedChunks, 0, 100000, 0),
        error: typeof source.error === "string" ? source.error : "",
        updatedAt: Number(source.updatedAt) || Date.now()
    };

    if (normalized.status === "extracting" && Date.now() - normalized.updatedAt > 45000) {
        return {
            ...normalized,
            status: "error",
            label: ERROR_MESSAGES.EXTRACTION_FAILED,
            percent: 0,
            error: "Import timed out. Reload the extension and try again on a loaded chat page.",
            updatedAt: Date.now()
        };
    }

    return normalized;
}

async function ensureProgress(status, label, percent, error = "", totalChunks = 0, completedChunks = 0) {
    await setStorage({
        [STORAGE_KEYS.progress]: normalizeProgress({
            status,
            label,
            percent,
            totalChunks,
            completedChunks,
            error,
            updatedAt: Date.now()
        })
    });
}

async function updateProgress(partial) {
    const data = await getStorage([STORAGE_KEYS.progress]);
    await setStorage({ [STORAGE_KEYS.progress]: normalizeProgress({ ...data[STORAGE_KEYS.progress], ...partial }) });
}

function getStorage(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || ERROR_MESSAGES.STORAGE));
                return;
            }
            resolve(result || {});
        });
    });
}

function setStorage(values) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || ERROR_MESSAGES.STORAGE));
                return;
            }
            resolve(true);
        });
    });
}

function fail(code, detail) {
    return {
        success: false,
        code,
        error: ERROR_MESSAGES[code] || ERROR_MESSAGES.SUMMARY,
        detail: detail || ""
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clampInt(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const pendingInjections = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && pendingInjections.has(tabId)) {
        const { text, target } = pendingInjections.get(tabId);
        pendingInjections.delete(tabId);

        chrome.scripting.executeScript({
            target: { tabId },
            func: injectTextIntoChat,
            args: [text, target]
        }).catch(err => {
            console.error("Injection failed", err);
        });
    }
});

async function startSendToChatJob(target, text) {
    let url = "";
    if (target === "chatgpt") {
        url = "https://chatgpt.com/";
    } else if (target === "claude") {
        url = "https://claude.ai/new";
    } else if (target === "grok") {
        url = "https://grok.com/";
    } else {
        return { success: false, error: "Invalid target." };
    }

    try {
        const tab = await chrome.tabs.create({ url });
        pendingInjections.set(tab.id, { text, target });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message || "Failed to create tab." };
    }
}

function injectTextIntoChat(text, target) {
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (attempts > 50) {
            clearInterval(interval);
            return;
        }

        let inputElement = null;

        if (target === "chatgpt") {
            inputElement = document.getElementById("prompt-textarea") || document.querySelector("textarea[placeholder*='ChatGPT']");
        } else if (target === "claude") {
            inputElement = document.querySelector("div[contenteditable='true']") || document.querySelector(".ProseMirror");
        } else if (target === "grok") {
            inputElement = document.querySelector("textarea") || document.querySelector("div[contenteditable='true']");
        }

        if (!inputElement) {
            inputElement = document.querySelector("textarea, [contenteditable='true']");
        }

        if (inputElement) {
            clearInterval(interval);
            inputElement.focus();
            try {
                inputElement.scrollIntoView?.({ block: "center" });
                const success = document.execCommand("insertText", false, text);
                if (!success) {
                    throw new Error("execCommand failed");
                }
            } catch (e) {
                if (inputElement.tagName === "TEXTAREA" || inputElement.tagName === "INPUT") {
                    inputElement.value = text;
                } else {
                    inputElement.innerText = text;
                }
                inputElement.dispatchEvent(new Event("input", { bubbles: true }));
                inputElement.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    }, 200);
}
