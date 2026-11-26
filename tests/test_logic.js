/**
 * Unit tests for constants and utility functions
 */
const assert = require('assert');
const {
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
} = require('../utils/constants');

console.log('Running unit tests for constants.js...');

// 1. Verify preset count and values
assert.strictEqual(SPEED_PRESETS.length, 15, 'Must have exactly 15 presets');
const expectedPresets = [0.25, 0.50, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00, 3.25, 3.50, 3.75, 4.00];
assert.deepStrictEqual(Array.from(SPEED_PRESETS), expectedPresets, 'Preset values must match specification');
assert.strictEqual(MIN_SPEED, 0.25, 'Min speed should be 0.25');
assert.strictEqual(MAX_SPEED, 4.00, 'Max speed should be 4.00');
assert.strictEqual(DEFAULT_SPEED, 1.00, 'Default speed should be 1.00');

// 2. Formatting
assert.strictEqual(formatSpeed(1), '1.00x');
assert.strictEqual(formatSpeed(0.25), '0.25x');
assert.strictEqual(formatSpeed(2.5), '2.50x');
assert.strictEqual(formatSpeed(4), '4.00x');
assert.strictEqual(formatSpeed(null), '1.00x');
assert.strictEqual(formatSpeed(undefined), '1.00x');
assert.strictEqual(formatSpeed(0), '1.00x');

// 3. Next speed stepping
assert.strictEqual(getNextSpeed(0.25), 0.50);
assert.strictEqual(getNextSpeed(0.50), 1.00);
assert.strictEqual(getNextSpeed(1.00), 1.25);
assert.strictEqual(getNextSpeed(1.25), 1.50);
assert.strictEqual(getNextSpeed(1.75), 2.00);
assert.strictEqual(getNextSpeed(3.75), 4.00);
assert.strictEqual(getNextSpeed(4.00), 4.00, 'Next at max should stay at max');
assert.strictEqual(getNextSpeed(1.10), 1.25, 'Next from 1.10 should pick 1.25');

// 4. Prev speed stepping
assert.strictEqual(getPrevSpeed(4.00), 3.75);
assert.strictEqual(getPrevSpeed(1.25), 1.00);
assert.strictEqual(getPrevSpeed(1.00), 0.50);
assert.strictEqual(getPrevSpeed(0.50), 0.25);
assert.strictEqual(getPrevSpeed(0.25), 0.25, 'Prev at min should stay at min');
assert.strictEqual(getPrevSpeed(1.10), 1.00, 'Prev from 1.10 should pick 1.00');

// 5. Clamping
assert.strictEqual(clampSpeed(0.1), 0.25);
assert.strictEqual(clampSpeed(5.0), 4.00);
assert.strictEqual(clampSpeed(1.5), 1.5);
assert.strictEqual(clampSpeed('abc'), 1.00);

// 6. Domain normalization
assert.strictEqual(normalizeDomain('https://www.youtube.com/watch?v=123'), 'youtube.com');
assert.strictEqual(normalizeDomain('m.youtube.com'), 'youtube.com');
assert.strictEqual(normalizeDomain('www.netflix.com'), 'netflix.com');
assert.strictEqual(normalizeDomain('vimeo.com:443'), 'vimeo.com');
assert.strictEqual(normalizeDomain('https://coursera.org/learn/crypto'), 'coursera.org');
assert.strictEqual(normalizeDomain('udemy.com'), 'udemy.com');
assert.strictEqual(normalizeDomain('localhost:3000'), 'localhost');
assert.strictEqual(normalizeDomain('file:///path/to/test.html'), 'local-file');

// 7. Restricted URL validation
assert.strictEqual(isRestrictedUrl('chrome://extensions'), true);
assert.strictEqual(isRestrictedUrl('chrome-extension://xyz/popup.html'), true);
assert.strictEqual(isRestrictedUrl('edge://settings'), true);
assert.strictEqual(isRestrictedUrl('about:blank'), true);
assert.strictEqual(isRestrictedUrl('https://www.youtube.com'), false);
assert.strictEqual(isRestrictedUrl('https://vimeo.com'), false);

console.log('✓ All constants.js unit tests passed successfully!');
