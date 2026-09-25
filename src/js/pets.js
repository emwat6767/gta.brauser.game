import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createPetMesh, FLYING } from './petmodels.js';
import { damp, dampAngle } from './utils.js';

// Питомцы и крутки в духе PETS GO.
//   - Крутка бесплатная, но длится spinTime секунд (улучшение "Скорость прокрутки").
//   - Каждый питомец выпадает с шансом "1 на odds"; удача делит шанс:
//     проверяем от самого редкого к частому, P = удача / odds (как в RNG-играх).
//   - Питомцы в слотах ходят за игроком и увеличивают заработок (mult) + дают доход в секунду.
//   - Улучшения покупаются за деньги: удача, скорость, питомцев за крутку, слоты, автокрутка, зелье.
// Интерфейс — ui/pets-ui.js; сохранение — economy.js.

export const PETS = CONFIG.pets.list.map((d) => ({
  ...d,
  income: Math.round(0.5 * d.mult * d.mult * 100) / 100, // $ в секунду
}));
export const PET_BY_ID = new Map(PETS.map((p) => [p.id, p]));
const RARE_FIRST = [...PETS].sort((a, b) => b.odds - a.odds);
const COMMONEST = RARE_FIRST[RARE_FIRST.length - 1];

// Цвет карточки зависит только от шанса (никаких слов "редкий/необычный").
export function oddsColor(odds) {
  if (odds < 10) return '#b8c0c8';
  if (odds < 100) return '#6fd36f';
  if (odds < 1000) return '#5fb8ff';
  if (odds < 10000) return '#b77dff';
  if (odds < 100000) return '#ffb347';
  if (odds < 1000000) return '#ff5a5a';
  return 'rainbow';
}

// "1 на 2 500"
export function formatOdds(odds) {
  return `1 на ${Math.round(odds).toLocaleString('ru-RU')}`;
}

export function upgradePrice(key, level) {
  const u = CONFIG.pets.upgrades[key];
  return Math.round(u.base * Math.pow(u.growth, level));
}

class PetActor {
  constructor(def, envMap) {
    this.def = def;
    this.flying = FLYING.has(def.kind);
    this.root = new THREE.Group();
    this.mesh = createPetMesh(def, envMap);
    // Питомец примерно по колено-пояс игроку; редкие чуть крупнее.
    const s = 0.72 * (1 + Math.log10(def.odds) * 0.05) * (def.scale ?? 1);
    this.mesh.scale.setScalar(s);
    this.root.add(this.mesh);
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.phase = Math.random() * 10;
    this.placed = false;
  }
}

export class PetSystem {
  constructor(game) {
    this.game = game;
    this.owned = {};                 // id -> количество
    this.equipped = [];              // id (может повторяться, если питомцев несколько)
    this.levels = { luck: 0, speed: 0, dice: 0, slots: 0, auto: 0 };
    this.autoOn = false;
    this.potionTime = 0;             // секунд действия зелья удачи
    this.rolls = 0;
    this.rolling = null;             // { results, time, duration }
    this.autoTimer = 0;
    this.incomeAcc = 0;
    this.actors = [];
    this.time = 0;
    this.thumbs = new Map();
  }

  // --- Характеристики -----------------------------------------------------------

  get luck() {
    const U = CONFIG.pets.upgrades;
    return (1 + U.luck.step * this.levels.luck) * (this.potionTime > 0 ? 2 : 1);
  }

  get spinTime() {
    return CONFIG.pets.baseSpin * Math.pow(CONFIG.pets.upgrades.speed.factor, this.levels.speed);
  }

  get slots() {
    return 1 + this.levels.slots;
  }

  get perRoll() {
    return 1 + this.levels.dice;
  }

  get autoUnlocked() {
    return this.levels.auto > 0;
  }

  // Множитель денег от питомцев в слотах: 1 + сумма(mult - 1).
  get moneyMult() {
    return 1 + this.equipped.reduce((s, id) => s + PET_BY_ID.get(id).mult - 1, 0);
  }

  get income() {
    return this.equipped.reduce((s, id) => s + PET_BY_ID.get(id).income, 0);
  }

  // Шанс с учётом удачи (для таблицы шансов): "1 на N/удача", не меньше 1.
  effectiveOdds(def) {
    return Math.max(1, def.odds / this.luck);
  }

  // --- Крутка ---------------------------------------------------------------------

  rollOne(luck = this.luck, random = Math.random) {
    for (const def of RARE_FIRST) {
      if (def === COMMONEST) break;
      if (random() < luck / def.odds) return def;
    }
    return COMMONEST;
  }

  startRoll() {
    if (this.rolling) return false;
    const results = [];
    for (let i = 0; i < this.perRoll; i++) results.push(this.rollOne());
    results.sort((a, b) => b.odds - a.odds);
    this.rolling = { results, time: 0, duration: this.spinTime };
    this.game.events.emit('pets:rollStart', { results, duration: this.rolling.duration });
    return true;
  }

  _finishRoll() {
    const { results } = this.rolling;
    this.rolling = null;
    this.rolls++;
    for (const def of results) {
      this.owned[def.id] = (this.owned[def.id] ?? 0) + 1;
      this._autoEquip(def);
    }
    this.game.events.emit('pets:rolled', { results });
    this.game.save?.markDirty();
  }

  // Новый питомец сам встаёт в свободный слот или заменяет самого слабого.
  _autoEquip(def) {
    if (this.equipped.length < this.slots) {
      this.equipped.push(def.id);
      this._syncActors();
      return;
    }
    let worst = -1;
    for (let i = 0; i < this.equipped.length; i++) {
      if (worst < 0 || PET_BY_ID.get(this.equipped[i]).mult < PET_BY_ID.get(this.equipped[worst]).mult) worst = i;
    }
    if (worst >= 0 && PET_BY_ID.get(this.equipped[worst]).mult < def.mult) {
      this.equipped[worst] = def.id;
      this._syncActors();
    }
  }

  // --- Питомцы в слотах --------------------------------------------------------------

  equippedCount(id) {
    return this.equipped.filter((e) => e === id).length;
  }

  // Нажатие на карточку питомца: надеть ещё одного такого (если есть и есть слот) или снять.
  toggleEquip(id) {
    const on = this.equippedCount(id);
    if (on < (this.owned[id] ?? 0) && this.equipped.length < this.slots) this.equipped.push(id);
    else if (on > 0) this.equipped.splice(this.equipped.lastIndexOf(id), 1);
    else return false;
    this._syncActors();
    this.game.save?.markDirty();
    return true;
  }

  equipBest() {
    const all = [];
    for (const [id, n] of Object.entries(this.owned)) for (let k = 0; k < n; k++) all.push(id);
    all.sort((a, b) => PET_BY_ID.get(b).mult - PET_BY_ID.get(a).mult);
    this.equipped = all.slice(0, this.slots);
    this._syncActors();
    this.game.save?.markDirty();
  }

  // --- Покупки -------------------------------------------------------------------------

  buyUpgrade(key) {
    const u = CONFIG.pets.upgrades[key];
    const lvl = this.levels[key];
    if (lvl >= u.max) return false;
    if (!this.game.wallet.spend(upgradePrice(key, lvl))) return false;
    this.levels[key]++;
    if (key === 'auto') this.autoOn = true;
    if (key === 'slots') this.equipBest(); // новый слот сразу занимает лучший свободный питомец
    this.game.save?.markDirty();
    this.game.events.emit('pets:upgraded', { key, level: this.levels[key] });
    return true;
  }

  buyPotion() {
    if (!this.game.wallet.spend(CONFIG.pets.potion.price)) return false;
    this.potionTime += CONFIG.pets.potion.seconds;
    this.game.save?.markDirty();
    return true;
  }

  toggleAuto() {
    if (!this.autoUnlocked) return false;
    this.autoOn = !this.autoOn;
    this.game.save?.markDirty();
    return true;
  }

  // --- Мир ----------------------------------------------------------------------------

  _syncActors() {
    // Пересоздаём фигурки под список equipped (их мало — дёшево).
    const keep = [];
    const pool = [...this.actors];
    for (const id of this.equipped) {
      const i = pool.findIndex((a) => a.def.id === id);
      if (i >= 0) keep.push(pool.splice(i, 1)[0]);
      else {
        const a = new PetActor(PET_BY_ID.get(id), this.game.envMap);
        this.game.scene.add(a.root);
        keep.push(a);
      }
    }
    for (const a of pool) {
      a.root.removeFromParent();
      a.mesh.material.dispose();
    }
    this.actors = keep;
  }

  update(dt) {
    this.time += dt;
    if (this.potionTime > 0) this.potionTime = Math.max(0, this.potionTime - dt);

    if (this.rolling) {
      this.rolling.time += dt;
      if (this.rolling.time >= this.rolling.duration) {
        this._finishRoll();
        this.autoTimer = CONFIG.pets.rollPause;
      }
    } else if (this.autoOn && this.autoUnlocked) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) this.startRoll();
    }

    // Доход питомцев капает раз в секунду.
    this.incomeAcc += this.income * dt;
    if (this.incomeAcc >= 1) {
      const whole = Math.floor(this.incomeAcc);
      this.incomeAcc -= whole;
      this.game.wallet.add(whole, { quiet: true });
    }

    this._updateActors(dt);
  }

  // Питомцы идут по бокам от игрока, чуть позади (не между камерой и игроком):
  // первый справа, второй слева, следующие рядами дальше. Наземные подпрыгивают, летающие парят.
  _updateActors(dt) {
    const p = this.game.player;
    const hidden = !!p.vehicle || p.isDead;
    const h = p.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = -fz, rz = fx;
    const world = this.game.world;
    this.actors.forEach((a, i) => {
      a.root.visible = !hidden;
      if (hidden) {
        a.placed = false;
        return;
      }
      const side = i % 2 ? -1 : 1;
      const row = Math.floor(i / 2);
      const lateral = side * (1.25 + row * 0.35);
      const back = 0.2 + row * 0.9;
      const tx = p.position.x - fx * back + rx * lateral;
      const tz = p.position.z - fz * back + rz * lateral;
      if (!a.placed || a.position.distanceToSquared(p.position) > 30 * 30) {
        a.position.set(tx, 0, tz);
        a.placed = true;
      }
      const ox = a.position.x, oz = a.position.z;
      a.position.x = damp(a.position.x, tx, 5, dt);
      a.position.z = damp(a.position.z, tz, 5, dt);
      const vx = (a.position.x - ox) / Math.max(dt, 1e-4), vz = (a.position.z - oz) / Math.max(dt, 1e-4);
      const speed = Math.hypot(vx, vz);
      a.heading = speed > 0.4 ? dampAngle(a.heading, Math.atan2(vx, vz), 8, dt) : dampAngle(a.heading, h, 3, dt);
      a.phase += dt * (speed > 0.4 ? 11 : 2);
      const ground = world.getGroundHeight(a.position.x, a.position.z);
      const y = a.flying
        ? ground + 1.1 + Math.sin(this.time * 2 + i) * 0.12
        : ground + (speed > 0.4 ? Math.abs(Math.sin(a.phase)) * 0.16 : 0);
      a.root.position.set(a.position.x, y, a.position.z);
      a.root.rotation.set(a.flying ? Math.sin(this.time * 2 + i) * 0.08 : 0, a.heading, 0);
      // Эффекты редкости.
      const m = a.mesh.material;
      if (a.def.fx === 'rainbow') m.emissive.setHSL((this.time * 0.25 + i * 0.2) % 1, 1, 0.5);
      else if (a.def.fx === 'glow' || a.def.fx === 'cosmic') m.emissiveIntensity = 0.45 + Math.sin(this.time * 3 + i) * 0.25;
      if (a.def.odds >= 10000 && Math.random() < dt * 4) {
        this.game.effects.burst(a.root.position.clone().setY(y + 0.5), new THREE.Vector3(0, 0.6, 0), 'spark', 1);
      }
    });
  }

  // --- Картинки для интерфейса -----------------------------------------------------

  // Картинка питомца (dataURL). Рисуется один раз основным рендерером в текстуру.
  thumbnail(id) {
    if (this.thumbs.has(id)) return this.thumbs.get(id);
    const def = PET_BY_ID.get(id);
    const size = 96;
    const renderer = this.game.renderer;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(1, 2, 2);
    scene.add(sun);
    const mesh = createPetMesh(def, this.game.envMap);
    mesh.rotation.y = 0.6;
    scene.add(mesh);
    const bounds = new THREE.Box3().setFromObject(mesh, true); // точно по вершинам с учётом поворота
    const center = bounds.getCenter(new THREE.Vector3());
    const box = bounds.getSize(new THREE.Vector3());
    // Кадр по ширине/высоте силуэта (а не по диагонали — иначе длинный хвост делает питомца мелким).
    const half = Math.max(box.x, box.y) * 0.5;
    const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
    const dist = half / Math.tan(THREE.MathUtils.degToRad(16)) * 1.1 + box.z * 0.3;
    cam.position.set(center.x, center.y + dist * 0.18, center.z + dist);
    cam.lookAt(center);
    const target = new THREE.WebGLRenderTarget(size, size);
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearAlpha();
    const prevColor = renderer.getClearColor(new THREE.Color());
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.shadowMap.autoUpdate = false;
    renderer.render(scene, cam);
    renderer.shadowMap.autoUpdate = true;
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, px);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevClear);
    target.dispose();
    mesh.material.dispose();

    // В текстуру пишутся линейные цвета — переводим в sRGB и переворачиваем по вертикали.
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const toSrgb = (v) => {
      const l = v / 255;
      return 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = ((size - 1 - y) * size + x) * 4, d = (y * size + x) * 4;
        img.data[d] = toSrgb(px[s]);
        img.data[d + 1] = toSrgb(px[s + 1]);
        img.data[d + 2] = toSrgb(px[s + 2]);
        img.data[d + 3] = px[s + 3];
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL();
    this.thumbs.set(id, url);
    return url;
  }

  // --- Сохранение -------------------------------------------------------------------

  serialize() {
    return {
      owned: this.owned, equipped: this.equipped, levels: this.levels,
      autoOn: this.autoOn, potionTime: Math.round(this.potionTime), rolls: this.rolls,
    };
  }

  deserialize(data) {
    if (!data) return;
    for (const [id, n] of Object.entries(data.owned ?? {})) if (PET_BY_ID.has(id)) this.owned[id] = n | 0;
    for (const key of Object.keys(this.levels)) {
      this.levels[key] = Math.min(CONFIG.pets.upgrades[key].max, data.levels?.[key] | 0);
    }
    const left = { ...this.owned };
    this.equipped = (data.equipped ?? []).filter((id) => left[id]-- > 0).slice(0, this.slots);
    this.autoOn = !!data.autoOn && this.autoUnlocked;
    this.potionTime = Math.max(0, data.potionTime | 0);
    this.rolls = data.rolls | 0;
    this._syncActors();
  }
}
