// utils/helpers.js
// Common helper functions for DOM interaction and timing.

/**
 * Wait for the specified milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Query a single element with error handling.
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {Element|null}
 */
function $(selector, root) {
  try {
    return (root || document).querySelector(selector);
  } catch (e) {
    console.warn("Invalid selector:", selector, e);
    return null;
  }
}

/**
 * Query multiple elements with error handling.
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {NodeListOf<Element>}
 */
function $all(selector, root) {
  try {
    return (root || document).querySelectorAll(selector);
  } catch (e) {
    console.warn("Invalid selector:", selector, e);
    return [];
  }
}

/**
 * Safely click an element matching the selector.
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {boolean} whether the click was attempted
 */
function clickElement(selector, root) {
  const el = $(selector, root);
  if (!el) return false;
  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.click();
    return true;
  } catch (e) {
    console.warn("Failed to click element:", selector, e);
    return false;
  }
}

/**
 * Type text into an input/textarea.
 * @param {string} selector
 * @param {string} value
 * @param {ParentNode} [root=document]
 * @returns {boolean}
 */
function typeInto(selector, value, root) {
  const el = $(selector, root);
  if (!el) return false;
  try {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (e) {
    console.warn("Failed to type into element:", selector, e);
    return false;
  }
}

/**
 * Wait for an element to appear in the DOM.
 * @param {string} selector
 * @param {number} timeoutMs
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeoutMs = 10000) {
  const existing = $(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = $(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * BOSS直聘 (zhipin.com): extract job data from a card.
 */
function getJobFromCard(card) {
  if (!card) return { title: "", company: "", location: "" };
  const wrap = card.querySelector(".job-card-wrap");
  return {
    title: wrap?.textContent?.trim() || "",
    company: "",
    location: "",
  };
}

/**
 * BOSS直聘: get list of jobs from all .card-area elements.
 */
function getJobList(root) {
  const base = root || document;
  const cards = base.querySelectorAll(".card-area");
  return [...cards].map(getJobFromCard);
}

