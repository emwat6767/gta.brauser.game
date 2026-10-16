//# sourceURL=judo/gw_career.js
// GRIP WARS: the road to legend - the career itself (no screens here).
// Weeks of training and events, eight stages from the first day in a basement dojo to a legend: the coach's tasks
// that open the trainings and the throws, the club mates with their own records, brackets, reputation, experience,
// a build limited by the potential, the specialization, the clubs, the weight classes, the scouting and the game plan,
// rivals and rematches, invitations, achievements, challenges, records and the hall of fame.
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
  c.tasks = c.tasks || {}; c.taskProg = c.taskProg || {}; c.npc = c.npc || {}; c.spar = c.spar || {}; c.invites = c.invites || []; c.scouted = c.scouted || {};
  c.club = c.club || 'sakura'; c.height = c.height || 'mid'; c.stance = c.stance || 'L'; c.startKg = c.startKg || c.kg; c.unbeaten = c.unbeaten || 0;
  if (!c.known) { c.known = []; C.learnFor(c); }
  if (!c.sessions) { c.sessions = GW.START_SESSIONS.slice(); for (const t of GW.TASKS) if (t.unlock && (c.tasks[t.id] != null || t.tier < c.tier)) C.open(c, t.unlock); for (let t = 1; t <= c.tier; t++) for (const sid of GW.TIER_SESSIONS[t] || []) C.open(c, sid); }
  if (!c.loadout) c.loadout = c.known.slice(0, 5);
};

// ---------------------------------------------------------------- creation
C.create = function (spec) {
  const o = GW.ORIGINS[spec.origin] || GW.ORIGINS.tech;
  const favs = { power: ['bedro'], tech: ['podsechka'], cardio: ['otkhvat'], grip: ['bedro'] }[spec.origin] || ['podsechka'];
  const c = {
    v: 2, name: spec.name || 'Иван Волков', cc: spec.cc || 'RUS', kg: spec.kg || 66, startKg: spec.kg || 66, face: spec.face == null ? J.CLASSES[spec.kg || 66][0] : spec.face, gi: spec.gi || 'white', origin: spec.origin || 'tech',
    height: GW.HEIGHTS[spec.height] ? spec.height : 'mid', stance: spec.stance === 'R' ? 'R' : 'L',
    week: 0, age: 16, prime: Math.round(rnd(25, 28)), money: 50, xp: 0, level: 1, pts: 0, tier: 0, rep: 0, fatigue: 10, injury: 0, injuryPart: '', club: 'sakura', physio: false,
    attrs: Object.assign({}, o.a), mastery: Object.fromEntries(J.TECH_ORDER.map((id) => [id, favs.includes(id) ? 18 : 8])), perks: [],
    stats: { fights: 0, wins: 0, losses: 0, ippons: 0, wazaari: 0, holds: 0, subs: 0, golden: 0, streak: 0, best: 0, tries: 0, landed: 0, events: 0, golds: 0 },
    history: [], medals: [], titles: [], rank: [], rivals: {}, achievements: {}, challenges: {}, records: {}, news: [], medalAt: {}, typesBeaten: {}, intlBeaten: {},
    ev: null, done: {}, defenses: 0, worldChamp: false, natChamp: false, retired: false, lastRematch: {},
    tasks: {}, taskProg: {}, npc: {}, spar: {}, invites: [], scouted: {}, known: [], sessions: GW.START_SESSIONS.slice(), unbeaten: 0,
  };
  C.learnFor(c); c.loadout = c.known.slice(0, 5);
  c.short = c.name.split(' ').slice(-1)[0];
  GW.c = c;
  C.news(c, 'Первый день в додзё «Сакура». Подвал спорткомплекса, старые маты, скотч на порванных углах. Тренер Палыч: «Посмотрим, на что ты годен. Начнём с рук».');
  C.save();
  return c;
};
C.news = (c, t) => { c.news.unshift({ w: c.week, t }); if (c.news.length > 30) c.news.length = 30; };

// ---------------------------------------------------------------- numbers
C.date = (c, w = c.week) => 'Год ' + (1 + Math.floor(w / WEEKS_YEAR)) + ', неделя ' + (1 + (w % WEEKS_YEAR));
C.potential = (c) => Math.min(640, 185 + 55 * c.tier + 3 * (c.level - 1));
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
  const TW = [0, 1, 2, 4, 9, 18, 35, 60];
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
  const T = GW.TIERS[tier], ccs = tier <= 5 ? [c.cc, c.cc, c.cc, 'RUS'] : ['JPN', 'FRA', 'GEO', 'KAZ', 'MGL', 'KOR', 'AZE', 'NED', 'UZB', 'RUS'];
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
C.npcCfg = function (n, c, boost) {
  const lv = Math.max(C.npcLevel(n, c), boost || 0), list = J.CLASSES[c.kg] || J.CLASSES[66];
  let face = list[hash(n.id) % list.length]; if (face === c.face) face = list[(hash(n.id) + 1) % list.length];
  const base = UFC.fighterCfg(face), t = TILT[n.type] || {};
  const st = {}; for (const k of ['power', 'speed', 'cardio', 'wrestling', 'defense', 'bjj']) st[k] = cl(Math.round(lv + (t[k] || 0) + ((hash(n.id + k) % 7) - 3)), 10, 99);
  st.chin = 70; st.boxing = 50; st.kicks = 40;
  return Object.assign({}, base, {
    id: 'gw_' + n.id, name: n.name, short: n.name.split(' ').slice(-1)[0], nick: GW.TYPES[n.type].name, flag: n.cc, weight: c.kg,
    height: +((J.CLASS_H[c.kg] || 1.71) + ((hash(n.id) % 7) - 3) * 0.01).toFixed(2), style: GW.STYLE_OF[n.type], stats: st, fav: n.fav.slice(), trait: null,
    gwType: n.type, gw: { grip: st.bjj, newaza: cl(lv + (n.type === 'counter' ? 5 : 0), 10, 99) }, mastery: Math.round(25 + lv * 0.75),
    gwPerks: n.tier >= 4 && !n.filler ? [SIG[n.type]] : [], belt: C.beltColor(Math.max(n.tier, lv >= 72 ? 6 : n.tier)),
    known: J.TECH_ORDER.filter((t) => GW.THROW_TIER[t] <= Math.max(n.tier + 1, 1) || n.fav.includes(t)), gwStrong: n.strong || null, gwWeak: n.weak || null,
    gwCombo: n.tier >= 4 || (n.type === 'champion' && n.tier >= 3), gwRead: n.tier, gwPrep: !!(c.scouted && c.scouted[n.id] != null && c.week - c.scouted[n.id] < 16) || !!(c.rivals && c.rivals[n.id] && c.rivals[n.id].l > 0 && c.tier >= 4),
    stance: hash(n.id + 's') % 3 === 0 ? 'southpaw' : 'orthodox',
  });
};
C.playerCfg = function (c) {
  const base = UFC.fighterCfg(c.face), a = c.attrs;
  return Object.assign({}, base, {
    id: 'player', name: c.name, short: c.short, flag: c.cc, weight: c.kg, height: +((J.CLASS_H[c.kg] || 1.71) + (GW.HEIGHTS[c.height] || GW.HEIGHTS.mid).dh).toFixed(2),
    stance: c.stance === 'R' ? 'southpaw' : 'orthodox', gwHeight: c.height, gwSpec: c.spec || null,
    stats: { power: a.power, speed: a.speed, cardio: a.cardio, wrestling: a.technique, defense: a.defense, bjj: a.grip, chin: 70, boxing: 50, kicks: 40 },
    gw: { grip: a.grip, newaza: a.newaza }, gwPerks: c.perks.slice(), belt: C.beltColor(c.tier), trait: null, gwType: null,
  });
};
C.lvOf = (id, c) => (id === 'player' ? C.ovr(c) : C.npcLevel(C.npcById(id), c));

// ---------------------------------------------------------------- the calendar
C.eventsAround = function (c) {
  const out = [];
  for (const inv of c.invites) {
    if (inv.week < c.week || inv.week >= c.week + 4 || c.done[inv.key]) continue;
    const e = GW.EVENTS.find((x) => x.id === inv.id); if (!e || e.tier <= c.tier) continue;
    out.push(Object.assign({ key: inv.key, week: inv.week, inWeeks: inv.week - c.week, invite: true }, e));
  }
  for (const e of GW.EVENTS) {
    if (e.tier > c.tier || e.tier < Math.max(1, c.tier - 2)) continue;
    if (e.single && (e.tier !== c.tier && c.tier < 7 || !C.rankRival(c))) continue;
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
    const n = C.npcById(id); if (!n) continue;
    const old = c.tier >= 7 && n.tier < 6 && r.l > 0;   // the legend: the old rivals come back, grown
    if (r.l <= r.w && !old) continue;
    if (!old && (n.tier > c.tier + 1 || n.tier < c.tier - 2)) continue;
    if ((c.lastRematch[id] || -99) > c.week - 4) continue;
    out.push({ n, r });
  }
  return out;
};

// ---------------------------------------------------------------- the training week
C.canHard = (c) => c.injury <= 0;
C.runWeek = function (c, plan) {
  const club = GW.CLUBS[c.club] || GW.CLUBS.sakura, coach = club.mult, age = C.ageK(c);
  const spec = c.spec && GW.SPECS[c.spec], indiv = spec && plan.slots.join() === spec.plan.join() ? 1.1 : 1;
  const sk = (k) => (spec && spec.attr === k ? 1.35 : 1) * (k === 'newaza' && club.ground ? club.ground : 1) * indiv;
  const fatK = c.fatigue > 70 ? 0.5 : c.fatigue > 45 ? 0.8 : 1;
  const gains = {}, add = (k, v) => { if (v > 0) gains[k] = (gains[k] || 0) + v; };
  let xp = 0;
  plan.slots.forEach((sid, i) => {
    const S = GW.SESSIONS[sid]; if (!S) return;
    const dm = plan.mult && plan.mult[i] != null ? plan.mult[i] : (S.drill ? 0.65 : 1);
    const hard = S.fat >= 14;
    if (hard && c.injury > 0) return;
    for (const [k, g] of Object.entries(S.gains)) add(k, C.grow(c, k, 0.62 * g * coach * age * fatK * dm * sk(k)));   // a few points a week: a body is not built in a month
    if (S.mastery && plan.tech) {
      const cur = c.mastery[plan.tech] || 10;
      const g = S.mastery * coach * fatK * dm * (cur < 80 ? 1 : 0.45) * (c.spec === 'tech' ? 1.3 : 1);
      c.mastery[plan.tech] = Math.min(100, cur + g); add('m:' + plan.tech, g);
    }
    if (sid === 'sparring') {
      const won = plan.spar && plan.spar[i], pk = plan.sparK && plan.sparK[i] != null ? plan.sparK[i] : 1;   // a stronger partner teaches more
      for (const k of ['technique', 'grip', 'defense', 'cardio']) add(k, C.grow(c, k, 0.3 * coach * fatK * (won ? 1.3 : 0.9) * age * pk * sk(k)));
      xp += Math.round((won ? 45 : 25) * pk);
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
  if (c.physio) { if (c.money >= 40 * (c.tier + 1)) c.money -= 40 * (c.tier + 1); else { c.physio = false; C.news(c, 'Нечем платить физиотерапевту — он больше не приходит.'); } }
  const club = GW.CLUBS[c.club];
  if (club && club.fee) { if (c.money >= club.fee) c.money -= club.fee; else { C.news(c, 'Нечем платить за ' + club.name + ' — вы вернулись в «Сакуру» к Палычу.'); c.club = 'sakura'; } }
  C.worldWeek(c);
  if (c.injury > 0) c.injury--;
  c.money += Math.round(c.tier >= 2 ? 8 * Math.sqrt(c.rep) + c.tier * 15 : c.tier * 10 + 5);   // the sponsors pay for a name; a novice gets pocket money
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
  // who comes: the club fights the club; the first competitions are for your level and the one below; higher up, a level around
  const fits = (x) => (e.tier <= 1 ? x.tier === e.tier : e.tier <= 3 ? x.tier >= e.tier - 1 && x.tier <= e.tier : Math.abs(x.tier - e.tier) <= 1) && (e.tier >= 6 || x.tier <= 5);
  const pool = GW.ROSTER.filter((x) => fits(x) && x.tier <= Math.max(c.tier, e.tier) + 1).map((x) => x.id);
  // the strongest of the level are always there at the big ones; the rest are drawn
  pool.sort(() => Math.random() - 0.5);
  const fill = C.fillersFor(c, e.tier);
  const others = [], need = e.size === 2 ? 2 : n - 1;   // the belt exam: two bouts against the seniors
  for (const id of pool) if (others.length < need) others.push(id);
  for (const id of fill) if (others.length < need) others.push(id);
  while (others.length < need) others.push(pick(fill));
  // seeding: the player by his ranking, the rest by level
  others.sort((a, b) => C.lvOf(b, c) - C.lvOf(a, c));
  const pos = n <= 2 ? 0 : e.tier <= 3 ? (Math.random() * n) | 0 : Math.min(n - 1, Math.max(0, Math.round((1 - cl(C.rankPts(c) / (T.pts * 6))) * (n - 1))));   // small events draw lots, big ones seed by the ranking
  const order = others.slice(); order.splice(pos, 0, 'player');
  const bracket = n <= 2 ? ['player'].concat(others) : seedOrder(order);
  c.ev = { key: e.key, id: e.id, name: e.name, tier: e.tier, size: n, exam: e.size === 2, title: e.title || null, fee: e.fee || 0, alive: bracket, round: 0, wins: 0, results: [], log: [], state: 'run', conceded: 0, shido: 0, place: null,
    venue: e.venue || (e.tier === 2 ? 'gym' : null), invite: !!e.invite, lost: 0, st: { t: 0, gAdv: 0, tries: 0, landed: 0, stopped: 0, noFull: 0, shido: 0, scored: 0, against: 0, stam: 0, fights: 0, combos: 0 }, plan: 'own', scouted: [] };
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
    C.noteNpc(c, w, true, w === a ? b : a, ev.name); C.noteNpc(c, w === a ? b : a, false, w, ev.name);
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
  if (ev) {
    ev.results.push(rec); if (!won) ev.lost++;
    if (L) {
      ev.conceded += L.scoresAgainst.length; ev.shido += L.shidoMe;
      const st = ev.st; if (st) { st.fights++; st.t += L.t; st.gAdv += L.gAdv; st.tries += L.tries; st.landed += L.landed; st.stopped += L.stopped; st.noFull += L.triesNoFull; st.shido += L.shidoMe; st.scored += L.scoresFor.length; st.against += L.scoresAgainst.length; st.stam += Math.max(0, 100 - L.minSt); st.combos += L.comboScores || 0; }
    }
  }
  C.noteNpc(c, oppId, !won, 'player', ev ? ev.name : rec.ev);
  if (L && !n.filler) { c.memory = c.memory || {}; const m = c.memory[n.id] = c.memory[n.id] || {}; for (const [k, v] of Object.entries(L.myTech)) m[k] = Math.min(6, Math.round((m[k] || 0) * 0.5 + v)); }
  if (won && n.tier >= 6 && !n.filler) { c.beaten = c.beaten || {}; c.beaten[n.id] = c.week; }

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
  if (won && n.id === 'kotov') A('grudge');
  if (L && L.comboScores > 0) A('combo');
  if (won && ev && ev.scouted && ev.scouted.includes(n.id)) A('homework');
  if (c.tier >= 7 && GW.ROSTER.filter((x) => x.tier >= 6).every((x) => c.beaten && c.beaten[x.id] != null)) CH('c_beatall');
  C.checkTasks(c, { kind: 'fight', opp: n.id, won, L, tier: ev ? ev.tier : c.tier, plan: ev && ev.plan, scouted: !!(ev && ev.scouted && ev.scouted.includes(n.id)) }, unlocked);
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
      if (next.length === 1) { ev.place = 1; ev.state = 'over'; ev.champion = 'player'; }
      else if (next.length === 2) { ev.finalU = ev.finalU || []; C.checkTasks(c, { kind: 'final', tier: ev.tier }, ev.finalU); }
    } else if (left === 2) { ev.place = 2; ev.state = 'over'; ev.champion = next[0]; }
    else if (left === 4) {
      // the semifinal is lost: the bronze against the other loser of the semis
      ev.bronzeOp = losers.find((x) => x !== 'player'); ev.state = 'bronze';
      // the final among the others, for the book
      const f = next; if (f.length === 2) { const w = Math.random() < winP(C.lvOf(f[0], c), C.lvOf(f[1], c)) ? f[0] : f[1]; ev.champion = w; }
    } else { ev.place = left === 8 ? 5 : left === 16 ? 9 : 7; ev.state = 'over'; ev.champion = C.simBracket(c, next, ev); }
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
  if (ev.exam) { if (ev.wins >= 1) { c.medalAt[ev.tier] = true; C.news(c, 'Аттестация сдана: ' + ev.wins + ' из 2 схваток. ' + GW.BELTS[Math.min(7, ev.tier + 1)].name + ' — ваш с переходом на следующий этап.'); } }
  else if (p <= 3) { c.medals.push({ place: p, tier: ev.tier, name: ev.name, w: c.week }); c.medalAt[ev.tier] = true; }
  if (p === 1) c.stats.golds++;
  const A = (id) => { if (!c.achievements[id]) { c.achievements[id] = c.week; unlocked.push(id); } };
  const CH = (id) => { const ch = GW.CHALLENGES.find((x) => x.id === id); if (!ch || c.challenges[id] || c.tier < ch.tier) return; c.challenges[id] = c.week; C.reward(c, ch.reward); unlocked.push('ch:' + id); };
  if (ev.champion && ev.champion !== 'player') { const r2 = C.npcRec(c, ev.champion); r2.gold++; if (ev.title) r2.titles.push(ev.title); r2.rank.push({ w: c.week, pts: T.pts }); }
  if (!ev.exam && !ev.single) { c.unbeaten = p === 1 && ev.lost === 0 ? c.unbeaten + 1 : 0; if (c.unbeaten >= 3) CH('c_unbeaten'); }
  if (p === 1 && !ev.exam) A('first_title');
  if (p <= 3 && ev.id === 'national') c.natMedal = true;
  if (p === 1) {
    if (ev.conceded === 0 && !ev.exam) A('clean_event');
    if (ev.id === 'club') CH('c_first');
    if (ev.shido === 0 && ev.tier >= 4) CH('c_noshido');
    if (ev.title) {
      c.titles.push({ name: ev.title, w: c.week, ev: ev.name, kg: c.kg });
      if (c.kg !== c.startKg) { A('new_class'); CH('c_newweight'); }
      if (ev.title === 'Чемпион страны') { c.natChamp = true; A('national'); }
      if (ev.title === 'Чемпион мира') { if (ev.id === 'wdef' && c.worldChamp) { c.defenses++; CH('c_dynasty'); if (c.defenses >= 3) A('defend3'); } c.worldChamp = true; A('world'); }
      if (ev.title === 'Олимпийский чемпион') A('olympic');
    }
  } else if (ev.id === 'wdef' && c.worldChamp) { c.worldChamp = false; C.news(c, 'Титул чемпиона мира потерян. Его можно вернуть на следующем чемпионате.'); }
  C.news(c, ev.name + ': ' + (p === 1 ? 'ЗОЛОТО' : p === 2 ? 'серебро' : p === 3 ? 'бронза' : p + '-е место') + ' · +' + rep + ' репутации' + (prize ? ' · $' + prize : ''));
  c.history.unshift({ w: c.week, ev: ev.name, place: p, prize, rep, summary: true });
  // a good result brings an invitation one level up
  if (p <= 2 && !ev.exam && !ev.single && ev.tier >= c.tier && c.tier >= 1 && c.tier < 6) {
    const up = GW.EVENTS.filter((x) => x.tier === c.tier + 1 && !x.single);
    let best = null;
    for (const x of up) for (let w = c.week + 2; w < c.week + 9; w++) if (((w - x.at) % x.every + x.every) % x.every === 0 && (!best || w < best.week)) { best = { key: x.id + '@' + w, id: x.id, week: w }; break; }
    if (best && !c.invites.some((i) => i.key === best.key)) { c.invites.push(best); unlocked.push('invite:' + best.key); C.news(c, 'Приглашение: «' + GW.EVENTS.find((x) => x.id === best.id).name + '» через ' + (best.week - c.week) + ' нед.'); }
    if (c.invites.length > 6) c.invites.splice(0, c.invites.length - 6);
  }
  if (ev.finalU) unlocked.push(...ev.finalU);
  C.checkTasks(c, { kind: 'event', ev, place: p }, unlocked);
  ev.unlocked = unlocked.concat(C.checkPromotion(c));
  if (C.legacy(c) >= 1000) A('legend');
  C.records(c);
};
C.finishEvent = function (c) { if (c.ev) { c.ev = null; C.endWeek(c); C.save(); } };
// a promotion: the reputation of the level and a medal at it
C.canPromote = (c) => C.promoGaps(c).length === 0;
// the reputation counts for a promotion only if it was earned at this stage: no skipping a stage on old glory
C.stageRep = (c) => ({ got: Math.max(0, c.rep - (c.stageRep0 || 0)), need: GW.TIERS[c.tier].rep - (c.tier > 0 ? GW.TIERS[c.tier - 1].rep : 0) });
// what stands between you and the next stage
C.promoGaps = function (c) {
  if (c.tier >= 7) return ['вершина'];
  const T = GW.TIERS[c.tier], gaps = [];
  for (const id of GW.TIER_NEED[c.tier] || []) if (c.tasks[id] == null) gaps.push('задание «' + GW.TASKS.find((t) => t.id === id).name + '»');
  if (c.tier > 0) { const r = C.stageRep(c); if (r.got < r.need) gaps.push('репутация на этом этапе ' + r.got + '/' + r.need); if (!c.medalAt[c.tier]) gaps.push(c.tier === 1 ? 'медаль клубного первенства или аттестация' : 'медаль на турнире этапа'); }
  return gaps;
};
GW.TIER_NEED = { 0: ['grip1', 'throw1', 'defend1', 'spar1', 'win1'], 1: ['senior', 'ground1', 'club1'], 2: ['local1'], 3: ['spec'], 4: ['club2'] };
GW.TIER_SESSIONS = { 1: ['newaza'] };
const TIER_SAY = [
  '',
  'Палыч: «Всё, ты в группе. Старшие тебя пока бросают — это нормально. Учись у них и выбирай, с кем бороться».',
  'Палыч: «Готовься. В чужом зале никто не будет тебе подыгрывать».',
  'Палыч: «Ты уже не новичок. Пора решить, каким будет твоё дзюдо».',
  'Палыч: «Я дал тебе всё, что мог. Дальше — сильные клубы и сборы».',
  'Тренер: «Теперь каждый турнир на счету. Планируй и тренировки, и отдых».',
  'Тренер сборной: «Здесь все сильные. Побеждает тот, у кого есть план».',
  'Вы — легенда. Теперь титулы надо защищать, а старые соперники ещё вернутся.',
];
C.checkPromotion = function (c) {
  const out = [];
  while (c.tier < 7 && C.canPromote(c)) {
    c.tier++; c.stageRep0 = c.rep;
    out.push('tier:' + c.tier);
    const learned = C.learnFor(c);
    for (const sid of GW.TIER_SESSIONS[c.tier] || []) if (C.open(c, sid)) out.push('session:' + sid);
    for (const t of GW.TASKS) if (t.unlock && t.tier < c.tier && C.open(c, t.unlock)) out.push('session:' + t.unlock);
    if (learned.length) { out.push('learn:' + learned.join(',')); for (const id of learned) { const k = [0, 1, 2, 3, 4].find((j) => !c.loadout[j] || !c.known.includes(c.loadout[j])); if (k != null) c.loadout[k] = id; } }
    C.news(c, 'НОВЫЙ ЭТАП: ' + GW.TIERS[c.tier].name + '. ' + GW.BELTS[c.tier].name + '. ' + TIER_SAY[c.tier]);
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
C.startRematch = function (c, id, name) {
  c.lastRematch[id] = c.week;
  const n = C.npcById(id), old = c.tier >= 7 && n.tier < 6;
  c.ev = { key: 'rm@' + c.week, id: 'rematch', name: name || (old ? 'Возвращение: ' + n.name : 'Реванш'), tier: old ? c.tier : Math.min(c.tier, n.tier), size: 2, exam: false, single: true, alive: ['player', id], round: 0, wins: 0, results: [], log: [], state: 'run', conceded: 0, shido: 0,
    boost: old ? GW.TIERS[7].lv[0] - 4 : 0, lost: 0, st: null, plan: 'own', scouted: [] };
  if (old) C.news(c, n.name + ' вернулся: «Я помню нашу схватку». Он вырос — и хочет реванша.');
  C.save();
};
// the ranking match: one bout against the man just above you in the table
C.rankRival = function (c) {
  const T = C.rankTable(c), i = T.findIndex((x) => x.id === 'player');
  for (let k = i - 1; k >= 0; k--) { const n = C.npcById(T[k].id); if (n && !n.filler) return n.id; }
  return null;
};
C.startRankMatch = function (c, e) {
  const id = C.rankRival(c); if (!id) return null;
  c.done[e.key] = true;
  c.ev = { key: e.key, id: 'rankmatch', name: 'Рейтинговый матч', tier: c.tier, size: 2, exam: false, single: true, rank: true, alive: ['player', id], round: 0, wins: 0, results: [], log: [], state: 'run', conceded: 0, shido: 0, lost: 0, st: null, plan: 'own', scouted: [] };
  C.save(); return c.ev;
};
C.settleSingle = function (c, won) {
  const ev = c.ev;
  ev.place = won ? 1 : 2; ev.state = 'over';
  if (ev.rank && won) { ev.pts = Math.round(GW.TIERS[ev.tier].pts * 0.5); c.rank.push({ w: c.week, pts: ev.pts }); }
  const rep = won ? 10 + 8 * c.tier : 2;
  c.rep += rep; ev.rep = rep; ev.prize = 0; ev.pts = ev.pts || 0; ev.unlocked = (ev.unlocked || []).concat(C.checkPromotion(c));
  C.news(c, ev.name + ': ' + (won ? 'победа' : 'поражение') + ' · +' + rep + ' репутации' + (ev.pts ? ' · +' + ev.pts + ' рейтинг-очков' : ''));
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

// ---------------------------------------------------------------- the road: the throws you know, the trainings that are open
C.learnFor = function (c) {
  const out = [];
  for (const id of J.TECH_ORDER) if (GW.THROW_TIER[id] <= c.tier && !c.known.includes(id)) { c.known.push(id); out.push(id); }
  return out;
};
C.open = (c, sid) => { if (!sid || c.sessions.includes(sid)) return false; c.sessions.push(sid); return true; };
// the five buttons in a career fight: your throws first, then the ones you have not learned yet (they say so when pressed)
C.fightLoadout = function (c) {
  const L = [0, 1, 2, 3, 4].map((k) => (c.loadout[k] && c.known.includes(c.loadout[k]) ? c.loadout[k] : null));
  const rest = c.known.filter((id) => !L.includes(id)).concat(J.TECH_ORDER.filter((id) => !c.known.includes(id)).sort((a, b) => GW.THROW_TIER[a] - GW.THROW_TIER[b]));
  for (let k = 0; k < 5; k++) if (!L[k]) L[k] = rest.shift();
  return L;
};

// ---------------------------------------------------------------- the coach's tasks
const isNpcTier = (id, t) => { const n = C.npcById(id); return !!n && !n.filler && n.tier === t; };
const TASK_OK = {
  grip1: (e) => e.kind === 'drill' && e.drill === 'grip' && e.score >= 10,
  throw1: (e) => e.kind === 'drill' && e.drill === 'uchikomi' && e.hits >= 3,
  defend1: (e) => e.kind === 'drill' && e.drill === 'defense' && e.stood >= 3,
  spar1: (e) => e.kind === 'fight' && e.opp === 'martynov',
  win1: (e) => e.kind === 'fight' && e.won && isNpcTier(e.opp, 0),
  senior: (e) => e.kind === 'fight' && e.won && isNpcTier(e.opp, 1),
  ground1: (e) => e.kind === 'drill' && e.drill === 'newaza' && e.held >= 10,
  club1: (e) => e.kind === 'event' && e.ev.tier === 1 && (e.ev.exam ? e.ev.wins >= 1 : e.place === 1),
  local1: (e) => e.kind === 'event' && e.ev.tier === 2 && e.place <= 3,
  stats1: (e, c) => { if (e.kind !== 'fight' || !e.L || e.L.tries < 3 || e.L.triesNoFull / e.L.tries > 0.4) return false; c.taskProg.stats1 = (c.taskProg.stats1 || 0) + 1; return c.taskProg.stats1 >= 5; },
  spec: (e) => e.kind === 'spec',
  combo1: (e) => e.kind === 'fight' && e.L && e.L.comboScores > 0,
  rival1: (e) => e.kind === 'fight' && e.won && e.opp === 'kotov',
  club2: (e) => e.kind === 'transfer' && e.club !== 'sakura',
  scout1: (e) => e.kind === 'fight' && e.won && e.scouted,
  final1: (e) => e.kind === 'final' && e.tier === 5,
  elite: (e) => e.kind === 'transfer' && e.club === 'elite',
  plan1: (e) => e.kind === 'fight' && e.won && e.tier >= 6 && e.plan && e.plan !== 'own',
  worlds1: (e) => e.kind === 'event' && (e.ev.id === 'worlds' || e.ev.id === 'wdef') && e.place <= 3,
};
// the tasks on the board now: the first days go one by one, after that every task of the stage at once
C.tasksNow = function (c) {
  if (c.tier === 0) { const t = GW.TASKS.find((x) => x.tier === 0 && c.tasks[x.id] == null); return t ? [t] : []; }
  return GW.TASKS.filter((t) => t.tier === c.tier && c.tasks[t.id] == null);
};
C.taskProgress = function (c, t) {
  if (t.id === 'stats1') return (c.taskProg.stats1 || 0) + '/5';
  return '';
};
C.checkTasks = function (c, e, out) {
  const seen = {};
  for (let pass = 0; pass < 6; pass++) {
    let any = false;
    for (const t of C.tasksNow(c)) {
      if (seen[t.id]) continue; seen[t.id] = true;
      const ok = TASK_OK[t.id]; if (!ok || !ok(e, c)) continue;
      c.tasks[t.id] = c.week; any = true;
      C.reward(c, t.reward);
      const opened = t.unlock && C.open(c, t.unlock);
      C.news(c, 'Задание выполнено: «' + t.name + '»' + (opened ? '. Открыта тренировка «' + GW.SESSIONS[t.unlock].name + '»' : '') + '.');
      if (out) { out.push('task:' + t.id); if (opened) out.push('session:' + t.unlock); }
    }
    if (!any) break;
  }
  if (out && c.tier < 2) out.push(...C.checkPromotion(c));   // the first stages move on the coach's word, not on a tournament
};

// ---------------------------------------------------------------- the people around you: every one has his own record
C.npcRec = (c, id) => { const r = c.npc[id] = c.npc[id] || { w: 0, l: 0, gold: 0, titles: [], last: [], rank: [] }; r.rank = r.rank || []; return r; };
C.noteNpc = function (c, id, won, vs, where) {
  if (!id || id === 'player') return;
  const r = C.npcRec(c, id);
  if (won) r.w++; else r.l++;
  const vn = vs === 'player' ? c.name : (C.npcById(vs) || {}).name || '?';
  r.last.unshift({ w: c.week, won, vs: vn, at: where }); if (r.last.length > 6) r.last.length = 6;
};
// the rest of a bracket after the player is out: the champion
C.simBracket = function (c, alive, ev) {
  let a = alive.slice();
  while (a.length > 1) {
    const nx = [];
    for (let i = 0; i < a.length; i += 2) {
      const x = a[i], y = a[i + 1]; if (y == null) { nx.push(x); continue; }
      const w = Math.random() < winP(C.lvOf(x, c), C.lvOf(y, c)) ? x : y;
      nx.push(w); C.noteNpc(c, w, true, w === x ? y : x, ev.name); C.noteNpc(c, w === x ? y : x, false, w, ev.name);
    }
    a = nx;
  }
  return a[0];
};
// the weeks go on without you: the events you skipped are fought anyway, the people of your level win and lose
C.worldWeek = function (c) {
  for (const e of GW.EVENTS) {
    if (e.single || e.tier < Math.max(1, c.tier - 1) || e.tier > c.tier + 1) continue;
    if (((c.week - e.at) % e.every + e.every) % e.every !== 0) continue;
    const key = e.id + '@' + c.week; if (c.done[key]) continue;
    c.done[key] = true;
    const pool = GW.ROSTER.filter((x) => (e.tier <= 1 ? x.tier === e.tier : e.tier <= 3 ? x.tier >= e.tier - 1 && x.tier <= e.tier : Math.abs(x.tier - e.tier) <= 1) && (e.tier >= 6 || x.tier <= 5)).map((x) => x.id);
    if (e.tier >= 2) for (const f of C.fillersFor(c, e.tier)) if (pool.length < 8) pool.push(f);
    pool.sort(() => Math.random() - 0.5);
    const size = Math.min(e.size, pool.length >= 8 ? 8 : 4), br = pool.slice(0, size);
    if (br.length < 2) continue;
    const champ = C.simBracket(c, br, e), r = C.npcRec(c, champ), n = C.npcById(champ);
    r.gold++; if (e.title) r.titles.push(e.title); r.rank.push({ w: c.week, pts: GW.TIERS[e.tier].pts });
    if (n && !n.filler && e.tier >= c.tier - 1) C.news(c, e.name + ' без вас: победил ' + n.name + '.');
  }
};
C.npcRankPts = (c, id) => { const r = c.npc[id]; if (!r || !r.rank) return 0; return r.rank.reduce((a, x) => { const d = c.week - x.w; return a + x.pts * (d < 24 ? 1 : d < 72 ? 1 - (d - 24) / 48 : 0); }, 0); };
// the ranking table of your stage
C.rankTable = function (c) {
  const ids = GW.ROSTER.filter((x) => Math.abs(x.tier - c.tier) <= 1 && x.tier >= 1 && (c.tier >= 6 || x.tier <= 5)).map((x) => x.id).concat(c.fillers ? Object.keys(c.fillers).filter((k) => Math.abs(c.fillers[k].tier - c.tier) <= 1) : []);
  const rows = ids.map((id) => ({ id, name: C.npcById(id).name, pts: Math.round(C.npcRankPts(c, id) + C.lvOf(id, c) * 0.4 * GW.TIERS[c.tier].pts / 20), lv: C.lvOf(id, c) }));
  rows.push({ id: 'player', name: c.name, pts: Math.round(C.rankPts(c) + C.ovr(c) * 0.4 * GW.TIERS[c.tier].pts / 20), lv: C.ovr(c) });
  rows.sort((a, b) => b.pts - a.pts);
  return rows;
};
// does the player know where this man is strong and where he is weak
C.knowsStyle = function (c, n) {
  if (!n || n.filler) return false;
  const r = c.rivals[n.id], sp = c.spar[n.id];
  return c.tier >= 5 || c.scouted[n.id] != null || !!(r && (r.l > 0 || r.w + r.l >= 2)) || !!(sp && sp.w + sp.l >= 2);
};

// ---------------------------------------------------------------- sparring partners
C.partners = function (c) {
  const lo = c.tier <= 1 ? 0 : c.tier - 1, hi = Math.max(c.tier, c.tier <= 0 ? 0 : 1);
  return GW.ROSTER.filter((n) => n.tier >= lo && n.tier <= hi);
};
C.partnerK = (c, n) => cl(1 + (C.npcLevel(n, c) - C.ovr(c)) / 20, 0.7, 1.4);
C.settleSpar = function (c, id, won, L) {
  const out = [], s = c.spar[id] = c.spar[id] || { w: 0, l: 0 };
  if (won) s.w++; else s.l++;
  C.noteNpc(c, id, !won, 'player', 'Спарринг в клубе');
  if (L) GW.lastSparL = L;
  C.checkTasks(c, { kind: 'fight', opp: id, won, L, tier: c.tier, spar: true }, out);
  return out;
};
C.drillDone = function (c, r) {
  const out = [];
  C.checkTasks(c, { kind: 'drill', drill: r.kind, score: r.score || 0, hits: r.hits || 0, stood: r.stood || 0, held: r.held || 0 }, out);
  return out;
};

// ---------------------------------------------------------------- the choices of a grown judoka
C.setSpec = function (c, id) {
  if (!GW.SPECS[id]) return false;
  if (c.spec && (c.tier < 6 || c.week - (c.specW || 0) < 24)) return false;
  if (c.tier < 3) return false;
  const was = c.spec; c.spec = id; c.specW = c.week;
  C.news(c, was ? 'Новая специализация: ' + GW.SPECS[id].name + '. Тело перестраивается не сразу.' : 'Специализация: ' + GW.SPECS[id].name + '.');
  const out = []; C.checkTasks(c, { kind: 'spec' }, out); out.push(...C.checkPromotion(c)); C.save();
  return out;
};
C.clubOk = function (c, id) {
  if (id === 'sakura') return '';
  if (id === 'mentor' || id === 'olymp') return c.tier < 4 ? 'с этапа «' + GW.TIERS[4].name + '»' : id === 'olymp' && c.rep < 450 ? 'берут с репутацией 450+' : '';
  if (id === 'elite') return c.tier < 5 ? 'с этапа «' + GW.TIERS[5].name + '»' : !c.natMedal ? 'нужна медаль чемпионата страны' : '';
  return 'нет';
};
C.transfer = function (c, id) {
  if (!GW.CLUBS[id] || c.club === id || C.clubOk(c, id)) return null;
  c.club = id;
  C.news(c, id === 'sakura' ? 'Вы вернулись в «Сакуру». Палыч рад.' : 'Новый зал: ' + GW.CLUBS[id].name + '. Тренер: ' + GW.CLUBS[id].coach + '.');
  const out = []; C.checkTasks(c, { kind: 'transfer', club: id }, out); out.push(...C.checkPromotion(c)); C.save();
  return out;
};
// the weight class: one step up or down, the body changes with it
C.weightOk = function (c, kg) {
  const i = GW.CLASSES.indexOf(c.kg), j = GW.CLASSES.indexOf(kg);
  if (c.tier < 4) return 'с этапа «' + GW.TIERS[4].name + '»';
  if (j < 0 || Math.abs(i - j) !== 1) return 'только в соседнюю категорию';
  if (c.kgW != null && c.week - c.kgW < 24) return 'не чаще раза в полгода (через ' + (24 - (c.week - c.kgW)) + ' нед.)';
  if (c.ev) return 'не во время турнира';
  return '';
};
C.changeWeight = function (c, kg) {
  if (C.weightOk(c, kg)) return false;
  const up = kg > c.kg, a = c.attrs;
  const sh = up ? { power: 4, speed: -3, cardio: -2 } : { power: -4, speed: 2, cardio: 1 };
  for (const [k, v] of Object.entries(sh)) a[k] = cl(a[k] + v, 10, 100);
  C.news(c, 'Вы перешли в категорию ' + kg + ' кг. ' + (up ? 'Тяжелее и сильнее, но медленнее.' : 'Легче и быстрее, но слабее.') + ' Новые соперники, рейтинг заново.');
  c.kg = kg; c.kgW = c.week; c.rank = []; J.opt.kg = kg;
  C.save(); return true;
};
// scouting: the video of the man you will fight next
C.scout = function (c, id) {
  if (c.tier < 4 || !c.ev) return false;
  c.scouted[id] = c.week; if (!c.ev.scouted.includes(id)) c.ev.scouted.push(id);
  C.save(); return true;
};
// what the coach thinks of you
C.coachMood = function (c) {
  const last = c.history.filter((h) => !h.summary).slice(0, 6), w = last.filter((h) => h.won).length;
  const coach = (GW.CLUBS[c.club] || GW.CLUBS.sakura).coach.split(',')[0];
  if (!last.length) return coach + ': «Покажи себя на татами».';
  if (c.fatigue > 70) return coach + ': «Ты загнал себя. Отдохни, иначе травма».';
  if (w >= 5) return coach + ' доволен: «Так держать. Но не зазнавайся».';
  if (w >= 3) return coach + ': «Неплохо. Работай над ошибками из разборов».';
  if (w >= 1) return coach + ' хмурится: «Слишком много поражений. Смотри разборы и меняй план».';
  return coach + ' зол: «Ты не готов. Тренируйся, спарринги со слабыми, потом турниры».';
};
})();

