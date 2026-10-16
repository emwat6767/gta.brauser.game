//# sourceURL=judo/grips.js
// Judo: kumi-kata. Taking a grip (L2), breaking his grip (L1), the push that takes his balance (R1), and the controls.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const M = UFC.M;
const V3 = THREE.Vector3;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

J.loadout = ['podhvat', 'plecho', 'podsechka', 'zacep', 'pistol'];   // □ △ ✕ ○ R2
J.SLOT_NAMES = ['□', '△', '✕', '○', 'R2'];

const st = (f, k) => (f.cfg.stats[k] == null ? 60 : f.cfg.stats[k]);
J.gripSkill = (f) => (0.3 * st(f, 'wrestling') + 0.25 * st(f, 'power') + 0.2 * st(f, 'speed') + 0.25 * st(f, 'bjj')) / 100;
const dist = (a, b) => Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
const can = (f) => { const g = f.game; return g && g.phase === 'fight' && !J.paused(g) && f.state === 'fight' && f.opponent && f.opponent.state === 'fight'; };
const mark = (f, text) => { const g = f.game; if (f === g.p1) g.ui.hitMarker(text, 0); else if (f.opponent === g.p1) g.ui.hitMarker(text, 1); };

J.resetGrips = function (f) { f.grip = 0; f._gripCd = 0; f.offBal = null; f._idleT = 0; };

J.takeGrip = function (f) {
  if (!can(f) || (f._gripCd || 0) > 0) return false;
  const o = f.opponent;
  if ((f.grip || 0) >= 2) return false;
  if (dist(f, o) > 1.45) { mark(f, 'ДАЛЕКО ДЛЯ ЗАХВАТА'); return false; }
  f._gripCd = 0.45; f.stamina = Math.max(0, f.stamina - 1.5);
  let p = 0.62 + (J.gripSkill(f) - J.gripSkill(o)) * 0.9 - (o.grip || 0) * 0.08 - (f.grip ? 0.06 : 0) + (f.cfg.trait === 'grip' ? 0.12 : 0);
  if (o.isPlayer && !f.isPlayer) p *= 0.95;
  if (Math.random() < cl(p, 0.15, 0.92)) {
    f.grip = (f.grip || 0) + 1;
    mark(f, f.grip >= 2 ? 'ПОЛНЫЙ ЗАХВАТ' : 'ЗАХВАТ ЗА РУКАВ');
    f.game.audio.impact && f.game.audio.impact(1.5, 'body', true);
    return true;
  }
  mark(f, 'ЗАХВАТ СБИТ');
  return false;
};

J.breakGrip = function (f) {
  if (!can(f) || (f._gripCd || 0) > 0) return false;
  const o = f.opponent;
  if (!(o.grip > 0)) return false;
  f._gripCd = 0.4; f.stamina = Math.max(0, f.stamina - 2);
  const p = 0.58 + (J.gripSkill(f) - J.gripSkill(o)) * 0.9 - (o.grip >= 2 ? 0.08 : 0);
  if (Math.random() < cl(p, 0.15, 0.9)) { o.grip--; mark(f, 'СБРОСИЛ ЗАХВАТ'); return true; }
  mark(f, 'ЗАХВАТ ДЕРЖИТ');
  return false;
};

// the push: he goes back on his heels (backward throws), and when he pushes back he comes forward (forward throws)
J.push = function (f) {
  if (!can(f) || (f._gripCd || 0) > 0) return false;
  const o = f.opponent;
  if (!(f.grip > 0)) { mark(f, 'НУЖЕН ЗАХВАТ'); return false; }
  if (dist(f, o) > 1.5) return false;
  f._gripCd = 0.6; f.stamina = Math.max(0, f.stamina - 3);
  if (f.hasGly) f.acid += 2.5;
  const pw = cl(0.75 + (st(f, 'power') - st(o, 'power')) / 120 + f.grip * 0.1, 0.4, 1.2);
  const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1;
  o._shoveV = new V3(dx / d * 1.25 * pw, 0, dz / d * 1.25 * pw); o._shoveT = 0.28;
  o.offBal = { dir: 'back', t: 0.75, k: pw, next: true };
  o.stamina = Math.max(0, o.stamina - 2);
  mark(f, 'ТОЛЧОК · ВЫВЕДЕН НАЗАД');
  return true;
};

J.offBalTick = function (f, dt) {
  if ((f._gripCd || 0) > 0) f._gripCd -= dt;
  const ob = f.offBal;
  if (ob) {
    ob.t -= dt;
    if (ob.t <= 0) f.offBal = ob.next ? { dir: 'forward', t: 0.5, k: ob.k * 0.85 } : null;   // he pushes back: now he comes forward
  }
  // walking straight at the opponent puts the weight forward
  if (!f.offBal && f.state === 'fight' && f.intent.mz > 0.6) f._fwdT = (f._fwdT || 0) + dt; else f._fwdT = 0;
  // the grips fall when they move apart
  if (f.opponent && dist(f, f.opponent) > 1.75) f.grip = 0;
};

// ---------------------------------------------------------------- the fight for the grip: they hold, drag, jerk
// in the grips the two are tied together: a spring keeps them at arm's length, the holders jerk each other
// about (a pull brings him forward, a jerk to the side turns him); holding and being held burns the wind,
// the glycogen and fills the acid, and the breath does not come back while they fight
J.clinchTick = function (f, dt) {
  const o = f.opponent, g = f.game;
  if (!o || f.state !== 'fight' || o.state !== 'fight') return;
  const d = dist(f, o), my = f.grip || 0, his = o.grip || 0;
  const tied = (my > 0 || his > 0) && d < 1.6;
  f._rub = tied ? Math.min(1, (f._rub || 0) + dt * 2) : Math.max(0, (f._rub || 0) - dt * 1.5);
  if (!tied) { f._jerkT = Math.max(f._jerkT || 0, 0.4); return; }
  // the price: holding with two hands is hard work, so is carrying his grips
  const work = (0.6 + 0.8 * my + 0.6 * his + (f._jerking > 0 ? 2 : 0)) * (f.stamina < 15 ? 0.3 : 1);   // an empty man can't work hard
  f.stamina = Math.max(0, f.stamina - dt * work);
  if (f.hasGly) { f.gly = Math.max(0, f.gly - dt * 0.12 * (my + his + 0.5)); f.acid += dt * (1.4 * my + 0.9 * his + (f._jerking > 0 ? 2 : 0)); }
  if (f._jerking > 0) f._jerking -= dt;
  // the spring of the arms (only the one who pulls more moves the pair)
  if (f === g.p1) {
    const rest = 0.9 * (f.h + o.h) / 3.6, k = (d - rest) * Math.min(1, dt * 2.5);
    const nx = (o.pos.x - f.pos.x) / (d || 1), nz = (o.pos.z - f.pos.z) / (d || 1);
    f.pos.x += nx * k * 0.5; f.pos.z += nz * k * 0.5; o.pos.x -= nx * k * 0.5; o.pos.z -= nz * k * 0.5;
  }
  // the jerks: only with a grip of his own
  if (my <= 0) return;
  f._jerkT = (f._jerkT == null ? Math.random() * 1.2 : f._jerkT) - dt;
  if (f._jerkT > 0) return;
  const lvlRate = f.isPlayer ? 1 : [0.7, 0.9, 1.1, 1.3][M.clamp(g.opts.difficulty | 0, 0, 3)];
  f._jerkT = (1.6 - 0.35 * my) / lvlRate * (0.7 + Math.random() * 0.8) * (0.6 + 0.4 * (100 / Math.max(25, f.stamina)) * 0.4);
  if (f.stamina < 10) return;
  const nx = (o.pos.x - f.pos.x) / (d || 1), nz = (o.pos.z - f.pos.z) / (d || 1);
  const r = Math.random(), pw = cl(0.55 + (st(f, 'power') - st(o, 'power')) / 150 + 0.12 * my, 0.35, 1.0);
  let vx, vz, dir;
  if (r < 0.45) { vx = -nx; vz = -nz; dir = 'forward'; }                         // the pull: he comes onto his toes
  else if (r < 0.8) { const s = Math.random() < 0.5 ? 1 : -1; vx = -nz * s; vz = nx * s; dir = 'side'; }   // the jerk to the side
  else { vx = nx; vz = nz; dir = 'back'; }                                     // the drive back
  o._shoveV = new V3(vx * 1.05 * pw, 0, vz * 1.05 * pw); o._shoveT = 0.2;
  f._shoveV = new V3(vx * 0.55 * pw, 0, vz * 0.55 * pw); f._shoveT = 0.2;      // he goes with his own jerk
  f._jerking = 0.25; o.stamina = Math.max(0, o.stamina - 1.2 * pw);
  if (o.hasGly) o.acid += 0.8 * pw;
  if (!o.offBal && dir !== 'side') o.offBal = { dir, t: 0.35, k: 0.45 * pw };
  else if (!o.offBal) o.offBal = { dir: 'forward', t: 0.25, k: 0.3 * pw };
};

// in the grips the breath does not come back: most of the recovery is lost while they fight
const origStam = UFC.Fighter.prototype._staminaTick;
UFC.Fighter.prototype._staminaTick = function (dt) {
  const s0 = this.stamina;
  origStam.call(this, dt);
  if (!UFC.judo) return;
  // the block on breathing holds only while they really fight for the grip: after a matte, a throw or on the ground it is gone
  const g = this.game, fighting = g && g.phase === 'fight' && !J.paused(g) && this.state === 'fight';
  if (!fighting) this._rub = Math.max(0, (this._rub || 0) - dt * 3);
  const rub = this._rub || 0;
  if (rub > 0 && this.stamina > s0) this.stamina = s0 + (this.stamina - s0) * (1 - 0.75 * rub);
  // an empty man still breathes: the wind always comes back a little, faster once he is out of the grips
  if (this.stamina < 35) { const floor = (rub > 0.5 ? 1.6 : 4.5) * dt; if (this.stamina - s0 < floor) this.stamina = Math.min(this.staminaCap, s0 + floor); }
};

// how off balance is he for a throw of this direction (1 = not at all)
J.balanceBonus = function (o, T) {
  const ob = o.offBal, fall = T.fall;
  let k = 1;
  if (ob) {
    if (ob.dir === 'back' && (fall === 'backward' || fall === 'back')) k = 1 + 0.75 * ob.k;
    else if (ob.dir === 'forward' && fall === 'forward') k = 1 + 0.75 * ob.k;
    else if (fall === 'side') k = 1 + 0.35 * ob.k;
    else k = 0.85;
  } else if ((o._fwdT || 0) > 0.25 && (fall === 'forward' || fall === 'side')) k = 1.25;
  return k;
};

// ---------------------------------------------------------------- the hands follow the grips
const origGuard = UFC.Fighter.prototype._guardTargets;
UFC.Fighter.prototype._guardTargets = function () {
  const g = origGuard.call(this);
  const o = this.opponent;
  if (!UFC.judo || !o || this.state !== 'fight' || !this.game || this.game.phase !== 'fight' || this._judoBusy) return g;
  const root = this.body.root, h = this.h, lead = this.leadSide, rear = this.rearSide;
  const grip = this.grip || 0;
  // no grip: open hands forward, fishing for the sleeve
  const open = (side, sx) => g[side].set(sx * 0.07 * h, 0.73 * h + Math.sin(this.time * 2.3 + sx) * 0.012 * h, 0.2 * h + Math.sin(this.time * 1.7 + sx * 2) * 0.02 * h);
  open('L', 1); open('R', -1);
  if (grip >= 1) { const t = J.anchor(o, rear === 'L' ? 'sleeveR' : 'sleeveL', new V3()); root.worldToLocal(t); g[rear].lerp(t, 0.92); }
  if (grip >= 2) { const t = J.anchor(o, lead === 'L' ? 'lapelR' : 'lapelL', new V3()); root.worldToLocal(t); g[lead].lerp(t, 0.92); }
  return g;
};

// ---------------------------------------------------------------- the player's controls
const PC = UFC.PlayerController.prototype;
const origPC = PC.update;
PC.update = function () {
  if (!UFC.judo) return origPC.call(this);
  const f = this.f, s = this.input.state, it = f.intent, inp = this.input, game = this.game;
  const cam = game.camera;
  const fwd = new V3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new V3(-fwd.z, 0, fwd.x);
  const wx = right.x * s.lx + fwd.x * s.ly, wz = right.z * s.lx + fwd.z * s.ly;
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw), lx = Math.cos(f.yaw), lz = -Math.sin(f.yaw);
  it.mx = wx * lx + wz * lz; it.mz = wx * fx + wz * fz;
  it.slipX = 0; it.slipZ = 0; it.block = 'none'; it.strike = null;
  const run = game.judoRun;
  if (run && run.uke === f && (inp.pressed('l1') || inp.pressed('sub'))) J.resistTry(game, run, f);
  const ne = game.judoNe;   // on the ground: on top L2 goes for the neck or the arm, underneath L1 bridges out
  if (ne && ne.tori === f && (inp.pressed('l2') || inp.pressed('grapple'))) J.subTry(game, f);
  if (ne && ne.uke === f && (inp.pressed('l1') || inp.pressed('sub'))) J.escTry(game, f);
  if (game.phase !== 'fight' || f.state !== 'fight') return;
  if (inp.pressed('l2') || inp.pressed('grapple')) J.takeGrip(f);
  if (inp.pressed('l1') || inp.pressed('sub')) J.breakGrip(f);
  if (inp.pressed('r1') || inp.pressed('td')) J.push(f);
  const slot = inp.pressed('square') ? 0 : inp.pressed('triangle') ? 1 : inp.pressed('cross') ? 2 : inp.pressed('circle') ? 3 : (inp.pressed('r2') || inp.pressed('gnp')) ? 4 : -1;
  if (slot >= 0) J.tryThrow(f, J.loadout[slot]);
};

// the touch buttons: L2 takes the grip, L1 breaks his, R1 pushes, R2 is the fifth throw
const A = UFC.ACTIONS;
A.judoGrip = { name: 'Взять захват', short: 'ЗАХВАТ', tap: 'grapple' };
A.judoBreak = { name: 'Сбросить захват соперника', short: 'СБРОС', tap: 'sub' };
A.judoPush = { name: 'Толчок (вывести назад)', short: 'ТОЛЧОК', tap: 'td' };
A.judoTech5 = { name: 'Пятый приём', short: 'ПРИЁМ 5', tap: 'gnp' };
UFC.BIND_DEFAULTS.btn = { square: 'jab', triangle: 'cross', cross: 'lowL', circle: 'lowR', l1: 'judoBreak', r1: 'judoPush', l2: 'judoGrip', r2: 'judoTech5' };
UFC.BIND_DEFAULTS.swipe = { tap: 'judoGrip', up: 'cross', down: 'lowL', left: 'jab', right: 'judoPush', diagUp: 'judoTech5', diagDown: 'lowR', long: 'judoBreak' };
const origBinds = UFC.binds;
UFC.binds = (settings) => { const b = origBinds(settings); return { btn: Object.assign({}, UFC.BIND_DEFAULTS.btn), swipe: Object.assign({}, UFC.BIND_DEFAULTS.swipe), _u: b }; };

J.relabel = function () {
  const T = J.TECHS, L = J.loadout, set = (id, n) => { if (A[id]) { A[id].short = n.toUpperCase(); A[id].name = n; } };
  set('jab', T[L[0]].name); set('cross', T[L[1]].name); set('lowL', T[L[2]].name); set('lowR', T[L[3]].name); set('judoTech5', T[L[4]].name);
  const g = window.__UFC__;
  try { if (g && g.touch && g.touch.refreshBinds) g.touch.refreshBinds(); } catch (e) { /* ignore */ }
};
J.relabel();
})();

// the judo stance: feet side by side, shoulder width (not the staggered boxing stance), toes a little out
(function () {
  const UFC = window.UFC, F = UFC.Fighter.prototype, V3 = THREE.Vector3, UP = new V3(0, 1, 0), _w = new V3();
  const ofr = F._footRest, ory = F._restYaw;
  const casual = (f) => f.state === 'cine' && f.cine && f.cine.casual;
  F._footRest = function (side, out) {
    if (!UFC.judo || casual(this)) return ofr.call(this, side, out);
    const h = this.h, lead = side === this.leadSide, sx = side === 'L' ? 1 : -1, widen = this.sp ? this.sp.crouch.v * 0.2 : 0;
    _w.set(sx * (0.085 * h + widen), 0, lead ? 0.1 * h : -0.09 * h);
    return out.copy(_w).applyAxisAngle(UP, this.yaw).add(this.pos).setY(0);
  };
  F._restYaw = function (side) {
    if (!UFC.judo || casual(this)) return ory.call(this, side);
    return this.yaw + (side === 'L' ? 0.2 : -0.2);
  };
})();

