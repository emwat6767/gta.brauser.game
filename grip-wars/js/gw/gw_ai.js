//# sourceURL=judo/gw_ai.js
// GRIP WARS: the opponents. Five kinds of judoka, each with his own way of fighting:
// the aggressive attacker, the counter-attacker, the grip master, the enduring tactician and the all-round champion.
// The difficulty is in the decisions - how fast he reacts, whether he sees the moment, how often he wastes an attack -
// not in bigger numbers.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const M = UFC.M;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const GW = window.GW = window.GW || {};

GW.TYPES = {
  aggressor: { name: 'Агрессивный атакующий', short: 'АГРЕССОР', desc: 'атакует часто, даже с одним захватом, давит и толкает; к концу схватки выдыхается',
    grip: 1.25, brk: 0.75, minGrip: 0, gap: [1.6, 3.0], push: 0.6, window: 1.3, counter: 0.7, tiredTempo: 0.8 },
  counter: { name: 'Контратакующий', short: 'КОНТРА', desc: 'сам атакует редко, ждёт вашей неудачной попытки и наказывает контрприёмом',
    grip: 0.85, brk: 1.0, minGrip: 2, gap: [10, 15], push: 0.1, window: 0.6, counter: 3.0, brace: 0.86 },
  grip: { name: 'Мастер захвата', short: 'ЗАХВАТ', desc: 'выигрывает борьбу за захват, мгновенно сбрасывает ваш, атакует только с лучшим захватом',
    grip: 1.7, brk: 1.9, minGrip: 2, needLead: true, gap: [3.6, 5.6], push: 0.3, window: 1.0, counter: 1.0, switcher: true },
  tactician: { name: 'Выносливый тактик', short: 'ТАКТИК', desc: 'бережёт силы, тянет время, выматывает и атакует, когда вы устали; силён в золотом скоре',
    grip: 0.9, brk: 1.15, minGrip: 2, gap: [6, 10], lateGap: [2.4, 4], push: 0.22, window: 1.2, counter: 1.2, saver: true },
  champion: { name: 'Универсальный чемпион', short: 'ЧЕМПИОН', desc: 'всё делает хорошо, читает ваш любимый бросок и подстраивается, ловит каждый момент',
    grip: 1.3, brk: 1.35, minGrip: 2, gap: [3.2, 5.2], push: 0.3, window: 1.8, counter: 1.6, adapt: true, switcher: true, brace: 0.92 },
};
const TRAIT_TYPE = { counter: 'counter', grip: 'grip', power: 'aggressor', cardio: 'tactician', tech: 'champion' };
GW.typeOf = (f) => (f.cfg && f.cfg.gwType) || TRAIT_TYPE[f.cfg && f.cfg.trait] || 'champion';

// the decisions by difficulty: reaction, seeing the moment, wasted attacks
const LV = {
  react: [1.3, 0.9, 0.6, 0.38],
  window: [0.35, 0.6, 0.85, 1.0],
  waste: [0.35, 0.18, 0.07, 0.0],
  brk: [0.45, 0.62, 0.78, 0.9],
  counter: [0.05, 0.1, 0.16, 0.22],
};
const lvlOf = (g) => M.clamp((g.opts && g.opts.difficulty) | 0, 0, 3);

// ---------------------------------------------------------------- reading the player
// every opponent remembers what you threw; the champion adapts to it the most
let READ = {};
J.readReset = () => { READ = {}; };
J.onAttempt = (f, id) => { if (f.isPlayer) READ[id] = (READ[id] || 0) + 1; };
J.readMod = function (f, o, T) {
  if (!f.isPlayer || !o || o.isPlayer) return 1;
  const n = READ[T.id] || 0, ty = GW.typeOf(o), P = GW.TYPES[ty];
  let k = 1;
  if (P && P.brace && !o.offBal) k *= P.brace;   // the counter man and the champion are hard to catch flat-footed
  if (n >= 2) {
    const read = ty === 'champion' ? 0.7 : 0.9;
    k *= read;
    if (ty === 'champion' && n === 2 && !o._readSaid) { o._readSaid = true; const g = o.game; g.ui.hitMarker(o.cfg.short + ' читает ваш «' + T.name + '»', 1); }
  }
  return k;
};
// the counter after a stopped attempt: the counter man lives for it
J.counterChance = function (o, f, lvl) {
  const P = GW.TYPES[GW.typeOf(o)];
  return cl(LV.counter[lvl] * (P ? P.counter : 1) * ((o.grip || 0) > 0 ? 1.25 : 0.6), 0, 0.75);
};

// ---------------------------------------------------------------- the opponent's brain
J.aiUpdate = function (ai, dt) {
  const g = ai.game, f = ai.f, o = f.opponent, it = f.intent;
  it.strike = null; it.block = 'none'; it.slipX = it.slipZ = 0;
  if (GW.drill && GW.drill.ai) { GW.drill.ai(ai, dt); return; }
  if (g.phase !== 'fight' || J.paused(g) || f.state !== 'fight' || !o || o.state !== 'fight') { it.mx = it.mz = 0; f._gwGuardWant = false; return; }
  const lvl = lvlOf(g), ty = GW.typeOf(f), P = GW.TYPES[ty];
  ai.jt = (ai.jt || 0) + dt;
  if (ai.jphase == null) { ai.jphase = Math.random() * 6; ai.jcd = rnd(P.gap[0], P.gap[1]) * 0.8; ai.gcd = rnd(0.4, 1); ai.bcd = 0; ai.react = null; ai.saveT = 0; ai.swT = rnd(6, 12); }
  const dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  const myG = f.grip || 0, hisG = o.grip || 0, myS = f.stamina, hisS = o.stamina;
  const late = g.opts.golden || (g.opts.roundLen && g.clock > g.opts.roundLen * 0.55);
  // the tactician saves himself: when the tank runs low he gets out of the grips and breathes
  if (P.saver && myS < 45 && !g.opts.golden) ai.saveT = Math.max(ai.saveT, 2.2);
  if (ai.saveT > 0) ai.saveT -= dt;
  const saving = ai.saveT > 0;
  // footwork: to the grip distance, circling; the aggressor walks through, the saver backs off
  let want = myG > 0 || hisG > 0 ? 0.9 : 1.0;
  if (ty === 'aggressor') want -= 0.08;
  if (saving) want = 1.5;
  it.mz = dist > want + 0.25 ? 1 : dist < want - 0.2 ? -0.7 : 0;
  it.mx = Math.sin(ai.jt * 0.9 + ai.jphase) * (ty === 'tactician' ? 0.7 : 0.5);
  if (f.offBal && f.offBal.dir === 'back') it.mz = -0.3;
  if (o.offBal && o.offBal.dir === 'back' && ty !== 'counter') it.mz = Math.max(it.mz, 0.4);   // he follows you back
  f._judoCool = Math.max(0, (f._judoCool || 0) - dt);
  ai.jcd -= dt; ai.gcd -= dt; ai.bcd -= dt;
  f._gwGuardWant = false;
  // the grips: take them; the grip master is faster and never stops
  if (!saving && dist < 1.4 && myG < 2 && ai.gcd <= 0) { J.takeGrip(f); ai.gcd = rnd(0.5, 1.2) * (1.4 - lvl * 0.2) / P.grip; }
  if (saving && myG > 0 && Math.random() < dt * 2) { f.grip = Math.max(0, myG - 1); }
  // and tear his off after a reaction time
  if (hisG > 0) {
    if (ai.react == null) ai.react = LV.react[lvl] * rnd(0.7, 1.3) / P.brk;
    ai.react -= dt;
    if (ai.react <= 0 && ai.bcd <= 0) { if (Math.random() < cl(LV.brk[lvl] * (0.8 + 0.2 * P.brk), 0, 0.97)) J.breakGrip(f); ai.bcd = rnd(0.6, 1.4) / P.brk; ai.react = null; }
  } else ai.react = null;
  // the stance: the grip master and the champion change feet to take your favourite grip away
  if (P.switcher) {
    ai.swT -= dt;
    if (ai.swT <= 0) { ai.swT = rnd(7, 13); if (hisG >= myG && Math.random() < 0.3 + 0.15 * lvl) J.switchStance(f); }
  }
  // the counter man and the tactician brace when you are dangerous: you have the full grip and he is off balance
  if ((ty === 'counter' || ty === 'tactician') && hisG >= 2 && f.offBal && lvl >= 1) f._gwGuardWant = Math.random() < 0.7;
  if (f._judoCool || myS < 12 || saving) return;
  // which throw: the favourites first, then by the style, then by the direction he is off balance
  const fav = f.cfg.fav;
  const list = J.STYLE_TECHS[f.cfg.style] || J.STYLE_TECHS.boxer;
  const pick = (filter) => {
    if (fav && Math.random() < 0.65) { const F = fav.filter((t) => J.TECHS[t] && (!filter || filter(J.TECHS[t]))); if (F.length) return F[(Math.random() * F.length) | 0]; }
    const L = list.filter(([t]) => J.TECHS[t] && (!filter || filter(J.TECHS[t])));
    if (!L.length) return null;
    let sum = 0; for (const [, w] of L) sum += w;
    let r = Math.random() * sum; for (const [t, w] of L) { r -= w; if (r <= 0) return t; }
    return L[0][0];
  };
  // he sees the moment: you are off balance, or spent
  const ob = o.offBal, tired = hisS < 30;
  const winRate = LV.window[lvl] * P.window * (tired ? 1.4 : 1);
  if (ob && dist < 1.5 && myG > 0 && Math.random() < winRate * 3 * dt) {
    const id = pick((T) => (ob.dir === 'back' ? T.fall === 'backward' || T.fall === 'back' : T.fall === 'forward' || T.fall === 'side')) || pick();
    if (id) { J.tryThrow(f, id); ai.jcd = rnd(P.gap[0], P.gap[1]) * 0.6; return; }
  }
  // push, then attack the reaction
  if (myG > 0 && dist < 1.4 && Math.random() < P.push * (0.6 + 0.25 * lvl) * dt && ai.jcd < 3) { J.push(f); ai.jcd = Math.min(ai.jcd, 0.25 + Math.random() * 0.3); return; }
  // the scheduled attack
  if (ai.jcd <= 0 && dist < 1.5) {
    const waste = Math.random() < LV.waste[lvl];
    const gripOk = myG >= P.minGrip && (!P.needLead || myG > hisG || myG >= 2);
    if (!gripOk && !waste) { ai.jcd = 0.5; return; }   // a good judoka does not attack without the grip he wants
    J.tryThrow(f, pick());
    let gap = rnd(P.gap[0], P.gap[1]);
    if (P.lateGap && (late || hisS < 45 || myS > hisS + 20)) gap = rnd(P.lateGap[0], P.lateGap[1]);
    if (P.tiredTempo && myS < 40) gap /= P.tiredTempo;   // the aggressor slows when he is spent
    if (ty === 'aggressor' && tired) gap *= 0.7;
    ai.jcd = gap * (1.15 - 0.08 * lvl);
  }
};
UFC.AIController.prototype.update = function (dt) { J.aiUpdate(this, dt); };

// the opponent's kind is also visible in his clinch: the grip master jerks more often, the aggressor harder
const origClinch = J.clinchTick;
J.clinchTick = function (f, dt) {
  const ty = !f.isPlayer && f.cfg ? GW.typeOf(f) : null;
  if (ty === 'grip' && f._jerkT > 0) f._jerkT -= dt * 0.45;
  if (ty === 'aggressor' && f._jerkT > 0) f._jerkT -= dt * 0.25;
  return origClinch.call(this, f, dt);
};
})();

