//# sourceURL=judo/gw_ui.js
// GRIP WARS: the screens. The main menu, the road to legend (creation, the hub with the coach's tasks, the club and its
// people, the training week with the partners, the events and the bracket with the scouting and the game plan, the
// analysis after a fight with the coach's word, the build with the buttons, the specialization and the weight, the
// rivals and the ranking, the book of the career, the achievements, the legacy) and the training hall outside the career.
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
const SLOT = ['□', '△', '✕', '○', 'R2'];
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
.gw .coach { border-left: 3px solid var(--gold); background: rgba(232,197,71,.08); padding: 8px 10px; margin: 8px 0; font-size: 13px; line-height: 1.45; }
.gw .coach b { color: var(--gold); }
.gw .big { font: 900 34px/1 var(--head, system-ui); letter-spacing: .04em; margin: 4px 0 6px; } .gw .big.win { color: #8fe39a; } .gw .big.loss { color: #ff8a80; }
.gw .ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.gw .ach div { padding: 8px 10px; border: 1px solid var(--line); font-size: 12px; opacity: .45; } .gw .ach div.on { opacity: 1; border-color: var(--gold); background: rgba(232,197,71,.08); }
.gw .ach b { display: block; font-size: 13px; }
.gw .opp { border: 1px solid var(--line); padding: 10px 12px; background: rgba(255,255,255,.04); }
.gw .opp .tp, .gw .tp { display: inline-block; padding: 2px 8px; background: var(--red); color: #fff; font-size: 11px; font-weight: 800; letter-spacing: .06em; margin-right: 6px; }
.gw .news div { font-size: 12px; color: var(--dim); padding: 3px 0; border-bottom: 1px dashed rgba(255,255,255,.07); }
.gw .task { border: 1px solid var(--gold); background: rgba(232,197,71,.07); padding: 10px 12px; margin: 8px 0; }
.gw .task h4 { margin: 0 0 4px; color: var(--gold); font-size: 14px; letter-spacing: .04em; }
.gw .task q { display: block; font-style: italic; color: #e8e2cc; margin: 4px 0; quotes: '«' '»'; }
.gw .task .goal { font-size: 13px; } .gw .task .rw { font-size: 11px; color: var(--dim); margin-top: 3px; }
.gw .task .btn { margin-top: 6px; }
.gw .opens { font-size: 12px; color: var(--dim); margin: 4px 0 8px; } .gw .opens span { display: inline-block; margin: 2px 6px 2px 0; padding: 2px 7px; border: 1px solid var(--line); color: #dfe; }
.gw .sw { color: #8fe39a; } .gw .wk { color: #ff9a8a; }
.gw .mate { display: grid; grid-template-columns: 1fr auto; gap: 8px; border-bottom: 1px solid var(--line); padding: 8px 2px; }
.gw .mate small { display: block; color: var(--dim); font-size: 11px; line-height: 1.35; }
.gw .rank td:first-child { width: 28px; color: var(--dim); } .gw .rank tr.me td { color: var(--gold); font-weight: 800; }
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
const coachName = (c) => (GW.CLUBS[c.club] || GW.CLUBS.sakura).coach.split(',')[0];
const tn = (id) => (J.TECHS[id] ? J.TECHS[id].name : id);
const reward = (r) => [r.xp ? '+' + r.xp + ' опыта' : '', r.rep ? '+' + r.rep + ' репутации' : '', r.money ? money(r.money) : ''].filter(Boolean).join(', ');
// what the man is good at and where he can be beaten, if you know it
function styleHtml(c, n) {
  if (!n || n.filler || !n.strong) return '';
  if (!C.knowsStyle(c, n)) return '<div class="dim" style="margin-top:4px">Сильные и слабые стороны — неизвестны. Узнаете после двух встреч, поражения от него' + (c.tier >= 4 ? ' или разбора видео' : '') + '.</div>';
  return '<div style="margin-top:4px"><span class="sw">Сильная сторона: ' + esc(GW.STRONG[n.strong]) + '</span> · <span class="wk">Слабость: ' + esc(GW.WEAK[n.weak]) + '</span></div>';
}
// what a familiar opponent remembers of your throws (he reads them from the stage of the city cups)
function memoryHtml(c, n) {
  const m = c.memory && c.memory[n.id]; if (!m || n.tier < 3) return '';
  const top = Object.entries(m).filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => tn(k));
  return top.length ? '<div class="wk" style="margin-top:4px">Он помнит с прошлых встреч: ' + esc(top.join(', ')) + ' — эти броски он прочитает быстрее. Удивите его другим.</div>' : '';
}
function recordHtml(c, id) {
  const r = c.npc[id];
  const D = (t) => '<div class="dim" style="font-size:12px;margin-top:3px">' + t + '</div>';
  if (!r || (!r.w && !r.l)) return D('Пока без результатов, которые вы видели.');
  return D('Побед ' + r.w + ' · поражений ' + r.l + (r.gold ? ' · турниров выиграл ' + r.gold : '') + (r.titles.length ? ' · титулы: ' + esc([...new Set(r.titles)].join(', ')) : '')) +
    (r.last.length ? D('Последние: ' + r.last.slice(0, 3).map((x) => (x.won ? '✔ ' : '✘ ') + esc(x.vs) + ' (' + esc(x.at) + ')').join(' · ')) : '');
}
// the venue of an event: the club dojo, the school gym, or a hall of its own
GW.venueFor = function (ev) {
  const v = ev.venue || GW.TIERS[ev.tier].venue;
  if (v === 'dojo') return 'dojo';
  if (v === 'gym') { const E = J.EVENTS.gym; E.name = ev.name; E.sign = 'СПОРТШКОЛА № 3'; E.sub = String(ev.name).toUpperCase(); E.line = String(ev.name).toUpperCase(); return 'gym'; }
  if (ev.id === 'olympics') return 'olympics';
  if (ev.id === 'worlds' || ev.id === 'wdef') return 'worlds';
  if (ev.id === 'masters') return 'masters';
  if (ev.id === 'gs') return 'grandslam';
  const up = String(ev.name).toUpperCase();
  J.EVENTS.gwev = { id: 'gwev', name: ev.name, style: v === 'A' ? 'A' : 'B', fights: 3, line: up + ' · ДЗЮДО', floor: up.length > 22 ? up.split(' ').slice(0, 2).join(' ') : up, prize: 0 };
  return 'gwev';
};

// ---------------------------------------------------------------- creation
const spec = { name: '', cc: 'RUS', kg: 66, face: null, gi: 'white', origin: 'tech', height: 'mid', stance: 'L' };
function renderCreate(p) {
  const faces = J.CLASSES[spec.kg] || J.CLASSES[66];
  if (spec.face == null || !faces.includes(spec.face)) spec.face = faces[0];
  const ch = (act, v, cur, label, sub) => '<button class="chip' + (v === cur ? ' on' : '') + '" data-act="' + act + '" data-v="' + v + '">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  p.innerHTML = '<h2>GRIP WARS · Путь легенды</h2><div class="dim">Вам 16. Подвал спорткомплекса, старые маты со скотчем на порванных углах и тренер Палыч. Ни пояса, ни побед, ни денег. Восемь этапов — до легенды мирового дзюдо.</div>' +
    '<div class="opt"><label>Имя и фамилия</label><input class="txt" id="gw-name" maxlength="24" value="' + esc(spec.name) + '" placeholder="Например, Иван Волков"></div>' +
    '<div class="opt"><label>Страна</label><div class="chips">' + ['RUS', 'KAZ', 'UZB', 'GEO', 'AZE', 'KOR', 'JPN', 'FRA'].map((k) => ch('cc', k, spec.cc, GW.CC[k])).join('') + '</div></div>' +
    '<div class="opt"><label>Весовая категория</label><div class="chips">' + GW.CLASSES.map((k) => ch('kg', String(k), String(spec.kg), k + ' кг')).join('') + '</div></div>' +
    '<div class="opt"><label>Рост</label><div class="chips">' + Object.entries(GW.HEIGHTS).map(([k, h]) => ch('height', k, spec.height, h.name + ' · ' + Math.round(((J.CLASS_H[spec.kg] || 1.71) + h.dh) * 100) + ' см', h.desc)).join('') + '</div></div>' +
    '<div class="opt"><label>Стойка</label><div class="chips">' + ch('stance', 'L', spec.stance, 'Левая', 'левая нога впереди') + ch('stance', 'R', spec.stance, 'Правая', 'правая нога впереди') + '</div><div class="dim" style="font-size:12px;margin-top:4px">Против соперника в той же стойке (одноимённая) лучше идут подсечки, зацепы, отхват, подхват; в другой (разноимённая) — броски с поворотом. В схватке стойку можно менять кнопкой «СТОЙКА».</div></div>' +
    '<div class="opt"><label>Внешность</label><div class="chips">' + faces.map((i, n) => ch('face', String(i), String(spec.face), 'Вариант ' + (n + 1))).join('') + '</div></div>' +
    '<div class="opt"><label>Кимоно</label><div class="chips">' + ch('gi', 'white', spec.gi, 'Белое') + ch('gi', 'blue', spec.gi, 'Синее') + '</div></div>' +
    '<div class="opt"><label>Откуда вы пришли (с чем вы начинаете)</label><div class="chips">' + Object.entries(GW.ORIGINS).map(([k, o]) => ch('origin', k, spec.origin, o.name, o.desc)).join('') + '</div></div>' +
    '<div class="foot"><button class="btn primary" data-act="create">Прийти в додзё</button><button class="btn" data-act="back">‹ Назад</button></div>';
  const g = G(); if (g.showPreview) g.showPreview(Object.assign({}, UFC.fighterCfg(spec.face), { gi: spec.gi, belt: C.beltColor(0), stance: spec.stance === 'R' ? 'southpaw' : 'orthodox', height: (J.CLASS_H[spec.kg] || 1.71) + GW.HEIGHTS[spec.height].dh }));
}

// ---------------------------------------------------------------- the hub: where you are, what the coach wants
function nextEventOf(c, tier) {
  for (let w = c.week; w < c.week + 30; w++) for (const e of GW.EVENTS) if (e.tier === tier && !e.single && ((w - e.at) % e.every + e.every) % e.every === 0 && !c.done[e.id + '@' + w]) return Object.assign({ inWeeks: w - c.week }, e);
  return null;
}
function taskCard(c, t) {
  const [kind, arg] = t.act.split(':');
  let btn = '';
  if (kind === 'drill') btn = '<button class="btn primary" data-act="taskgo" data-v="' + t.id + '">На тренировку: ' + esc(GW.SESSIONS[arg].name) + '</button>';
  else if (kind === 'spar') btn = '<button class="btn primary" data-act="taskgo" data-v="' + t.id + '">На спарринг</button>';
  else if (kind === 'spec' || kind === 'transfer' || kind === 'elite') btn = '<button class="btn primary" data-act="club">' + (kind === 'spec' ? 'Выбрать специализацию' : 'Выбрать зал') + '</button>' + (kind === 'elite' && !c.natMedal ? '<div class="dim">Сначала медаль чемпионата страны.</div>' : '');
  else if (kind === 'rival') {
    const n = C.npcById(arg), cd = (c.lastRematch[arg] || -99) > c.week - 4;
    btn = cd ? '<div class="dim">Вызвать снова можно через ' + (4 - (c.week - c.lastRematch[arg])) + ' нед. — или встретьте его на кубке города.</div>' : c.injury > 0 ? '<div class="bad">травма</div>' : '<button class="btn primary" data-act="grudge" data-v="' + arg + '">Вызвать ' + esc(n.name) + ' на схватку</button>';
  } else if (kind === 'event') {
    const e = C.eventsAround(c).find((x) => x.tier === c.tier) || nextEventOf(c, c.tier);
    btn = '<div class="dim">' + (e ? 'Ближайший: «' + esc(e.name) + '» ' + (e.inWeeks ? 'через ' + e.inWeeks + ' нед.' : '— на этой неделе, кнопка ниже') : 'Турнир скоро появится в календаре.') + '</div>';
  }
  const pr = C.taskProgress(c, t);
  return '<div class="task"><h4>Задание тренера: ' + esc(t.name) + '</h4><q>' + esc(t.coach) + '</q><div class="goal"><b>Цель:</b> ' + esc(t.goal) + (pr ? ' · ' + pr : '') + '</div><div class="rw">Награда: ' + reward(t.reward) + (t.unlock ? ' · откроет тренировку «' + esc(GW.SESSIONS[t.unlock].name) + '»' : '') + '</div>' + btn + '</div>';
}
function renderHub() {
  const p = screen('scr-gw'), c = GW.c || C.load();   // the live career; the save is only read once
  if (!c) return renderCreate(p);
  if (c.retired) return renderLegacy(p, c);
  const T = GW.TIERS[c.tier], next = GW.TIERS[c.tier + 1];
  const ladder = GW.TIERS.map((t, i) => '<div class="' + (i < c.tier ? 'done' : i === c.tier ? 'now' : '') + '">' + beltDot(i) + esc(t.name) + '</div>').join('');
  const evs = C.eventsAround(c), now = evs.filter((e) => e.inWeeks === 0), later = evs.filter((e) => e.inWeeks > 0);
  const evRow = (e) => '<div class="ev"><div><b>' + esc(e.name) + '</b>' + (e.invite ? ' <span class="tp">ПРИГЛАШЕНИЕ</span>' : '') + '<small>' + GW.TIERS[e.tier].name + ' · ' + (e.single ? 'одна схватка с тем, кто выше вас в рейтинге: ' + esc((C.npcById(C.rankRival(c)) || {}).name || '—') : e.size === 2 ? 'две схватки со старшими' : 'сетка на ' + e.size) + (e.fee ? ' · взнос ' + money(e.fee) : '') + (GW.TIERS[e.tier].prize && !e.single ? ' · за золото ' + money(GW.TIERS[e.tier].prize * (e.size >= 16 ? 1.3 : 1)) : '') + (e.title ? ' · титул «' + e.title + '»' : '') + '</small></div>' +
    (e.inWeeks === 0 ? (c.injury > 0 ? '<span class="bad">травма</span>' : c.money < (e.fee || 0) ? '<span class="bad">нет денег на взнос</span>' : '<button class="btn primary" data-act="enter" data-v="' + e.key + '">Выступить</button>') : '<span class="dim">через ' + e.inWeeks + ' нед.</span>') + '</div>';
  const gaps = C.promoGaps(c), tasks = C.tasksNow(c);
  const pot = C.potential(c), sum = Math.round(C.attrSum(c));
  p.innerHTML = '<h2>' + esc(c.name) + '</h2><div class="dim">' + GW.CC[c.cc] + ' · ' + c.kg + ' кг · ' + GW.HEIGHTS[c.height].name.toLowerCase() + ' · ' + (c.stance === 'R' ? 'правая' : 'левая') + ' стойка · ' + c.age + ' лет · ' + C.date(c) + ' · ' + GW.BELTS[c.tier].name + ' · ' + esc((GW.CLUBS[c.club] || GW.CLUBS.sakura).name) + '</div>' +
    '<div class="ladder">' + ladder + '</div>' +
    '<div class="note"><b>Этап ' + (c.tier + 1) + ' · ' + esc(T.name) + '</b> — ' + esc(T.place) + '. ' + esc(T.text) + '</div>' +
    '<div class="opens">Открыто на этом этапе: ' + T.opens.map((o) => '<span>' + esc(o) + '</span>').join('') + '</div>' +
    (next ? '<div class="dim">Дальше: <b>' + esc(next.name) + '</b>. ' + (gaps.length ? 'Осталось: ' + esc(gaps.join(' · ')) + '.' : 'Всё готово — переход после ближайшего результата.') + '</div>' + (c.tier > 0 ? bar(C.stageRep(c).got, C.stageRep(c).need) : bar(Object.keys(c.tasks).filter((id) => GW.TIER_NEED[0].includes(id)).length, GW.TIER_NEED[0].length)) : '<div class="note">Вершина. Защищайте титул, возвращайте долги старым соперникам и копите наследие: ' + C.legacy(c) + ' очков (' + C.legacyName(C.legacy(c)) + ').</div>') +
    (c.ev && c.ev.state !== 'done' ? '<div class="foot"><button class="btn primary" data-act="toev">Продолжить: ' + esc(c.ev.name) + '</button></div>' : '') +
    tasks.map((t) => taskCard(c, t)).join('') +
    '<div class="coach">' + esc(C.coachMood(c)) + '</div>' +
    '<div class="row"><div class="card"><span>Уровень</span><b>' + c.level + '</b><small class="dim">опыт ' + c.xp + '/' + C.xpNeed(c.level) + '</small></div><div class="card"><span>Репутация</span><b>' + c.rep + '</b></div><div class="card"><span>Деньги</span><b>' + money(c.money) + '</b></div>' + (c.tier >= 2 ? '<div class="card"><span>Рейтинг-очки</span><b>' + Math.round(C.rankPts(c)) + '</b></div>' : '') + '<div class="card"><span>Общий</span><b>' + C.ovr(c) + '</b><small class="dim">потенциал ' + sum + '/' + pot + '</small></div><div class="card"><span>Усталость</span><b style="color:' + (c.fatigue > 65 ? '#ff8a80' : c.fatigue > 40 ? '#f0c82c' : '#8fe39a') + '">' + Math.round(c.fatigue) + '</b><small class="dim">' + (c.injury > 0 ? 'травма: ' + c.injuryPart + ', ' + c.injury + ' нед.' : c.fatigue > 65 ? 'риск травмы' : 'норма') + '</small></div></div>' +
    '<h3>Эта неделя</h3><div class="evs">' + (now.map(evRow).join('') || '<div class="ev"><div>' + (c.tier === 0 ? 'Турниров пока нет: Палыч не выпускает на соревнования, пока не выполните его задания.' : 'Турниров на этой неделе нет — время тренироваться.') + '</div></div>') + '</div>' +
    '<div class="foot"><button class="btn primary" data-act="week">Тренировочная неделя</button><button class="btn" data-act="club">Клуб' + (c.tier >= 3 && !c.spec ? ' (!)' : '') + '</button><button class="btn" data-act="build">Билд и кнопки' + (c.pts ? ' (+' + c.pts + ')' : '') + '</button><button class="btn" data-act="rivals">Соперники' + (c.tier >= 4 ? ' и рейтинг' : '') + (C.rematches(c).length ? ' (' + C.rematches(c).length + ')' : '') + '</button><button class="btn" data-act="book">Статистика</button><button class="btn" data-act="ach">Достижения</button></div>' +
    (later.length ? '<h3>Скоро</h3><div class="evs">' + later.map(evRow).join('') + '</div>' : '') +
    '<h3>Новости</h3><div class="news">' + c.news.slice(0, 7).map((n) => '<div>' + esc(C.date(c, n.w)) + ' — ' + esc(n.t) + '</div>').join('') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Меню</button>' + (c.tier >= 2 || c.age >= 30 ? '<button class="btn" data-act="retire">Завершить карьеру</button>' : '') + '<button class="btn" data-act="wipe">Удалить карьеру</button></div>';
  const g = G(); if (g.showPreview) g.showPreview(Object.assign({}, C.playerCfg(c), { gi: c.gi }));
}

// ---------------------------------------------------------------- the club: the coach, the people, the choices
function renderClub() {
  const p = screen('scr-gw-club'), c = GW.c, club = GW.CLUBS[c.club] || GW.CLUBS.sakura;
  const mates = GW.ROSTER.filter((n) => n.tier <= 1);
  const around = GW.ROSTER.filter((n) => n.tier >= 2 && Math.abs(n.tier - c.tier) <= 1);
  const mate = (n) => {
    const s = c.spar[n.id], r = c.rivals[n.id];
    return '<div class="mate"><div>' + typeTag(n.type) + '<b>' + esc(n.name) + '</b> <span class="dim">' + n.age + ' лет · уровень ' + C.npcLevel(n, c) + ' · ' + esc(GW.TYPES[n.type].name.toLowerCase()) + ' · ' + n.fav.map(tn).join(', ') + '</span>' +
      '<small>' + esc(n.bio) + '</small>' + recordHtml(c, n.id) + styleHtml(c, n) + '</div><div style="text-align:right">' + (s ? '<div>спарринги ' + s.w + '–' + s.l + '</div>' : '') + (r ? '<div>схватки ' + r.w + '–' + r.l + '</div>' : '') + '</div></div>';
  };
  let choices = '';
  if (c.tier >= 3) {
    const canCh = !c.spec || (c.tier >= 6 && c.week - (c.specW || 0) >= 24);
    choices += '<h3>Специализация</h3><div class="dim">' + (c.spec ? 'Сейчас: <b>' + esc(GW.SPECS[c.spec].name) + '</b>. ' + (c.tier < 6 ? 'Сменить стиль можно на этапе «' + GW.TIERS[6].name + '».' : canCh ? 'Можно сменить (не чаще раза в полгода).' : 'Сменить можно через ' + (24 - (c.week - c.specW)) + ' нед.') : 'Выберите, каким будет ваше дзюдо. Характеристика специализации растёт на 35% быстрее, а в схватке появляется своё преимущество. Индивидуальный план тренировок (+10% к росту) — в тренировочной неделе.') + '</div>' +
      '<div class="chips">' + Object.entries(GW.SPECS).map(([k, S]) => '<button class="chip' + (c.spec === k ? ' on' : '') + '" data-act="spec" data-v="' + k + '"' + (canCh && c.spec !== k ? '' : ' disabled') + '>' + S.name + '<small>' + esc(S.desc) + '</small></button>').join('') + '</div>';
  }
  if (c.tier >= 4) {
    choices += '<h3>Где тренироваться</h3><div class="chips">' + Object.entries(GW.CLUBS).map(([k, K]) => { const why = C.clubOk(c, k); return '<button class="chip' + (c.club === k ? ' on' : '') + '" data-act="transfer" data-v="' + k + '"' + (c.club === k || why ? ' disabled' : '') + '>' + K.name + '<small>' + esc(K.coach) + ' · рост ×' + K.mult + (K.fee ? ' · ' + money(K.fee) + '/нед.' : ' · бесплатно') + (K.desc ? ' · ' + esc(K.desc) : '') + (why ? ' · ' + esc(why) : '') + '</small></button>'; }).join('') + '</div>';
  }
  const rival = GW.ROSTER.find((n) => n.rival);
  p.innerHTML = '<h2>' + esc(club.name) + '</h2><div class="dim">Тренер: ' + esc(club.coach) + ' · рост ×' + club.mult + (club.fee ? ' · ' + money(club.fee) + ' в неделю' : '') + '</div>' +
    '<div class="coach">' + esc(C.coachMood(c)) + '</div>' + choices +
    '<h3>Ученики «Сакуры»</h3><div class="dim">С кем бороться на спарринге — выбирается в тренировочной неделе. Сильный партнёр учит больше, но и бьёт больнее.</div>' + mates.map(mate).join('') +
    (c.tier >= 2 ? '<h3>Кого вы встретите на этом уровне</h3>' + around.map(mate).join('') : '') +
    (c.tier >= 3 && rival ? '<h3>Принципиальный соперник</h3>' + mate(rival) : '') +
    '<div class="foot"><button class="btn" data-act="back">‹ Назад</button></div>';
}

// ---------------------------------------------------------------- the training week
let plan = null;
function defaultPartner(c, want) {
  const P = C.partners(c);
  if (want && want !== 'novice' && want !== 'senior') return want;
  const pool = P.filter((n) => (want === 'senior' ? n.tier === 1 : want === 'novice' ? n.tier === 0 : true));
  pool.sort((a, b) => C.npcLevel(a, c) - C.npcLevel(b, c));
  return (pool[0] || P[0] || GW.ROSTER[0]).id;
}
function newPlan(c) {
  const open = (s) => c.sessions.includes(s);
  const slots = c.injury > 0 ? ['tech', 'recovery', 'tech'] : [open('uchikomi') ? 'uchikomi' : 'grip', open('sparring') ? 'sparring' : 'power', 'recovery'];
  return { slots, tech: c.known.includes(c.loadout[0]) ? c.loadout[0] : c.known[0], play: true, mult: [], spar: [], partner: [defaultPartner(c), defaultPartner(c), defaultPartner(c)], sparK: [], unlocked: [] };
}
const lockedWhy = (c, sid) => { const t = GW.TASKS.find((x) => x.unlock === sid); if (t) return 'откроет задание «' + t.name + '»'; for (const [k, L] of Object.entries(GW.TIER_SESSIONS)) if (L.includes(sid)) return 'с этапа «' + GW.TIERS[k].name + '»'; return ''; };
function renderWeek() {
  const p = screen('scr-gw-week'), c = GW.c;
  if (!plan) plan = newPlan(c);
  const fatAfter = cl(plan.slots.reduce((a, s) => a + GW.SESSIONS[s].fat, c.fatigue) - (c.physio ? 24 : 12), 0, 100);
  const sess = Object.entries(GW.SESSIONS).filter(([k]) => c.sessions.includes(k));
  const locked = Object.keys(GW.SESSIONS).filter((k) => !c.sessions.includes(k));
  const partners = C.partners(c);
  const slot = (i) => '<div class="slot"><h4>Тренировка ' + (i + 1) + '</h4><div class="chips">' + sess.map(([k, S]) =>
    '<button class="chip' + (plan.slots[i] === k ? ' on' : '') + '" data-act="slot" data-i="' + i + '" data-v="' + k + '"' + (c.injury > 0 && S.fat >= 14 ? ' disabled' : '') + '>' + S.name + '<small>' + S.desc + '</small></button>').join('') + '</div>' +
    (plan.slots[i] === 'sparring' ? '<div class="opt"><label>Партнёр</label><div class="chips">' + partners.map((n) => { const s = c.spar[n.id], k = C.partnerK(c, n); return '<button class="chip' + (plan.partner[i] === n.id ? ' on' : '') + '" data-act="partner" data-i="' + i + '" data-v="' + n.id + '">' + esc(n.name) + '<small>' + GW.TYPES[n.type].short.toLowerCase() + ' · ур. ' + C.npcLevel(n, c) + ' · ' + (k > 1.08 ? 'сильнее вас' : k < 0.92 ? 'слабее вас' : 'ваш уровень') + (s ? ' · ' + s.w + '–' + s.l : '') + '</small></button>'; }).join('') + '</div></div>' : '') + '</div>';
  const S = c.spec && GW.SPECS[c.spec];
  const club = GW.CLUBS[c.club] || GW.CLUBS.sakura;
  p.innerHTML = '<h2>Тренировочная неделя</h2><div class="dim">' + C.date(c) + ' · три тренировки · тренер: ' + esc(club.coach.split(',')[0]) + ' (рост ×' + club.mult + '). Мини-игры дают рост ×0.5–1.8 в зависимости от того, как вы их пройдёте; без мини-игры — ×0.65, и задания тренера тогда не засчитываются.</div>' +
    [0, 1, 2].map(slot).join('') +
    (locked.length ? '<div class="dim" style="font-size:12px">Закрыто: ' + locked.map((k) => GW.SESSIONS[k].name + ' (' + esc(lockedWhy(c, k)) + ')').join(' · ') + '</div>' : '') +
    (S ? '<div class="opt"><label>Индивидуальный план · ' + esc(S.name) + '</label><div class="chips"><button class="chip' + (plan.slots.join() === S.plan.join() ? ' on' : '') + '" data-act="indiv">' + S.plan.map((x) => GW.SESSIONS[x].name).join(' + ') + '<small>+10% к росту всей недели · ' + esc(GW.ATTRS[S.attr].name) + ' растёт на 35% быстрее всегда</small></button></div></div>' : '') +
    (plan.slots.includes('uchikomi') ? '<div class="opt"><label>Бросок для отработки (только изученные)</label><div class="chips">' + c.known.map((id) => '<button class="chip' + (plan.tech === id ? ' on' : '') + '" data-act="tech" data-v="' + id + '">' + tn(id) + '<small>мастерство ' + Math.round(c.mastery[id] || 10) + '</small></button>').join('') + '</div></div>' : '') +
    '<div class="opt"><label>Мини-игры на татами</label><div class="chips"><button class="chip' + (plan.play ? ' on' : '') + '" data-act="play" data-v="1">Играть (лучше рост, задания)</button><button class="chip' + (!plan.play ? ' on' : '') + '" data-act="play" data-v="0">Быстро (×0.65)</button></div></div>' +
    '<div class="opt"><label>Восстановление</label><div class="chips"><button class="chip' + (c.physio ? ' on' : '') + '" data-act="physio">Физиотерапевт<small>' + (c.physio ? 'нанят' : 'не нанят') + ' · −12 усталости в неделю, риск травмы ниже · ' + money(40 * (c.tier + 1)) + '/нед.</small></button></div></div>' +
    '<div class="note">Усталость сейчас ' + Math.round(c.fatigue) + ' → к концу недели ≈ ' + Math.round(fatAfter) + '. Выше 45 рост слабее, выше 65 — риск травмы на тяжёлых тренировках, а в схватке меньше дыхалки.</div>' +
    '<div class="foot"><button class="btn primary" data-act="runweek">Начать неделю</button><button class="btn" data-act="back">‹ Назад</button></div>';
}
const clubVenue = (c) => (c.club === 'olymp' || c.club === 'elite' ? 'gym' : 'dojo');
// run the week: the drills one by one on the mat (each with a club mate), then the numbers
function runWeek() {
  const c = GW.c;
  plan.mult = []; plan.spar = []; plan.sparK = []; plan.unlocked = [];
  const queue = plan.slots.map((s, i) => [s, i]).filter(([s]) => plan.play && GW.SESSIONS[s].drill && !(c.injury > 0 && GW.SESSIONS[s].fat >= 14));
  const lvl = Math.min(3, Math.floor(c.tier / 2));
  const nextDrill = () => {
    const it = queue.shift();
    if (!it) return finishWeek();
    const [s, i] = it, S = GW.SESSIONS[s];
    const mates = C.partners(c), drillMate = mates[(Math.random() * mates.length) | 0] || GW.ROSTER[0];
    const pc = C.playerCfg(c), oc = C.npcCfg(drillMate, c), o = { career: true, venue: clubVenue(c) };
    UFC.fuel = { gly: 60 + c.attrs.cardio * 1.4, acid: 60 + c.attrs.cardio * 1.4 };
    const done = (r) => { plan.mult[i] = r.mult; plan.unlocked.push(...C.drillDone(c, r)); C.save(); lastDrills.push({ name: S.name + ' · партнёр ' + drillMate.name, text: r.text }); nextDrill(); };
    if (S.drill === 'grip') GW.Drills.grip(pc, oc, lvl, done, o);
    else if (S.drill === 'uchikomi') GW.Drills.uchikomi(pc, oc, lvl, plan.tech, done, o);
    else if (S.drill === 'defense') GW.Drills.defense(pc, oc, lvl, done, o);
    else if (S.drill === 'newaza') GW.Drills.newaza(pc, oc, lvl, done, o);
    else if (S.drill === 'sparring') {
      const partner = C.npcById(plan.partner[i] || defaultPartner(c));
      plan.sparK[i] = C.partnerK(c, partner);
      sparring(c, partner, lvl, (won, text, L) => {
        plan.spar[i] = won; plan.mult[i] = 1;
        const u = C.settleSpar(c, partner.id, won, L); plan.unlocked.push(...u); C.save();
        lastDrills.push({ name: 'Спарринг с ' + partner.name, text: (won ? 'победа' : 'поражение') + (text ? ' · ' + text.split(' · ')[0] : '') });
        // every sparring gets its analysis: the first losses are where you learn
        GW.post = { won, text: text || '', opp: partner, a: GW.analyze(L, won, { cfg: { gwType: partner.type } }), xp: 0, unlocked: u, round: 'Спарринг', ev: 'Тренировка в клубе', spar: true };
        GW.weekCont = nextDrill;
        ui().go('scr-gw-post', null, { reset: true });
      });
    }
  };
  lastDrills = [];
  nextDrill();
}
let lastDrills = [], lastWeek = null;
function finishWeek() {
  const c = GW.c;
  lastWeek = C.runWeek(c, plan);
  lastWeek.unlocked = plan.unlocked;
  plan = null;
  ui().go('scr-gw-wres', null, { reset: true });
}
function sparring(c, partner, lvl, cb) {
  const g = G();
  const v = clubVenue(c);
  if (v === 'gym') { const E = J.EVENTS.gym; E.sign = c.club === 'elite' ? 'ЦЕНТР ПОДГОТОВКИ' : 'СК «ОЛИМП»'; E.sub = 'ТРЕНИРОВКА'; E.name = 'Тренировка'; }
  J.setVenue(v); J.opt.gi = c.gi; J.opt.name = c.short.toUpperCase();
  let res = null;
  g.onResultContinue = () => g.quitToMenu();
  g.onQuit = () => cb(res ? res.won : false, res ? res.text : 'снялся', res ? res.L : GW.log);
  g.startQuickFight(C.playerCfg(c), C.npcCfg(partner, c), Object.assign({}, g.ui.settings, { difficulty: lvl }), { gw: true, sparring: true, event: 'Спарринг', gwCareer: true, gwCue: c.tier <= 2, onEnd: (fight) => { res = { won: !!fight.won, text: fight.methodText || '', L: GW.log }; } });
}
function renderWeekRes() {
  const p = screen('scr-gw-wres'), c = GW.c, r = lastWeek || { gains: {}, xp: 0 };
  const rows = Object.entries(r.gains).filter(([, v]) => v > 0.05).map(([k, v]) => '<tr><td>' + (k.startsWith('m:') ? 'Мастерство «' + tn(k.slice(2)) + '»' : GW.ATTRS[k].name) + '</td><td>+' + v.toFixed(1) + '</td></tr>').join('');
  p.innerHTML = '<h2>Неделя позади</h2><div class="dim">' + C.date(c) + '</div>' +
    unlockedHtml(r.unlocked) +
    (lastDrills.length ? '<h3>На татами</h3>' + lastDrills.map((d) => '<div class="good"><b>' + esc(d.name) + '</b>: ' + esc(d.text) + '</div>').join('') : '') +
    '<h3>Рост</h3><table class="st">' + (rows || '<tr><td>Ничего заметного (усталость, потенциал или травма)</td><td></td></tr>') + '<tr><td>Опыт</td><td>+' + r.xp + '</td></tr><tr><td>Усталость</td><td>' + Math.round(c.fatigue) + '</td></tr></table>' +
    (C.attrSum(c) >= C.potential(c) - 1 ? '<div class="note">Вы упёрлись в потенциал (' + C.potential(c) + '). Он растёт с уровнем и с каждым новым этапом карьеры.</div>' : '') +
    '<div class="foot"><button class="btn primary" data-act="tohub">Дальше</button></div>';
}

// ---------------------------------------------------------------- the event and the bracket
function evStatsHtml(ev) {
  const s = ev.st; if (!s || !s.fights) return '';
  const pc = (a, b) => (b > 0 ? Math.round(100 * a / b) : 0);
  return '<h3>Статистика турнира</h3><table class="st"><tr><td>Схваток</td><td>' + s.fights + '</td></tr><tr><td>Лучший захват у вас</td><td>' + pc(s.gAdv, s.t) + '% времени</td></tr><tr><td>Попыток бросков / прошло / остановлено</td><td>' + s.tries + ' / ' + s.landed + ' / ' + s.stopped + '</td></tr>' +
    '<tr><td>Ошибки: атаки без полного захвата · шидо</td><td>' + s.noFull + ' · ' + s.shido + '</td></tr><tr><td>Оценок за вас / против</td><td>' + s.scored + ' / ' + s.against + '</td></tr><tr><td>Дыхалки потрачено (в среднем за схватку)</td><td>' + Math.round(s.stam / s.fights) + '%</td></tr>' + (s.combos ? '<tr><td>Оценок комбинацией</td><td>' + s.combos + '</td></tr>' : '') + '</table>';
}
function renderEvent() {
  const p = screen('scr-gw-ev'), c = GW.c, ev = c && c.ev;
  if (!ev) { p.innerHTML = '<h2>Турнира нет</h2><div class="foot"><button class="btn" data-act="tohub">К карьере</button></div>'; return; }
  const rows = ev.results.map((r) => '<div class="' + (r.won ? 'w' : 'l') + '">' + esc(r.round) + ': ' + esc(r.op) + ' — ' + (r.won ? 'победа' : 'поражение') + ' <span class="dim">(' + esc((r.text || '').split(' · ')[0]) + ')</span></div>').join('');
  let body = '';
  if (ev.state !== 'over') {
    const n = C.npcById(C.nextOpponent(c)), r = c.rivals[n.id];
    const scouted = ev.scouted && ev.scouted.includes(n.id);
    body = '<h3>' + esc(ev.single ? ev.name : C.roundName(ev)) + '</h3><div class="opp">' + typeTag(n.type) + '<b>' + esc(n.name) + '</b> · ' + GW.CC[n.cc] + ' · уровень ' + Math.max(C.npcLevel(n, c), ev.boost || 0) + ' · ' + GW.BELTS[Math.min(7, n.tier)].name +
      '<div class="dim" style="margin-top:6px">' + esc(GW.TYPES[n.type].desc) + '</div><div style="margin-top:4px">Любимые броски: <b>' + n.fav.map(tn).join(', ') + '</b>' + (r ? ' · ваши встречи: ' + r.w + '–' + r.l : ' · вы не встречались') + '</div><div class="dim" style="margin-top:4px">' + esc(n.bio) + '</div>' +
      recordHtml(c, n.id) + styleHtml(c, n) + memoryHtml(c, n) + (scouted || (r && r.l > 0 && c.tier >= 4) ? '<div class="sw" style="margin-top:4px">Вы его изучили: ваши броски +6%, его любимые броски против вас −10%.</div>' : '') + '</div>' +
      (c.tier >= 4 && !n.filler && !scouted ? '<div class="foot"><button class="btn" data-act="scout" data-v="' + n.id + '">Разобрать видео соперника</button></div>' : '') +
      (c.tier >= 6 ? '<div class="opt"><label>План на схватку</label><div class="chips">' + Object.entries(GW.PLANS).map(([k, P]) => '<button class="chip' + ((ev.plan || 'own') === k ? ' on' : '') + '" data-act="plan" data-v="' + k + '">' + P.name + '<small>' + esc(P.desc) + '</small></button>').join('') + '</div></div>' : '') +
      (c.fatigue > 45 ? '<div class="note">Усталость ' + Math.round(c.fatigue) + ': дыхалки в схватке будет меньше.</div>' : '') +
      '<div class="foot"><button class="btn primary" data-act="fight">На татами</button><button class="btn" data-act="tohub">‹ К карьере</button></div>';
  } else {
    body = '<div class="big ' + (ev.place <= 3 ? 'win' : 'loss') + '">' + (ev.single ? (ev.place === 1 ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ') : ev.exam ? (ev.wins >= 1 ? 'АТТЕСТАЦИЯ СДАНА' : 'АТТЕСТАЦИЯ НЕ СДАНА') : (ev.place <= 3 ? MED[ev.place] + ' ' : '') + ev.place + ' МЕСТО') + '</div>' +
      '<table class="st"><tr><td>Призовые</td><td>' + money(ev.prize || 0) + '</td></tr><tr><td>Репутация</td><td>+' + (ev.rep || 0) + '</td></tr>' + (ev.pts ? '<tr><td>Рейтинг-очки</td><td>+' + ev.pts + '</td></tr>' : '') + (ev.champion && ev.champion !== 'player' && C.npcById(ev.champion) ? '<tr><td>Победитель турнира</td><td>' + esc(C.npcById(ev.champion).name) + '</td></tr>' : '') + '</table>' +
      evStatsHtml(ev) + unlockedHtml(ev.unlocked) +
      '<div class="foot">' + (ev.place <= 3 && !ev.single && !ev.exam && !ev.podium && ev.tier >= 1 ? '<button class="btn primary" data-act="podium">Пьедестал</button>' : '') + '<button class="btn' + (ev.place <= 3 && !ev.single && !ev.exam && !ev.podium && ev.tier >= 1 ? '' : ' primary') + '" data-act="evdone">Дальше</button></div>';
  }
  p.innerHTML = '<h2>' + esc(ev.name) + '</h2><div class="dim">' + GW.TIERS[ev.tier].name + (ev.single ? '' : ev.exam ? ' · две аттестационные схватки со старшими' : ' · сетка на ' + ev.size) + (ev.invite ? ' · по приглашению' : '') + '</div><div class="br">' + rows + '</div>' + body +
    (ev.log.length ? '<h3>Другие схватки</h3><div class="news">' + ev.log.slice(-6).map((l) => '<div>' + esc(l) + '</div>').join('') + '</div>' : '');
}
function unlockedHtml(list) {
  if (!list || !list.length) return '';
  const seen = {};
  return list.filter((u) => !seen[u] && (seen[u] = true)).map((u) => {
    if (u.startsWith('tier:')) { const t = +u.slice(5); return '<div class="good"><b>НОВЫЙ ЭТАП: ' + esc(GW.TIERS[t].name) + '</b> · ' + esc(GW.BELTS[t].name) + '<br>Открыто: ' + GW.TIERS[t].opens.map(esc).join(' · ') + '</div>'; }
    if (u.startsWith('task:')) { const t = GW.TASKS.find((x) => x.id === u.slice(5)); return t ? '<div class="good">Задание тренера выполнено: <b>' + esc(t.name) + '</b> · ' + reward(t.reward) + '</div>' : ''; }
    if (u.startsWith('session:')) { const S = GW.SESSIONS[u.slice(8)]; return S ? '<div class="good">Открыта тренировка: <b>' + esc(S.name) + '</b> — ' + esc(S.desc) + '</div>' : ''; }
    if (u.startsWith('learn:')) return '<div class="good">Новые броски: <b>' + u.slice(6).split(',').map(tn).join(', ') + '</b> — поставьте их на кнопки в «Билд и кнопки».</div>';
    if (u.startsWith('invite:')) { const k = u.slice(7), e = GW.EVENTS.find((x) => x.id === k.split('@')[0]); return e ? '<div class="good">Приглашение на «<b>' + esc(e.name) + '</b>» (' + esc(GW.TIERS[e.tier].name) + ')</div>' : ''; }
    if (u.startsWith('ch:')) { const ch = GW.CHALLENGES.find((x) => x.id === u.slice(3)); return ch ? '<div class="good">Испытание выполнено: <b>' + esc(ch.name) + '</b></div>' : ''; }
    const a = GW.ACH[u]; return a ? '<div class="good">Достижение: <b>' + esc(a.name) + '</b> — ' + esc(a.desc) + '</div>' : '';
  }).join('');
}
// a fight of the career: on the mat, then the analysis
function careerFight() {
  const g = G(), c = GW.c, ev = c.ev, oppId = C.nextOpponent(c), n = C.npcById(oppId);
  const final = C.isFinal(c);
  J.setVenue(GW.venueFor(ev)); J.opt.gi = c.gi; J.opt.name = c.short.toUpperCase();
  UFC.fuel = { gly: 60 + c.attrs.cardio * 1.4, acid: 60 + c.attrs.cardio * 1.4 };
  const lvl = Math.min(3, [0, 0, 1, 1, 2, 2, 3, 3][ev.tier] + (final ? 1 : 0));
  let settled = false;
  const finish = (won, text) => {
    if (settled) return; settled = true;
    const L = GW.log, info = { final, round: ev.single ? ev.name : C.roundName(ev) };
    const res = C.settleFight(c, won, text, L, oppId, info);
    GW.post = { won, text, opp: n, a: GW.analyze(L, won, { cfg: { gwType: n.type } }), xp: res.xp, unlocked: res.unlocked, round: info.round, ev: ev.name };
    if (ev.single) C.settleSingle(c, won); else C.advance(c, won);
    GW.plan = null;
  };
  g.onResultContinue = () => g.quitToMenu();
  g.onQuit = () => { finish(false, 'Снялся со схватки'); ui().go('scr-gw-post', null, { reset: true }); };
  g.startQuickFight(C.playerCfg(c), C.npcCfg(n, c, ev.boost), Object.assign({}, g.ui.settings, { difficulty: lvl }), { gw: true, event: ev.name, final, gwCareer: true, gwCue: c.tier <= 2, onEnd: (fight) => finish(!!fight.won, fight.methodText || '') });
  GW.plan = c.tier >= 6 ? (ev.plan || 'own') : null;   // after the start: a new fight clears the plan of the last one
  if (c.memory && c.memory[n.id] && J.readSeed) J.readSeed(c.memory[n.id]);
  if (g.p1 && c.fatigue > 30) { g.p1.staminaCap = Math.round(g.p1.staminaCap * (1 - (c.fatigue - 30) / 200)); g.p1.stamina = Math.min(g.p1.stamina, g.p1.staminaCap); }
}
// the coach's word after a fight: the first lesson of a loss, and the weak spot of the man who beat you
function coachTalk(P, c) {
  if (!c || (c.tier > 3 && P.won)) return '';
  const n = P.opp, a = P.a, who = coachName(c), out = [];
  if (!P.won && !c.firstLoss) { c.firstLoss = c.week + 1; C.save(); out.push('Первое поражение. Это не конец — это урок. Давай разберём, что случилось.'); }
  if (P.won) out.push(a.good[0] ? 'Хорошо. ' + a.good[0] : 'Победа. Но смотри разбор — там есть над чем работать.');
  if (a.tips[0]) out.push((P.won ? 'И ещё: ' : '') + a.tips[0]);
  if (!P.won && n && n.weak && !n.filler) out.push('И запомни его слабость: ' + n.name + ' — ' + GW.WEAK[n.weak] + '. В следующий раз бей туда.');
  return out.length ? '<div class="coach"><b>' + esc(who) + ':</b> «' + out.map(esc).join(' ') + '»</div>' : '';
}
function renderPost() {
  const p = screen('scr-gw-post'), P = GW.post, c = GW.c;
  if (!P) { p.innerHTML = '<div class="foot"><button class="btn" data-act="tohub">К карьере</button></div>'; return; }
  const a = P.a;
  if (P.talk == null) P.talk = coachTalk(P, c);   // said once, kept when the screen is drawn again
  p.innerHTML = '<div class="dim">' + esc(P.ev) + ' · ' + esc(P.round) + ' · ' + esc(P.opp.name) + ' (' + esc(GW.TYPES[P.opp.type].name) + ')</div>' +
    '<div class="big ' + (P.won ? 'win' : 'loss') + '">' + (P.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ') + '</div><div>' + esc(P.text) + (P.xp ? ' · опыт +' + P.xp : '') + '</div>' +
    P.talk +
    '<div class="twocol"><div><h3>Разбор схватки</h3><table class="st">' + a.lines.map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('') + '</table></div>' +
    '<div>' + (a.good.length ? '<h3>Что получилось</h3>' + a.good.map((t) => '<div class="good">' + esc(t) + '</div>').join('') : '') +
    (a.tips.length ? '<h3>' + (P.won ? 'Что улучшить' : 'Почему проиграли и что менять') + '</h3>' + a.tips.map((t) => '<div class="tip">' + esc(t) + '</div>').join('') : '') + '</div></div>' +
    unlockedHtml(P.unlocked) +
    (!P.won && !P.spar ? '<div class="note">Поражение не обнуляет прогресс: опыт и рейтинг остаются. ' + esc(P.opp.name) + ' теперь в списке соперников — реванш доступен в «Соперники».</div>' : '') +
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

// ---------------------------------------------------------------- the build: the buttons, attributes, perks, the weight
let loadSlot = 0;
function renderBuild() {
  const p = screen('scr-gw-build'), c = GW.c, pot = C.potential(c), sum = C.attrSum(c), slots = C.perkSlots(c);
  const L = C.fightLoadout(c);
  const locked = J.TECH_ORDER.filter((id) => !c.known.includes(id)).sort((a, b) => GW.THROW_TIER[a] - GW.THROW_TIER[b]);
  const i = GW.CLASSES.indexOf(c.kg), nb = [GW.CLASSES[i - 1], GW.CLASSES[i + 1]].filter(Boolean);
  p.innerHTML = '<h2>Билд и кнопки</h2>' +
    '<h3>Броски на кнопках</h3><div class="dim">Изучено ' + c.known.length + ' из ' + J.TECH_ORDER.length + '. Выберите кнопку, потом бросок. Кнопки с неизученными бросками в схватке показывают «—».</div>' +
    '<div class="chips">' + L.map((id, k) => '<button class="chip' + (loadSlot === k ? ' on' : '') + '" data-act="lslot" data-v="' + k + '">' + SLOT[k] + ' ' + (c.known.includes(id) ? tn(id) : '—') + '<small>кнопка ' + SLOT[k] + '</small></button>').join('') + '</div>' +
    '<div class="chips">' + c.known.map((id) => '<button class="chip' + (L[loadSlot] === id ? ' on' : '') + '" data-act="lset" data-v="' + id + '">' + tn(id) + '<small>мастерство ' + Math.round(c.mastery[id] || 10) + '</small></button>').join('') + '</div>' +
    (locked.length ? '<div class="dim" style="font-size:12px;margin-top:4px">Ещё не изучены: ' + locked.map((id) => tn(id) + ' (этап «' + GW.TIERS[GW.THROW_TIER[id]].name + '»)').join(' · ') + '</div>' : '') +
    '<h3>Характеристики</h3><div class="dim">Свободных очков: <b>' + c.pts + '</b> · сумма ' + Math.round(sum) + ' из потенциала ' + pot + '. Потенциал растёт с уровнем и с каждым этапом: всё прокачать нельзя.</div>' +
    bar(sum, pot) +
    GW.ATTR_KEYS.map((k) => '<div class="attr"><span title="' + esc(GW.ATTRS[k].desc) + '">' + GW.ATTRS[k].name + (c.spec && GW.SPECS[c.spec].attr === k ? ' ★' : '') + '</span><i><u style="width:' + c.attrs[k] + '%"></u></i><b>' + Math.round(c.attrs[k]) + '</b><button class="btn small" data-act="spend" data-v="' + k + '"' + (c.pts && sum < pot && c.attrs[k] < 100 ? '' : ' disabled') + '>+</button></div>').join('') +
    '<div class="dim" style="margin-top:4px">' + GW.ATTR_KEYS.map((k) => GW.ATTRS[k].name + ' — ' + GW.ATTRS[k].desc).join(' · ') + '</div>' +
    '<h3>Перки · слотов ' + c.perks.length + '/' + slots + '</h3><div class="dim">Слоты открываются на уровнях ' + GW.PERK_SLOTS.join(', ') + '. У каждого перка есть цена.</div><div class="perks">' +
    Object.entries(GW.PERKS).map(([id, P]) => '<div class="perk' + (c.perks.includes(id) ? ' on' : '') + '" data-act="perk" data-v="' + id + '"><b>' + P.name + '</b><span class="p">+ ' + esc(P.plus) + '</span><br><span class="m">− ' + esc(P.minus) + '</span></div>').join('') + '</div>' +
    '<h3>Весовая категория</h3><div class="dim">Сейчас ' + c.kg + ' кг' + (c.kg !== c.startKg ? ' (начинали в ' + c.startKg + ' кг)' : '') + '. Вверх — сила +4, скорость −3, выносливость −2; вниз — наоборот. Рейтинг начинается заново.</div><div class="chips">' +
    nb.map((kg) => { const why = C.weightOk(c, kg); return '<button class="chip" data-act="kgch" data-v="' + kg + '"' + (why ? ' disabled' : '') + '>Перейти в ' + kg + ' кг<small>' + esc(why || 'сгонка или набор веса') + '</small></button>'; }).join('') + '</div>' +
    '<h3>Мастерство бросков</h3><div class="bars">' + J.TECH_ORDER.map((id) => '<div class="bar2"' + (c.known.includes(id) ? '' : ' style="opacity:.4"') + '><span>' + tn(id) + '</span><i><u style="width:' + Math.round(c.mastery[id] || 10) + '%"></u></i><b>' + Math.round(c.mastery[id] || 10) + '</b></div>').join('') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Назад</button></div>';
}

// ---------------------------------------------------------------- the rivals and the ranking
function renderRivals() {
  const p = screen('scr-gw-rivals'), c = GW.c;
  const rm = C.rematches(c);
  const met = Object.entries(c.rivals).map(([id, r]) => ({ n: C.npcById(id), r })).filter((x) => x.n).sort((a, b) => (b.r.w + b.r.l) - (a.r.w + a.r.l));
  const scout = GW.ROSTER.filter((n) => n.tier >= Math.max(1, c.tier - 1) && n.tier <= c.tier + 1);
  const card = (n, extra) => '<div class="ev"><div>' + typeTag(n.type) + '<b>' + esc(n.name) + '</b> <span class="dim">' + GW.CC[n.cc] + ' · уровень ' + C.npcLevel(n, c) + ' · ' + esc(GW.TIERS[Math.min(7, n.tier)].name) + '</span><small>' + n.fav.map(tn).join(', ') + ' · ' + esc(n.bio) + '</small>' + recordHtml(c, n.id) + styleHtml(c, n) + '</div>' + (extra || '') + '</div>';
  let rank = '';
  if (c.tier >= 4) {
    const T = C.rankTable(c), me = T.findIndex((x) => x.id === 'player');
    rank = '<h3>Рейтинг · ' + c.kg + ' кг · ' + esc(GW.TIERS[c.tier].name) + '</h3><div class="dim">Очки за медали последних двух лет (старые сгорают) и уровень. От места зависит посев в сетке.</div><table class="st rank">' +
      T.slice(0, 10).map((x, k) => '<tr class="' + (x.id === 'player' ? 'me' : '') + '"><td>' + (k + 1) + '</td><td>' + esc(x.name) + '</td><td>' + x.pts + '</td></tr>').join('') + (me >= 10 ? '<tr class="me"><td>' + (me + 1) + '</td><td>' + esc(c.name) + '</td><td>' + T[me].pts + '</td></tr>' : '') + '</table>';
  }
  p.innerHTML = '<h2>Соперники' + (c.tier >= 4 ? ' и рейтинг' : '') + '</h2>' + rank +
    '<h3>Реванш' + (c.tier >= 7 ? ' и старые соперники' : '') + '</h3><div class="evs">' + (rm.length ? rm.map(({ n, r }) => card(n, '<span>' + r.w + '–' + r.l + '</span>' + (c.injury > 0 ? '<span class="bad">травма</span>' : '<button class="btn primary" data-act="rematch" data-v="' + n.id + '">' + (c.tier >= 7 && n.tier < 6 ? 'Он вернулся' : 'Реванш') + ' (неделя)</button>'))).join('') : '<div class="ev"><div>Нет долгов. Кто победит вас в официальной схватке — появится здесь.</div></div>') + '</div>' +
    '<h3>Ваши встречи</h3><div class="evs">' + (met.map(({ n, r }) => card(n, '<b>' + r.w + '–' + r.l + '</b>')).join('') || '<div class="ev"><div>Пока ни одной официальной схватки.</div></div>') + '</div>' +
    (c.tier >= 1 ? '<h3>Кто есть кто рядом с вашим уровнем</h3><div class="evs">' + scout.map((n) => card(n)).join('') + '</div>' : '') +
    '<h3>Пять типов соперников</h3><div class="evs">' + Object.entries(GW.TYPES).map(([k, t]) => '<div class="ev"><div>' + typeTag(k) + '<b>' + t.name + '</b><small>' + esc(t.desc) + '</small></div>' + (c.typesBeaten[k] ? '<span class="good">побеждён</span>' : '') + '</div>').join('') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Назад</button></div>';
}

// ---------------------------------------------------------------- the book
function renderBook() {
  const p = screen('scr-gw-book'), c = GW.c, s = c.stats;
  const r = c.records, m = C.meta().records || {};
  const sp = Object.values(c.spar).reduce((a, x) => [a[0] + x.w, a[1] + x.l], [0, 0]);
  p.innerHTML = '<h2>Статистика и история</h2>' +
    '<div class="twocol"><div><table class="st"><tr><td>Официальных схваток</td><td>' + s.fights + '</td></tr><tr><td>Победы / поражения</td><td>' + s.wins + ' / ' + s.losses + '</td></tr><tr><td>Спарринги: победы / поражения</td><td>' + sp[0] + ' / ' + sp[1] + '</td></tr><tr><td>Иппон бросками</td><td>' + s.ippons + '</td></tr><tr><td>Удержаниями / сдачей</td><td>' + s.holds + ' / ' + s.subs + '</td></tr><tr><td>Победы в золотом скоре</td><td>' + s.golden + '</td></tr><tr><td>Лучшая серия</td><td>' + s.best + '</td></tr><tr><td>Попыток бросков / прошло</td><td>' + s.tries + ' / ' + s.landed + '</td></tr><tr><td>Турниров / золото</td><td>' + s.events + ' / ' + s.golds + '</td></tr><tr><td>Медали</td><td>' + (c.medals.map((x) => MED[x.place]).join('') || '—') + '</td></tr><tr><td>Титулы</td><td>' + (c.titles.map((t) => t.name + (t.kg ? ' (' + t.kg + ' кг)' : '')).join(', ') || '—') + '</td></tr><tr><td>Задания тренера</td><td>' + Object.keys(c.tasks).length + ' из ' + GW.TASKS.length + '</td></tr></table></div>' +
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
    (c ? '<h3>Карьерные испытания</h3><div class="evs">' + GW.CHALLENGES.map((ch) => '<div class="ev"><div><b>' + esc(ch.name) + '</b> <span class="dim">с этапа «' + esc(GW.TIERS[ch.tier].name) + '»</span><small>' + esc(ch.desc) + ' · награда: ' + reward(ch.reward) + '</small></div>' + (c.challenges[ch.id] != null ? '<span class="good">выполнено</span>' : c.tier < ch.tier ? '<span class="dim">закрыто</span>' : '<span>в работе</span>') + '</div>').join('') + '</div>' : '') +
    '<h3>Зал славы</h3><div class="evs">' + ((m.hall || []).map((h, k) => '<div class="ev"><div>' + (k + 1) + '. <b>' + esc(h.name) + '</b> <span class="dim">' + (GW.CC[h.cc] || '') + ' · ' + h.kg + ' кг · ' + esc(h.rank) + '</span><small>' + (h.titles.join(', ') || 'без титулов') + ' · медалей ' + h.medals + ' · побед ' + h.wins + ' из ' + h.fights + '</small></div><b>' + h.legacy + '</b></div>').join('') || '<div class="ev"><div>Пусто. Завершите карьеру — и она займёт место здесь.</div></div>') + '</div>' +
    '<div class="foot"><button class="btn" data-act="back">‹ Назад</button></div>';
}
function renderLegacy(p, c) {
  const pts = C.legacy(c);
  p.innerHTML = '<h2>' + esc(c.name) + ' · карьера завершена</h2><div class="dim">' + GW.CC[c.cc] + ' · ' + c.kg + ' кг · ' + c.age + ' лет · ' + C.date(c) + '</div>' +
    '<div class="big win">' + esc(C.legacyName(pts)) + '</div><div>Очки наследия: <b>' + pts + '</b></div>' +
    '<div class="row"><div class="card"><span>Этап</span><b>' + esc(GW.TIERS[c.tier].name) + '</b></div><div class="card"><span>Победы</span><b>' + c.stats.wins + '/' + c.stats.fights + '</b></div><div class="card"><span>Медали</span><b>' + c.medals.length + '</b></div><div class="card"><span>Титулы</span><b>' + c.titles.length + '</b></div><div class="card"><span>Защит титула</span><b>' + c.defenses + '</b></div></div>' +
    '<h3>Титулы</h3><div class="evs">' + (c.titles.map((t) => '<div class="ev"><div><b>' + esc(t.name) + '</b>' + (t.kg ? ' · ' + t.kg + ' кг' : '') + '<small>' + esc(t.ev) + ' · ' + C.date(c, t.w) + '</small></div></div>').join('') || '<div class="ev"><div>—</div></div>') + '</div>' +
    '<div class="foot"><button class="btn primary" data-act="wipe2">Новая карьера</button><button class="btn" data-act="ach">Зал славы</button><button class="btn" data-act="back">‹ Меню</button></div>';
}

// ---------------------------------------------------------------- the training hall (outside the career)
const hall = { drill: 'uchikomi', tech: 'podhvat', type: 'champion', lvl: 1 };
function renderHall() {
  const p = screen('scr-gw-hall');
  const ch = (act, v, cur, label, sub) => '<button class="chip' + (String(v) === String(cur) ? ' on' : '') + '" data-act="' + act + '" data-v="' + v + '">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  p.innerHTML = '<h2>Тренировочный зал</h2><div class="dim">Отработка без карьеры: те же мини-игры и спарринг с любым типом соперника. Все броски открыты.</div>' +
    '<div class="opt"><label>Упражнение</label><div class="chips">' + ch('hdrill', 'uchikomi', hall.drill, 'Тайминг броска', 'бросить в момент потери равновесия') + ch('hdrill', 'grip', hall.drill, 'Борьба за захват', '30 секунд, только захват') + ch('hdrill', 'defense', hall.drill, 'Устоять', '6 атак: L1 в начале броска') + ch('hdrill', 'newaza', hall.drill, 'Партер', 'удержать 10 с и выйти снизу') + ch('hdrill', 'sparring', hall.drill, 'Спарринг', 'полноценная схватка') + '</div></div>' +
    (hall.drill === 'uchikomi' ? '<div class="opt"><label>Бросок</label><div class="chips">' + J.TECH_ORDER.map((id) => ch('htech', id, hall.tech, tn(id))).join('') + '</div></div>' : '') +
    (hall.drill === 'sparring' ? '<div class="opt"><label>Тип соперника</label><div class="chips">' + Object.entries(GW.TYPES).map(([k, t]) => ch('htype', k, hall.type, t.name, t.desc)).join('') + '</div></div>' : '') +
    '<div class="opt"><label>Сложность (решения соперника)</label><div class="chips">' + ['Новичок', 'Разрядник', 'Мастер', 'Чемпион'].map((n, k) => ch('hlvl', k, hall.lvl, n)).join('') + '</div></div>' +
    '<div class="foot"><button class="btn primary" data-act="hgo">На татами</button><button class="btn" data-act="back">‹ Назад</button></div>';
}
let hallRes = null;
function hallGo() {
  const pc = Object.assign({}, UFC.fighterCfg(J.CLASSES[J.opt.kg][0]), { name: 'Вы', short: 'Вы', stats: { power: 60, speed: 60, cardio: 60, wrestling: 60, defense: 60, bjj: 60, chin: 70, boxing: 50, kicks: 40 } });
  const n = GW.ROSTER.find((x) => x.type === hall.type && x.tier === 3) || GW.ROSTER[0];
  const fakeC = { kg: J.opt.kg || 66, face: -1, week: 0 };
  const oc = Object.assign(C.npcCfg(Object.assign({}, n, { lv: 58 }), fakeC), { known: null, gwRead: null, gwPrep: false });
  UFC.fuel = null;
  const done = (r) => { hallRes = r; ui().go('scr-gw-hres', null, { reset: true }); };
  if (hall.drill === 'grip') GW.Drills.grip(pc, oc, hall.lvl, done);
  else if (hall.drill === 'uchikomi') GW.Drills.uchikomi(pc, oc, hall.lvl, hall.tech, done);
  else if (hall.drill === 'defense') GW.Drills.defense(pc, oc, hall.lvl, done);
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
function goTask(c, id) {
  const t = GW.TASKS.find((x) => x.id === id); if (!t) return;
  const [kind, arg] = t.act.split(':');
  plan = newPlan(c);
  if (kind === 'drill') { plan.slots[0] = arg; if (plan.slots[1] === arg) plan.slots[1] = 'tech'; }
  if (kind === 'spar') { plan.slots[0] = 'sparring'; plan.partner[0] = defaultPartner(c, arg); if (plan.slots[1] === 'sparring') plan.slots[1] = c.sessions.includes('uchikomi') ? 'uchikomi' : 'grip'; }
  plan.play = true;
  ui().go('scr-gw-week');
}
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
    case 'height': spec.height = v; renderHub(); break;
    case 'stance': spec.stance = v; renderHub(); break;
    case 'create': { const inp = document.getElementById('gw-name'); if (inp) spec.name = inp.value; if (!spec.name.trim()) spec.name = 'Иван Волков'; C.create(spec); J.opt.kg = spec.kg; renderHub(); break; }
    case 'week': plan = null; U.go('scr-gw-week'); break;
    case 'taskgo': goTask(c, v); break;
    case 'club': U.go('scr-gw-club'); break;
    case 'slot': plan.slots[+b.dataset.i] = v; renderWeek(); break;
    case 'partner': plan.partner[+b.dataset.i] = v; renderWeek(); break;
    case 'indiv': if (c.spec) plan.slots = GW.SPECS[c.spec].plan.filter((s) => c.sessions.includes(s)).concat(['recovery', 'recovery']).slice(0, 3); renderWeek(); break;
    case 'tech': plan.tech = v; renderWeek(); break;
    case 'play': plan.play = v === '1'; renderWeek(); break;
    case 'physio': c.physio = !c.physio; C.save(); renderWeek(); break;
    case 'runweek': runWeek(); break;
    case 'enter': { const e2 = C.eventsAround(c).find((x) => x.key === v); if (e2 && c.injury <= 0 && c.money >= (e2.fee || 0)) { if (e2.single) C.startRankMatch(c, e2); else C.startEvent(c, e2); U.go('scr-gw-ev', null, { reset: true }); } break; }
    case 'toev': U.go('scr-gw-ev', null, { reset: true }); break;
    case 'fight': careerFight(); break;
    case 'scout': C.scout(c, v); renderEvent(); break;
    case 'plan': if (c.ev) { c.ev.plan = v; C.save(); } renderEvent(); break;
    case 'grudge': if (c.injury <= 0) { C.startRematch(c, v, 'Принципиальная схватка'); U.go('scr-gw-ev', null, { reset: true }); } break;
    case 'afterpost': {
      if (GW.post && GW.post.spar && GW.weekCont) { const k = GW.weekCont; GW.weekCont = null; GW.post = null; k(); break; }
      U.go(c && c.ev ? 'scr-gw-ev' : 'scr-gw', null, { reset: true }); break;
    }
    case 'podium': showPodium(); break;
    case 'evdone': C.finishEvent(c); U.go('scr-gw', null, { reset: true }); break;
    case 'build': U.go('scr-gw-build'); break;
    case 'spend': C.spend(c, v); renderBuild(); break;
    case 'perk': if (!C.togglePerk(c, v)) U.toast && U.toast('Все слоты перков заняты — уберите один или поднимите уровень'); renderBuild(); break;
    case 'lslot': loadSlot = +v; renderBuild(); break;
    case 'lset': {
      const L = C.fightLoadout(c).map((x) => (c.known.includes(x) ? x : null)), j = L.indexOf(v);
      if (j >= 0) L[j] = L[loadSlot];
      L[loadSlot] = v; c.loadout = L; C.save(); renderBuild(); break;
    }
    case 'kgch': if (C.changeWeight(c, +v)) renderBuild(); break;
    case 'spec': { if (C.setSpec(c, v) && U.toast) U.toast('Специализация: ' + GW.SPECS[v].name); renderClub(); break; }
    case 'transfer': { if (C.transfer(c, v) && U.toast) U.toast('Новый зал: ' + GW.CLUBS[v].name); renderClub(); break; }
    case 'rivals': U.go('scr-gw-rivals'); break;
    case 'rematch': C.startRematch(c, v); U.go('scr-gw-ev', null, { reset: true }); break;
    case 'book': U.go('scr-gw-book'); break;
    case 'ach': U.go('scr-gw-ach'); break;
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
  for (const id of ['scr-gw', 'scr-gw-week', 'scr-gw-wres', 'scr-gw-ev', 'scr-gw-post', 'scr-gw-build', 'scr-gw-rivals', 'scr-gw-book', 'scr-gw-ach', 'scr-gw-hall', 'scr-gw-hres', 'scr-gw-club']) screen(id);
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
  U.route('scr-gw-club', () => renderClub());
  // back in the main menu your own buttons come back (a career fight puts only the learned throws on them)
  const origGo = U.go.bind(U);
  U.go = (id, params, opts) => {
    if ((id === 'scr-menu' || id === 'scr-jbtn') && GW._ownLoadout) { J.loadout = GW._ownLoadout; GW._ownLoadout = null; GW.known = null; J.relabel(); }
    return origGo(id, params, opts);
  };
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

