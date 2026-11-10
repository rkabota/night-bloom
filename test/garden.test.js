import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ritualDay,
  currentStreak,
  petalsForStreak,
  unlockedPalettes,
  gardenLayout,
  createGardenStore,
} from '../src/garden.js';

test('ritual day rolls over at 5 AM local time, not midnight', () => {
  assert.equal(ritualDay(new Date(2026, 10, 12, 23, 30)), '2026-11-12');
  assert.equal(ritualDay(new Date(2026, 10, 13, 1, 15)), '2026-11-12');
  assert.equal(ritualDay(new Date(2026, 10, 13, 5, 0)), '2026-11-13');
});

test('ritual day rolls back across a month boundary', () => {
  assert.equal(ritualDay(new Date(2026, 11, 1, 2, 0)), '2026-11-30');
});

test('streak counts consecutive nights ending today or yesterday', () => {
  const nights = ['2026-11-08', '2026-11-09', '2026-11-10'].map((day) => ({ day }));
  assert.equal(currentStreak(nights, '2026-11-10'), 3);
  // tonight not done yet: streak is still alive from yesterday
  assert.equal(currentStreak(nights, '2026-11-11'), 3);
  // missed a whole night: streak broken
  assert.equal(currentStreak(nights, '2026-11-12'), 0);
});

test('streak ignores duplicate days and gaps further back', () => {
  const nights = ['2026-11-01', '2026-11-09', '2026-11-10', '2026-11-10'].map((day) => ({ day }));
  assert.equal(currentStreak(nights, '2026-11-10'), 2);
  assert.equal(currentStreak([], '2026-11-10'), 0);
});

test('petals grow with the streak and cap at 12', () => {
  assert.equal(petalsForStreak(0), 5);
  assert.equal(petalsForStreak(1), 5);
  assert.equal(petalsForStreak(4), 8);
  assert.equal(petalsForStreak(40), 12);
});

test('palettes unlock at 1, 3, 7, 14 and 30 total nights', () => {
  assert.deepEqual(unlockedPalettes(0), []);
  assert.deepEqual(unlockedPalettes(1).map((p) => p.id), ['midnight']);
  assert.deepEqual(unlockedPalettes(7).map((p) => p.id), ['midnight', 'rose', 'orchid']);
  assert.equal(unlockedPalettes(30).length, 5);
});

test('garden layout places one flower per night in a deterministic spiral within reach', () => {
  const a = gardenLayout(10);
  const b = gardenLayout(10);
  assert.equal(a.length, 10);
  assert.deepEqual(a, b);
  for (const spot of a) assert.ok(Math.hypot(spot.x, spot.z) <= 0.16 + 1e-9);
  // newest flower sits at the centre
  assert.equal(a.at(-1).x, 0);
  assert.equal(a.at(-1).z, 0);
  assert.equal(gardenLayout(60).length, 30); // only the last 30 nights are drawn
});

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, val) => data.set(k, String(val)),
  };
}

test('garden store saves nights and survives a reload', () => {
  const storage = memoryStorage();
  const store = createGardenStore(storage);
  store.addNight({ day: '2026-11-10', intention: 'Rest well', thoughts: 3, breathSync: 0.8 });
  const reloaded = createGardenStore(storage);
  assert.equal(reloaded.nights().length, 1);
  assert.equal(reloaded.nights()[0].intention, 'Rest well');
});

test('garden store replaces a second ritual on the same day instead of double counting', () => {
  const store = createGardenStore(memoryStorage());
  store.addNight({ day: '2026-11-10', intention: 'A', thoughts: 1, breathSync: 0.5 });
  store.addNight({ day: '2026-11-10', intention: 'B', thoughts: 2, breathSync: 0.9 });
  assert.equal(store.nights().length, 1);
  assert.equal(store.nights()[0].intention, 'B');
});

test('garden store works when storage is missing or throws', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  for (const s of [broken, undefined]) {
    const store = createGardenStore(s);
    store.addNight({ day: '2026-11-10', intention: 'A', thoughts: 0, breathSync: 0 });
    assert.equal(store.nights().length, 1);
  }
});

test('garden store ignores corrupt saved data', () => {
  const storage = memoryStorage();
  storage.setItem('night-bloom.v1', '{not json');
  assert.deepEqual(createGardenStore(storage).nights(), []);
  storage.setItem('night-bloom.v1', JSON.stringify({ nights: 'nope' }));
  assert.deepEqual(createGardenStore(storage).nights(), []);
});

import { demoNights } from '../src/garden.js';

test('demo nights fill an unbroken streak ending yesterday, for filming the garden', () => {
  const nights = demoNights(7, '2026-11-16');
  assert.equal(nights.length, 7);
  assert.equal(nights[0].day, '2026-11-09');
  assert.equal(nights.at(-1).day, '2026-11-15');
  assert.equal(currentStreak(nights, '2026-11-16'), 7);
  assert.deepEqual(demoNights(0, '2026-11-16'), []);
  assert.equal(demoNights(500, '2026-11-16').length, 60); // capped
});
