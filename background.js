console.log("Background Running");

chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {

        if (request.action === "summarize") {

            try {

                console.log(
                    "Sending request to Ollama..."
                );

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

                                prompt:
                                    request.prompt,

                                stream: false
                            })
                        }
                    );

                console.log(
                    "HTTP STATUS:",
                    response.status
                );

                const raw =
                    await response.text();

                console.log(
                    "RAW OLLAMA RESPONSE:",
                    raw
                );

                if (
                    !raw ||
                    raw.trim() === ""
                ) {

                    sendResponse({
                        success: false,
                        error:
                            "Empty response from Ollama"
                    });

                    return true;
                }

                let data;

                try {

                    data =
                        JSON.parse(raw);

                } catch (error) {

                    console.error(error);

                    sendResponse({
                        success: false,
                        error:
                            "Invalid JSON returned"
                    });

                    return true;
                }

                if (!data.response) {

                    sendResponse({
                        success: false,
                        error:
                            "No summary generated"
                    });

                    return true;
                }

                sendResponse({
                    success: true,
                    summary:
                        data.response
                });

            } catch (error) {

                console.error(error);

                sendResponse({
                    success: false,
                    error:
                        error.message
                });
            }
        }

        return true;
    }
);