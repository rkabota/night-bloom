// The garden: one flower per completed night, a streak, and palettes that unlock over time.
// Pure functions plus a tiny store that tolerates missing or blocked localStorage.

const ROLLOVER_HOUR = 5; // a ritual finished at 1 AM still belongs to the night before

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The local "night" a moment belongs to, as YYYY-MM-DD. */
export function ritualDay(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  return isoDay(d);
}

function previousDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d - 1));
}

/** Consecutive nights ending today, or yesterday if tonight is not done yet. */
export function currentStreak(nights, today) {
  const days = new Set(nights.map((n) => n.day));
  let cursor = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

/** Tonight's flower: 5 petals to start, one more per night of streak, up to 12. */
export function petalsForStreak(streak) {
  return Math.min(12, 4 + Math.max(1, streak));
}

export const PALETTES = [
  { id: 'midnight', name: 'Midnight Violet', nights: 1, petal: 0x5b2a86, glow: 0xb48cff },
  { id: 'rose', name: 'Blood Rose', nights: 3, petal: 0x7a0f24, glow: 0xff5a7a },
  { id: 'orchid', name: 'Black Orchid', nights: 7, petal: 0x1a1020, glow: 0xd36bff },
  { id: 'moon', name: 'Silver Moon', nights: 14, petal: 0x9aa3b5, glow: 0xeaf0ff },
  { id: 'ember', name: 'Ember Lily', nights: 30, petal: 0x8a2c05, glow: 0xffa040 },
];

export function unlockedPalettes(totalNights) {
  return PALETTES.filter((p) => totalNights >= p.nights);
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_DRAWN = 30;
const RADIUS = 0.16; // metres: the whole garden fits on a nightstand

/** Positions for the last 30 nights, oldest on the rim, newest in the centre. */
export function gardenLayout(count) {
  const n = Math.min(count, MAX_DRAWN);
  const spots = [];
  for (let i = 0; i < n; i += 1) {
    const k = n - 1 - i; // k = 0 is the newest
    const r = n <= 1 ? 0 : RADIUS * Math.sqrt(k / (MAX_DRAWN - 1));
    const a = k * GOLDEN_ANGLE;
    spots.push({ x: k === 0 ? 0 : r * Math.cos(a), z: k === 0 ? 0 : r * Math.sin(a), age: k });
  }
  return spots;
}

const KEY = 'night-bloom.v1';

/** Saves nights locally. Works in memory if storage is missing or throws. */
export function createGardenStore(storage) {
  let nights = [];
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? 'null');
    if (parsed && Array.isArray(parsed.nights)) nights = parsed.nights.filter((n) => n && typeof n.day === 'string');
  } catch {
    nights = [];
  }

  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify({ nights }));
    } catch {
      // private mode or blocked storage: keep going in memory
    }
  };

  return {
    nights: () => nights.slice(),
    addNight(night) {
      nights = nights.filter((n) => n.day !== night.day).concat([night]);
      nights.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
      save();
      return night;
    },
  };
}

/** Fake past nights for filming the demo (?demo=7). Never saved over real data. */
export function demoNights(count, today) {
  const n = Math.max(0, Math.min(60, Math.floor(count) || 0));
  const out = [];
  let day = today;
  for (let i = 0; i < n; i += 1) {
    day = previousDay(day);
    out.unshift({ day, intention: 'Rest well', thoughts: 2, breathSync: 0.5 + ((i * 37) % 50) / 100 });
  }
  return out;
}
