// vehicles.js — car types and the arcade driving model shared by the player
// and the police: forward/lateral velocity split, so a car grips while driving
// straight and slides when the handbrake kills lateral grip. Collisions live
// in world.js; this file is pure motion.

import { CFG } from './config.js';

export const CAR_TYPES = {
  sedan: { len: 42, wid: 20, topSpeed: 450, accel: 290, grip: 7.5 },
  coupe: { len: 40, wid: 19, topSpeed: 545, accel: 345, grip: 8.0 },
  pickup: { len: 46, wid: 21, topSpeed: 420, accel: 270, grip: 7.0 },
  taxi: { len: 42, wid: 20, topSpeed: 450, accel: 295, grip: 7.5 },
  truck: { len: 54, wid: 23, topSpeed: 360, accel: 225, grip: 6.5 },
  police: { len: 43, wid: 20, topSpeed: 568, accel: 358, grip: 8.5 },
};

let nextCarId = 1;

export function makeCar(type, x, y, angle, color) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++,
    type,
    kind: 'parked', // parked | traffic | police | roadblock | player
    x, y, angle,
    vx: 0, vy: 0,
    len: spec.len, wid: spec.wid,
    radius: spec.len * 0.4,
    health: 100,
    color,
    ai: null, // traffic state, when kind === 'traffic'
    staged: false, // posed by a screenshot scene; exempt from despawn rules
    roadblock: false,
    smokeT: 0,
  };
}

export function carSpeed(car) {
  return Math.hypot(car.vx, car.vy);
}

export function forwardSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

// Advance one car by dt under control { throttle -1..1, steer -1..1, brake,
// nitro }. Returns { vf, boosting } so callers can drive meters and effects.
export function stepCar(car, ctl, dt) {
  const spec = CAR_TYPES[car.type];
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let vf = car.vx * fx + car.vy * fy;
  let vl = -car.vx * fy + car.vy * fx;

  const boosting = !!ctl.nitro && ctl.throttle > 0 && vf > -10;
  const accel = spec.accel * (boosting ? CFG.nitroAccelMul : 1);
  const top = spec.topSpeed * (boosting ? CFG.nitroTopMul : 1);

  if (ctl.throttle > 0) {
    vf += accel * ctl.throttle * dt;
    if (vf > top) vf = Math.max(top, vf - 300 * dt); // soft cap: bleed back down
  } else if (ctl.throttle < 0) {
    if (vf > 12) vf -= 540 * dt; // braking toward a stop
    else {
      vf += 210 * ctl.throttle * dt; // reverse
      if (vf < -165) vf = -165;
    }
  }

  // Drag, plus rolling resistance that settles the car when coasting.
  vf -= vf * 0.32 * dt;
  if (!ctl.throttle) {
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), 30 * dt);
  }

  // Lateral grip kills sideways slide; the handbrake slashes it for drifts.
  const grip = ctl.brake ? 2.3 : spec.grip;
  vl *= Math.exp(-grip * dt);
  if (ctl.brake) vf -= vf * 1.35 * dt;

  // Steering authority scales with forward speed and flips in reverse.
  const authority = Math.max(-1, Math.min(1, vf / 130));
  car.angle += ctl.steer * 2.5 * authority * dt * (ctl.brake ? 1.35 : 1);

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * vf - nfy * vl;
  car.vy = nfy * vf + nfx * vl;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  return { vf, boosting };
}
