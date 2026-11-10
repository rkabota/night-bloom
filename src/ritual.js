// The nightly ritual as a small state machine with no rendering in it.

import { ritualDay } from './garden.js';

export const STEPS = ['arrive', 'unload', 'breathe', 'plant', 'bloom'];

export const THOUGHTS = ['Work', 'Money', 'Family', 'Health', 'Tomorrow', 'Unfinished', 'Other'];
export const INTENTIONS = ['Rest well', 'One hard thing first', 'Move my body', 'Be kind to myself', 'Call someone', 'Ship it'];

const phases = [
  { name: 'inhale', seconds: 4 },
  { name: 'hold', seconds: 4 },
  { name: 'exhale', seconds: 6 },
];
export const BREATH = { phases, cycleSeconds: phases.reduce((s, p) => s + p.seconds, 0) };

/** Where the guide is at time t: phase, cycle number, 0..1 progress, and the openness to follow. */
export function breathAt(t) {
  const cycle = Math.floor(t / BREATH.cycleSeconds);
  let local = t - cycle * BREATH.cycleSeconds;
  for (const p of BREATH.phases) {
    if (local < p.seconds) {
      const progress = local / p.seconds;
      const target = p.name === 'inhale' ? progress : p.name === 'hold' ? 1 : 1 - progress;
      return { phase: p.name, cycle, progress, target };
    }
    local -= p.seconds;
  }
  return { phase: 'inhale', cycle: cycle + 1, progress: 0, target: 0 };
}

export function createRitual({ cycles = 3, maxThoughts = 5, now = () => new Date() } = {}) {
  let step = 'arrive';
  let thoughts = [];
  let breathTime = 0;
  let errorSum = 0;
  let samples = 0;

  return {
    step: () => step,
    thoughts: () => thoughts.slice(),
    breathTime: () => breathTime,
    breath: () => breathAt(breathTime),
    breathSync: () => (samples === 0 ? null : Math.max(0, 1 - (errorSum / samples) * 2)),

    start() {
      if (step === 'arrive') step = 'unload';
    },
    addThought(label) {
      if (step !== 'unload' || thoughts.includes(label) || thoughts.length >= maxThoughts) return false;
      thoughts.push(label);
      return true;
    },
    finishUnload() {
      if (step === 'unload') step = 'breathe';
    },
    /** Advance the breath guide. openness is 0..1, or null when no hand is tracked. */
    tick(dt, openness) {
      if (step !== 'breathe') return;
      if (openness != null) {
        errorSum += Math.abs(openness - breathAt(breathTime).target) * dt;
        samples += dt;
      }
      breathTime += dt;
      if (breathTime >= cycles * BREATH.cycleSeconds - 1e-6) step = 'plant';
    },
    /** Plant tomorrow's intention; returns the night record to save, or null if out of order. */
    plant(intention) {
      if (step !== 'plant') return null;
      step = 'bloom';
      const sync = this.breathSync();
      return {
        day: ritualDay(now()),
        intention,
        thoughts: thoughts.length,
        breathSync: sync == null ? null : Math.round(sync * 100) / 100,
      };
    },
  };
}
