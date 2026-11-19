// world.js — the simulation itself: world state, the fixed-step update that
// glues player, traffic, pedestrians, police and missions together, all
// collision resolution, crime reporting, camera work and the run lifecycle
// (start, busted, wrecked, restart). Rendering and sound live elsewhere; this
// file only decides what is true.

import { CFG, CAR_COLORS } from './config.js';
import { mulberry32, rngPick } from './random.js';
import { generateCity, circleRectPush } from './city.js';
import { makeCar, stepCar, carSpeed, forwardSpeed } from './vehicles.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { spawnPeds, updatePeds, scarePeds } from './pedestrians.js';
import { createPolice, updatePolice, addHeat, starsFor } from './police.js';
import { createMissions, updateMissions } from './missions.js';
import * as audio from './audio.js';

function readBest() {
  try {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem('palmaHeatBest')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(v) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('palmaHeatBest', String(v));
  } catch {
    /* storage unavailable: the best haul is simply not kept */
  }
}

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const city = generateCity(mulberry32(seed ^ 0x9e3779b9));
  const world = {
    seed,
    rng,
    city,
    time: 0,
    state: 'title', // title | play | over
    over: null,
    paused: false,
    viewW: 1280,
    viewH: 800,
    player: {
      x: CFG.avenueX[2] - 72, y: CFG.streetY[2] + 70,
      angle: -Math.PI / 2, vx: 0, vy: 0,
      health: 100, car: null,
    },
    cars: [],
    peds: [],
    particles: [],
    skids: [],
    toasts: [],
    police: createPolice(),
    missions: createMissions(),
    cash: 0,
    jobsDone: 0,
    jobsFailed: 0,
    topWanted: 0,
    nitro: { meter: 1, boosting: false },
    camera: { x: CFG.avenueX[2], y: CFG.streetY[2], zoom: 1 },
    shake: 0,
    prompt: '',
    crimeT: 0,
    rbCrimeT: 0,
    crashSfxT: 0,
    best: readBest(),
    flags: { shotMode: false, shotName: null, autoDrive: null },
  };

  world.addToast = (text) => {
    world.toasts.push({ text, t: 0 });
    if (world.toasts.length > 3) world.toasts.shift();
  };

  // Kerb-parked cars from the city's parking spots.
  for (const spot of city.parkedSpots) {
    const type = spot.truck ? 'truck' : rngPick(rng, ['sedan', 'coupe', 'pickup', 'sedan']);
    const car = makeCar(type, spot.x, spot.y, spot.angle, rngPick(rng, CAR_COLORS));
    car.kind = 'parked';
    world.cars.push(car);
  }
  spawnTraffic(world, 14);
  spawnPeds(world, 16);
  return world;
}

export function playerPos(world) {
  const c = world.player.car;
  return c ? { x: c.x, y: c.y } : { x: world.player.x, y: world.player.y };
}

export function playerVel(world) {
  const c = world.player.car;
  return c ? { x: c.vx, y: c.vy } : { x: world.player.vx, y: world.player.vy };
}

// Report a crime at (x, y): heat rises by the base amount, more when a
// pedestrian or a police car is close enough to have seen it, and nearby
// pedestrians scatter either way.
export function reportCrime(world, baseAmount, x, y) {
  let witnessed = false;
  for (const ped of world.peds) {
    if (Math.hypot(ped.x - x, ped.y - y) < CFG.witnessRange) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const car of world.police.fleet) {
      if (Math.hypot(car.x - x, car.y - y) < CFG.witnessRange + 80) { witnessed = true; break; }
    }
  }
  addHeat(world, baseAmount * (witnessed ? CFG.witnessMul : 1));
  scarePeds(world, x, y, 210);
}

export function startRun(world) {
  const fresh = createWorld(world.seed);
  const best = Math.max(world.best, fresh.best);
  const viewW = world.viewW;
  const viewH = world.viewH;
  for (const k of Object.keys(world)) delete world[k];
  Object.assign(world, fresh);
  world.best = best;
  world.viewW = viewW;
  world.viewH = viewH;
  world.state = 'play';
}

export function endRun(world, kind) {
  if (world.state === 'over') return;
  world.state = 'over';
  world.over = {
    kind,
    cash: world.cash,
    jobsDone: world.jobsDone,
    jobsFailed: world.jobsFailed,
    topWanted: world.topWanted,
  };
  if (world.cash > world.best) {
    world.best = world.cash;
    saveBest(world.best);
  }
  if (kind === 'busted') audio.sfx('busted');
  else audio.sfx('fail');
}

// E or F: get into the nearest civilian car, or get out of the current one.
export function toggleEnterExit(world) {
  const p = world.player;
  if (p.car) {
    const car = p.car;
    car.kind = 'parked';
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * (car.wid + 12);
    p.y = car.y + Math.sin(side) * (car.wid + 12);
    p.vx = 0;
    p.vy = 0;
    p.car = null;
    audio.sfx('enter');
    return;
  }
  let best = null;
  let bestD = 52;
  for (const car of world.cars) {
    if (car.kind !== 'traffic' && car.kind !== 'parked') continue;
    if (car.health <= 0) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  if (best.kind === 'traffic') {
    // The driver bails out and runs.
    world.peds.push({
      x: best.x + 14, y: best.y + 10, angle: 0,
      ring: world.city.rings[0], t: 0, per: 100, dir: 1,
      speed: 42, state: 'flee', fleeT: 2.2, fleeX: best.x, fleeY: best.y,
      downT: 0, shirt: '#d95f4b', skin: '#d9a066',
    });
    reportCrime(world, CFG.crimeTheftWitnessedBase, best.x, best.y);
    world.addToast('Car taken!');
  } else {
    reportCrime(world, CFG.crimeTheftParkedBase, best.x, best.y);
  }
  best.kind = 'player';
  best.ai = null;
  p.car = best;
  p.x = best.x;
  p.y = best.y;
  audio.sfx('steal');
  audio.sfx('enter');
}

// ---------------------------------------------------------------------------
// Per-step control.
// ---------------------------------------------------------------------------

function autoDriveControl(world) {
  // Staged scenes drive the player's car along a lane with no human input.
  const ad = world.flags.autoDrive;
  const car = world.player.car;
  if (!ad || !car) return { steer: 0, throttle: 0, moveX: 0, moveY: 0, nitro: false, brake: false, enter: false };
  let tx;
  let ty;
  if (ad.axis === 'y') {
    tx = world.city.avenues[ad.road] - ad.dir * CFG.laneOffset;
    ty = car.y + ad.dir * 120;
  } else {
    tx = car.x + ad.dir * 120;
    ty = world.city.streets[ad.road] + ad.dir * CFG.laneOffset;
  }
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const speed = carSpeed(car);
  const target = ad.targetSpeed || 430;
  return {
    steer: Math.max(-1, Math.min(1, diff * 2.2)),
    throttle: speed < target ? 1 : 0,
    moveX: 0, moveY: 0,
    nitro: !!ad.nitro,
    brake: false,
    enter: false,
  };
}

function updatePlayerOnFoot(world, input, dt) {
  const p = world.player;
  const len = Math.hypot(input.moveX, input.moveY);
  let mx = 0;
  let my = 0;
  if (len > 0.01) {
    mx = input.moveX / len;
    my = input.moveY / len;
    p.angle = Math.atan2(my, mx);
  }
  const blend = Math.min(1, dt * 12);
  p.vx += (mx * CFG.walkSpeed - p.vx) * blend;
  p.vy += (my * CFG.walkSpeed - p.vy) * blend;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  for (const r of world.city.colliders) {
    const push = circleRectPush(p.x, p.y, CFG.playerRadius, r);
    if (push) {
      p.x += push.px;
      p.y += push.py;
    }
  }
  p.x = Math.max(14, Math.min(CFG.waterX + 14, p.x));
  p.y = Math.max(14, Math.min(CFG.worldH - 14, p.y));
}

function updatePlayerDriving(world, input, dt) {
  const p = world.player;
  const car = p.car;
  const wasBoosting = world.nitro.boosting;

  let boosting = false;
  if (input.nitro && input.throttle > 0 && world.nitro.meter > 0.02) {
    boosting = true;
    world.nitro.meter = Math.max(0, world.nitro.meter - CFG.nitroDrain * dt);
  } else {
    world.nitro.meter = Math.min(1, world.nitro.meter + CFG.nitroRefill * dt);
  }
  world.nitro.boosting = boosting;
  if (boosting && !wasBoosting) audio.sfx('whoosh');

  stepCar(car, {
    throttle: input.throttle,
    steer: input.steer,
    brake: input.brake,
    nitro: boosting,
  }, dt);

  if (boosting) {
    // Twin exhaust flames from the rear bumper.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    for (const sideOff of [-5, 5]) {
      world.particles.push({
        kind: 'flame',
        x: car.x - fx * car.len * 0.55 - fy * sideOff,
        y: car.y - fy * car.len * 0.55 + fx * sideOff,
        vx: -fx * (240 + carSpeed(car) * 0.35) + world.rng() * 30 - 15,
        vy: -fy * (240 + carSpeed(car) * 0.35) + world.rng() * 30 - 15,
        life: 0.16 + world.rng() * 0.1,
        maxLife: 0.26,
        size: 6 + world.rng() * 5,
      });
    }
    // Boosting in plain sight of the law is itself a crime, drip-fed.
    for (const cop of world.police.fleet) {
      if (Math.hypot(cop.x - car.x, cop.y - car.y) < CFG.nitroSightRange) {
        addHeat(world, CFG.nitroHeatPerSecond * dt);
        break;
      }
    }
  }

  // Skid marks when the car slides or handbrake-turns.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const vl = -car.vx * fy + car.vy * fx;
  if (Math.abs(vl) > 55 || (input.brake && carSpeed(car) > 230)) {
    for (const sideOff of [-car.wid / 2 + 2, car.wid / 2 - 2]) {
      world.skids.push({
        x: car.x - fx * car.len * 0.32 - fy * sideOff,
        y: car.y - fy * car.len * 0.32 + fx * sideOff,
        angle: car.angle, t: 0,
      });
    }
    if (world.skids.length > 600) world.skids.splice(0, world.skids.length - 600);
  }

  p.x = car.x;
  p.y = car.y;
}

// ---------------------------------------------------------------------------
// Collisions.
// ---------------------------------------------------------------------------

function collideCarWithRects(world, car, dt) {
  for (const r of world.city.colliders) {
    const push = circleRectPush(car.x, car.y, car.radius, r);
    if (!push) continue;
    car.x += push.px;
    car.y += push.py;
    const into = -(car.vx * push.nx + car.vy * push.ny);
    if (into > 0) {
      car.vx += push.nx * into;
      car.vy += push.ny * into;
      if (into > 130) {
        const dmg = (into - 130) * 0.055;
        car.health -= dmg;
        if (car === world.player.car) {
          world.shake = Math.min(0.6, world.shake + dmg * 0.012);
          if (world.crashSfxT <= 0) {
            audio.sfx('crash');
            world.crashSfxT = 0.25;
          }
        }
      }
    }
  }
  // World bounds and the waterline.
  car.x = Math.max(28, Math.min(CFG.waterX - 6, car.x));
  car.y = Math.max(28, Math.min(CFG.worldH - 28, car.y));
}

function collideCars(world, dt) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minD = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (minD - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel >= 0) continue; // already separating
      const impact = -rel;
      const impulse = impact * 0.62;
      a.vx -= nx * impulse;
      a.vy -= ny * impulse;
      b.vx += nx * impulse;
      b.vy += ny * impulse;
      if (impact > 120) {
        const dmg = (impact - 120) * 0.05;
        a.health -= dmg;
        b.health -= dmg;
        spawnSparks(world, (a.x + b.x) / 2, (a.y + b.y) / 2, 5);
        const playerCar = world.player.car;
        if (a === playerCar || b === playerCar) {
          const other = a === playerCar ? b : a;
          world.shake = Math.min(0.6, world.shake + dmg * 0.014);
          if (world.crashSfxT <= 0) {
            audio.sfx('crash');
            world.crashSfxT = 0.25;
          }
          if (other.roadblock) {
            if (world.rbCrimeT <= 0) {
              reportCrime(world, CFG.crimeRoadblockSmash, other.x, other.y);
              world.addToast('Roadblock smashed!');
              world.rbCrimeT = 1.4;
            }
          } else if ((other.kind === 'traffic' || other.kind === 'parked') && world.crimeT <= 0) {
            reportCrime(world, CFG.crimeCarHit, other.x, other.y);
            world.crimeT = 0.8;
          }
        }
      }
    }
  }
}

function collideCarsWithPeds(world) {
  for (const car of world.cars) {
    const speed = carSpeed(car);
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d > car.radius + 7) continue;
      if (speed > 70) {
        ped.state = 'down';
        ped.downT = 0;
        car.vx *= 0.92;
        car.vy *= 0.92;
        if (car === world.player.car) {
          reportCrime(world, CFG.crimePedHit, ped.x, ped.y);
          world.addToast('You hit a pedestrian!');
          world.shake = Math.min(0.6, world.shake + 0.25);
          audio.sfx('crash');
        }
      } else {
        // A gentle nudge: the pedestrian steps aside, unharmed.
        const dx = ped.x - car.x;
        const dy = ped.y - car.y;
        const dd = Math.hypot(dx, dy) || 1;
        ped.x += (dx / dd) * 3;
        ped.y += (dy / dd) * 3;
      }
    }
  }
  // The on-foot player can be clipped by a moving car.
  const p = world.player;
  if (!p.car) {
    for (const car of world.cars) {
      if (car.kind === 'parked' || car.kind === 'roadblock') continue;
      const speed = carSpeed(car);
      if (speed < 130) continue;
      const d = Math.hypot(p.x - car.x, p.y - car.y);
      if (d < car.radius + CFG.playerRadius) {
        p.health -= 22;
        const dx = p.x - car.x;
        const dy = p.y - car.y;
        const dd = Math.hypot(dx, dy) || 1;
        p.x += (dx / dd) * 26;
        p.y += (dy / dd) * 26;
        world.shake = Math.min(0.7, world.shake + 0.3);
        audio.sfx('crash');
      }
    }
  }
}

function spawnSparks(world, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = world.rng() * Math.PI * 2;
    const s = 60 + world.rng() * 160;
    world.particles.push({
      kind: 'spark', x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.25 + world.rng() * 0.2, maxLife: 0.45, size: 2.5,
    });
  }
}

function updateParticles(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      world.particles.splice(i, 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.kind === 'smoke') {
      pt.vy -= 14 * dt;
      pt.size += 9 * dt;
    }
  }
  // Damage smoke from any car that is hurting.
  for (const car of world.cars) {
    if (car.health >= 45 || car.health <= 0) continue;
    car.smokeT += dt;
    if (car.smokeT > 0.1) {
      car.smokeT = 0;
      world.particles.push({
        kind: 'smoke',
        x: car.x + world.rng() * 10 - 5, y: car.y + world.rng() * 10 - 5,
        vx: world.rng() * 10 - 5, vy: -26 - world.rng() * 12,
        life: 0.9, maxLife: 0.9, size: 6,
      });
    }
  }
  for (let i = world.skids.length - 1; i >= 0; i--) {
    world.skids[i].t += dt;
    if (world.skids[i].t > 6) world.skids.splice(i, 1);
  }
}

function updateCamera(world, dt) {
  const pos = playerPos(world);
  const vel = playerVel(world);
  const tx = pos.x + vel.x * 0.32;
  const ty = pos.y + vel.y * 0.32;
  const blend = Math.min(1, dt * 5);
  world.camera.x += (tx - world.camera.x) * blend;
  world.camera.y += (ty - world.camera.y) * blend;
  const zoomTarget = world.nitro.boosting ? CFG.nitroZoom : CFG.baseZoom;
  world.camera.zoom += (zoomTarget - world.camera.zoom) * Math.min(1, dt * 3.5);
  const hw = world.viewW / 2 / world.camera.zoom;
  const hh = world.viewH / 2 / world.camera.zoom;
  world.camera.x = CFG.worldW > hw * 2 ? Math.max(hw, Math.min(CFG.worldW - hw, world.camera.x)) : CFG.worldW / 2;
  world.camera.y = CFG.worldH > hh * 2 ? Math.max(hh, Math.min(CFG.worldH - hh, world.camera.y)) : CFG.worldH / 2;
  world.shake *= Math.exp(-5 * dt);
}

function updatePrompt(world) {
  const p = world.player;
  if (p.car) {
    world.prompt = carSpeed(p.car) < 130 ? 'Press E to get out' : '';
    return;
  }
  let best = null;
  let bestD = 52;
  for (const car of world.cars) {
    if (car.kind !== 'traffic' && car.kind !== 'parked') continue;
    if (car.health <= 0) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  world.prompt = best ? `Press E to take the ${best.type}` : '';
}

// ---------------------------------------------------------------------------
// The fixed-step update.
// ---------------------------------------------------------------------------

export function updateWorld(world, input, dt) {
  world.time += dt;
  world.crimeT = Math.max(0, world.crimeT - dt);
  world.rbCrimeT = Math.max(0, world.rbCrimeT - dt);
  world.crashSfxT = Math.max(0, world.crashSfxT - dt);
  for (let i = world.toasts.length - 1; i >= 0; i--) {
    world.toasts[i].t += dt;
    if (world.toasts[i].t > 2.8) world.toasts.splice(i, 1);
  }

  if (world.state !== 'play') {
    // Title and game-over: the city stays alive behind the panels.
    updateTraffic(world, dt);
    updatePeds(world, dt);
    updateParticles(world, dt);
    return;
  }

  const ctl = world.flags.autoDrive ? autoDriveControl(world) : input;

  if (world.player.car) updatePlayerDriving(world, ctl, dt);
  else updatePlayerOnFoot(world, ctl, dt);

  for (const car of world.cars) {
    if (car.kind === 'police') continue; // the police step themselves
    if (car.kind === 'traffic') continue; // traffic steps itself
    collideCarWithRects(world, car, dt);
  }
  collideCars(world, dt);
  collideCarsWithPeds(world);

  updateTraffic(world, dt);
  updatePeds(world, dt);
  updatePolice(world, dt);
  // Police cars step themselves inside updatePolice, so their building
  // collisions resolve afterwards instead of in the loop above.
  for (const car of world.police.fleet) collideCarWithRects(world, car, dt);
  updateMissions(world, dt);
  updateParticles(world, dt);
  updatePrompt(world);
  updateCamera(world, dt);

  const stars = starsFor(world.police.heat);
  if (stars > world.topWanted) world.topWanted = stars;

  if (world.police.busted >= CFG.bustedSeconds) endRun(world, 'busted');
  else if (world.player.car && world.player.car.health <= 0) endRun(world, 'wrecked');
  else if (world.player.health <= 0) endRun(world, 'down');
}

export { forwardSpeed, carSpeed };
