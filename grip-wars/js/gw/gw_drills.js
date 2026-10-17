//# sourceURL=judo/gw_drills.js
// GRIP WARS: the training on the mat. Short drills in the real engine, each one gives a multiplier to the gains:
// the grip fight (30 s, only the grips count), the timing of a throw (8 entries: throw at the moment he loses his
// balance, in the right direction), the defence (stand up to 6 of his attacks: L1 at the start of his throw,
// or hold the defensive posture), ne-waza (hold him 10 s, then get out from under him) and a sparring bout.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const GW = window.GW;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const D = GW.Drills = {};

// the little board of a drill in the middle of the screen
function board(html) {
  let el = document.getElementById('gwd');
  if (!el) {
    el = document.createElement('div'); el.id = 'gwd'; document.body.appendChild(el);
    const css = document.createElement('style');
    css.textContent = `#gwd { position: absolute; left: 50%; top: 150px; transform: translateX(-50%); z-index: 31; pointer-events: none; text-align: center; padding: 8px 16px; border-radius: 10px; background: rgba(8,10,16,.8); color: #fff; font: 800 14px/1.25 system-ui, sans-serif; letter-spacing: .06em; min-width: 220px; }
#gwd b { color: #f0c82c; } #gwd .cue { font-size: 26px; color: #7fffa0; display: block; margin-top: 4px; } #gwd .cue.back { color: #7fd0ff; } #gwd i { display: block; height: 5px; margin-top: 6px; background: rgba(255,255,255,.12); border-radius: 3px; overflow: hidden; } #gwd i u { display: block; height: 100%; background: #f0c82c; }
@media (max-height: 520px) { #gwd { top: 118px; } }`;
    document.head.appendChild(css);
  }
  el.style.display = html ? 'block' : 'none';
  if (el._h !== html) { el._h = html; el.innerHTML = html || ''; }
}
D.board = board;

// start a drill: the two bodies, the rules, and where to go when it is over
function begin(d, pcfg, ocfg, lvl, len, o) {
  const g = window.__UFC__;
  J.setVenue((o && o.venue) || 'dojo');
  J.opt.gi = d.gi || 'white'; J.opt.name = (pcfg.short || pcfg.name || '').toUpperCase();
  GW.drill = d;
  d.t = 0; d.done = false;
  g.onResultContinue = () => g.quitToMenu();
  g.onQuit = () => { const x = GW.drill; GW.drill = null; J.noPartial = false; board(''); if (x && x.finishCb) x.finishCb(x.result || D.result(x)); };
  g.startQuickFight(pcfg, ocfg, Object.assign({}, g.ui.settings, { difficulty: lvl, forceLen: len || 30 }), { gw: true, drill: d.kind, presentation: 'off', gwCareer: !!(o && o.career) });
  if (g.p1 && d.after) d.after(g);
}
D.end = function (d) {
  if (d.done) return;
  d.done = true; d.result = D.result(d);
  board('<b>' + d.title + '</b><br>' + d.result.text);
  setTimeout(() => { const g = window.__UFC__; if (GW.drill === d) g.quitToMenu(); }, 1400);
};
D.result = function (d) {
  const mult = cl(d.mult ? d.mult() : 1, 0.5, 1.8);
  return { kind: d.kind, mult, text: d.summary ? d.summary() : '', score: d.score || 0, hits: d.hits || 0, stood: d.stood || 0, held: d.held || 0 };
};
const stand = (ai) => { const it = ai.f.intent; it.mx = it.mz = 0; it.strike = null; };

// ---------------------------------------------------------------- 1. the grip fight
D.grip = function (pcfg, ocfg, lvl, cb, o) {
  const d = { kind: 'grip', title: 'Борьба за захват', finishCb: cb, score: 0, noThrows: 'НА ЭТОЙ ТРЕНИРОВКЕ — ТОЛЬКО ЗАХВАТ', noNe: true };
  d.ai = function (ai, dt) {
    const g = ai.game, f = ai.f, o = f.opponent, it = f.intent;
    if (g.phase !== 'fight' || d.done || f.state !== 'fight') { stand(ai); return; }
    const dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
    it.mz = dist > 1.15 ? 0.8 : dist < 0.75 ? -0.6 : 0; it.mx = Math.sin(g.clock * 1.3) * 0.4;
    ai.gcd = (ai.gcd || 0.6) - dt; ai.bcd = (ai.bcd || 0) - dt;
    if (dist < 1.4 && (f.grip || 0) < 2 && ai.gcd <= 0) { J.takeGrip(f); ai.gcd = rnd(0.7, 1.4) * (1.3 - 0.2 * lvl); }
    if ((o.grip || 0) > 0) { ai.re = (ai.re == null ? [1.2, 0.85, 0.6, 0.4][lvl] * rnd(0.8, 1.2) : ai.re) - dt; if (ai.re <= 0 && ai.bcd <= 0) { J.breakGrip(f); ai.bcd = rnd(0.5, 1.1); ai.re = null; } } else ai.re = null;
  };
  d.tick = function (g, dt) {
    if (g.phase !== 'fight' || d.done) return;
    d.t += dt;
    const a = g.p1.grip || 0, b = g.p2.grip || 0;
    d.score += dt * (a - b + (a >= 2 && b === 0 ? 0.5 : 0));
    const hint = b > 0 && a < 2 ? 'он держит — L1, сбросьте' : a === 0 ? 'подойдите и L2 — рукав' : a === 1 ? 'L2 ещё раз — отворот' : 'держите! он будет сбрасывать';
    board('<b>ЗАХВАТЫ</b> · ' + Math.max(0, 30 - d.t).toFixed(0) + ' с<br>Счёт ' + d.score.toFixed(0) + ' · вы ' + '●'.repeat(a) + '○'.repeat(2 - a) + ' · он ' + '●'.repeat(b) + '○'.repeat(2 - b) + '<br><small>' + hint + '</small><i><u style="width:' + cl(d.score / 30 * 100, 0, 100) + '%"></u></i>');
    if (d.t >= 30) D.end(d);
  };
  d.onTime = () => D.end(d);
  d.mult = () => 0.6 + d.score / 25;
  d.summary = () => 'Счёт ' + d.score.toFixed(0) + ' → рост ×' + cl(0.6 + d.score / 25, 0.5, 1.8).toFixed(2);
  begin(d, pcfg, ocfg, lvl, 60, o);
};

// ---------------------------------------------------------------- 2. the timing of a throw (uchikomi with a resisting partner)
const dirOk = (T, dir) => (dir === 'back' ? T.fall === 'backward' || T.fall === 'back' : T.fall === 'forward' || T.fall === 'side');
D.uchikomi = function (pcfg, ocfg, lvl, tech, cb, o) {
  const d = { kind: 'uchikomi', title: 'Тайминг броска', finishCb: cb, tech, tries: 0, hits: 0, max: 8, cue: null, cueT: rnd(1.4, 2.4), noTwist: true, noNe: true };
  d.ai = function (ai) {
    stand(ai); const f = ai.f, o = f.opponent; f.grip = 0;
    // the partner holds the grip distance himself: you hold him, he moves with you
    const dist = o ? Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) : 1;
    f.intent.mz = dist > 0.95 ? 0.7 : dist < 0.7 ? -0.5 : 0;
    f.intent.mx = Math.sin(ai.game.clock * 0.9) * 0.25;
  };
  d.chance = function (f, o, T) {
    if (f !== f.game.p1) return 0;
    const good = !!(o.offBal && o.offBal.gw && dirOk(T, o.offBal.dir));
    d.lastGood = good;
    return good ? 1.6 : 0;
  };
  d.onAttempt = function (f) { if (f.isPlayer) { d.tries++; if (d.lastGood) d.hits++; f.game.p2.offBal = null; d.cue = null; d.cueT = rnd(1.6, 2.6); } };
  d.onDone = function (g, run) {
    g.judoRun = null;
    if (run.tori === g.p1) g.ui.callout(run.fail ? 'НЕ ТОТ МОМЕНТ' : 'ТОЧНО!', run.fail ? 'бросайте, когда он теряет равновесие, в его сторону' : run.tech.name, 'round', 1.1);
    J.matte(g, run.fail ? null : run.uke);
    if (d.tries >= d.max) setTimeout(() => D.end(d), 1600);
    return false;
  };
  d.tick = function (g, dt) {
    if (g.phase !== 'fight' || d.done) return;
    d.t += dt;
    if (!J.paused(g)) {
      g.p1.grip = 2; g.p1._judoCool = 0;
      d.cueT -= dt;
      if (!d.cue && d.cueT <= 0 && d.tries < d.max) { d.cue = Math.random() < 0.5 ? 'forward' : 'back'; g.p2.offBal = { dir: d.cue, t: [1.0, 0.85, 0.7, 0.55][lvl], k: 1, gw: true }; }
      if (d.cue && !g.p2.offBal) { d.cue = null; d.cueT = rnd(1.4, 2.4); }
    }
    const T = J.TECHS[d.tech];
    // which of your buttons fits the moment
    const k = d.cue ? J.loadout.findIndex((id) => J.TECHS[id] && dirOk(J.TECHS[id], d.cue) && (!GW.known || GW.known.includes(id))) : -1;
    const btn = k >= 0 ? ' · ' + ['□', '△', '✕', '○', 'R2'][k] + ' ' + J.TECHS[J.loadout[k]].name : '';
    board('<b>ТАЙМИНГ</b> · попытка ' + Math.min(d.max, d.tries + 1) + '/' + d.max + ' · точных ' + d.hits +
      (d.cue ? '<span class="cue' + (d.cue === 'back' ? ' back' : '') + '">' + (d.cue === 'back' ? 'НА ПЯТКАХ — НАЗАД' : 'ПОДАЛСЯ — ВПЕРЁД') + btn + '</span>' : '<br><small>ждите момента: бросок вперёд или назад — туда, куда он качнётся</small>'));
  };
  d.onTime = () => D.end(d);
  d.mult = () => 0.5 + (d.hits / d.max) * 1.3;
  d.summary = () => 'Точных бросков ' + d.hits + ' из ' + d.max + ' → рост ×' + cl(0.5 + (d.hits / d.max) * 1.3, 0.5, 1.8).toFixed(2);
  J.noPartial = true;
  begin(d, pcfg, ocfg, lvl, 120, o);
};

// ---------------------------------------------------------------- 3. the defence: stand up to his attacks
D.defense = function (pcfg, ocfg, lvl, cb, o) {
  const d = { kind: 'defense', title: 'Устоять', finishCb: cb, n: 0, stood: 0, max: 6, cd: 2.4, warn: false, noNe: true, noThrows: 'ЗДЕСЬ ТОЛЬКО ЗАЩИТА: L1 В НАЧАЛЕ ЕГО БРОСКА', last: '' };
  const pickId = (f) => { const k = (f.cfg.known && f.cfg.known.length ? f.cfg.known : ['podsechka', 'otkhvat', 'bedro']); return k[(Math.random() * k.length) | 0]; };
  d.ai = function (ai, dt) {
    const g = ai.game, f = ai.f, o2 = f.opponent, it = f.intent;
    stand(ai);
    if (g.phase !== 'fight' || d.done || f.state !== 'fight' || !o2) return;
    const dist = Math.hypot(o2.pos.x - f.pos.x, o2.pos.z - f.pos.z);
    it.mz = dist > 1.0 ? 0.7 : dist < 0.7 ? -0.5 : 0;
    if (g.judoRun || g.judoMatte || J.paused(g)) return;
    f.grip = 2; f._judoCool = 0; f.stamina = Math.max(f.stamina, 70);
    d.cd -= dt;
    d.warn = d.cd < 0.75 && d.n < d.max;
    if (d.cd <= 0 && d.n < d.max && dist < 1.4) { d.cd = rnd(2.6, 3.6) - lvl * 0.25; J.tryThrow(f, pickId(f)); }
  };
  d.chance = function (f, o2) { if (f === f.game.p1) return 0; return o2._gwGuard ? 0.45 : 0.92; };
  d.resist = function (g, run, f) {
    if (run.uke !== f) return;
    if (run.stage === 'drive') { const r = run.twistTry(); g.ui.hitMarker(r === 'full' ? 'ВЫКРУТИЛСЯ!' : r === 'half' ? 'НА БОК' : 'ПОЗДНО', 0); return; }
    if (run.resistTried || run.fail) return;
    run.resistTried = true;
    const early = Math.max(0, 1 - run.t / Math.max(0.2, run.drive.t0));
    const p = cl(0.3 + early * 0.7 + (lvl === 0 ? 0.1 : 0), 0.1, 0.95);
    if (Math.random() < p && run.resist()) g.ui.hitMarker('УСТОЯЛ!', 0); else g.ui.hitMarker('ПОЗДНО', 0);
  };
  d.onAttempt = function (f) { if (!f.isPlayer) { d.n++; d.warn = false; } };
  d.onDone = function (g, run) {
    g.judoRun = null;
    if (run.tori === g.p2) {
      const ok = run.fail || !run.result || run.result.score === 'none';
      if (ok) d.stood++;
      d.last = ok ? 'устояли' : 'бросил';
      g.ui.callout(ok ? 'УСТОЯЛ' : 'БРОСИЛ', ok ? (run.resisted ? 'L1 вовремя' : 'не дал оценки') : 'L1 в самом начале его броска, или держите ЗАЩИТУ', 'round', 1.1);
    }
    J.matte(g, run.fail ? null : run.uke);
    if (d.n >= d.max) setTimeout(() => D.end(d), 1600);
    return false;
  };
  d.tick = function (g, dt) {
    if (g.phase !== 'fight' || d.done) return;
    d.t += dt;
    const run = g.judoRun, attack = run && run.tori === g.p2 && run.stage === 'entry' && !run.fail;
    board('<b>УСТОЯТЬ</b> · атака ' + Math.min(d.max, d.n + (attack ? 0 : 1)) + '/' + d.max + ' · устояли ' + d.stood +
      (attack ? '<span class="cue back">L1 — УСТОЯТЬ!</span>' : d.warn ? '<span class="cue">ГОТОВЬСЯ…</span>' : '<br><small>жмите L1 в начале его броска · ЗАЩИТА (держать) — бросить труднее</small>'));
  };
  d.onTime = () => D.end(d);
  d.mult = () => 0.5 + (d.stood / d.max) * 1.3;
  d.summary = () => 'Устояли ' + d.stood + ' из ' + d.max + ' → рост ×' + cl(0.5 + (d.stood / d.max) * 1.3, 0.5, 1.8).toFixed(2);
  begin(d, pcfg, ocfg, lvl, 120, o);
};

// ---------------------------------------------------------------- 4. ne-waza: hold him, then get out
D.newaza = function (pcfg, ocfg, lvl, cb, o) {
  const d = { kind: 'newaza', title: 'Партер', finishCb: cb, phase: 'top', held: 0, esc: false, escT: 0, sub: false, noTwist: true, wait: 1.2 };
  d.ai = function (ai) { stand(ai); };
  d.chance = () => 1.6;
  const startPhase = (g) => {
    const f = d.phase === 'top' ? g.p1 : g.p2;
    g.p1.place(-0.5, 0, Math.PI / 2); g.p2.place(0.5, 0, -Math.PI / 2);
    f.grip = 2; f._judoCool = 0; f.stamina = Math.max(f.stamina, 60);
    J.tryThrow(f, d.phase === 'top' ? 'otkhvat' : 'podhvat', false);
  };
  d.onDone = function (g, run) {
    g.judoRun = null;
    J.neStart(g, run.tori, run.uke, true);
    const ne = g.judoNe; ne.wz = true; ne.subCd = run.tori.isPlayer ? 0.6 : 999;
    if (!run.tori.isPlayer) { ne.esc = 0; }
    return false;
  };
  d.onIppon = function (g, f) { if (f === g.p1 && g.judoNe) { d.sub = true; g.judoNe.held = Math.max(g.judoNe.held, 10); } return false; };
  d.onNeEnd = function (g, ne) { if (d.phase === 'bottom' && ne.uke === g.p1 && ne.esc >= 1) { d.esc = true; d.escT = ne.held; } };
  d.tick = function (g, dt) {
    if (g.phase !== 'fight' || d.done) return;
    d.t += dt;
    const ne = g.judoNe;
    if (!ne && !g.judoRun && !g.judoMatte) { d.wait -= dt; if (d.wait <= 0) { d.wait = 99; startPhase(g); } }
    if (ne && d.phase === 'top' && ne.tori === g.p1) {
      // the partner tries to get out; in training he gives you a chance, more so on the low levels
      ne.esc = Math.max(0, ne.esc - dt * [0.045, 0.035, 0.022, 0.01][lvl]);
      d.held = ne.held;
      if (ne.held >= 10) { g.judoNe = null; J.matte(g, ne.uke); d.phase = 'bottom'; d.wait = 2.6; g.ui.callout('ДЕРЖАЛИ 10 С', 'теперь выходите снизу: жмите L1', 'round', 1.6); }
    }
    if (!ne && d.phase === 'top' && d.wait === 99 && !g.judoRun && g.judoMatte) { d.phase = 'bottom'; d.wait = 2.6; }
    if (ne && d.phase === 'bottom' && ne.uke === g.p1) {
      if (ne.held >= 10) { g.judoNe = null; J.matte(g, ne.uke); d.phase = 'end'; setTimeout(() => D.end(d), 1200); }
    }
    if (d.phase === 'bottom' && d.esc && !d._ending) { d._ending = true; d.phase = 'end'; setTimeout(() => D.end(d), 1400); }
    const N = g.judoNe;
    board('<b>ПАРТЕР</b> · ' + (d.phase === 'top' ? 'держите его 10 с (L2 — удушающий)' : d.phase === 'bottom' ? 'выходите снизу: жмите L1 часто' : 'готово') +
      (N ? '<i><u style="width:' + cl(N.held / 10 * 100, 0, 100) + '%"></u></i>' : ''));
  };
  d.onTime = () => D.end(d);
  d.mult = () => 0.5 + cl(d.held / 10) * 0.6 + (d.sub ? 0.2 : 0) + (d.esc ? 0.4 + 0.3 * (1 - cl(d.escT / 10)) : 0);
  d.summary = () => 'Удержание ' + Math.min(10, d.held).toFixed(0) + ' с' + (d.sub ? ' + сдача' : '') + ' · ' + (d.esc ? 'вышли снизу за ' + d.escT.toFixed(1) + ' с' : 'выйти не удалось') + ' → рост ×' + cl(d.mult(), 0.5, 1.8).toFixed(2);
  begin(d, pcfg, ocfg, lvl, 120, o);
};
// no ne-waza after the throws of the grip and timing drills
const origNe = J.neStart;
J.neStart = function (g, tori, uke, hold) {
  if (GW.drill && GW.drill.noNe) { J.matte(g, uke); return; }
  return origNe.call(this, g, tori, uke, hold);
};
})();

