console.log("LLM BRIDGE Loaded");

function extractCurrentChat() {

    const messages =
        document.querySelectorAll(
            '[data-message-author-role]'
        );

    let chats = [];

    messages.forEach((msg) => {

        const role =
            msg.getAttribute(
                'data-message-author-role'
            );

        const text =
            msg.innerText?.trim();

        if (
            text &&
            text.length > 5
        ) {

            chats.push({
                role,
                content: text
            });
        }
    });

    return chats;
}

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {

        if (
            request.action ===
            "extractChat"
        ) {

            try {

                const chats =
                    extractCurrentChat();

                sendResponse({
                    success: true,
                    chats
                });

            } catch (error) {

                sendResponse({
                    success: false,
                    error: error.message
                });
            }
        }

        return true;
    }
);