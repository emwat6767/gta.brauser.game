//# sourceURL=judo/career.js
// Judo: the career. Training cycles of 3 or 6 months, Grand Slams, continental championships, the worlds and the Olympics
// (one place per country: the compatriot with more ranking points goes), prize money, weight, age and the prime.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const M = UFC.M;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const $ = (s) => document.querySelector(s);
const money = (v) => '$' + Math.round(v).toLocaleString('ru-RU');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- the world
const COUNTRIES = {
  RUS: { name: 'Россия', reg: 'europe', first: ['Иван', 'Артём', 'Тимур', 'Мурат', 'Денис', 'Алан', 'Сослан'], last: ['Волков', 'Морозов', 'Беслан', 'Габаев', 'Кузнецов', 'Тедеев'] },
  FRA: { name: 'Франция', reg: 'europe', first: ['Люка', 'Тео', 'Клеман', 'Жоан'], last: ['Мартен', 'Бенжамен', 'Дюпон', 'Риннер'] },
  GEO: { name: 'Грузия', reg: 'europe', first: ['Лаша', 'Гиорги', 'Вазха', 'Тато'], last: ['Шавдатуашвили', 'Маргиани', 'Гигаури', 'Церцвадзе'] },
  AZE: { name: 'Азербайджан', reg: 'europe', first: ['Эльнур', 'Хидаят', 'Рустам', 'Орхан'], last: ['Мамедли', 'Гейдаров', 'Орудж', 'Сафаров'] },
  NED: { name: 'Нидерланды', reg: 'europe', first: ['Нил', 'Хенк', 'Ноэль'], last: ['ван дер Берг', 'Гроль', 'Ван Тинен'] },
  ITA: { name: 'Италия', reg: 'europe', first: ['Мануэль', 'Фабио', 'Кристиан'], last: ['Ломбардо', 'Бассо', 'Парлати'] },
  JPN: { name: 'Япония', reg: 'asia', first: ['Хифуми', 'Сохэй', 'Такато', 'Рюдзу', 'Кэнта'], last: ['Абэ', 'Нагаяма', 'Хасимото', 'Такаити', 'Ода'] },
  KOR: { name: 'Корея', reg: 'asia', first: ['Мин Су', 'Дон Хан', 'Джун Хо'], last: ['Ли', 'Ким', 'Ан'] },
  MGL: { name: 'Монголия', reg: 'asia', first: ['Ганбат', 'Батсух', 'Энхтайван'], last: ['Цэнд', 'Болд', 'Нямсурэн'] },
  KAZ: { name: 'Казахстан', reg: 'asia', first: ['Гусман', 'Ерлан', 'Даурен'], last: ['Кыргызбаев', 'Смагулов', 'Абдилда'] },
  UZB: { name: 'Узбекистан', reg: 'asia', first: ['Шарофиддин', 'Мухаммадкарим', 'Обид'], last: ['Болтабоев', 'Хуррамов', 'Джураев'] },
  CHN: { name: 'Китай', reg: 'asia', first: ['Вэй', 'Сяо', 'Мин'], last: ['Чжан', 'Ли', 'Ван'] },
};
J.COUNTRIES = COUNTRIES;
const STAT_NAMES = { power: 'Сила', speed: 'Скорость', cardio: 'Дыхалка', wrestling: 'Техника бросков', defense: 'Защита', bjj: 'Захваты' };
const STAT_KEYS = Object.keys(STAT_NAMES);
const ovrOf = (st) => Math.round(STAT_KEYS.reduce((a, k) => a + (st[k] || 60), 0) / STAT_KEYS.length);

// the calendar of one year (month 0 = January)
function eventsOfYear(year, reg) {
  const oly = year % 4 === 0;
  const L = [
    { m: 0, kind: 'gs', city: 'Лиссабон' }, { m: 1, kind: 'gs', city: 'Париж' }, { m: 2, kind: 'gs', city: 'Ташкент' },
    { m: 3, kind: 'cont', city: reg === 'asia' ? 'Бишкек' : 'Загреб' },
    { m: 4, kind: 'gs', city: 'Баку' }, { m: 5, kind: 'worlds', city: ['Будапешт', 'Абу-Даби', 'Ташкент', 'Токио'][year % 4] },
    { m: 7, kind: 'gs', city: 'Тбилиси' }, { m: 8, kind: 'gs', city: 'Загреб' }, { m: 9, kind: 'gs', city: 'Абу-Даби' },
    { m: 10, kind: 'gs', city: 'Анталья' }, { m: 11, kind: 'masters', city: 'Будапешт' }, { m: 11, kind: 'gs', city: 'Токио', d: 1 },
  ];
  if (oly) L.push({ m: 6, kind: 'olympics', city: year === 2028 ? 'Лос-Анджелес' : year === 2032 ? 'Брисбен' : 'Олимпийский город' });
  else L.push({ m: 6, kind: 'gs', city: 'Улан-Батор' });
  return L.map((e) => Object.assign(e, { year }));
}
const KIND = {
  gs: { name: 'Гранд-слэм', before: 2, venue: 'grandslam', pts: [1000, 700, 500, 260, 120, 100], prize: [15000, 9000, 4500, 1500, 0, 0], ovr: [68, 84], ai: 1 },
  cont: { name: 'Чемпионат', before: 3, venue: null, pts: [700, 490, 350, 182, 84, 70], prize: [9000, 5000, 2500, 900, 0, 0], ovr: [66, 82], ai: 1 },
  worlds: { name: 'Чемпионат мира', before: 3, venue: 'worlds', pts: [2000, 1400, 1000, 520, 240, 200], prize: [60000, 30000, 15000, 5000, 0, 0], ovr: [75, 90], ai: 2 },
  masters: { name: 'Мастерс', before: 3, venue: 'masters', pts: [1800, 1260, 900, 500, 200, 100], prize: [50000, 25000, 12000, 4000, 0, 0], ovr: [74, 90], ai: 2 },
  olympics: { name: 'Олимпийские игры', before: 3, venue: 'olympics', pts: [0, 0, 0, 0, 0, 0], prize: [300000, 150000, 75000, 20000, 0, 0], ovr: [80, 93], ai: 3 },
  trial: { name: 'Национальный отбор', before: 0, venue: 'grandslam', pts: [0, 0, 0, 0, 0, 0], prize: [0, 0, 0, 0, 0, 0], ovr: [60, 99], ai: 1 },
};
const evName = (e, reg) => (e.kind === 'cont' ? (reg === 'asia' ? 'Чемпионат Азии' : 'Чемпионат Европы') : KIND[e.kind].name) + (e.kind === 'gs' ? ' · ' + e.city : ' · ' + e.city) + ' ' + e.year;
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const START_YEAR = 2026;
const dateOf = (m) => MONTHS[m % 12] + ' ' + (START_YEAR + Math.floor(m / 12));

// ---------------------------------------------------------------- the save
const KEY = 'judo.career.v1';
const C = (J.Career = { c: null });
C.load = () => {
  try { const s = localStorage.getItem(KEY); C.c = s ? JSON.parse(s) : null; } catch (e) { C.c = null; }
  const c = C.c;
  if (c) {   // older saves: the starting money and the throw mastery
    if (!c.mastery) { c.mastery = {}; for (const id of J.TECH_ORDER) c.mastery[id] = 20; }
    if (!c.bonus30) { c.bonus30 = true; c.money += 27000; }
    if (!c.prime) c.prime = 27;
    for (const n of c.pool.concat([c.rival])) if (!n.fav) giveCharacter(n);
    if (c.rival.age > 34) {   // the old compatriot has retired: a young one takes his place
      c.rival = makeNpc(c.kg, c.cc, Math.round(rnd(68, 76)), 21); c.rival.rival = true; giveCharacter(c.rival);
      c.rivalPts = c.rivalPts.filter((p) => c.month - p.m < 6).map((p) => ({ m: p.m, pts: Math.round(p.pts * 0.3) }));
    }
    if (c.ev && c.ev.kind === 'trial' && !C.npcById(c.ev.ops[0])) c.ev = null;
  }
  return C.c;
};
C.save = () => { try { if (C.c) localStorage.setItem(KEY, JSON.stringify(C.c)); else localStorage.removeItem(KEY); } catch (e) { /* the browser keeps nothing: the career lives this session */ } };

function npcStats(ovr, style) {
  const s = {};
  const tilt = { boxer: { speed: 4, bjj: 2 }, kickboxer: { speed: 5, defense: 2 }, brawler: { power: 6, cardio: -2 }, wrestler: { wrestling: 6, bjj: 3, power: 2 } }[style] || {};
  for (const k of STAT_KEYS) s[k] = cl(Math.round(ovr + rnd(-6, 6) + (tilt[k] || 0)), 45, 99);
  s.chin = 70; s.boxing = 60; s.kicks = 55;
  return s;
}
const TRAITS = { counter: 'Контратакующий', grip: 'Мастер захвата', power: 'Силовик', tech: 'Техничный', cardio: 'Двужильный' };
J.TRAITS = TRAITS;
const STYLE_FAV = { boxer: ['podsechka', 'zacep', 'skolen', 'plecho'], kickboxer: ['otkhvat', 'podsechka', 'zacep', 'podhvat'], brawler: ['podhvat', 'otkhvat', 'bedro', 'spina'], wrestler: ['plecho', 'spina', 'pistol', 'bedro', 'tomoe'] };
function giveCharacter(n) {
  const L = STYLE_FAV[n.style] || STYLE_FAV.boxer;
  const a = pick(L); let b = pick(J.TECH_ORDER); while (b === a) b = pick(J.TECH_ORDER);
  n.fav = [a, b]; n.trait = pick(Object.keys(TRAITS));
  return n;
}
function makeNpc(kg, cc, ovr, age) {
  const C0 = COUNTRIES[cc];
  const face = pick(Object.values(J.CLASSES).flat());
  const style = pick(['boxer', 'kickboxer', 'brawler', 'wrestler']);
  const last = pick(C0.last), first = pick(C0.first);
  return giveCharacter({ id: 'n' + Math.random().toString(36).slice(2, 8), name: first + ' ' + last, short: last, cc, face, style, ovr, age: age || Math.round(rnd(20, 31)), stats: npcStats(ovr, style), prime: Math.round(rnd(25, 30)) });
}

C.create = function (spec) {
  const kg = spec.kg, cc = spec.cc;
  const st = { power: 64, speed: 64, cardio: 64, wrestling: 66, defense: 62, bjj: 62, chin: 70, boxing: 60, kicks: 55 };
  const pool = [];
  const codes = Object.keys(COUNTRIES);
  for (let i = 0; i < 40; i++) pool.push(makeNpc(kg, pick(codes.filter((x) => x !== cc)), Math.round(rnd(64, 91)), Math.round(rnd(19, 33))));
  const rival = makeNpc(kg, cc, 72, 22); rival.rival = true;
  C.c = {
    v: 1, name: spec.name || 'Борец', short: (spec.name || 'Борец').split(' ').slice(-1)[0], cc, kg, face: spec.face, gi: spec.gi || 'white',
    month: 0, age: 19, prime: Math.round(rnd(26, 30)), money: 30000, bonus30: true, stats: st, gly: 80, acid: 100, walk: 3.0, mastery: Object.fromEntries(J.TECH_ORDER.map((id) => [id, J.loadout.slice(0, 2).includes(id) ? 35 : 20])),
    points: [], medals: [], history: [], pool, rival, rivalPts: [], qualified: {}, cycle: 3, done: {},
  };
  C.save();
};

// ---------------------------------------------------------------- points
C.wrl = (list, month) => list.reduce((a, p) => { const d = month - p.m; return a + p.pts * (d < 12 ? 1 : d < 36 ? 1 - (d - 12) / 24 : 0); }, 0);
C.olyWindow = (list, olyMonth) => list.reduce((a, p) => a + (olyMonth - p.m <= 24 && p.m < olyMonth ? p.pts : 0), 0);

// ---------------------------------------------------------------- the passing of time
const FOCUS = {
  phys: { name: 'Физика', desc: 'сила, мощь бросков', g: { power: 1.15, chin: 0.2 } },
  cardio: { name: 'Выносливость', desc: 'дыхалка, гликоген, кислотный порог', g: { cardio: 1.15 }, fuel: true },
  tech: { name: 'Техника', desc: 'бросок проходит чаще', g: { wrestling: 1.1, speed: 0.15 } },
  grip: { name: 'Захваты', desc: 'захват и сброс захвата', g: { bjj: 1.15, power: 0.15 } },
  speed: { name: 'Скорость', desc: 'вход в бросок, реакция', g: { speed: 1.1 } },
  def: { name: 'Защита', desc: 'устоять и контратаковать', g: { defense: 1.1, wrestling: 0.15 } },
};
C.FOCUS = FOCUS;
// growth by age against the own prime: young ones grow fast, past the prime the training only holds the line
const ageK = (age, prime = 27) => (age < prime - 4 ? 2.0 : age <= prime + 2 ? 1.85 : age <= prime + 4 ? 0.55 : age <= prime + 7 ? 0.25 : 0.1);
const CAP = 150;   // the player can go past 99, slowly: the great ones are made in the prime
const growK = (cur) => (cur < 99 ? cl((112 - cur) / 30, 0.4, 1) : 0.6 * cl((CAP - cur) / 51, 0, 1));
C.CAP = CAP;
C.primeState = (c) => { const a = c.age, p = c.prime || 27; return a < p - 2 ? 'растёт' : a <= p + 2 ? 'ПРАЙМ — пик формы' : a <= p + 5 ? 'после прайма: скорость уходит' : 'ветеран: тело сдаёт'; };

C.train = function (plan) {
  const c = C.c, months = plan.months, foci = plan.foci.length ? plan.foci : ['tech'];
  const per = months / foci.length, gains = {};
  const camp = plan.camp ? 1.6 : 1;
  if (plan.camp) c.money -= C.campPrice(months);
  for (const f of foci) {
    const F = FOCUS[f];
    for (const k in F.g) {
      const cur = c.stats[k] || 60;
      const d = F.g[k] * per * camp * ageK(c.age, c.prime) * growK(cur);
      c.stats[k] = Math.min(CAP, cur + d); gains[k] = (gains[k] || 0) + d;
    }
    if (F.fuel) { c.gly = Math.min(250, c.gly + 5 * per * camp); c.acid = Math.min(250, c.acid + 5 * per * camp); }
  }
  // the weight: it climbs between events, the cut costs money
  // throw drilling: one throw grows fast, three share the time
  const thr = plan.throws && plan.throws.length ? plan.throws : [];
  // every throw improves a little on its own in the daily randori; the drilled ones much faster
  for (const id of J.TECH_ORDER) if (!thr.includes(id)) { const cur = c.mastery[id] || 20; c.mastery[id] = Math.min(150, cur + 0.9 * months * Math.max(0.5, ageK(c.age, c.prime)) * (cur < 100 ? cl((100 - cur) / 60, 0.25, 1) : 0.3)); }
  for (const id of thr) {
    const cur = c.mastery[id] || 20;
    const d = 5 * months * camp * Math.max(0.5, ageK(c.age, c.prime)) / thr.length * (cur < 100 ? cl((100 - cur) / 60, 0.12, 1) : 0.4 * cl((150 - cur) / 50, 0, 1));
    c.mastery[id] = Math.min(150, cur + d); gains['m:' + id] = d;
  }
  if (plan.cut) { c.money -= C.cutPrice(); c.walk = 0.6; } else c.walk = Math.min(9, c.walk + 0.5 * months);
  const before = c.age;
  c.month += months;
  c.age = 19 + Math.floor(c.month / 12);
  // a year older: past the prime the body gives back
  for (let a = before + 1; a <= c.age; a++) C.ageYear(c.stats, a, c.prime || 27, CAP, true);
  // the others live their careers too
  C.simWorld(months);
  C.save();
  return gains;
};
C.campPrice = (months) => 2500 * months / 3;
C.cutPrice = () => Math.round(400 * Math.max(1, C.c.walk));
C.ageYear = function (st, age, prime, cap = 99, me = false) {
  if (age <= prime - 3) { for (const k of STAT_KEYS) st[k] = Math.min(cap, (st[k] || 60) + 0.6); }
  else if (me && age > prime + 2) {   // the player feels it: speed, wind and power go first, the craft stays longer
    const k = age > prime + 8 ? 3.2 : age > prime + 5 ? 2.2 : 1.3;
    st.speed -= 1.5 * k; st.cardio -= 1.4 * k; st.power -= 1.0 * k; st.defense -= 0.5 * k; st.chin -= 0.6 * k; st.wrestling -= 0.3 * k; st.bjj -= 0.3 * k;
    for (const s of STAT_KEYS) st[s] = Math.max(40, st[s]);
  }
  else if (age > prime + 3) {
    const k = age > prime + 8 ? 2.2 : age > prime + 5 ? 1.5 : 0.9;
    st.speed -= 1.3 * k; st.cardio -= 1.2 * k; st.power -= 0.8 * k; st.defense -= 0.4 * k;
  }
};
C.simWorld = function (months) {
  const c = C.c;
  for (const n of c.pool.concat([c.rival])) {
    const years = Math.floor((c.month) / 12) - Math.floor((c.month - months) / 12);
    for (let y = 0; y < years; y++) { n.age++; C.ageYear(n.stats, n.age, n.prime); n.ovr = ovrOf(n.stats); }
  }
  // retirements: the old ones leave, young ones come
  c.pool = c.pool.map((n) => (n.age > 35 && Math.random() < 0.4 ? makeNpc(c.kg, n.cc, Math.round(rnd(66, 84)), 20) : n));
  // the compatriot competes too and collects points
  let r = c.rival;
  if (r.age > 33 && Math.random() < 0.5) {
    r = c.rival = makeNpc(c.kg, c.cc, Math.round(rnd(68, 76)), Math.round(rnd(20, 23))); r.rival = true; giveCharacter(r);
    c.rivalPts = c.rivalPts.filter((p) => c.month - p.m < 6).map((p) => ({ m: p.m, pts: Math.round(p.pts * 0.3) }));
  }
  const growK = r.age <= 30 ? ageK(r.age) : -0.15 * (r.age - 30);
  r.stats.wrestling = Math.max(50, Math.min(99, r.stats.wrestling + 0.35 * months * growK)); r.stats.power = Math.max(50, Math.min(99, r.stats.power + 0.3 * months * growK));
  r.ovr = ovrOf(r.stats);
  const evs = Math.max(1, Math.round(months / 3));
  for (let i = 0; i < evs; i++) {
    const kind = Math.random() < 0.15 ? 'worlds' : Math.random() < 0.25 ? 'cont' : 'gs';
    const strength = (r.ovr - 72) / 18 + rnd(-0.6, 0.6);
    const place = strength > 0.7 ? 0 : strength > 0.4 ? 1 : strength > 0.1 ? 2 : strength > -0.2 ? 3 : 4;
    c.rivalPts.push({ m: c.month - Math.round(rnd(0, months - 1)), pts: KIND[kind].pts[place] });
  }
};

// ---------------------------------------------------------------- the events open now
// the world ranking list: everybody in the class has points that follow his level
C.npcWrl = (n) => { if (n.wl == null) n.wl = 0.8 + Math.random() * 0.4; return Math.round(4.5 * Math.pow(Math.max(0, n.ovr - 62), 2) * n.wl); };
C.ranking = function () {
  const c = C.c, me = Math.round(C.wrl(c.points, c.month));
  const list = c.pool.concat([c.rival]).map((n) => ({ name: n.name, cc: n.cc, pts: C.npcWrl(n) }));
  list.push({ name: c.name, cc: c.cc, pts: me, me: true });
  list.sort((a, b) => b.pts - a.pts);
  return { list, rank: list.findIndex((x) => x.me) + 1, pts: me };
};
C.olyMonthOf = (year) => (year - START_YEAR) * 12 + 6;
C.openEvents = function () {
  const c = C.c, reg = COUNTRIES[c.cc].reg, y0 = START_YEAR + Math.floor(c.month / 12);
  const list = [];
  for (const y of [y0, y0 + 1]) for (const e of eventsOfYear(y, reg)) {
    const m = (y - START_YEAR) * 12 + e.m;
    const key = y + '-' + e.m + (e.d ? '-' + e.d : '');
    if (m >= c.month && m <= c.month + 2 && !c.done[key]) list.push(Object.assign({ abs: m, key }, e));
  }
  return list;
};
C.olyStatus = function (year) {
  const c = C.c, om = C.olyMonthOf(year);
  const me = C.olyWindow(c.points, om), him = C.olyWindow(c.rivalPts, om);
  const q = (c.qualified || {})[year];
  const ok = q === true || (q !== false && me >= him && me > 0);
  const trial = q == null && !ok;   // behind on points: the national trial against him is still open
  return { me: Math.round(me), him: Math.round(him), ok, trial, lost: q === false };
};
C.nextOly = () => { const y = START_YEAR + Math.floor(C.c.month / 12); for (let k = y; k < y + 5; k++) if (k % 4 === 0 && C.olyMonthOf(k) >= C.c.month) return k; return y + 4; };

// ---------------------------------------------------------------- the tournament
C.startEvent = function (e) {
  const c = C.c, K = KIND[e.kind];
  const n = K.before + 1;
  const pool = c.pool.slice().sort((a, b) => a.ovr - b.ovr);
  const lo = K.ovr[0], hi = K.ovr[1];
  const field = pool.filter((p) => p.ovr >= lo - 4 && p.ovr <= hi + 6);
  const ops = [];
  for (let i = 0; i < n; i++) {
    const want = lo + (hi - lo) * (i + 1) / n + rnd(-3, 3);
    let best = null, bd = 1e9;
    for (const p of field.length ? field : pool) { if (ops.includes(p)) continue; const d = Math.abs(p.ovr - want); if (d < bd) { bd = d; best = p; } }
    ops.push(best);
  }
  const bronze = pool.filter((p) => !ops.includes(p) && p.ovr >= lo).sort(() => Math.random() - 0.5)[0] || pool[0];
  c.ev = { key: e.key, kind: e.kind, name: evName(e, COUNTRIES[c.cc].reg), city: e.city, year: e.year, ops: ops.map((o) => o.id), bronzeOp: bronze.id, round: 0, results: [], state: 'run', overweight: c.walk > 2 };
  c.done[e.key] = true;
  C.save();
};
C.startTrial = function (year) {
  const c = C.c;
  c.ev = { key: 'trial-' + year, kind: 'trial', name: 'Национальный отбор на Олимпиаду ' + year, city: '', year, ops: [c.rival.id], bronzeOp: c.rival.id, round: 0, results: [], state: 'run', overweight: c.walk > 2 };
  C.save();
};
C.npcById = (id) => C.c.pool.find((p) => p.id === id) || (C.c.rival.id === id ? C.c.rival : null);
C.roundName = (ev, i) => { if (ev.kind === 'trial') return 'Отбор'; const n = KIND[ev.kind].before + 1; const left = n - i; return ev.state === 'bronze' ? 'Схватка за бронзу' : left === 1 ? 'Финал' : left === 2 ? 'Полуфинал' : left === 3 ? 'Четвертьфинал' : '1/8 финала'; };

C.playerCfg = function () {
  const c = C.c;
  const base = UFC.fighterCfg(c.face);
  const st = Object.assign({}, c.stats);
  return Object.assign({}, base, { id: 'player', name: c.name, short: c.short, flag: c.cc, weight: c.kg, height: J.CLASS_H[c.kg], stats: st, look: Object.assign({}, base.look, { backName: c.short.toUpperCase() }) });
};
C.npcCfg = function (n) {
  const base = UFC.fighterCfg(n.face);
  return Object.assign({}, base, { id: n.id, name: n.name, short: n.short, nick: TRAITS[n.trait] || COUNTRIES[n.cc].name, flag: n.cc, weight: C.c.kg, height: +(J.CLASS_H[C.c.kg] + rnd(-0.03, 0.03)).toFixed(2), style: n.style, stats: Object.assign({}, n.stats), fav: n.fav, trait: n.trait, mastery: 55 + Math.max(0, n.ovr - 70) });
};

C.fight = function () {
  const c = C.c, ev = c.ev, g = window.__UFC__;
  const opId = ev.state === 'bronze' ? ev.bronzeOp : ev.ops[ev.round];
  const op = C.npcById(opId);
  const K = KIND[ev.kind];
  J.setVenue(K.venue || (COUNTRIES[c.cc].reg === 'asia' ? 'asia' : 'europe'));
  J.opt.gi = c.gi; J.opt.name = c.short.toUpperCase();
  UFC.fuel = { gly: c.gly * (ev.overweight ? 0.75 : 1), acid: c.acid };
  const lvl = Math.min(3, K.ai + (ev.round >= K.before ? 1 : 0));
  g.onResultContinue = () => { g.quitToMenu(); };
  g.onQuit = () => { if (!C._settled) C.settle(false, 'снялся'); g.ui.go('scr-jev', null, { reset: true }); };
  C._settled = false;
  g.startQuickFight(C.playerCfg(), C.npcCfg(op), Object.assign({}, g.ui.settings, { difficulty: lvl }), {
    career: true, event: ev.name, onEnd: (fight) => { C.settle(!!fight.won, fight.methodText || ''); },
  });
  if (ev.overweight) { g.p1.staminaCap = Math.round(g.p1.staminaCap * 0.85); g.p1.stamina = Math.min(g.p1.stamina, g.p1.staminaCap); g.ui.callout('ПЕРЕВЕС', 'вес не согнан: дыхалка и гликоген хуже', 'round', 2.2); }
};

// one fight is over: the bracket moves on
C.settle = function (won, text) {
  if (C._settled) return; C._settled = true;
  const c = C.c, ev = c.ev; if (!ev) return;
  const K = KIND[ev.kind], n = K.before + 1;
  const opId = ev.state === 'bronze' ? ev.bronzeOp : ev.ops[ev.round];
  const opN = C.npcById(opId);
  ev.results.push({ round: C.roundName(ev, ev.round), op: opN.name, won, text });
  if (won && ev.kind !== 'trial') {
    c.wins = c.wins || [];
    const rk = C.ranking().list.findIndex((x) => x.name === opN.name) + 1;
    c.wins.push({ op: opN.name, cc: opN.cc, ovr: opN.ovr, rank: rk || 99, ev: ev.name, kind: ev.kind, round: C.roundName(ev, ev.round), text: text || '', date: dateOf(c.month), age: c.age });
  }
  if (ev.state === 'bronze') { ev.place = won ? 3 : 5; ev.state = 'over'; }
  else if (won) { ev.round++; if (ev.round >= n) { ev.place = 1; ev.state = 'over'; } }
  else {
    const left = n - ev.round;
    if (left === 1) { ev.place = 2; ev.state = 'over'; }
    else if (left === 2) { ev.state = 'bronze'; }
    else { ev.place = left === 3 ? 7 : 9; ev.state = 'over'; }
  }
  if (ev.state === 'over') C.closeEvent();
  C.save();
};
C.closeEvent = function () {
  const c = C.c, ev = c.ev, K = KIND[ev.kind];
  if (ev.kind === 'trial') {   // no medal and no month: the Games are just ahead
    c.qualified = c.qualified || {}; c.qualified[ev.year] = ev.place === 1; ev.pts = 0; ev.prize = 0;
    c.history.push({ name: ev.name, trial: true, won: ev.place === 1, date: dateOf(c.month) });
    return;
  }
  const idx = { 1: 0, 2: 1, 3: 2, 5: 3, 7: 4, 9: 5 }[ev.place];
  const pts = K.pts[idx] || 0, prize = K.prize[idx] || 0;
  ev.pts = pts; ev.prize = prize;
  c.points.push({ m: c.month, pts, ev: ev.name });
  c.money += prize;
  if (ev.place <= 3) c.medals.push({ place: ev.place, name: ev.name, kind: ev.kind });
  c.history.push({ name: ev.name, place: ev.place, pts, prize, date: dateOf(c.month) });
  c.walk = Math.min(9, c.walk + 1.5);
  c.month += 1; c.age = 19 + Math.floor(c.month / 12);   // the tournament and the rest after it take a month
};

// ---------------------------------------------------------------- the podium
J.podium = function (g, cfgs, eventName, onDone) {
  const Cer = UFC.Ceremony;
  g.startEdit(cfgs[0], cfgs[1], (game, o) => {
    const S = new Cer.Show(game, 'podium', o);
    S.duration = 9;
    const extra = [];
    const f3 = [new UFC.Fighter(game, cfgs[2], 2), new UFC.Fighter(game, cfgs[3], 3)];
    extra.push(...f3);
    const gold = o.b, silver = o.a;
    const blocks = [[0, 0.62, gold, 0xf2c23a], [-1.25, 0.42, silver, 0xd9dde6], [1.05, 0.26, f3[0], 0xc8803f], [1.75, 0.26, f3[1], 0xc8803f]];
    const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.25 });
    S.actors = [gold, silver, f3[0], f3[1]];
    blocks.forEach(([x, h, f, col], i) => {
      const box = S.addProp(new THREE.Mesh(new THREE.BoxGeometry(i >= 2 ? 0.66 : 0.8, h, 0.8), std(0xf2f2f2)));
      box.position.set(x, h / 2, -0.6); box.castShadow = box.receiveShadow = true;
      const num = S.addProp(new THREE.Mesh(new THREE.BoxGeometry(i >= 2 ? 0.67 : 0.81, 0.05, 0.81), std(col)));
      num.position.set(x, h - 0.03, -0.6);
      f.place(x, -0.6, 0); f.startCine({ casual: true }); f.cineFree(true); f.cineLift(h, 0.01);
      // the medal on its ribbon
      const H = f.h, med = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.038 * H / 1.8 * 1.8, 0.038 * H, 0.008 * H, 28), new THREE.MeshStandardMaterial({ color: col, metalness: 0.6, roughness: 0.3, emissive: col, emissiveIntensity: 0.35 }));
      disc.rotation.x = Math.PI / 2; disc.position.set(0, -0.0, 0.012 * H); med.add(disc);
      for (const s of [-1, 1]) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018 * H, 0.12 * H, 0.004 * H), new THREE.MeshStandardMaterial({ color: 0x1d4fae, roughness: 0.7 })); rib.position.set(s * 0.03 * H, 0.06 * H, 0.0); rib.rotation.z = -s * 0.35; med.add(rib); }
      f.body.B.chest.add(med); med.position.set(0, 0.035 * H, 0.105 * H);
      f._medal = med;
    });
    for (const f of extra) game.scene.add(f.body.root);
    if (game.ref) game.ref.setVisible(false);
    S.cam.set(new THREE.Vector3(0.3, 1.75, 4.6), new THREE.Vector3(0.25, 1.15, -0.6), 40);
    Cer.Announcer.big('ПЬЕДЕСТАЛ', eventName, 'belt', 2.6);
    S.at(1.2, () => { gold.cinePose('armsUp', 0.6); silver.cinePose('stand', 0.6); f3[0].cinePose('oneArmUpL', 0.6); f3[1].cinePose('stand', 0.6); game.audio.cheer(1); game.arena.excite(1); });
    S.at(3.5, () => S.cam.set(new THREE.Vector3(0.2, 1.95, 2.3), new THREE.Vector3(0, 1.55, -0.6), 34, { cut: true }));
    S.at(6.0, () => S.cam.set(new THREE.Vector3(1.6, 1.5, 3.4), new THREE.Vector3(0.4, 1.2, -0.6), 42, { cut: true }));
    S.cleanup = () => {
      for (const f of [gold, silver].concat(extra)) if (f._medal && f._medal.parent) f._medal.parent.remove(f._medal);
      for (const f of extra) game._removeFighter(f);
      Cer.Announcer.clear && Cer.Announcer.clear();
    };
    return S.begin();
  }, onDone);
};

// ---------------------------------------------------------------- screens
const css = document.createElement('style');
css.textContent = `
.jc { max-width: 900px; }
.jc h2 { margin: 0 0 4px; }
.jc .row { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
.jc .card { background: rgba(255,255,255,.05); border: 1px solid var(--line); padding: 10px 12px; min-width: 150px; flex: 1 1 150px; }
.jc .card b { display: block; font-size: 20px; color: var(--gold); }
.jc .card span { font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
.jc .bars { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px 18px; }
.jc .bar2 { display: grid; grid-template-columns: 120px 1fr 36px; align-items: center; gap: 8px; font-size: 13px; }
.jc .bar2 i { height: 8px; background: rgba(255,255,255,.08); display: block; }
.jc .bar2 i u { display: block; height: 100%; background: var(--gold); }
.jc .evs { display: flex; flex-direction: column; gap: 8px; }
.jc .ev { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); background: rgba(255,255,255,.04); flex-wrap: wrap; }
.jc .ev small { color: var(--dim); display: block; }
.jc .br { display: flex; flex-direction: column; gap: 6px; }
.jc .br div { padding: 8px 10px; border-left: 3px solid var(--line); background: rgba(255,255,255,.04); }
.jc .br .w { border-color: #7fe08a; } .jc .br .l { border-color: #ff8a80; } .jc .br .n { border-color: var(--gold); }
.jc .med { font-size: 22px; letter-spacing: 2px; }
.jc input.txt { font: 600 16px system-ui, sans-serif; padding: 9px 10px; background: rgba(255,255,255,.06); border: 1px solid var(--line); color: inherit; }
.jc .foot { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.jc .chip.on { background: var(--red); border-color: var(--red); }
.jc .note { background: rgba(255,255,255,.05); border-left: 3px solid var(--gold); padding: 8px 12px; font-size: 13px; line-height: 1.45; margin: 8px 0; }
`;
document.head.appendChild(css);

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
let spec = { name: '', cc: 'RUS', kg: 66, gi: 'white', face: 0 };
let plan = { months: 3, foci: [], camp: false, cut: false, throws: [] };

function screen(id) {
  let s = document.getElementById(id);
  if (!s) { s = document.createElement('div'); s.className = 'screen hidden'; s.id = id; s.innerHTML = '<div class="panel jc"></div>'; window.__UFC__.ui.root.appendChild(s); s.addEventListener('click', onClick); }
  return s.querySelector('.jc');
}

function renderCareer() {
  const p = screen('scr-jcar'), c = C.load();
  if (!c) {
    const faces = J.CLASSES[spec.kg].map((i) => [i, UFC.fighterCfg(i).name]);
    if (!J.CLASSES[spec.kg].includes(spec.face)) spec.face = J.CLASSES[spec.kg][0];
    p.innerHTML = '<h2>Новая карьера</h2><div class="dim">Вам 19 лет. Впереди Гранд-слэмы, чемпионаты мира и отбор на Олимпиаду — от страны едет только один.</div>' +
      '<div class="opt"><label>Имя и фамилия</label><input class="txt" id="jc-name" maxlength="24" value="' + esc(spec.name) + '" placeholder="Например, Иван Волков"></div>' +
      '<div class="opt"><label>Страна</label><div class="chips">' + Object.entries(COUNTRIES).map(([k, v]) => '<button class="chip' + (spec.cc === k ? ' on' : '') + '" data-act="cc" data-v="' + k + '">' + v.name + '</button>').join('') + '</div></div>' +
      '<div class="opt"><label>Весовая категория</label><div class="chips">' + [60, 66, 73].map((k) => '<button class="chip' + (spec.kg === k ? ' on' : '') + '" data-act="kg" data-v="' + k + '">' + k + ' кг</button>').join('') + '</div></div>' +
      '<div class="opt"><label>Внешность</label><div class="chips">' + faces.map(([i, n]) => '<button class="chip' + (spec.face === i ? ' on' : '') + '" data-act="face" data-v="' + i + '">' + esc(n) + '</button>').join('') + '</div></div>' +
      '<div class="opt"><label>Кимоно</label><div class="chips"><button class="chip' + (spec.gi === 'white' ? ' on' : '') + '" data-act="gi" data-v="white">Белое</button><button class="chip' + (spec.gi === 'blue' ? ' on' : '') + '" data-act="gi" data-v="blue">Синее</button></div></div>' +
      '<div class="foot"><button class="btn primary" data-act="create">Начать карьеру</button><button class="btn" data-act="back">‹ Назад</button></div>';
    const inp = p.querySelector('#jc-name'); inp.addEventListener('input', () => { spec.name = inp.value; });
    window.__UFC__.showPreview(Object.assign({}, UFC.fighterCfg(spec.face), { gi: spec.gi }));
    return;
  }
  const oy = C.nextOly(), os = C.olyStatus(oy);
  const wrl = Math.round(C.wrl(c.points, c.month));
  const RK = C.ranking(), rank = RK.rank;
  if (!c.bestRank || rank < c.bestRank) { c.bestRank = rank; C.save(); }
  if (c.retired) return renderSummary(p, c);
  const bars = STAT_KEYS.map((k) => '<div class="bar2"><span>' + STAT_NAMES[k] + '</span><i><u style="width:' + Math.round(c.stats[k] / 1.5) + '%"></u></i><b>' + Math.round(c.stats[k]) + '</b></div>').join('');
  const medals = c.medals.length ? c.medals.map((m) => MEDAL[m.place]).join(' ') : '—';
  const last = c.history.slice(-4).reverse().map((h) => '<div class="ev"><div>' + esc(h.name) + '<small>' + h.date + '</small></div><div>' + (h.trial ? (h.won ? 'путёвка на Игры' : 'отбор проигран') : (h.place <= 3 ? MEDAL[h.place] + ' ' : '') + h.place + ' место · +' + h.pts + ' очк. · ' + money(h.prize)) + '</div></div>').join('');
  p.innerHTML = '<h2>' + esc(c.name) + ' · ' + COUNTRIES[c.cc].name + '</h2><div class="dim">' + c.kg + ' кг · ' + c.age + ' лет · ' + dateOf(c.month) + ' · прайм ' + (c.prime - 2) + '–' + (c.prime + 2) + ' лет · <b>' + C.primeState(c) + '</b></div>' +
    '<div class="row"><div class="card"><span>Общий</span><b>' + ovrOf(c.stats) + '</b></div><div class="card"><span>Рейтинг-очки</span><b>' + wrl + '</b></div><div class="card"><span>Место в мире ≈</span><b>' + rank + '</b></div><div class="card"><span>Деньги</span><b>' + money(c.money) + '</b></div><div class="card"><span>Медали</span><b class="med">' + medals + '</b></div></div>' +
    '<div class="bars">' + bars + '<div class="bar2"><span>Гликоген</span><i><u style="width:' + Math.min(100, c.gly / 2.5) + '%"></u></i><b>' + Math.round(c.gly) + '%</b></div><div class="bar2"><span>Кислотный порог</span><i><u style="width:' + Math.min(100, c.acid / 2.5) + '%"></u></i><b>' + Math.round(c.acid) + '%</b></div></div>' +
    '<h3>Мастерство бросков</h3><div class="bars">' + J.TECH_ORDER.map((id) => '<div class="bar2"><span>' + J.TECHS[id].name + '</span><i><u style="width:' + Math.round((c.mastery[id] || 20) / 1.5) + '%"></u></i><b>' + Math.round(c.mastery[id] || 20) + '</b></div>').join('') + '</div>' +
    '<div class="note"><b>Олимпиада ' + oy + '.</b> От страны едет один. Очки за 2 года до Игр: <b>вы ' + os.me + '</b> · ' + esc(c.rival.name) + ' (' + c.rival.age + ' лет, общий ' + c.rival.ovr + ') <b>' + os.him + '</b>. ' + (os.ok ? '<span class="good">Сейчас едете вы.</span>' : '<span class="bad">Сейчас едет он — нужны очки.</span>') + '</div>' +
    '<div class="note">Вес: <b>+' + c.walk.toFixed(1) + ' кг</b> над категорией' + (c.walk > 2 ? ' — без сгонки выйдете с перевесом (хуже дыхалка и гликоген).' : '.') + '</div>' +
    (c.ev && c.ev.state !== 'over' && c.ev.state !== 'done' ? '<div class="note">Идёт турнир: ' + esc(c.ev.name) + '</div>' : '') +
    '<div class="foot">' + (c.ev && c.ev.state !== 'done' ? '<button class="btn primary" data-act="toev">К турниру</button>' : (C.openEvents().length ? '<button class="btn primary" data-act="pick">' + (C.openEvents().some((e) => e.kind === 'olympics' && C.olyStatus(e.year).ok) ? 'На Олимпиаду / старты сейчас' : 'Старты сейчас (без подготовки)') + '</button>' : '') + '<button class="btn' + (C.openEvents().length ? '' : ' primary') + '" data-act="plan">Подготовка к следующему старту</button>') + '<button class="btn" data-act="buttons">Кнопки приёмов</button>' + (c.medals.length ? '<button class="btn" data-act="retire">Завершить карьеру</button>' : '') + '<button class="btn" data-act="back">‹ Меню</button><button class="btn" data-act="reset">Удалить карьеру</button></div>' +
    '<h3>Мировой рейтинг · ' + c.kg + ' кг</h3><div class="evs">' + RK.list.slice(0, Math.max(10, rank)).filter((x, i) => i < 10 || x.me).map((x, i) => '<div class="ev"' + (x.me ? ' style="border-color:var(--gold)"' : '') + '><div>' + (RK.list.indexOf(x) + 1) + '. ' + (x.me ? '<b>' + esc(x.name) + '</b>' : esc(x.name)) + ' <span class="dim">' + COUNTRIES[x.cc].name + '</span></div><div>' + x.pts + ' очк.</div></div>').join('') + '</div>' +
    cabinet(c) + (last ? '<h3>Последние турниры</h3><div class="evs">' + last + '</div>' : '');
  window.__UFC__.showPreview(Object.assign({}, C.playerCfg(), { gi: c.gi }));
}

// the end of the road: what he won, whom he beat, his best fights
const KIND_W = { olympics: 5, worlds: 4, masters: 3, cont: 2, gs: 1 };
function renderSummary(p, c) {
  const wins = c.wins || [];
  const best = wins.slice().sort((a, b) => b.ovr - a.ovr || a.rank - b.rank).slice(0, 6);
  const fights = wins.slice().sort((a, b) => (KIND_W[b.kind] || 0) * 10 + (b.round === 'Финал' ? 5 : 0) + (/Иппон|Сдался/.test(b.text) ? 2 : 0) - ((KIND_W[a.kind] || 0) * 10 + (a.round === 'Финал' ? 5 : 0) + (/Иппон|Сдался/.test(a.text) ? 2 : 0))).slice(0, 6);
  const cnt = (k, pl) => c.medals.filter((m) => m.kind === k && m.place === pl).length;
  const kinds = [['olympics', 'Олимпийские игры'], ['worlds', 'Чемпионат мира'], ['masters', 'Мастерс'], ['cont', COUNTRIES[c.cc].reg === 'asia' ? 'Чемпионат Азии' : 'Чемпионат Европы'], ['gs', 'Гранд-слэм']];
  const medRows = kinds.map(([k, n]) => { const g = cnt(k, 1), s = cnt(k, 2), b = cnt(k, 3); return g + s + b ? '<div class="ev"><div>' + n + '</div><div>' + (g ? '🥇×' + g + ' ' : '') + (s ? '🥈×' + s + ' ' : '') + (b ? '🥉×' + b : '') + '</div></div>' : ''; }).join('');
  const prize = (c.history || []).reduce((a, h) => a + (h.prize || 0), 0);
  const fought = (c.history || []).filter((h) => !h.trial).length;
  const row = (w) => '<div class="ev"><div><b>' + esc(w.op) + '</b> <span class="dim">' + COUNTRIES[w.cc].name + ' · общий ' + w.ovr + (w.rank && w.rank < 99 ? ' · №' + w.rank + ' в мире' : '') + '</span><small>' + esc(w.ev) + ' · ' + w.round + ' · ' + w.date + '</small></div><div>' + esc(/^Время вышло/.test(w.text || '') ? (w.text.split(' · ')[1] || '').replace('преимущество ', '') : (w.text || 'победа').split(' · ')[0]) + '</div></div>';
  p.innerHTML = '<h2>' + esc(c.name) + ' · карьера завершена</h2><div class="dim">' + COUNTRIES[c.cc].name + ' · ' + c.kg + ' кг · завершил карьеру: ' + (c.retireDate || dateOf(c.month)) + ', возраст ' + c.age + '</div>' +
    '<div class="row"><div class="card"><span>Лучшее место в мире</span><b>№' + (c.bestRank || '—') + '</b></div><div class="card"><span>Турниров</span><b>' + fought + '</b></div><div class="card"><span>Побед</span><b>' + wins.length + '</b></div><div class="card"><span>Призовые</span><b>' + money(prize) + '</b></div><div class="card"><span>Медали</span><b class="med">' + c.medals.length + '</b></div></div>' +
    '<h3>Медали</h3><div class="evs">' + (medRows || '<div class="ev"><div>—</div></div>') + '</div>' +
    '<h3>Лучшие победы — над самыми сильными</h3><div class="evs">' + (best.map(row).join('') || '<div class="ev"><div>—</div></div>') + '</div>' +
    '<h3>Лучшие бои</h3><div class="evs">' + (fights.map(row).join('') || '<div class="ev"><div>—</div></div>') + '</div>' +
    '<div class="foot"><button class="btn primary" data-act="newcar">Новая карьера</button><button class="btn" data-act="back">‹ Меню</button></div>';
  window.__UFC__.showPreview(Object.assign({}, C.playerCfg(), { gi: c.gi }));
}

function cabinet(c) {
  const kinds = [['olympics', 'Олимпийские игры'], ['worlds', 'Чемпионат мира'], ['masters', 'Мастерс'], ['cont', COUNTRIES[c.cc].reg === 'asia' ? 'Чемпионат Азии' : 'Чемпионат Европы'], ['gs', 'Гранд-слэм']];
  const rows = kinds.map(([k, n]) => {
    const ms = c.medals.filter((m) => m.kind === k).sort((a, b) => a.place - b.place);
    const list = ms.length ? ms.map((m) => '<span title="' + esc(m.name) + '">' + MEDAL[m.place] + '</span>').join(' ') : '<span class="dim">—</span>';
    const names = ms.map((m) => esc(m.name.replace(/^[^·]*· /, '')) + ' ' + MEDAL[m.place]).join(' · ');
    return '<div class="ev"><div><b>' + n + '</b><small>' + (names || 'медалей пока нет') + '</small></div><div class="med">' + list + '</div></div>';
  }).join('');
  return '<h3>Медали</h3><div class="evs">' + rows + '</div>';
}

function renderPlan() {
  const p = screen('scr-jplan'), c = C.c;
  const max = plan.months === 3 ? 2 : 4;
  plan.foci = plan.foci.slice(0, max);
  const per = plan.foci.length ? (plan.months / plan.foci.length) : plan.months;
  p.innerHTML = '<h2>Подготовка</h2><div class="dim">Сейчас ' + dateOf(c.month) + '. Выберите, сколько готовиться до старта: чаще выступать — больше очков, реже — сильнее выходите.</div>' +
    '<div class="opt"><label>Цикл</label><div class="chips"><button class="chip' + (plan.months === 3 ? ' on' : '') + '" data-act="months" data-v="3">3 месяца · до 2 направлений</button><button class="chip' + (plan.months === 6 ? ' on' : '') + '" data-act="months" data-v="6">6 месяцев · до 4 направлений</button></div></div>' +
    '<div class="opt"><label>План (' + plan.foci.length + ' из ' + max + (plan.foci.length ? ', по ' + (+per.toFixed(1)) + ' мес. на каждое' : '') + ')</label><div class="chips">' +
    Object.entries(FOCUS).map(([k, f]) => '<button class="chip' + (plan.foci.includes(k) ? ' on' : '') + '" data-act="focus" data-v="' + k + '">' + f.name + '<small style="display:block;opacity:.6;font-size:10px">' + f.desc + '</small></button>').join('') + '</div></div>' +
    '<div class="opt"><label>Отработка бросков (' + (plan.throws || []).length + ' из 3): один бросок качается втрое быстрее, чем три</label><div class="chips">' +
    J.TECH_ORDER.map((id) => '<button class="chip' + ((plan.throws || []).includes(id) ? ' on' : '') + '" data-act="thr" data-v="' + id + '">' + J.TECHS[id].name + '<small style="display:block;opacity:.6;font-size:10px">мастерство ' + Math.round(c.mastery[id] || 20) + '</small></button>').join('') + '</div></div>' +
    '<div class="opt"><label>Сборы</label><div class="chips"><button class="chip' + (!plan.camp ? ' on' : '') + '" data-act="camp" data-v="0">Дома (бесплатно)</button><button class="chip' + (plan.camp ? ' on' : '') + '" data-act="camp" data-v="1">Сборы за рубежом · ×1,6 к росту · ' + money(C.campPrice(plan.months)) + '</button></div></div>' +
    '<div class="opt"><label>Вес: сейчас +' + c.walk.toFixed(1) + ' кг, к старту будет +' + (plan.cut ? '0.6' : Math.min(9, c.walk + 0.5 * plan.months).toFixed(1)) + ' кг</label><div class="chips"><button class="chip' + (!plan.cut ? ' on' : '') + '" data-act="cut" data-v="0">Не гонять</button><button class="chip' + (plan.cut ? ' on' : '') + '" data-act="cut" data-v="1">Гонять вес с диетологом · ' + money(C.cutPrice()) + '</button></div></div>' +
    '<div class="note">Деньги: ' + money(c.money) + '. Итого к оплате: ' + money((plan.camp ? C.campPrice(plan.months) : 0) + (plan.cut ? C.cutPrice() : 0)) + '</div>' +
    '<div class="foot"><button class="btn primary" data-act="train">Тренироваться ' + plan.months + ' мес.</button><button class="btn" data-act="back">‹ Назад</button></div>';
}

// the worlds, the masters and the Olympics in the next six months: train straight through to them
function bigAhead() {
  const c = C.c, reg = COUNTRIES[c.cc].reg, y0 = START_YEAR + Math.floor(c.month / 12), out = [];
  for (const y of [y0, y0 + 1]) for (const e of eventsOfYear(y, reg)) {
    if (e.kind !== 'worlds' && e.kind !== 'olympics' && e.kind !== 'masters') continue;
    const m = (y - START_YEAR) * 12 + e.m, key = y + '-' + e.m + (e.d ? '-' + e.d : '');
    if (m > c.month + 2 && m <= c.month + 8 && !c.done[key]) out.push(Object.assign({ abs: m, key }, e));
  }
  if (!out.length) return '';
  return '<h3>Главные старты впереди</h3><div class="evs">' + out.map((e) => {
    let lock = '';
    if (e.kind === 'olympics') { const os = C.olyStatus(e.year); if (!os.ok) lock = 'Пока едет ' + esc(c.rival.name) + ' (' + os.him + ' очков против ваших ' + os.me + ')' + (os.trial ? ' — за 2 месяца до Игр можно выиграть у него отбор' : ''); }
    return '<div class="ev"><div><b>' + esc(evName(e, reg)) + '</b><small>' + dateOf(e.abs) + ' · через ' + (e.abs - c.month) + ' мес.</small>' + (lock ? '<small class="bad">' + lock + '</small>' : '') + '</div>' +
      '<button class="btn" data-act="toward" data-v="' + e.key + '" data-m="' + (e.abs - c.month) + '">Готовиться до него</button></div>';
  }).join('') + '</div>';
}

function renderPick(gains) {
  const p = screen('scr-jpick'), c = C.c;
  const evs = C.openEvents();
  const gtxt = gains ? Object.entries(gains).filter(([, v]) => v > 0.05).map(([k, v]) => (k.startsWith('m:') ? 'мастерство «' + J.TECHS[k.slice(2)].name + '»' : (STAT_NAMES[k] || k)) + ' +' + v.toFixed(1)).join(', ') : '';
  const reg = COUNTRIES[c.cc].reg;
  const rows = evs.map((e) => {
    const K = KIND[e.kind];
    let lock = '';
    let os = null;
    if (e.kind === 'olympics') { os = C.olyStatus(e.year); if (!os.ok) lock = os.lost ? 'Отбор проигран — едет ' + esc(c.rival.name) : 'По очкам едет ' + esc(c.rival.name) + ' (' + os.him + ' против ваших ' + os.me + '). Выиграйте у него отбор — и поедете вы'; }
    return '<div class="ev"><div><b>' + esc(evName(e, reg)) + '</b><small>' + dateOf(e.abs) + ' · ' + K.before + ' схватки до финала · за 1 место ' + K.pts[0] + ' очк. и ' + money(K.prize[0]) + '</small>' + (lock ? '<small class="bad">' + lock + '</small>' : '') + '</div>' +
      (lock ? (os && os.trial ? '<button class="btn primary" data-act="trial" data-v="' + e.year + '">Отбор: схватка с ' + esc(c.rival.short || c.rival.name) + '</button>' : '') : '<button class="btn primary" data-act="enter" data-v="' + e.key + '">Выступить</button>') + '</div>';
  }).join('');
  p.innerHTML = '<h2>Старт</h2>' + (gtxt ? '<div class="note">Подготовка позади: ' + gtxt + '.</div>' : '') + '<div class="dim">' + dateOf(c.month) + ' · ' + c.age + ' лет</div>' +
    '<div class="evs">' + (rows || '<div class="ev"><div>В эти месяцы турниров нет.</div></div>') + '</div>' + bigAhead() +
    '<div class="foot"><button class="btn" data-act="skip">Отказаться и тренироваться дальше</button></div>';
}

function renderEvent() {
  const p = screen('scr-jev'), c = C.load();
  const ev = c && c.ev;
  if (!ev) { p.innerHTML = '<h2>Турнира нет</h2><div class="foot"><button class="btn" data-act="tocar">К карьере</button></div>'; return; }
  const K = KIND[ev.kind], n = K.before + 1;
  let rows = ev.results.map((r) => '<div class="' + (r.won ? 'w' : 'l') + '">' + r.round + ': ' + esc(r.op) + ' — ' + (r.won ? 'победа' : 'поражение') + (r.text ? ' <span class="dim">(' + esc(r.text) + ')</span>' : '') + '</div>').join('');
  const over = ev.state === 'over' || ev.state === 'done';
  if (!over) {
    const opId = ev.state === 'bronze' ? ev.bronzeOp : ev.ops[ev.round], op = C.npcById(opId);
    rows += '<div class="n">' + C.roundName(ev, ev.round) + ': <b>' + esc(op.name) + '</b> · ' + COUNTRIES[op.cc].name + ' · общий ' + op.ovr + ', ' + op.age + ' лет' + (op.age < 23 ? ' · молодой талант' : op.age > 31 ? ' · ветеран' : '') + '<br><span class="dim">' + (TRAITS[op.trait] || '') + ' · любимые броски: ' + (op.fav || []).map((t) => J.TECHS[t].name).join(', ') + '</span></div>';
    for (let i = ev.round + 1; i < n && ev.state !== 'bronze'; i++) rows += '<div class="dim">' + C.roundName(ev, i) + ': ?</div>';
  }
  const res = !over ? '' : ev.kind === 'trial' ? '<div class="note"><b>' + (ev.place === 1 ? '<span class="good">Путёвка ваша! Вы едете на Олимпиаду.</span>' : '<span class="bad">Отбор проигран — на Игры едет ' + esc(c.rival.name) + '.</span>') + '</b></div>'
    : '<div class="note"><b>Итог: ' + (ev.place <= 3 ? MEDAL[ev.place] + ' ' : '') + ev.place + ' место.</b> Рейтинг +' + ev.pts + ' · призовые ' + money(ev.prize) + '</div>';
  p.innerHTML = '<h2>' + esc(ev.name) + '</h2><div class="dim">' + (ev.kind === 'trial' ? 'одна схватка, победитель едет на Игры' : K.before + ' схватки до финала') + (ev.overweight ? ' · <span class="bad">перевес</span>' : '') + '</div><div class="br">' + rows + '</div>' + res +
    '<div class="foot">' + (over && ev.kind === 'trial' && ev.place === 1 ? '<button class="btn primary" data-act="olygo">На Олимпиаду!</button>' : '') + (!over ? '<button class="btn primary" data-act="fight">На татами</button>' : ev.place <= 3 && !ev.podium && ev.kind !== 'trial' ? '<button class="btn primary" data-act="podium">Пьедестал</button><button class="btn" data-act="finish">В карьеру</button>' : '<button class="btn primary" data-act="finish">В карьеру</button>') + '</div>';
}

function showPodium() {
  const c = C.c, ev = c.ev, g = window.__UFC__;
  const me = Object.assign({}, C.playerCfg(), { gi: c.gi });
  const others = c.pool.filter((p) => p.ovr >= KIND[ev.kind].ovr[0]).sort(() => Math.random() - 0.5).slice(0, 3).map((n) => Object.assign(C.npcCfg(n), { gi: Math.random() < 0.5 ? 'white' : 'blue' }));
  const order = [others[0], others[1], others[2], Object.assign({}, others[0])];
  if (ev.place === 1) { order[0] = me; } else if (ev.place === 2) { order[1] = me; } else order[2] = me;
  if (ev.place === 1) order[1] = others[1];
  order[3] = Object.assign(C.npcCfg(c.pool[(Math.random() * c.pool.length) | 0]), { gi: 'blue' });
  ev.podium = true; C.save();
  g.ui.hideAll();
  J.podium(g, order, ev.name, () => { g.ui.go('scr-jev', null, { reset: true }); });
}

function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const ui = window.__UFC__.ui, a = b.dataset.act, v = b.dataset.v;
  const c = C.c;
  switch (a) {
    case 'back': ui.back(); break;
    case 'cc': spec.cc = v; renderCareer(); break;
    case 'kg': spec.kg = +v; spec.face = J.CLASSES[spec.kg][0]; renderCareer(); break;
    case 'face': spec.face = +v; renderCareer(); break;
    case 'gi': spec.gi = v; renderCareer(); break;
    case 'create': if (!spec.name.trim()) spec.name = 'Иван Волков'; C.create(spec); renderCareer(); break;
    case 'retire': if (b.dataset.sure) { c.retired = true; c.retireDate = dateOf(c.month); C.save(); renderCareer(); } else { b.dataset.sure = '1'; b.textContent = 'Точно завершить? Нажмите ещё раз'; } break;
    case 'newcar': C.c = null; C.save(); renderCareer(); break;
    case 'reset': if (b.dataset.sure) { C.c = null; C.save(); renderCareer(); } else { b.dataset.sure = '1'; b.textContent = 'Точно удалить?'; } break;
    case 'plan': plan = { months: c.cycle || 3, foci: [], camp: false, cut: false, throws: [] }; ui.go('scr-jplan'); break;
    case 'months': plan.months = +v; c.cycle = plan.months; renderPlan(); break;
    case 'focus': { const i = plan.foci.indexOf(v); if (i >= 0) plan.foci.splice(i, 1); else if (plan.foci.length < (plan.months === 3 ? 2 : 4)) plan.foci.push(v); renderPlan(); break; }
    case 'thr': { plan.throws = plan.throws || []; const i = plan.throws.indexOf(v); if (i >= 0) plan.throws.splice(i, 1); else if (plan.throws.length < 3) plan.throws.push(v); renderPlan(); break; }
    case 'camp': plan.camp = v === '1' && c.money >= C.campPrice(plan.months); renderPlan(); break;
    case 'cut': plan.cut = v === '1' && c.money >= C.cutPrice() + (plan.camp ? C.campPrice(plan.months) : 0); renderPlan(); break;
    case 'train': { C.lastPlan = { foci: plan.foci.slice(), throws: (plan.throws || []).slice() }; const gains = C.train(plan); ui.go('scr-jpick', { gains }, { replace: true }); break; }
    case 'pick': ui.go('scr-jpick', {}); break;
    case 'olygo': {
      const y = c.ev && c.ev.year; if (c.ev) c.ev.state = 'done'; c.ev = null; C.save();
      const oe = C.openEvents().find((e) => e.kind === 'olympics' && e.year === y);
      if (oe) { C.startEvent(oe); ui.go('scr-jev', null, { reset: true }); } else ui.go('scr-jpick', {}, { reset: true });
      break;
    }
    case 'skip': ui.go('scr-jcar', null, { reset: true }); break;
    case 'toward': {
      const months = Math.max(1, +b.dataset.m);
      const lp = C.lastPlan || { foci: ['tech'], throws: [] };
      const gains = C.train(Object.assign({}, lp, { months, camp: false, cut: c.money >= C.cutPrice() }));
      ui.go('scr-jpick', { gains }, { replace: true }); break;
    }
    case 'trial': C.startTrial(+v); ui.go('scr-jev', null, { reset: true }); break;
    case 'enter': { const e2 = C.openEvents().find((x) => x.key === v); if (e2) { C.startEvent(e2); ui.go('scr-jev', null, { reset: true }); } break; }
    case 'buttons': ui.go('scr-jbtn'); break;
    case 'toev': ui.go('scr-jev'); break;
    case 'tocar': ui.go('scr-jcar', null, { reset: true }); break;
    case 'fight': C.fight(); break;
    case 'podium': showPodium(); break;
    case 'finish': if (c.ev) c.ev.state = 'done'; c.ev = null; C.save(); ui.go('scr-jcar', null, { reset: true }); break;
    default: break;
  }
}

function install() {
  const g = window.__UFC__;
  if (!g || !g.ui) { setTimeout(install, 150); return; }
  const ui = g.ui;
  screen('scr-jcar'); screen('scr-jplan'); screen('scr-jpick'); screen('scr-jev');
  ui.route('scr-jcar', () => renderCareer());
  ui.route('scr-jplan', () => renderPlan());
  ui.route('scr-jpick', (pp) => renderPick(pp && pp.gains));
  ui.route('scr-jev', () => renderEvent());
  const mb = document.querySelector('#scr-menu .menu-buttons');
  if (mb && !mb.querySelector('[data-act="jcareer"]')) {
    const bt = document.createElement('button'); bt.className = 'btn'; bt.dataset.act = 'jcareer'; bt.textContent = 'Карьера';
    mb.insertBefore(bt, mb.children[1] || null);
    bt.addEventListener('click', () => { g.audio.ensure(); ui.go('scr-jcar'); });
  }
  C.load();
}
install();
})();

