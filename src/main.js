// Night Bloom: a hands-first wind-down ritual for Meta Quest (WebXR + three.js).
import * as THREE from 'three';
import { createPinchDetector, handOpenness, isPalmUp, distance } from './gestures.js';
import { createRitual, THOUGHTS, INTENTIONS } from './ritual.js';
import {
  createGardenStore,
  currentStreak,
  petalsForStreak,
  unlockedPalettes,
  gardenLayout,
  ritualDay,
  demoNights,
  PALETTES,
} from './garden.js';
import { createFlower, createPot } from './flower.js';
import { makeLabel, layoutArc } from './ui.js';
import { createAudio } from './audio.js';

const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

const PINCH_REACH = 0.06; // metres from a pinch to the thing it picks
const TOUCH_REACH = 0.04; // metres for poke-and-hold
const DWELL_SECONDS = 1.5; // poke-and-hold picks without pinching (accessibility)
const BG = new THREE.Color(0x07040d);

// ---------- persistence ----------
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = undefined;
}
// ?demo=7 shows a week-old garden for filming. It lives in memory only and never touches real data.
const demoCount = Number(new URLSearchParams(window.location.search).get('demo'));
if (demoCount > 0) {
  const memory = new Map();
  memory.set('night-bloom.v1', JSON.stringify({ nights: demoNights(demoCount, ritualDay()) }));
  storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)) };
}
const store = createGardenStore(storage);

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = BG;
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 1.2, 0); // seated eye height for the desktop preview
camera.lookAt(0, 1.05, -0.5);

scene.add(new THREE.HemisphereLight(0x8c7bb8, 0x0a0710, 0.9));
const keyLight = new THREE.DirectionalLight(0xd9ccff, 0.6);
keyLight.position.set(0.5, 2, 0.5);
scene.add(keyLight);

const sky = makeNightSky();
scene.add(sky);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- the space in front of the user ----------
// uiRoot sits at the user's head, turned to face where they look. Everything is inside a 2-foot reach.
const uiRoot = new THREE.Group();
scene.add(uiRoot);

const prompt = makeLabel('', { width: 0.36, height: 0.085, size: 56, weight: '500' });
prompt.position.set(0, 0.08, -0.5);
uiRoot.add(prompt);

const altar = new THREE.Group();
altar.position.set(0, -0.28, -0.5); // about 30 degrees below eye line: inside a narrow field of view
uiRoot.add(altar);

const pot = createPot();
altar.add(pot);

const jar = makeJar();
jar.group.position.set(-0.13, 0, 0.02);
altar.add(jar.group);

const garden = new THREE.Group();
altar.add(garden);

const breathRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.06, 0.0018, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.6 }),
);
breathRing.rotation.x = Math.PI / 2;
breathRing.position.y = 0.17;
breathRing.visible = false;
altar.add(breathRing);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.03, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xe8e4ff, emissive: 0xcfc6ff, emissiveIntensity: 0.8 }),
);
moon.position.set(0, -0.07, -0.4);
uiRoot.add(moon);

// chips are laid out while uiRoot is still at the origin, so they face the user's head
const thoughtChips = THOUGHTS.map((t) => makeChip(t, 0.095));
layoutArc(thoughtChips.slice(0, 4), { y: 0.0, spread: 0.75 });
layoutArc(thoughtChips.slice(4), { y: -0.055, spread: 0.5 });
const intentionChips = INTENTIONS.map((t) => makeChip(t, 0.13));
layoutArc(intentionChips.slice(0, 3), { y: 0.0, spread: 0.75 });
layoutArc(intentionChips.slice(3), { y: -0.055, spread: 0.75 });
const doneChip = makeChip("That's all", 0.1, { background: 'rgba(60, 24, 90, 0.9)' });
doneChip.position.set(0.17, -0.14, -0.38);
doneChip.lookAt(0, -0.14, 0);
const againChip = makeChip('Begin again', 0.11);
againChip.position.set(0.17, -0.14, -0.38);
againChip.lookAt(0, -0.14, 0);
for (const chip of [...thoughtChips, ...intentionChips, doneChip, againChip]) {
  chip.userData.home = chip.position.clone(); // where "Begin again" puts it back
  uiRoot.add(chip);
}

// ---------- state ----------
let ritual = createRitual();
let flower = null;
let flowerOpen = 0;
let bloomTime = -1;
let audio = null;
let paused = false;
let placed = false;
let snappedToTable = false;
let xrFrames = 0;
let mode = 'preview';
const tweens = [];

// Every pickable thing: what it is, when it is live, what happens on pick.
const interactables = [
  { mesh: moon, reach: 0.07, enabled: () => ritual.step() === 'arrive', onSelect: begin },
  ...thoughtChips.map((chip, i) => ({
    mesh: chip,
    enabled: () => ritual.step() === 'unload' && chip.visible && !chip.userData.picked,
    onSelect: () => pickThought(chip, THOUGHTS[i]),
  })),
  { mesh: doneChip, enabled: () => ritual.step() === 'unload', onSelect: finishUnload },
  ...intentionChips.map((chip, i) => ({
    mesh: chip,
    enabled: () => ritual.step() === 'plant' && chip.visible,
    onSelect: () => plantIntention(chip, INTENTIONS[i]),
  })),
  { mesh: againChip, enabled: () => ritual.step() === 'bloom' && againChip.visible, onSelect: restart },
];

// ---------- steps ----------
function showStep() {
  const step = ritual.step();
  moon.visible = step === 'arrive';
  thoughtChips.forEach((c) => (c.visible = step === 'unload' && !c.userData.picked));
  doneChip.visible = step === 'unload';
  intentionChips.forEach((c) => (c.visible = step === 'plant'));
  breathRing.visible = step === 'breathe';
  againChip.visible = false;
  const nights = store.nights();
  if (step === 'arrive') {
    const streak = currentStreak(nights, ritualDay());
    const line = nights.length === 0 ? 'Your first night' : streak > 0 ? `${streak} nights in a row` : 'Welcome back';
    prompt.setText(`Night Bloom · ${line}\nPinch the moon to begin`);
  } else if (step === 'unload') {
    prompt.setText("What's still on your mind?\nPinch each one into the jar. It keeps till morning.");
  } else if (step === 'plant') {
    prompt.setText('One intention for tomorrow\nPinch it to plant it');
  }
}

function begin() {
  ritual.start();
  audio?.chime();
  showStep();
}

function pickThought(chip, label) {
  if (!ritual.addThought(label)) return;
  chip.userData.picked = true;
  audio?.chime();
  const to = altar.position.clone().add(jar.group.position).add(new THREE.Vector3(0, 0.05, 0));
  tween(chip, to, 0.6, () => {
    chip.visible = false;
    jar.fill(ritual.thoughts().length);
  });
}

function finishUnload() {
  ritual.finishUnload();
  audio?.chime();
  showStep();
}

function plantIntention(chip, label) {
  const night = ritual.plant(label);
  if (!night) return;
  audio?.chime();
  const before = unlockedPalettes(store.nights().length);
  store.addNight(night);
  const after = unlockedPalettes(store.nights().length);
  intentionChips.forEach((c) => {
    if (c !== chip) c.visible = false;
  });
  tween(chip, altar.position.clone().add(new THREE.Vector3(0, 0.08, 0)), 0.7, () => {
    chip.visible = false;
    buildFlower();
    buildGarden();
    bloomTime = 0;
    audio?.bloom();
    const nights = store.nights();
    const streak = currentStreak(nights, night.day);
    const unlocked = after.length > before.length ? `\nNew bloom unlocked: ${after.at(-1).name}` : '';
    const run = streak > 1 ? ` · ${streak} in a row` : '';
    prompt.setText(`Night ${nights.length}${run}\nTomorrow: ${label}${unlocked}`);
  });
}

function restart() {
  ritual = createRitual();
  for (const c of [...thoughtChips, ...intentionChips]) {
    c.userData.picked = false;
    c.position.copy(c.userData.home);
    c.scale.setScalar(1);
  }
  jar.fill(0);
  bloomTime = -1;
  flowerOpen = 0;
  buildFlower();
  showStep();
}

// ---------- flower and garden ----------
function paletteFor(totalNights) {
  return unlockedPalettes(Math.max(1, totalNights)).at(-1) ?? PALETTES[0];
}

function buildFlower() {
  if (flower) {
    pot.remove(flower.group);
    flower.dispose();
  }
  const nights = store.nights();
  const streak = currentStreak(nights, ritualDay());
  flower = createFlower({ petals: petalsForStreak(streak), palette: paletteFor(nights.length) });
  flower.group.position.y = 0.05;
  pot.add(flower.group);
}

const minis = [];
function buildGarden() {
  for (const m of minis.splice(0)) {
    garden.remove(m.group);
    m.dispose();
  }
  // tonight is the pot in the middle; past nights ring it, newest closest
  const past = store.nights().filter((n) => n.day !== ritualDay());
  const spots = gardenLayout(past.length + 1).slice(0, -1);
  const older = past.slice(-spots.length);
  spots.forEach((spot, i) => {
    const total = past.length - spots.length + i + 1; // nights done when this flower was planted
    const mini = createFlower({ petals: 5, palette: paletteFor(total), scale: 0.4, light: false, lite: true });
    minis.push(mini);
    const r = Math.hypot(spot.x, spot.z);
    const push = r === 0 ? 0 : (0.075 + r) / r;
    mini.group.position.set(spot.x * push, 0, spot.z * push);
    mini.setOpen(0.85);
    mini.setGlow(older[i]?.breathSync ?? 0.4);
    garden.add(mini.group);
  });
}

// ---------- hands ----------
const hands = [0, 1].map((i) => {
  const hand = renderer.xr.getHand(i);
  scene.add(hand);
  const dots = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.006, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xd8c8ff, transparent: true, opacity: 0.85 }),
    JOINT_NAMES.length,
  );
  dots.visible = false;
  dots.frustumCulled = false;
  scene.add(dots);
  const state = { hand, dots, handedness: null, pinch: createPinchDetector(), hover: null, dwell: 0, joints: null, jointCache: {} };
  // the same slot is reused for controllers; only treat it as a hand when it really is one
  hand.addEventListener('connected', (e) => (state.handedness = e.data.hand ? e.data.handedness : null));
  hand.addEventListener('disconnected', () => (state.handedness = null));
  return state;
});

const tmp = new THREE.Vector3();
const matrix = new THREE.Matrix4();

function readJoints(state) {
  const joints = state.hand.joints;
  if (!state.handedness || !state.hand.visible || !joints || !joints.wrist || !joints.wrist.visible) return null;
  const out = state.jointCache;
  for (const name of JOINT_NAMES) {
    const j = joints[name];
    if (!j || !j.visible) {
      out[name] = undefined;
      continue;
    }
    j.getWorldPosition(tmp);
    const p = out[name] ?? (out[name] = { x: 0, y: 0, z: 0 }); // reused: no garbage per frame
    p.x = tmp.x;
    p.y = tmp.y;
    p.z = tmp.z;
  }
  return out['thumb-tip'] && out['index-finger-tip'] ? out : null;
}

function drawHand(state) {
  const j = state.joints;
  state.dots.visible = Boolean(j) && mode === 'immersive-vr';
  if (!state.dots.visible) return;
  JOINT_NAMES.forEach((name, i) => {
    const p = j[name];
    matrix.makeTranslation(p ? p.x : 0, p ? p.y : -100, p ? p.z : 0);
    state.dots.setMatrixAt(i, matrix);
  });
  state.dots.instanceMatrix.needsUpdate = true;
}

/** Nearest live item within reach. Pinches may use an item's larger reach (the moon); touches never do. */
function nearest(point, reach, useItemReach = true) {
  let best = null;
  let bestD = Infinity;
  for (const item of interactables) {
    if (!item.enabled() || !item.mesh.visible) continue;
    item.mesh.getWorldPosition(tmp);
    const d = distance(point, tmp);
    if (d < (useItemReach ? item.reach ?? reach : reach) && d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}

function select(item) {
  if (item && item.enabled()) item.onSelect();
}

const hovered = new Set();
function updateHands(dt) {
  hovered.clear();
  for (const s of hands) {
    s.joints = readJoints(s);
    drawHand(s);
    if (!s.joints) {
      s.pinch.update(null);
      s.hover = null;
      continue;
    }
    const thumb = s.joints['thumb-tip'];
    const index = s.joints['index-finger-tip'];
    const p = s.pinch.update(distance(thumb, index));
    if (p.began) {
      const mid = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2, z: (thumb.z + index.z) / 2 };
      select(nearest(mid, PINCH_REACH));
    }
    // poke and hold: touch a chip with a fingertip for 1.5 s, no pinch needed
    const touch = nearest(index, TOUCH_REACH, false);
    if (touch) hovered.add(touch);
    if (touch && touch === s.hover) {
      s.dwell += dt;
      if (s.dwell >= DWELL_SECONDS) {
        select(touch);
        s.dwell = -Infinity; // must leave and come back to pick again
      }
    } else {
      s.hover = touch;
      s.dwell = 0;
    }
  }
  for (const item of interactables) {
    const target = hovered.has(item) ? 1.12 : 1;
    if (!item.mesh.userData.tweening) item.mesh.scale.setScalar(THREE.MathUtils.lerp(item.mesh.scale.x, target, 0.3));
  }
}

/**
 * The breath follows whichever hand is palm-up and open; null when neither is.
 * A short grace period stops the flower and the hint from flickering when a palm wobbles near the threshold.
 */
const HAND_GRACE = 0.4; // seconds
let lastOpenness = null;
let sinceSeen = Infinity;
function trackedOpenness(dt) {
  let best = null;
  for (const s of hands) {
    if (!s.joints) continue;
    // easier to keep the palm "up" than to first count it as up (hysteresis)
    if (!isPalmUp(s.joints, s.handedness, lastOpenness == null ? 0.65 : 0.45)) continue;
    const o = handOpenness(s.joints);
    if (o != null) best = best == null ? o : Math.max(best, o);
  }
  if (best != null) {
    lastOpenness = best;
    sinceSeen = 0;
    return best;
  }
  sinceSeen += dt;
  if (sinceSeen > HAND_GRACE) lastOpenness = null;
  return lastOpenness;
}

// controllers are welcome but never required; hand rays are ignored so a pinch only picks what it touches
const raycaster = new THREE.Raycaster();
for (const i of [0, 1]) {
  const controller = renderer.xr.getController(i);
  scene.add(controller);
  controller.addEventListener('select', (e) => {
    if (e.data?.hand) return;
    matrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matrix);
    pickWithRay();
  });
}

function pickWithRay() {
  const live = interactables.filter((it) => it.enabled() && it.mesh.visible);
  const hit = raycaster.intersectObjects(live.map((it) => it.mesh), false)[0];
  if (hit) select(live.find((it) => it.mesh === hit.object));
}

// desktop preview: click to pick
renderer.domElement.addEventListener('click', (e) => {
  if (renderer.xr.isPresenting) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  pickWithRay();
});

// ---------- placement ----------
function placeInFrontOfUser() {
  const head = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  head.getWorldPosition(uiRoot.position);
  const dir = head.getWorldDirection(new THREE.Vector3());
  uiRoot.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
  altar.position.y = -0.28;
  snappedToTable = false;
  placed = true;
}

const altarTmp = new THREE.Vector3();
let planeCheckIn = 0;
/** In passthrough, set the pot on a real table or nightstand if the headset has found one. */
function snapToTable(frame) {
  if (snappedToTable || !frame.detectedPlanes || planeCheckIn > 0) return;
  planeCheckIn = 0.25; // a few checks a second is plenty
  const ref = renderer.xr.getReferenceSpace();
  const altarWorld = altar.getWorldPosition(altarTmp);
  let bestY = null;
  for (const plane of frame.detectedPlanes) {
    if (plane.orientation !== 'horizontal') continue;
    const pose = frame.getPose(plane.planeSpace, ref);
    if (!pose) continue;
    const p = pose.transform.position;
    const drop = uiRoot.position.y - p.y;
    const reach = Math.hypot(p.x - altarWorld.x, p.z - altarWorld.z);
    if (drop > 0.15 && drop < 0.9 && reach < 1.0 && (bestY == null || p.y > bestY)) bestY = p.y;
  }
  if (bestY != null) {
    altar.position.y = bestY - uiRoot.position.y;
    snappedToTable = true;
  }
}

// ---------- tweens ----------
function tween(obj, to, seconds, onDone) {
  obj.userData.tweening = true;
  tweens.push({ obj, from: obj.position.clone(), to, t: 0, seconds, onDone });
}

function runTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i -= 1) {
    const tw = tweens[i];
    tw.t = Math.min(1, tw.t + dt / tw.seconds);
    const e = 1 - (1 - tw.t) ** 3;
    tw.obj.position.lerpVectors(tw.from, tw.to, e);
    tw.obj.scale.setScalar(1 - 0.7 * e);
    if (tw.t >= 1) {
      tweens.splice(i, 1);
      tw.obj.userData.tweening = false;
      tw.onDone?.();
    }
  }
}

// ---------- frame loop ----------
let last = 0;
renderer.setAnimationLoop((time, frame) => {
  const dt = last ? Math.min(0.1, Math.max(0, (time - last) / 1000)) : 0;
  planeCheckIn -= dt;
  last = time;

  if (renderer.xr.isPresenting) {
    xrFrames += 1;
    if (!placed && xrFrames > 5) placeInFrontOfUser();
    if (frame && placed && mode === 'immersive-ar') snapToTable(frame);
  }

  if (!paused) {
    updateHands(dt);
    runTweens(dt);
    animate(dt, time / 1000);
  }
  renderer.render(scene, camera);
});

function animate(dt, seconds) {
  moon.position.y = -0.07 + Math.sin(seconds * 1.2) * 0.006;
  const step = ritual.step();
  if (step === 'breathe') {
    const openness = trackedOpenness(dt);
    ritual.tick(dt, openness);
    const b = ritual.breath();
    const goal = openness ?? b.target;
    flowerOpen = THREE.MathUtils.lerp(flowerOpen, goal, Math.min(1, dt * 4));
    flower.setOpen(flowerOpen);
    flower.setGlow(0.3 + 0.7 * flowerOpen);
    breathRing.scale.setScalar(0.6 + 0.9 * b.target);
    audio?.breathe(b.target);
    const words = { inhale: 'Breathe in', hold: 'Hold', exhale: 'Breathe out' }[b.phase];
    const hint = openness == null ? 'Rest your hands palms up and open them as you breathe in' : `Breath ${b.cycle + 1} of 3`;
    prompt.setText(`${words}\n${hint}`);
    if (ritual.step() === 'plant') {
      breathRing.visible = false;
      showStep();
    }
  } else if (step === 'bloom' && bloomTime >= 0) {
    bloomTime += dt;
    const t = Math.min(1, bloomTime / 4);
    flower.setOpen(t);
    flower.setGlow(0.3 + 0.7 * t);
    if (bloomTime > 6 && !againChip.visible) againChip.visible = true;
  } else if (flower) {
    flower.setOpen(0.15 + Math.sin(seconds * 0.6) * 0.05);
  }
}

// ---------- sessions ----------
async function enter(requested) {
  audio = audio ?? createAudio();
  audio.resume();
  const init = { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'plane-detection'] };
  const session = await navigator.xr.requestSession(requested, init);
  mode = requested;
  const passthrough = requested === 'immersive-ar';
  scene.background = passthrough ? null : BG;
  renderer.setClearColor(0x000000, passthrough ? 0 : 1);
  sky.visible = !passthrough;
  placed = false;
  xrFrames = 0;
  session.addEventListener('visibilitychange', () => {
    paused = session.visibilityState !== 'visible'; // clean pause when the menu opens or the headset comes off
    if (paused) audio?.suspend();
    else audio?.resume();
  });
  session.addEventListener('end', () => {
    mode = 'preview';
    paused = false;
    audio?.suspend();
    // three wrote the headset pose and projection into the camera: put the desktop view back
    camera.position.set(0, 1.2, 0);
    camera.lookAt(0, 1.05, -0.5);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    scene.background = BG;
    sky.visible = true;
    resetPreviewPlacement();
    document.body.classList.remove('in-xr');
  });
  await renderer.xr.setSession(session);
  renderer.xr.getReferenceSpace()?.addEventListener('reset', () => (placed = false)); // recentre
  document.body.classList.add('in-xr');
}

function resetPreviewPlacement() {
  uiRoot.position.copy(camera.position);
  uiRoot.rotation.set(0, 0, 0);
  altar.position.y = -0.28;
}

async function setupButtons() {
  const ar = document.getElementById('enter-ar');
  const vr = document.getElementById('enter-vr');
  const note = document.getElementById('xr-note');
  const xr = navigator.xr;
  const [arOk, vrOk] = xr
    ? await Promise.all([
        xr.isSessionSupported('immersive-ar').catch(() => false),
        xr.isSessionSupported('immersive-vr').catch(() => false),
      ])
    : [false, false];
  ar.hidden = !arOk;
  vr.hidden = !vrOk;
  if (!arOk && !vrOk) note.textContent = 'Open this page in the Meta Quest Browser to enter. Here you can click through a preview.';
  const go = (m) => enter(m).catch((err) => (note.textContent = `Could not start: ${err.message}`));
  ar.addEventListener('click', () => go('immersive-ar'));
  vr.addEventListener('click', () => go('immersive-vr'));
  document.getElementById('preview').addEventListener('click', () => {
    audio = audio ?? createAudio();
    audio.resume();
    document.body.classList.add('previewing');
  });
  const mute = document.getElementById('mute');
  mute.addEventListener('change', () => audio?.setMuted(mute.checked));
  const total = store.nights().length;
  document.getElementById('summary').textContent =
    total === 0 ? 'Your garden is empty. Tonight plants the first flower.' : `Your garden has ${total} flower${total === 1 ? '' : 's'}.`;
}

// ---------- small builders ----------
function makeChip(text, width, extra = {}) {
  return makeLabel(text, { width, height: 0.04, size: 46, ...extra });
}

function makeJar() {
  const group = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.1, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x9fb3ff, transparent: true, opacity: 0.18, roughness: 0.1, side: THREE.DoubleSide }),
  );
  glass.position.y = 0.05;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0 });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), glowMat);
  glow.position.y = 0.04;
  group.add(glass, glow);
  return {
    group,
    fill(count) {
      glowMat.opacity = Math.min(0.9, count * 0.18);
      glow.scale.setScalar(0.6 + count * 0.15);
    },
  };
}

function makeNightSky() {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const positions = [];
  for (let i = 0; i < 700; i += 1) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions.push(r * Math.cos(a) * 15, Math.abs(u) * 15 + 0.5, r * Math.sin(a) * 15);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfc6ff, size: 0.04, sizeAttenuation: true }));
}

// ---------- boot ----------
resetPreviewPlacement();
buildFlower();
buildGarden();
showStep();
setupButtons();
