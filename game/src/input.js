// input.js — keyboard state for the browser shell. The simulation itself only
// ever sees the plain axes object produced by axesFromKeys, so headless tests
// can drive the world with literal objects in exactly the same shape.

export function createKeyState() {
  return {
    down: new Set(), // codes currently held
    pressed: new Set(), // codes that went down since the last frame
  };
}

export function bindKeyboard(ks, target) {
  target.addEventListener('keydown', (ev) => {
    if (!ks.down.has(ev.code)) ks.pressed.add(ev.code);
    ks.down.add(ev.code);
    if (ev.code.startsWith('Arrow')) ev.preventDefault();
  });
  target.addEventListener('keyup', (ev) => {
    ks.down.delete(ev.code);
  });
  target.addEventListener('blur', () => {
    ks.down.clear();
  });
}

function held(ks, ...codes) {
  for (const c of codes) if (ks.down.has(c)) return true;
  return false;
}

// Translate raw keys into the control axes the world understands.
//   steer:    -1 (left) .. 1 (right)
//   throttle: -1 (reverse) .. 1 (forward)
//   moveX/moveY: on-foot movement direction, -1..1 each
//   nitro, brake: booleans
//   enter: true only on the frame E or F goes down (edge-triggered)
export function axesFromKeys(ks) {
  const left = held(ks, 'KeyA', 'ArrowLeft');
  const right = held(ks, 'KeyD', 'ArrowRight');
  const up = held(ks, 'KeyW', 'ArrowUp');
  const down = held(ks, 'KeyS', 'ArrowDown');
  return {
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    throttle: (up ? 1 : 0) - (down ? 1 : 0),
    moveX: (right ? 1 : 0) - (left ? 1 : 0),
    moveY: (down ? 1 : 0) - (up ? 1 : 0),
    nitro: held(ks, 'ShiftLeft', 'ShiftRight'),
    brake: held(ks, 'Space'),
    enter: ks.pressed.has('KeyE') || ks.pressed.has('KeyF'),
  };
}

// Neutral axes: no input at all. Used for staged scenes and tests.
export function neutralAxes() {
  return { steer: 0, throttle: 0, moveX: 0, moveY: 0, nitro: false, brake: false, enter: false };
}
