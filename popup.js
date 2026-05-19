console.log("popup loaded");

const importBtn = document.getElementById("importBtn");
const summaryBox = document.getElementById("summaryBox");

importBtn.addEventListener("click", async () => {

    console.log("Starting import...");

    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    console.log("Active tab found");

    chrome.tabs.sendMessage(
        tab.id,
        { action: "extractChat" },

        (response) => {

            console.log("Response received:", response);

            if (chrome.runtime.lastError) {

                console.error(chrome.runtime.lastError);

                summaryBox.value =
                    "ERROR: " + chrome.runtime.lastError.message;

                return;
            }

            if (!response) {

                summaryBox.value =
                    "No response from content.js";

                return;
            }

            summaryBox.value = response.data;
        }
    );
});