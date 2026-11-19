// traffic.js — Palma City's civilian traffic: cars that follow keep-right
// lanes, brake for whatever is ahead, sometimes turn at intersections, and
// quietly recycle when they get stuck or wander too far from the action.

import { CFG, CAR_COLORS } from './config.js';
import { laneCoord } from './city.js';
import { makeCar, carSpeed } from './vehicles.js';
import { rngRange, rngPick, rngChance } from './random.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'coupe', 'pickup', 'taxi', 'sedan', 'coupe', 'taxi'];

function placeOnLane(world, car, axis, road, dir, along) {
  car.ai = {
    axis, road, dir,
    cruise: rngRange(world.rng, 195, 295),
    stuck: 0,
    turnCooldown: rngRange(world.rng, 1, 4),
  };
  if (axis === 'y') {
    car.x = laneCoord(world.city, 'y', road, dir);
    car.y = along;
    car.angle = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
  } else {
    car.x = along;
    car.y = laneCoord(world.city, 'x', road, dir);
    car.angle = dir < 0 ? Math.PI : 0;
  }
  car.vx = 0;
  car.vy = 0;
}

export function spawnTraffic(world, count) {
  const city = world.city;
  for (let i = 0; i < count; i++) {
    const type = rngPick(world.rng, TRAFFIC_TYPES);
    const color = type === 'taxi' ? '#e8b53a' : rngPick(world.rng, CAR_COLORS);
    const car = makeCar(type, 0, 0, 0, color);
    car.kind = 'traffic';
    const axis = rngChance(world.rng, 0.5) ? 'y' : 'x';
    const road = axis === 'y'
      ? Math.floor(world.rng() * city.avenues.length)
      : Math.floor(world.rng() * city.streets.length);
    const dir = rngChance(world.rng, 0.5) ? 1 : -1;
    const along = axis === 'y'
      ? rngRange(world.rng, 120, CFG.worldH - 120)
      : rngRange(world.rng, 120, CFG.worldW - 260);
    placeOnLane(world, car, axis, road, dir, along);
    world.cars.push(car);
  }
}

// Teleport a traffic car to a fresh lane a few hundred px from the player:
// close enough to keep the city feeling alive, far enough to pop in unseen.
function recycleCar(world, car) {
  const p = world.player.car || world.player;
  const axis = rngChance(world.rng, 0.5) ? 'y' : 'x';
  const dir = rngChance(world.rng, 0.5) ? 1 : -1;
  let road;
  let along;
  if (axis === 'y') {
    road = nearestIndex(world.city.avenues, p.x + rngRange(world.rng, -500, 500));
    along = clamp(p.y + rngRange(world.rng, 620, 820) * (rngChance(world.rng, 0.5) ? 1 : -1), 100, CFG.worldH - 100);
  } else {
    road = nearestIndex(world.city.streets, p.y + rngRange(world.rng, -400, 400));
    along = clamp(p.x + rngRange(world.rng, 620, 820) * (rngChance(world.rng, 0.5) ? 1 : -1), 100, CFG.worldW - 300);
  }
  placeOnLane(world, car, axis, road, dir, along);
}

function nearestIndex(arr, v) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - v);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Is something solid sitting in this car's path? Scans every other car and
// the on-foot player (a driver brakes for a pedestrian in the road, too).
function obstacleAhead(world, car, fx, fy) {
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along < 4 || along > 68) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 22) return other;
  }
  const pl = world.player;
  if (!pl.car) {
    const dx = pl.x - car.x;
    const dy = pl.y - car.y;
    const along = dx * fx + dy * fy;
    if (along > 2 && along < 56 && Math.abs(-dx * fy + dy * fx) < 18) return pl;
  }
  // Drivers also brake for a pedestrian caught in the road ahead.
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const along = dx * fx + dy * fy;
    if (along > 2 && along < 50 && Math.abs(-dx * fy + dy * fx) < 16) return ped;
  }
  return null;
}

export function updateTraffic(world, dt) {
  const city = world.city;
  const p = world.player.car || world.player;

  for (const car of world.cars) {
    if (car.kind !== 'traffic' || !car.ai) continue;
    const ai = car.ai;

    // Recycle when stuck or when the player has left this car far behind.
    const distToPlayer = Math.hypot(car.x - p.x, car.y - p.y);
    if (carSpeed(car) < 14) ai.stuck += dt; else ai.stuck = 0;
    if (ai.stuck > 2.6 || distToPlayer > 1050) {
      recycleCar(world, car);
      continue;
    }

    ai.turnCooldown -= dt;

    // Target: a point ahead on the current lane, so steering curves the car
    // back to its lane centre after any nudge.
    let tx;
    let ty;
    if (ai.axis === 'y') {
      tx = laneCoord(city, 'y', ai.road, ai.dir);
      ty = car.y + ai.dir * 110;
    } else {
      tx = car.x + ai.dir * 110;
      ty = laneCoord(city, 'x', ai.road, ai.dir);
    }
    const desired = Math.atan2(ty - car.y, tx - car.x);
    const diff = wrapAngle(desired - car.angle);
    const maxTurn = 2.1 * dt;
    car.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

    // Speed: cruise unless something is ahead, then match or stop.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const blocker = obstacleAhead(world, car, fx, fy);
    let target = ai.cruise;
    if (blocker) {
      const gap = Math.hypot(blocker.x - car.x, blocker.y - car.y);
      target = gap < 40 ? 0 : ai.cruise * 0.45;
    }
    const speed = carSpeed(car);
    const accel = target > speed ? 150 : 420;
    const next = speed + Math.max(-accel * dt, Math.min(accel * dt, target - speed));
    car.vx = fx * next;
    car.vy = fy * next;
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // Turning: near a crossing road's centre line, sometimes swing onto it.
    if (ai.turnCooldown <= 0) {
      const cross = ai.axis === 'y' ? city.streets : city.avenues;
      const along = ai.axis === 'y' ? car.y : car.x;
      for (let i = 0; i < cross.length; i++) {
        if (Math.abs(along - cross[i]) < 13) {
          if (rngChance(world.rng, 0.3)) {
            ai.axis = ai.axis === 'y' ? 'x' : 'y';
            ai.road = i;
            ai.dir = rngChance(world.rng, 0.5) ? 1 : -1;
          }
          ai.turnCooldown = 3;
          break;
        }
      }
    }

    // Keep traffic inside the world; turn around at the map's edge roads.
    if (car.x < 60 || car.x > CFG.worldW - 60 || car.y < 60 || car.y > CFG.worldH - 60) {
      recycleCar(world, car);
    }
  }
}
