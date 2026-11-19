// render.js — draws the whole scene each frame: the golden-hour city (roads,
// crosswalks, buildings with long shadows and rooftop props, the docks, the
// beach and its glittering water), every car and walker, effects, the sunset
// grade laid over the top, then the HUD and any full-screen panel (title,
// game over, pause).

import { CFG, COLORS } from './config.js';
import { hash2 } from './random.js';
import { missionTarget } from './missions.js';
import { drawHUD, rr } from './hud.js';

function viewRect(world, W, H) {
  const z = world.camera.zoom;
  const hw = W / 2 / z + 140;
  const hh = H / 2 / z + 140;
  return {
    x0: world.camera.x - hw, y0: world.camera.y - hh,
    x1: world.camera.x + hw, y1: world.camera.y + hh,
  };
}

function inView(v, x, y, pad = 0) {
  return x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad;
}

function drawGroundAndRoads(ctx, world, v) {
  const city = world.city;
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, CFG.worldW, CFG.worldH);

  // Block grounds: sidewalk aprons, then the block's own surface.
  for (const b of city.blocks) {
    if (!inView(v, b.cx, b.cy, 320)) continue;
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(b.x0 - CFG.blockMargin, b.y0 - CFG.blockMargin,
      (b.x1 - b.x0) + CFG.blockMargin * 2, (b.y1 - b.y0) + CFG.blockMargin * 2);
    if (b.kind === 'park') {
      ctx.fillStyle = COLORS.grassDark;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    } else if (b.kind === 'parking' || b.kind === 'docks' || b.kind === 'docksyard') {
      ctx.fillStyle = COLORS.parking;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
  }

  // Promenade strips: east of the last avenue, and south of the last street.
  ctx.fillStyle = COLORS.sidewalk;
  ctx.fillRect(CFG.avenueX[6] + CFG.roadHalf, 0, CFG.beachX - CFG.avenueX[6] - CFG.roadHalf, CFG.worldH);
  ctx.fillRect(0, CFG.streetY[5] + CFG.roadHalf, CFG.beachX, CFG.worldH - CFG.streetY[5] - CFG.roadHalf);

  // Roads.
  ctx.fillStyle = COLORS.road;
  for (const ax of city.avenues) ctx.fillRect(ax - CFG.roadHalf, 0, CFG.roadHalf * 2, CFG.worldH);
  for (const sy of city.streets) ctx.fillRect(0, sy - CFG.roadHalf, CFG.beachX, CFG.roadHalf * 2);

  // Centre dashes.
  ctx.strokeStyle = COLORS.laneDash;
  ctx.lineWidth = 3;
  ctx.setLineDash([24, 30]);
  ctx.beginPath();
  for (const ax of city.avenues) {
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, CFG.worldH);
  }
  for (const sy of city.streets) {
    ctx.moveTo(0, sy);
    ctx.lineTo(CFG.beachX, sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Crosswalks and stop lines at every intersection.
  ctx.fillStyle = COLORS.crosswalk;
  for (const ix of city.intersections) {
    if (!inView(v, ix.x, ix.y, 130)) continue;
    for (let s = -40; s <= 32; s += 16) {
      ctx.fillRect(ix.x + s, ix.y - CFG.roadHalf - 15, 9, 13); // north band
      ctx.fillRect(ix.x + s, ix.y + CFG.roadHalf + 2, 9, 13); // south band
      ctx.fillRect(ix.x - CFG.roadHalf - 15, ix.y + s, 13, 9); // west band
      ctx.fillRect(ix.x + CFG.roadHalf + 2, ix.y + s, 13, 9); // east band
    }
    ctx.fillRect(ix.x - CFG.roadHalf - 24, ix.y + 6, 5, 36); // eastbound stop line
    ctx.fillRect(ix.x + 6, ix.y - CFG.roadHalf - 24, 36, 5); // southbound stop line
  }
}

function drawBeachAndWater(ctx, world, v) {
  // Sand, then water with a shore-to-deep gradient.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(CFG.beachX, 0, CFG.waterX - CFG.beachX, CFG.worldH);
  const grad = ctx.createLinearGradient(CFG.waterX, 0, CFG.worldW, 0);
  grad.addColorStop(0, COLORS.waterShallow);
  grad.addColorStop(1, COLORS.waterDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(CFG.waterX, 0, CFG.worldW - CFG.waterX, CFG.worldH);

  // Sun glitter: deterministic sparkle cells that twinkle with time.
  const tick = Math.floor(world.time * 3);
  ctx.fillStyle = '#ffdc96';
  for (let i = 0; i < 46; i++) {
    const gx = CFG.waterX + 8 + hash2(i * 3, 7) * (CFG.worldW - CFG.waterX - 16);
    const gy = hash2(11, i * 5) * CFG.worldH;
    if (!inView(v, gx, gy)) continue;
    const tw = hash2(i, tick);
    if (tw < 0.45) continue;
    ctx.globalAlpha = 0.25 + tw * 0.5;
    ctx.fillRect(gx, gy, 7, 2);
  }
  ctx.globalAlpha = 1;

  // A foam line breathing along the water's edge.
  ctx.strokeStyle = 'rgba(255,252,240,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = 0; y <= CFG.worldH; y += 36) {
    const fx = CFG.waterX + Math.sin(y * 0.02 + world.time * 1.3) * 3;
    if (y === 0) ctx.moveTo(fx, y);
    else ctx.lineTo(fx, y);
  }
  ctx.stroke();

  const beach = world.city.beach;
  for (const u of beach.umbrellas) {
    if (!inView(v, u.x, u.y, 40)) continue;
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.x - 5, u.y + 9);
    ctx.stroke();
    ctx.fillStyle = u.color;
    ctx.beginPath();
    ctx.arc(u.x, u.y, 13, Math.PI, 0);
    ctx.fill();
  }
  for (const t of beach.towels) {
    if (!inView(v, t.x, t.y, 40)) continue;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);
    ctx.fillStyle = t.color;
    ctx.fillRect(-6, -11, 12, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-6, -4, 12, 3);
    ctx.fillRect(-6, 3, 12, 3);
    ctx.restore();
  }
  for (const s of beach.stands) {
    if (!inView(v, s.x, s.y, 40)) continue;
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(s.x - 9, s.y - 12, 18, 24);
    ctx.fillStyle = COLORS.danger;
    ctx.fillRect(s.x - 9, s.y - 3, 18, 6);
    ctx.fillStyle = '#8a6f4d';
    ctx.fillRect(s.x - 11, s.y + 12, 4, 8);
    ctx.fillRect(s.x + 7, s.y + 12, 4, 8);
  }

  // Anchored boats, bobbing on the swell.
  for (const boat of world.city.boats) {
    const bob = Math.sin(world.time * 0.9 + boat.phase) * 2.5;
    const rock = Math.sin(world.time * 0.7 + boat.phase) * 0.05;
    ctx.save();
    ctx.translate(boat.x, boat.y + bob);
    ctx.rotate(rock);
    ctx.fillStyle = boat.color;
    ctx.beginPath();
    ctx.moveTo(-boat.len / 2, -6);
    ctx.lineTo(boat.len / 2, -6);
    ctx.lineTo(boat.len / 2 - 7, 6);
    ctx.lineTo(-boat.len / 2 + 7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5d4632';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, -24);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,250,235,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(0, -7);
    ctx.lineTo(11, -7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawBlocksAndProps(ctx, world, v) {
  const city = world.city;

  for (const b of city.blocks) {
    if (!inView(v, b.cx, b.cy, 340)) continue;

    if (b.kind === 'park') {
      for (const palm of b.palms) drawPalm(ctx, palm.x, palm.y, palm.s);
    }

    if (b.kind === 'parking') {
      // Painted stall ticks along both rows.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const y = b.y0 + 20 + i * 92;
        ctx.moveTo(b.x0 + 8, y);
        ctx.lineTo(b.x0 + 46, y);
        ctx.moveTo(b.x1 - 46, y);
        ctx.lineTo(b.x1 - 8, y);
      }
      ctx.stroke();
    }

    if (b.building) {
      const bd = b.building;
      const w = bd.x1 - bd.x0;
      const h = bd.y1 - bd.y0;
      // The long golden-hour shadow, thrown east and a little north.
      ctx.fillStyle = COLORS.buildingShadow;
      ctx.fillRect(bd.x0 + 34, bd.y0 - 18, w, h);
      ctx.fillStyle = bd.color;
      ctx.fillRect(bd.x0, bd.y0, w, h);
      ctx.fillStyle = 'rgba(255,235,200,0.13)';
      ctx.fillRect(bd.x0, bd.y0, w, 10);
      ctx.strokeStyle = 'rgba(30,16,26,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bd.x0, bd.y0, w, h);
      // Rooftop props.
      for (const prop of bd.roof) {
        if (prop.kind === 'tank') {
          ctx.fillStyle = '#8d9299';
          ctx.beginPath();
          ctx.arc(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath();
          ctx.arc(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w / 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = prop.kind === 'ac' ? '#9aa0a8' : '#7c8288';
          ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = 1;
          ctx.strokeRect(prop.x, prop.y, prop.w, prop.h);
        }
      }
      if (b.label) drawLabel(ctx, b.label, (bd.x0 + bd.x1) / 2, (bd.y0 + bd.y1) / 2);
    }
  }

  // Docks: container stacks and cranes.
  for (const c of city.containers) {
    if (!inView(v, c.x, c.y, 80)) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(30,15,30,0.3)';
    ctx.fillRect(-c.w / 2 + 8, -c.h / 2 - 5, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.5;
    for (let x = -c.w / 2 + 8; x < c.w / 2; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, -c.h / 2);
      ctx.lineTo(x, c.h / 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(20,10,20,0.5)';
    ctx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }
  for (const crane of city.cranes) {
    if (!inView(v, crane.x, crane.y, 130)) continue;
    ctx.fillStyle = '#4c4438';
    ctx.fillRect(crane.x - 11, crane.y - 11, 22, 22);
    ctx.strokeStyle = '#6e6250';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(crane.x, crane.y);
    ctx.lineTo(crane.x + 74, crane.y - 34);
    ctx.moveTo(crane.x, crane.y);
    ctx.lineTo(crane.x - 26, crane.y + 12);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(crane.x + 74, crane.y - 34);
    ctx.lineTo(crane.x + 74, crane.y - 6);
    ctx.stroke();
  }

  // Street lamps, already lit at this hour.
  for (const lamp of city.lamps) {
    if (!inView(v, lamp.x, lamp.y, 30)) continue;
    ctx.fillStyle = COLORS.lampHalo;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a3230';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPalm(ctx, x, y, s) {
  ctx.strokeStyle = '#7a5c38';
  ctx.lineWidth = 3.4 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 3 * s, y - 9 * s);
  ctx.stroke();
  const tx = x + 3 * s;
  const ty = y - 9 * s;
  // Frond shadow first, thrown east like everything else at golden hour.
  ctx.strokeStyle = 'rgba(40,60,20,0.35)';
  ctx.lineWidth = 2.2 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(tx + 13, ty - 6);
    ctx.lineTo(tx + 13 + Math.cos(a) * 11 * s, ty - 6 + Math.sin(a) * 7 * s + 3 * s);
    ctx.stroke();
  }
  ctx.strokeStyle = '#4e7d32';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(a) * 11 * s, ty + Math.sin(a) * 7 * s + 3 * s);
    ctx.stroke();
  }
}

function drawLabel(ctx, text, cx, cy) {
  ctx.font = 'bold 13px system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(18,10,20,0.78)';
  rr(ctx, cx - tw / 2 - 8, cy - 11, tw + 16, 22, 5);
  ctx.fill();
  ctx.fillStyle = '#fdf3d8';
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, cy + 4.5);
}

function drawMissionBeam(ctx, world) {
  const target = missionTarget(world);
  if (!target || world.state !== 'play') return;
  const pulse = 24 + Math.sin(world.time * 4) * 5;
  const grad = ctx.createLinearGradient(0, target.y - 250, 0, target.y);
  grad.addColorStop(0, 'rgba(255,214,92,0)');
  grad.addColorStop(1, COLORS.beam);
  ctx.fillStyle = grad;
  ctx.fillRect(target.x - 13, target.y - 250, 26, 250);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(target.x, target.y, pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawCar(ctx, world, car) {
  const t = world.time;
  // Ground shadow, thrown east.
  ctx.save();
  ctx.translate(car.x + 9, car.y - 5);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(34,16,34,0.35)';
  rr(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 5);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len;
  const Wd = car.wid;

  // Wheels.
  ctx.fillStyle = '#17141a';
  const wx = L / 2 - 9;
  const wy = Wd / 2 - 1;
  ctx.fillRect(-wx - 4, -wy - 2, 9, 4);
  ctx.fillRect(wx - 5, -wy - 2, 9, 4);
  ctx.fillRect(-wx - 4, wy - 2, 9, 4);
  ctx.fillRect(wx - 5, wy - 2, 9, 4);

  // Body.
  ctx.fillStyle = car.color;
  rr(ctx, -L / 2, -Wd / 2, L, Wd, 5);
  ctx.fill();

  if (car.type === 'truck') {
    ctx.fillStyle = '#d8d4cc';
    ctx.fillRect(-L / 2, -Wd / 2 + 1.5, L * 0.62, Wd - 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-L / 2, -Wd / 2 + 1.5, L * 0.62, Wd - 3);
    ctx.fillStyle = 'rgba(20,24,38,0.85)';
    ctx.fillRect(L * 0.2, -Wd / 2 + 3.5, L * 0.13, Wd - 7);
  } else if (car.type === 'pickup') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-L / 2 + 2, -Wd / 2 + 2.5, L * 0.4, Wd - 5);
    ctx.fillStyle = 'rgba(20,24,38,0.85)';
    ctx.fillRect(-L * 0.02, -Wd / 2 + 3, L * 0.3, Wd - 6);
  } else {
    // Cabin glass.
    ctx.fillStyle = 'rgba(18,22,36,0.88)';
    rr(ctx, -L * 0.1, -Wd / 2 + 3, L * 0.36, Wd - 6, 3);
    ctx.fill();
  }

  if (car.type === 'taxi') {
    ctx.fillStyle = '#14100e';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-L / 2 + 4 + i * 10, -Wd / 2 + 1, 5, 3);
      ctx.fillRect(-L / 2 + 4 + i * 10, Wd / 2 - 4, 5, 3);
    }
    ctx.fillStyle = '#fdf6e3';
    ctx.fillRect(-6, -4.5, 12, 9);
    ctx.fillStyle = '#14100e';
    ctx.font = 'bold 6.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2.4);
  }

  if (car.type === 'police') {
    ctx.fillStyle = '#24457a';
    ctx.fillRect(-L / 2 + 3, -3, L - 6, 6);
    // Light bar: red and blue halves trading flashes.
    const flash = Math.sin(t * 11) > 0;
    ctx.fillStyle = flash ? '#ff3b30' : 'rgba(255,59,48,0.35)';
    ctx.fillRect(-3.5, -Wd / 2 + 2, 7, 5);
    ctx.fillStyle = flash ? 'rgba(64,120,255,0.35)' : '#4078ff';
    ctx.fillRect(-3.5, Wd / 2 - 7, 7, 5);
    if (car.roadblock) {
      // Chevron board on the rear of a roadblock car.
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(-L / 2, -Wd / 2, 4, Wd);
      ctx.fillStyle = '#14100e';
      ctx.beginPath();
      ctx.moveTo(-L / 2, -Wd / 2 + 3);
      ctx.lineTo(-L / 2 + 4, -Wd / 2 + 7);
      ctx.lineTo(-L / 2, -Wd / 2 + 11);
      ctx.lineTo(-L / 2, -Wd / 2 + 15);
      ctx.lineTo(-L / 2 + 4, Wd / 2 - 4);
      ctx.lineTo(-L / 2, Wd / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Headlights, on at dusk.
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath();
  ctx.arc(L / 2 - 1, -Wd / 2 + 3.5, 2, 0, Math.PI * 2);
  ctx.arc(L / 2 - 1, Wd / 2 - 3.5, 2, 0, Math.PI * 2);
  ctx.fill();

  // Scorch marks once a car is badly hurt.
  if (car.health < 55) {
    ctx.fillStyle = `rgba(15,12,14,${0.35 - car.health * 0.004})`;
    rr(ctx, L * 0.08, -Wd / 2 + 2, L * 0.3, Wd - 4, 3);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, ped) {
  ctx.fillStyle = 'rgba(30,16,30,0.3)';
  ctx.beginPath();
  ctx.arc(ped.x + 3, ped.y - 2, 4.6, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-7, -3, 14, 6);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(9, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(ped.x, ped.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(ped.x + Math.cos(ped.angle) * 2, ped.y + Math.sin(ped.angle) * 2, 2.9, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles(ctx, world) {
  for (const pt of world.particles) {
    const frac = Math.max(0, pt.life / pt.maxLife);
    if (pt.kind === 'flame') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${Math.floor(120 + frac * 110)},40,${frac * 0.85})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * frac + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (pt.kind === 'smoke') {
      ctx.fillStyle = `rgba(70,64,70,${frac * 0.3})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(255,215,106,${frac})`;
      ctx.fillRect(pt.x - 1.4, pt.y - 1.4, 2.8, 2.8);
    }
  }
}

function drawPlayerMarker(ctx, world) {
  const p = world.player;
  if (p.car) {
    const bob = Math.sin(world.time * 3.2) * 2.5;
    ctx.save();
    ctx.translate(p.car.x, p.car.y - 36 + bob);
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(-6.5, -4);
    ctx.lineTo(6.5, -4);
    ctx.closePath();
    ctx.fillStyle = COLORS.gold;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#14100e';
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10.5, 0, Math.PI * 2);
    ctx.stroke();
    drawPed(ctx, { x: p.x, y: p.y, angle: p.angle, state: 'walk', shirt: '#ffd23c', skin: '#d9a066' });
  }
}

const CONTROL_LINES = [
  'Move / drive: WASD or arrow keys',
  'Enter or leave a car: E or F',
  'Nitro: Shift · Handbrake: Space',
  'Pause: P or Esc · Mute: M',
];

function drawTitle(ctx, world, W, H) {
  ctx.fillStyle = 'rgba(12,6,18,0.5)';
  ctx.fillRect(0, 0, W, H);
  const pw = 520;
  const ph = 330;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  ctx.fillStyle = COLORS.hudPanel;
  rr(ctx, px, py, pw, ph, 16);
  ctx.fill();
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  rr(ctx, px, py, pw, ph, 16);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText('PALMA HEAT', W / 2, py + 78);
  ctx.fillStyle = '#ffb347';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText('· G O L D E N   H O U R ·', W / 2, py + 112);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Run packages across Palma City. Outrun the law. Get paid.', W / 2, py + 148);

  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '13.5px system-ui, sans-serif';
  let ly = py + 182;
  for (const line of CONTROL_LINES) {
    ctx.fillText(line, W / 2, ly);
    ly += 21;
  }
  if (world.best > 0) {
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`Best haul: $${world.best}`, W / 2, ly + 6);
  }
  const blink = 0.55 + 0.45 * Math.sin(world.time * 3);
  ctx.globalAlpha = blink;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText('Press Enter or click to start', W / 2, py + ph - 26);
  ctx.globalAlpha = 1;
}

const OVER_TITLES = { busted: 'BUSTED', wrecked: 'WRECKED', down: 'TAKEN DOWN' };

function drawOver(ctx, world, W, H) {
  const o = world.over;
  ctx.fillStyle = 'rgba(12,6,18,0.55)';
  ctx.fillRect(0, 0, W, H);
  const pw = 430;
  const ph = 300;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  ctx.fillStyle = COLORS.hudPanel;
  rr(ctx, px, py, pw, ph, 16);
  ctx.fill();
  ctx.strokeStyle = o.kind === 'busted' ? COLORS.danger : COLORS.gold;
  ctx.lineWidth = 2;
  rr(ctx, px, py, pw, ph, 16);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = o.kind === 'busted' ? COLORS.danger : COLORS.gold;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(OVER_TITLES[o.kind] || 'BUSTED', W / 2, py + 70);

  ctx.fillStyle = COLORS.hudText;
  ctx.font = '17px system-ui, sans-serif';
  let ly = py + 122;
  const lines = [
    `Cash earned: $${o.cash}`,
    `Jobs done: ${o.jobsDone} · Failed: ${o.jobsFailed}`,
    `Top wanted: ${'★'.repeat(o.topWanted)}${'☆'.repeat(Math.max(0, 5 - o.topWanted))}`,
    `Best haul: $${world.best}`,
  ];
  for (const line of lines) {
    ctx.fillText(line, W / 2, ly);
    ly += 30;
  }
  const blink = 0.55 + 0.45 * Math.sin(world.time * 3);
  ctx.globalAlpha = blink;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('Press R to run again', W / 2, py + ph - 28);
  ctx.globalAlpha = 1;
}

export function drawScene(ctx, world, W, H) {
  // Dusk backdrop outside the world.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2a1836');
  sky.addColorStop(1, '#4a2340');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const cam = world.camera;
  const v = viewRect(world, W, H);
  ctx.save();
  const shX = Math.sin(world.time * 83) * world.shake * 8;
  const shY = Math.cos(world.time * 97) * world.shake * 8;
  ctx.translate(W / 2 + shX, H / 2 + shY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawGroundAndRoads(ctx, world, v);
  drawBeachAndWater(ctx, world, v);
  drawBlocksAndProps(ctx, world, v);

  // Skid marks under the cars.
  for (const s of world.skids) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillStyle = `rgba(20,14,18,${0.34 * (1 - s.t / 6)})`;
    ctx.fillRect(-8, -1.6, 16, 3.2);
    ctx.restore();
  }

  drawMissionBeam(ctx, world);

  for (const car of world.cars) {
    if (inView(v, car.x, car.y, 90)) drawCar(ctx, world, car);
  }
  for (const ped of world.peds) {
    if (inView(v, ped.x, ped.y, 30)) drawPed(ctx, ped);
  }
  if (world.state === 'play') drawPlayerMarker(ctx, world);
  drawParticles(ctx, world);

  ctx.restore();

  // The golden-hour grade over everything: amber from the west, dusk below.
  const wash = ctx.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, COLORS.amberWashTop);
  wash.addColorStop(1, COLORS.amberWashBottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.05, H * 0.42, 10, W * 0.05, H * 0.42, H * 0.75);
  glow.addColorStop(0, COLORS.sunGlow);
  glow.addColorStop(1, 'rgba(255,183,84,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vig.addColorStop(0, 'rgba(16,6,20,0)');
  vig.addColorStop(1, 'rgba(16,6,20,0.26)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  if (world.state === 'play') drawHUD(ctx, world, W, H);
  if (world.state === 'title') drawTitle(ctx, world, W, H);
  if (world.state === 'over') drawOver(ctx, world, W, H);
  if (world.paused && world.state === 'play') {
    ctx.fillStyle = 'rgba(12,6,18,0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
  }
}
