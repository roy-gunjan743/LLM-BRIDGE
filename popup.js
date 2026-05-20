console.log("LLM Bridge Popup Loaded");

// ── DOM REFERENCES ──────────────────────────────────────────
const importBtn    = document.getElementById("importBtn");
const summarizeBtn = document.getElementById("summarizeBtn");
const summaryBox   = document.getElementById("summaryBox");
const copyBtn      = document.getElementById("copyBtn");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressLabel= document.getElementById("progressLabel");
const progressPct  = document.getElementById("progressPct");
const chunkDots    = document.getElementById("chunkDots");
const statsRow     = document.getElementById("statsRow");
const statMsgs     = document.getElementById("statMsgs");
const statChunks   = document.getElementById("statChunks");
const statChars    = document.getElementById("statChars");
const errorBar     = document.getElementById("errorBar");
const footerStatus = document.getElementById("footerStatus");
const ollamaDot    = document.getElementById("ollamaDot");
const ollamaLabel  = document.getElementById("ollamaLabel");

// ── STATE ────────────────────────────────────────────────────
let extractedChats = [];
let totalChunks    = 0;

// ── HELPERS ──────────────────────────────────────────────────
function setProgress(pct, label) {
    progressFill.style.width  = pct + "%";
    progressPct.textContent   = pct + "%";
    progressLabel.textContent = label;
}

function showError(msg) {
    errorBar.style.display    = "block";
    errorBar.textContent      = "⚠ " + msg;
    footerStatus.textContent  = "Error";
}

function clearError() {
    errorBar.style.display = "none";
    errorBar.textContent   = "";
}

function setFooter(msg) {
    footerStatus.textContent = msg;
}

function buildChunkDots(n) {
    chunkDots.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const d = document.createElement("div");
        d.className = "chunk-dot";
        d.id = "dot-" + i;
        chunkDots.appendChild(d);
    }
}

function tickDot(i, done) {
    const d = document.getElementById("dot-" + i);
    if (!d) return;
    if (done) {
        d.classList.remove("active");
        d.classList.add("done");
    } else {
        d.classList.add("active");
    }
}

// ── OLLAMA HEALTH CHECK ───────────────────────────────────────
async function checkOllama() {
    try {
        const res = await fetch("http://127.0.0.1:11434/api/tags", {
            method: "GET",
            signal: AbortSignal.timeout(2500)
        });
        if (res.ok) {
            ollamaDot.classList.remove("error");
            ollamaLabel.textContent = "Ollama running";
        } else {
            throw new Error("not ok");
        }
    } catch (_) {
        ollamaDot.classList.add("error");
        ollamaLabel.textContent = "Ollama offline";
    }
}

// ── SUMMARIZE VIA BACKGROUND ─────────────────────────────────
function sendToOllama(prompt) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { action: "summarize", prompt },
            (response) => resolve(response)
        );
    });
}

// ── CHUNK HELPER ─────────────────────────────────────────────
function chunkText(text, size) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.substring(i, i + size));
    }
    return chunks;
}

// ── MAIN SUMMARIZE PIPELINE ──────────────────────────────────
async function summarizeChat(chats) {
    clearError();

    const fullConversation = chats
        .map(c => `${c.role}: ${c.content}`)
        .join("\n\n");

    const chunks = chunkText(fullConversation, 4000);
    totalChunks  = chunks.length;

    // Show stats
    statMsgs.textContent   = chats.length;
    statChunks.textContent = chunks.length;
    statChars.textContent  = (fullConversation.length / 1000).toFixed(1) + "k";
    statsRow.style.display = "flex";

    // Build dots
    buildChunkDots(chunks.length);

    const partialSummaries = [];
    const perChunkPct = Math.floor(80 / chunks.length); // 80% budget for chunks

    for (let i = 0; i < chunks.length; i++) {
        const pct = 10 + (i * perChunkPct);
        setProgress(pct, `Summarizing chunk ${i + 1} of ${chunks.length}...`);
        tickDot(i, false);
        setFooter(`Chunk ${i + 1}/${chunks.length}`);

        const res = await sendToOllama(
            `Summarize this part of a conversation concisely.\n\n${chunks[i]}`
        );

        tickDot(i, true);

        if (res && res.success) {
            partialSummaries.push(res.summary);
        } else {
            partialSummaries.push("[chunk " + (i + 1) + " failed]");
        }
    }

    // Final merge
    setProgress(90, "Merging all summaries...");
    setFooter("Finalizing...");

    const finalRes = await sendToOllama(
        `Combine these partial summaries into ONE clean, well-structured final summary:\n\n${partialSummaries.join("\n\n")}`
    );

    setProgress(100, "Done ✓");
    setFooter("Summary ready");

    if (finalRes && finalRes.success) {
        return finalRes.summary;
    }
    return partialSummaries.join("\n\n---\n\n");
}

// ── IMPORT BUTTON ─────────────────────────────────────────────
importBtn.addEventListener("click", async () => {
    clearError();
    summaryBox.value = "";
    copyBtn.style.display = "none";
    extractedChats = [];
    statsRow.style.display = "none";
    chunkDots.innerHTML = "";
    summarizeBtn.disabled = true;

    importBtn.disabled = true;
    importBtn.classList.add("loading");
    progressWrap.style.display = "block";
    setProgress(5, "Querying active tab...");
    setFooter("Importing...");

    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        setProgress(15, "Injecting content script...");

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
        });

        setProgress(30, "Extracting messages from page...");

        chrome.tabs.sendMessage(
            tab.id,
            { action: "extractChat" },
            (response) => {
                importBtn.disabled = false;
                importBtn.classList.remove("loading");

                if (chrome.runtime.lastError) {
                    showError(chrome.runtime.lastError.message);
                    setProgress(0, "");
                    progressWrap.style.display = "none";
                    return;
                }

                if (!response || !response.success) {
                    showError(response?.error || "Failed to extract chat.");
                    setProgress(0, "");
                    progressWrap.style.display = "none";
                    return;
                }

                extractedChats = response.chats;

                setProgress(100, `Extracted ${extractedChats.length} messages ✓`);
                setFooter(`${extractedChats.length} messages ready`);

                statMsgs.textContent   = extractedChats.length;
                statChunks.textContent = Math.ceil(
                    extractedChats.map(c => c.role + ": " + c.content).join("\n\n").length / 4000
                );
                statChars.textContent  = (
                    extractedChats.map(c => c.content).join("").length / 1000
                ).toFixed(1) + "k";
                statsRow.style.display = "flex";

                summarizeBtn.disabled = false;
            }
        );

    } catch (err) {
        importBtn.disabled = false;
        importBtn.classList.remove("loading");
        showError(err.message);
        progressWrap.style.display = "none";
        console.error(err);
    }
});

// ── SUMMARIZE BUTTON ──────────────────────────────────────────
summarizeBtn.addEventListener("click", async () => {
    if (!extractedChats.length) {
        showError("No chat imported. Click Import chat first.");
        return;
    }

    clearError();
    summaryBox.value = "";
    copyBtn.style.display = "none";
    summarizeBtn.disabled = true;
    importBtn.disabled    = true;
    progressWrap.style.display = "block";
    setProgress(5, "Starting summarization pipeline...");
    setFooter("Summarizing...");

    try {
        const summary = await summarizeChat(extractedChats);
        summaryBox.value = summary;
        copyBtn.style.display = "flex";
        summarizeBtn.disabled = false;
        importBtn.disabled    = false;
    } catch (err) {
        showError(err.message);
        summarizeBtn.disabled = false;
        importBtn.disabled    = false;
        console.error(err);
    }
});

// ── COPY BUTTON ───────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
    const text = summaryBox.value;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add("copied");
        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Copied!`;
        setTimeout(() => {
            copyBtn.classList.remove("copied");
            copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy`;
        }, 2000);
    }).catch(() => {
        // Fallback for clipboard API unavailable
        summaryBox.select();
        document.execCommand("copy");
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
    });
});

// ── ON LOAD ───────────────────────────────────────────────────
checkOllama();
