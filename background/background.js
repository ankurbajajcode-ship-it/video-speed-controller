/**
 * Video Speed Controller - Background Service Worker
 * Listens for keyboard shortcuts via chrome.commands and coordinates actions.
 */

try {
  importScripts('/utils/constants.js');
} catch (e) {
  // If constants already defined or not needed
}

const isRestricted = (typeof isRestrictedUrl === 'function')
  ? isRestrictedUrl
  : (url => !url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:'));

// Ensure default storage structure on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.get(['site_speeds'], (result) => {
      if (!result.site_speeds) {
        chrome.storage.local.set({ site_speeds: {} });
      }
    });
  }
});

/**
 * Send action to the active tab in current window
 */
function sendCommandToActiveTab(actionName) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
      return;
    }

    const activeTab = tabs[0];
    if (!activeTab.id || isRestricted(activeTab.url)) {
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, { action: actionName }, () => {
      // Suppress unchecked lastError when content script isn't running on tab
      if (chrome.runtime.lastError) {
        // Tab may not have finished loading or content script is not loaded
      }
    });
  });
}

/**
 * Handle registered keyboard commands
 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'increase_speed' || command === 'decrease_speed' || command === 'reset_speed') {
    sendCommandToActiveTab(command);
  }
});
