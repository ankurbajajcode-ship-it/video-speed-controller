/**
 * Video Speed Controller - Unified Master Test Runner
 */

const { execSync } = require('child_process');

console.log('========================================================');
console.log('  RUNNING COMPLETE VIDEO SPEED CONTROLLER TEST SUITE   ');
console.log('========================================================\n');

try {
  console.log('>>> [1/3] Running Logic & Math Unit Tests...');
  execSync('node tests/test_logic.js', { stdio: 'inherit' });

  console.log('\n>>> [2/3] Running Integration & Component Tests...');
  execSync('node tests/test_e2e_mock.js', { stdio: 'inherit' });

  console.log('\n>>> [3/3] Running Extension Popup Tests...');
  execSync('node tests/test_popup.js', { stdio: 'inherit' });

  console.log('\n========================================================');
  console.log('  ALL TESTS PASSED SUCCESSFULLY! (100% PASS RATE)       ');
  console.log('========================================================\n');
} catch (error) {
  console.error('\nTest suite execution failed.');
  process.exit(1);
}
