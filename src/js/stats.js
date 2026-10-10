import { teamOf } from './ballistics.js';

// Счётчик убитых и прочая статистика игрока. Сохраняется вместе с прогрессом (economy.js).
//   kills      — всего убито людей (прохожие, банды, полиция, солдаты…) ваши
//   headshots  — из них выстрелом в голову
//   civilians  — из них мирных прохожих
//   soldiers   — убито солдат на войне стран
//   vehicles   — уничтожено машин и техники
//   wars/wins  — сыграно войн / выиграно; bestStreak — рекордная серия подряд
// Серия: убийства быстрее чем за STREAK_TIME секунд друг за другом считаются серией (ДВОЙНОЕ, ТРОЙНОЕ…).
// HUD берёт числа из game.stats; событие 'stats:kill' { target, streak, total } — для наград и сообщений.

const STREAK_TIME = 6;
const STREAK_NAMES = { 2: 'ДВОЙНОЕ УБИЙСТВО', 3: 'ТРОЙНОЕ УБИЙСТВО', 4: 'СЕРИЯ ×4', 5: 'СЕРИЯ ×5', 6: 'РЕЗНЯ ×6', 8: 'МАШИНА СМЕРТИ ×8', 10: 'АРМИЯ ОДНОГО ×10' };

export class Stats {
  constructor(game) {
    this.game = game;
    this.total = { kills: 0, headshots: 0, civilians: 0, soldiers: 0, vehicles: 0, wars: 0, wins: 0, bestStreak: 0 };
    this.session = { kills: 0, soldiers: 0 };
    this.streak = 0;
    this.streakTimer = 0;
    this.version = 0;   // растёт при каждом изменении — HUD перерисовывает счётчик по нему

    game.events.on('character:killed', ({ target, attacker, zone }) => this._onKilled(target, attacker, zone));
    game.events.on('vehicle:exploded', ({ vehicle, by }) => {
      if (this._isPlayer(by)) {
        this.total.vehicles++;
        this._bump();
      }
    });
  }

  _isPlayer(who) {
    return !!who && (who === this.game.player || who.driver === this.game.player);
  }

  _onKilled(target, attacker, zone) {
    const game = this.game;
    if (target === game.player || !this._isPlayer(attacker)) return;
    if (teamOf(target) && teamOf(target) === teamOf(game.player)) return;   // своих не считаем
    const T = this.total;
    T.kills++;
    this.session.kills++;
    if (zone === 'head') T.headshots++;
    if (target.role === 'civilian') T.civilians++;
    if (target.role === 'soldier') {
      T.soldiers++;
      this.session.soldiers++;
    }
    this.streak = this.streakTimer > 0 ? this.streak + 1 : 1;
    this.streakTimer = STREAK_TIME;
    if (this.streak > T.bestStreak) T.bestStreak = this.streak;
    this._bump();
    game.events.emit('stats:kill', { target, streak: this.streak, total: T.kills, zone });
    const name = STREAK_NAMES[this.streak];
    if (name) game.hud?.showBigMessage(name, '#ffd166');
  }

  _bump() {
    this.version++;
    this.game.save?.markDirty();
  }

  update(dt) {
    if (this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) this.streak = 0;
    }
  }

  serialize() {
    return { ...this.total };
  }

  deserialize(data) {
    if (!data || typeof data !== 'object') return;
    for (const k of Object.keys(this.total)) if (Number.isFinite(data[k])) this.total[k] = Math.max(0, Math.floor(data[k]));
    this.version++;
  }
}
