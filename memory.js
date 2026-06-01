var MemoryEngine = (() => {
    const MEMORY_KEY = "projectMemory";

    async function initialize() {
        const memory = await getMemory();
        if (typeof memory !== "string") {
            await saveMemory("");
        }
    }

    async function getMemory() {
        const result = await getStorage([MEMORY_KEY]);
        return typeof result[MEMORY_KEY] === "string" ? result[MEMORY_KEY] : "";
    }

    async function saveMemory(memory) {
        const safeMemory = cleanText(memory).slice(0, 500000);
        await setStorage({ [MEMORY_KEY]: safeMemory });
        return safeMemory;
    }

    async function generateMemory(chats, summary, llm) {
        const conversation = Array.isArray(chats)
            ? chats
                .map((chat) => `${cleanText(chat.role)}: ${cleanText(chat.content)}`)
                .filter((line) => line.length > 2)
                .join("\n\n")
            : "";

        const prompt = [
            "You are the long-term memory engine for LLM Bridge.",
            "Create persistent memory from the conversation and summary.",
            "Include project context, goals, bugs, constraints, decisions, technical stack, and next actions.",
            "Do not invent facts.",
            "",
            "Current summary:",
            cleanText(summary),
            "",
            "Conversation excerpt:",
            conversation.slice(0, 60000)
        ].join("\n");

        const memory = await llm.generate(prompt);
        return saveMemory(memory);
    }

    function getStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || "Storage Error"));
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
                    reject(new Error(chrome.runtime.lastError.message || "Storage Error"));
                    return;
                }
                resolve(true);
            });
        });
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

    return {
        initialize,
        getMemory,
        saveMemory,
        generateMemory
    };
})();
