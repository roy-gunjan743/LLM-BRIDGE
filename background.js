importScripts("memory.js");

MemoryEngine.initialize().catch((error) => {
    console.warn("Memory initialization failed", error);
});

const DEFAULT_SETTINGS = {
    ollamaUrl: "http://127.0.0.1:11434",
    model: "llama3.2",
    chunkSize: 4000,
    temperature: 0.2,
    systemPrompt:
        "Create a concise, high-signal transferable memory summary. Preserve decisions, requirements, bugs, technical details, next actions, and user preferences."
};

const STORAGE_KEYS = {
    chats: "extractedChats",
    summary: "latestSummary",
    summaries: "savedSummaries",
    memory: "projectMemory",
    progress: "progressState",
    settings: "settings"
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
            return testOllamaConnection();
        case "getSettings":
            return { success: true, settings: await getSettings() };
        case "saveSettings":
            return saveSettings(request.settings);
        case "getMemory":
            return { success: true, memory: await MemoryEngine.getMemory() };
        case "clearError":
            await updateProgress({ error: "" });
            return { success: true };
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
        STORAGE_KEYS.progress,
        STORAGE_KEYS.settings
    ]);

    return {
        success: true,
        chats: validateChats(data[STORAGE_KEYS.chats]),
        summary: typeof data[STORAGE_KEYS.summary] === "string" ? data[STORAGE_KEYS.summary] : "",
        summaries: Array.isArray(data[STORAGE_KEYS.summaries]) ? data[STORAGE_KEYS.summaries] : [],
        memory: typeof data[STORAGE_KEYS.memory] === "string" ? data[STORAGE_KEYS.memory] : "",
        progress: normalizeProgress(data[STORAGE_KEYS.progress]),
        settings: await getSettings()
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

        const response = await sendTabMessage(tab.id, { action: "extractChat" });
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
        await ensureProgress("error", ERROR_MESSAGES.EXTRACTION_FAILED, 0, error.message);
        return fail("EXTRACTION_FAILED", error.message);
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
        const data = await getStorage([STORAGE_KEYS.chats]);
        const chats = validateChats(data[STORAGE_KEYS.chats]);

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
                `Chunk ${index + 1} of ${chunks.length}:`,
                chunks[index]
            ].join("\n");

            const result = await generateWithOllama(prompt, settings);
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
            "Combine these partial summaries into one clean markdown memory block.",
            "Keep it practical and avoid invented details.",
            "",
            partials.join("\n\n---\n\n")
        ].join("\n");

        const summary = cleanText(await generateWithOllama(finalPrompt, settings));
        const memory = await MemoryEngine.generateMemory(chats, summary, {
            generate: (prompt) => generateWithOllama(prompt, settings)
        });

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

async function testOllamaConnection() {
    try {
        const settings = await getSettings();
        await callOllama("/api/tags", { method: "GET" }, settings, 4000, 1);
        return { success: true, message: "Ollama running" };
    } catch (error) {
        return fail(error.name === "AbortError" ? "TIMEOUT" : "OLLAMA_OFFLINE", "Start Ollama and check your URL.");
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

function isSupportedChatUrl(url) {
    return /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|www\.perplexity\.ai)\//.test(url);
}

function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(response);
        });
    });
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
    return {
        ollamaUrl: typeof source.ollamaUrl === "string" && source.ollamaUrl.trim()
            ? source.ollamaUrl.trim()
            : DEFAULT_SETTINGS.ollamaUrl,
        model: typeof source.model === "string" && source.model.trim()
            ? source.model.trim()
            : DEFAULT_SETTINGS.model,
        chunkSize: clampInt(source.chunkSize, 1200, 20000, DEFAULT_SETTINGS.chunkSize),
        temperature: clampNumber(source.temperature, 0, 2, DEFAULT_SETTINGS.temperature),
        systemPrompt: typeof source.systemPrompt === "string" && source.systemPrompt.trim()
            ? cleanText(source.systemPrompt).slice(0, 4000)
            : DEFAULT_SETTINGS.systemPrompt
    };
}

function normalizeProgress(progress) {
    const source = isPlainObject(progress) ? progress : {};
    return {
        status: typeof source.status === "string" ? source.status : "idle",
        label: typeof source.label === "string" ? source.label : "Ready",
        percent: clampInt(source.percent, 0, 100, 0),
        totalChunks: clampInt(source.totalChunks, 0, 100000, 0),
        completedChunks: clampInt(source.completedChunks, 0, 100000, 0),
        error: typeof source.error === "string" ? source.error : "",
        updatedAt: Number(source.updatedAt) || Date.now()
    };
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
