import { CONFIG } from './config.js';

// Репутация банды игрока. Очки дают дела: ограбления, задания, убитые конкуренты,
// захваченные и отбитые районы. Уровни (CONFIG.reputation.levels) открывают бонусы
// отряду: число бойцов, здоровье, оружие, точность — squad.js читает их из stats.

export class GangProgress {
  constructor(game) {
    this.game = game;
    this.points = 0;
    this.level = 0;
    this.stats = this._statsFor(0);

    const P = CONFIG.reputation.points;
    const allies = (a) => a && (a === game.player || a.follower);
    game.events.on('character:killed', ({ target, attacker }) => {
      if (target.role === 'gang' && !game.gangs.isFriendlyToPlayer(target.gang) && allies(attacker)) this.add(P.rivalKill, null);
    });
    game.events.on('heist:success', ({ place }) => this.add(place.kind === 'store' ? P.store : P.bank, 'ограбление'));
  }

  // Бонусы уровня: значения всех уровней до него включительно.
  _statsFor(level) {
    const out = {};
    for (let i = 0; i <= level; i++) {
      const L = CONFIG.reputation.levels[i];
      for (const k of ['squad', 'health', 'spread', 'weapons']) if (L[k] !== undefined) out[k] = L[k];
      out.title = L.title;
    }
    return out;
  }

  get levels() {
    return CONFIG.reputation.levels;
  }

  get next() {
    return this.levels[this.level + 1] ?? null;
  }

  // Доля пути до следующего уровня (0..1).
  get progress() {
    const next = this.next;
    if (!next) return 1;
    const cur = this.levels[this.level].at;
    return (this.points - cur) / (next.at - cur);
  }

  add(points, reason) {
    if (!points) return;
    this.points += points;
    if (reason) this.game.hud.toast(`+${points} репутации (${reason})`, 1.6);
    let up = false;
    while (this.next && this.points >= this.next.at) {
      this.level++;
      up = true;
    }
    if (up) {
      this.stats = this._statsFor(this.level);
      const L = this.levels[this.level];
      this.game.hud.toast(`Репутация: ${L.title}! ${L.perk ?? ''}`, 4);
      this.game.audio.fanfare(7);
      this.game.events.emit('rep:level', { level: this.level });
    }
    this.game.save?.markDirty();
  }

  serialize() {
    return { points: this.points };
  }

  deserialize(data) {
    this.points = Math.max(0, data?.points | 0);
    this.level = 0;
    while (this.next && this.points >= this.next.at) this.level++;
    this.stats = this._statsFor(this.level);
  }
}
