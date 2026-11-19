// random.js — deterministic randomness. The whole game runs off mulberry32
// streams seeded from the ?seed= parameter, so a staged scene or a test run at
// a given seed always unfolds the same way.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Float in [min, max).
export function rngRange(rng, min, max) {
  return min + (max - min) * rng();
}

// Integer in [min, max], both ends included.
export function rngInt(rng, min, max) {
  return Math.floor(rngRange(rng, min, max + 1));
}

export function rngPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function rngChance(rng, p) {
  return rng() < p;
}

// A stable 0..1 hash of two integers, for visual variety (roof props, water
// glitter) that must not consume the gameplay random stream.
export function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
