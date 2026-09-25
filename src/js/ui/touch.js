// Сенсорное управление для телефонов и планшетов.
//   левая часть экрана — плавающий джойстик (до упора = бег, в машине: газ/тормоз/руль)
//   правая часть экрана — свайп вращает камеру
//   кнопки справа внизу — удар, прыжок/ручник, сесть/выйти; пауза — справа вверху
// Контролы включаются автоматически на устройствах с сенсорным экраном
// (или при первом касании) и передают действия в Input (press/release/setMoveAxes/addLook).

const JOY_RADIUS = 60;         // px
const RUN_THRESHOLD = 0.9;     // доля радиуса, после которой персонаж бежит
const LOOK_SENSITIVITY = 1.7;  // множитель к чувствительности мыши

// Захват указателя, чтобы палец "не терялся" при выходе за элемент. Может бросить
// исключение (например, для синтетических событий) — тогда просто работаем без него.
function capture(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* без захвата */
  }
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.root = document.getElementById('touch');
    this.enabled = false;
    this.joyId = null;
    this.lookId = null;
    this._labels = {};

    this.joyZone = this.root.querySelector('.joy-zone');
    this.joyBase = this.root.querySelector('.joy-base');
    this.joyKnob = this.root.querySelector('.joy-knob');
    this.lookZone = this.root.querySelector('.look-zone');
    this.buttons = [...this.root.querySelectorAll('[data-action]')];

    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable();
    window.addEventListener('touchstart', () => this.enable(), { once: true, passive: true });

    this._bindJoystick();
    this._bindLook();
    this._bindButtons();
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.input.touchActive = true;
    document.body.classList.add('touch');
    this.game.minimap?.resize();
  }

  _bindJoystick() {
    const zone = this.joyZone;
    let cx = 0, cy = 0;
    const move = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx *= JOY_RADIUS / len;
        dy *= JOY_RADIUS / len;
      }
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.setMoveAxes(dx / JOY_RADIUS, -dy / JOY_RADIUS);
      if (len / JOY_RADIUS > RUN_THRESHOLD) this.input.press('run');
      else this.input.release('run');
    };
    const end = (e) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.input.setMoveAxes(0, 0);
      this.input.release('run');
      this.joyBase.classList.remove('active');
      this.joyKnob.style.transform = '';
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      e.preventDefault();
      this.joyId = e.pointerId;
      capture(zone, e.pointerId);
      // Джойстик появляется там, где коснулся палец.
      const r = zone.getBoundingClientRect();
      cx = e.clientX;
      cy = e.clientY;
      this.joyBase.style.left = `${cx - r.left}px`;
      this.joyBase.style.top = `${cy - r.top}px`;
      this.joyBase.classList.add('active');
      move(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyId) move(e);
    });
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _bindLook() {
    const zone = this.lookZone;
    let lx = 0, ly = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      e.preventDefault();
      this.lookId = e.pointerId;
      capture(zone, e.pointerId);
      lx = e.clientX;
      ly = e.clientY;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.addLook((e.clientX - lx) * LOOK_SENSITIVITY, (e.clientY - ly) * LOOK_SENSITIVITY);
      lx = e.clientX;
      ly = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _bindButtons() {
    for (const btn of this.buttons) {
      const actions = btn.dataset.action.split(' '); // одна кнопка может нажимать несколько действий
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        capture(btn, e.pointerId);
        btn.classList.add('pressed');
        if (actions[0] === 'pause') this.game.pause();
        else actions.forEach((a) => this.input.press(a));
      });
      const up = () => {
        btn.classList.remove('pressed');
        if (actions[0] !== 'pause') actions.forEach((a) => this.input.release(a));
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }
  }

  _setLabel(id, text) {
    if (this._labels[id] === text) return;
    this._labels[id] = text;
    const btn = this.root.querySelector(`[data-id="${id}"]`);
    btn.hidden = !text;
    if (text) btn.textContent = text;
  }

  // Подписи кнопок зависят от ситуации (пешком / в машине / рядом с машиной).
  update() {
    if (!this.enabled) return;
    const p = this.game.player;
    const inCar = !!p.vehicle;
    this._setLabel('jump', inCar ? 'РУЧНИК' : 'ПРЫЖОК');
    this._setLabel('attack', inCar || p.isDead ? '' : 'УДАР');
    this._setLabel('interact', inCar ? 'ВЫЙТИ' : p.findEnterableVehicle() ? 'СЕСТЬ' : '');
  }
}
