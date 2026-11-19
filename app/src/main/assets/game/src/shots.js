// shots.js — the four staged screenshot scenes (?shot=title|onfoot|drive|
// chase). Each poses a living world that needs no input and settles
// deterministically at seed 1. updateShot runs once per fixed step BEFORE
// world.updateWorld and only does the upkeep a pose needs: pinning the nitro
// meter on the drive shot, and holding the chase formation (police offsets,
// roadblock distance, the 4-star heat pin) so the composed frame reads the
// same at capture time as it did at composition time.

import { CFG } from './config.js';
import { makeCar } from './vehicles.js';
import { startMission, setMissionPhase } from './missions.js';
import { spotByName } from './city.js';

const CHASE_STREET = 2; // the central east-west street (y = 1000)
const CHASE_LANE_Y = CFG.streetY[CHASE_STREET] + CFG.laneOffset; // eastbound lane
const CHASE_START_X = 1200;
const POLICE_OFFSETS = [165, 235, 315, 395];
const ROADBLOCK_AHEAD = 260;

function snapCamera(world, x, y) {
  world.camera.x = x;
  world.camera.y = y;
}

function givePlayerCar(world, type, x, y, angle, color) {
  const car = makeCar(type, x, y, angle, color);
  car.kind = 'player';
  world.cars.push(car);
  world.player.car = car;
  world.player.x = x;
  world.player.y = y;
  return car;
}

export function stageShot(world, name) {
  world.flags.shotMode = true;
  world.flags.shotName = name;
  const city = world.city;

  if (name === 'title') {
    world.state = 'title';
    snapCamera(world, city.avenues[3], city.streets[2]);
    return;
  }

  world.state = 'play';

  if (name === 'onfoot') {
    const spot = spotByName(city, 'PAWN SHOP');
    world.player.car = null;
    // On the sidewalk west of the avenue: clear of the traffic lanes, well
    // outside the 58px pickup radius, with the beam in plain view.
    world.player.x = spot.x - 90;
    world.player.y = spot.y + 52;
    world.player.angle = Math.atan2(spot.y - world.player.y, spot.x - world.player.x);
    startMission(world, 'SPECIAL DELIVERY', { fromName: 'PAWN SHOP' });
    snapCamera(world, world.player.x, world.player.y);
    return;
  }

  if (name === 'drive') {
    const road = 3; // a central avenue, driven southbound
    const laneX = city.avenues[road] - CFG.laneOffset;
    const car = givePlayerCar(world, 'coupe', laneX, 640, Math.PI / 2, '#e2483d');
    car.vy = 470;
    world.nitro.meter = 0.85;
    world.flags.autoDrive = {
      mode: 'lane', axis: 'y', road, dir: 1, nitro: true, targetSpeed: 9999,
    };
    startMission(world, 'SPECIAL DELIVERY');
    setMissionPhase(world, 'deliver');
    snapCamera(world, car.x, car.y);
    return;
  }

  if (name === 'chase') {
    // Eastbound along the central street, deep inside the map: the player in
    // a coupe, four police stacked behind on the same lane, a roadblock
    // ahead with its gap centred on the player's lane, and the heat pinned
    // to the 4-star mid-band so live simulation cannot drift the frame.
    const car = givePlayerCar(world, 'coupe', CHASE_START_X, CHASE_LANE_Y, 0, '#e2483d');
    car.vx = 300;
    world.flags.autoDrive = {
      mode: 'lane', axis: 'x', road: CHASE_STREET, dir: 1, nitro: false, targetSpeed: 300,
    };

    for (const off of POLICE_OFFSETS) {
      const cop = makeCar('police', CHASE_START_X - off, CHASE_LANE_Y, 0, '#e8e8ec');
      cop.kind = 'police';
      cop.staged = true;
      cop.vx = 300;
      world.cars.push(cop);
      world.police.fleet.push(cop);
    }

    for (const y of [CHASE_LANE_Y - 52, CHASE_LANE_Y + 52]) {
      const block = makeCar('police', CHASE_START_X + ROADBLOCK_AHEAD, y, Math.PI / 2, '#e8e8ec');
      block.kind = 'roadblock';
      block.roadblock = true;
      block.staged = true;
      world.cars.push(block);
      world.police.roadblocks.push(block);
    }

    world.police.heat = 350;
    world.police.heatCap = 350;

    startMission(world, 'GETAWAY DRIVER', { fromName: 'ARCADE NOVA' });
    setMissionPhase(world, 'deliver');
    snapCamera(world, car.x, car.y);
  }
}

// Per-step upkeep for the posed scenes. Called before updateWorld each step.
export function updateShot(world, dt) {
  if (!world.flags.shotMode) return;
  const name = world.flags.shotName;
  const car = world.player.car;

  if (name === 'drive' && car) {
    // The boost must still be burning whenever the shutter falls.
    if (world.nitro.meter < 0.6) world.nitro.meter = 0.6;
    if (car.y > 2050) {
      car.y -= 1300;
      world.player.y = car.y;
      world.camera.y -= 1300;
    }
    return;
  }

  if (name === 'chase' && car) {
    world.police.heat = 350; // the pin, re-asserted (the cap also clamps)
    // Hold the pursuit formation: each staged police car sits at its offset
    // behind the player on the chase lane, moving at the player's speed.
    for (let i = 0; i < world.police.fleet.length; i++) {
      const cop = world.police.fleet[i];
      if (!cop.staged) continue;
      cop.x = car.x - POLICE_OFFSETS[i];
      cop.y = CHASE_LANE_Y;
      cop.angle = 0;
      cop.vx = car.vx;
      cop.vy = 0;
    }
    for (const block of world.police.roadblocks) {
      if (!block.staged) continue;
      block.x = car.x + ROADBLOCK_AHEAD;
    }
    // Wrap the whole formation west before it can reach the coast.
    if (car.x > 2500) {
      const shift = 1300;
      car.x -= shift;
      world.player.x = car.x;
      world.camera.x -= shift;
      for (const cop of world.police.fleet) cop.x -= shift;
      for (const block of world.police.roadblocks) block.x -= shift;
    }
  }
}
