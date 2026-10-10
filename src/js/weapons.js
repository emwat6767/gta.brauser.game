import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mergeColored } from './geometry.js';

// Огнестрельное оружие: модели (из примитивов), состояние ствола (Gun) и набор
// оружия игрока (Arsenal). Параметры — CONFIG.weapons. Стрельба (лучи, урон) — ballistics.js.
//
// Модели строятся стволом вдоль +Z, рукоятью вниз (-Y); начало координат — в ладони.
// humanoid.setWeapon() вешает модель в правую кисть.

export const WEAPON_ORDER = ['fists', 'pistol', 'shotgun', 'smg', 'rifle', 'sniper', 'rpg'];

let MODELS = null;
function models() {
  if (MODELS) return MODELS;
  const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z);
  const cylZ = (r, len, x, y, z, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z);
  const metal = 0x2b2d31, dark = 0x151618, wood = 0x6e4526, steel = 0x55595f;

  MODELS = {
    pistol: {
      geometry: mergeColored([
        { geometry: box(0.034, 0.042, 0.2, 0, 0.045, 0.06), color: metal },      // затвор
        { geometry: box(0.03, 0.11, 0.045, 0, -0.005, -0.008, -0.25), color: dark }, // рукоять
        { geometry: box(0.008, 0.03, 0.05, 0, 0.01, 0.045), color: dark },       // скоба
        { geometry: cylZ(0.009, 0.02, 0, 0.05, 0.165), color: steel },            // срез ствола
      ]),
      muzzle: new THREE.Vector3(0, 0.05, 0.18),
    },
    shotgun: {
      geometry: mergeColored([
        { geometry: cylZ(0.017, 0.36, 0.017, 0.05, 0.21), color: steel },         // два ствола
        { geometry: cylZ(0.017, 0.36, -0.017, 0.05, 0.21), color: steel },
        { geometry: box(0.055, 0.055, 0.13, 0, 0.042, 0.0), color: metal },      // колодка
        { geometry: box(0.05, 0.03, 0.15, 0, 0.018, 0.15), color: wood },        // цевьё
        { geometry: box(0.038, 0.13, 0.055, 0, -0.03, -0.05, -0.4), color: wood }, // обрезанный приклад
      ]),
      muzzle: new THREE.Vector3(0, 0.05, 0.4),
    },
    smg: {
      geometry: mergeColored([
        { geometry: box(0.046, 0.07, 0.3, 0, 0.05, 0.06), color: metal },        // ствольная коробка
        { geometry: cylZ(0.012, 0.18, 0, 0.066, 0.29), color: steel },           // ствол
        { geometry: box(0.052, 0.048, 0.15, 0, 0.052, 0.17), color: wood },      // цевьё
        { geometry: box(0.03, 0.17, 0.05, 0, -0.04, 0.12, 0.35), color: dark },  // магазин
        { geometry: box(0.03, 0.1, 0.04, 0, -0.012, 0, -0.3), color: dark },     // рукоять
        { geometry: box(0.036, 0.065, 0.2, 0, 0.04, -0.18), color: wood },       // приклад
      ]),
      muzzle: new THREE.Vector3(0, 0.066, 0.39),
    },
    rifle: {
      geometry: mergeColored([
        { geometry: box(0.05, 0.075, 0.34, 0, 0.05, 0.08), color: metal },        // ствольная коробка
        { geometry: cylZ(0.011, 0.34, 0, 0.068, 0.44), color: steel },            // ствол
        { geometry: cylZ(0.018, 0.1, 0, 0.068, 0.34), color: dark },              // газовая трубка / надульник
        { geometry: box(0.05, 0.05, 0.24, 0, 0.052, 0.27), color: wood },         // цевьё
        { geometry: box(0.03, 0.17, 0.05, 0, -0.035, 0.1, 0.25), color: dark },   // изогнутый магазин
        { geometry: box(0.03, 0.1, 0.04, 0, -0.012, -0.02, -0.3), color: dark },  // рукоять
        { geometry: box(0.04, 0.075, 0.26, 0, 0.03, -0.26), color: wood },        // приклад
        { geometry: box(0.012, 0.03, 0.012, 0, 0.1, 0.55), color: steel },        // мушка
      ]),
      muzzle: new THREE.Vector3(0, 0.068, 0.62),
    },
    sniper: {
      geometry: mergeColored([
        { geometry: box(0.045, 0.07, 0.4, 0, 0.05, 0.05), color: metal },         // ствольная коробка
        { geometry: cylZ(0.012, 0.62, 0, 0.062, 0.62), color: steel },            // длинный ствол
        { geometry: cylZ(0.019, 0.08, 0, 0.062, 0.9), color: dark },              // дульный тормоз
        { geometry: cylZ(0.027, 0.26, 0, 0.14, 0.06), color: dark },              // оптика
        { geometry: cylZ(0.034, 0.06, 0, 0.14, 0.2), color: metal },
        { geometry: cylZ(0.034, 0.06, 0, 0.14, -0.08), color: metal },
        { geometry: box(0.02, 0.05, 0.04, 0, 0.1, 0.12), color: dark },            // крепления оптики
        { geometry: box(0.02, 0.05, 0.04, 0, 0.1, -0.02), color: dark },
        { geometry: box(0.05, 0.07, 0.3, 0, 0.04, 0.34), color: wood },           // ложа
        { geometry: box(0.04, 0.12, 0.1, 0, -0.03, -0.05, 0.1), color: dark },    // магазин
        { geometry: box(0.045, 0.1, 0.3, 0, 0.02, -0.28, -0.1), color: wood },    // приклад
        { geometry: box(0.014, 0.09, 0.014, 0.04, -0.02, 0.62, 0.15), color: steel }, // сошки
        { geometry: box(0.014, 0.09, 0.014, -0.04, -0.02, 0.62, -0.15), color: steel },
      ]),
      muzzle: new THREE.Vector3(0, 0.062, 0.95),
    },
    rpg: {
      geometry: mergeColored([
        { geometry: cylZ(0.05, 0.8, 0, 0.05, 0.05), color: 0x3d4a2f },            // труба
        { geometry: cylZ(0.065, 0.12, 0, 0.05, -0.38), color: dark },             // раструб сзади
        { geometry: new THREE.ConeGeometry(0.075, 0.2, 10).rotateX(Math.PI / 2).translate(0, 0.05, 0.62), color: 0x6a6f3a }, // граната
        { geometry: cylZ(0.035, 0.18, 0, 0.05, 0.5), color: 0x55584a },
        { geometry: box(0.03, 0.12, 0.05, 0, -0.04, 0.0, -0.1), color: dark },    // рукоять
        { geometry: box(0.03, 0.1, 0.04, 0, -0.03, 0.2), color: dark },           // передняя рукоять
        { geometry: box(0.03, 0.07, 0.12, 0.06, 0.1, 0.05), color: metal },       // прицел
      ]),
      muzzle: new THREE.Vector3(0, 0.05, 0.7),
    },
  };
  MODELS.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 });
  return MODELS;
}

export function createWeaponModel(type) {
  const M = models();
  const mesh = new THREE.Mesh(M[type].geometry, M.material);
  mesh.castShadow = true;
  mesh.userData.muzzle = M[type].muzzle;
  return mesh;
}

// Состояние одного ствола: патроны в магазине и в запасе, перезарядка, темп, разброс.
export class Gun {
  // infinite — бесконечный запас (у NPC); bottomless — магазин не пустеет вовсе (игрок).
  constructor(type, ammo = 0, infinite = false, bottomless = false) {
    this.type = type;
    this.def = CONFIG.weapons[type];
    this.bottomless = bottomless;
    this.mag = bottomless ? this.def.magazine : Math.min(ammo, this.def.magazine);
    this.reserve = infinite || bottomless ? Infinity : Math.max(0, ammo - this.mag);
    this.cooldown = 0;
    this.reloadTime = 0;
    this.bloom = 0;
  }

  get reloading() {
    return this.reloadTime > 0;
  }

  get reloadProgress() {
    return this.reloading ? 1 - this.reloadTime / this.def.reload : 0;
  }

  get total() {
    return this.mag + this.reserve;
  }

  canFire() {
    return !this.reloading && this.cooldown <= 0 && this.mag > 0;
  }

  // Выстрел: минус патрон, пауза по темпу, рост разброса.
  consume() {
    if (!this.bottomless) this.mag--;
    this.cooldown = 1 / this.def.fireRate;
    this.bloom = Math.min(this.bloom + this.def.bloom, this.def.bloom * 6);
  }

  startReload() {
    if (this.bottomless || this.reloading || this.mag >= this.def.magazine || this.reserve <= 0) return false;
    this.reloadTime = this.def.reload;
    return true;
  }

  spread(moving) {
    return this.def.spread + this.bloom + (moving ? this.def.spread * 1.5 + 0.01 : 0);
  }

  // Возвращает true в кадр, когда перезарядка закончилась.
  update(dt) {
    this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    if (!this.reloading) return false;
    this.reloadTime -= dt;
    if (this.reloadTime > 0) return false;
    this.reloadTime = 0;
    const take = Math.min(this.def.magazine - this.mag, this.reserve);
    this.mag += take;
    this.reserve -= take;
    return true;
  }
}

// Оружие игрока: какие стволы есть и какой в руках. 'fists' — кулаки (всегда есть).
export class Arsenal {
  constructor(bottomless = false) {
    this.guns = new Map();
    this.current = 'fists';
    this.bottomless = bottomless; // бесконечные патроны (CONFIG.player.infiniteAmmo)
  }

  get gun() {
    return this.current === 'fists' ? null : this.guns.get(this.current);
  }

  has(type) {
    return type === 'fists' || this.guns.has(type);
  }

  // Подобрать оружие/патроны. Возвращает true, если ствол новый.
  give(type, ammo) {
    const gun = this.guns.get(type);
    if (gun) {
      gun.reserve += ammo;
      return false;
    }
    this.guns.set(type, new Gun(type, ammo, false, this.bottomless));
    return true;
  }

  select(type) {
    if (!this.has(type)) return false;
    this.current = type;
    return true;
  }

  cycle(dir = 1) {
    const owned = WEAPON_ORDER.filter((t) => this.has(t));
    const i = owned.indexOf(this.current);
    this.current = owned[(i + dir + owned.length) % owned.length];
    return this.current;
  }

  reset(start) {
    this.guns.clear();
    for (const [type, ammo] of Object.entries(start)) this.give(type, ammo);
    this.current = Object.keys(start)[0] ?? 'fists';
  }
}
