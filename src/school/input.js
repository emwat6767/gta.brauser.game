// Ввод школы: клавиатура (по e.code — работает и на русской раскладке), мышь (pointer lock или
// перетаскивание), сенсорный экран: джойстик слева, обзор пальцем справа, кнопки с data-act.
// Игра читает действия через down / pressed / released / held и оси moveX / moveY.

export const KEYS = {
  forward: ['KeyW', 'ArrowUp'], backward: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft', 'ControlRight'],
  interact: ['KeyE'], attack: ['KeyF', 'Mouse0'], throw: ['KeyQ'], lock: ['KeyR'], barricade: ['KeyB'],
  cmdFollow: ['Digit1', 'KeyG'], cmdHide: ['Digit2'], cmdFight: ['Digit3', 'KeyT'], cmdQuiet: ['Digit4'], cmdWait: ['Digit5'], cmdRun: ['Digit6'],
  map: ['KeyM', 'Tab'], help: ['KeyH'], pause: ['Escape', 'KeyP'], view: ['KeyV'], mute: ['KeyN'], call: ['KeyX'],
};

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.touchActs = new Set();
    this.prev = new Set();
    this.cur = new Set();
    this.holdStart = new Map();
    this.lookDX = 0;
    this.lookDY = 0;
    this.stickX = 0;
    this.stickY = 0;
    this.locked = false;
    this.dragging = false;
    this.enabled = true;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    const codeToAct = new Map();
    for (const [act, codes] of Object.entries(KEYS)) for (const c of codes) {
      if (!codeToAct.has(c)) codeToAct.set(c, []);
      codeToAct.get(c).push(act);
    }
    this.codeToAct = codeToAct;

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touchActs.clear(); this.stickX = this.stickY = 0; });

    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      this.keys.add('Mouse' + e.button);
      if (!this.locked && this.enabled) {
        canvas.requestPointerLock?.()?.catch?.(() => {});
        this.dragging = true;
      }
    });
    addEventListener('mouseup', (e) => { this.keys.delete('Mouse' + e.button); this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (this.touch) return;
      if (this.locked || this.dragging) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }

  // Сенсорные контролы: джойстик, зона обзора и кнопки (элементы с data-act).
  bindTouch(root) {
    const stick = root.querySelector('#stick'), knob = root.querySelector('#stick-knob');
    let stickId = null, sx = 0, sy = 0;
    const R = 56;
    const setStick = (x, y) => {
      const dx = x - sx, dy = y - sy;
      const l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
      this.stickX = (dx * k) / R;
      this.stickY = (dy * k) / R;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    const resetStick = () => { stickId = null; this.stickX = this.stickY = 0; knob.style.transform = ''; };
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      sx = r.left + r.width / 2; sy = r.top + r.height / 2;
      setStick(t.clientX, t.clientY);
    }, { passive: false });
    const look = root.querySelector('#look-zone');
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) setStick(t.clientX, t.clientY);
        else if (t.identifier === lookId) {
          this.lookDX += (t.clientX - lx) * 1.6;
          this.lookDY += (t.clientY - ly) * 1.6;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) resetStick();
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    for (const b of root.querySelectorAll('[data-act]')) {
      const act = b.dataset.act;
      const on = (e) => { e.preventDefault(); e.stopPropagation(); this.touchActs.add(act); b.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.touchActs.delete(act); b.classList.remove('on'); };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('touchcancel', off, { passive: false });
      b.addEventListener('mousedown', on);
      b.addEventListener('mouseup', off);
      b.addEventListener('mouseleave', off);
    }
    this.resetTouch = () => { resetStick(); this.touchActs.clear(); for (const b of root.querySelectorAll('[data-act].on')) b.classList.remove('on'); };
  }

  // Раз в кадр до чтения: собрать нажатые действия.
  beginFrame(now) {
    this.prev = this.cur;
    this.cur = new Set(this.touchActs);
    for (const code of this.keys) for (const a of this.codeToAct.get(code) ?? []) this.cur.add(a);
    for (const a of this.cur) if (!this.prev.has(a)) this.holdStart.set(a, now);
    this.now = now;
  }

  endFrame() {
    this.lookDX = 0;
    this.lookDY = 0;
  }

  down(a) { return this.enabled && this.cur.has(a); }
  pressed(a) { return this.enabled && this.cur.has(a) && !this.prev.has(a); }
  released(a) { return this.enabled && !this.cur.has(a) && this.prev.has(a); }
  held(a) { return this.cur.has(a) ? (this.now - (this.holdStart.get(a) ?? this.now)) / 1000 : 0; }
  // Сколько держали перед отпусканием.
  heldBefore(a) { return (this.now - (this.holdStart.get(a) ?? this.now)) / 1000; }

  get moveX() {
    let x = this.stickX;
    if (this.down('right')) x += 1;
    if (this.down('left')) x -= 1;
    return Math.max(-1, Math.min(1, x));
  }

  get moveY() {
    let y = -this.stickY;
    if (this.down('forward')) y += 1;
    if (this.down('backward')) y -= 1;
    return Math.max(-1, Math.min(1, y));
  }

  get stickPush() {
    return Math.hypot(this.stickX, this.stickY);
  }

  releaseAll() {
    this.keys.clear();
    this.resetTouch?.();
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
}
