console.log("Popup Loaded");

const importBtn =
    document.getElementById(
        "importBtn"
    );

const summaryBox =
    document.getElementById(
        "summaryBox"
    );

function log(message) {

    console.log(message);

    summaryBox.value +=
        message + "\n\n";
}

async function summarizeChat(chats) {

    try {

        log(
            "Preparing full conversation..."
        );

        const fullConversation =
            chats.map(chat =>

                `${chat.role}: ${chat.content}`

            ).join("\n\n");

        log(
            "Conversation Length: " +
            fullConversation.length
        );

        // SPLIT INTO CHUNKS
        const chunkSize = 4000;

        let chunks = [];

        for (
            let i = 0;
            i < fullConversation.length;
            i += chunkSize
        ) {

            chunks.push(
                fullConversation.substring(
                    i,
                    i + chunkSize
                )
            );
        }

        log(
            "Total Chunks: " +
            chunks.length
        );

        let partialSummaries = [];

        // SUMMARIZE EACH CHUNK
        for (
            let i = 0;
            i < chunks.length;
            i++
        ) {

            log(
                `Summarizing chunk ${i + 1}/${chunks.length}`
            );

            const response =
                await new Promise((resolve) => {

                    chrome.runtime.sendMessage(
                        {
                            action: "summarize",

                            prompt: `
Summarize this part of a conversation.

${chunks[i]}
                            `
                        },

                        (response) => {

                            resolve(response);
                        }
                    );
                });

            if (
                response &&
                response.success
            ) {

                partialSummaries.push(
                    response.summary
                );

            } else {

                partialSummaries.push(
                    "Chunk summary failed."
                );
            }
        }

        log(
            "Generating FINAL summary..."
        );

        // FINAL SUMMARY
        const finalResponse =
            await new Promise((resolve) => {

                chrome.runtime.sendMessage(
                    {
                        action: "summarize",

                        prompt: `
Combine these summaries into ONE final clean summary.

${partialSummaries.join("\n\n")}
                        `
                    },

                    (response) => {

                        resolve(response);
                    }
                );
            });

        if (
            finalResponse &&
            finalResponse.success
        ) {

            return finalResponse.summary;
        }

        return "Final summary failed.";

    } catch (error) {

        console.error(error);

        return (
            "ERROR:\n\n" +
            error.message
        );
    }
}
importBtn.addEventListener(
    "click",
    async () => {

        summaryBox.value = "";

        log(
            "Import button clicked"
        );

        const [tab] =
            await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

        await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },

            files: ["content.js"]
        });

        log(
            "content.js injected"
        );

        chrome.tabs.sendMessage(
            tab.id,
            {
                action: "extractChat"
            },

            async (response) => {

                if (
                    chrome.runtime.lastError
                ) {

                    log(
                        chrome.runtime
                        .lastError.message
                    );

                    return;
                }

                if (!response.success) {

                    log(
                        response.error
                    );

                    return;
                }

                log(
                    "Chats extracted: " +
                    response.chats.length
                );

                summaryBox.value =
                    "Generating summary...\n\n";

                const summary =
                    await summarizeChat(
                        response.chats
                    );

                summaryBox.value =
                    summary;
            }
        );
    }
    
);
