import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelSeekAtCorner, clamp, gestureAxis, seekFromDrag } from '../src/lib/playerGestures';

test('seek gestures clamp at media bounds, with bounded sensitivity for long videos', () => {
  assert.equal(seekFromDrag(90, 200, 400, 120), 105);
  assert.equal(seekFromDrag(3, -400, 400, 120), 0);
  assert.equal(seekFromDrag(110, 400, 400, 120), 120);
  assert.equal(seekFromDrag(3600, 400, 400, 7200), 3780);
  assert.equal(seekFromDrag(0, 0, 0, 0), 0);
  assert.equal(clamp(NaN), 0);
});

test('vertical gestures remain available to the shorts feed outside fullscreen', () => {
  assert.equal(gestureAxis(50, 5, false), 'seek');
  assert.equal(gestureAxis(5, 100, false), null);
  assert.equal(gestureAxis(5, 100, true), 'level');
  assert.equal(gestureAxis(4, 6, true), null);
  assert.equal(gestureAxis(40, 38, true), null);
});

test('seek cancel zones are limited to the upper corners', () => {
  assert.equal(cancelSeekAtCorner(20, 25, 400), true);
  assert.equal(cancelSeekAtCorner(380, 25, 400), true);
  assert.equal(cancelSeekAtCorner(200, 25, 400), false);
  assert.equal(cancelSeekAtCorner(20, 100, 400), false);
});
