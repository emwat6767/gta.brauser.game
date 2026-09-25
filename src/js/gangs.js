import { CONFIG } from './config.js';
import { NPC, NPC_STATE, LINES, gangLook } from './npc.js';

// Банды. Каждая владеет несколькими кварталами (территория, видна на миникарте).
// Члены банды бродят и тусуются на тротуарах своей территории.
//   - враждебные банды нападают на игрока, если он пешком зашёл к ним и подошёл близко;
//   - на удар по члену банды отвечают все его друзья поблизости;
//   - банда игрока (friendly) не трогает его и вступается, если на игрока напали.
// Погибших со временем заменяют новые (пополнение вне поля зрения игрока).

export class GangSystem {
  constructor(game) {
    const G = CONFIG.gangs;
    this.game = game;
    this.blockOwner = new Map(); // block -> gang
    this.gangs = G.list.map((def) => {
      const blocks = def.blocks.map(([i, j]) => game.world.blocks[j * game.world.blocksPerAxis + i]).filter(Boolean);
      const gang = { ...def, blocks, nodes: new Set(), members: [], respawnTimer: 0 };
      for (const b of blocks) this.blockOwner.set(b, gang);
      for (const n of game.world.waypoints) if (blocks.includes(n.block)) gang.nodes.add(n.id);
      gang.targetSize = blocks.length * G.membersPerBlock;
      return gang;
    });
    this.byId = new Map(this.gangs.map((g) => [g.id, g]));
    this.currentZone = null;
    this._timer = 0;

    for (const gang of this.gangs) {
      for (let k = 0; k < gang.targetSize; k++) this._spawnMember(gang, false);
    }

    // Банда игрока вступается за него и помогает в его драках.
    game.events.on('character:damaged', ({ target, attacker }) => this._onDamaged(target, attacker));
  }

  isFriendlyToPlayer(gangId) {
    return !!this.byId.get(gangId)?.friendly;
  }

  gangAt(x, z) {
    const block = this.game.world.blockAt(x, z);
    return block ? this.blockOwner.get(block) ?? null : null;
  }

  _spawnMember(gang, outOfView) {
    const { game } = this;
    const p = game.player.position;
    // Первичный спавн — в любом месте территории; пополнение — подальше от игрока.
    const nodes = [...gang.nodes].map((id) => game.world.waypoints[id]);
    let spot = null;
    for (let attempt = 0; attempt < 20 && !spot; attempt++) {
      const from = game.rng.pick(nodes);
      // Вдоль тротуара того же квартала (не на переходе через дорогу).
      const side = from.links.filter((n) => n.block === from.block);
      const to = game.rng.pick(side);
      const t = game.rng.range(0.05, 0.3); // держатся ближе к углам — "тусовки"
      const x = from.x + (to.x - from.x) * t + game.rng.range(-1.2, 1.2);
      const z = from.z + (to.z - from.z) * t + game.rng.range(-1.2, 1.2);
      if (outOfView && Math.hypot(x - p.x, z - p.z) < 60) continue;
      spot = { x, z, from, to };
    }
    if (!spot) return null;
    const npc = new NPC(game, game.rng, {
      ...spot, role: 'gang', gang: gang.id, look: gangLook(game.rng, gang.color), allowedNodes: gang.nodes,
    });
    npc.idleTime = game.rng.range(0, 6);
    npc._enter(NPC_STATE.IDLE);
    gang.members.push(npc);
    return game.npcs.add(npc);
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

  update(dt) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.3;
    const { player, events } = this.game;
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
        if (m.position.distanceToSquared(player.position) < r2) m.aggro(player, this.game.rng.pick(LINES.gangAggro));
      }
    }

    // Убираем выбывших и пополняем банды.
    for (const gang of this.gangs) {
      gang.members = gang.members.filter((m) => !m.removed);
      const alive = gang.members.filter((m) => !m.isDead).length;
      if (alive >= gang.targetSize) {
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
