(() => {
    if (window.__LLM_BRIDGE_CONTENT_READY__) {
        return;
    }
    window.__LLM_BRIDGE_CONTENT_READY__ = true;

    const SELECTORS = [
        "[data-message-author-role]",
        "[data-testid^='conversation-turn-']",
        "article[data-testid*='conversation-turn']",
        "main article",
        "[class*='group/conversation-turn']",
        "[class*='conversation-turn']"
    ];

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!request || request.action !== "extractChat") {
            return false;
        }

        try {
            const chats = extractCurrentChat();
            sendResponse({ success: true, chats });
        } catch (error) {
            sendResponse({
                success: false,
                error: error.message || "Chat extraction failed."
            });
        }

        return true;
    });

    function extractCurrentChat() {
        const candidates = collectCandidates();
        const seen = new Set();
        const chats = [];

        for (const element of candidates) {
            if (!isVisible(element)) continue;

            const role = extractRole(element, chats.length);
            const content = extractContent(element);
            if (!content || content.length < 2) continue;

            const key = `${role}:${content}`;
            if (seen.has(key)) continue;
            seen.add(key);

            chats.push({ role, content });
        }

        return chats;
    }

    function collectCandidates() {
        const ordered = [];
        const seen = new Set();

        for (const selector of SELECTORS) {
            for (const element of document.querySelectorAll(selector)) {
                if (!(element instanceof HTMLElement)) continue;
                if (seen.has(element)) continue;
                seen.add(element);
                ordered.push(element);
            }
        }

        return ordered.sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });
    }

    function extractRole(element, index) {
        const directRole = element.getAttribute("data-message-author-role");
        if (directRole) return normalizeRole(directRole);

        const roleNode = element.querySelector("[data-message-author-role]");
        const nestedRole = roleNode?.getAttribute("data-message-author-role");
        if (nestedRole) return normalizeRole(nestedRole);

        const aria = [
            element.getAttribute("aria-label"),
            element.getAttribute("data-testid"),
            element.className,
            element.textContent?.slice(0, 80)
        ].join(" ").toLowerCase();

        if (/\b(user|you|human)\b/.test(aria)) return "user";
        if (/\b(assistant|chatgpt|gpt|ai)\b/.test(aria)) return "assistant";
        return index % 2 === 0 ? "user" : "assistant";
    }

    function extractContent(element) {
        const contentNode =
            element.querySelector("[data-message-author-role] .markdown") ||
            element.querySelector(".markdown") ||
            element.querySelector("[data-testid='message-content']") ||
            element.querySelector("[class*='message-content']") ||
            element;

        const clone = contentNode.cloneNode(true);
        removeNoise(clone);
        return cleanText(clone.innerText || clone.textContent || "");
    }

    function removeNoise(root) {
        const noiseSelectors = [
            "script",
            "style",
            "noscript",
            "svg",
            "button",
            "textarea",
            "input",
            "[hidden]",
            "[aria-hidden='true']",
            "[data-testid*='copy']",
            "[data-testid*='feedback']",
            "[class*='sr-only']"
        ];

        for (const node of root.querySelectorAll(noiseSelectors.join(","))) {
            node.remove();
        }
    }

    function isVisible(element) {
        if (!element.isConnected) return false;
        if (element.closest("[hidden], [aria-hidden='true']")) return false;

        const style = window.getComputedStyle(element);
        if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0
        ) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function normalizeRole(role) {
        const value = String(role || "").toLowerCase();
        if (value.includes("user") || value.includes("human")) return "user";
        if (value.includes("assistant") || value.includes("chatgpt") || value.includes("ai")) return "assistant";
        if (value.includes("system")) return "system";
        return "unknown";
    }

    function cleanText(text) {
        return String(text || "")
            .replace(/\u00a0/g, " ")
            .replace(/[ \t]+/g, " ")
            .replace(/\n[ \t]+/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }
})();
