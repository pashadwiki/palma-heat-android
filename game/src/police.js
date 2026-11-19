// police.js — the wanted system: a heat value behind 1-5 stars, a pursuit
// fleet that leads its target, a busted meter for when they pin you, line-of-
// sight heat decay, and roadblocks at four stars and up.
//
// Shot staging note: police.heatCap is normally null. A staged screenshot
// scene may set it (to the 4-star mid-band) so the composed frame can never
// drift off its star count; addHeat, raiseWantedTo and the update loop all
// clamp to it. Normal play never sets it.

import { CFG } from './config.js';
import { segmentBlocked } from './city.js';
import { makeCar, stepCar, carSpeed } from './vehicles.js';
import * as audio from './audio.js';

export function createPolice() {
  return {
    heat: 0,
    heatCap: null,
    fleet: [],
    roadblocks: [],
    busted: 0,
    losTimer: 0,
    spawnT: 0,
    rbCooldown: 0,
    siren: 0, // 0..1 proximity level, drives the siren volume
  };
}

export function starsFor(heat) {
  if (heat <= 0) return 0;
  return Math.min(5, Math.ceil(heat / 100));
}

function clampHeat(world) {
  const p = world.police;
  p.heat = Math.max(0, Math.min(CFG.heatMax, p.heat));
  if (p.heatCap != null) p.heat = Math.min(p.heat, p.heatCap);
}

export function addHeat(world, amount) {
  world.police.heat += amount;
  clampHeat(world);
}

export function raiseWantedTo(world, stars) {
  const target = stars * 100 - 50; // mid-band of the requested star level
  if (world.police.heat < target) world.police.heat = target;
  clampHeat(world);
}

// The thing being chased: the player's car, or the player on foot.
export function chaseTarget(world) {
  const c = world.player.car;
  if (c) return { x: c.x, y: c.y, vx: c.vx, vy: c.vy, speed: carSpeed(c) };
  const p = world.player;
  return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, speed: Math.hypot(p.vx, p.vy) };
}

// Line of sight: any fleet car close enough with an unobstructed segment.
export function policeCanSee(world) {
  const t = chaseTarget(world);
  for (const car of world.police.fleet) {
    const d = Math.hypot(car.x - t.x, car.y - t.y);
    if (d < 760 && !segmentBlocked(world.city, car.x, car.y, t.x, t.y)) return true;
  }
  return false;
}

function removeCar(world, car) {
  const i = world.cars.indexOf(car);
  if (i >= 0) world.cars.splice(i, 1);
  const f = world.police.fleet.indexOf(car);
  if (f >= 0) world.police.fleet.splice(f, 1);
  const r = world.police.roadblocks.indexOf(car);
  if (r >= 0) world.police.roadblocks.splice(r, 1);
}

function spawnCop(world) {
  const t = chaseTarget(world);
  const city = world.city;
  const options = [];
  for (const ix of city.intersections) {
    const d = Math.hypot(ix.x - t.x, ix.y - t.y);
    if (d > 520 && d < 800) options.push(ix);
  }
  if (options.length === 0) return;
  const at = options[Math.floor(world.rng() * options.length)];
  const car = makeCar('police', at.x, at.y, Math.atan2(t.y - at.y, t.x - at.x), '#e8e8ec');
  car.kind = 'police';
  world.cars.push(car);
  world.police.fleet.push(car);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function drivePursuit(world, car, dt) {
  const t = chaseTarget(world);
  // Aim ahead of the target's motion: an intercept course, not a tail chase.
  const lead = 0.35;
  const tx = t.x + t.vx * lead;
  const ty = t.y + t.vy * lead;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(desired - car.angle);
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  const throttle = Math.abs(diff) > 2.3 ? -1 : 1;
  stepCar(car, { throttle, steer, brake: false, nitro: false }, dt);
}

function desiredRoadblocks(stars) {
  if (stars >= 5) return 2;
  if (stars >= 4) return 1;
  return 0;
}

function placeRoadblock(world) {
  const t = chaseTarget(world);
  const city = world.city;
  const horizontal = Math.abs(t.vx) >= Math.abs(t.vy);
  const cars = [];
  if (horizontal) {
    const dir = t.vx >= 0 ? 1 : -1;
    let road = 0;
    let best = Infinity;
    for (let i = 0; i < city.streets.length; i++) {
      const d = Math.abs(city.streets[i] - t.y);
      if (d < best) { best = d; road = i; }
    }
    const bx = Math.max(150, Math.min(CFG.worldW - 260, t.x + dir * 540));
    const lane = city.streets[road] + dir * CFG.laneOffset;
    cars.push(makeCar('police', bx, lane - 54, Math.PI / 2, '#e8e8ec'));
    cars.push(makeCar('police', bx, lane + 54, Math.PI / 2, '#e8e8ec'));
  } else {
    const dir = t.vy >= 0 ? 1 : -1;
    let road = 0;
    let best = Infinity;
    for (let i = 0; i < city.avenues.length; i++) {
      const d = Math.abs(city.avenues[i] - t.x);
      if (d < best) { best = d; road = i; }
    }
    const by = Math.max(150, Math.min(CFG.worldH - 150, t.y + dir * 540));
    const lane = city.avenues[road] - dir * CFG.laneOffset;
    cars.push(makeCar('police', lane - 54, by, 0, '#e8e8ec'));
    cars.push(makeCar('police', lane + 54, by, 0, '#e8e8ec'));
  }
  for (const car of cars) {
    car.kind = 'roadblock';
    car.roadblock = true;
    world.cars.push(car);
    world.police.roadblocks.push(car);
  }
}

export function updatePolice(world, dt) {
  const p = world.police;
  const stars = starsFor(p.heat);
  const t = chaseTarget(world);
  const shot = world.flags.shotMode;

  // --- Sight and decay -----------------------------------------------------
  if (stars > 0 && policeCanSee(world)) {
    p.losTimer = 0;
  } else if (stars > 0) {
    p.losTimer += dt;
    if (p.losTimer > CFG.loseSightAfter) {
      p.heat -= CFG.heatDecayPerSecond * dt;
    }
  }
  clampHeat(world);

  // --- Fleet size ----------------------------------------------------------
  p.spawnT -= dt;
  if (stars === 0) {
    // Nobody is looking anymore: the fleet gives up and leaves.
    for (const car of [...p.fleet]) if (!car.staged) removeCar(world, car);
    for (const car of [...p.roadblocks]) if (!car.staged) removeCar(world, car);
  } else {
    // A wrecked police car is out of the chase and frees its fleet slot.
    for (const car of [...p.fleet]) {
      if (!car.staged && car.health <= 0) removeCar(world, car);
    }
    if (p.fleet.length < stars && p.spawnT <= 0) {
      spawnCop(world);
      p.spawnT = 1.1;
    }
    for (const car of [...p.fleet]) {
      if (car.staged) continue;
      const d = Math.hypot(car.x - t.x, car.y - t.y);
      if (d > 1250) removeCar(world, car);
    }
  }

  // --- Pursuit -------------------------------------------------------------
  let nearest = Infinity;
  for (const car of p.fleet) {
    drivePursuit(world, car, dt);
    const d = Math.hypot(car.x - t.x, car.y - t.y);
    if (d < nearest) nearest = d;
  }
  p.siren = stars > 0 ? Math.max(0, Math.min(1, 1 - nearest / 700)) : 0;
  audio.updateSiren(p.siren, stars);

  // --- Busted meter ----------------------------------------------------------
  if (stars > 0 && nearest < CFG.bustedRange && t.speed < CFG.bustedSpeed) {
    p.busted += dt;
  } else {
    p.busted = Math.max(0, p.busted - dt * 1.6);
  }

  // --- Roadblocks ------------------------------------------------------------
  p.rbCooldown -= dt;
  if (!shot) {
    if (stars < 4) {
      for (const car of [...p.roadblocks]) if (!car.staged) removeCar(world, car);
    } else {
      for (const car of [...p.roadblocks]) {
        if (car.staged) continue;
        const d = Math.hypot(car.x - t.x, car.y - t.y);
        if (d > 820) removeCar(world, car);
      }
      const groups = Math.round(p.roadblocks.length / 2);
      if (groups < desiredRoadblocks(stars) && p.rbCooldown <= 0) {
        placeRoadblock(world);
        p.rbCooldown = 5;
      }
    }
  }
}
