// content.js
// Runs inside BOSS直聘 (zhipin.com) and performs job extraction + apply flow.

console.log("Job automation content script loaded.");

// BOSS直聘 selectors (zhipin.com)
const SELECTORS = {
  jobList: ".rec-job-list",
  jobCard: ".card-area",
  seenJobCard: ".card-area.is-seen",
  jobCardWrap: ".job-card-wrap",
  communicateBtn: ".op-btn.op-btn-chat",
  continueBtn: ".sure-btn", // Continue communication button in dialog
};

const DEFAULT_PREFERENCES = {
  jobKeywords: "",
  location: "",
  maxApplicationsPerRun: 10,
};

/**
 * Create floating status indicator on page.
 */
function createStatusIndicator(count = 0) {
  let indicator = document.getElementById('job-automation-indicator');
  if (indicator) {
    updateStatusIndicator(count);
    return indicator;
  }
  
  indicator = document.createElement('div');
  indicator.id = 'job-automation-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    min-width: 200px;
  `;
  indicator.innerHTML = '<div>🤖 Automation Running...</div><div style="font-size:11px;font-weight:400;margin-top:4px;">Applied: <span id="job-count">' + count + '</span></div>';
  document.body.appendChild(indicator);
  return indicator;
}

function updateStatusIndicator(count) {
  const countEl = document.getElementById('job-count');
  if (countEl) countEl.textContent = count;
}

function removeStatusIndicator() {
  const indicator = document.getElementById('job-automation-indicator');
  if (indicator) indicator.remove();
}

/**
 * Save log to storage.
 */
function saveLogToStorage(message, level) {
  chrome.storage.local.get({ automationLogs: [] }, (data) => {
    const logs = data.automationLogs || [];
    logs.push({ message, level, timestamp: Date.now() });
    if (logs.length > 50) logs.shift();
    chrome.storage.local.set({ automationLogs: logs });
  });
}

function sendLog(message, level) {
  saveLogToStorage(message, level);
  chrome.runtime.sendMessage({
    type: "AUTOMATION_STATUS",
    message,
    level
  }).catch(() => {});
}

/**
 * Storage helpers (chrome.storage.sync).
 */
function getPreferences() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_PREFERENCES, (items) => {
      resolve({
        jobKeywords: items.jobKeywords || DEFAULT_PREFERENCES.jobKeywords,
        location: items.location || DEFAULT_PREFERENCES.location,
        maxApplicationsPerRun:
          Number(items.maxApplicationsPerRun) ||
          DEFAULT_PREFERENCES.maxApplicationsPerRun,
      });
    });
  });
}

function getAppliedJobs() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ appliedJobs: [] }, (items) => {
      resolve(items.appliedJobs || []);
    });
  });
}

function saveAppliedJobs(appliedJobs) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ appliedJobs }, () => resolve());
  });
}

/**
 * Build a unique job ID from card element.
 */
function buildJobId(cardEl) {
  const wrap = cardEl.querySelector(SELECTORS.jobCardWrap);
  if (!wrap) return null;
  const text = wrap.textContent.trim();
  return text || null;
}

/**
 * Find the communicate button.
 */
function getCommunicateButton() {
  return $(SELECTORS.communicateBtn);
}

/**
 * Get seen job card.
 */
function getSeenJobCard() {
  return $(SELECTORS.seenJobCard);
}

/**
 * Get random wait time between min and max seconds.
 */
function getRandomWaitTime(minSeconds = 10, maxSeconds = 60) {
  return (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
}

/**
 * Select a job by clicking the card wrap, then click communicate button.
 */
async function selectJobAndCommunicate(cardEl) {
  if (!cardEl) return false;
  const wrap = cardEl.querySelector(SELECTORS.jobCardWrap);
  if (!wrap) return false;
  wrap.click();
  await wait(800);
  const btn = getCommunicateButton();
  if (!btn) return false;
  btn.click();
  await wait(2000);
  return true;
}

/**
 * Click communicate button on seen job (button is in detail panel, not inside card).
 */
async function communicateWithSeenJob() {
  const btn = $(SELECTORS.communicateBtn);
  if (!btn) return false;
  btn.click();
  await wait(2000);
  return true;
}

/**
 * Save automation state for crash recovery.
 */
async function saveAutomationState(appliedCount, appliedSet) {
  await new Promise(resolve => 
    chrome.storage.local.set({
      automationState: {
        appliedCount,
        appliedJobs: Array.from(appliedSet),
        timestamp: Date.now()
      }
    }, resolve)
  );
}

/**
 * Load automation state for crash recovery.
 */
async function loadAutomationState() {
  return new Promise(resolve => 
    chrome.storage.local.get({ automationState: null }, (data) => {
      resolve(data.automationState);
    })
  );
}

/**
 * Clear automation state.
 */
async function clearAutomationState() {
  await new Promise(resolve => 
    chrome.storage.local.remove(['automationState'], resolve)
  );
}

/**
 * Heartbeat system to detect crashes.
 */
let heartbeatInterval = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    chrome.storage.local.set({ 
      lastHeartbeat: Date.now(),
      automationRunning: true 
    });
  }, 5000); // Update every 5 seconds
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Main automation sequence.
 */
let isRunning = false;
let shouldStop = false;

async function runJobAutomation() {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;
  
  // Set flag immediately and start heartbeat
  await new Promise(resolve => 
    chrome.storage.local.set({ 
      automationRunning: true,
      lastHeartbeat: Date.now()
    }, resolve)
  );
  startHeartbeat();
  
  try {
    const prefs = await getPreferences();
    const appliedJobs = await getAppliedJobs();
    const appliedSet = new Set(appliedJobs);
    const searchUrl = window.location.href;

    // Check for crash recovery state
    const savedState = await loadAutomationState();
    let appliedCount = 0;
    
    if (savedState && (Date.now() - savedState.timestamp) < 3600000) {
      appliedCount = savedState.appliedCount || 0;
      savedState.appliedJobs.forEach(id => appliedSet.add(id));
      sendLog(`Resuming from crash: ${appliedCount} jobs already applied`, "info");
    }
    const indicator = createStatusIndicator(appliedCount);

    sendLog("Automation started", "info");
    sendLog("Waiting for job list to load...", "info");
    
    await waitForElement(SELECTORS.jobList, 10000);
    await wait(2000);
    
    if (shouldStop) throw new Error("Stopped by user");

    while (appliedCount < prefs.maxApplicationsPerRun && !shouldStop) {
      const cards = Array.from($all(SELECTORS.jobCard));
      sendLog(`Found ${cards.length} job cards`, cards.length > 0 ? "success" : "warning");

      if (cards.length === 0) {
        sendLog("No job cards found.", "error");
        break;
      }

      const seenCard = getSeenJobCard();
      let cardToUse = null;
      let jobId = null;

      if (seenCard) {
        jobId = buildJobId(seenCard);
        if (jobId && !appliedSet.has(jobId)) {
          sendLog("Processing seen job...", "info");
          const communicated = await communicateWithSeenJob();
          if (communicated) {
            appliedSet.add(jobId);
            appliedCount += 1;
            updateStatusIndicator(appliedCount);
            await saveAutomationState(appliedCount, appliedSet);
            sendLog(`Applied to job ${appliedCount}/${prefs.maxApplicationsPerRun}`, "success");
            
            const waitTime = getRandomWaitTime(10, 60);
            sendLog(`Waiting ${Math.round(waitTime/1000)} seconds before next application...`, "info");
            await wait(waitTime);
            window.location.href = searchUrl;
            return;
          } else {
            sendLog("Communicate button not found, trying unseen jobs", "warning");
          }
        }
      }

      for (const card of cards) {
        if (card.classList.contains("is-seen")) continue;
        const id = buildJobId(card);
        if (id && !appliedSet.has(id)) {
          cardToUse = card;
          jobId = id;
          break;
        }
      }

      if (!cardToUse || !jobId) {
        sendLog("No more unapplied jobs found", "info");
        break;
      }

      sendLog("Selecting and communicating with job...", "info");
      
      const communicated = await selectJobAndCommunicate(cardToUse);
      if (communicated) {
        appliedSet.add(jobId);
        appliedCount += 1;
        updateStatusIndicator(appliedCount);
        await saveAutomationState(appliedCount, appliedSet);
        sendLog(`Applied to job ${appliedCount}/${prefs.maxApplicationsPerRun}`, "success");
        
        const waitTime = getRandomWaitTime(10, 60);
        sendLog(`Waiting ${Math.round(waitTime/1000)} seconds before next application...`, "info");
        await wait(waitTime);
        window.location.href = searchUrl;
        return;
      } else {
        sendLog("Failed to communicate with job", "warning");
      }
    }

    await saveAppliedJobs(Array.from(appliedSet));

    if (shouldStop) {
      sendLog("Automation stopped by user", "warning");
    }

    chrome.runtime.sendMessage({
      type: "AUTOMATION_DONE",
      appliedCount,
    }).catch(() => {});
    
    await clearAutomationState();
    stopHeartbeat();
    chrome.storage.local.remove(['automationLogs', 'automationRunning', 'lastHeartbeat']);
    removeStatusIndicator();
  } catch (err) {
    sendLog(`Error: ${err.message || String(err)}`, "error");
    // Don't clear state on error - allow recovery
    stopHeartbeat();
    chrome.storage.local.remove(['automationLogs', 'automationRunning', 'lastHeartbeat']);
    removeStatusIndicator();
  } finally {
    isRunning = false;
    shouldStop = false;
    stopHeartbeat();
  }
}

async function stopAutomation() {
  shouldStop = true;
  sendLog("Stopping automation...", "warning");
  await clearAutomationState();
  stopHeartbeat();
  chrome.storage.local.remove(['automationLogs', 'automationRunning', 'lastHeartbeat']);
  removeStatusIndicator();
}

// Listen for stop command
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "STOP_AUTOMATION") {
    stopAutomation();
  }
});

// Ensure DOM is ready before running.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    checkAndRun();
  });
} else {
  checkAndRun();
}

function checkAndRun() {
  chrome.storage.local.get({ automationRunning: false }, (data) => {
    if (data.automationRunning) {
      runJobAutomation();
    }
  });
}

