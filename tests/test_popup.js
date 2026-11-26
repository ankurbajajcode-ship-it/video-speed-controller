/**
 * Unit & Integration Tests for Extension Popup (popup/popup.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const constantsCode = fs.readFileSync(path.join(__dirname, '../utils/constants.js'), 'utf8');
const popupCode = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');

function createMockPopupEnvironment({ tabUrl = 'https://www.youtube.com/watch?v=test', siteSpeeds = {} } = {}) {
  const storage = { site_speeds: { ...siteSpeeds } };
  const messageResponses = {
    get_status: {
      success: true,
      currentSpeed: 1.50,
      siteDomain: 'youtube.com',
      videoCount: 1,
      isPlaying: true
    }
  };

  class MockElement {
    constructor(id = '', tagName = 'div') {
      this.id = id;
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.dataset = {};
      this.classList = {
        classes: new Set(),
        add: (...c) => c.forEach(cls => this.classList.classes.add(cls)),
        remove: (...c) => c.forEach(cls => this.classList.classes.delete(cls)),
        contains: (cls) => this.classList.classes.has(cls)
      };
      this.textContent = '';
      this.listeners = {};
    }

    get className() {
      return Array.from(this.classList.classes).join(' ');
    }

    set className(val) {
      this.classList.classes.clear();
      (val || '').split(/\s+/).filter(Boolean).forEach(c => this.classList.classes.add(c));
    }

    appendChild(child) {
      this.children.push(child);
      return child;
    }

    addEventListener(evt, handler) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(handler);
    }

    dispatchEvent(evt) {
      if (this.listeners[evt.type]) {
        this.listeners[evt.type].forEach(fn => fn(evt));
      }
    }

    querySelectorAll(sel) {
      const results = [];
      if (sel === '.preset-btn') {
        results.push(...this.children.filter(c => c.classList.contains('preset-btn')));
      }
      return results;
    }
  }

  // DOM Elements in popup.html
  const elements = {
    siteDomainText: new MockElement('siteDomainText', 'span'),
    currentSpeedDisplay: new MockElement('currentSpeedDisplay', 'span'),
    videoStatusPill: new MockElement('videoStatusPill', 'div'),
    videoStatusText: new MockElement('videoStatusText', 'span'),
    presetsGrid: new MockElement('presetsGrid', 'div'),
    btnDecrease: new MockElement('btnDecrease', 'button'),
    btnReset: new MockElement('btnReset', 'button'),
    btnIncrease: new MockElement('btnIncrease', 'button'),
    linkConfigureShortcuts: new MockElement('linkConfigureShortcuts', 'a')
  };

  const sentTabMessages = [];

  const mockChrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          setTimeout(() => cb({ site_speeds: storage.site_speeds }), 0);
        },
        set: (items, cb) => {
          Object.assign(storage.site_speeds, items.site_speeds);
          if (cb) setTimeout(cb, 0);
        }
      }
    },
    runtime: {
      lastError: null
    },
    tabs: {
      query: (queryInfo, cb) => {
        setTimeout(() => cb([{ id: 42, url: tabUrl, active: true }]), 0);
      },
      sendMessage: (tabId, msg, cb) => {
        sentTabMessages.push(msg);
        if (msg.action === 'get_status') {
          setTimeout(() => cb(messageResponses.get_status), 0);
        } else if (msg.action === 'set_speed') {
          setTimeout(() => cb({ success: true, currentSpeed: msg.speed }), 0);
        }
      },
      create: () => {}
    }
  };

  const mockDocument = {
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => new MockElement('', tag),
    addEventListener: (evt, handler) => {
      if (evt === 'DOMContentLoaded') {
        setTimeout(handler, 0);
      }
    }
  };

  const mockWindow = {
    document: mockDocument,
    chrome: mockChrome,
    URL: URL,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Number: Number,
    parseFloat: parseFloat,
    Math: Math,
    console: console
  };

  return {
    window: mockWindow,
    elements,
    storage,
    sentTabMessages,
    messageResponses
  };
}

console.log('\n--- Running Popup Unit & Integration Tests ---');

// Test 1: Popup loads and renders exactly 15 preset buttons
const env1 = createMockPopupEnvironment();
vm.runInNewContext(constantsCode, env1.window);
vm.runInNewContext(popupCode, env1.window);

setTimeout(() => {
  const buttons = env1.elements.presetsGrid.children;
  assert.strictEqual(buttons.length, 15, 'Popup must render 15 preset buttons');
  assert.strictEqual(buttons[0].textContent, '0.25x');
  assert.strictEqual(buttons[2].textContent, '1.00x');
  assert.strictEqual(buttons[14].textContent, '4.00x');
  console.log('✓ 15 preset buttons rendered with correct labels');

  // Test 2: Status reporting
  assert.strictEqual(env1.elements.siteDomainText.textContent, 'youtube.com');
  assert.strictEqual(env1.elements.currentSpeedDisplay.textContent, '1.50');
  assert.strictEqual(env1.elements.videoStatusText.textContent, '1 video playing');
  console.log('✓ Site domain, speed display, and video status initialized correctly');

  // Test 3: Clicking preset button
  const btn200 = buttons.find(b => b.dataset.speed === '2.00');
  assert.ok(btn200, '2.00x button must exist');
  btn200.dispatchEvent({ type: 'click' });

  setTimeout(() => {
    assert.strictEqual(env1.elements.currentSpeedDisplay.textContent, '2.00');
    assert.strictEqual(btn200.classList.contains('active'), true, '2.00x button must be active');
    assert.strictEqual(env1.storage.site_speeds['youtube.com'], 2.00, '2.00x saved in storage');
    console.log('✓ Preset button click sets speed and updates per-site memory');

    // Test 4: Slower button
    env1.elements.btnDecrease.dispatchEvent({ type: 'click' });
    setTimeout(() => {
      assert.strictEqual(env1.elements.currentSpeedDisplay.textContent, '1.75');
      console.log('✓ Slower button steps down to 1.75x');

      // Test 5: Faster button
      env1.elements.btnIncrease.dispatchEvent({ type: 'click' });
      setTimeout(() => {
        assert.strictEqual(env1.elements.currentSpeedDisplay.textContent, '2.00');
        console.log('✓ Faster button steps up to 2.00x');

        // Test 6: Reset button
        env1.elements.btnReset.dispatchEvent({ type: 'click' });
        setTimeout(() => {
          assert.strictEqual(env1.elements.currentSpeedDisplay.textContent, '1.00');
          console.log('✓ Reset button resets speed to 1.00x');

          console.log('\n✓ All popup tests passed successfully!\n');
        }, 10);
      }, 10);
    }, 10);
  }, 10);
}, 20);
