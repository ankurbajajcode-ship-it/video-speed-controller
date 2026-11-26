/**
 * Video Speed Controller - Constants & Utilities
 * Compatible with Browser Window, Service Worker, and Node.js environments.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    const exportsObj = factory();
    Object.assign(root, exportsObj);
    if (typeof globalThis !== 'undefined') {
      Object.assign(globalThis, exportsObj);
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Exactly 15 required presets
  const SPEED_PRESETS = Object.freeze([
    0.25, 0.50, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00, 3.25, 3.50, 3.75, 4.00
  ]);

  const DEFAULT_SPEED = 1.00;
  const MIN_SPEED = SPEED_PRESETS[0]; // 0.25
  const MAX_SPEED = SPEED_PRESETS[SPEED_PRESETS.length - 1]; // 4.00

  /**
   * Format speed to 2 decimal places with 'x' suffix (e.g. 1.50x, 2.00x)
   */
  function formatSpeed(speed) {
    if (speed == null) return '1.00x';
    const val = Number(speed);
    if (isNaN(val) || val <= 0) return '1.00x';
    return `${val.toFixed(2)}x`;
  }

  /**
   * Find the next preset speed strictly greater than current speed
   */
  function getNextSpeed(currentSpeed) {
    const curr = Math.round(Number(currentSpeed) * 100) / 100;
    for (let i = 0; i < SPEED_PRESETS.length; i++) {
      if (SPEED_PRESETS[i] > curr + 0.001) {
        return SPEED_PRESETS[i];
      }
    }
    return MAX_SPEED;
  }

  /**
   * Find the previous preset speed strictly less than current speed
   */
  function getPrevSpeed(currentSpeed) {
    const curr = Math.round(Number(currentSpeed) * 100) / 100;
    for (let i = SPEED_PRESETS.length - 1; i >= 0; i--) {
      if (SPEED_PRESETS[i] < curr - 0.001) {
        return SPEED_PRESETS[i];
      }
    }
    return MIN_SPEED;
  }

  /**
   * Clamp speed between MIN_SPEED and MAX_SPEED
   */
  function clampSpeed(speed) {
    const val = Number(speed);
    if (isNaN(val)) return DEFAULT_SPEED;
    if (val < MIN_SPEED) return MIN_SPEED;
    if (val > MAX_SPEED) return MAX_SPEED;
    return Math.round(val * 100) / 100;
  }

  /**
   * Normalize hostname/URL into a clean domain key for storage
   * e.g. "https://www.youtube.com/watch?v=..." -> "youtube.com"
   * e.g. "m.youtube.com" -> "youtube.com"
   * e.g. "netflix.com" -> "netflix.com"
   * e.g. "file:///.../test.html" -> "local-file"
   */
  function normalizeDomain(input) {
    if (!input || typeof input !== 'string') return '';
    let host = input.toLowerCase().trim();

    // Handle local file protocol
    if (host.startsWith('file:')) {
      return 'local-file';
    }

    if (host.includes('://')) {
      try {
        if (typeof URL !== 'undefined') {
          host = new URL(host).hostname;
        } else {
          host = host.split('://')[1].split('/')[0];
        }
      } catch (_) {
        host = host.split('://')[1] ? host.split('://')[1].split('/')[0] : host;
      }
    } else {
      host = host.split('/')[0];
    }

    // Remove port if present
    host = host.split(':')[0];

    // Strip leading www.
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }

    // Normalize common mobile subdomains like m.youtube.com -> youtube.com
    if (host.startsWith('m.') && host.split('.').length > 2) {
      host = host.slice(2);
    }

    return host;
  }

  /**
   * Helper: check if a URL is restricted from extension script injection
   */
  function isRestrictedUrl(url) {
    if (!url || typeof url !== 'string') return true;
    const lower = url.toLowerCase().trim();
    return (
      lower.startsWith('chrome://') ||
      lower.startsWith('chrome-extension://') ||
      lower.startsWith('edge://') ||
      lower.startsWith('brave://') ||
      lower.startsWith('opera://') ||
      lower.startsWith('about:') ||
      lower.startsWith('devtools://') ||
      lower.startsWith('view-source:')
    );
  }

  return {
    SPEED_PRESETS,
    DEFAULT_SPEED,
    MIN_SPEED,
    MAX_SPEED,
    formatSpeed,
    getNextSpeed,
    getPrevSpeed,
    clampSpeed,
    normalizeDomain,
    isRestrictedUrl
  };
});
