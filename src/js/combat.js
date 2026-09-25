// Рукопашный бой: общий для игрока и всех NPC.
//
// Персонаж, который умеет драться, реализует "интерфейс бойца":
//   position, heading, isDead, radius
//   takeDamage(amount, attacker, dirX, dirZ, kind)  — kind: 'punch' | 'vehicle' | 'fall'
// Удар — это анимация длиной DURATION; урон наносится один раз в момент выпада
// (HIT_AT) тому, кто стоит перед атакующим (см. strike()).

const DURATION = 0.38;   // секунд на удар
const HIT_AT = 0.45;     // доля анимации, в которой кулак "достаёт" цель

export class Melee {
  constructor(owner, { damage = 12, cooldown = 0.25, range = 1.45 } = {}) {
    this.owner = owner;
    this.damage = damage;
    this.cooldown = cooldown;
    this.range = range;
    this.t = 0;            // 0 — не бьёт, 0..1 — фаза удара
    this.wait = 0;         // оставшаяся пауза между ударами
    this.side = 1;         // чередуем руки
    this._hitDone = false;
  }

  get active() {
    return this.t > 0;
  }

  get ready() {
    return this.t === 0 && this.wait <= 0;
  }

  start() {
    if (!this.ready) return false;
    this.t = 1e-4;
    this.side = -this.side;
    this._hitDone = false;
    return true;
  }

  cancel() {
    this.t = 0;
  }

  update(dt, game) {
    if (this.wait > 0) this.wait -= dt;
    if (this.t <= 0) return;
    this.t += dt / DURATION;
    if (!this._hitDone && this.t >= HIT_AT) {
      this._hitDone = true;
      strike(game, this.owner, this.range, this.damage);
    }
    if (this.t >= 1) {
      this.t = 0;
      this.wait = this.cooldown;
    }
  }
}

// Все, кого можно ударить: игрок (пешком) и NPC вне машин.
export function* fighters(game) {
  const p = game.player;
  if (!p.vehicle && !p.isDead) yield p;
  for (const npc of game.npcs.list) {
    if (!npc.vehicle && npc.model.root.visible !== false) yield npc;
  }
}

// Ближайший противник перед персонажем (или null).
export function findTargetInFront(game, attacker, range, minDot = 0.35, includeDead = true) {
  const fx = Math.sin(attacker.heading), fz = Math.cos(attacker.heading);
  let best = null, bestD = range;
  for (const c of fighters(game)) {
    if (c === attacker || (!includeDead && c.isDead)) continue;
    const dx = c.position.x - attacker.position.x, dz = c.position.z - attacker.position.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 1e-3 || Math.abs(c.position.y - attacker.position.y) > 1) continue;
    if ((dx * fx + dz * fz) / d < minDot) continue;
    best = c;
    bestD = d;
  }
  return best;
}

function strike(game, attacker, range, damage) {
  const target = findTargetInFront(game, attacker, range + 0.2);
  if (!target) return null;
  const dx = target.position.x - attacker.position.x, dz = target.position.z - attacker.position.z;
  const d = Math.hypot(dx, dz) || 1;
  target.takeDamage(damage, attacker, dx / d, dz / d, 'punch');
  game.events.emit('combat:hit', { attacker, target, damage });
  return target;
}
