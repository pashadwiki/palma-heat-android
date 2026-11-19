// city.js — Palma City itself: generates the road grid, blocks, buildings,
// parks, parking lots, the docks district and the beach from a seeded stream,
// and answers the geometry questions every other system asks (where are the
// lanes, what blocks this segment, which rects are solid).

import { CFG, BUILDING_COLORS } from './config.js';
import { rngRange, rngInt, rngPick, rngChance } from './random.js';

// What stands on each block, keyed "col,row" over the 6x5 block grid.
// kind: building | park | parking | docks | docksyard. Labelled blocks are the
// city's named spots; unlabelled buildings are apartment blocks.
const BLOCK_PLAN = {
  '0,0': { kind: 'building', label: 'CAFÉ SOL' },
  '1,0': { kind: 'building', label: 'HOTEL BRISA' },
  '2,0': { kind: 'park' },
  '3,0': { kind: 'building', label: 'PALMA BANK' },
  '4,0': { kind: 'building', label: 'DINER LUNA' },
  '5,0': { kind: 'parking' },
  '0,1': { kind: 'building', label: 'MOTEL AZUL' },
  '1,1': { kind: 'building', label: 'ARCADE NOVA' },
  '2,1': { kind: 'building', label: 'PAWN SHOP' },
  '3,1': { kind: 'park' },
  '4,1': { kind: 'building', label: 'MARKET MIA' },
  '5,1': { kind: 'building', label: 'GYM FUERTE' },
  '0,2': { kind: 'parking' },
  '1,2': { kind: 'building', label: 'CLUB COCO' },
  '2,2': { kind: 'building', label: 'GARAGE 24H' },
  '3,2': { kind: 'building', label: 'TACO MAR' },
  '4,2': { kind: 'park' },
  '5,2': { kind: 'building' },
  '0,3': { kind: 'building' },
  '1,3': { kind: 'park' },
  '2,3': { kind: 'building' },
  '3,3': { kind: 'parking' },
  '4,3': { kind: 'building' },
  '5,3': { kind: 'building' },
  '0,4': { kind: 'building' },
  '1,4': { kind: 'parking' },
  '2,4': { kind: 'building' },
  '3,4': { kind: 'docks', label: 'PORT OF PALMA' },
  '4,4': { kind: 'docks', label: 'COLD STORAGE' },
  '5,4': { kind: 'docksyard' },
};

const CONTAINER_COLORS = ['#b5542f', '#2f6fb5', '#3f8f5f', '#8f8f96', '#b53f5f', '#c2a03c'];

// The rect occupied by block (col,row): the ground between two avenues and two
// streets, minus the road half-widths and the sidewalk margin.
export function blockRect(col, row) {
  const m = CFG.roadHalf + CFG.blockMargin;
  return {
    x0: CFG.avenueX[col] + m,
    y0: CFG.streetY[row] + m,
    x1: CFG.avenueX[col + 1] - m,
    y1: CFG.streetY[row + 1] - m,
  };
}

function makeRoofProps(rng, rect) {
  const props = [];
  const n = rngInt(rng, 3, 5);
  for (let i = 0; i < n; i++) {
    props.push({
      x: rngRange(rng, rect.x0 + 14, rect.x1 - 30),
      y: rngRange(rng, rect.y0 + 14, rect.y1 - 30),
      w: rngRange(rng, 14, 30),
      h: rngRange(rng, 12, 24),
      kind: rngPick(rng, ['ac', 'tank', 'vent']),
    });
  }
  return props;
}

function makeBuilding(rng, rect, inset) {
  const b = {
    x0: rect.x0 + inset,
    y0: rect.y0 + inset,
    x1: rect.x1 - inset,
    y1: rect.y1 - inset,
    color: rngPick(rng, BUILDING_COLORS),
    roof: [],
  };
  b.roof = makeRoofProps(rng, b);
  return b;
}

export function generateCity(rng) {
  const city = {
    avenues: CFG.avenueX,
    streets: CFG.streetY,
    blocks: [],
    colliders: [],
    spots: [],
    lamps: [],
    intersections: [],
    containers: [],
    cranes: [],
    parkedSpots: [],
    rings: [],
    beach: { umbrellas: [], towels: [], stands: [] },
    boats: [],
  };

  let parkingCount = 0;

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      const rect = blockRect(col, row);
      const plan = BLOCK_PLAN[`${col},${row}`] || { kind: 'building' };
      const block = {
        col, row, kind: plan.kind, label: plan.label || null,
        x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1,
        cx: (rect.x0 + rect.x1) / 2, cy: (rect.y0 + rect.y1) / 2,
        building: null, palms: [], parkingSpots: [],
      };

      if (plan.kind === 'building') {
        block.building = makeBuilding(rng, rect, 26);
        city.colliders.push(block.building);
      } else if (plan.kind === 'park') {
        const n = rngInt(rng, 5, 8);
        for (let i = 0; i < n; i++) {
          block.palms.push({
            x: rngRange(rng, rect.x0 + 24, rect.x1 - 24),
            y: rngRange(rng, rect.y0 + 24, rect.y1 - 24),
            s: rngRange(rng, 0.8, 1.25),
          });
        }
      } else if (plan.kind === 'parking') {
        // Two rows of kerb-parked cars facing the block's west road.
        for (let i = 0; i < 3; i++) {
          block.parkingSpots.push({ x: rect.x0 + 26, y: rect.y0 + 42 + i * 92, angle: Math.PI / 2 });
          block.parkingSpots.push({ x: rect.x1 - 26, y: rect.y0 + 42 + i * 92, angle: -Math.PI / 2 });
        }
        city.parkedSpots.push(...block.parkingSpots);
      } else if (plan.kind === 'docks') {
        block.building = makeBuilding(rng, rect, 16);
        block.building.color = '#7d7468';
        city.colliders.push(block.building);
        addContainers(rng, city, rect, 3);
        addCrane(city, rect.x1 - 30, rect.y0 + 30);
      } else if (plan.kind === 'docksyard') {
        addContainers(rng, city, rect, 7);
        addCrane(city, rect.x0 + 34, rect.y0 + 34);
        // Parked box trucks along the yard's south edge.
        for (let i = 0; i < 2; i++) {
          city.parkedSpots.push({ x: rect.x0 + 70 + i * 130, y: rect.y1 - 24, angle: 0, truck: true });
        }
      }

      // A mission spot on the sidewalk at the block's west edge.
      if (plan.label) {
        city.spots.push({ name: plan.label, x: rect.x0 - 26, y: block.cy });
      } else if (plan.kind === 'parking') {
        parkingCount += 1;
        city.spots.push({ name: `Parking Lot ${parkingCount}`, x: rect.x0 - 26, y: block.cy });
      }

      // Pedestrians walk the sidewalk ring around every block.
      city.rings.push({
        x0: rect.x0 - 8, y0: rect.y0 - 8, x1: rect.x1 + 8, y1: rect.y1 + 8,
      });

      city.blocks.push(block);
    }
  }

  // Intersections and their lamps (two corners each).
  for (const ax of city.avenues) {
    for (const sy of city.streets) {
      city.intersections.push({ x: ax, y: sy });
      city.lamps.push({ x: ax - CFG.roadHalf - 9, y: sy - CFG.roadHalf - 9 });
      city.lamps.push({ x: ax + CFG.roadHalf + 9, y: sy + CFG.roadHalf + 9 });
    }
  }
  // Promenade lamps along the beach and the south strip.
  for (let y = 320; y < CFG.worldH - 120; y += 260) {
    city.lamps.push({ x: CFG.beachX - 14, y });
  }

  // South promenade parking, parallel to the last street.
  for (let i = 0; i < 6; i++) {
    city.parkedSpots.push({ x: 420 + i * 460, y: 2336, angle: 0 });
  }

  // Beach dressing: umbrellas, towels, lifeguard stands on the sand.
  const umbColors = ['#e2483d', '#3f8fb5', '#e0a83c', '#5da85f', '#e8e4da'];
  for (let i = 0; i < 9; i++) {
    city.beach.umbrellas.push({
      x: rngRange(rng, CFG.beachX + 22, CFG.waterX - 30),
      y: 260 + i * 240 + rngRange(rng, -50, 50),
      color: rngPick(rng, umbColors),
    });
  }
  for (let i = 0; i < 8; i++) {
    city.beach.towels.push({
      x: rngRange(rng, CFG.beachX + 18, CFG.waterX - 36),
      y: 380 + i * 250 + rngRange(rng, -60, 60),
      color: rngPick(rng, umbColors),
      angle: rngRange(rng, -0.4, 0.4),
    });
  }
  city.beach.stands.push({ x: CFG.beachX + 16, y: 620 }, { x: CFG.beachX + 16, y: 1620 });

  // Anchored boats on the water.
  const boatY = [420, 1180, 1920];
  for (let i = 0; i < boatY.length; i++) {
    city.boats.push({
      x: rngRange(rng, CFG.waterX + 42, CFG.worldW - 40),
      y: boatY[i] + rngRange(rng, -30, 30),
      len: rngRange(rng, 34, 46),
      phase: rngRange(rng, 0, Math.PI * 2),
      color: rngPick(rng, ['#e8e4da', '#c94f42', '#3f6fb5']),
    });
  }

  return city;
}

function addContainers(rng, city, rect, count) {
  for (let i = 0; i < count; i++) {
    const c = {
      x: rngRange(rng, rect.x0 + 40, rect.x1 - 40),
      y: rngRange(rng, rect.y0 + 30, rect.y1 - 30),
      w: 52, h: 22,
      angle: rngChance(rng, 0.5) ? 0 : Math.PI / 2,
      color: rngPick(rng, CONTAINER_COLORS),
    };
    city.containers.push(c);
    // Colliders are axis-aligned; a rotated container still blocks its core.
    city.colliders.push({
      x0: c.x - (c.angle === 0 ? 26 : 11),
      y0: c.y - (c.angle === 0 ? 11 : 26),
      x1: c.x + (c.angle === 0 ? 26 : 11),
      y1: c.y + (c.angle === 0 ? 11 : 26),
    });
  }
}

function addCrane(city, x, y) {
  city.cranes.push({ x, y });
  city.colliders.push({ x0: x - 12, y0: y - 12, x1: x + 12, y1: y + 12 });
}

// ---------------------------------------------------------------------------
// Geometry questions.
// ---------------------------------------------------------------------------

// Lane centre coordinate for a vehicle travelling an avenue (axis 'y') or a
// street (axis 'x'), keeping right. dir is the sign of travel along the axis.
export function laneCoord(city, axis, roadIndex, dir) {
  if (axis === 'y') return city.avenues[roadIndex] - dir * CFG.laneOffset;
  return city.streets[roadIndex] + dir * CFG.laneOffset;
}

// Which road is this point on, if any? Returns { axis, index } or null.
export function roadAt(city, x, y) {
  for (let i = 0; i < city.avenues.length; i++) {
    if (Math.abs(x - city.avenues[i]) <= CFG.roadHalf) return { axis: 'y', index: i };
  }
  for (let j = 0; j < city.streets.length; j++) {
    if (Math.abs(y - city.streets[j]) <= CFG.roadHalf) return { axis: 'x', index: j };
  }
  return null;
}

// True when the straight segment (x0,y0)-(x1,y1) stays clear of every solid
// rect — the line-of-sight test the police decay and witness rules rely on.
export function segmentBlocked(city, x0, y0, x1, y1) {
  for (const r of city.colliders) {
    if (segmentHitsRect(x0, y0, x1, y1, r)) return true;
  }
  return false;
}

function segmentHitsRect(x0, y0, x1, y1, r) {
  // Slab test: clip the segment's parameter range against each axis slab.
  let tMin = 0;
  let tMax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < r.x0 || x0 > r.x1) return false;
  } else {
    let t1 = (r.x0 - x0) / dx;
    let t2 = (r.x1 - x0) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < r.y0 || y0 > r.y1) return false;
  } else {
    let t1 = (r.y0 - y0) / dy;
    let t2 = (r.y1 - y0) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

// Resolve a circle against a rect: if they overlap, return the push-out
// vector { px, py, depth } that moves the circle out along the shortest
// escape; otherwise null. Shared by cars and the on-foot player.
export function circleRectPush(x, y, radius, r) {
  const cx = Math.max(r.x0, Math.min(x, r.x1));
  const cy = Math.max(r.y0, Math.min(y, r.y1));
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > radius * radius) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const depth = radius - d;
    return { px: (dx / d) * depth, py: (dy / d) * depth, depth, nx: dx / d, ny: dy / d };
  }
  // Centre inside the rect: escape along the smallest penetration axis.
  const left = x - r.x0;
  const right = r.x1 - x;
  const top = y - r.y0;
  const bottom = r.y1 - y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { px: -(left + radius), py: 0, depth: left + radius, nx: -1, ny: 0 };
  if (min === right) return { px: right + radius, py: 0, depth: right + radius, nx: 1, ny: 0 };
  if (min === top) return { px: 0, py: -(top + radius), depth: top + radius, nx: 0, ny: -1 };
  return { px: 0, py: bottom + radius, depth: bottom + radius, nx: 0, ny: 1 };
}

export function spotByName(city, name) {
  for (const s of city.spots) if (s.name === name) return s;
  return null;
}
