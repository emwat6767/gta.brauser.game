//# sourceURL=ufc/actor.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;

// ===========================================================================
// Cinematic control of fighters (weigh-in, walkout, celebrations) and the
// referee. A fighter in state 'cine' walks with the normal foot/IK gait but
// relaxed arms, and can blend into full-body poses or upper-body overlays.
// Pose values: bone Euler (order YXZ) in radians, hips height in body heights.
// ===========================================================================
const P3 = (x = 0, y = 0, z = 0) => [x, y, z];
const legsStand = { thL: P3(0, 0, 0.05), snL: P3(0.04), thR: P3(0, 0, -0.05), snR: P3(0.04), ftL: P3(), ftR: P3() };
const CINE_POSES = {
  stand: Object.assign({ hipsY: 0.545, spine: P3(0.02), chest: P3(0.02), neck: P3(-0.02), head: P3(),
    uaL: P3(0.06, 0, 0.12), faL: P3(-0.2), uaR: P3(0.06, 0, -0.12), faR: P3(-0.2) }, legsStand),
  armsUp: Object.assign({ hipsY: 0.545, spine: P3(-0.12), chest: P3(-0.1), neck: P3(-0.3), head: P3(-0.15),
    uaL: P3(-2.85, 0, 0.42), faL: P3(-0.25), uaR: P3(-2.85, 0, -0.42), faR: P3(-0.25) }, legsStand, { thL: P3(0, 0, 0.1), thR: P3(0, 0, -0.1) }),
  oneArmUpL: Object.assign({ hipsY: 0.545, spine: P3(-0.05), chest: P3(-0.04), neck: P3(-0.12), head: P3(),
    uaL: P3(-3.0, 0, 0.12), faL: P3(-0.08), uaR: P3(0.1, 0, -0.14), faR: P3(-0.3) }, legsStand),
  oneArmUpR: Object.assign({ hipsY: 0.545, spine: P3(-0.05), chest: P3(-0.04), neck: P3(-0.12), head: P3(),
    uaR: P3(-3.0, 0, -0.12), faR: P3(-0.08), uaL: P3(0.1, 0, 0.14), faL: P3(-0.3) }, legsStand),
  flex: Object.assign({ hipsY: 0.545, spine: P3(-0.05), chest: P3(-0.1), neck: P3(-0.05), head: P3(),
    uaL: P3(-0.15, 0, 1.45), faL: P3(0, 0, 1.75), uaR: P3(-0.15, 0, -1.45), faR: P3(0, 0, -1.75) }, legsStand, { thL: P3(0, 0, 0.12), thR: P3(0, 0, -0.12) }),
  flexFront: Object.assign({ hipsY: 0.53, spine: P3(0.18), chest: P3(0.12), neck: P3(-0.2), head: P3(),
    uaL: P3(-0.45, 0, 0.45), faL: P3(-1.2, 0, 0), uaR: P3(-0.45, 0, -0.45), faR: P3(-1.2, 0, 0) }, legsStand, { thL: P3(-0.1, 0, 0.14), snL: P3(0.2), thR: P3(-0.1, 0, -0.14), snR: P3(0.2) }),
  point: Object.assign({ hipsY: 0.545, spine: P3(0.02), chest: P3(0), neck: P3(-0.05), head: P3(),
    uaR: P3(-1.55, 0.25, -0.1), faR: P3(-0.05), uaL: P3(0.05, 0, 0.14), faL: P3(-0.4) }, legsStand),
  handsHead: Object.assign({ hipsY: 0.545, spine: P3(-0.08), chest: P3(-0.08), neck: P3(-0.35), head: P3(-0.1),
    uaL: P3(-2.35, 0, 1.0), faL: P3(-2.45), uaR: P3(-2.35, 0, -1.0), faR: P3(-2.45) }, legsStand),
  kneelUp: { hipsY: 0.3, hips: P3(0.02), spine: P3(-0.12), chest: P3(-0.1), neck: P3(-0.35), head: P3(-0.2),
    uaL: P3(-2.8, 0, 0.45), faL: P3(-0.3), uaR: P3(-2.8, 0, -0.45), faR: P3(-0.3),
    thL: P3(-0.05, 0, 0.08), snL: P3(1.62), thR: P3(-0.05, 0, -0.08), snR: P3(1.62), ftL: P3(0.95), ftR: P3(0.95) },
  kneelDown: { hipsY: 0.28, hips: P3(0.1), spine: P3(0.35), chest: P3(0.3), neck: P3(0.35), head: P3(0.1),
    uaL: P3(-1.6, 0, 0.35), faL: P3(-2.1), uaR: P3(-1.6, 0, -0.35), faR: P3(-2.1),
    thL: P3(-0.05, 0, 0.08), snL: P3(1.62), thR: P3(-0.05, 0, -0.08), snR: P3(1.62), ftL: P3(0.95), ftR: P3(0.95) },
  dejected: Object.assign({ hipsY: 0.545, spine: P3(0.08), chest: P3(0.06), neck: P3(0.45), head: P3(0.15),
    uaL: P3(0.15, 0, 0.45), faL: P3(-0.55, 0, -1.0), uaR: P3(0.15, 0, -0.45), faR: P3(-0.55, 0, 1.0) }, legsStand),
  sitDown: { hipsY: 0.09, hips: P3(-0.2), spine: P3(0.4), chest: P3(0.3), neck: P3(0.45), head: P3(0.2),
    uaL: P3(-0.7, 0, 0.25), faL: P3(-0.9), uaR: P3(-0.7, 0, -0.25), faR: P3(-0.9),
    thL: P3(-1.3, 0, 0.25), snL: P3(1.9), thR: P3(-1.3, 0, -0.25), snR: P3(1.9), ftL: P3(0.3), ftR: P3(0.3) },
  cagePunch: Object.assign({ hipsY: 0.52, spine: P3(0.1), chest: P3(0.05), neck: P3(-0.1), head: P3(),
    uaL: P3(-1.55, 0, 0.1), faL: P3(-0.15), uaR: P3(-1.2, 0, -0.35), faR: P3(-1.6) }, legsStand, { thL: P3(-0.3, 0, 0.05), snL: P3(0.35), thR: P3(0.2, 0, -0.05), snR: P3(0.25) }),
  climb: { hipsY: 0.5, spine: P3(0.05), chest: P3(0), neck: P3(-0.3), head: P3(),
    uaL: P3(-2.6, 0, 0.3), faL: P3(-0.6), uaR: P3(-2.3, 0, -0.3), faR: P3(-0.9),
    thL: P3(-1.5, 0, 0.1), snL: P3(1.9), thR: P3(0.1, 0, -0.05), snR: P3(0.3), ftL: P3(0.3), ftR: P3() },
  beltUp: Object.assign({ hipsY: 0.545, spine: P3(-0.15), chest: P3(-0.12), neck: P3(-0.35), head: P3(-0.2),
    uaL: P3(-2.75, 0, 0.12), faL: P3(-0.3), uaR: P3(-2.75, 0, -0.12), faR: P3(-0.3) }, legsStand, { thL: P3(0, 0, 0.1), thR: P3(0, 0, -0.1) }),
  sipCup: Object.assign({ hipsY: 0.545, spine: P3(-0.02), chest: P3(-0.02), neck: P3(0.12), head: P3(0.1),
    uaR: P3(-1.35, 0.2, -0.22), faR: P3(-2.5, 0, 0.25), uaL: P3(0.1, 0, 0.16), faL: P3(-0.35) }, legsStand),
  touchGloves: Object.assign({ hipsY: 0.53, spine: P3(0.12), chest: P3(0.08), neck: P3(-0.05), head: P3(),
    uaL: P3(-1.45, 0, 0.05), faL: P3(-0.35), uaR: P3(-1.45, 0, -0.05), faR: P3(-0.35) }, legsStand, { thL: P3(-0.25, 0, 0.05), snL: P3(0.3), thR: P3(0.15, 0, -0.05), snR: P3(0.2) }),
  refStop: Object.assign({ hipsY: 0.52, spine: P3(0.2), chest: P3(0.1), neck: P3(-0.1), head: P3(),
    uaL: P3(-1.7, 0, 0.6), faL: P3(-0.2), uaR: P3(-1.7, 0, -0.6), faR: P3(-0.2) }, legsStand, { thL: P3(-0.2, 0, 0.12), snL: P3(0.3), thR: P3(-0.2, 0, -0.12), snR: P3(0.3) }),
  refWaveA: Object.assign({ hipsY: 0.53, spine: P3(0.08), chest: P3(0.04), neck: P3(), head: P3(),
    uaL: P3(-2.4, 0, -0.35), faL: P3(-0.2), uaR: P3(-2.4, 0, 0.35), faR: P3(-0.2) }, legsStand, { thL: P3(0, 0, 0.12), thR: P3(0, 0, -0.12) }),
  refWaveB: Object.assign({ hipsY: 0.53, spine: P3(0.08), chest: P3(0.04), neck: P3(), head: P3(),
    uaL: P3(-2.4, 0, 1.1), faL: P3(-0.2), uaR: P3(-2.4, 0, -1.1), faR: P3(-0.2) }, legsStand, { thL: P3(0, 0, 0.12), thR: P3(0, 0, -0.12) }),
};
Object.assign(UFC.POSES, CINE_POSES);
for (const k of Object.keys(CINE_POSES)) UFC.compilePose(k);
const compiled = {};
function getPose(name) { return compiled[name] || (compiled[name] = UFC.compilePose(name)); }
UFC.getPose = getPose;

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'snL', 'thR', 'snR', 'ftL', 'ftR'];
const UPPER = ['spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'uaR', 'faR'];
const _q = new Q(), _v = new V3(), _v2 = new V3();

const F = UFC.Fighter.prototype;

// ---------------------------------------------------------------- fighter cine API
F.startCine = function (opts = {}) {
  if (this.strike) this.cancelStrike();
  if (this.ragdoll) this.ragdoll.stop();
  this.gnp = null; this.gnpBy = null; this.downPhase = null;
  const wasDown = this.state === 'down' || this.state === 'ko';
  this.state = 'cine';
  this.block = 'none';
  this.intent.mx = this.intent.mz = 0; this.intent.strike = null;
  this.cine = { walk: null, pose: null, from: null, poseT: 0, blend: 0.4, overlay: null, overlayW: 0, lift: 0, liftT: 0, liftFrom: 0, liftDur: 0, casual: opts.casual !== false, bounce: 0, faceYaw: null, t: 0 };
  if ((wasDown || opts.snap) && !opts.keepPose) this.place(this.pos.x, this.pos.z, this.yaw);
};

F.endCine = function (state = 'fight') {
  this.cine = null;
  this.state = state;
  this.body.root.position.y = 0;
  this.place(this.pos.x, this.pos.z, this.yaw);
};

F.setVisible = function (v) { this.body.root.visible = v; };

// Walkouts happen outside the cage, so cine movement can leave the octagon.
F.cineFree = function (v) { if (this.cine) this.cine.free = !!v; };

F.cineWalkTo = function (x, z, opts = {}) {
  const c = this.cine; if (!c) return;
  c.pose = null; c.from = null;
  c.walk = { x, z, speed: opts.speed || 1.15, yaw: opts.yaw, run: !!opts.run, onArrive: opts.onArrive || null };
};

// Blend into a full-body pose (hold until changed). name=null returns to standing/walking.
F.cinePose = function (name, blend = 0.45) {
  const c = this.cine; if (!c) return;
  c.walk = null;
  if (!name) { c.pose = null; c.from = null; return; }
  c.from = this._snapshot(this.yaw);
  c.pose = getPose(name); c.poseName = name; c.poseT = 0; c.blend = Math.max(0.01, blend);
};

F.cineOverlay = function (name, weight = 1) {
  const c = this.cine; if (!c) return;
  c.overlay = name ? getPose(name) : null; c.overlayTarget = name ? weight : 0;
};

F.cineLift = function (y, dur) { const c = this.cine; if (!c) return; c.liftFrom = c.lift; c.liftTo = y; c.liftT = 0; c.liftDur = Math.max(0.01, dur); };
F.cineFace = function (yaw) { if (this.cine) this.cine.faceYaw = yaw; };
F.cineFaceTo = function (x, z) { if (this.cine) this.cine.faceYaw = Math.atan2(x - this.pos.x, z - this.pos.z); };

F.updateCine = function (dt) {
  const c = this.cine;
  if (!c) return;
  c.t += dt; this.time += dt;
  this.updateFace(dt);
  if (this.updateBruises) this.updateBruises(dt);
  if (c.liftDur > 0) { c.liftT += dt; c.lift = M.lerp(c.liftFrom, c.liftTo, M.smooth(c.liftT / c.liftDur)); if (c.liftT >= c.liftDur) c.liftDur = 0; }

  if (c.pose) {
    // full-body pose: root stays, skeleton blends from the captured snapshot
    c.poseT += dt;
    this.vel.set(0, 0, 0);
    if (c.faceYaw != null) this.yaw += M.wrap(c.faceYaw - this.yaw) * Math.min(1, 5 * dt);
    const root = this.body.root;
    root.position.set(this.pos.x, c.lift, this.pos.z);
    root.rotation.set(0, this.yaw, 0);
    const w = M.smooth(c.poseT / c.blend);
    this._writePose(null, c.pose, w, c.from);
    // breathing / small bounce so held poses stay alive
    const B = this.body.B;
    const br = Math.sin(this.time * 2.4) * 0.012 * w;
    B.chest.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -br));
    if (c.bounce) B.hips.position.y += Math.abs(Math.sin(this.time * 7)) * c.bounce * this.h * w;
    root.updateMatrixWorld(true);
    for (const side of ['L', 'R']) { this.prevGloveW[side].copy(this.gloveW[side]); B['hand' + side].localToWorld(this.gloveW[side].set(0, -0.042 * this.h, 0.004 * this.h)); }
    return;
  }

  // walking / standing with the live gait
  let wx = 0, wz = 0;
  if (c.walk) {
    const dx = c.walk.x - this.pos.x, dz = c.walk.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const sp = c.walk.speed * M.sat(d / 0.35);
    if (d > 0.04) { wx = dx / d * sp; wz = dz / d * sp; }
    const moveYaw = Math.atan2(dx, dz);
    const wantYaw = d > 0.3 ? moveYaw : (c.walk.yaw != null ? c.walk.yaw : this.yaw);
    this.yaw += M.wrap(wantYaw - this.yaw) * Math.min(1, 7 * dt);
    if (d < 0.05) {
      const cb = c.walk.onArrive; const yawEnd = c.walk.yaw;
      c.walk = null;
      if (yawEnd != null) c.faceYaw = yawEnd;
      if (cb) cb();
    }
  } else if (c.faceYaw != null) {
    this.yaw += M.wrap(c.faceYaw - this.yaw) * Math.min(1, 5 * dt);
  }
  this.vel.x = M.damp(this.vel.x, wx, 8, dt);
  this.vel.z = M.damp(this.vel.z, wz, 8, dt);
  this.pos.addScaledVector(this.vel, dt);
  if (!c.free) UFC.clampToOctagon(this.pos, 0.35);
  this._pose(dt);
  const root = this.body.root;
  if (c.lift) { root.position.y = c.lift; root.updateMatrixWorld(true); }
  // upper-body overlay (arms up while running, etc.)
  c.overlayW = M.damp(c.overlayW, c.overlayTarget || 0, 6, dt);
  if (c.overlay && c.overlayW > 0.01) {
    const B = this.body.B;
    for (const b of UPPER) B[b].quaternion.slerp(c.overlay.q[b], c.overlayW);
    root.updateMatrixWorld(true);
  }
};

// Relaxed stance used while walking in presentations (hooks read this).
F.isCasual = function () { return this.state === 'cine' && this.cine && this.cine.casual; };

// ---------------------------------------------------------------- referee
// Built from the same body system with a referee outfit; walks with the cine
// gait, holds positions away from the action and performs the ceremonies.
class Referee {
  constructor(game) {
    this.game = game;
    const cfg = {
      id: 'referee', name: 'Рефери', short: 'Рефери', nick: '', height: 1.8, weight: 84, reach: 1.82, build: 0.5, stance: 'orthodox', style: 'boxer',
      stats: { power: 50, speed: 50, chin: 50, cardio: 50, defense: 50, boxing: 50, kicks: 50, wrestling: 50, bjj: 50 },
      look: { skin: 0xd9b08c, hair: 0x2a2520, hairStyle: 'short', hairLen: 0.3, beard: 'short', outfit: 'referee', face: { shape: 0.6, jaw: 0.6, nose: 0.6, eyes: 0.4, brows: 0.6, cheeks: 0.5 } },
    };
    this.f = new UFC.Fighter(game, cfg, 2);
    this.f.opponent = null;
    this.f.startCine({ casual: true });
    this.f.place(0, -2.6, 0);
    this.f.startCine({ casual: true });
    this.mode = 'idle';
    this.t = 0;
    this.visible = true;
  }

  get pos() { return this.f.pos; }

  setVisible(v) { this.visible = v; this.f.body.root.visible = v; }

  place(x, z, yaw) { this.f.place(x, z, yaw); this.f.startCine({ casual: true }); }

  // During a fight: hover at a safe distance from the action, on the far side from the camera.
  followFight(dt, a, b, camPos) {
    if (!this.visible) return;
    const f = this.f;
    this.t += dt;
    if (!f.cine) f.startCine({ casual: true });
    if (f.cine.pose && this.mode === 'follow') f.cinePose(null);
    this.mode = 'follow';
    const mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2;
    let ax = b.pos.x - a.pos.x, az = b.pos.z - a.pos.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    let px = -az, pz = ax;
    // away from the camera
    if ((camPos.x - mx) * px + (camPos.z - mz) * pz > 0) { px = -px; pz = -pz; }
    const drift = Math.sin(this.t * 0.35) * 0.9;
    const tx = mx + px * 2.4 + ax * drift, tz = mz + pz * 2.4 + az * drift;
    const target = new V3(tx, 0, tz); UFC.clampToOctagon(target, 0.6);
    const d = Math.hypot(target.x - f.pos.x, target.z - f.pos.z);
    if (!f.cine.walk || Math.hypot(f.cine.walk.x - target.x, f.cine.walk.z - target.z) > 0.5) {
      if (d > 0.45) f.cineWalkTo(target.x, target.z, { speed: d > 1.5 ? 2.0 : 1.2 });
    }
    // always watch the fighters
    const lookYaw = Math.atan2(mx - f.pos.x, mz - f.pos.z);
    if (!f.cine.walk || d < 1) f.cineFace(lookYaw);
    f.updateCine(dt);
  }

  update(dt) { if (this.visible) this.f.updateCine(dt); }

  // Hold the winner's raised wrist with the nearest hand (after the pose is written).
  holdWrist(winner, side, weight = 1) {
    const f = this.f, B = f.body.B, d = f.body.dims;
    const target = winner.body.B['hand' + side].localToWorld(_v.set(0, -0.02 * winner.h, 0));
    const toRef = _v2.subVectors(target, f.pos);
    const localX = toRef.x * Math.cos(f.yaw) - toRef.z * Math.sin(f.yaw);
    const hs = localX > 0 ? 'L' : 'R';
    const sx = hs === 'L' ? 1 : -1;
    const pole = new V3(sx * 0.6, -0.4, -1).applyAxisAngle(new V3(0, 1, 0), f.yaw);
    if (weight >= 0.99) UFC.solveTwoBone(B['ua' + hs], B['fa' + hs], target, pole, d.upper, d.fore);
    f.body.root.updateMatrixWorld(true);
    return hs;
  }

  dispose() { this.game._removeFighter(this.f); }
}
UFC.Referee = Referee;

// Cornerman: same body system in team kit, walks the fighter in and waits
// by the fence during the introductions.
class Cornerman extends Referee {
  constructor(game, index) {
    super(game);
    this.game._removeFighter(this.f);
    const kit = index ? { shirt: 0x14243f, pants: 0x101318 } : { shirt: 0x3a1114, pants: 0x101318 };
    const cfg = {
      id: 'corner' + index, name: 'Секундант', short: 'Секундант', nick: '', height: 1.76 + index * 0.04, weight: 80, reach: 1.78, build: 0.45, stance: 'orthodox', style: 'boxer',
      stats: { power: 50, speed: 50, chin: 50, cardio: 50, defense: 50, boxing: 50, kicks: 50, wrestling: 50, bjj: 50 },
      look: Object.assign({ skin: index ? 0xc99a74 : 0xe2b594, hair: 0x1a120c, hairStyle: index ? 'buzz' : 'short', beard: index ? 'full' : 'stubble', outfit: 'referee' }, kit),
    };
    this.f = new UFC.Fighter(game, cfg, 3 + index);
    this.f.opponent = null;
    this.f.place(0, -3.2, 0);
    this.f.startCine({ casual: true });
  }
}
UFC.Cornerman = Cornerman;
})();

