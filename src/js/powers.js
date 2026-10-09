import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Humanoid } from './humanoid.js';
import { aimPoint, raycastAll } from './ballistics.js';
import { findTargetInFront } from './combat.js';

// Супергеройские режимы игрока (X / кнопка СИЛА — по кругу: обычный → Халк → Железный человек).
// Режим — это набор множителей к движению игрока (mods) + свои атаки и способности;
// player.js спрашивает powers.mods и отдаёт сюда атаку, прыжок/приземление и полёт.
// Модель игрока на время режима подменяется (своя расцветка и рост).
//
//   Халк  — ходит и бегает быстрее, прыгает на десятки метров, удар (F) раскидывает людей и
//           машины, приземление с высоты — ударная волна, E у машины — поднять, F — бросить.
//           Почти не получает урона, машины его не сбивают. Оружие убрано.
//   Железный человек — полёт: Space — вверх, Z (ВНИЗ) — вниз, Shift — ускорение; F — залп
//           репульсора туда, куда смотрит прицел (взрыв в точке попадания). Может водить машину.
//
// Новый режим: запись в MODES (множители, здоровье, расцветка) + ветки в attack()/update().

const MODES = {
  normal: { name: 'Обычный', color: '#ffffff', walk: 1, run: 1, jump: 1, accel: 1, gravity: 1, damageTaken: 1, health: 100, scale: 1 },
  hulk: {
    name: 'ХАЛК', color: '#6fdc4a', walk: 1.5, run: 1.75, jump: 3.9, accel: 1.4, gravity: 1.05, damageTaken: 0.15, health: 600, scale: 1.65,
    look: { skin: '#5fa83c', hair: '#18140f', shirt: '#5fa83c', pants: '#5b2a86', shoes: '#5fa83c', scale: 1.65 },
    hint: 'ХАЛК: F — сокрушительный удар, Space — суперпрыжок, E у машины — поднять и бросить',
  },
  ironman: {
    name: 'ЖЕЛЕЗНЫЙ ЧЕЛОВЕК', color: '#ffcf4a', walk: 1.2, run: 1.4, jump: 1.3, accel: 1.3, gravity: 1, damageTaken: 0.3, health: 300, scale: 1.05,
    look: { skin: '#9e1b24', hair: '#d4a23a', shirt: '#b8202b', pants: '#b8202b', shoes: '#d4a23a', hat: '#d4a23a', scale: 1.05 },
    hint: 'ЖЕЛЕЗНЫЙ ЧЕЛОВЕК: Space — взлёт, Z — вниз, Shift — ускорение, F — залп',
  },
};
export const POWER_ORDER = ['normal', 'hulk', 'ironman'];
const ENERGY = new THREE.Color(0x9fe6ff);
const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();

export class PowerSystem {
  constructor(game) {
    this.game = game;
    this.mode = 'normal';
    this.models = { normal: game.player.model };
    this.cooldown = 0;
    this.smashIn = 0;       // задержка удара Халка (кулак должен дойти до цели)
    this.carried = null;    // машина над головой Халка
    this.flying = false;
    this.thrustTimer = 0;
    this.reactor = null;
  }

  get mods() {
    return MODES[this.mode];
  }

  get name() {
    return MODES[this.mode].name;
  }

  get color() {
    return MODES[this.mode].color;
  }

  cycle() {
    const i = POWER_ORDER.indexOf(this.mode);
    this.set(POWER_ORDER[(i + 1) % POWER_ORDER.length]);
  }

  set(mode) {
    const { game } = this;
    const p = game.player;
    if (mode === this.mode || p.isDead) return;
    if (this.carried) this._drop();
    if (mode === 'hulk' && p.vehicle) p.exitVehicle();
    const M = MODES[mode];
    // Подменяем модель (позиция и поворот — те же).
    const old = p.model;
    const next = this.models[mode] ??= this._makeModel(mode);
    const parent = old.root.parent ?? game.scene;
    old.root.removeFromParent();
    parent.add(next.root);
    next.root.position.copy(old.root.position);
    next.root.rotation.copy(old.root.rotation);
    p.model = next;
    next.setWeapon(mode === 'normal' && !p.vehicle ? p.arsenal.current : null);
    // Здоровье: та же доля от нового максимума.
    const frac = p.health / p.maxHealth;
    p.maxHealth = M.health;
    p.health = Math.max(1, frac * M.health);
    p.radius = CONFIG.player.radius * M.scale;
    p.aiming = false;
    game.cameraRig.aiming = false;
    this.mode = mode;
    this.flying = false;
    game.effects.ring(p.position, 4, new THREE.Color(M.color).getHex());
    game.effects.burst(_o.copy(p.position).setY(p.position.y + 1.2), { x: 0, y: 1, z: 0 }, mode === 'hulk' ? 'dust' : 'energy', 30);
    game.audio.powerUp?.(mode);
    game.hud.toast(M.hint ?? 'Обычный режим', 3.5);
    game.events.emit('power:changed', { mode });
  }

  _makeModel(mode) {
    const m = new Humanoid(MODES[mode].look);
    if (mode === 'ironman') {
      // Дуговой реактор на груди и свечение ладоней.
      const glow = new THREE.MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false });
      const reactor = new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), glow);
      reactor.position.set(0, 0.36, 0.13);
      m.spine.add(reactor);
      for (const elbow of [m.elbowL, m.elbowR]) {
        const palm = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow);
        palm.position.set(0, -0.32, 0.02);
        elbow.add(palm);
      }
      // Прорези глаз на шлеме.
      const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.02), glow);
      eyes.position.set(0, 0.775, 0.122);
      m.spine.add(eyes);
    }
    return m;
  }

  // Атака (F / ЛКМ) в режиме силы. true — обработано.
  attack() {
    if (this.mode === 'hulk') return this._hulkAttack();
    if (this.mode === 'ironman') return this._repulsor();
    return false;
  }

  _hulkAttack() {
    const { game } = this;
    const p = game.player;
    if (this.carried) {
      this._throw();
      return true;
    }
    if (this.cooldown > 0 || !p.grounded) return true;
    // Разворот к ближайшей цели перед собой, анимация удара, сам удар — через 0.16 с.
    const target = findTargetInFront(game, p, 4, -0.2, false);
    if (target) p.heading = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    p.melee.cancel();
    p.melee.start();
    p.combatTimer = 2;
    this.smashIn = 0.16;
    this.cooldown = 0.45;
    return true;
  }

  // Удар Халка: всё в конусе перед ним разлетается.
  _smash() {
    const { game } = this;
    const p = game.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const center = _o.set(p.position.x + fx * 1.8, p.position.y + 1, p.position.z + fz * 1.8);
    game.chaos.blast(center, 2.6, 95, 20, p, { dirX: fx, dirZ: fz, ignore: p, kind: 'punch' });
    // Машина перед Халком — отлетает.
    for (const v of game.vehicles) {
      if (v === p.vehicle || v.carried) continue;
      if (v.distanceToPoint(center.x, center.z) > 1.6) continue;
      v.launch(fx * 24, 6, fz * 24, (Math.random() - 0.5) * 6);
      v.damage?.(35, p);
    }
    game.cameraRig.addShake?.(0.35);
    game.audio.punch(p.position);
    game.audio.slam?.(p.position, 0.5);
  }

  // Приземление (vy — скорость падения, м/с): с высоты Халк бьёт ударной волной.
  onLand(vy) {
    const { game } = this;
    const p = game.player;
    if (this.mode === 'hulk' && vy < -12) {
      const k = Math.min(1.6, -vy / 18);
      game.chaos.blast(p.position, 7 * k, 55 * k, 16 * k, p, { ignore: p });
      game.effects.ring(p.position, 9 * k);
      game.effects.burst(_o.copy(p.position).setY(p.position.y + 0.3), { x: 0, y: 0.5, z: 0 }, 'dust', 40);
      game.effects.dustRing(p.position, 3 + 5 * k);
      game.cameraRig.addShake?.(0.6 * k);
      game.audio.slam?.(p.position, k);
    }
    this.flying = false;
  }

  // Залп репульсора: луч из ладони в точку под прицелом, взрыв в точке попадания.
  _repulsor() {
    const { game } = this;
    const p = game.player;
    if (this.cooldown > 0) return true;
    this.cooldown = 0.28;
    const hand = p.model.muzzleWorld(_o);
    let target = null;
    if (game.input.touchActive) {
      const t = p.findAssistTarget();
      if (t) target = _t.copy(t.position).setY(t.position.y + 1.2);
    }
    if (!target) {
      game.cameraRig.forward(_f);
      const start = _d.copy(game.camera.position).addScaledVector(_f, game.cameraRig.distance);
      target = aimPoint(game, start, _f, p, 150);
    }
    const dir = _f.subVectors(target, hand).normalize();
    p.heading = Math.atan2(dir.x, dir.z);
    p.shootTimer = 1;
    const hit = raycastAll(game, hand, dir, 150, p);
    const end = hit ? hit.point : _d.copy(hand).addScaledVector(dir, 150);
    game.effects.tracer(hand, end, ENERGY, 0.14);
    game.effects.burst(hand, dir, 'energy', 6);
    game.audio.zap?.(hand);
    if (hit) {
      if (hit.kind === 'character') hit.character.takeDamage(55, p, dir.x, dir.z, 'bullet', { zone: hit.zone, point: hit.point, dir: dir.clone(), impulse: 8 });
      if (hit.kind === 'vehicle') hit.vehicle.damage?.(40, p);
      game.effects.burst(end, { x: 0, y: 1, z: 0 }, 'energy', 18);
      game.effects.ring(end, 3.5, 0x9fe6ff);
      game.effects.puff('smoke', end, { x: 0, y: 1, z: 0 }, 0.5);
      game.chaos.blast(end, 3.2, 35, 9, p, { ignore: p });
    }
    game.events.emit('weapon:fired', { shooter: p, weapon: 'repulsor', position: hand.clone() });
    return true;
  }

  // --- Халк и машины ---------------------------------------------------------------

  // E: поднять ближайшую машину (водитель вылетает), с машиной над головой — бросить.
  grabOrThrow() {
    const { game } = this;
    const p = game.player;
    if (this.mode !== 'hulk') return false;
    if (this.carried) {
      this._throw();
      return true;
    }
    let best = null, bestD = 3.2;
    for (const v of game.vehicles) {
      if (v.removed || v.carried) continue;
      const d = v.distanceToPoint(p.position.x, p.position.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best) return false;
    if (best.driver && best.driver !== p) {
      const drv = best.driver;
      drv.exitVehicle();
      drv.panic = 8;
    }
    for (const n of best.passengers) n?.exitPassenger();
    best.ai = null;
    best.carried = true;
    best.parked = false;
    best.velocity.set(0, 0, 0);
    this.carried = best;
    game.audio.slam?.(p.position, 0.3);
    return true;
  }

  _throw() {
    const { game } = this;
    const p = game.player;
    const v = this.carried;
    this.carried = null;
    v.carried = false;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    v.position.set(p.position.x + fx * 2, v.position.y, p.position.z + fz * 2);
    v.launch(fx * 30 + p.velocity.x, 7, fz * 30 + p.velocity.z, (Math.random() - 0.5) * 5);
    v.thrownBy = p;
    p.melee.cancel();
    p.melee.start();
    game.cameraRig.addShake?.(0.25);
  }

  _drop() {
    const v = this.carried;
    if (!v) return;
    this.carried = null;
    v.carried = false;
    v.launch(0, 1, 0, 0);
  }

  // --- Каждый шаг ---------------------------------------------------------------------

  update(dt) {
    const { game } = this;
    const p = game.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.smashIn > 0 && (this.smashIn -= dt) <= 0) this._smash();
    if (this.carried) {
      const v = this.carried;
      if (v.removed || p.isDead || this.mode !== 'hulk') {
        this._drop();
      } else {
        // Держит машину над головой поперёк себя.
        const s = MODES.hulk.scale;
        v.position.set(p.position.x, p.visualY + 2.45 * s, p.position.z);
        v.heading = p.heading + Math.PI / 2;
        v.velocity.set(0, 0, 0);
      }
    }
    if (this.mode === 'ironman' && !p.vehicle) {
      this.flying = !p.grounded;
      if (this.flying) {
        // Реактивные струи из ботинок.
        this.thrustTimer -= dt;
        if (this.thrustTimer <= 0) {
          this.thrustTimer = 0.04;
          _o.set(p.position.x, p.visualY + 0.05, p.position.z);
          game.effects.burst(_o, { x: 0, y: -1.2, z: 0 }, 'energy', 2);
        }
      }
    }
  }

  // Полёт Железного человека: вертикальная скорость по кнопкам, без гравитации.
  flyVertical(dt, input, velocity) {
    const up = input.isDown('jump'), down = input.isDown('descend');
    const want = up ? 11 : down ? -13 : 0;
    velocity.y += (want - velocity.y) * Math.min(1, dt * 4);
  }
}
