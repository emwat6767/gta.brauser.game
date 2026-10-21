import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NPC, NPC_STATE } from './npc.js';
import { gangLook } from './outfits.js';
import { lineOfSight } from './ballistics.js';

// Злодей и герой города. Оба — большие NPC с ролью 'boss': не сбиваются с ног, имеют много здоровья
// и набор способностей с «элитными» эффектами (vfx.js). Игрок может драться с любым.
//
//   Злодей (Damon Crowe, фиолетовый) живёт у Прайм-тауэра. Нападает на игрока, если тот ближе
//     AGGRO_VILLAIN; бьёт молнией, прыгает с ударом об землю, таранит, обрушивает фиолетовые молнии,
//     а когда ранен — вызывает через порталы подручных и закрывается щитом.
//   Герой (Jack Hunter, золотой) патрулирует Площадь Чемпионов. Игрока не трогает, пока тот не ударит
//     его (или пока у игрока 4+ звезды розыска рядом): тогда драка до конца. Бьёт лучом, прыжком,
//     рывком, золотым судом, лечится и ставит щит. Защищает город от подручных злодея.
//   Столкновение титанов: раз в несколько минут злодей идёт к герою, и они бьются прямо в городе;
//     вокруг собираются зрители (worklife.watch). Игрок может вмешаться на любой стороне.
//   Награда: за злодея — $25000 и репутация; убийство героя — $8000, но сразу 4 звезды розыска.
//   Убитые возвращаются через несколько минут (RESPAWN).
//
// Новая способность: запись в ABILITIES (условие, подготовка, действие) и id в DEFS[kind].abilities.

const AGGRO_VILLAIN = 42;
const RESPAWN = { villain: 330, hero: 270 };
export const DUEL_HP = 1100;           // здоровье соперника в дуэли
const DUEL_DAMAGE = 0.65;              // его урон по игроку в дуэли
const ACTIVE_DISTANCE = 230;     // дальше босс не думает (NPC и так «заморожен»)
const BAR_DISTANCE = 75;
const MAX_MINIONS = 8;
const UP = new THREE.Vector3(0, 1, 0);
const ROCK = [0x8a8478, 0x6f6a60, 0x555048, 0xa09a8c];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export const DEFS = {
  villain: {
    name: 'Damon Crowe', title: 'Злодей города', color: '#b44cff', theme: 'violet', health: 1500, home: 'tower',
    look: {
      skin: '#d6a57c', hair: '#141414', hairStyle: 'slick', beard: 'goatee', top: 'suit', shirt: '#1b0f2b', shirt2: '#7a1fb8', accent: '#b44cff',
      bottom: 'slim', pants: '#120a1c', trim: '#b44cff', shoes: '#0a0a0c', shoeStyle: 'boot', glasses: 'visor', glassColor: '#b44cff',
      scarf: '#7a1fb8', gloves: '#120a1c', tattoo: 3, scale: 1.5, bulk: 1.3,
    },
    abilities: ['bolt', 'slam', 'charge', 'rain', 'summon', 'shield'],
    lines: {
      aggro: ['Ты выбрал не тот город!', 'Преклонись, ничтожество!', 'Это МОЙ город!', 'Ты станешь уроком для всех!'],
      cast: ['Почувствуй мощь!', 'Тьма!', 'Получай!'],
      hurt: ['Больно... но не настолько!', 'Ты пожалеешь!'],
    },
  },
  hero: {
    name: 'Jack Hunter', title: 'Герой города', color: '#ffd24a', theme: 'gold', health: 1500, home: 'plaza',
    look: {
      skin: '#e0ac69', hair: '#6b4423', hairStyle: 'short', beard: 'stubble', top: 'track', shirt: '#f4f4f4', accent: '#c8202a',
      bottom: 'slim', pants: '#1d3f9e', trim: '#c8202a', shoes: '#c8202a', shoeStyle: 'boot', scarf: '#c8202a', gloves: '#d9b13b', scale: 1.5, bulk: 1.3,
    },
    abilities: ['bolt', 'slam', 'charge', 'rain', 'heal', 'shield'],
    lines: {
      aggro: ['Закон — это я!', 'Остановись, пока не поздно!', 'Город под защитой!', 'Ты зашёл слишком далеко!'],
      cast: ['Свет!', 'За город!', 'Правосудие!'],
      hurt: ['Я не сдамся!', 'Крепко бьёшь...'],
    },
  },
};

// range — на каком расстоянии до цели способность подходит; cond — дополнительное условие; wind — подготовка (с);
// fire(boss, target) — действие после подготовки. dmg — урон по цели в базовом варианте.
const ABILITIES = {
  bolt: {
    cd: 2.4, range: [4, 40], wind: 0.45, dmg: 24,
    fire(b, t) {
      const { game } = b.system;
      const T = b.def.theme;
      const from = b.chest(_a), to = b.targetPoint(t, _b);
      game.vfx.bolt(from, to, T, { life: 0.28, width: 0.4, jag: 1.1, segs: 11 });
      game.vfx.orb(from, T, 1.8, 0.2);
      b.hurt(t, this.dmg, 2.2, 6);
      game.vfx.explosion(to, { theme: T, aoe: 2.6, damage: b.d(14), force: 7, owner: b.npc, only: b.only, sound: false });
    },
  },
  slam: {
    cd: 9, range: [0, 18], wind: 0.7,
    fire(b, t) {
      b.leap(t);
    },
  },
  charge: {
    cd: 8, range: [8, 34], wind: 0.5,
    fire(b, t) {
      b.dash(t);
    },
  },
  rain: {
    cd: 17, range: [5, 46], wind: 0.9, cond: (b) => b.hp < 0.8,
    fire(b, t) {
      const { game } = b.system;
      const T = b.def.theme, alt = T === 'gold' ? 'white' : 'fire';
      const point = b.targetPoint(t, _c).clone();
      point.y = game.world.getGroundHeight(point.x, point.z);
      game.vfx.portal(point, T, 0.9, null, 6);
      for (let i = 0; i < 6; i++) {
        b.later(0.55 + i * 0.14, () => {
          if (b.npc.isDead) return;
          const a = i * 1.7, r = i === 0 ? 0 : 2 + Math.random() * 4;
          const hit = new THREE.Vector3(point.x + Math.cos(a) * r, point.y, point.z + Math.sin(a) * r);
          const sky = new THREE.Vector3(hit.x + (Math.random() - 0.5) * 8, hit.y + 40, hit.z + (Math.random() - 0.5) * 8);
          const th = i % 2 ? alt : T;
          game.vfx.bolt(sky, hit, th, { life: 0.34, width: 0.5, jag: 1.6, segs: 12 });
          game.vfx.explosion(hit, { theme: th, aoe: 3.4, damage: b.d(40), force: 11, owner: b.npc, only: b.only });
        });
      }
    },
  },
  summon: {
    cd: 26, range: [0, 60], wind: 1.0, cond: (b) => b.kind === 'villain' && !b.duel && b.hp < 0.82 && b.system.minions.length < MAX_MINIONS - 2,
    fire(b, t) {
      b.summon(t);
    },
  },
  shield: {
    cd: 22, range: [0, 80], wind: 0.5, cond: (b) => b.hp < 0.55 && b.time > b.shieldUntil + 6,
    fire(b) {
      const { game } = b.system;
      b.shieldUntil = b.time + 4.5;
      game.vfx.shield(b.npc, b.def.theme, 2.2, 4.5);
      game.vfx.dome(b.chest(_a), 7, b.def.theme, 0.8, 0.35);
      game.effects.ring(b.npc.position, 7, new THREE.Color(b.def.color).getHex());
    },
  },
  heal: {
    cd: 32, range: [0, 80], wind: 0.8, cond: (b) => b.hp < 0.42,
    fire(b) {
      const { game } = b.system;
      b.npc.health = Math.min(b.npc.maxHealth, b.npc.health + b.npc.maxHealth * 0.12);
      game.vfx.pillar(b.npc.position, 'gold', 26, 1.1, 1.1);
      game.vfx.aura(b.npc, 'gold', 1.6, 70);
      game.effects.ring(b.npc.position, 5, 0xffd45a);
    },
  },
};

class Boss {
  constructor(system, kind) {
    this.system = system;
    this.kind = kind;
    this.def = DEFS[kind];
    this.name = this.def.name;
    this.title = this.def.title;
    this.color = this.def.color;
    this.npc = null;
    this.time = 0;
    this.cds = {};
    this.wind = null;        // подготовка способности: { t, fn }
    this.queue = [];
    this.slam = null;
    this.charge = null;
    this.shieldUntil = 0;
    this.angryUntil = 0;     // герой: до какого момента зол на игрока
    this.respawnIn = 0;
    this.thinkTimer = 0;
    this.targetTimer = 0;
    this.auraTimer = 0;
    this.idleFor = 0;
    this.march = null;       // идёт на столкновение: узел графа
    this.suspended = false;  // игрок играет за него (дуэль): NPC убран из мира
    this.duel = false;       // дерётся с игроком в дуэли (duel.js)
    this.homeNodes = null;
    this.home = null;
    this.casts = 0;
  }

  get alive() {
    return !!this.npc && !this.npc.isDead && !this.npc.removed;
  }

  get hp() {
    return this.npc ? Math.max(0, this.npc.health / this.npc.maxHealth) : 0;
  }

  // Против игрока враждебен: злодей всегда, герой — пока зол.
  get hostile() {
    return this.kind === 'villain' || this.time < this.angryUntil;
  }

  get engaged() {
    return this.alive && !!this.npc.target && !this.npc.target.isDead;
  }

  // Способности не задевают самого босса и (у злодея) его подручных.
  only = (c) => c !== this.npc && (this.kind === 'hero' || !c.minion);

  chest(out) {
    const n = this.npc, s = n.model.look?.scale ?? 1;
    return out.set(n.position.x, (n.visualY ?? n.position.y) + 1.35 * s, n.position.z);
  }

  targetPoint(t, out) {
    return out.set(t.position.x, (t.visualY ?? t.position.y) + 1.1, t.position.z);
  }

  later(t, fn) {
    this.queue.push({ t: this.time + t, fn });
  }

  say(kind) {
    const lines = this.def.lines[kind];
    if (lines) this.npc.say(this.system.game.rng.pick(lines), true);
  }

  spawn(x, z) {
    const { game } = this.system;
    const D = this.def;
    const npc = new NPC(game, game.rng, { x, z, role: 'boss', look: D.look, weapon: null, name: D.name });
    npc.maxHealth = D.health;
    npc.health = D.health;
    npc.superArmor = true;
    npc.boss = this;
    npc.hitResist = 99;
    npc.bravery = 1;
    npc.aggression = 1;
    npc.walkSpeed = 2.2;
    npc.melee.range = 2.5;
    npc.allowedNodes = this.homeNodes;
    game.npcs.add(npc);
    this.npc = npc;
    this.cds = {};
    this.wind = null;
    this.slam = null;
    this.charge = null;
    this.queue.length = 0;
    this.march = null;
    this.shieldUntil = 0;
    this.angryUntil = 0;
    npc.prevNode = null;
    npc._setTarget(npc._nearestAllowedNode());
    return npc;
  }

  // Дамаж цели способностью. Игрок в машине: бьём машину.
  // Урон способностей: в дуэли слабее (игрок один против босса).
  d(x) {
    return this.duel ? x * DUEL_DAMAGE : x;
  }

  hurt(t, dmg, impulse = 0, knock = 0) {
    const { game } = this.system;
    dmg = this.d(dmg);
    const dx = t.position.x - this.npc.position.x, dz = t.position.z - this.npc.position.z;
    const l = Math.hypot(dx, dz) || 1;
    if (t.vehicle) {
      t.vehicle.damage?.(dmg * 2, this.npc);
      t.vehicle.launch?.(dx / l * knock * 2, knock * 0.5, dz / l * knock * 2, 2);
      return;
    }
    t.takeDamage(dmg, this.npc, dx / l, dz / l, 'blast');
    if (knock) t.knockDown?.(dx / l * knock, dz / l * knock, impulse, game.player === t ? 1.4 : this.npc, 'boss', true);
  }

  // Прыжок с ударом: взлетает к цели, на приземлении ударная волна.
  leap(t) {
    const { game } = this.system;
    const n = this.npc;
    const g = CONFIG.physics.gravity;
    const vy = 15, air = (2 * vy) / g;
    const dx = t.position.x - n.position.x, dz = t.position.z - n.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = Math.min(22, d / air);
    n.knock.set(dx / d * speed, vy, dz / d * speed);
    n.airborne = true;
    n.cast = air + 0.6;
    this.slam = { t: 0 };
    game.effects.dustRing(n.position, 4);
    game.vfx.chunks(n.position, 6, ROCK, 6, 0.22);
    game.audio.slam?.(n.position, 0.7);
  }

  land() {
    const { game } = this.system;
    const n = this.npc;
    const T = this.def.theme;
    this.slam = null;
    n.cast = 0.35;
    game.vfx.explosion(_a.copy(n.position), { theme: T, aoe: 7.5, damage: this.d(42), force: 17, owner: n, only: this.only });
    game.vfx.dome(_a.set(n.position.x, n.position.y + 0.3, n.position.z), 8, T, 0.5, 0.35);
    const g = game.world.getGroundHeight(n.position.x, n.position.z);
    if (g < 0.3) game.vfx.crater(_b.set(n.position.x, g, n.position.z), UP, 6.5);
    game.vfx.chunks(n.position, 18, ROCK, 9, 0.28);
    game.effects.dustRing(n.position, 9);
    game.world.breakTrees(n.position.x, n.position.z, 6);
    game.cameraRig.addShake?.(Math.max(0, 0.7 - n.position.distanceTo(game.player.position) * 0.012));
    game.worklife?.watch(n.position, 45, 18);
  }

  // Таран: бежит на цель сквозь всё, на контакте — удар по области.
  dash(t) {
    const { game } = this.system;
    const n = this.npc;
    const dx = t.position.x - n.position.x, dz = t.position.z - n.position.z;
    const d = Math.hypot(dx, dz) || 1;
    this.charge = { dx: dx / d, dz: dz / d, t: Math.min(0.9, d / 28 + 0.1), hit: 0 };
    n.cast = this.charge.t + 0.3;
    game.vfx.dome(this.chest(_a), 3, this.def.theme, 0.3, 0.3);
    game.audio.zap?.(n.position);
  }

  summon(target) {
    const { game } = this.system;
    const n = this.npc;
    const T = this.def.theme;
    const count = Math.min(4, MAX_MINIONS - this.system.minions.length);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      const x = n.position.x + Math.cos(a) * 5.5, z = n.position.z + Math.sin(a) * 5.5;
      if (!game.world.isCircleFree(x, z, 0.6)) continue;
      const spot = new THREE.Vector3(x, game.world.getGroundHeight(x, z), z);
      game.vfx.portal(spot, i % 2 ? 'gold' : T, 1.0 + i * 0.1, () => {
        if (this.npc?.isDead) return;
        this.system.spawnMinion(spot, target);
      });
    }
    game.vfx.dome(this.chest(_a), 9, T, 0.7, 0.3);
    this.say('cast');
  }

  // --- ИИ ---------------------------------------------------------------------------------

  // Выбор цели: игрок, другой босс или подручные врага.
  chooseTarget() {
    const duel = this.system.game.duel;
    if (duel?.active) return duel.targetFor(this);
    const { game } = this.system;
    const n = this.npc;
    const p = game.player;
    const other = this.system.other(this);
    const here = n.position;
    let best = null, bestD = Infinity;
    const consider = (c, d) => {
      if (!c || c.isDead || c.removed || d >= bestD) return;
      best = c;
      bestD = d;
    };
    const dp = Math.hypot(p.position.x - here.x, p.position.z - here.z);
    if (!p.isDead && !game.downState) {
      if (this.kind === 'villain' && dp < (n.target === p ? 70 : AGGRO_VILLAIN)) consider(p, dp);
      else if (this.kind === 'hero' && (this.hostile && dp < 70)) consider(p, dp);
      else if (this.kind === 'hero' && game.wanted.level >= 4 && dp < 60) consider(p, dp);
    }
    if (other?.alive) {
      const d = Math.hypot(other.npc.position.x - here.x, other.npc.position.z - here.z);
      if (d < 60) consider(other.npc, d - 6);   // босс важнее случайных целей
    }
    if (this.kind === 'hero') {
      for (const m of this.system.minions) {
        if (m.isDead || m.removed) continue;
        consider(m, Math.hypot(m.position.x - here.x, m.position.z - here.z) + 10);
      }
    }
    // Свита и отряд игрока, пока цель — игрок: добивать ближайших, если они мешают.
    return best;
  }

  engage(t) {
    const n = this.npc;
    if (n.target === t && n.state === NPC_STATE.FIGHT) return;
    n.target = t;
    n.panic = 0;
    n.partner = null;
    n.activity = null;
    n.dest = null;
    if (!n.isDown) n._enter(NPC_STATE.FIGHT);
    if (this.system.game.rng.chance(0.5)) this.say('aggro');
  }

  disengage() {
    const n = this.npc;
    n.target = null;
    if (this.march) return;
    n.allowedNodes = this.homeNodes;
    n.prevNode = null;
    n._setTarget(n._nearestAllowedNode());
    if (!n.isDown && n.state === NPC_STATE.FIGHT) n._enter(NPC_STATE.WALK);
  }

  pickAbility(t, d) {
    const choices = [];
    for (const id of this.def.abilities) {
      const A = ABILITIES[id];
      if ((this.cds[id] ?? 0) > 0) continue;
      if (d < A.range[0] || d > A.range[1]) continue;
      if (A.cond && !A.cond(this)) continue;
      choices.push(id);
    }
    if (!choices.length) return null;
    // Лечение, щит и вызов — приоритетнее; остальное — случайно.
    for (const id of ['heal', 'shield', 'summon']) if (choices.includes(id)) return id;
    return this.system.game.rng.pick(choices);
  }

  cast(id, t) {
    const A = ABILITIES[id];
    const n = this.npc;
    const { game } = this.system;
    this.cds[id] = A.cd * (0.85 + Math.random() * 0.3) * (this.duel ? 0.8 : 1);
    this.wind = { t: A.wind, id, target: t };
    n.cast = A.wind + 0.05;
    n.melee.cancel();
    n.heading = Math.atan2(t.position.x - n.position.x, t.position.z - n.position.z);
    // Подготовка: свечение вокруг босса и кольцо на земле.
    game.vfx.aura(n, this.def.theme, A.wind + 0.2, 60);
    game.effects.ring(n.position, 3.2, new THREE.Color(this.color).getHex());
    if (game.rng.chance(0.4)) this.say('cast');
    this.casts++;
    game.worklife?.watch(n.position, 40, 16);
  }

  filterDamage(amount, kind) {
    if (this.time < this.shieldUntil) return amount * 0.12;
    if (kind === 'punch') return amount * 0.7;
    return amount;
  }

  onAttacked(who) {
    const { game } = this.system;
    const p = game.player;
    const byPlayer = who === p || who?.follower === true || who?.driver === p;
    if (byPlayer) {
      if (this.kind === 'hero') this.angryUntil = this.time + 100;
      if (!this.npc.target && this.alive) this.engage(p);
    } else if (who?.boss && who.boss !== this && !this.npc.target && this.alive) {
      this.engage(who);
    }
    if (this.system.game.rng.chance(0.08)) this.say('hurt');
  }

  // Игрок играет за этого босса (дуэль): NPC уходит далеко и «замораживается».
  suspend() {
    this.suspended = true;
    const n = this.npc;
    if (!n || n.removed) return;
    n.target = null;
    this.wind = null;
    this.slam = null;
    this.charge = null;
    if (n.state === NPC_STATE.FIGHT || n.isDown) n._enter(NPC_STATE.WALK);
    n.cast = 0;
    n.position.set(5000, 0, 5000);
  }

  unsuspend() {
    this.suspended = false;
    this.duel = false;
    const n = this.npc;
    if (!n || n.removed || n.isDead) return;
    const { game } = this.system;
    n.position.set(this.home.x, game.world.getGroundHeight(this.home.x, this.home.z), this.home.z);
    n.visualY = n.position.y;
    n.allowedNodes = this.homeNodes;
    n.target = null;
    n.prevNode = null;
    n._setTarget(n._nearestAllowedNode());
    if (n.state === NPC_STATE.FIGHT) n._enter(NPC_STATE.WALK);
  }

  // Прилёт в дуэли: падает с неба рядом с игроком и бьёт ударной волной (land()).
  arrive(x, z) {
    const { game } = this.system;
    const n = this.npc;
    const g = game.world.getGroundHeight(x, z);
    n.target = null;
    n.panic = 0;
    n.dest = null;
    n.allowedNodes = null;
    if (n.isDown) n._enter(NPC_STATE.WALK);
    n.position.set(x, g + 60, z);
    n.visualY = n.position.y;
    n.knock.set(0, -42, 0);
    n.airborne = true;
    n.cast = 4;
    this.wind = null;
    this.charge = null;
    this.slam = { t: 0 };
    this.suspended = false;
    this.duel = true;
    this.cds = {};
    n.maxHealth = DUEL_HP;
    n.health = DUEL_HP;
  }

  update(dt) {
    const { game } = this.system;
    const n = this.npc;
    this.time += dt;
    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] -= dt;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.time >= this.queue[i].t) {
        const [{ fn }] = this.queue.splice(i, 1);
        fn();
      }
    }

    // Приземление после прыжка.
    if (this.slam) {
      this.slam.t += dt;
      if (this.slam.t > 0.25 && !n.airborne) this.land();
      else if (this.slam.t > 3) this.slam = null;
    }
    // Таран.
    if (this.charge) {
      const c = this.charge;
      c.t -= dt;
      c.hit -= dt;
      n.cast = Math.max(n.cast, 0.2);
      n.heading = Math.atan2(c.dx, c.dz);
      n.position.x += c.dx * 28 * dt;
      n.position.z += c.dz * 28 * dt;
      game.world.resolveCircle(n.position, n.radius, n._hit);
      game.effects.puff('smoke', _a.set(n.position.x, n.position.y + 0.4, n.position.z), { x: -c.dx, y: 0.4, z: -c.dz }, 0.9);
      game.vfx.orb(this.chest(_a), this.def.theme, 1.8, 0.15);
      game.world.breakTrees(n.position.x + c.dx * 1.5, n.position.z + c.dz * 1.5, 1.8, c.dx, c.dz);
      const t = n.target;
      const near = t && Math.hypot(t.position.x - n.position.x, t.position.z - n.position.z) < 2.6;
      if (near || c.t <= 0) {
        this.charge = null;
        n.cast = 0.35;
        game.vfx.explosion(_a.set(n.position.x + c.dx * 1.5, n.position.y + 0.8, n.position.z + c.dz * 1.5), { theme: this.def.theme, aoe: 4, damage: this.d(36), force: 15, owner: n, only: this.only });
        if (near) this.hurt(t, 22, 3, 12);
      }
    }
    // Подготовка способности.
    if (this.wind) {
      const w = this.wind;
      w.t -= dt;
      const t = w.target;
      if (t && !t.isDead && !t.removed) n.heading = Math.atan2(t.position.x - n.position.x, t.position.z - n.position.z);
      n.cast = Math.max(n.cast, 0.05);
      if (w.t <= 0) {
        this.wind = null;
        n.cast = 0;
        if (t && !t.isDead && !t.removed) ABILITIES[w.id].fire(this, t);
        else if (w.id === 'shield' || w.id === 'heal') ABILITIES[w.id].fire(this, n);
      }
      return;
    }
    if (this.slam || this.charge) return;

    // Цель: раз в полсекунды.
    this.targetTimer -= dt;
    if (this.targetTimer <= 0) {
      this.targetTimer = 0.5;
      const t = this.chooseTarget();
      if (t) {
        this.idleFor = 0;
        this.engage(t);
      } else if (n.target) {
        this.idleFor += 0.5;
        if (this.idleFor > 5) this.disengage();
      }
    }

    // Способность: раз в 0.3 с, пока дерётся.
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0 && n.target && !n.isDown) {
      this.thinkTimer = 0.3;
      const t = n.target;
      if (t && !t.isDead && !t.removed) {
        const tp = t.vehicle ? t.vehicle.position : t.position;
        const d = Math.hypot(tp.x - n.position.x, tp.z - n.position.z);
        const eye = this.chest(_a), aim = _b.set(tp.x, tp.y + 1.2, tp.z);
        const see = d < 6 || lineOfSight(game, eye, aim);
        const id = see ? this.pickAbility(t, d) : null;
        if (id) this.cast(id, t);
      }
    }

    // Ауры: фиолетовая у злодея, золотая у героя.
    this.auraTimer -= dt;
    if (this.auraTimer <= 0 && n.model.root.visible) {
      this.auraTimer = 0.16;
      const a = Math.random() * Math.PI * 2;
      const s = n.model.look?.scale ?? 1;
      _a.set(n.position.x + Math.cos(a) * 0.8 * s, (n.visualY ?? n.position.y) + Math.random() * 1.9 * s, n.position.z + Math.sin(a) * 0.8 * s);
      game.effects.puff(this.def.theme === 'gold' ? 'gold' : 'violet', _a, { x: 0, y: 0.9, z: 0 }, 0.45);
    }
  }
}

export class BossSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.minions = [];
    this.clash = null;            // { node, until }
    this.clashTimer = rngRange(game, 90, 150);
    const { world } = game;
    for (const kind of ['villain', 'hero']) {
      const b = new Boss(this, kind);
      const L = world.landmarks[b.def.home];
      const node = world.nearestWaypoint(L.x, L.z);
      b.home = { x: node.x, z: node.z };
      b.homeNodes = new Set(world.waypointsNear(node.x, node.z, 45).map((w) => w.id));
      b.spawn(node.x, node.z);
      this.list.push(b);
    }
    this.villain = this.list[0];
    this.hero = this.list[1];

    game.events.on('character:killed', ({ target, attacker }) => this._onKilled(target, attacker));
  }

  other(b) {
    return b === this.villain ? this.hero : this.villain;
  }

  // Подручный злодея: фиолетовая банда с оружием, нападает на цель босса.
  spawnMinion(spot, target) {
    const { game } = this;
    const look = gangLook(game.rng, '#5b1f9e');
    const npc = new NPC(game, game.rng, {
      x: spot.x, z: spot.z, role: 'gang', gang: 'villain', look, weapon: game.rng.chance(0.55) ? 'pistol' : 'smg',
    });
    npc.minion = true;
    npc.maxHealth = 120;
    npc.health = 120;
    npc.bravery = 1;
    game.npcs.add(npc);
    this.minions.push(npc);
    game.vfx.aura(npc, 'violet', 1.2, 40);
    game.vfx.orb(_c.set(spot.x, spot.y + 1, spot.z), 'violet', 2.6, 0.35);
    if (target && !target.isDead) npc.aggro(target);
    return npc;
  }

  // Игрок видит полосу ближайшего босса, пока он рядом и в бою (или совсем близко).
  barTarget() {
    if (this.game.duel?.active) return null;   // в дуэли — своя панель (duel.js)
    const p = this.game.player.position;
    let best = null, bestD = BAR_DISTANCE;
    for (const b of this.list) {
      if (!b.alive) continue;
      const d = Math.hypot(b.npc.position.x - p.x, b.npc.position.z - p.z);
      if (d < bestD && (b.engaged || d < 35)) { bestD = d; best = b; }
    }
    return best ? { kind: best.kind, name: best.name, title: best.title, color: best.color, hp: best.hp } : null;
  }

  _onKilled(target, attacker) {
    const { game } = this;
    const b = target.boss;
    if (!b) return;
    const p = game.player;
    const byPlayer = attacker === p || attacker?.follower === true || attacker?.driver === p;
    b.respawnIn = RESPAWN[b.kind];
    b.wind = null;
    b.slam = null;
    b.charge = null;
    b.queue.length = 0;
    if (b.kind === 'villain') {
      for (const m of [...this.minions]) this._retireMinion(m);
      if (byPlayer) {
        game.wallet.add(25000);
        game.progress.add(60, 'Злодей повержен');
        game.hud.news('Злодей города Damon Crowe повержен!', '#b44cff');
        game.hud.showBigMessage?.('ЗЛОДЕЙ ПОВЕРЖЕН', '#b44cff');
        setTimeout(() => game.hud.hideBigMessage?.(), 2600);
      } else {
        game.hud.news(attacker?.boss ? 'Герой победил Злодея!' : 'Злодей города пал', '#ffd24a');
      }
    } else {
      if (byPlayer) {
        game.wallet.add(8000);
        game.wanted.addHeat(3, 4);
        game.hud.news('Герой города Jack Hunter убит! Город в ярости', '#ff4d4d');
      } else {
        game.hud.news(attacker?.boss ? 'Злодей победил Героя!' : 'Герой города пал', '#b44cff');
      }
    }
    game.audio.fanfare?.(attacker === p ? 5 : 3);
    game.vfx.pillar(target.position, b.def.theme, 40, 1.4, 1.6);
    game.vfx.orb(_c.set(target.position.x, target.position.y + 1.2, target.position.z), b.def.theme, 5, 0.6);
    if (this.clash) this._endClash('death');
  }

  _retireMinion(m) {
    const i = this.minions.indexOf(m);
    if (i >= 0) this.minions.splice(i, 1);
    if (m.removed) return;
    if (!m.isDead && m.model.root.visible) {
      this.game.vfx.orb(_c.set(m.position.x, m.position.y + 1, m.position.z), 'violet', 2.4, 0.4);
      this.game.effects.burst(_c, UP, 'violet', 10);
    }
    this.game.npcs.remove(m);
  }

  // Столкновение титанов: оба идут к точке посередине между домами и там дерутся.
  _startClash() {
    const { game } = this;
    const v = this.villain, h = this.hero;
    if (this.game.duel?.active || v.suspended || h.suspended) return false;
    if (!v.alive || !h.alive || v.engaged || h.engaged) return false;
    const mid = { x: (v.home.x + h.home.x) / 2, z: (v.home.z + h.home.z) / 2 };
    const node = game.world.nearestWaypoint(mid.x, mid.z);
    const p = game.player.position;
    if (Math.hypot(node.x - p.x, node.z - p.z) > 380) return false;   // игрок слишком далеко — не симулируем
    for (const b of [v, h]) {
      b.march = node;
      b.npc.allowedNodes = null;
      b.npc.dest = node;
      b.npc.target = null;
      b.npc.walkSpeed = 3.6;
      if (b.npc.state !== NPC_STATE.WALK && !b.npc.isDown) b.npc.dropTarget();
      b.npc.prevNode = null;
      b.npc._setTarget(game.world.nearestWaypoint(b.npc.position.x, b.npc.position.z));
    }
    this.clash = { node, until: 150 };
    game.hud.news('Титаны сходятся: Злодей идёт на Героя!', '#ffd24a');
    game.hud.announce?.('ТИТАНЫ СХОДЯТСЯ', '#ffd24a');
    return true;
  }

  _endClash(reason) {
    if (!this.clash) return;
    this.clash = null;
    for (const b of this.list) {
      b.march = null;
      if (!b.alive) continue;
      b.npc.walkSpeed = 2.2;
      b.npc.dest = null;
      b.npc.allowedNodes = b.homeNodes;
      b.npc.target = null;
      b.npc.prevNode = null;
      b.npc._setTarget(b.npc._nearestAllowedNode());
      if (!b.npc.isDown && b.npc.state === NPC_STATE.FIGHT) b.npc._enter(NPC_STATE.WALK);
    }
    if (reason === 'time') this.game.hud.news('Титаны разошлись', '#cccccc');
  }

  _updateClash(dt) {
    const { game } = this;
    const c = this.clash;
    c.until -= dt;
    if (c.until <= 0) { this._endClash('time'); return; }
    // Зрители собираются вокруг места боя.
    const v = this.villain, h = this.hero;
    if (v.alive && h.alive) {
      const mx = (v.npc.position.x + h.npc.position.x) / 2, mz = (v.npc.position.z + h.npc.position.z) / 2;
      this._watchTimer = (this._watchTimer ?? 0) - dt;
      if (this._watchTimer <= 0) {
        this._watchTimer = 2.5;
        game.worklife?.watch(_c.set(mx, 0, mz), 60, 12);
      }
    }
  }

  update(dt) {
    const { game } = this;
    const p = game.player.position;
    this.minions = this.minions.filter((m) => !m.removed);
    // Подручные далеко от игрока исчезают.
    for (const m of [...this.minions]) {
      if (!m.isDead && Math.hypot(m.position.x - p.x, m.position.z - p.z) > 170) this._retireMinion(m);
    }

    for (const b of this.list) {
      if (b.suspended) continue;
      if (!b.npc || b.npc.removed) {
        // Тело убрано: ждём возрождения.
        b.npc = null;
        b.respawnIn -= dt;
        if (b.respawnIn <= 0) this._respawn(b);
        continue;
      }
      if (b.npc.isDead) {
        // Тело лежит; время вышло и игрок не рядом — убираем, дальше возрождение.
        if ((b.respawnIn -= dt) <= 0 && Math.hypot(b.npc.position.x - p.x, b.npc.position.z - p.z) > 30) game.npcs.remove(b.npc);
        continue;
      }
      const d = Math.hypot(b.npc.position.x - p.x, b.npc.position.z - p.z);
      if (d < ACTIVE_DISTANCE || b.npc.target) b.update(dt);
    }

    // Столкновение.
    if (this.clash && this.game.duel?.active) this._endClash('duel');
    if (this.clash) this._updateClash(dt);
    else if ((this.clashTimer -= dt) <= 0) {
      this.clashTimer = rngRange(game, 180, 300);
      this._startClash();
    }
    // Во время марша: когда сошлись на расстояние боя — цели выбираются обычным образом.
  }

  _respawn(b) {
    const { game } = this;
    const p = game.player.position;
    // Возвращается, только когда игрок далеко и не смотрит.
    if (Math.hypot(b.home.x - p.x, b.home.z - p.z) < 100 || game.inView(b.home.x, 1, b.home.z, 3)) {
      b.respawnIn = 5;
      return;
    }
    b.spawn(b.home.x, b.home.z);
    game.vfx.pillar(_c.set(b.home.x, game.world.getGroundHeight(b.home.x, b.home.z), b.home.z), b.def.theme, 40, 1.4, 1.5);
    game.hud.news(b.kind === 'villain' ? 'Злодей города вернулся в Прайм-тауэр' : 'Герой города вернулся на Площадь Чемпионов', b.color);
  }
}

function rngRange(game, a, b) {
  return game.rng.range(a, b);
}
