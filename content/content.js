/**
 * Video Speed Controller - Content Script
 * Handles video detection, playbackRate control, on-screen display, and shortcut listeners.
 */

(function () {
  'use strict';

  // Prevent multiple initializations in the same frame
  if (window.__vsc_initialized) return;
  window.__vsc_initialized = true;

  // Retrieve constants and helpers from constants.js (injected before this script)
  const PRESETS = (typeof SPEED_PRESETS !== 'undefined')
    ? SPEED_PRESETS
    : [0.25, 0.50, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00, 3.25, 3.50, 3.75, 4.00];

  const DEFAULT_SPD = (typeof DEFAULT_SPEED !== 'undefined') ? DEFAULT_SPEED : 1.00;
  const formatSpd = (typeof formatSpeed === 'function') ? formatSpeed : (s => `${Number(s).toFixed(2)}x`);
  const getNextSpd = (typeof getNextSpeed === 'function') ? getNextSpeed : (s => s + 0.25);
  const getPrevSpd = (typeof getPrevSpeed === 'function') ? getPrevSpeed : (s => s - 0.25);
  const clampSpd = (typeof clampSpeed === 'function') ? clampSpeed : (s => Math.max(0.25, Math.min(4, s)));
  const normalizeDom = (typeof normalizeDomain === 'function') ? normalizeDomain : (h => h);

  const siteDomain = normalizeDom(window.location.hostname || window.location.href);
  let currentSpeed = DEFAULT_SPD;
  const boundVideos = new WeakSet();
  let overlayEl = null;
  let overlayTimer = null;
  let overlayRemoveTimer = null;
  let lastActionTime = 0;
  let mutationDebounceTimer = null;

  /**
   * Find all <video> elements on the page, including open Shadow DOMs
   */
  function getAllVideos(root = document) {
    const videos = [];
    try {
      if (root.querySelectorAll) {
        const found = root.querySelectorAll('video');
        for (let i = 0; i < found.length; i++) {
          videos.push(found[i]);
        }
      }

      // Check shadow roots for web components / custom players
      const walker = document.createTreeWalker(
        root instanceof Document ? (root.body || root.documentElement) : root,
        NodeFilter.SHOW_ELEMENT,
        null
      );
      let node = walker.currentNode;
      while (node) {
        if (node.shadowRoot) {
          videos.push(...getAllVideos(node.shadowRoot));
        }
        node = walker.nextNode();
      }
    } catch (e) {
      // Graceful fallback
    }
    return Array.from(new Set(videos));
  }

  /**
   * Determine primary or most relevant active video on page
   */
  function getPrimaryVideo() {
    const videos = getAllVideos();
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    // 1. Currently playing video
    const playing = videos.find(v => !v.paused && !v.ended && v.readyState > 2);
    if (playing) return playing;

    // 2. Video in fullscreen
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      const fs = videos.find(v => fsEl.contains(v) || fsEl === v);
      if (fs) return fs;
    }

    // 3. Largest visible video by area
    let maxArea = 0;
    let largest = videos[0];
    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea) {
        maxArea = area;
        largest = v;
      }
    }
    return largest;
  }

  /**
   * Apply speed to a single video element safely without recursion loops
   */
  function applySpeedToVideo(video, speed) {
    if (!video || typeof video.playbackRate !== 'number') return;

    if (Math.abs(video.playbackRate - speed) > 0.001) {
      try {
        video.__vsc_setting_rate = true;
        video.playbackRate = speed;
      } catch (err) {
        console.warn('[Video Speed Controller] Unable to set playbackRate:', err);
      } finally {
        video.__vsc_setting_rate = false;
      }
    }
  }

  /**
   * Attach lifecycle and rate change observers to a video element
   */
  function bindVideo(video) {
    if (!video || boundVideos.has(video)) return;
    boundVideos.add(video);

    // Initial speed application
    applySpeedToVideo(video, currentSpeed);

    // Enforce speed when metadata loads or playback starts (handles dynamic track switches)
    const onStart = () => {
      applySpeedToVideo(video, currentSpeed);
    };
    video.addEventListener('loadedmetadata', onStart, { passive: true });
    video.addEventListener('play', onStart, { passive: true });
    video.addEventListener('playing', onStart, { passive: true });

    // Handle site scripts attempting to reset or clamp rate
    video.addEventListener('ratechange', () => {
      if (video.__vsc_setting_rate) return;

      // If site reset the rate away from currentSpeed, re-enforce after a small delay
      if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
        if (!video.__vsc_rate_retry_count) video.__vsc_rate_retry_count = 0;

        if (video.__vsc_rate_retry_count < 3) {
          video.__vsc_rate_retry_count++;
          setTimeout(() => {
            applySpeedToVideo(video, currentSpeed);
          }, 100);
          setTimeout(() => {
            video.__vsc_rate_retry_count = 0;
          }, 1000);
        }
      }
    }, { passive: true });
  }

  /**
   * Scan page and bind all detected videos
   */
  function scanAndBindVideos() {
    const videos = getAllVideos();
    videos.forEach(bindVideo);
    return videos;
  }

  /**
   * Create or retrieve the on-screen overlay element using strict DOM methods (Strict CSP Compliant)
   */
  function getOrCreateOverlay() {
    if (overlayEl && document.contains(overlayEl)) {
      return overlayEl;
    }

    const container = document.createElement('div');
    container.className = '__vsc_overlay_container';
    container.setAttribute('aria-hidden', 'true');

    const badge = document.createElement('div');
    badge.className = '__vsc_overlay_badge';

    // SVG icon created via createElementNS for strict CSP compliance
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', '__vsc_overlay_icon');
    svg.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z');
    svg.appendChild(path);

    const textSpan = document.createElement('span');
    textSpan.className = '__vsc_overlay_text';
    textSpan.textContent = '1.00x';

    badge.appendChild(svg);
    badge.appendChild(textSpan);
    container.appendChild(badge);

    overlayEl = container;
    return overlayEl;
  }

  /**
   * Show on-screen speed indicator centered on current video or fullscreen element
   */
  function showSpeedIndicator(speed) {
    const overlay = getOrCreateOverlay();
    const textEl = overlay.querySelector('.__vsc_overlay_text');
    if (textEl) {
      textEl.textContent = formatSpd(speed);
    }

    const primaryVideo = getPrimaryVideo();
    const fullscreenEl = document.fullscreenElement || document.webkitFullscreenElement;

    // Attach overlay to the appropriate DOM container
    if (fullscreenEl) {
      if (overlay.parentElement !== fullscreenEl) {
        fullscreenEl.appendChild(overlay);
      }
      overlay.style.position = 'fixed';
      overlay.style.left = '50%';
      overlay.style.top = '50%';
    } else if (primaryVideo) {
      const rect = primaryVideo.getBoundingClientRect();
      const parent = document.body || document.documentElement;
      if (overlay.parentElement !== parent) {
        parent.appendChild(overlay);
      }

      if (rect.width > 0 && rect.height > 0) {
        overlay.style.position = 'fixed';
        overlay.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
        overlay.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
      } else {
        overlay.style.position = 'fixed';
        overlay.style.left = '50%';
        overlay.style.top = '50%';
      }
    } else {
      const parent = document.body || document.documentElement;
      if (overlay.parentElement !== parent) {
        parent.appendChild(overlay);
      }
      overlay.style.position = 'fixed';
      overlay.style.left = '50%';
      overlay.style.top = '50%';
    }

    // Force reflow and display badge
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      overlay.classList.add('__vsc_visible');
    });

    // Clear previous timers
    if (overlayTimer) clearTimeout(overlayTimer);
    if (overlayRemoveTimer) clearTimeout(overlayRemoveTimer);

    // Hide after ~1.2 seconds, complete animation by ~1.5 seconds
    overlayTimer = setTimeout(() => {
      overlay.classList.remove('__vsc_visible');
      overlayRemoveTimer = setTimeout(() => {
        overlay.style.display = 'none';
      }, 300);
    }, 1200);
  }

  /**
   * Set playback speed, persist in per-website storage, and update UI
   */
  function setSpeed(newSpeed, { showIndicator = true, saveStorage = true } = {}) {
    const clamped = clampSpd(newSpeed);
    currentSpeed = clamped;

    const videos = scanAndBindVideos();
    videos.forEach(v => applySpeedToVideo(v, currentSpeed));

    if (showIndicator && (videos.length > 0 || document.fullscreenElement)) {
      showSpeedIndicator(currentSpeed);
    }

    if (saveStorage && siteDomain && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const siteKey = 'site_' + siteDomain;
      chrome.storage.local.get(['site_speeds'], (result) => {
        const siteSpeeds = result.site_speeds || {};
        siteSpeeds[siteDomain] = currentSpeed;
        chrome.storage.local.set({
          [siteKey]: currentSpeed,
          site_speeds: siteSpeeds
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[Video Speed Controller] Storage save failed:', chrome.runtime.lastError);
          }
        });
      });
    }

    return currentSpeed;
  }

  /**
   * Load stored speed preference for current domain
   */
  function loadSavedSpeed() {
    if (!siteDomain || typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      scanAndBindVideos();
      return;
    }

    const siteKey = 'site_' + siteDomain;
    chrome.storage.local.get([siteKey, 'site_speeds'], (result) => {
      if (chrome.runtime.lastError) return;
      const saved = (result && result[siteKey] !== undefined)
        ? result[siteKey]
        : (result && result.site_speeds && result.site_speeds[siteDomain] !== undefined)
          ? result.site_speeds[siteDomain]
          : null;

      if (saved != null) {
        const clamped = clampSpd(saved);
        setSpeed(clamped, { showIndicator: false, saveStorage: false });
      } else {
        scanAndBindVideos();
      }
    });
  }

  /**
   * Step actions
   */
  function increaseSpeed() {
    const next = getNextSpd(currentSpeed);
    return setSpeed(next);
  }

  function decreaseSpeed() {
    const prev = getPrevSpd(currentSpeed);
    return setSpeed(prev);
  }

  function resetSpeed() {
    return setSpeed(DEFAULT_SPD);
  }

  /**
   * Dispatch action with debounce protection against double triggers
   */
  function handleAction(actionName) {
    const now = Date.now();
    if (now - lastActionTime < 120) {
      return; // Debounce duplicate triggers within 120ms
    }
    lastActionTime = now;

    switch (actionName) {
      case 'increase_speed':
        increaseSpeed();
        break;
      case 'decrease_speed':
        decreaseSpeed();
        break;
      case 'reset_speed':
        resetSpeed();
        break;
    }
  }

  /**
   * Helper: check if target is an editable form element
   */
  function isEditableElement(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      el.isContentEditable ||
      el.getAttribute?.('contenteditable') === 'true' ||
      el.getAttribute?.('role') === 'textbox'
    );
  }

  /**
   * In-page keyboard shortcut listener (macOS Command+Shift+., Command+Shift+,, Command+Shift+0)
   */
  function handleKeyDown(e) {
    if (isEditableElement(e.target) || isEditableElement(document.activeElement)) {
      return;
    }

    // Require Command (metaKey) or Ctrl + Shift
    const hasMod = (e.metaKey || e.ctrlKey) && e.shiftKey;
    if (!hasMod) return;

    // Command + Shift + . (or >) -> Increase
    if (e.code === 'Period' || e.key === '.' || e.key === '>') {
      e.preventDefault();
      e.stopPropagation();
      handleAction('increase_speed');
      return;
    }

    // Command + Shift + , (or <) -> Decrease
    if (e.code === 'Comma' || e.key === ',' || e.key === '<') {
      e.preventDefault();
      e.stopPropagation();
      handleAction('decrease_speed');
      return;
    }

    // Command + Shift + 0 (or ')') -> Reset
    if (e.code === 'Digit0' || e.key === '0' || e.key === ')') {
      e.preventDefault();
      e.stopPropagation();
      handleAction('reset_speed');
      return;
    }
  }

  /**
   * Listen for messages from background script or popup
   */
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.action) return false;

      // In multi-frame pages (e.g. ad iframes), iframes without videos should not hijack or duplicate actions
      const videos = scanAndBindVideos();
      if (window !== window.top && videos.length === 0) {
        return false;
      }

      switch (message.action) {
        case 'get_status': {
          const primary = getPrimaryVideo();
          sendResponse({
            success: true,
            currentSpeed,
            siteDomain,
            videoCount: videos.length,
            isPlaying: !!(primary && !primary.paused && !primary.ended)
          });
          return true;
        }

        case 'set_speed': {
          const val = Number(message.speed);
          const shouldSave = message.saveStorage !== undefined ? !!message.saveStorage : true;
          setSpeed(val, { showIndicator: true, saveStorage: shouldSave });
          sendResponse({ success: true, currentSpeed });
          return true;
        }

        case 'increase_speed':
        case 'decrease_speed':
        case 'reset_speed': {
          handleAction(message.action);
          sendResponse({ success: true, currentSpeed });
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Synchronize if storage changes in another tab for this site
   */
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        const siteKey = 'site_' + siteDomain;
        let newSpeed = null;
        if (changes[siteKey] && changes[siteKey].newValue !== undefined) {
          newSpeed = changes[siteKey].newValue;
        } else if (changes.site_speeds && changes.site_speeds.newValue && changes.site_speeds.newValue[siteDomain] !== undefined) {
          newSpeed = changes.site_speeds.newValue[siteDomain];
        }

        if (newSpeed != null) {
          const clamped = clampSpd(newSpeed);
          if (Math.abs(clamped - currentSpeed) > 0.001) {
            setSpeed(clamped, { showIndicator: false, saveStorage: false });
          }
        }
      }
    });
  }

  /**
   * Debounced dynamic video detection using MutationObserver
   */
  const observer = new MutationObserver((mutations) => {
    let hasAddedNodes = false;
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
        hasAddedNodes = true;
        break;
      }
    }
    if (hasAddedNodes) {
      if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(() => {
        scanAndBindVideos();
      }, 150);
    }
  });

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }, { once: true });
    }
  }

  /**
   * Single-Page Application (SPA) navigation detection
   * Handles YouTube (yt-navigate-finish), History API pushState/replaceState, popstate, hashchange
   */
  function onNavigation() {
    setTimeout(() => {
      scanAndBindVideos();
      const videos = getAllVideos();
      videos.forEach(v => applySpeedToVideo(v, currentSpeed));
    }, 250);
  }

  // Intercept History API for React/Vue/Angular SPAs
  try {
    const origPushState = history.pushState;
    if (typeof origPushState === 'function') {
      history.pushState = function (...args) {
        const res = origPushState.apply(this, args);
        onNavigation();
        return res;
      };
    }
    const origReplaceState = history.replaceState;
    if (typeof origReplaceState === 'function') {
      history.replaceState = function (...args) {
        const res = origReplaceState.apply(this, args);
        onNavigation();
        return res;
      };
    }
  } catch (e) {
    // Restricted in some environments
  }

  window.addEventListener('yt-navigate-finish', onNavigation, { passive: true });
  window.addEventListener('yt-page-data-updated', onNavigation, { passive: true });
  window.addEventListener('popstate', onNavigation, { passive: true });
  window.addEventListener('hashchange', onNavigation, { passive: true });

  // Capture play events on document to immediately bind dynamically inserted videos without waiting for mutation debounce
  window.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      bindVideo(e.target);
    }
  }, true);

  // Attach keydown listener in capture phase
  window.addEventListener('keydown', handleKeyDown, true);

  // Initialize
  startObserver();
  loadSavedSpeed();
})();
