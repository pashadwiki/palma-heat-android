// hud.js — everything drawn in screen space over the world: cash and jobs,
// the minimap, wanted stars, health/car/nitro bars, the speedometer, the
// busted meter, the mission banner, prompts and toasts.

import { CFG, COLORS } from './config.js';
import { starsFor } from './police.js';
import { missionTarget } from './missions.js';
import { forwardSpeed } from './vehicles.js';

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = COLORS.hudPanel;
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
}

function bar(ctx, x, y, w, label, frac, color) {
  ctx.fillStyle = COLORS.hudPanel;
  rr(ctx, x, y, w, 26, 7);
  ctx.fill();
  ctx.fillStyle = color;
  const fw = Math.max(0, Math.min(1, frac)) * (w - 8);
  if (fw > 0) {
    rr(ctx, x + 4, y + 15, fw, 7, 3);
    ctx.fill();
  }
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 6, y + 11);
}

function drawMinimap(ctx, world, W) {
  const mw = 184;
  const mh = 128;
  const mx = W - mw - 14;
  const my = 14;
  panel(ctx, mx - 4, my - 4, mw + 8, mh + 8);
  const sx = mw / CFG.worldW;
  const sy = mh / CFG.worldH;
  const X = (wx) => mx + wx * sx;
  const Y = (wy) => my + wy * sy;

  ctx.fillStyle = COLORS.grassDark;
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = COLORS.waterDeep;
  ctx.fillRect(X(CFG.waterX), my, (CFG.worldW - CFG.waterX) * sx, mh);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(X(CFG.beachX), my, (CFG.waterX - CFG.beachX) * sx, mh);
  ctx.strokeStyle = COLORS.road;
  ctx.lineWidth = 3;
  for (const ax of world.city.avenues) {
    ctx.beginPath();
    ctx.moveTo(X(ax), my);
    ctx.lineTo(X(ax), my + mh);
    ctx.stroke();
  }
  for (const syLine of world.city.streets) {
    ctx.beginPath();
    ctx.moveTo(mx, Y(syLine));
    ctx.lineTo(mx + mw, Y(syLine));
    ctx.stroke();
  }

  // Roadblocks: amber squares. Police: red blips.
  ctx.fillStyle = '#ffb347';
  for (const car of world.police.roadblocks) {
    ctx.fillRect(X(car.x) - 2, Y(car.y) - 2, 4, 4);
  }
  ctx.fillStyle = '#ff5347';
  for (const car of world.police.fleet) {
    ctx.beginPath();
    ctx.arc(X(car.x), Y(car.y), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mission target: a pulsing gold ring.
  const target = missionTarget(world);
  if (target) {
    const pulse = 4.5 + Math.sin(world.time * 5) * 1.6;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(X(target.x), Y(target.y), pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(X(target.x), Y(target.y), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // North marker.
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('N', mx + mw - 3, my + 10);

  // Player arrow, outlined so it reads on any ground colour.
  const p = world.player.car || world.player;
  const angle = world.player.car ? world.player.car.angle : world.player.angle;
  ctx.save();
  ctx.translate(X(p.x), Y(p.y));
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.5, -3.6);
  ctx.lineTo(-4.5, 3.6);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#14100e';
  ctx.stroke();
  ctx.restore();
}

function drawStars(ctx, world, W) {
  const stars = starsFor(world.police.heat);
  ctx.font = '21px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? COLORS.gold : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', W - 18 - (4 - i) * 24, 168);
  }
}

function drawBanner(ctx, world, W) {
  const a = world.missions.active;
  if (!a) return;
  const target = missionTarget(world);
  const p = world.player.car || world.player;
  const distM = Math.round(Math.hypot(p.x - target.x, p.y - target.y) / 10);
  const text = `${a.template} — ${target.label} · ${distM}m · $${a.pay}`;
  ctx.font = 'bold 14px system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const bw = tw + 36;
  const bx = (W - bw) / 2;
  panel(ctx, bx, 14, bw, 40);
  ctx.fillStyle = COLORS.hudText;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, 32);
  // Timer bar.
  const frac = Math.max(0, a.timer / a.timeLimit);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rr(ctx, bx + 12, 44, bw - 24, 5, 2);
  ctx.fill();
  ctx.fillStyle = frac > 0.35 ? COLORS.carBar : COLORS.danger;
  rr(ctx, bx + 12, 44, (bw - 24) * frac, 5, 2);
  ctx.fill();
}

export function drawHUD(ctx, world, W, H) {
  // Cash and job tally, top-left.
  panel(ctx, 14, 14, 168, 52);
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${world.cash}`, 24, 40);
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`Jobs done ${world.jobsDone} · Failed ${world.jobsFailed}`, 24, 58);

  // Toasts under the cash panel.
  let ty = 84;
  for (const toast of world.toasts) {
    const alpha = toast.t > 2.2 ? Math.max(0, 1 - (toast.t - 2.2) / 0.6) : 1;
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 13px system-ui, sans-serif';
    const tw = ctx.measureText(toast.text).width;
    panel(ctx, 14, ty, tw + 22, 26);
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(toast.text, 25, ty + 17);
    ctx.globalAlpha = 1;
    ty += 32;
  }

  drawMinimap(ctx, world, W);
  drawStars(ctx, world, W);
  drawBanner(ctx, world, W);

  // Bottom-left status bars.
  if (world.player.car) {
    bar(ctx, 14, H - 66, 168, 'CAR', world.player.car.health / 100,
      world.player.car.health > 30 ? COLORS.carBar : COLORS.danger);
    bar(ctx, 14, H - 34, 168, 'NITRO — SHIFT', world.nitro.meter, COLORS.nitro);
    // Speedometer, bottom-right.
    const kmh = Math.round(Math.abs(forwardSpeed(world.player.car)) * 0.3);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${kmh}`, W - 52, H - 20);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('km/h', W - 16, H - 20);
  } else {
    bar(ctx, 14, H - 34, 168, 'HEALTH', world.player.health / 100,
      world.player.health > 30 ? COLORS.carBar : COLORS.danger);
  }

  // Busted meter, centre-bottom, only while it is filling.
  if (world.police.busted > 0.04) {
    const bw = 240;
    const bx = (W - bw) / 2;
    const by = H - 108;
    panel(ctx, bx, by, bw, 30);
    ctx.fillStyle = COLORS.danger;
    rr(ctx, bx + 6, by + 16, (bw - 12) * Math.min(1, world.police.busted / CFG.bustedSeconds), 8, 3);
    ctx.fill();
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', W / 2, by + 12);
  }

  // Contextual prompt, bottom-centre.
  if (world.prompt) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    const tw = ctx.measureText(world.prompt).width;
    panel(ctx, (W - tw - 28) / 2, H - 44, tw + 28, 30);
    ctx.fillStyle = COLORS.hudText;
    ctx.textAlign = 'center';
    ctx.fillText(world.prompt, W / 2, H - 24);
  }
}
