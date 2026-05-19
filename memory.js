console.log("Llama Memory Engine Started");

/*
Generate memory using Ollama
*/

async function generateMemory(chats) {

    let conversation = "";

    chats.forEach((chat) => {

        conversation +=
            chat.role +
            ": " +
            chat.content +
            "\n\n";

    });

    /*
    AI prompt
    */

    const prompt = `
You are an AI memory engine.

Summarize this developer conversation.

Format clearly.

Include:
- Project Name
- Completed Features
- Current Issues
- Important Context
- Next Steps

Conversation:

${conversation}
`;

    /*
    Call Ollama
    */

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

                    prompt: prompt,

                    stream: false

                })

            }

        );

    const data =
        await response.json();

    /*
    Return ONLY text
    */

    return data.response;
}

/*
Main logic
*/

setTimeout(async () => {

    chrome.storage.local.get(

        ["universalChats"],

        async (result) => {

            if (
                !result.universalChats
            ) {

                console.log(
                    "No chats found"
                );

                return;
            }

            const chats =
                result.universalChats.chats;

            /*
            Empty chats
            */

            if (
                !chats ||
                chats.length === 0
            ) {

                console.log(
                    "No chats extracted"
                );

                return;
            }

            console.log(
                "Generating AI memory..."
            );

            try {

                const memory =
                    await generateMemory(
                        chats
                    );

                console.log(
                    "AI Memory Generated:"
                );

                console.log(memory);

                /*
                Save as STRING
                */

                chrome.storage.local.set({

                    projectMemory:
                        String(memory)

                }, () => {

                    console.log(
                        "AI Memory Saved"
                    );

                });

            }

            catch(error) {

                console.error(
                    "Memory Error:",
                    error
                );

            }

        }

    );

}, 10000);