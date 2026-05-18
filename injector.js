console.log("Smart Injector Started");

/*
Find AI input textbox
*/

function findInputBox() {

    const host =
        window.location.hostname;

    // ChatGPT
    if (host.includes("chatgpt")) {

        return document.querySelector(
            "textarea"
        );
    }

    // Claude
    if (host.includes("claude")) {

        return document.querySelector(
            "textarea"
        );
    }

    // Gemini
    if (host.includes("gemini")) {

        return document.querySelector(
            "textarea"
        );
    }

    // Perplexity
    if (host.includes("perplexity")) {

        return document.querySelector(
            "textarea"
        );
    }

    // Grok
    if (host.includes("grok")) {

        return document.querySelector(
            "textarea"
        );
    }

    return null;
}

/*
Inject Smart Memory
*/

setTimeout(() => {

    chrome.storage.local.get(
        ["projectMemory"],
        (result) => {

            /*
            Check memory exists
            */

            if (!result.projectMemory) {

                console.log(
                    "No project memory found"
                );

                return;
            }

            /*
            Get memory
            */

            const data =
                result.projectMemory;

            /*
            Build smart context
            */

            let context =
                "PROJECT CONTEXT:\n\n";

            /*
            Project name
            */

            context +=
                "Project Name: " +
                data.projectName +
                "\n\n";

            /*
            Completed features
            */

            context +=
                "Completed Features:\n";

            data.completedFeatures.forEach(
                (item) => {

                    context +=
                        "- " +
                        item +
                        "\n";

                }
            );

            /*
            Current issues
            */

            context +=
                "\nCurrent Issues:\n";

            data.currentIssues.forEach(
                (item) => {

                    context +=
                        "- " +
                        item +
                        "\n";

                }
            );

            /*
            Important context
            */

            context +=
                "\nImportant Context:\n";

            data.importantMessages.forEach(
                (item) => {

                    context +=
                        "- " +
                        item +
                        "\n\n";

                }
            );

            console.log(
                "Generated Context:"
            );

            console.log(context);

            /*
            Find AI textbox
            */

            const inputBox =
                findInputBox();

            if (!inputBox) {

                console.log(
                    "Textbox not found"
                );

                return;
            }

            /*
            Inject text
            */

            inputBox.value =
                context;

            /*
            Trigger input event
            */

            inputBox.dispatchEvent(
                new Event(
                    "input",
                    { bubbles: true }
                )
            );

            console.log(
                "Smart Context Injected Successfully"
            );

        });

}, 7000);   