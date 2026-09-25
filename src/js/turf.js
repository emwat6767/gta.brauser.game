import { CONFIG } from './config.js';
import { NPC, LINES, gangLook } from './npc.js';

// Войны за районы (как в GTA San Andreas).
//   Начать: убить killsToStart бандитов чужой банды на их же территории за killWindow секунд
//           (игрок пешком, в этом квартале) — начинается "ВОЙНА ЗА РАЙОН".
//   Война:  волны бандитов (CONFIG.turf.waves) нападают на игрока и его отряд; нельзя уходить
//           дальше leaveRadius от центра квартала. Все волны перебиты — квартал становится
//           территорией банды игрока (+репутация, деньги).
//   Ответ:  раз в attackEvery секунд конкуренты нападают на один из захваченных районов:
//           defendTime секунд, чтобы приехать и перебить нападающих, иначе район потерян.
// Захваченные районы сохраняются (SaveSystem): serialize() — { "i,j": gangId }.

const key = (b) => `${b.i},${b.j}`;

function pickWeapon(rng, table) {
  let r = rng.next();
  for (const [type, p] of Object.entries(table ?? {})) if ((r -= p) < 0) return type;
  return 'pistol';
}

export class TurfSystem {
  constructor(game) {
    this.game = game;
    this.home = game.gangs.gangs.find((g) => g.friendly);
    this.kills = [];          // { block, time }
    this.time = 0;
    this.war = null;          // { block, gang, wave, enemies, delay, away }
    this.attack = null;       // { block, gang, enemies, time }
    this.attackTimer = this._nextAttack();

    game.events.on('character:killed', ({ target, attacker }) => this._onKill(target, attacker));
    game.events.on('player:down', () => {
      if (this.war) this._endWar(false, 'Война проиграна');
    });
  }

  _nextAttack() {
    const [a, b] = CONFIG.turf.attackEvery;
    return this.game.rng.range(a, b);
  }

  get busy() {
    return !!this.war;
  }

  // Районы, отбитые у конкурентов (для ответных нападений).
  get captured() {
    return this.home.blocks.filter((b) => !this.home.homeBlocks.includes(b));
  }

  _onKill(target, attacker) {
    const { game } = this;
    const p = game.player;
    if (target.role !== 'gang' || game.gangs.isFriendlyToPlayer(target.gang)) return;
    if (!(attacker === p || attacker?.follower)) return;
    // Нападение на захваченный район: считаем убитых нападающих.
    if (this.war || p.vehicle || game.missions?.active) return;
    const block = game.world.blockAt(target.position.x, target.position.z);
    const owner = block && game.gangs.blockOwner.get(block);
    if (!owner || owner.id !== target.gang || game.world.blockAt(p.position.x, p.position.z) !== block) return;
    const T = CONFIG.turf;
    this.kills = this.kills.filter((k) => this.time - k.time < T.killWindow);
    this.kills.push({ block, time: this.time });
    const n = this.kills.filter((k) => k.block === block).length;
    if (n >= T.killsToStart) this._startWar(block, owner);
    else if (n === T.killsToStart - 1) game.hud.toast(`Ещё один — и начнётся война за район (${owner.name})`, 2.5);
  }

  _startWar(block, gang) {
    const { game } = this;
    this.kills = [];
    this.war = { block, gang, wave: 0, enemies: [], delay: 2, away: 0 };
    game.hud.toast(`ВОЙНА ЗА РАЙОН! ${gang.name} идут`, 3);
    game.audio.alarm?.(game.player.position);
    game.events.emit('turf:war', { block, gang });
  }

  // Бандит банды gang на тротуарах квартала block: если игрок рядом — не ближе 20 м к нему
  // и по возможности вне поля зрения, иначе где угодно в квартале.
  _spawnIn(block, gang, target) {
    const { game } = this;
    const nodes = new Set(game.world.waypoints.filter((n) => n.block === block).map((n) => n.id));
    const c = { x: (block.x0 + block.x1) / 2, z: (block.z0 + block.z1) / 2 };
    const p = game.player.position;
    const spot = (Math.hypot(p.x - c.x, p.z - c.z) < 120 && game.npcs.randomSidewalkSpot(p.x, p.z, 20, 110, true, nodes)) ||
      game.npcs.randomSidewalkSpot(c.x, c.z, 0, 75, false, nodes);
    if (!spot) return null;
    const npc = new NPC(game, game.rng, {
      ...spot, role: 'gang', gang: gang.id, look: gangLook(game.rng, gang.color),
      weapon: pickWeapon(game.rng, { smg: 0.45, pistol: 0.35, shotgun: 0.2 }), allowedNodes: gang.nodes,
    });
    npc.marked = true; // красная метка на миникарте
    game.npcs.add(npc);
    if (target) npc.aggro(target, game.rng.pick(LINES.gangAggro));
    return npc;
  }

  _endWar(won, text) {
    const { game } = this;
    const { block, gang, enemies } = this.war;
    this.war = null;
    for (const e of enemies) e.marked = false;
    game.hud.setObjective('');
    if (won) {
      game.gangs.transferBlock(block, this.home);
      const T = CONFIG.turf;
      game.wallet.add(T.reward);
      game.progress.add(CONFIG.reputation.points.turf, 'район');
      game.hud.toast(`РАЙОН ЗАХВАЧЕН! ${gang.blocks.length ? '' : `${gang.name} разгромлены!`}`, 4);
      game.audio.fanfare(8);
      game.save?.markDirty();
    } else {
      game.hud.toast(text, 3);
    }
  }

  _updateWar(dt) {
    const { game } = this;
    const T = CONFIG.turf;
    const w = this.war;
    const p = game.player;
    const cx = (w.block.x0 + w.block.x1) / 2, cz = (w.block.z0 + w.block.z1) / 2;
    const far = Math.hypot(p.position.x - cx, p.position.z - cz) > T.leaveRadius;
    w.away = far ? w.away + dt : 0;
    if (w.away > T.leaveGrace) {
      this._endWar(false, 'Вы покинули район — война проиграна');
      return;
    }
    w.enemies = w.enemies.filter((e) => !e.removed && !e.isDead);
    if (!w.enemies.length) {
      if (w.wave >= T.waves.length) {
        this._endWar(true);
        return;
      }
      if ((w.delay -= dt) <= 0) {
        const n = T.waves[w.wave];
        for (let k = 0; k < n; k++) {
          const e = this._spawnIn(w.block, w.gang, p);
          if (e) w.enemies.push(e);
        }
        w.wave++;
        w.delay = T.waveDelay;
        if (w.enemies.length) game.hud.toast(`Волна ${w.wave} из ${T.waves.length}`, 2);
      }
    }
    // Кто отстал в погоне — снова идёт на игрока.
    for (const e of w.enemies) if (!e.isBusy) e.aggro(p);
    const left = w.enemies.length;
    game.hud.setObjective(far ? `<b>Вернитесь в район!</b> ${Math.ceil(T.leaveGrace - w.away)} с`
      : `ВОЙНА ЗА РАЙОН · волна <b>${Math.max(1, w.wave)}/${T.waves.length}</b>${left ? ` · осталось <b>${left}</b>` : ''}`);
  }

  // Конкуренты нападают на захваченный район.
  _startAttack() {
    const { game } = this;
    const T = CONFIG.turf;
    const captured = this.captured;
    const rivals = game.gangs.gangs.filter((g) => !g.friendly && g.blocks.length);
    if (!captured.length || !rivals.length) return;
    const block = game.rng.pick(captured);
    // Нападает банда, у которой этот квартал был отбит, если она ещё жива.
    const gang = rivals.find((g) => g.homeBlocks.includes(block)) ?? game.rng.pick(rivals);
    const defenders = this.home.members.filter((m) => !m.isDead && game.world.blockAt(m.position.x, m.position.z) === block);
    const enemies = [];
    for (let k = 0; k < T.attackers; k++) {
      const e = this._spawnIn(block, gang, defenders.length ? game.rng.pick(defenders) : null);
      if (e) enemies.push(e);
    }
    if (!enemies.length) return;
    this.attack = { block, gang, enemies, time: T.defendTime };
    game.hud.toast(`${gang.name} напали на ваш район!`, 4);
    game.events.emit('turf:attack', { block, gang });
  }

  _updateAttack(dt) {
    const { game } = this;
    const a = this.attack;
    a.time -= dt;
    a.enemies = a.enemies.filter((e) => !e.removed && !e.isDead);
    if (!a.enemies.length) {
      this.attack = null;
      game.hud.toast('Район отбит!', 3);
      game.progress.add(CONFIG.reputation.points.defend, 'защита района');
      return;
    }
    if (a.time <= 0) {
      this.attack = null;
      for (const e of a.enemies) e.marked = false;
      game.gangs.transferBlock(a.block, a.gang);
      game.hud.toast(`Район потерян: теперь там ${a.gang.name}`, 4);
      game.save?.markDirty();
      return;
    }
    // Нападающие дерутся с защитниками, а увидев игрока — с ним.
    const p = game.player;
    for (const e of a.enemies) {
      if (e.isBusy) continue;
      if (e.position.distanceTo(p.position) < 40 && !p.vehicle) e.aggro(p);
      else {
        const d = this.home.members.find((m) => !m.isDead && m.position.distanceTo(e.position) < 40);
        if (d) e.aggro(d);
      }
    }
    if (!this.war && !game.missions?.active) {
      game.hud.setObjective(`<b>Защитите район!</b> Нападающих: ${a.enemies.length} · ${Math.ceil(a.time)} с`);
    }
  }

  update(dt) {
    this.time += dt;
    if (this.war) this._updateWar(dt);
    if (this.attack) this._updateAttack(dt);
    else if (!this.war && this.captured.length && (this.attackTimer -= dt) <= 0) {
      this.attackTimer = this._nextAttack();
      this._startAttack();
    }
    if (!this.war && !this.attack && !this.game.missions?.active) this.game.hud.setObjective('');
  }

  // Квартал, который сейчас мигает на миникарте (война или нападение).
  get hotBlock() {
    return this.war?.block ?? this.attack?.block ?? null;
  }

  serialize() {
    const out = {};
    for (const g of this.game.gangs.gangs) {
      for (const b of g.blocks) if (!g.homeBlocks.includes(b)) out[key(b)] = g.id;
    }
    // Кварталы, потерянные исходными хозяевами и ставшие ничьими, не бывают — достаточно этого.
    return out;
  }

  deserialize(data) {
    if (!data) return;
    const { gangs, world } = this.game;
    for (const [k, id] of Object.entries(data)) {
      const [i, j] = k.split(',').map(Number);
      const block = world.blocks[j * world.blocksPerAxis + i];
      const gang = gangs.byId.get(id);
      if (block && gang) gangs.transferBlock(block, gang);
    }
  }
}
