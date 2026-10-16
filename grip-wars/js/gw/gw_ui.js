//# sourceURL=judo/gw_ui.js
// GRIP WARS: the screens. The main menu, the road to legend (creation, the hub, the training week, the events and the
// bracket, the analysis after a fight, the build, the rivals, the book of the career, the achievements, the legacy)
// and the training hall outside the career.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const GW = window.GW;
const C = GW.Career;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const money = (v) => '$' + Math.round(v).toLocaleString('ru-RU');
const MED = { 1: '🥇', 2: '🥈', 3: '🥉' };
const G = () => window.__UFC__;
const ui = () => G().ui;

// ---------------------------------------------------------------- the look
const css = document.createElement('style');
css.textContent = `
.gw .ladder { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; margin: 10px 0 4px; }
.gw .ladder div { padding: 6px 4px; font-size: 10px; line-height: 1.15; text-align: center; background: rgba(255,255,255,.05); border: 1px solid var(--line); color: var(--dim); min-height: 44px; }
.gw .ladder div.done { color: #cfe; background: rgba(60,160,90,.18); } .gw .ladder div.now { color: #fff; background: rgba(208,36,43,.45); border-color: #fff; }
.gw .ladder i { display: block; height: 6px; margin: 0 auto 4px; width: 70%; border-radius: 3px; }
.gw .prog { height: 8px; background: rgba(255,255,255,.08); margin: 4px 0 10px; } .gw .prog u { display: block; height: 100%; background: var(--gold); }
.gw .twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } @media (max-width: 760px) { .gw .twocol { grid-template-columns: 1fr; } }
.gw .slot { border: 1px solid var(--line); padding: 8px 10px; margin-bottom: 8px; background: rgba(255,255,255,.03); }
.gw .slot h4 { margin: 0 0 6px; font-size: 13px; letter-spacing: .05em; color: var(--gold); }
.gw .chips .chip small { display: block; opacity: .65; font-size: 10px; font-weight: 500; }
.gw .chip[disabled] { opacity: .35; pointer-events: none; }
.gw .perk { border: 1px solid var(--line); padding: 8px 10px; background: rgba(255,255,255,.03); cursor: pointer; }
.gw .perk.on { border-color: var(--gold); background: rgba(232,197,71,.12); }
.gw .perk b { display: block; } .gw .perk .p { color: #8fe39a; font-size: 12px; } .gw .perk .m { color: #ff9a8a; font-size: 12px; }
.gw .perks { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.gw .attr { display: grid; grid-template-columns: 110px 1fr 40px 38px; gap: 8px; align-items: center; font-size: 13px; margin: 4px 0; }
.gw .attr i { height: 9px; background: rgba(255,255,255,.08); display: block; } .gw .attr i u { display: block; height: 100%; background: var(--gold); }
.gw .attr button { padding: 2px 0; font-weight: 800; }
.gw table.st { width: 100%; border-collapse: collapse; font-size: 13px; } .gw table.st td { padding: 5px 6px; border-bottom: 1px solid var(--line); } .gw table.st td:last-child { text-align: right; color: #fff; }
.gw .tip { border-left: 3px solid #ff8a6a; background: rgba(255,120,90,.08); padding: 8px 10px; margin: 6px 0; font-size: 13px; line-height: 1.45; }
.gw .good { border-left: 3px solid #7fe08a; background: rgba(120,220,140,.08); padding: 8px 10px; margin: 6px 0; font-size: 13px; }
.gw .big { font: 900 34px/1 var(--head, system-ui); letter-spacing: .04em; margin: 4px 0 6px; } .gw .big.win { color: #8fe39a; } .gw .big.loss { color: #ff8a80; }
.gw .ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.gw .ach div { padding: 8px 10px; border: 1px solid var(--line); font-size: 12px; opacity: .45; } .gw .ach div.on { opacity: 1; border-color: var(--gold); background: rgba(232,197,71,.08); }
.gw .ach b { display: block; font-size: 13px; }
.gw .opp { border: 1px solid var(--line); padding: 10px 12px; background: rgba(255,255,255,.04); }
.gw .opp .tp { display: inline-block; padding: 2px 8px; background: var(--red); color: #fff; font-size: 11px; font-weight: 800; letter-spacing: .06em; margin-right: 6px; }
.gw .news div { font-size: 12px; color: var(--dim); padding: 3px 0; border-bottom: 1px dashed rgba(255,255,255,.07); }
#scr-menu .logo small.gwsub { display: block; letter-spacing: .3em; }
`;
document.head.appendChild(css);

function screen(id) {
  let s = document.getElementById(id);
  if (!s) {
    s = document.createElement('div'); s.className = 'screen hidden'; s.id = id; s.innerHTML = '<div class="panel jc gw"></div>';
    ui().root.appendChild(s); s.addEventListener('click', onClick);
    s.addEventListener('input', (e) => { if (e.target.id === 'gw-name') spec.name = e.target.value; });
  }
  return s.querySelector('.gw');
}
const bar = (v, max) => '<div class="prog"><u style="width:' + cl(v / Math.max(1, max)) * 100 + '%"></u></div>';
const typeTag = (t) => '<span class="tp">' + esc(GW.TYPES[t].short) + '</span>';
const beltDot = (t) => '<i style="background:#' + C.beltColor(t).toString(16).padStart(6, '0') + '"></i>';

// ---------------------------------------------------------------- creation
const spec = { name: '', cc: 'RUS', kg: 66, face: null, gi: 'white', origin: 'tech' };
function renderCreate(p) {
  const faces = J.CLASSES[spec.kg] || J.CLASSES[66];
  if (spec.face == null || !faces.includes(spec.face)) spec.face = faces[0];
  const ch = (act, v, cur, label, sub) => '<button class="chip' + (v === cur ? ' on' : '') + '" data-act="' + act + '" data-v="' + v + '">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  p.innerHTML = '<h2>GRIP WARS · Путь легенды</h2><div class="dim">Вам 17. Маленький клуб в подвале спорткомплекса, старые татами и тренер Палыч. Восемь ступеней — до легенды мирового дзюдо.</div>' +
    '<div class="opt"><label>Имя и фамилия</label><input class="txt" id="gw-name" maxlength="24" value="' + esc(spec.name) + '" placeholder="Например, Иван Волков"></div>' +
    '<div class="opt"><label>Страна</label><div class="chips">' + ['RUS', 'KAZ', 'UZB', 'GEO', 'AZE', 'KOR', 'JPN', 'FRA'].map((k) => ch('cc', k, spec.cc, GW.CC[k])).join('') + '</div></div>' +
    '<div class="opt"><label>Весовая категория</label><div class="chips">' + GW.CLASSES.map((k) => ch('kg', String(k), String(spec.kg), k + ' кг')).join('') + '</div></div>' +
    '<div class="opt"><label>Внешность</label><div class="chips">' + faces.map((i, n) => ch('face', String(i), String(spec.face), 'Вариант ' + (n + 1))).join('') + '</div></div>' +
    '<div class="opt"><label>Кимоно</label><div class="chips">' + ch('gi', 'white', spec.gi, 'Белое') + ch('gi', 'blue', spec.gi, 'Синее') + '</div></div>' +
    '<div class="opt"><label>Откуда вы пришли (стартовый билд)</label><div class="chips">' + Object.entries(GW.ORIGINS).map(([k, o]) => ch('origin', k, spec.origin, o.name, o.desc)).join('') + '</div></div>' +
    '<div class="foot"><button class="btn primary" data-act="create">Начать путь</button><button class="btn" data-act="back">‹ Назад</button></div>';
  const g = G(); if (g.showPreview) g.showPreview(Object.assign({}, UFC.fighterCfg(spec.face), { gi: spec.gi, belt: C.beltColor(0) }));
}

// ---------------------------------------------------------------- the hub
function renderHub() {
  const p = screen('scr-gw'), c = GW.c || C.load();   // the live career; the save is only read once
  if (!c) return renderCreate(p);
  if (c.retired) return renderLegacy(p, c);
  const T = GW.TIERS[c.tier], next = GW.TIERS[c.tier + 1];
  const ladder = GW.TIERS.map((t, i) => '<div class="' + (i < c.tier ? 'done' : i === c.tier ? 'now' : '') + '">' + beltDot(i) + esc(t.name) + '</div>').join('');
  const evs = C.eventsAround(c), now = evs.filter((e) => e.inWeeks === 0), later = evs.filter((e) => e.inWeeks > 0);
  const evRow = (e) => '<div class="ev"><div><b>' + esc(e.name) + '</b><small>' + GW.TIERS[e.tier].name + ' · сетка на ' + e.size + (e.fee ? ' · взнос ' + money(e.fee) : '') + ' · за золото ' + money(GW.TIERS[e.tier].prize * (e.size >= 16 ? 1.3 : 1)) + (e.title ? ' · титул «' + e.title + '»' : '') + '</small></div>' +
    (e.inWeeks === 0 ? (c.injury > 0 ? '<span class="bad">травма</span>' : c.money < (e.fee || 0) ? '<span class="bad">нет денег на взнос</span>' : '<button class="btn primary" data-act="enter" data-v="' + e.key + '">Выступить</button>') : '<span class="dim">через ' + e.inWeeks + ' нед.</span>') + '</div>';
  const pot = C.potential(c), sum = Math.round(C.attrSum(c));
  p.innerHTML = '<h2>' + esc(c.name) + '</h2><div class="dim">' + GW.CC[c.cc] + ' · ' + c.kg + ' кг · ' + c.age + ' лет (прайм ' + (c.prime - 2) + '–' + (c.prime + 2) + ') · ' + C.date(c) + ' · ' + GW.BELTS[c.tier].name + '</div>' +
    '<div class="ladder">' + ladder + '</div>' +
    '<div class="note"><b>' + esc(T.name) + '</b> — ' + esc(T.text) + (next ? '<br>Дальше: <b>' + esc(next.name) + '</b>. Нужно: репутация ' + c.rep + '/' + T.rep + ' и медаль на турнире этого уровня ' + (c.medalAt[c.tier] ? '✔' : '✘') + '.' : '<br>Вершина. Защищайте титул и копите наследие: ' + C.legacy(c) + ' очков (' + C.legacyName(C.legacy(c)) + ').') + '</div>' +
    (next ? bar(c.rep, T.rep) : '') +
    '<div class="row"><div class="card"><span>Уровень</span><b>' + c.level + '</b><small class="dim">опыт ' + c.xp + '/' + C.xpNeed(c.level) + '</small></div><div class="card"><span>Репутация</span><b>' + c.rep + '</b></div><div class="card"><span>Деньги</span><b>' + money(c.money) + '</b></div><div class="card"><span>Рейтинг-очки</span><b>' + Math.round(C.rankPts(c)) + '</b></div><div class="card"><span>Общий</span><b>' + C.ovr(c) + '</b><small class="dim">потенциал ' + sum + '/' + pot + '</small></div><div class="card"><span>Усталость</span><b style="color:' + (c.fatigue > 65 ? '#ff8a80' : c.fatigue > 40 ? '#f0c82c' : '#8fe39a') + '">' + Math.round(c.fatigue) + '</b><small class="dim">' + (c.injury > 0 ? 'травма: ' + c.injuryPart + ', ' + c.injury + ' нед.' : c.fatigue > 65 ? 'риск травмы' : 'норма') + '</small></div></div>' +
    (c.ev && c.ev.state !== 'done' ? '<div class="foot"><button class="btn primary" data-act="toev">Продолжить: ' + esc(c.ev.name) + '</button></div>' : '') +
    '<h3>Эта неделя</h3><div class="evs">' + (now.map(evRow).join('') || '<div class="ev"><div>Турниров на этой неделе нет — время тренироваться.</div></div>') + '</div>' +
    '<div class="foot"><button class="btn primary" data-act="week">Тренировочная неделя</button><button class="btn" data-act="build">Билд' + (c.pts ? ' (+' + c.pts + ')' : '') + '</button><button class="btn" data-act="rivals">Соперники и реванши' + (C.rematches(c).length ? ' (' + C.rematches(c).length + ')' : '') + '</button><button class="btn" data-act="book">Статистика</button><button class="btn" data-act="ach">Достижения</button><button class="btn" data-act="buttons">Кнопки приёмов</button></div>' +
    (later.length ? '<h3>Скоро</h3><div class="evs">' + later.map(evRow).join('') + '</div>' : '') +
    '<h3>Новости</h3><div class="news">' + c.news.slice(0, 6).map((n) => '<div>' + esc(C.date(c, n.w)) + ' — ' + esc(n.t) + '</div>').join('') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Меню</button>' + (c.tier >= 2 || c.age >= 30 ? '<button class="btn" data-act="retire">Завершить карьеру</button>' : '') + '<button class="btn" data-act="wipe">Удалить карьеру</button></div>';
  const g = G(); if (g.showPreview) g.showPreview(Object.assign({}, C.playerCfg(c), { gi: c.gi }));
}

// ---------------------------------------------------------------- the training week
let plan = null;
function newPlan(c) { return { slots: c.injury > 0 ? ['tech', 'recovery', 'tech'] : ['grip', 'uchikomi', 'recovery'], tech: J.loadout[0] || 'podhvat', play: true, mult: [], spar: [] }; }
function renderWeek() {
  const p = screen('scr-gw-week'), c = GW.c;
  if (!plan) plan = newPlan(c);
  const fatAfter = cl(plan.slots.reduce((a, s) => a + GW.SESSIONS[s].fat, c.fatigue) - (c.physio ? 24 : 12), 0, 100);
  const slot = (i) => '<div class="slot"><h4>Тренировка ' + (i + 1) + '</h4><div class="chips">' + Object.entries(GW.SESSIONS).map(([k, S]) =>
    '<button class="chip' + (plan.slots[i] === k ? ' on' : '') + '" data-act="slot" data-i="' + i + '" data-v="' + k + '"' + (c.injury > 0 && S.fat >= 14 ? ' disabled' : '') + '>' + S.name + '<small>' + S.desc + '</small></button>').join('') + '</div></div>';
  const coachRows = GW.COACHES.map((co, i) => i <= c.coach ? '' : '<button class="chip" data-act="coach" data-v="' + i + '"' + (c.tier < co.tier || c.money < co.price ? ' disabled' : '') + '>' + co.name + '<small>×' + co.mult + ' к росту · ' + money(co.price) + (c.tier < co.tier ? ' · с уровня ' + (co.tier + 1) : '') + '</small></button>').join('');
  p.innerHTML = '<h2>Тренировочная неделя</h2><div class="dim">' + C.date(c) + ' · три тренировки. Мини-игры дают рост ×0.5–1.8 в зависимости от того, как вы их пройдёте; без мини-игры — ×0.65.</div>' +
    [0, 1, 2].map(slot).join('') +
    (plan.slots.includes('uchikomi') ? '<div class="opt"><label>Бросок для отработки</label><div class="chips">' + J.TECH_ORDER.map((id) => '<button class="chip' + (plan.tech === id ? ' on' : '') + '" data-act="tech" data-v="' + id + '">' + J.TECHS[id].name + '<small>мастерство ' + Math.round(c.mastery[id] || 10) + '</small></button>').join('') + '</div></div>' : '') +
    '<div class="opt"><label>Мини-игры на татами</label><div class="chips"><button class="chip' + (plan.play ? ' on' : '') + '" data-act="play" data-v="1">Играть (лучше рост)</button><button class="chip' + (!plan.play ? ' on' : '') + '" data-act="play" data-v="0">Быстро (×0.65)</button></div></div>' +
    '<div class="opt"><label>Штаб · тренер сейчас: ' + GW.COACHES[c.coach].name + ' (×' + GW.COACHES[c.coach].mult + ')</label><div class="chips">' + (coachRows || '<span class="dim">лучший тренер уже с вами</span>') +
    '<button class="chip' + (c.physio ? ' on' : '') + '" data-act="physio">Физиотерапевт<small>' + (c.physio ? 'нанят' : 'не нанят') + ' · −12 усталости в неделю, риск травмы ниже · ' + money(40 * (c.tier + 1)) + '/нед.</small></button></div></div>' +
    '<div class="note">Усталость сейчас ' + Math.round(c.fatigue) + ' → к концу недели ≈ ' + Math.round(fatAfter) + '. Выше 45 рост слабее, выше 65 — риск травмы на тяжёлых тренировках, а в схватке меньше дыхалки.</div>' +
    '<div class="foot"><button class="btn primary" data-act="runweek">Начать неделю</button><button class="btn" data-act="back">‹ Назад</button></div>';
}
// run the week: the drills one by one on the mat, then the numbers
function runWeek() {
  const c = GW.c;
  plan.mult = []; plan.spar = [];
  const queue = plan.slots.map((s, i) => [s, i]).filter(([s]) => plan.play && GW.SESSIONS[s].drill && !(c.injury > 0 && GW.SESSIONS[s].fat >= 14));
  const nextDrill = () => {
    const it = queue.shift();
    if (!it) return finishWeek();
    const [s, i] = it, S = GW.SESSIONS[s];
    const partner = sparPartner(c), pc = C.playerCfg(c), oc = C.npcCfg(partner, c), lvl = Math.min(3, Math.floor(c.tier / 2));
    UFC.fuel = { gly: 60 + c.attrs.cardio * 1.4, acid: 60 + c.attrs.cardio * 1.4 };
    const done = (r) => { plan.mult[i] = r.mult; lastDrills.push({ name: S.name, text: r.text }); nextDrill(); };
    if (S.drill === 'grip') GW.Drills.grip(pc, oc, lvl, done);
    else if (S.drill === 'uchikomi') GW.Drills.uchikomi(pc, oc, lvl, plan.tech, done);
    else if (S.drill === 'newaza') GW.Drills.newaza(pc, oc, lvl, done);
    else if (S.drill === 'sparring') sparring(c, partner, lvl, (won, text) => { plan.spar[i] = won; plan.mult[i] = 1; lastDrills.push({ name: 'Спарринг с ' + partner.name, text: (won ? 'победа' : 'поражение') + (text ? ' · ' + text.split(' · ')[0] : '') }); nextDrill(); });
  };
  lastDrills = [];
  nextDrill();
}
let lastDrills = [], lastWeek = null;
function finishWeek() {
  const c = GW.c;
  lastWeek = C.runWeek(c, plan);
  plan = null;
  ui().go('scr-gw-wres', null, { reset: true });
}
function sparPartner(c) {
  const list = GW.ROSTER.filter((n) => n.tier <= c.tier && n.tier >= c.tier - 1);
  return list[(Math.random() * list.length) | 0] || GW.ROSTER[0];
}
function sparring(c, partner, lvl, cb) {
  const g = G();
  J.setVenue('europe'); J.opt.gi = c.gi; J.opt.name = c.short.toUpperCase();
  let res = null;
  g.onResultContinue = () => g.quitToMenu();
  g.onQuit = () => cb(res ? res.won : false, res ? res.text : 'снялся');
  g.startQuickFight(C.playerCfg(c), C.npcCfg(partner, c), Object.assign({}, g.ui.settings, { difficulty: lvl }), { gw: true, sparring: true, event: 'Спарринг', onEnd: (fight) => { res = { won: !!fight.won, text: fight.methodText || '' }; } });
}
function renderWeekRes() {
  const p = screen('scr-gw-wres'), c = GW.c, r = lastWeek || { gains: {}, xp: 0 };
  const rows = Object.entries(r.gains).filter(([, v]) => v > 0.05).map(([k, v]) => '<tr><td>' + (k.startsWith('m:') ? 'Мастерство «' + J.TECHS[k.slice(2)].name + '»' : GW.ATTRS[k].name) + '</td><td>+' + v.toFixed(1) + '</td></tr>').join('');
  p.innerHTML = '<h2>Неделя позади</h2><div class="dim">' + C.date(c) + '</div>' +
    (lastDrills.length ? '<h3>На татами</h3>' + lastDrills.map((d) => '<div class="good"><b>' + esc(d.name) + '</b>: ' + esc(d.text) + '</div>').join('') : '') +
    '<h3>Рост</h3><table class="st">' + (rows || '<tr><td>Ничего заметного (усталость, потенциал или травма)</td><td></td></tr>') + '<tr><td>Опыт</td><td>+' + r.xp + '</td></tr><tr><td>Усталость</td><td>' + Math.round(c.fatigue) + '</td></tr></table>' +
    (C.attrSum(c) >= C.potential(c) - 1 ? '<div class="note">Вы упёрлись в потенциал (' + C.potential(c) + '). Он растёт с уровнем и с каждой новой ступенью карьеры — или переложите силы в другой билд.</div>' : '') +
    '<div class="foot"><button class="btn primary" data-act="tohub">Дальше</button></div>';
}

// ---------------------------------------------------------------- the event and the bracket
function renderEvent() {
  const p = screen('scr-gw-ev'), c = GW.c, ev = c && c.ev;
  if (!ev) { p.innerHTML = '<h2>Турнира нет</h2><div class="foot"><button class="btn" data-act="tohub">К карьере</button></div>'; return; }
  const rows = ev.results.map((r) => '<div class="' + (r.won ? 'w' : 'l') + '">' + esc(r.round) + ': ' + esc(r.op) + ' — ' + (r.won ? 'победа' : 'поражение') + ' <span class="dim">(' + esc((r.text || '').split(' · ')[0]) + ')</span></div>').join('');
  let body = '';
  if (ev.state !== 'over') {
    const n = C.npcById(C.nextOpponent(c)), r = c.rivals[n.id];
    body = '<h3>' + esc(ev.single ? 'Реванш' : C.roundName(ev)) + '</h3><div class="opp">' + typeTag(n.type) + '<b>' + esc(n.name) + '</b> · ' + GW.CC[n.cc] + ' · уровень ' + C.npcLevel(n, c) + ' · ' + GW.BELTS[Math.min(7, n.tier)].name +
      '<div class="dim" style="margin-top:6px">' + esc(GW.TYPES[n.type].desc) + '</div><div style="margin-top:4px">Любимые броски: <b>' + n.fav.map((t) => J.TECHS[t].name).join(', ') + '</b>' + (r ? ' · ваши встречи: ' + r.w + '–' + r.l : ' · вы не встречались') + '</div><div class="dim" style="margin-top:4px">' + esc(n.bio) + '</div></div>' +
      (c.fatigue > 45 ? '<div class="note">Усталость ' + Math.round(c.fatigue) + ': дыхалки в схватке будет меньше.</div>' : '') +
      '<div class="foot"><button class="btn primary" data-act="fight">На татами</button><button class="btn" data-act="tohub">‹ К карьере</button></div>';
  } else {
    const T = GW.TIERS[ev.tier];
    body = '<div class="big ' + (ev.place <= 3 ? 'win' : 'loss') + '">' + (ev.single ? (ev.place === 1 ? 'РЕВАНШ ВЗЯТ' : 'РЕВАНШ ПРОИГРАН') : ev.exam ? (ev.wins >= 1 ? 'АТТЕСТАЦИЯ СДАНА' : 'АТТЕСТАЦИЯ НЕ СДАНА') : (ev.place <= 3 ? MED[ev.place] + ' ' : '') + ev.place + ' МЕСТО') + '</div>' +
      '<table class="st"><tr><td>Призовые</td><td>' + money(ev.prize || 0) + '</td></tr><tr><td>Репутация</td><td>+' + (ev.rep || 0) + '</td></tr><tr><td>Рейтинг-очки</td><td>+' + (ev.pts || 0) + '</td></tr>' + (ev.champion && ev.place > 2 ? '<tr><td>Победитель турнира</td><td>' + esc(C.npcById(ev.champion).name) + '</td></tr>' : '') + '</table>' +
      unlockedHtml(ev.unlocked) +
      '<div class="foot">' + (ev.place <= 3 && !ev.single && !ev.exam && !ev.podium && ev.tier >= 1 ? '<button class="btn primary" data-act="podium">Пьедестал</button>' : '') + '<button class="btn' + (ev.place <= 3 && !ev.single && !ev.exam && !ev.podium && ev.tier >= 1 ? '' : ' primary') + '" data-act="evdone">Дальше</button></div>';
    void T;
  }
  p.innerHTML = '<h2>' + esc(ev.name) + '</h2><div class="dim">' + GW.TIERS[ev.tier].name + (ev.single ? '' : ev.exam ? ' · две аттестационные схватки' : ' · сетка на ' + ev.size) + '</div><div class="br">' + rows + '</div>' + body +
    (ev.log.length ? '<h3>Другие схватки</h3><div class="news">' + ev.log.slice(-6).map((l) => '<div>' + esc(l) + '</div>').join('') + '</div>' : '');
}
function unlockedHtml(list) {
  if (!list || !list.length) return '';
  return list.map((u) => {
    if (u.startsWith('tier:')) { const t = +u.slice(5); return '<div class="good"><b>НОВАЯ СТУПЕНЬ: ' + esc(GW.TIERS[t].name) + '</b> · ' + esc(GW.BELTS[t].name) + '</div>'; }
    if (u.startsWith('ch:')) { const ch = GW.CHALLENGES.find((x) => x.id === u.slice(3)); return ch ? '<div class="good">Испытание выполнено: <b>' + esc(ch.name) + '</b></div>' : ''; }
    const a = GW.ACH[u]; return a ? '<div class="good">Достижение: <b>' + esc(a.name) + '</b> — ' + esc(a.desc) + '</div>' : '';
  }).join('');
}
// a fight of the career: on the mat, then the analysis
function careerFight() {
  const g = G(), c = GW.c, ev = c.ev, oppId = C.nextOpponent(c), n = C.npcById(oppId);
  const final = C.isFinal(c);
  J.setVenue(GW.TIERS[ev.tier].venue); J.opt.gi = c.gi; J.opt.name = c.short.toUpperCase();
  UFC.fuel = { gly: 60 + c.attrs.cardio * 1.4, acid: 60 + c.attrs.cardio * 1.4 };
  const lvl = Math.min(3, [0, 0, 1, 1, 2, 2, 3, 3][ev.tier] + (final ? 1 : 0));
  let settled = false;
  const finish = (won, text) => {
    if (settled) return; settled = true;
    const L = GW.log, info = { final, round: C.roundName(ev) };
    const res = C.settleFight(c, won, text, L, oppId, info);
    GW.post = { won, text, opp: n, a: GW.analyze(L, won, { cfg: { gwType: n.type } }), xp: res.xp, unlocked: res.unlocked, round: info.round, ev: ev.name };
    if (ev.single) C.settleSingle(c, won); else C.advance(c, won);
  };
  g.onResultContinue = () => g.quitToMenu();
  g.onQuit = () => { finish(false, 'Снялся со схватки'); ui().go('scr-gw-post', null, { reset: true }); };
  g.startQuickFight(C.playerCfg(c), C.npcCfg(n, c), Object.assign({}, g.ui.settings, { difficulty: lvl }), { gw: true, event: ev.name, final, onEnd: (fight) => finish(!!fight.won, fight.methodText || '') });
  if (g.p1 && c.fatigue > 30) { g.p1.staminaCap = Math.round(g.p1.staminaCap * (1 - (c.fatigue - 30) / 200)); g.p1.stamina = Math.min(g.p1.stamina, g.p1.staminaCap); }
}
function renderPost() {
  const p = screen('scr-gw-post'), P = GW.post;
  if (!P) { p.innerHTML = '<div class="foot"><button class="btn" data-act="tohub">К карьере</button></div>'; return; }
  const a = P.a;
  p.innerHTML = '<div class="dim">' + esc(P.ev) + ' · ' + esc(P.round) + ' · ' + esc(P.opp.name) + ' (' + esc(GW.TYPES[P.opp.type].name) + ')</div>' +
    '<div class="big ' + (P.won ? 'win' : 'loss') + '">' + (P.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ') + '</div><div>' + esc(P.text) + ' · опыт +' + P.xp + '</div>' +
    '<div class="twocol"><div><h3>Разбор схватки</h3><table class="st">' + a.lines.map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('') + '</table></div>' +
    '<div>' + (a.good.length ? '<h3>Что получилось</h3>' + a.good.map((t) => '<div class="good">' + esc(t) + '</div>').join('') : '') +
    (a.tips.length ? '<h3>' + (P.won ? 'Что улучшить' : 'Почему проиграли и что менять') + '</h3>' + a.tips.map((t) => '<div class="tip">' + esc(t) + '</div>').join('') : '') + '</div></div>' +
    unlockedHtml(P.unlocked) +
    (!P.won ? '<div class="note">Поражение не обнуляет прогресс: опыт и рейтинг остаются. ' + esc(P.opp.name) + ' теперь в списке соперников — реванш доступен в «Соперники и реванши».</div>' : '') +
    '<div class="foot"><button class="btn primary" data-act="afterpost">Дальше</button></div>';
}
function showPodium() {
  const g = G(), c = GW.c, ev = c.ev;
  const me = Object.assign({}, C.playerCfg(c), { gi: c.gi });
  const others = GW.ROSTER.filter((n) => Math.abs(n.tier - ev.tier) <= 1).sort(() => Math.random() - 0.5).slice(0, 3).map((n) => Object.assign(C.npcCfg(n, c), { gi: Math.random() < 0.5 ? 'white' : 'blue' }));
  const order = [others[0], others[1], others[2], Object.assign({}, others[2])];
  order[ev.place === 1 ? 0 : ev.place === 2 ? 1 : 2] = me;
  ev.podium = true; C.save();
  g.ui.hideAll();
  J.podium(g, order, ev.name, () => { g.ui.go('scr-gw-ev', null, { reset: true }); });
}

// ---------------------------------------------------------------- the build
function renderBuild() {
  const p = screen('scr-gw-build'), c = GW.c, pot = C.potential(c), sum = C.attrSum(c), slots = C.perkSlots(c);
  p.innerHTML = '<h2>Билд</h2><div class="dim">Свободных очков: <b>' + c.pts + '</b> · сумма характеристик ' + Math.round(sum) + ' из потенциала ' + pot + '. Потенциал растёт с уровнем и с каждой ступенью карьеры: всё прокачать нельзя — выбирайте, каким будет ваше дзюдо.</div>' +
    bar(sum, pot) +
    GW.ATTR_KEYS.map((k) => '<div class="attr"><span title="' + esc(GW.ATTRS[k].desc) + '">' + GW.ATTRS[k].name + '</span><i><u style="width:' + c.attrs[k] + '%"></u></i><b>' + Math.round(c.attrs[k]) + '</b><button class="btn small" data-act="spend" data-v="' + k + '"' + (c.pts && sum < pot && c.attrs[k] < 100 ? '' : ' disabled') + '>+</button></div>').join('') +
    '<div class="dim" style="margin-top:4px">' + GW.ATTR_KEYS.map((k) => GW.ATTRS[k].name + ' — ' + GW.ATTRS[k].desc).join(' · ') + '</div>' +
    '<h3>Перки · слотов ' + c.perks.length + '/' + slots + '</h3><div class="dim">Слоты открываются на уровнях ' + GW.PERK_SLOTS.join(', ') + '. У каждого перка есть цена.</div><div class="perks">' +
    Object.entries(GW.PERKS).map(([id, P]) => '<div class="perk' + (c.perks.includes(id) ? ' on' : '') + '" data-act="perk" data-v="' + id + '"><b>' + P.name + '</b><span class="p">+ ' + esc(P.plus) + '</span><br><span class="m">− ' + esc(P.minus) + '</span></div>').join('') + '</div>' +
    '<h3>Мастерство бросков</h3><div class="bars">' + J.TECH_ORDER.map((id) => '<div class="bar2"><span>' + J.TECHS[id].name + '</span><i><u style="width:' + Math.round(c.mastery[id] || 10) + '%"></u></i><b>' + Math.round(c.mastery[id] || 10) + '</b></div>').join('') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Назад</button></div>';
}

// ---------------------------------------------------------------- the rivals
function renderRivals() {
  const p = screen('scr-gw-rivals'), c = GW.c;
  const rm = C.rematches(c);
  const met = Object.entries(c.rivals).map(([id, r]) => ({ n: C.npcById(id), r })).filter((x) => x.n).sort((a, b) => (b.r.w + b.r.l) - (a.r.w + a.r.l));
  const scout = GW.ROSTER.filter((n) => n.tier >= c.tier - 1 && n.tier <= c.tier + 1);
  const card = (n, extra) => '<div class="ev"><div>' + typeTag(n.type) + '<b>' + esc(n.name) + '</b> <span class="dim">' + GW.CC[n.cc] + ' · уровень ' + C.npcLevel(n, c) + ' · ' + esc(GW.TIERS[Math.min(7, n.tier)].name) + '</span><small>' + n.fav.map((t) => J.TECHS[t].name).join(', ') + ' · ' + esc(n.bio) + '</small></div>' + (extra || '') + '</div>';
  p.innerHTML = '<h2>Соперники и реванши</h2>' +
    '<h3>Реванш</h3><div class="evs">' + (rm.length ? rm.map(({ n, r }) => card(n, '<span>' + r.w + '–' + r.l + '</span>' + (c.injury > 0 ? '<span class="bad">травма</span>' : '<button class="btn primary" data-act="rematch" data-v="' + n.id + '">Реванш (неделя)</button>'))).join('') : '<div class="ev"><div>Нет долгов. Кто победит вас — появится здесь.</div></div>') + '</div>' +
    '<h3>Ваши встречи</h3><div class="evs">' + (met.map(({ n, r }) => card(n, '<b>' + r.w + '–' + r.l + '</b>')).join('') || '<div class="ev"><div>Пока ни одной схватки.</div></div>') + '</div>' +
    '<h3>Кто есть кто на вашем уровне</h3><div class="evs">' + scout.map((n) => card(n)).join('') + '</div>' +
    '<h3>Пять типов соперников</h3><div class="evs">' + Object.entries(GW.TYPES).map(([k, t]) => '<div class="ev"><div>' + typeTag(k) + '<b>' + t.name + '</b><small>' + esc(t.desc) + '</small></div>' + (c.typesBeaten[k] ? '<span class="good">побеждён</span>' : '') + '</div>').join('') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Назад</button></div>';
}

// ---------------------------------------------------------------- the book
function renderBook() {
  const p = screen('scr-gw-book'), c = GW.c, s = c.stats;
  const r = c.records, m = C.meta().records || {};
  p.innerHTML = '<h2>Статистика и история</h2>' +
    '<div class="twocol"><div><table class="st"><tr><td>Схваток</td><td>' + s.fights + '</td></tr><tr><td>Победы / поражения</td><td>' + s.wins + ' / ' + s.losses + '</td></tr><tr><td>Иппон бросками</td><td>' + s.ippons + '</td></tr><tr><td>Удержаниями / сдачей</td><td>' + s.holds + ' / ' + s.subs + '</td></tr><tr><td>Победы в золотом скоре</td><td>' + s.golden + '</td></tr><tr><td>Лучшая серия</td><td>' + s.best + '</td></tr><tr><td>Попыток бросков / прошло</td><td>' + s.tries + ' / ' + s.landed + '</td></tr><tr><td>Турниров / золото</td><td>' + s.events + ' / ' + s.golds + '</td></tr><tr><td>Медали</td><td>' + (c.medals.map((x) => MED[x.place]).join('') || '—') + '</td></tr><tr><td>Титулы</td><td>' + (c.titles.map((t) => t.name).join(', ') || '—') + '</td></tr></table></div>' +
    '<div><h3>Рекорды</h3><table class="st"><tr><td>Самый быстрый иппон (карьера)</td><td>' + (r.fastest ? r.fastest.s + ' с · ' + esc(r.fastest.tech) : '—') + '</td></tr><tr><td>Самый быстрый иппон (все карьеры)</td><td>' + (m.fastest ? m.fastest.s + ' с · ' + esc(m.fastest.who) : '—') + '</td></tr><tr><td>Лучшая серия (все карьеры)</td><td>' + (m.streak ? m.streak.n + ' · ' + esc(m.streak.who) : '—') + '</td></tr><tr><td>Больше всех титулов</td><td>' + (m.titles ? m.titles.n + ' · ' + esc(m.titles.who) : '—') + '</td></tr></table></div></div>' +
    '<h3>История</h3><div class="evs">' + c.history.slice(0, 30).map((h) => h.summary ? '<div class="ev"><div><b>' + esc(h.ev) + '</b><small>' + C.date(c, h.w) + '</small></div><div>' + (h.place <= 3 ? MED[h.place] + ' ' : '') + h.place + ' место · +' + h.rep + ' реп.</div></div>' :
      '<div class="ev"><div>' + (h.won ? '✔' : '✘') + ' ' + esc(h.op) + ' <span class="dim">(' + esc(GW.TYPES[h.opType].short) + ', ур. ' + h.opLv + ')</span><small>' + esc(h.ev) + ' · ' + esc(h.round) + ' · ' + C.date(c, h.w) + '</small></div><div class="dim">' + esc((h.text || '').split(' · ')[0]) + '</div></div>').join('') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Назад</button></div>';
}

// ---------------------------------------------------------------- achievements, challenges, the hall of fame
function renderAch() {
  const p = screen('scr-gw-ach'), c = GW.c || C.load(), m = C.meta();
  const mine = (c && c.achievements) || {};
  p.innerHTML = '<h2>Достижения и испытания</h2>' +
    '<div class="dim">В этой карьере: ' + Object.keys(mine).length + ' из ' + Object.keys(GW.ACH).length + ' · во всех карьерах: ' + Object.keys(m.ach || {}).length + '</div>' +
    '<div class="ach">' + Object.entries(GW.ACH).map(([id, a]) => '<div class="' + (mine[id] != null || (m.ach && m.ach[id]) ? 'on' : '') + '"><b>' + (mine[id] != null ? '★ ' : (m.ach && m.ach[id]) ? '☆ ' : '') + esc(a.name) + '</b>' + esc(a.desc) + '</div>').join('') + '</div>' +
    (c ? '<h3>Карьерные испытания</h3><div class="evs">' + GW.CHALLENGES.map((ch) => '<div class="ev"><div><b>' + esc(ch.name) + '</b> <span class="dim">с уровня «' + esc(GW.TIERS[ch.tier].name) + '»</span><small>' + esc(ch.desc) + ' · награда: ' + [ch.reward.rep ? '+' + ch.reward.rep + ' реп.' : '', ch.reward.xp ? '+' + ch.reward.xp + ' опыта' : '', ch.reward.money ? money(ch.reward.money) : ''].filter(Boolean).join(', ') + '</small></div>' + (c.challenges[ch.id] != null ? '<span class="good">выполнено</span>' : c.tier < ch.tier ? '<span class="dim">закрыто</span>' : '<span>в работе</span>') + '</div>').join('') + '</div>' : '') +
    '<h3>Зал славы</h3><div class="evs">' + ((m.hall || []).map((h, i) => '<div class="ev"><div>' + (i + 1) + '. <b>' + esc(h.name) + '</b> <span class="dim">' + (GW.CC[h.cc] || '') + ' · ' + h.kg + ' кг · ' + esc(h.rank) + '</span><small>' + (h.titles.join(', ') || 'без титулов') + ' · медалей ' + h.medals + ' · побед ' + h.wins + ' из ' + h.fights + '</small></div><b>' + h.legacy + '</b></div>').join('') || '<div class="ev"><div>Пусто. Завершите карьеру — и она займёт место здесь.</div></div>') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Назад</button></div>';
}
function renderLegacy(p, c) {
  const pts = C.legacy(c);
  p.innerHTML = '<h2>' + esc(c.name) + ' · карьера завершена</h2><div class="dim">' + GW.CC[c.cc] + ' · ' + c.kg + ' кг · ' + c.age + ' лет · ' + C.date(c) + '</div>' +
    '<div class="big win">' + esc(C.legacyName(pts)) + '</div><div>Очки наследия: <b>' + pts + '</b></div>' +
    '<div class="row"><div class="card"><span>Ступень</span><b>' + esc(GW.TIERS[c.tier].name) + '</b></div><div class="card"><span>Победы</span><b>' + c.stats.wins + '/' + c.stats.fights + '</b></div><div class="card"><span>Медали</span><b>' + c.medals.length + '</b></div><div class="card"><span>Титулы</span><b>' + c.titles.length + '</b></div><div class="card"><span>Защит титула</span><b>' + c.defenses + '</b></div></div>' +
    '<h3>Титулы</h3><div class="evs">' + (c.titles.map((t) => '<div class="ev"><div><b>' + esc(t.name) + '</b><small>' + esc(t.ev) + ' · ' + C.date(c, t.w) + '</small></div></div>').join('') || '<div class="ev"><div>—</div></div>') + '</div>' +
    '<div class="foot"><button class="btn primary" data-act="wipe2">Новая карьера</button><button class="btn" data-act="ach">Зал славы</button><button class="btn" data-act="back">‹ Меню</button></div>';
}

// ---------------------------------------------------------------- the training hall (outside the career)
const hall = { drill: 'uchikomi', tech: 'podhvat', type: 'champion', lvl: 1 };
function renderHall() {
  const p = screen('scr-gw-hall');
  const ch = (act, v, cur, label, sub) => '<button class="chip' + (String(v) === String(cur) ? ' on' : '') + '" data-act="' + act + '" data-v="' + v + '">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  p.innerHTML = '<h2>Тренировочный зал</h2><div class="dim">Отработка без карьеры: те же мини-игры и спарринг с любым типом соперника.</div>' +
    '<div class="opt"><label>Упражнение</label><div class="chips">' + ch('hdrill', 'uchikomi', hall.drill, 'Тайминг броска', 'бросить в момент потери равновесия') + ch('hdrill', 'grip', hall.drill, 'Борьба за захват', '30 секунд, только захват') + ch('hdrill', 'newaza', hall.drill, 'Партер', 'удержать 10 с и выйти снизу') + ch('hdrill', 'sparring', hall.drill, 'Спарринг', 'полноценная схватка') + '</div></div>' +
    (hall.drill === 'uchikomi' ? '<div class="opt"><label>Бросок</label><div class="chips">' + J.TECH_ORDER.map((id) => ch('htech', id, hall.tech, J.TECHS[id].name)).join('') + '</div></div>' : '') +
    (hall.drill === 'sparring' ? '<div class="opt"><label>Тип соперника</label><div class="chips">' + Object.entries(GW.TYPES).map(([k, t]) => ch('htype', k, hall.type, t.name, t.desc)).join('') + '</div></div>' : '') +
    '<div class="opt"><label>Сложность (решения соперника)</label><div class="chips">' + ['Новичок', 'Разрядник', 'Мастер', 'Чемпион'].map((n, i) => ch('hlvl', i, hall.lvl, n)).join('') + '</div></div>' +
    '<div class="foot"><button class="btn primary" data-act="hgo">На татами</button><button class="btn" data-act="back">‹ Назад</button></div>';
}
let hallRes = null;
function hallGo() {
  const pc = Object.assign({}, UFC.fighterCfg(J.CLASSES[J.opt.kg][0]), { name: 'Вы', short: 'Вы', stats: { power: 60, speed: 60, cardio: 60, wrestling: 60, defense: 60, bjj: 60, chin: 70, boxing: 50, kicks: 40 } });
  const n = GW.ROSTER.find((x) => x.type === hall.type && x.tier === 3) || GW.ROSTER[0];
  const fakeC = { kg: J.opt.kg || 66, face: -1, week: 0 };
  const oc = Object.assign(C.npcCfg(Object.assign({}, n, { lv: 58 }), fakeC), {});
  UFC.fuel = null;
  const done = (r) => { hallRes = r; ui().go('scr-gw-hres', null, { reset: true }); };
  if (hall.drill === 'grip') GW.Drills.grip(pc, oc, hall.lvl, done);
  else if (hall.drill === 'uchikomi') GW.Drills.uchikomi(pc, oc, hall.lvl, hall.tech, done);
  else if (hall.drill === 'newaza') GW.Drills.newaza(pc, oc, hall.lvl, done);
  else {
    const g = G(); let res = null;
    J.setVenue('grandslam'); J.opt.name = 'ВЫ';
    g.onResultContinue = () => g.quitToMenu();
    g.onQuit = () => { hallRes = { text: res ? (res.won ? 'Победа' : 'Поражение') + ' · ' + res.text : 'Схватка прервана', a: GW.analyze(res && res.L, res && res.won, { cfg: { gwType: hall.type } }) }; ui().go('scr-gw-hres', null, { reset: true }); };
    g.startQuickFight(pc, oc, Object.assign({}, g.ui.settings, { difficulty: hall.lvl }), { gw: true, sparring: true, onEnd: (f) => { res = { won: !!f.won, text: f.methodText || '', L: GW.log }; } });
  }
}
function renderHallRes() {
  const p = screen('scr-gw-hres'), r = hallRes || {};
  p.innerHTML = '<h2>Тренировка окончена</h2><div class="note">' + esc(r.text || '') + '</div>' +
    (r.a ? '<table class="st">' + r.a.lines.map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('') + '</table>' + r.a.good.map((t) => '<div class="good">' + esc(t) + '</div>').join('') + r.a.tips.map((t) => '<div class="tip">' + esc(t) + '</div>').join('') : '') +
    '<div class="foot"><button class="btn primary" data-act="hall">Ещё раз</button><button class="btn" data-act="menu">В меню</button></div>';
}

// ---------------------------------------------------------------- the clicks
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const U = ui(), a = b.dataset.act, v = b.dataset.v, c = GW.c;
  G().audio.ensure && G().audio.ensure();
  switch (a) {
    case 'back': U.back(); break;
    case 'menu': U.go('scr-menu', null, { reset: true }); break;
    case 'tohub': U.go('scr-gw', null, { reset: true }); break;
    case 'cc': spec.cc = v; renderHub(); break;
    case 'kg': spec.kg = +v; spec.face = null; renderHub(); break;
    case 'face': spec.face = +v; renderHub(); break;
    case 'gi': spec.gi = v; renderHub(); break;
    case 'origin': spec.origin = v; renderHub(); break;
    case 'create': { const inp = document.getElementById('gw-name'); if (inp) spec.name = inp.value; if (!spec.name.trim()) spec.name = 'Иван Волков'; C.create(spec); J.opt.kg = spec.kg; renderHub(); break; }
    case 'week': plan = null; U.go('scr-gw-week'); break;
    case 'slot': plan.slots[+b.dataset.i] = v; renderWeek(); break;
    case 'tech': plan.tech = v; renderWeek(); break;
    case 'play': plan.play = v === '1'; renderWeek(); break;
    case 'coach': { const co = GW.COACHES[+v]; if (c.money >= co.price && c.tier >= co.tier) { c.money -= co.price; c.coach = +v; C.news(c, 'Новый тренер: ' + co.name + '.'); C.save(); } renderWeek(); break; }
    case 'physio': c.physio = !c.physio; C.save(); renderWeek(); break;
    case 'runweek': runWeek(); break;
    case 'enter': { const e2 = C.eventsAround(c).find((x) => x.key === v); if (e2 && c.injury <= 0 && c.money >= (e2.fee || 0)) { C.startEvent(c, e2); U.go('scr-gw-ev', null, { reset: true }); } break; }
    case 'toev': U.go('scr-gw-ev', null, { reset: true }); break;
    case 'fight': careerFight(); break;
    case 'afterpost': U.go(c && c.ev ? 'scr-gw-ev' : 'scr-gw', null, { reset: true }); break;
    case 'podium': showPodium(); break;
    case 'evdone': C.finishEvent(c); U.go('scr-gw', null, { reset: true }); break;
    case 'build': U.go('scr-gw-build'); break;
    case 'spend': C.spend(c, v); renderBuild(); break;
    case 'perk': if (!C.togglePerk(c, v)) U.toast && U.toast('Все слоты перков заняты — уберите один или поднимите уровень'); renderBuild(); break;
    case 'rivals': U.go('scr-gw-rivals'); break;
    case 'rematch': C.startRematch(c, v); U.go('scr-gw-ev', null, { reset: true }); break;
    case 'book': U.go('scr-gw-book'); break;
    case 'ach': U.go('scr-gw-ach'); break;
    case 'buttons': U.go('scr-jbtn'); break;
    case 'retire': if (b.dataset.sure) { C.retire(c); renderHub(); } else { b.dataset.sure = '1'; b.textContent = 'Точно завершить? Нажмите ещё раз'; } break;
    case 'wipe': if (b.dataset.sure) { C.wipe(); renderHub(); } else { b.dataset.sure = '1'; b.textContent = 'Удалить безвозвратно? Нажмите ещё раз'; } break;
    case 'wipe2': C.wipe(); renderHub(); break;
    case 'hall': U.go('scr-gw-hall', null, { reset: true }); break;
    case 'hdrill': hall.drill = v; renderHall(); break;
    case 'htech': hall.tech = v; renderHall(); break;
    case 'htype': hall.type = v; renderHall(); break;
    case 'hlvl': hall.lvl = +v; renderHall(); break;
    case 'hgo': hallGo(); break;
    default: break;
  }
}

// ---------------------------------------------------------------- the main menu
function install() {
  const g = G();
  if (!g || !g.ui || !document.querySelector('#scr-menu .menu-buttons')) { setTimeout(install, 150); return; }
  const U = g.ui;
  for (const id of ['scr-gw', 'scr-gw-week', 'scr-gw-wres', 'scr-gw-ev', 'scr-gw-post', 'scr-gw-build', 'scr-gw-rivals', 'scr-gw-book', 'scr-gw-ach', 'scr-gw-hall', 'scr-gw-hres']) screen(id);
  U.route('scr-gw', () => renderHub());
  U.route('scr-gw-week', () => renderWeek());
  U.route('scr-gw-wres', () => renderWeekRes());
  U.route('scr-gw-ev', () => renderEvent());
  U.route('scr-gw-post', () => renderPost());
  U.route('scr-gw-build', () => renderBuild());
  U.route('scr-gw-rivals', () => renderRivals());
  U.route('scr-gw-book', () => renderBook());
  U.route('scr-gw-ach', () => renderAch());
  U.route('scr-gw-hall', () => renderHall());
  U.route('scr-gw-hres', () => renderHallRes());
  const logo = document.querySelector('#scr-menu .logo');
  if (logo) logo.innerHTML = '<span>GRIP WARS</span><small class="gwsub">ROAD TO LEGEND · ДЗЮДО</small>';
  document.title = 'GRIP WARS: Road to Legend';
  const mb = document.querySelector('#scr-menu .menu-buttons');
  const add = (act, text, primary, fn) => {
    let bt = mb.querySelector('[data-act="' + act + '"]');
    if (!bt) { bt = document.createElement('button'); bt.dataset.act = act; bt.addEventListener('click', () => { g.audio.ensure(); fn(); }); }
    bt.className = 'btn' + (primary ? ' primary' : ''); bt.textContent = text;
    return bt;
  };
  const legend = add('gwcareer', 'Путь легенды', true, () => U.go('scr-gw'));
  const hallB = add('gwhall', 'Тренировочный зал', false, () => U.go('scr-gw-hall'));
  const achB = add('gwach', 'Достижения и зал славы', false, () => U.go('scr-gw-ach'));
  // the order: the road first
  const quick = mb.querySelector('[data-act="quick"]'); if (quick) { quick.textContent = 'Быстрая схватка'; quick.classList.remove('primary'); }
  const old = mb.querySelector('[data-act="jcareer"]'); if (old) old.textContent = 'Олимпийский цикл';
  mb.insertBefore(legend, mb.firstChild);
  if (quick) mb.insertBefore(hallB, quick.nextSibling); else mb.appendChild(hallB);
  const ctr = mb.querySelector('[data-act="controls"]'); if (ctr) mb.insertBefore(achB, ctr); else mb.appendChild(achB);
  const boot = document.querySelector('#boot .logo span'); if (boot) boot.textContent = 'GRIP WARS';
  C.load();
}
install();
})();

