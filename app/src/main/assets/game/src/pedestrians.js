// pedestrians.js — Palma City's walkers. Each pedestrian strolls the sidewalk
// ring around a block; a nearby crash, a speeding car or a crime sends them
// fleeing, and a car that actually reaches one puts them down for a while.

import { rngRange, rngPick } from './random.js';

const SHIRT_COLORS = ['#d95f4b', '#4b7dd9', '#e0c53c', '#5da85f', '#e8e4da', '#9e5bd9', '#3fa8a0', '#d4722c'];
const SKIN_TONES = ['#f2c79b', '#d9a066', '#a06a3b', '#6e4525'];

export function spawnPeds(world, count) {
  const rings = world.city.rings;
  for (let i = 0; i < count; i++) {
    const ring = rings[Math.floor(world.rng() * rings.length)];
    const per = perimeter(ring);
    world.peds.push({
      x: 0, y: 0, angle: 0,
      ring,
      t: world.rng() * per,
      per,
      dir: world.rng() < 0.5 ? 1 : -1,
      speed: rngRange(world.rng, 34, 50),
      state: 'walk', // walk | flee | down
      fleeT: 0,
      fleeX: 0, fleeY: 0,
      downT: 0,
      shirt: rngPick(world.rng, SHIRT_COLORS),
      skin: rngPick(world.rng, SKIN_TONES),
    });
    const ped = world.peds[world.peds.length - 1];
    const pos = ringPoint(ring, ped.t);
    ped.x = pos.x;
    ped.y = pos.y;
    ped.angle = pos.angle;
  }
}

export function perimeter(r) {
  return 2 * ((r.x1 - r.x0) + (r.y1 - r.y0));
}

// Point at distance t along the ring (clockwise), with the facing angle.
export function ringPoint(r, t) {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const per = 2 * (w + h);
  let d = ((t % per) + per) % per;
  if (d < w) return { x: r.x0 + d, y: r.y0, angle: 0 };
  d -= w;
  if (d < h) return { x: r.x1, y: r.y0 + d, angle: Math.PI / 2 };
  d -= h;
  if (d < w) return { x: r.x1 - d, y: r.y1, angle: Math.PI };
  d -= w;
  return { x: r.x0, y: r.y1 - d, angle: -Math.PI / 2 };
}

// Send every walker within radius of (x,y) running away from it.
export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeT = 1.4 + (Math.abs(ped.x * 0.37 + ped.y * 0.73) % 1) * 1.2; // deterministic variety
      ped.fleeX = x;
      ped.fleeY = y;
    }
  }
}

export function updatePeds(world, dt) {
  const p = world.player.car || world.player;
  const playerSpeed = world.player.car
    ? Math.hypot(world.player.car.vx, world.player.car.vy)
    : 0;

  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ped.downT += dt;
      if (ped.downT > 7) {
        ped.state = 'walk';
        ped.downT = 0;
        const pos = ringPoint(ped.ring, ped.t);
        ped.x = pos.x;
        ped.y = pos.y;
      }
      continue;
    }

    // A fast car bearing down is reason enough to run, crime or not.
    if (ped.state === 'walk' && playerSpeed > 190) {
      const d = Math.hypot(ped.x - p.x, ped.y - p.y);
      if (d < 95) {
        ped.state = 'flee';
        ped.fleeT = 1.2;
        ped.fleeX = p.x;
        ped.fleeY = p.y;
      }
    }

    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - ped.fleeX;
      const dy = ped.y - ped.fleeY;
      const d = Math.hypot(dx, dy) || 1;
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * 122 * dt;
      ped.y += (dy / d) * 122 * dt;
      if (ped.fleeT <= 0) {
        // Head back to the ring: rejoin at the nearest perimeter point.
        ped.state = 'walk';
        ped.t = nearestRingT(ped.ring, ped.x, ped.y);
        const pos = ringPoint(ped.ring, ped.t);
        ped.x = pos.x;
        ped.y = pos.y;
      }
      continue;
    }

    // Stroll the ring.
    ped.t += ped.dir * ped.speed * dt;
    const pos = ringPoint(ped.ring, ped.t);
    ped.x = pos.x;
    ped.y = pos.y;
    ped.angle = pos.angle + (ped.dir < 0 ? Math.PI : 0);
  }
}

function nearestRingT(r, x, y) {
  // Sample the four edges and take the closest point's parameter.
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const candidates = [
    { t: clampNum(x - r.x0, 0, w), d: Math.abs(y - r.y0) },
    { t: w + clampNum(y - r.y0, 0, h), d: Math.abs(x - r.x1) },
    { t: w + h + clampNum(r.x1 - x, 0, w), d: Math.abs(y - r.y1) },
    { t: 2 * w + h + clampNum(r.y1 - y, 0, h), d: Math.abs(x - r.x0) },
  ];
  let best = candidates[0];
  for (const c of candidates) if (c.d < best.d) best = c;
  return best.t;
}

function clampNum(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
