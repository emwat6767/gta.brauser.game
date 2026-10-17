//# sourceURL=ufc/career.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const LG = () => UFC.league;

// ===========================================================================
// Career mode model: saves, fight offers (matchmaking), camp, results,
// rankings, money, health/recovery, achievements, history, KO collection.
// Everything is plain JSON in localStorage ("ufc.career.<slot>"); KO replays
// are stored under their own keys so the main save stays small.
// ===========================================================================
const SLOTS = 3;
const KEY = (slot) => 'ufc.career.' + slot;
const REPLAY_KEY = (slot, id) => 'ufc.career.' + slot + '.ko.' + id;
const SAVE_VERSION = 1;

const CAMP_FOCUS = [
  { id: 'topuria', name: 'Лагерь Топурии ★', desc: 'Жёсткий стиль Илии: сила удара до 99, бокс до 115, скорость до 105, тяжёлый удар до 60 (в других лагерях 50), здоровье (HP) до 500 (в других лагерях 220), пределы выше обычных 99. Режим LOW KEY со 2-го раунда (+15% к скорости, соперник −15%), контра при промахе соперника, неоновые перчатки и аура. короткие хуки, хлёсткий джеб, двойка двумя руками мгновенно. Каждые 10 секунд кнопка «Вложиться»: следующие 3 удара сверхтяжёлые (гликоген ×5, кислота ×3). Подготовка челюсти: подбородок растёт быстрее и в бою держит удары лучше. Плюс +8% гликогена и +8% кислотного порога за лагерь.', gains: { power: 9, boxing: 7, speed: 5, defense: 4, chin: 11, cardio: 3, heavy: 6, hp: 14 }, technique: 'topuria', caps: { power: 99, boxing: 115, speed: 105, heavy: 60, hp: 500 }, fuel: { gly: 8, acid: 8 } },
  { id: 'mcgregor', name: 'Лагерь Макгрегора ★', desc: 'Экипирует технику Конора и включает МОД МАКГРЕГОРА (ур. 2: кэмп раз в 10 с, локоть правой, карате-удары, скорость до 110, ноги до 115): стойка левши, прямой левой, тайминг (мини-слоумо), R1+удар — контра с отклоном как с Альдо, L1+R1+кик — вертушка в печень (✕) или в голову (○)', gains: { power: 7, boxing: 7, kicks: 5, defense: 6, speed: 6, cardio: 2 }, technique: 'mcgregor' },
  { id: 'striking', name: 'Ударка', desc: 'Руки, скорость, точность', gains: { boxing: 3.4, speed: 2, defense: 1.4 } },
  { id: 'kicks', name: 'Удары ногами', desc: 'Кики, дистанция, работа ног', gains: { kicks: 3.4, speed: 1.8, cardio: 1.2 } },
  { id: 'power', name: 'Мощность', desc: 'Сила удара, тяжёлый удар и подбородок', gains: { power: 3.4, chin: 1.8, boxing: 1.2, heavy: 1.8, hp: 5 } },
  { id: 'cardio', name: 'Кардио', desc: 'Выносливость на все раунды и здоровье', gains: { cardio: 3.6, chin: 1.2, speed: 1.2, hp: 3 } },
  { id: 'defense', name: 'Защита', desc: 'Блоки, уклоны, подбородок, здоровье', gains: { defense: 3.4, chin: 1.8, speed: 1, hp: 5 } },
  { id: 'speed', name: 'Скорость', desc: 'Быстрые руки и передвижение', gains: { speed: 3.4, boxing: 1.4, defense: 1.2 } },
  { id: 'iq', name: 'Fight IQ', desc: 'Тайминг, чтение боя, точность', gains: { defense: 2, boxing: 1.6, wrestling: 1.4, bjj: 1.4 } },
  { id: 'balanced', name: 'Сбалансированный', desc: 'Понемногу по всем основным', gains: { power: 1.6, speed: 1.6, cardio: 1.6, defense: 1.6, boxing: 1.6, wrestling: 1.4, bjj: 1.4, kicks: 1.4, chin: 1.2 } },
  { id: 'sparring', name: 'Спарринги', desc: 'Всё сразу, но есть риск травмы', gains: { boxing: 2, kicks: 2, wrestling: 2, bjj: 2, defense: 2, speed: 1.4 }, risk: 0.08 },
];
const INTENSITY = [
  { id: 'light', name: 'Лёгкий', mul: 0.6, prep: 0.92, risk: 0.0 },
  { id: 'normal', name: 'Обычный', mul: 1.0, prep: 1.0, risk: 0.04 },
  { id: 'hard', name: 'Жёсткий', mul: 1.5, prep: 1.06, risk: 0.16 },
];
const GYM_COST = [0, 60000, 180000, 420000];

// ---------------------------------------------------------------- money, hype, PPV
// Purse bands follow the brief: a debut pays little, a title fight pays millions.
function purseBand(rank, title, defense, superFight, hype) {
  return Math.round(purseBand0(rank, title, defense, superFight, hype) * (UFC.curTierPurse == null ? 1 : UFC.curTierPurse) / 100) * 100;
}
function purseBand0(rank, title, defense, superFight, hype) {
  let lo, hi;
  if (superFight) { lo = 5e6; hi = 10e6; }
  else if (defense) { lo = 1.5e6; hi = 4e6; }
  else if (title) { lo = 1e6; hi = 2.2e6; }
  else if (rank == null) { lo = 20000; hi = 60000; }
  else if (rank > 5) { lo = 100000; hi = 400000; }
  else { lo = 500000; hi = 2e6; }
  const h = M.sat((hype || 0) / 100);
  return Math.round((lo + (hi - lo) * (0.35 + 0.65 * h)) / 1000) * 1000;
}
// Pay-per-view points: only real stars sell events.
function ppvFor(c, title, mainEvent) {
  const hype = c.hype || 0;
  if (!mainEvent || hype < 35) return 0;
  const buys = Math.round((hype - 30) * (title ? 9000 : 4200) * (1 + (c.league.fighters.player.titles || 0) * 0.15));
  return { buys, money: Math.round(buys * (title ? 3.2 : 1.6)) };
}
const HYPE = {
  add(c, amount, reason) {
    if (amount > 0) amount *= LG().tierOf(c.league).hype;   // a small league sells fewer tickets
    c.hype = M.clamp((c.hype || 0) + amount, 0, 100);
    if (reason) c.hypeLog = [{ week: c.league.week, amount: Math.round(amount), reason }].concat(c.hypeLog || []).slice(0, 12);
    return c.hype;
  },
  decay(c, weeks) { c.hype = M.clamp((c.hype || 0) - weeks * 0.35, 0, 100); },
};

// ---------------------------------------------------------------- weight cut & food
const CUTS = [
  { id: 'easy', name: 'Мягкая сгонка', desc: 'Меньше риска, но вес на весах выше', over: 0.4, penalty: 0.0, risk: 0 },
  { id: 'normal', name: 'Обычная сгонка', desc: 'Стандартный режим команды', over: 0.0, penalty: 0.04, risk: 0.04 },
  { id: 'hard', name: 'Жёсткая сгонка', desc: 'Точно в лимит, но тяжело в бою', over: -0.3, penalty: 0.1, risk: 0.14 },
];
const FOODS = [
  { id: 'rice', name: 'Рис и курица', cost: 300, recover: 0.55, note: 'Спокойное восстановление' },
  { id: 'steak', name: 'Стейк и овощи', cost: 900, recover: 0.75, note: 'Плотнее, чуть больше сил' },
  { id: 'iv', name: 'Капельница и электролиты', cost: 2500, recover: 0.95, gly: 10, note: 'Максимальное восстановление после сгонки' },
  { id: 'topuria', name: 'Электролиты и углеводы (как у Топурии)', cost: 6000, recover: 0.98, gly: 35, acid: 20, note: 'После сгонки только электролиты и углеводы: +35% гликогена и +20% кислотного порога на этот бой' },
];
const SUPPLEMENTS = [
  { id: 'protein', name: 'Протеин', cost: 1200, stat: 'power', gain: 1, desc: '+1 к силе удара' },
  { id: 'gainer', name: 'Гейнер', cost: 1500, stat: 'chin', gain: 1, desc: '+1 к подбородку' },
  { id: 'creatine', name: 'Креатин', cost: 2000, stat: 'speed', gain: 1, desc: '+1 к скорости' },
  { id: 'omega', name: 'Омега и витамины', cost: 1800, stat: 'cardio', gain: 2, desc: '+2 к выносливости' },
  { id: 'bcaa', name: 'BCAA', cost: 1600, stat: 'boxing', gain: 1, desc: '+1 к боксу' },
];
const ELITE_CAMP_COST = 45000;

// ---------------------------------------------------------------- possessions
const ITEMS = [
  { id: 'apt', kind: 'home', name: 'Квартира в центре', cost: 180000, hype: 2, note: 'Свой угол рядом с залом' },
  { id: 'house', kind: 'home', name: 'Дом с бассейном', cost: 900000, hype: 5, camp: 0.05, note: 'Личный зал: +5% к лагерю' },
  { id: 'villa', kind: 'home', name: 'Вилла у океана', cost: 3500000, hype: 10, camp: 0.1, note: 'Восстановление и подготовка: +10% к лагерю' },
  { id: 'suv', kind: 'car', name: 'Внедорожник', cost: 90000, hype: 2, note: 'Надёжно и по делу' },
  { id: 'sport', kind: 'car', name: 'Спорткар', cost: 450000, hype: 6, note: 'Про такую машину говорят' },
  { id: 'super', kind: 'car', name: 'Суперкар', cost: 2200000, hype: 12, note: 'Заголовки обеспечены' },
  { id: 'suit', kind: 'clothes', name: 'Костюм на заказ', cost: 25000, hype: 3, note: 'Для пресс-конференций' },
  { id: 'watch', kind: 'clothes', name: 'Часы', cost: 150000, hype: 5, note: 'Классика статуса' },
  { id: 'chain', kind: 'clothes', name: 'Цепь чемпиона', cost: 400000, hype: 7, note: 'Видно из последнего ряда' },
];

// ---------------------------------------------------------------- fight card
function buildCard(c, offer) {
  const L = c.league, r = UFC.rngFrom(L.seed + L.week * 31 + c.history.length * 7);
  const pool = [];
  for (const d of UFC.DIVISIONS) {
    const D = L.divs[d.id];
    if (!D) continue;
    for (const id of D.ranked.concat(D.pool)) if (id !== 'player' && id !== offer.opp) pool.push(id);
  }
  const pick = () => pool.splice(r.int(0, pool.length - 1), 1)[0];
  const bout = (kind) => { const a = pick(), b = pick(); return a && b ? { a, b, kind } : null; };
  const rank = LG().rankOf(L, 'player').rank;
  const slot = offer.title || offer.kind === 'superfight' ? 'main' : rank != null && rank <= 5 ? 'main' : rank != null && rank <= 12 ? 'co' : (c.hype || 0) > 45 ? 'card' : 'prelim';
  const card = { event: offer.title ? 'UFC ' + (300 + c.history.length + 1) : 'UFC FIGHT NIGHT ' + (100 + c.history.length + 1), slot, bouts: [] };
  const n = { main: 0, co: 1, card: r.int(2, 3), prelim: r.int(5, 6) }[slot];
  for (let i = 0; i < 1; i++) card.bouts.push({ player: true, opp: offer.opp, title: offer.title, rounds: offer.rounds });
  for (let i = 0; i < 1 + (slot === 'main' ? 1 : 0); i++) { const b = bout('main'); if (b) card.bouts.push(b); }
  for (let i = 0; i < 3; i++) { const b = bout('card'); if (b) card.bouts.push(b); }
  for (let i = 0; i < 6; i++) { const b = bout('prelim'); if (b) card.bouts.push(b); }
  void n;
  return card;
}

function simulateCard(c) {
  const L = c.league, r = UFC.rngFrom(L.seed + L.week * 17 + 3);
  const card = c.booked && c.booked.card;
  if (!card) return [];
  for (const b of card.bouts) {
    if (b.player || b.done) continue;
    const A = L.fighters[b.a], B = L.fighters[b.b];
    if (!A || !B) { b.done = true; continue; }
    const pa = 1 / (1 + Math.pow(10, (B.rating - A.rating) / 400));
    const aWins = r() < pa;
    const w = aWins ? A : B, l = aWins ? B : A;
    const method = r() < 0.32 ? (r() < 0.6 ? 'KO' : 'TKO') : r() < 0.5 ? 'SUB' : 'DEC';
    LG().applyResult(L, { winner: w.id, loser: l.id, method, title: false, week: L.week, round: method === 'DEC' ? 3 : r.int(1, 3), time: '3:00', div: w.div });
    b.done = true; b.winner = w.id; b.method = method;
  }
  return card.bouts;
}
const GYM_NAMES = ['Районный зал', 'Команда профессионалов', 'Топ-зал страны', 'Элитный лагерь'];

// ---------------------------------------------------------------- achievements
const ACH = [
  { id: 'FIRST_FIGHT', name: 'Дебют', desc: 'Проведите первый бой в лиге', icon: '🥊', check: (c) => c.history.length >= 1 },
  { id: 'FIRST_WIN', name: 'Первая победа', desc: 'Выиграйте первый бой', icon: '🏅', check: (c) => pr(c).rec.w >= 1 },
  { id: 'FIRST_KO', name: 'Первый нокаут', desc: 'Победите нокаутом', icon: '💥', check: (c) => pr(c).rec.ko >= 1 },
  { id: 'WINS_10', name: '10 побед', desc: 'Наберите 10 побед в лиге', icon: '🔟', check: (c) => pr(c).rec.w >= 10 },
  { id: 'KO_5', name: 'Нокаутёр', desc: '5 побед нокаутом', icon: '👊', check: (c) => pr(c).rec.ko >= 5 },
  { id: 'STREAK_5', name: 'Серия побед', desc: '5 побед подряд', icon: '🔥', check: (c) => (c.bestStreak || 0) >= 5 },
  { id: 'RANKED', name: 'В Топ-15', desc: 'Войдите в рейтинг дивизиона', icon: '📈', check: (c) => c.bestRank != null && c.bestRank <= 15 },
  { id: 'TOP5', name: 'Топ-5', desc: 'Поднимитесь в пятёрку дивизиона', icon: '⭐', check: (c) => c.bestRank != null && c.bestRank <= 5 },
  { id: 'HEAD_KICK', name: 'Хай-кик', desc: 'Нокаут ударом ногой в голову', icon: '🦵', check: (c) => c.kos.some((k) => k.type === 'HEAD KICK KO') },
  { id: 'GNP', name: 'Добивание', desc: 'Победа ударами в партере', icon: '🔨', check: (c) => c.kos.some((k) => k.type === 'GROUND & POUND KO') },
  { id: 'FIRST_ROUND', name: 'Быстрый вечер', desc: 'Финиш в первом раунде', icon: '⚡', check: (c) => c.history.some((h) => h.res === 'W' && h.method !== 'DEC' && h.round === 1) },
  { id: 'COMEBACK', name: 'Возвращение', desc: 'Победа сразу после поражения', icon: '↩️', check: (c) => c.history.length >= 2 && c.history[0].res === 'W' && c.history[1].res === 'L' },
  { id: 'TITLE_SHOT', name: 'Титульный шанс', desc: 'Получите бой за пояс', icon: '🎟️', check: (c) => c.history.some((h) => h.title) },
  { id: 'CHAMPION', name: 'Чемпион', desc: 'Завоюйте пояс', icon: '🏆', check: (c) => (pr(c).titles || 0) >= 1 },
  { id: 'DEFEND', name: 'Защита титула', desc: 'Успешно защитите пояс', icon: '🛡️', check: (c) => (c.totalDefenses || 0) >= 1 },
  { id: 'P4P_1', name: 'P4P #1', desc: 'Станьте лучшим бойцом вне зависимости от веса', icon: '👑', check: (c) => c.bestP4P === 1 },
  { id: 'MULTI_DIV', name: 'Чемпион двух весов', desc: 'Выиграйте пояс во втором дивизионе', icon: '💎', check: (c) => (pr(c).divTitles || []).length >= 2 },
  { id: 'UNDEFEATED_10', name: 'Непобеждённый', desc: 'Рекорд 10–0 в лиге', icon: '🧊', check: (c) => pr(c).rec.w >= 10 && pr(c).rec.l === 0 },
  { id: 'MILLION', name: 'Миллионер', desc: 'Заработайте $1 000 000', icon: '💰', check: (c) => (c.earned || 0) >= 1000000 },
  { id: 'FAST_KO', name: 'Молния', desc: 'Нокаут за первые 30 секунд', icon: '⏱️', check: (c) => c.history.some((h) => h.res === 'W' && h.method !== 'DEC' && h.round === 1 && (parseInt((h.time || '9:99').split(':')[0], 10) === 0 && parseInt((h.time || '0:99').split(':')[1], 10) <= 30)) },
  { id: 'DEFEND_3', name: 'Три защиты', desc: 'Защитите пояс три раза', icon: '🛡️', check: (c) => (c.totalDefenses || 0) >= 3 },
  { id: 'GOAT_TOP10', name: 'В списке величайших', desc: 'Войдите в десятку GOAT', icon: '📜', check: (c) => goatRank(c) <= 10 },
  { id: 'RICH', name: 'Мои вещи', desc: 'Купите дом и машину', icon: '🏠', check: (c) => (c.items || []).some((i) => i.startsWith('ap') || i === 'house' || i === 'villa') && (c.items || []).some((i) => ['suv', 'sport', 'super'].includes(i)) },
  { id: 'PPV_STAR', name: 'Звезда PPV', desc: 'Соберите 1 000 000 покупок PPV', icon: '📺', check: (c) => (c.ppvTotal || 0) >= 1000000 },
  { id: 'GOAT', name: 'GOAT', desc: 'Станьте №1 в списке величайших', icon: '🐐', check: (c) => goatRank(c) === 1 },
];
UFC.ACHIEVEMENTS = ACH;

const pr = (c) => c.league.fighters.player;

// place among all fighters in history (legends and active), not a fixed bar
function goatRank(c) { return LG().goatPos(c.league, 'player') || 999; }

// ---------------------------------------------------------------- saves
const validCareer = (c) => !!(c && typeof c === 'object' && c.league && c.league.fighters && c.league.fighters.player && typeof c.league.fighters.player === 'object');
// the newest copy that is both intact (checksum) and a real career; falls back to the previous generation
function readSlot(slot) {
  const key = KEY(slot), cands = UFC.store.candidates(key);
  for (let i = 0; i < cands.length; i++) {
    if (!validCareer(cands[i].value)) continue;
    const c = cands[i].value;
    if (i > 0 || cands[i].src === 'bak') { UFC.store.healed.push(key); UFC.store.set(key, c); c.restored = true; }
    else if (cands[i].legacy) UFC.store.set(key, c);
    return c;
  }
  return null;
}
function summary(slot) {
  const c = readSlot(slot);
  if (!c) return { slot, empty: true, corrupt: UFC.store.exists(KEY(slot)) };
  const f = c.league.fighters.player;
  const rk = LG().rankOf(c.league, 'player');
  return {
    slot, empty: false, name: f.name, nick: f.nick, rec: f.rec, div: rk.div, rank: rk.rank, belts: f.divTitles || [],
    tierName: LG().tierOf(c.league).name, week: c.league.week, date: LG().dateLabel(c.league.week), updatedAt: c.updatedAt, money: c.money, p4p: LG().p4pPos(c.league, 'player'), restored: !!c.restored,
  };
}
function list() { const out = []; for (let s = 1; s <= SLOTS; s++) out.push(summary(s)); return out; }

function save(c) {
  c.updatedAt = Date.now(); c.rev = (c.rev || 0) + 1;
  const ok = UFC.store.set(KEY(c.slot), c);
  c.persisted = ok;
  return ok;
}

function load(slot) {
  const c = readSlot(slot);
  if (!c) return null;
  if (c.slot == null) c.slot = slot;
  // forward-compatible defaults
  syncTier(c);
  { const pl = c.league && c.league.fighters && c.league.fighters.player; if (pl && pl.stats && pl.stats.heavy == null) pl.stats.heavy = 6; if (pl && pl.stats && pl.stats.hp == null) pl.stats.hp = 100; if (pl && pl.stats && pl.stats.power > 99) pl.stats.power = 99; }
  c.history = c.history || []; c.kos = c.kos || []; c.achievements = c.achievements || {};
  c.health = c.health || { head: 100, body: 100, legs: 100, injuryWeeks: 0 };
  c.offers = c.offers || []; c.stage = c.stage || 'hub'; c.gly = c.gly || 75; c.acid = c.acid || 100;
  LG().migrateLegacy(c.league);
  if (c.stage === 'hub' && !c.booked && !c.offers.length) c.offers = makeOffers(c);
  return c;
}

function remove(slot) {
  const c = readSlot(slot);
  if (c && c.kos) for (const k of c.kos) UFC.store.remove(REPLAY_KEY(slot, k.id));
  if (c && c.losses) for (const k of c.losses) UFC.store.remove(REPLAY_KEY(slot, k.id));
  UFC.store.remove(KEY(slot));
}

// spec: { name, nick, flag, div, height, weight, reach, stance, style, stats?, look, build, body, difficulty, roundLen }
function create(slot, spec) {
  remove(slot);
  const L = LG().create(2026 + slot * 17, spec.tier || 'cw');
  const div = spec.div || 'lw';
  const style = spec.style || 'boxer';
  // Prospect out of the regional scene: 45 OVR, everything to earn.
  const base = { power: 57, speed: 57, chin: 58, cardio: 58, defense: 55, boxing: 57, kicks: 55, wrestling: 50, bjj: 48, heavy: 6, hp: 100 };
  const styleBonus = {
    boxer: { boxing: 7, speed: 6, defense: 5 }, kickboxer: { kicks: 8, speed: 5, boxing: 5 }, wrestler: { wrestling: 8, cardio: 6, power: 5 },
    brawler: { power: 8, chin: 6, boxing: 5 }, grappler: { bjj: 8, wrestling: 6, cardio: 5 },
  }[style] || { power: 3, speed: 3, cardio: 3, defense: 3 };
  const stats = Object.assign({}, base);
  for (const k in styleBonus) stats[k] += styleBonus[k];
  const player = {
    id: 'player', name: spec.name || 'Новичок', short: (spec.name || 'Новичок').split(' ').slice(-1)[0], nick: spec.nick || 'Новичок', flag: spec.flag || 'RU', div,
    height: spec.height || 1.78, weight: UFC.divById(div).kg, reach: spec.reach || (spec.height || 1.78) * 1.03, build: spec.build == null ? 0.78 : spec.build,
    body: spec.body || null, stance: spec.stance || 'orthodox', style: style === 'grappler' ? 'wrestler' : style, styleKey: style, stats,
    look: spec.look, age: spec.age || 24, startAge: spec.age || 24, original: true, player: true,
    rec: { w: 0, l: 0, d: 0, ko: 0, sub: 0 }, rating: 1180, streak: 0, defenses: 0, titles: 0, history: [], lastFightWeek: -99,
  };
  L.fighters.player = player;
  L.divs[div].pool.unshift('player');
  const c = {
    v: SAVE_VERSION, slot, createdAt: Date.now(), updatedAt: Date.now(),
    hype: 8, hypeLog: [], ppvTotal: 0, items: [], supplementsUsed: [], weight: { walking: UFC.divById(div).kg + 7, cut: null, food: null },
    retired: false, legacy: null, interviews: [], callout: null, gly: 75, acid: 100,
    difficulty: spec.difficulty == null ? 1 : spec.difficulty, roundLen: spec.roundLen || 45, rl45: true,
    league: L, money: 5000, earned: 0, gym: 0,
    health: { head: 100, body: 100, legs: 100, injuryWeeks: 0 },
    stage: 'hub', offers: [], booked: null, history: [], kos: [], achievements: {},
    bestStreak: 0, bestRank: null, bestP4P: null, totalDefenses: 0, news: [], lastSummary: null,
  };
  c.offers = makeOffers(c);
  save(c);
  return c;
}

// ---------------------------------------------------------------- matchmaking
function syncTier(c) { const T = LG().tierOf(c.league); UFC.curTierPurse = T.purse; return T; }
function purseFor(rank, title) {
  const k = UFC.curTierPurse == null ? 1 : UFC.curTierPurse;
  if (title) return Math.round(250000 * k);
  if (rank == null) return Math.round(12000 * k);
  return Math.round((20000 + (16 - rank) * 5000) * k);
}

function makeOffers(c) {
  syncTier(c);
  const L = c.league, me = pr(c);
  const rk = LG().rankOf(L, 'player');
  const div = rk.div || me.div;
  const D = L.divs[div];
  const r = UFC.rngFrom(L.seed * 7 + L.week * 131 + me.rec.w * 17 + me.rec.l * 5);
  const avail = (id) => id && id !== 'player' && L.fighters[id] && L.week - (L.fighters[id].lastFightWeek || -99) >= 4;
  const offers = [];
  const add = (opp, kind, title, extra) => {
    if (!opp || offers.some((o) => o.opp === opp)) return;
    const ork = LG().rankOf(L, opp);
    const top = Math.min(rk.rank == null ? 16 : rk.rank, ork.rank == null ? 16 : ork.rank);
    offers.push(Object.assign({ opp, kind, title: !!title, div, rounds: 5, oppRank: ork.rank, purse: purseFor(top >= 16 ? null : top, title) }, extra || {}));
  };
  const ranked = D.ranked;
  if (rk.rank === 0) {
    // champion: defences, and after a defence a super-fight for another belt
    ranked.slice(0, 4).filter(avail).slice(0, 2).forEach((id) => add(id, 'defense', true));
    const di = UFC.DIVISIONS.findIndex((d) => d.id === div);
    for (const nd of [UFC.DIVISIONS[di + 1], UFC.DIVISIONS[di - 1]]) {
      if (!nd || nd.heavy || (me.defenses || 0) < 1 || (me.divTitles || []).includes(nd.id)) continue;
      const champ = L.divs[nd.id].champ;
      if (avail(champ)) { add(champ, 'superfight', true, { div: nd.id }); break; }
    }
  } else if (rk.rank == null) {
    const pool = D.pool.filter(avail);
    for (let i = 0; i < 2 && pool.length; i++) add(pool.splice(r.int(0, pool.length - 1), 1)[0], 'prospect', false);
    if (me.rec.w >= 1 || me.streak >= 1) { const low = ranked.slice(7, 15).filter(avail); if (low.length) add(r.pick(low), 'stepup', false); }
  } else {
    const k = rk.rank;
    const higher = ranked.slice(Math.max(0, k - 9), k - 1).filter(avail);
    const lower = ranked.slice(k, Math.min(15, k + 3)).filter(avail);
    if (higher.length) add(r.pick(higher), 'stepup', false);
    if (lower.length) add(r.pick(lower), 'safe', false);
    if (k <= 7 && k > 1 && ranked.slice(0, 5).filter(avail).length) add(ranked.slice(0, 5).filter((x) => avail(x) && !offers.some((o) => o.opp === x))[0], 'eliminator', false);
    // an interim champion fights the real one as soon as the champion is free
    if (D.interim === 'player' && avail(D.champ)) add(D.champ, 'title', true, { unify: true });
    // title shot: #1, or top-3 on a real run
    const shotScore = (k <= 3 ? (4 - k) * 12 : 0) + Math.max(0, me.streak) * 9 + (c.hype || 0) * 0.35 + (me.rec.ko + me.rec.sub) * 1.5 + (c.callout === D.champ ? 12 : 0);
    if ((k <= 3 || (k <= 7 && shotScore >= 24)) && avail(D.champ)) add(D.champ, 'title', true);
    // the interim belt: an easier fight between two contenders while the champion is busy (not for the champion himself)
    if (!offers.some((o) => o.title) && k >= 3 && k <= 8 && !D.interim && me.rec.w >= 3) {
      const cands = ranked.slice(0, Math.min(4, k - 1)).filter(avail);
      if (cands.length) add(r.pick(cands), 'interim', true, { interim: true });
    }
    if (!offers.length) { const any = ranked.filter(avail); if (any.length) add(r.pick(any), 'stepup', false); }
  }
  // a legend of the sport wants to test the best of the new generation
  if (LG().tierOf(L).id === 'ufc' && me.rec.w >= 6 && rk.rank != null && rk.rank <= 4 && (c.legendFights || 0) < 8) {
    const legs = L.legends.filter((id) => avail(id) && L.fighters[id].legendOffer !== false && !offers.some((o) => o.opp === id));
    const mine = legs.filter((id) => L.fighters[id].div === div), pool2 = mine.length ? mine : legs;
    if (pool2.length && r.chance(0.55)) add(r.pick(pool2), 'legend', false, { div });
  }
  // a gorilla: huge power and health, a fight for the brave (the boss only for the champion with two defences behind him)
  if (LG().tierOf(L).id === 'ufc' && L.gorillas && me.rec.w >= 5 && rk.rank != null && rk.rank <= 8 && (c.gorillaFights || 0) < 8) {
    const gs = L.gorillas.filter((id) => avail(id) && !offers.some((o) => o.opp === id) && (L.fighters[id].boss ? rk.rank === 0 && (me.defenses || 0) >= 2 : true));
    if (gs.length && r.chance(0.45)) add(r.pick(gs), 'gorilla', false, { div });
  }
  // a heavyweight: someone from the top-15 of the 120 kg division wants to find out whether a smaller man can hurt a giant
  if (LG().tierOf(L).id === 'ufc' && L.divs.hw && div !== 'hw' && me.rec.w >= 2 && (c.heavyFights || 0) < 40) {
    const H = L.divs.hw, order = [H.champ].concat(H.ranked).filter(Boolean);
    const strong = rk.rank != null && rk.rank <= 5;
    const cand = (strong ? order.slice(0, 8) : order.slice(5)).filter((id) => avail(id) && !offers.some((o) => o.opp === id));
    if (cand.length && r.chance(strong ? 0.7 : 0.55)) add(r.pick(cand), 'heavy', false, { div });
  }
  if (!offers.length) { const any = D.pool.filter(avail); if (any.length) add(r.pick(any), 'prospect', false); }
  return offers;
}

const OFFER_LABEL = { heavy: 'БОЙ С ТЯЖЕЛОВЕСОМ', gorilla: 'БОЙ С ГОРИЛЛОЙ', interim: 'ВРЕМЕННЫЙ ПОЯС', legend: 'БОЙ С ЛЕГЕНДОЙ', prospect: 'Бой с проспектом', stepup: 'Шаг наверх', safe: 'Надёжный бой', eliminator: 'Отборочный за титул', title: 'БОЙ ЗА ТИТУЛ', defense: 'ЗАЩИТА ТИТУЛА', superfight: 'СУПЕРБОЙ ЗА ВТОРОЙ ПОЯС' };

function book(c, idx, opts = {}) {
  syncTier(c);
  const o = c.offers[idx];
  if (!o) throw new Error('Предложение не найдено');
  const short = !!opts.shortNotice;
  c.booked = Object.assign({}, o, {
    campWeeks: short ? 2 : 12, shortNotice: short, focus: null, intensity: null, prep: short ? 0.94 : 1, injured: false, oppLook: null,
    elite: false, card: null, cut: null, food: null, weighIn: null,
  });
  c.booked.card = buildCard(c, o);
  c.booked.purse = purseBand(LG().rankOf(c.league, 'player').rank, o.title, o.kind === 'defense', o.kind === 'superfight' || o.kind === 'legend' || o.kind === 'gorilla', c.hype);
  if (o.interim) c.booked.purse = Math.round(c.booked.purse * 0.6 / 1000) * 1000;
  c.offers = [];
  c.stage = 'camp';
  save(c);
  return c.booked;
}

// Declining an offer is allowed; the league moves on a couple of weeks.
function declineOffer(c, idx) {
  const o = c.offers[idx];
  if (o) c.declined = (c.declined || 0) + 1;
  LG().advance(c.league, 2, ['player']);
  HYPE.decay(c, 2);
  c.offers = makeOffers(c);
  save(c);
  return c.offers;
}

function buyElite(c) {
  const b = c.booked;
  if (!b) throw new Error('Нет запланированного боя');
  if (b.elite) throw new Error('Элитный кемп уже оплачен');
  if (c.money < ELITE_CAMP_COST) throw new Error('Недостаточно денег');
  c.money -= ELITE_CAMP_COST;
  b.elite = true;
  save(c);
}

function buySupplement(c, id) {
  const s = SUPPLEMENTS.find((x) => x.id === id);
  if (!s) throw new Error('Добавка не найдена');
  if (c.money < s.cost) throw new Error('Недостаточно денег');
  if ((c.supplementsUsed || []).filter((x) => x.week === c.league.week).length >= 2) throw new Error('В этом лагере уже куплено две добавки');
  c.money -= s.cost;
  const me = pr(c);
  me.stats[s.stat] = Math.min(Math.max(99, me.stats[s.stat] || 0), Math.round(((me.stats[s.stat] || 0) + s.gain) * 10) / 10);
  c.supplementsUsed = [{ id, week: c.league.week }].concat(c.supplementsUsed || []).slice(0, 30);
  save(c);
  return s;
}

// permanent fuel upgrades: glycogen (how long his tank lasts) and lactic-acid tolerance
const FUEL = {
  gly: [{ lv: 100, cost: 10000, name: 'Углеводная загрузка' }, { lv: 125, cost: 30000, name: 'Диета спортивного нутрициолога' }, { lv: 150, cost: 80000, name: 'Личный нутрициолог и лаборатория' }, { lv: 200, cost: 250000, name: 'Протокол сверхкомпенсации' }, { lv: 250, cost: 900000, name: 'Жёсткий рацион: электролиты и углеводы' }],
  acid: [{ lv: 125, cost: 12000, name: 'Бета-аланин' }, { lv: 150, cost: 40000, name: 'Бикарбонат' }, { lv: 200, cost: 150000, name: 'Щелочной протокол' }, { lv: 250, cost: 600000, name: 'Лаборатория буферов' }],
};
function buyFuel(c, kind) {
  const list = FUEL[kind]; if (!list) throw new Error('Неизвестный показатель');
  const cur = c[kind] || (kind === 'gly' ? 75 : 100), next = list.find((x) => x.lv > cur);
  if (!next) throw new Error('Уже максимум');
  if (c.money < next.cost) throw new Error('Недостаточно денег');
  c.money -= next.cost; c[kind] = next.lv; save(c);
  return next;
}

function buyItem(c, id) {
  const it = ITEMS.find((x) => x.id === id);
  if (!it) throw new Error('Предмет не найден');
  if ((c.items || []).includes(id)) throw new Error('Уже куплено');
  if (c.money < it.cost) throw new Error('Недостаточно денег');
  c.money -= it.cost;
  c.items = (c.items || []).concat(id);
  HYPE.add(c, it.hype, 'Покупка: ' + it.name);
  save(c);
  return it;
}

// Weight cut chosen before the weigh-in; the food after it gives strength back.
function doWeightCut(c, cutId, foodId) {
  const b = c.booked;
  if (!b) throw new Error('Нет запланированного боя');
  const cut = CUTS.find((x) => x.id === cutId) || CUTS[1];
  const food = FOODS.find((x) => x.id === foodId) || FOODS[0];
  if (c.money >= food.cost) c.money -= food.cost;
  const limit = UFC.divById(b.div).kg;
  const r = UFC.rngFrom(c.league.week * 13 + c.history.length * 5);
  const missed = r() < cut.risk * 0.5;
  b.cut = cut.id; b.food = food.id; b.glyBonus = food.gly || 0; b.acidBonus = food.acid || 0;
  b.weighIn = Math.round((limit + cut.over + (missed ? r.range(0.3, 0.9) : 0)) * 10) / 10;
  b.missedWeight = missed;
  // a hard cut costs a little cardio/power that the food gives back
  const drain = cut.penalty * (1 - food.recover * 0.8);
  b.prep = M.clamp((b.prep || 1) * (1 - drain) + (b.elite ? 0.06 : 0), 0.7, 1.12);
  if (missed) { const fine = Math.round(b.purse * 0.2); c.money -= fine; b.fine = fine; HYPE.add(c, -3, 'Не уложился в вес'); }
  c.stage = 'fightweek';
  save(c);
  return { cut, food, weighIn: b.weighIn, missed, prep: b.prep, fine: b.fine || 0 };
}

function interview(c, choice) {
  const opts = INTERVIEWS.find((x) => x.id === choice) || INTERVIEWS[0];
  HYPE.add(c, opts.hype, 'Интервью: ' + opts.name);
  c.interviews = [{ week: c.league.week, id: opts.id, text: opts.text }].concat(c.interviews || []).slice(0, 10);
  if (opts.callout) {
    const L = c.league, D = L.divs[pr(c).div];
    const target = D.champ !== 'player' ? D.champ : D.ranked[0];
    c.callout = target;
    HYPE.add(c, 4, 'Вызов: ' + (L.fighters[target] ? L.fighters[target].short : ''));
  }
  save(c);
  return opts;
}

const INTERVIEWS = [
  { id: 'respect', name: 'С уважением', hype: 2, text: 'Спасибо сопернику за бой. Это тяжёлый спорт, и мы оба здесь, чтобы показывать характер.' },
  { id: 'confident', name: 'Уверенно', hype: 5, text: 'Я знал, что выиграю этот бой. Я работаю каждый день и я ещё даже близко не в лучшей форме.' },
  { id: 'callout', name: 'Вызов', hype: 8, callout: true, text: 'Хватит разговоров. Я хочу пояс. Дайте мне чемпиона — и я заберу этот титул.' },
  { id: 'family', name: 'О своём пути', hype: 4, text: 'Этот бой — для моей семьи и моей команды. Мы прошли долгий путь, и это только начало.' },
];

// Moving between weight classes: the ranking of the new division decides where
// you start, so a champion keeps status and a prospect starts over.
function switchDivision(c, div) {
  if (c.stage !== 'hub') throw new Error('Сменить дивизион можно только между боями');
  const L = c.league, me = pr(c);
  if (me.div === div) throw new Error('Вы уже в этом дивизионе');
  if (UFC.divById(div).heavy) throw new Error('В тяжёлый вес перейти нельзя: с тяжеловесами можно только драться');
  const oldRank = LG().rankOf(L, 'player').rank;
  for (const d of UFC.DIVISIONS) {
    const D = L.divs[d.id];
    if (!D) continue;
    const i = D.ranked.indexOf('player'); if (i >= 0) D.ranked.splice(i, 1);
    const j = D.pool.indexOf('player'); if (j >= 0) D.pool.splice(j, 1);
  }
  me.div = div;
  me.weight = UFC.divById(div).kg;
  c.weight = { walking: UFC.divById(div).kg + 7, cut: null, food: null };
  if (oldRank != null && oldRank <= 5) LG().placeRanked(L, div, 'player', Math.min(11, 8));
  else if (oldRank != null && oldRank <= 15) LG().placeRanked(L, div, 'player', 14);
  else L.divs[div].pool.unshift('player');
  c.offers = makeOffers(c);
  HYPE.add(c, 3, 'Переход в дивизион ' + UFC.divById(div).name);
  save(c);
  return LG().rankOf(L, 'player');
}

// Retirement: stop the career and build the legacy page.
function retire(c) {
  const L = c.league, me = pr(c);
  const wins = c.history.filter((h) => h.res === 'W');
  const byYear = {};
  for (const h of c.history) { const y = Math.floor(h.week / 52); byYear[y] = byYear[y] || { w: 0, l: 0 }; byYear[y][h.res === 'W' ? 'w' : 'l']++; }
  let primeY = null, best = -1;
  for (const y in byYear) { const s = byYear[y].w * 2 - byYear[y].l; if (s > best) { best = s; primeY = +y; } }
  let streak = 0, bestStreak = 0;
  for (const h of c.history.slice().reverse()) { if (h.res === 'W') { streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0; }
  const bigWins = wins.filter((h) => h.title || (h.oppRank != null && h.oppRank <= 5)).slice(0, 6);
  c.legacy = {
    name: me.name, nick: me.nick, rec: me.rec, titles: me.titles || 0, defenses: c.totalDefenses || 0,
    divTitles: me.divTitles || [], bestRank: c.bestRank, bestP4P: c.bestP4P, goat: goatRank(c), goatScore: LG().goatScore(me, c.league),
    primeYear: primeY == null ? null : 2026 + primeY, primeRecord: primeY == null ? null : byYear[primeY], bestStreak,
    fights: c.history.length, ko: me.rec.ko, sub: me.rec.sub, money: c.earned, hype: c.hype,
    bigWins: bigWins.map((h) => ({ opp: h.oppName, method: h.method, round: h.round, title: h.title, date: h.date })),
    stats: Object.assign({}, me.stats), ovr: LG().overallOf(me), years: Math.max(1, Math.round(c.league.week / 52)), age: me.age,
  };
  c.retired = true;
  c.stage = 'retired';
  save(c);
  return c.legacy;
}

function cancelBooking(c) {
  c.booked = null; c.stage = 'hub'; c.offers = makeOffers(c); save(c);
}

// ---------------------------------------------------------------- camp
function runCamp(c, focusId, intensityId) {
  const b = c.booked;
  if (!b) throw new Error('Нет запланированного боя');
  const focus = CAMP_FOCUS.find((x) => x.id === focusId) || CAMP_FOCUS[7];
  const inten = INTENSITY.find((x) => x.id === intensityId) || INTENSITY[1];
  const me = pr(c);
  const homeBonus = (c.items || []).reduce((s, id) => s + ((ITEMS.find((x) => x.id === id) || {}).camp || 0), 0);
  const gymMul = 1 + c.gym * 0.18 + homeBonus + (b.elite ? 0.12 : 0);
  const ageMul = me.age > 33 ? Math.max(0.3, 1 - (me.age - 33) * 0.15) : 1;
  const gains = {};
  for (const k in focus.gains) {
    const cur = me.stats[k];
    const capK = focus.caps && focus.caps[k] != null ? focus.caps[k] : (focus.capStat === k ? focus.cap : (k === 'heavy' ? 50 : k === 'hp' ? 220 : 99));
    const g = focus.flat ? focus.flat * inten.mul * M.rand(0.85, 1.2) : focus.gains[k] * inten.mul * gymMul * ageMul * M.clamp((capK - (cur || 0)) / 34, 0.2, 1.5) * 1.5;   // flat: a fixed number of kilograms
    const add = Math.round(g * 10) / 10;
    me.stats[k] = Math.min(Math.max(capK, cur || 0), Math.round(((cur || 0) + add) * 10) / 10);
    gains[k] = add;
  }
  const r = UFC.rngFrom(c.league.week * 97 + c.slot * 13 + Math.floor(me.stats.power * 7));
  const injured = r() < (focus.fixedRisk != null ? focus.fixedRisk : inten.risk + (focus.risk || 0));
  if (focus.fuel) { c.gly = Math.min(250, (c.gly || 75) + focus.fuel.gly); c.acid = Math.min(250, (c.acid || 100) + focus.fuel.acid); }
  c.lastFocus = Object.keys(focus.gains)[0];
  b.technique = focus.technique || null;   // the technique is equipped for this fight
  b.focus = focus.id; b.intensity = inten.id;
  b.prep = inten.prep * (injured ? (focus.fixedRisk != null ? 0.78 : 0.85) : 1) * (b.shortNotice ? 0.94 : 1);
  b.injured = injured;
  // the league lives on while you train
  // monthly automatic training while the camp runs
  const months = Math.max(1, Math.round(b.campWeeks / 4));
  const autoCost = 350 * months;
  if (c.money >= autoCost) { c.money -= autoCost; const fk = Object.keys(focus.gains)[0]; me.stats[fk] = Math.min(Math.max(fk === 'heavy' ? 50 : fk === 'hp' ? 220 : 99, me.stats[fk] || 0), Math.round(((me.stats[fk] || 0) + months * 0.5) * 10) / 10); gains[fk] = (gains[fk] || 0) + months * 0.5; }
  HYPE.decay(c, b.campWeeks);
  const news = LG().advance(c.league, b.campWeeks, ['player', b.opp]);
  me.lastFightWeek = me.lastFightWeek || -99;
  c.news = news.slice(-12);
  c.stage = 'weightcut';
  simulateCard(c);
  // the booked opponent may have lost his rank meanwhile: refresh label
  b.oppRank = LG().rankOf(c.league, b.opp).rank;
  save(c);
  return { gains, injured, news, focus, inten };
}

// ---------------------------------------------------------------- fight setup
function fighterCfgs(c) {
  const b = c.booked, L = c.league;
  const me = pr(c), opp = L.fighters[b.opp];
  const pc = LG().toCfg(me);
  pc.name = me.name; pc.short = me.short;
  if (pc.stats && pc.stats.power > 99) pc.stats = Object.assign({}, pc.stats, { power: 99 });   // power never goes past 99
  if (b.div !== me.div) pc.weight = UFC.divById(b.div).kg;
  let oc = LG().toCfg(opp);
  if (LG().tierOf(L).id === 'ufc') oc = UFC.eliteBuff(oc, LG().rankOf(L, opp.id).rank, opp);
  if (b.oppLook) oc.look = Object.assign({}, oc.look, b.oppLook);
  if (b.technique) pc.technique = b.technique;
  return { player: pc, opponent: oc, rounds: b.rounds, title: b.title, interim: !!b.interim, div: b.div, prep: b.prep, health: c.health, difficulty: c.difficulty, roundLen: c.roundLen };
}

// ---------------------------------------------------------------- results
const KO_TYPES = { spinKick: 'SPINNING BACK KICK KO', spinKickHead: 'SPINNING HEAD KICK KO', layback: 'COUNTER LEFT KO', face: 'BROKEN FACE TKO', headKick: 'HEAD KICK KO', bodyKick: 'BODY KICK KO', lowKick: 'LEG KICK TKO', uppercut: 'UPPERCUT KO', body: 'BODY SHOT KO', liver: 'BODY SHOT KO', gnp: 'GROUND & POUND KO', knee: 'KNEE KO', elbow: 'ELBOW KO', referee: 'TKO (STRIKES)' };
UFC.koTypeOf = (detail, stanceSign) => {
  if (!detail) return 'KO';
  if (KO_TYPES[detail.type]) return KO_TYPES[detail.type];
  if (detail.type === 'straight') {
    if (detail.lead) return 'JAB KO';
    return (stanceSign === -1 ? 'LEFT' : 'RIGHT') + ' HAND KO';
  }
  if (detail.type === 'hook') {
    const left = detail.lead ? stanceSign !== -1 : stanceSign === -1;
    return (left ? 'LEFT' : 'RIGHT') + ' HOOK KO';
  }
  return 'KO';
};

// outcome: { won, draw, method, round, time, detail, stats:{p,o}, damage:{head,body,legs}, thumb, replay }
function recordFight(c, outcome) {
  const b = c.booked;
  if (!b) throw new Error('Бой не был запланирован');
  const L = c.league, me = pr(c), opp = L.fighters[b.opp];
  const before = { rank: LG().rankOf(L, 'player'), p4p: LG().p4pPos(L, 'player'), goat: LG().goatPos(L, 'player'), money: c.money };
  const method = outcome.draw ? 'DRAW' : outcome.method;
  const res = outcome.draw ? { winner: 'player', loser: b.opp } : outcome.won ? { winner: 'player', loser: b.opp } : { winner: b.opp, loser: 'player' };
  const wasChampOfDiv = L.divs[b.div].champ === 'player';
  // a super-fight moves the player into the new division's rankings for this fight
  if (b.div !== me.div && outcome.won) {
    // keep the old belt in memory; the new division becomes home
    me.div = b.div;
  }
  const move = LG().applyResult(L, Object.assign(res, { method, title: b.title && !b.interim, week: L.week, round: outcome.round, time: outcome.time, div: b.div, detail: outcome.koType || '' }));
  if (outcome.draw) { me.streak = 0; }
  if (outcome.won && b.interim) { L.divs[b.div].interim = 'player'; me.interimDiv = b.div; me.interimWeek = L.week; }
  if (outcome.won && b.title && !b.interim && L.divs[b.div].champ === 'player') { L.divs[b.div].interim = null; me.interimDiv = null; }   // the two belts become one
  if (b.title && outcome.won && wasChampOfDiv) c.totalDefenses = (c.totalDefenses || 0) + 1;

  // money: purse + win bonus + finish bonus + PPV share for a main event star
  const purse = b.purse;
  const winBonus = outcome.won ? purse : 0;
  const perf = outcome.won && method !== 'DEC' ? (b.title ? 100000 : 50000) : 0;
  const mainEvent = b.card && b.card.slot === 'main';
  const ppv = ppvFor(c, b.title, mainEvent);
  const ppvMoney = ppv ? ppv.money : 0;
  if (ppv) { c.ppvTotal = (c.ppvTotal || 0) + ppv.buys; b.ppv = ppv; }
  const earned = purse + winBonus + perf + ppvMoney;
  c.money += earned; c.earned = (c.earned || 0) + earned;
  // hype: finishes and big wins sell the next fight
  if (outcome.won && opp.gorilla) { c.gorillaFights = (c.gorillaFights || 0) + 1; me.legacy = (me.legacy || 0) + 2; HYPE.add(c, 15, 'Победа над гориллой'); }
  if (outcome.won && opp.div === 'hw' && me.div !== 'hw') { c.heavyFights = (c.heavyFights || 0) + 1; me.legacy = (me.legacy || 0) + 2; HYPE.add(c, 10, 'Победа над тяжеловесом'); }
  if (outcome.won && opp.legend) { c.legendFights = (c.legendFights || 0) + 1; me.legacy = (me.legacy || 0) + 3; HYPE.add(c, 12, 'Победа над легендой'); }
  if (outcome.won) {
    HYPE.add(c, (method === 'KO' ? 9 : method === 'TKO' ? 7 : method === 'SUB' ? 7 : 4) + (b.title ? 12 : 0) + (b.oppRank != null && b.oppRank <= 5 ? 5 : 0) + (outcome.round === 1 ? 3 : 0), 'Победа: ' + (UFC.METHOD_NAMES[method] || method));
  } else if (!outcome.draw) HYPE.add(c, -6, 'Поражение');
  c.callout = null;

  // health and recovery: damage carries into weeks off
  const dmg = outcome.damage || { head: 20, body: 15, legs: 10 };
  const hurt = Math.max(100 - dmg.head, (100 - dmg.body) * 0.8, (100 - dmg.legs) * 0.6);
  const lostByKO = !outcome.won && !outcome.draw && (method === 'KO' || method === 'TKO');
  c.health = { head: Math.round(dmg.head), body: Math.round(dmg.body), legs: Math.round(dmg.legs), injuryWeeks: Math.min(52, Math.max(Math.round(3 + hurt / 9 + (lostByKO ? 6 : 0)), outcome.medWeeks || 0)) };
  c.stage = 'recovery';

  const after = { rank: LG().rankOf(L, 'player'), p4p: LG().p4pPos(L, 'player'), goat: LG().goatPos(L, 'player') };
  me.age = (me.startAge || 24) + Math.floor(L.week / 52);
  if (me.streak > (c.bestStreak || 0)) c.bestStreak = me.streak;
  if (after.rank.rank != null && (c.bestRank == null || after.rank.rank < c.bestRank)) c.bestRank = after.rank.rank === 0 ? 0 : after.rank.rank;
  if (after.rank.rank === 0) c.bestRank = 0;
  if (after.p4p && (c.bestP4P == null || after.p4p < c.bestP4P)) c.bestP4P = after.p4p;
  if (after.p4p && (!me.bestP4P || after.p4p < me.bestP4P)) me.bestP4P = after.p4p;

  const entry = {
    n: c.history.length + 1, week: L.week, date: LG().dateLabel(L.week), opp: b.opp, oppName: opp.name, oppRank: b.oppRank,
    res: outcome.draw ? 'D' : outcome.won ? 'W' : 'L', method, detail: outcome.koType || '', methodText: outcome.methodText || '', round: outcome.round, time: outcome.time, title: b.title, div: b.div,
    kd: [outcome.stats.p.kd || 0, outcome.stats.o.kd || 0], td: [outcome.stats.p.td || 0, outcome.stats.o.td || 0],
    sig: [outcome.stats.p.sigLanded || 0, outcome.stats.o.sigLanded || 0], landed: [outcome.stats.p.landed || 0, outcome.stats.o.landed || 0],
    subs: outcome.won && method === 'SUB' ? 1 : 0, damage: Math.round(300 - dmg.head - dmg.body - dmg.legs),
    rankBefore: before.rank.rank, rankAfter: after.rank.rank, p4pBefore: before.p4p, p4pAfter: after.p4p, purse: earned,
  };
  c.history.unshift(entry);

  // knockout collection
  let ko = null;
  if (outcome.won && (method === 'KO' || method === 'TKO')) {
    ko = { id: 'k' + Date.now().toString(36), week: L.week, date: entry.date, opp: b.opp, oppName: opp.name, method, round: outcome.round, time: outcome.time, type: outcome.koType || (method + ''), title: b.title, thumb: outcome.thumb || null, hasReplay: false };
    if (outcome.replay) {
      const ok = UFC.store.set(REPLAY_KEY(c.slot, ko.id), outcome.replay);
      ko.hasReplay = ok || !UFC.store.persistent;
      if (!ok && UFC.store.persistent) {
        // storage full: drop the oldest replays and retry once
        const old = c.kos.filter((k) => k.hasReplay).slice(-3);
        for (const k of old) { UFC.store.remove(REPLAY_KEY(c.slot, k.id)); k.hasReplay = false; }
        ko.hasReplay = UFC.store.set(REPLAY_KEY(c.slot, ko.id), outcome.replay);
      }
    }
    // how important the knockout is: a belt, a champion or a top-five name, knockdowns on the way, a spectacular finish, a late dramatic stoppage
    ko.score = Math.round((b.title ? 40 : 0) + (b.oppRank === 0 ? 30 : b.oppRank != null ? Math.max(0, 16 - b.oppRank) * 2.2 : 0) + ((outcome.stats.p.kd || 0) * 3) + (/HEAD KICK|SPIN|UPPERCUT|SUPERMAN/.test(ko.type) ? 10 : 0) + (outcome.round >= 3 ? 8 : outcome.round === 1 ? 4 : 0));
    c.kos.unshift(ko);
    c.kos.forEach((k, i) => { if (i >= 12 && k.hasReplay) { UFC.store.remove(REPLAY_KEY(c.slot, k.id)); k.hasReplay = false; } });
    c.kos.filter((k) => k.hasReplay).sort((x, y) => (y.score || (y.title ? 40 : 0)) - (x.score || (x.title ? 40 : 0))).slice(6).forEach((k) => { UFC.store.remove(REPLAY_KEY(c.slot, k.id)); k.hasReplay = false; });   // only the six best films are kept
  }

  // a knockout loss is kept too: the 'sad' film needs it
  if (!outcome.won && !outcome.draw && outcome.replay) {
    const lid = 'l' + Date.now().toString(36), lok = UFC.store.set(REPLAY_KEY(c.slot, lid), outcome.replay);
    c.losses = c.losses || [];
    c.losses.unshift({ id: lid, week: L.week, date: entry.date, opp: b.opp, oppName: opp.name, method, round: outcome.round, time: outcome.time, type: outcome.koType || method, hasReplay: lok || !UFC.store.persistent });
    while (c.losses.length > 3) { const o = c.losses.pop(); UFC.store.remove(REPLAY_KEY(c.slot, o.id)); }
  } else if (!outcome.won && !outcome.draw) {
    c.losses = c.losses || [];
    c.losses.unshift({ id: 'n' + Date.now().toString(36), week: L.week, date: entry.date, opp: b.opp, oppName: opp.name, method, round: outcome.round, time: outcome.time, type: method, hasReplay: false });
    c.losses.length = Math.min(c.losses.length, 6);
  }
  // belts: remember the last title fight per division; one not defended for ~30 weeks is vacated
  me.beltWeek = me.beltWeek || {};
  if (b.title && outcome.won) me.beltWeek[b.div] = L.week;
  for (const d of UFC.DIVISIONS) {
    if (d.id !== me.div && L.divs[d.id] && L.divs[d.id].champ === 'player' && !(b.title && b.div === d.id) && L.week - (me.beltWeek[d.id] || 0) > 30) {
      const D = L.divs[d.id];
      const next = D.ranked.shift();
      if (next) { D.champ = next; L.fighters[next].titles = (L.fighters[next].titles || 0) + 1; }
      entry.vacated = d.id;
    }
  }

  // fight experience: rounds in the cage lift everything a little
  {
    const xp = (outcome.won ? 0.75 : 0.5) * (1 + (outcome.round || 1) * 0.08) * 2.0;
    for (const k in me.stats) { if (k === 'heavy' || k === 'hp') continue; me.stats[k] = Math.min(Math.max(99, me.stats[k]), Math.round((me.stats[k] + xp * M.clamp((99 - me.stats[k]) / 40, 0.25, 1.4)) * 10) / 10); }
  }

  const unlocked = checkAchievements(c);
  const summaryObj = {
    won: outcome.won, draw: outcome.draw, method, methodText: outcome.methodText, title: b.title, interim: !!b.interim, titleWon: b.title && !b.interim && outcome.won, interimWon: !!(b.interim && outcome.won),
    before, after, earned, purse, winBonus, perf, unlocked, entry, ko, oppName: opp.name, div: b.div,
  };
  c.lastSummary = summaryObj;
  c.booked = null;
  save(c);
  return summaryObj;
}

// The UFC contract: the champion of a small league, or a hard finisher near the top of it
function ufcEligible(c) {
  if (LG().tierOf(c.league).id === 'ufc') return null;
  const me = pr(c), rk = LG().rankOf(c.league, 'player');
  if (rk.rank === 0) return 'champion';
  const last = (c.history || []).slice(0, 5), fin = last.filter((h) => h.res === 'W' && h.method !== 'DEC').length;
  if (me.rec.w >= 5 && (me.streak || 0) >= 4 && fin >= 2 && rk.rank != null && rk.rank <= 6) return 'tough';
  return null;
}
function signUFC(c) {
  const why = ufcEligible(c);
  if (!why) throw new Error('Контракт с UFC пока недоступен: нужно стать чемпионом лиги или жёстким бойцом в топ-5');
  const old = c.league, me = pr(c), minor = old.tier;
  const U = LG().create(old.seed + 4049, 'ufc');
  U.week = old.week;
  const pl = JSON.parse(JSON.stringify(me));
  pl.rating = M.clamp(me.rating || 1300, 1380, 1480); pl.streak = 0; pl.defenses = 0; pl.divTitles = []; pl.beat = {}; pl.champSince = null; pl.lastFightWeek = old.week - 8;
  U.fighters.player = pl;
  const D = U.divs[pl.div];
  D.pool = D.pool.filter((x) => x !== 'player'); D.pool.unshift('player');
  LG().placeRanked(U, pl.div, 'player', why === 'champion' ? 7 : 11);   // a champion of a small league enters around #8, a hard finisher around #12
  c.minor = { tier: minor, why, wins: me.rec.w, kos: me.rec.ko, titles: me.titles || 0 };
  c.league = U; c.bestRank = null; c.bestP4P = null;
  c.money += 150000;
  HYPE.add(c, 20, 'Контракт с UFC');
  c.stage = 'hub'; c.booked = null; c.news = [];
  syncTier(c);
  c.offers = makeOffers(c);
  save(c);
  return { why, tier: minor };
}

function checkAchievements(c) {
  const out = [];
  for (const a of ACH) {
    if (c.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.check(c); } catch (e) { ok = false; }
    if (ok) { c.achievements[a.id] = { week: c.league.week, date: LG().dateLabel(c.league.week) }; out.push(a); }
  }
  return out;
}

function recover(c) {
  const weeks = Math.max(2, c.health.injuryWeeks || 2);
  HYPE.decay(c, weeks);
  const me0 = pr(c);
  // automatic training between fights (a monthly retainer)
  const months = Math.round(weeks / 4);
  if (months > 0 && c.money >= 350 * months && c.lastFocus) {
    c.money -= 350 * months;
    me0.stats[c.lastFocus] = Math.min(Math.max(c.lastFocus === 'heavy' ? 50 : c.lastFocus === 'hp' ? 220 : 99, me0.stats[c.lastFocus] || 0), Math.round(((me0.stats[c.lastFocus] || 0) + months * 0.4) * 10) / 10);
  }
  const news = LG().advance(c.league, weeks, ['player']);
  c.news = news.slice(-12);
  c.health = { head: 100, body: 100, legs: 100, injuryWeeks: 0 };
  const me = pr(c);
  me.age = (me.startAge || 24) + Math.floor(c.league.week / 52);
  const aged = LG().ageStats(me);
  c.stage = 'hub';
  c.offers = makeOffers(c);
  // retirement comes with age and wear, but it is always the player's choice
  if (me0.age >= 38) c.canRetire = true;
  checkAchievements(c);
  save(c);
  return { weeks, news, aged };
}

function upgradeGym(c) {
  const next = c.gym + 1;
  if (next >= GYM_COST.length) throw new Error('Зал уже максимального уровня');
  if (c.money < GYM_COST[next]) throw new Error('Недостаточно денег');
  c.money -= GYM_COST[next]; c.gym = next; save(c);
}

// ---- backup codes: one slot (without replays) or everything
async function exportSlot(slot, full) {
  const keys = [KEY(slot)];
  if (full) for (const k of UFC.store.keys(KEY(slot) + '.ko.')) keys.push(k);
  return UFC.backup.make(keys);
}
async function exportAll() { return UFC.backup.make(null); }
// returns the list of slots that were written
async function importBackup(text, overwrite) {
  const o = await UFC.backup.read(text), out = [];
  const items = o.items, careers = Object.keys(items).filter((k) => /^ufc\.career\.\d+$/.test(k));
  if (!careers.length && !items['ufc.settings'] && !items['ufc.looks.v1']) throw new Error('В коде нет карьеры.');
  for (const k of careers) {
    const c = items[k];
    if (!validCareer(c)) throw new Error('Сохранение в коде повреждено.');
    let slot = +k.split('.')[2];
    if (readSlot(slot) && !overwrite) {
      let free = 0; for (let s2 = 1; s2 <= SLOTS; s2++) if (!readSlot(s2) && !UFC.store.exists(KEY(s2))) { free = s2; break; }
      if (!free) throw new Error('Все слоты заняты. Удалите один или нажмите «Заменить».');
      slot = free;
    }
    c.slot = slot; c.restored = false; c.updatedAt = Date.now();
    UFC.store.set(KEY(slot), c); out.push(slot);
    for (const rk of Object.keys(items)) if (rk.startsWith(k + '.ko.')) UFC.store.set(REPLAY_KEY(slot, rk.slice(k.length + 4)), items[rk]);
  }
  if (items['ufc.settings'] && !careers.length) UFC.store.set('ufc.settings', items['ufc.settings']);
  if (items['ufc.looks.v1'] && !careers.length) { UFC.store.set('ufc.looks.v1', items['ufc.looks.v1']); if (UFC.reloadLooks) UFC.reloadLooks(); }
  return out;
}

function loadReplay(c, koId) { return UFC.store.get(REPLAY_KEY(c.slot, koId), null); }

UFC.Career = {
  SLOTS, CAMP_FOCUS, INTENSITY, GYM_COST, GYM_NAMES, OFFER_LABEL, CUTS, FOODS, SUPPLEMENTS, ITEMS, INTERVIEWS, ELITE_CAMP_COST,
  list, summary, load, save, create, remove, exportSlot, exportAll, importBackup, makeOffers, book, declineOffer, cancelBooking, runCamp, fighterCfgs, recordFight, recover, upgradeGym, ufcEligible, signUFC, syncTier, checkAchievements, goatRank, loadReplay, player: pr,
  buyElite, buySupplement, buyItem, buyFuel, FUEL, doWeightCut, interview, retire, simulateCard, purseBand, switchDivision, hype: HYPE,
};
})();

