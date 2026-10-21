//# sourceURL=ufc/gnp.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;

// ---------------------------------------------------------------------------
// Ground & pound after a knockdown. Opt-in: the attacker walks in, kneels over
// the downed fighter and throws downward punches / elbows; the defender covers
// and tries to kick free; the referee steps in on unanswered damage.
// ---------------------------------------------------------------------------
UFC.POSES.gnpKneel = {
  hipsY: 0.3, hips: [0.42, 0, 0], spine: [0.22, 0, 0], chest: [0.16, 0, 0], neck: [-0.35, 0, 0], head: [-0.2, 0, 0],
  uaL: [-1.2, 0, 0.35], faL: [-2.0, 0, 0], uaR: [-1.2, 0, -0.35], faR: [-2.0, 0, 0],
  thL: [-0.5, 0, 0.16], snL: [1.9, 0, 0], thR: [-0.5, 0, -0.16], snR: [1.9, 0, 0], ftL: [0.9, 0, 0], ftR: [0.9, 0, 0],
};
// posture up in combat base: room for long, heavy shots
UFC.POSES.gnpPosture = {
  hipsY: 0.4, hips: [0.12, 0, 0], spine: [0.12, 0, 0], chest: [0.08, 0, 0], neck: [-0.3, 0, 0], head: [-0.25, 0, 0],
  uaL: [-1.2, 0, 0.35], faL: [-2.0, 0, 0], uaR: [-1.2, 0, -0.35], faR: [-2.0, 0, 0],
  thL: [-0.35, 0, 0.22], snL: [1.25, 0, 0], thR: [-1.15, 0, -0.2], snR: [1.25, 0, 0], ftL: [0.5, 0, 0], ftR: [0.2, 0, 0],
};
// low and heavy: sitting on the heels, chest over the opponent
UFC.POSES.gnpLow = {
  hipsY: 0.22, hips: [0.62, 0, 0], spine: [0.25, 0, 0], chest: [0.15, 0, 0], neck: [-0.55, 0, 0], head: [-0.3, 0, 0],
  uaL: [-1.2, 0, 0.35], faL: [-2.0, 0, 0], uaR: [-1.2, 0, -0.35], faR: [-2.0, 0, 0],
  thL: [-0.3, 0, 0.45], snL: [2.2, 0, 0], thR: [-0.3, 0, -0.45], snR: [2.2, 0, 0], ftL: [0.6, 0, 0], ftR: [0.6, 0, 0],
};
const KNEEL = UFC.compilePose('gnpKneel');
const POSTURES = { gnpKneel: KNEEL, gnpPosture: UFC.compilePose('gnpPosture'), gnpLow: UFC.compilePose('gnpLow') };
const SPOT = { gnpKneel: 0.3, gnpPosture: 0.44, gnpLow: 0.2 };
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'snL', 'thR', 'snR', 'ftL', 'ftR'];

const P = UFC.Fighter.prototype;
const _a = new V3(), _b = new V3(), _c = new V3(), _q = new Q();

// Ground strikes. arc decides the path of the fist, target the body part.
UFC.GNP_MOVES = {
  punch: { wind: 0.1, down: 0.11, back: 0.13, dmg: 7.5, stam: 3.5, arc: 'straight', name: 'Удар в партере' },
  elbow: { wind: 0.2, down: 0.12, back: 0.18, dmg: 11, stam: 5.5, arc: 'elbow', name: 'Локоть в партере' },
  hammer: { wind: 0.22, down: 0.12, back: 0.16, dmg: 9.5, stam: 4.5, arc: 'hammer', name: 'Хаммерфист' },
  side: { wind: 0.14, down: 0.12, back: 0.15, dmg: 8.5, stam: 4, arc: 'side', name: 'Боковой в партере' },
  body: { wind: 0.12, down: 0.12, back: 0.14, dmg: 6.5, stam: 3.5, arc: 'body', target: 'body', name: 'В корпус в партере' },
  heavy: { wind: 0.34, down: 0.13, back: 0.22, dmg: 14, stam: 7, arc: 'heavy', name: 'Тяжёлый удар сверху' },
};
// How different fighters work from the top. speed scales wind-up and recovery.
UFC.GNP_PROFILES = {
  striker: { speed: 0.85, postures: ['gnpKneel', 'gnpPosture'], moves: { punch: 4, side: 2, hammer: 2, body: 1, heavy: 1 }, flurry: 0.25, lead: 0.5, pounce: 1 },
  // sharp, fast lead hand, pounces on a dropped opponent and finishes in bursts
  sniper: { speed: 0.66, postures: ['gnpPosture', 'gnpKneel'], moves: { punch: 5, hammer: 3, side: 1, heavy: 1 }, flurry: 0.5, lead: 0.78, pounce: 0.6 },
  grinder: { speed: 1.05, postures: ['gnpLow', 'gnpKneel'], moves: { punch: 2, elbow: 4, body: 2, heavy: 1, hammer: 1 }, flurry: 0.12, lead: 0.5, pounce: 1.15 },
  brawler: { speed: 0.9, postures: ['gnpKneel', 'gnpPosture'], moves: { heavy: 3, hammer: 3, punch: 2, side: 2 }, flurry: 0.3, lead: 0.5, pounce: 0.9 },
};
UFC.gnpProfile = (f) => {
  const c = f.cfg || {};
  if (c.gnpStyle && UFC.GNP_PROFILES[c.gnpStyle]) return UFC.GNP_PROFILES[c.gnpStyle];
  if (c.id === 'mcgregor') return UFC.GNP_PROFILES.sniper;
  if (c.style === 'wrestler') return UFC.GNP_PROFILES.grinder;
  if (c.style === 'brawler') return UFC.GNP_PROFILES.brawler;
  return UFC.GNP_PROFILES.striker;
};
// what the player's buttons turn into on the ground
const MOVE_FOR_INPUT = { straight: 'punch', hook: 'side', uppercut: 'hammer', body: 'body', lowKick: 'heavy', bodyKick: 'elbow', headKick: 'heavy', knee: 'elbow' };

// Can `this` start ground and pound on its opponent right now?
P.canGnp = function () {
  const o = this.opponent;
  if (this.state !== 'fight' || !o || !o.isGrounded || !o.isGrounded() || o.gnpBy) return false;
  if (this.strike || this.hitstun > 0) return false;
  return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 1.9;
};

P.startGnp = function () {
  const o = this.opponent;
  this.cancelStrike();
  this.state = 'gnp';
  this.block = 'none';
  const snap = { q: {}, hipsPos: this.body.B.hips.position.clone() };
  for (const n of BONES) snap.q[n] = this.body.B[n].quaternion.clone();
  const prof = UFC.gnpProfile(this);
  const posture = M.pick(prof.postures);
  this.gnp = { t: 0, from: this.pos.clone(), fromYaw: this.yaw, snap, strike: null, queue: null, exitT: 0, landed: 0, recentT: [],
    prof, posture, prevPosture: posture, pw: 1, sinceSwitch: 0, enterDur: 0.45 * prof.pounce, lastMove: null, side: Math.random() < 0.5 ? 1 : -1 };
  o.gnpBy = this;
  o.gnpEscape = 0;
};

P.endGnp = function (pushed) {
  const o = this.opponent;
  if (o && o.gnpBy === this) o.gnpBy = null;
  const B = this.body.B;
  // blend from the kneel back into the standing stance
  this._snap = {};
  for (const [k, b] of Object.entries(B)) this._snap[k] = b.quaternion.clone();
  this._snapHips = B.hips.position.clone();
  this.gnp = null;
  this.state = 'getup';
  this.getupT = 0;
  this._blendDur = pushed ? 0.55 : 0.45;
  this.gait = null;
  for (const side of ['L', 'R']) {
    const f = this.foot[side];
    this._footRest(side, f.planted);
    f.stepping = false; f.t = 1; f.yaw = this._restYaw(side);
  }
  Object.values(this.sp).forEach((s) => { s.vel = 0; });
  this.sp.crouch.snap(0.18 * this.h);
  if (pushed) {
    this.vel.x -= Math.sin(this.yaw) * 1.6; this.vel.z -= Math.cos(this.yaw) * 1.6;
    this.stumbleT = 0.45;
  }
};

// The spot to kneel on: over the downed fighter's hips, facing him.
P._gnpSpot = function (out) {
  const o = this.opponent;
  const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
  // each position on top sits at its own distance; slide between them smoothly
  const g = this.gnp;
  const d = g ? M.lerp(SPOT[g.prevPosture] || 0.3, SPOT[g.posture] || 0.3, M.smooth(g.pw)) : 0.3;
  const style = o.downStyle || 'back';
  if (style === 'side' || style === 'prone' || style === 'turtle') {
    // work from beside him: hammerfists and hooks to the side of the head, shots to the ribs
    const sgn = g && g.side ? g.side : 1;
    const k = (d + 0.2) * o.h / 1.8;
    return out.set(o.pos.x + fz * k * sgn, 0, o.pos.z - fx * k * sgn);
  }
  return out.set(o.pos.x + fx * d * o.h / 1.8, 0, o.pos.z + fz * d * o.h / 1.8);
};

P._updateGnp = function (dt) {
  const g = this.gnp, o = this.opponent, B = this.body.B, root = this.body.root, h = this.h, game = this.game;
  this.time += dt;
  g.t += dt;
  if (!o || o.gnpBy !== this || o.state === 'ko' || !(o.state === 'down' && (o.downPhase === 'grounded'))) {
    if (!o || o.state !== 'ko') this.endGnp(false);
    return;
  }
  // move in and settle
  const spot = this._gnpSpot(_a);
  const enter = M.smooth(Math.min(1, g.t / g.enterDur));
  this.pos.lerpVectors(g.from, spot, enter);
  const faceYaw = Math.atan2(o.pos.x - spot.x, o.pos.z - spot.z);
  this.yaw = g.fromYaw + M.wrap(faceYaw - g.fromYaw) * enter;
  this.vel.set(0, 0, 0);
  root.position.copy(this.pos); root.rotation.set(0, this.yaw, 0);
  g.pw = Math.min(1, g.pw + dt / 0.35);
  const P1 = POSTURES[g.posture] || KNEEL, P0 = POSTURES[g.prevPosture] || KNEEL;
  if (enter < 1) this._writePose(null, P1, enter, g.snap);
  else this._writePose(P0, P1, M.smooth(g.pw));
  // the body works with the punch: lean in on the way down, twist into hooks
  const st = g.strike;
  if (st && enter >= 1) {
    const sgn = st.limb === 'L' ? 1 : -1;
    const ph = st.t < st.wind ? -M.smooth(st.t / st.wind) : st.t < st.wind + st.down ? -1 + 2 * M.easeIn((st.t - st.wind) / st.down) : 1 - M.smooth((st.t - st.wind - st.down) / st.back);
    const twist = { side: 0.45, heavy: 0.35, hammer: 0.2, elbow: 0.3 }[st.mv.arc] || 0.12;
    const lean = { heavy: 0.28, hammer: 0.2, elbow: 0.18 }[st.mv.arc] || 0.1;
    B.chest.quaternion.multiply(_q.setFromEuler(new E(-ph * lean, ph * twist * sgn, 0, 'YXZ')));
    B.spine.quaternion.multiply(_q.setFromEuler(new E(-ph * lean * 0.5, ph * twist * 0.5 * sgn, 0, 'YXZ')));
  }
  // breathing / posture sway
  B.chest.quaternion.multiply(_q.setFromEuler(new E(Math.sin(this.time * 2.4) * 0.03, 0, 0)));
  root.updateMatrixWorld(true);

  // regen stops while working
  this.stamina = Math.max(0, this.stamina - dt * 0.8);

  // ---- strikes ----
  const it = this.intent;
  if (it.strike) {
    // a press during the recovery of the last shot chains straight into the next one
    if (g.strike && g.strike.t > g.strike.wind) g.queue = it.strike;
    else if (!g.strike) g.queue = it.strike;
  }
  it.strike = null;
  if (enter >= 1 && !g.strike && g.queue) {
    const req = g.queue; g.queue = null;
    let key = req.move || MOVE_FOR_INPUT[req.type] || 'punch';
    // a repeated button still varies a little, so no two shots look the same
    if (key === g.lastMove && key === 'punch' && Math.random() < 0.3) key = M.pick(['side', 'hammer']);
    const mv = UFC.GNP_MOVES[key];
    const spd = g.prof.speed * (req.quick ? 0.8 : 1);
    const heavy = mv.arc === 'heavy' || mv.arc === 'elbow' || mv.arc === 'hammer';
    g.strike = { mv, key, limb: req.limb || 'R', t: 0, hit: false, heavy, wind: mv.wind * spd, down: mv.down * Math.max(0.8, spd), back: mv.back * spd };
    g.lastMove = key;
    this.stamina = Math.max(0, this.stamina - mv.stam);
    this.stats.thrown++;
    game.audio.whoosh(mv.dmg);
    // every few shots the attacker may change his position on top
    g.sinceSwitch++;
    if (g.sinceSwitch >= 3 && Math.random() < 0.35 && g.prof.postures.length > 1) {
      g.prevPosture = g.posture;
      g.posture = g.prof.postures.find((n) => n !== g.posture) || g.posture;
      g.pw = 0; g.sinceSwitch = 0;
    }
  }

  // arms: guard or strike, solved with IK onto the defender's head
  const head = o.headCenter(_b);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    // guard: fists in front of own face
    const guard = B.chest.localToWorld(_c.set(sx * 0.07 * h, 0.1 * h, 0.2 * h));
    let target = guard, pole = new V3(sx * 0.6, -1, -0.3).applyQuaternion(root.quaternion);
    const s = g.strike;
    if (s && s.limb === side) {
      const { wind, down, back } = s;
      const arc = s.mv.arc;
      const fwd = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const lat = new V3(fwd.z, 0, -fwd.x).multiplyScalar(sx); // towards this arm's side
      const tgt = s.mv.target === 'body' ? o.body.B.chest.getWorldPosition(new V3()) : head.clone();
      tgt.y += (s.mv.target === 'body' ? 0.0 : 0.02) * h;
      if (arc === 'side') tgt.addScaledVector(lat, 0.05 * h);
      const cocked = guard.clone();
      if (arc === 'hammer' || arc === 'heavy') { cocked.y += (arc === 'heavy' ? 0.3 : 0.24) * h; cocked.addScaledVector(fwd, -0.1 * h); cocked.addScaledVector(lat, 0.05 * h); }
      else if (arc === 'side') { cocked.y += 0.08 * h; cocked.addScaledVector(lat, 0.2 * h); cocked.addScaledVector(fwd, -0.02 * h); }
      else if (arc === 'body') { cocked.y += 0.06 * h; cocked.addScaledVector(fwd, -0.1 * h); }
      else { cocked.y += 0.12 * h; cocked.addScaledVector(fwd, -0.08 * h); }
      if (s.t < wind) target = guard.clone().lerp(cocked, M.smooth(s.t / wind));
      else if (s.t < wind + down) {
        const k = M.easeIn((s.t - wind) / down);
        target = cocked.clone().lerp(tgt, k);
        // hammerfists and hooks travel on a curve, not a straight line
        if (arc === 'hammer' || arc === 'heavy') target.addScaledVector(fwd, Math.sin(k * Math.PI) * 0.08 * h);
        if (arc === 'side') target.addScaledVector(lat, Math.sin(k * Math.PI) * 0.06 * h);
      } else target = tgt.clone().lerp(guard, M.smooth((s.t - wind - down) / back));
      if (arc === 'elbow' || arc === 'hammer' || arc === 'heavy') pole.set(sx * 1, 0.4, -0.2).applyQuaternion(root.quaternion);
      else if (arc === 'side') pole.set(sx * 1, -0.2, 0.1).applyQuaternion(root.quaternion);
    }
    solveArm(this, side, target, pole);
  }
  root.updateMatrixWorld(true);
  const s = g.strike;
  if (s) {
    s.t += dt;
    if (!s.hit && s.t >= s.wind + s.down * 0.85) { s.hit = true; this._gnpImpact(s); }
    if (s.t >= s.wind + s.down + s.back) g.strike = null;
  }

  // leaving voluntarily
  if (g.exitRequest && !g.strike) this.endGnp(false);
};

function solveArm(f, side, targetW, poleW) {
  const B = f.body.B, d = f.body.dims;
  UFC.solveTwoBone(B['ua' + side], B['fa' + side], targetW, poleW, d.upper, d.fore, true);
  B['hand' + side].quaternion.identity();
}

P._gnpImpact = function (s) {
  const o = this.opponent, game = this.game, g = this.gnp;
  const covering = o._gnpFlash ? 0.1 : (o.gnpCover || 0.7);   // AI/players cover up by default
  const slipped = Math.random() < 0.12 + covering * 0.12;
  const toBody = s.mv.target === 'body';
  const point = toBody ? o.body.B.chest.getWorldPosition(new V3()) : o.headCenter(new V3());
  const dir = new V3().subVectors(point, this.pos).setY(-0.6).normalize();
  if (slipped) { game.audio.impact(3, 'head', true); o._gnpReact = { kind: Math.random() < 0.5 ? 'turn' : 'shrimp', t: 0, dur: 0.45, side: Math.random() < 0.5 ? 1 : -1 }; return; }
  let power = s.mv.dmg * this.pow * (0.62 + 0.38 * M.sat(this.stamina / 50)) * M.rand(0.85, 1.15);
  const absorbed = covering * (s.heavy ? 0.35 : 0.5);
  power *= 1 - absorbed;
  const fake = { def: { name: [s.mv.name, s.mv.name], kind: 'punch', path: 'straight', zone: 'head' }, lead: false, sig: true, limb: s.limb };
  const stunBefore = o.stun;
  if (toBody) {
    o.hurtZone('bodyHp', power * 0.5 / (o.hpFactor || 1));
    o.stamina = Math.max(0, o.stamina - power * 0.8);
    this.stats.bodyL = (this.stats.bodyL || 0) + 1;
  } else {
    o.hurtZone('head', power * 0.2 / (o.hpFactor || 1));
    o.stun += power * 0.9 * (1 + (1 - o.head / 100)) / (o.hpFactor || 1);
    this.stats.head++;
  }
  o.sinceHit = 0;
  this.stats.landed++; this.stats.sigLanded++; this.stats.dmg += power;
  this.roundStats.landed++; this.roundStats.sig++; this.roundStats.dmg += power;
  // visible reaction on the covering fighter, never the same twice in a row
  if (!toBody) o.body.B.neck.quaternion.multiply(_q.setFromEuler(new E(-0.25 * Math.min(1, power / 8), (Math.random() - 0.5) * 0.4, 0)));
  const pool = toBody ? ['curl', 'curl', 'turn'] : power > 10 ? ['snap', 'turn', 'shrimp'] : ['snap', 'turn', 'shrimp', 'rise'];
  let react = M.pick(pool);
  if (react === (o._gnpReact && o._gnpReact.kind)) react = M.pick(pool);
  if (react === 'rise' && o.stamina < 35) react = 'turn';
  o._gnpReact = { kind: react, t: 0, dur: react === 'rise' ? 0.7 : 0.45, side: s.limb === 'L' ? -1 : 1, power };
  game.audio.impact(power, toBody ? 'body' : 'head', false);
  game.fx.sweat(point, dir, power * 0.6);
  if (!toBody && o.head < 70 && Math.random() < 0.4) game.fx.blood(point, dir, power * 0.8);
  game.cam.shake(Math.min(s.mv.arc === 'heavy' ? 0.9 : 0.55, power * (s.mv.arc === 'heavy' ? 0.07 : 0.045)));
  game.hitstop = Math.max(game.hitstop, s.mv.arc === 'heavy' ? 0.11 : 0.05);
  game.ui.impactFlash(power, toBody ? 'body' : 'head');
  game.arena.excite(0.08);
  if (!toBody && game.onFaceDamage) game.onFaceDamage(o, power, s.heavy);
  g.landed++;
  // (no referee) recent shots only feed the knockdown flash below
  const now = game.simTime || 0;
  g.recentT.push(now); g.recentT = g.recentT.filter((t) => now - t < 4);
  // a heavy shot on the ground can drop him for a moment: arms fall, he goes limp
  const nowT = game.simTime || 0;
  if (!toBody && !o._gnpFlash && nowT - (o._lastFlashT || -99) > 4 &&
      power > 8.5 - (1 - o.head / 100) * 4 - (s.mv.arc === 'heavy' ? 1.5 : 0)) {
    o._gnpFlash = { t: 0, hold: 0.9 };
    o._lastFlashT = nowT;
    o.knockdowns++; o.stun += 20;
    this.stats.kd++; this.roundStats.kd++;
    if (game.roundKD) game.roundKD[this === game.p1 ? 0 : 1]++;
    game.ui.callout('НОКДАУН В ПАРТЕРЕ!', o.cfg.name, 'kd', 1.3);
    if (game.comm) game.comm.say('knockdown', { force: true });
    game.cam.cinematic(o, 1.3, { lookY: 0.2, height: 0.55, fov: 34, flip: this === game.p2 });
    game.arena.excite(0.5); game.audio.cheer(0.8);
  }
  if (o.noDefT > 0.7) o.lateHits++;
  if (o.head <= 0) game.onGnpStoppage(this, o);   // otherwise it is the referee's call
  // the downed fighter keeps getting time added while being hit
  o.getupAt = Math.max(o.getupAt, o.downTimer + 0.8);
  void stunBefore; void fake;
};

// Defender side: covering and trying to kick the attacker off.
P._gnpDefend = function (dt) {
  const att = this.gnpBy;
  if (!att || att.state !== 'gnp') { this.gnpBy = null; return; }
  if (!att.gnp || att.gnp.t < 1.4) return;
  let effort = 0;
  if (this.index === 0 && this.game.input) {
    const inp = this.game.input;
    this.gnpCover = inp.state.r2 || inp.state.l2 ? 0.95 : 0.55;
    if (inp.pressed('square') || inp.pressed('triangle') || inp.pressed('cross') || inp.pressed('circle') || inp.pressed('gnp')) effort = 0.075;
  } else {
    this.gnpCover = 0.75;
    effort = dt * (0.12 + this.stamina / 700 + (this.head / 100) * 0.12) * (this.game.ai ? 0.8 + this.game.ai.P.block * 0.5 : 1);
  }
  this.gnpEscape = (this.gnpEscape || 0) + effort * (0.6 + this.stamina / 150);
  this.gnpEscape = Math.max(0, this.gnpEscape - dt * 0.05);
  if (this.gnpEscape >= 1) {
    this.gnpEscape = 0;
    att.endGnp(true);
    this.gnpBy = null;
    this.stamina = Math.max(0, this.stamina - 8);
    this.getupAt = Math.min(this.getupAt, this.downTimer + 0.3);
    this.game.ui.hitMarker('ОТБИЛСЯ НОГАМИ', this === this.game.p1 ? 0 : 1);
  }
};
})();

