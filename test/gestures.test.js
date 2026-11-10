import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distance,
  createPinchDetector,
  palmNormal,
  isPalmUp,
  handOpenness,
} from '../src/gestures.js';

const v = (x, y, z) => ({ x, y, z });

test('distance is euclidean', () => {
  assert.equal(distance(v(0, 0, 0), v(3, 4, 0)), 5);
});

test('pinch detector uses hysteresis and reports edges once', () => {
  const p = createPinchDetector({ start: 0.02, end: 0.035 });
  assert.deepEqual(p.update(0.05), { pinching: false, began: false, ended: false });
  assert.deepEqual(p.update(0.015), { pinching: true, began: true, ended: false });
  // between thresholds: stays pinched, no new edge
  assert.deepEqual(p.update(0.03), { pinching: true, began: false, ended: false });
  assert.deepEqual(p.update(0.04), { pinching: false, began: false, ended: true });
  // between thresholds while released: stays released
  assert.deepEqual(p.update(0.03), { pinching: false, began: false, ended: false });
});

test('pinch detector treats a lost hand (null) as a release', () => {
  const p = createPinchDetector();
  p.update(0.01);
  assert.deepEqual(p.update(null), { pinching: false, began: false, ended: true });
  assert.deepEqual(p.update(null), { pinching: false, began: false, ended: false });
});

// Right hand, palm facing down, fingers pointing forward (-z), thumb on the left (-x).
const rightPalmDown = {
  wrist: v(0, 0, 0),
  'index-finger-metacarpal': v(-0.02, 0, -0.08),
  'pinky-finger-metacarpal': v(0.03, 0, -0.07),
};
// Left hand, palm facing down: thumb on the right (+x).
const leftPalmDown = {
  wrist: v(0, 0, 0),
  'index-finger-metacarpal': v(0.02, 0, -0.08),
  'pinky-finger-metacarpal': v(-0.03, 0, -0.07),
};
const flip = (joints) =>
  Object.fromEntries(Object.entries(joints).map(([k, p]) => [k, v(-p.x, -p.y, p.z)]));

test('palm normal points out of the palm for both hands', () => {
  assert.ok(palmNormal(rightPalmDown, 'right').y < -0.99);
  assert.ok(palmNormal(leftPalmDown, 'left').y < -0.99);
});

test('isPalmUp is true only when the palm faces the ceiling', () => {
  assert.equal(isPalmUp(rightPalmDown, 'right'), false);
  assert.equal(isPalmUp(leftPalmDown, 'left'), false);
  // rotate 180 degrees about z: palm now faces up
  assert.equal(isPalmUp(flip(rightPalmDown), 'right'), true);
  assert.equal(isPalmUp(flip(leftPalmDown), 'left'), true);
});

test('isPalmUp is false when joints are missing', () => {
  assert.equal(isPalmUp({ wrist: v(0, 0, 0) }, 'right'), false);
});

const tips = (reach) => ({
  wrist: v(0, 0, 0),
  'index-finger-tip': v(0, 0, -reach),
  'middle-finger-tip': v(0, 0, -reach),
  'ring-finger-tip': v(0, 0, -reach),
  'pinky-finger-tip': v(0, 0, -reach),
});

test('hand openness maps fist to 0 and open hand to 1, clamped', () => {
  assert.equal(handOpenness(tips(0.06)), 0);
  assert.equal(handOpenness(tips(0.2)), 1);
  const mid = handOpenness(tips(0.125));
  assert.ok(mid > 0.45 && mid < 0.55, `mid was ${mid}`);
});

test('hand openness returns null without joints', () => {
  assert.equal(handOpenness({}), null);
});
