document.getElementById(
    "chatgptBtn"
).addEventListener("click", () => {

    chrome.tabs.create({
        url: "https://chatgpt.com"
    });

});

document.getElementById(
    "claudeBtn"
).addEventListener("click", () => {

    chrome.tabs.create({
        url: "https://claude.ai"
    });

});

document.getElementById(
    "geminiBtn"
).addEventListener("click", () => {

    chrome.tabs.create({
        url: "https://gemini.google.com"
    });

});

document.getElementById(
    "perplexityBtn"
).addEventListener("click", () => {

    chrome.tabs.create({
        url: "https://www.perplexity.ai"
    });

});