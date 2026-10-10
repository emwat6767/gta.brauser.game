import { NPC, NPC_STATE } from './npc.js';
import { Melee } from './combat.js';
import { civilianLook } from './outfits.js';
import { FIGHTERS, fighterLook } from './fighters.js';
import { americanName, nickname, presentation } from './names.js';
import { createRng, dampAngle } from './utils.js';
import { NavGrid } from './prison-nav.js';
import { phaseAt, STORIES, JOBS } from './prison-data.js';

// Население тюрьмы: заключённые (готовые бойцы + обычные американцы в оранжевых робах) и персонал.
// Список людей (roster) создаётся один раз и хранит характер, дружбу с игроком и работу; тела (NPC) появляются,
// когда игрок рядом, и убираются, когда он далеко. Позиции берутся из расписания дня (prison-data.js: SCHEDULE),
// так что вернувшись к тюрьме, игрок застанет людей там, где им положено быть в этот час.
// Ходят по сетке проходимости (prison-nav.js): путь A*, затем прыжками npc.goTo между поворотами.

const SPAWN_R = 175;
const DESPAWN_R = 250;
const V = (x, z) => ({ x, z });

// Роба: оранжевая; бывают вариации (белая футболка под низ, серая толстовка).
export function jumpsuitLook(base, variant) {
  const orange = '#e2670a';
  const look = {
    ...base,
    hat: null, hatStyle: undefined, glasses: null, chain: null, watch: null, gloves: null, glove: undefined, wraps: null,
    champ: false, earring: null, bandana: null, scarf: null, backpack: null, bag: null, headphones: null, mask: null,
    bottom: 'jeans', pants: orange, shoes: '#e8e6e0', shoeStyle: 'sneaker', shoeAccent: undefined, trim: undefined, legs: undefined,
    top: 'tee', shirt: orange, shirt2: undefined, accent: '#b34e05',
  };
  if (variant === 1) Object.assign(look, { shirt: '#eeeeea', accent: '#c4c4c0' });
  else if (variant === 2) Object.assign(look, { top: 'hoodie', shirt: '#8a8f96', accent: '#6f747b' });
  return look;
}

function uniformLook(rng, kind, base) {
  const skin = base.skin, hair = base.hair;
  const common = { skin, hair, hairStyle: rng.pick(['short', 'buzz', 'fade', 'bald']), beard: rng.chance(0.2) ? 'stubble' : 'none', tattoo: 0, bulk: rng.range(1.05, 1.18), scale: rng.range(1.0, 1.07) };
  switch (kind) {
    case 'warden':
      return { ...common, hair: '#9a9a9a', hairStyle: 'slick', beard: 'none', top: 'suit', shirt: '#2f3239', shirt2: '#f4f4f4', accent: '#8b1e1e', bottom: 'slim', pants: '#2f3239', shoes: '#0c0c0c', shoeStyle: 'dress', glasses: 'round', watch: '#c9c9c9', bulk: 1.06 };
    case 'clerk':
      return { ...common, top: 'vest', shirt: '#3f5a43', accent: '#e8e8e8', bottom: 'slim', pants: '#2b2b2b', shoes: '#151515', shoeStyle: 'dress', glasses: 'round', bulk: 1.1 };
    case 'medic':
      return { ...common, top: 'polo', shirt: '#eef2f4', accent: '#2c6a8a', bottom: 'slim', pants: '#2c6a8a', shoes: '#f2f2f2', shoeStyle: 'sneaker', bulk: 1.0 };
    default:
      return {
        ...common, top: 'polo', shirt: '#5d6b5f', accent: '#c9c9c9', bottom: 'slim', pants: '#232a25', shoes: '#0c0c0c', shoeStyle: 'boot',
        hat: '#232a25', hatStyle: 'cap', glasses: rng.chance(0.3) ? 'aviator' : null, watch: rng.chance(0.4) ? '#c9c9c9' : null,
      };
  }
}
export const guardUniformLook = (rng) => uniformLook(rng, 'guard', civilianLook(rng, {}));

const GUARDS = [
  { id: 'gateL', kind: 'post', post: 'gateL', name: 'Guard Reyes', title: 'Охрана · КПП', always: true },
  { id: 'gateR', kind: 'post', post: 'gateR', name: 'Sgt. Mack', title: 'Сержант · КПП', always: true, corrupt: true },
  { id: 'armory', kind: 'post', post: 'armory', name: 'Guard Pruitt', title: 'Охрана · Оружейная', hours: [6, 22] },
  { id: 'intake', kind: 'post', post: 'intake', name: 'Officer Bell', title: 'Приёмное отделение', hours: [6, 22], talk: 'intake' },
  { id: 'warden', kind: 'post', post: 'warden', name: 'Warden Hargrove', title: 'Начальник тюрьмы', hours: [8, 18], look: 'warden', talk: 'warden' },
  { id: 'clerk', kind: 'post', post: 'clerk', name: 'Carl', title: 'Лавка · Commissary', hours: [8, 19], look: 'clerk', noGuard: true },
  { id: 'medic', kind: 'post', post: 'medic', name: 'Nurse Dana', title: 'Лазарет', hours: [7, 20], look: 'medic', noGuard: true, talk: 'medic' },
  { id: 'pA', kind: 'patrol', route: 'blockA', name: 'Guard Dixon', title: 'Охрана · Блок A', always: true },
  { id: 'pB', kind: 'patrol', route: 'blockB', name: 'Guard Moore', title: 'Охрана · Блок B', always: true },
  { id: 'pY1', kind: 'patrol', route: 'yard', name: 'Guard Hale', title: 'Охрана · Двор', hours: [6, 21.5] },
  { id: 'pY2', kind: 'patrol', route: 'yard', offset: 2, name: 'Guard Cruz', title: 'Охрана · Двор', hours: [6, 21.5] },
  { id: 'pC', kind: 'patrol', route: 'cafe', name: 'Guard Bishop', title: 'Охрана · Столовая', hours: [6, 21.5] },
];

const YARD_PREF = {
  boss: ['bleachers'], tough: ['weights', 'weights', 'hoops', 'chat'], jokester: ['hoops', 'chat', 'cards'], friendly: ['chat', 'hoops', 'cards', 'bleachers'],
  quiet: ['bleachers', 'walk'], smart: ['cards', 'walk', 'bleachers'], paranoid: ['walk', 'walk', 'bleachers'], dealer: ['chat', 'bleachers'], snitch: ['chat', 'cards'],
};
const ROOM_PREF = {
  boss: ['tables', 'tv'], tough: ['tv', 'tables'], jokester: ['tables', 'tv', 'phones'], friendly: ['tv', 'tables', 'phones'], quiet: ['tables'], smart: ['tables'],
  paranoid: ['tables', 'phones'], dealer: ['phones', 'tables'], snitch: ['tv', 'phones'],
};

export class PrisonCrew {
  constructor(prison) {
    this.prison = prison;
    this.game = prison.game;
    this.L = this.game.world.prison;
    this.rng = createRng(90210);
    const c = this.L.center;
    this.nav = new NavGrid(this.game.world, { minX: c.x - 39, maxX: c.x + 39, minZ: c.z - 39, maxZ: c.z + 39 });
    this.t = 0;
    this.phase = null;
    this.spawned = false;
    this.lockdown = false;
    this.riot = false;
    this.circles = [];
    this.day = 0;
    this.inmates = [];
    this.guards = [];
    this._syncTimer = 0;
    this._queue = [];
    this._brawlT = 90;
    this._chatT = 3;
    this.brawl = null;
    this._makeRoster();
    this._makeGuards();
  }

  // ------------------------------------------------------------------ состав
  _makeRoster() {
    const rng = this.rng;
    const taken = this.game.npcs.fighters.active;       // уже гуляют по городу — в тюрьму не берём, чтобы не было двойников
    const pool = FIGHTERS.filter((f) => !f.monster && !taken.has(f.id));
    // Бойцы: перемешать, не больше двух чемпионов/легенд.
    const shuffled = [...pool].sort(() => rng.next() - 0.5);
    const chosen = [];
    let stars = 0;
    for (const f of shuffled) {
      const star = f.champion || f.group === 'legend';
      if (star && stars >= 2) continue;
      if (star) stars++;
      chosen.push(f);
      if (chosen.length >= 26) break;
    }
    // Самый сильный из выбранных — авторитет двора.
    chosen.sort((a, b) => b.skill - a.skill);
    const fighterTraits = ['boss', ...Array(8).fill('tough'), ...Array(6).fill('jokester'), ...Array(6).fill('friendly'), 'quiet', 'quiet', 'smart', 'smart', 'smart'];
    const genericTraits = ['dealer', 'snitch', 'snitch', 'paranoid', 'paranoid', 'paranoid', 'smart', 'quiet', 'quiet', 'quiet', 'jokester', 'jokester', 'jokester', ...Array(7).fill('friendly')];
    // Перемешиваем характеры внутри групп (авторитет остаётся у сильнейшего).
    const rest = fighterTraits.slice(1).sort(() => rng.next() - 0.5);
    const fTraits = ['boss', ...rest];
    const gTraits = genericTraits.sort(() => rng.next() - 0.5);

    const cellOrder = [...Array(this.L.cells.length).keys()].sort(() => rng.next() - 0.5);
    let idx = 0;
    const add = (rec) => {
      rec.idx = idx;
      rec.cellIdx = cellOrder[idx % cellOrder.length];
      rec.slot = Math.floor(idx / cellOrder.length);
      rec.friend = 0;
      rec.mood = 0.5 + rng.range(-0.15, 0.2);
      rec.favorite = rng.pick(['snack', 'ramen', 'coffee', 'cigs']);
      rec.story = rng.pick(STORIES);
      rec.sentenceDays = rng.int(1, 9);
      rec.talkAt = {};            // тема -> время игры (ч), когда можно повторить
      rec.npc = null;
      rec.dead = false;
      rec.dest = null;
      rec.path = null;
      rec.arrived = false;
      rec.stage = null;
      rec.reassign = 0;
      rec.hold = 0;
      this.inmates.push(rec);
      idx++;
    };
    for (const f of chosen) taken.add(f.id);          // бойцы тюрьмы навсегда закреплены за тюрьмой
    chosen.forEach((f, i) => {
      add({ id: `f-${f.id}`, kind: 'fighter', fighter: f, name: f.name, nick: f.nick, trait: fTraits[i] ?? 'friendly', look: jumpsuitLook(fighterLook(f), rng.int(0, 2) === 2 ? 1 : 0) });
    });
    for (let i = 0; i < 20; i++) {
      let look = civilianLook(rng, {});
      for (let k = 0; k < 10 && presentation(look) === 'f'; k++) look = civilianLook(rng, {});
      look = { ...look, bulk: Math.max(look.bulk ?? 1, rng.range(0.98, 1.12)), tattoo: rng.chance(0.4) ? rng.int(1, 4) : look.tattoo };
      const n = americanName(look, rng);
      const trait = gTraits[i];
      const nick = rng.chance(0.55) || trait === 'dealer' ? (trait === 'dealer' ? 'Skippy' : nickname(rng)) : null;
      const name = trait === 'dealer' ? 'Skip Morrow' : nick ? `${n.first} «${nick}» ${n.last}` : n.full;
      add({ id: `g-${i}`, kind: 'generic', fighter: null, name, nick, trait, look: jumpsuitLook(look, rng.int(0, 5) === 0 ? 2 : rng.int(0, 4) === 0 ? 1 : 0) });
    }
    // Работа: кухня, прачечная, библиотека (авторитет и делец не работают).
    const workers = this.inmates.filter((r) => r.trait !== 'boss' && r.trait !== 'dealer' && r.trait !== 'snitch').sort(() => rng.next() - 0.5);
    const counts = { laundry: 7, kitchen: 6, library: 3 };
    for (const [job, n] of Object.entries(counts)) {
      for (let k = 0; k < n; k++) {
        const rec = workers.pop();
        if (rec) { rec.job = job; rec.jobSlot = k; }
      }
    }
    for (const rec of this.inmates) {
      rec.job ??= null;
      const prefs = YARD_PREF[rec.trait];
      rec.yardPref = prefs[rec.idx % prefs.length];
      const rp = ROOM_PREF[rec.trait];
      rec.roomPref = rp[rec.idx % rp.length];
    }
    // Камеры, где ровно один сосед — для игрока.
    const counts2 = new Map();
    for (const r of this.inmates) counts2.set(r.cellIdx, (counts2.get(r.cellIdx) ?? 0) + 1);
    this.singleCells = [...counts2.entries()].filter(([, n]) => n === 1).map(([i]) => i);
    this.emptyCells = this.L.cells.map((_, i) => i).filter((i) => !counts2.has(i));
  }

  _makeGuards() {
    const rng = this.rng;
    for (const def of GUARDS) {
      const base = civilianLook(rng, {});
      this.guards.push({
        ...def, look: uniformLook(rng, def.look ?? 'guard', base), npc: null, dest: null, path: null, arrived: false, wait: 0, idx: rng.int(0, 3),
        mode: 'duty', reassign: 0, alive: true,
      });
    }
  }

  // ------------------------------------------------------------------ доступ
  recByNpc(npc) { return npc?.prisonInmate ?? null; }
  guardByNpc(npc) { return npc?.prisonGuard ?? null; }

  nearestInmate(pos, r = 2.6, filter = null) {
    let best = null, bestD = r;
    for (const rec of this.inmates) {
      const n = rec.npc;
      if (!n || n.isDead || n.removed || n.vehicle || (filter && !filter(rec))) continue;
      const d = Math.hypot(n.position.x - pos.x, n.position.z - pos.z);
      if (d < bestD) { bestD = d; best = rec; }
    }
    return best;
  }

  nearestGuard(pos, r = 2.4, filter = null) {
    let best = null, bestD = r;
    for (const g of this.guards) {
      const n = g.npc;
      if (!n || n.isDead || n.removed || (filter && !filter(g))) continue;
      const d = Math.hypot(n.position.x - pos.x, n.position.z - pos.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  get hour() { return this.game.daynight.hour; }

  // ------------------------------------------------------------------ появление / исчезновение
  _onDuty(g) {
    if (!g.alive) return false;
    if (g.always || !g.hours) return true;
    const h = this.hour;
    return h >= g.hours[0] && h < g.hours[1];
  }

  _sync() {
    const p = this.game.player.position, c = this.L.center;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const inside = this.prison.state === 'inside';
    if (!this.spawned && (d < SPAWN_R || inside)) this._spawnAll();
    else if (this.spawned && d > DESPAWN_R && !inside) this._despawnAll();
    if (!this.spawned) return;
    // Смена: дежурные появляются, ушедшие домой исчезают.
    for (const g of this.guards) {
      const on = this._onDuty(g);
      if (on && !g.npc) this._spawnGuard(g);
      else if (!on && g.npc && !g.npc.isDead) this._removeGuard(g);
    }
  }

  // Тела появляются пачками по нескольку штук за кадр: без подвисания при подходе к тюрьме.
  _spawnAll() {
    this.spawned = true;
    this._queue = [...this.guards.filter((g) => this._onDuty(g) && !g.npc).map((g) => ({ g })), ...this.inmates.filter((r) => !r.dead && !r.npc).map((rec) => ({ rec }))];
  }

  _drainQueue() {
    for (let k = 0; k < 8 && this._queue.length; k++) {
      const q = this._queue.shift();
      if (q.rec && !q.rec.npc && !q.rec.dead) this._spawnInmate(q.rec);
      else if (q.g && !q.g.npc && this._onDuty(q.g)) this._spawnGuard(q.g);
    }
  }

  _despawnAll() {
    this.spawned = false;
    this._queue.length = 0;
    for (const rec of this.inmates) this._removeInmate(rec);
    for (const g of this.guards) this._removeGuard(g);
    this.circles.length = 0;
  }

  _spawnInmate(rec) {
    const game = this.game;
    this.phase ??= phaseAt(this.hour);
    const d = this._destFor(rec);
    const free = this.nav.nearestFree(d.x, d.z, 3);
    const spot = free >= 0 ? this.nav.center(free) : d;
    const npc = new NPC(game, game.rng, { x: spot.x, z: spot.z, role: 'inmate', look: rec.look, fighter: rec.fighter, name: rec.name });
    npc.prisonInmate = rec;
    npc.walkSpeed = Math.min(2.05, Math.max(npc.walkSpeed, 1.75));
    npc.hitResist = Math.max(npc.hitResist, 4);
    npc.idleTime = 1e9;
    npc.heading = d.heading ?? npc.heading;
    game.npcs.add(npc);
    if (rec.fighter) game.npcs.fighters.active.add(rec.fighter.id);
    rec.npc = npc;
    rec.dest = d;
    rec.path = null;
    rec.arrived = false;
    this._place(rec, d);
    this.refreshTag(rec);
  }

  _removeInmate(rec) {
    const npc = rec.npc;
    rec.npc = null;
    if (!npc) return;
    this.game.npcs.remove(npc);
    if (rec.fighter) this.game.npcs.fighters.active.add(rec.fighter.id);   // бойца не отдаём городу, пока он сидит
  }

  _spawnGuard(g) {
    const game = this.game;
    const d = this._guardDest(g);
    const npc = new NPC(game, game.rng, { x: d.x, z: d.z, role: 'police', look: g.look, weapon: null, name: g.name });
    npc.guard = true;
    npc.prisonGuard = g;
    npc.melee = new Melee(npc, { damage: 2.6, cooldown: 0.95 });
    npc.melee.gate = (o) => this.prison.guardMayStrike(o);     // охрана бьёт по очереди, а не толпой (prison.js)
    npc.hitResist = 4;
    npc.maxHealth = npc.health = 75;
    npc.bravery = 1;
    npc.walkSpeed = 1.55;
    npc.idleTime = 1e9;
    npc.tagline = g.title;
    game.npcs.add(npc);
    g.npc = npc;
    g.dest = d;
    g.path = null;
    g.arrived = false;
    this._placeGuard(g, d);
  }

  _removeGuard(g) {
    const npc = g.npc;
    g.npc = null;
    if (npc) this.game.npcs.remove(npc);
  }

  refreshTag(rec) {
    if (!rec.npc) return;
    const lv = this.prison.friendLevelOf(rec);
    rec.npc.tagline = rec.gang ? `Ваша банда · ${this.prison.friendName(lv)}` : `Заключённый · ${this.prison.friendName(lv)}`;
  }

  // ------------------------------------------------------------------ назначения
  _cell(rec) { return this.L.cells[rec.cellIdx]; }

  _along(cell) {
    const [nx, nz] = cell.w.normalW;
    return [-nz, nx];
  }

  // Точка в камере/у камеры для заключённого (slot 0 — у койки, slot 1 — с другой стороны).
  _cellPoint(rec, where) {
    const cell = this._cell(rec), w = cell.w;
    const [nx, nz] = cell.w.normalW;
    const [ax, az] = this._along(cell);
    const bedSide = Math.sign((w.bed.x - w.inside.x) * ax + (w.bed.z - w.inside.z) * az) || 1;
    if (where === 'bed') {
      if (rec.slot === 0) return { x: w.bed.x, z: w.bed.z, heading: Math.atan2(nx, nz), sit: true };
      return { x: w.inside.x - ax * bedSide * 0.65, z: w.inside.z - az * bedSide * 0.65, heading: Math.atan2(ax * bedSide, az * bedSide) };
    }
    if (where === 'inside') {
      const sgn = rec.slot === 0 ? 0.25 : -0.65;
      return { x: w.inside.x + ax * bedSide * sgn, z: w.inside.z + az * bedSide * sgn, heading: Math.atan2(-nx, -nz) };
    }
    // outside
    const sgn = rec.slot === 0 ? 0 : 0.85;
    return { x: w.outside.x + nx * 0.3 + ax * sgn, z: w.outside.z + nz * 0.3 + az * sgn, heading: Math.atan2(-nx, -nz) };
  }

  _pick(list, i) { return list[((i % list.length) + list.length) % list.length]; }

  _yardRect() {
    const a = this.L.toWorld(8, -18), b = this.L.toWorld(30, 16);
    return { minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]) };
  }

  _circleFor(rec) {
    let c = this.circles.find((k) => k.members.length < 4 && !k.members.includes(rec));
    if (!c || this.rng.chance(0.15)) {
      const p = this.nav.randomFree(this.rng, this._yardRect(), 40);
      if (!p) return null;
      c = { x: p.x, z: p.z, members: [] };
      this.circles.push(c);
      if (this.circles.length > 12) this.circles.shift();
    }
    if (!c.members.includes(rec)) c.members.push(rec);
    const k = c.members.indexOf(rec);
    const a = (k / 4) * Math.PI * 2 + 0.6;
    return { x: c.x + Math.sin(a) * 0.95, z: c.z + Math.cos(a) * 0.95, heading: Math.atan2(-Math.sin(a), -Math.cos(a)), activity: 'talk' };
  }

  _yardDest(rec) {
    const S = this.L.spots;
    const pref = rec.yardPref;
    const i = rec.idx;
    switch (pref) {
      case 'hoops': {
        const h = S.hoops[i % 2];
        const o = S.hoops[0], q = S.hoops[1];
        const a = (i * 2.1) % (Math.PI * 2), r = 1.2 + (i % 3) * 0.9;
        const face = Math.atan2(h.x - (o.x + q.x) / 2, h.z - (o.z + q.z) / 2);
        return { x: h.x + Math.sin(a) * r, z: h.z + Math.cos(a) * r, heading: face, activity: i % 3 === 0 ? 'cheer' : 'shadow' };
      }
      case 'weights': {
        const w = this._pick(S.weights, i);
        return { x: w.x, z: w.z, heading: this.L.headingW(Math.PI / 2), activity: 'flex' };
      }
      case 'cards': {
        const seat = this._pick(this._pick(S.cardSeats, i), i >> 2);
        return { x: seat.x, z: seat.z, heading: seat.heading, activity: 'talk', sit: true };
      }
      case 'bleachers': {
        const b = this._pick(S.bleachers, i);
        return { x: b.x, z: b.z, heading: b.heading, activity: i % 2 ? 'talk' : null, sit: true };
      }
      case 'walk': {
        const f = this._pick(S.fenceWalk, i + Math.floor(this.t / 25));
        return { x: f.x, z: f.z, heading: undefined, activity: null };
      }
      default: {
        const c = this._circleFor(rec);
        if (c) return c;
        const b = this._pick(S.bleachers, i);
        return { x: b.x, z: b.z, heading: b.heading, sit: true };
      }
    }
  }

  _roomDest(rec) {
    const S = this.L.spots;
    const i = rec.idx;
    switch (rec.roomPref) {
      case 'tv': {
        const s = this._pick(S.tv, i);
        return { x: s.x, z: s.z, heading: s.heading, activity: i % 4 === 0 ? 'cheer' : null };
      }
      case 'phones': {
        const s = this._pick(this.L.stations.phones, i);
        return { x: s.x, z: s.z, heading: this.L.headingW(Math.PI / 2), activity: 'phone' };
      }
      default: {
        const s = this._pick(S.tables, i);
        return { x: s.x, z: s.z, heading: s.heading, activity: 'talk', sit: true };
      }
    }
  }

  _workDest(rec) {
    const job = JOBS[rec.job];
    const list = this.L.spots[job.spotKey];
    const s = this._pick(list, rec.jobSlot);
    return { x: s.x, z: s.z, heading: s.heading, activity: rec.job === 'library' ? null : rec.idx % 3 === 0 ? 'talk' : null };
  }

  _destFor(rec) {
    const ph = this.phase?.id ?? 'night';
    const hour = this.hour;
    if (this.lockdown && !this.riot) return this._cellPoint(rec, 'inside');
    switch (ph) {
      case 'night': return this._cellPoint(rec, 'bed');
      case 'count': case 'count2': return this._cellPoint(rec, 'outside');
      case 'lockin': return this._cellPoint(rec, hour >= 21.5 ? 'bed' : 'inside');
      case 'breakfast': case 'lunch': case 'dinner': {
        if (rec.stage === 'tray') {
          const s = this._pick(this.L.spots.tray, rec.idx);
          return { x: s.x, z: s.z, heading: s.heading, activity: null };
        }
        const s = this._pick(this.L.spots.cafe, rec.idx);
        return { x: s.x, z: s.z, heading: s.heading, activity: rec.idx % 3 === 0 ? 'talk' : null, sit: true };
      }
      case 'work': return rec.job ? this._workDest(rec) : hour >= 8 && rec.idx % 2 ? this._yardDest(rec) : this._roomDest(rec);
      case 'yard': return this._yardDest(rec);
      case 'rec': return hour < 20 && rec.idx % 2 ? this._yardDest(rec) : this._roomDest(rec);
      default: return this._cellPoint(rec, 'bed');
    }
  }

  _guardDest(g) {
    const L = this.L;
    if (g.kind === 'post') {
      const p = L.posts[g.post];
      return { x: p.x, z: p.z, heading: p.heading };
    }
    const route = L.patrols[g.route];
    const night = this.phase?.id === 'night' || this.phase?.id === 'lockin';
    const p = route[(g.idx + (g.offset ?? 0)) % route.length];
    void night;
    return { x: p.x, z: p.z, heading: undefined };
  }

  // ------------------------------------------------------------------ перемещение
  _ground(x, z) { return this.game.world.getGroundHeight(x, z); }

  // Мгновенно поставить на место назначения.
  _place(rec, d) {
    const npc = rec.npc;
    if (!npc) return;
    const f = this.nav.nearestFree(d.x, d.z, 3);
    const p = f >= 0 && !this.nav.isFree(d.x, d.z) ? this.nav.center(f) : d;
    npc.position.set(p.x, this._ground(p.x, p.z), p.z);
    npc.visualY = npc.position.y;
    npc.knock.set(0, 0, 0);
    rec.dest = d;
    rec.path = null;
    this._arrive(rec, d);
  }

  _placeGuard(g, d) {
    const npc = g.npc;
    if (!npc) return;
    npc.position.set(d.x, this._ground(d.x, d.z), d.z);
    npc.visualY = npc.position.y;
    g.dest = d;
    g.path = null;
    this._arriveGuard(g, d);
  }

  _arrive(rec, d = rec.dest) {
    const npc = rec.npc;
    if (!npc || !d) return;
    rec.arrived = true;
    rec.path = null;
    if (d.heading !== undefined) npc.heading = d.heading;
    npc.activity = d.activity ?? null;
    npc.idleTime = 1e9;
    npc.partner = null;
    npc.knock.set(0, 0, 0);
    if (d.sit) {
      npc._enter(NPC_STATE.IDLE);   // освобождает прежнее место, если сидел
      npc.bench = { x: npc.position.x, z: npc.position.z, heading: npc.heading, fake: true };
      npc.benchSpot = { x: npc.position.x, z: npc.position.z };
      npc.benchSlot = 0;
      npc.idleTime = 1e9;
      npc._enter(NPC_STATE.SIT);
    } else {
      npc._enter(NPC_STATE.IDLE);
      npc.idleTime = 1e9;
    }
  }

  _arriveGuard(g, d = g.dest) {
    const npc = g.npc;
    if (!npc || !d) return;
    g.arrived = true;
    g.path = null;
    if (d.heading !== undefined) npc.heading = d.heading;
    npc.activity = null;
    npc._enter(NPC_STATE.IDLE);
    npc.idleTime = 1e9;
  }

  // Пойти к новому назначению с учётом сетки.
  _go(rec, d) {
    const npc = rec.npc;
    if (!npc) return;
    if (npc.state === NPC_STATE.SIT || npc.state === NPC_STATE.GOTO_BENCH) {
      npc._enter(NPC_STATE.IDLE);
      npc.position.x += Math.sin(npc.heading) * 0.35;
      npc.position.z += Math.cos(npc.heading) * 0.35;
    }
    rec.dest = d;
    rec.arrived = false;
    rec.wp = null;
    const dest = this.nav.isFree(d.x, d.z) ? d : (() => { const f = this.nav.nearestFree(d.x, d.z, 3); return f >= 0 ? { ...d, ...this.nav.center(f) } : d; })();
    rec.dest = dest;
    rec.path = this.nav.findPath(npc.position.x, npc.position.z, dest.x, dest.z) ?? [V(dest.x, dest.z)];
  }

  _goGuard(g, d) {
    const npc = g.npc;
    if (!npc) return;
    g.dest = d;
    g.arrived = false;
    g.wp = null;
    g.path = this.nav.findPath(npc.position.x, npc.position.z, d.x, d.z) ?? [V(d.x, d.z)];
  }

  // Один шаг движения по пути для записи rec (inmate или guard). Возвращает true, пока идёт.
  _follow(rec, arriveFn) {
    const npc = rec.npc;
    if (!npc || rec.arrived || !rec.dest) return false;
    const st = npc.state;
    if (st === NPC_STATE.FIGHT || npc.isDown || st === NPC_STATE.STUMBLE || st === NPC_STATE.DRIVE || npc.cast > 0) return true;
    if (!rec.path || !rec.path.length) { arriveFn(rec); return false; }
    let wp = rec.path[0];
    const last = rec.path.length === 1;
    const d = Math.hypot(wp.x - npc.position.x, wp.z - npc.position.z);
    if (d < (last ? 0.8 : 0.7)) {
      rec.path.shift();
      if (!rec.path.length) { arriveFn(rec); return false; }
      wp = rec.path[0];
    }
    if (st !== NPC_STATE.GOTO || rec.wp !== wp) {
      npc.goTo(wp.x, wp.z, rec.path.length === 1 ? 1e9 : 0);
      rec.wp = wp;
    }
    return true;
  }

  // ------------------------------------------------------------------ тики
  update(dt) {
    this.t += dt;
    const ph = phaseAt(this.hour);
    if (ph.id !== this.phase?.id) this._onPhase(ph);
    this._syncTimer -= dt;
    if (this._syncTimer <= 0) { this._syncTimer = 1; this._sync(); }
    if (!this.spawned) return;
    if (this._queue.length) this._drainQueue();
    for (const rec of this.inmates) this._tickInmate(rec, dt);
    for (const g of this.guards) this._tickGuard(g, dt);
    this._ambient(dt);
  }

  // ------------------------------------------------------------------ жизнь вокруг: драки и реплики
  _ambient(dt) {
    const { game, prison } = this;
    const p = game.player.position;
    // Короткая драка двух заключённых: охрана разнимает.
    if (this.brawl) {
      const b = this.brawl;
      b.t += dt;
      const na = b.a.npc, nb = b.b.npc;
      const done = !na || !nb || na.isDead || nb.isDead || b.t > 14 || na.health < na.maxHealth * 0.5 || nb.health < nb.maxHealth * 0.5;
      if (done) this._endBrawl();
      return;
    }
    this._brawlT -= dt;
    const ph = this.phase?.id;
    if (this._brawlT <= 0) {
      this._brawlT = this.rng.range(110, 240);
      if (!['yard', 'rec', 'work'].includes(ph) || this.lockdown || prison.alert > 0 || prison.state !== 'inside') return;
      const cand = this.inmates.filter((r) => r.npc && !r.npc.isDead && r.arrived && !r.following && r.npc.state === NPC_STATE.IDLE &&
        Math.hypot(r.npc.position.x - p.x, r.npc.position.z - p.z) < 45 && ['tough', 'boss', 'jokester', 'paranoid'].includes(r.trait));
      if (cand.length < 2) return;
      const a = this.rng.pick(cand);
      const near = cand.filter((r) => r !== a && Math.hypot(r.npc.position.x - a.npc.position.x, r.npc.position.z - a.npc.position.z) < 9);
      if (!near.length) return;
      const b = this.rng.pick(near);
      this.brawl = { a, b, t: 0 };
      a.npc.aggro(b.npc, 'Ты что сказал?!');
      b.npc.aggro(a.npc, 'Повтори!');
      const g = this.nearestGuard(a.npc.position, 35, (x) => !x.noGuard && x.id !== 'clerk' && x.id !== 'medic');
      if (g?.npc && !g.npc.isDead) { this.brawl.guard = g; g.npc.say('Драка! Разойтись!', true); }
      prison.game.hud.news('Драка заключённых во дворе', '#ffcf5a');
    }
    // Реплики рядом с игроком.
    this._chatT -= dt;
    if (this._chatT <= 0) {
      this._chatT = this.rng.range(4, 9);
      const rec = this.nearestInmate(p, 5.5, (r) => r.npc.state === NPC_STATE.IDLE || r.npc.state === NPC_STATE.SIT);
      if (rec && prison.state === 'inside' && this.rng.chance(0.5)) {
        const lv = prison.friendLevelOf(rec);
        const pool = lv >= 2 ? ['Эй, как жизнь?', 'Заходи, поболтаем!', 'Все нормально?', 'Видел сегодня охрану?'] : ['Чего уставился?', 'Новенький...', 'Не мешай.', 'Привет.', 'Тихо тут сегодня.'];
        rec.npc.say(this.rng.pick(pool));
      }
    }
  }

  _endBrawl() {
    const b = this.brawl;
    this.brawl = null;
    for (const r of [b.a, b.b]) {
      const n = r.npc;
      if (!n || n.isDead) continue;
      n.dropTarget();
      n.health = Math.max(n.health, n.maxHealth * 0.7);
      n.say(this.rng.pick(['Ладно, хватит.', 'Ещё встретимся.', 'Забудем.']), true);
      r.arrived = true;
      r.reassign = this.t + 4;
    }
    const g = b.guard?.npc;
    if (g && !g.isDead && g.state === NPC_STATE.FIGHT) g.dropTarget();
  }

  _onPhase(ph) {
    const first = !this.phase;
    this.phase = ph;
    if (ph.id === 'count') {
      this.day++;
      for (const rec of this.inmates) if (rec.dead && rec.reviveDay <= this.day) rec.dead = false;
      for (const g of this.guards) if (!g.alive && g.reviveDay <= this.day) g.alive = true;
    }
    for (const rec of this.inmates) {
      rec.stage = ph.where === 'cafe' ? 'tray' : null;
      rec.reassign = this.t + this.rng.range(0, ph.where === 'cell' || ph.where === 'cellfront' ? 8 : 20);
      rec.lastPhase = ph.id;
      rec.assigned = false;
    }
    for (const g of this.guards) g.reassign = this.t + this.rng.range(0, 6);
    this.circles.length = 0;
    if (!first) this.prison._onPhase(ph);
  }

  _tickInmate(rec, dt) {
    let npc = rec.npc;
    if (!npc) return;
    if (npc.removed) { rec.npc = null; if (rec.fighter) this.game.npcs.fighters.active.add(rec.fighter.id); return; }
    if (npc.isDead) {
      if (!rec.dead) {
        rec.dead = true;
        rec.reviveDay = this.day + 1;
        this.prison._onInmateDied(rec, npc);
      }
      return;
    }
    if (rec.following) return;
    // Тюремные люди не должны бродить по городу: если NPC сам ушёл в WALK — вернуть к цели.
    if (rec.hold > this.t) {
      const p = this.game.player.position;
      if (npc.state !== NPC_STATE.FIGHT && !npc.isDown) {
        npc.heading = dampAngle(npc.heading, Math.atan2(p.x - npc.position.x, p.z - npc.position.z), 8, dt);
      }
      return;
    }
    if (npc.state === NPC_STATE.FIGHT || npc.isDown || npc.state === NPC_STATE.STUMBLE) { rec.path = null; rec.arrived = true; return; }
    if (rec.arrived && rec.dest) {
      if (npc.state === NPC_STATE.WALK || npc.state === NPC_STATE.RETREAT) {
        // вернулся из драки: отойти к месту
        this._go(rec, rec.dest);
      } else if (npc.state !== NPC_STATE.SIT) {
        const d = Math.hypot(npc.position.x - rec.dest.x, npc.position.z - rec.dest.z);
        if (d > 1.6) this._go(rec, rec.dest);
        else if (npc.state === NPC_STATE.IDLE) { npc.idleTime = 1e9; if (rec.dest.activity !== undefined) npc.activity = rec.dest.activity; }
      }
    }
    // Новое назначение: по смене фазы, по окончании этапа и просто раз в минуту.
    if (rec.reassign <= this.t && !this.prison.holdCrew) {
      this._reassign(rec);
    }
    this._follow(rec, (r) => this._arrive(r));
    npc = rec.npc;
  }

  _reassign(rec) {
    const ph = this.phase.id;
    const meal = ph === 'breakfast' || ph === 'lunch' || ph === 'dinner';
    if (meal && rec.stage === 'tray') {
      this._go(rec, this._destFor(rec));
      rec.stage = 'seat';
      rec.reassign = this.t + this.rng.range(8, 16);
      return;
    }
    if (meal && rec.stage === 'seat' && rec.assigned) { rec.reassign = this.t + 30; return; }
    const d = this._destFor(rec);
    this._go(rec, d);
    rec.assigned = true;
    const free = ph === 'yard' || ph === 'rec' || ph === 'work';
    rec.reassign = this.t + (free ? this.rng.range(35, 100) : this.rng.range(60, 120));
  }

  _tickGuard(g, dt) {
    const npc = g.npc;
    if (!npc) return;
    if (npc.removed) { g.npc = null; return; }
    if (npc.isDead) {
      if (g.alive) {
        g.alive = false;
        g.reviveDay = this.day + 1;
        this.prison._onGuardDied(g, npc);
      }
      return;
    }
    if (npc.state === NPC_STATE.FIGHT || npc.isDown || npc.state === NPC_STATE.STUMBLE || npc.cast > 0) { g.path = null; g.arrived = true; return; }
    if (g.hold > this.t) {
      const p = this.game.player.position;
      npc.heading = dampAngle(npc.heading, Math.atan2(p.x - npc.position.x, p.z - npc.position.z), 8, dt);
      return;
    }
    if (g.escort) return;
    if (g.arrived && npc.state === NPC_STATE.WALK) this._goGuard(g, g.dest);
    if (g.kind === 'patrol' && g.arrived) {
      g.wait -= dt;
      if (g.wait <= 0 && !this.prison.holdCrew) {
        g.idx++;
        g.wait = this.rng.range(3, 8);
        this._goGuard(g, this._guardDest(g));
      }
    } else if (g.kind === 'post' && g.arrived) {
      const d = Math.hypot(npc.position.x - g.dest.x, npc.position.z - g.dest.z);
      if (d > 1.5) this._goGuard(g, g.dest);
    }
    if (g.reassign <= this.t && !g.assigned) {
      g.assigned = true;
      this._goGuard(g, this._guardDest(g));
    }
    this._follow(g, (r) => this._arriveGuard(r));
  }

  // ------------------------------------------------------------------ управление извне
  // Телепортировать всех на места текущего расписания (после перемотки времени).
  snapAll() {
    if (!this.spawned) return;
    this.circles.length = 0;
    const meal = this.phase && ['breakfast', 'lunch', 'dinner'].includes(this.phase.id);
    for (const rec of this.inmates) {
      if (!rec.npc || rec.npc.isDead) continue;
      rec.stage = meal ? 'seat' : null;
      if (rec.following) continue;
      this._place(rec, this._destFor(rec));
      rec.assigned = true;
      rec.reassign = this.t + this.rng.range(30, 80);
    }
    for (const g of this.guards) {
      if (!g.npc || g.npc.isDead) continue;
      g.idx += 1;
      this._placeGuard(g, this._guardDest(g));
      g.assigned = true;
    }
  }

  setLockdown(on) {
    if (this.lockdown === on) return;
    this.lockdown = on;
    for (const rec of this.inmates) {
      if (!rec.npc || rec.npc.isDead || rec.following) continue;
      rec.reassign = this.t + this.rng.range(0, 4);
      rec.assigned = false;
    }
  }

  hold(rec, seconds) { rec.hold = this.t + seconds; }

  // Телепорт на тюремную позицию (игрок «расставляет» всех при приёме и т.п.).
  recomputeAll() { this.snapAll(); }

  // Не драться с охраной: заключённые «забывают» цель после тревоги.
  calmAll() {
    for (const rec of this.inmates) {
      const n = rec.npc;
      if (n && !n.isDead && n.state === NPC_STATE.FIGHT && !rec.following) n.dropTarget();
    }
    for (const g of this.guards) {
      const n = g.npc;
      if (n && !n.isDead && n.state === NPC_STATE.FIGHT) n.dropTarget();
    }
  }
}
