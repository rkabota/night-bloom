// Text and buttons drawn to canvas textures: no font files, sharp at arm's length.
import * as THREE from 'three';

const PX_PER_M = 2400; // canvas pixels per metre of panel

/**
 * makeLabel(text, opts) -> Mesh with .setText(text)
 * opts: { width, height (metres), size (px), color, background, border, align, weight }
 */
export function makeLabel(text, opts = {}) {
  const {
    width = 0.16,
    height = 0.045,
    size = 44,
    color = '#f3ecff',
    background = 'rgba(20, 12, 32, 0.82)',
    border = 'rgba(180, 140, 255, 0.55)',
    align = 'center',
    weight = '500',
  } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * PX_PER_M);
  canvas.height = Math.round(height * PX_PER_M);
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.renderOrder = 10;

  function draw(value) {
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    if (background) {
      const r = Math.min(h / 2, 48);
      ctx.fillStyle = background;
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, r);
      ctx.fill();
      if (border) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = border;
        ctx.stroke();
      }
    }
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const lines = String(value).split('\n');
    // shrink the font until the longest line fits inside the panel
    let px = size;
    const font = (n) => `${weight} ${n}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.font = font(px);
    while (px > 12 && Math.max(...lines.map((l) => ctx.measureText(l).width)) > w - 48) {
      px -= 2;
      ctx.font = font(px);
    }
    const lineH = px * 1.25;
    const x = align === 'center' ? w / 2 : 32;
    lines.forEach((line, i) => {
      ctx.fillText(line, x, h / 2 + (i - (lines.length - 1) / 2) * lineH);
    });
    texture.needsUpdate = true;
  }

  // redraw only on change: re-uploading a texture every frame costs frame time on Quest
  let current = text;
  draw(text);
  mesh.setText = (value) => {
    if (value === current) return;
    current = value;
    draw(value);
  };
  return mesh;
}

/** Places items on a gentle arc facing the origin, kept inside about +/-22 degrees for narrow FoV. */
export function layoutArc(items, { radius = 0.42, spread = 0.75, y = 0 } = {}) {
  const n = items.length;
  items.forEach((item, i) => {
    const a = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
    item.position.set(Math.sin(a) * radius, y, -Math.cos(a) * radius);
    item.lookAt(0, y, 0);
  });
}
