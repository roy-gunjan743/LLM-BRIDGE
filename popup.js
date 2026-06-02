const importBtn = document.getElementById("importBtn");
const summarizeBtn = document.getElementById("summarizeBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadTxtBtn = document.getElementById("downloadTxtBtn");
const downloadMdBtn = document.getElementById("downloadMdBtn");
const sendChatgptBtn = document.getElementById("sendChatgptBtn");
const sendClaudeBtn = document.getElementById("sendClaudeBtn");
const sendGrokBtn = document.getElementById("sendGrokBtn");
const optionsBtn = document.getElementById("optionsBtn");
const summaryBox = document.getElementById("summaryBox");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const progressPct = document.getElementById("progressPct");
const chunkDots = document.getElementById("chunkDots");
const statsRow = document.getElementById("statsRow");
const statMsgs = document.getElementById("statMsgs");
const statChunks = document.getElementById("statChunks");
const statChars = document.getElementById("statChars");
const errorBar = document.getElementById("errorBar");
const successBar = document.getElementById("successBar");
const footerStatus = document.getElementById("footerStatus");
const ollamaDot = document.getElementById("ollamaDot");
const ollamaLabel = document.getElementById("ollamaLabel");
const modelLabel = document.getElementById("modelLabel");

let state = {
    chats: [],
    summary: "",
    progress: { status: "idle", percent: 0, label: "Ready", totalChunks: 0, completedChunks: 0 },
    settings: {}
};

let pollTimer = null;

document.addEventListener("DOMContentLoaded", init);
importBtn.addEventListener("click", importChat);
summarizeBtn.addEventListener("click", summarizeChat);
copyBtn.addEventListener("click", copySummary);
downloadTxtBtn.addEventListener("click", () => downloadSummary("txt"));
downloadMdBtn.addEventListener("click", () => downloadSummary("md"));
sendChatgptBtn.addEventListener("click", () => sendToChat("chatgpt"));
sendClaudeBtn.addEventListener("click", () => sendToChat("claude"));
sendGrokBtn.addEventListener("click", () => sendToChat("grok"));
optionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

async function init() {
    await refreshState();
    checkOllama();
    pollTimer = setInterval(refreshState, 1000);
}

async function importChat() {
    if (isBusy()) return;
    clearBanners();
    setBusy(true, "Importing...");

    try {
        const response = await sendMessage({ action: "extractChat" }, 15000);
        if (!response?.success) {
            showError(response);
        } else {
            showSuccess(`Imported ${response.chats.length} messages.`);
        }

        await refreshState();
    } finally {
        setBusy(false);
    }
}

async function summarizeChat() {
    if (isBusy()) return;
    clearBanners();
    setBusy(true, "Starting summary...");

    try {
        const response = await sendMessage({ action: "summarizeChats" }, 15000);
        if (!response?.success) {
            showError(response);
            return;
        }

        showSuccess("Summary started. You can close this popup; progress will continue.");
        await refreshState();
    } finally {
        setBusy(false);
    }
}

async function refreshState() {
    const response = await sendMessage({ action: "getState" }, 8000);
    if (!response?.success) {
        showError(response);
        return;
    }

    state = response;
    renderState();
}

async function checkOllama() {
    ollamaLabel.textContent = "checking...";
    const response = await sendMessage({ action: "testOllama" }, 10000);
    ollamaDot.classList.toggle("error", !response?.success);
    ollamaLabel.textContent = response?.success
        ? (response.message || "connected")
        : (response?.detail || "offline");
}

function renderState() {
    const progress = state.progress || {};
    const chats = Array.isArray(state.chats) ? state.chats : [];
    const summary = typeof state.summary === "string" ? state.summary : "";
    const settings = state.settings || {};

    summaryBox.value = summary;
    const providerNames = { gemini: "Gemini", chrome: "Chrome AI", ollama: settings.model || "Ollama" };
    const providerTag = providerNames[settings.provider] || "v2.1";
    modelLabel.textContent = `v2.1 | ${providerTag}`;

    const chars = chats.reduce((total, chat) => total + (chat.content || "").length, 0);
    const totalChunks = progress.totalChunks || estimateChunks(chars, settings.chunkSize);

    statMsgs.textContent = chats.length || "-";
    statChunks.textContent = totalChunks || "-";
    statChars.textContent = chars ? `${(chars / 1000).toFixed(1)}k` : "-";
    statsRow.style.display = chats.length || summary ? "flex" : "none";

    progressWrap.style.display = progress.status && progress.status !== "idle" ? "block" : "none";
    setProgress(progress.percent || 0, progress.label || "Ready");
    renderDots(progress.totalChunks || 0, progress.completedChunks || 0);

    if (progress.error) {
        showError({ error: progress.label || "Summary Failure", detail: progress.error });
    }

    const busy = ["extracting", "summarizing"].includes(progress.status);
    setBusy(busy, progress.label);
    summarizeBtn.disabled = busy;
    copyBtn.disabled = !summary;
    downloadTxtBtn.disabled = !summary;
    downloadMdBtn.disabled = !summary;
    sendChatgptBtn.disabled = !summary || busy;
    sendClaudeBtn.disabled = !summary || busy;
    sendGrokBtn.disabled = !summary || busy;
    footerStatus.textContent = progress.label || "Ready";

    if (progress.status === "complete" && summary) {
        showSuccess("Summary ready.");
    }
}

function setProgress(percent, label) {
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    progressFill.style.width = `${safePercent}%`;
    progressPct.textContent = `${safePercent}%`;
    progressLabel.textContent = label || "Ready";
}

function renderDots(total, completed) {
    chunkDots.innerHTML = "";
    const visibleTotal = Math.min(total, 80);
    for (let index = 0; index < visibleTotal; index += 1) {
        const dot = document.createElement("span");
        dot.className = "chunk-dot";
        if (index < completed) dot.classList.add("done");
        if (index === completed && completed < total) dot.classList.add("active");
        chunkDots.appendChild(dot);
    }
}

function setBusy(busy, label = "") {
    importBtn.disabled = busy;
    summarizeBtn.disabled = busy;
    importBtn.classList.toggle("loading", busy);
    summarizeBtn.classList.toggle("loading", busy);
    if (label) footerStatus.textContent = label;
}

function isBusy() {
    return ["extracting", "summarizing"].includes(state.progress?.status);
}

async function copySummary() {
    if (!state.summary) return;
    const promptMemory = buildPromptMemory(state.summary);
    try {
        await navigator.clipboard.writeText(promptMemory);
        showSuccess("Prompt-ready memory copied.");
    } catch (_) {
        summaryBox.select();
        document.execCommand("copy");
        showSuccess("Summary copied.");
    }
}

async function sendToChat(target) {
    if (!state.summary) return;
    const promptMemory = buildPromptMemory(state.summary);
    clearBanners();
    setBusy(true, `Opening ${target === "chatgpt" ? "ChatGPT" : target === "claude" ? "Claude" : "Grok"}...`);
    try {
        const response = await sendMessage({ action: "sendToChat", target, text: promptMemory });
        if (!response?.success) {
            showError(response);
        } else {
            showSuccess("Successfully opened tab!");
        }
    } finally {
        setBusy(false);
    }
}

function downloadSummary(format) {
    if (!state.summary) return;
    const date = new Date().toISOString().slice(0, 10);
    const markdown = [
        "# LLM Bridge Summary",
        "",
        state.summary,
        "",
        "## Memory",
        "",
        state.memory || ""
    ].join("\n");
    const content = format === "md" ? markdown : state.summary;
    const type = format === "md" ? "text/markdown" : "text/plain";
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `llm-bridge-summary-${date}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function buildPromptMemory(summary) {
    return [
        "Use the following structured memory as silent context for this conversation.",
        "Do not explain the memory object unless I ask.",
        "Use it to answer directly when my question can be answered from the memory.",
        "For project questions, use remembered file names, roles, tech stack, goals, decisions, open issues, and next steps.",
        "Do not ask me to provide files or a project tree when the memory already contains the answer.",
        "If the memory conflicts with my latest message, follow my latest message.",
        "",
        "STRUCTURED_MEMORY_JSON:",
        summary
    ].join("\n");
}

function showError(response) {
    const title = response?.error || "Summary Failure";
    const detail = response?.detail ? `: ${response.detail}` : "";
    errorBar.textContent = `${title}${detail}`;
    errorBar.style.display = "block";
    successBar.style.display = "none";
}

function showSuccess(message) {
    successBar.textContent = message;
    successBar.style.display = "block";
    errorBar.style.display = "none";
}

function clearBanners() {
    errorBar.style.display = "none";
    successBar.style.display = "none";
    errorBar.textContent = "";
    successBar.textContent = "";
}

function sendMessage(message, timeoutMs = 12000) {
    return new Promise((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({
                success: false,
                error: "Extension Not Responding",
                detail: "Reload the extension from chrome://extensions, then try again."
            });
        }, timeoutMs);

        chrome.runtime.sendMessage(message, (response) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);

            if (chrome.runtime.lastError) {
                resolve({
                    success: false,
                    error: "Summary Failure",
                    detail: chrome.runtime.lastError.message
                });
                return;
            }
            resolve(response);
        });
    });
}

function estimateChunks(chars, chunkSize) {
    if (!chars) return 0;
    return Math.max(1, Math.ceil(chars / (Number(chunkSize) || 4000)));
}

window.addEventListener("unload", () => {
    if (pollTimer) clearInterval(pollTimer);
});
