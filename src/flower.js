// Procedural gothic flower: no model files, a handful of draw calls, cheap on Quest.
import * as THREE from 'three';

const CLOSED = 0.18; // radians: petals cupped upright
const OPEN = 1.3; // radians: petals laid wide

function petalGeometry(length) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(length * 0.38, length * 0.2, length * 0.3, length * 0.78, 0, length);
  s.bezierCurveTo(-length * 0.3, length * 0.78, -length * 0.38, length * 0.2, 0, 0);
  return new THREE.ShapeGeometry(s, 10);
}

/**
 * createFlower({ petals, palette, scale }) -> { group, setOpen(0..1), setGlow(0..1), dispose() }
 * palette = { petal: hex, glow: hex } from garden.js PALETTES.
 */
export function createFlower({ petals = 5, palette, scale = 1, light: withLight = true, lite = false }) {
  const group = new THREE.Group();
  const geo = petalGeometry(0.075);
  // lite flowers (the garden) use a cheaper material and a single ring of petals
  const petalMat = lite
    ? new THREE.MeshLambertMaterial({ color: palette.petal, emissive: palette.glow, emissiveIntensity: 0.25, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({
        color: palette.petal,
        emissive: palette.glow,
        emissiveIntensity: 0.25,
        roughness: 0.55,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
  const innerMat = petalMat.clone();
  innerMat.color = new THREE.Color(palette.petal).multiplyScalar(0.6);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.005, 0.12, 6),
    new THREE.MeshStandardMaterial({ color: 0x14201a, roughness: 0.9 }),
  );
  stem.position.y = 0.06;
  group.add(stem);

  const head = new THREE.Group();
  head.position.y = 0.12;
  group.add(head);

  const heart = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 12, 8),
    new THREE.MeshBasicMaterial({ color: palette.glow }),
  );
  head.add(heart);

  const tilts = [];
  const rings = [
    { count: petals, mat: petalMat, size: 1, offset: 0, lag: 0 },
    { count: Math.max(3, Math.round(petals * 0.6)), mat: innerMat, size: 0.7, offset: 0.5, lag: 0.35 },
  ];
  for (const ring of lite ? rings.slice(0, 1) : rings) {
    for (let i = 0; i < ring.count; i += 1) {
      const spin = new THREE.Group();
      spin.rotation.y = ((i + ring.offset) / ring.count) * Math.PI * 2;
      const tilt = new THREE.Group();
      const mesh = new THREE.Mesh(geo, ring.mat);
      mesh.scale.setScalar(ring.size);
      tilt.add(mesh);
      spin.add(tilt);
      head.add(spin);
      tilts.push({ tilt, lag: ring.lag });
    }
  }

  // Point lights are costly on Quest, so only the main flower gets one.
  const light = withLight ? new THREE.PointLight(palette.glow, 0.4, 0.6, 2) : null;
  if (light) {
    light.position.y = 0.14;
    group.add(light);
  }

  group.scale.setScalar(scale);

  function setOpen(t) {
    const v = Math.min(1, Math.max(0, t));
    for (const { tilt, lag } of tilts) {
      const local = Math.max(0, (v - lag) / (1 - lag));
      tilt.rotation.x = -(CLOSED + (OPEN - CLOSED) * local);
    }
  }

  function setGlow(g) {
    const v = Math.min(1, Math.max(0, g));
    petalMat.emissiveIntensity = 0.15 + 0.85 * v;
    innerMat.emissiveIntensity = 0.1 + 0.6 * v;
    if (light) light.intensity = 0.2 + 1.2 * v;
    heart.scale.setScalar(0.8 + 0.6 * v);
  }

  setOpen(0);
  setGlow(0.3);

  return {
    group,
    setOpen,
    setGlow,
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== petalMat && o.material !== innerMat) o.material.dispose();
      });
      petalMat.dispose();
      innerMat.dispose();
    },
  };
}

/** A small dark ceramic pot the flower stands in. */
export function createPot() {
  const pot = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.036, 0.06, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b1622, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }),
  );
  body.position.y = 0.03;
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.047, 20),
    new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 1 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.05;
  pot.add(body, soil);
  return pot;
}
