/**
 * Video Speed Controller - Popup Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // Constants fallback if not loaded globally
  const PRESETS = (typeof SPEED_PRESETS !== 'undefined')
    ? SPEED_PRESETS
    : [0.25, 0.50, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00, 3.25, 3.50, 3.75, 4.00];

  const normalizeDom = (typeof normalizeDomain === 'function') ? normalizeDomain : (u => u);
  const getNextSpd = (typeof getNextSpeed === 'function') ? getNextSpeed : (s => s + 0.25);
  const getPrevSpd = (typeof getPrevSpeed === 'function') ? getPrevSpeed : (s => s - 0.25);
  const clampSpd = (typeof clampSpeed === 'function') ? clampSpeed : (s => s);
  const isRestricted = (typeof isRestrictedUrl === 'function')
    ? isRestrictedUrl
    : (url => !url || url.startsWith('chrome://') || url.startsWith('about:'));

  // DOM Elements
  const siteDomainText = document.getElementById('siteDomainText');
  const currentSpeedDisplay = document.getElementById('currentSpeedDisplay');
  const videoStatusPill = document.getElementById('videoStatusPill');
  const videoStatusText = document.getElementById('videoStatusText');
  const presetsGrid = document.getElementById('presetsGrid');
  const btnDecrease = document.getElementById('btnDecrease');
  const btnReset = document.getElementById('btnReset');
  const btnIncrease = document.getElementById('btnIncrease');
  const linkConfigureShortcuts = document.getElementById('linkConfigureShortcuts');

  let activeTabId = null;
  let activeDomain = '';
  let currentSpeed = 1.00;

  /**
   * Render all 15 preset buttons into the grid
   */
  function renderPresets() {
    presetsGrid.innerHTML = '';
    PRESETS.forEach(speed => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.dataset.speed = speed.toFixed(2);
      btn.textContent = `${speed.toFixed(2)}x`;

      btn.addEventListener('click', () => {
        applySpeed(speed);
      });

      presetsGrid.appendChild(btn);
    });
  }

  /**
   * Update UI display and active preset highlights
   */
  function updateSpeedUI(speed) {
    currentSpeed = Number(speed) || 1.00;
    currentSpeedDisplay.textContent = currentSpeed.toFixed(2);

    const buttons = presetsGrid.querySelectorAll('.preset-btn');
    buttons.forEach(btn => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(btnSpeed - currentSpeed) < 0.001) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Update video status indicator
   */
  function setVideoStatus(statusType, text) {
    videoStatusPill.className = 'video-status-indicator ' + statusType;
    videoStatusText.textContent = text;
  }

  /**
   * Persist speed in storage for active domain
   */
  function saveToStorage(domain, speed) {
    if (!domain || !chrome.storage || !chrome.storage.local) return;
    const siteKey = 'site_' + domain;
    chrome.storage.local.get(['site_speeds'], (res) => {
      const siteSpeeds = (res && res.site_speeds) || {};
      siteSpeeds[domain] = speed;
      chrome.storage.local.set({
        [siteKey]: speed,
        site_speeds: siteSpeeds
      });
    });
  }

  /**
   * Apply speed: send to active tab & persist in per-site storage
   */
  function applySpeed(newSpeed) {
    const clamped = clampSpd(newSpeed);
    updateSpeedUI(clamped);
    saveToStorage(activeDomain, clamped);

    // Send to content script in active tab (popup already persisted to storage)
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { action: 'set_speed', speed: clamped, saveStorage: false }, (response) => {
        if (chrome.runtime.lastError) {
          // Tab may not have content script running
        } else if (response && response.currentSpeed) {
          updateSpeedUI(response.currentSpeed);
        }
      });
    }
  }

  /**
   * Dispatch step actions (increase, decrease, reset)
   */
  function dispatchAction(actionName) {
    if (actionName === 'increase_speed') {
      applySpeed(getNextSpd(currentSpeed));
    } else if (actionName === 'decrease_speed') {
      applySpeed(getPrevSpd(currentSpeed));
    } else if (actionName === 'reset_speed') {
      applySpeed(1.00);
    }
  }

  // Button Listeners
  btnDecrease.addEventListener('click', () => dispatchAction('decrease_speed'));
  btnIncrease.addEventListener('click', () => dispatchAction('increase_speed'));
  btnReset.addEventListener('click', () => dispatchAction('reset_speed'));

  // Link to configure keyboard shortcuts in Chrome
  if (linkConfigureShortcuts) {
    linkConfigureShortcuts.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  // Build presets buttons
  renderPresets();

  // Query active tab and initialize
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      siteDomainText.textContent = 'No active tab';
      setVideoStatus('status-warning', 'No active tab');
      return;
    }

    const tab = tabs[0];
    activeTabId = tab.id;

    if (!tab.url) {
      siteDomainText.textContent = 'Unknown tab';
      setVideoStatus('status-warning', 'No web page');
      return;
    }

    if (isRestricted(tab.url)) {
      siteDomainText.textContent = 'System page';
      setVideoStatus('status-warning', 'Extensions restricted here');
      return;
    }

    activeDomain = normalizeDom(tab.url);
    siteDomainText.textContent = activeDomain || 'Web page';

    // 1. Check stored speed for this site first (atomic site key + dictionary fallback)
    if (chrome.storage && chrome.storage.local) {
      const siteKey = 'site_' + activeDomain;
      chrome.storage.local.get([siteKey, 'site_speeds'], (res) => {
        let saved = null;
        if (res && res[siteKey] !== undefined) {
          saved = res[siteKey];
        } else if (res && res.site_speeds && res.site_speeds[activeDomain] !== undefined) {
          saved = res.site_speeds[activeDomain];
        }

        if (saved != null) {
          updateSpeedUI(saved);
        } else {
          updateSpeedUI(1.00);
        }
      });
    }

    // 2. Query content script for live status
    chrome.tabs.sendMessage(activeTabId, { action: 'get_status' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setVideoStatus('status-warning', 'No video detected');
        return;
      }

      if (response.currentSpeed) {
        updateSpeedUI(response.currentSpeed);
      }

      if (response.videoCount > 0) {
        const vText = response.videoCount === 1 ? '1 video' : `${response.videoCount} videos`;
        const stateText = response.isPlaying ? 'playing' : 'detected';
        setVideoStatus('status-active', `${vText} ${stateText}`);
      } else {
        setVideoStatus('status-warning', 'No video detected');
      }
    });
  });
});
