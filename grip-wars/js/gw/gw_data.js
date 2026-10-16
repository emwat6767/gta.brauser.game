//# sourceURL=judo/gw_data.js
// GRIP WARS: the data of the road to legend. Eight steps from a small club to a legacy, the events of every step,
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
GW.TIERS = [
  { name: 'Новичок клуба', place: 'Додзё «Сакура», подвал спорткомплекса', lv: [24, 34], rep: 80, venue: 'europe', prize: 0, pts: 10,
    text: 'Вы пришли в маленький клуб. Тренер Палыч смотрит, есть ли в вас характер. Выиграйте клубный турнир — и вам доверят первые соревнования.' },
  { name: 'Местные соревнования', place: 'Районные первенства', lv: [32, 44], rep: 200, venue: 'europe', prize: 60, pts: 25,
    text: 'Первые выезды: районные первенства в школьных спортзалах. Здесь учатся не бояться чужих татами.' },
  { name: 'Клубные турниры', place: 'Межклубные кубки города', lv: [40, 52], rep: 380, venue: 'europe', prize: 180, pts: 50,
    text: 'Сильнейшие клубы города. Соперники уже со своими приёмами и характером.' },
  { name: 'Региональный уровень', place: 'Чемпионаты области и региона', lv: [48, 60], rep: 550, venue: 'grandslam', prize: 450, pts: 100,
    text: 'Область, сборы, первые деньги. Медаль здесь — путёвка на чемпионат страны.' },
  { name: 'Национальный уровень', place: 'Чемпионат и кубок страны', lv: [56, 68], rep: 900, venue: 'grandslam', prize: 1400, pts: 220,
    text: 'Лучшие в стране. Отсюда берут в сборную.' },
  { name: 'Международный уровень', place: 'Гран-при и открытые кубки', lv: [64, 76], rep: 1400, venue: 'grandslam', prize: 4500, pts: 450,
    text: 'Иностранные соперники, чужие стили, перелёты. Рейтинг-очки начинают решать всё.' },
  { name: 'Чемпионский уровень', place: 'Гранд-слэмы и чемпионат мира', lv: [72, 84], rep: 2300, venue: 'worlds', prize: 16000, pts: 900,
    text: 'Элита. Каждый в сетке может стать чемпионом мира.' },
  { name: 'Защита титула и наследие', place: 'Чемпионат мира, Олимпиада, турнир легенд', lv: [78, 90], rep: 99999, venue: 'olympics', prize: 45000, pts: 1500,
    text: 'Вас знают все. Теперь главное — удержать титул и оставить наследие.' },
];

// the events of every step: every one comes round on its own weeks
GW.EVENTS = [
  { id: 'club', tier: 0, name: 'Клубный турнир «Сакуры»', size: 4, every: 3, at: 1 },
  { id: 'belt', tier: 0, name: 'Аттестация на жёлтый пояс', size: 2, every: 6, at: 4, belt: true },
  { id: 'district', tier: 1, name: 'Первенство района', size: 8, every: 4, at: 2 },
  { id: 'school', tier: 1, name: 'Турнир спортивных школ', size: 4, every: 5, at: 4 },
  { id: 'citycup', tier: 2, name: 'Межклубный кубок города', size: 8, every: 4, at: 1 },
  { id: 'memorial', tier: 2, name: 'Мемориал тренера Сомова', size: 8, every: 6, at: 3 },
  { id: 'oblast', tier: 3, name: 'Чемпионат области', size: 8, every: 5, at: 2 },
  { id: 'region', tier: 3, name: 'Кубок региона', size: 16, every: 7, at: 5 },
  { id: 'national', tier: 4, name: 'Чемпионат страны', size: 16, every: 12, at: 7, title: 'Чемпион страны' },
  { id: 'natcup', tier: 4, name: 'Кубок страны', size: 8, every: 5, at: 3 },
  { id: 'open', tier: 5, name: 'Европейский открытый кубок', size: 16, every: 6, at: 2, fee: 600 },
  { id: 'gp', tier: 5, name: 'Гран-при', size: 16, every: 7, at: 5, fee: 900 },
  { id: 'gs', tier: 6, name: 'Гранд-слэм', size: 16, every: 6, at: 3, fee: 1500 },
  { id: 'worlds', tier: 6, name: 'Чемпионат мира', size: 16, every: 24, at: 18, fee: 2000, title: 'Чемпион мира' },
  { id: 'masters', tier: 7, name: 'Мастерс — турнир лучших', size: 8, every: 12, at: 10, fee: 2000 },
  { id: 'wdef', tier: 7, name: 'Чемпионат мира (защита титула)', size: 16, every: 24, at: 6, fee: 2000, title: 'Чемпион мира' },
  { id: 'olympics', tier: 7, name: 'Олимпийские игры', size: 16, every: 96, at: 40, fee: 0, title: 'Олимпийский чемпион' },
  { id: 'legends', tier: 7, name: 'Турнир легенд', size: 8, every: 16, at: 14, fee: 0 },
];

// the cast. lv: the level at the start of your career; they grow a little with the years.
// type: the way he fights; fav: his two throws; face: the look (from the roster of bodies)
GW.ROSTER = [
  // the club
  { id: 'burov', name: 'Саня Буров', cc: 'RUS', type: 'aggressor', lv: 26, tier: 0, fav: ['podhvat', 'otkhvat'], age: 19, bio: 'Старший в клубе. Лезет вперёд и толкается — пока не кончится дыхалка.' },
  { id: 'tkach', name: 'Миша Ткач', cc: 'RUS', type: 'counter', lv: 27, tier: 0, fav: ['zacep', 'podsechka'], age: 18, bio: 'Тихий, ждёт ошибки. Пропустите контру — проиграете.' },
  { id: 'zubov', name: 'Олег Зубов', cc: 'RUS', type: 'grip', lv: 29, tier: 0, fav: ['plecho', 'taiotoshi'], age: 21, bio: 'Руки как тиски. Не даст взяться за отворот.' },
  { id: 'kim', name: 'Денис Ким', cc: 'KOR', type: 'tactician', lv: 28, tier: 0, fav: ['skolen', 'podsechka'], age: 20, bio: 'Никуда не спешит. Выматывает и забирает в конце.' },
  // the district and the city
  { id: 'sychev', name: 'Рома Сычёв', cc: 'RUS', type: 'aggressor', lv: 37, tier: 1, fav: ['bedro', 'otkhvat'], age: 20, bio: 'Гроза районных первенств. Бросает всё подряд.' },
  { id: 'galiev', name: 'Артур Галиев', cc: 'RUS', type: 'grip', lv: 39, tier: 1, fav: ['spina', 'pistol'], age: 22, bio: 'Борется за отворот по полминуты. Взялся — бросил.' },
  { id: 'lebed', name: 'Кирилл Лебедь', cc: 'RUS', type: 'counter', lv: 45, tier: 2, fav: ['otkhvat', 'tomoe'], age: 23, bio: 'Любит, когда атакуют его. Опасен томоэ-нагэ на встречном движении.' },
  { id: 'abaev', name: 'Тимур Абаев', cc: 'RUS', type: 'tactician', lv: 47, tier: 2, fav: ['zacep', 'plecho'], age: 25, bio: 'Двужильный. В золотом скоре не проигрывал ни разу.' },
  { id: 'kotov', name: 'Влад Котов', cc: 'RUS', type: 'champion', lv: 49, tier: 2, fav: ['podhvat', 'taiotoshi'], age: 22, bio: 'Лучший в городе. Всё умеет понемногу и подстраивается.' },
  // the region
  { id: 'khapov', name: 'Аслан Хапов', cc: 'RUS', type: 'aggressor', lv: 53, tier: 3, fav: ['pistol', 'podhvat'], age: 23, bio: 'Взрывной, как пружина. Первые двадцать секунд — опаснее всех.' },
  { id: 'sedykh', name: 'Игорь Седых', cc: 'RUS', type: 'grip', lv: 55, tier: 3, fav: ['taiotoshi', 'plecho'], age: 26, bio: 'Хозяин захвата. Ломает ваш рукав и ставит свой.' },
  { id: 'bekoev', name: 'Руслан Бекоев', cc: 'RUS', type: 'counter', lv: 57, tier: 3, fav: ['zacep', 'skolen'], age: 24, bio: 'Контратака на подхват — его визитная карточка.' },
  // the country
  { id: 'tsaraev', name: 'Давид Цараев', cc: 'RUS', type: 'champion', lv: 62, tier: 4, fav: ['plecho', 'otkhvat'], age: 25, bio: 'Действующий чемпион страны. Читает соперника за полминуты.' },
  { id: 'orlov', name: 'Степан Орлов', cc: 'RUS', type: 'tactician', lv: 61, tier: 4, fav: ['bedro', 'zacep'], age: 28, bio: 'Опытный, тяжёлый, терпеливый. Переигрывает на выносливости.' },
  { id: 'nuriev', name: 'Ильяс Нуриев', cc: 'RUS', type: 'grip', lv: 63, tier: 4, fav: ['spina', 'taiotoshi'], age: 24, bio: 'Борьба за захват у него как шахматы.' },
  // the world
  { id: 'murakami', name: 'Кэнта Мураками', cc: 'JPN', type: 'champion', lv: 70, tier: 5, fav: ['podhvat', 'taiotoshi'], age: 24, bio: 'Японская школа: идеальный подхват, идеальный тайминг.' },
  { id: 'beranger', name: 'Луи Беранже', cc: 'FRA', type: 'counter', lv: 68, tier: 5, fav: ['otkhvat', 'tomoe'], age: 27, bio: 'Француз с длинными руками. Контратакует любой бросок вперёд.' },
  { id: 'mikeladze', name: 'Гиорги Микеладзе', cc: 'GEO', type: 'aggressor', lv: 69, tier: 5, fav: ['pistol', 'spina'], age: 23, bio: 'Грузинская школа: мощь, захват за пояс, бросок через спину.' },
  { id: 'ganzorig', name: 'Бат-Эрдэнэ Ганзориг', cc: 'MGL', type: 'tactician', lv: 71, tier: 5, fav: ['zacep', 'bedro'], age: 26, bio: 'Монгольский борец: не устаёт и не падает.' },
  // the elite
  { id: 'yamada', name: 'Сёта Ямада', cc: 'JPN', type: 'champion', lv: 78, tier: 6, fav: ['plecho', 'podhvat'], age: 25, bio: 'Двукратный чемпион мира. Знает всё про ваш любимый бросок.' },
  { id: 'kveselava', name: 'Нодар Квеселава', cc: 'GEO', type: 'grip', lv: 77, tier: 6, fav: ['taiotoshi', 'spina'], age: 27, bio: 'Самый неудобный захват в мире.' },
  { id: 'dufour', name: 'Мартен Дюфур', cc: 'FRA', type: 'tactician', lv: 76, tier: 6, fav: ['otkhvat', 'zacep'], age: 29, bio: 'Выигрывает золотыми скорами и шидо.' },
  { id: 'tulegenov', name: 'Ерасыл Тулегенов', cc: 'KAZ', type: 'aggressor', lv: 77, tier: 6, fav: ['pistol', 'bedro'], age: 24, bio: 'Темп, темп, темп. Бросает даже без захвата.' },
  // the legends
  { id: 'sato', name: 'Хидэаки Сато', cc: 'JPN', type: 'champion', lv: 84, tier: 7, fav: ['podhvat', 'plecho'], age: 27, bio: 'Олимпийский чемпион. Говорят, его никто не бросал три года.' },
  { id: 'aliev', name: 'Рустам Алиев', cc: 'AZE', type: 'counter', lv: 83, tier: 7, fav: ['zacep', 'tomoe'], age: 28, bio: 'Мастер контратаки и партера. Опасен на земле.' },
  { id: 'vanberg', name: 'Нильс ван Берг', cc: 'NED', type: 'grip', lv: 82, tier: 7, fav: ['taiotoshi', 'otkhvat'], age: 29, bio: 'Голландский великан с хватом-капканом.' },
];
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
  power: { name: 'Силовик', desc: 'из тяжёлой атлетики: сила и рывки', a: { power: 40, speed: 30, cardio: 30, technique: 28, grip: 34, defense: 30, newaza: 28 } },
  tech: { name: 'Техник', desc: 'с детства в школе дзюдо: техника и скорость', a: { power: 28, speed: 36, cardio: 30, technique: 40, grip: 30, defense: 30, newaza: 26 } },
  cardio: { name: 'Марафонец', desc: 'из лёгкой атлетики: дыхалка и защита', a: { power: 28, speed: 32, cardio: 42, technique: 28, grip: 30, defense: 34, newaza: 26 } },
  grip: { name: 'Захватчик', desc: 'из самбо: захват и партер', a: { power: 32, speed: 30, cardio: 30, technique: 28, grip: 40, defense: 30, newaza: 34 } },
};

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
  newaza: { name: 'Партер', desc: 'мини-игра: удержать 10 с и выйти снизу', drill: 'newaza', gains: { newaza: 1.6, power: 0.3 }, fat: 16 },
  power: { name: 'Сила', desc: 'штанга, канат, рывки резиной', gains: { power: 1.5 }, fat: 18 },
  cardio: { name: 'Выносливость', desc: 'кроссы, интервалы, круговая', gains: { cardio: 1.5 }, fat: 18, fuel: true },
  tech: { name: 'Техника', desc: 'ката, разбор видео с тренером', gains: { technique: 0.8, defense: 0.8 }, fat: 8 },
  sparring: { name: 'Спарринг', desc: 'настоящая схватка с партнёром по клубу', drill: 'sparring', gains: {}, fat: 22, xp: 30 },
  recovery: { name: 'Восстановление', desc: 'баня, массаж, сон: −30 усталости', gains: {}, fat: -30 },
};
GW.COACHES = [
  { name: 'Палыч (тренер клуба)', mult: 1.0, price: 0, tier: 0 },
  { name: 'Опытный тренер', mult: 1.15, price: 600, tier: 1 },
  { name: 'Тренер сборной', mult: 1.3, price: 4000, tier: 3 },
  { name: 'Легендарный сэнсэй', mult: 1.45, price: 20000, tier: 5 },
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
  black_belt: { name: 'Чёрный пояс', desc: 'дойти до чемпионского уровня' },
  national: { name: 'Чемпион страны', desc: 'выиграть чемпионат страны' },
  world: { name: 'Чемпион мира', desc: 'выиграть чемпионат мира' },
  olympic: { name: 'Олимпийское золото', desc: 'выиграть Олимпийские игры' },
  defend3: { name: 'Династия', desc: 'защитить титул чемпиона мира три раза' },
  fights100: { name: 'Сотня', desc: 'провести 100 схваток в карьере' },
  legend: { name: 'Легенда', desc: 'набрать 1000 очков наследия' },
};
// the career challenges: optional goals with a reward
GW.CHALLENGES = [
  { id: 'c_first', tier: 0, name: 'Первый шаг', desc: 'выиграть клубный турнир', reward: { rep: 15, xp: 60 } },
  { id: 'c_ippon', tier: 1, name: 'Чистая работа', desc: 'выиграть схватку иппоном с броска', reward: { rep: 25, xp: 80 } },
  { id: 'c_grip', tier: 2, name: 'Хозяин захвата', desc: 'выиграть схватку, владея лучшим захватом больше половины времени', reward: { rep: 40, xp: 120 } },
  { id: 'c_ground', tier: 3, name: 'Партерный зверь', desc: 'выиграть удержанием, удушающим или болевым', reward: { rep: 60, xp: 160 } },
  { id: 'c_noshido', tier: 4, name: 'Без замечаний', desc: 'выиграть турнир, не получив ни одного шидо', reward: { rep: 90, xp: 220, money: 1000 } },
  { id: 'c_styles', tier: 5, name: 'Покоритель стилей', desc: 'победить контратакующего и мастера захвата на международном уровне', reward: { rep: 140, xp: 300, money: 3000 } },
  { id: 'c_golden', tier: 6, name: 'Нервы из стали', desc: 'выиграть финал в золотом скоре', reward: { rep: 200, xp: 400, money: 8000 } },
  { id: 'c_dynasty', tier: 7, name: 'Династия', desc: 'защитить титул чемпиона мира', reward: { rep: 300, xp: 600, money: 20000 } },
];
// the legacy: a hall of fame, by the points of the whole career
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

