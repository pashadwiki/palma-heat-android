// missions.js — the job director. Five courier templates cycle in order with
// pay that escalates every job: a plain timed delivery, a hot package whose
// hand-off angers the law, a long cross-city haul, a getaway pickup that must
// be delivered with the car (mostly) intact, and a three-checkpoint supply
// run against a single clock.

import { raiseWantedTo } from './police.js';
import { spotByName } from './city.js';
import { rngPick } from './random.js';
import * as audio from './audio.js';

export const TEMPLATES = [
  'SPECIAL DELIVERY',
  'HOT PACKAGE',
  'LONG HAUL',
  'GETAWAY DRIVER',
  'SUPPLY RUN',
];

const TEMPLATE_MUL = {
  'SPECIAL DELIVERY': 1,
  'HOT PACKAGE': 1.8,
  'LONG HAUL': 1.5,
  'GETAWAY DRIVER': 1.4,
  'SUPPLY RUN': 1.3,
};

export function createMissions() {
  return { active: null, cooldown: 1.2, seq: 0 };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pickSpot(world, exclude) {
  const spots = world.city.spots;
  for (let tries = 0; tries < 12; tries++) {
    const s = rngPick(world.rng, spots);
    if (!exclude || !exclude.includes(s)) return s;
  }
  return spots[0];
}

function pickFarSpot(world, from) {
  let best = null;
  let bestD = 0;
  for (let tries = 0; tries < 14; tries++) {
    const s = rngPick(world.rng, world.city.spots);
    if (s === from) continue;
    const d = dist(from, s);
    if (d > bestD) { bestD = d; best = s; }
    if (d > 1750) return s;
  }
  return best || pickSpot(world, [from]);
}

// Start a job. opts may pin the template and the from/to spot names (the
// screenshot scenes do); otherwise the template follows the cycle and the
// spots come from the world stream.
export function startMission(world, template, opts = {}) {
  const m = world.missions;
  const name = template || TEMPLATES[m.seq % TEMPLATES.length];
  const from = opts.fromName ? spotByName(world.city, opts.fromName) : pickSpot(world);
  let to = null;
  let checkpoints = null;

  if (name === 'SUPPLY RUN') {
    checkpoints = [from];
    while (checkpoints.length < 3) {
      const s = pickSpot(world, checkpoints);
      if (!checkpoints.includes(s)) checkpoints.push(s);
    }
  } else if (name === 'LONG HAUL') {
    to = opts.toName ? spotByName(world.city, opts.toName) : pickFarSpot(world, from);
  } else {
    to = opts.toName ? spotByName(world.city, opts.toName) : pickSpot(world, [from]);
  }

  const routeDist = name === 'SUPPLY RUN'
    ? dist(from, checkpoints[1]) + dist(checkpoints[1], checkpoints[2])
    : dist(from, to);
  const lapMul = 1 + 0.12 * m.seq;
  const pay = Math.round((120 + routeDist * 0.11) * TEMPLATE_MUL[name] * lapMul);

  let phase;
  let timer;
  if (name === 'SUPPLY RUN') {
    phase = 'checkpoint';
    timer = routeDist / 225 + 48;
  } else {
    phase = 'pickup';
    const p = world.player.car || world.player;
    timer = dist(p, from) / 230 + 32;
  }

  m.active = {
    template: name,
    phase,
    from,
    to,
    checkpoints,
    cpIndex: 0,
    timer,
    timeLimit: timer,
    pay,
    clientAboard: false,
  };
  m.seq += 1;
  return m.active;
}

// Force the active job into another phase (screenshot staging only).
export function setMissionPhase(world, phase) {
  const a = world.missions.active;
  if (!a) return;
  a.phase = phase;
  if (phase === 'deliver') {
    a.timer = dist(a.from, a.to) / 235 + 40;
    a.timeLimit = a.timer;
    if (a.template === 'GETAWAY DRIVER') a.clientAboard = true;
  }
}

// The world point the player is currently being sent to, with its label.
export function missionTarget(world) {
  const a = world.missions.active;
  if (!a) return null;
  if (a.phase === 'pickup') {
    return {
      x: a.from.x, y: a.from.y,
      label: a.template === 'GETAWAY DRIVER' ? `Pick up at ${a.from.name}` : `Pick up at ${a.from.name}`,
    };
  }
  if (a.phase === 'checkpoint') {
    const cp = a.checkpoints[a.cpIndex];
    return { x: cp.x, y: cp.y, label: `Checkpoint ${a.cpIndex + 1} of ${a.checkpoints.length} — ${cp.name}` };
  }
  return { x: a.to.x, y: a.to.y, label: `Drop off at ${a.to.name}` };
}

function completeMission(world) {
  const a = world.missions.active;
  let pay = a.pay;
  if (a.template === 'GETAWAY DRIVER') {
    const condition = world.player.car ? world.player.car.health / 100 : 0.3;
    pay = Math.round(pay * (0.35 + 0.65 * condition));
  }
  world.cash += pay;
  world.jobsDone += 1;
  world.addToast(`${a.template} complete — +$${pay}`);
  audio.sfx('cash');
  world.missions.active = null;
  world.missions.cooldown = 2.5;
}

function failMission(world) {
  const a = world.missions.active;
  world.jobsFailed += 1;
  world.addToast(`${a.template} failed — out of time`);
  audio.sfx('fail');
  world.missions.active = null;
  world.missions.cooldown = 3;
}

export function updateMissions(world, dt) {
  const m = world.missions;
  if (!m.active) {
    m.cooldown -= dt;
    if (m.cooldown <= 0 && world.state === 'play') startMission(world);
    return;
  }
  const a = m.active;
  a.timer -= dt;
  if (a.timer <= 0) {
    failMission(world);
    return;
  }

  const target = missionTarget(world);
  const p = world.player.car || world.player;
  const d = Math.hypot(p.x - target.x, p.y - target.y);
  if (d > 58) return;

  if (a.phase === 'pickup') {
    audio.sfx('pickup');
    if (a.template === 'GETAWAY DRIVER') {
      a.clientAboard = true;
      raiseWantedTo(world, 3);
      world.addToast('Client is in — outrun the law!');
    } else {
      world.addToast('Package on board');
    }
    a.phase = 'deliver';
    a.timer = dist(a.from, a.to) / 235 + 30;
    a.timeLimit = a.timer;
  } else if (a.phase === 'checkpoint') {
    a.cpIndex += 1;
    if (a.cpIndex >= a.checkpoints.length) {
      completeMission(world);
    } else {
      audio.sfx('checkpoint');
      world.addToast(`Checkpoint ${a.cpIndex} of ${a.checkpoints.length}`);
    }
  } else if (a.phase === 'deliver') {
    if (a.template === 'HOT PACKAGE') raiseWantedTo(world, 2);
    completeMission(world);
  }
}
