console.log("Universal AI Extractor Started");

/*
Detect current AI platform
*/

function detectAIPlatform() {

    const host =
        window.location.hostname;

    if (host.includes("chatgpt")) {
        return "chatgpt";
    }

    if (host.includes("claude")) {
        return "claude";
    }

    if (host.includes("gemini")) {
        return "gemini";
    }

    if (host.includes("perplexity")) {
        return "perplexity";
    }

    if (host.includes("grok")) {
        return "grok";
    }

    return "unknown";
}

/*
Extract ChatGPT chats
*/

function extractChatGPT() {

    /*
    NEW ChatGPT selectors
    */

    const messages =
        document.querySelectorAll(

            '[data-message-author-role], .markdown'

        );

    let chats = [];

    messages.forEach((msg) => {

        let role = "unknown";

        /*
        Detect role
        */

        if (
            msg.closest(
                '[data-message-author-role="user"]'
            )
        ) {

            role = "user";

        }

        else if (
            msg.closest(
                '[data-message-author-role="assistant"]'
            )
        ) {

            role = "assistant";

        }

        /*
        Get text
        */

        const text =
            msg.innerText?.trim();

        /*
        Avoid empty messages
        */

        if (text) {

            chats.push({

                role: role,

                content: text

            });

        }

    });

    return chats;
}

/*
Extract Claude chats
*/

function extractClaude() {

    const messages =
        document.querySelectorAll(
            '.font-claude-message'
        );

    let chats = [];

    messages.forEach((msg) => {

        chats.push({

            role: "assistant",

            content:
                msg.innerText

        });

    });

    return chats;
}

/*
Extract Gemini chats
*/

function extractGemini() {

    const messages =
        document.querySelectorAll(
            'message-content'
        );

    let chats = [];

    messages.forEach((msg) => {

        chats.push({

            role: "assistant",

            content:
                msg.innerText

        });

    });

    return chats;
}

/*
Universal extractor
*/

function extractChats(platform) {

    switch(platform) {

        case "chatgpt":
            return extractChatGPT();

        case "claude":
            return extractClaude();

        case "gemini":
            return extractGemini();

        default:
            return [];
    }
}

/*
Main Logic
*/

setTimeout(() => {

    const currentPlatform =
        detectAIPlatform();

    console.log(
        "Current Platform:",
        currentPlatform
    );

    const extractedChats =
        extractChats(currentPlatform);

    console.log(
        "Extracted Chats:",
        extractedChats
    );

    /*
    Save universally
    */

    chrome.storage.local.set({

        universalChats: {

            platform:
                currentPlatform,

            chats:
                extractedChats

        }

    }, () => {

        console.log(
            "Chats Saved Successfully"
        );

    });

}, 5000);