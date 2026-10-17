//# sourceURL=judo/gw_fight.js
// GRIP WARS: the fight layer on top of the judo engine.
// The stance (ai-yotsu / kenka-yotsu) and its effect on the throws, the defensive posture held on a button,
// the build perks, the specialization, the height, the strengths and weaknesses of the opponents, the game plan,
// the combinations, the coach's cue, the throws you have not learned yet, the fight log that the analysis after
// the fight reads, and the hooks the drills use.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const M = UFC.M;
const V3 = THREE.Vector3;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const GW = window.GW = window.GW || {};
const now = (g) => (g && g.simTime) || 0;
const mark = (f, t) => { const g = f.game; if (g && g.ui) g.ui.hitMarker(t, f === g.p1 ? 0 : 1); };

// ---------------------------------------------------------------- the stance
// the lead foot decides the stance; same lead foot = ai-yotsu, opposite = kenka-yotsu.
// in ai-yotsu the reaps and sweeps come easier, in kenka-yotsu the turning throws under the arm
const YOTSU = { otkhvat: 'ai', zacep: 'ai', podsechka: 'ai', skolen: 'ai', podhvat: 'ai', plecho: 'kenka', spina: 'kenka', pistol: 'kenka', taiotoshi: 'kenka', bedro: 'kenka', tomoe: null };
J.YOTSU = YOTSU;
J.stanceName = (f) => (f.leadSide === 'L' ? 'левая' : 'правая');
J.yotsu = (f, o) => (f.leadSide === o.leadSide ? 'ai' : 'kenka');
J.yotsuMod = (f, o, T) => { const w = YOTSU[T.id]; if (!w) return 1; return J.yotsu(f, o) === w ? 1.14 : 0.9; };
J.switchStance = function (f) {
  const g = f.game;
  if (!g || g.phase !== 'fight' || f.state !== 'fight' || J.paused(g) || f._judoBusy) return false;
  if ((f._stanceCd || 0) > now(g)) return false;
  f._stanceCd = now(g) + 0.9;
  f.s = -f.s; const l = f.leadSide; f.leadSide = f.rearSide; f.rearSide = l;
  if ((f.grip || 0) >= 2) f.grip = 1;   // the lapel hand has to let go to change feet
  f.stamina = Math.max(0, f.stamina - 1.5);
  for (const side of ['L', 'R']) { const ft = f.foot && f.foot[side]; if (ft) { ft.t = 1; ft.stepping = false; } }
  if (GW.log && f === g.p1) GW.log.stanceSw++;
  mark(f, 'СТОЙКА: ' + J.stanceName(f).toUpperCase() + ' · ' + (J.yotsu(f, f.opponent) === 'ai' ? 'ОДНОИМЁННАЯ' : 'РАЗНОИМЁННАЯ'));
  return true;
};

// ---------------------------------------------------------------- the defensive posture
// held on a button: low hips, stiff arms. Throws against him are much harder, but he cannot attack,
// moves slowly and the referee counts it as passivity faster
J.guardTick = function (f, dt) {
  const g = f.game;
  const want = !!f._gwGuardWant && g.phase === 'fight' && f.state === 'fight' && !J.paused(g);
  f._gwGuard = want;
  if (!want) return;
  f.stamina = Math.max(0, f.stamina - dt * 0.6);
  f._idleT = (f._idleT || 0) + dt * 0.6;   // the referee sees negative judo
  if (GW.log && f === g.p1) GW.log.guardT += dt;
};
// he moves slowly in the defensive posture
const origLoco = UFC.Fighter.prototype._locomotion;
UFC.Fighter.prototype._locomotion = function (dt) {
  if (!this._gwGuard) return origLoco.call(this, dt);
  const it = this.intent, mx = it.mx, mz = it.mz;
  it.mx = mx * 0.45; it.mz = mz * 0.45;
  try { return origLoco.call(this, dt); } finally { it.mx = mx; it.mz = mz; }
};
const origGuardT = UFC.Fighter.prototype._guardTargets;
UFC.Fighter.prototype._guardTargets = function () {
  const g = origGuardT.call(this);
  const o = this.opponent;
  if (!UFC.judo || !this._gwGuard || !o || this.state !== 'fight') return g;
  // stiff arms into his chest
  const root = this.body.root;
  for (const side of ['L', 'R']) {
    if (side === this.rearSide && (this.grip || 0) >= 1) continue;
    const t = J.anchor(o, side === 'L' ? 'shoulderR' : 'shoulderL', new V3()); root.worldToLocal(t);
    g[side].lerp(t, 0.75);
  }
  return g;
};

// ---------------------------------------------------------------- the perks of the build
// every perk has a price; they live in cfg.gwPerks (the player's build, or a rival's signature)
const has = (f, id) => !!(f && f.cfg && f.cfg.gwPerks && f.cfg.gwPerks.includes(id));
GW.has = has;
const FWD = (T) => T.fall === 'forward';
const LEGS = (T) => ['podsechka', 'zacep', 'otkhvat', 'skolen'].includes(T.id);
const BACK = (T) => T.fall === 'backward' || T.fall === 'back';
const FWDS = (T) => T.fall === 'forward' || T.fall === 'side';
const TURN = ['plecho', 'spina', 'pistol', 'taiotoshi', 'bedro'];
const dirOf = (T) => (BACK(T) ? 'b' : T.fall === 'side' ? 's' : 'f');
const career = (g) => !!(g && g.fightInfo && g.fightInfo.gwCareer);
// combinations: a second throw in another direction right after the first one was stopped
GW.combosOn = (f) => { const g = f.game; if (!f.isPlayer) return !!(f.cfg && f.cfg.gwCombo); return !career(g) || (GW.c && GW.c.tier >= 3); };
const comboReady = (f, T) => (f._comboT || 0) > now(f.game) && f._comboDir && f._comboDir !== dirOf(T) && GW.combosOn(f);
const origChance = J.chance;
J.chance = function (f, o, T) {
  if (GW.drill && GW.drill.chance) { const d = GW.drill.chance(f, o, T); if (d != null) return d; }
  let p = origChance(f, o, T);
  p *= J.yotsuMod(f, o, T);
  if (o._gwGuard) p *= 0.55;
  if (has(f, 'explosive') && FWD(T)) p *= 1.12;
  if (has(f, 'counter_master') && !(f._counterWin > 0)) p *= 0.92;
  if (has(f, 'counter_master') && f._counterWin > 0) p *= 1.4;
  if (has(f, 'leg_reaper')) p *= LEGS(T) ? 1.15 : (FWD(T) ? 0.9 : 1);
  if (has(f, 'ground_hunter')) p *= 0.95;
  if (has(o, 'rock')) p *= 0.88;
  if (has(o, 'cat')) p *= 1.05;
  if (has(f, 'big_game')) p *= GW.bigMoment(f.game) ? 1.1 : 0.95;
  // the combination
  if (f._comboNow) p *= 1.35;
  // the specialization and the height of the player
  const sp = f.cfg && f.cfg.gwSpec;
  if (sp === 'tech') p *= 1.06;
  if (sp === 'power') p *= FWD(T) ? 1.05 : 1.02;
  if (sp === 'speed' && o.offBal) p *= 1.08;
  if (sp === 'counter' && f._counterWin > 0) p *= 1.3;
  const ht = f.cfg && f.cfg.gwHeight;
  if (ht === 'short') p *= TURN.includes(T.id) ? 1.05 : 1;
  if (ht === 'tall') p *= T.id === 'podhvat' || T.id === 'otkhvat' ? 1.05 : TURN.includes(T.id) ? 0.95 : 1;
  // where the opponent is strong and where he can be beaten
  const ws = o.cfg && o.cfg.gwWeak, st = f.cfg && f.cfg.gwStrong;
  if (ws === 'fwd' && FWDS(T)) p *= 1.15;
  if (ws === 'back' && BACK(T)) p *= 1.15;
  if (o.cfg && o.cfg.gwStrong === 'defense') p *= 0.92;
  if (st === 'fwd' && FWDS(T)) p *= 1.1;
  if (st === 'back' && BACK(T)) p *= 1.1;
  if (f.cfg && f.cfg.gwWeak === 'tempo' && f.stamina < 50) p *= 0.85;
  // the homework: you have studied him
  if (f.isPlayer && o.cfg && o.cfg.gwPrep) p *= 1.06;
  if (!f.isPlayer && f.cfg && f.cfg.gwPrep && f.cfg.fav && f.cfg.fav.includes(T.id)) p *= 0.9;
  // the game plan
  const pl = career(f.game) ? GW.plan : null;
  if (pl && f.isPlayer) p *= pl === 'grip' ? 0.95 : pl === 'counter' ? (f._counterWin > 0 ? 1.3 : 0.92) : pl === 'safe' ? 0.92 : 1;
  if (pl === 'safe' && !f.isPlayer) p *= 0.9;
  // the adaptive opponent has read your favourite throw
  if (J.readMod) p *= J.readMod(f, o, T);
  return cl(p, 0.03, 0.92);
};
GW.bigMoment = (g) => !!(g && (g.opts.golden || (g.fightInfo && g.fightInfo.final)));
const origGripSkill = J.gripSkill;
J.gripSkill = function (f) {
  let k;
  const gw = f.cfg && f.cfg.gw;
  if (gw) k = (0.6 * gw.grip + 0.2 * (f.cfg.stats.power || 50) + 0.2 * (f.cfg.stats.speed || 50)) / 100;
  else k = origGripSkill(f);
  if (has(f, 'iron_grip')) k += 0.12;
  if (f.cfg && f.cfg.gwType === 'grip') k += 0.1;   // the grip master's hands
  if (f.cfg && f.cfg.gwType === 'aggressor') k -= 0.04;
  if (f._gwGuard) k += 0.05;
  const c = f.cfg || {};
  if (c.gwWeak === 'grip') k -= 0.08;
  if (c.gwStrong === 'grip') k += 0.06;
  if (c.gwSpec === 'speed') k += 0.05;
  if (c.gwSpec === 'power') k += 0.03;
  if (c.gwHeight === 'tall') k += 0.04; else if (c.gwHeight === 'short') k -= 0.03;
  if (f.isPlayer && GW.plan === 'grip' && career(f.game)) k += 0.08;
  return k;
};
J.neSkillOf = function (f) {
  const gw = f.cfg && f.cfg.gw;
  let k = gw ? (0.7 * gw.newaza + 0.3 * (f.cfg.stats.power || 50)) / 100 : ((f.cfg.stats.bjj || 60) * 0.55 + (f.cfg.stats.wrestling || 60) * 0.3 + (f.cfg.stats.power || 60) * 0.15) / 100;
  if (has(f, 'ground_hunter')) k += 0.1;
  if (f.cfg && f.cfg.gwWeak === 'ground') k -= 0.1;
  if (f.cfg && f.cfg.gwStrong === 'ground') k += 0.1;
  return k;
};
const origTwist = J.twistChance;
J.twistChance = function (u, t, power, player) {
  if (GW.drill && GW.drill.noTwist) return 0;
  let p = origTwist(u, t, power, player);
  if (has(u, 'cat')) p += 0.12;
  if (u.cfg && (u.cfg.gwType === 'counter' || u.cfg.gwType === 'champion')) p += 0.04;
  return cl(p, 0, 0.8);
};
// the mastery: the GRIP WARS career keeps its own book
const origMastery = J.mastery;
J.mastery = function (f, id) {
  const g = f.game;
  if (f.isPlayer && g && g.fightInfo && g.fightInfo.gw && GW.c && GW.c.mastery) return GW.c.mastery[id] || 10;
  if (!f.isPlayer && f.cfg && f.cfg.gw && f.cfg.mastery) return f.cfg.mastery;
  return origMastery(f, id);
};
// the stamina side of the perks
const origStam = UFC.Fighter.prototype._staminaTick;
UFC.Fighter.prototype._staminaTick = function (dt) {
  const s0 = this.stamina;
  origStam.call(this, dt);
  if (!UFC.judo) return;
  if (has(this, 'second_wind') && this.stamina > s0 && !(this._rub > 0.3)) this.stamina = Math.min(this.staminaCap, s0 + (this.stamina - s0) * 1.35);
  const lost = s0 - this.stamina;
  if (lost > 0) {
    let k = 1;
    if (this.cfg && this.cfg.gwSpec === 'cardio' && this._rub > 0.3) k *= 0.8;   // the enduring one breathes in the grips
    if (GW.plan === 'tempo' && this.game && career(this.game)) k *= this.isPlayer ? 1.15 : 1.1;
    if (k !== 1) this.stamina = Math.max(0, s0 - lost * k);
  }
};
// the counter-attacker: L1 holds better against his throws
const origResist = J.resistTry;
J.resistTry = function (g, run, f) {
  if (GW.drill && GW.drill.resist) return GW.drill.resist(g, run, f);
  const st = f.cfg && f.cfg.stats, bump = f.cfg && f.cfg.gwSpec === 'counter' && st ? 8 : 0;
  if (bump) st.defense += bump;
  try { return origResist.call(this, g, run, f); } finally { if (bump) st.defense -= bump; }
};

// ---------------------------------------------------------------- the fight log (player's side) and the hooks
GW.newLog = () => ({
  t: 0, gAdv: 0, gEven: 0, gDis: 0, gFull: 0, oFull: 0,
  tries: 0, triesNoFull: 0, triesOff: 0, triesFav: 0, landed: 0, partial: 0, stopped: 0, resistedByMe: 0, counteredMe: 0, myCounters: 0,
  oppTries: 0, oppLanded: 0, scoresFor: [], scoresAgainst: [], myTech: {}, oppTech: {},
  minSt: 100, stSum: 0, stN: 0, lowStT: 0, shidoMe: 0, shidoOpp: 0, holdFor: 0, holdAgainst: 0, escapes: 0, subsFor: 0, subsAgainst: 0, guardT: 0, stanceSw: 0,
  trailed: false, golden: false, endClock: 0, combos: 0, comboScores: 0, locked: 0,
});
GW.log = null;
const origTry = J.tryThrow;
J.tryThrow = function (f, id, force, against) {
  const g = f.game, o = f.opponent;
  if (!force && f._gwGuard) { mark(f, 'В ЗАЩИТЕ — СНАЧАЛА ОТПУСТИТЕ «ЗАЩИТА»'); return false; }
  if (GW.drill && GW.drill.noThrows && !force && f.isPlayer) { mark(f, GW.drill.noThrows); return false; }
  const T0 = J.TECHS[id];
  // a throw you have not learned yet
  if (!force && f.isPlayer && GW.known && T0 && !GW.known.includes(id)) {
    if ((f._lockedMsg || 0) < now(g)) { f._lockedMsg = now(g) + 1.2; const t = GW.THROW_TIER[id]; mark(f, '«' + T0.name + '» ЕЩЁ НЕ ИЗУЧЕН · ЭТАП «' + (GW.TIERS[t] ? GW.TIERS[t].name : '?').toUpperCase() + '»'); if (GW.log) GW.log.locked++; }
    return false;
  }
  // a throw the opponent does not know
  if (!force && !f.isPlayer && f.cfg && f.cfg.known && !f.cfg.known.includes(id)) id = f.cfg.known[(Math.random() * f.cfg.known.length) | 0] || id;
  const grip = f.grip || 0, off = !!(o && o.offBal), T = J.TECHS[id];
  const fav = T && o ? J.yotsuMod(f, o, T) > 1 : false;
  const combo = !force && T && comboReady(f, T);
  f._comboNow = combo;
  let ok;
  try { ok = origTry.call(this, f, id, force, against); } finally { f._comboNow = false; }
  if (!ok || !g.judoRun) return ok;
  g.judoRun.gw = { grip, off, fav, counter: !!force, combo };
  if (combo) { f._comboT = 0; mark(f, 'КОМБИНАЦИЯ!'); if (GW.log && f === g.p1) GW.log.combos++; }
  const L = GW.log;
  if (L) {
    if (f === g.p1) {
      L.tries++; if (grip < 2) L.triesNoFull++; if (off) L.triesOff++; if (fav) L.triesFav++; if (force) L.myCounters++;
      L.myTech[id] = (L.myTech[id] || 0) + 1;
    } else { L.oppTries++; L.oppTech[id] = (L.oppTech[id] || 0) + 1; if (force) L.counteredMe++; }
  }
  if (J.onAttempt) J.onAttempt(f, id, force);
  if (GW.drill && GW.drill.onAttempt) GW.drill.onAttempt(f, id, g.judoRun);
  // the build: an explosive entry costs more wind, an iron grip costs more too
  if (has(f, 'explosive')) f.stamina = Math.max(0, f.stamina - T.cost * 0.4);
  // the career: every attempt drills the throw a little
  if (f.isPlayer && g.fightInfo && g.fightInfo.gw && GW.practice) GW.practice(id, 0.35);
  return ok;
};
const origDone = J.done;
J.done = function (g, run) {
  const L = GW.log, me = run.tori === g.p1;
  // a stopped attempt opens the window of a combination: two seconds for a throw in another direction
  if (run.fail && !run.countered && run.tori && GW.combosOn(run.tori)) {
    run.tori._comboT = now(g) + 2.2; run.tori._comboDir = dirOf(run.tech);
    if (run.tori._ai) { run.tori._ai.comboT = 0.35 + Math.random() * 0.5; run.tori._ai.comboDir = dirOf(run.tech); }
  }
  if (!run.fail && run.gw && run.gw.combo && run.result && run.result.score !== 'none') { if (me && L) L.comboScores++; g.ui.callout('КОМБИНАЦИЯ!', run.tech.name, 'flow', 1.3); }
  if (L) {
    if (run.fail) { if (me) L.stopped++; else L.resistedByMe++; }
    else {
      const sc = run.result ? run.result.score : 'none';
      if (me) { L.landed++; if (sc === 'none') L.partial++; else L.scoresFor.push({ sc, tech: run.tech.name, id: run.tech.id }); }
      else { L.oppLanded++; if (sc !== 'none') L.scoresAgainst.push({ sc, tech: run.tech.name, id: run.tech.id }); }
      if (me && sc !== 'none' && g.fightInfo && g.fightInfo.gw && GW.practice) GW.practice(run.tech.id, 1.2);
    }
  }
  if (GW.drill && GW.drill.onDone) { const r = GW.drill.onDone(g, run); if (r === false) return; }
  return origDone.call(this, g, run);
};
const origShido = J.shido;
J.shido = function (g, f, why) {
  if (GW.drill) { f._idleT = 0; return; }
  if (GW.log) { if (f === g.p1) GW.log.shidoMe++; else GW.log.shidoOpp++; }
  return origShido.call(this, g, f, why);
};
const origNeEnd = J.neEnd;
J.neEnd = function (g, why) {
  const ne = g.judoNe;
  if (ne && GW.log) { if (ne.uke === g.p1 && ne.esc >= 1) GW.log.escapes++; }
  if (ne && GW.drill && GW.drill.onNeEnd) GW.drill.onNeEnd(g, ne, why);
  return origNeEnd.call(this, g, why);
};
const origIppon = J.ippon;
J.ippon = function (g, f, T, text) {
  const L = GW.log;
  if (L && T) {
    const me = f === g.p1, hold = T.name === 'Удержание', sub = J.NE_TECH && J.NE_TECH.some((x) => x.name === T.name);
    if (hold) { if (me) L.holdFor = Math.max(L.holdFor, 20); else L.holdAgainst = Math.max(L.holdAgainst, 20); }
    if (sub) { if (me) L.subsFor++; else L.subsAgainst++; }
  }
  if (GW.drill && GW.drill.onIppon) { const r = GW.drill.onIppon(g, f, T, text); if (r === false) return; }
  return origIppon.call(this, g, f, T, text);
};

const G = UFC.Game.prototype;
const origStep = G._step;
G._step = function (dt) {
  for (const f of [this.p1, this.p2]) if (f && this.phase === 'fight') { if (this.p1 === f) f._gwGuardWant = !!GW.guardHeld; J.guardTick(f, dt); }
  if (GW.stanceReq && this.p1 && this.phase === 'fight') { GW.stanceReq = false; J.switchStance(this.p1); }
  origStep.call(this, dt);
  const L = GW.log;
  if (L && this.phase === 'fight' && this.p1 && this.p2) {
    const a = this.p1, b = this.p2, ga = a.grip || 0, gb = b.grip || 0;
    L.t += dt;
    if (ga > gb) L.gAdv += dt; else if (gb > ga) L.gDis += dt; else if (ga > 0) L.gEven += dt;
    if (ga >= 2) L.gFull += dt; if (gb >= 2) L.oFull += dt;
    L.minSt = Math.min(L.minSt, a.stamina); L.stSum += a.stamina * dt; L.stN += dt; if (a.stamina < 20) L.lowStT += dt;
    const ne = this.judoNe;
    if (ne && ne.hold) { if (ne.tori === a) L.holdFor = Math.max(L.holdFor, ne.held); else L.holdAgainst = Math.max(L.holdAgainst, ne.held); }
    const S = J.score; if (S && (S[1].waza > S[0].waza || ((S[1].waza === S[0].waza) && (S[1].yuko || 0) > (S[0].yuko || 0)))) L.trailed = true;
    if (this.opts.golden) L.golden = true;
    L.endClock = this.clock;
  }
  if (GW.drill && GW.drill.tick && this.p1) GW.drill.tick(this, dt);
  if (this.p1 && this.p2 && this.phase === 'fight') {
    const a = this.p1, b = this.p2;
    if (a.cfg.gwSpec === 'counter') { if (a._counterWin > 0 && !a._cwExt) { a._counterWin += 0.35; a._cwExt = true; } else if (!(a._counterWin > 0)) a._cwExt = false; }
    if (GW.plan === 'tempo' && career(this) && !J.paused(this)) b._idleT = (b._idleT || 0) + dt * 0.3;
  }
  GW.cueTick(this);
};
// the coach shouts from the side of the mat: the moment is now, and which button
const SYM = ['□', '△', '✕', '○', 'R2'];
GW.cueTick = function (g) {
  let el = document.getElementById('gwcue');
  const on = !!(g.fightInfo && g.fightInfo.gwCue) && !GW.drill && g.phase === 'fight' && g.p1 && g.p2 && !g.judoRun && !g.judoNe && !J.paused(g) && g.p1.state === 'fight';
  const ob = on && g.p2.offBal, grip = on && (g.p1.grip || 0) > 0;
  let html = '';
  if (ob && grip) {
    const want = ob.dir === 'back' ? BACK : FWDS;
    const k = J.loadout.findIndex((id) => J.TECHS[id] && want(J.TECHS[id]) && (!GW.known || GW.known.includes(id)));
    html = '<b>СЕЙЧАС!</b> ' + (ob.dir === 'back' ? 'он на пятках — назад' : 'он подался — вперёд') + (k >= 0 ? ' · ' + SYM[k] + ' ' + J.TECHS[J.loadout[k]].name : '');
  } else if (on && (g.p1.grip || 0) === 0 && g.clock > 3 && g.clock % 12 < 2.5) html = 'Палыч: «Захват! L2»';
  if (!el) {
    if (!html) return;
    el = document.createElement('div'); el.id = 'gwcue'; document.body.appendChild(el);
    const css = document.createElement('style');
    css.textContent = '#gwcue { position: absolute; left: 50%; bottom: 34%; transform: translateX(-50%); z-index: 30; pointer-events: none; padding: 6px 14px; border-radius: 8px; background: rgba(10,14,10,.72); color: #fff; font: 800 15px/1.2 system-ui, sans-serif; letter-spacing: .04em; white-space: nowrap; } #gwcue b { color: #7fffa0; font-size: 20px; }';
    document.head.appendChild(css);
  }
  el.style.display = html ? 'block' : 'none';
  if (el._h !== html) { el._h = html; el.innerHTML = html; }
};
// the time is up: a drill ends on its own terms
const origEnd = G._endRound;
G._endRound = function () {
  if (GW.drill && GW.drill.onTime) { GW.drill.onTime(this); return; }
  return origEnd.call(this);
};
// every fight gets a fresh log
const origQuick = G.startQuickFight;
G.startQuickFight = function (a, b, s, extra) {
  GW.log = GW.newLog();
  // a career fight: only the throws you know are on the buttons; any other fight gets your own buttons back
  if (extra && extra.gwCareer && GW.c && GW.Career) {
    if (!GW._ownLoadout) GW._ownLoadout = J.loadout.slice();
    J.loadout = GW.Career.fightLoadout(GW.c); GW.known = GW.c.known.slice();
  } else { if (GW._ownLoadout) { J.loadout = GW._ownLoadout; GW._ownLoadout = null; } GW.known = null; GW.plan = null; }
  J.relabel();
  const r = origQuick.call(this, a, b, s, extra);
  for (const f of [this.p1, this.p2]) if (f) {
    f._gwGuard = false; f._gwGuardWant = false; f._stanceCd = 0; f._comboT = 0; f._comboNow = false;
    const w = f.cfg.gwWeak, st = f.cfg.gwStrong, k = w === 'cardio' ? 0.85 : st === 'cardio' ? 1.1 : 1;
    if (k !== 1) { f.staminaCap = Math.round(f.staminaCap * k); f.stamina = Math.min(f.stamina, f.staminaCap); }
  }
  GW.guardHeld = false;
  if (J.readReset) J.readReset();
  return r;
};

const origRelabel = J.relabel;
J.relabel = function () {
  origRelabel.call(this);
  if (!GW.known) return;
  const A = UFC.ACTIONS, ids = ['jab', 'cross', 'lowL', 'lowR', 'judoTech5'];
  J.loadout.forEach((id, k) => { if (!GW.known.includes(id) && A[ids[k]]) { A[ids[k]].short = '—'; A[ids[k]].name = 'не изучен'; } });
  const g = window.__UFC__;
  try { if (g && g.touch && g.touch.refreshBinds) g.touch.refreshBinds(); } catch (e) { /* ignore */ }
};

// no TV commentator in a basement dojo or a school gym
const origSay = UFC.Commentary.prototype.say;
UFC.Commentary.prototype.say = function (key, opts) {
  if (UFC.judo && (J.venueId === 'dojo' || J.venueId === 'gym')) return;
  return origSay.call(this, key, opts);
};

// ---------------------------------------------------------------- the analysis after the fight
const pct = (a, b) => (b > 0 ? Math.round(100 * a / b) : 0);
GW.analyze = function (L, won, opp) {
  const lines = [], tips = [], good = [];
  if (!L) return { lines, tips, good };
  const T = Math.max(1, L.t);
  const gripTot = L.gAdv + L.gDis + L.gEven;
  lines.push(['Захват в вашу пользу', pct(L.gAdv, T) + '% времени'], ['У соперника лучше захват', pct(L.gDis, T) + '%'],
    ['Попытки бросков', L.tries + ' (прошло ' + L.landed + ', остановлено ' + L.stopped + ')'], ['Оценки за вас / против', L.scoresFor.length + ' / ' + L.scoresAgainst.length],
    ['Атак без полного захвата', L.triesNoFull + ' из ' + L.tries], ['Атак в момент потери равновесия', L.triesOff + ' из ' + L.tries],
    ['Дыхалка: минимум / средняя', Math.round(L.minSt) + ' / ' + Math.round(L.stN ? L.stSum / L.stN : 100)], ['Шидо вы / он', L.shidoMe + ' / ' + L.shidoOpp]);
  if (L.holdFor || L.holdAgainst) lines.push(['Удержание вы / он (макс.)', L.holdFor.toFixed(0) + ' с / ' + L.holdAgainst.toFixed(0) + ' с']);
  // the mistakes, most costly first
  if (L.tries >= 3 && L.triesNoFull / L.tries > 0.5) tips.push('Вы атаковали без полного захвата ' + L.triesNoFull + ' раз из ' + L.tries + '. Без ●● шанс броска в 2–3 раза ниже: сначала L2 два раза (рукав, потом отворот).');
  if (L.gDis > L.gAdv * 1.3 && L.gDis > 4) tips.push('Соперник владел захватом ' + pct(L.gDis, T) + '% времени. Как только он взялся — сразу L1 (сбросить), не давайте ему ●●.');
  if (L.tries >= 3 && L.triesOff / L.tries < 0.25) tips.push('Только ' + L.triesOff + ' атак пришлись на момент потери равновесия. Толкните (R1) или дождитесь рывка: «НА ПЯТКАХ» — броски назад, «ПОДАЛСЯ ВПЕРЁД» — броски вперёд, шанс до +75%.');
  if (L.minSt < 15) tips.push('Дыхалка падала до ' + Math.round(L.minSt) + '. В захвате она почти не восстанавливается: если не атакуете — разорвите захват (L1) и отдышитесь на дистанции.');
  if (L.counteredMe > 0 && opp && opp.cfg && opp.cfg.gwType === 'counter') tips.push('Контратакующий ловил вас после неудачной атаки (' + L.counteredMe + ' контр). Не атакуйте «вхолостую» — только после толчка/рывка или из комбинации.');
  else if (L.counteredMe > 1) tips.push('Вас контратаковали ' + L.counteredMe + ' раза после остановленных бросков. Неудачная попытка открывает вас на секунду — атакуйте, когда он выведен из равновесия.');
  if (L.scoresAgainst.length) {
    const c = {}; for (const s of L.scoresAgainst) c[s.tech] = (c[s.tech] || 0) + 1;
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    tips.push('Он заработал оценку приёмом «' + top[0] + '». Когда видите его атаку — жмите L1 сразу (устоять), а в полёте — L1, чтобы выкрутиться.');
  }
  if (L.shidoMe >= 2) tips.push('Два шидо за пассивность: атакуйте хотя бы раз в 15–18 секунд, даже обманным заходом. Долгая «ЗАЩИТА» тоже считается пассивностью.');
  if (L.holdAgainst >= 6) tips.push('Под удержанием вы продержались ' + L.holdAgainst.toFixed(0) + ' с. Жмите L1 часто и сразу — выход копится от каждого нажатия.');
  if (L.tries >= 3 && L.triesFav / L.tries < 0.3) tips.push('Большинство атак — из неудобной стойки. Сменить стойку: кнопка «СТОЙКА». Одноимённая — для подсечек и зацепов, разноимённая — для бросков через спину и тай-отоси.');
  if (L.tries <= 1 && L.t > 20) tips.push('Почти не было атак. Судьи и шидо наказывают за это, а соперник успевает отдышаться.');
  if (L.locked > 0) tips.push('Вы нажимали кнопку броска, которого ещё не знаете (' + L.locked + ' ' + (L.locked % 10 >= 2 && L.locked % 10 <= 4 && (L.locked % 100 < 10 || L.locked % 100 >= 20) ? 'раза' : 'раз') + '). Изученные броски — в «Билд → Кнопки»; новые открываются с этапами карьеры.');
  if (L.stopped >= 3 && !L.combos && GW.combosOn && (!GW.c || GW.c.tier >= 3)) tips.push('Ваши броски останавливали ' + L.stopped + ' раз. Сразу после остановленного броска (2 секунды) бросок в другую сторону идёт на 35% легче — это комбинация.');
  // what went well
  if (L.gAdv > L.gDis * 1.3 && L.gAdv > 4) good.push('Вы выиграли борьбу за захват (' + pct(L.gAdv, T) + '% времени с преимуществом).');
  if (L.scoresFor.length) good.push('Оценки: ' + L.scoresFor.map((s) => s.tech).join(', ') + '.');
  if (L.resistedByMe) good.push('Вы устояли против ' + L.resistedByMe + ' его бросков.');
  if (L.escapes) good.push('Вы вышли из удержания ' + L.escapes + ' раз.');
  if (L.minSt >= 35) good.push('Дыхалку распределили ровно (не ниже ' + Math.round(L.minSt) + ').');
  if (L.comboScores) good.push('Оценка комбинацией: ' + L.comboScores + '.');
  if (!tips.length && !won) tips.push('Бой был равным. Попробуйте другой план: сменить стойку, раньше брать захват или работать на выносливость против уставшего соперника.');
  return { lines, tips: tips.slice(0, 4), good: good.slice(0, 3) };
};

// ---------------------------------------------------------------- the touch buttons: stance and defence
function installButtons() {
  const acts = document.getElementById('t-acts');
  if (!acts || document.getElementById('t-stance')) return;
  const css = document.createElement('style');
  css.textContent = `
#t-acts #t-stance, #t-acts #t-guard { display: inline-flex !important; align-items: center; justify-content: center; pointer-events: auto; }
#t-guard { background: rgba(30,70,140,.55); } #t-guard.hit { background: rgba(60,120,230,.85); border-color: #fff; }
#t-stance { background: rgba(90,60,20,.55); }
.jsc b.gd { background: #2f6fd6; color: #fff; } .jsc b.yt { background: rgba(255,255,255,.14); color: #eee; }
`;
  document.head.appendChild(css);
  const mk = (id, text) => { const b = document.createElement('button'); b.id = id; b.className = 'pill'; b.textContent = text; acts.appendChild(b); return b; };
  const st = mk('t-stance', 'СТОЙКА'), gd = mk('t-guard', 'ЗАЩИТА');
  st.addEventListener('pointerdown', (e) => { e.preventDefault(); GW.stanceReq = true; st.classList.add('hit'); setTimeout(() => st.classList.remove('hit'), 160); });
  const on = (e) => { e.preventDefault(); GW.guardHeld = true; gd.classList.add('hit'); try { gd.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } };
  const off = () => { GW.guardHeld = false; gd.classList.remove('hit'); };
  gd.addEventListener('pointerdown', on); gd.addEventListener('pointerup', off); gd.addEventListener('pointercancel', off); gd.addEventListener('lostpointercapture', off);
  // keyboard: E switches the stance, B is held for the defence
  window.addEventListener('keydown', (e) => { if (e.target && e.target.tagName === 'INPUT') return; if (e.code === 'KeyE' && !e.repeat) GW.stanceReq = true; if (e.code === 'KeyB') GW.guardHeld = true; });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyB') GW.guardHeld = false; });
  window.addEventListener('blur', () => { GW.guardHeld = false; });
}
// the scoreboard shows the stance and the defence
const Uip = UFC.UI.prototype, origHud = Uip.hudUpdate;
Uip.hudUpdate = function (game) {
  origHud.call(this, game);
  if (!game.p1 || !game.p2) return;
  for (let i = 0; i < 2; i++) {
    const el = document.getElementById('jsc' + i); if (!el) continue;
    const f = i ? game.p2 : game.p1;
    let x = el.querySelector('.gwx'); if (!x) { x = document.createElement('span'); x.className = 'gwx'; x.style.display = 'contents'; el.appendChild(x); }
    const nar = window.innerWidth < 900;
    const html = (f._gwGuard ? '<b class="gd">ЗАЩИТА</b>' : '') + (i === 0 && !nar ? '<b class="yt">' + (J.yotsu(f, game.p2) === 'ai' ? 'ОДНОИМ.' : 'РАЗНОИМ.') + '</b>' : '') + (i === 1 && f.cfg.gwType && GW.TYPES ? '<b class="yt">' + GW.TYPES[f.cfg.gwType].short + '</b>' : '');
    if (x._h !== html) { x._h = html; x.innerHTML = html; }
  }
  // the stance button says which stance you are in against him
  const sb = document.getElementById('t-stance');
  if (sb) { const t = 'СТОЙКА · ' + (J.yotsu(game.p1, game.p2) === 'ai' ? 'ОДНОИМ.' : 'РАЗНОИМ.'); if (sb.textContent !== t) sb.textContent = t; }
};
function boot() { if (!document.getElementById('t-acts')) { setTimeout(boot, 200); return; } installButtons(); }
boot();
})();

