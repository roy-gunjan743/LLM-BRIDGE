console.log("Memory Engine Started");

/*
Create smart project memory
*/

function generateProjectMemory(chats) {

    let summary = {

        projectName:
            "AI Transfer Extension",

        completedFeatures: [],

        currentIssues: [],

        importantMessages: []

    };

    chats.forEach((chat) => {

        const text =
            chat.content.toLowerCase();

        /*
        Detect completed work
        */

        if (
            text.includes("done") ||
            text.includes("worked")
        ) {

            summary.completedFeatures.push(
                chat.content
            );
        }

        /*
        Detect problems
        */

        if (
            text.includes("error") ||
            text.includes("failed") ||
            text.includes("not working")
        ) {

            summary.currentIssues.push(
                chat.content
            );
        }

        /*
        Save important long messages
        */

        if (
            chat.content.length > 100
        ) {

            summary.importantMessages.push(
                chat.content
            );
        }

    });

    return summary;
}

/*
Load chats
*/

setTimeout(() => {

    chrome.storage.local.get(
        ["universalChats"],
        (result) => {

            if (
                !result.universalChats
            ) {

                console.log(
                    "No universal chats found"
                );

                return;
            }

            const chats =
                result.universalChats.chats;

            /*
            Generate memory
            */

            const memory =
                generateProjectMemory(
                    chats
                );

            console.log(
                "Generated Memory:",
                memory
            );

            /*
            Save memory
            */

            chrome.storage.local.set({

                projectMemory:
                    memory

            }, () => {

                console.log(
                    "Project Memory Saved"
                );

            });

        });

}, 6000);