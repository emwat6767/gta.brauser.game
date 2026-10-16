//# sourceURL=judo/gw_data.js
// GRIP WARS: the data of the road to legend. Eight stages from the first day in a basement dojo to a legend, the events of every stage,
// a small cast of judoka who really differ, the perks of a build, the achievements and the career challenges.
// All names are made up.
(function () {
'use strict';
const GW = window.GW = window.GW || {};

GW.BELTS = [
  { name: 'Белый пояс', color: 0xf1f0ea }, { name: 'Жёлтый пояс', color: 0xf2cf2a }, { name: 'Оранжевый пояс', color: 0xee7f22 },
  { name: 'Зелёный пояс', color: 0x2f9a45 }, { name: 'Синий пояс', color: 0x2a5fc0 }, { name: 'Коричневый пояс', color: 0x6b4423 },
  { name: 'Чёрный пояс · 1 дан', color: 0x0b0b0c }, { name: 'Чёрный пояс · 2+ дан', color: 0x0b0b0c },
];

// the eight steps. rep: the reputation it takes to be promoted to the next one (and a medal at this level)
// the eight stages. rep: the reputation it takes to be promoted to the next one (plus a medal at this stage);
// stage 0 is left by doing the coach's first tasks. opens: what the stage really gives you
GW.TIERS = [
  { name: 'Первые дни', place: 'Додзё «Сакура», подвал спорткомплекса', lv: [18, 26], rep: 0, venue: 'dojo', prize: 0, pts: 5,
    text: 'У вас нет ни пояса, ни побед, ни денег. Тренер Палыч смотрит, есть ли в вас характер, и даёт первые задания. Выполните их — и вас запишут в группу.',
    opens: ['Тренер Палыч и его задания по порядку', 'Тренировки захвата, броска и защиты (мини-игры)', 'Спарринг с новичками клуба', 'Три базовых броска: подсечка, отхват, бедро', 'Подсказка тренера в схватке «СЕЙЧАС!» (до районных турниров)'] },
  { name: 'Новичок клуба', place: 'Группа Палыча', lv: [22, 32], rep: 70, venue: 'dojo', prize: 30, pts: 10,
    text: 'Вы в группе. Старшие ученики сильнее — у каждого свой стиль и свои победы. Выиграйте клубное первенство или сдайте аттестацию на оранжевый пояс.',
    opens: ['Выбор партнёра для спарринга: новички и старшие', 'Клубное первенство и аттестация на оранжевый пояс', 'Тренировка партера', 'Новые броски: зацеп и через плечо'] },
  { name: 'Первые соревнования', place: 'Районные первенства', lv: [28, 40], rep: 180, venue: 'gym', prize: 80, pts: 25,
    text: 'Чужие спортзалы и чужие тренеры. Сетки на 4 и 8 участников, первые призовые и первые приглашения.',
    opens: ['Турниры района', 'Статистика турнира', 'Приглашения на более серьёзные старты', 'Новые броски: подхват и сколен'] },
  { name: 'Становление бойца', place: 'Кубки города', lv: [36, 50], rep: 380, venue: 'B', prize: 220, pts: 50,
    text: 'Пора решить, каким будет ваше дзюдо. Соперники уже запоминают, что вы делаете.',
    opens: ['Специализация и индивидуальный план тренировок', 'Комбинации: второй бросок после неудачного первого', 'Соперники запоминают ваши повторяющиеся атаки', 'Принципиальный соперник'] },
  { name: 'Региональный уровень', place: 'Чемпионаты области и региона', lv: [46, 60], rep: 650, venue: 'B', prize: 550, pts: 100,
    text: 'Область и регион. Сильные клубы, сборы, рейтинговая таблица. Проиграли сильному — изучите его и вернитесь.',
    opens: ['Переход в сильный клуб или наставник', 'Рейтинговая таблица и смена весовой категории', 'Разбор видео соперника перед схваткой', 'Новые броски: тай-отоси и пистолет'] },
  { name: 'Национальная карьера', place: 'Чемпионат и кубок страны', lv: [56, 70], rep: 1000, venue: 'B', prize: 1600, pts: 220,
    text: 'Лучшие в стране. У каждого соперника — сильные и слабые стороны. Здесь планируют и тренировки, и отдых.',
    opens: ['Сильные и слабые стороны всех соперников', 'Рейтинговые матчи и финалы', 'Приглашение в центр олимпийской подготовки', 'Бросок через спину'] },
  { name: 'Международная элита', place: 'Открытые кубки, Гран-при, Гранд-слэмы, чемпионат мира', lv: [66, 82], rep: 1600, venue: 'A', prize: 6000, pts: 600,
    text: 'Сильнейшие в мире. Побеждает не тот, кто сильнее, а тот, у кого есть план на соперника.',
    opens: ['План на схватку: контрмеры под соперника', 'Смена специализации', 'Гранд-слэмы и чемпионат мира', 'Томоэ-нагэ'] },
  { name: 'Легенда', place: 'Титулы, Олимпиада, турнир легенд', lv: [76, 90], rep: 99999, venue: 'A', prize: 45000, pts: 1500,
    text: 'Вас знают все. Теперь — удержать титулы, вернуть долги старым соперникам и оставить наследие.',
    opens: ['Защита титула чемпиона мира', 'Олимпиада, Мастерс и турнир легенд', 'Долгосрочные испытания', 'Старые соперники возвращаются за реваншем'] },
];

// the events of every stage: every one comes round on its own weeks
GW.EVENTS = [
  { id: 'club', tier: 1, name: 'Клубное первенство «Сакуры»', size: 4, every: 3, at: 1, title: 'Чемпион клуба', venue: 'dojo' },
  { id: 'belt', tier: 1, name: 'Аттестация на оранжевый пояс', size: 2, every: 5, at: 3, venue: 'dojo' },
  { id: 'district', tier: 2, name: 'Первенство района', size: 8, every: 4, at: 2, title: 'Чемпион района' },
  { id: 'school', tier: 2, name: 'Турнир спортивных школ', size: 4, every: 5, at: 4 },
  { id: 'citycup', tier: 3, name: 'Межклубный кубок города', size: 8, every: 4, at: 1, title: 'Обладатель кубка города' },
  { id: 'memorial', tier: 3, name: 'Мемориал тренера Сомова', size: 8, every: 6, at: 3 },
  { id: 'oblast', tier: 4, name: 'Чемпионат области', size: 8, every: 5, at: 2, title: 'Чемпион области' },
  { id: 'region', tier: 4, name: 'Кубок региона', size: 16, every: 7, at: 5 },
  { id: 'national', tier: 5, name: 'Чемпионат страны', size: 16, every: 12, at: 7, title: 'Чемпион страны' },
  { id: 'natcup', tier: 5, name: 'Кубок страны', size: 8, every: 5, at: 3 },
  { id: 'rankmatch', tier: 5, name: 'Рейтинговый матч', size: 2, every: 4, at: 1, single: true },
  { id: 'open', tier: 6, name: 'Европейский открытый кубок', size: 16, every: 6, at: 2, fee: 600 },
  { id: 'gp', tier: 6, name: 'Гран-при', size: 16, every: 7, at: 5, fee: 900 },
  { id: 'gs', tier: 6, name: 'Гранд-слэм', size: 16, every: 6, at: 4, fee: 1500 },
  { id: 'worlds', tier: 6, name: 'Чемпионат мира', size: 16, every: 24, at: 18, fee: 2000, title: 'Чемпион мира' },
  { id: 'masters', tier: 7, name: 'Мастерс — турнир лучших', size: 8, every: 12, at: 10, fee: 2000 },
  { id: 'wdef', tier: 7, name: 'Чемпионат мира (защита титула)', size: 16, every: 24, at: 6, fee: 2000, title: 'Чемпион мира' },
  { id: 'olympics', tier: 7, name: 'Олимпийские игры', size: 16, every: 96, at: 40, fee: 0, title: 'Олимпийский чемпион' },
  { id: 'legends', tier: 7, name: 'Турнир легенд', size: 8, every: 16, at: 14, fee: 0 },
];

// the cast. lv: the level at the start of your career; they grow a little with the years.
// type: the way he fights; fav: his two throws; strong / weak: what he does best and where he can be beaten
GW.ROSTER = [
  // the novices: your level
  { id: 'martynov', name: 'Лёша Мартынов', cc: 'RUS', type: 'aggressor', lv: 20, tier: 0, fav: ['otkhvat', 'bedro'], age: 16, strong: 'fwd', weak: 'cardio', bio: 'Пришёл на месяц раньше вас. Бросается вперёд очертя голову — и через полминуты дышит как паровоз.' },
  { id: 'gus', name: 'Тимофей Гусь', cc: 'RUS', type: 'tactician', lv: 21, tier: 0, fav: ['podsechka', 'otkhvat'], age: 17, strong: 'cardio', weak: 'back', bio: 'Тихий, терпеливый. Стоит на пятках — его можно уронить назад.' },
  { id: 'ermak', name: 'Ваня Ермаков', cc: 'RUS', type: 'counter', lv: 22, tier: 0, fav: ['podsechka', 'bedro'], age: 17, strong: 'defense', weak: 'grip', bio: 'Сам почти не атакует, ждёт ошибки. Захват у него слабый.' },
  // the seniors of the club
  { id: 'burov', name: 'Саня Буров', cc: 'RUS', type: 'aggressor', lv: 27, tier: 1, fav: ['podhvat', 'otkhvat'], age: 19, strong: 'fwd', weak: 'cardio', bio: 'Старший в клубе. Лезет вперёд и толкается — пока не кончится дыхалка.' },
  { id: 'tkach', name: 'Миша Ткач', cc: 'RUS', type: 'counter', lv: 28, tier: 1, fav: ['zacep', 'podsechka'], age: 18, strong: 'back', weak: 'tempo', bio: 'Тихий, ждёт ошибки. Пропустите контру — проиграете. Не любит, когда его гоняют.' },
  { id: 'zubov', name: 'Олег Зубов', cc: 'RUS', type: 'grip', lv: 30, tier: 1, fav: ['plecho', 'zacep'], age: 21, strong: 'grip', weak: 'ground', bio: 'Руки как тиски, отворот не даёт. Зато в партере теряется.' },
  { id: 'kim', name: 'Денис Ким', cc: 'KOR', type: 'tactician', lv: 29, tier: 1, fav: ['skolen', 'podsechka'], age: 20, strong: 'cardio', weak: 'fwd', bio: 'Никуда не спешит, выматывает. Уходя от атаки, проваливается вперёд.' },
  // the district
  { id: 'sychev', name: 'Рома Сычёв', cc: 'RUS', type: 'aggressor', lv: 34, tier: 2, fav: ['bedro', 'otkhvat'], age: 20, strong: 'fwd', weak: 'back', bio: 'Гроза районных первенств. Бросает всё подряд.' },
  { id: 'galiev', name: 'Артур Галиев', cc: 'RUS', type: 'grip', lv: 36, tier: 2, fav: ['plecho', 'zacep'], age: 22, strong: 'grip', weak: 'cardio', bio: 'Борется за отворот по полминуты. Взялся — бросил. К концу схватки сдыхает.' },
  { id: 'pankov', name: 'Никита Панков', cc: 'RUS', type: 'champion', lv: 37, tier: 2, fav: ['podhvat', 'podsechka'], age: 19, strong: 'defense', weak: 'ground', bio: 'Лучший в районе. Ровный во всём, но в партере плывёт.' },
  // the city
  { id: 'lebed', name: 'Кирилл Лебедь', cc: 'RUS', type: 'counter', lv: 43, tier: 3, fav: ['otkhvat', 'zacep'], age: 23, strong: 'back', weak: 'fwd', bio: 'Любит, когда атакуют его. Контрит назад, но сам проваливается вперёд.' },
  { id: 'abaev', name: 'Тимур Абаев', cc: 'RUS', type: 'tactician', lv: 45, tier: 3, fav: ['zacep', 'plecho'], age: 25, strong: 'cardio', weak: 'tempo', bio: 'Двужильный. В золотом скоре не проигрывал. Но высокий темп его ломает.' },
  { id: 'kotov', name: 'Влад Котов', cc: 'RUS', type: 'champion', lv: 47, tier: 3, fav: ['podhvat', 'skolen'], age: 22, strong: 'fwd', weak: 'grip', rival: true, bio: 'Лучший в городе, клуб «Динамо». Считает вас случайным. Сильный подхват, но захват можно выиграть.' },
  // the region
  { id: 'khapov', name: 'Аслан Хапов', cc: 'RUS', type: 'aggressor', lv: 52, tier: 4, fav: ['pistol', 'podhvat'], age: 23, strong: 'fwd', weak: 'cardio', bio: 'Взрывной, как пружина. Первые двадцать секунд — опаснее всех.' },
  { id: 'sedykh', name: 'Игорь Седых', cc: 'RUS', type: 'grip', lv: 54, tier: 4, fav: ['taiotoshi', 'plecho'], age: 26, strong: 'grip', weak: 'back', bio: 'Хозяин захвата. Ломает ваш рукав и ставит свой. Назад падает охотно.' },
  { id: 'bekoev', name: 'Руслан Бекоев', cc: 'RUS', type: 'counter', lv: 55, tier: 4, fav: ['zacep', 'skolen'], age: 24, strong: 'ground', weak: 'tempo', bio: 'Контратака на подхват — его визитная карточка. Опасен в партере.' },
  // the country
  { id: 'tsaraev', name: 'Давид Цараев', cc: 'RUS', type: 'champion', lv: 62, tier: 5, fav: ['plecho', 'otkhvat'], age: 25, strong: 'defense', weak: 'ground', bio: 'Действующий чемпион страны. Читает соперника за полминуты.' },
  { id: 'orlov', name: 'Степан Орлов', cc: 'RUS', type: 'tactician', lv: 60, tier: 5, fav: ['bedro', 'zacep'], age: 28, strong: 'cardio', weak: 'fwd', bio: 'Опытный, тяжёлый, терпеливый. Переигрывает на выносливости.' },
  { id: 'nuriev', name: 'Ильяс Нуриев', cc: 'RUS', type: 'grip', lv: 63, tier: 5, fav: ['spina', 'taiotoshi'], age: 24, strong: 'grip', weak: 'tempo', bio: 'Борьба за захват у него как шахматы.' },
  // the world
  { id: 'murakami', name: 'Кэнта Мураками', cc: 'JPN', type: 'champion', lv: 70, tier: 6, fav: ['podhvat', 'taiotoshi'], age: 24, strong: 'fwd', weak: 'grip', bio: 'Японская школа: идеальный подхват, идеальный тайминг.' },
  { id: 'beranger', name: 'Луи Беранже', cc: 'FRA', type: 'counter', lv: 68, tier: 6, fav: ['otkhvat', 'tomoe'], age: 27, strong: 'back', weak: 'cardio', bio: 'Француз с длинными руками. Контратакует любой бросок вперёд.' },
  { id: 'mikeladze', name: 'Гиорги Микеладзе', cc: 'GEO', type: 'aggressor', lv: 69, tier: 6, fav: ['pistol', 'spina'], age: 23, strong: 'fwd', weak: 'ground', bio: 'Грузинская школа: мощь, захват за пояс, бросок через спину.' },
  { id: 'ganzorig', name: 'Бат-Эрдэнэ Ганзориг', cc: 'MGL', type: 'tactician', lv: 71, tier: 6, fav: ['zacep', 'bedro'], age: 26, strong: 'cardio', weak: 'back', bio: 'Монгольский борец: не устаёт и не падает вперёд.' },
  { id: 'yamada', name: 'Сёта Ямада', cc: 'JPN', type: 'champion', lv: 78, tier: 6, fav: ['plecho', 'podhvat'], age: 25, strong: 'defense', weak: 'tempo', bio: 'Двукратный чемпион мира. Знает всё про ваш любимый бросок.' },
  { id: 'kveselava', name: 'Нодар Квеселава', cc: 'GEO', type: 'grip', lv: 77, tier: 6, fav: ['taiotoshi', 'spina'], age: 27, strong: 'grip', weak: 'back', bio: 'Самый неудобный захват в мире.' },
  { id: 'dufour', name: 'Мартен Дюфур', cc: 'FRA', type: 'tactician', lv: 76, tier: 6, fav: ['otkhvat', 'zacep'], age: 29, strong: 'cardio', weak: 'fwd', bio: 'Выигрывает золотыми скорами и шидо.' },
  { id: 'tulegenov', name: 'Ерасыл Тулегенов', cc: 'KAZ', type: 'aggressor', lv: 77, tier: 6, fav: ['pistol', 'bedro'], age: 24, strong: 'fwd', weak: 'cardio', bio: 'Темп, темп, темп. Бросает даже без захвата.' },
  // the legends
  { id: 'sato', name: 'Хидэаки Сато', cc: 'JPN', type: 'champion', lv: 85, tier: 7, fav: ['podhvat', 'plecho'], age: 27, strong: 'defense', weak: 'ground', bio: 'Олимпийский чемпион. Говорят, его никто не бросал три года.' },
  { id: 'aliev', name: 'Рустам Алиев', cc: 'AZE', type: 'counter', lv: 84, tier: 7, fav: ['zacep', 'tomoe'], age: 28, strong: 'ground', weak: 'fwd', bio: 'Мастер контратаки и партера. Опасен на земле.' },
  { id: 'vanberg', name: 'Нильс ван Берг', cc: 'NED', type: 'grip', lv: 83, tier: 7, fav: ['taiotoshi', 'otkhvat'], age: 29, strong: 'grip', weak: 'tempo', bio: 'Голландский великан с хватом-капканом.' },
];
GW.STRONG = { fwd: 'сильные броски вперёд', back: 'сильные броски назад и контры', grip: 'жёсткий захват', ground: 'опасен в партере', cardio: 'не устаёт', defense: 'его трудно бросить' };
GW.WEAK = { fwd: 'проваливается вперёд — броски вперёд по нему +15%', back: 'стоит на пятках — броски назад по нему +15%', grip: 'слабый захват', cardio: 'быстро устаёт', ground: 'слаб в партере', tempo: 'ломается от высокого темпа: уставший бросает хуже' };
GW.CC = { RUS: 'Россия', KOR: 'Корея', JPN: 'Япония', FRA: 'Франция', GEO: 'Грузия', MGL: 'Монголия', KAZ: 'Казахстан', AZE: 'Азербайджан', NED: 'Нидерланды', UZB: 'Узбекистан' };
GW.STYLE_OF = { aggressor: 'brawler', counter: 'boxer', grip: 'wrestler', tactician: 'kickboxer', champion: 'wrestler' };

// the attributes of the player's judoka
GW.ATTRS = {
  power: { name: 'Сила', desc: 'мощь броска и рывков, борьба в партере' },
  speed: { name: 'Скорость', desc: 'вход в бросок, реакция, захват' },
  cardio: { name: 'Выносливость', desc: 'дыхалка, гликоген, порог кислоты' },
  technique: { name: 'Техника', desc: 'шанс броска и чистота оценки' },
  grip: { name: 'Захват', desc: 'взять и удержать захват, сбросить чужой' },
  defense: { name: 'Защита', desc: 'устоять, выкрутиться, контратака' },
  newaza: { name: 'Партер', desc: 'удержания, удушающие и болевые, выход снизу' },
};
GW.ATTR_KEYS = Object.keys(GW.ATTRS);
// the build at the start: where the first points went
GW.ORIGINS = {
  power: { name: 'Силовик', desc: 'из тяжёлой атлетики: сила и рывки', a: { power: 29, speed: 21, cardio: 22, technique: 19, grip: 24, defense: 22, newaza: 21 } },
  tech: { name: 'Техник', desc: 'в детстве ходил на дзюдо: техника и скорость', a: { power: 20, speed: 25, cardio: 22, technique: 28, grip: 22, defense: 21, newaza: 20 } },
  cardio: { name: 'Марафонец', desc: 'из лёгкой атлетики: дыхалка и защита', a: { power: 20, speed: 23, cardio: 30, technique: 19, grip: 22, defense: 24, newaza: 20 } },
  grip: { name: 'Борец', desc: 'из вольной борьбы: захват и партер', a: { power: 23, speed: 21, cardio: 22, technique: 19, grip: 28, defense: 22, newaza: 25 } },
};
GW.HEIGHTS = {
  short: { name: 'Невысокий', dh: -0.05, desc: 'броски с поворотом (плечо, через спину, пистолет, тай-отоси, бедро) +5%, захват чуть хуже' },
  mid: { name: 'Средний', dh: 0, desc: 'без особенностей' },
  tall: { name: 'Высокий', dh: 0.05, desc: 'захват лучше, подхват и отхват +5%, броски с поворотом −5%' },
};
// when each throw becomes known: the stage, unless the coach teaches it earlier
GW.THROW_TIER = { podsechka: 0, otkhvat: 0, bedro: 0, zacep: 1, plecho: 1, podhvat: 2, skolen: 2, taiotoshi: 4, pistol: 4, spina: 5, tomoe: 6 };

// the perks: every one has a price
GW.PERKS = {
  iron_grip: { name: 'Железный хват', plus: 'захват берёте и держите заметно лучше', minus: 'держать захват тяжелее для дыхалки' },
  explosive: { name: 'Взрывной вход', plus: '+12% к броскам вперёд', minus: 'каждая попытка стоит на 40% больше дыхалки' },
  counter_master: { name: 'Мастер контратаки', plus: '+40% к контратаке в окне после чужой попытки', minus: 'свои первые атаки −8%' },
  second_wind: { name: 'Второе дыхание', plus: 'вне захвата дыхалка восстанавливается на 35% быстрее', minus: 'нет минуса, но занимает слот' },
  ground_hunter: { name: 'Охотник партера', plus: 'удержания, удушающие и болевые заметно сильнее', minus: 'броски в стойке −5%' },
  rock: { name: 'Скала', plus: 'вас бросить на 12% труднее', minus: 'вы медленнее двигаетесь в захвате' },
  cat: { name: 'Кошка', plus: '+12% выкрутиться в полёте', minus: 'соперник проходит в бросок на 5% чаще' },
  leg_reaper: { name: 'Подсечник', plus: 'подсечки, зацеп, отхват, сколен +15%', minus: 'броски вперёд −10%' },
  big_game: { name: 'Человек финала', plus: 'в финалах и золотом скоре +10% к броскам', minus: 'в остальных схватках −5%' },
};
GW.PERK_SLOTS = [3, 7, 12, 18, 25];   // the level at which every slot opens

// the training sessions of a week (3 slots a week)
GW.SESSIONS = {
  grip: { name: 'Захваты', desc: 'мини-игра: борьба за захват 30 с', drill: 'grip', gains: { grip: 1.6, speed: 0.3 }, fat: 14 },
  uchikomi: { name: 'Отработка броска', desc: 'мини-игра: поймать момент и бросить', drill: 'uchikomi', gains: { technique: 1.1 }, mastery: 6, fat: 14 },
  defense: { name: 'Защита', desc: 'мини-игра: устоять против атак', drill: 'defense', gains: { defense: 1.4, speed: 0.2 }, fat: 12 },
  newaza: { name: 'Партер', desc: 'мини-игра: удержать 10 с и выйти снизу', drill: 'newaza', gains: { newaza: 1.6, power: 0.3 }, fat: 16 },
  power: { name: 'Сила', desc: 'штанга, канат, рывки резиной', gains: { power: 1.5 }, fat: 18 },
  cardio: { name: 'Выносливость', desc: 'кроссы, интервалы, круговая', gains: { cardio: 1.5 }, fat: 18, fuel: true },
  tech: { name: 'Техника', desc: 'ката, разбор видео с тренером', gains: { technique: 0.8, defense: 0.8 }, fat: 8 },
  sparring: { name: 'Спарринг', desc: 'настоящая схватка с выбранным партнёром', drill: 'sparring', gains: {}, fat: 22, xp: 30 },
  recovery: { name: 'Восстановление', desc: 'баня, массаж, сон: −30 усталости', gains: {}, fat: -30 },
};
GW.START_SESSIONS = ['grip', 'power', 'cardio', 'tech', 'recovery'];
// the clubs: where you train decides how fast you grow
GW.CLUBS = {
  sakura: { name: 'Додзё «Сакура»', coach: 'Палыч', mult: 1.0, fee: 0 },
  mentor: { name: '«Сакура» + наставник', coach: 'Виктор Ильич, бывший чемпион Европы', mult: 1.12, fee: 0, ground: 1.25, desc: 'остаётесь дома; старый чемпион ставит партер и голову; бесплатно' },
  olymp: { name: 'СК «Олимп»', coach: 'Карпов, тренер «Олимпа»', mult: 1.18, fee: 120, desc: 'сильный клуб: жёсткие спарринги, быстрее растёте; $120 в неделю' },
  elite: { name: 'Центр олимпийской подготовки', coach: 'Главный тренер сборной', mult: 1.32, fee: 400, desc: 'сборная: лучший рост и медицина; $400 в неделю' },
};
GW.SPECS = {
  tech: { name: 'Техник', desc: '+6% к броскам, мастерство бросков растёт на 30% быстрее', attr: 'technique', plan: ['uchikomi', 'tech', 'grip'] },
  power: { name: 'Силач', desc: '+5% к броскам вперёд, +2% к остальным, захват крепче, сила растёт быстрее', attr: 'power', plan: ['power', 'grip', 'sparring'] },
  speed: { name: 'Скоростник', desc: 'захват берёте быстрее, +8% к броскам, когда соперник потерял равновесие', attr: 'speed', plan: ['grip', 'uchikomi', 'cardio'] },
  cardio: { name: 'Двужильный', desc: 'в захвате тратите на 20% меньше дыхалки, выносливость растёт быстрее', attr: 'cardio', plan: ['cardio', 'sparring', 'recovery'] },
  counter: { name: 'Контратакующий', desc: 'окно контратаки длиннее, контра +30%, устоять легче', attr: 'defense', plan: ['defense', 'sparring', 'tech'] },
};
GW.PLANS = {
  own: { name: 'Свой план', desc: 'без особых установок' },
  grip: { name: 'Война за захват', desc: 'захват лучше, ваши броски −5%: сначала выиграть руки' },
  tempo: { name: 'Высокий темп', desc: 'соперник быстрее устаёт и получает шидо, вы тратите на 15% больше дыхалки' },
  counter: { name: 'Ловить на контре', desc: 'контратака +30%, ваши первые атаки −8%' },
  safe: { name: 'Осторожно', desc: 'его броски −10%, ваши −8%: против опасного атакующего' },
};
// the coach's tasks: they lead the first days and give every stage its goals
GW.TASKS = [
  { id: 'grip1', tier: 0, name: 'Первое занятие: захват', coach: 'Дзюдо начинается с рук. Подойди, возьми рукав, потом отворот. Он будет сбрасывать — не давай.', goal: 'Тренировка захватов со счётом 10 и больше', act: 'drill:grip', reward: { xp: 40 }, unlock: 'uchikomi' },
  { id: 'throw1', tier: 0, name: 'Первый бросок', coach: 'Бросок — это момент. Жди, когда он качнётся, и бросай туда, куда он падает.', goal: '3 точных броска из 8 на отработке', act: 'drill:uchikomi', reward: { xp: 50 }, unlock: 'defense' },
  { id: 'defend1', tier: 0, name: 'Устоять', coach: 'Тебя тоже будут бросать. Видишь атаку — сразу L1, держи ноги. Чувствуешь опасность — держи ЗАЩИТУ.', goal: 'Устоять 3 раза из 6 атак', act: 'drill:defense', reward: { xp: 50 }, unlock: 'sparring' },
  { id: 'spar1', tier: 0, name: 'Первый спарринг', coach: 'Лёша пришёл на месяц раньше тебя. Поборитесь в полную силу — посмотрю, чему ты научился.', goal: 'Провести спарринг с Лёшей Мартыновым', act: 'spar:martynov', reward: { xp: 60, money: 20 } },
  { id: 'win1', tier: 0, name: 'Первая победа', coach: 'Теперь — победа. Неважно над кем из новичков. Проиграешь — разберём, что не так, и снова.', goal: 'Выиграть спарринг у новичка клуба', act: 'spar:novice', reward: { xp: 80, rep: 20 } },
  { id: 'senior', tier: 1, name: 'Старшие', coach: 'Старшие пока бросают тебя как хотят. Найди одного, у кого выиграешь, — изучи, где он слаб.', goal: 'Победить старшего ученика: Бурова, Ткача, Зубова или Кима', act: 'spar:senior', reward: { xp: 100, rep: 20 } },
  { id: 'ground1', tier: 1, name: 'Партер', coach: 'Упал — это не конец. Научись держать и выходить снизу.', goal: 'Удержать 10 с на тренировке партера', act: 'drill:newaza', reward: { xp: 70 }, unlock: 'newaza' },
  { id: 'club1', tier: 1, name: 'Первый титул', coach: 'Клубное первенство. Здесь все свои — и все хотят тебя бросить.', goal: 'Выиграть клубное первенство или сдать аттестацию на пояс', act: 'event', reward: { xp: 120, rep: 15 } },
  { id: 'local1', tier: 2, name: 'Чужой зал', coach: 'Район. Тебя никто не знает. Посмотрим, как ты держишься в чужом зале.', goal: 'Взять медаль на турнире района', act: 'event', reward: { xp: 150, money: 60 } },
  { id: 'stats1', tier: 2, name: 'Работа над ошибками', coach: 'Хватит атаковать без захвата. Сначала ●●, потом бросок.', goal: 'Провести 5 схваток, где 60%+ атак — с полным захватом', act: 'auto', need: 5, reward: { xp: 120 } },
  { id: 'spec', tier: 3, name: 'Своё дзюдо', coach: 'Пора решить, кто ты: техник, силач, скоростник, двужильный или контратакующий.', goal: 'Выбрать специализацию', act: 'spec', reward: { xp: 80 } },
  { id: 'combo1', tier: 3, name: 'Комбинация', coach: 'Один бросок читают. Два подряд — нет. Остановили первый — сразу второй в другую сторону.', goal: 'Провести бросок комбинацией в схватке', act: 'auto', reward: { xp: 150, rep: 20 } },
  { id: 'rival1', tier: 3, name: 'Принципиальный соперник', coach: 'Котов из «Динамо» говорит всем, что ты случайный. Докажи.', goal: 'Победить Влада Котова', act: 'rival:kotov', reward: { xp: 200, rep: 40 } },
  { id: 'club2', tier: 4, name: 'Новый зал', coach: 'Я дал тебе всё, что мог. Решай: сильный клуб или старый чемпион-наставник.', goal: 'Выбрать: переход в СК «Олимп» или наставник', act: 'transfer', reward: { xp: 100 } },
  { id: 'scout1', tier: 4, name: 'Домашнее задание', coach: 'Перед сильным соперником смотри видео. Узнай, где он слаб, — и бей туда.', goal: 'Разобрать видео соперника и победить его', act: 'auto', reward: { xp: 200, rep: 30 } },
  { id: 'final1', tier: 5, name: 'Финал страны', coach: 'Финал — это другие нервы.', goal: 'Выйти в финал чемпионата или кубка страны', act: 'auto', reward: { xp: 300, rep: 50 } },
  { id: 'elite', tier: 5, name: 'Сборная', coach: 'Возьмёшь медаль на чемпионате страны — позовут в центр подготовки.', goal: 'Медаль чемпионата страны и переход в центр подготовки', act: 'elite', reward: { xp: 200 } },
  { id: 'plan1', tier: 6, name: 'Контрмеры', coach: 'Здесь все сильные. Побеждает тот, у кого есть план на соперника.', goal: 'Победить на международном турнире с планом на схватку (не «свой план»)', act: 'auto', reward: { xp: 400, rep: 60 } },
  { id: 'worlds1', tier: 6, name: 'Мир', coach: 'Чемпионат мира. Медаль здесь — имя навсегда.', goal: 'Взять медаль чемпионата мира', act: 'auto', reward: { xp: 500, rep: 100 } },
];

GW.ACH = {
  first_win: { name: 'Первая победа', desc: 'выиграть первую схватку' },
  first_ippon: { name: 'Чистый иппон', desc: 'победить иппоном с броска' },
  hold20: { name: 'Двадцать секунд', desc: 'победить удержанием' },
  sub: { name: 'Сдавайся!', desc: 'победить удушающим или болевым' },
  golden: { name: 'Золотое сердце', desc: 'победить в золотом скоре' },
  comeback: { name: 'Камбэк', desc: 'победить, уступая по ходу схватки' },
  streak5: { name: 'Серия', desc: '5 побед подряд' },
  streak10: { name: 'Неудержимый', desc: '10 побед подряд' },
  all_types: { name: 'Знаток стилей', desc: 'победить все пять типов соперников' },
  revenge: { name: 'Вернул долг', desc: 'выиграть реванш у того, кто вас победил' },
  clean_event: { name: 'Сухой турнир', desc: 'выиграть турнир, не пропустив ни одной оценки' },
  tai: { name: 'Передняя подножка', desc: 'иппон тай-отоси' },
  tomoe: { name: 'Через голову', desc: 'иппон томоэ-нагэ' },
  counter_ippon: { name: 'Наказание', desc: 'иппон контратакой' },
  master: { name: 'Мастер приёма', desc: 'мастерство одного броска 100' },
  black_belt: { name: 'Чёрный пояс', desc: 'дойти до международной элиты' },
  national: { name: 'Чемпион страны', desc: 'выиграть чемпионат страны' },
  world: { name: 'Чемпион мира', desc: 'выиграть чемпионат мира' },
  olympic: { name: 'Олимпийское золото', desc: 'выиграть Олимпийские игры' },
  defend3: { name: 'Династия', desc: 'защитить титул чемпиона мира три раза' },
  fights100: { name: 'Сотня', desc: 'провести 100 схваток в карьере' },
  legend: { name: 'Легенда', desc: 'набрать 1000 очков наследия' },
  first_title: { name: 'Первый титул', desc: 'выиграть первый турнир' },
  combo: { name: 'Комбинация', desc: 'оценка вторым броском комбинации' },
  homework: { name: 'Домашнее задание', desc: 'победить соперника, чьё видео вы разобрали' },
  grudge: { name: 'Принципиально', desc: 'победить принципиального соперника' },
  new_class: { name: 'Новая категория', desc: 'выиграть турнир в другой весовой категории' },
};
// the career challenges: optional goals with a reward
GW.CHALLENGES = [
  { id: 'c_first', tier: 1, name: 'Первый шаг', desc: 'выиграть клубное первенство', reward: { rep: 15, xp: 60 } },
  { id: 'c_ippon', tier: 2, name: 'Чистая работа', desc: 'выиграть схватку иппоном с броска на турнире', reward: { rep: 25, xp: 80 } },
  { id: 'c_grip', tier: 3, name: 'Хозяин захвата', desc: 'выиграть схватку, владея лучшим захватом больше половины времени', reward: { rep: 40, xp: 120 } },
  { id: 'c_ground', tier: 4, name: 'Партерный зверь', desc: 'выиграть удержанием, удушающим или болевым', reward: { rep: 60, xp: 160 } },
  { id: 'c_noshido', tier: 5, name: 'Без замечаний', desc: 'выиграть турнир, не получив ни одного шидо', reward: { rep: 90, xp: 220, money: 1000 } },
  { id: 'c_styles', tier: 6, name: 'Покоритель стилей', desc: 'победить контратакующего и мастера захвата на международном уровне', reward: { rep: 140, xp: 300, money: 3000 } },
  { id: 'c_golden', tier: 6, name: 'Нервы из стали', desc: 'выиграть финал в золотом скоре', reward: { rep: 200, xp: 400, money: 8000 } },
  { id: 'c_dynasty', tier: 7, name: 'Династия', desc: 'защитить титул чемпиона мира', reward: { rep: 300, xp: 600, money: 20000 } },
  { id: 'c_unbeaten', tier: 7, name: 'Без поражений', desc: 'выиграть три турнира подряд, не проиграв ни одной схватки', reward: { rep: 300, xp: 600, money: 15000 } },
  { id: 'c_beatall', tier: 7, name: 'Все сильнейшие', desc: 'победить каждого соперника международного уровня и каждую легенду хотя бы раз', reward: { rep: 400, xp: 800, money: 25000 } },
  { id: 'c_newweight', tier: 7, name: 'Новая категория', desc: 'завоевать титул в другой весовой категории', reward: { rep: 400, xp: 800, money: 25000 } },
];
// the bodies of the engine's roster get made-up judoka names: nobody real is on these tatami
GW.NAMES = ['Артём Лаврентьев', 'Нурбек Аманов', 'Тайга Кисимото', 'Гела Абашидзе', 'Эмиль Ришар', 'Самир Гаджимуратов', 'Бо Ён Чхве', 'Жан Фуко', 'Матвей Корнилов', 'Даниял Сапаров',
  'Рэн Огава', 'Тео Ламбер', 'Шота Гогичайшвили', 'Марат Исмагулов', 'Ульви Керимзаде', 'Хоу Цзюньфэн', 'Ян де Вит', 'Санжар Тохиров', 'Кайрат Байжанов', 'Сэйдзи Нодзима',
  'Ираклий Беридзе', 'Лоран Мерсье', 'Батбаяр Ганхуяг', 'Алибек Нуртаев', 'Юсукэ Ватанабэ', 'Фуад Гасанзаде', 'Пётр Ершов', 'Вим Ваннестен', 'Тамаз Чиковани', 'Кодзи Арима', 'Игнат Сорокин', 'Ален Ферран'];
UFC_RENAME();
function UFC_RENAME() {
  const UFC = window.UFC; if (!UFC || !UFC.ROSTER) return;
  UFC.applyNameMode = function () {
    UFC.nameMode = 'orig';
    UFC.ROSTER.forEach((f, i) => { const n = GW.NAMES[i % GW.NAMES.length]; f.name = n; f.short = n.split(' ').slice(-1)[0]; f.nick = ''; });
    return 'orig';
  };
  UFC.applyNameMode();
  const st = document.createElement('style'); st.textContent = '.opt:has(#set-names) { display: none !important; }'; document.head.appendChild(st);
}
GW.LEGACY = [[0, 'Любитель'], [80, 'Легенда клуба'], [250, 'Гордость региона'], [500, 'Национальный герой'], [800, 'Мировая звезда'], [1000, 'Легенда дзюдо'], [1600, 'Бессмертный']];
})();

