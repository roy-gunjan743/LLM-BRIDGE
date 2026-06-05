/* recall.js — LLM Bridge Smart Recall */

(function () {
    "use strict";

    // ─── Block config ─────────────────────────────────────────────────────────

    const BLOCK_META = {
        GOALS:        { color: "#34d399", label: "Goal" },
        CURRENT_TASK: { color: "#6c7fff", label: "Task" },
        TECH_STACK:   { color: "#a78bfa", label: "Tech" },
        DECISIONS:    { color: "#fb923c", label: "Decision" },
        OPEN_ISSUES:  { color: "#f87171", label: "Issue" },
        NEXT_STEPS:   { color: "#22d3ee", label: "Next Step" },
        FACTS:        { color: "#8b9cc8", label: "Fact" }
    };

    const STOPWORDS = new Set([
        "a","an","the","is","are","was","were","be","been","being","have","has","had",
        "do","does","did","will","would","could","should","may","might","shall","can",
        "to","of","in","on","at","by","for","with","about","into","from","up","as",
        "and","or","but","if","then","so","yet","nor","not","no","i","my","me","we",
        "our","you","your","it","its","this","that","these","those","what","which",
        "who","how","when","where","why","show","tell","find","get","give","let","make"
    ]);

    // ─── State ────────────────────────────────────────────────────────────────

    let allSummaries = [];
    let aiMode = false;
    let isRunning = false;

    // ─── Boot ─────────────────────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const response = await sendMessage({ action: "getState" });
            if (response?.success) {
                allSummaries = Array.isArray(response.summaries) ? response.summaries : [];
            }
        } catch (err) {
            console.warn("Could not load summaries", err);
        }

        updateTopStat();
        bindUI();
    });

    // ─── UI bindings ──────────────────────────────────────────────────────────

    function bindUI() {
        const input    = document.getElementById("queryInput");
        const recallBtn = document.getElementById("recallBtn");
        const aiBtn    = document.getElementById("aiBtn");

        recallBtn.addEventListener("click", runRecall);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") runRecall(); });

        aiBtn.addEventListener("click", () => {
            aiMode = !aiMode;
            aiBtn.classList.toggle("active", aiMode);
        });

        document.querySelectorAll(".example-pill").forEach((pill) => {
            pill.addEventListener("click", () => {
                input.value = pill.textContent;
                input.focus();
            });
        });
    }

    // ─── Core recall ──────────────────────────────────────────────────────────

    async function runRecall() {
        const query = document.getElementById("queryInput").value.trim();
        if (!query || isRunning) return;

        if (!allSummaries.length) {
            showPlaceholder("No sessions yet", "Import and summarize chats first to build your memory.");
            return;
        }

        isRunning = true;
        setLoading(true);
        clearResults();

        try {
            // 1. Score all memory items against the query
            const keywords = extractKeywords(query);
            const scored = scoreAllItems(keywords);

            if (!scored.length) {
                showPlaceholder("No matches found", `Try different keywords for "${escHtml(query)}".`);
                return;
            }

            // 2. Render scored results
            renderResults(scored, keywords);

            // 3. If AI mode is on, synthesize an answer
            if (aiMode) {
                await runAISynthesis(query, scored.slice(0, 10));
            }
        } finally {
            isRunning = false;
            setLoading(false);
        }
    }

    // ─── Scoring engine ───────────────────────────────────────────────────────

    function extractKeywords(query) {
        return query.toLowerCase()
            .replace(/[^\w\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    }

    function scoreAllItems(keywords) {
        const results = [];

        for (const session of allSummaries) {
            const parsed = parseMemoryBlock(session.summary);
            if (!parsed) continue;

            const sessionDate = formatShortDate(session.createdAt);
            const memId = parsed.MEMORY_ID || session.id;

            for (const [blockKey, meta] of Object.entries(BLOCK_META)) {
                const items = toStringArray(parsed[blockKey]);
                for (const item of items) {
                    const score = scoreItem(item, keywords);
                    if (score > 0) {
                        results.push({ item, score, blockKey, meta, sessionDate, memId, sessionId: session.id });
                    }
                }
            }
        }

        // Sort by score descending, deduplicate near-identical items
        results.sort((a, b) => b.score - a.score);
        return dedupeResults(results).slice(0, 30);
    }

    function scoreItem(text, keywords) {
        if (!keywords.length) return 0;
        const lower = text.toLowerCase();
        let matchCount = 0;
        let exactPhrase = false;

        for (const kw of keywords) {
            if (lower.includes(kw)) matchCount++;
        }

        // Bonus for exact multi-word phrase match
        if (keywords.length > 1) {
            const phrase = keywords.join(" ");
            if (lower.includes(phrase)) exactPhrase = true;
        }

        if (!matchCount) return 0;
        const base = matchCount / keywords.length;
        return exactPhrase ? Math.min(1, base + 0.3) : base;
    }

    function dedupeResults(results) {
        const seen = new Set();
        return results.filter((r) => {
            const key = r.item.toLowerCase().slice(0, 80);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // ─── Render results ───────────────────────────────────────────────────────

    function renderResults(scored, keywords) {
        const listEl = document.getElementById("resultsList");
        document.getElementById("placeholder").style.display = "none";

        let html = `<div class="results-header">${scored.length} result${scored.length !== 1 ? "s" : ""} found</div>`;

        for (const r of scored) {
            const highlighted = highlightKeywords(r.item, keywords);
            const pct = Math.round(r.score * 100);
            html += `
              <div class="result-card">
                <div class="result-top">
                  <div class="result-type-dot" style="background:${r.meta.color}"></div>
                  <div class="result-type-label">${r.meta.label}</div>
                  <div class="result-score-bar">
                    <div class="score-track"><div class="score-fill" style="width:${pct}%"></div></div>
                    <div class="score-label">${pct}%</div>
                  </div>
                </div>
                <div class="result-text">${highlighted}</div>
                <div class="result-session">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:3px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  ${escHtml(r.sessionDate)} · ${escHtml(r.blockKey.replace(/_/g, " ").toLowerCase())}
                </div>
              </div>`;
        }

        listEl.innerHTML = html;
    }

    function highlightKeywords(text, keywords) {
        if (!keywords.length) return escHtml(text);
        const escaped = escHtml(text);
        let result = escaped;
        for (const kw of keywords) {
            const re = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
            result = result.replace(re, "<mark>$1</mark>");
        }
        return result;
    }

    // ─── AI synthesis ─────────────────────────────────────────────────────────

    async function runAISynthesis(query, topResults) {
        const answerBox = document.getElementById("aiAnswerBox");
        const answerText = document.getElementById("aiAnswerText");

        answerBox.style.display = "block";
        answerText.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><div class="spinner"></div><span style="color:var(--muted2);font-family:'JetBrains Mono',monospace;font-size:12px">synthesizing answer…</span></div>`;

        const contextLines = topResults.map((r) => `[${r.meta.label}] ${r.item}`).join("\n");

        const prompt = [
            "You are a memory recall assistant. The user is asking about their past project notes.",
            "Answer the question directly and concisely using ONLY the provided memory excerpts.",
            "Format your answer as 2-4 bullet points. Be specific. Do not add information not in the excerpts.",
            "If the excerpts don't contain enough information, say so briefly.",
            "",
            `User question: "${query}"`,
            "",
            "Relevant memory excerpts:",
            contextLines,
            "",
            "Answer:"
        ].join("\n");

        try {
            const response = await sendMessage({ action: "smartRecall", prompt });
            if (response?.success && response.answer) {
                // Format the answer: convert bullet lines to HTML
                const lines = response.answer.split("\n").map((l) => l.trim()).filter(Boolean);
                const formatted = lines.map((line) => {
                    const clean = line.replace(/^[-•*]\s*/, "");
                    return `<div style="display:flex;gap:8px;margin-bottom:8px"><span style="color:var(--accent);flex:0 0 auto;margin-top:2px">▸</span><span>${escHtml(clean)}</span></div>`;
                }).join("");
                answerText.innerHTML = formatted;
            } else {
                answerText.innerHTML = `<span style="color:var(--muted2);font-family:'JetBrains Mono',monospace;font-size:12px">${escHtml(response?.error || "AI unavailable. Using keyword results above.")}</span>`;
            }
        } catch (err) {
            answerText.innerHTML = `<span style="color:var(--muted2);font-family:'JetBrains Mono',monospace;font-size:12px">AI synthesis failed: ${escHtml(err.message)}</span>`;
        }
    }

    // ─── UI helpers ───────────────────────────────────────────────────────────

    function clearResults() {
        document.getElementById("resultsList").innerHTML = "";
        document.getElementById("aiAnswerBox").style.display = "none";
        document.getElementById("placeholder").style.display = "none";
    }

    function showPlaceholder(title, sub) {
        const el = document.getElementById("placeholder");
        el.style.display = "flex";
        el.querySelector(".ph-title").textContent = title;
        el.querySelector(".ph-sub").textContent = sub;
    }

    function setLoading(on) {
        document.getElementById("recallBtn").disabled = on;
        document.getElementById("aiBtn").disabled = on;
        if (on) {
            document.getElementById("resultsList").innerHTML =
                `<div id="placeholder" style="display:flex;flex-direction:column;align-items:center;padding:60px 0;gap:16px"><div class="spinner"></div><div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted2)">searching memories…</div></div>`;
        }
    }

    function updateTopStat() {
        const el = document.getElementById("topStat");
        if (!allSummaries.length) { el.textContent = "no sessions"; return; }
        const total = allSummaries.reduce((n, s) => n + countItems(s.summary), 0);
        el.innerHTML = `searching across <strong>${allSummaries.length}</strong> sessions · <strong>${total}</strong> memory items`;
    }

    function countItems(summaryStr) {
        const p = parseMemoryBlock(summaryStr);
        if (!p) return 0;
        return Object.keys(BLOCK_META).reduce((n, k) => n + toStringArray(p[k]).length, 0);
    }

    // ─── Shared helpers ───────────────────────────────────────────────────────

    function parseMemoryBlock(raw) {
        if (!raw) return null;
        const text = String(raw).replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
        try { return JSON.parse(text); } catch (_) { return null; }
    }

    function toStringArray(value) {
        if (Array.isArray(value)) return value.map((v) => String(v||"").trim()).filter(Boolean);
        if (typeof value === "string" && value.trim()) return [value.trim()];
        return [];
    }

    function formatShortDate(iso) {
        if (!iso) return "";
        try {
            const d = new Date(iso);
            const now = new Date();
            const diff = Math.floor((now - d) / 86400000);
            if (diff === 0) return "Today";
            if (diff === 1) return "Yesterday";
            return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
        } catch (_) { return ""; }
    }

    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                    resolve(response);
                });
            } catch (err) { reject(err); }
        });
    }

    function escHtml(str) {
        return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

})();
