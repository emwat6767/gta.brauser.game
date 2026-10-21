import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NPC, NPC_STATE } from './npc.js';
import { Vehicle } from './vehicle.js';
import { Helicopter } from './helicopter.js';
import { AIDriver, RoadNetwork } from './traffic.js';
import { lineOfSight, teamOf } from './ballistics.js';
import { createRng } from './utils.js';
import { COUNTRIES, countryById, DIFFICULTY, ROLES, ORDERS, UNIT_CLASSES, WAR_CONFIG as WC, soldierLook, presidentLook, playerWarLook, rankFor } from './war-data.js';
import { WarBuilder } from './war-build.js';
import { layoutBase, layoutTown, layoutVillage, layoutCountry, layoutPoint, layoutHamlet } from './war-layout.js';
import { Arena } from './war-arena.js';
import { Navigator, WarBrain, attachDriver, HeliPilot } from './war-ai.js';
import { WarUI } from './war-ui.js';

// «Война стран»: выбираешь страну и роль (президент или солдат) — и воюешь с другими странами. Война идёт НЕ в городе, а на отдельном поле боя
// далеко за его границами (war-arena.js): так не страдают прохожие. Начало — телепорт на базу своей страны, конец — возврат туда, откуда ушёл.
//
//   Страны: у каждой база в углу поля боя (штаб-бункер президента, казармы, ангар техники, вертолётная площадка, мешки, дот),
//           армия из пехоты (стрелки, штурмовики, гранатомётчики, снайперы) и техники (джип, БТР, грузовик, танк, вертолёт).
//   Цель:   билеты. Погиб солдат — минус билет, уничтожена техника — минус 4; пункты захвата (городок в центре и четыре хутора на перекрёстках)
//           отнимают билеты у отстающих. У кого билеты кончились — капитулирует; убили президента — страна сдаётся сразу.
//   Роли:   президент — командует (U: атака / оборона / за мной / танк / БТР / вертолёт / авиаудар), его охраняют;
//           солдат — растёт в званиях за убитых, садится в любую технику (угнанная воюет за вас).
//   Пока идёт война, город спит: прохожие убраны, банды, полиция, трафик и происшествия отключены.
//
// Подсистемы: war-data (страны, звания), war-arena (поле боя), war-build (постройки), war-layout (базы и деревни),
// war-ai (маршруты и мозг солдат), war-ui (меню и HUD).

const TEAM_COLORS = (id) => countryById(id)?.color ?? '#ffffff';
const _v = new THREE.Vector3();

export class WarSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.state = 'off';          // 'off' | 'running' | 'ended'
    this.nav = new Navigator(game);
    this.ui = new WarUI(this);
    this.teams = [];
    this.points = [];
    this.builder = null;
    this.time = 0;
    this.cache = { t: -9, inf: [], veh: [] };
    this.civilianScale = 1;
    this.rng = createRng(2024);
    this.summary = null;

    game.events.on('character:killed', ({ target, attacker, kind }) => this._onKilled(target, attacker, kind));
    game.events.on('vehicle:exploded', ({ vehicle, by }) => this._onVehicleLost(vehicle, by));
    game.events.on('player:down', () => this._onPlayerDown());
  }

  // ------------------------------------------------------------ запуск и остановка

  get player() { return this.game.player; }
  get playerTeam() { return this.teams.find((t) => t.isPlayer) ?? null; }
  teamById(id) { return this.teams.find((t) => t.id === id) ?? null; }

  // Можно ли начать войну сейчас (null — можно, иначе причина).
  blocker() {
    const g = this.game;
    if (this.active) return 'Война уже идёт';
    if (g.prison?.inCustody) return 'В тюрьме не до войны';
    if (g.duel?.active) return 'Закончите дуэль героя и злодея (B)';
    if (g.heists?.active) return 'Закончите ограбление';
    if (g.missions?.active) return 'Сначала закончите задание банды';
    if (g.player.isDead || g.downState) return 'Подождите возрождения';
    return null;
  }

  // opts: { country, role: 'president' | 'soldier', rivals: 1..3, difficulty: 'easy' | 'normal' | 'hard' }
  start(opts) {
    const g = this.game;
    const why = this.blocker();
    if (why) { g.hud.toast(why, 2.5); return false; }
    const world = g.world;
    const diff = DIFFICULTY[opts.difficulty] ?? DIFFICULTY.normal;
    this.opts = { ...opts };
    // на телефоне армии меньше
    this.diff = g.input.touchActive ? { ...diff, army: Math.round(diff.army * 0.65) } : diff;
    this.role = opts.role === 'president' ? 'president' : 'soldier';
    const mine = countryById(opts.country) ?? COUNTRIES[0];
    const rivalPool = COUNTRIES.filter((c) => c.id !== mine.id);
    for (let i = rivalPool.length - 1; i > 0; i--) { const j = Math.floor(this.rng.next() * (i + 1)); [rivalPool[i], rivalPool[j]] = [rivalPool[j], rivalPool[i]]; }
    const rivals = rivalPool.slice(0, Math.max(1, Math.min(3, opts.rivals ?? 3)));
    const countries = [mine, ...rivals];

    // Город остаётся спать, а война идёт на отдельном поле боя далеко за ним: ни прохожих, ни домов города, некому погибнуть зря.
    this._saveCity();
    this._purgeCity();
    this.arena = new Arena(g, Math.floor(this.rng.next() * 1e6));
    world.enterArena(this.arena);
    this._oldRoads = g.roads;
    g.roads = new RoadNetwork(world);
    this.nav = new Navigator(g);
    this._fogSwap();
    const arena = this.arena;
    // Угловые клетки — базы (своя — случайная), остальные углы станут деревнями.
    const corners = [...arena.corners];
    for (let i = corners.length - 1; i > 0; i--) { const j = Math.floor(this.rng.next() * (i + 1)); [corners[i], corners[j]] = [corners[j], corners[i]]; }
    for (const c of arena.centerCells) c.kind = 'village';
    ['forest', 'farm', 'farm', 'forest', 'forest', 'farm', 'farm', 'forest'].forEach((k, i) => { arena.edgeCells[i].kind = k; });
    this.builder = new WarBuilder(g, { y0: 0 });
    const town = layoutTown(this.builder, arena);
    this.teams = countries.map((c, i) => {
      corners[i].kind = 'base';
      return {
        id: c.id, country: c, isPlayer: i === 0, tickets: diff.tickets, maxTickets: diff.tickets, alive: true, block: corners[i],
        base: layoutBase(this.builder, corners[i], c), soldiers: [], vehicles: [], president: null, guards: [], waveTimer: 2 + i, vehTimer: 40 + i * 9,
        mode: 'attack', kills: 0, lost: 0, points: 0, score: 0, vehCount: 0, heliOut: false,
      };
    });
    for (const b of corners.slice(countries.length)) { b.kind = 'village'; layoutVillage(this.builder, b); }
    this._makePoints(town);
    for (const b of arena.edgeCells) layoutCountry(this.builder, arena, b);
    arena.finishFields();
    arena.plantTrees(this.builder.reserved, this.builder.structures);
    const mm = arena.minimapCanvas(this.builder.structures);
    g.minimap.setMap(mm.canvas, mm.rect);

    // Города и мир затихают.
    this.active = true;
    this.state = 'running';
    this.time = 0;
    this.bleedTimer = WC.bleedEvery;
    this.reassignTimer = 6;
    this.civilianScale = 0;
    this._lodSwap();
    g.wanted.frozen = true;
    g.wanted.clear();
    g.squad?.dismiss(true);
    if (g.powers.mode !== 'normal') g.powers.set('normal');
    for (const b of g.bosses?.list ?? []) b.suspend();   // злодей и герой города уходят на время войны
    g.hud.hideBigMessage?.();

    for (const t of this.teams) this._initTeam(t);
    this._initPlayer();
    this.summary = { startedAt: performance.now(), kills0: g.stats.total.kills };
    g.stats.total.wars++;
    g.stats._bump?.();
    const names = this.teams.slice(1).map((t) => t.country.name).join(', ');
    g.hud.showBigMessage(`ВОЙНА: ${mine.name} против ${names}`, '#ffd166');
    setTimeout(() => g.hud.hideBigMessage?.(), 3200);
    g.events.emit('war:start', { teams: this.teams.map((t) => t.id) });
    this.ui.onStart();
    return true;
  }

  // Конец войны: result — 'win' | 'loss' | 'quit'.
  stop(result = 'quit') {
    if (!this.active) return;
    const g = this.game;
    this.active = false;
    this.state = 'off';
    // Игрока — из техники, убрать армии, стройки, вернуть город.
    if (g.player.vehicle) g.player.exitVehicle();
    for (const t of this.teams) {
      for (const n of [...t.soldiers, ...t.guards, t.president].filter(Boolean)) {
        n.brain?._releaseCover?.();
        if (n.vehicle) n.exitVehicle();
        g.npcs.remove(n);
      }
      for (const v of [...t.vehicles]) {
        if (v.driver && v.driver !== g.player) g.npcs.remove(v.driver);
        for (const p of v.passengers) if (p) g.npcs.remove(p);
        if (v.driver !== g.player) g.removeVehicle(v);
      }
    }
    for (const v of [...g.vehicles]) if (v.team && v.driver !== g.player) { if (v.driver) g.npcs.remove(v.driver); g.removeVehicle(v); }
    // Брошенные оружейные пикапы войны и экипировка игрока.
    this.builder?.dispose();
    this.builder = null;
    this.points = [];
    this._leaveArena();
    this._restoreCity();
    this._restorePlayer();
    for (const b of g.bosses?.list ?? []) b.unsuspend();
    g.wanted.frozen = false;
    this.civilianScale = 1;
    this.teams = [];
    g.events.emit('war:end', { result });
    this.ui.onEnd();
    g.save?.markDirty();
  }

  // ------------------------------------------------------------ подготовка города

  _lodSwap() {
    const N = CONFIG.npc;
    this._saved = { vis: N.visibleDistance, lod: N.lodDistance, freeze: N.freezeDistance };
    N.visibleDistance = WC.visibleDistance;
    N.lodDistance = WC.lodDistance;
    N.freezeDistance = WC.freezeDistance;
  }

  _saveCity() {
    this._savedLook = { ...this.player.model.look };
    this._savedPos = this.player.position.clone();
    this._savedHeading = this.player.heading;
    this._savedYaw = this.game.cameraRig.yaw;
  }

  // Над полем боя туман ближе: города не видно.
  _fogSwap() {
    const f = this.game.scene.fog;
    if (!f) return;
    this._fog = { near: f.near, far: f.far };
    f.near = Math.min(f.near, 150);
    f.far = Math.min(f.far, 620);
  }

  _leaveArena() {
    const g = this.game;
    const f = g.scene.fog;
    if (f && this._fog) { f.near = this._fog.near; f.far = this._fog.far; }
    g.minimap.resetMap();
    g.world.leaveArena();
    if (this._oldRoads) g.roads = this._oldRoads;
    this.arena?.dispose();
    this.arena = null;
    this.nav = new Navigator(g);
  }

  _purgeCity() {
    const g = this.game;
    for (const n of [...g.npcs.list]) {
      if (n.role === 'civilian' || n.role === 'gang' || n.role === 'police') {
        if (n.vehicle && n.vehicle.driver === g.player) continue;
        g.npcs.remove(n);
      }
    }
    for (const v of [...g.vehicles]) {
      if (v.persistent || v.driver === g.player || v.team) continue;
      if (v.driver) g.npcs.remove(v.driver);
      g.removeVehicle(v);
    }
    if (g.traffic) { g.traffic.cars = []; g.traffic.parked = []; }
    if (g.incidents) g.incidents.active = [];
  }

  _restoreCity() {
    const g = this.game;
    const N = CONFIG.npc;
    // прохожие возвращаются сразу, а не по одному в секунду
    const p = this._savedPos ?? g.player.position;
    for (let k = 0; k < 70; k++) g.npcs._spawnSpread?.(p, 30, 150);
    if (this._saved) { N.visibleDistance = this._saved.vis; N.lodDistance = this._saved.lod; N.freezeDistance = this._saved.freeze; }
  }

  // ------------------------------------------------------------ пункты захвата

  _makePoints(cap) {
    const world = this.game.world;
    const L = world.roadLines;
    const nodes = [
      { name: 'Столица', x: cap.x, z: cap.z, weight: 3, capital: true, flag: cap.flag },
      { name: 'Альфа', x: L[2], z: L[1] }, { name: 'Браво', x: L[1], z: L[2] }, { name: 'Чарли', x: L[2], z: L[3] }, { name: 'Дельта', x: L[3], z: L[2] },
    ];
    for (const n of nodes) if (!n.capital) layoutHamlet(this.builder, n);
    this.points = nodes.map((n, i) => {
      let flag;
      if (n.capital) flag = this.builder.flagpole(n.flag.x, n.flag.z, null, { height: 12 });
      else flag = layoutPoint(this.builder, n).flag;
      const ring = this.builder.ring(n.x, n.z, WC.captureRadius, 0xb9bcc0);
      return { id: i, name: n.name, x: n.x, z: n.z, weight: n.weight ?? 1, capital: !!n.capital, owner: null, ctrl: {}, present: {}, flag, ring, contested: false, label: n.capital ? 'С' : n.name[0] };
    });
    // Начальные владельцы: каждая страна берёт ближайшую свободную точку.
    const free = new Set(this.points.filter((p) => !p.capital));
    for (const t of this.teams) {
      let best = null, bd = Infinity;
      for (const p of free) {
        const d = Math.hypot(p.x - t.block.cx, p.z - t.block.cz);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { free.delete(best); this._setOwner(best, t.id, true); }
    }
  }

  _setOwner(p, id, quiet = false) {
    p.owner = id;
    for (const k of Object.keys(p.ctrl)) p.ctrl[k] = k === id ? 1 : 0;
    if (id) p.ctrl[id] = 1;
    const c = id ? countryById(id) : null;
    p.flag.setCountry(id);
    p.ring.setColor(c ? new THREE.Color(c.color) : new THREE.Color(0xb9bcc0));
    if (!quiet) {
      const mine = this.playerTeam;
      this.game.hud.announce(id ? `${p.name}: ${c.name}` : p.name, c?.color ?? '#fff');
      if (mine && id === mine.id) this.game.wallet.add(250);
      this.game.events.emit('war:capture', { point: p, owner: id });
    }
  }

  _updatePoints(dt) {
    for (const p of this.points) {
      const count = {};
      const r2 = WC.captureRadius ** 2;
      for (const e of this._allInfantry()) {
        if (e.team && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r2) count[e.team] = (count[e.team] ?? 0) + 1;
      }
      p.present = count;
      const ids = Object.keys(count);
      p.contested = ids.length > 1;
      // Побеждает тот, кого на пункте больше (чистый перевес считается бойцами, максимум 4).
      const ranked = ids.sort((a, b) => count[b] - count[a]);
      if (ranked.length) {
        const id = ranked[0];
        const lead = count[id] - (ranked[1] ? count[ranked[1]] : 0);
        const n = Math.min(4, lead);
        if (n > 0 && p.owner !== id) {
          p.ctrl[id] = Math.min(1, (p.ctrl[id] ?? 0) + WC.captureRate * n * dt);
          if (p.owner) p.ctrl[p.owner] = Math.max(0, (p.ctrl[p.owner] ?? 1) - WC.captureRate * n * dt);
          if (p.ctrl[id] >= 1) this._setOwner(p, id);
        }
      }
      // Свободная точка медленно «остывает».
      p.flag.mat.color.set(p.owner ? 0xffffff : 0xb9bcc0);
      if (p.ring) p.ring.mat.opacity = p.contested ? 0.3 + 0.12 * Math.sin(this.time * 6) : 0.22;
    }
  }

  // Очки команд за пункты (столица — двойные).
  _scores() {
    const sc = {};
    for (const t of this.teams) sc[t.id] = 0;
    for (const p of this.points) if (p.owner && sc[p.owner] != null) sc[p.owner] += p.weight;
    return sc;
  }

  // ------------------------------------------------------------ команды и армии

  _initTeam(t) {
    const g = this.game;
    const L = t.base;
    // оружие на базе
    for (const c of L.crates) {
      const it = g.pickups._create(c.x, c.z, c.weapon, 90, true);
      this.builder.pickups.push(it);
    }
    // президент ИИ (если им не будет игрок)
    const playerPresident = t.isPlayer && this.role === 'president';
    if (!playerPresident && L.president) this._spawnPresident(t);
    // стартовая армия — половина
    const start = Math.ceil(this.diff.army * 0.6);
    for (let i = 0; i < start; i++) this._spawnSoldier(t, null, { order: i % 2 ? 'defend' : 'attack', initial: true });
    // техника: джип и танк с самого начала, БТР позже
    t.vehTimer = 30 + this.rng.range(0, 25);
    if (!t.isPlayer || this.role === 'soldier') {
      this._spawnVehicle(t, 'jeep', { crew: 1 });
      this._spawnVehicle(t, 'tank', { crew: 1 });
    } else {
      this._spawnVehicle(t, 'jeep', { crew: 0 });
    }
  }

  _spawnPresident(t) {
    const g = this.game;
    const L = t.base;
    const look = presidentLook(this.rng, t.country);
    const n = new NPC(g, this.rng, { x: L.president.x, z: L.president.z, role: 'soldier', look, weapon: 'pistol', name: t.country.leader, team: t.id });
    n.team = t.id;
    n.warColor = t.country.color;
    n.tagline = `${t.country.name} · глава государства`;
    n.isPresident = true;
    n.maxHealth = n.health = 220;
    n.brain = new WarBrain(this, n, { team: t.id, cls: 'president', sight: 45, spread: this.diff.spread, fireScale: 0.5 });
    n.brain.order = 'guard';
    n.brain.home = { x: L.president.x, z: L.president.z, face: L.president.face };
    n.heading = L.president.face;
    n._enter(NPC_STATE.WAR);
    g.npcs.add(n);
    t.president = n;
    // охрана у штаба
    for (let i = 0; i < 4; i++) {
      const a = L.president.face + (i - 1.5) * 0.9;
      const gx = L.president.x + Math.sin(a) * 3.2, gz = L.president.z + Math.cos(a) * 3.2;
      const s = this._spawnSoldier(t, { x: gx, z: gz }, { order: 'guard', cls: 'rifle', initial: true });
      if (s) { s.brain.home = { x: gx, z: gz, face: a }; t.guards.push(s); t.soldiers.splice(t.soldiers.indexOf(s), 1); }
    }
  }

  _pickClass(t) {
    const r = this.rng.next();
    let acc = 0;
    // снайперов немного: не больше 2
    const snipers = t.soldiers.filter((s) => s.brain?.cls === 'sniper').length;
    for (const c of UNIT_CLASSES) {
      acc += c.weight;
      if (r < acc && !(c.id === 'sniper' && snipers >= 2)) return c;
    }
    return UNIT_CLASSES[0];
  }

  _spawnSoldier(t, at = null, { order = 'attack', cls = null, initial = false, vehicle = null } = {}) {
    const g = this.game;
    const c = cls ? UNIT_CLASSES.find((u) => u.id === cls) ?? UNIT_CLASSES[0] : this._pickClass(t);
    let pos = at;
    if (!pos) {
      for (let k = 0; k < 8 && !pos; k++) {
        const sp = this.rng.pick(t.base.spawn);
        const cand = { x: sp.x + this.rng.range(-2, 2), z: sp.z + this.rng.range(-2, 2) };
        if (g.world.isCircleFree(cand.x, cand.z, 0.5)) pos = cand;
      }
      if (!pos) return null;
    }
    const look = soldierLook(this.rng, t.country, c.id);
    const first = this.rng.pick(t.country.first), last = this.rng.pick(t.country.last);
    const rank = this.rng.pick(['рядовой', 'ефрейтор', 'сержант']);
    const n = new NPC(g, this.rng, { x: pos.x, z: pos.z, role: 'soldier', look, weapon: c.weapon, name: `${rank} ${first} ${last}`, team: t.id });
    n.team = t.id;
    n.warColor = t.country.color;
    n.tagline = `${t.country.name} · ${c.name}`;
    n.war = true;
    const sightBy = { rifle: 75, assault: 55, rpg: 110, sniper: 160 };
    n.brain = new WarBrain(this, n, {
      team: t.id, cls: c.id, sight: sightBy[c.id] ?? 70, spread: this.diff.spread * (c.id === 'sniper' ? 0.3 : 1), fireScale: c.id === 'assault' ? 0.8 : 0.6,
    });
    n.heading = this.rng.range(-3, 3);
    n._enter(NPC_STATE.WAR);
    g.npcs.add(n);
    t.soldiers.push(n);
    if (!vehicle) this._giveOrder(n, t, order, initial);
    return n;
  }

  // Приказ одному солдату (по режиму команды).
  _giveOrder(n, t, order = null, initial = false) {
    const mode = order ?? t.mode;
    const b = n.brain;
    if (mode === 'follow' && t.isPlayer) {
      b.order = 'follow';
      b.leader = this.player;
      b.slot = t.soldiers.indexOf(n);
      return;
    }
    const obj = this._objectiveFor(t, n, mode === 'defend' || initial && mode !== 'attack');
    if (!obj) return;
    b.goTo(obj.x, obj.z, { order: obj.defend ? 'defend' : 'attack' });
  }

  // Куда идти солдату: ближайшие чужие пункты (разным — разные), при обороне — свои пункты и база.
  _objectiveFor(t, n, defend = false) {
    const mine = this.points.filter((p) => p.owner === t.id);
    const enemy = this.points.filter((p) => p.owner !== t.id);
    const near = (list) => [...list].sort((a, b) => Math.hypot(a.x - t.block.cx, a.z - t.block.cz) - Math.hypot(b.x - t.block.cx, b.z - t.block.cz));
    if (defend || !enemy.length) {
      const own = mine.length ? near(mine) : [];
      if (own.length) {
        const p = own[(this.rng.int(0, Math.max(0, Math.min(1, own.length - 1))))];
        return { x: p.x + this.rng.range(-4, 4), z: p.z + this.rng.range(-4, 4), defend: true };
      }
      // нет пунктов — держим базу
      return { x: t.base.hq.x - Math.sign(t.base.hq.x - t.block.cx) * 12, z: t.base.hq.z - 14, defend: true };
    }
    const list = near(enemy);
    // каждый второй рвётся к столице (она даёт тройные очки), остальные — на ближайшие чужие пункты, иногда — на чужую базу
    const capital = this.points[0];
    if (capital.owner !== t.id && this.rng.chance(0.4)) return { x: capital.x + this.rng.range(-8, 8), z: capital.z + this.rng.range(-8, 8), defend: false };
    const r = this.rng.next();
    if (!enemy.length || (mine.length >= this.points.length - 1 && r < 0.5)) {
      const other = this.teams.filter((o) => o !== t && o.alive);
      if (other.length) {
        const ot = this.rng.pick(other);
        return { x: ot.base.hq.x + this.rng.range(-8, 8), z: ot.base.hq.z + this.rng.range(-8, 8), defend: false };
      }
    }
    const p = r < 0.6 ? list[0] : list[Math.min(1, list.length - 1)];
    return { x: p.x + this.rng.range(-5, 5), z: p.z + this.rng.range(-5, 5), defend: false };
  }

  // Техника: type — 'jeep' | 'apc' | 'tank' | 'truck' | 'heli'; crew — сколько бойцов в десанте (БТР, грузовик).
  _spawnVehicle(t, type, { crew = 0, objective = null, free = true } = {}) {
    const g = this.game;
    const L = t.base;
    let slot = null;
    if (type === 'heli') slot = L.pad ? { x: L.pad.x, z: L.pad.z, heading: 0 } : null;
    else slot = L.yard.find((s) => s.type === type) ?? L.yard[0];
    if (!slot) return null;
    // место занято — подвигаем в сторону
    if (g.vehicles.some((v) => !v.wrecked && v.distanceToPoint(slot.x, slot.z) < 2.5)) {
      slot = { ...slot, x: slot.x + Math.sin(slot.heading + Math.PI / 2) * 6, z: slot.z + Math.cos(slot.heading + Math.PI / 2) * 6 };
      if (g.vehicles.some((v) => !v.wrecked && v.distanceToPoint(slot.x, slot.z) < 2.5)) return null;
    }
    const c = t.country;
    const opts = { x: slot.x, z: slot.z, heading: slot.heading, color: parseInt(c.uniform.slice(1), 16), type, livery: { roof: parseInt(c.color.slice(1), 16), stripe: c.camo } };
    const v = type === 'heli' ? new Helicopter(g, opts) : new Vehicle(g, opts);
    v.team = t.id;
    v.persistent = true;
    if (type === 'heli') v.position.y = g.world.getGroundHeight(slot.x, slot.z);
    g.addVehicle(v);
    t.vehicles.push(v);
    t.vehCount++;
    if (!free) return v;
    const driver = this._spawnSoldier(t, { x: slot.x, z: slot.z }, { cls: 'rifle', vehicle: v });
    if (!driver) return v;
    t.soldiers.splice(t.soldiers.indexOf(driver), 1);
    driver.enterVehicle(v);
    driver.brain.vehicle = v;
    const obj = this._roadSpot(objective ?? this._objectiveFor(t, driver, false));
    if (type === 'heli') {
      const target = this._enemyCenter(t);
      v.ai = new HeliPilot(g, v, target, { alt: 24 + this.rng.range(0, 8), radius: 40 + this.rng.range(0, 25) });
    } else {
      attachDriver(g, v, AIDriver, obj);
      v.warObjective = obj;
      v.arrived = false;
    }
    // десант
    for (let i = 0; i < Math.min(crew, v.passengers.length) && type !== 'tank' && type !== 'jeep' && type !== 'heli'; i++) {
      const s = this._spawnSoldier(t, { x: slot.x, z: slot.z }, { vehicle: v });
      if (!s) break;
      s.enterAsPassenger(v, i);
      s.brain.vehicle = v;
      s.brain.goTo(obj.x, obj.z, { order: 'attack' });
    }
    if (type === 'jeep') {
      // джип берёт одного пассажира-стрелка
      const s = this._spawnSoldier(t, { x: slot.x, z: slot.z }, { vehicle: v, cls: 'rifle' });
      if (s) { s.enterAsPassenger(v, 0); s.brain.vehicle = v; }
    }
    return v;
  }

  // Техника едет только по улицам: цель — ближайший к точке перекрёсток (пехота дойдёт сама).
  _roadSpot(o) {
    const p = this.nav.pos(this.nav.node(o.x, o.z));
    return { x: p.x, z: p.z, defend: o.defend };
  }

  _enemyCenter(t) {
    const others = this.teams.filter((o) => o !== t && o.alive);
    const pts = this.points.filter((p) => p.owner !== t.id);
    if (pts.length) {
      const p = pts.sort((a, b) => Math.hypot(a.x - t.block.cx, a.z - t.block.cz) - Math.hypot(b.x - t.block.cx, b.z - t.block.cz))[0];
      return new THREE.Vector3(p.x, 0, p.z);
    }
    const o = others[0];
    return new THREE.Vector3(o?.base.hq.x ?? 0, 0, o?.base.hq.z ?? 0);
  }

  // Подкрепление ИИ: по расписанию новая техника (и новые бойцы по волнам).
  _updateTeam(t, dt) {
    t.soldiers = t.soldiers.filter((n) => !n.removed && !n.isDead);
    t.guards = t.guards.filter((n) => !n.removed && !n.isDead);
    t.vehicles = t.vehicles.filter((v) => !v.removed && !v.wrecked);
    if (t.president?.isDead) t.president = null;
    // волны
    t.waveTimer -= dt;
    const living = t.soldiers.length;
    const cap = Math.min(this.diff.army, Math.max(0, t.tickets - t.guards.length));
    if (t.waveTimer <= 0 && living < cap) {
      t.waveTimer = WC.respawnWave * (living < cap * 0.5 ? 0.6 : 1);
      const count = Math.min(WC.waveSize, cap - living);
      for (let i = 0; i < count; i++) this._spawnSoldier(t, null, { order: t.mode });
    }
    // техника
    t.vehTimer -= dt;
    const maxV = Math.round(WC.maxVehiclesPerSide * this.diff.vehicles);
    const auto = !(t.isPlayer && this.role === 'president');   // у игрока-президента технику вызывают приказом
    if (t.vehTimer <= 0 && auto) {
      t.vehTimer = this.rng.range(...WC.aiVehicleEvery) / this.diff.vehicles;
      if (t.vehicles.length < maxV && t.tickets > 20) {
        const types = this.time > 200 ? ['apc', 'tank', 'jeep', 'truck', 'heli', 'tank'] : ['apc', 'jeep', 'tank', 'truck'];
        let type = this.rng.pick(types);
        if (type === 'heli' && (t.heliOut || !t.base.pad)) type = 'tank';
        const v = this._spawnVehicle(t, type, { crew: type === 'apc' || type === 'truck' ? 5 : 0 });
        if (v && type === 'heli') t.heliOut = true;
      }
    }
    // техника ИИ: доехала — высаживает десант, потом берёт новую цель
    for (const v of t.vehicles) this._updateVehicleAI(t, v, dt);
    // охрана игрока-президента: поддерживаем 6 бойцов
    if (t.isPlayer && this.role === 'president') {
      t.guardTimer = (t.guardTimer ?? 0) - dt;
      if (t.guardTimer <= 0) {
        t.guardTimer = 8;
        const have = t.soldiers.filter((n) => n.brain.order === 'follow' && n.brain.guardOfPlayer).length;
        for (let i = have; i < ROLES.president.guards && t.tickets > 10; i++) {
          const n = this._spawnSoldier(t, null, { order: 'defend' });
          if (!n) break;
          n.brain.order = 'follow';
          n.brain.leader = this.player;
          n.brain.guardOfPlayer = true;
          n.brain.path = [];
        }
      }
    }
  }

  // Застрявшую технику ставим на ближайшую улицу и едем дальше.
  _rescue(v) {
    const L = this.game.world.roadLines;
    let bi = 0;
    for (let i = 1; i < L.length; i++) if (Math.abs(L[i] - v.position.x) < Math.abs(L[bi] - v.position.x)) bi = i;
    let bj = 0;
    for (let j = 1; j < L.length; j++) if (Math.abs(L[j] - v.position.z) < Math.abs(L[bj] - v.position.z)) bj = j;
    const alongZ = Math.abs(L[bi] - v.position.x) < Math.abs(L[bj] - v.position.z);
    const off = CONFIG.traffic.laneOffset;
    if (alongZ) { v.position.x = L[bi] + off; v.heading = v.warObjective && v.warObjective.z < v.position.z ? Math.PI : 0; }
    else { v.position.z = L[bj] - off; v.heading = v.warObjective && v.warObjective.x < v.position.x ? -Math.PI / 2 : Math.PI / 2; }
    v.position.y = this.game.world.getGroundHeight(v.position.x, v.position.z);
    v.velocity.set(0, 0, 0);
    v.forwardSpeed = 0;
    v.updateCircles();
    v.ai.attachToRoad();
  }

  _updateVehicleAI(t, v, dt = 0.05) {
    if (!v.driver || v.driver === this.player || !v.ai) return;
    if (v.spec.flies) return;
    // Сторож застревания: за 9 с проехали меньше 4 м — ставим на улицу.
    const w = (v.watch ??= { x: v.position.x, z: v.position.z, t: 0, n: 0 });
    w.t += dt;
    if (w.t > 9) {
      const moved = Math.hypot(v.position.x - w.x, v.position.z - w.z);
      w.n = !v.arrived && moved < 4 ? w.n + 1 : 0;
      w.x = v.position.x; w.z = v.position.z; w.t = 0;
      if (w.n >= 2) { w.n = 0; this._rescue(v); }
    }
    const obj = v.warObjective;
    if (!obj) return;
    const d = Math.hypot(v.position.x - obj.x, v.position.z - obj.z);
    if (d < 26 && Math.abs(v.forwardSpeed) < 3 && !v.arrived) {
      v.arrived = true;
      v.arriveTime = this.time;
      // высаживаем десант: пассажиры обороняют/штурмуют пункт
      for (const p of v.passengers) {
        if (!p || p.isDead) continue;
        p.exitPassenger();
        if (p.brain) {
          const o = this._objectiveFor(t, p, false);
          p.brain.goTo(o.x, o.z, { order: o.defend ? 'defend' : 'attack' });
        }
      }
    }
    // через полминуты после прибытия — новая цель (фронт движется)
    if (v.arrived && this.time - v.arriveTime > 35) {
      const o = this._roadSpot(this._objectiveFor(t, v.driver, false));
      v.warObjective = o;
      v.arrived = false;
      v.ai.target.position.set(o.x, 0, o.z);
      v.ai.replan();
    }
  }

  // ------------------------------------------------------------ игрок

  _initPlayer() {
    const g = this.game;
    const p = g.player;
    const t = this.playerTeam;
    p.team = t.id;
    p.isPresident = this.role === 'president';
    p.maxHealth = ROLES[this.role].health;
    this._savedMaxHealth = CONFIG.player.health;
    const spot = t.base.respawn ?? { x: t.base.hq?.x ?? t.block.cx, z: t.base.hq?.z ?? t.block.cz, heading: 0 };
    const keep = (({ skin, hair, hairStyle, beard, scale, bulk }) => ({ skin, hair, hairStyle, beard, scale, bulk }))(this._savedLook);
    p.model.setLook({ ...keep, ...playerWarLook(t.country, this.role) });
    p.respawn({ x: spot.x, z: spot.z + 1, heading: spot.heading });
    this._loadout();
    g.cameraRig.yaw = spot.heading + Math.PI;
    g.cameraRig.initialized = false;
    g.wallet.add(ROLES[this.role].funds);
    // охрана президента: её создаёт _updateTeam
    t.guardTimer = 1;
  }

  _loadout() {
    const p = this.player;
    p.giveWeapon('rifle', 120);
    p.giveWeapon('sniper', 25);
    p.giveWeapon('rpg', 6);
    p.arsenal.select('rifle');
    p.model.setWeapon('rifle');
  }

  _restorePlayer() {
    const g = this.game;
    const p = g.player;
    p.team = null;
    p.isPresident = false;
    p.maxHealth = CONFIG.player.health;
    if (this._savedLook) p.model.setLook(this._savedLook);
    // Возвращаемся в город туда, откуда ушли на войну.
    const back = this._savedPos ?? CONFIG.player.spawn;
    p.respawn({ x: back.x, z: back.z, heading: this._savedHeading ?? 0 });
    g.cameraRig.yaw = this._savedYaw ?? 0;
    g.cameraRig.initialized = false;
  }

  // Точка возрождения игрока на базе (вызывает Game._respawn).
  playerRespawnPoint() {
    const t = this.playerTeam;
    const s = t?.base.respawn;
    if (!s) return CONFIG.player.hospital;
    return { x: s.x + this.rng.range(-1, 1), z: s.z + this.rng.range(-1, 1), heading: s.heading };
  }

  onPlayerRespawn() {
    this._loadout();
    this.player.team = this.playerTeam.id;
    this.player.isPresident = this.role === 'president';
    this.player.health = this.player.maxHealth;
  }

  _onPlayerDown() {
    if (!this.active) return;
    const t = this.playerTeam;
    if (!t) return;
    t.tickets -= this.role === 'president' ? WC.presidentDeathTickets : WC.deathTickets;
    t.lost++;
    this.game.hud.toast(this.role === 'president' ? `Президент пал! Армия теряет ${WC.presidentDeathTickets} билетов` : 'Вы погибли — штаб вас вернёт', 3);
  }

  // ------------------------------------------------------------ события

  _onKilled(target, attacker) {
    if (!this.active) return;
    const g = this.game;
    const tid = teamOf(target);
    const aid = teamOf(attacker);
    if (!tid) return;
    const t = this.teamById(tid);
    if (!t) return;
    if (target === g.player) return;   // обрабатывает _onPlayerDown
    const at = aid ? this.teamById(aid) : null;
    if (at && at !== t) at.kills++;
    t.lost++;
    if (target.isPresident) {
      t.tickets = 0;
      if (attacker === g.player) {
        g.wallet.add(2000);
        g.hud.showBigMessage(`ПРЕЗИДЕНТ ${t.country.name.toUpperCase()} УБИТ`, '#ff4d4d');
        setTimeout(() => g.hud.hideBigMessage?.(), 2500);
      }
      g.hud.announce(`${t.country.leader} убит`, t.country.color);
      return;
    }
    t.tickets -= WC.deathTickets;
  }

  _onVehicleLost(v, by) {
    if (!this.active || !v.team) return;
    const t = this.teamById(v.team);
    if (!t) return;
    t.tickets -= WC.vehicleTickets;
    t.lost++;
    const at = teamOf(by) ? this.teamById(teamOf(by)) : null;
    if (at && at !== t) at.kills++;
    if (t.heliOut && v.spec.flies) t.heliOut = false;
    if (by === this.player || by?.driver === this.player) this.game.hud.toast(`Уничтожено: ${v.spec.name}`, 1.6);
  }

  // ------------------------------------------------------------ цели

  // Кэш живых людей и техники (раз в 0.2 с) — для поиска врагов.
  _refresh() {
    if (this.time - this.cache.t < 0.2) return;
    const g = this.game;
    this.cache.t = this.time;
    const inf = [], veh = [];
    for (const t of this.teams) {
      for (const n of [...t.soldiers, ...t.guards, t.president]) {
        if (n && !n.isDead && !n.removed && !n.vehicle) inf.push({ team: t.id, x: n.position.x, z: n.position.z, ref: n });
      }
    }
    const p = g.player;
    if (p.team && !p.isDead && !p.vehicle) inf.push({ team: p.team, x: p.position.x, z: p.position.z, ref: p });
    for (const v of g.vehicles) if (v.team && !v.wrecked && !v.removed) veh.push({ team: v.team, x: v.position.x, z: v.position.z, ref: v });
    this.cache.inf = inf;
    this.cache.veh = veh;
  }

  _allInfantry() {
    this._refresh();
    return this.cache.inf;
  }

  // Ближайший враг (человек или машина) в радиусе с проверкой прямой видимости: opts { vehicles: 'none'|'soft'|'all', infantry, los }.
  nearestEnemy(team, pos, range, { vehicles = 'soft', infantry = true } = {}) {
    this._refresh();
    const r2 = range * range;
    const found = [];
    if (infantry) {
      for (const e of this.cache.inf) {
        if (e.team === team) continue;
        const d2 = (e.x - pos.x) ** 2 + (e.z - pos.z) ** 2;
        if (d2 < r2) found.push([d2, e.ref]);
      }
    }
    if (vehicles !== 'none') {
      for (const e of this.cache.veh) {
        if (e.team === team) continue;
        if (vehicles === 'soft' && e.ref.spec.heavy) continue;
        if (vehicles === 'soft' && e.ref.spec.bulletResist != null && e.ref.spec.bulletResist < 0.5) continue;
        const d2 = (e.x - pos.x) ** 2 + (e.z - pos.z) ** 2;
        if (d2 < r2) found.push([d2 * (vehicles === 'all' ? 0.6 : 1), e.ref]);
      }
    }
    if (!found.length) return null;
    found.sort((a, b) => a[0] - b[0]);
    const eye = _v.set(pos.x, (pos.y ?? 0) + 1.5, pos.z);
    for (let i = 0; i < Math.min(3, found.length); i++) {
      const t = found[i][1];
      const tp = t.position;
      const aim = new THREE.Vector3(tp.x, (t.spec ? tp.y + 1.2 : (t.visualY ?? tp.y) + 1.2), tp.z);
      if (found[i][0] < 36 || lineOfSight(this.game, eye, aim)) return t;
    }
    return null;
  }

  // Для турелей техники: ближайший враг в радиусе (люди и техника).
  pickTarget(vehicle, pos, range) {
    return this.nearestEnemy(vehicle.team, pos, range, { vehicles: 'all', infantry: true });
  }

  // Ближайшее свободное укрытие для своих (threat — откуда стреляют: укрытие должно смотреть в ту сторону).
  findCover(pos, radius, team, threat, near = false) {
    const b = this.builder;
    if (!b) return null;
    let best = null, bs = Infinity;
    const r2 = radius * radius;
    for (const c of b.covers) {
      if (c.taken && !c.taken.isDead && !c.taken.removed) continue;
      const d2 = (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2;
      if (d2 > r2) continue;
      let score = d2;
      if (threat?.position) {
        const tx = threat.position.x - c.x, tz = threat.position.z - c.z;
        const l = Math.hypot(tx, tz) || 1;
        const dot = (tx / l) * Math.sin(c.face) + (tz / l) * Math.cos(c.face);
        score += (1 - dot) * 160;   // смотрит на врага — лучше
      }
      if (c.kind === 'window' || c.kind === 'slit') score -= near ? 12 : 4;
      if (score < bs) { bs = score; best = c; }
    }
    return best;
  }

  // ------------------------------------------------------------ приказы президента

  // Выполняет приказ игрока-президента; false — не вышло (нет денег, не та роль).
  issueOrder(id) {
    const g = this.game;
    const t = this.playerTeam;
    if (!t || !this.active) return false;
    if (this.role !== 'president') { g.hud.toast('Приказы отдаёт только президент', 2); return false; }
    const O = ORDERS.find((o) => o.id === id);
    if (!O) return false;
    if (O.cost && !g.wallet.canAfford(O.cost)) { g.hud.toast(`Не хватает денег: нужно $${O.cost}`, 2); return false; }
    if (['attack', 'defend', 'follow'].includes(id)) {
      t.mode = id;
      for (const n of t.soldiers) {
        if (n.brain.guardOfPlayer && id !== 'follow') continue;
        this._giveOrder(n, t, id);
      }
      g.hud.toast(`Приказ: ${O.name}`, 1.8);
      return true;
    }
    if (id === 'strike') return this._airstrike(O);
    // техника
    let v = null;
    const obj = this._objectiveFor(t, t.soldiers[0] ?? { }, false);
    if (id === 'tank') v = this._spawnVehicle(t, 'tank', { crew: 0, objective: obj });
    else if (id === 'apc') v = this._spawnVehicle(t, 'apc', { crew: 6, objective: obj });
    else if (id === 'heli') v = this._spawnVehicle(t, 'heli', {});
    if (!v) { g.hud.toast('На базе нет свободного места для техники', 2); return false; }
    g.wallet.spend(O.cost);
    g.hud.toast(`${O.name} выдвигается`, 2);
    return true;
  }

  _airstrike(O) {
    const g = this.game;
    if ((this.strikeCooldown ?? 0) > this.time) { g.hud.toast(`Авиаудар готов через ${Math.ceil(this.strikeCooldown - this.time)} с`, 2); return false; }
    // точка — куда смотрит перекрестье
    const cam = g.camera.position;
    const f = g.cameraRig.forward(new THREE.Vector3());
    const hit = this._aimAt(cam, f);
    g.wallet.spend(O.cost);
    this.strikeCooldown = this.time + 45;
    const team = this.playerTeam.id;
    g.hud.toast('Авиаудар: самолёты на подходе', 2.2);
    g.hud.showBigMessage('АВИАУДАР', '#ff9f1a');
    setTimeout(() => g.hud.hideBigMessage?.(), 1600);
    // серия взрывов вдоль линии захода
    const dir = new THREE.Vector3(Math.sin(g.cameraRig.yaw + Math.PI), 0, Math.cos(g.cameraRig.yaw + Math.PI));
    const start = hit.clone().addScaledVector(dir, -28);
    for (let i = 0; i < 8; i++) {
      this._later(2.2 + i * 0.22, () => {
        if (!this.active) return;
        const at = start.clone().addScaledVector(dir, i * 8).add(_v.set(this.rng.range(-3, 3), 0, this.rng.range(-3, 3)));
        at.y = g.world.getGroundHeight(at.x, at.z) + 0.5;
        g.vfx.explosion(at, {
          theme: 'fire', aoe: 8, damage: 150, force: 22, owner: g.player, big: true,
          only: (c) => teamOf(c) !== team && c !== g.player,
        });
      });
    }
    return true;
  }

  _aimAt(origin, dir) {
    // луч из камеры в мир (земля / здания) — для авиаудара
    const g = this.game;
    const o = origin.clone();
    for (let t = 6; t < 320; t += 3) {
      o.copy(origin).addScaledVector(dir, t);
      const gh = g.world.getGroundHeight(o.x, o.z);
      if (o.y <= gh + 0.2 || g.world.isPointInsideBuilding(o.x, o.y, o.z)) return o.clone();
    }
    return origin.clone().addScaledVector(dir, 120);
  }

  _later(sec, fn) {
    (this.timers ??= []).push({ t: sec, fn });
  }

  // ------------------------------------------------------------ каждый шаг

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    // отложенные действия (авиаудар)
    if (this.timers?.length) {
      for (const k of [...this.timers]) {
        k.t -= dt;
        if (k.t <= 0) { this.timers.splice(this.timers.indexOf(k), 1); k.fn(); }
      }
    }
    this._refresh();
    for (const t of this.teams) if (t.alive) this._updateTeam(t, dt);
    this._updatePoints(dt);
    // постепенная раздача целей: свободные бойцы идут дальше
    this.reassignTimer -= dt;
    if (this.reassignTimer <= 0) {
      this.reassignTimer = 7;
      for (const t of this.teams) {
        if (!t.alive) continue;
        for (const n of t.soldiers) {
          const b = n.brain;
          if (!b || n.vehicle || b.order === 'follow') continue;
          const done = b.pathIdx >= b.path.length;
          if (done && !b.cover && !b.target && (b.order === 'attack' || this.rng.chance(0.25))) {
            const o = this._objectiveFor(t, n, t.mode === 'defend');
            if (o) b.goTo(o.x, o.z, { order: o.defend ? 'defend' : 'attack' });
          } else if (done && b.order === 'defend' && b.cover && this.rng.chance(0.15) && t.mode === 'attack') {
            const o = this._objectiveFor(t, n, false);
            if (o) b.goTo(o.x, o.z, { order: 'attack' });
          }
        }
      }
    }
    // билеты уходят у отстающих по пунктам
    this.bleedTimer -= dt;
    if (this.bleedTimer <= 0) {
      this.bleedTimer = WC.bleedEvery;
      const sc = this._scores();
      const top = Math.max(...Object.values(sc));
      // лучшая по очкам (при равенстве — по билетам) страна усталости не знает: остальные выбывают раньше неё
      const alive = this.teams.filter((t) => t.alive);
      const best = [...alive].sort((a, b) => sc[b.id] - sc[a.id] || b.tickets - a.tickets)[0];
      for (const t of this.teams) {
        if (!t.alive) continue;
        const gap = top - sc[t.id];
        if (gap > 0) t.tickets -= Math.min(3, Math.ceil(gap / 2)) + (sc[t.id] === 0 ? 1 : 0);
        // усталость от войны: понемногу уходят билеты у всех (иначе стороны, равные по пунктам, могут стоять вечно)
        if (t !== best) {
          t.tired = (t.tired ?? 0) + 0.4;
          if (t.tired >= 1) { t.tired -= 1; t.tickets -= 1; }
        }
        t.score = sc[t.id];
      }
    }
    // капитуляция и итог (если все разом на нуле — побеждает та, у кого больше пунктов, потом убитых)
    const broke = this.teams.filter((t) => t.alive && t.tickets <= 0);
    if (broke.length && broke.length === this.teams.filter((t) => t.alive).length) {
      const sc = this._scores();
      const winner = [...broke].sort((a, b) => (sc[b.id] ?? 0) - (sc[a.id] ?? 0) || b.kills - a.kills)[0];
      winner.tickets = 1;
      broke.splice(broke.indexOf(winner), 1);
    }
    for (const t of broke) this._eliminate(t);
    const left = this.teams.filter((t) => t.alive);
    const mine = this.playerTeam;
    if (this.state === 'running') {
      if (mine && !mine.alive) this._finish('loss');
      else if (left.length <= 1) this._finish(left[0] === mine ? 'win' : 'loss');
    }
    // убрать тела бывших бойцов, кого заменили (только список)
    this.builder?.updateRoofs?.();
    // авто-регенерация здоровья игрока уже в Player; президент не умирает «от потери билетов»
  }

  // Каждый кадр (рендер): флаги и интерфейс.
  frame(dt) {
    if (!this.active) {
      this.ui.update(dt);
      return;
    }
    this.builder?.updateFlags(performance.now() / 1000);
    this.ui.update(dt);
  }

  _eliminate(t) {
    if (!t.alive) return;
    t.alive = false;
    t.tickets = 0;
    const g = this.game;
    g.hud.announce(`${t.country.name} капитулировала`, t.country.color);
    g.events.emit('war:eliminated', { team: t.id });
    // армия складывает оружие: бойцы исчезают через несколько секунд, техника глохнет
    for (const n of [...t.soldiers, ...t.guards, t.president].filter(Boolean)) {
      n.brain = null;
      n.panic = 5;
      this._later(5 + this.rng.range(0, 3), () => { if (!n.removed && n.vehicle == null) g.npcs.remove(n); });
      if (n.state === NPC_STATE.WAR) n._enter(NPC_STATE.WALK);
    }
    for (const v of t.vehicles) {
      if (v.driver && v.driver !== g.player) {
        const d = v.driver;
        v.ai = null;
        d.brain = null;
        this._later(6, () => { if (!d.removed) g.npcs.remove(d); if (!v.removed && v.driver !== g.player) g.removeVehicle(v); });
      }
    }
    for (const p of this.points) if (p.owner === t.id) this._setOwner(p, null, true);
    t.soldiers = []; t.guards = []; t.president = null;
  }

  _finish(result) {
    this.state = 'ended';
    const g = this.game;
    const mine = this.playerTeam;
    const kills = g.stats.total.kills - (this.summary?.kills0 ?? 0);
    const secs = Math.round((performance.now() - (this.summary?.startedAt ?? performance.now())) / 1000);
    if (result === 'win') { g.stats.total.wins++; g.wallet.add(5000); }
    g.stats._bump?.();
    this.ui.showEnd(result, { kills, secs, tickets: mine?.tickets ?? 0, rank: rankFor(g.stats.session.soldiers).name, role: ROLES[this.role].name, country: mine?.country, money: result === 'win' ? 5000 : 0 });
  }

  // ------------------------------------------------------------ данные для интерфейса

  rank() {
    return rankFor(this.game.stats.session.soldiers);
  }

  minimapMarks() {
    if (!this.active) return [];
    const out = [];
    for (const t of this.teams) {
      if (!t.alive || !t.base.hq) continue;
      out.push({ x: t.base.hq.x, z: t.base.hq.z, color: t.country.color, txt: t.country.short[0], big: true, pin: true, dark: t.country.id === 'jpn' || t.country.id === 'chn' });
    }
    for (const p of this.points) {
      const c = p.owner ? TEAM_COLORS(p.owner) : '#b9bcc0';
      out.push({ x: p.x, z: p.z, color: c, txt: p.label, big: p.capital, pin: true, dark: !p.owner || p.owner === 'jpn' || p.owner === 'chn' });
    }
    return out;
  }
}
