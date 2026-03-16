# 🤖 JobPilot  — BOSS直聘 Auto job Apply Chrome Extension

> **JobPilot** is a Chrome Manifest V3 extension that automates job applications on [BOSS直聘 (zhipin.com)](https://www.zhipin.com). It searches for jobs by keyword, clicks the **沟通 (Communicate)** button on each listing, tracks applied jobs to prevent duplicates, and recovers automatically from crashes.

---

## ✨ Features

- 🔍 Auto-searches jobs via URL query (`/web/geek/jobs?query=<keywords>`)
- 🌐 **Remote / On-site toggle** — appends `&jobType=1902` for remote jobs
- 💬 Clicks the **沟通** button on each unapplied job card
- 🚫 Duplicate prevention — tracks applied job IDs in `chrome.storage.sync`
- ⏱️ Random delay (10–60s) between applications to mimic human behavior
- 💥 Crash recovery — heartbeat system detects and resumes interrupted sessions
- 🛑 Start / Stop toggle directly from the popup
- 📋 Live automation log panel in the popup
- 🔔 Browser notification on completion

---

## 📁 File Structure

```
BossApply/
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker: tab management, script injection, crash monitor
├── content.js             # Injected into zhipin.com: applies to jobs, heartbeat, state recovery
├── utils/
│   └── helpers.js         # DOM utilities: wait, $, $all, clickElement, waitForElement, etc.
├── popup/
│   ├── popup.html         # Popup UI: keywords, location, job type toggle, max apps, log panel
│   ├── popup.js           # Popup logic: save prefs, start/stop, live log display
│   └── popup.css          # Popup styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🚀 Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. Pin the extension via the 🧩 puzzle-piece icon in the toolbar.

---

## 🛠️ Usage

1. Click the **BossApply** extension icon.
2. Fill in:
   - **Job Keywords** — e.g. `前端开发`, `SEO`, `产品经理`
   - **Location** — stored for reference (not yet used in search URL)
   - **Job Type** — toggle between `🏢 On-site` (default) and `🌐 Remote`
   - **Max Applications per Run** — default `10`, max `100`
3. Click **Save and Start Automation**.
4. The extension will open/focus a zhipin.com tab, wait for listings to load, and begin applying.
5. A browser notification appears when the run completes.
6. Click **Stop Automation** at any time to halt the process.

---

## ⚙️ How It Works

### `background.js` — Service Worker
- Listens for `START_AUTOMATION` from the popup (includes `query` and `jobType`).
- Builds the search URL using `URLSearchParams` — appends `?query=...` and `&jobType=1902` only when each value is present.
- Finds an existing zhipin.com tab or opens a new one, navigating to the jobs search URL.
- Waits for the tab to fully load, then injects `utils/helpers.js` and `content.js`.
- Runs a **crash monitor** every 10 seconds — if no heartbeat is received for 15s, it reads `jobKeywords` and `jobType` from storage and automatically resumes automation.
- Forwards log messages to the popup and shows a completion notification via `chrome.notifications`.

### `content.js` — Page Automation
- Checks `automationRunning` flag in `chrome.storage.local` before starting.
- Sends a **heartbeat** to storage every 5 seconds so the crash monitor knows it's alive.
- Loads preferences (`jobKeywords`, `maxApplicationsPerRun`) from `chrome.storage.sync`.
- Waits for `.rec-job-list` to appear, then loops through `.card-area` job cards.
- **Apply flow per job:**
  1. If a `.card-area.is-seen` card exists → click `.op-btn.op-btn-chat` directly.
  2. Otherwise → click `.job-card-wrap` to activate the card, then click `.op-btn.op-btn-chat`.
- Waits a **random 10–60 seconds** between each application.
- Saves progress to `chrome.storage.local` for crash recovery.
- Sends `AUTOMATION_DONE` to background when the run finishes.

### `popup/popup.js` — Popup UI
- Loads saved preferences on open, including the active job type toggle state.
- **Job Type toggle** — `🏢 On-site` sets `jobType: ""`, `🌐 Remote` sets `jobType: "1902"`. Selection is persisted to `chrome.storage.sync`.
- Submits `START_AUTOMATION` message with `query` and `jobType` to the background.
- Sends `STOP_AUTOMATION` directly to the content script in the zhipin tab.
- Displays a **live log panel** with timestamped entries (info / success / warning / error).
- Polls every 2 seconds to sync the Start/Stop button state with `automationRunning`.

### `utils/helpers.js` — DOM Utilities

| Function | Description |
|---|---|
| `wait(ms)` | Promise-based delay |
| `$(selector, root)` | Safe `querySelector` wrapper |
| `$all(selector, root)` | Safe `querySelectorAll` wrapper |
| `clickElement(selector, root)` | Scroll into view + click |
| `typeInto(selector, value, root)` | Set input value + fire events |
| `waitForElement(selector, ms)` | MutationObserver-based element wait |
| `getJobFromCard(card)` | Extract job title from `.card-area` |
| `getJobList(root)` | Return all jobs on the page |

---

## 🔗 Search URL Format

| Mode | URL |
|---|---|
| On-site | `https://www.zhipin.com/web/geek/jobs?query=SEO` |
| Remote | `https://www.zhipin.com/web/geek/jobs?query=SEO&jobType=1902` |
| No keyword (On-site) | `https://www.zhipin.com/web/geek/jobs` |
| No keyword (Remote) | `https://www.zhipin.com/web/geek/jobs?jobType=1902` |

---

## 🔐 Permissions

| Permission | Purpose |
|---|---|
| `tabs` | Find or open the zhipin.com tab |
| `activeTab` | Interact with the active tab |
| `storage` | Save preferences, applied jobs, and automation state |
| `scripting` | Inject `helpers.js` and `content.js` |
| `notifications` | Show completion notification |
| `host_permissions: zhipin.com/*` | Required to inject scripts into the site |

### Storage Keys

| Key | Store | Description |
|---|---|---|
| `jobKeywords` | `sync` | Search keywords |
| `location` | `sync` | Location preference (UI only) |
| `jobType` | `sync` | `""` for on-site, `"1902"` for remote |
| `maxApplicationsPerRun` | `sync` | Application cap per run |
| `appliedJobs` | `sync` | Array of applied job IDs |
| `automationRunning` | `local` | Boolean flag for active session |
| `lastHeartbeat` | `local` | Timestamp for crash detection |
| `automationState` | `local` | Crash recovery snapshot |
| `automationLogs` | `local` | Last 50 log entries |

---

## 🧩 DOM Selectors (zhipin.com)

```js
const SELECTORS = {
  jobList:        ".rec-job-list",
  jobCard:        ".card-area",
  seenJobCard:    ".card-area.is-seen",
  jobCardWrap:    ".job-card-wrap",
  communicateBtn: ".op-btn.op-btn-chat",
  continueBtn:    ".sure-btn",
};
```

> If zhipin.com updates its DOM, use Chrome DevTools → Inspect to find the new selectors and update `content.js`.

---

## ⚠️ Limitations

- Only works on **BOSS直聘 (zhipin.com)**
- Location filter is saved but not applied to the search URL
- No salary or experience-level filtering
- Random delay may still be detectable by anti-bot systems

---

## 🗺️ Roadmap

- [x] Remote / On-site job type filter
- [ ] Implement location filtering in the search URL
- [ ] Add salary and experience filters
- [ ] Export applied jobs history as CSV
- [ ] Handle multi-step communication dialogs
- [ ] Support additional job platforms

---

## 📄 License

MIT
