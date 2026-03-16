// background.js (service worker)
// Controls tab management and injects content scripts on BOSS直聘 (zhipin.com).

// BOSS直聘: direct search URL with query param (no input typing).
const TARGET_ORIGIN = "https://www.zhipin.com";
const JOBS_SEARCH_PATH = "/web/geek/jobs";

function getJobsSearchUrl(query, jobType) {
  const q = (query || "").trim();
  const params = new URLSearchParams();
  if (q) params.set("query", q);
  if (jobType) params.set("jobType", jobType);
  const qs = params.toString();
  return `${TARGET_ORIGIN}${JOBS_SEARCH_PATH}${qs ? "?" + qs : ""}`;
}

/**
 * Promisified helpers for chrome.tabs.
 */
function queryTabs(queryInfo) {
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

function createTab(createProperties) {
  return new Promise((resolve) => chrome.tabs.create(createProperties, resolve));
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve) =>
    chrome.tabs.update(tabId, updateProperties, resolve)
  );
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Job Automation Extension installed.");
  startCrashMonitor();
});

/**
 * Monitor for crashes and auto-resume.
 */
let crashMonitorInterval = null;

function startCrashMonitor() {
  if (crashMonitorInterval) return;
  
  crashMonitorInterval = setInterval(async () => {
    chrome.storage.local.get(['automationRunning', 'lastHeartbeat', 'automationState'], async (data) => {
      if (!data.automationRunning) return;
      
      const now = Date.now();
      const lastBeat = data.lastHeartbeat || 0;
      const timeSinceLastBeat = now - lastBeat;
      
      // If no heartbeat for 15 seconds, consider it crashed
      if (timeSinceLastBeat > 15000 && data.automationState) {
        console.log('Crash detected! Attempting to resume automation...');
        
        // Get search query from preferences
        chrome.storage.sync.get({ jobKeywords: '', jobType: null }, async (prefs) => {
          const query = prefs.jobKeywords || '';
          
          chrome.runtime.sendMessage({
            type: "LOG",
            message: "Crash detected! Resuming automation...",
            level: 'warning'
          }).catch(() => {});
          
          // Resume automation
          await startAutomation(query, prefs.jobType);
        });
      }
    });
  }, 10000); // Check every 10 seconds
}

function stopCrashMonitor() {
  if (crashMonitorInterval) {
    clearInterval(crashMonitorInterval);
    crashMonitorInterval = null;
  }
}

/**
 * Find an open zhipin tab or create one; navigate to jobs search URL with query.
 * @param {string} [searchQuery] - Keyword for ?query= (e.g. "seo")
 * @returns {Promise<number>} tabId
 */
async function findOrCreateTargetTab(searchQuery, jobType) {
  const url = getJobsSearchUrl(searchQuery, jobType);
  const tabs = await queryTabs({ url: "*://www.zhipin.com/*" });

  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    await updateTab(tab.id, { active: true, url });
    return tab.id;
  }

  const newTab = await createTab({ url, active: true });
  return newTab.id;
}

/**
 * Inject helpers and content script into the given tab.
 */
async function injectAutomationScripts(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ["utils/helpers.js"],
    });

    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ["content.js"],
    });

    console.log("Job automation scripts injected.");
  } catch (err) {
    console.error("Failed to inject scripts:", err);
  }
}

/**
 * Start the automation flow:
 *  - Set automation flag first
 *  - Find or open target tab and navigate to jobs?query=<keywords>
 *  - Wait until fully loaded, then inject scripts
 * @param {string} [searchQuery] - Keywords from popup (e.g. "seo")
 */
async function startAutomation(searchQuery, jobType) {
  // Set flag before injecting scripts
  await new Promise(resolve => 
    chrome.storage.local.set({ 
      automationRunning: true,
      lastHeartbeat: Date.now()
    }, resolve)
  );
  
  const tabId = await findOrCreateTargetTab(searchQuery, jobType);

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }

    if (tab.status === "complete") {
      injectAutomationScripts(tabId);
    } else {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          injectAutomationScripts(tabId);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    }
  });
}

/**
 * Handle messages from popup and content scripts.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "START_AUTOMATION") {
    const query = message.query != null ? String(message.query).trim() : "";
    const jobType = message.jobType || null;
    startAutomation(query || undefined, jobType).catch((err) =>
      console.error("Error starting automation:", err)
    );
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "AUTOMATION_STATUS") {
    console.log("Automation status:", message.status, message.details || "");
    
    // Forward logs to popup
    chrome.runtime.sendMessage({
      type: "LOG",
      message: message.message || `Status: ${message.status}`,
      level: message.level || 'info'
    }).catch(() => {});
    return;
  }

  if (message?.type === "AUTOMATION_DONE") {
    const count = message.appliedCount || 0;
    console.log(`Automation finished. Applied to ${count} jobs.`);

    // Clear automation state
    chrome.storage.local.remove(['automationRunning', 'lastHeartbeat', 'automationState']);

    chrome.runtime.sendMessage({
      type: "LOG",
      message: `Completed! Applied to ${count} jobs.`,
      level: 'success'
    }).catch(() => {});

    if (chrome.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Job Automation Complete",
        message: `Applied to ${count} job(s).`,
      });
    }
  }
});

// Start crash monitor when service worker starts
startCrashMonitor();

