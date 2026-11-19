// main.js — browser boot: canvas sizing, the fixed-step game loop, and the
// routing of keys into run-state changes (start, restart, pause, mute,
// enter/exit). The simulation itself lives in world.js; this file only owns
// the frame clock and the DOM.

import { CFG } from './config.js';
import { createWorld, updateWorld, startRun, toggleEnterExit } from './world.js';
import { drawScene } from './render.js';
import { createKeyState, bindKeyboard, axesFromKeys } from './input.js';
import { stageShot, updateShot } from './shots.js';
import * as audio from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') || '1', 10) || 1;
const shot = params.get('shot');

const world = createWorld(seed);
if (shot) stageShot(world, shot);
else world.state = 'title';

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  world.viewW = canvas.width;
  world.viewH = canvas.height;
}
window.addEventListener('resize', resize);
resize();

const ks = createKeyState();
bindKeyboard(ks, window);

function firstGesture() {
  audio.initAudio();
  if (!world.flags.shotMode && world.state === 'title') startRun(world);
}
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', () => audio.initAudio());

function handleFrameKeys() {
  if (world.flags.shotMode) return; // a posed scene takes no commands
  if (ks.pressed.has('KeyM')) {
    audio.setMuted(!audio.isMuted());
  }
  if (world.state === 'title') {
    if (ks.pressed.has('Enter')) startRun(world);
    return;
  }
  if (world.state === 'over') {
    if (ks.pressed.has('KeyR')) startRun(world);
    return;
  }
  if (ks.pressed.has('KeyP') || ks.pressed.has('Escape')) {
    world.paused = !world.paused;
  }
  if (!world.paused && axesFromKeys(ks).enter) {
    toggleEnterExit(world);
  }
}

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25; // a stalled tab must not fast-forward
  acc += elapsed;

  handleFrameKeys();
  const input = axesFromKeys(ks);
  let steps = 0;
  while (acc >= CFG.step && steps < 4) {
    if (!world.paused) {
      updateShot(world, CFG.step);
      updateWorld(world, input, CFG.step);
    }
    acc -= CFG.step;
    steps += 1;
  }
  if (steps === 4) acc = 0; // drop backlog rather than spiral
  ks.pressed.clear();

  drawScene(ctx, world, canvas.width, canvas.height);
}

requestAnimationFrame(frame);
