import * as THREE from 'three';
import { NPC } from './npc.js';
import { DEFS } from './bosses.js';
import { raycastAll } from './ballistics.js';
import { findTargetInFront } from './combat.js';

// Остальные режимы силы (подмешиваются в PowerSystem из powers.js через installMore):
//
//   ХРОНОС      — время. F — хроно-удар (враги замедляются), Q — замедление времени (мир ×0.25),
//                 R — перемотка: игрок возвращается на 4 секунды назад (позиция и здоровье),
//                 G — остановка времени на 3 секунды: мир замирает, удары накапливаются и догоняют цель.
//   ТЕНЬ        — F — клинки, Q — шаг сквозь тень (телепорт с уроном по пути), R — три теневых двойника,
//                 G — теневая клетка: внутри враги медленные, их тянет к центру и жжёт, потом схлопывается.
//   ГРАВИТАЦИЯ  — F — толчок, Q — телекинез (поднять всё вокруг и швырнуть), R — чёрная дыра, G — левитация.
//   ФРОСТ       — F — ледяные осколки (замораживают в глыбу, потом она разлетается), Q — ледяная дорожка
//                 (скорость ×1.9, всё на пути замерзает), R — ледяной взрыв вокруг, G — ледяные шипы вперёд.
//   ДУЭЛЬ (duel_villain / duel_hero) — режимы игрока за злодея или героя в дуэли (duel.js): F — молния,
//                 Q — прыжок-удар, R — таран, G — ливень молний.
//
// Мир замедляется через game.timeScale (main.js), отдельные люди — через npc.timeScale (npc.js).

export const MORE_CYCLE = ['chronos', 'shadow', 'gravity', 'frost'];

export const MORE_MODES = {
  chronos: {
    name: 'ХРОНОС', color: '#f2c94c', walk: 1.15, run: 1.3, jump: 1.5, accel: 1.3, gravity: 1, damageTaken: 0.5, health: 260, scale: 1.1, unarmed: true,
    look: {
      skin: '#d6a57c', hair: '#cfd6dc', hairStyle: 'slick', beard: 'goatee', top: 'suit', shirt: '#103c47', shirt2: '#e0b84a', accent: '#e0b84a',
      bottom: 'slim', pants: '#0c2a33', trim: '#e0b84a', shoes: '#2a1c0e', shoeStyle: 'dress', glasses: 'round', glassColor: '#e0b84a',
      scarf: '#e0b84a', watch: '#e0b84a', scale: 1.1, bulk: 1.05,
    },
    hint: 'ХРОНОС: F — хроно-удар (замедляет), Q — замедление времени, R — перемотка на 4 с назад, G — остановка времени',
  },
  shadow: {
    name: 'ТЕНЬ', color: '#9b59ff', walk: 1.3, run: 1.55, jump: 2.2, accel: 1.6, gravity: 1, damageTaken: 0.6, health: 200, scale: 1.05, unarmed: true,
    look: {
      skin: '#cfa985', hair: '#0c0c10', hairStyle: 'short', top: 'hoodie', shirt: '#0c0c10', accent: '#8a3cff', bottom: 'slim', pants: '#0c0c10',
      trim: '#8a3cff', shoes: '#0c0c10', shoeStyle: 'boot', hat: '#0c0c10', hatStyle: 'hood', glasses: 'visor', glassColor: '#8a3cff', gloves: '#0c0c10', scale: 1.05,
    },
    hint: 'ТЕНЬ: F — клинки, Q — шаг сквозь тень, R — три двойника, G — теневая клетка',
  },
  gravity: {
    name: 'ГРАВИТАЦИЯ', color: '#a58bff', walk: 1.15, run: 1.35, jump: 2.0, accel: 1.3, gravity: 0.85, damageTaken: 0.55, health: 280, scale: 1.12, unarmed: true,
    look: {
      skin: '#e0b898', hair: '#c9b8ff', hairStyle: 'long', top: 'turtle', shirt: '#2a1a5e', accent: '#c9b8ff', bottom: 'slim', pants: '#1a1140',
      trim: '#c9b8ff', shoes: '#c9b8ff', shoeStyle: 'boot', gloves: '#c9b8ff', glasses: 'visor', glassColor: '#c9b8ff', scale: 1.12,
    },
    hint: 'ГРАВИТАЦИЯ: F — толчок, Q — поднять всё вокруг и швырнуть (F — швырнуть сразу), R — чёрная дыра, G — левитация',
  },
  frost: {
    name: 'ФРОСТ', color: '#8fe3ff', walk: 1.15, run: 1.35, jump: 1.6, accel: 1.2, gravity: 1, damageTaken: 0.6, health: 240, scale: 1.1, unarmed: true, auto: true,
    look: {
      skin: '#e8d2c0', hair: '#ffffff', hairStyle: 'long', top: 'puffer', shirt: '#bfe9ff', accent: '#ffffff', bottom: 'slim', pants: '#e8f6ff',
      trim: '#7fd0ff', shoes: '#7fd0ff', shoeStyle: 'boot', gloves: '#ffffff', glasses: 'visor', glassColor: '#9fe6ff', scale: 1.1,
    },
    hint: 'ФРОСТ: F — ледяные осколки (замораживают), Q — ледяная дорожка, R — ледяной взрыв, G — ледяные шипы',
  },
  duel_villain: {
    name: 'ЗЛОДЕЙ', color: DEFS.villain.color, walk: 1.15, run: 1.3, jump: 1.6, accel: 1.3, gravity: 1, damageTaken: 0.9, health: 900, scale: 1.4, unarmed: true, noKnock: true, auto: true,
    look: { ...DEFS.villain.look, scale: 1.4 },
    hint: 'ДУЭЛЬ ЗА ЗЛОДЕЯ: убей любого прохожего — и прилетит Герой. F — молния, Q — прыжок-удар, R — таран, G — ливень молний',
  },
  duel_hero: {
    name: 'ГЕРОЙ', color: DEFS.hero.color, walk: 1.15, run: 1.3, jump: 1.6, accel: 1.3, gravity: 1, damageTaken: 0.9, health: 900, scale: 1.4, unarmed: true, noKnock: true, auto: true,
    look: { ...DEFS.hero.look, scale: 1.4 },
    hint: 'ДУЭЛЬ ЗА ГЕРОЯ: скоро Злодей нападёт на город — встреть его. F — луч, Q — прыжок-удар, R — рывок, G — суд молний',
  },
};

export const MORE_GADGETS = {
  chronos: [
    { key: 'Q', action: 'gadgetA', name: 'Замедление', cd: 14, use: '_slowTime' },
    { key: 'R', action: 'gadgetB', name: 'Перемотка', cd: 12, use: '_rewind' },
    { key: 'G', action: 'gadgetC', name: 'Стоп-время', cd: 22, use: '_stopTime' },
  ],
  shadow: [
    { key: 'Q', action: 'gadgetA', name: 'Шаг в тень', cd: 2.5, use: '_blink' },
    { key: 'R', action: 'gadgetB', name: 'Двойники', cd: 14, use: '_clones' },
    { key: 'G', action: 'gadgetC', name: 'Клетка', cd: 15, use: '_cage' },
  ],
  gravity: [
    { key: 'Q', action: 'gadgetA', name: 'Телекинез', cd: 7, use: '_lift' },
    { key: 'R', action: 'gadgetB', name: 'Чёрная дыра', cd: 14, use: '_hole' },
    { key: 'G', action: 'gadgetC', name: 'Левитация', cd: 14, use: '_levitate' },
  ],
  frost: [
    { key: 'Q', action: 'gadgetA', name: 'Ледяная дорожка', cd: 9, use: '_slide' },
    { key: 'R', action: 'gadgetB', name: 'Ледяной взрыв', cd: 10, use: '_nova' },
    { key: 'G', action: 'gadgetC', name: 'Шипы', cd: 9, use: '_spikes' },
  ],
  duel_villain: [
    { key: 'Q', action: 'gadgetA', name: 'Прыжок-удар', cd: 6, use: '_duelSlam' },
    { key: 'R', action: 'gadgetB', name: 'Таран', cd: 7, use: '_duelDash' },
    { key: 'G', action: 'gadgetC', name: 'Ливень молний', cd: 18, use: '_duelRain' },
  ],
  duel_hero: [
    { key: 'Q', action: 'gadgetA', name: 'Прыжок-удар', cd: 6, use: '_duelSlam' },
    { key: 'R', action: 'gadgetB', name: 'Рывок', cd: 7, use: '_duelDash' },
    { key: 'G', action: 'gadgetC', name: 'Суд молний', cd: 18, use: '_duelRain' },
  ],
};

const UP = new THREE.Vector3(0, 1, 0);
const ROCK = [0x8a8478, 0x6f6a60, 0x555048, 0xa09a8c];
const ICE = [0xcff1ff, 0x9fdcf5, 0xffffff, 0x7fcff0];
const _o = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3();

const isDuel = (mode) => mode === 'duel_villain' || mode === 'duel_hero';

// Методы PowerSystem (this — экземпляр).
const methods = {
  initMore() {
    this.history = [];        // ХРОНОС: позиция и здоровье каждые 0.2 с
    this.histT = 0;
    this.slowUntil = 0;
    this.stopUntil = 0;
    this.ownsTime = false;    // мир замедлен этим режимом (а не дуэлью)
    this.stopHits = new Map();
    this.levitateUntil = 0;
    this.slideUntil = 0;
    this.clones = [];
    this.cage = null;
    this.hole = null;
    this.lifted = [];
    this.liftUntil = 0;
    this.frozen = [];         // { n, until, mesh }
    this.slowed = new Set();  // NPC с временным замедлением
    this.iceMat = null;
    this.game.events.on('character:damaged', ({ target, attacker, amount }) => {
      // Остановка времени: удары копятся и догоняют цель, когда время пойдёт.
      if (this.stopUntil > 0 && attacker === this.game.player && target !== this.game.player) {
        this.stopHits.set(target, (this.stopHits.get(target) ?? 0) + amount);
      }
    });
  },

  // Сброс при смене режима, смерти и т.п.
  resetMore() {
    const { game } = this;
    if (this.ownsTime) game.timeScale = 1;
    this.ownsTime = false;
    this.slowUntil = 0;
    this.stopUntil = 0;
    this.stopHits.clear();
    this.levitateUntil = 0;
    this.slideUntil = 0;
    this.speedMul = 1;
    this.cage = null;
    this.hole = null;
    this._release(false);
    for (const f of [...this.frozen]) this._thaw(f, false);
    for (const n of this.slowed) n.timeScale = 1;
    this.slowed.clear();
    for (const c of [...this.clones]) this.retire(c.npc, false, 'violet');
    this.clones.length = 0;
    this.history.length = 0;
  },

  enterMore(mode) {
    if (mode === 'chronos') this.histT = 0;
  },

  moreAttack() {
    switch (this.mode) {
      case 'chronos': return this._timedMelee(0.12, 0.3);
      case 'shadow': return this._timedMelee(0.1, 0.25);
      case 'gravity': return this._gravPush();
      case 'frost': return this._frostShot();
      case 'duel_villain':
      case 'duel_hero': return this._duelBolt();
      default: return false;
    }
  },

  moreLand(vy) {
    if (isDuel(this.mode) && this.slamArmed && vy < -4) {
      this._duelLand();
      return true;
    }
    return false;
  },

  // Удар с задержкой: кулак должен дойти до цели; сам эффект — _chronoHit / _shadowHit (powers.js: MELEE_HITS).
  _timedMelee(delay, cd) {
    const { game } = this;
    const p = game.player;
    if (this.cooldown > 0 || !p.grounded) return true;
    const target = findTargetInFront(game, p, 4, -0.2, false);
    if (target) p.heading = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    p.melee.cancel();
    p.melee.start();
    p.combatTimer = 2;
    this.smashIn = delay;
    this.cooldown = cd;
    return true;
  },

  _front(dist, out = _t) {
    const p = this.game.player;
    return out.set(p.position.x + Math.sin(p.heading) * dist, p.position.y + 1, p.position.z + Math.cos(p.heading) * dist);
  },

  // Замедлить человека на secs секунд (factor — во сколько раз медленнее).
  slowNpc(n, factor, secs) {
    if (!n || n.isDead || n.removed || n.vehicle) return;
    n.timeScale = factor;
    n._slowUntil = this.time + secs;
    this.slowed.add(n);
  },

  // ---------------------------------------------------------------- ХРОНОС

  _chronoHit() {
    const { game } = this;
    const p = game.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const c = this._front(1.9, _t);
    game.chaos.blast(c, 2.4, 38, 9, p, { dirX: fx, dirZ: fz, ignore: p, kind: 'punch' });
    for (const n of game.npcs.list) {
      if (n.removed || n.isDead || n.follower || n.vehicle) continue;
      if (Math.hypot(n.position.x - c.x, n.position.z - c.z) < 3.4) this.slowNpc(n, 0.3, 3.5);
    }
    _d.set(p.position.x - fx * 0.4, p.position.y + 1.3, p.position.z - fz * 0.4);
    game.vfx.bolt(_d, _f.set(c.x + fx * 1.2, c.y, c.z + fz * 1.2), 'gold', { life: 0.16, width: 0.28, jag: 0.5, segs: 6 });
    game.effects.burst(c, { x: fx, y: 0.3, z: fz }, 'gold', 8);
    game.audio.punch(p.position);
    game.cameraRig.addShake?.(0.15);
  },

  // Q: мир замедляется в 4 раза на 5.5 секунд — игрок для всех остальных стремительный.
  _slowTime() {
    const { game } = this;
    const p = game.player;
    this.slowUntil = this.time + 5.5;
    this.stopUntil = 0;
    this.ownsTime = true;
    game.timeScale = 0.25;
    game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1), 14, 'gold', 0.8, 0.35);
    game.effects.ring(p.position, 14, 0xf2c94c);
    game.audio.zap?.(p.position);
    game.hud.say(p, 'Время течёт медленнее...', 1.8);
    return true;
  },

  // R: назад на 4 секунды — позиция, здоровье (и немного сверху).
  _rewind() {
    const { game } = this;
    const p = game.player;
    if (this.history.length < 4) return false;
    const e = this.history[Math.max(0, this.history.length - 21)];
    const from = _o.set(p.position.x, p.position.y + 1, p.position.z).clone();
    const to = _t.set(e.x, e.y + 1, e.z).clone();
    game.vfx.bolt(from, to, 'gold', { life: 0.4, width: 0.4, jag: 0.8, segs: 12 });
    for (let k = 0; k <= 8; k++) game.vfx.orb(_d.lerpVectors(from, to, k / 8), 'gold', 1.6, 0.25 + k * 0.03);
    game.vfx.dome(from, 4, 'gold', 0.5, 0.3);
    p.position.set(e.x, e.y, e.z);
    p.visualY = e.y;
    p.velocity.set(0, 0, 0);
    p.heading = e.heading;
    p.health = Math.min(p.maxHealth, Math.max(p.health, e.health) + p.maxHealth * 0.15);
    this.history.length = 0;
    game.vfx.dome(to, 4, 'gold', 0.5, 0.3);
    game.effects.ring(p.position, 5, 0xf2c94c);
    game.audio.zap?.(p.position);
    game.cameraRig.addShake?.(0.3);
    game.hud.say(p, 'Назад!', 1.2);
    return true;
  },

  // G: время остановлено на 3.4 секунды. Мир замер, а удары копятся и обрушиваются, когда время пойдёт.
  _stopTime() {
    const { game } = this;
    const p = game.player;
    this.stopUntil = this.time + 3.4;
    this.slowUntil = 0;
    this.ownsTime = true;
    this.stopHits.clear();
    game.timeScale = 0;
    game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1), 36, 'gold', 1.4, 0.4);
    game.vfx.pillar(p.position, 'gold', 30, 1, 1.2);
    game.effects.ring(p.position, 36, 0xf2c94c);
    game.audio.zap?.(p.position);
    game.cameraRig.addShake?.(0.35);
    game.hud.say(p, 'Время — стой.', 1.8);
    return true;
  },

  _endStop() {
    const { game } = this;
    const p = game.player;
    this.stopUntil = 0;
    let n = 0;
    for (const [t, sum] of this.stopHits) {
      if (t.isDead || t.removed || sum < 1) continue;
      const dx = t.position.x - p.position.x, dz = t.position.z - p.position.z, l = Math.hypot(dx, dz) || 1;
      game.vfx.orb(_o.set(t.position.x, t.position.y + 1.1, t.position.z), 'gold', 3, 0.35);
      t.takeDamage(sum * 0.9, p, dx / l, dz / l, 'blast');
      if (n++ < 10) game.vfx.bolt(_d.set(p.position.x, p.position.y + 1.3, p.position.z), _f.set(t.position.x, t.position.y + 1.1, t.position.z), 'gold', { life: 0.25, width: 0.3, jag: 0.6, segs: 8 });
    }
    this.stopHits.clear();
    game.cameraRig.addShake?.(0.4);
  },

  // ---------------------------------------------------------------- ТЕНЬ

  _shadowHit() {
    const { game } = this;
    const p = game.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const c = this._front(1.8, _t);
    game.chaos.blast(c, 2.2, 48, 8, p, { dirX: fx, dirZ: fz, ignore: p, kind: 'punch' });
    game.vfx.bolt(_d.set(c.x - fz * 1.3, c.y + 0.4, c.z + fx * 1.3), _f.set(c.x + fz * 1.3, c.y - 0.4, c.z - fx * 1.3), 'violet', { life: 0.14, width: 0.22, jag: 0.2, segs: 3 });
    game.effects.burst(c, { x: fx, y: 0.3, z: fz }, 'violet', 8);
    game.audio.punch(p.position);
  },

  // Q: шаг сквозь тень — до 15 м вперёд по взгляду камеры, всё на пути получает урон.
  _blink() {
    const { game } = this;
    const p = game.player;
    game.cameraRig.forward(_f);
    const l = Math.hypot(_f.x, _f.z) || 1;
    const dx = _f.x / l, dz = _f.z / l;
    let dist = 0;
    for (let d = 15; d >= 3; d -= 1) {
      if (game.world.isCircleFree(p.position.x + dx * d, p.position.z + dz * d, p.radius + 0.1)) { dist = d; break; }
    }
    if (!dist) return false;
    const from = new THREE.Vector3(p.position.x, p.position.y + 1, p.position.z);
    const x = p.position.x + dx * dist, z = p.position.z + dz * dist;
    const y = Math.max(game.world.getGroundHeight(x, z), p.grounded ? 0 : p.position.y);
    for (let t = 2; t < dist; t += 2.5) {
      game.chaos.blast(_t.set(p.position.x + dx * t, p.position.y + 1, p.position.z + dz * t), 2.2, 30, 7, p, { dirX: dx, dirZ: dz, ignore: p, only: this._notAlly });
    }
    game.vfx.dome(from, 2.6, 'violet', 0.4, 0.4);
    game.effects.burst(from, UP, 'violet', 14);
    p.position.set(x, y, z);
    p.visualY = y;
    p.heading = Math.atan2(dx, dz);
    const to = _t.set(x, y + 1, z);
    game.vfx.bolt(from, to, 'violet', { life: 0.3, width: 0.3, jag: 0.5, segs: 8 });
    for (let k = 1; k < 4; k++) game.vfx.orb(_d.lerpVectors(from, to, k / 4), 'violet', 1.8, 0.35 + k * 0.05);
    game.vfx.dome(to, 2.6, 'violet', 0.4, 0.4);
    game.effects.burst(to, UP, 'violet', 14);
    game.audio.zap?.(p.position);
    return true;
  },

  // R: три теневых двойника дерутся на твоей стороне 11 секунд.
  _clones() {
    const { game } = this;
    const p = game.player;
    for (const c of [...this.clones]) this.retire(c.npc, true);
    this.clones.length = 0;
    const look = { ...MORE_MODES.shadow.look };
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + p.heading;
      const x = p.position.x + Math.cos(a) * 2.4, z = p.position.z + Math.sin(a) * 2.4;
      const spot = game.world.isCircleFree(x, z, 0.5) ? { x, z } : { x: p.position.x, z: p.position.z };
      const npc = new NPC(game, game.rng, { x: spot.x, z: spot.z, role: 'gang', gang: game.squad.home?.id ?? null, look, weapon: null, name: 'Тень' });
      npc.elite = true;
      npc.clone = true;
      npc.maxHealth = npc.health = 90;
      npc.bravery = 1;
      npc.melee.damage = 30;
      npc.melee.cooldown = 0.28;
      game.npcs.add(npc);
      game.squad.addElite(npc);
      this.clones.push({ npc, until: this.time + 11 });
      game.vfx.orb(_o.set(spot.x, p.position.y + 1, spot.z), 'violet', 2.4, 0.35);
      game.effects.burst(_o, UP, 'violet', 12);
    }
    game.audio.zap?.(p.position);
    game.hud.say(p, 'Тени, за мной!', 1.5);
    return true;
  },

  // G: теневая клетка в точке прицела.
  _cage() {
    const { game } = this;
    const p = game.player;
    this._aim(34);
    const c = this._aimEnd;
    this.cage = { x: c.x, y: game.world.getGroundHeight(c.x, c.z), z: c.z, r: 7.5, until: this.time + 6.5, tick: 0, dmg: 0, ring: 0 };
    game.vfx.dome(_o.set(c.x, this.cage.y + 1, c.z), 7.5, 'violet', 1, 0.3);
    game.effects.ring(_o.set(c.x, this.cage.y, c.z), 8, 0x9b59ff);
    game.audio.zap?.(p.position);
    game.hud.say(p, 'Тьма, держи их!', 1.4);
    return true;
  },

  _updateCage(dt) {
    const { game } = this;
    const c = this.cage;
    const p = game.player;
    if (this.time > c.until) {
      game.vfx.explosion(_o.set(c.x, c.y + 0.8, c.z), { theme: 'violet', aoe: 6.5, damage: 45, force: 12, owner: p, only: this._notAlly });
      this.cage = null;
      return;
    }
    c.ring -= dt;
    if (c.ring <= 0) {
      c.ring = 0.9;
      game.vfx.dome(_o.set(c.x, c.y + 1, c.z), c.r, 'violet', 0.9, 0.2);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.time;
        game.vfx.pillar(_t.set(c.x + Math.cos(a) * c.r, c.y, c.z + Math.sin(a) * c.r), 'violet', 9, 0.45, 1);
      }
    }
    c.dmg -= dt;
    const hurt = c.dmg <= 0;
    if (hurt) c.dmg = 0.5;
    for (const n of game.npcs.list) {
      if (n.removed || n.isDead || n.follower || n.vehicle) continue;
      const dx = c.x - n.position.x, dz = c.z - n.position.z, d = Math.hypot(dx, dz);
      if (d > c.r) continue;
      this.slowNpc(n, 0.3, 0.4);
      if (d > 1.2) {
        n.position.x += (dx / d) * 1.4 * dt;
        n.position.z += (dz / d) * 1.4 * dt;
      }
      if (hurt) {
        n.takeDamage(10, p, -dx / (d || 1), -dz / (d || 1), 'blast');
        game.effects.puff('violet', _o.set(n.position.x, n.position.y + 1, n.position.z), { x: 0, y: 1.5, z: 0 }, 0.5);
      }
    }
  },

  // ---------------------------------------------------------------- ГРАВИТАЦИЯ

  // F: гравитационный толчок (или, если что-то поднято, — бросок).
  _gravPush() {
    const { game } = this;
    const p = game.player;
    if (this.lifted.length) {
      this._release(true);
      this.cooldown = 0.4;
      return true;
    }
    if (this.cooldown > 0) return true;
    this.cooldown = 0.55;
    this._aim(60);
    const dir = this._aimDir;
    const l = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / l, dz = dir.z / l;
    p.heading = Math.atan2(dx, dz);
    p.shootTimer = 1;
    p.melee.cancel();
    p.melee.start();
    const c = _t.set(p.position.x + dx * 4.4, p.position.y + 1.2, p.position.z + dz * 4.4);
    game.chaos.blast(c, 5.4, 28, 24, p, { dirX: dx, dirZ: dz, ignore: p, only: this._notAlly });
    game.vfx.dome(c, 5.4, 'violet', 0.35, 0.3);
    game.effects.ring(c, 7, 0xc9b8ff);
    game.effects.burst(c, { x: dx, y: 0.3, z: dz }, 'violet', 14);
    game.cameraRig.addShake?.(0.25);
    game.audio.slam?.(p.position, 0.6);
    return true;
  },

  // Q: поднять машины и людей вокруг; через 2.4 с (или по F) — швырнуть туда, куда смотришь.
  _lift() {
    const { game } = this;
    const p = game.player;
    this._release(false);
    game.cameraRig.forward(_f);
    const lf = Math.hypot(_f.x, _f.z) || 1;
    const fx = _f.x / lf, fz = _f.z / lf;
    const items = [];
    for (const v of game.vehicles) {
      if (v === p.vehicle || v.carried || v.removed) continue;
      const dx = v.position.x - p.position.x, dz = v.position.z - p.position.z, d = Math.hypot(dx, dz);
      if (d > 17 || (dx * fx + dz * fz) / (d || 1) < -0.3) continue;
      items.push({ kind: 'v', obj: v, d, base: v.position.y });
    }
    items.sort((a, b) => a.d - b.d);
    items.length = Math.min(items.length, 3);
    for (const n of game.npcs.list) {
      if (items.length >= 9) break;
      if (n.removed || n.isDead || n.follower || n.vehicle || n.boss) continue;
      const dx = n.position.x - p.position.x, dz = n.position.z - p.position.z, d = Math.hypot(dx, dz);
      if (d > 15 || d < 1.5) continue;
      items.push({ kind: 'n', obj: n, d, base: n.position.y });
    }
    if (!items.length) return false;
    for (const it of items) {
      if (it.kind === 'v') {
        it.obj.ai = null;
        it.obj.parked = false;
        for (const q of it.obj.passengers) q?.exitPassenger();
        const drv = it.obj.driver;
        if (drv && drv !== p) { drv.exitVehicle(); drv.panic = 8; }
        it.obj.carried = true;
      } else {
        it.obj.knockDown(0, 0, 0, p, 'lift', true);
        it.obj.panic = 8;
      }
      game.vfx.orb(_o.set(it.obj.position.x, it.obj.position.y + 1, it.obj.position.z), 'violet', 2, 0.3);
    }
    this.lifted = items;
    this.liftUntil = this.time + 2.4;
    game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1), 15, 'violet', 0.6, 0.25);
    game.effects.ring(p.position, 15, 0xc9b8ff);
    game.audio.zap?.(p.position);
    game.hud.say(p, 'Вверх!', 1.2);
    return true;
  },

  _updateLift(dt) {
    const { game } = this;
    const k = Math.min(1, dt * 4);
    for (const it of this.lifted) {
      const o = it.obj;
      if (o.removed || (it.kind === 'n' && o.isDead)) continue;
      if (it.kind === 'v') {
        o.carried = true;
        o.position.y += (it.base + 3.8 - o.position.y) * k;
        o.heading += dt * 0.7;
        o.velocity.set(0, 0, 0);
      } else {
        // Подъём скоростью, а не координатой: иначе NPC.update «приземлит» его у самой земли.
        o.knock.set(0, (it.base + 3 + Math.sin(this.time * 3 + it.d) * 0.25 - o.position.y) * 5, 0);
        o.airborne = true;
        o.cast = 0.2;
      }
    }
    if (this.time > this.liftUntil) this._release(true);
    else if (Math.random() < dt * 14 && this.lifted.length) {
      const it = this.lifted[(Math.random() * this.lifted.length) | 0];
      game.effects.puff('violet', _o.set(it.obj.position.x, it.obj.position.y + 0.5, it.obj.position.z), { x: 0, y: 1, z: 0 }, 0.6);
    }
  },

  // Бросить всё поднятое (hurl = true — швырнуть вперёд, иначе просто отпустить).
  _release(hurl) {
    const { game } = this;
    const p = game.player;
    if (!this.lifted.length) return;
    game.cameraRig.forward(_f);
    const l = Math.hypot(_f.x, _f.z) || 1;
    const dx = _f.x / l, dz = _f.z / l;
    for (const it of this.lifted) {
      const o = it.obj;
      if (o.removed) continue;
      if (it.kind === 'v') {
        o.carried = false;
        if (hurl) {
          o.launch(dx * 27 + (Math.random() - 0.5) * 5, 5, dz * 27 + (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 6);
          o.thrownBy = p;
        } else o.launch(0, 1, 0, 0);
      } else if (!o.isDead) {
        if (hurl) {
          o.knockDown(dx * 24, dz * 24, 6, p, 'hurl', true);
          this._later(0.7, () => { if (!o.isDead && !o.removed) o.takeDamage(45, p, dx, dz, 'blast'); });
        } else o.knockDown(0, 0, 0.2, p, 'lift', true);
      }
    }
    if (hurl) {
      game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1.2), 5, 'violet', 0.3, 0.3);
      game.cameraRig.addShake?.(0.35);
      game.audio.slam?.(p.position, 0.8);
    }
    this.lifted = [];
  },

  // R: чёрная дыра в точке прицела: всё втягивает, потом схлопывается.
  _hole() {
    const { game } = this;
    const p = game.player;
    this._aim(46);
    const c = this._aimEnd;
    this.hole = { x: c.x, y: Math.max(c.y, game.world.getGroundHeight(c.x, c.z)) + 1.5, z: c.z, until: this.time + 3.8, dmg: 0 };
    game.vfx.dome(_o.set(c.x, this.hole.y, c.z), 4, 'violet', 3.8, 0.3);
    game.effects.ring(_o.set(c.x, this.hole.y - 1, c.z), 15, 0xc9b8ff);
    game.audio.zap?.(p.position);
    game.hud.say(p, 'Сингулярность!', 1.4);
    return true;
  },

  _updateHole(dt) {
    const { game } = this;
    const h = this.hole;
    const p = game.player;
    if (this.time > h.until) {
      game.vfx.explosion(_o.set(h.x, h.y, h.z), { theme: 'violet', aoe: 7.5, damage: 85, force: 17, owner: p, only: this._notAlly, big: true });
      game.vfx.dome(_o, 9, 'white', 0.5, 0.35);
      this.hole = null;
      return;
    }
    // Спираль частиц внутрь и яркое ядро.
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 7;
      game.effects.puff('violet', _o.set(h.x + Math.cos(a) * r, h.y + (Math.random() - 0.5) * 3, h.z + Math.sin(a) * r), { x: -Math.cos(a) * 9 - Math.sin(a) * 6, y: 0, z: -Math.sin(a) * 9 + Math.cos(a) * 6 }, 0.6);
    }
    game.vfx.orb(_o.set(h.x, h.y, h.z), 'white', 2.4, 0.1, { grow: -0.2 });
    h.dmg -= dt;
    const hurt = h.dmg <= 0;
    if (hurt) h.dmg = 0.5;
    for (const n of game.npcs.list) {
      if (n.removed || n.isDead || n.follower || n.vehicle || n.boss) continue;
      const dx = h.x - n.position.x, dz = h.z - n.position.z, d = Math.hypot(dx, dz);
      if (d > 15 || d < 0.8) continue;
      if (!n.isDown && (n._holed ?? -9) < this.time - 5) { n._holed = this.time; n.knockDown(0, 0, 0.6, p, 'hole', true); n.panic = 5; }
      const pull = Math.min(d, (6 + (15 - d) * 0.8) * dt);
      n.position.x += (dx / d) * pull;
      n.position.z += (dz / d) * pull;
      if (hurt && d < 4.5) n.takeDamage(14, p, dx / d, dz / d, 'blast');
    }
    for (const v of game.vehicles) {
      if (v === p.vehicle || v.carried || v.removed) continue;
      const dx = h.x - v.position.x, dz = h.z - v.position.z, d = Math.hypot(dx, dz);
      if (d > 15 || d < 1) continue;
      v.velocity.x += (dx / d) * 26 * dt;
      v.velocity.z += (dz / d) * 26 * dt;
    }
  },

  _levitate() {
    const { game } = this;
    const p = game.player;
    this.levitateUntil = this.time + 9;
    game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1), 3, 'violet', 0.5, 0.3);
    game.effects.ring(p.position, 4, 0xc9b8ff);
    game.audio.powerUp?.('exo');
    game.hud.say(p, 'Вес — просто число.', 1.5);
    return true;
  },

  // ---------------------------------------------------------------- ФРОСТ

  _iceMaterial() {
    return (this.iceMat ??= new THREE.MeshStandardMaterial({
      color: 0xc8f1ff, emissive: 0x1d6c9a, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.58, flatShading: true, depthWrite: false,
    }));
  },

  // Заморозить человека в ледяную глыбу на secs секунд (потом глыба разлетается и бьёт).
  _freeze(n, secs) {
    const { game } = this;
    if (!n || n.isDead || n.removed || n.vehicle || n.follower) return;
    if (n.boss) { this.slowNpc(n, 0.4, secs * 0.6); return; }
    const old = this.frozen.find((f) => f.n === n);
    if (old) { old.until = Math.max(old.until, this.time + secs); return; }
    const s = n.model.look?.scale ?? 1;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), this._iceMaterial());
    mesh.scale.set(0.95 * s, 1.75 * s, 0.8 * s);
    mesh.position.set(n.position.x, n.position.y + 0.95 * s, n.position.z);
    mesh.rotation.y = Math.random() * 3;
    game.scene.add(mesh);
    n.timeScale = 0;
    n.panic = 0;
    this.frozen.push({ n, until: this.time + secs, mesh });
    game.effects.burst(_o.set(n.position.x, n.position.y + 1, n.position.z), UP, 'energy', 10);
  },

  _freezeArea(point, r, secs) {
    for (const n of this.game.npcs.list) {
      if (n.removed || n.isDead || n.follower || n.vehicle) continue;
      if (Math.hypot(n.position.x - point.x, n.position.z - point.z) < r && Math.abs(n.position.y - point.y) < r + 2) this._freeze(n, secs);
    }
  },

  // Глыба тает/разлетается: shatter — со взрывом осколков и уроном.
  _thaw(f, shatter) {
    const { game } = this;
    const i = this.frozen.indexOf(f);
    if (i >= 0) this.frozen.splice(i, 1);
    f.mesh.removeFromParent();
    f.mesh.geometry.dispose();
    const n = f.n;
    if (n.removed) return;
    if (n.timeScale === 0) n.timeScale = 1;
    if (shatter) {
      _o.set(n.position.x, n.position.y + 1, n.position.z);
      game.vfx.chunks(_o, 12, ICE, 6, 0.13);
      game.effects.burst(_o, UP, 'energy', 14);
      game.audio.slam?.(n.position, 0.3);
      if (!n.isDead) n.takeDamage(30, game.player, 0, 0, 'blast');
    }
  },

  _updateFrost() {
    for (const f of [...this.frozen]) {
      if (f.n.removed) { this._thaw(f, false); continue; }
      if (f.n.isDead || this.time > f.until) this._thaw(f, true);
    }
  },

  // F: ледяной осколок — быстрый снаряд, замораживает всех рядом с точкой попадания.
  _frostShot() {
    const { game } = this;
    const p = game.player;
    if (this.cooldown > 0) return true;
    this.cooldown = 0.28;
    const hand = this._aim(90);
    const dir = this._aimDir;
    p.heading = Math.atan2(dir.x, dir.z);
    p.shootTimer = 1;
    game.vfx.projectile(hand.clone(), dir.clone(), {
      speed: 62, theme: 'ice', kind: 'orb', radius: 0.45, aoe: 1.9, damage: 30, force: 6, owner: p, ignore: p, life: 2, only: this._notAlly,
      onHit: (pt) => this._freezeArea(pt, 2.4, 2.6),
    });
    game.effects.burst(hand, dir, 'energy', 4);
    game.audio.zap?.(hand);
    return true;
  },

  // Q: ледяная дорожка — 4.5 секунды скорость ×1.9, встречные замерзают.
  _slide() {
    const { game } = this;
    const p = game.player;
    this.slideUntil = this.time + 4.5;
    this.speedMul = 1.9;
    game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1), 3, 'ice', 0.4, 0.3);
    game.audio.powerUp?.('exo');
    return true;
  },

  // R: ледяной взрыв вокруг — все замерзают.
  _nova() {
    const { game } = this;
    const p = game.player;
    const c = _o.copy(p.position).setY(p.position.y + 1);
    this._freezeArea(c, 11, 4);
    game.chaos.blast(c, 11, 14, 5, p, { ignore: p, only: this._notAlly });
    game.vfx.dome(c, 11, 'ice', 0.7, 0.4);
    game.effects.ring(p.position, 11, 0xcfeeff);
    game.vfx.chunks(p.position, 14, ICE, 8, 0.14);
    game.cameraRig.addShake?.(0.4);
    game.audio.slam?.(p.position, 0.7);
    return true;
  },

  // G: ледяные шипы бегут вперёд на 16 м и замораживают всё на пути.
  _spikes() {
    const { game } = this;
    const p = game.player;
    game.cameraRig.forward(_f);
    const l = Math.hypot(_f.x, _f.z) || 1;
    const dx = _f.x / l, dz = _f.z / l;
    p.heading = Math.atan2(dx, dz);
    p.melee.cancel();
    p.melee.start();
    for (let i = 1; i <= 8; i++) {
      this._later(i * 0.07, () => {
        const x = p.position.x + dx * (1.5 + i * 2), z = p.position.z + dz * (1.5 + i * 2);
        const y = game.world.getGroundHeight(x, z);
        _t.set(x, y, z);
        game.vfx.pillar(_t, 'ice', 6.5, 0.75, 1.3);
        game.vfx.chunks(_t, 5, ICE, 5, 0.12);
        game.chaos.blast(_o.set(x, y + 1, z), 2.4, 38, 11, p, { dirX: dx, dirZ: dz, ignore: p, only: this._notAlly });
        this._freezeArea(_o, 2.4, 2.5);
      });
    }
    game.cameraRig.addShake?.(0.25);
    game.audio.slam?.(p.position, 0.6);
    return true;
  },

  // ---------------------------------------------------------------- ДУЭЛЬ (игрок за злодея или героя)

  _duelThemes() {
    return this.mode === 'duel_hero' ? ['gold', 'white'] : ['violet', 'fire'];
  },

  _duelBolt() {
    const { game } = this;
    const p = game.player;
    if (this.cooldown > 0) return true;
    this.cooldown = 0.5;
    const [T] = this._duelThemes();
    const hand = this._aim(70);
    const dir = this._aimDir;
    p.heading = Math.atan2(dir.x, dir.z);
    p.shootTimer = 1;
    const hit = raycastAll(game, hand, dir, 70, p);
    const end = hit ? hit.point : _d.copy(hand).addScaledVector(dir, 70);
    game.vfx.bolt(hand, end, T, { life: 0.26, width: 0.38, jag: 1, segs: 10 });
    game.vfx.orb(hand, T, 1.8, 0.2);
    if (hit?.kind === 'character') hit.character.takeDamage(32, p, dir.x, dir.z, 'blast');
    if (hit) game.vfx.explosion(end, { theme: T, aoe: 2.4, damage: 14, force: 6, owner: p, only: this._notAlly, sound: false });
    game.audio.zap?.(hand);
    game.cameraRig.addShake?.(0.1);
    return true;
  },

  _duelSlam() {
    const { game } = this;
    const p = game.player;
    const target = findTargetInFront(game, p, 26, 0.3, false);
    if (target) p.heading = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const reach = target ? Math.min(24, Math.hypot(target.position.x - p.position.x, target.position.z - p.position.z)) : 14;
    p.velocity.set(fx * (reach + 5), 19, fz * (reach + 5));
    p.grounded = false;
    this.slamArmed = true;
    game.effects.dustRing(p.position, 4);
    game.vfx.chunks(p.position, 6, ROCK, 6, 0.22);
    game.audio.slam?.(p.position, 0.7);
    return true;
  },

  _duelLand() {
    const { game } = this;
    const p = game.player;
    const [T] = this._duelThemes();
    game.vfx.explosion(_o.copy(p.position), { theme: T, aoe: 7.5, damage: 42, force: 17, owner: p, only: this._notAlly });
    game.vfx.dome(_o.set(p.position.x, p.position.y + 0.3, p.position.z), 8, T, 0.5, 0.35);
    this._crater(p.position, 6.5);
    game.vfx.chunks(p.position, 18, ROCK, 9, 0.28);
    game.effects.dustRing(p.position, 9);
    game.world.breakTrees(p.position.x, p.position.z, 6);
    game.cameraRig.addShake?.(0.6);
  },

  _duelDash() {
    const { game } = this;
    const p = game.player;
    const target = findTargetInFront(game, p, 30, 0.3, false);
    if (target) p.heading = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    this.dashDir.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    this.dashT = 0.5;
    this.dashHit = 0;
    this.dashTheme = this._duelThemes()[0];
    this.dashSpeed = 32;
    this.dashDamage = 36;
    game.vfx.dome(_o.copy(p.position).setY(p.position.y + 1), 3, this.dashTheme, 0.3, 0.3);
    game.audio.zap?.(p.position);
    return true;
  },

  // G: ливень молний по врагу (или по точке прицела) — шесть ударов с неба.
  _duelRain() {
    const { game } = this;
    const p = game.player;
    const [T, alt] = this._duelThemes();
    this._aim(70);
    const point = this._aimEnd.clone();
    const foe = game.duel?.opponentNpc();
    if (foe && !foe.isDead && Math.hypot(foe.position.x - point.x, foe.position.z - point.z) < 18) point.set(foe.position.x, foe.position.y, foe.position.z);
    point.y = game.world.getGroundHeight(point.x, point.z);
    game.vfx.portal(point, T, 0.9, null, 6);
    game.effects.ring(point, 7, T === 'gold' ? 0xffd45a : 0xc77dff);
    for (let i = 0; i < 6; i++) {
      this._later(0.5 + i * 0.14, () => {
        const a = i * 1.7, r = i === 0 ? 0 : 2 + Math.random() * 4;
        const hit = new THREE.Vector3(point.x + Math.cos(a) * r, point.y, point.z + Math.sin(a) * r);
        const sky = new THREE.Vector3(hit.x + (Math.random() - 0.5) * 8, hit.y + 40, hit.z + (Math.random() - 0.5) * 8);
        const th = i % 2 ? alt : T;
        game.vfx.bolt(sky, hit, th, { life: 0.34, width: 0.5, jag: 1.6, segs: 12 });
        game.vfx.explosion(hit, { theme: th, aoe: 3.4, damage: 40, force: 11, owner: p, only: this._notAlly });
      });
    }
    game.hud.say(p, T === 'gold' ? 'Правосудие!' : 'Склонись!', 1.5);
    return true;
  },

  // ---------------------------------------------------------------- каждый шаг

  updateMore(dt) {
    const { game } = this;
    const p = game.player;
    const mode = this.mode;

    // Игрок погиб — все эффекты времени и клетки снимаются.
    if (p.isDead && (this.ownsTime || this.stopUntil || this.slowUntil)) this.resetMore();

    // Замедленные люди оттаивают сами.
    if (this.slowed.size) {
      for (const n of this.slowed) {
        if (n.removed || this.time > (n._slowUntil ?? 0)) {
          if (!n.removed && !this.frozen.some((f) => f.n === n)) n.timeScale = 1;
          this.slowed.delete(n);
        }
      }
    }

    // ХРОНОС: история позиций, время мира.
    if (mode === 'chronos') {
      this.histT -= dt;
      if (this.histT <= 0 && !p.isDead && !p.vehicle) {
        this.histT = 0.2;
        this.history.push({ x: p.position.x, y: p.position.y, z: p.position.z, heading: p.heading, health: p.health });
        if (this.history.length > 30) this.history.shift();
      }
    }
    if (this.ownsTime) {
      if (this.stopUntil > 0) {
        game.timeScale = 0;
        if (this.time > this.stopUntil) {
          this._endStop();
          game.timeScale = 0.15;
        }
      } else if (this.slowUntil > 0) {
        game.timeScale = 0.25;
        if (this.time > this.slowUntil) this.slowUntil = 0;
      } else {
        game.timeScale = Math.min(1, game.timeScale + dt * 1.6);
        if (game.timeScale >= 1) this.ownsTime = false;
      }
    }

    if (this.cage) this._updateCage(dt);
    if (this.hole) this._updateHole(dt);
    if (this.lifted.length) this._updateLift(dt);
    if (this.frozen.length) this._updateFrost();

    // ГРАВИТАЦИЯ: левитация — как полёт костюма.
    if (this.levitating) {
      if (!p.vehicle) {
        this.flying = !p.grounded;
        this.thrustTimer -= dt;
        if (this.flying && this.thrustTimer <= 0) {
          this.thrustTimer = 0.07;
          game.effects.puff('violet', _o.set(p.position.x, p.visualY + 0.1, p.position.z), { x: 0, y: -0.8, z: 0 }, 0.5);
        }
      }
    } else if (mode === 'gravity' && this.levitateUntil > 0) {
      this.levitateUntil = 0;
      this.flying = false;
    }

    // ФРОСТ: ледяная дорожка.
    if (this.slideUntil > 0) {
      if (this.time > this.slideUntil || p.vehicle) {
        this.slideUntil = 0;
        this.speedMul = 1;
      } else {
        game.effects.puff('plasma', _o.set(p.position.x, p.position.y + 0.1, p.position.z), { x: -p.velocity.x * 0.1, y: 0.3, z: -p.velocity.z * 0.1 }, 0.8);
        this._slideT = (this._slideT ?? 0) - dt;
        if (this._slideT <= 0) {
          this._slideT = 0.1;
          this._freezeArea(p.position, 1.9, 3);
        }
      }
    }

    // ТЕНЬ: двойники исчезают через 11 секунд.
    if (this.clones.length) {
      for (let i = this.clones.length - 1; i >= 0; i--) {
        const c = this.clones[i];
        if (c.npc.removed || c.npc.isDead) this.clones.splice(i, 1);
        else if (this.time > c.until) {
          this.clones.splice(i, 1);
          this.retire(c.npc, false, 'violet');
        }
      }
    }
  },
};

const getters = {
  levitating() {
    return this.time < this.levitateUntil;
  },
};

export function installMore(PowerSystem) {
  for (const [k, f] of Object.entries(methods)) PowerSystem.prototype[k] = f;
  for (const [k, f] of Object.entries(getters)) Object.defineProperty(PowerSystem.prototype, k, { get: f });
}
