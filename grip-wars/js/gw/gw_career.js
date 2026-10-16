//# sourceURL=judo/gw_career.js
// GRIP WARS: the road to legend - the career itself (no screens here).
// Weeks of training and events, eight steps from a small club to a legacy, brackets, reputation, experience and levels,
// a build limited by the potential, rivals and rematches, achievements, challenges, records and the hall of fame.
// The save lives in localStorage.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const GW = window.GW;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const KEY = 'gw.career.v1', META = 'gw.meta.v1';
const store = {
  get(k, d) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const C = GW.Career = {};
GW.store = store;
const WEEKS_YEAR = 48;
J.CLASS_H[81] = 1.83;
if (!J.CLASSES[81]) J.CLASSES[81] = [16, 17, 19, 20, 21, 23, 24, 27, 29];
GW.CLASSES = [60, 66, 73, 81];

// ---------------------------------------------------------------- saving
C.load = () => { GW.c = store.get(KEY, null); if (GW.c) C.migrate(GW.c); return GW.c; };
C.save = () => { if (GW.c) store.set(KEY, GW.c); };
C.wipe = () => { store.del(KEY); GW.c = null; };
C.meta = () => store.get(META, { ach: {}, records: {}, hall: [] });
C.saveMeta = (m) => store.set(META, m);
C.migrate = (c) => {
  c.achievements = c.achievements || {}; c.challenges = c.challenges || {}; c.records = c.records || {}; c.rivals = c.rivals || {};
  c.news = c.news || []; c.medalAt = c.medalAt || {}; c.typesBeaten = c.typesBeaten || {}; c.intlBeaten = c.intlBeaten || {};
  for (const id of J.TECH_ORDER) if (c.mastery[id] == null) c.mastery[id] = 10;
};

// ---------------------------------------------------------------- creation
C.create = function (spec) {
  const o = GW.ORIGINS[spec.origin] || GW.ORIGINS.tech;
  const favs = { power: ['bedro', 'podhvat'], tech: ['podhvat', 'taiotoshi'], cardio: ['podsechka', 'zacep'], grip: ['plecho', 'otkhvat'] }[spec.origin] || ['podhvat', 'plecho'];
  const c = {
    v: 1, name: spec.name || 'Иван Волков', cc: spec.cc || 'RUS', kg: spec.kg || 66, face: spec.face == null ? J.CLASSES[spec.kg || 66][0] : spec.face, gi: spec.gi || 'white', origin: spec.origin || 'tech',
    week: 0, age: 17, prime: Math.round(rnd(25, 28)), money: 300, xp: 0, level: 1, pts: 0, tier: 0, rep: 0, fatigue: 10, injury: 0, injuryPart: '', coach: 0, physio: false,
    attrs: Object.assign({}, o.a), mastery: Object.fromEntries(J.TECH_ORDER.map((id) => [id, favs.includes(id) ? 25 : 10])), perks: [],
    stats: { fights: 0, wins: 0, losses: 0, ippons: 0, wazaari: 0, holds: 0, subs: 0, golden: 0, streak: 0, best: 0, tries: 0, landed: 0, events: 0, golds: 0 },
    history: [], medals: [], titles: [], rank: [], rivals: {}, achievements: {}, challenges: {}, records: {}, news: [], medalAt: {}, typesBeaten: {}, intlBeaten: {},
    ev: null, done: {}, defenses: 0, worldChamp: false, natChamp: false, retired: false, lastRematch: {},
  };
  c.short = c.name.split(' ').slice(-1)[0];
  GW.c = c;
  C.news(c, 'Первый день в додзё «Сакура». Тренер Палыч: «Посмотрим, на что ты годен».');
  C.save();
  return c;
};
C.news = (c, t) => { c.news.unshift({ w: c.week, t }); if (c.news.length > 30) c.news.length = 30; };

// ---------------------------------------------------------------- numbers
C.date = (c, w = c.week) => 'Год ' + (1 + Math.floor(w / WEEKS_YEAR)) + ', неделя ' + (1 + (w % WEEKS_YEAR));
C.potential = (c) => Math.min(640, 262 + 45 * c.tier + 3 * (c.level - 1));
C.attrSum = (c) => GW.ATTR_KEYS.reduce((a, k) => a + c.attrs[k], 0);
C.ovr = (c) => Math.round(C.attrSum(c) / GW.ATTR_KEYS.length);
C.xpNeed = (lv) => Math.round(80 * Math.pow(lv, 1.35));
C.perkSlots = (c) => GW.PERK_SLOTS.filter((l) => c.level >= l).length;
C.beltColor = (t) => GW.BELTS[Math.max(0, Math.min(7, t))].color;
C.ageK = (c) => { const a = c.age, p = c.prime; return a < p - 4 ? 1.15 : a <= p + 2 ? 1.0 : a <= p + 5 ? 0.6 : 0.3; };
C.addXp = function (c, n) {
  c.xp += Math.round(n);
  while (c.xp >= C.xpNeed(c.level)) {
    c.xp -= C.xpNeed(c.level); c.level++; c.pts += 2;
    C.news(c, 'Новый уровень ' + c.level + ': +2 очка характеристик' + (GW.PERK_SLOTS.includes(c.level) ? ' и новый слот перка' : '') + '.');
  }
};
C.rankPts = (c) => c.rank.reduce((a, r) => { const d = c.week - r.w; return a + r.pts * (d < 24 ? 1 : d < 72 ? 1 - (d - 24) / 48 : 0); }, 0);
C.legacy = function (c) {
  const TW = [1, 2, 4, 7, 12, 20, 35, 60];
  let p = 0;
  for (const m of c.medals) p += TW[m.tier] * (m.place === 1 ? 1 : m.place === 2 ? 0.6 : 0.4);
  for (const t of c.titles) p += t.name === 'Олимпийский чемпион' ? 200 : t.name === 'Чемпион мира' ? 120 : t.name === 'Чемпион страны' ? 40 : 0;
  p += c.defenses * 60 + Object.keys(c.achievements).length * 5;
  return Math.round(p);
};
C.legacyName = (p) => { let n = GW.LEGACY[0][1]; for (const [v, t] of GW.LEGACY) if (p >= v) n = t; return n; };

// a point of a skill: into an attribute, inside the potential
C.spend = function (c, k) {
  if (c.pts <= 0 || c.attrs[k] >= 100 || C.attrSum(c) >= C.potential(c)) return false;
  c.pts--; c.attrs[k] = Math.min(100, c.attrs[k] + 1); C.save(); return true;
};
C.togglePerk = function (c, id) {
  const i = c.perks.indexOf(id);
  if (i >= 0) { c.perks.splice(i, 1); C.save(); return true; }
  if (c.perks.length >= C.perkSlots(c)) return false;
  c.perks.push(id); C.save(); return true;
};
// growth of an attribute: slower near the top, never past the potential
C.grow = function (c, k, g) {
  const cur = c.attrs[k];
  g *= cl((100 - cur) / 40, 0.15, 1);
  const room = Math.max(0, C.potential(c) - C.attrSum(c));
  g = Math.max(0, Math.min(g, room, 100 - cur));
  c.attrs[k] = cur + g;
  return g;
};

// ---------------------------------------------------------------- the people
C.npcLevel = function (n, c) {
  const yrs = c.week / WEEKS_YEAR, age = n.age + yrs;
  let lv = n.lv + Math.min(yrs, Math.max(0, 28 - n.age)) * 1.4 - Math.max(0, age - 31) * 1.2;
  return Math.round(cl(lv, 15, 96));
};
C.npcById = (id) => GW.ROSTER.find((n) => n.id === id) || (GW.c && GW.c.fillers && GW.c.fillers[id]) || null;
const FIRST = { RUS: ['Илья', 'Женя', 'Глеб', 'Паша', 'Арсен', 'Стас', 'Вадим'], JPN: ['Юки', 'Кадзуя', 'Рё', 'Дайки'], FRA: ['Матис', 'Ноа', 'Лукас'], GEO: ['Лука', 'Дато', 'Ника'], KAZ: ['Айдос', 'Нурлан', 'Ерлан'], MGL: ['Тэмуулэн', 'Мунх-Очир'], KOR: ['Чжун Хо', 'Сын Ми'], AZE: ['Эльчин', 'Турал'], NED: ['Тим', 'Бас'], UZB: ['Бобур', 'Санжар'] };
const LAST = { RUS: ['Кравцов', 'Белов', 'Гусев', 'Дзагоев', 'Панин', 'Хохлов', 'Мельник'], JPN: ['Танака', 'Ито', 'Кобаяси', 'Мацуда'], FRA: ['Леруа', 'Моро', 'Фонтен'], GEO: ['Бердзенишвили', 'Чохели', 'Маргвелашвили'], KAZ: ['Ахметов', 'Сарсенбаев', 'Жумабеков'], MGL: ['Ганболд', 'Дорж'], KOR: ['Пак', 'Чхве'], AZE: ['Гусейнов', 'Мамедов'], NED: ['де Йонг', 'Баккер'], UZB: ['Рахимов', 'Юлдашев'] };
// the bracket needs bodies: a few extra entrants, made once per tier and kept, so they become familiar faces too
C.fillersFor = function (c, tier) {
  c.fillers = c.fillers || {};
  const ids = Object.keys(c.fillers).filter((k) => c.fillers[k].tier === tier);
  if (ids.length >= 8) return ids;
  const T = GW.TIERS[tier], ccs = tier <= 4 ? ['RUS', 'RUS', 'RUS', 'KAZ', 'UZB'] : ['JPN', 'FRA', 'GEO', 'KAZ', 'MGL', 'KOR', 'AZE', 'NED', 'UZB', 'RUS'];
  const types = Object.keys(GW.TYPES);
  for (let i = ids.length; i < 8; i++) {
    const cc = pick(ccs), id = 'f' + tier + '_' + i;
    c.fillers[id] = { id, name: pick(FIRST[cc]) + ' ' + pick(LAST[cc]), cc, type: types[(i + tier) % types.length], lv: Math.round(rnd(T.lv[0], T.lv[1])), tier, fav: [pick(J.TECH_ORDER), pick(J.TECH_ORDER)], age: Math.round(rnd(19, 27)), bio: 'Участник турниров этого уровня.', filler: true };
  }
  return Object.keys(c.fillers).filter((k) => c.fillers[k].tier === tier);
};
const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const TILT = { aggressor: { power: 6, speed: 4, cardio: -6, wrestling: 2 }, counter: { defense: 8, speed: 3, power: -3 }, grip: { bjj: 10, power: 3, speed: -3 }, tactician: { cardio: 10, defense: 4, power: -4 }, champion: { wrestling: 4, defense: 3, speed: 3 } };
const SIG = { aggressor: 'explosive', counter: 'counter_master', grip: 'iron_grip', tactician: 'second_wind', champion: 'big_game' };
C.npcCfg = function (n, c) {
  const lv = C.npcLevel(n, c), list = J.CLASSES[c.kg] || J.CLASSES[66];
  let face = list[hash(n.id) % list.length]; if (face === c.face) face = list[(hash(n.id) + 1) % list.length];
  const base = UFC.fighterCfg(face), t = TILT[n.type] || {};
  const st = {}; for (const k of ['power', 'speed', 'cardio', 'wrestling', 'defense', 'bjj']) st[k] = cl(Math.round(lv + (t[k] || 0) + ((hash(n.id + k) % 7) - 3)), 10, 99);
  st.chin = 70; st.boxing = 50; st.kicks = 40;
  return Object.assign({}, base, {
    id: 'gw_' + n.id, name: n.name, short: n.name.split(' ').slice(-1)[0], nick: GW.TYPES[n.type].name, flag: n.cc, weight: c.kg,
    height: +((J.CLASS_H[c.kg] || 1.71) + ((hash(n.id) % 7) - 3) * 0.01).toFixed(2), style: GW.STYLE_OF[n.type], stats: st, fav: n.fav.slice(), trait: null,
    gwType: n.type, gw: { grip: st.bjj, newaza: cl(lv + (n.type === 'counter' ? 5 : 0), 10, 99) }, mastery: Math.round(25 + lv * 0.75),
    gwPerks: n.tier >= 4 && !n.filler ? [SIG[n.type]] : [], belt: C.beltColor(Math.max(n.tier, lv >= 72 ? 6 : n.tier)),
  });
};
C.playerCfg = function (c) {
  const base = UFC.fighterCfg(c.face), a = c.attrs;
  return Object.assign({}, base, {
    id: 'player', name: c.name, short: c.short, flag: c.cc, weight: c.kg, height: J.CLASS_H[c.kg] || 1.71,
    stats: { power: a.power, speed: a.speed, cardio: a.cardio, wrestling: a.technique, defense: a.defense, bjj: a.grip, chin: 70, boxing: 50, kicks: 40 },
    gw: { grip: a.grip, newaza: a.newaza }, gwPerks: c.perks.slice(), belt: C.beltColor(c.tier), trait: null, gwType: null,
  });
};
C.lvOf = (id, c) => (id === 'player' ? C.ovr(c) : C.npcLevel(C.npcById(id), c));

// ---------------------------------------------------------------- the calendar
C.eventsAround = function (c) {
  const out = [];
  for (const e of GW.EVENTS) {
    if (e.tier > c.tier || e.tier < c.tier - 2) continue;
    if (e.id === 'wdef' && !c.worldChamp) continue;
    if (e.id === 'worlds' && c.tier >= 7 && c.worldChamp) continue;
    for (let w = c.week; w < c.week + 4; w++) {
      if (((w - e.at) % e.every + e.every) % e.every !== 0) continue;
      const key = e.id + '@' + w;
      if (c.done[key]) continue;
      out.push(Object.assign({ key, week: w, inWeeks: w - c.week }, e));
    }
  }
  out.sort((a, b) => a.week - b.week || b.tier - a.tier);
  return out;
};
// who beat you, and is around your level: a rematch
C.rematches = function (c) {
  const out = [];
  for (const [id, r] of Object.entries(c.rivals)) {
    if (r.l <= r.w) continue;
    const n = C.npcById(id); if (!n) continue;
    if (n.tier > c.tier + 1 || n.tier < c.tier - 2) continue;
    if ((c.lastRematch[id] || -99) > c.week - 4) continue;
    out.push({ n, r });
  }
  return out;
};

// ---------------------------------------------------------------- the training week
C.canHard = (c) => c.injury <= 0;
C.runWeek = function (c, plan) {
  const coach = GW.COACHES[c.coach].mult, age = C.ageK(c);
  const fatK = c.fatigue > 70 ? 0.5 : c.fatigue > 45 ? 0.8 : 1;
  const gains = {}, add = (k, v) => { if (v > 0) gains[k] = (gains[k] || 0) + v; };
  let xp = 0;
  plan.slots.forEach((sid, i) => {
    const S = GW.SESSIONS[sid]; if (!S) return;
    const dm = plan.mult && plan.mult[i] != null ? plan.mult[i] : (S.drill ? 0.65 : 1);
    const hard = S.fat >= 14;
    if (hard && c.injury > 0) return;
    for (const [k, g] of Object.entries(S.gains)) add(k, C.grow(c, k, 0.62 * g * coach * age * fatK * dm));   // a few points a week: a body is not built in a month
    if (S.mastery && plan.tech) {
      const cur = c.mastery[plan.tech] || 10;
      const g = S.mastery * coach * fatK * dm * (cur < 80 ? 1 : 0.45);
      c.mastery[plan.tech] = Math.min(100, cur + g); add('m:' + plan.tech, g);
    }
    if (sid === 'sparring') {
      const won = plan.spar && plan.spar[i];
      for (const k of ['technique', 'grip', 'defense', 'cardio']) add(k, C.grow(c, k, 0.3 * coach * fatK * (won ? 1.3 : 0.9) * age));
      xp += won ? 45 : 25;
    }
    c.fatigue = cl(c.fatigue + S.fat * (c.physio ? 0.85 : 1), 0, 100);
    // the risk of a heavy week
    if (hard && c.fatigue > 65 && Math.random() < (c.fatigue - 60) / 220 * (c.physio ? 0.6 : 1)) {
      c.injury = Math.round(rnd(1, 3)); c.injuryPart = pick(['плечо', 'колено', 'голеностоп', 'пальцы', 'поясница']);
      C.news(c, 'Травма на тренировке: ' + c.injuryPart + '. ' + c.injury + ' нед. без тяжёлых нагрузок и турниров.');
    }
    xp += 10;
  });
  C.addXp(c, xp);
  C.endWeek(c);
  C.save();
  return { gains, xp };
};
C.endWeek = function (c) {
  c.fatigue = cl(c.fatigue - (c.physio ? 24 : 12), 0, 100);
  if (c.physio) c.money -= 40 * (c.tier + 1);
  if (c.injury > 0) c.injury--;
  c.money += Math.round(8 * Math.sqrt(c.rep) + c.tier * 15);   // the sponsors: they pay for a name, but not without limit
  c.week++;
  if (c.week % WEEKS_YEAR === 0) C.birthday(c);
};
C.birthday = function (c) {
  c.age++;
  C.news(c, 'Вам ' + c.age + '. ' + (c.age < c.prime - 1 ? 'Тело ещё растёт.' : c.age <= c.prime + 2 ? 'Вы в лучшей форме — это прайм.' : 'Скорость и дыхалка начинают уходить.'));
  if (c.age > c.prime + 2) {
    const k = c.age > c.prime + 8 ? 3 : c.age > c.prime + 5 ? 2 : 1.2;
    for (const [a, m] of [['speed', 1.5], ['cardio', 1.4], ['power', 1.0], ['defense', 0.4]]) c.attrs[a] = Math.max(15, c.attrs[a] - m * k);
  }
  if (c.age >= 40 && !c.retired) C.news(c, 'В 40 лет пора подумать о завершении карьеры.');
};

// ---------------------------------------------------------------- the tournament
const winP = (la, lb) => 1 / (1 + Math.exp(-(la - lb) / 7));
C.startEvent = function (c, e) {
  const T = GW.TIERS[e.tier], n = e.size;
  const pool = GW.ROSTER.filter((x) => (e.tier <= 1 ? x.tier === e.tier : Math.abs(x.tier - e.tier) <= 1) && x.tier <= c.tier + 1).map((x) => x.id);   // the club fights the club
  // the strongest of the level are always there at the big ones; the rest are drawn
  pool.sort(() => Math.random() - 0.5);
  const fill = C.fillersFor(c, e.tier);
  const others = [], need = e.size === 2 ? 2 : n - 1;   // the belt exam: two bouts against the seniors
  for (const id of pool) if (others.length < need) others.push(id);
  for (const id of fill) if (others.length < need) others.push(id);
  while (others.length < need) others.push(pick(fill));
  // seeding: the player by his ranking, the rest by level
  others.sort((a, b) => C.lvOf(b, c) - C.lvOf(a, c));
  const pos = n <= 2 ? 0 : Math.min(n - 1, Math.max(0, Math.round((1 - cl(C.rankPts(c) / (T.pts * 6))) * (n - 1))));
  const order = others.slice(); order.splice(pos, 0, 'player');
  const bracket = n <= 2 ? ['player'].concat(others) : seedOrder(order);
  c.ev = { key: e.key, id: e.id, name: e.name, tier: e.tier, size: n, exam: e.size === 2, title: e.title || null, fee: e.fee || 0, alive: bracket, round: 0, wins: 0, results: [], log: [], state: 'run', conceded: 0, shido: 0, place: null };
  c.done[e.key] = true;
  if (e.fee) c.money -= e.fee;
  C.save();
  return c.ev;
};
// standard seeding: 1 meets the lowest, the two best can only meet in the final
function seedOrder(list) {
  const n = list.length; let idx = [0];
  while (idx.length < n) { const m = idx.length * 2; idx = idx.flatMap((i) => [i, m - 1 - i]); }
  return idx.map((i) => list[i]);
}
C.roundName = (ev) => {
  if (ev.exam) return 'Аттестационная схватка ' + (ev.round + 1);
  if (ev.state === 'bronze') return 'Схватка за бронзу';
  const left = ev.alive.length;
  return left === 2 ? 'Финал' : left === 4 ? 'Полуфинал' : left === 8 ? 'Четвертьфинал' : '1/8 финала';
};
C.nextOpponent = function (c) {
  const ev = c.ev; if (!ev || ev.state === 'over') return null;
  if (ev.state === 'bronze') return ev.bronzeOp;
  if (ev.exam) return ev.alive[1 + ev.round];
  const i = ev.alive.indexOf('player');
  return ev.alive[i ^ 1];
};
C.isFinal = (c) => !!c.ev && !c.ev.exam && c.ev.state !== 'bronze' && c.ev.alive.length === 2;
// the rest of the round is decided off the mat
function simRound(c, ev, playerWon) {
  const next = [], losers = [];
  for (let i = 0; i < ev.alive.length; i += 2) {
    const a = ev.alive[i], b = ev.alive[i + 1];
    if (a === 'player' || b === 'player') { const o = a === 'player' ? b : a; next.push(playerWon ? 'player' : o); losers.push(playerWon ? o : 'player'); continue; }
    const w = Math.random() < winP(C.lvOf(a, c), C.lvOf(b, c)) ? a : b;
    next.push(w); losers.push(w === a ? b : a);
    if (ev.alive.length <= 4) ev.log.push(C.npcById(w).name + ' побеждает ' + C.npcById(w === a ? b : a).name);
  }
  return { next, losers };
}
C.settleFight = function (c, won, text, L, oppId, info) {
  const ev = c.ev, n = C.npcById(oppId), T = GW.TIERS[ev ? ev.tier : c.tier];
  const method = /Сдался/.test(text) ? 'sub' : /удержание/i.test(text) ? 'hold' : /Хансоку/.test(text) ? 'hansoku' : /Время вышло|Хантэй/.test(text) ? 'decision' : /Иппон|иппон/.test(text) ? 'ippon' : /юко|ваза-ари/i.test(text) ? 'score' : 'other';
  const s = c.stats, unlocked = [];
  s.fights++; if (won) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); } else { s.losses++; s.streak = 0; }
  if (L) { s.tries += L.tries; s.landed += L.landed; }
  if (won && method === 'ippon') s.ippons++;
  if (won && method === 'hold') s.holds++;
  if (won && method === 'sub') s.subs++;
  if (won && L && L.golden) s.golden++;
  if (L) { s.wazaari += L.scoresFor.filter((x) => x.sc === 'wazaari').length; }
  const r = c.rivals[oppId] = c.rivals[oppId] || { w: 0, l: 0 };
  const owed = r.l > r.w;
  if (won) r.w++; else r.l++;
  if (won) c.typesBeaten[n.type] = true;
  if (won && (ev ? ev.tier : c.tier) >= 5) c.intlBeaten[n.type] = true;
  // experience
  let xp = won ? 30 + 12 * c.tier : 12 + 5 * c.tier;
  if (won && (method === 'ippon' || method === 'hold' || method === 'sub')) xp += 10 + 3 * c.tier;
  C.addXp(c, xp);
  // the fight in the book
  const rec = { w: c.week, ev: ev ? ev.name : (info && info.title) || 'Схватка', round: ev ? C.roundName(ev) : (info && info.round) || '', op: n.name, opType: n.type, opLv: C.npcLevel(n, c), won, text, method, xp };
  c.history.unshift(rec); if (c.history.length > 80) c.history.length = 80;
  if (ev) { ev.results.push(rec); if (L) { ev.conceded += L.scoresAgainst.length; ev.shido += L.shidoMe; } }
  // achievements of the fight
  const A = (id) => { if (!c.achievements[id]) { c.achievements[id] = c.week; unlocked.push(id); } };
  if (won) A('first_win');
  if (won && method === 'ippon' && L && L.scoresFor.some((x) => x.sc === 'ippon')) {
    A('first_ippon');
    const ip = L.scoresFor.find((x) => x.sc === 'ippon');
    if (ip && ip.id === 'taiotoshi') A('tai');
    if (ip && ip.id === 'tomoe') A('tomoe');
    if (L.myCounters > 0 && /КОНТР/i.test(text + '')) A('counter_ippon');
    const sec = Math.round(L.endClock || 0);
    if (!c.records.fastest || sec < c.records.fastest.s) c.records.fastest = { s: sec, op: n.name, tech: ip ? ip.tech : '' };
  }
  if (won && method === 'hold') A('hold20');
  if (won && method === 'sub') A('sub');
  if (won && L && L.golden) A('golden');
  if (won && L && L.trailed) A('comeback');
  if (s.streak >= 5) A('streak5');
  if (s.streak >= 10) A('streak10');
  if (Object.keys(GW.TYPES).every((t) => c.typesBeaten[t])) A('all_types');
  if (won && owed) A('revenge');
  if (s.fights >= 100) A('fights100');
  if (Object.values(c.mastery).some((m) => m >= 100)) A('master');
  // the challenges of the fight
  const CH = (id) => { const ch = GW.CHALLENGES.find((x) => x.id === id); if (!ch || c.challenges[id] || c.tier < ch.tier) return; c.challenges[id] = c.week; C.reward(c, ch.reward); unlocked.push('ch:' + id); C.news(c, 'Испытание «' + ch.name + '» выполнено!'); };
  if (won && method === 'ippon' && L && L.scoresFor.some((x) => x.sc === 'ippon')) CH('c_ippon');
  if (won && L && L.gAdv > L.t * 0.5) CH('c_grip');
  if (won && (method === 'hold' || method === 'sub')) CH('c_ground');
  if (c.intlBeaten.counter && c.intlBeaten.grip) CH('c_styles');
  if (won && L && L.golden && info && info.final) CH('c_golden');
  C.records(c);
  C.save();
  return { rec, unlocked, xp };
};
// the throws you use in a career fight get drilled by themselves
GW.practice = function (id, amt) {
  const c = GW.c; if (!c || !c.mastery) return;
  const cur = c.mastery[id] || 10;
  c.mastery[id] = Math.min(100, cur + amt * (cur < 80 ? 1 : 0.4));
};
C.reward = (c, r) => { if (r.rep) c.rep += r.rep; if (r.xp) C.addXp(c, r.xp); if (r.money) c.money += r.money; };
// the bracket moves on after the player's fight
C.advance = function (c, won) {
  const ev = c.ev;
  if (ev.exam) {
    if (won) ev.wins++;
    ev.round++;
    if (ev.round >= ev.alive.length - 1) { ev.place = ev.wins >= 2 ? 1 : ev.wins === 1 ? 2 : 4; ev.state = 'over'; }
  } else if (ev.state === 'bronze') {
    ev.place = won ? 3 : 5; ev.state = 'over';
  } else {
    const left = ev.alive.length;
    const { next, losers } = simRound(c, ev, won);
    if (won) {
      ev.alive = next; ev.round++;
      if (next.length === 1) { ev.place = 1; ev.state = 'over'; }
    } else if (left === 2) { ev.place = 2; ev.state = 'over'; }
    else if (left === 4) {
      // the semifinal is lost: the bronze against the other loser of the semis
      ev.bronzeOp = losers.find((x) => x !== 'player'); ev.state = 'bronze';
      // the final among the others, for the book
      const f = next; if (f.length === 2) { const w = Math.random() < winP(C.lvOf(f[0], c), C.lvOf(f[1], c)) ? f[0] : f[1]; ev.champion = w; }
    } else { ev.place = left === 8 ? 5 : left === 16 ? 9 : 7; ev.state = 'over'; }
  }
  if (ev.state === 'over') C.closeEvent(c);
  C.save();
};
const PLACE_K = { 1: 1, 2: 0.6, 3: 0.35, 4: 0.15, 5: 0.12, 7: 0.08, 9: 0.05 };
C.closeEvent = function (c) {
  const ev = c.ev, T = GW.TIERS[ev.tier], p = ev.place, unlocked = [];
  const k = PLACE_K[p] || 0.05;
  const prize = Math.round(T.prize * k * (ev.size >= 16 ? 1.3 : 1)), pts = Math.round(T.pts * (p === 1 ? 1 : p === 2 ? 0.7 : p === 3 ? 0.5 : p <= 5 ? 0.25 : 0.1));
  const rep = Math.round((ev.tier + 1) * ({ 1: 30, 2: 18, 3: 12 }[p] || 3) * (ev.title ? 1.6 : 1));
  c.money += prize; c.rep += rep; c.rank.push({ w: c.week, pts });
  ev.prize = prize; ev.pts = pts; ev.rep = rep;
  c.stats.events++;
  if (ev.exam) { if (ev.wins >= 1) { c.medalAt[ev.tier] = true; C.news(c, 'Аттестация сдана: ' + ev.wins + ' из 2 схваток.'); } }
  else if (p <= 3) { c.medals.push({ place: p, tier: ev.tier, name: ev.name, w: c.week }); c.medalAt[ev.tier] = true; }
  if (p === 1) c.stats.golds++;
  const A = (id) => { if (!c.achievements[id]) { c.achievements[id] = c.week; unlocked.push(id); } };
  const CH = (id) => { const ch = GW.CHALLENGES.find((x) => x.id === id); if (!ch || c.challenges[id] || c.tier < ch.tier) return; c.challenges[id] = c.week; C.reward(c, ch.reward); unlocked.push('ch:' + id); };
  if (p === 1) {
    if (ev.conceded === 0 && !ev.exam) A('clean_event');
    if (ev.id === 'club') CH('c_first');
    if (ev.shido === 0 && ev.tier >= 4) CH('c_noshido');
    if (ev.title) {
      c.titles.push({ name: ev.title, w: c.week, ev: ev.name });
      if (ev.title === 'Чемпион страны') { c.natChamp = true; A('national'); }
      if (ev.title === 'Чемпион мира') { if (ev.id === 'wdef' && c.worldChamp) { c.defenses++; CH('c_dynasty'); if (c.defenses >= 3) A('defend3'); } c.worldChamp = true; A('world'); }
      if (ev.title === 'Олимпийский чемпион') A('olympic');
    }
  } else if (ev.id === 'wdef' && c.worldChamp) { c.worldChamp = false; C.news(c, 'Титул чемпиона мира потерян. Его можно вернуть на следующем чемпионате.'); }
  C.news(c, ev.name + ': ' + (p === 1 ? 'ЗОЛОТО' : p === 2 ? 'серебро' : p === 3 ? 'бронза' : p + '-е место') + ' · +' + rep + ' репутации' + (prize ? ' · $' + prize : ''));
  c.history.unshift({ w: c.week, ev: ev.name, place: p, prize, rep, summary: true });
  ev.unlocked = unlocked.concat(C.checkPromotion(c));
  if (C.legacy(c) >= 1000) A('legend');
  C.records(c);
};
C.finishEvent = function (c) { if (c.ev) { c.ev = null; C.endWeek(c); C.save(); } };
// a promotion: the reputation of the level and a medal at it
C.checkPromotion = function (c) {
  const out = [];
  while (c.tier < 7 && c.rep >= GW.TIERS[c.tier].rep && c.medalAt[c.tier]) {
    c.tier++;
    out.push('tier:' + c.tier);
    C.news(c, 'НОВЫЙ УРОВЕНЬ: ' + GW.TIERS[c.tier].name + '. ' + GW.BELTS[c.tier].name + '.');
    if (c.tier >= 6 && !c.achievements.black_belt) { c.achievements.black_belt = c.week; out.push('black_belt'); }
  }
  return out;
};
// the records of all careers
C.records = function (c) {
  const m = C.meta();
  m.ach = m.ach || {}; for (const id of Object.keys(c.achievements)) m.ach[id] = m.ach[id] || { name: c.name };
  const R = m.records = m.records || {};
  if (c.records.fastest && (!R.fastest || c.records.fastest.s < R.fastest.s)) R.fastest = Object.assign({ who: c.name }, c.records.fastest);
  if (!R.streak || c.stats.best > R.streak.n) R.streak = { n: c.stats.best, who: c.name };
  if (!R.titles || c.titles.length > R.titles.n) R.titles = { n: c.titles.length, who: c.name };
  if (!R.tier || c.tier > R.tier.n) R.tier = { n: c.tier, who: c.name };
  C.saveMeta(m);
};
// a one-off fight: the rematch
C.startRematch = function (c, id) {
  c.lastRematch[id] = c.week;
  c.ev = { key: 'rm@' + c.week, id: 'rematch', name: 'Реванш', tier: Math.min(c.tier, C.npcById(id).tier), size: 2, exam: false, single: true, alive: ['player', id], round: 0, wins: 0, results: [], log: [], state: 'run', conceded: 0, shido: 0 };
  C.save();
};
C.settleSingle = function (c, won) {
  const ev = c.ev;
  ev.place = won ? 1 : 2; ev.state = 'over';
  const rep = won ? 10 + 8 * c.tier : 2;
  c.rep += rep; ev.rep = rep; ev.prize = 0; ev.pts = 0; ev.unlocked = C.checkPromotion(c);
  C.news(c, 'Реванш: ' + (won ? 'победа' : 'поражение') + ' · +' + rep + ' репутации');
  C.save();
};
// the end of the road
C.retire = function (c) {
  c.retired = true;
  const p = C.legacy(c), m = C.meta();
  m.hall = m.hall || [];
  m.hall.push({ name: c.name, cc: c.cc, kg: c.kg, legacy: p, rank: C.legacyName(p), tier: c.tier, titles: c.titles.map((t) => t.name), medals: c.medals.length, wins: c.stats.wins, fights: c.stats.fights, age: c.age });
  m.hall.sort((a, b) => b.legacy - a.legacy); m.hall.length = Math.min(m.hall.length, 20);
  C.saveMeta(m); C.save();
};
})();

