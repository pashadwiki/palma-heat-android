// touch.js — on-screen touch controls for the Android build of Palma Heat.
// The original game reads keyboard state from window keydown/keyup listeners,
// so these buttons simply dispatch the same KeyboardEvents. Desktop browsers
// without touch never see the overlay.
(function () {
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouch) return;

  var css = [
    '.tc{position:fixed;z-index:50;user-select:none;-webkit-user-select:none;touch-action:none}',
    '.tc-btn{position:absolute;width:60px;height:60px;border-radius:50%;border:2px solid rgba(255,215,106,.55);',
    'background:rgba(20,10,30,.45);color:#ffd76a;font-size:24px;display:flex;align-items:center;justify-content:center}',
    '.tc-btn.on{background:rgba(255,183,77,.55);color:#1a0f1e}',
    '.tc-btn small{font-size:10px;font-weight:700;letter-spacing:.4px}',
    '#tc-dpad{left:14px;bottom:16px;width:180px;height:180px}',
    '#tc-up{left:60px;top:0}#tc-left{left:0;top:60px}#tc-right{left:120px;top:60px}#tc-down{left:60px;top:120px}',
    '#tc-actions{right:14px;bottom:16px;width:190px;height:180px}',
    '#tc-e{right:0;top:0;width:66px;height:66px}',
    '#tc-nitro{right:76px;top:56px}',
    '#tc-brake{right:6px;top:118px}',
    '#tc-pause{right:12px;top:12px;width:44px;height:44px;font-size:18px}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function key(code, down) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code: code, bubbles: true, cancelable: true
    }));
  }
  function mkBtn(parent, id, label) {
    var b = document.createElement('div');
    b.className = 'tc-btn';
    b.id = id;
    b.innerHTML = label;
    parent.appendChild(b);
    return b;
  }
  function hold(btn, code) {
    var on = function (e) { e.preventDefault(); btn.classList.add('on'); key(code, true); };
    var off = function (e) { e.preventDefault(); btn.classList.remove('on'); key(code, false); };
    btn.addEventListener('touchstart', on, { passive: false });
    btn.addEventListener('touchend', off, { passive: false });
    btn.addEventListener('touchcancel', off, { passive: false });
    btn.addEventListener('mousedown', on);
    btn.addEventListener('mouseup', off);
    btn.addEventListener('mouseleave', off);
  }
  function tap(btn, code) {
    var fire = function (e) {
      e.preventDefault();
      key(code, true);
      setTimeout(function () { key(code, false); }, 70);
    };
    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('mousedown', fire);
  }

  function build() {
    var dpad = document.createElement('div');
    dpad.className = 'tc';
    dpad.id = 'tc-dpad';
    hold(mkBtn(dpad, 'tc-up', '▲'), 'ArrowUp');
    hold(mkBtn(dpad, 'tc-left', '◀'), 'ArrowLeft');
    hold(mkBtn(dpad, 'tc-right', '▶'), 'ArrowRight');
    hold(mkBtn(dpad, 'tc-down', '▼'), 'ArrowDown');
    document.body.appendChild(dpad);

    var act = document.createElement('div');
    act.className = 'tc';
    act.id = 'tc-actions';
    tap(mkBtn(act, 'tc-e', '<small>MASUK</small>'), 'KeyE');
    hold(mkBtn(act, 'tc-nitro', '🔥'), 'ShiftLeft');
    hold(mkBtn(act, 'tc-brake', '✋'), 'Space');
    document.body.appendChild(act);

    var pause = document.createElement('div');
    pause.className = 'tc';
    pause.id = 'tc-pause-wrap';
    var pb = mkBtn(pause, 'tc-pause', '⏸');
    pause.style.right = '0';
    pause.style.top = '0';
    tap(pb, 'KeyP');
    document.body.appendChild(pause);
  }

  if (document.body) build();
  else window.addEventListener('DOMContentLoaded', build);
})();
