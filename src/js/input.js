// Ввод: клавиатура, мышь и сенсорное управление (ui/touch.js).
// Клавиши привязаны к "действиям" через e.code, поэтому WASD работает при любой
// раскладке (в том числе русской). Кнопки мыши записываются как 'Mouse0', 'Mouse2'.
//
// Сенсорные контролы не знают про клавиши: они сообщают действия напрямую
// (press/release) и аналоговые оси джойстика (setMoveAxes), а игра читает всё
// через одинаковые isDown / wasPressed / axis.

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  handbrake: ['Space'],
  interact: ['KeyE'],
  attack: ['KeyF', 'Mouse0'],         // удар / выстрел
  aim: ['Mouse2', 'KeyC'],            // прицеливание (удерживать)
  reload: ['KeyR'],
  nextWeapon: ['KeyQ'],
  weaponFists: ['Digit1'],
  weaponPistol: ['Digit2'],
  weaponShotgun: ['Digit3'],
  weaponSmg: ['Digit4'],
  squad: ['KeyT'],                    // позвать банду / отпустить
  jobs: ['KeyJ'],                     // меню банды (задания, репутация, районы)
  mute: ['KeyM'],
  toggleHelp: ['KeyH'],
};

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(element) {
    this.element = element;
    this.down = new Set();
    this.pressed = new Set();   // нажаты в этом кадре
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.pointerLocked = false;
    this.dragging = false;      // запасной вариант без pointer lock: вращение с зажатой кнопкой
    this._ignoreMouseUntil = 0;

    // Сенсорный ввод
    this.touchActive = false;
    this.moveX = 0;             // джойстик: -1 (влево) .. 1 (вправо)
    this.moveY = 0;             // джойстик: -1 (назад) .. 1 (вперёд)
    this.virtualDown = new Set();
    this.virtualPressed = new Set();

    window.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.virtualDown.clear();
      this.moveX = this.moveY = 0;
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
      // Chrome иногда присылает огромный movementX сразу после захвата — пропускаем.
      this._ignoreMouseUntil = performance.now() + 120;
    });

    element.addEventListener('mousedown', (e) => {
      if (this.pointerLocked) {
        const code = 'Mouse' + e.button;
        this.down.add(code);
        this.pressed.add(code);
      } else {
        this.dragging = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      this.dragging = false;
      this.down.delete('Mouse' + e.button);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked && !this.dragging) return;
      if (performance.now() < this._ignoreMouseUntil) return;
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return; // ложные скачки
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    element.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestPointerLock() {
    if (this.touchActive) return;
    try {
      const result = this.element.requestPointerLock?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Pointer lock недоступен (например, в iframe) — работает вращение мышью с зажатой кнопкой.
    }
  }

  // --- API для сенсорных контролов ---
  press(action) {
    if (!this.virtualDown.has(action)) this.virtualPressed.add(action);
    this.virtualDown.add(action);
  }

  release(action) {
    this.virtualDown.delete(action);
  }

  setMoveAxes(x, y) {
    this.moveX = x;
    this.moveY = y;
  }

  addLook(dx, dy) {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  // --- Чтение ---
  _analog(action) {
    switch (action) {
      case 'forward': return Math.max(0, this.moveY);
      case 'backward': return Math.max(0, -this.moveY);
      case 'right': return Math.max(0, this.moveX);
      case 'left': return Math.max(0, -this.moveX);
      default: return 0;
    }
  }

  _digital(action) {
    return this.virtualDown.has(action) || BINDINGS[action].some((code) => this.down.has(code));
  }

  isDown(action) {
    return this._digital(action) || this._analog(action) > 0.5;
  }

  wasPressed(action) {
    return this.virtualPressed.has(action) || BINDINGS[action].some((code) => this.pressed.has(code));
  }

  // -1..1 с учётом джойстика: например axis('backward', 'forward').
  axis(negative, positive) {
    const v = (this._digital(positive) ? 1 : 0) - (this._digital(negative) ? 1 : 0)
      + this._analog(positive) - this._analog(negative);
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }

  // Вызывается в конце кадра.
  endFrame() {
    this.pressed.clear();
    this.virtualPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
