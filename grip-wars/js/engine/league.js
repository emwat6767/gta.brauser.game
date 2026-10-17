//# sourceURL=ufc/league.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;

// ===========================================================================
// League: divisions, champions, Top-15, P4P and legends.
//
// The whole league is plain JSON (it lives inside each career save), and all
// logic is in the functions below, so a save always reloads exactly.
//
// Data policy: the real fighters come from UFC.ROSTER. Their placement and
// records below are game data based on public information up to 2025 and
// are kept in LEAGUE_DATA only, so the roster can be updated without touching
// the game code. Every other fighter is an original fictional athlete,
// generated from a fixed seed (no altered real names).
// ===========================================================================

const DIVISIONS = [
  { id: 'fw', name: 'Полулёгкий вес', en: 'FEATHERWEIGHT', kg: 66, lbs: 145 },
  { id: 'lw', name: 'Лёгкий вес', en: 'LIGHTWEIGHT', kg: 70, lbs: 155 },
  { id: 'ww', name: 'Полусредний вес', en: 'WELTERWEIGHT', kg: 77, lbs: 170 },
  { id: 'hw', name: 'Тяжёлый вес', en: 'HEAVYWEIGHT', kg: 120, lbs: 265, heavy: true },   // you can only fight them, not move up
];
UFC.DIVISIONS = DIVISIONS;
UFC.divById = (id) => DIVISIONS.find((d) => d.id === id) || DIVISIONS[1];

// rank: 0 = champion, 1..15 = ranked position; w/l/d, ko (KO/TKO), sub
const LEAGUE_DATA = {
  version: '2026.1',
  real: [
    { id: 'volkanovski', div: 'fw', rank: 0, rec: [27, 4, 0], ko: 13, sub: 3, defenses: 0, titles: 2, age: 37, hist: { def: 6, reign: 190, elite: 6, champ: 5, p4p: 1, p4pWeeks: 70, streak: 22 } },
    { id: 'topuria', div: 'lw', rank: 1, rec: [17, 0, 0], ko: 7, sub: 8, defenses: 0, titles: 2, age: 29, hist: { def: 0, reign: 40, elite: 3, champ: 3, p4p: 1, p4pWeeks: 20, streak: 17 } },
    { id: 'tsarukyan', div: 'lw', rank: 2, rec: [23, 3, 0], ko: 9, sub: 4, age: 29 },
    { id: 'oliveira', div: 'lw', rank: 3, rec: [35, 11, 0], ko: 10, sub: 21, titles: 1, age: 36 },
    { id: 'gaethje', div: 'lw', rank: 0, rec: [26, 5, 0], ko: 20, sub: 1, defenses: 0, titles: 1, age: 38, hist: { def: 0, reign: 14, elite: 6, champ: 2, p4p: 4, p4pWeeks: 4, streak: 3 } },
    { id: 'holloway', div: 'lw', rank: 4, rec: [27, 8, 0], ko: 12, sub: 2, titles: 1, age: 34 },
    { id: 'makhachev', div: 'ww', rank: 0, rec: [27, 1, 0], ko: 5, sub: 13, defenses: 0, titles: 2, age: 34, hist: { def: 4, reign: 130, elite: 5, champ: 3, p4p: 1, p4pWeeks: 55, streak: 15 } },
  ],
  legends: [
    { id: 'aldo', rec: [32, 9, 0], ko: 17, sub: 1, titles: 2, defenses: 9, era: '2006–2024', note: 'Король полулёгкого веса, 10 лет без поражений', hist: { reign: 286, elite: 8, champ: 6, p4p: 1, p4pWeeks: 52, streak: 18, opp: 1640 } },
    { id: 'mcgregor', rec: [22, 6, 0], ko: 19, sub: 1, titles: 2, defenses: 0, era: '2008–2021', note: 'Первый одновременный чемпион двух дивизионов', hist: { reign: 60, elite: 4, champ: 3, p4p: 1, p4pWeeks: 26, streak: 15, opp: 1620 } },
    { id: 'poirier', rec: [30, 10, 0], ko: 15, sub: 8, titles: 1, defenses: 0, era: '2009–2025', note: 'Временный чемпион, мастер войны на пятираундовой дистанции', hist: { reign: 20, elite: 8, champ: 5, p4p: 3, p4pWeeks: 0, streak: 5, opp: 1640 } },
  ],
  // The current top-15 of every division, under slightly changed names. Only the champions and the first
  // places of the lightweights come from the roster above.
  // [id, div, rank, name, nick, flag, style, southpaw, skill, age, height, wins, losses, ko, sub]
  field: [
    ['evloev', 'fw', 1, 'Мовсар Евлаев', 'Тихий', 'RU', 'wrestler', 0, 84, 32, 1.70, 20, 0, 5, 3], ['lopes', 'fw', 2, 'Диего Лопеш', 'Лобо', 'BR', 'brawler', 0, 84, 31, 1.75, 28, 7, 9, 15],
    ['murphy', 'fw', 3, 'Лерой Мэрфи', 'Ловкач', 'GB', 'boxer', 0, 83, 34, 1.75, 18, 0, 5, 3], ['sterling', 'fw', 4, 'Алджамен Стерлинг', 'Фанк', 'US', 'wrestler', 0, 82, 37, 1.75, 24, 5, 3, 9],
    ['silva', 'fw', 5, 'Жан Сильва-Нети', 'Бомбардир', 'BR', 'brawler', 0, 82, 30, 1.68, 17, 2, 12, 1], ['allen', 'fw', 6, 'Арни Эллен', 'Всевышний', 'GB', 'boxer', 0, 81, 32, 1.78, 21, 4, 9, 3],
    ['sabatini', 'fw', 7, 'Пэт Сабатино', 'Пэт', 'US', 'wrestler', 0, 79, 33, 1.70, 18, 3, 4, 9], ['andrusca', 'fw', 8, 'Павел Андрусик', 'Молдаванин', 'MD', 'brawler', 0, 78, 31, 1.70, 19, 5, 9, 4],
    ['zalal', 'fw', 9, 'Юсеф Заляль', 'Самум', 'MA', 'kickboxer', 1, 78, 29, 1.73, 17, 5, 4, 5], ['vallejos', 'fw', 10, 'Кевин Вальехо', 'Аргентинец', 'AR', 'brawler', 0, 78, 25, 1.70, 17, 1, 11, 4],
    ['brito', 'fw', 11, 'Жоандерсон Бритту', 'Бритто', 'BR', 'wrestler', 0, 77, 31, 1.68, 17, 3, 6, 8], ['costa', 'fw', 12, 'Мелькизаэл Косте', 'Мэл', 'BR', 'boxer', 0, 77, 27, 1.72, 21, 4, 8, 5],
    ['garcia', 'fw', 13, 'Стив Гарсиа', 'Гарс', 'US', 'kickboxer', 0, 77, 33, 1.80, 17, 5, 8, 3], ['pico', 'fw', 14, 'Аарон Пикко', 'Пик', 'US', 'boxer', 0, 78, 38, 1.70, 14, 4, 11, 1],
    ['emmers', 'fw', 15, 'Джамалл Эммерт', 'Эм', 'US', 'wrestler', 0, 76, 33, 1.75, 19, 4, 4, 7],
    ['pimblett', 'lw', 5, 'Падди Пимлетт', 'Малыш', 'GB', 'kickboxer', 0, 80, 31, 1.78, 23, 3, 4, 11], ['salkilld', 'lw', 6, 'Калиан Сакилит', 'Тихоня', 'AU', 'boxer', 0, 80, 29, 1.80, 18, 2, 8, 4],
    ['saintdenis', 'lw', 7, 'Бенуа Сен-Дюнь', 'Бульдог', 'FR', 'brawler', 0, 80, 30, 1.78, 17, 4, 9, 6], ['moicano', 'lw', 8, 'Ренато Мойсано', 'Зомби', 'BR', 'boxer', 0, 80, 37, 1.78, 20, 5, 4, 9],
    ['gamrot', 'lw', 9, 'Матеуш Гомрот', 'Гром', 'PL', 'wrestler', 0, 80, 36, 1.75, 25, 3, 7, 5], ['ruffy', 'lw', 10, 'Маурисио Раффи', 'Мозг', 'BR', 'kickboxer', 1, 80, 29, 1.80, 13, 1, 9, 2],
    ['nolan', 'lw', 11, 'Том Ноулан', 'Нол', 'AU', 'boxer', 0, 78, 33, 1.80, 13, 2, 7, 3], ['fiziev', 'lw', 12, 'Рафаэль Физаев', 'Молот', 'KG', 'kickboxer', 0, 80, 33, 1.77, 14, 4, 8, 1],
    ['musayev', 'lw', 13, 'Тофик Мусайев', 'Тофик', 'AZ', 'wrestler', 0, 78, 35, 1.76, 19, 3, 5, 6], ['dawson', 'lw', 14, 'Грант Даусон', 'Каменщик', 'US', 'wrestler', 0, 77, 32, 1.75, 22, 2, 4, 9],
    ['turner', 'lw', 15, 'Джейлин Тернер', 'Жираф', 'US', 'brawler', 0, 78, 31, 1.93, 15, 7, 9, 5],
    ['prates', 'ww', 1, 'Карлос Пратиш', 'Корона', 'BR', 'kickboxer', 0, 83, 33, 1.88, 24, 7, 17, 2], ['garry', 'ww', 2, 'Иан Мачадо Гэрри', 'Сэр Свэг', 'IE', 'kickboxer', 0, 82, 29, 1.85, 18, 2, 10, 1],
    ['morales', 'ww', 3, 'Майкл Мораль', 'Хитрец', 'EC', 'boxer', 0, 82, 28, 1.85, 20, 0, 16, 2], ['dellam', 'ww', 4, 'Джек Делла-Мадена', 'Стальной', 'AU', 'boxer', 0, 85, 30, 1.82, 18, 3, 15, 1],
    ['brady', 'ww', 5, 'Шон Брэйдли', 'Шейки', 'US', 'wrestler', 0, 81, 33, 1.75, 18, 1, 6, 5], ['bonfim', 'ww', 6, 'Габриэл Бонфин', 'Мастер', 'BR', 'wrestler', 0, 78, 30, 1.83, 18, 1, 3, 9],
    ['belal', 'ww', 7, 'Билал Мухамед', 'Мемфис', 'US', 'wrestler', 0, 80, 38, 1.80, 24, 4, 8, 0], ['buckley', 'ww', 8, 'Джоаким Баклер', 'Хулиган', 'US', 'brawler', 0, 80, 32, 1.80, 21, 7, 10, 2],
    ['medic', 'ww', 9, 'Урош Медиц', 'Серб', 'RS', 'kickboxer', 0, 78, 33, 1.80, 13, 4, 6, 3], ['edwards', 'ww', 10, 'Лион Эдвардс', 'Рокстар', 'GB', 'boxer', 0, 82, 35, 1.82, 22, 5, 8, 1],
    ['malott', 'ww', 11, 'Майк Малот', 'Малыш', 'CA', 'boxer', 0, 78, 33, 1.83, 11, 3, 8, 1], ['usman', 'ww', 12, 'Камару Осман', 'Кошмар', 'NG', 'wrestler', 0, 80, 39, 1.83, 20, 4, 8, 0],
    ['amosov', 'ww', 13, 'Ярослав Амосин', 'Борец', 'UA', 'wrestler', 0, 78, 32, 1.80, 28, 1, 8, 3], ['holland', 'ww', 14, 'Кевин Холлен', 'Тренер', 'US', 'brawler', 0, 78, 34, 1.93, 28, 12, 15, 9],
    ['drodrig', 'ww', 15, 'Дэниел Родригес', 'Дэнни', 'US', 'boxer', 0, 77, 33, 1.80, 17, 4, 11, 1],
    ['aspinal', 'hw', 0, 'Томас Эспиналл', 'Король', 'GB', 'boxer', 0, 88, 33, 1.96, 15, 3, 11, 3], ['gaine', 'hw', 1, 'Сирил Гейн', 'Хороший парень', 'FR', 'kickboxer', 1, 86, 36, 1.93, 14, 3, 6, 5],
    ['volgin', 'hw', 2, 'Александр Волгин', 'Драго', 'RU', 'kickboxer', 0, 84, 37, 1.99, 37, 11, 24, 3], ['pavlovsky', 'hw', 3, 'Сергей Павловский', 'Тигр', 'RU', 'brawler', 0, 85, 33, 1.91, 19, 3, 15, 0],
    ['blade', 'hw', 4, 'Кертис Блэйд', 'Разрушитель', 'US', 'wrestler', 0, 83, 35, 1.93, 20, 5, 12, 1], ['almeyda', 'hw', 5, 'Жайлтон Альмейда', 'Платок', 'BR', 'wrestler', 0, 84, 34, 1.88, 21, 4, 10, 8],
    ['cortes', 'hw', 6, 'Вальдо Кортес-Акоста', 'Пуэрториканец', 'DO', 'brawler', 0, 82, 33, 1.91, 18, 3, 12, 2], ['spivakov', 'hw', 7, 'Сергей Спиваков', 'Молдаванин', 'MD', 'wrestler', 0, 80, 31, 1.91, 17, 5, 10, 3],
    ['tybur', 'hw', 8, 'Марцин Тыбура', 'Тайбор', 'PL', 'brawler', 0, 78, 41, 1.91, 26, 9, 7, 6], ['lewiston', 'hw', 9, 'Дэррик Льюистон', 'Чёрный зверь', 'US', 'brawler', 0, 80, 41, 1.91, 29, 12, 25, 1],
    ['teixeira', 'hw', 10, 'Таллисон Тейшейра', 'Дровосек', 'BR', 'boxer', 0, 79, 31, 1.93, 10, 1, 6, 1], ['diniz', 'hw', 11, 'Жонатас Динис', 'Пантера', 'BR', 'brawler', 0, 79, 30, 1.88, 10, 0, 8, 1],
    ['kunilov', 'hw', 12, 'Ризван Кунилов', 'Рэмбо', 'RU', 'kickboxer', 0, 78, 33, 1.91, 15, 1, 11, 1], ['gasimov', 'hw', 13, 'Шамиль Гасимов', 'Кузнец', 'RU', 'wrestler', 0, 78, 34, 1.88, 15, 0, 10, 0],
    ['parkinson', 'hw', 14, 'Мик Паркинсон', 'Гигант', 'AU', 'kickboxer', 0, 76, 33, 1.96, 11, 0, 9, 1], ['delich', 'hw', 15, 'Анте Делич', 'Хорват', 'HR', 'brawler', 0, 76, 34, 1.96, 14, 3, 10, 1],
  ],
  // more legends of the sport under slightly changed names; the player can be offered a fight with one of them
  // [id, div, name, nick, flag, style, southpaw, age, height, wins, losses, ko, sub, era, note, titles, defenses, hist]
  legendField: [
    ['gsp', 'ww', 'Жорж Сен-Пьер', 'Рашад', 'CA', 'wrestler', 0, 45, 1.78, 26, 2, 8, 6, '2002–2019', 'Чемпион двух весов, образец расчёта', 2, 9, { reign: 330, elite: 10, champ: 8, p4p: 1, p4pWeeks: 110, streak: 13, opp: 1660 }],
    ['khabib', 'lw', 'Хабиб Нурмаев', 'Орёл', 'RU', 'wrestler', 0, 38, 1.78, 29, 0, 8, 11, '2008–2020', 'Непобеждённый чемпион лёгкого веса', 1, 3, { reign: 180, elite: 6, champ: 5, p4p: 1, p4pWeeks: 80, streak: 29, opp: 1650 }],
    ['dj', 'fw', 'Деметриус Джонсон', 'Мистер', 'US', 'boxer', 0, 40, 1.62, 30, 4, 7, 4, '2007–2022', 'Рекордные защиты в лёгчайшем весе', 1, 11, { reign: 380, elite: 8, champ: 7, p4p: 1, p4pWeeks: 120, streak: 13, opp: 1640 }],
    ['faber', 'fw', 'Юрайя Фабер', 'Калифорнийец', 'US', 'wrestler', 0, 47, 1.69, 35, 12, 14, 9, '2003–2020', 'Легенда лёгчайшего веса', 1, 4, { reign: 150, elite: 6, champ: 4, p4p: 3, p4pWeeks: 20, streak: 8, opp: 1600 }],
    ['edgar', 'fw', 'Фрэнки Эдгар', 'Крепыш', 'US', 'wrestler', 0, 45, 1.67, 25, 10, 8, 3, '2005–2024', 'Чемпион, который не ломался', 1, 3, { reign: 90, elite: 7, champ: 5, p4p: 3, p4pWeeks: 15, streak: 8, opp: 1620 }],
    ['diaz', 'ww', 'Нейт Диас', 'Стоктон', 'US', 'boxer', 0, 41, 1.83, 21, 13, 7, 14, '2004–2025', 'Король трэш-тока', 0, 0, { reign: 0, elite: 5, champ: 4, p4p: 8, p4pWeeks: 0, streak: 5, opp: 1600 }],
    ['ferguson', 'lw', 'Тони Фергюсон', 'Эль Кукуй', 'US', 'brawler', 0, 42, 1.80, 26, 10, 15, 8, '2008–2025', 'Серия из 12 побед и самые странные бои', 0, 0, { reign: 20, elite: 7, champ: 4, p4p: 3, p4pWeeks: 10, streak: 12, opp: 1620 }],
    ['lawler', 'ww', 'Роби Лоулер', 'Крутой', 'US', 'brawler', 1, 44, 1.80, 30, 16, 17, 2, '2002–2023', 'Чемпион, бивший всех подряд', 1, 3, { reign: 110, elite: 8, champ: 5, p4p: 5, p4pWeeks: 8, streak: 6, opp: 1610 }],
    ['hughes', 'ww', 'Мэтт Хьюз', 'Фермер', 'US', 'wrestler', 0, 52, 1.75, 45, 9, 18, 7, '1998–2010', 'Зал славы, король полусреднего', 2, 7, { reign: 260, elite: 8, champ: 7, p4p: 3, p4pWeeks: 20, streak: 13, opp: 1590 }],
    ['penn', 'lw', 'Би-Джей Пенн', 'Малыш', 'US', 'boxer', 0, 47, 1.70, 16, 14, 7, 11, '2001–2019', 'Чемпион двух весов, гений джиу-джитсу', 2, 3, { reign: 100, elite: 6, champ: 5, p4p: 1, p4pWeeks: 30, streak: 9, opp: 1620 }],
  ],
  // original legends (fictional) to fill the GOAT hall
  fictionalLegends: 4,
};
UFC.LEAGUE_DATA = LEAGUE_DATA;

// ---------------------------------------------------------------------------
// The ladder: three regional leagues to start in (become the champion or a hard
// finisher to get the UFC contract), then the UFC itself. Opponents of the small
// leagues are noticeably weaker (stats, punch, speed, reactions); the UFC is the
// full league with the real money and the real belt.
// dmg / spd: how hard and how fast the AI hits; drop: AI levels below your choice;
// purse / hype: money and hype multipliers; top / pool: skill of the champion / of the unranked prospects.
// ---------------------------------------------------------------------------
UFC.TIERS = {
  cw: { id: 'cw', name: 'Cage Warriors', event: 'CAGE WARRIORS', dmg: 0.9, spd: 0.95, drop: 1, purse: 0.15, hype: 0.5, top: 72, pool: 58, flags: ['GB', 'IE', 'FR', 'PL', 'SE', 'GE', 'NG', 'AU'], blurb: 'Европа: самые слабые соперники, маленькие гонорары' },
  aca: { id: 'aca', name: 'ACA', event: 'ACA', dmg: 0.95, spd: 0.97, drop: 1, purse: 0.22, hype: 0.55, top: 74, pool: 60, flags: ['RU', 'KZ', 'GE', 'AM'], blurb: 'Россия и Кавказ: жёсткие бойцы, средние гонорары' },
  pfl: { id: 'pfl', name: 'PFL', event: 'PFL', dmg: 1.03, spd: 1.0, drop: 0, purse: 0.38, hype: 0.7, top: 77, pool: 62, flags: ['US', 'BR', 'MX', 'GB', 'FR', 'RU'], blurb: 'США: сильнейшая из малых лиг, лучшие деньги' },
  ufc: { id: 'ufc', name: 'UFC', event: 'UFC', dmg: 1.25, spd: 1.1, drop: 0, purse: 1, hype: 1, top: 84, pool: 70, flags: null, blurb: 'Высшая лига: сильнейшие бойцы мира, пояс, миллионы' },
};
// [id, div, rank (0 = champion), name, nick, flag, style, southpaw, skill, age, height, wins, losses, ko, sub]
// Fighters of the small leagues under slightly changed names (the rosters are approximate: a game, not a database).
LEAGUE_DATA.tiers = {
  cw: { field: [
    ['hoston', 'fw', 0, 'Росс Хьюстер', 'Тихоня', 'GB', 'boxer', 0, 72, 29, 1.70, 13, 2, 5, 3], ['vucen', 'fw', 1, 'Джордан Вученик', 'Серб', 'GB', 'brawler', 0, 71, 28, 1.72, 12, 3, 6, 2],
    ['duques', 'fw', 2, 'Том Дюкенуа', 'Дуки', 'FR', 'kickboxer', 0, 70, 31, 1.70, 18, 5, 6, 4], ['hamm', 'fw', 3, 'Ли Хэммонд', 'Молот', 'GB', 'wrestler', 0, 69, 30, 1.73, 14, 4, 3, 6],
    ['williamz', 'fw', 4, 'Карл Уильямсон', 'Кальмар', 'GB', 'brawler', 1, 68, 27, 1.74, 11, 3, 5, 2],
    ['maguir', 'lw', 0, 'Киран Магвайер', 'Кабан', 'IE', 'brawler', 0, 72, 28, 1.76, 14, 2, 9, 2], ['lindq', 'lw', 1, 'Оскар Линдквист', 'Викинг', 'SE', 'kickboxer', 0, 71, 27, 1.80, 12, 2, 7, 2],
    ['mazur', 'lw', 2, 'Мацей Мазур', 'Каток', 'PL', 'boxer', 0, 70, 29, 1.78, 15, 4, 6, 3], ['beridze', 'lw', 3, 'Леван Беридзе', 'Грузин', 'GE', 'wrestler', 0, 69, 30, 1.76, 13, 3, 3, 6],
    ['okafor', 'lw', 4, 'Тунде Окафор', 'Тунде', 'NG', 'brawler', 0, 68, 26, 1.80, 10, 2, 6, 1],
    ['dunne', 'ww', 0, 'Рори Данн', 'Данни', 'IE', 'boxer', 0, 73, 30, 1.82, 15, 3, 8, 2], ['kowal', 'ww', 1, 'Кацпер Ковальчик', 'Кузнец', 'PL', 'brawler', 0, 72, 29, 1.84, 16, 4, 10, 2],
    ['hollm', 'ww', 2, 'Виктор Хольмгрен', 'Лось', 'SE', 'wrestler', 0, 71, 28, 1.85, 13, 2, 4, 6], ['marsh', 'ww', 3, 'Матис Маршан', 'Эйфель', 'FR', 'kickboxer', 1, 70, 27, 1.83, 12, 3, 6, 3],
    ['whit', 'ww', 4, 'Джейк Уитакер', 'Дикарь', 'AU', 'brawler', 0, 69, 31, 1.82, 14, 5, 8, 1],
  ] },
  aca: { field: [
    ['abdur', 'fw', 0, 'Салах Абдурахманов', 'Борец', 'RU', 'wrestler', 0, 74, 31, 1.68, 22, 4, 6, 10], ['vagaev', 'fw', 1, 'Абубакар Вагаев', 'Волк', 'RU', 'boxer', 0, 73, 29, 1.70, 19, 3, 10, 4],
    ['ulanb', 'fw', 2, 'Тагир Уланбеков', 'Орёл', 'RU', 'kickboxer', 0, 72, 28, 1.72, 16, 3, 9, 3], ['aliev', 'fw', 3, 'Руслан Алиев', 'Алый', 'RU', 'brawler', 1, 71, 30, 1.69, 15, 4, 8, 3],
    ['kerim', 'fw', 4, 'Керим Адилов', 'Ястреб', 'KZ', 'wrestler', 0, 70, 27, 1.71, 13, 2, 3, 7],
    ['zhamal', 'lw', 0, 'Салман Жамалдинов', 'Чёрный', 'RU', 'brawler', 0, 75, 32, 1.76, 21, 5, 9, 8], ['sulei', 'lw', 1, 'Алихан Сулейманов', 'Алик', 'RU', 'boxer', 0, 74, 28, 1.77, 17, 3, 8, 5],
    ['kokov', 'lw', 2, 'Мухамед Коков', 'Кок', 'RU', 'kickboxer', 0, 73, 29, 1.78, 18, 5, 10, 3], ['frol', 'lw', 3, 'Артём Фролов', 'Фрол', 'RU', 'boxer', 0, 72, 30, 1.79, 17, 4, 7, 4],
    ['sakhab', 'lw', 4, 'Бахтияр Сахабутдинов', 'Бахти', 'KZ', 'wrestler', 0, 70, 27, 1.77, 13, 2, 4, 5],
    ['bagov', 'ww', 0, 'Али Багов', 'Багор', 'RU', 'kickboxer', 0, 75, 31, 1.82, 22, 4, 11, 5], ['salih', 'ww', 1, 'Муслим Салихов', 'Муса', 'RU', 'kickboxer', 0, 74, 34, 1.80, 19, 3, 9, 4],
    ['tumen', 'ww', 2, 'Альберт Туменов', 'Тумен', 'RU', 'brawler', 0, 73, 34, 1.80, 19, 8, 12, 2], ['podma', 'ww', 3, 'Александр Подмаскин', 'Подма', 'RU', 'wrestler', 0, 72, 29, 1.84, 16, 4, 5, 6],
    ['dauk', 'ww', 4, 'Ибрагим Даулетмуратов', 'Дайк', 'KZ', 'boxer', 0, 70, 28, 1.83, 14, 3, 6, 4],
  ] },
  pfl: { field: [
    ['rabad', 'fw', 0, 'Гаджи Рабаданин', 'Чемпион', 'RU', 'wrestler', 0, 78, 33, 1.70, 20, 3, 6, 8], ['hughs', 'fw', 1, 'Пол Хьюс', 'Хьюзи', 'GB', 'boxer', 0, 76, 34, 1.73, 15, 3, 5, 4],
    ['mckee', 'fw', 2, 'Эй-Джей Маккей', 'Эйджей', 'US', 'brawler', 0, 77, 30, 1.73, 22, 3, 15, 4], ['pinedo', 'fw', 3, 'Хесус Пинедо', 'Хес', 'MX', 'boxer', 0, 74, 28, 1.72, 20, 4, 10, 5],
    ['davis', 'fw', 4, 'Элфи Дэвидс', 'Элфи', 'GB', 'kickboxer', 0, 73, 30, 1.70, 16, 4, 7, 4],
    ['nurma', 'lw', 0, 'Усман Нурмаев', 'Хан', 'RU', 'wrestler', 0, 79, 27, 1.78, 19, 0, 9, 6], ['sy', 'lw', 1, 'Садибу Сай', 'Сай', 'FR', 'kickboxer', 0, 76, 31, 1.80, 18, 5, 8, 4],
    ['collard', 'lw', 2, 'Клэй Коллинз', 'Бык', 'US', 'brawler', 0, 75, 36, 1.75, 23, 8, 15, 3], ['antig', 'lw', 3, 'Гаджимурад Антигулин', 'Гаджи', 'RU', 'wrestler', 0, 75, 29, 1.76, 22, 2, 6, 9],
    ['barna', 'lw', 4, 'Мансур Барнави', 'Мансур', 'FR', 'kickboxer', 0, 73, 32, 1.80, 17, 4, 8, 5],
    ['jacks', 'ww', 0, 'Джейсон Джексонс', 'Джейк', 'US', 'brawler', 0, 78, 33, 1.80, 19, 3, 10, 4], ['musae', 'ww', 1, 'Шамиль Мусеев', 'Муса', 'RU', 'boxer', 0, 77, 31, 1.82, 21, 3, 12, 3],
    ['impa', 'ww', 2, 'Импа Касангани', 'Импа', 'US', 'kickboxer', 0, 76, 35, 1.88, 17, 5, 9, 2], ['umalat', 'ww', 3, 'Магомед Умалатин', 'Маги', 'RU', 'wrestler', 0, 75, 30, 1.78, 15, 2, 5, 6],
    ['bruno', 'ww', 4, 'Давид Реймонд', 'Ночь', 'FR', 'boxer', 0, 74, 28, 1.84, 15, 3, 8, 3],
  ] },
};

// ---------------------------------------------------------------- seeded rng
function rngFrom(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(r.range(lo, hi + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}
UFC.rngFrom = rngFrom;

// ---------------------------------------------------------------- name pools (original)
const ORIGINS = [
  { flag: 'BR', first: ['Тиаго', 'Витор', 'Лукас', 'Кайо', 'Ренан', 'Жулиан', 'Эдсон', 'Маурисиу'], last: ['Фалькан', 'Барбоза-Нету', 'Карвалью', 'Ваз', 'Пиментел', 'Коэлью', 'Тавейра', 'Магальяйнс'] },
  { flag: 'RU', first: ['Арсений', 'Глеб', 'Ростислав', 'Тимофей', 'Ярослав', 'Всеволод', 'Мирон', 'Савелий'], last: ['Беркутов', 'Ладейщиков', 'Сотников', 'Громадин', 'Кречетов', 'Озеров', 'Панкратьев', 'Шелестов'] },
  { flag: 'KZ', first: ['Ерлан', 'Даурен', 'Асхат', 'Нурсултан', 'Бауыржан', 'Темирлан'], last: ['Сарыбаев', 'Жумабеков', 'Тулегенов', 'Есимханов', 'Байтасов', 'Кенжебаев'] },
  { flag: 'US', first: ['Колтон', 'Трэвис', 'Мейсон', 'Даррелл', 'Брэкстон', 'Кейд', 'Остин', 'Гаррет'], last: ['Холлингсворт', 'Бакстер', 'Рэдклифф', 'Ламберт', 'Уэйкфилд', 'Стэнсбери', 'Мэддокс', 'Кроуфорд-Линн'] },
  { flag: 'MX', first: ['Эмилиано', 'Сантьяго', 'Рауль', 'Октавио', 'Хоакин'], last: ['Сальватьерра', 'Эскудеро', 'Карденас-Рей', 'Монтальво', 'Арреола'] },
  { flag: 'PL', first: ['Мацей', 'Кацпер', 'Шимон', 'Бартош'], last: ['Ковальчик', 'Вишневский', 'Домбровский', 'Сташак'] },
  { flag: 'IE', first: ['Киран', 'Ронан', 'Финн', 'Оскар'], last: ['Магуайр', 'О’Салливан', 'Кэвана', 'Ханниган'] },
  { flag: 'GE', first: ['Леван', 'Гиорги', 'Автандил', 'Зураб'], last: ['Беридзе', 'Кавтарадзе', 'Мчедлишвили', 'Цуладзе'] },
  { flag: 'JP', first: ['Рэн', 'Кайто', 'Сота', 'Харуто'], last: ['Сакагути', 'Мотояма', 'Кирисима', 'Отомо'] },
  { flag: 'AU', first: ['Джейк', 'Лиам', 'Броди', 'Кейси'], last: ['Уитакер-Хейз', 'Маккензи', 'Торнбери', 'Лоусон'] },
  { flag: 'NG', first: ['Чиди', 'Эмека', 'Тунде', 'Оби'], last: ['Адебайо', 'Нвачукву', 'Окафор', 'Эзеулу'] },
  { flag: 'SE', first: ['Оскар', 'Линус', 'Виктор', 'Эмиль'], last: ['Линдквист', 'Бергстрём', 'Хольмгрен', 'Сандберг'] },
  { flag: 'AM', first: ['Гор', 'Нарек', 'Тигран', 'Давит'], last: ['Мкртчян', 'Арутюнян', 'Саргсян', 'Геворгян'] },
  { flag: 'FR', first: ['Матис', 'Ноэ', 'Базиль', 'Тео'], last: ['Лефевр', 'Бонфуа', 'Дюкасс', 'Маршан'] },
];
const NICKS = ['Молот', 'Кобра', 'Буря', 'Хирург', 'Ледокол', 'Скорпион', 'Шторм', 'Тайфун', 'Гвоздь', 'Барс', 'Волк', 'Сокол', 'Кочевник', 'Бульдозер', 'Снайпер', 'Джокер', 'Мастер', 'Тень', 'Кузнец', 'Викинг',
  'Питбуль', 'Гладиатор', 'Капитан', 'Пантера', 'Лезвие', 'Самурай', 'Динамит', 'Профессор', 'Ковбой', 'Танк', 'Анаконда', 'Призрак', 'Тигр', 'Беркут', 'Жнец', 'Медведь-гризли', 'Удав', 'Метеор', 'Шаман', 'Горец'];
const SKINS = [0xf0cbad, 0xe6bd9c, 0xe2b594, 0xd6a57c, 0xc99a74, 0xb98363, 0xa8744f, 0x8a5a3c, 0x6b4430, 0x57382a];
const HAIRC = [0x0e0a07, 0x1a120c, 0x2a1e16, 0x3b2a1c, 0x5a4632, 0x6b3f22, 0x9a6a3a, 0xb99a6a];
const HAIRSTYLES = ['bald', 'buzz', 'buzz', 'short', 'short', 'fade', 'fade', 'curly', 'slick', 'long', 'mohawk', 'bun'];
const BEARDS = ['none', 'none', 'stubble', 'stubble', 'short', 'full', 'full', 'goatee', 'thick'];
const SHORTS = [0x111113, 0xeeeeee, 0xb3121b, 0x18386a, 0x0b7a3e, 0xd8b24a, 0xe0602b, 0x5b2a86, 0x2a2a2e, 0x7c0d13];
const TRIMS = [0xd8b24a, 0xeeeeee, 0x111111, 0xc8101a, 0x1f8a4c, 0x2a6ad8];
const MOTIFS = [null, null, null, 'lion', 'tiger', 'bull', 'panther', 'eagle'];
const TATTOO_DESIGNS = ['tribal', 'script', 'rose', 'geometric', 'lion', 'eagle', 'dragon', 'stars'];
const STYLES = ['boxer', 'kickboxer', 'brawler'];
UFC.STYLE_NAMES.grappler = UFC.STYLE_NAMES.grappler || 'Грэпплер';

const DIV_BODY = { fw: [1.66, 1.78], lw: [1.70, 1.82], ww: [1.75, 1.88], hw: [1.88, 2.01] };

function statsFor(style, ovr, r) {
  const base = { power: 0, speed: 0, chin: 0, cardio: 0, defense: 0, boxing: 0, kicks: 0, wrestling: 0, bjj: 0 };
  const bias = {
    boxer: { boxing: 9, speed: 5, defense: 4, kicks: -8, wrestling: -5, bjj: -5 },
    kickboxer: { kicks: 10, speed: 4, boxing: 3, wrestling: -7, bjj: -5 },
    wrestler: { wrestling: 11, cardio: 5, bjj: 4, kicks: -8, boxing: -4, speed: -2 },
    brawler: { power: 11, chin: 6, boxing: 2, defense: -9, cardio: -3, bjj: -6 },
    grappler: { bjj: 12, wrestling: 5, cardio: 3, power: -5, kicks: -6, boxing: -5 },
  }[style];
  for (const k in base) base[k] = Math.round(M.clamp(ovr + (bias[k] || 0) + r.range(-6, 6), 45, 95));
  return base;
}

function lookFor(r, style) {
  const hairStyle = r.pick(HAIRSTYLES);
  const tattoos = [];
  const nT = r.pick([0, 0, 1, 1, 2, 3]);
  const places = ['armL', 'armR', 'chest', 'back', 'forearmL', 'forearmR'];
  for (let i = 0; i < nT; i++) {
    const place = places.splice(r.int(0, places.length - 1), 1)[0];
    tattoos.push({ design: r.pick(TATTOO_DESIGNS), place, size: +r.range(0.55, 1).toFixed(2), ink: +r.range(0.6, 0.95).toFixed(2) });
  }
  return {
    skin: r.pick(SKINS), hair: r.pick(HAIRC), hairStyle, hairLen: +r.range(0.2, 0.9).toFixed(2), beard: r.pick(BEARDS),
    eye: r.pick([0x24160c, 0x3b2a1a, 0x3b5a6e, 0x4a5a2a, 0x1a1a1a]),
    face: { shape: +r.range(0.2, 0.8).toFixed(2), jaw: +r.range(0.25, 0.85).toFixed(2), nose: +r.range(0.2, 0.85).toFixed(2), eyes: +r.range(0.3, 0.7).toFixed(2), brows: +r.range(0.3, 0.9).toFixed(2), cheeks: +r.range(0.2, 0.8).toFixed(2) },
    shorts: r.pick(SHORTS), shortsTrim: r.pick(TRIMS), shortsStyle: r.pick(['classic', 'classic', 'side', 'split', 'stripes', 'gradient']),
    motif: r.pick(MOTIFS), gloves: r.chance(0.8) ? 0x121212 : r.pick([0xb3121b, 0x1b2f63]), tattoos,
  };
}

const USED_NAMES = new Set();
function genFighter(r, div, ovr, id, opts = {}) {
  let o = r.pick(opts.origins || ORIGINS);
  const style = opts.style || r.pick(STYLES);
  const [h0, h1] = DIV_BODY[div];
  const height = +r.range(h0, h1).toFixed(2);
  const d = UFC.divById(div);
  let name = r.pick(o.first) + ' ' + r.pick(o.last);
  for (let i = 0; i < 30 && USED_NAMES.has(name.split(' ')[1]); i++) { o = r.pick(opts.origins || ORIGINS); name = r.pick(o.first) + ' ' + r.pick(o.last); }
  USED_NAMES.add(name.split(' ')[1]);
  const wins = Math.max(3, Math.round((ovr - 55) * 0.55 + r.range(0, 8)));
  const losses = Math.round(r.range(0, 6) * (1.1 - (ovr - 60) / 40));
  const stats = statsFor(style, ovr, r);
  for (const k in stats) stats[k] = Math.round(40 + (stats[k] - 40) * 1.0);
  if (div === 'hw') { stats.power = Math.min(112, stats.power + 14); stats.chin = Math.min(105, stats.chin + 9); stats.speed = Math.max(45, stats.speed - 4); stats.cardio = Math.max(45, stats.cardio - 3); }   // a heavyweight hits like a truck and takes it like one
  const fin = r.range(0.35, 0.8);
  const kickW = (stats.power + stats.boxing + stats.kicks) / 3, grapW = (stats.bjj + stats.wrestling) / 2;
  const ko = Math.round(wins * fin * (kickW / (kickW + grapW)) * 1.3);
  const sub = Math.round(wins * fin * (grapW / (kickW + grapW)) * 0.9);
  return {
    id, name, short: name.split(' ').slice(1).join(' '), nick: r.pick(NICKS), flag: o.flag, div,
    height, weight: d.kg, reach: +(height * r.range(0.99, 1.07)).toFixed(2), build: +r.range(0.6, 0.95).toFixed(2),
    stance: r.chance(0.28) ? 'southpaw' : 'orthodox', style: style === 'grappler' ? 'wrestler' : style, styleKey: style,
    stats, look: lookFor(r, style), age: r.int(23, 36), original: true, _nerfed: true,
    rec: { w: wins, l: losses, d: r.chance(0.12) ? 1 : 0, ko: Math.min(ko, wins), sub: Math.min(sub, Math.max(0, wins - Math.min(ko, wins))) },
    rating: Math.round(1250 + (ovr - 60) * 14 + r.range(-25, 25)),
    streak: r.int(0, 4), defenses: 0, titles: 0, history: [], lastFightWeek: -r.int(2, 20),
  };
}

// ---------------------------------------------------------------- creation
function fromRoster(rosterId, extra) {
  const src = UFC.ROSTER.find((f) => f.id === rosterId);
  if (!src) return null;
  const e = extra || {};
  const ovr = UFC.overall(src);
  // Keep the whole league inside the intended skill band (peak ~86).
  const stats = Object.assign({}, src.stats);
  const raw = overallOf({ stats });
  if (raw > 92) for (const k in stats) stats[k] = Math.round(stats[k] * 92 / raw);
  return {
    id: src.id, name: src.name, short: src.short, nick: src.nick, flag: src.flag, div: e.div || 'lw',
    height: src.height, weight: e.div ? UFC.divById(e.div).kg : src.weight, reach: src.reach, build: src.build, stance: src.stance, style: src.style, styleKey: src.style,
    stats, look: JSON.parse(JSON.stringify(src.look)), age: e.age || 30, original: !!src.original, real: !src.original,
    rec: { w: e.rec[0], l: e.rec[1], d: e.rec[2], ko: e.ko || 0, sub: e.sub || 0 },
    rating: Math.round(1300 + (ovr - 60) * 15 + (e.rank === 0 ? 90 : e.rank != null ? (16 - e.rank) * 4 : 0)),
    streak: e.rank === 0 ? 3 : 1, defenses: e.defenses || 0, titles: e.titles || 0, history: [], lastFightWeek: -8,
  };
}

function createLeague(seed = 2026, tier = 'ufc') {
  const r = rngFrom(seed);
  const T = UFC.TIERS[tier] || UFC.TIERS.ufc, minor = tier !== 'ufc' && !!UFC.TIERS[tier];
  const origins = minor && T.flags ? ORIGINS.filter((o) => T.flags.includes(o.flag)) : null;
  const L = { v: 1, seed, week: 0, fighters: {}, divs: {}, legends: [], news: [], dataVersion: LEAGUE_DATA.version, tier: minor ? tier : 'ufc' };
  USED_NAMES.clear();
  let n = 0;
  for (const d of DIVISIONS) {
    const slots = new Array(16).fill(null);
    for (const e of (minor ? [] : LEAGUE_DATA.real).filter((x) => x.div === d.id)) {
      const f = fromRoster(e.id, e);
      if (!f) continue;
      L.fighters[f.id] = f; slots[e.rank] = f.id;
    }
    for (const e of (minor ? LEAGUE_DATA.tiers[tier].field : LEAGUE_DATA.field).filter((x) => x[1] === d.id)) {
      const [fid, , rank, name, nick, flag, style, sw, ovr, age, ht, w, l, ko, sub] = e;
      const f = genFighter(r, d.id, ovr, (minor ? 't_' + tier + '_' : 'r_') + fid, { style });
      f.name = name; f.short = name.split(' ').slice(1).join(' ') || name; f.nick = nick; f.flag = flag; f.age = age;
      f.height = ht; f.reach = +(ht * r.range(0.99, 1.06)).toFixed(2); f.stance = sw ? 'southpaw' : 'orthodox';
      f.rec = { w, l, d: 0, ko: Math.min(ko, w), sub: Math.min(sub, Math.max(0, w - Math.min(ko, w))) };
      f.rating = Math.round(minor ? 1260 + (16 - rank) * 9 + r.range(-10, 10) : 1470 + (16 - rank) * 14 + r.range(-12, 12)); f.streak = r.int(0, 3); f.actual = true;
      if (rank === 0) { f.titles = 1; f.streak = 4; }
      L.fighters[f.id] = f; slots[rank] = f.id;
    }
    for (let i = 0; i < 16; i++) {
      if (slots[i]) continue;
      // OVR is skill, not position: a prospect can out-rate a champion.
      const ovr = minor ? M.clamp(T.top - i * 0.45 + r.range(-3, 3), 52, 88) : M.clamp((i === 0 ? 84 : 82 - i * 0.55) + r.range(-4, 4), 72, 86);
      const f = genFighter(r, d.id, ovr, 'g' + (n++), { origins });
      if (i === 0) { f.titles = 1; f.streak = 4; }
      L.fighters[f.id] = f; slots[i] = f.id;
    }
    // unranked prospects for the early career
    const pool = [];
    for (let i = 0; i < 12; i++) {
      const f = genFighter(r, d.id, minor ? T.pool + r.range(-4, 6) : 70 + r.range(-4, 8), 'g' + (n++), { origins });
      f.rec.w = r.int(4, 11); f.rec.l = r.int(0, 4); f.rec.ko = Math.min(f.rec.ko, f.rec.w); f.rec.sub = Math.min(f.rec.sub, f.rec.w - f.rec.ko);
      L.fighters[f.id] = f; pool.push(f.id);
    }
    L.divs[d.id] = { champ: slots[0], ranked: slots.slice(1), pool };
  }
  for (const e of (minor ? [] : LEAGUE_DATA.legends)) {
    const f = fromRoster(e.id, Object.assign({ div: 'fw' }, e));
    if (!f) continue;
    f.legend = true; f.era = e.era; f.note = e.note; f.rating = 1500; f.totalDefenses = e.defenses || 0; f.legacy = 18;
    if (e.id === 'mcgregor') f.divTitles = ['fw', 'lw'];
    applyHist(f, e.hist);
    f.goat = goatScore(f, L);
    L.fighters[f.id] = f; L.legends.push(f.id);
  }
  for (let i = 0; i < (minor ? 0 : LEAGUE_DATA.fictionalLegends); i++) {
    const div = DIVISIONS[i % 3].id;
    const f = genFighter(r, div, 90, 'legend' + i, {});
    f.legend = true; f.age = r.int(40, 52);
    f.rec = { w: r.int(24, 34), l: r.int(2, 7), d: 0, ko: 0, sub: 0 };
    f.rec.ko = r.int(8, 16); f.rec.sub = r.int(2, f.rec.w - f.rec.ko - 3);
    f.titles = r.int(1, 2); f.defenses = r.int(3, 9);
    f.totalDefenses = f.defenses; f.legacy = 14;
    applyHist(f, { reign: 52 * r.int(2, 5), elite: r.int(3, 8), champ: r.int(2, 6), p4p: r.pick([1, 2, 3, 5]), p4pWeeks: r.int(0, 40), streak: r.int(8, 16), opp: 1560 + r.int(0, 80) });
    f.goat = goatScore(f, L);
    f.era = (1996 + i * 4) + '–' + (2008 + i * 4); f.note = 'Легенда лиги (оригинальный персонаж)';
    L.fighters[f.id] = f; L.legends.push(f.id);
  }
  for (const e of (minor ? [] : LEAGUE_DATA.legendField)) {
    const [lid, div, name, nick, flag, style, sw, age, ht, w, l, ko, sub, era, note, titles, defenses, hist] = e;
    const f = genFighter(r, div, 91, 'lg_' + lid, { style });
    f.name = name; f.short = name.split(' ').slice(1).join(' ') || name; f.nick = nick; f.flag = flag; f.age = age; f.height = ht; f.reach = +(ht * r.range(1.0, 1.06)).toFixed(2); f.stance = sw ? 'southpaw' : 'orthodox';
    f.rec = { w, l, d: 0, ko: Math.min(ko, w), sub: Math.min(sub, Math.max(0, w - Math.min(ko, w))) };
    f.legend = true; f.era = era; f.note = note; f.rating = 1500; f.titles = titles; f.defenses = defenses; f.totalDefenses = defenses; f.legacy = 14 + titles * 2;
    applyHist(f, hist);
    f.goat = goatScore(f, L);
    L.fighters[f.id] = f; L.legends.push(f.id);
  }
  L.legends.sort((a, b) => L.fighters[b].goat - L.fighters[a].goat);
  // active real champions carry their history into the league
  for (const e of (minor ? [] : LEAGUE_DATA.real)) if (e.hist && L.fighters[e.id]) applyHist(L.fighters[e.id], e.hist, true);
  for (const f of Object.values(L.fighters)) if (!f.legend && f.id !== 'player' && f.stats && !f._nerfed) { f._nerfed = true; }   // real roster fighters too
  if (!minor) { addGorillas(L, r); buffUfc(L); }
  assignHp(L);
  return L;
}
// the UFC is the top of the sport: everybody in it is stronger than before (once per league, also applied to older saves)
function buffUfc(L) {
  if (L.buffV === 2 || (L.tier && L.tier !== 'ufc')) return;
  for (const f of Object.values(L.fighters)) {
    if (f.id === 'player' || !f.stats || f.gorilla) continue;
    const add = f.legend ? 4 : 5;
    for (const k in f.stats) f.stats[k] = Math.min(98, Math.round((f.stats[k] + add) * 10) / 10);
  }
  L.buffV = 2;
}

// Historical numbers from the data. active: the fighter is still competing,
// so his current reign keeps counting from week 0.
function applyHist(f, h, active) {
  if (!h) return;
  if (h.def != null) f.totalDefenses = Math.max(f.totalDefenses || 0, h.def);
  if (active && h.reign) { f.champSince = -h.reign; } else if (h.reign) f.longestReign = h.reign;
  f.eliteWins = h.elite || 0; f.champWins = h.champ || 0;
  if (h.p4p) f.bestP4P = h.p4p;
  f.p4pTopWeeks = h.p4pWeeks || 0;
  f.bestStreak = h.streak || 0;
  if (h.opp) f.histOpp = h.opp;
}

// Saves made before the legacy system: fill in what can be known.
// the heavyweight top-15 for careers that were started before the division existed
function addHeavy(L) {
  if (L.divs.hw) return;
  const tier = L.tier && UFC.TIERS[L.tier] ? L.tier : 'ufc';
  const L2 = createLeague(L.seed || 2026, tier), D2 = L2.divs.hw;
  if (!D2) return;
  const map = {};
  for (const id of [D2.champ].concat(D2.ranked, D2.pool)) { const f = L2.fighters[id]; if (!f) continue; map[id] = 'hw_' + id; f.id = map[id]; L.fighters[map[id]] = f; }
  L.divs.hw = { champ: map[D2.champ], ranked: D2.ranked.map((x) => map[x]), pool: D2.pool.map((x) => map[x]) };
}
function migrateLegacy(L) {
  addHeavy(L);
  buffUfc(L);
  if (!L.tier || L.tier === 'ufc') addGorillas(L, rngFrom((L.seed || 1) + 99));
  assignHp(L);
  if (L.legacyV === 1) return L;
  const byId = {};
  for (const e of LEAGUE_DATA.legends.concat(LEAGUE_DATA.real)) byId[e.id] = e;
  for (const f of Object.values(L.fighters)) {
    const e = byId[f.id];
    if (e && e.hist && f.eliteWins == null) applyHist(f, e.hist, !f.legend && isChamp(L, f.id));
    if (f.legend && f.id.startsWith('legend') && f.eliteWins == null) applyHist(f, { reign: 156, elite: 5, champ: 3, p4p: 3, p4pWeeks: 10, streak: 10, opp: 1580 });
    // current champions without a recorded reign start counting now
    if (!f.legend && isChamp(L, f.id) && f.champSince == null) f.champSince = L.week;
  }
  L.legacyV = 1;
  return L;
}

// ---------------------------------------------------------------- queries
function rankOf(L, id) {
  const home = L.fighters[id] && L.fighters[id].div;
  const order = home ? [DIVISIONS.find((d) => d.id === home)].concat(DIVISIONS.filter((d) => d.id !== home)) : DIVISIONS;
  for (const d of order) if (L.divs[d.id] && L.divs[d.id].champ === id) return { div: d.id, rank: 0 };   // holding a belt anywhere beats any rank at home
  for (const d of order) {
    const D = L.divs[d.id];
    if (!D) continue;   // a save from before this division existed
    if (D.champ === id) return { div: d.id, rank: 0 };
    const i = D.ranked.indexOf(id);
    if (i >= 0) return { div: d.id, rank: i + 1 };
    if (D.pool.includes(id)) return { div: d.id, rank: null };
  }
  const f = L.fighters[id];
  return { div: f ? f.div : null, rank: null };
}
const rankLabel = (rank) => (rank === 0 ? 'Чемпион' : rank == null ? 'Без рейтинга' : '#' + rank);

function divTable(L, div) {
  const D = L.divs[div];
  return [D.champ, ...D.ranked].map((id, i) => ({ id, rank: i, f: L.fighters[id] }));
}

function overallOf(f) { return Math.round((f.stats.power + f.stats.speed + f.stats.chin + f.stats.cardio + f.stats.defense + f.stats.boxing + f.stats.kicks + (f.stats.wrestling || 60) + (f.stats.bjj || 60)) / 9); }

function p4pScore(L, f) {
  const rk = rankOf(L, f.id);
  if (f.legend || rk.rank == null) return -1;
  const finishes = (f.rec.ko || 0) + (f.rec.sub || 0);
  return f.rating + (rk.rank === 0 ? 200 : (16 - rk.rank) * 6) + (f.defenses || 0) * 40 + (f.titles || 0) * 30 +
    Math.min(8, f.streak || 0) * 16 + finishes * 3 + f.rec.w * 3 - f.rec.l * 6 + (Math.max(0, DIVISIONS.filter((d) => L.divs[d.id] && L.divs[d.id].champ === f.id).length - 1) * 160 + (f.divTitles ? Math.max(0, f.divTitles.length - 1) * 40 : 0)) +
    (f.champWins || 0) * 28 + (f.eliteWins || 0) * 12;
}
function p4pList(L) {
  const all = Object.values(L.fighters).map((f) => ({ f, s: p4pScore(L, f) })).filter((x) => x.s > 0);
  all.sort((a, b) => b.s - a.s);
  const top = all.slice(0, 15);
  // the super-legends stay in the top five whoever holds a belt (they can be beaten, and whoever beats one stands above him)
  const sup = all.filter((x) => SUPER_IDS.includes(x.f.id)).slice(0, 3);
  sup.forEach((sx, i) => {
    const at = top.indexOf(sx);
    if (at >= 0 && at < 5) return;
    if (at >= 0) top.splice(at, 1);
    top.splice(Math.min(top.length, 2 + i), 0, sx);
  });
  // holding belts in two divisions puts a fighter in the top three
  all.filter((x) => DIVISIONS.filter((d) => L.divs[d.id] && L.divs[d.id].champ === x.f.id).length >= 2).forEach((x) => {
    const at = top.indexOf(x);
    if (at >= 0 && at <= 2) return;
    if (at >= 0) top.splice(at, 1);
    top.splice(Math.min(1, top.length), 0, x);
  });
  top.length = Math.min(top.length, 15);
  // whoever beat somebody head to head stands above him: a champion who beat the #1 cannot sit below him
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      if (top[j].f.beat && top[j].f.beat[top[i].f.id] != null && !(top[i].f.beat && top[i].f.beat[top[j].f.id] > top[j].f.beat[top[i].f.id])) { const x = top.splice(j, 1)[0]; top.splice(i, 0, x); moved = true; }
    }
    if (!moved) break;
  }
  return top.map((x, i) => ({ id: x.f.id, pos: i + 1, f: x.f, score: Math.round(x.s) }));
}
const SUPER_IDS = ['topuria', 'makhachev', 'volkanovski'];
function p4pPos(L, id) { const i = p4pList(L).findIndex((x) => x.id === id); return i < 0 ? null : i + 1; }

// ---- historical legacy (GOAT) -----------------------------------------------
// Every fighter, legend or active, is scored on the same scale and the GOAT
// list is simply the ten best: there is no fixed "3 titles + 5 defenses" rule.
// Different careers get there differently: a long reign, a pile of wins over
// champions, titles in two weight classes, years as P4P #1.
function isChamp(L, id) { return !!L && DIVISIONS.some((d) => L.divs[d.id] && L.divs[d.id].champ === id); }
function reignOf(L, f) {
  const cur = f.champSince != null && isChamp(L, f.id) ? Math.max(0, L.week - f.champSince) : 0;
  return Math.max(f.longestReign || 0, cur);
}
function legacyParts(L, f) {
  const def = f.totalDefenses != null ? f.totalDefenses : (f.defenses || 0);
  const reign = reignOf(L, f);
  const finishes = (f.rec.ko || 0) + (f.rec.sub || 0);
  const opp = f.oppCount ? f.oppRatingSum / f.oppCount : (f.histOpp || 0);
  const bp = f.bestP4P;
  return {
    titles: (f.titles || 0) * 8,
    defenses: def * 4,
    reign: Math.min(30, (reign / 26) * 3),
    elite: (f.eliteWins || 0) * 2.5 + (f.champWins || 0) * 4,
    opposition: opp ? M.clamp((opp - 1500) / 30, -5, 10) : 0,
    p4p: (bp === 1 ? 8 : bp && bp <= 3 ? 4 : bp && bp <= 5 ? 2 : 0) + Math.min(12, ((f.p4pTopWeeks || 0) / 13) * 2),
    multi: Math.max(0, ((f.divTitles || []).length) - 1) * 10,
    record: f.rec.w * 0.5 + finishes * 0.3 - f.rec.l * 1.2 + Math.max(0, (f.bestStreak || 0) - 8),
    impact: f.legacy || 0,
  };
}
function goatScore(f, L) {
  const parts = legacyParts(L, f);
  let t = 0; for (const k in parts) t += parts[k];
  // to be the greatest ever you need 20 title defenses and five years on the throne
  if (f.id === 'player') { const def = f.totalDefenses != null ? f.totalDefenses : (f.defenses || 0); if (!(def >= 12 && reignOf(L, f) >= 156)) t = Math.min(t, 175); }
  return Math.round(t);
}
// Short human reason for a place in the list: the two biggest parts.
const LEGACY_NAMES = { titles: 'титулы', defenses: 'защиты', reign: 'долгое правление', elite: 'победы над элитой', opposition: 'сильные соперники', p4p: 'P4P №1', multi: 'чемпион двух весов', record: 'рекорд', impact: 'историческое влияние' };
function legacyWhy(L, f) {
  const parts = legacyParts(L, f);
  const def = f.totalDefenses != null ? f.totalDefenses : (f.defenses || 0);
  const bits = [];
  if (f.titles) bits.push((f.titles) + ' ' + (f.titles === 1 ? 'титул' : f.titles < 5 ? 'титула' : 'титулов'));
  if (def) bits.push(def + ' защит' + (def === 1 ? 'а' : def < 5 ? 'ы' : ''));
  const reign = reignOf(L, f);
  if (reign >= 26) bits.push((reign / 52).toFixed(1).replace('.0', '') + ' г. на троне');
  const elite = (f.eliteWins || 0) + (f.champWins || 0);
  if (elite) bits.push(elite + ' побед над элитой');
  if ((f.divTitles || []).length > 1) bits.push('пояса в ' + f.divTitles.length + ' весах');
  if (f.bestP4P === 1) bits.push('P4P №1');
  const top = Object.entries(parts).sort((a, b) => b[1] - a[1])[0];
  return { text: bits.slice(0, 4).join(' · '), main: top ? LEGACY_NAMES[top[0]] : '' };
}
function goatList(L, n = 10) {
  const all = Object.values(L.fighters).filter((f) => f.legend || f.titles || f.id === 'player' || (f.eliteWins || 0) + (f.champWins || 0) >= 3)
    .map((f) => ({ f, s: goatScore(f, L) }));
  all.sort((a, b) => b.s - a.s);
  return all.slice(0, n).map((x, i) => ({ id: x.f.id, pos: i + 1, f: x.f, score: x.s }));
}
function goatPos(L, id) {
  const f = L.fighters[id]; if (!f) return null;
  const me = goatScore(f, L);
  let better = 0;
  for (const o of Object.values(L.fighters)) if (o.id !== id && (o.legend || o.titles || (o.eliteWins || 0) + (o.champWins || 0) >= 3) && goatScore(o, L) > me) better++;
  return better + 1;
}
// Record what a win means for history: beating champions and the elite,
// the quality of the opposition, the longest unbeaten run.
function noteLegacy(L, w, l, bl, week) {
  if (bl === 0 || l.titles > 0) w.champWins = (w.champWins || 0) + 1;
  else if (bl != null && bl <= 5) w.eliteWins = (w.eliteWins || 0) + 1;
  w.oppRatingSum = (w.oppRatingSum || 0) + (l.rating || 1500);
  w.oppCount = (w.oppCount || 0) + 1;
  w.bestStreak = Math.max(w.bestStreak || 0, w.streak || 0);
  void week;
}
function endReign(L, f) {
  if (f.champSince == null) return;
  f.longestReign = Math.max(f.longestReign || 0, Math.max(0, L.week - f.champSince));
  f.champSince = null;
}

const STAT_LABELS = { power: 'Сила удара', speed: 'Скорость', chin: 'Подбородок', cardio: 'Выносливость', defense: 'Защита', boxing: 'Бокс', kicks: 'Удары ногами', wrestling: 'Борьба', bjj: 'Джиу-джитсу', heavy: 'Тяжёлый удар', hp: 'Здоровье (HP)' };
UFC.STAT_LABELS = STAT_LABELS;
function strengths(f) {
  const e = Object.entries(f.stats).filter((x) => x[0] !== 'heavy' && x[0] !== 'hp').sort((a, b) => b[1] - a[1]);
  return { good: e.slice(0, 3).filter((x) => x[1] >= 72).map((x) => STAT_LABELS[x[0]]), bad: e.slice(-3).filter((x) => x[1] < 78).map((x) => STAT_LABELS[x[0]]) };
}

// Fighter record -> config the 3D fighter / AI understand.
function mixCol(a, b, t) {
  const ch = (x, s) => (x >> s) & 255, m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
// Years leave marks: grey hair, then a shorter cut or none at all, a hollower, harder face, a softer body.
function ageAppearance(look, body, age, seed) {
  if (!look || !(age >= 30)) return { look, body };
  let h = 2166136261; const k = String(seed || 'x');
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u = ((h >>> 0) % 1000) / 1000;
  const a = M.clamp((age - 30) / 20, 0, 1);
  const L = Object.assign({}, look, { face: Object.assign({}, look.face || {}) });
  if (L.hair != null) L.hair = mixCol(L.hair, 0xb9b7b0, M.clamp((age - 32) / 18, 0, 1));
  if (L.skin != null) L.skin = mixCol(L.skin, 0xcdbaa6, 0.14 * a);
  if (age >= 43 && ['long', 'mohawk', 'bun', 'curly', 'slick'].includes(L.hairStyle)) L.hairStyle = 'short';
  if (age >= 47 && ['short', 'fade', 'buzz'].includes(L.hairStyle)) L.hairStyle = u < 0.5 ? 'buzz' : 'short';
  if (age >= 50 && ['short', 'fade', 'buzz'].includes(L.hairStyle) && u < 0.6) L.hairStyle = 'bald';
  if (L.hairLen != null) L.hairLen = Math.max(0.15, L.hairLen * (1 - 0.35 * a));
  const F = L.face;
  if (F.cheeks != null) F.cheeks = Math.max(0.08, F.cheeks - 0.18 * a);
  if (F.jaw != null) F.jaw = Math.max(0.1, F.jaw - 0.08 * a);
  if (F.brows != null) F.brows = Math.min(1, F.brows + 0.14 * a);
  if (F.eyes != null) F.eyes = Math.max(0.1, F.eyes - 0.06 * a);
  let B = body ? Object.assign({}, body) : body;
  if (age >= 33) {
    const x = M.clamp((age - 33) / 17, 0, 1);
    if (B && B.muscle != null) B.muscle = Math.max(0.3, B.muscle * (1 - 0.22 * x));
    if (age >= 42) {
      const t = (B && B.type) || null;
      if (!t) B = Object.assign({}, B || {}, { type: 'stocky' });
      else if (['athletic', 'lean', 'muscular'].includes(t)) B.type = 'stocky';
      else if (t === 'stocky' && age >= 47) B.type = 'heavy';
    }
  }
  return { look: L, body: B };
}
UFC.ageAppearance = ageAppearance;

// Physical strength follows the calendar: still growing until 27, the peak, then speed, stamina, chin and power slowly go.
function ageStats(f, fromOverride) {
  const from = fromOverride != null ? fromOverride : (f.ageApplied != null ? f.ageApplied : (f.startAge != null ? f.startAge : f.age));
  const to = f.age;
  if (!f.stats || to <= from) { f.ageApplied = to; return null; }
  const d = {}, add = (k, v) => { d[k] = (d[k] || 0) + v; };
  for (let y = from + 1; y <= to; y++) {
    if (y <= 27) { add('power', 0.9); add('chin', 0.7); add('cardio', 0.5); add('boxing', 0.4); }
    else if (y >= 32) {
      const k = y >= 37 ? 1.6 : y >= 35 ? 1.25 : 1;
      add('speed', -1.3 * k); add('cardio', -1.1 * k); add('chin', -0.9 * k); add('power', -0.7 * k); add('defense', -0.4 * k); add('kicks', -0.6 * k); add('wrestling', -0.6 * k); add('boxing', 0.1); add('bjj', 0.1);
    }
  }
  const bits = [];
  for (const k in d) {
    if (f.stats[k] == null) continue;
    f.stats[k] = M.clamp(Math.round((f.stats[k] + d[k]) * 10) / 10, 35, Math.max(99, f.stats[k]));
    if (Math.abs(d[k]) >= 0.9) bits.push((STAT_LABELS[k] || k).toLowerCase() + ' ' + (d[k] > 0 ? '+' : '−') + Math.round(Math.abs(d[k])));
  }
  f.ageApplied = to;
  return bits.length ? bits.join(', ') : null;
}
UFC.ageStats = ageStats;

function toCfg(f) {
  const ag = ageAppearance(f.look, f.body, f.age, f.id);
  return {
    id: f.id, name: f.name, short: f.short, nick: f.nick, flag: f.flag, division: UFC.divById(f.div).name,
    height: f.height, weight: f.weight, reach: f.reach, build: f.build, stance: f.stance, style: f.style,
    stats: f.stats, look: ag.look, body: ag.body, original: f.original,
  };
}

// ---------------------------------------------------------------- results & rankings
function removeId(arr, id) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); return i; }

// Put id at ranked index (0-based within #1..#15); the one pushed past #15 drops to the pool.
function placeRanked(L, div, id, idx) {
  const D = L.divs[div];
  removeId(D.ranked, id); removeId(D.pool, id);
  idx = M.clamp(idx, 0, D.ranked.length);
  D.ranked.splice(idx, 0, id);
  while (D.ranked.length > 15) D.pool.unshift(D.ranked.pop());
}

function eloUpdate(w, l, finish) {
  const ew = 1 / (1 + Math.pow(10, (l.rating - w.rating) / 400));
  const K = (finish ? 40 : 30) * (w.id === 'player' ? 1.8 : 1);
  w.rating = Math.round(w.rating + K * (1 - ew));
  // the player's rating catches up quickly when he beats somebody above him: the league notices an upset
  if (w.id === 'player' && l.rating > w.rating) w.rating += Math.round((l.rating - w.rating) * 0.22);
  l.rating = Math.round(l.rating - K * (1 - ew) * (l.id === 'player' ? 0.45 : 0.85));
}

const METHOD_NAMES = { KO: 'Нокаут', TKO: 'Сдался (TKO)', SUB: 'Сабмишн', DEC: 'Решение судей', DRAW: 'Ничья' };
UFC.METHOD_NAMES = METHOD_NAMES;

// Apply a finished fight. Returns a description of rank movement for both.
function applyResult(L, res) {
  const { winner, loser, method, title, week } = res;
  const w = L.fighters[winner], l = L.fighters[loser];
  const before = { w: rankOf(L, winner), l: rankOf(L, loser) };
  const finish = method === 'KO' || method === 'TKO' || method === 'SUB';
  if (method === 'DRAW') {
    w.rec.d++; l.rec.d++;
    return { before, after: { w: rankOf(L, winner), l: rankOf(L, loser) } };
  }
  w.rec.w++; l.rec.l++;
  w.beat = w.beat || {}; w.beat[l.id] = week;   // head to head, for the P4P list
  if (method === 'KO' || method === 'TKO') w.rec.ko++;
  if (method === 'SUB') w.rec.sub++;
  w.streak = Math.max(0, w.streak || 0) + 1; l.streak = Math.min(0, l.streak || 0) - 1;
  const lRankHere = before.l.div === (res.div || w.div) ? before.l.rank : null;
  noteLegacy(L, w, l, lRankHere, week);
  eloUpdate(w, l, finish);
  w.lastFightWeek = l.lastFightWeek = week;
  const entry = (me, opp, won) => ({ week, opp: opp.id, oppName: opp.name, res: won ? 'W' : 'L', method, round: res.round || 0, time: res.time || '', title: !!title, detail: res.detail || '' });
  w.history.unshift(entry(w, l, true)); l.history.unshift(entry(l, w, false));
  if (w.history.length > 8 && w.id !== 'player') w.history.length = 8;
  if (l.history.length > 8 && l.id !== 'player') l.history.length = 8;

  const div = res.div || w.div;
  const D = L.divs[div];
  const bw = before.w.div === div ? before.w.rank : null;
  // a heavyweight from the 120 kg division: a real name for the record, but no place in this division's table
  const hvL = l.div === 'hw' && div !== 'hw' && before.l.div === 'hw', hvW = w.div === 'hw' && div !== 'hw' && before.w.div === 'hw';
  const bl = hvL ? (before.l.rank == null ? 12 : before.l.rank === 0 ? 1 : Math.max(1, Math.min(14, Math.ceil(before.l.rank / 2) + 1))) : before.l.div === div ? before.l.rank : null;
  if (title && bl === 0) {
    // new champion; the old one becomes #1
    removeId(D.ranked, winner); removeId(D.pool, winner);
    endReign(L, l);
    D.champ = winner; w.titles = (w.titles || 0) + 1; w.defenses = 0; w.champSince = L.week;
    w.divTitles = Array.from(new Set([...(w.divTitles || []), div]));
    placeRanked(L, div, loser, 0);
  } else if (title && bw === 0) {
    w.defenses = (w.defenses || 0) + 1; w.totalDefenses = (w.totalDefenses || 0) + 1;
    placeRanked(L, div, loser, Math.min(14, (bl || 1) + (finish ? 2 : 1)));
  } else if (title && bw !== 0 && bl !== 0) {
    // vacant title
    removeId(D.ranked, winner); removeId(D.pool, winner);
    const old = D.champ;
    if (old && L.fighters[old]) endReign(L, L.fighters[old]);
    D.champ = winner; w.titles = (w.titles || 0) + 1; w.defenses = 0; w.champSince = L.week;
    w.divTitles = Array.from(new Set([...(w.divTitles || []), div]));
    if (old && old !== winner) placeRanked(L, div, old, 0);
  } else {
    const Lr = bl == null ? 16 : bl, W = (w.legend || w.gorilla || hvW) ? Lr : (bw == null ? 16 : bw);   // losing to a legend is not losing to a nobody
    if (W !== 0 && !w.legend && !w.gorilla && !hvW) {
      if (Lr < W) {
        // upset: take the loser's spot (or near it)
        const target = Lr === 0 ? 1 : Lr;
        if (Lr <= 15) placeRanked(L, div, winner, target - 1);
      } else if (W <= 15) {
        const jump = ((finish ? 2 : 1) + (Lr <= 15 ? 1 : 0)) * (w.id === 'player' ? 2 : 1);   // the player's road is shorter
        placeRanked(L, div, winner, Math.max(0, W - 1 - jump));
      } else {
        // unranked beating unranked: enters the rankings on a streak with a finish
        if (w.id === 'player' || (w.streak >= 3 && finish) || w.streak >= 4) placeRanked(L, div, winner, 14);
      }
    }
    if (hvL) {
      const hr = before.l.rank;
      if (hr != null && hr > 0) placeRanked(L, 'hw', loser, Math.min(14, hr - 1 + (finish ? 2 : 1)));
    } else if (Lr !== 0 && Lr <= 15) {
      // losing to someone far below you costs a lot more than a close loss
      const drop = Math.max((finish ? 2 : 1) + (W > Lr ? 1 : 0), W > Lr ? Math.round((Math.min(W, 16) - Lr) / 2) : 0);
      if (Lr + drop > 15) { removeId(D.ranked, loser); if (!D.pool.includes(loser)) D.pool.unshift(loser); } else placeRanked(L, div, loser, Lr - 1 + drop);
    }
  }
  for (const f of [w, l]) {
    const pp = p4pPos(L, f.id);
    if (pp && (!f.bestP4P || pp < f.bestP4P)) f.bestP4P = pp;
  }
  return { before, after: { w: rankOf(L, winner), l: rankOf(L, loser) } };
}

function pickMethod(r, w) {
  const strike = (w.stats.power + w.stats.boxing + w.stats.kicks) / 3, grap = (w.stats.bjj + w.stats.wrestling) / 2;
  const x = r();
  const pKO = 0.18 + (strike - 70) / 100, pSub = 0.1 + (grap - 70) / 120;
  if (x < pKO) return r.chance(0.55) ? 'KO' : 'TKO';
  if (x < pKO + Math.max(0.03, pSub)) return 'SUB';
  return 'DEC';
}

// One simulated fight between two AI fighters.
function simFight(L, aId, bId, r, title, div) {
  const a = L.fighters[aId], b = L.fighters[bId];
  const pa = 1 / (1 + Math.pow(10, (b.rating - a.rating) / 400)) * 0.8 + 0.1 + ((overallOf(a) - overallOf(b)) / 200);
  const aWins = r() < M.clamp(pa, 0.08, 0.92);
  const w = aWins ? a : b, l = aWins ? b : a;
  const method = pickMethod(r, w);
  const rounds = title ? 5 : 3;
  const round = method === 'DEC' ? rounds : r.int(1, rounds);
  const time = method === 'DEC' ? '5:00' : r.int(0, 4) + ':' + String(r.int(0, 59)).padStart(2, '0');
  const move = applyResult(L, { winner: w.id, loser: l.id, method, title, week: L.week, round, time, div });
  const news = { week: L.week, div, title: !!title, w: w.id, l: l.id, method, round, time };
  L.news.unshift(news); if (L.news.length > 40) L.news.length = 40;
  return Object.assign(news, move);
}

// Advance the league by some weeks: AI fights happen around the player.
// `busy` = fighter ids that must not be booked (player, their next opponent).
function advance(L, weeks, busy, rngSeed) {
  const r = rngFrom(rngSeed || (L.seed * 31 + L.week * 977));
  const results = [];
  for (let wk = 0; wk < weeks; wk++) {
    L.week++;
    if (L.week % 52 === 0) for (const f of Object.values(L.fighters)) { if (f.id === 'player' || f.legend || f.gorilla) continue; const prev = f.age || 28; f.age = prev + 1; ageStats(f, prev); }   // a year passes for everybody
    const top = p4pList(L)[0];
    if (top) top.f.p4pTopWeeks = (top.f.p4pTopWeeks || 0) + 1;
    for (const d of DIVISIONS) {
      const D = L.divs[d.id];
      if (!D) continue;
      const free = (id) => !busy.includes(id) && L.fighters[id] && L.week - (L.fighters[id].lastFightWeek || -99) >= 10;
      // title fight roughly every 16 weeks per division
      if (L.week % 16 === (DIVISIONS.indexOf(d) * 5) % 16 && free(D.champ)) {
        const challenger = D.ranked.slice(0, 3).find(free);
        if (challenger) { results.push(simFight(L, D.champ, challenger, r, true, d.id)); continue; }
      }
      if (!r.chance(0.55)) continue;
      const cand = D.ranked.filter(free);
      if (cand.length >= 2) {
        const a = r.pick(cand);
        const ai = D.ranked.indexOf(a);
        const near = cand.filter((x) => x !== a && Math.abs(D.ranked.indexOf(x) - ai) <= 3);
        if (near.length) results.push(simFight(L, a, r.pick(near), r, false, d.id));
      }
      if (r.chance(0.5)) {
        const pc = D.pool.filter(free);
        if (pc.length >= 2) { const a = r.pick(pc); const b = r.pick(pc.filter((x) => x !== a)); if (b) results.push(simFight(L, a, b, r, false, d.id)); }
      }
    }
  }
  return results;
}

const TRASH = [
  '{o}, я убью тебя в этой клетке. Всё остальное — слова.',
  'Ты не доживёшь до третьего раунда. Запомни это.',
  'Я сломаю тебя, а потом пожму руку.',
  'Это будет война. Я готов умереть здесь. А ты?',
  'Ты пришёл за поясом? Уйдёшь без сознания.',
  '{o}, молись, чтобы рефери остановил бой вовремя.',
  'Один мой удар, и ты уснёшь. Я не шучу.',
  'Я готовился убить тебя, а не выиграть по очкам.',
  'Пять раундов ада. Я не остановлюсь, пока ты лежишь.',
  'Весь зал увидит, как падает {o}.',
  'Мы оба знаем, чем это кончится. Для тебя плохо.',
  'Я не буду бить аккуратно, {o}. Береги челюсть.',
];
UFC.trashTalk = (name, seed, who) => {
  let h = 2166136261; const k = String(seed) + who;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  return TRASH[(h >>> 0) % TRASH.length].replace('{o}', name);
};

// Gorillas: unranked monsters (huge power, huge health, slow) for the player to test himself on. The last one is the boss of the champions.
// [id, division, name, nick, flag, height, power, hp, boss]
const GORILLA_DATA = [
  ['gor1', 'ww', 'Гор Громадян', 'Горилла', 'AM', 1.93, 165, 600, 0],
  ['gor2', 'lw', 'Мбонго Колосс', 'Король джунглей', 'NG', 1.88, 160, 520, 0],
  ['gor3', 'fw', 'Кинг Брутов', 'Серебряная спина', 'RU', 1.80, 155, 480, 0],
  ['gor4', 'ww', 'Конго Титан', 'Альфа', 'NG', 1.96, 185, 850, 1],
];
function makeGorilla(r, e) {
  const [id, div, name, nick, flag, ht, power, hp, boss] = e;
  const f = genFighter(r, div, 80, 'gor_' + id, { style: 'brawler' });
  f.name = name; f.short = name.split(' ').slice(1).join(' '); f.nick = nick; f.flag = flag; f.age = 32; f.height = ht; f.reach = +(ht * 1.07).toFixed(2); f.stance = 'orthodox';
  f.stats = { power, speed: boss ? 78 : 82, chin: boss ? 165 : 150, cardio: 72, defense: boss ? 96 : 86, boxing: 84, kicks: 62, wrestling: 76, bjj: 60, hp };
  f.body = { type: 'muscular', muscle: 0.98, arms: 0.95, shoulders: 0.95, legs: 0.7 };
  f.rec = { w: 18, l: 2, d: 0, ko: 16, sub: 1 }; f.rating = 1550; f.gorilla = true; f.boss = !!boss; f._nerfed = true;
  return f;
}
function addGorillas(L, r) {
  if (L.gorillas) return;
  L.gorillas = [];
  for (const e of GORILLA_DATA) { const f = makeGorilla(r, e); L.fighters[f.id] = f; L.gorillas.push(f.id); }
}
// health for everybody else: the champion is a tank, the top-15 are tough, legends are old iron
function assignHp(L) {
  if (L.hpV === 1) return;
  const minor = L.tier && L.tier !== 'ufc';
  const base = minor ? (L.tier === 'pfl' ? 110 : L.tier === 'aca' ? 105 : 100) : 120;
  for (const f of Object.values(L.fighters)) {
    if (f.id === 'player' || !f.stats || f.stats.hp != null || f.gorilla) continue;
    let hp = base;
    if (f.legend) hp = 190;
    else { const rk = rankOf(L, f.id); if (rk.rank === 0) hp = base + 70; else if (rk.rank != null) hp = base + Math.round((16 - rk.rank) * 3.2); }
    if (f.div === 'hw') hp = Math.round(hp * 1.2);   // a big body takes more
    f.stats.hp = hp;
  }
  L.hpV = 1;
}
UFC.GORILLA_DATA = GORILLA_DATA;
// the same monsters as ready-made opponents for a quick fight
(() => {
  const r = rngFrom(555);
  UFC.EXTRA_ROSTER = UFC.EXTRA_ROSTER || [];
  for (const e of GORILLA_DATA) { const f = makeGorilla(r, e); const cfg = toCfg(f); cfg.division = UFC.divById(f.div).name; cfg.original = true; cfg.gorilla = true; UFC.EXTRA_ROSTER.push(cfg); }
})();

// UFC opponents: a far tougher jaw, defence and health for everybody (the unranked a bit less), and on top of that champions and the top three hit harder
// and take even more: the jaw +50% (+40% unranked) and the health +70%, plus up to +80% jaw and +100% health for the champion
UFC.eliteBuff = (cfg, rank, f) => {
  if (!f || f.gorilla) return cfg;
  const base = f.legend ? 0.8 : rank == null ? 0.7 : 1;
  const k = f.legend ? 0 : rank === 0 ? 1 : rank === 1 ? 0.84 : rank === 2 ? 0.67 : rank === 3 ? 0.5 : 0;
  const st = Object.assign({}, cfg.stats), up = (key, a, b, cap) => { st[key] = Math.min(cap || 140, Math.round((st[key] || 60) + a * base + b * k)); };
  up('power', 12, 26); up('defense', 18, 24); up('speed', 8, 13); up('boxing', 9, 13); up('kicks', 6, 9);
  st.chin = Math.round((st.chin || 70) * (1 + 0.5 * base + 0.8 * k)); st.hp = Math.round((st.hp || 120) * (f.legend ? 2.8 : 2.5 + 1.5 * k));   // health (body, liver, legs, face: everything) 2.5x for everybody up to 4x for the champion
  return Object.assign({}, cfg, { stats: st, elite: k, dmgMul: 1.35 + 0.5 * k + (f.div === 'hw' ? 0.15 : 0) });   // and they hit harder: x1.35 up to x1.85 for the champion
};

// the heavyweight top-15 as ready-made opponents for a quick fight (already with the UFC buff)
(() => {
  const r = rngFrom(777);
  UFC.EXTRA_ROSTER = UFC.EXTRA_ROSTER || [];
  for (const e of LEAGUE_DATA.field.filter((x) => x[1] === 'hw')) {
    const [fid, , rank, name, nick, flag, style, sw, ovr, age, ht, w, l, ko, sub] = e;
    const f = genFighter(r, 'hw', ovr, 'q_' + fid, { style });
    f.name = name; f.short = name.split(' ').slice(1).join(' ') || name; f.nick = nick; f.flag = flag; f.age = age; f.height = ht; f.reach = +(ht * 1.03).toFixed(2); f.stance = sw ? 'southpaw' : 'orthodox';
    f.rec = { w, l, d: 0, ko: Math.min(ko, w), sub: Math.min(sub, Math.max(0, w - Math.min(ko, w))) };
    for (const k in f.stats) f.stats[k] = Math.min(98, f.stats[k] + 5);
    f.stats.hp = Math.round((rank === 0 ? 190 : 120 + Math.round((16 - rank) * 3.2)) * 1.2);
    const cfg = UFC.eliteBuff(toCfg(f), rank, f); cfg.division = UFC.divById('hw').name; cfg.original = true;
    UFC.EXTRA_ROSTER.push(cfg);
  }
})();

UFC.league = {
  create: createLeague, rankOf, rankLabel, divTable, p4pList, p4pPos, p4pScore, goatScore, goatList, goatPos, reignOf, legacyParts, legacyWhy, migrateLegacy, strengths, toCfg, overallOf,
  applyResult, advance, placeRanked, genFighter, rngFrom, fromRoster,
  tierOf: (L) => UFC.TIERS[(L && L.tier) || 'ufc'] || UFC.TIERS.ufc, ageStats, ageAppearance,
  dateOf: (week) => { const d = new Date(2026, 0, 10); d.setDate(d.getDate() + week * 7); return d; },
  dateLabel: (week) => { const d = new Date(2026, 0, 10); d.setDate(d.getDate() + week * 7); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); },
  flag: (code) => ({ BR: '🇧🇷', RU: '🇷🇺', KZ: '🇰🇿', US: '🇺🇸', MX: '🇲🇽', PL: '🇵🇱', IE: '🇮🇪', GE: '🇬🇪', JP: '🇯🇵', AU: '🇦🇺', NG: '🇳🇬', SE: '🇸🇪', AM: '🇦🇲', CA: '🇨🇦', EC: '🇪🇨', AR: '🇦🇷', MD: '🇲🇩', DO: '🇩🇴', HR: '🇭🇷', MA: '🇲🇦', AZ: '🇦🇿', RS: '🇷🇸', FR: '🇫🇷', ES: '🇪🇸', GB: '🇬🇧', DE: '🇩🇪', UA: '🇺🇦', UZ: '🇺🇿', KG: '🇰🇬' }[code] || '🏳️'),
  COUNTRIES: [['RU', 'Россия'], ['KZ', 'Казахстан'], ['KG', 'Кыргызстан'], ['UZ', 'Узбекистан'], ['UA', 'Украина'], ['GE', 'Грузия'], ['AM', 'Армения'], ['US', 'США'], ['BR', 'Бразилия'], ['MX', 'Мексика'], ['IE', 'Ирландия'], ['GB', 'Великобритания'], ['PL', 'Польша'], ['FR', 'Франция'], ['DE', 'Германия'], ['ES', 'Испания'], ['SE', 'Швеция'], ['JP', 'Япония'], ['AU', 'Австралия'], ['NG', 'Нигерия']],
};
})();

