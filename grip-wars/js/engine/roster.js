//# sourceURL=ufc/roster.js
(function () {
'use strict';
const UFC = window.UFC;

// Body proportions, stance, style and ratings feed the simulation directly
// (reach -> arm length, weight -> girth, stance -> lead side).
// `short` is used for the arena screens, scorecards and commentary.
// `original: true` marks the game's own (non-real) fighters.
UFC.ROSTER = [
  {
    id: 'volkanovski', name: 'Александр Волкановски', short: 'Волкановски', nick: 'The Great', flag: 'AU', division: 'Полулёгкий вес',
    height: 1.68, weight: 66, reach: 1.82, build: 0.9, stance: 'orthodox', style: 'boxer',
    stats: { power: 82, speed: 88, chin: 88, cardio: 95, defense: 88, boxing: 90, kicks: 78, wrestling: 88, bjj: 84 },
    look: { skin: 0xe2b594, hair: 0x2a1e16, hairStyle: 'buzz', beard: 'stubble', shorts: 0x1b2f63, shortsTrim: 0xd8b24a, gloves: 0x121212, tattoo: 5, eye: 0x3b2a1a },
  },
  {
    id: 'gaethje', name: 'Джастин Гэтжи', short: 'Гэтжи', nick: 'The Highlight', flag: 'US', division: 'Лёгкий вес',
    height: 1.80, weight: 70, reach: 1.78, build: 0.85, stance: 'orthodox', style: 'brawler',
    stats: { power: 93, speed: 80, chin: 86, cardio: 80, defense: 62, boxing: 84, kicks: 86, wrestling: 86, bjj: 62 },
    look: { skin: 0xe6bd9c, hair: 0x5a4632, hairStyle: 'buzz', beard: 'goatee', shorts: 0x7c0d13, shortsTrim: 0xeeeeee, gloves: 0x121212, eye: 0x3b5a6e },
  },
  {
    id: 'holloway', name: 'Макс Холлоуэй', short: 'Холлоуэй', nick: 'Blessed', flag: 'US', division: 'Полулёгкий вес',
    height: 1.80, weight: 66, reach: 1.75, build: 0.72, stance: 'orthodox', style: 'boxer',
    stats: { power: 80, speed: 90, chin: 96, cardio: 97, defense: 80, boxing: 94, kicks: 76, wrestling: 76, bjj: 80 },
    look: { skin: 0xb98363, hair: 0x120c08, hairStyle: 'fade', beard: 'short', shorts: 0x111113, shortsTrim: 0xd8b24a, gloves: 0x121212, tattoo: 2, eye: 0x24160c },
  },
  {
    id: 'oliveira', name: 'Шарль Оливейра', short: 'Оливейра', nick: 'Do Bronx', flag: 'BR', division: 'Лёгкий вес',
    height: 1.78, weight: 70, reach: 1.88, build: 0.62, stance: 'orthodox', style: 'kickboxer',
    stats: { power: 84, speed: 84, chin: 72, cardio: 86, defense: 70, boxing: 82, kicks: 88, wrestling: 78, bjj: 98 },
    look: { skin: 0xc28d69, hair: 0x140e0a, hairStyle: 'curly', beard: 'stubble', shorts: 0x0d5a3b, shortsTrim: 0xd8b24a, gloves: 0x121212, tattoo: 9, eye: 0x24160c },
  },
  {
    id: 'topuria', name: 'Илия Топурия', short: 'Топурия', nick: 'El Matador', flag: 'ES', division: 'Полулёгкий вес',
    height: 1.70, weight: 66, reach: 1.75, build: 0.95, stance: 'orthodox', style: 'boxer',
    stats: { power: 95, speed: 87, chin: 90, cardio: 88, defense: 84, boxing: 95, kicks: 68, wrestling: 86, bjj: 88 },
    look: { skin: 0xd9a784, hair: 0x15100b, hairStyle: 'slick', beard: 'short', shorts: 0xb3121b, shortsTrim: 0xd8b24a, gloves: 0x121212, tattoo: 4, eye: 0x24160c },
  },
  {
    id: 'makhachev', name: 'Ислам Махачев', short: 'Махачев', nick: 'Махач', flag: 'RU', division: 'Лёгкий вес',
    height: 1.78, weight: 70, reach: 1.79, build: 0.8, stance: 'southpaw', style: 'brawler',
    stats: { power: 84, speed: 84, chin: 88, cardio: 94, defense: 90, boxing: 86, kicks: 80, wrestling: 96, bjj: 93 },
    look: { skin: 0xdcb088, hair: 0x19110b, hairStyle: 'buzz', beard: 'full', shorts: 0x1c1c1c, shortsTrim: 0x2f7d3a, gloves: 0x121212, eye: 0x2a1b10 },
  },
  {
    id: 'tsarukyan', name: 'Арман Царукян', short: 'Царукян', nick: 'Ahalkalakets', flag: 'AM', division: 'Лёгкий вес',
    height: 1.70, weight: 70, reach: 1.83, build: 0.92, stance: 'orthodox', style: 'brawler',
    stats: { power: 86, speed: 88, chin: 84, cardio: 88, defense: 82, boxing: 82, kicks: 78, wrestling: 93, bjj: 86 },
    look: { skin: 0xd8a882, hair: 0x120c08, hairStyle: 'short', beard: 'full', shorts: 0xd8b24a, shortsTrim: 0x111111, gloves: 0x121212, eye: 0x24160c },
  },
  {
    id: 'poirier', name: 'Дастин Порье', short: 'Порье', nick: 'The Diamond', flag: 'US', division: 'Лёгкий вес',
    height: 1.75, weight: 70, reach: 1.83, build: 0.78, stance: 'southpaw', style: 'boxer',
    stats: { power: 90, speed: 82, chin: 84, cardio: 86, defense: 74, boxing: 92, kicks: 72, wrestling: 74, bjj: 86 },
    look: { skin: 0xe2b594, hair: 0x2b1d14, hairStyle: 'buzz', beard: 'full', shorts: 0x18386a, shortsTrim: 0xeeeeee, gloves: 0x121212, tattoo: 6, eye: 0x3b2a1a },
  },
  {
    id: 'aldo', name: 'Жозе Алду', short: 'Алду', nick: 'Junior', flag: 'BR', division: 'Легчайший вес',
    height: 1.70, weight: 66, reach: 1.78, build: 0.84, stance: 'orthodox', style: 'kickboxer',
    stats: { power: 84, speed: 88, chin: 86, cardio: 85, defense: 92, boxing: 89, kicks: 95, wrestling: 85, bjj: 86 },
    look: { skin: 0xc49270, hair: 0x120c08, hairStyle: 'short', beard: 'stubble', shorts: 0x0b7a3e, shortsTrim: 0xf1c40f, gloves: 0x121212, eye: 0x24160c },
  },
  {
    id: 'mcgregor', name: 'Конор Макгрегор', short: 'Макгрегор', nick: 'The Notorious', flag: 'IE', division: 'Лёгкий вес',
    height: 1.75, weight: 70, reach: 1.88, build: 0.8, stance: 'southpaw', style: 'boxer',
    stats: { power: 93, speed: 90, chin: 76, cardio: 70, defense: 78, boxing: 92, kicks: 82, wrestling: 68, bjj: 66 },
    look: { skin: 0xeec5a6, hair: 0x4e2c16, hairStyle: 'slick', beard: 'thick', shorts: 0x14161a, shortsTrim: 0x1f8a4c, gloves: 0x121212, tattoo: 7, eye: 0x3b5a6e },
  },
  // ---- original fighters ----
  {
    id: 'buran', original: true, name: 'Тимур Жаксылыков', short: 'Жаксылыков', nick: 'Буран', flag: 'KZ', division: 'Лёгкий вес',
    height: 1.78, weight: 70, reach: 1.83, build: 0.72, stance: 'orthodox', style: 'boxer',
    stats: { power: 80, speed: 84, chin: 76, cardio: 82, defense: 74, boxing: 88, kicks: 58, wrestling: 70, bjj: 68 },
    look: { skin: 0xd6a57c, hair: 0x15100b, hairStyle: 'fade', beard: 'stubble', shorts: 0x18386a, shortsTrim: 0xd8b24a, gloves: 0x121212, eye: 0x24160c },
  },
  {
    id: 'bear', original: true, name: 'Руслан Каримбеков', short: 'Каримбеков', nick: 'Медведь', flag: 'RU', division: 'Тяжёлый вес',
    height: 1.91, weight: 112, reach: 1.97, build: 0.6, stance: 'orthodox', style: 'brawler',
    stats: { power: 91, speed: 60, chin: 89, cardio: 60, defense: 64, boxing: 66, kicks: 45, wrestling: 92, bjj: 72 },
    look: { skin: 0xdcb088, hair: 0x19110b, hairStyle: 'bald', beard: 'thick', shorts: 0x1c1c1c, shortsTrim: 0xc8101a, gloves: 0x121212, eye: 0x2a1b10 },
  },
];

// id -> [original name, original nick] used by default, and the real-world
// names kept for personal play (settings -> «Имена бойцов»).
UFC.NAME_SETS = {
  volkanovski: { orig: ['Алекс Волканов', 'Грейт', 'Волканов'], real: ['Александр Волкановски', 'The Great', 'Волкановски'] },
  gaethje: { orig: ['Джастин Гэтли', 'Хайлайт', 'Гэтли'], real: ['Джастин Гэтжи', 'The Highlight', 'Гэтжи'] },
  holloway: { orig: ['Макс Холлидэй', 'Блессед', 'Холлидэй'], real: ['Макс Холлоуэй', 'Blessed', 'Холлоуэй'] },
  oliveira: { orig: ['Шарлез Оливейр', 'Бронкс', 'Оливейр'], real: ['Шарль Оливейра', 'Do Bronx', 'Оливейра'] },
  topuria: { orig: ['Илия Топур', 'Матадор', 'Топур'], real: ['Илия Топурия', 'El Matador', 'Топурия'] },
  makhachev: { orig: ['Ислам Мактаев', 'Орёл гор', 'Мактаев'], real: ['Ислам Махачев', 'Махач', 'Махачев'] },
  tsarukyan: { orig: ['Арман Царунц', 'Ахалкалаки', 'Царунц'], real: ['Арман Царукян', 'Ahalkalakets', 'Царукян'] },
  poirier: { orig: ['Дастин Пуарен', 'Диамант', 'Пуарен'], real: ['Дастин Порье', 'The Diamond', 'Порье'] },
  aldo: { orig: ['Жозе Алдейру', 'Жуниор', 'Алдейру'], real: ['Жозе Алду', 'Junior', 'Алду'] },
  mcgregor: { orig: ['Конор Макгрен', 'Ноториус', 'Макгрен'], real: ['Конор Макгрегор', 'The Notorious', 'Макгрегор'] },
};

UFC.nameMode = 'orig';
UFC.applyNameMode = function (mode) {
  UFC.nameMode = mode === 'real' ? 'real' : 'orig';
  for (const f of UFC.ROSTER) {
    const set = UFC.NAME_SETS[f.id];
    if (!set) continue;
    const v = set[UFC.nameMode] || set.orig;
    f.name = v[0]; f.nick = v[1]; f.short = v[2];
  }
  return UFC.nameMode;
};

UFC.STYLE_NAMES = { boxer: 'Боксёр', kickboxer: 'Кикбоксер', brawler: 'Панчер', wrestler: 'Борец' };
UFC.STANCE_NAMES = { orthodox: 'Правша', southpaw: 'Левша' };
UFC.overall = (f) => Math.round((f.stats.power + f.stats.speed + f.stats.chin + f.stats.cardio + f.stats.defense + f.stats.boxing + f.stats.kicks) / 7);
UFC.shortName = (f) => f.short || f.name;

// ---------------------------------------------------------------------------
// Appearance overrides chosen by the player, saved per fighter id.
// UFC.fighterCfg(i) gives the roster entry with the saved look applied
// (cached, so the same object is returned until the look changes).
// ---------------------------------------------------------------------------
UFC.LOOK_OPTIONS = {
  skin: [0xf0cbad, 0xe2b594, 0xd6a57c, 0xc49270, 0xa8744f, 0x7d5236, 0x57382a],
  hairStyle: [['bald', 'Лысый'], ['buzz', 'Под машинку'], ['short', 'Короткие'], ['fade', 'Фейд'], ['curly', 'Кудри'], ['slick', 'Зачёс'], ['mohawk', 'Ирокез'], ['bun', 'Пучок']],
  hair: [0x0e0a07, 0x2a1e16, 0x5a4632, 0x6b3f22, 0x9a5a2a, 0xc9a36a, 0x8d8a86],
  beard: [['none', 'Нет'], ['stubble', 'Щетина'], ['goatee', 'Эспаньолка'], ['short', 'Короткая'], ['full', 'Борода'], ['thick', 'Густая']],
  build: [[0.6, 'Сухое'], [0.78, 'Атлетичное'], [0.92, 'Мощное']],
  shorts: [0x111113, 0xeeeeee, 0xb3121b, 0x7c0d13, 0x18386a, 0x0b7a3e, 0xd8b24a, 0x5b2a86, 0xe0602b],
  shortsTrim: [0xd8b24a, 0xeeeeee, 0x111111, 0xc8101a, 0x1f8a4c, 0x2a6ad8],
  gloves: [0x121212, 0xb3121b, 0x1b2f63, 0xeeeeee, 0xd8b24a],
  tattoo: [[0, 'Нет'], [2, 'Вариант 1'], [5, 'Вариант 2'], [9, 'Вариант 3']],
};
const LOOK_KEY = 'ufc.looks.v1';
let looks = {};
try { looks = UFC.store.get(LOOK_KEY, {}) || {}; } catch (e) { looks = {}; }
const cache = {};
UFC.reloadLooks = () => { try { looks = UFC.store.get(LOOK_KEY, {}) || {}; } catch (e) { looks = {}; } for (const k in cache) delete cache[k]; };
UFC.rosterAll = () => UFC.ROSTER.concat(UFC.EXTRA_ROSTER || []);
UFC.fighterCfg = (i) => {
  const base = UFC.rosterAll()[i] || UFC.ROSTER[0];
  const ov = looks[base.id];
  if (!ov) return base;
  if (cache[base.id]) return cache[base.id];
  const cfg = Object.assign({}, base, { look: Object.assign({}, base.look, ov.look || {}), customLook: true });
  if (ov.build != null) cfg.build = ov.build;
  return (cache[base.id] = cfg);
};
UFC.setLook = (i, key, val) => {
  const base = UFC.rosterAll()[i] || UFC.ROSTER[0];
  const ov = looks[base.id] || (looks[base.id] = { look: {} });
  if (key === 'build') ov.build = val; else ov.look[key] = val;
  delete cache[base.id];
  UFC.store.set(LOOK_KEY, looks);
};
UFC.resetLook = (i) => {
  const base = UFC.rosterAll()[i] || UFC.ROSTER[0];
  delete looks[base.id]; delete cache[base.id];
  UFC.store.set(LOOK_KEY, looks);
};
})();

