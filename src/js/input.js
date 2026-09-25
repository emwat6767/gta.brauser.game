// Клавиатура и мышь. Клавиши привязаны к "действиям" через e.code,
// поэтому WASD работает при любой раскладке (в том числе русской).

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  handbrake: ['Space'],
  interact: ['KeyE', 'KeyF'],
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

    window.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
      // Chrome иногда присылает огромный movementX сразу после захвата — пропускаем.
      this._ignoreMouseUntil = performance.now() + 120;
    });

    element.addEventListener('mousedown', () => {
      if (!this.pointerLocked) this.dragging = true;
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
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
  }

  requestPointerLock() {
    try {
      const result = this.element.requestPointerLock?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Pointer lock недоступен (например, в iframe) — работает вращение мышью с зажатой кнопкой.
    }
  }

  isDown(action) {
    return BINDINGS[action].some((code) => this.down.has(code));
  }

  wasPressed(action) {
    return BINDINGS[action].some((code) => this.pressed.has(code));
  }

  // -1..1: например axis('backward', 'forward').
  axis(negative, positive) {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  // Вызывается в конце кадра.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
