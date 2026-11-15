// Autoplay for the desktop emulator (?emulate&autoplay): drives the emulated right hand through
// the whole ritual with real pinches, so the demo can be filmed without a headset.
// It only moves the emulated hand; the app sees ordinary hand-tracking input.
import * as THREE from 'three';

const SPEED = 5; // how quickly the hand glides toward its target (per second)
const CLOSE = 0.008; // metres: near enough to pinch
const ACTION_TIMEOUT = 8; // seconds before an action gives up

/**
 * device: the IWER XRDevice. app: hooks exposed by main.js.
 * Returns onFrame(dt), to be called once per rendered frame.
 */
export function createAutopilot(device, app, log = () => {}) {
  const hand = device.hands.right;
  const other = device.hands.left;
  const q0 = hand.quaternion;
  const baseRotation = new THREE.Quaternion(q0.x, q0.y, q0.z, q0.w);
  const target = new THREE.Vector3();
  const delta = new THREE.Vector3();
  let queue = null;
  let current = null;
  let elapsed = 0;
  let palmUp = null; // the rotation that turns the palm to the ceiling, once found

  const pick = (getMesh, label) => ({ kind: 'pick', getMesh, label, phase: 'reach', pinch: 0, hold: 0 });
  const wait = (seconds) => ({ kind: 'wait', seconds });
  const breathe = () => ({ kind: 'breathe', phase: 'lower', tries: null });
  const until = (test, label) => ({ kind: 'until', test, label });

  function buildQueue() {
    const m = app.meshes();
    const thought = (name) => () => m.thoughtChips[m.thoughts.indexOf(name)];
    const intention = (name) => () => m.intentionChips[m.intentions.indexOf(name)];
    return [
      wait(2.5),
      pick(() => m.moon, 'moon'),
      until(() => app.step() === 'unload', 'unload'),
      wait(2),
      pick(thought('Work'), 'Work'),
      wait(0.8),
      pick(thought('Money'), 'Money'),
      wait(0.8),
      pick(thought('Tomorrow'), 'Tomorrow'),
      wait(1.2),
      pick(() => m.doneChip, 'Done'),
      until(() => app.step() === 'breathe', 'breathe'),
      breathe(),
      wait(1.5),
      pick(intention('Rest well'), 'Rest well'),
      until(() => app.step() === 'bloom', 'bloom'),
      { kind: 'rest' },
    ];
  }

  function pinchPoint() {
    const j = app.joints('right');
    if (!j) return null;
    const a = j['thumb-tip'];
    const b = j['index-finger-tip'];
    return new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }

  // Glide the hand so that `from` (an app-space point on the hand) moves toward `to`.
  function glide(from, to, dt) {
    delta.subVectors(to, from).multiplyScalar(Math.min(1, dt * SPEED));
    const p = hand.position;
    p.set(p.x + delta.x, p.y + delta.y, p.z + delta.z);
    return from.distanceTo(to);
  }

  function setRotation(q) {
    hand.quaternion.set(q.x, q.y, q.z, q.w);
  }

  function step(dt) {
    if (!current) {
      current = queue.shift() ?? null;
      elapsed = 0;
      if (!current) return;
    }
    elapsed += dt;
    const a = current;

    if (a.kind === 'wait') {
      if (elapsed >= a.seconds) current = null;
      return;
    }
    if (a.kind === 'until') {
      if (a.test()) current = null;
      else if (elapsed > 20) {
        log(`Autoplay: still waiting for ${a.label}`);
        current = null;
      }
      return;
    }
    if (a.kind === 'rest') {
      // lower the hand out of the way so the bloom has the frame
      const from = pinchPoint();
      if (from) glide(from, from.clone().add(new THREE.Vector3(0.06, -0.25, 0.1)), dt * 0.3);
      if (elapsed > 3) current = null;
      return;
    }
    if (a.kind === 'pick') {
      const mesh = a.getMesh();
      const from = pinchPoint();
      if (!mesh || !from) return;
      mesh.getWorldPosition(target);
      if (a.phase === 'reach') {
        const d = glide(from, target, dt);
        if (d < CLOSE || elapsed > ACTION_TIMEOUT) a.phase = 'pinch';
      } else if (a.phase === 'pinch') {
        glide(from, target, dt);
        a.pinch = Math.min(1, a.pinch + dt * 4);
        hand.updatePinchValue(a.pinch);
        if (a.pinch >= 1) a.phase = 'hold';
      } else if (a.phase === 'hold') {
        a.hold += dt;
        if (a.hold > 0.35) a.phase = 'release';
      } else {
        a.pinch = Math.max(0, a.pinch - dt * 4);
        hand.updatePinchValue(a.pinch);
        if (a.pinch <= 0) {
          // pull back a little toward the user, like a real hand would
          hand.position.set(hand.position.x, hand.position.y - 0.02, hand.position.z + 0.06);
          current = null;
        }
      }
      if (elapsed > ACTION_TIMEOUT + 3) {
        log(`Autoplay: could not pick ${a.label}`);
        hand.updatePinchValue(0);
        current = null;
      }
      return;
    }
    if (a.kind === 'breathe') {
      const from = pinchPoint();
      if (!from) return;
      if (a.phase === 'lower') {
        // rest the hand low over the table, in front of the flower
        const flower = app.flowerPosition();
        const d = glide(from, flower.clone().add(new THREE.Vector3(0.05, 0.12, 0.12)), dt);
        if (d < 0.02 || elapsed > 4) a.phase = palmUp ? 'follow' : 'search';
        return;
      }
      if (a.phase === 'search') {
        // find the rotation that faces the palm up by trying a few and reading the hand back
        if (!a.tries) {
          const e = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
          const h = Math.PI / 2;
          a.tries = [e(h, 0, 0), e(-h, 0, 0), e(0, 0, h), e(0, 0, -h), e(Math.PI, 0, 0), e(0, 0, Math.PI)].map((r) =>
            baseRotation.clone().multiply(r),
          );
          a.index = 0;
          a.frames = 0;
          a.best = { y: -Infinity, q: null };
          setRotation(a.tries[0]);
          return;
        }
        a.frames += 1;
        if (a.frames < 3) return; // let the joints update
        const n = app.palmNormal('right');
        if (n && n.y > a.best.y) a.best = { y: n.y, q: a.tries[a.index] };
        a.index += 1;
        a.frames = 0;
        if (a.index < a.tries.length) {
          setRotation(a.tries[a.index]);
        } else {
          palmUp = a.best.q;
          setRotation(palmUp ?? baseRotation);
          if (!palmUp || a.best.y < 0.65) log(`Autoplay: palm only reached ${a.best.y.toFixed(2)} up`);
          hand.poseId = 'open';
          a.phase = 'follow';
        }
        return;
      }
      if (a.phase === 'follow') {
        if (palmUp) setRotation(palmUp);
        // open the hand on the in-breath, close it gently on the out-breath
        const open = app.breath().target;
        for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) hand.setFingerPose(f, 'fist', 0.85 * (1 - open));
        if (app.step() !== 'breathe') {
          hand.poseId = 'default';
          setRotation(baseRotation);
          current = null;
        }
      }
    }
  }

  return function onFrame(dt) {
    if (!app.presenting() || !app.placed()) return;
    if (!queue) {
      if (!app.joints('right')) return;
      queue = buildQueue();
      if (other) other.position.set(other.position.x - 0.15, other.position.y - 0.3, other.position.z + 0.1); // left hand at rest
    }
    try {
      step(Math.min(dt, 0.1));
    } catch (err) {
      log(`Autoplay stopped: ${err.message}`);
      queue = [];
      current = null;
    }
  };
}
