// Procedural sound: a low drone that swells with the breath, and a soft chime on each pick.
// No audio files. Must be created from a user gesture (the Enter button).

export function createAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return { breathe() {}, chime() {}, bloom() {}, setMuted() {}, resume() {}, suspend() {} };
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.035;
  filter.connect(droneGain).connect(master);
  for (const [freq, detune] of [[110, 0], [164.81, 4], [220, -6]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start();
  }

  function tone(freq, start, length, peak) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }

  return {
    resume: () => ctx.resume(),
    suspend: () => ctx.suspend(),
    /** level 0..1 follows the breath guide */
    breathe(level) {
      const t = ctx.currentTime;
      filter.frequency.setTargetAtTime(350 + 900 * level, t, 0.25);
      droneGain.gain.setTargetAtTime(0.025 + 0.04 * level, t, 0.25);
    },
    chime() {
      const t = ctx.currentTime;
      tone(880, t, 0.9, 0.08);
      tone(1318.5, t + 0.04, 1.1, 0.05);
    },
    bloom() {
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.18, 2.2, 0.06));
    },
    setMuted(muted) {
      master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.1);
    },
  };
}
