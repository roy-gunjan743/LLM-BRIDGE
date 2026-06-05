/* agent.js — LLM Bridge AI Agent */

(function () {
    "use strict";

    // ─── Config ───────────────────────────────────────────────────────────────

    const STOPWORDS = new Set([
        "a","an","the","is","are","was","were","be","been","being","have","has","had",
        "do","does","did","will","would","could","should","may","might","can","i","my",
        "me","we","our","you","your","it","its","this","that","these","those","and","or",
        "but","if","then","so","yet","nor","not","no","to","of","in","on","at","by",
        "for","with","about","into","from","up","as","use","using","used","make","need",
        "want","new","also","like","just","more","than","all","any","only","even","such",
        "when","where","how","what","which","who","create","build","add","get","set",
        "return","true","false","null","json","key","value","object","array","string"
    ]);

    const REC_COLORS = [
        { border: "#6c7fff", priority: "#6c7fff33", priorityText: "#7b8fff", label: "HIGH PRIORITY" },
        { border: "#34d399", priority: "#34d39933", priorityText: "#34d399", label: "SUGGESTED" },
        { border: "#fb923c", priority: "#fb923c33", priorityText: "#fb923c", label: "CONSIDER" }
    ];

    // ─── State ────────────────────────────────────────────────────────────────

    let allSummaries = [];
    let isRunning = false;

    // ─── Boot ─────────────────────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const resp = await sendMessage({ action: "getState" });
            if (resp?.success) {
                allSummaries = Array.isArray(resp.summaries) ? resp.summaries : [];
            }
        } catch (err) {
            console.warn("Could not load summaries", err);
        }

        updateTopStat();
        document.getElementById("runBtn").addEventListener("click", runAnalysis);
    });

    // ─── Analysis pipeline ────────────────────────────────────────────────────

    async function runAnalysis() {
        if (isRunning || !allSummaries.length) return;
        isRunning = true;

        document.getElementById("idleState").style.display = "none";
        document.getElementById("resultsSection").style.display = "none";
        document.getElementById("progressSection").style.display = "block";
        document.getElementById("runBtn").disabled = true;

        try {
            // Step 1: Mine recurring topics
            setProgress(10, "Mining recurring concepts…", "Step 1 of 4 · Analysing term frequencies");
            const topics = mineTopics();
            await pause(300);

            // Step 2: Render topics immediately (no LLM needed)
            setProgress(30, "Ranking topics…", "Step 2 of 4 · Sorting by frequency");
            renderTopics(topics);
            await pause(200);

            // Step 3: Generate digest via LLM
            setProgress(50, "Generating memory digest…", "Step 3 of 4 · Calling AI");
            const digest = await generateDigest(topics);
            renderDigest(digest);

            // Step 4: Generate recommendations via LLM
            setProgress(80, "Building recommendations…", "Step 4 of 4 · Analysing patterns");
            const recs = await generateRecommendations(topics);
            renderRecommendations(recs, topics);

            setProgress(100, "Analysis complete", `Found ${topics.length} recurring concepts`);
            await pause(600);

            document.getElementById("progressSection").style.display = "none";
            document.getElementById("resultsSection").style.display = "block";

        } catch (err) {
            setProgress(0, `Analysis failed: ${err.message}`, "Check your AI provider settings");
        } finally {
            isRunning = false;
            document.getElementById("runBtn").disabled = false;
        }
    }

    // ─── Topic mining (pure JS, no LLM) ──────────────────────────────────────

    function mineTopics() {
        const termFreq = new Map();     // term → total count
        const termSessions = new Map(); // term → Set of session IDs

        for (const session of allSummaries) {
            const parsed = parseMemoryBlock(session.summary);
            if (!parsed) continue;

            const text = extractAllText(parsed);
            const terms = tokenize(text);
            const sessionTerms = new Set();

            for (const term of terms) {
                termFreq.set(term, (termFreq.get(term) || 0) + 1);
                sessionTerms.add(term);
            }

            for (const term of sessionTerms) {
                if (!termSessions.has(term)) termSessions.set(term, new Set());
                termSessions.get(term).add(session.id);
            }
        }

        // Build topic objects, filter min frequency
        const minFreq = Math.max(2, Math.floor(allSummaries.length * 0.5));
        const topics = [];

        for (const [term, count] of termFreq.entries()) {
            if (count < minFreq) continue;
            const sessions = termSessions.get(term)?.size || 0;
            topics.push({ term, count, sessions, label: titleCase(term.replace(/_/g, " ")) });
        }

        // Sort: sessions appearing in most sessions first, then by raw count
        topics.sort((a, b) => b.sessions - a.sessions || b.count - a.count);
        return topics.slice(0, 25);
    }

    function extractAllText(parsed) {
        const keys = ["GOALS","CURRENT_TASK","TECH_STACK","DECISIONS","OPEN_ISSUES","NEXT_STEPS","FACTS"];
        return keys.flatMap((k) => toStringArray(parsed[k])).join(" ");
    }

    function tokenize(text) {
        // Extract meaningful 1-2 word phrases
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

        const result = [...words];

        // Bigrams
        for (let i = 0; i < words.length - 1; i++) {
            const bigram = `${words[i]}_${words[i+1]}`;
            result.push(bigram);
        }

        return result;
    }

    // ─── LLM digest ───────────────────────────────────────────────────────────

    async function generateDigest(topics) {
        const topTopics = topics.slice(0, 10).map((t) => `"${t.label}" (×${t.count})`).join(", ");
        const recentSessions = allSummaries.slice(0, 5);
        const recentContext = recentSessions.map((s) => {
            const p = parseMemoryBlock(s.summary);
            if (!p) return "";
            const goals = toStringArray(p.GOALS).slice(0, 2).join("; ");
            const tasks = toStringArray(p.CURRENT_TASK).slice(0, 2).join("; ");
            return [goals, tasks].filter(Boolean).join(" | ");
        }).filter(Boolean).join("\n");

        const prompt = [
            "You are an AI agent summarizing a developer's memory history.",
            "Based on their top recurring concepts and recent session summaries, write a concise weekly digest.",
            "Format as 4-6 bullet points. Be specific and insightful. Mention actual project names and technologies.",
            "End with one forward-looking observation about where the work is heading.",
            "",
            `Top recurring concepts across ${allSummaries.length} sessions: ${topTopics}`,
            "",
            "Recent session context:",
            recentContext || "(no recent context)",
            "",
            "Write the weekly digest now:"
        ].join("\n");

        try {
            const resp = await sendMessage({ action: "smartRecall", prompt });
            return resp?.success ? resp.answer : null;
        } catch (_) { return null; }
    }

    // ─── LLM recommendations ──────────────────────────────────────────────────

    async function generateRecommendations(topics) {
        if (!topics.length) return [];

        const topTopics = topics.slice(0, 12).map((t) => `${t.label}: mentioned ${t.count} times across ${t.sessions} sessions`).join("\n");

        const prompt = [
            "You are an AI project advisor analyzing a developer's recurring memory patterns.",
            "Generate exactly 3 concrete, specific, actionable recommendations based on the recurring topics.",
            "Each recommendation must be JSON with keys: title, body, evidence, priority (1=high, 2=medium, 3=low).",
            "Return a JSON array of 3 objects. No markdown, no explanation, just the array.",
            "Make recommendations specific to the actual topic names, not generic advice.",
            "",
            "Recurring topics detected:",
            topTopics,
            "",
            "Return JSON array now:"
        ].join("\n");

        try {
            const resp = await sendMessage({ action: "smartRecall", prompt });
            if (!resp?.success) return [];
            const text = String(resp.answer || "").trim()
                .replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.slice(0, 3);
        } catch (_) { /* fall through */ }
        return [];
    }

    // ─── Render: topics ───────────────────────────────────────────────────────

    function renderTopics(topics) {
        const list = document.getElementById("topicList");
        document.getElementById("topicsSubtitle").textContent =
            `${topics.length} recurring concepts across ${allSummaries.length} sessions`;

        if (!topics.length) {
            list.innerHTML = `<div style="color:var(--muted2);font-family:'JetBrains Mono',monospace;font-size:12px;padding:12px">Not enough data yet — run more summarizations.</div>`;
            return;
        }

        const maxCount = topics[0]?.count || 1;
        let html = "";

        topics.forEach((t, i) => {
            const pct = Math.round((t.count / maxCount) * 100);
            const rankColor = i < 3 ? "var(--accent)" : "var(--muted)";
            html += `
              <div class="topic-row">
                <div class="topic-rank" style="color:${rankColor}">#${i + 1}</div>
                <div class="topic-name">${escHtml(t.label)}</div>
                <div class="topic-count">×${t.count} · ${t.sessions} session${t.sessions !== 1 ? "s" : ""}</div>
                <div class="topic-bar-wrap">
                  <div class="topic-bar" style="width:${pct}%"></div>
                </div>
              </div>`;
        });

        list.innerHTML = html;
    }

    // ─── Render: digest ───────────────────────────────────────────────────────

    function renderDigest(digest) {
        const el = document.getElementById("digestText");

        if (!digest) {
            el.innerHTML = `<span style="color:var(--muted2);font-size:12px;font-family:'JetBrains Mono',monospace">AI synthesis unavailable. Configure an AI provider in Settings.</span>`;
            return;
        }

        const lines = digest.split("\n").map((l) => l.trim()).filter(Boolean);
        el.innerHTML = lines.map((line) => {
            const clean = line.replace(/^[-•*▸]\s*/, "");
            return `<div class="digest-bullet"><span class="digest-bullet-dot">▸</span><span>${escHtml(clean)}</span></div>`;
        }).join("");
    }

    // ─── Render: recommendations ──────────────────────────────────────────────

    function renderRecommendations(recs, topics) {
        const grid = document.getElementById("recGrid");

        if (!recs.length) {
            // Fallback: auto-generate simple recs from topic data
            recs = generateFallbackRecs(topics);
        }

        grid.innerHTML = recs.map((rec, i) => {
            const col = REC_COLORS[i % REC_COLORS.length];
            return `
              <div class="rec-card" style="border-top-color:${col.border}">
                <div class="rec-priority" style="background:${col.priority};color:${col.priorityText}">${col.label}</div>
                <div class="rec-title">${escHtml(rec.title || "Recommendation")}</div>
                <div class="rec-body">${escHtml(rec.body || "")}</div>
                ${rec.evidence ? `<div class="rec-evidence">📎 ${escHtml(rec.evidence)}</div>` : ""}
              </div>`;
        }).join("");
    }

    function generateFallbackRecs(topics) {
        if (!topics.length) return [];
        return topics.slice(0, 3).map((t, i) => ({
            title: `Act on "${t.label}"`,
            body: `This concept appears ${t.count} times across ${t.sessions} sessions. Consider dedicating focused time to it.`,
            evidence: `Mentioned in ${t.sessions} of ${allSummaries.length} sessions`,
            priority: i + 1
        }));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function setProgress(pct, label, steps) {
        document.getElementById("progressFill").style.width = `${pct}%`;
        document.getElementById("progressLabel").textContent = label;
        document.getElementById("progressSteps").textContent = steps || "";
    }

    function updateTopStat() {
        const el = document.getElementById("topStat");
        if (!allSummaries.length) { el.textContent = "no sessions yet"; return; }
        const totalItems = allSummaries.reduce((n, s) => n + countItems(s.summary), 0);
        el.innerHTML = `<strong>${allSummaries.length}</strong> sessions · <strong>${totalItems}</strong> memory items`;
    }

    function countItems(summaryStr) {
        const p = parseMemoryBlock(summaryStr);
        if (!p) return 0;
        const keys = ["GOALS","CURRENT_TASK","TECH_STACK","DECISIONS","OPEN_ISSUES","NEXT_STEPS","FACTS"];
        return keys.reduce((n, k) => n + toStringArray(p[k]).length, 0);
    }

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

    function titleCase(str) {
        return str.replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function pause(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
