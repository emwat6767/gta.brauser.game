// Сенсорное управление для телефонов и планшетов.
//   левая часть экрана — плавающий джойстик (до упора = бег, в машине: газ/тормоз/руль)
//   правая часть экрана — свайп вращает камеру
//   кнопки справа внизу — удар/огонь, прицел (переключатель), перезарядка, смена оружия,
//   прыжок/ручник, сесть/выйти/грабить; пауза и БАНДА (позвать/отпустить отряд) — справа вверху
// Контролы включаются автоматически на устройствах с сенсорным экраном
// (или при первом касании) и передают действия в Input (press/release/setMoveAxes/addLook).
//
// Защита от "залипания": отпускание пальца может не дойти до зоны джойстика (открылась
// пауза/меню, браузер отменил жест, вкладка свернулась, захват указателя потерян). Поэтому
// джойстик сбрасывается по pointerup/pointercancel на всём документе, lostpointercapture,
// touchend без оставшихся касаний, blur/visibilitychange, паузе и открытию меню,
// а в update() — если активных касаний больше нет.

const JOY_RADIUS = 60;         // px
const RUN_THRESHOLD = 0.9;     // доля радиуса, после которой персонаж бежит
const LOOK_SENSITIVITY = 1.7;  // множитель к чувствительности мыши
const SHORT_NAMES = { fists: 'КУЛАКИ', pistol: 'ПИСТОЛ.', shotgun: 'ОБРЕЗ', smg: 'АВТОМАТ' };

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
    this.touchCount = 0;   // сколько пальцев сейчас на экране (по TouchEvent)
    this._sawTouch = false;

    this.joyZone = this.root.querySelector('.joy-zone');
    this.joyBase = this.root.querySelector('.joy-base');
    this.joyKnob = this.root.querySelector('.joy-knob');
    this.lookZone = this.root.querySelector('.look-zone');
    this.buttons = [...this.root.querySelectorAll('[data-action], [data-toggle]')];

    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable();
    window.addEventListener('touchstart', () => this.enable(), { once: true, passive: true });

    this._bindJoystick();
    this._bindLook();
    this._bindButtons();
    this._bindSafety();
  }

  // Отпустить всё: джойстик, обзор, удерживаемые кнопки (переключатель прицела не трогаем).
  resetAll() {
    this._endJoystick();
    this.lookId = null;
    for (const btn of this.buttons) {
      if (btn.dataset.toggle) continue;
      btn.classList.remove('pressed');
      for (const a of btn.dataset.action.split(' ')) if (a !== 'pause') this.input.release(a);
    }
  }

  _bindSafety() {
    const onUp = (e) => {
      if (e.pointerId === this.joyId) this._endJoystick();
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    const countTouches = (e) => {
      this._sawTouch = true;
      this.touchCount = e.touches.length;
      if (e.touches.length === 0) this.resetAll();
    };
    for (const type of ['touchstart', 'touchend', 'touchcancel']) {
      window.addEventListener(type, countTouches, { passive: true, capture: true });
    }
    window.addEventListener('blur', () => this.resetAll());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.resetAll();
    });
    this.game.events.on('game:pause', () => {
      this.resetAll();
      if (this.input.virtualDown.has('aim') || this.root.querySelector('[data-toggle="aim"]')?.classList.contains('on')) this.setToggle('aim', false);
    });
  }

  _endJoystick() {
    this.joyId = null;
    this.input.setMoveAxes(0, 0);
    this.input.release('run');
    this.joyBase.classList.remove('active');
    this.joyKnob.style.transform = '';
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
      if (e.pointerId === this.joyId) this._endJoystick();
    };
    zone.addEventListener('pointerdown', (e) => {
      // Новый палец в зоне джойстика, а старый "потерялся" — начинаем заново с нового.
      if (this.joyId !== null && e.pointerId !== this.joyId && this.touchCount <= 1) this._endJoystick();
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
    zone.addEventListener('lostpointercapture', end);
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
    zone.addEventListener('lostpointercapture', end);
  }

  _bindButtons() {
    for (const btn of this.buttons) {
      if (btn.dataset.toggle) {
        // Переключатель (ПРИЦЕЛ): нажал — держится, нажал ещё раз — отпустил.
        const action = btn.dataset.toggle;
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setToggle(action, !btn.classList.contains('on'));
        });
        continue;
      }
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
      btn.addEventListener('lostpointercapture', up);
    }
  }

  setToggle(action, on) {
    const btn = this.root.querySelector(`[data-toggle="${action}"]`);
    btn.classList.toggle('on', on);
    if (on) this.input.press(action);
    else this.input.release(action);
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
    // Сторож: джойстик "держится", а пальцев на экране нет (или открыто меню) — отпускаем.
    if (this.joyId !== null && ((this._sawTouch && this.touchCount === 0) || this.game.menuOpen)) this._endJoystick();
    const p = this.game.player;
    const inCar = !!p.vehicle;
    const gun = inCar || p.isDead ? null : p.gun;
    this._setLabel('jump', inCar ? 'РУЧНИК' : 'ПРЫЖОК');
    this._setLabel('attack', inCar || p.isDead ? '' : gun ? 'ОГОНЬ' : 'УДАР');
    this._setLabel('aim', gun ? 'ПРИЦЕЛ' : '');
    this._setLabel('reload', gun && !gun.bottomless ? 'ПЕРЕЗ.' : '');
    this._setLabel('squad', p.isDead ? '' : this.game.squad.size ? 'ОТПУСТ.' : 'БАНДА');
    this._setLabel('jobs', p.isDead ? '' : this.game.missions.active ? 'ЦЕЛЬ' : 'ЗАДАНИЯ');
    this._setLabel('weapon', inCar || p.isDead ? '' : SHORT_NAMES[p.arsenal.current]);
    if (!gun && this.input.virtualDown.has('aim')) this.setToggle('aim', false);
    const v = inCar ? null : p.findEnterableVehicle();
    const bank = inCar || v ? null : this.game.heists?.canStart();
    this._setLabel('interact', inCar ? 'ВЫЙТИ' : v ? (v.driver ? 'УГНАТЬ' : 'СЕСТЬ') : bank ? 'ГРАБИТЬ' : '');
  }
}
