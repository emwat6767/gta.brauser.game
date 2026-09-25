import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NPC, NPC_STATE, LINES, gangLook } from './npc.js';
import { lineOfSight } from './ballistics.js';

// Банды — самостоятельные группировки со своими территориями (кварталы, видны на миникарте).
// Мир живёт без игрока: бандиты сами замечают врагов, дерутся, защищают район и нападают.
//
// Роли бойцов (npc.gangRole, CONFIG.gangs.roles):
//   guard  — стоит на посту своего квартала (группами по 2-3, болтают), после драки возвращается;
//   patrol — ходит по территории;
//   crew   — ездит по городу на машине банды (стреляет из окон, выходит драться);
//   raider — участник налёта на чужой квартал.
// Состояния ИИ (npc.state): idle / walk (патруль) / goto (к посту) / fight (атака, погоня) /
// retreat (ранен, отходит) / drive / follow (отряд игрока) / talk.
//
// Каждые 0.3 с "мозг" (_think) бойца рядом с игроком ищет врагов в поле зрения (sightRadius,
// прямая видимость): чужих бандитов, отряд игрока, самого игрока на своей территории. Нашёл —
// атакует и зовёт своих (callForHelp). Банды нападают друг на друга (налёты, _startRaid):
// налётчики приходят пешком или приезжают на машине, защитники района отбиваются; если район
// остался без защитников — он переходит к нападавшим. Далеко от игрока налёты не симулируются,
// а разрешаются "на бумаге" (новости в ленте событий). Кварталы переходят из рук в руки через
// transferBlock (его же использует turf.js для войн игрока).

const _eye = new THREE.Vector3(), _at = new THREE.Vector3();
const BUSY = new Set([NPC_STATE.FIGHT, NPC_STATE.RETREAT, NPC_STATE.STUMBLE, NPC_STATE.DOWN, NPC_STATE.GETUP, NPC_STATE.DEAD]);

function pickWeapon(rng, table) {
  let r = rng.next();
  for (const [type, p] of Object.entries(table)) if ((r -= p) < 0) return type;
  return null;
}

const blockCenter = (b) => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });

export class GangSystem {
  constructor(game) {
    const G = CONFIG.gangs;
    this.game = game;
    this.blockOwner = new Map(); // block -> gang
    this.gangs = G.list.map((def) => {
      const blocks = def.blocks.map(([i, j]) => game.world.blocks[j * game.world.blocksPerAxis + i]).filter(Boolean);
      const gang = { ...def, blocks, homeBlocks: [...blocks], nodes: new Set(), members: [], posts: [], respawnTimer: 0 };
      for (const b of blocks) this.blockOwner.set(b, gang);
      return gang;
    });
    this.byId = new Map(this.gangs.map((g) => [g.id, g]));
    for (const g of this.gangs) this._rebuild(g);
    this.currentZone = null;
    this._timer = 0;
    this.raids = [];
    this.cars = [];         // { vehicle, crew: [npc], gang, deployed }
    this.raidTimer = game.rng.range(30, 60);
    this.farRaidTimer = game.rng.range(...G.farRaidEvery);
    this.carTimer = 8;
    this._clashCooldown = new Map();

    for (const gang of this.gangs) {
      for (let k = 0; k < gang.targetSize; k++) this._spawnMember(gang, false);
    }

    // Банда игрока вступается за него и помогает в его драках.
    game.events.on('character:damaged', ({ target, attacker }) => this._onDamaged(target, attacker));
  }

  // Узлы тротуаров территории, численность банды и посты — по её текущим кварталам.
  // gang.nodes — один и тот же Set (на него ссылаются allowedNodes бандитов), меняем на месте.
  _rebuild(gang) {
    const W = this.game.world;
    gang.nodes.clear();
    for (const n of W.waypoints) if (gang.blocks.includes(n.block)) gang.nodes.add(n.id);
    gang.targetSize = gang.blocks.length * CONFIG.gangs.membersPerBlock;
    // Пост в каждом квартале — точка на стороне, обращённой к ближайшему чужому району.
    const rivals = this.gangs?.filter((g) => g !== gang && g.blocks.length) ?? [];
    gang.posts = gang.blocks.map((b) => {
      const nodes = W.waypoints.filter((n) => n.block === b && n.mid);
      let best = nodes[0], bestD = Infinity;
      for (const n of nodes) {
        for (const r of rivals) {
          for (const rb of r.blocks) {
            const c = blockCenter(rb);
            const d = (n.x - c.x) ** 2 + (n.z - c.z) ** 2;
            if (d < bestD) { bestD = d; best = n; }
          }
        }
      }
      return { node: best, block: b, guards: [] };
    });
  }

  // Квартал переходит к банде to (null — ничей). Бандиты прежнего хозяина уходят к своим.
  transferBlock(block, to) {
    const from = this.blockOwner.get(block) ?? null;
    if (from === to) return;
    if (from) {
      from.blocks.splice(from.blocks.indexOf(block), 1);
      this._rebuild(from);
      for (const m of from.members) {
        if (m.isDead || m.isBusy || m.follower) continue;
        m.post = null;
        if (!from.nodes.size) m.allowedNodes = null; // банда разгромлена — бродят где придётся
        else if (this.game.world.blockAt(m.position.x, m.position.z) === block) {
          m.prevNode = null;
          m._setTarget(m._nearestAllowedNode());
          if (m.state !== NPC_STATE.WALK) m._enter(NPC_STATE.WALK);
        }
      }
    }
    if (to) {
      to.blocks.push(block);
      this.blockOwner.set(block, to);
      this._rebuild(to);
    } else {
      this.blockOwner.delete(block);
    }
    // Посты соседей могли поменяться (ближайший враг стал другим).
    for (const g of this.gangs) if (g !== from && g !== to && g.blocks.length) this._rebuild(g);
    this.game.events.emit('turf:changed', { block, from, to });
  }

  isFriendlyToPlayer(gangId) {
    return !!this.byId.get(gangId)?.friendly;
  }

  gangAt(x, z) {
    const block = this.game.world.blockAt(x, z);
    return block ? this.blockOwner.get(block) ?? null : null;
  }

  // Новый боец банды в её районе (outOfView — подальше от игрока).
  _spawnMember(gang, outOfView) {
    const { game } = this;
    const p = game.player.position;
    const nodes = [...gang.nodes].map((id) => game.world.waypoints[id]);
    if (!nodes.length) return null;
    let spot = null;
    for (let attempt = 0; attempt < 20 && !spot; attempt++) {
      const from = game.rng.pick(nodes);
      const side = from.links.filter((n) => n.block === from.block);
      if (!side.length) continue;
      const to = game.rng.pick(side);
      const t = game.rng.range(0.1, 0.9);
      const x = from.x + (to.x - from.x) * t + game.rng.range(-1, 1);
      const z = from.z + (to.z - from.z) * t + game.rng.range(-1, 1);
      if (outOfView && (Math.hypot(x - p.x, z - p.z) < 60 || game.inView(x, 1, z, 2))) continue;
      spot = { x, z, from, to };
    }
    if (!spot) return null;
    const npc = new NPC(game, game.rng, {
      ...spot, role: 'gang', gang: gang.id, look: gangLook(game.rng, gang.color), allowedNodes: gang.nodes,
    });
    npc.idleTime = game.rng.range(0, 6);
    npc._enter(NPC_STATE.IDLE);
    this._assignRole(npc, gang);
    gang.members.push(npc);
    return game.npcs.add(npc);
  }

  // Роль: охранник (на свободный пост, до 3 на пост) или патрульный.
  _assignRole(npc, gang) {
    const R = CONFIG.gangs.roles;
    const post = gang.posts.filter((ps) => ps.guards.filter((g) => !g.isDead && !g.removed && g.post === ps).length < 3)
      .sort((a, b) => a.guards.length - b.guards.length)[0];
    if (post && this.game.rng.chance(R.guard / (R.guard + R.patrol))) {
      npc.gangRole = 'guard';
      npc.post = post;
      post.guards = post.guards.filter((g) => !g.isDead && !g.removed && g.post === post);
      post.guards.push(npc);
      npc.postAngle = post.guards.length * 2.1 + this.game.rng.range(-0.3, 0.3);
    } else {
      npc.gangRole = 'patrol';
    }
  }

  // Враг бойца m в поле зрения (радиус r): чужие бандиты, отряд игрока, игрок на территории.
  _spotEnemy(m, r) {
    const { game } = this;
    const gang = this.byId.get(m.gang);
    let best = null, bestD = r * r;
    for (const n of game.npcs.list) {
      if (n === m || n.isDead || n.removed || n.vehicle) continue;
      // Чужие бандиты и полиция, которая пришла за кем-то из своих.
      const hostile = n.role === 'gang' ? n.gang !== m.gang : n.role === 'police' && n.target?.gang === m.gang && n.target?.role === 'gang';
      if (!hostile) continue;
      const d2 = n.position.distanceToSquared(m.position);
      if (d2 < bestD) { bestD = d2; best = n; }
    }
    // Игрок: чужая банда видит его на своей территории (или налётчики — везде рядом).
    const p = game.player;
    if (gang && !gang.friendly && !p.vehicle && !p.isDead) {
      const d2 = p.position.distanceToSquared(m.position);
      const onTurf = this.gangAt(p.position.x, p.position.z) === gang || !!m.raid;
      if (onTurf && d2 < Math.min(bestD, (r * 0.75) ** 2)) { bestD = d2; best = p; }
    }
    if (!best) return null;
    _eye.set(m.position.x, m.position.y + 1.5, m.position.z);
    _at.set(best.position.x, best.position.y + 1.3, best.position.z);
    return lineOfSight(game, _eye, _at) ? best : null;
  }

  // Друзья жертвы в радиусе helpRadius нападают на обидчика.
  callForHelp(victim, attacker) {
    const gang = this.byId.get(victim.gang);
    if (!gang) return;
    if (attacker === this.game.player && gang.friendly) return;
    const r2 = CONFIG.gangs.helpRadius ** 2;
    for (const m of gang.members) {
      if (m === victim || m.isBusy || m.removed) continue;
      if (m.position.distanceToSquared(victim.position) < r2) m.aggro(attacker);
    }
  }

  _onDamaged(target, attacker) {
    const player = this.game.player;
    const who = attacker?.driver ?? attacker;
    if (!who || !who.position) return;
    const home = this.gangs.find((g) => g.friendly);
    if (!home) return;
    let enemy = null;
    if (target === player && who !== player && !(who.gang && this.isFriendlyToPlayer(who.gang))) enemy = who;
    // Игрок начал драку с бандитом — свои помогают (с полицией не связываются).
    else if (who === player && target.role === 'gang' && !this.isFriendlyToPlayer(target.gang)) enemy = target;
    if (!enemy || !enemy.model || enemy.role === 'police' || enemy.isDead) return;
    const r2 = CONFIG.gangs.helpRadius ** 2;
    for (const m of home.members) {
      if (m.isBusy || m.removed) continue;
      if (m.position.distanceToSquared(player.position) < r2) m.aggro(enemy, this.game.rng.pick(LINES.gangHelp));
    }
  }

  // Столкновение банд рядом с игроком — в ленту событий (не чаще раза в 25 с на пару банд).
  _clash(m, enemy) {
    const { game } = this;
    if (enemy.role !== 'gang' || m.position.distanceTo(game.player.position) > 160) return;
    const key = [m.gang, enemy.gang].sort().join('-');
    const t = this._time ?? 0;
    if ((this._clashCooldown.get(key) ?? -99) > t - 25) return;
    this._clashCooldown.set(key, t);
    const a = this.byId.get(m.gang), b = this.byId.get(enemy.gang);
    if (a && b) game.hud.news(`Перестрелка: ${a.name} против ${b.name}`, a.color);
  }

  // Мозг бойца: заметить врага, иначе заняться своим делом по роли.
  _think(m) {
    if (m.isDead || m.removed || m.follower || m.vehicle || BUSY.has(m.state)) return;
    const G = CONFIG.gangs;
    const r = m.raid ? 38 : G.sightRadius[m.gangRole] ?? G.sightRadius.default;
    // Смелые и злые замечают дальше, осторожные — ближе.
    const enemy = this._spotEnemy(m, r * (0.8 + m.aggression * 0.4));
    if (enemy) {
      m.post && m.state === NPC_STATE.IDLE && m.say(this.game.rng.pick(LINES.gangAggro));
      m.aggro(enemy, m.talkCooldown <= 0 && this.game.rng.chance(0.4) ? this.game.rng.pick(LINES.gangAggro) : null);
      this.callForHelp(m, enemy);
      this._clash(m, enemy);
      return;
    }
    if (m.raid) return; // налётчики — см. _updateRaid
    if (m.gangRole === 'guard' && m.post && m.state !== NPC_STATE.TALK) {
      const post = m.post;
      const px = post.node.x + Math.sin(m.postAngle) * 1.2, pz = post.node.z + Math.cos(m.postAngle) * 1.2;
      const d = Math.hypot(px - m.position.x, pz - m.position.z);
      if (m.state === NPC_STATE.IDLE && d < 2) return; // на посту
      if (m.state === NPC_STATE.GOTO) return;
      if (d < 16) m.goTo(px, pz, this.game.rng.range(25, 70), { x: post.node.x, z: post.node.z });
      else if (m.state === NPC_STATE.IDLE || m.dest !== post.node) {
        m.dest = post.node;
        if (m.state !== NPC_STATE.WALK) m._enter(NPC_STATE.WALK);
      }
    }
  }

  // --- Налёты банд друг на друга ----------------------------------------------------

  _startRaid() {
    const { game } = this;
    const G = CONFIG.gangs;
    const p = game.player.position;
    // Цель — квартал рядом с игроком (чтобы налёт было видно), нападает сосед.
    const blocks = [...this.blockOwner.entries()].filter(([b]) => {
      const c = blockCenter(b);
      return Math.hypot(c.x - p.x, c.z - p.z) < 230;
    });
    if (!blocks.length) return false;
    const [block, defender] = game.rng.pick(blocks);
    const attackers = this.gangs.filter((g) => g !== defender && g.blocks.length);
    if (!attackers.length) return false;
    const c = blockCenter(block);
    const dist = (g) => Math.min(...g.blocks.map((b) => { const bc = blockCenter(b); return Math.hypot(bc.x - c.x, bc.z - c.z); }));
    attackers.sort((a, b) => dist(a) - dist(b));
    const attacker = game.rng.chance(0.7) ? attackers[0] : game.rng.pick(attackers);
    const blockNodes = new Set(game.world.waypoints.filter((n) => n.block === block).map((n) => n.id));
    const targetNode = game.world.waypoints.find((n) => blockNodes.has(n.id) && n.mid);
    const raid = { attacker, defender, block, blockNodes, targetNode, center: c, raiders: [], phase: 'approach', time: 0, hold: 0, car: null };
    const n = game.rng.int(G.raidSize[0], G.raidSize[1]);
    const weapons = { smg: 0.4, pistol: 0.35, shotgun: 0.25 };
    const make = (x, z) => {
      const npc = new NPC(game, game.rng, { x, z, role: 'gang', gang: attacker.id, look: gangLook(game.rng, attacker.color), weapon: pickWeapon(game.rng, weapons) });
      npc.gangRole = 'raider';
      npc.raid = raid;
      npc.dest = targetNode;
      npc.aggression = Math.max(npc.aggression, 0.6);
      raid.raiders.push(game.npcs.add(npc));
      return npc;
    };
    if (game.rng.chance(0.4)) {
      // Приезжают на машине.
      const car = game.traffic.createAICar({
        near: c, minR: 80, maxR: 170, mode: 'pursuit', color: new THREE.Color(attacker.color).getHex(),
        type: game.rng.pick(['van', 'pickup', 'sedan']),
        driver: { role: 'gang', gang: attacker.id, look: gangLook(game.rng, attacker.color), weapon: 'pistol' },
      });
      if (car) {
        car.vehicle.ai.target = { position: new THREE.Vector3(c.x, 0, c.z) };
        car.driver.gangRole = 'raider';
        car.driver.raid = raid;
        raid.raiders.push(car.driver);
        raid.car = car.vehicle;
        for (let k = 0; k < Math.min(n - 1, car.vehicle.passengers.length); k++) {
          const npc = make(car.vehicle.position.x, car.vehicle.position.z);
          npc.enterAsPassenger(car.vehicle, k);
        }
      }
    }
    if (!raid.raiders.length) {
      // Приходят пешком с соседнего квартала, не на глазах у игрока.
      const spots = game.world.waypoints.filter((w) => !blockNodes.has(w.id) &&
        Math.hypot(w.x - c.x, w.z - c.z) > 45 && Math.hypot(w.x - c.x, w.z - c.z) < 95 && !game.inView(w.x, 1, w.z, 2));
      if (!spots.length) return false;
      const start = spots.sort((a, b) => dist({ blocks: [a.block] }) - dist({ blocks: [b.block] }))[0] ?? game.rng.pick(spots);
      for (let k = 0; k < n; k++) make(start.x + game.rng.range(-1.5, 1.5), start.z + game.rng.range(-1.5, 1.5));
    }
    this.raids.push(raid);
    const mine = defender.friendly;
    game.hud.news(`${attacker.name} идут на район банды «${defender.name}»`, attacker.color);
    if (mine) game.hud.toast(`${attacker.name} напали на наш район!`, 3.5);
    game.events.emit('gang:raid', { raid });
    return true;
  }

  _updateRaid(raid, dt) {
    const { game } = this;
    const G = CONFIG.gangs;
    raid.time += dt;
    raid.raiders = raid.raiders.filter((r) => !r.removed && !r.isDead);
    const end = (text, color) => {
      this.raids.splice(this.raids.indexOf(raid), 1);
      for (const r of raid.raiders) {
        r.raid = null;
        r.gangRole = 'patrol';
        r.allowedNodes = raid.attacker.nodes.size ? raid.attacker.nodes : null;
        r.dest = null;
        raid.attacker.members.push(r); // остаются бойцами своей банды
      }
      if (text) game.hud.news(text, color);
    };
    if (!raid.raiders.length) {
      end(`Налёт банды «${raid.attacker.name}» отбит`, raid.defender.color);
      return;
    }
    // Машина налётчиков доехала — все выходят.
    const car = raid.car;
    if (car && !car.removed && car.driver?.raid === raid) {
      const d = Math.hypot(car.position.x - raid.center.x, car.position.z - raid.center.z);
      if (d < 45 || raid.time > 50) {
        car.ai = null;
        for (const npc of [car.driver, ...car.passengers]) npc?.exitVehicle();
        raid.car = null;
      }
    }
    const near = raid.raiders.some((r) => !r.vehicle && Math.hypot(r.position.x - raid.center.x, r.position.z - raid.center.z) < 40);
    if (raid.phase === 'approach' && near) {
      raid.phase = 'fight';
      for (const r of raid.raiders) {
        r.allowedNodes = raid.blockNodes;
        r.dest = null;
      }
      // Защитники поднимаются по тревоге.
      for (const m of raid.defender.members) {
        if (m.isBusy || m.removed || m.isDead || m.position.distanceTo(raid.raiders[0].position) > 90) continue;
        m.aggro(raid.raiders[0], game.rng.pick(LINES.gangAggro));
      }
    }
    if (raid.phase === 'fight') {
      const defenders = raid.defender.members.filter((m) => !m.isDead && !m.removed &&
        game.world.blockAt(m.position.x, m.position.z) === raid.block);
      raid.hold = defenders.length ? 0 : raid.hold + dt;
      if (raid.hold > G.captureHold && raid.defender.blocks.length > G.minBlocks && this.blockOwner.get(raid.block) === raid.defender) {
        this.transferBlock(raid.block, raid.attacker);
        end(`${raid.attacker.name} захватили квартал банды «${raid.defender.name}»`, raid.attacker.color);
        if (raid.defender.friendly) game.hud.toast(`Мы потеряли район: теперь там ${raid.attacker.name}`, 4);
        return;
      }
    }
    if (raid.time > G.raidTime) end(null);
  }

  // Далеко от игрока — налёт "на бумаге": иногда квартал меняет хозяина (только между ИИ-бандами).
  _farRaid() {
    const { game } = this;
    const G = CONFIG.gangs;
    const p = game.player.position;
    const far = [...this.blockOwner.entries()].filter(([b, g]) => {
      const c = blockCenter(b);
      return !g.friendly && g.blocks.length > G.minBlocks && Math.hypot(c.x - p.x, c.z - p.z) > 300;
    });
    if (!far.length) return;
    const [block, defender] = game.rng.pick(far);
    const attackers = this.gangs.filter((g) => !g.friendly && g !== defender && g.blocks.length);
    if (!attackers.length) return;
    const attacker = game.rng.pick(attackers);
    if (game.rng.chance(0.35)) {
      this.transferBlock(block, attacker);
      game.hud.news(`Где-то в городе: ${attacker.name} отбили квартал у банды «${defender.name}»`, attacker.color);
    } else {
      game.hud.news(`Слышна стрельба: ${attacker.name} против банды «${defender.name}»`, attacker.color);
    }
  }

  // --- Машины банд ---------------------------------------------------------------

  _spawnCar() {
    const { game } = this;
    const gangs = this.gangs.filter((g) => g.blocks.length);
    if (!gangs.length) return;
    const gang = game.rng.pick(gangs);
    const car = game.traffic.createAICar({
      minR: 80, maxR: 170, color: new THREE.Color(gang.color).getHex(), type: game.rng.pick(['sedan', 'pickup', 'sports', 'van']),
      driver: { role: 'gang', gang: gang.id, look: gangLook(game.rng, gang.color), weapon: 'pistol' },
    });
    if (!car) return;
    const crew = [car.driver];
    const passengers = game.rng.int(1, Math.min(2, car.vehicle.passengers.length));
    for (let k = 0; k < passengers; k++) {
      const npc = game.npcs.add(new NPC(game, game.rng, {
        x: car.vehicle.position.x, z: car.vehicle.position.z, role: 'gang', gang: gang.id,
        look: gangLook(game.rng, gang.color), weapon: game.rng.pick(['pistol', 'smg']),
      }));
      npc.enterAsPassenger(car.vehicle, k);
      crew.push(npc);
    }
    for (const npc of crew) npc.gangRole = 'crew';
    this.cars.push({ vehicle: car.vehicle, crew, gang, deployed: false });
  }

  _updateCars() {
    const { game } = this;
    const p = game.player.position;
    for (const c of [...this.cars]) {
      const v = c.vehicle;
      c.crew = c.crew.filter((n) => !n.removed);
      const alive = c.crew.filter((n) => !n.isDead);
      const d = v.removed ? 0 : v.position.distanceTo(p);
      const far = (npc) => npc.position.distanceTo(p) > 230 && !game.inView(npc.position.x, 1, npc.position.z, 2);
      // Уехали далеко (или все вышли и разошлись) — убираем машину и экипаж.
      if (v.removed || (d > 240 && !game.inView(v.position.x, 1, v.position.z, 3)) || !alive.length) {
        if (alive.every(far) || v.removed || !alive.length) {
          for (const n of c.crew) if (!n.isDead) game.npcs.remove(n);
          if (!v.removed && v.driver !== game.player) game.removeVehicle(v);
          this.cars.splice(this.cars.indexOf(c), 1);
        }
        continue;
      }
      if (c.deployed || v.driver !== c.crew[0]) {
        // Вышедший экипаж дальше действует как обычные бойцы.
        for (const n of alive) if (!n.vehicle) this._think(n);
        continue;
      }
      // Экипаж высматривает врагов: стреляют из окон, иногда выходят драться.
      const lookout = c.crew[0];
      lookout.position.copy(v.position);
      const enemy = this._spotEnemy(lookout, 26);
      if (!enemy) continue;
      for (const n of v.passengers) if (n && n.gang === c.gang.id) n.target = enemy;
      if (game.rng.chance(0.35) || Math.abs(v.speed) < 2) {
        c.deployed = true;
        v.ai = null;
        for (const n of [v.driver, ...v.passengers]) {
          if (!n || n === game.player) continue;
          n.exitVehicle();
          n.allowedNodes = c.gang.nodes.size ? c.gang.nodes : null;
          n.aggro(enemy, game.rng.pick(LINES.gangAggro));
        }
        this._clash(lookout, enemy);
      }
    }
  }

  // Самая "горячая" точка для миникарты: квартал, на который сейчас налёт.
  get hotBlock() {
    return this.raids.find((r) => r.phase === 'fight')?.block ?? null;
  }

  update(dt) {
    this._time = (this._time ?? 0) + dt;
    for (const raid of [...this.raids]) this._updateRaid(raid, dt);
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.3;
    const { player, events, rng } = this.game;
    const G = CONFIG.gangs;

    // Смена района — для надписи на экране.
    const zone = this.gangAt(player.position.x, player.position.z);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      events.emit('zone:changed', { gang: zone });
    }

    // Враждебная территория: подошёл пешком близко — бьют.
    if (zone && !zone.friendly && !player.vehicle && !player.isDead) {
      const r2 = G.aggroRadius ** 2;
      for (const m of zone.members) {
        if (m.isBusy || m.removed) continue;
        if (m.position.distanceToSquared(player.position) < r2) m.aggro(player, rng.pick(LINES.gangAggro));
      }
    }

    // Мозги бойцов рядом с игроком (дальние всё равно заморожены).
    const p = player.position;
    for (const gang of this.gangs) {
      for (const m of gang.members) {
        if (m.position.distanceToSquared(p) < 220 * 220) this._think(m);
      }
    }
    for (const raid of this.raids) for (const r of raid.raiders) this._think(r);

    // Налёты и машины банд.
    this.raidTimer -= 0.3;
    if (this.raidTimer <= 0) {
      this.raidTimer = rng.range(...G.raidEvery);
      if (this.raids.length < 1) this._startRaid();
    }
    this.farRaidTimer -= 0.3;
    if (this.farRaidTimer <= 0) {
      this.farRaidTimer = rng.range(...G.farRaidEvery);
      this._farRaid();
    }
    this._updateCars();
    this.carTimer -= 0.3;
    if (this.carTimer <= 0) {
      this.carTimer = rng.range(10, 25);
      if (this.cars.length < G.cars) this._spawnCar();
    }

    // Убираем выбывших и пополняем банды. У разгромленной банды (без районов) остатки
    // исчезают, когда игрок далеко.
    for (const gang of this.gangs) {
      gang.members = gang.members.filter((m) => !m.removed);
      if (!gang.blocks.length) {
        for (const m of gang.members) {
          if (!m.isBusy && m.position.distanceTo(player.position) > 150) this.game.npcs.remove(m);
        }
        continue;
      }
      // Бывшие налётчики далеко от игрока, сверх численности банды, — исчезают.
      const alive = gang.members.filter((m) => !m.isDead);
      if (alive.length > gang.targetSize) {
        const extra = alive.find((m) => !m.isBusy && !m.post && m.position.distanceTo(p) > 200);
        if (extra) this.game.npcs.remove(extra);
      }
      if (alive.length >= gang.targetSize) {
        gang.respawnTimer = 0;
        continue;
      }
      gang.respawnTimer += 0.3;
      if (gang.respawnTimer >= G.respawnDelay) {
        gang.respawnTimer = 0;
        this._spawnMember(gang, true);
      }
    }
  }
}
