//# sourceURL=judo/match.js
// Judo: the match. Grips, attempts, the opponent, the score (ippon, waza-ari, shido), the clock and golden score.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const M = UFC.M;
const V3 = THREE.Vector3;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);

UFC.NO_GRAPPLE = true;
UFC.Fighter.prototype.canGnp = function () { return false; };
UFC.Fighter.prototype.canCommit = function () { return false; };
UFC.Fighter.prototype.canFlow = function () { return false; };

J.START = [-0.55, 0.55];
J.score = [{ waza: 0, shido: 0 }, { waza: 0, shido: 0 }];
J.log = [];

const paused = (g) => !!g.judoRun || !!g.judoMatte || !!g.judoNe;
J.paused = paused;

// ---------------------------------------------------------------- attempts
J.canAttempt = (g, f) => g.phase === 'fight' && !paused(g) && f.state === 'fight' && f.opponent && f.opponent.state === 'fight' && !f._judoBusy;

J.mastery = (f, id) => { const c = J.Career && J.Career.c; if (f.isPlayer && c && c.mastery && f.game.fightInfo && f.game.fightInfo.career) return c.mastery[id] || 20; return f.isPlayer ? 60 : (f.cfg.mastery || 60); };
// the difficulty is mostly in the opponent's decisions (gw_ai.js); these only shade the odds a little
J.LVL_DEF = [0.86, 0.8, 0.75, 0.7];   // how well the opponent defends, by difficulty
J.LVL_ATT = [0.55, 0.6, 0.66, 0.72];   // how well he attacks
J.chance = function (f, o, T) {
  const s = f.cfg.stats, d = o.cfg.stats;
  const att = (0.38 * (s.wrestling || 60) + 0.22 * (s.power || 60) + 0.2 * (s.speed || 60) + 0.1 * (s.boxing || 60) + 0.1 * (s.bjj || 60)) / 100;
  const def = (0.36 * (d.wrestling || 60) + 0.3 * (d.defense || 60) + 0.16 * (d.speed || 60) + 0.1 * (d.bjj || 60) + 0.08 * (d.chin || 60)) / 100;
  let p = 0.88 * T.base * (0.5 + att * 0.8) / (0.5 + def * 0.8);
  p *= 0.55 + 0.45 * cl(f.stamina / 45);
  p *= 1 - 0.3 * f.acidLoad;
  p *= 0.8 + 0.2 * f.fuelFrac;
  if (o.stamina < 28) p *= 1.15;
  // the grip decides: without the jacket in hand a throw is a guess
  const grip = f.grip || 0, legs = T.id === 'podsechka' || T.id === 'skolen';
  p *= grip >= 2 ? 1 : grip === 1 ? (legs ? 0.9 : 0.72) : (legs ? 0.5 : 0.3);
  p *= 1 - 0.1 * (o.grip || 0);
  p *= J.balanceBonus(o, T);
  if (f._counterWin > 0) p *= 2.1;
  p *= 0.85 + 0.4 * J.mastery(f, T.id) / 100;
  const dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  p *= cl(1.15 - Math.abs(dist - 1.0) * 0.6, 0.55, 1.1);
  const lvl = M.clamp((f.game.opts.difficulty | 0), 0, 3);
  if (f.isPlayer) p *= J.LVL_DEF[lvl]; else p *= J.LVL_ATT[lvl];
  if (f.cfg.trait === 'tech') p *= 1.12;
  if (o.cfg.trait === 'counter') p *= 0.92;
  return cl(p, 0.04, 0.9);
};

J.tryThrow = function (f, id, force, against) {
  const g = f.game;
  if (!force && !J.canAttempt(g, f)) return false;
  if (force && (g.phase !== 'fight' || g.judoRun)) return false;
  const o = f.opponent, T = J.TECHS[id];
  if (!T) return false;
  const dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  if (!force && dist > T.range + 0.3) { if (f === g.p1) g.ui.hitMarker('ДАЛЕКО', 0); return false; }
  if (!force && f.stamina < 6) { if (f === g.p1) g.ui.hitMarker('НЕТ ДЫХАНИЯ', 0); return false; }
  f._idleT = 0;
  const cost = T.cost * (0.8 + 0.4 * (1 - cl(f.stamina / 100))) * (f.cfg.trait === 'cardio' ? 0.7 : 1);
  f.stamina = Math.max(0, f.stamina - cost);
  if (f.hasGly) { f.gly = Math.max(0, f.gly - cost * 0.16); f.acid += cost * 0.9; }
  const p = force ? Math.min(0.85, J.chance(f, o, T) * 1.6 + 0.08) : J.chance(f, o, T);   // a counter is a throw too: it can fail
  // three ways it goes: clean (he is on his back), half done (he goes down but turns onto his belly: no score), stopped
  const pc = force ? p : p * 0.72, r = Math.random();
  const ok = r < pc;
  const partial = !ok && !J.noPartial && r < pc + (1 - pc) * cl(0.3 + 0.12 * (f.grip || 0) + 0.15 * (o.offBal ? 1 : 0) - 0.12 * (o.grip || 0), 0.15, 0.6);
  if (f._counterWin > 0 && ok) g.ui.callout('КОНТРАТАКА!', T.name, 'flow', 1.2);
  f._counterWin = 0;
  const s = f.cfg.stats;
  const power = cl((0.75 + ((s.power || 60) + (s.wrestling || 60)) / 400) * (0.85 + 0.3 * J.mastery(f, id) / 100) * f.fuelPower * (0.7 + 0.3 * cl(f.stamina / 50)) * rnd(0.88, 1.12), 0.55, 1.45);
  g.judoRun = new J.ThrowRun(g, f, o, T, { fail: !ok && !partial, partial, power: partial ? power * 0.8 : power, onDone: (run) => J.done(g, run) });
  g.judoStats[f === g.p1 ? 0 : 1].tries++;
  J.practice(f, id, 0.6);
  g.ui.hitMarker((force ? 'КОНТРА: ' : '') + T.name.toUpperCase(), f === g.p1 ? 0 : 1);
  if (o.isPlayer) { g.ui.hitMarker('L1 — УСТОЯТЬ!', 0); g.judoRun.resistTried = false; }
  g.audio.whoosh && g.audio.whoosh(7);
  return true;
};

J.CLOCK_SPEED = 1.8;   // the match clock runs 1.8 times faster than life (and runs on the ground too)
// ---------------------------------------------------------------- ne-waza: the hold-down (10 s waza-ari, 20 s ippon), the choke, the armlock
J.NE_TECH = [{ name: 'Удушающий', jp: 'Хадака-дзимэ' }, { name: 'Болевой на руку', jp: 'Удэ-хисиги-дзюдзи-гатамэ' }, { name: 'Удушение отворотом', jp: 'Окури-эри-дзимэ' }];
const neSkill = (f) => (J.neSkillOf ? J.neSkillOf(f) : ((f.cfg.stats.bjj || 60) * 0.55 + (f.cfg.stats.wrestling || 60) * 0.3 + (f.cfg.stats.power || 60) * 0.15) / 100);
J.neStart = function (g, tori, uke, hold) {
  g.judoNe = { tori, uke, t: 0, hold, held: 0, esc: 0, subCd: tori.isPlayer ? 1.2 : 4, wz: false };
  if (hold) g.ui.callout('ОСАЕКОМИ!', 'удержание: 10 с — ваза-ари, 20 с — иппон', 'round', 1.6);
  if (tori.isPlayer) g.ui.hitMarker(hold ? 'L2 — УДУШАЮЩИЙ / БОЛЕВОЙ' : 'L2 — УДУШАЮЩИЙ СЗАДИ', 0);
  if (uke.isPlayer) g.ui.hitMarker('ЖМИ L1 — ВЫХОДИ!', 0);
};
J.neEnd = function (g, why) {
  const ne = g.judoNe; if (!ne) return;
  g.judoNe = null;
  if (why) g.ui.callout(why, ne.hold ? 'удержание ' + ne.held.toFixed(0) + ' с' : '', 'round', 1.4);
  J.matte(g, ne.uke);
};
J.neTick = function (g, dt) {
  const ne = g.judoNe; if (!ne || g.phase !== 'fight') return;
  const { tori, uke } = ne, i = tori === g.p1 ? 0 : 1, S = J.score[i];
  ne.t += dt; ne.subCd -= dt;
  tori.stamina = Math.max(0, tori.stamina - dt * 1.2); uke.stamina = Math.max(0, uke.stamina - dt * 2);
  if (uke.hasGly) uke.acid += dt * 1.5;
  if (ne.hold) {
    ne.held += dt;
    if (ne.held >= 10 && !ne.wz) {
      ne.wz = true; S.waza++;
      if (S.waza >= 2 || g.opts.golden) return J.ippon(g, tori, { name: 'Удержание', jp: 'Осаекоми-вадза' }, S.waza >= 2 ? 'Ваза-ари аваясэ иппон · удержание' : 'Золотой скор · удержание');
      g.ui.callout('ВАЗА-АРИ', 'удержание 10 с · держи до 20!', 'ko', 1.6);
    }
    if (ne.held >= 20) return J.ippon(g, tori, { name: 'Удержание', jp: 'Осаекоми-вадза' }, 'Иппон · удержание 20 с');
  } else if (ne.t > 2.6) return J.neEnd(g, 'МАТЭ');
  // the man underneath bridges and turns out
  if (!uke.isPlayer) {
    const lvl = M.clamp(g.opts.difficulty | 0, 0, 3);
    ne.esc += dt * cl(0.055 + (neSkill(uke) - neSkill(tori)) * 0.35 + 0.05 * cl(uke.stamina / 100) + (tori.isPlayer ? [-0.02, 0, 0.015, 0.03][lvl] : 0), 0.02, 0.11);
  }
  if (ne.esc >= 1) return J.neEnd(g, 'ТОКЕТА — ВЫШЕЛ');
  // the opponent on top goes for the neck or the arm
  if (!tori.isPlayer && ne.subCd <= 0 && Math.random() < dt * 0.25) J.subTry(g, tori);
};
J.subTry = function (g, f) {
  const ne = g.judoNe; if (!ne || ne.tori !== f || ne.subCd > 0) return;
  ne.subCd = 1.6; f.stamina = Math.max(0, f.stamina - 4);
  const u = ne.uke, T = J.NE_TECH[ne.hold ? (Math.random() < 0.5 ? 0 : 1) : (Math.random() < 0.5 ? 0 : 2)];
  const p = cl(0.12 + (neSkill(f) - neSkill(u)) * 0.9 + (ne.hold ? 0.05 : 0) + 0.12 * (1 - cl(u.stamina / 100)), 0.04, 0.42) * (f.isPlayer ? 1 : 0.5);   // the opponent's choke is no lottery ticket
  if (Math.random() < p) { g.ui.callout('СДАЛСЯ!', T.name + ' · ' + T.jp, 'ko', 2.4); return J.ippon(g, f, T, 'Сдался · ' + T.name); }
  ne.esc += 0.22; mark2(g, f, 'ЗАЩИТИЛСЯ ОТ: ' + T.name.toUpperCase());
};
J.escTry = function (g, f) {
  const ne = g.judoNe; if (!ne || ne.uke !== f) return;
  if ((f._escCd || 0) > (g.simTime || 0)) return;
  f._escCd = (g.simTime || 0) + 0.15;
  f.stamina = Math.max(0, f.stamina - 1.2);
  ne.esc += cl(0.03 + (neSkill(f) - neSkill(ne.tori)) * 0.08, 0.015, 0.05) * (0.6 + 0.4 * cl(f.stamina / 60));
};
const mark2 = (g, f, t) => g.ui.hitMarker(t, f === g.p1 ? 0 : 1);
// the mastery grows by itself: every attempt in a career fight drills the throw, a clean one more
J.practice = function (f, id, amt) {
  const C = J.Career, c = C && C.c;
  if (!f.isPlayer || !c || !c.mastery || !f.game.fightInfo || !f.game.fightInfo.career) return;
  const cur = c.mastery[id] || 20;
  c.mastery[id] = Math.min(150, cur + amt * (cur < 100 ? 1 : 0.4));
  C.save();
};
// how likely the thrown man turns out of it in the air: his defence against the attack and the quality of the throw
J.twistChance = function (u, t, power, player) {
  const d = (0.45 * (u.cfg.stats.defense || 60) + 0.35 * (u.cfg.stats.wrestling || 60) + 0.2 * (u.cfg.stats.speed || 60)) / 100;
  const a = (0.45 * (t.cfg.stats.wrestling || 60) + 0.3 * (t.cfg.stats.power || 60) + 0.25 * (t.cfg.stats.speed || 60)) / 100;
  const base = player ? 0.45 : 0.2;
  return cl(base + (d - a) * 1.2 + 0.25 * (1 - (power || 1)) + (u.cfg.trait === 'defense' || u.cfg.trait === 'counter' ? 0.06 : 0) - 0.15 * (u.acidLoad || 0), 0.06, player ? 0.75 : 0.55);
};
J.done = function (g, run) {
  g.judoRun = null;
  const f = run.tori, o = run.uke, i = f === g.p1 ? 0 : 1;
  if (run.fail) {
    if (f === g.p1) g.ui.hitMarker(run.resisted ? 'СОПЕРНИК УСТОЯЛ' : (f.grip || 0) < 2 ? 'ЗАЩИТА · сначала полный захват (L2 ×2)' : 'ЗАЩИТА', 0); else g.ui.hitMarker('ВЫ УСТОЯЛИ', 0);
    f._judoCool = 0.9; o._judoCool = 0.4;
    f.pos.addScaledVector(new V3(f.pos.x - o.pos.x, 0, f.pos.z - o.pos.z).normalize(), 0.3);
    const lvl = M.clamp(g.opts.difficulty | 0, 0, 3);
    if (!o.isPlayer) {
      const cp = J.counterChance ? J.counterChance(o, f, lvl, run) : [0.04, 0.09, 0.15, 0.22][lvl] * (o.cfg.trait === 'counter' ? 2 : 1) * ((o.grip || 0) > 0 ? 1.25 : 0.6);
      if (Math.random() < cp) J.tryThrow(o, J.counterFor(run.tech), true, run.tech);
    } else {
      o._counterWin = 0.75; g.ui.hitMarker('КОНТРАТАКУЙ!', 0);
    }
    return;
  }
  const sc = run.result ? run.result.score : 'none';
  const S = J.score[i];
  g.judoStats[i].landed++;
  J.practice(f, run.tech.id, 1.6);
  if (sc === 'ippon') return J.ippon(g, f, run.tech);
  if (sc === 'yuko') {
    S.yuko = (S.yuko || 0) + 1;
    g.ui.callout('ЮКО', f.cfg.name + ' · ' + run.tech.name, 'round', 1.8);
    g.audio.cheer && g.audio.cheer(0.5);
    if (g.opts.golden) return J.ippon(g, f, run.tech, 'Золотой скор · юко');
  } else if (sc === 'wazaari') {
    S.waza++;
    if (S.waza >= 2) return J.ippon(g, f, run.tech, 'Ваза-ари аваясэ иппон');
    g.ui.callout('ВАЗА-АРИ', f.cfg.name + ' · ' + run.tech.name, 'ko', 2.2);
    g.audio.cheer && g.audio.cheer(0.8);
    if (g.opts.golden) return J.ippon(g, f, run.tech, 'Золотой скор · ваза-ари');
  } else {
    g.ui.callout('ОЦЕНКИ НЕТ', run.tech.name + ' · ' + (run.opts.partial || run.twist > 3 ? 'ушёл на живот' : 'упал не на спину'), 'round', 1.6);
  }
  // he is down and tori is on him: the fight goes on on the ground
  if (g.judoPress && g.judoPress.uke === o) return J.neStart(g, f, o, !!run.result && run.result.back > -0.3);
  J.matte(g, o);
};

// the defender braces: L1 in the first moments of the attempt
J.resistTry = function (g, run, f) {
  if (run.uke !== f) return;
  if (run.stage === 'drive') {
    const r = run.twistTry();
    if (r === 'full') g.ui.hitMarker('ВЫКРУТИЛСЯ!', 0); else if (r === 'half') g.ui.hitMarker('НА БОК', 0); else if (r === 'late') g.ui.hitMarker('ПОЗДНО', 0);
    return;
  }
  if (run.resistTried) return;
  run.resistTried = true;
  if (run.fail) return;
  const d = (0.4 * (f.cfg.stats.defense || 60) + 0.35 * (f.cfg.stats.wrestling || 60) + 0.25 * (f.cfg.stats.power || 60)) / 100;
  const a = (0.45 * (run.tori.cfg.stats.wrestling || 60) + 0.3 * (run.tori.cfg.stats.power || 60) + 0.25 * (run.tori.cfg.stats.speed || 60)) / 100;
  const early = Math.max(0, 1 - run.t / Math.max(0.2, run.drive.t0));
  const p = cl(0.38 + (d - a) * 1.1 + early * 0.3 + 0.12 * (f.grip || 0) - 0.2 * f.acidLoad, 0.12, 0.85);
  if (Math.random() < p && run.resist()) { g.ui.hitMarker('УСТОЯЛ!', 0); g.audio.impact && g.audio.impact(3, 'body', true); }
  else g.ui.hitMarker('НЕ УДАЛОСЬ УСТОЯТЬ', 0);
};
J.counterFor = (T) => (T.fall === 'forward' ? (Math.random() < 0.5 ? 'zacep' : 'otkhvat') : T.fall === 'side' ? 'podsechka' : (Math.random() < 0.5 ? 'podhvat' : 'bedro'));

J.ippon = function (g, f, T, text) {
  const i = f === g.p1 ? 0 : 1;
  J.score[i].ippon = true;
  g.ui.callout('ИППОН!', f.cfg.name + ' · ' + T.name + ' (' + T.jp + ')', 'ko', 3.2);
  g.audio.cheer && g.audio.cheer(1); g.arena.excite(1);
  g.judoMatte = null;
  if (g.judoPress) g.judoPress.toriUp(); g.judoPress = null; g.judoNe = null;
  if (UFC.METHOD_NAMES) UFC.METHOD_NAMES['ИППОН'] = 'Иппон';
  g._finish({ winner: f, method: 'ИППОН', methodText: (text || 'Иппон') + ' · ' + T.name, detail: { type: 'ippon' }, round: 1, time: UFC.fmtTime(g.clock) });
};

// a thrown judoka gets up through the knee, without the MMA ground poses
J.rise = function (f) {
  const o = f.opponent;
  f.ragdoll.stop();
  const yaw = o ? Math.atan2(o.pos.x - f.pos.x, o.pos.z - f.pos.z) : f.yaw;
  f.state = 'down'; f.downTimer = 0; f.getupAt = 0; f.stun = 0; f.gnpBy = null;
  f._risePre = { t: 0, via: 'kneel', snap: f._snapshot(yaw) };
  f.yaw = yaw; f.downPhase = 'rising'; f.riseSpeed = 1.05;
};
J.matte = function (g, uke) {
  g.judoMatte = { t: 0, stage: uke ? 'wait' : 'slide', uke, s: 0 };
  if (uke) { uke._judoBusy = false; }
  g.ui.hitMarker('МАТЭ', 0);
};

J.reset = function (g) {
  g.judoPress = null; g.judoNe = null;
  for (const f of [g.p1, g.p2]) {
    f.ragdoll.stop(); f.cancelStrike(); f.state = 'fight'; f.downPhase = null; f.fall = null; f.rise = null; f._risePre = null; f.gnp = null; f.gnpBy = null;
    f.hitstun = 0; f.stagger = 0; f.stun = 0; f._judoBusy = false; f._judoCool = 0.5; f.downTimer = 0;
    f.stamina = Math.min(f.staminaCap, f.stamina + 8);
    J.resetGrips(f);
  }
  g.p1.place(J.START[0], 0, Math.PI / 2); g.p2.place(J.START[1], 0, -Math.PI / 2);
  g.judoMatte = null;
};

// ---------------------------------------------------------------- the opponent
J.STYLE_TECHS = {
  boxer: [['podsechka', 3], ['zacep', 3], ['skolen', 2], ['taiotoshi', 2], ['podhvat', 1], ['plecho', 1]],
  kickboxer: [['podsechka', 3], ['otkhvat', 3], ['taiotoshi', 2], ['zacep', 2], ['bedro', 1]],
  brawler: [['podhvat', 3], ['otkhvat', 2], ['bedro', 2], ['pistol', 1], ['spina', 1]],
  wrestler: [['plecho', 3], ['spina', 2], ['pistol', 3], ['bedro', 2], ['tomoe', 1], ['podhvat', 1]],
};
J.aiUpdate = function (ai, dt) {
  const g = ai.game, f = ai.f, o = f.opponent, it = f.intent;
  it.strike = null; it.block = 'none'; it.slipX = it.slipZ = 0;
  if (g.phase !== 'fight' || paused(g) || f.state !== 'fight' || !o || o.state !== 'fight') { it.mx = it.mz = 0; return; }
  const lvl = M.clamp(g.opts.difficulty | 0, 0, 3);
  ai.jt = (ai.jt || 0) + dt;
  if (ai.jphase == null) { ai.jphase = Math.random() * 6; ai.jcd = rnd(5, 8); ai.gcd = rnd(0.4, 1); ai.bcd = 0; ai.react = null; }
  const dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  // footwork: to the grip distance, circling, stepping back when he pushes
  const want = (f.grip || 0) > 0 || (o.grip || 0) > 0 ? 0.9 : 1.0;   // he comes in to fight for the grip
  it.mz = dist > want + 0.25 ? 1 : dist < want - 0.2 ? -0.7 : 0;
  it.mx = Math.sin(ai.jt * 0.9 + ai.jphase) * 0.55;
  if (f.offBal && f.offBal.dir === 'back') it.mz = -0.3;
  f._judoCool = Math.max(0, (f._judoCool || 0) - dt);
  ai.jcd -= dt; ai.gcd -= dt; ai.bcd -= dt;
  // grip fighting: take the grip, and tear his off after a reaction time
  if (dist < 1.4 && (f.grip || 0) < 2 && ai.gcd <= 0) { J.takeGrip(f); ai.gcd = rnd(0.5, 1.2) * (1.4 - lvl * 0.2); }
  if ((o.grip || 0) > 0) {
    if (ai.react == null) ai.react = [1.4, 0.9, 0.6, 0.35][lvl] * rnd(0.7, 1.3) * (f.cfg.trait === 'grip' ? 0.55 : 1);
    ai.react -= dt;
    if (ai.react <= 0 && ai.bcd <= 0) { if (Math.random() < [0.35, 0.55, 0.7, 0.85][lvl]) J.breakGrip(f); ai.bcd = rnd(0.6, 1.4); ai.react = null; }
  } else ai.react = null;
  if (f._judoCool || f.stamina < 12) return;
  // the attack: on his balance, with a grip, or when the clock says it is time
  const list = J.STYLE_TECHS[f.cfg.style] || J.STYLE_TECHS.boxer;
  const fav = f.cfg.fav;
  const pick = (filter) => {
    if (fav && Math.random() < 0.65) { const F = fav.filter((t) => !filter || filter(J.TECHS[t])); if (F.length) return F[(Math.random() * F.length) | 0]; }
    const L = list.filter(([t]) => !filter || filter(J.TECHS[t]));
    if (!L.length) return null;
    let sum = 0; for (const [, w] of L) sum += w;
    let r = Math.random() * sum; for (const [t, w] of L) { r -= w; if (r <= 0) return t; }
    return L[0][0];
  };
  const ob = o.offBal;
  if (ob && ai.jcd < 2.5 && dist < 1.5 && (f.grip || 0) > 0 && Math.random() < [0.4, 1.0, 2.0, 3.5][lvl] * dt) {
    const id = pick((T) => (ob.dir === 'back' ? T.fall === 'backward' || T.fall === 'back' : T.fall === 'forward' || T.fall === 'side')) || pick();
    J.tryThrow(f, id); ai.jcd = rnd(2.5, 5); return;
  }
  // push him, then attack the reaction
  if ((f.grip || 0) > 0 && dist < 1.4 && Math.random() < [0.12, 0.22, 0.32, 0.42][lvl] * (f.cfg.trait === 'power' ? 2 : 1) * dt && ai.jcd < 3) { J.push(f); ai.jcd = Math.min(ai.jcd, 0.25 + Math.random() * 0.3); return; }
  if (ai.jcd <= 0 && dist < 1.5) {
    if ((f.grip || 0) === 0 && lvl >= 2 && Math.random() < 0.7) { ai.jcd = 0.6; return; }   // a good judoka does not attack without a grip
    J.tryThrow(f, pick());
    ai.jcd = rnd(4, 8) * (1.25 - 0.1 * lvl) * (1.3 - 0.3 * cl(f.stamina / 100));
  }
};
UFC.AIController.prototype.update = function (dt) { J.aiUpdate(this, dt); };

// ---------------------------------------------------------------- the engine hooks
const G = UFC.Game.prototype;
const origStep = G._step;
G._step = function (dt) {
  origStep.call(this, dt);
  if (this.judoRun) this.judoRun.update(dt);
  if (this.judoNe) J.neTick(this, dt);
  const pr = this.judoPress;
  if (pr) {
    if (this.phase !== 'fight' || pr.uke.state !== 'ko' || (this.judoMatte && this.judoMatte.stage === 'slide') || this.judoRun) { this.judoPress = null; pr.toriUp(); }
    else pr.pressStep(dt);
  }
  if (this.judoMatte && this.phase === 'fight') {
    const mt = this.judoMatte; mt.t += dt;
    if (mt.stage === 'wait' && mt.uke.state === 'ko' && mt.t > 1.1) J.rise(mt.uke);
    if (mt.stage === 'wait' && ((mt.uke.state === 'fight' && mt.t > 1.4) || mt.t > 7)) { mt.stage = 'slide'; mt.s = 0; mt.from = [this.p1.pos.clone(), this.p2.pos.clone()]; if (mt.uke.state !== 'fight') J.reset(this); }
    if (mt.stage === 'slide') {
      if (!mt.from) mt.from = [this.p1.pos.clone(), this.p2.pos.clone()];
      mt.s += dt / 0.8;
      const k = Math.min(1, mt.s), e = k * k * (3 - 2 * k);
      const tgt = [new V3(J.START[0], 0, 0), new V3(J.START[1], 0, 0)];
      [this.p1, this.p2].forEach((f, i) => { f.pos.lerpVectors(mt.from[i], tgt[i], e); f.vel.set(0, 0, 0); f.yaw += M.wrap((i ? -Math.PI / 2 : Math.PI / 2) - f.yaw) * Math.min(1, dt * 8); });
      if (k >= 1) { for (const f of [this.p1, this.p2]) { f._judoCool = 0.5; f._judoBusy = false; } this.judoMatte = null; }
    }
  }
  if (this.phase === 'fight') for (const f of [this.p1, this.p2]) {
    if (f._judoCool > 0 && f.isPlayer) f._judoCool = Math.max(0, f._judoCool - dt);
    J.offBalTick(f, dt);
    if (!paused(this)) J.clinchTick(f, dt);
    if (f._counterWin > 0) f._counterWin -= dt;
    if (!paused(this) && f.state === 'fight') {
      f._idleT = (f._idleT || 0) + dt;
      if (f._idleT > 18) J.shido(this, f, 'пассивность');
    }
  }
};
// the clock stops while a throw is in the air and between the matte and the next hajime
const origPhase = G._phaseTick;
G._phaseTick = function (dt) {
  const c0 = this.clock;
  origPhase.call(this, dt);
  // it stops for the throw in the air and for the matte; on the ground (osaekomi) it runs as in real judo
  if (this.phase === 'fight' && (this.judoRun || this.judoMatte)) this.clock = c0;
  else if (this.phase === 'fight') this.clock = c0 + (this.clock - c0) * J.CLOCK_SPEED;
  if (this.phase === 'fight' && this.judoNe && !this.opts.golden) this.clock = Math.min(this.clock, this.opts.roundLen - 0.01);   // the bell waits for the hold-down
};
G._deathCheck = function () {};
UFC.Combat.prototype.step = function () {};

// the time is up: whoever has more waza-ari wins, then golden score, then the referees choose
G._endRound = function () {
  if (this.phase !== 'fight' && this.phase !== 'break') return;
  const a = J.score[0], b = J.score[1];
  const wa = a.waza, wb = b.waza;
  if (wa !== wb) {
    const w = wa > wb ? this.p1 : this.p2;
    this.audio.bell(3);
    return this._finish({ winner: w, method: 'DEC', methodText: 'Время вышло · преимущество по ваза-ари (' + Math.max(wa, wb) + ':' + Math.min(wa, wb) + ')', cards: [[wa, wb]], round: 1, time: UFC.fmtTime(this.opts.roundLen) });
  }
  const ya = a.yuko || 0, yb = b.yuko || 0;
  if (ya !== yb) {
    const w = ya > yb ? this.p1 : this.p2;
    this.audio.bell(3);
    return this._finish({ winner: w, method: 'DEC', methodText: 'Время вышло · преимущество по юко (' + Math.max(ya, yb) + ':' + Math.min(ya, yb) + ')', cards: [[ya, yb]], round: 1, time: UFC.fmtTime(this.opts.roundLen) });
  }
  if (!this.opts.golden) {
    this.opts.golden = true; this.goldenAt = this.clock; this.opts.roundLen = 1e9;   // no limit: until somebody scores
    this.audio.bell(2);
    this.ui.callout('ЗОЛОТОЙ СКОР', 'без лимита времени: первая оценка решает', 'round', 2.4);
    return;
  }
  const s0 = this.judoStats[0], s1 = this.judoStats[1];
  const k0 = s0.tries + s0.landed * 3 + (this.p1.stamina / 100), k1 = s1.tries + s1.landed * 3 + (this.p2.stamina / 100);
  const w = k0 >= k1 ? this.p1 : this.p2;
  this.audio.bell(3);
  this._finish({ winner: w, method: 'DEC', methodText: 'Хантэй · решение судей по активности', cards: [[1, 0], [1, 0], [1, 0]], round: 1, time: UFC.fmtTime(this.opts.roundLen) });
};

const origBegin = G._beginRound;
G._beginRound = function (first) {
  origBegin.call(this, first);
  this.p1.place(-0.95, 0, Math.PI / 2); this.p2.place(0.95, 0, -Math.PI / 2);
};
J.shido = function (g, f, why) {
  const i = f === g.p1 ? 0 : 1;
  f._idleT = 0;
  J.score[i].shido++;
  if (J.score[i].shido >= 3) {
    const w = f.opponent;
    g.ui.callout('ХАНСОКУ-МАКЭ', f.cfg.name + ' · третье шидо', 'ko', 3);
    return g._finish({ winner: w, method: 'DEC', methodText: 'Хансоку-макэ · три шидо у ' + f.cfg.name, round: 1, time: UFC.fmtTime(g.clock) });
  }
  g.ui.callout('ШИДО', f.cfg.name + ' · ' + why, 'round', 1.6);
};
// a fresh match
const origQuick = G.startQuickFight;
G.startQuickFight = function (cfgA, cfgB, settings, extra) {
  J.score = [{ waza: 0, shido: 0 }, { waza: 0, shido: 0 }];
  this.judoRun = null; this.judoMatte = null; this.judoPress = null; this.judoNe = null;
  this.judoStats = [{ tries: 0, landed: 0 }, { tries: 0, landed: 0 }];
  const giA = J.opt ? J.opt.gi : 'white';
  const nameOf = (c) => String((c.short || c.name || '').toString());
  cfgA = Object.assign({}, cfgA, { gi: giA, look: Object.assign({}, cfgA.look, { backName: (J.opt && J.opt.name) || nameOf(cfgA) }) });
  cfgB = Object.assign({}, cfgB, { gi: giA === 'white' ? 'blue' : 'white', look: Object.assign({}, cfgB.look, { backName: nameOf(cfgB) }) });
  const s = Object.assign({}, settings, { rounds: 1, roundLen: settings.forceLen || ([40, 60, 120].includes(settings.roundLen) ? settings.roundLen : 40), mcg: -1, technique: '' });
  const r = origQuick.call(this, cfgA, cfgB, s, Object.assign({ presentation: 'off' }, extra || {}));
  this.opts.golden = false;
  for (const f of [this.p1, this.p2]) { f._judoBusy = false; f._judoCool = 0; J.resetGrips(f); f._counterWin = 0; }
  return r;
};

// ---------------------------------------------------------------- the scoreboard
const css = document.createElement('style');
css.textContent = `
#mcgtag, #t-grap, #t-td, #t-acts .pill, #t-slip { display: none !important; }
body.judo .bar.hp, body.judo .bar.hd, body.judo .bar.fl, body.judo .zones, body.judo .hpn, body.judo #hdb0, body.judo #hdb1 { display: none !important; }
.jsc { margin-top: 4px; display: flex; gap: 6px; align-items: center; font: 700 12px/1 system-ui, sans-serif; letter-spacing: .06em; }
.hf.right .jsc { justify-content: flex-end; }
.jsc b { padding: 4px 7px; border-radius: 4px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.35); }
.jsc b.on { background: #e8c547; color: #1a1500; }
.jsc b.ip { background: #d0242b; color: #fff; }
@media (max-width: 900px) { .jsc { gap: 3px; font-size: 10px; } .jsc b { padding: 3px 5px; } }
#jne { display: none; position: absolute; left: 50%; top: 92px; transform: translateX(-50%); z-index: 30; padding: 8px 16px 12px; border-radius: 10px; background: rgba(10,12,18,.82); color: #fff; font: 800 15px/1 system-ui, sans-serif; letter-spacing: .1em; text-align: center; min-width: 190px; pointer-events: none; }
#jne b { color: #f0c82c; font-size: 22px; margin-left: 8px; }
#jne i, #jne u { display: block; height: 4px; margin-top: 6px; border-radius: 2px; }
#jne i { background: #f0c82c; } #jne u { background: #4da3ff; }
#hitlog { top: 132px !important; }
@media (max-height: 520px) { #hitlog { top: 104px !important; } }
.jsc b.sh { background: #e8c547; color: #1a1500; }
.jsc b.gr { background: rgba(80,160,255,.22); color: #cfe3ff; }
.jsc b.ob { background: #e0602b; color: #fff; }
`;
document.head.appendChild(css);
document.body.classList.add('judo');
const Uip = UFC.UI.prototype;
const origHud = Uip.hudUpdate;
Uip.hudUpdate = function (game) {
  origHud.call(this, game);
  for (let i = 0; i < 2; i++) {
    let el = document.getElementById('jsc' + i);
    if (!el) { el = document.createElement('div'); el.className = 'jsc'; el.id = 'jsc' + i; const nm = document.querySelector('#hf' + i + ' .hname'); if (nm) nm.after(el); else continue; }
    const s = J.score[i];
    const f = i ? game.p2 : game.p1, gr = f.grip || 0;
    const nar = window.innerWidth < 900, WZ = nar ? 'ВАЗА' : 'ВАЗА-АРИ';   // a phone: shorter labels
    el.innerHTML = '<b class="' + (s.waza >= 1 ? 'on' : '') + '">' + WZ + '</b><b class="' + (s.waza >= 2 ? 'on' : '') + '">' + WZ + '</b>' + '<b class="' + (s.yuko ? 'on' : '') + '">ЮКО' + (s.yuko > 1 ? ' ×' + s.yuko : '') + '</b>' + (s.ippon ? '<b class="ip">ИППОН</b>' : '') +
      (s.shido ? '<b class="sh">' + 'ШИДО ×' + s.shido + '</b>' : '') + '<b class="gr">' + (nar ? '' : 'ЗАХВАТ ') + (gr >= 2 ? '●●' : gr === 1 ? '●○' : '○○') + '</b>' + (f.offBal ? '<b class="ob">' + (f.offBal.dir === 'back' ? 'НА ПЯТКАХ' : (nar ? 'ВПЕРЁД' : 'ПОДАЛСЯ ВПЕРЁД')) + '</b>' : '');
  }
  const r = document.getElementById('hround'); if (r) r.textContent = game.opts.golden ? 'ЗОЛОТОЙ СКОР' : 'СХВАТКА';
  if (game.opts.golden) { const ht = document.getElementById('htime'); if (ht) ht.textContent = '+' + UFC.fmtTime(Math.max(0, game.clock - (game.goldenAt || game.clock))); }
  // the hold-down clock in the middle of the screen
  let ne = document.getElementById('jne');
  if (!ne) { ne = document.createElement('div'); ne.id = 'jne'; document.body.appendChild(ne); }
  const N = game.judoNe;
  if (N && N.hold) { ne.style.display = 'block'; ne.innerHTML = 'ОСАЕКОМИ <b>' + N.held.toFixed(1) + '</b><i style="width:' + Math.min(100, N.held / 20 * 100) + '%"></i><u style="width:' + Math.min(100, N.esc * 100) + '%"></u>'; }
  else if (N) { ne.style.display = 'block'; ne.innerHTML = 'НЕ-ВАДЗА<u style="width:' + Math.min(100, N.esc * 100) + '%"></u>'; }
  else ne.style.display = 'none';
};
})();

