import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Humanoid } from './humanoid.js';
import { NPC } from './npc.js';
import { aimPoint, raycastAll } from './ballistics.js';
import { findTargetInFront } from './combat.js';
import { eliteLook } from './outfits.js';

// Режимы силы игрока (X / кнопка СИЛА — по кругу). У каждого — свои множители движения (mods),
// своя атака (F / ЛКМ) и три способности на Q, R, G (кнопки ОРУЖИЕ / ПЕРЕЗ. / третья на телефоне).
// player.js спрашивает powers.mods и отдаёт сюда атаку, приземление и полёт; на время режима модель
// игрока подменяется (своя расцветка и рост).
//
//   СИЛА (hulk)     — супер-сила, мало эффектов, зато ломает всё: деревья, фонари, машины, скамейки.
//                     F — удар, Q — топот (землетрясение), R — прыжок-удар, G — рёв. E у машины — поднять.
//   УМНЫЙ КОСТЮМ (ironman) — полёт и изобретения. F — репульсор, Q — ракеты с самонаведением,
//                     R — дроны-охотники, G — ЭМИ-купол со щитом. Space/Z — вверх/вниз.
//   ТИТАН (titan)   — и сильный, и умный, но «в меру»: быстрее и крепче обычного, планирует (Space в
//                     воздухе), каждый третий удар шлёт волну. Q — рывок, R — энергошар, G — притяжение.
//   БОСС БАНДЫ (boss) — сам хрупкий (пистолет и 120 здоровья), зато зовёт свиту: Q — до 4 элитных бойцов
//                     с пистолетами через золотой/фиолетовый портал (всего до 16), R — молнии по цели
//                     (и вся свита стреляет туда), G — золотой купол-щит для себя и свиты.
//
// Новый режим: запись в MODES (множители, здоровье, расцветка) + GADGETS + ветки в attack()/update().

const MODES = {
  normal: { name: 'Обычный', color: '#ffffff', walk: 1, run: 1, jump: 1, accel: 1, gravity: 1, damageTaken: 1, health: 100, scale: 1, unarmed: false },
  hulk: {
    name: 'СИЛА', color: '#6fdc4a', walk: 1.5, run: 1.75, jump: 3.9, accel: 1.4, gravity: 1.05, damageTaken: 0.15, health: 600, scale: 1.65, unarmed: true, noKnock: true,
    look: { skin: '#5fa83c', hair: '#18140f', shirt: '#5fa83c', pants: '#5b2a86', shoes: '#5fa83c', scale: 1.65 },
    hint: 'СИЛА: F — удар, Q — топот, R — прыжок-удар, G — рёв. Space — суперпрыжок, E у машины — поднять',
  },
  ironman: {
    name: 'УМНЫЙ КОСТЮМ', color: '#ffcf4a', walk: 1.2, run: 1.4, jump: 1.3, accel: 1.3, gravity: 1, damageTaken: 0.3, health: 300, scale: 1.05, unarmed: true, fly: true,
    look: { skin: '#9e1b24', hair: '#d4a23a', shirt: '#b8202b', pants: '#b8202b', shoes: '#d4a23a', hat: '#d4a23a', scale: 1.05 },
    hint: 'КОСТЮМ: Space — взлёт, Z — вниз, F — репульсор, Q — ракеты, R — дроны, G — ЭМИ-щит',
  },
  titan: {
    name: 'ТИТАН', color: '#5bb8ff', walk: 1.25, run: 1.5, jump: 2.2, accel: 1.3, gravity: 0.92, damageTaken: 0.45, health: 350, scale: 1.3, unarmed: true, noKnock: true,
    look: {
      skin: '#d6a57c', hair: '#e8d9a0', hairStyle: 'slick', top: 'turtle', shirt: '#1d4fd8', accent: '#f2c230', bottom: 'slim', pants: '#0f2f7a', trim: '#f2c230',
      shoes: '#f2c230', shoeStyle: 'boot', gloves: '#f2c230', glasses: 'visor', glassColor: '#7fd8ff', scale: 1.3, bulk: 1.25,
    },
    hint: 'ТИТАН: F — удар (каждый 3-й с волной), Q — рывок, R — энергошар, G — притяжение, Space в воздухе — планировать',
  },
  boss: {
    name: 'БОСС БАНДЫ', color: '#e6b422', walk: 1, run: 1.05, jump: 1, accel: 1, gravity: 1, damageTaken: 1.15, health: 120, scale: 1.08, unarmed: false,
    look: {
      skin: '#c68642', hair: '#141414', hairStyle: 'slick', beard: 'goatee', top: 'suit', shirt: '#101216', shirt2: '#f4f4f4', accent: '#d9b13b',
      bottom: 'slim', pants: '#101216', shoes: '#0a0a0c', shoeStyle: 'dress', hat: '#101216', hatStyle: 'fedora', glasses: 'shades',
      chain: '#d9b13b', watch: '#d9b13b', scale: 1.08, bulk: 1.1,
    },
    hint: 'БОСС: ты слаб, но с тобой банда. Q — позвать бойцов, R — молнии по цели, G — золотой купол. Пистолет — F',
  },
};
export const POWER_ORDER = ['normal', 'hulk', 'ironman', 'titan', 'boss'];

const GADGETS = {
  hulk: [
    { key: 'Q', action: 'gadgetA', name: 'Топот', cd: 5, use: '_stomp' },
    { key: 'R', action: 'gadgetB', name: 'Прыжок-удар', cd: 4.5, use: '_leap' },
    { key: 'G', action: 'gadgetC', name: 'Рёв', cd: 9, use: '_roar' },
  ],
  ironman: [
    { key: 'Q', action: 'gadgetA', name: 'Ракеты', cd: 5, use: '_missiles' },
    { key: 'R', action: 'gadgetB', name: 'Дроны', cd: 16, use: '_drones' },
    { key: 'G', action: 'gadgetC', name: 'ЭМИ-щит', cd: 12, use: '_emp' },
  ],
  titan: [
    { key: 'Q', action: 'gadgetA', name: 'Рывок', cd: 4, use: '_dash' },
    { key: 'R', action: 'gadgetB', name: 'Энергошар', cd: 3.5, use: '_orb' },
    { key: 'G', action: 'gadgetC', name: 'Притяжение', cd: 9, use: '_pull' },
  ],
  boss: [
    { key: 'Q', action: 'gadgetA', name: 'Позвать банду', cd: 5, use: '_summon' },
    { key: 'R', action: 'gadgetB', name: 'Молнии', cd: 11, use: '_strike' },
    { key: 'G', action: 'gadgetC', name: 'Купол', cd: 16, use: '_dome' },
  ],
};
export const ELITE_CAP = 16;

const UP = new THREE.Vector3(0, 1, 0);
const ROCK = [0x8a8478, 0x6f6a60, 0x555048, 0xa09a8c];
const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();

export class PowerSystem {
  constructor(game) {
    this.game = game;
    this.mode = 'normal';
    this.models = { normal: game.player.model };
    this.cooldown = 0;
    this.smashIn = 0;       // задержка удара (кулак должен дойти до цели)
    this.carried = null;    // машина над головой (режим СИЛА)
    this.flying = false;
    this.gliding = false;
    this.thrustTimer = 0;
    this.time = 0;
    this.cds = {};          // перезарядка способностей: action -> секунд
    this.queue = [];        // отложенные действия: { t, fn }
    this.slamArmed = false; // прыжок-удар: на приземлении — ударная волна
    this.dashT = 0;
    this.dashDir = new THREE.Vector3();
    this.combo = 0;         // удары титана подряд
    this.comboTimer = 0;
    this.shieldUntil = 0;   // щит (костюм, купол босса): урон по игроку сильно меньше
    this.shieldMul = 1;
    this.drones = [];
    this.droneUntil = 0;
    this.elites = [];       // элитные бойцы босса (в squad.members тоже)
    this.auraTimer = 0;
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

  get unarmed() {
    return MODES[this.mode].unarmed;
  }

  get canFly() {
    return !!MODES[this.mode].fly;
  }

  get hasGadgets() {
    return this.mode !== 'normal';
  }

  get cannotDrive() {
    return this.mode === 'hulk' || this.mode === 'titan';
  }

  // Множитель получаемого урона с учётом щита.
  get damageMul() {
    return MODES[this.mode].damageTaken * (this.time < this.shieldUntil ? this.shieldMul : 1);
  }

  // Для HUD: [{ key, name, ready (0..1, 1 = готово) }]
  gadgetInfo() {
    return (GADGETS[this.mode] ?? []).map((g) => ({
      key: g.key,
      name: g.use === '_summon' ? `Банда ${this.elites.length}/${ELITE_CAP}` : g.name,
      ready: 1 - Math.min(1, Math.max(0, this.cds[g.action] ?? 0) / g.cd),
    }));
  }

  // Строка состояния режима (для панели оружия).
  statusText() {
    if (this.mode === 'boss') return `Свита ${this.elites.length}/${ELITE_CAP}`;
    return 'СИЛА';
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
    if ((mode === 'hulk' || mode === 'titan') && p.vehicle) p.exitVehicle();
    if (this.mode === 'boss') this.retireAll();
    this.queue.length = 0;
    this.slamArmed = false;
    this.dashT = 0;
    this._hideDrones();
    this.shieldUntil = 0;
    this.cds = {};
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
    next.setWeapon(!M.unarmed && !p.vehicle ? p.arsenal.current : null);
    // Здоровье: та же доля от нового максимума.
    const frac = p.health / p.maxHealth;
    p.maxHealth = M.health;
    p.health = Math.max(1, frac * M.health);
    p.radius = CONFIG.player.radius * M.scale;
    p.aiming = false;
    game.cameraRig.aiming = false;
    this.mode = mode;
    this.flying = false;
    this.gliding = false;
    const hex = new THREE.Color(M.color).getHex();
    game.effects.ring(p.position, 4, hex);
    game.effects.burst(_o.copy(p.position).setY(p.position.y + 1.2), { x: 0, y: 1, z: 0 }, mode === 'hulk' ? 'dust' : mode === 'boss' ? 'gold' : 'energy', 30);
    if (mode === 'ironman' || mode === 'titan') game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1), 3.2, mode === 'titan' ? 'plasma' : 'white', 0.5, 0.3);
    if (mode === 'boss') {
      game.vfx.pillar(p.position, 'gold', 30, 0.9, 0.9);
      game.vfx.aura(p, 'gold', 2, 50);
    }
    game.audio.powerUp?.(mode);
    game.hud.toast(M.hint ?? 'Обычный режим', 4.5);
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
    } else if (mode === 'titan') {
      // Золотой знак на груди.
      const gold = new THREE.MeshBasicMaterial({ color: 0xffd24a, toneMapped: false });
      const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), gold);
      emblem.position.set(0, 0.36, 0.145);
      m.spine.add(emblem);
    }
    return m;
  }

  // Атака (F / ЛКМ) в режиме силы. true — обработано.
  attack() {
    switch (this.mode) {
      case 'hulk': return this._hulkAttack();
      case 'ironman': return this._repulsor();
      case 'titan': return this._titanAttack();
      default: return false;
    }
  }

  // Режимы, где F зажимают для непрерывной стрельбы.
  get autoAttack() {
    return this.mode === 'ironman';
  }

  // --- Общие помощники --------------------------------------------------------------

  _later(t, fn) {
    this.queue.push({ t: this.time + t, fn });
  }

  // Враг ли NPC для игрока (по кому бьют ракеты, дроны и молнии без прицела).
  isEnemy(n) {
    const { game } = this;
    if (n.isDead || n.removed || n.vehicle || n.follower || !n.model.root.visible) return false;
    const p = game.player;
    if (n.role === 'boss') return n.boss?.hostile ?? false;
    if (n.role === 'police') return game.wanted.level > 0 || n.target === p;
    if (n.role === 'gang') return !game.gangs.isFriendlyToPlayer(n.gang) || n.target === p || n.target?.follower === true;
    return n.target === p || n.target?.follower === true;
  }

  // Ближайшие враги в радиусе (сначала те, кто ближе к направлению камеры).
  enemies(range, limit = 4) {
    const { game } = this;
    const p = game.player;
    game.cameraRig.forward(_f);
    const list = [];
    for (const n of game.npcs.list) {
      if (!this.isEnemy(n)) continue;
      const dx = n.position.x - p.position.x, dz = n.position.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const facing = (dx * _f.x + dz * _f.z) / (d || 1);
      list.push({ n, score: d * (1.4 - Math.max(0, facing) * 0.6) });
    }
    list.sort((a, b) => a.score - b.score);
    return list.slice(0, limit).map((e) => e.n);
  }

  // Куда целится игрок: ладонь, направление и точка. Результат — в this._hand / this._aimDir / this._aimEnd.
  _aim(range = 150) {
    const { game } = this;
    const p = game.player;
    this._hand ??= new THREE.Vector3();
    this._aimDir ??= new THREE.Vector3();
    this._aimEnd ??= new THREE.Vector3();
    const hand = p.model.muzzleWorld(this._hand);
    let target = null;
    if (game.input.touchActive) {
      const t = p.findAssistTarget();
      if (t) target = _t.copy(t.position).setY((t.visualY ?? t.position.y) + 1.2);
    }
    if (!target) {
      game.cameraRig.forward(_f);
      const start = _d.copy(game.camera.position).addScaledVector(_f, game.cameraRig.distance);
      target = aimPoint(game, start, _f, p, range);
    }
    this._aimEnd.copy(target);
    this._aimDir.subVectors(target, hand).normalize();
    return hand;
  }

  _notAlly = (c) => c !== this.game.player && !c.follower;

  _crater(point, size) {
    const { game } = this;
    const g = game.world.getGroundHeight(point.x, point.z);
    if (g > 0.3) return; // не на бордюре/ступенях
    game.vfx.crater(_p.set(point.x, g, point.z), UP, size);
  }

  // --- СИЛА ------------------------------------------------------------------------

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
    this.cooldown = 0.42;
    return true;
  }

  // Удар: всё в конусе перед ним разлетается, деревья и фонари валятся.
  _smash() {
    const { game } = this;
    const p = game.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const center = _o.set(p.position.x + fx * 2.1, p.position.y + 1, p.position.z + fz * 2.1);
    game.chaos.blast(center, 3.1, 110, 22, p, { dirX: fx, dirZ: fz, ignore: p, kind: 'punch' });
    game.world.breakTrees(center.x, center.z, 2.8, fx, fz);
    // Машина перед ним — отлетает.
    for (const v of game.vehicles) {
      if (v === p.vehicle || v.carried) continue;
      if (v.distanceToPoint(center.x, center.z) > 1.9) continue;
      v.launch(fx * 26, 7, fz * 26, (Math.random() - 0.5) * 6);
      v.damage?.(45, p);
    }
    game.effects.burst(center, { x: fx, y: 0.6, z: fz }, 'dust', 10);
    game.vfx.chunks(center, 6, ROCK, 6, 0.2);
    game.cameraRig.addShake?.(0.35);
    game.audio.punch(p.position);
    game.audio.slam?.(p.position, 0.5);
    game.worklife?.watch(p.position, 30, 14);
  }

  // Q: топот — землетрясение вокруг, всё подпрыгивает, трещины и обломки.
  _stomp() {
    const { game } = this;
    const p = game.player;
    const c = _o.copy(p.position);
    game.chaos.blast(c, 11, 75, 19, p, { ignore: p });
    game.world.breakTrees(c.x, c.z, 9);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 5;
      this._crater(_t.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r), 3 + Math.random() * 2.5);
    }
    this._crater(c, 6);
    game.vfx.chunks(c, 16, ROCK, 9, 0.28);
    game.effects.dustRing(c, 9);
    game.effects.ring(c, 11, 0xb7a98a);
    game.cameraRig.addShake?.(0.75);
    game.audio.slam?.(c, 1.2);
    game.worklife?.watch(c, 40, 16);
    return true;
  }

  // R: прыжок-удар — вперёд и вверх, на приземлении ударная волна (onLand).
  _leap() {
    const { game } = this;
    const p = game.player;
    const target = findTargetInFront(game, p, 24, 0.3, false);
    if (target) p.heading = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const reach = target ? Math.min(26, Math.hypot(target.position.x - p.position.x, target.position.z - p.position.z)) : 16;
    p.velocity.set(fx * (reach * 1.0 + 6), 21, fz * (reach * 1.0 + 6));
    p.grounded = false;
    this.slamArmed = true;
    game.effects.dustRing(p.position, 4);
    game.vfx.chunks(p.position, 6, ROCK, 6, 0.2);
    game.audio.slam?.(p.position, 0.6);
    return true;
  }

  // G: рёв — все вокруг в ужасе, сбиты с ног, окна дрожат; почти без эффектов.
  _roar() {
    const { game } = this;
    const p = game.player;
    const c = _o.copy(p.position).setY(p.position.y + 1.2);
    game.chaos.blast(c, 15, 18, 10, p, { ignore: p });
    game.npcs.scare(p.position, 45, p);
    game.effects.dustRing(p.position, 12);
    game.cameraRig.addShake?.(0.6);
    game.audio.slam?.(p.position, 1.5);
    game.hud.say(p, 'РРРААА!', 1.4);
    game.worklife?.watch(p.position, 40, 12);
    return true;
  }

  // Приземление (vy — скорость падения, м/с): с высоты (или после прыжка-удара) — ударная волна.
  onLand(vy) {
    const { game } = this;
    const p = game.player;
    if (this.mode === 'hulk' && (vy < -12 || (this.slamArmed && vy < -4))) {
      const k = Math.min(1.8, Math.max(0.9, -vy / 16));
      game.chaos.blast(p.position, 8 * k, 80 * k, 18 * k, p, { ignore: p });
      game.world.breakTrees(p.position.x, p.position.z, 6 * k);
      this._crater(p.position, 5.5 * k);
      game.vfx.chunks(p.position, Math.round(14 * k), ROCK, 8 * k, 0.26);
      game.effects.dustRing(p.position, 3 + 6 * k);
      game.effects.ring(p.position, 9 * k, 0xb7a98a);
      game.cameraRig.addShake?.(0.65 * k);
      game.audio.slam?.(p.position, k);
      game.worklife?.watch(p.position, 40, 16);
    } else if (this.mode === 'titan' && vy < -15) {
      const k = Math.min(1.4, -vy / 20);
      game.chaos.blast(p.position, 5 * k, 45 * k, 12 * k, p, { ignore: p });
      game.vfx.dome(p.position, 5 * k, 'plasma', 0.4, 0.28);
      game.effects.ring(p.position, 6 * k, 0x7fd8ff);
      game.effects.dustRing(p.position, 4);
      game.cameraRig.addShake?.(0.35);
      game.audio.slam?.(p.position, 0.7);
    }
    this.slamArmed = false;
    this.flying = false;
    this.gliding = false;
  }

  // --- УМНЫЙ КОСТЮМ ---------------------------------------------------------------------

  // F: залп репульсора — луч из ладони в точку под прицелом, взрыв плазмы в точке попадания.
  _repulsor() {
    const { game } = this;
    const p = game.player;
    if (this.cooldown > 0) return true;
    this.cooldown = 0.26;
    const hand = this._aim();
    const dir = this._aimDir;
    p.heading = Math.atan2(dir.x, dir.z);
    p.shootTimer = 1;
    const hit = raycastAll(game, hand, dir, 150, p);
    const end = hit ? hit.point : _d.copy(hand).addScaledVector(dir, 150);
    game.vfx.beam(hand, end, 'plasma', { life: 0.12, width: 0.16 });
    game.effects.burst(hand, dir, 'energy', 6);
    game.audio.zap?.(hand);
    if (hit) {
      if (hit.kind === 'character') hit.character.takeDamage(55, p, dir.x, dir.z, 'bullet', { zone: hit.zone, point: hit.point, dir: dir.clone(), impulse: 8 });
      if (hit.kind === 'vehicle') hit.vehicle.damage?.(40, p);
      game.vfx.explosion(end, { theme: 'plasma', aoe: 3.2, damage: 35, force: 9, owner: p, sound: false });
    }
    game.events.emit('weapon:fired', { shooter: p, weapon: 'repulsor', position: hand.clone() });
    return true;
  }

  // Q: ракеты с самонаведением — по врагам, а если их нет, по точке прицела.
  _missiles() {
    const { game } = this;
    const p = game.player;
    const foes = this.enemies(75, 4);
    const hand = this._aim();
    const aim = this._aimEnd.clone();
    const n = 4;
    for (let i = 0; i < n; i++) {
      const target = foes.length ? foes[i % foes.length] : null;
      this._later(i * 0.12, () => {
        if (p.isDead || this.mode !== 'ironman') return;
        const from = p.model.muzzleWorld(_o).clone();
        from.y += 0.4;
        const side = (i % 2 ? 1 : -1) * (0.4 + i * 0.12);
        const dir = (target ? _d.set(target.position.x, (target.visualY ?? target.position.y) + 1.1, target.position.z) : _d.copy(aim)).sub(from).normalize();
        dir.x += -dir.z * side * 0.5;
        dir.z += dir.x * side * 0.05;
        dir.y += 0.35 + i * 0.05; // сначала вверх, потом наводятся
        dir.normalize();
        game.vfx.projectile(from, dir, {
          speed: 30, theme: 'fire', kind: 'missile', aoe: 4.2, damage: 70, force: 12, owner: p, ignore: p, life: 4.5,
          turn: 5, homing: target ?? (() => null), only: this._notAlly,
        });
        game.audio.zap?.(from);
      });
    }
    p.shootTimer = 1;
    const dir0 = this._aimDir;
    p.heading = Math.atan2(dir0.x, dir0.z);
    game.vfx.orb(hand, 'fire', 1.8, 0.25);
    game.hud.say(p, foes.length ? 'Цели захвачены!' : 'Ракеты пошли!', 1.4);
    game.worklife?.watch(p.position, 35, 12);
    return true;
  }

  // R: три дрона-охотника летают вокруг и стреляют по врагам 15 секунд.
  _drones() {
    const { game } = this;
    const p = game.player;
    if (!this.drones.length) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false });
      const geo = new THREE.OctahedronGeometry(0.2);
      for (let i = 0; i < 3; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        game.scene.add(mesh);
        this.drones.push({ mesh, fire: 0, ang: (i / 3) * Math.PI * 2 });
      }
    }
    this.droneUntil = this.time + 15;
    for (const d of this.drones) {
      d.mesh.visible = true;
      d.mesh.position.set(p.position.x, p.visualY + 2, p.position.z);
      game.vfx.orb(d.mesh.position, 'plasma', 1.6, 0.35);
    }
    game.effects.ring(p.position, 4, 0x9fe6ff);
    game.audio.zap?.(p.position);
    game.hud.say(p, 'Дроны, в бой!', 1.4);
    return true;
  }

  _hideDrones() {
    this.droneUntil = 0;
    for (const d of this.drones) d.mesh.visible = false;
  }

  _updateDrones(dt) {
    const { game } = this;
    const p = game.player;
    if (!this.drones.length || !this.drones[0].mesh.visible) return;
    if (this.time > this.droneUntil || p.isDead || this.mode !== 'ironman') {
      this._hideDrones();
      return;
    }
    const foes = this.enemies(45, 3);
    this.drones.forEach((d, i) => {
      d.ang += dt * (1.8 + i * 0.3);
      const target = foes[i % (foes.length || 1)];
      // Дрон кружит рядом с игроком (если есть цель — чуть смещается к ней).
      const r = 2.4 + i * 0.5;
      let x = p.position.x + Math.cos(d.ang) * r, z = p.position.z + Math.sin(d.ang) * r;
      const y = p.visualY + 2.1 + Math.sin(this.time * 3 + i) * 0.35;
      if (target) {
        x += (target.position.x - p.position.x) * 0.12;
        z += (target.position.z - p.position.z) * 0.12;
      }
      d.mesh.position.x += (x - d.mesh.position.x) * Math.min(1, dt * 8);
      d.mesh.position.y += (y - d.mesh.position.y) * Math.min(1, dt * 8);
      d.mesh.position.z += (z - d.mesh.position.z) * Math.min(1, dt * 8);
      d.mesh.rotation.y += dt * 6;
      d.fire -= dt;
      if (target && d.fire <= 0) {
        d.fire = 0.7 + Math.random() * 0.3;
        _o.set(target.position.x, (target.visualY ?? target.position.y) + 1.1, target.position.z);
        game.vfx.bolt(d.mesh.position, _o, 'plasma', { life: 0.14, width: 0.1, jag: 0.25, segs: 4 });
        const l = Math.hypot(_o.x - d.mesh.position.x, _o.z - d.mesh.position.z) || 1;
        target.takeDamage(16, p, (_o.x - d.mesh.position.x) / l, (_o.z - d.mesh.position.z) / l, 'bullet', { zone: 'torso', point: _o.clone(), dir: _d.clone().set(0, 0, 1), impulse: 3 });
        game.effects.burst(_o, UP, 'energy', 4);
      }
    });
  }

  // G: ЭМИ-купол — оглушает всех рядом, сбивает с ног, на 6 секунд включает щит костюма.
  _emp() {
    const { game } = this;
    const p = game.player;
    const c = _o.copy(p.position).setY(p.position.y + 1);
    game.vfx.dome(c, 15, 'plasma', 0.8, 0.4);
    game.vfx.dome(c, 9, 'white', 0.5, 0.25);
    game.effects.ring(p.position, 15, 0x7fd8ff);
    for (const n of game.npcs.list) {
      if (n.removed || n.isDead || n.vehicle || n === p || n.follower) continue;
      const d = n.position.distanceTo(p.position);
      if (d > 15) continue;
      const dx = (n.position.x - p.position.x) / (d || 1), dz = (n.position.z - p.position.z) / (d || 1);
      n.knockDown(dx * 5, dz * 5, 2.4, p, 'emp', true);
      n.panic = 6;
      if (d < 12 && this.time % 1 < 0.9) game.vfx.bolt(c, _t.set(n.position.x, n.position.y + 1.1, n.position.z), 'plasma', { life: 0.2, width: 0.12, jag: 0.5, segs: 6 });
    }
    for (const v of game.vehicles) {
      if (v === p.vehicle || v.carried || v.removed || v.distanceToPoint(p.position.x, p.position.z) > 15) continue;
      v.velocity.multiplyScalar(0.2); // электроника «села» — машины встали
    }
    this.shieldUntil = this.time + 6;
    this.shieldMul = 0.2;
    game.vfx.shield(p, 'plasma', 1.9, 6);
    game.audio.zap?.(p.position);
    game.cameraRig.addShake?.(0.3);
    game.hud.say(p, 'ЭМИ-импульс! Щит включён', 1.6);
    return true;
  }

  // --- ТИТАН -----------------------------------------------------------------------

  _titanAttack() {
    const { game } = this;
    const p = game.player;
    if (this.cooldown > 0 || !p.grounded) return true;
    const target = findTargetInFront(game, p, 4, -0.2, false);
    if (target) p.heading = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    p.melee.cancel();
    p.melee.start();
    p.combatTimer = 2;
    this.smashIn = 0.14;
    this.cooldown = 0.36;
    this.comboTimer = 1.4;
    this.combo++;
    return true;
  }

  _titanHit() {
    const { game } = this;
    const p = game.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const center = _o.set(p.position.x + fx * 1.9, p.position.y + 1, p.position.z + fz * 1.9);
    game.chaos.blast(center, 2.4, 52, 11, p, { dirX: fx, dirZ: fz, ignore: p, kind: 'punch' });
    game.world.breakTrees(center.x, center.z, 1.6, fx, fz);
    game.effects.burst(center, { x: fx, y: 0.4, z: fz }, 'energy', 6);
    game.audio.punch(p.position);
    game.cameraRig.addShake?.(0.18);
    if (this.combo >= 3) {
      // Третий удар подряд — энергетическая волна вперёд.
      this.combo = 0;
      const front = _t.set(p.position.x + fx * 4.5, p.position.y + 0.8, p.position.z + fz * 4.5);
      game.vfx.explosion(front, { theme: 'plasma', aoe: 3.6, damage: 34, force: 11, owner: p, only: this._notAlly });
      game.vfx.bolt(_d.set(p.position.x, p.position.y + 1.2, p.position.z), _f.set(p.position.x + fx * 9, p.position.y + 1.2, p.position.z + fz * 9), 'plasma', { life: 0.2, width: 0.3, jag: 0.4 });
    }
    game.worklife?.watch(p.position, 28, 12);
  }

  // Q: рывок вперёд, сбивая всё на пути.
  _dash() {
    const { game } = this;
    const p = game.player;
    const target = findTargetInFront(game, p, 22, 0.3, false);
    if (target) p.heading = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    this.dashDir.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    this.dashT = 0.34;
    this.dashHit = 0;
    game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1), 2.6, 'plasma', 0.3, 0.3);
    game.audio.zap?.(p.position);
    return true;
  }

  // R: энергошар — крупный заряд с взрывом в точке попадания.
  _orb() {
    const { game } = this;
    const p = game.player;
    const hand = this._aim();
    const dir = this._aimDir;
    p.heading = Math.atan2(dir.x, dir.z);
    p.shootTimer = 1;
    p.melee.cancel();
    p.melee.start();
    game.vfx.orb(hand, 'plasma', 2.4, 0.3, { grow: 1 });
    this._later(0.18, () => {
      if (p.isDead || this.mode !== 'titan') return;
      const from = p.model.muzzleWorld(_o).clone();
      game.vfx.projectile(from, dir.clone(), {
        speed: 38, theme: 'plasma', aoe: 4.6, damage: 85, force: 14, owner: p, ignore: p, life: 3, radius: 0.8, only: this._notAlly,
      });
      game.audio.zap?.(from);
    });
    game.worklife?.watch(p.position, 35, 12);
    return true;
  }

  // G: притяжение — врагов и предметы втягивает в точку перед игроком и бьёт.
  _pull() {
    const { game } = this;
    const p = game.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const point = new THREE.Vector3(p.position.x + fx * 5, p.position.y + 1, p.position.z + fz * 5);
    game.vfx.dome(point, 12, 'violet', 0.55, 0.35);
    game.effects.ring(point, 12, 0xc77dff);
    for (const n of game.npcs.list) {
      if (n.removed || n.isDead || n.vehicle || n.follower) continue;
      const d = Math.hypot(n.position.x - point.x, n.position.z - point.z);
      if (d > 14) continue;
      const k = Math.min(1, d / 5);
      n.knockDown(-(n.position.x - point.x) / (d || 1) * (6 + d) * k, -(n.position.z - point.z) / (d || 1) * (6 + d) * k, 3.5, p, 'pull', true);
    }
    for (const v of game.vehicles) {
      if (v === p.vehicle || v.carried || v.removed) continue;
      const d = v.distanceToPoint(point.x, point.z);
      if (d > 14) continue;
      v.launch((point.x - v.position.x) * 0.9, 4, (point.z - v.position.z) * 0.9, 0);
    }
    game.audio.zap?.(point);
    this._later(0.55, () => {
      if (p.isDead) return;
      game.vfx.explosion(point, { theme: 'violet', aoe: 5.2, damage: 48, force: 11, owner: p, only: this._notAlly });
    });
    game.worklife?.watch(point, 35, 12);
    return true;
  }

  // --- БОСС БАНДЫ -------------------------------------------------------------------

  // Q: позвать до 4 элитных бойцов через портал. Всего в свите не больше ELITE_CAP.
  _summon() {
    const { game } = this;
    const p = game.player;
    const room = ELITE_CAP - this.elites.length - (this.pendingElites ?? 0);
    if (room <= 0) {
      game.hud.toast(`Свита в сборе (${this.elites.length}/${ELITE_CAP})`, 1.5);
      this.cds.gadgetA = 0.5;
      return false;
    }
    const n = Math.min(4, room);
    this.pendingElites = (this.pendingElites ?? 0) + n;
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const spot = this._eliteSpot(base + (i / n) * Math.PI * 2, i);
      const theme = (this.elites.length + i) % 2 ? 'violet' : 'gold';
      game.vfx.portal(_t.set(spot.x, spot.y, spot.z), theme, 1.1 + i * 0.12, () => {
        this.pendingElites = Math.max(0, (this.pendingElites ?? 1) - 1);
        if (this.mode === 'boss' && !p.isDead) this._spawnElite(spot, theme);
      });
    }
    game.hud.say(p, 'Ко мне, парни!', 1.6);
    game.worklife?.watch(p.position, 30, 10);
    return true;
  }

  _eliteSpot(angle, i) {
    const { game } = this;
    const p = game.player;
    for (let k = 0; k < 8; k++) {
      const r = 4.5 + (i % 2) * 1.8 + k * 0.7;
      const x = p.position.x + Math.cos(angle + k * 0.5) * r, z = p.position.z + Math.sin(angle + k * 0.5) * r;
      if (game.world.isCircleFree(x, z, 0.6)) return { x, y: game.world.getGroundHeight(x, z), z };
    }
    return { x: p.position.x, y: p.position.y, z: p.position.z };
  }

  _spawnElite(spot, theme) {
    const { game } = this;
    const squad = game.squad;
    const look = eliteLook(game.rng);
    const npc = new NPC(game, game.rng, { x: spot.x, z: spot.z, role: 'gang', gang: squad.home?.id ?? null, look, weapon: 'pistol' });
    npc.elite = true;
    npc.maxHealth = 170;
    npc.health = 170;
    npc.bravery = 1;
    npc.hitResist = 5;
    game.npcs.add(npc);
    this.elites.push(npc);
    squad.addElite(npc);
    npc.say(game.rng.pick(['К вашим услугам, босс.', 'Приказывайте.', 'Босс, мы тут.', 'Кого убрать?']), true);
    game.vfx.aura(npc, theme, 1.4, 40);
    game.vfx.orb(_o.set(spot.x, spot.y + 1, spot.z), theme, 3, 0.4);
    game.effects.ring(_o.set(spot.x, spot.y, spot.z), 3.5, theme === 'gold' ? 0xffd45a : 0xc77dff);
  }

  // Боец исчезает в золотом свечении (отпущен, отстал, режим сменился).
  retire(npc, silent = false) {
    const { game } = this;
    const i = this.elites.indexOf(npc);
    if (i >= 0) this.elites.splice(i, 1);
    const sq = game.squad.members.indexOf(npc);
    if (sq >= 0) game.squad.members.splice(sq, 1);
    if (npc.removed) return;
    npc.follower = false;
    npc.leader = null;
    if (!silent && !npc.isDead && npc.model.root.visible) {
      _o.set(npc.position.x, npc.position.y + 1, npc.position.z);
      game.vfx.orb(_o, 'gold', 2.6, 0.4);
      game.effects.burst(_o, UP, 'gold', 14);
      game.effects.ring(npc.position, 2.5, 0xffd45a);
    }
    game.npcs.remove(npc);
  }

  retireAll() {
    for (const n of [...this.elites]) this.retire(n);
    this.elites.length = 0;
  }

  // R: молнии по цели. Цель — враг под прицелом (иначе точка прицела); свита стреляет туда же.
  _strike() {
    const { game } = this;
    const p = game.player;
    this._aim(120);
    let point = this._aimEnd.clone();
    const foe = this.enemies(60, 1)[0];
    let focus = null;
    game.cameraRig.forward(_f);
    const ray = raycastAll(game, _d.copy(game.camera.position).addScaledVector(_f, game.cameraRig.distance), _f, 120, p);
    if (ray?.kind === 'character' && ray.character !== p) focus = ray.character;
    else if (foe) focus = foe;
    if (focus) point.set(focus.position.x, focus.position.y, focus.position.z);
    if (focus) game.squad._setFocus(focus, 9);
    game.vfx.portal(point, 'gold', 0.9, null, 6);
    game.effects.ring(point, 7, 0xffd45a);
    const strikes = 6;
    for (let i = 0; i < strikes; i++) {
      this._later(0.5 + i * 0.13, () => {
        if (p.isDead) return;
        const a = (i / strikes) * Math.PI * 2 + this.time;
        const r = i === 0 ? 0 : 2 + Math.random() * 3.5;
        const hit = new THREE.Vector3(point.x + Math.cos(a) * r, point.y, point.z + Math.sin(a) * r);
        const sky = new THREE.Vector3(hit.x + (Math.random() - 0.5) * 6, hit.y + 38, hit.z + (Math.random() - 0.5) * 6);
        game.vfx.bolt(sky, hit, i % 2 ? 'violet' : 'gold', { life: 0.32, width: 0.45, jag: 1.5, segs: 12 });
        game.vfx.explosion(hit, { theme: i % 2 ? 'violet' : 'gold', aoe: 3.3, damage: 52, force: 10, owner: p, only: this._notAlly });
        game.vfx.chunks(hit, 3, ROCK, 5, 0.18);
      });
    }
    game.hud.say(p, 'Огонь на поражение!', 1.6);
    game.worklife?.watch(point, 40, 14);
    return true;
  }

  // G: золотой купол — на 6 секунд босс и вся свита под защитой.
  _dome() {
    const { game } = this;
    const p = game.player;
    const c = _o.copy(p.position).setY(p.position.y + 1);
    game.vfx.dome(c, 10, 'gold', 0.9, 0.38);
    game.effects.ring(p.position, 10, 0xffd45a);
    this.shieldUntil = this.time + 7;
    this.shieldMul = 0.2;
    game.vfx.shield(p, 'gold', 1.9, 7);
    let shielded = 0;
    for (const e of this.elites) {
      e.shieldUntil = this.time + 7;
      e.health = Math.min(e.maxHealth, e.health + 40);
      if (shielded < 3 && !e.isDead) {
        game.vfx.shield(e, 'gold', 1.7, 7);
        shielded++;
      }
      game.vfx.pillar(e.position, 'gold', 14, 0.6, 0.8);
    }
    game.vfx.pillar(p.position, 'gold', 24, 1, 1);
    game.audio.zap?.(p.position);
    game.hud.say(p, 'Никто не пройдёт!', 1.6);
    return true;
  }

  // --- СИЛА и машины -----------------------------------------------------------------

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
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] -= dt;
    if (this.comboTimer > 0 && (this.comboTimer -= dt) <= 0) this.combo = 0;
    if (this.smashIn > 0 && (this.smashIn -= dt) <= 0) {
      if (this.mode === 'titan') this._titanHit();
      else this._smash();
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.time >= this.queue[i].t) {
        const [{ fn }] = this.queue.splice(i, 1);
        fn();
      }
    }

    // Способности: Q / R / G.
    if (this.mode !== 'normal' && !p.isDead && !p.vehicle && !game.downState) {
      for (const g of GADGETS[this.mode]) {
        if (!game.input.wasPressed(g.action) || (this.cds[g.action] ?? 0) > 0) continue;
        if (this[g.use]() !== false) this.cds[g.action] = g.cd;
      }
    }

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

    if (this.mode === 'hulk' && !p.vehicle && !p.isDead) this._hulkRun();
    if (this.mode === 'ironman') {
      this._updateDrones(dt);
      if (!p.vehicle) {
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
    if (this.mode === 'titan') this._updateTitan(dt);
    if (this.mode === 'boss') this._updateBoss(dt);
  }

  // На бегу СИЛА валит деревья и фонари, сносит скамейки (chaos.js), вминает машины.
  _hulkRun() {
    const { game } = this;
    const p = game.player;
    if (p.horizontalSpeed < 3.5) return;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const x = p.position.x + fx * 1.4, z = p.position.z + fz * 1.4;
    if (game.world.breakTrees(x, z, 1.5, fx, fz)) {
      game.effects.burst(_o.set(x, p.position.y + 1.5, z), UP, 'leaf', 12);
      game.cameraRig.addShake?.(0.15);
    }
    for (const l of game.chaos._lampsNear(x, z, 1.8)) {
      game.chaos.breakLamp(l, fx, fz);
      game.cameraRig.addShake?.(0.18);
    }
  }

  _updateTitan(dt) {
    const { game } = this;
    const p = game.player;
    // Планирование: пока держишь Space в воздухе — падает медленно.
    this.gliding = !p.grounded && !p.vehicle && p.velocity.y < -2.5 && game.input.isDown('jump');
    if (this.gliding) {
      p.velocity.y += (-3.2 - p.velocity.y) * Math.min(1, dt * 6);
      this.thrustTimer -= dt;
      if (this.thrustTimer <= 0) {
        this.thrustTimer = 0.08;
        _o.set(p.position.x, p.visualY + 0.2, p.position.z);
        game.effects.burst(_o, { x: 0, y: -0.6, z: 0 }, 'energy', 1);
      }
    }
    // Рывок.
    if (this.dashT > 0) {
      this.dashT -= dt;
      p.velocity.x = this.dashDir.x * 34;
      p.velocity.z = this.dashDir.z * 34;
      p.heading = Math.atan2(this.dashDir.x, this.dashDir.z);
      this.dashHit -= dt;
      _o.set(p.position.x, p.position.y + 1, p.position.z);
      game.effects.puff('plasma', _o, { x: -this.dashDir.x * 2, y: 0.3, z: -this.dashDir.z * 2 }, 0.9);
      if (this.dashHit <= 0) {
        this.dashHit = 0.07;
        _t.set(p.position.x + this.dashDir.x * 1.6, p.position.y + 1, p.position.z + this.dashDir.z * 1.6);
        game.chaos.blast(_t, 2.2, 40, 11, p, { dirX: this.dashDir.x, dirZ: this.dashDir.z, ignore: p, kind: 'punch' });
        game.world.breakTrees(_t.x, _t.z, 1.6, this.dashDir.x, this.dashDir.z);
      }
      if (this.dashT <= 0) {
        game.vfx.dome(_o, 2.8, 'plasma', 0.25, 0.25);
        game.cameraRig.addShake?.(0.25);
      }
    }
  }

  _updateBoss(dt) {
    const { game } = this;
    const p = game.player;
    // Золотая дымка вокруг босса.
    this.auraTimer -= dt;
    if (this.auraTimer <= 0 && !p.vehicle && !p.isDead) {
      this.auraTimer = 0.18;
      const a = Math.random() * Math.PI * 2;
      _o.set(p.position.x + Math.cos(a) * 0.7, p.visualY + 0.2 + Math.random() * 1.4, p.position.z + Math.sin(a) * 0.7);
      game.effects.puff('gold', _o, { x: 0, y: 0.8, z: 0 }, 0.4);
    }
    // Погибших бойцов из свиты вычёркиваем (тела остаются лежать).
    for (let i = this.elites.length - 1; i >= 0; i--) {
      const e = this.elites[i];
      if (e.removed || e.isDead) this.elites.splice(i, 1);
    }
  }

  // Полёт Умного костюма: вертикальная скорость по кнопкам, без гравитации.
  flyVertical(dt, input, velocity) {
    const up = input.isDown('jump'), down = input.isDown('descend');
    const want = up ? 11 : down ? -13 : 0;
    velocity.y += (want - velocity.y) * Math.min(1, dt * 4);
  }
}
