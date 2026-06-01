const form = document.getElementById("settingsForm");
const testBtn = document.getElementById("testBtn");
const statusEl = document.getElementById("status");
const fields = {
    ollamaUrl: document.getElementById("ollamaUrl"),
    model: document.getElementById("model"),
    chunkSize: document.getElementById("chunkSize"),
    temperature: document.getElementById("temperature"),
    systemPrompt: document.getElementById("systemPrompt")
};

document.addEventListener("DOMContentLoaded", loadSettings);
form.addEventListener("submit", saveSettings);
testBtn.addEventListener("click", testOllama);

async function loadSettings() {
    const response = await sendMessage({ action: "getSettings" });
    if (!response?.success) {
        setStatus("Could not load settings.", true);
        return;
    }

    const settings = response.settings;
    fields.ollamaUrl.value = settings.ollamaUrl;
    fields.model.value = settings.model;
    fields.chunkSize.value = settings.chunkSize;
    fields.temperature.value = settings.temperature;
    fields.systemPrompt.value = settings.systemPrompt;
}

async function saveSettings(event) {
    event.preventDefault();
    const settings = readSettings();
    const response = await sendMessage({ action: "saveSettings", settings });

    if (!response?.success) {
        setStatus(response?.detail || "Could not save settings.", true);
        return;
    }

    setStatus("Settings saved.");
}

async function testOllama() {
    await sendMessage({ action: "saveSettings", settings: readSettings() });
    const response = await sendMessage({ action: "testOllama" });
    if (!response?.success) {
        setStatus(`${response?.error || "Ollama Offline"}: ${response?.detail || "Check Ollama."}`, true);
        return;
    }
    setStatus("Ollama connection successful.");
}

function readSettings() {
    return {
        ollamaUrl: fields.ollamaUrl.value,
        model: fields.model.value,
        chunkSize: Number(fields.chunkSize.value),
        temperature: Number(fields.temperature.value),
        systemPrompt: fields.systemPrompt.value
    };
}

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
}

function sendMessage(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                resolve({
                    success: false,
                    detail: chrome.runtime.lastError.message
                });
                return;
            }
            resolve(response);
        });
    });
}
