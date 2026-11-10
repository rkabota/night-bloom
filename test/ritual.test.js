import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREATH, breathAt, createRitual, STEPS } from '../src/ritual.js';

test('breath pattern is inhale 4s, hold 4s, exhale 6s', () => {
  assert.deepEqual(
    BREATH.phases.map((p) => [p.name, p.seconds]),
    [['inhale', 4], ['hold', 4], ['exhale', 6]],
  );
  assert.equal(BREATH.cycleSeconds, 14);
});

test('breathAt gives the phase and the target openness the flower should follow', () => {
  assert.deepEqual(breathAt(0), { phase: 'inhale', cycle: 0, progress: 0, target: 0 });
  assert.equal(breathAt(2).target, 0.5);
  assert.equal(breathAt(5).phase, 'hold');
  assert.equal(breathAt(5).target, 1);
  assert.equal(breathAt(11).phase, 'exhale');
  assert.equal(breathAt(11).target, 0.5);
  assert.equal(breathAt(15).cycle, 1);
  assert.equal(breathAt(15).phase, 'inhale');
});

test('ritual walks arrive -> unload -> breathe -> plant -> bloom', () => {
  const r = createRitual({ cycles: 1 });
  assert.equal(r.step(), 'arrive');
  r.start();
  assert.equal(r.step(), 'unload');
  r.addThought('Work');
  r.addThought('Money');
  r.finishUnload();
  assert.equal(r.step(), 'breathe');
  r.tick(14, 1); // one full cycle
  assert.equal(r.step(), 'plant');
  r.plant('Rest well');
  assert.equal(r.step(), 'bloom');
  assert.deepEqual(STEPS, ['arrive', 'unload', 'breathe', 'plant', 'bloom']);
});

test('thoughts are unique, capped at 5, and only accepted while unloading', () => {
  const r = createRitual();
  assert.equal(r.addThought('Work'), false); // not started
  r.start();
  for (const t of ['Work', 'Work', 'Money', 'Family', 'Health', 'Tomorrow', 'Other']) r.addThought(t);
  assert.deepEqual(r.thoughts(), ['Work', 'Money', 'Family', 'Health', 'Tomorrow']);
});

test('breath sync is 1 when the hand follows the target exactly and lower when it does not', () => {
  const follow = createRitual({ cycles: 1 });
  follow.start();
  follow.finishUnload();
  for (let t = 0; t < 14; t += 0.1) follow.tick(0.1, breathAt(t).target);
  assert.ok(follow.breathSync() > 0.95, `sync ${follow.breathSync()}`);

  const still = createRitual({ cycles: 1 });
  still.start();
  still.finishUnload();
  for (let t = 0; t < 14; t += 0.1) still.tick(0.1, 0);
  assert.ok(still.breathSync() < 0.5, `sync ${still.breathSync()}`);
});

test('ticks without a tracked hand still advance the breath but do not count toward sync', () => {
  const r = createRitual({ cycles: 1 });
  r.start();
  r.finishUnload();
  r.tick(14, null);
  assert.equal(r.step(), 'plant');
  assert.equal(r.breathSync(), null);
});

test('plant returns the night record for the garden', () => {
  const r = createRitual({ cycles: 1, now: () => new Date(2026, 10, 13, 0, 30) });
  r.start();
  r.addThought('Work');
  r.finishUnload();
  r.tick(14, null);
  const night = r.plant('One hard thing first');
  assert.deepEqual(night, {
    day: '2026-11-12',
    intention: 'One hard thing first',
    thoughts: 1,
    breathSync: null,
  });
});

test('out-of-order calls are ignored', () => {
  const r = createRitual();
  assert.equal(r.plant('x'), null);
  r.finishUnload();
  assert.equal(r.step(), 'arrive');
});
