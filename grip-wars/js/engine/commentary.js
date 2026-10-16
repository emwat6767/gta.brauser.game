//# sourceURL=ufc/commentary.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;

// ===========================================================================
// Commentary desk: two voices reacting to what actually happens, with enough
// lines and cooldowns that nothing repeats for a long time. Intensity picks
// how loud the reaction is; quiet moments get colour lines instead.
// ===========================================================================
const LINES = {
  jab: ['Джеб работает как метроном.', 'Он держит дистанцию джебом.', 'Хороший джеб, чётко в цель.'],
  combo: ['ВОТ ЭТО СВЯЗКА!', 'ДВОЙКА ПРОШЛА! ПОПАЛ!', 'СЕРИЯ В ЦЕЛЬ — СОПЕРНИК ЗАКРЫЛСЯ!', 'ТРИ УДАРА ПОДРЯД, И ВСЕ В ЦЕЛЬ!'],
  heavy: ['ОХ! КАК ПРИЛОЖИЛ!', 'ВОТ ЭТО УДАР! ВЫ ВИДЕЛИ?!', 'ТЯЖЕЛЕЙШИЙ УДАР, ОН ЭТО ПОЧУВСТВОВАЛ!', 'ПРЯМО В ЦЕЛЬ! НОГИ ДРОГНУЛИ!'],
  counter: ['КОНТРА! ПОЙМАЛ НА ВХОДЕ!', 'ВСТРЕЧНЫЙ УДАР — ИДЕАЛЬНЫЙ ТАЙМИНГ!', 'ОН ЧИТАЕТ СОПЕРНИКА И БЬЁТ НАВСТРЕЧУ!'],
  body: ['По корпусу, это копится.', 'Удар по печени — такое не забывается.', 'В корпус, и дыхание сбилось.'],
  leg: ['Лоу-кик подрубает опорную ногу.', 'Ещё один лоу — нога краснеет.', 'Ноги забиты, передвижение уже хуже.'],
  head: ['В голову!', 'Чисто в челюсть!', 'Попадание в голову, он поплыл.'],
  rocked: ['ОН ПОТРЯСЁН! НОГИ ВАТНЫЕ! ДОБИВАЙ ЕГО!', 'ОН ПЛЫВЁТ! ЭТО МОЖЕТ ЗАКОНЧИТЬСЯ ПРЯМО СЕЙЧАС!', 'ОН В БЕДЕ! НАДО ВЫСТОЯТЬ, НАДО ВЫСТОЯТЬ!'],
  knockdown: ['НОКДАУН! ОН НА ПОЛУ! НЕ МОЖЕТ БЫТЬ!', 'ОН ПАДАЕТ! КАКОЙ УДАР! КАКОЙ УДАР!', 'НОКДАУН! ЗАЛ НА НОГАХ! ОН ПЫТАЕТСЯ ПОДНЯТЬСЯ!'],
  ko: ['ВСЁ! ВСЁ КОНЧЕНО! НОКАУУУТ!', 'ОН ВЫРУБИЛ ЕГО! НЕВЕРОЯТНО! НОКАУТ!', 'НОКАУТ! ЗАЛ ВЗОРВАЛСЯ! ТАКОГО Я ЕЩЁ НЕ ВИДЕЛ!', 'СПИТ! ОН СПИТ! ЭТО НОКАУТ!'],
  tko: ['РЕФЕРИ ВМЕШИВАЕТСЯ! БОЙ ОКОНЧЕН!', 'ДОСТАТОЧНО! РЕФЕРИ ОСТАНАВЛИВАЕТ БОЙ!', 'ТЕХНИЧЕСКИЙ НОКАУТ!'],
  takedown: ['Тейкдаун! Перевёл в партер.', 'Прекрасный проход в ноги!', 'Тейкдаун, и он сверху.'],
  sprawl: ['Растяжка! Защитился от прохода.', 'Отлично защитился от тейкдауна.'],
  ground: ['Работает сверху, ищет позицию.', 'Контроль в партере — судьи это видят.', 'Проходит гард, позиция улучшается.'],
  sub: ['Он нашёл сабмишн! Может быть конец!', 'Опасная позиция! Нужно вырываться!', 'Захват глубокий — сейчас или никогда!'],
  subEscape: ['Вырвался! Какая защита!', 'Он выбрался из захвата, невероятно!'],
  tap: ['Он сдался! Бой окончен!', 'Хлопок! Сабмишн!'],
  comeback: ['Вот это возвращение в бой!', 'Он поймал второе дыхание!', 'Ещё минуту назад он плыл — а теперь давит!'],
  tired: ['Обоим тяжело, темп упал.', 'Руки опускаются, усталость видна.', 'Кардио решает исход этого боя.'],
  close: ['Очень близкий раунд, судьи поспорят.', 'Этот отрезок можно отдать любому.'],
  dominant: ['Он забирает раунд без вопросов.', 'Полное доминирование в этом раунде.'],
  round: ['Конец раунда, угловые зовут своих бойцов.', 'Гонг! Передышка — и снова в бой.'],
  start: ['ЛЕДИ И ДЖЕНТЛЬМЕНЫ! БОЙ НАЧАЛСЯ! ПОЕХАЛИ!', 'ГОНГ! И ПЕРВЫЙ ОБМЕН — СРАЗУ ВСЕРЬЁЗ!', 'ЗАЛ ГУДИТ! НАЧИНАЕМ!'],
  colour: ['Работа на дистанции, оба читают друг друга.', 'Идёт разведка, никто не спешит.', 'Тактическая борьба за центр октагона.', 'Зал ждёт большого удара.'],
  flow: ['Кровь только раззадорила его!', 'Он поймал кураж — и это видно!'],
};
const PRIORITY = { ko: 5, tko: 5, tap: 5, knockdown: 4, sub: 4, rocked: 4, subEscape: 3, takedown: 3, heavy: 3, comeback: 3, counter: 3, combo: 3, head: 2, body: 2, leg: 2, ground: 1, sprawl: 1, jab: 1, tired: 1, close: 2, dominant: 2, round: 2, start: 3, colour: 0, flow: 3 };

const ENERGY = { 0: 0.12, 1: 0.2, 2: 0.4, 3: 0.68, 4: 0.88, 5: 1 };
// calm analysis is the second commentator: lower, slower, rougher
const COLOUR = { jab: 1, body: 1, leg: 1, tired: 1, close: 1, dominant: 1, colour: 1, ground: 1, sprawl: 1, flow: 1, round: 1, subEscape: 0 };
class Commentary {
  constructor(game) {
    this.game = game;
    this.recent = [];
    this.lastAt = -99;
    this.lastColour = -99;
  }
  reset() { this.recent.length = 0; this.lastAt = -99; }
  // key: which kind of moment; force: say it even if we just spoke
  say(key, opts = {}) {
    const g = this.game;
    if (!g.audio.enabled || g.phase === 'menu') return;
    const now = g.simTime || 0;
    const prio = PRIORITY[key] == null ? 1 : PRIORITY[key];
    const gap = prio >= 4 ? 0.2 : prio >= 3 ? 1.2 : prio >= 2 ? 2.2 : 3.5;
    if (!opts.force && now - this.lastAt < gap) return;
    const bank = LINES[key];
    if (!bank || !bank.length) return;
    const fresh = bank.filter((l) => !this.recent.includes(l));
    const line = M.pick(fresh.length ? fresh : bank);
    this.recent.unshift(line);
    if (this.recent.length > 14) this.recent.pop();
    this.lastAt = now;
    g.audio.say(opts.name ? line.replace('соперник', opts.name) : line, prio >= 4 ? 1.2 : 1.08, prio >= 3, { energy: ENERGY[prio] == null ? 0.3 : ENERGY[prio], voice: COLOUR[key] ? 'color' : 'pbp' });
  }
  // quiet stretches get colour commentary
  tick(dt) {
    const g = this.game;
    if (g.phase !== 'fight') return;
    const now = g.simTime || 0;
    if (now - this.lastAt > 8 && now - this.lastColour > 12) {
      this.lastColour = now;
      const p1 = g.p1, p2 = g.p2;
      const tired = p1 && p2 && (p1.stamina < 35 || p2.stamina < 35);
      this.say(tired ? 'tired' : 'colour');
    }
  }
  roundEnd(cards) {
    const c = cards && cards[cards.length - 1];
    if (!c) return this.say('round', { force: true });
    const diff = Math.abs(c[2][0] - c[2][1]);
    this.say(diff < 8 ? 'close' : diff > 35 ? 'dominant' : 'round', { force: true });
  }
}
UFC.Commentary = Commentary;
})();

