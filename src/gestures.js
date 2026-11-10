// Pure hand-gesture math. Joints are plain {x, y, z} objects keyed by WebXR joint name,
// so this file runs in Node tests and in the browser alike.

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Pinch with hysteresis: closes under `start` metres, opens over `end` metres,
 * so a trembling hand near the threshold does not flicker.
 * update(distanceOrNull) -> { pinching, began, ended }
 */
export function createPinchDetector({ start = 0.02, end = 0.035 } = {}) {
  let pinching = false;
  return {
    update(d) {
      const was = pinching;
      if (d == null) pinching = false;
      else if (!pinching && d < start) pinching = true;
      else if (pinching && d > end) pinching = false;
      return { pinching, began: !was && pinching, ended: was && !pinching };
    },
    get pinching() {
      return pinching;
    },
  };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(a) {
  const len = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

/** Unit vector pointing out of the palm, or null if joints are missing. */
export function palmNormal(joints, handedness) {
  const wrist = joints.wrist;
  const index = joints['index-finger-metacarpal'];
  const pinky = joints['pinky-finger-metacarpal'];
  if (!wrist || !index || !pinky) return null;
  const n = normalize(cross(sub(index, wrist), sub(pinky, wrist)));
  return handedness === 'left' ? { x: -n.x, y: -n.y, z: -n.z } : n;
}

/** True when the palm faces the ceiling (within about 50 degrees). */
export function isPalmUp(joints, handedness, threshold = 0.65) {
  const n = palmNormal(joints, handedness);
  return n != null && n.y > threshold;
}

const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const FIST = 0.08; // metres, mean fingertip-to-wrist distance for a loose fist
const OPEN = 0.17; // metres, for a relaxed open hand

/** 0 for a fist, 1 for an open hand, null when the hand is not tracked. */
export function handOpenness(joints) {
  const wrist = joints.wrist;
  if (!wrist || TIPS.some((t) => !joints[t])) return null;
  const mean = TIPS.reduce((sum, t) => sum + distance(joints[t], wrist), 0) / TIPS.length;
  return Math.min(1, Math.max(0, (mean - FIST) / (OPEN - FIST)));
}
