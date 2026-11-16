// Demo recorder (?emulate&autoplay&record): films the ritual at 1920x1080 with captions,
// title cards and optional narration, then saves the video to the Downloads folder.
// It draws each rendered frame onto its own canvas, adds the captions there, and records
// that canvas together with the app's sound (drone, chimes and the narration clips).

const W = 1920;
const H = 1080;

export const STEP_CAPTIONS = {
  arrive: { n: 1, title: 'Arrive', text: 'Pinch the moon. It teaches the one gesture the whole app uses.' },
  unload: { n: 2, title: 'Unload', text: "Pinch what's still on your mind into the jar. It keeps till morning." },
  breathe: { n: 3, title: 'Breathe', text: 'Open your hands as you breathe in. The flower opens with you.' },
  plant: { n: 4, title: 'Plant', text: 'Choose one intention for tomorrow and plant it as a seed.' },
  bloom: { n: 5, title: 'Bloom', text: "Tonight's flower opens. Every night in a row adds a petal to your garden." },
};
const STEP_NAMES = ['arrive', 'unload', 'breathe', 'plant', 'bloom'];
const CLIPS = ['intro', ...STEP_NAMES, 'outro'];

const INTRO_SECONDS = 5;
const OUTRO_SECONDS = 7;
const AFTER_BLOOM_SECONDS = 7; // after the bloom narration ends, before the end card

export function recordDemo({ app, device, note, base = './assets/narration/' }) {
  if (note) note.textContent = 'Recording is on: press Enter night sky. The 1080p video saves to Downloads at the end.';
  device.fovy = (60 * Math.PI) / 180; // a little closer than the plain autoplay view

  const badge = document.createElement('div');
  badge.style.cssText =
    'position:fixed;top:12px;right:12px;z-index:9999;padding:6px 12px;border-radius:999px;font:600 14px system-ui;color:#fff;background:#c0263a;display:none';
  badge.textContent = '● Recording 1080p';
  document.body.append(badge);

  // Narration clips are optional: any that are missing are skipped and the captions still show.
  const clips = {};
  const loading = Promise.all(
    CLIPS.map(async (name) => {
      try {
        const res = await fetch(`${base}${name}.mp3`, { cache: 'no-store' });
        if (res.ok) clips[name] = await res.arrayBuffer();
      } catch {
        /* no clip */
      }
    }),
  );
  const voiceQueue = [];
  let speaking = false;
  let voicesPending = 0;
  async function pump() {
    if (speaking) return;
    const name = voiceQueue.shift();
    if (!name) return;
    speaking = true;
    try {
      await loading;
      if (clips[name]) await app.voice(clips[name].slice(0));
    } catch (err) {
      console.warn('[record] narration failed', name, err);
    }
    speaking = false;
    voicesPending -= 1;
    pump();
  }
  function say(name) {
    voicesPending += 1;
    voiceQueue.push(name);
    pump();
  }
  // The autopilot waits on this so the hand moves after the voice has introduced the step.
  app.narrating = () => voicesPending > 0;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  // Show exactly what is being recorded, captions included, on top of the emulator view.
  out.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#07040d;z-index:9998;display:none';
  document.body.append(out);

  let rec = null;
  let startedAt = 0;
  let lastStep = null;
  let stepChangedAt = 0;
  let bloomVoiceDoneAt = null;
  let outroAt = null;
  let stopped = false;
  const chunks = [];

  function sizeCanvas(gl) {
    // The emulator sizes the canvas to the window in CSS pixels; film at a fixed 1080p instead.
    if (gl.width !== W || gl.height !== H) {
      gl.width = W;
      gl.height = H;
      gl.style.cssText += ';position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#07040d';
    }
  }

  function start() {
    const gl = app.canvas();
    sizeCanvas(gl);
    const stream = out.captureStream(30);
    app.audioStream()?.getAudioTracks().forEach((t) => stream.addTrack(t));
    const types = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const type = types.find((t) => MediaRecorder.isTypeSupported(t));
    const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16_000_000, audioBitsPerSecond: 192_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(chunks, { type: type.split(';')[0] }));
      a.download = `night-bloom-demo-1080p.${ext}`;
      document.body.append(a);
      a.click();
      const mb = (chunks.reduce((s, c) => s + c.size, 0) / 1e6).toFixed(1);
      badge.textContent = `Saved night-bloom-demo-1080p.${ext} (${mb} MB)`;
      badge.style.background = '#2f7d4f';
      console.info(`[record] saved ${a.download}, ${mb} MB, ${type}`);
    };
    startedAt = performance.now();
    rec.start(1000);
    badge.style.display = 'block';
    out.style.display = 'block';
    say('intro');
    say('arrive');
  }

  // Called by main.js right after each frame is rendered, while the frame is still in the buffer.
  window.__nightBloomAfterRender = () => {
    if (!app.presenting()) return;
    const gl = app.canvas();
    if (!rec) start();
    if (gl.width !== W || gl.height !== H) sizeCanvas(gl);
    if (stopped) return;
    const now = performance.now();
    const t = (now - startedAt) / 1000;

    const step = app.step();
    if (step !== lastStep) {
      if (lastStep) say(step);
      lastStep = step;
      stepChangedAt = now;
    }
    if (step === 'bloom' && bloomVoiceDoneAt == null && !app.narrating()) bloomVoiceDoneAt = now;
    if (bloomVoiceDoneAt != null && outroAt == null && now - bloomVoiceDoneAt > AFTER_BLOOM_SECONDS * 1000) {
      outroAt = now;
      say('outro');
    }

    ctx.drawImage(gl, 0, 0, W, H);
    if (outroAt == null) {
      drawSteps(step, (now - stepChangedAt) / 1000);
      if (t < INTRO_SECONDS + 1) drawIntro(t);
    } else {
      const ot = (now - outroAt) / 1000;
      drawOutro(ot);
      if (ot > OUTRO_SECONDS && !app.narrating()) {
        stopped = true;
        rec.stop();
      }
    }
  };

  // ---------- drawing ----------
  const ACCENT = '#b48cff';
  const INK = '#f3ecff';
  const QUIET = '#c9bfe6';
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSteps(step, since) {
    const cap = STEP_CAPTIONS[step];
    // corner label
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = INK;
    ctx.font = `600 34px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText('Night Bloom', 56, 44);
    ctx.fillStyle = QUIET;
    ctx.font = `400 24px ${FONT}`;
    ctx.fillText('Meta Quest 3 emulator · hand tracking', 56, 88);
    ctx.restore();

    // step tracker, top right
    ctx.save();
    ctx.font = `600 24px ${FONT}`;
    ctx.textBaseline = 'middle';
    let x = W - 56;
    for (let i = STEP_NAMES.length - 1; i >= 0; i--) {
      const name = STEP_CAPTIONS[STEP_NAMES[i]].title;
      const w = ctx.measureText(name).width + 40;
      x -= w;
      const active = STEP_NAMES[i] === step;
      const done = STEP_NAMES.indexOf(step) > i;
      roundRect(x, 40, w, 48, 24);
      ctx.fillStyle = active ? ACCENT : 'rgba(20,12,32,0.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,140,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = active ? '#12081f' : done ? INK : QUIET;
      ctx.fillText(name, x + 20, 64);
      x -= 10;
    }
    ctx.restore();

    if (!cap) return;
    // caption panel, bottom centre, fading in on each new step
    const a = Math.min(1, since / 0.5);
    ctx.save();
    ctx.globalAlpha = a;
    const pw = 1280;
    const ph = 176;
    const px = (W - pw) / 2;
    const py = H - ph - 56;
    roundRect(px, py, pw, ph, 28);
    ctx.fillStyle = 'rgba(12,7,22,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,140,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textBaseline = 'top';
    ctx.fillStyle = ACCENT;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(`STEP ${cap.n} OF 5`, px + 48, py + 30);
    ctx.fillStyle = INK;
    ctx.font = `700 52px ${FONT}`;
    ctx.fillText(cap.title, px + 48, py + 64);
    const tw = ctx.measureText(cap.title).width;
    ctx.fillStyle = QUIET;
    ctx.font = `400 34px ${FONT}`;
    wrap(cap.text, px + 48 + tw + 36, py + 74, pw - (48 + tw + 36) - 48, 44);
    ctx.restore();
  }

  function wrap(text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w;
        yy += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function card(alpha, lines) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(7,4,13,0.88)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [text, font, color, y] of lines) {
      ctx.font = `${font} ${FONT}`;
      ctx.fillStyle = color;
      ctx.fillText(text, W / 2, y);
    }
    ctx.restore();
  }

  function drawIntro(t) {
    const alpha = t < INTRO_SECONDS ? 1 : Math.max(0, 1 - (t - INTRO_SECONDS));
    card(alpha, [
      ['Night Bloom', '700 120px', INK, 400],
      ['A five-minute, hands-first wind-down ritual for Meta Quest', '400 44px', QUIET, 510],
      ['Arrive  ·  Unload  ·  Breathe  ·  Plant  ·  Bloom', '600 36px', ACCENT, 600],
      ["Recorded in Meta's Quest 3 emulator with hand tracking. No editing.", '400 28px', QUIET, 760],
    ]);
  }

  function drawOutro(ot) {
    card(Math.min(1, ot / 0.8), [
      ['Night Bloom', '700 120px', INK, 380],
      ['Five quiet minutes before sleep.', '400 48px', QUIET, 490],
      ['Try it in the Meta Quest Browser', '600 36px', ACCENT, 620],
      ['rkabota.github.io/night-bloom', '600 52px', INK, 685],
      ['Built with WebXR and three.js for Meta VR Start 2026', '400 28px', QUIET, 820],
    ]);
  }
}
