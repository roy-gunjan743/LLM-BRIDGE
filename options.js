const form = document.getElementById("settingsForm");
const testBtn = document.getElementById("testBtn");
const statusEl = document.getElementById("status");
const providerEl = document.getElementById("provider");

const fields = {
    provider: providerEl,
    geminiApiKey: document.getElementById("geminiApiKey"),
    geminiModel: document.getElementById("geminiModel"),
    ollamaUrl: document.getElementById("ollamaUrl"),
    model: document.getElementById("model"),
    chunkSize: document.getElementById("chunkSize"),
    temperature: document.getElementById("temperature"),
    systemPrompt: document.getElementById("systemPrompt")
};

const providerSections = {
    gemini: document.getElementById("geminiFields"),
    ollama: document.getElementById("ollamaFields"),
    chrome: document.getElementById("chromeFields")
};

document.addEventListener("DOMContentLoaded", loadSettings);
form.addEventListener("submit", saveSettings);
testBtn.addEventListener("click", testConnection);
providerEl.addEventListener("change", toggleProviderFields);

function toggleProviderFields() {
    const selected = providerEl.value;
    Object.entries(providerSections).forEach(([key, el]) => {
        el.style.display = key === selected ? "" : "none";
    });
}

async function loadSettings() {
    const response = await sendMessage({ action: "getSettings" });
    if (!response?.success) {
        setStatus("Could not load settings.", true);
        return;
    }

    const settings = response.settings;
    fields.provider.value = settings.provider || "gemini";
    fields.geminiApiKey.value = settings.geminiApiKey || "";
    fields.geminiModel.value = settings.geminiModel || "gemini-2.5-flash";
    fields.ollamaUrl.value = settings.ollamaUrl;
    fields.model.value = settings.model;
    fields.chunkSize.value = settings.chunkSize;
    fields.temperature.value = settings.temperature;
    fields.temperature.dispatchEvent(new Event("input"));
    fields.systemPrompt.value = settings.systemPrompt;
    toggleProviderFields();
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

async function testConnection() {
    await sendMessage({ action: "saveSettings", settings: readSettings() });
    const response = await sendMessage({ action: "testOllama" });
    if (!response?.success) {
        setStatus(`${response?.error || "Offline"}: ${response?.detail || "Check settings."}`, true);
        return;
    }
    setStatus(response.message || "Connection successful.");
}

function readSettings() {
    return {
        provider: fields.provider.value,
        geminiApiKey: fields.geminiApiKey.value,
        geminiModel: fields.geminiModel.value,
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
