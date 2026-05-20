console.log("Memory Engine Loaded");

async function getStoredChats() {

    return new Promise((resolve) => {

        chrome.storage.local.get(
            ["extractedChats"],
            (result) => {

                resolve(
                    result.extractedChats || []
                );
            }
        );
    });
}

async function saveMemory(memory) {

    return new Promise((resolve) => {

        chrome.storage.local.set(
            {
                projectMemory: memory
            },
            () => resolve(true)
        );
    });
}

async function generateMemory(chats) {

    const conversation =
        chats.map(chat =>
            `${chat.role}: ${chat.content}`
        ).join("\n\n");

    const prompt = `
You are a Long-Term AI Memory System.

Convert this conversation into:

- Persistent memory
- Project context
- Goals
- Current bugs
- Technical stack
- Next actions

Conversation:

${conversation}
`;

    const response =
        await fetch(
            "http://127.0.0.1:11434/api/generate",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    model: "llama3.2",
                    prompt,
                    stream: false
                })
            }
        );

    const data =
        await response.json();

    return data.response;
}

async function startMemoryEngine() {

    try {

        const chats =
            await getStoredChats();

        if (!chats.length) {

            console.log(
                "No chats available"
            );

            return;
        }

        console.log(
            "Generating memory..."
        );

        const memory =
            await generateMemory(chats);

        await saveMemory(memory);

        console.log(
            "Memory saved successfully"
        );

        console.log(memory);

    } catch (error) {

        console.error(error);
    }
}

startMemoryEngine();