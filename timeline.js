/* timeline.js — LLM Bridge Chat Timeline */

(function () {
    "use strict";

    // ─── Block config ─────────────────────────────────────────────────────────

    const BLOCKS = [
        { key: "GOALS",        label: "Goals",        icon: "🎯", colorClass: "chip-green",  bulletColor: "#34d399" },
        { key: "CURRENT_TASK", label: "Current Task",  icon: "⚡", colorClass: "chip-blue",   bulletColor: "#6c7fff" },
        { key: "TECH_STACK",   label: "Tech Stack",   icon: "🔧", colorClass: "chip-purple",  bulletColor: "#a78bfa" },
        { key: "DECISIONS",    label: "Decisions",    icon: "✅", colorClass: "chip-orange",  bulletColor: "#fb923c" },
        { key: "OPEN_ISSUES",  label: "Open Issues",  icon: "⚠️", colorClass: "chip-orange",  bulletColor: "#f87171" },
        { key: "NEXT_STEPS",   label: "Next Steps",   icon: "➡️", colorClass: "chip-blue",   bulletColor: "#22d3ee" },
        { key: "FACTS",        label: "Facts",        icon: "📌", colorClass: "chip-purple",  bulletColor: "#8b9cc8" }
    ];

    const BLOCK_ICON_BG = {
        GOALS: "rgba(52,211,153,.15)",
        CURRENT_TASK: "rgba(108,127,255,.15)",
        TECH_STACK: "rgba(167,139,250,.15)",
        DECISIONS: "rgba(251,146,60,.15)",
        OPEN_ISSUES: "rgba(248,113,113,.15)",
        NEXT_STEPS: "rgba(34,211,238,.15)",
        FACTS: "rgba(139,156,200,.15)"
    };

    // ─── State ────────────────────────────────────────────────────────────────

    let allSummaries = [];
    let activeId = null;

    // ─── Boot ─────────────────────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const response = await sendMessage({ action: "getState" });
            if (response && response.success) {
                allSummaries = Array.isArray(response.summaries) ? response.summaries : [];
            }
        } catch (err) {
            console.warn("Could not load summaries", err);
        }

        renderSidebar();
        updateTotalStat();
        bindExport();

        // Auto-select first session
        if (allSummaries.length > 0) {
            selectSession(allSummaries[0].id);
        }
    });

    // ─── Sidebar ──────────────────────────────────────────────────────────────

    function renderSidebar() {
        const container = document.getElementById("sidebarContent");
        if (!allSummaries.length) {
            container.innerHTML = `<div style="padding:24px 16px;font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;text-align:center">No sessions yet</div>`;
            return;
        }

        const groups = groupByDate(allSummaries);
        let html = "";

        for (const [label, sessions] of groups) {
            html += `<div class="sidebar-section">`;
            html += `<div class="date-group-label">${escHtml(label)}</div>`;

            for (const session of sessions) {
                const time = formatTime(session.createdAt);
                const memCount = countMemoryItems(session.summary);
                const model = shortModel(session.model || "");
                html += `
                  <div class="session-item" data-id="${escHtml(session.id)}" id="si-${escHtml(session.id)}">
                    <div class="session-dot"></div>
                    <div class="session-meta">
                      <div class="session-time">${escHtml(time)}</div>
                      <div class="session-pills">
                        <span class="spill spill-msg">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:middle"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          ${session.messageCount || 0} msgs
                        </span>
                        <span class="spill spill-mem">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:middle"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                          ${memCount} mem
                        </span>
                        ${model ? `<span class="spill spill-mod">${escHtml(model)}</span>` : ""}
                      </div>
                    </div>
                  </div>`;
            }
            html += `</div>`;
        }

        container.innerHTML = html;

        // Bind click events
        container.querySelectorAll(".session-item").forEach((item) => {
            item.addEventListener("click", () => selectSession(item.dataset.id));
        });
    }

    // ─── Session detail ───────────────────────────────────────────────────────

    function selectSession(id) {
        activeId = id;

        // Update sidebar active state
        document.querySelectorAll(".session-item").forEach((item) => {
            item.classList.toggle("active", item.dataset.id === id);
        });

        const session = allSummaries.find((s) => s.id === id);
        if (!session) return;

        document.getElementById("emptyState").style.display = "none";
        const detail = document.getElementById("sessionDetail");
        detail.style.display = "block";
        detail.innerHTML = buildDetailHTML(session);

        // Bind copy button
        const copyBtn = detail.querySelector(".copy-raw-btn");
        if (copyBtn) {
            copyBtn.addEventListener("click", () => copyToClipboard(session.summary, copyBtn));
        }
    }

    function buildDetailHTML(session) {
        const parsed = parseMemoryBlock(session.summary);
        const memCount = countMemoryItems(session.summary);
        const dateStr = formatFullDate(session.createdAt);
        const timeStr = formatTime(session.createdAt);
        const model = session.model || "unknown";
        const memId = parsed && parsed.MEMORY_ID ? parsed.MEMORY_ID : "";

        let html = `
          <div class="detail-header">
            <div class="detail-date">${escHtml(dateStr)} at ${escHtml(timeStr)}</div>
            <div class="detail-title">Memory Session</div>
            <div class="detail-chips">
              <div class="chip chip-blue">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                ${session.messageCount || 0} messages
              </div>
              <div class="chip chip-green">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                ${memCount} memories
              </div>
              <div class="chip chip-orange">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="4"/><rect x="10" y="3" width="4" height="4"/><rect x="17" y="3" width="4" height="4"/><rect x="3" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="17" y="10" width="4" height="4"/><rect x="3" y="17" width="4" height="4"/><rect x="10" y="17" width="4" height="4"/><rect x="17" y="17" width="4" height="4"/></svg>
                ${session.chunkCount || 1} chunk${session.chunkCount !== 1 ? "s" : ""}
              </div>
              <div class="chip chip-purple">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${escHtml(model)}
              </div>
              ${memId ? `<div class="chip chip-blue" style="font-size:10px;opacity:.7">${escHtml(memId)}</div>` : ""}
            </div>
          </div>`;

        if (!parsed) {
            // Fallback: show raw
            html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#8a98c0;line-height:1.7;white-space:pre-wrap;word-break:break-all">${escHtml(session.summary)}</div>`;
        } else {
            html += `<div class="blocks-grid">`;
            for (const block of BLOCKS) {
                const items = toStringArray(parsed[block.key]);
                if (!items.length) continue;
                html += buildMemoryBlockHTML(block, items);
            }
            html += `</div>`;
        }

        html += `
          <button class="copy-raw-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            copy memory JSON
          </button>`;

        return html;
    }

    function buildMemoryBlockHTML(block, items) {
        const bg = BLOCK_ICON_BG[block.key] || "rgba(108,127,255,.1)";
        let html = `
          <div class="memory-block">
            <div class="block-header">
              <div class="block-icon" style="background:${bg}">${block.icon}</div>
              <div class="block-title" style="color:${getBlockColor(block.key)}">${block.label}</div>
              <div class="block-count">${items.length}</div>
            </div>
            <ul class="block-items">`;

        for (const item of items.slice(0, 12)) {
            html += `
              <li class="block-item">
                <span class="item-bullet" style="color:${block.bulletColor}">▸</span>
                <span>${escHtml(item)}</span>
              </li>`;
        }

        if (items.length > 12) {
            html += `<li class="block-item" style="color:var(--muted);font-style:italic"><span class="item-bullet">…</span><span>+${items.length - 12} more</span></li>`;
        }

        html += `</ul></div>`;
        return html;
    }

    // ─── Grouping ─────────────────────────────────────────────────────────────

    function groupByDate(summaries) {
        const groups = new Map();
        const now = new Date();
        const todayStr = toDateStr(now);
        const yesterdayStr = toDateStr(new Date(now - 86400000));

        for (const session of summaries) {
            const d = new Date(session.createdAt);
            const dStr = toDateStr(d);
            let label;
            if (dStr === todayStr) label = "Today";
            else if (dStr === yesterdayStr) label = "Yesterday";
            else {
                label = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
                // Add year if not current year
                if (d.getFullYear() !== now.getFullYear()) {
                    label += `, ${d.getFullYear()}`;
                }
            }

            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(session);
        }

        return groups;
    }

    function toDateStr(date) {
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }

    // ─── Stats ────────────────────────────────────────────────────────────────

    function updateTotalStat() {
        const el = document.getElementById("totalStat");
        if (!allSummaries.length) {
            el.innerHTML = "no sessions yet";
            return;
        }
        const totalMsgs = allSummaries.reduce((s, x) => s + (x.messageCount || 0), 0);
        const totalMem  = allSummaries.reduce((s, x) => s + countMemoryItems(x.summary), 0);
        el.innerHTML = `<strong>${allSummaries.length}</strong> sessions · <strong>${totalMsgs}</strong> messages · <strong>${totalMem}</strong> memories`;
    }

    // ─── Export ───────────────────────────────────────────────────────────────

    function bindExport() {
        document.getElementById("exportAllBtn").addEventListener("click", () => {
            const data = {
                exportedAt: new Date().toISOString(),
                sessions: allSummaries.map((s) => ({
                    ...s,
                    parsedMemory: parseMemoryBlock(s.summary)
                }))
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href = url;
            a.download = `llmbridge-timeline-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function countMemoryItems(summaryStr) {
        const parsed = parseMemoryBlock(summaryStr);
        if (!parsed) return 0;
        return ["FACTS","GOALS","CURRENT_TASK","TECH_STACK","DECISIONS","OPEN_ISSUES","NEXT_STEPS"]
            .reduce((n, k) => n + toStringArray(parsed[k]).length, 0);
    }

    function parseMemoryBlock(raw) {
        if (!raw) return null;
        const text = String(raw).replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
        try { return JSON.parse(text); } catch (_) { return null; }
    }

    function toStringArray(value) {
        if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
        if (typeof value === "string" && value.trim()) return [value.trim()];
        return [];
    }

    function formatTime(iso) {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        } catch (_) { return iso; }
    }

    function formatFullDate(iso) {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric"
            });
        } catch (_) { return iso; }
    }

    function shortModel(model) {
        if (!model) return "";
        // Trim long model names like "llama3.2:latest" → "llama3.2"
        return model.replace(/:latest$/i, "").slice(0, 14);
    }

    function getBlockColor(key) {
        const map = {
            GOALS: "#34d399", CURRENT_TASK: "#6c7fff", TECH_STACK: "#a78bfa",
            DECISIONS: "#fb923c", OPEN_ISSUES: "#f87171", NEXT_STEPS: "#22d3ee",
            FACTS: "#8b9cc8"
        };
        return map[key] || "#8b9cc8";
    }

    async function copyToClipboard(text, btn) {
        try {
            await navigator.clipboard.writeText(text);
            const orig = btn.innerHTML;
            btn.textContent = "✓ copied!";
            btn.style.color = "var(--accent-g)";
            setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; }, 1800);
        } catch (_) {
            btn.textContent = "copy failed";
        }
    }

    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                });
            } catch (err) { reject(err); }
        });
    }

    function escHtml(str) {
        return String(str || "")
            .replace(/&/g,"&amp;").replace(/</g,"&lt;")
            .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

})();
