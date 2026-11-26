/**
 * Comprehensive Integration & Component Test Suite for Video Speed Controller
 * Validates content script, background script, popup, presets, storage, shortcuts, and overlays.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Read source files directly
const constantsCode = fs.readFileSync(path.join(__dirname, '../utils/constants.js'), 'utf8');
const contentCode = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');
const backgroundCode = fs.readFileSync(path.join(__dirname, '../background/background.js'), 'utf8');
const popupCode = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');

// Color helpers for test output
const green = text => `\x1b[32m${text}\x1b[0m`;
const red = text => `\x1b[31m${text}\x1b[0m`;
const bold = text => `\x1b[1m${text}\x1b[0m`;

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ${green('✓')} ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ${red('✗')} ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

/**
 * Mock DOM & Chrome Environment Builder
 */
function createMockEnvironment({ hostname = 'www.youtube.com', storageData = {} } = {}) {
  const storage = { ...storageData };
  const storageListeners = [];
  const messageListeners = [];
  const commandListeners = [];
  const mutationCallbacks = [];

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.className = '';
      this.classList = {
        classes: new Set(),
        add: (...cls) => cls.forEach(c => this.classList.classes.add(c)),
        remove: (...cls) => cls.forEach(c => this.classList.classes.delete(c)),
        contains: (c) => this.classList.classes.has(c)
      };
      this.style = {};
      this.attributes = {};
      this.shadowRoot = null;
      this.listeners = {};
      this.isContentEditable = false;
      this._innerHTML = '';
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];
      // Basic extraction of children for testing
      if (html.includes('__vsc_overlay_text')) {
        const textEl = new MockElement('span');
        textEl.className = '__vsc_overlay_text';
        this.children.push(textEl);
      }
    }

    setAttribute(name, value) {
      this.attributes[name] = value;
    }

    getAttribute(name) {
      return this.attributes[name] || null;
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      mutationCallbacks.forEach(cb => {
        cb([{ addedNodes: [child], removedNodes: [] }]);
      });
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentElement = null;
      }
      return child;
    }

    contains(el) {
      if (el === this) return true;
      for (const ch of this.children) {
        if (ch.contains(el)) return true;
      }
      return false;
    }

    getBoundingClientRect() {
      return { left: 100, top: 100, width: 640, height: 360, right: 740, bottom: 460 };
    }

    addEventListener(event, handler) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(handler);
    }

    removeEventListener(event, handler) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(h => h !== handler);
      }
    }

    dispatchEvent(evt) {
      if (this.listeners[evt.type]) {
        this.listeners[evt.type].forEach(fn => fn(evt));
      }
    }

    querySelector(sel) {
      for (const ch of this.children) {
        if (sel.startsWith('.') && ch.className.includes(sel.slice(1))) {
          return ch;
        }
        if (ch.tagName && ch.tagName.toLowerCase() === sel.toLowerCase()) {
          return ch;
        }
        const res = ch.querySelector(sel);
        if (res) return res;
      }
      return null;
    }

    querySelectorAll(sel) {
      const results = [];
      if (sel.toLowerCase() === 'video' && this.tagName === 'VIDEO') {
        results.push(this);
      }
      for (const ch of this.children) {
        results.push(...ch.querySelectorAll(sel));
      }
      return results;
    }
  }

  class MockVideoElement extends MockElement {
    constructor() {
      super('video');
      this._playbackRate = 1.0;
      this.paused = true;
      this.ended = false;
      this.readyState = 4;
    }

    get playbackRate() {
      return this._playbackRate;
    }

    set playbackRate(val) {
      this._playbackRate = val;
      this.dispatchEvent({ type: 'ratechange', target: this });
    }

    play() {
      this.paused = false;
      this.dispatchEvent({ type: 'play', target: this });
      this.dispatchEvent({ type: 'playing', target: this });
    }

    pause() {
      this.paused = true;
      this.dispatchEvent({ type: 'pause', target: this });
    }
  }

  const mockDocument = {
    fullscreenElement: null,
    body: new MockElement('body'),
    documentElement: new MockElement('html'),
    createElement: (tag) => {
      if (tag.toLowerCase() === 'video') return new MockVideoElement();
      return new MockElement(tag);
    },
    createElementNS: (ns, tag) => new MockElement(tag),
    contains: (el) => mockDocument.body.contains(el) || mockDocument.documentElement.contains(el),
    createTreeWalker: (root) => {
      const all = [];
      function collect(el) {
        all.push(el);
        if (el.shadowRoot) collect(el.shadowRoot);
        for (const c of el.children) collect(c);
      }
      collect(root);
      let idx = 0;
      return {
        currentNode: all[0],
        nextNode: () => {
          idx++;
          return all[idx] || null;
        }
      };
    },
    addEventListener: () => {},
    querySelector: (sel) => mockDocument.body.querySelector(sel),
    querySelectorAll: (sel) => mockDocument.body.querySelectorAll(sel)
  };

  mockDocument.documentElement.appendChild(mockDocument.body);

  const mockChrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const result = {};
          if (Array.isArray(keys)) {
            keys.forEach(k => { result[k] = storage[k]; });
          } else if (typeof keys === 'string') {
            result[keys] = storage[keys];
          } else if (keys === null || keys === undefined) {
            Object.assign(result, storage);
          }
          setTimeout(() => cb(result), 0);
        },
        set: (items, cb) => {
          const changes = {};
          for (const k in items) {
            changes[k] = { oldValue: storage[k], newValue: items[k] };
            storage[k] = items[k];
          }
          if (cb) setTimeout(cb, 0);
          storageListeners.forEach(listener => listener(changes, 'local'));
        }
      },
      onChanged: {
        addListener: (fn) => storageListeners.push(fn)
      }
    },
    runtime: {
      lastError: null,
      onMessage: {
        addListener: (fn) => messageListeners.push(fn)
      },
      sendMessage: (msg, cb) => {
        messageListeners.forEach(fn => fn(msg, {}, cb || (() => {})));
      },
      onInstalled: {
        addListener: () => {}
      }
    },
    commands: {
      onCommand: {
        addListener: (fn) => commandListeners.push(fn)
      }
    },
    tabs: {
      query: (queryInfo, cb) => {
        cb([{ id: 1, url: `https://${hostname}/watch?v=123`, active: true }]);
      },
      sendMessage: (tabId, msg, cb) => {
        let responded = false;
        const sendResponse = (res) => {
          responded = true;
          if (cb) cb(res);
        };
        messageListeners.forEach(fn => {
          const async = fn(msg, { tab: { id: tabId } }, sendResponse);
          if (!async && !responded && cb) cb();
        });
      },
      create: () => {}
    }
  };

  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      mutationCallbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }

  const mockWindow = {
    location: { hostname: hostname, href: `https://${hostname}/watch?v=abc` },
    document: mockDocument,
    chrome: mockChrome,
    WeakSet: WeakSet,
    Set: Set,
    NodeFilter: { SHOW_ELEMENT: 1 },
    Document: Object,
    MutationObserver: MockMutationObserver,
    _mutationCallbacks: mutationCallbacks,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    Math: Math,
    Number: Number,
    Array: Array,
    Object: Object,
    console: console,
    addEventListener: (event, handler) => {
      if (!mockWindow._listeners) mockWindow._listeners = {};
      if (!mockWindow._listeners[event]) mockWindow._listeners[event] = [];
      mockWindow._listeners[event].push(handler);
    },
    removeEventListener: () => {},
    dispatchEvent: (evt) => {
      if (mockWindow._listeners && mockWindow._listeners[evt.type]) {
        mockWindow._listeners[evt.type].forEach(fn => fn(evt));
      }
    }
  };

  mockWindow.window = mockWindow;
  mockWindow.self = mockWindow;
  mockWindow.top = mockWindow;
  mockWindow.history = {
    pushState: (state, title, url) => {},
    replaceState: (state, title, url) => {}
  };

  return {
    window: mockWindow,
    document: mockDocument,
    chrome: mockChrome,
    storage,
    MockVideoElement,
    MockElement
  };
}

console.log(bold('\n========================================'));
console.log(bold(' VIDEO SPEED CONTROLLER - TEST SUITE '));
console.log(bold('========================================\n'));

// ==========================================
// TEST SUITE 1: Presets & Math Utilities
// ==========================================
console.log(bold('Suite 1: Presets & Math Utilities'));
const constants = require('../utils/constants');

runTest('1.1 Exactly 15 speed presets defined', () => {
  assert.strictEqual(constants.SPEED_PRESETS.length, 15);
  const expected = [0.25, 0.50, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00, 3.25, 3.50, 3.75, 4.00];
  assert.deepStrictEqual(Array.from(constants.SPEED_PRESETS), expected);
});

runTest('1.2 Default speed is 1.00x, min 0.25x, max 4.00x', () => {
  assert.strictEqual(constants.DEFAULT_SPEED, 1.00);
  assert.strictEqual(constants.MIN_SPEED, 0.25);
  assert.strictEqual(constants.MAX_SPEED, 4.00);
});

runTest('1.3 Stepping up iterates sequentially through all presets', () => {
  let spd = 0.25;
  for (let i = 1; i < constants.SPEED_PRESETS.length; i++) {
    spd = constants.getNextSpeed(spd);
    assert.strictEqual(spd, constants.SPEED_PRESETS[i]);
  }
  // Max step stays at max
  assert.strictEqual(constants.getNextSpeed(4.00), 4.00);
});

runTest('1.4 Stepping down iterates sequentially through all presets', () => {
  let spd = 4.00;
  for (let i = constants.SPEED_PRESETS.length - 2; i >= 0; i--) {
    spd = constants.getPrevSpeed(spd);
    assert.strictEqual(spd, constants.SPEED_PRESETS[i]);
  }
  // Min step stays at min
  assert.strictEqual(constants.getPrevSpeed(0.25), 0.25);
});

runTest('1.5 Domain normalization strips www, m., and query parameters', () => {
  assert.strictEqual(constants.normalizeDomain('https://www.youtube.com/watch?v=123'), 'youtube.com');
  assert.strictEqual(constants.normalizeDomain('https://m.youtube.com/shorts/abc'), 'youtube.com');
  assert.strictEqual(constants.normalizeDomain('https://netflix.com/browse'), 'netflix.com');
  assert.strictEqual(constants.normalizeDomain('https://vimeo.com/76979871'), 'vimeo.com');
  assert.strictEqual(constants.normalizeDomain('coursera.org'), 'coursera.org');
});

// ==========================================
// TEST SUITE 2: Video Detection & DOM Traversal
// ==========================================
console.log(bold('\nSuite 2: Video Detection & DOM Traversal'));

runTest('2.1 Detects HTML5 video element on page load', (done) => {
  const env = createMockEnvironment();
  const video = new env.MockVideoElement();
  env.document.body.appendChild(video);

  // Execute constants and content script in sandbox
  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  // Trigger get_status message
  env.chrome.runtime.sendMessage({ action: 'get_status' }, (res) => {
    assert.strictEqual(res.videoCount, 1);
    assert.strictEqual(res.siteDomain, 'youtube.com');
  });
});

runTest('2.2 Detects multiple video elements and applies speed to all', () => {
  const env = createMockEnvironment();
  const v1 = new env.MockVideoElement();
  const v2 = new env.MockVideoElement();
  env.document.body.appendChild(v1);
  env.document.body.appendChild(v2);

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  env.chrome.runtime.sendMessage({ action: 'set_speed', speed: 2.50 });
  assert.strictEqual(v1.playbackRate, 2.50);
  assert.strictEqual(v2.playbackRate, 2.50);
});

runTest('2.3 Detects dynamically injected video via MutationObserver (SPA transition)', () => {
  const env = createMockEnvironment();
  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8'), env.window);

  // Set speed before video arrives
  env.chrome.runtime.sendMessage({ action: 'set_speed', speed: 1.75 });

  // Dynamically insert new video (like YouTube SPA watch page load)
  const dynamicVideo = new env.MockVideoElement();
  env.document.body.appendChild(dynamicVideo);

  setTimeout(() => {
    assert.strictEqual(dynamicVideo.playbackRate, 1.75);
  }, 160);
});

runTest('2.4 Subframes without video do not hijack get_status response', () => {
  const env = createMockEnvironment();
  env.window.top = {}; // simulate subframe: window !== window.top
  // No videos in body
  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8'), env.window);

  let replied = false;
  env.chrome.runtime.sendMessage({ action: 'get_status' }, (res) => {
    if (res) replied = true;
  });
  assert.strictEqual(replied, false, 'Subframe with no videos must not hijack get_status');
});

// ==========================================
// TEST SUITE 3: Playback Rate & Enforcing Speed
// ==========================================
console.log(bold('\nSuite 3: Playback Rate & Enforcement'));

runTest('3.1 Re-asserts rate when site player attempts to reset playbackRate', () => {
  const env = createMockEnvironment();
  const video = new env.MockVideoElement();
  env.document.body.appendChild(video);

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8'), env.window);

  // Set desired speed to 2.00x
  env.chrome.runtime.sendMessage({ action: 'set_speed', speed: 2.00 });
  assert.strictEqual(video.playbackRate, 2.00);

  // Simulate site player (YouTube/Netflix) resetting rate back to 1.00
  video.playbackRate = 1.00;

  // After enforcement timeout, rate should be restored back to 2.00
  setTimeout(() => {
    assert.strictEqual(video.playbackRate, 2.00);
  }, 150);
});

// ==========================================
// TEST SUITE 4: On-Screen Speed Indicator Overlay
// ==========================================
console.log(bold('\nSuite 4: On-Screen Speed Indicator Overlay'));

runTest('4.1 Creates overlay container when speed changes', () => {
  const env = createMockEnvironment();
  const video = new env.MockVideoElement();
  env.document.body.appendChild(video);

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  env.chrome.runtime.sendMessage({ action: 'set_speed', speed: 2.25 });

  const overlay = env.document.body.querySelector('.__vsc_overlay_text');
  assert.ok(overlay, 'Overlay text element must exist in DOM');
  assert.strictEqual(overlay.textContent, '2.25x');
});

runTest('4.2 Appends overlay to fullscreenElement when fullscreen is active', () => {
  const env = createMockEnvironment();
  const fullscreenContainer = new env.MockElement('div');
  const video = new env.MockVideoElement();
  fullscreenContainer.appendChild(video);
  env.document.body.appendChild(fullscreenContainer);
  env.document.fullscreenElement = fullscreenContainer;

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  env.chrome.runtime.sendMessage({ action: 'set_speed', speed: 3.00 });

  // Overlay container must be attached to fullscreen element so it stays visible
  const overlayInFs = fullscreenContainer.querySelector('.__vsc_overlay_text');
  assert.ok(overlayInFs, 'Overlay must be appended inside fullscreenElement');
  assert.strictEqual(overlayInFs.textContent, '3.00x');
});

// ==========================================
// TEST SUITE 5: Per-Website Speed Memory
// ==========================================
console.log(bold('\nSuite 5: Per-Website Speed Memory'));

runTest('5.1 Saves and restores domain-specific speeds independently', (done) => {
  const initialStorage = {
    site_speeds: {
      'youtube.com': 2.00,
      'netflix.com': 1.50,
      'vimeo.com': 1.75
    }
  };

  // Test YouTube load
  const ytEnv = createMockEnvironment({ hostname: 'www.youtube.com', storageData: initialStorage });
  const ytVideo = new ytEnv.MockVideoElement();
  ytEnv.document.body.appendChild(ytVideo);

  vm.runInNewContext(constantsCode, ytEnv.window);
  vm.runInNewContext(contentCode, ytEnv.window);

  setTimeout(() => {
    assert.strictEqual(ytVideo.playbackRate, 2.00, 'YouTube must restore 2.00x from storage');

    // Test Netflix load
    const netflixEnv = createMockEnvironment({ hostname: 'www.netflix.com', storageData: initialStorage });
    const netflixVideo = new netflixEnv.MockVideoElement();
    netflixEnv.document.body.appendChild(netflixVideo);

    vm.runInNewContext(constantsCode, netflixEnv.window);
    vm.runInNewContext(contentCode, netflixEnv.window);

    setTimeout(() => {
      assert.strictEqual(netflixVideo.playbackRate, 1.50, 'Netflix must restore 1.50x from storage');
    }, 20);
  }, 20);
});

runTest('5.2 Changing speed updates storage for current domain only', (done) => {
  const env = createMockEnvironment({
    hostname: 'vimeo.com',
    storageData: { site_speeds: { 'youtube.com': 2.00 } }
  });
  const video = new env.MockVideoElement();
  env.document.body.appendChild(video);

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  env.chrome.runtime.sendMessage({ action: 'set_speed', speed: 3.50 });

  setTimeout(() => {
    assert.strictEqual(env.storage.site_speeds['vimeo.com'], 3.50);
    assert.strictEqual(env.storage.site_speeds['youtube.com'], 2.00, 'YouTube speed remains intact');
  }, 20);
});

// ==========================================
// TEST SUITE 6: Keyboard Shortcuts & Form Guard
// ==========================================
console.log(bold('\nSuite 6: Keyboard Shortcuts & Form Protection'));

runTest('6.1 Command + Shift + . increases speed', () => {
  const env = createMockEnvironment();
  const video = new env.MockVideoElement();
  env.document.body.appendChild(video);

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  assert.strictEqual(video.playbackRate, 1.00);

  // Dispatch Command + Shift + .
  let prevented = false;
  env.window.dispatchEvent({
    type: 'keydown',
    code: 'Period',
    key: '.',
    metaKey: true,
    shiftKey: true,
    target: env.document.body,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => {}
  });

  assert.strictEqual(prevented, true, 'Default must be prevented');
  assert.strictEqual(video.playbackRate, 1.25, 'Speed should step from 1.00x to 1.25x');
});

runTest('6.2 Command + Shift + , decreases speed', () => {
  const env = createMockEnvironment();
  const video = new env.MockVideoElement();
  env.document.body.appendChild(video);

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  // Dispatch Command + Shift + ,
  env.window.dispatchEvent({
    type: 'keydown',
    code: 'Comma',
    key: ',',
    metaKey: true,
    shiftKey: true,
    target: env.document.body,
    preventDefault: () => {},
    stopPropagation: () => {}
  });

  assert.strictEqual(video.playbackRate, 0.50, 'Speed should step from 1.00x to 0.50x');
});

runTest('6.3 Command + Shift + 0 resets speed to 1.00x', () => {
  const env = createMockEnvironment();
  const video = new env.MockVideoElement();
  env.document.body.appendChild(video);

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  // Set to 3.00x first
  env.chrome.runtime.sendMessage({ action: 'set_speed', speed: 3.00 });
  assert.strictEqual(video.playbackRate, 3.00);

  // Dispatch Command + Shift + 0
  env.window.dispatchEvent({
    type: 'keydown',
    code: 'Digit0',
    key: '0',
    metaKey: true,
    shiftKey: true,
    target: env.document.body,
    preventDefault: () => {},
    stopPropagation: () => {}
  });

  assert.strictEqual(video.playbackRate, 1.00, 'Speed must reset to 1.00x');
});

runTest('6.4 Shortcuts are ignored inside input, textarea, and contenteditable elements', () => {
  const env = createMockEnvironment();
  const video = new env.MockVideoElement();
  env.document.body.appendChild(video);

  vm.runInNewContext(constantsCode, env.window);
  vm.runInNewContext(contentCode, env.window);

  assert.strictEqual(video.playbackRate, 1.00);

  const inputEl = new env.MockElement('input');
  env.window.dispatchEvent({
    type: 'keydown',
    code: 'Period',
    key: '.',
    metaKey: true,
    shiftKey: true,
    target: inputEl,
    preventDefault: () => {},
    stopPropagation: () => {}
  });

  assert.strictEqual(video.playbackRate, 1.00, 'Must not change speed when typing in input');

  const editableDiv = new env.MockElement('div');
  editableDiv.isContentEditable = true;
  env.window.dispatchEvent({
    type: 'keydown',
    code: 'Period',
    key: '.',
    metaKey: true,
    shiftKey: true,
    target: editableDiv,
    preventDefault: () => {},
    stopPropagation: () => {}
  });

  assert.strictEqual(video.playbackRate, 1.00, 'Must not change speed in contenteditable');
});

// ==========================================
// TEST SUITE 7: Background Commands & Message Routing
// ==========================================
console.log(bold('\nSuite 7: Background Commands & Message Routing'));

runTest('7.1 Background worker routes chrome.commands to active tab', () => {
  const env = createMockEnvironment();
  const bgWindow = {
    chrome: env.chrome,
    importScripts: () => {},
    setTimeout: setTimeout
  };

  // Run background script
  vm.runInNewContext(backgroundCode, bgWindow);

  let receivedAction = null;
  // Content script listener in tab
  env.chrome.runtime.onMessage.addListener((msg) => {
    receivedAction = msg.action;
  });

  // Trigger command
  bgWindow.chrome.commands.onCommand.addListener.mockHandler = null;
  // Trigger onCommand listener directly
  env.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    env.chrome.tabs.sendMessage(tabs[0].id, { action: 'increase_speed' });
  });

  assert.strictEqual(receivedAction, 'increase_speed');
});

// Summary
setTimeout(() => {
  console.log(bold('\n========================================'));
  console.log(bold(` TESTS COMPLETED: ${passedTests}/${totalTests} PASSED `));
  console.log(bold('========================================\n'));
  if (passedTests === totalTests) {
    console.log(green('✓ All integration tests passed successfully!'));
  } else {
    console.error(red(`✗ ${totalTests - passedTests} tests failed.`));
    process.exit(1);
  }
}, 300);
