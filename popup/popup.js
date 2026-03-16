// popup/popup.js
// Handles user preferences and triggers automation via the background script.

const DEFAULTS = {
  jobKeywords: "",
  location: "",
  maxApplicationsPerRun: 10,
  jobType: "",
};

function loadPreferences() {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    document.getElementById("jobKeywords").value =
      items.jobKeywords || DEFAULTS.jobKeywords;
    document.getElementById("location").value =
      items.location || DEFAULTS.location;
    document.getElementById("maxApplicationsPerRun").value =
      items.maxApplicationsPerRun || DEFAULTS.maxApplicationsPerRun;
    setActiveJobType(items.jobType || "");
  });
}

function savePreferences(prefs) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(prefs, () => resolve());
  });
}

function setActiveJobType(value) {
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

function getActiveJobType() {
  const active = document.querySelector(".toggle-btn.active");
  return active ? active.dataset.value : "";
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function addLog(message, type = 'info') {
  const logContainer = document.getElementById("logContainer");
  const logContent = document.getElementById("logContent");
  
  if (logContainer && logContent) {
    logContainer.style.display = 'block';
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
  }
}

function clearLogs() {
  const logContent = document.getElementById("logContent");
  if (logContent) {
    logContent.innerHTML = '';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPreferences();
  loadStoredLogs();
  checkAutomationStatus();

  // Toggle buttons
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActiveJobType(btn.dataset.value));
  });

  // Listen for log messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "LOG") {
      addLog(message.message, message.level || 'info');
    }
    if (message?.type === "AUTOMATION_DONE") {
      showStartButton();
      setStatus("Automation completed.");
    }
  });

  const form = document.getElementById("prefs-form");
  const stopBtn = document.getElementById("stopBtn");
  
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearLogs();

    const prefs = {
      jobKeywords: document.getElementById("jobKeywords").value.trim(),
      location: document.getElementById("location").value.trim(),
      maxApplicationsPerRun: Number(
        document.getElementById("maxApplicationsPerRun").value || 10
      ),
      jobType: getActiveJobType(),
    };

    await savePreferences(prefs);
    setStatus("Preferences saved. Starting automation...");
    addLog("Starting automation...", 'info');

    chrome.runtime.sendMessage(
      { type: "START_AUTOMATION", query: prefs.jobKeywords, jobType: prefs.jobType },
      (response) => {
        if (chrome.runtime.lastError) {
          setStatus("Failed to start automation.");
          addLog("Failed to start: " + chrome.runtime.lastError.message, 'error');
          return;
        }
        if (response && response.ok) {
          setStatus("Automation started. Check the job tab.");
          addLog("Automation started successfully", 'success');
          showStopButton();
        } else {
          setStatus("Automation could not be started.");
          addLog("Could not start automation", 'error');
        }
      }
    );
  });
  
  stopBtn.addEventListener("click", () => {
    chrome.tabs.query({ url: "*://www.zhipin.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "STOP_AUTOMATION" }, () => {
          if (chrome.runtime.lastError) {
            // Ignore connection errors
          }
        });
      }
    });
    addLog("Stop command sent", 'warning');
    setStatus("Stopping automation...");
    showStartButton();
  });
});

function checkAutomationStatus() {
  chrome.storage.local.get({ automationRunning: false }, (data) => {
    if (data.automationRunning) {
      showStopButton();
      setStatus("Automation is running...");
    } else {
      showStartButton();
    }
  });
}

function showStopButton() {
  document.getElementById("startBtn").style.display = "none";
  document.getElementById("stopBtn").style.display = "inline-flex";
}

function showStartButton() {
  document.getElementById("startBtn").style.display = "inline-flex";
  document.getElementById("stopBtn").style.display = "none";
}

function loadStoredLogs() {
  chrome.storage.local.get({ automationLogs: [] }, (data) => {
    const logs = data.automationLogs || [];
    if (logs.length > 0) {
      logs.forEach(log => {
        addLog(log.message, log.level);
      });
      setStatus("Automation is running...");
    }
  });
}

// Periodically check automation status
setInterval(() => {
  chrome.storage.local.get({ automationRunning: false }, (data) => {
    if (!data.automationRunning) {
      showStartButton();
    }
  });
}, 2000);

