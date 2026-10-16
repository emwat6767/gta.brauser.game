//# sourceURL=ufc/fighter.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3, Q = THREE.Quaternion;

// ---------------------------------------------------------------------------
// Strike catalogue. Durations [windup, extension, hold, retract] in seconds
// for an average-speed fighter; damage is for the rear/power side.
// ---------------------------------------------------------------------------
const MOVES = {
  straight: { kind: 'punch', zone: 'head', path: 'straight', dmg: 9.5, leadMul: 0.55, stam: 4.5, leadStam: 0.55, t: [0.06, 0.11, 0.04, 0.16], leadT: 0.78, twist: 0.8, leadTwist: 0.25, lunge: 0.14, crouch: 0, name: ['Джеб', 'Кросс'] },
  hook: { kind: 'punch', zone: 'head', path: 'hook', dmg: 11, leadMul: 0.85, stam: 6, leadStam: 0.85, t: [0.11, 0.14, 0.05, 0.21], leadT: 0.92, twist: 1.1, leadTwist: 0.95, lunge: 0.11, crouch: 0.03, name: ['Левый хук', 'Правый хук'] },
  uppercut: { kind: 'punch', zone: 'head', path: 'upper', dmg: 10.5, leadMul: 0.82, stam: 6, leadStam: 0.85, t: [0.12, 0.14, 0.05, 0.21], leadT: 0.92, twist: 0.9, leadTwist: 0.7, lunge: 0.05, crouch: 0.085, name: ['Апперкот', 'Апперкот'] },
  body: { kind: 'punch', zone: 'body', path: 'body', dmg: 8.5, leadMul: 0.85, stam: 5, leadStam: 0.85, t: [0.09, 0.13, 0.045, 0.19], leadT: 0.92, twist: 0.8, leadTwist: 0.7, lunge: 0.08, crouch: 0.075, name: ['Хук в корпус', 'Удар в корпус'] },
  lowKick: { kind: 'kick', zone: 'legs', dmg: 8, leadMul: 0.7, stam: 7.5, leadStam: 0.75, t: [0.11, 0.15, 0.05, 0.25], leadT: 0.85, twist: 0.9, leadTwist: 0.5, lunge: 0.09, height: 0.3, name: ['Лоу-кик', 'Лоу-кик'] },
  bodyKick: { kind: 'kick', zone: 'body', dmg: 13, leadMul: 0.8, stam: 10.5, leadStam: 0.8, t: [0.12, 0.15, 0.05, 0.26], leadT: 0.85, twist: 1.15, leadTwist: 0.7, lunge: 0.15, height: 0.6, name: ['Удар в корпус ногой', 'Удар в корпус ногой'] },
  headKick: { kind: 'kick', zone: 'head', dmg: 20, leadMul: 0.85, stam: 13.5, leadStam: 0.88, t: [0.13, 0.16, 0.05, 0.27], leadT: 0.88, twist: 1.35, leadTwist: 0.9, lunge: 0.13, height: 0.93, name: ['Хай-кик', 'Хай-кик'] },
  spinKick: { kind: 'kick', zone: 'body', dmg: 18, leadMul: 1, stam: 14, leadStam: 14, t: [0.3, 0.2, 0.06, 0.34], leadT: 1, twist: 0, leadTwist: 0, lunge: 0, height: 0.6, spin: true, name: ['Вертушка в печень', 'Вертушка в печень'] },
  spinKickHead: { kind: 'kick', zone: 'head', dmg: 22, leadMul: 1, stam: 15, leadStam: 15, t: [0.32, 0.2, 0.06, 0.36], leadT: 1, twist: 0, leadTwist: 0, lunge: 0, height: 0.93, spin: true, name: ['Вертушка в голову', 'Вертушка в голову'] },
  layback: { kind: 'punch', zone: 'head', path: 'straight', dmg: 13, leadMul: 0.7, stam: 6, leadStam: 0.9, t: [0.07, 0.11, 0.05, 0.22], leadT: 0.9, twist: 0.9, leadTwist: 0.5, lunge: -0.03, crouch: 0, lean: true, name: ['Контра с отклоном', 'Контра с отклоном'] },
  elbow: { kind: 'punch', zone: 'head', path: 'hook', dmg: 12, leadMul: 0.9, stam: 5.5, leadStam: 0.9, t: [0.06, 0.1, 0.035, 0.14], leadT: 0.8, twist: 0.9, leadTwist: 0.8, lunge: 0.07, crouch: 0.03, elbow: true, name: ['Локоть', 'Локоть'] },
  frontKick: { kind: 'kick', zone: 'body', dmg: 12, leadMul: 0.85, stam: 9, leadStam: 0.85, t: [0.1, 0.13, 0.045, 0.2], leadT: 0.85, twist: 0.6, leadTwist: 0.4, lunge: 0.12, height: 0.6, karate: 'front', name: ['Мае-гери (прямой удар ногой)', 'Мае-гери'] },
  sideKick: { kind: 'kick', zone: 'body', dmg: 13, leadMul: 0.85, stam: 10, leadStam: 0.85, t: [0.12, 0.15, 0.05, 0.24], leadT: 0.85, twist: 0.9, leadTwist: 0.6, lunge: 0.14, height: 0.62, karate: 'side', name: ['Ёко-гери (боковой удар)', 'Ёко-гери'] },
};
UFC.MOVES = MOVES;

const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3();
const _q1 = new Q(), _q2 = new Q(), _q3 = new Q();
const _S = new V3(), _E = new V3(), _T = new V3(), _dir = new V3(), _perp = new V3();
const UP = new V3(0, 1, 0);

function solveTwoBone(upper, lower, targetW, poleW, a, b, soft) {
  upper.getWorldPosition(_S);
  _dir.subVectors(targetW, _S);
  let d = _dir.length();
  if (d < 1e-5) { _dir.set(0, -1, 0); d = 1e-5; } else _dir.divideScalar(d);
  if (soft) {
    // soft IK: approach full extension asymptotically instead of snapping
    const L = a + b, ds = L * 0.955;
    if (d > ds) d = ds + (L - ds) * (1 - Math.exp(-(d - ds) / (L - ds)));
  }
  d = M.clamp(d, Math.abs(a - b) + 0.01, a + b - 0.0015);
  const cosA = M.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _perp.copy(poleW).addScaledVector(_dir, -poleW.dot(_dir));
  if (_perp.lengthSq() < 1e-8) { _perp.set(0, 0, 1).addScaledVector(_dir, -_dir.z); }
  _perp.normalize();
  _E.copy(_S).addScaledVector(_dir, a * cosA).addScaledVector(_perp, a * sinA);
  _T.copy(_S).addScaledVector(_dir, d);
  UFC.aimDown(_v4.subVectors(_E, _S), _perp, _q1);
  UFC.aimDown(_v4.subVectors(_T, _E), _perp, _q2);
  upper.parent.getWorldQuaternion(_q3);
  upper.quaternion.copy(_q3.invert().multiply(_q1));
  lower.quaternion.copy(_q1.invert().multiply(_q2));
}

UFC.solveTwoBone = solveTwoBone;

function segDist(p, a, b) {
  _v1.subVectors(b, a); _v2.subVectors(p, a);
  const t = M.clamp(_v2.dot(_v1) / Math.max(1e-8, _v1.lengthSq()), 0, 1);
  _v3.copy(a).addScaledVector(_v1, t);
  return p.distanceTo(_v3);
}

function bezier(a, c, b, t, out) {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z);
}

class Fighter {
  constructor(game, cfg, index) {
    this.game = game;
    this.cfg = cfg;
    this.index = index;
    this.name = cfg.name;
    this.body = UFC.buildBody(cfg);
    game.scene.add(this.body.root);
    this.h = cfg.height;
    this.technique = cfg.technique || (cfg.id === 'mcgregor' ? 'mcgregor' : cfg.id === 'topuria' ? 'topuria' : null);   // 'mcgregor': southpaw, long range, straight left, timing
    this.s = (cfg.stance === 'southpaw' || this.technique === 'mcgregor') ? -1 : 1;
    this.leadSide = this.s === 1 ? 'L' : 'R';
    this.rearSide = this.s === 1 ? 'R' : 'L';
    this.mcgLvl = cfg.mcgMod ? (+cfg.mcgMod || 1) : 0;   // the McGregor mod: 1 or 2
    this.mcgMod = this.mcgLvl > 0;
    this.mcgClock = 0; this.mcgBurst = 0;   // every 10 s a camp burst lasts 4 s (level 2: 6 s)
    const st = this.mcgMod ? Object.assign({}, cfg.stats, { speed: Math.max(cfg.stats.speed || 0, 104), kicks: Math.max(cfg.stats.kicks == null ? 60 : cfg.stats.kicks, 108) }) : cfg.stats;
    this.pow = 0.72 + st.power / 100 * 0.56;
    this._spd = 0.8 + st.speed / 100 * 0.4;
    this.chin = Math.min(3, st.chin / 100);
    this.cardio = 0.65 + st.cardio / 100 * 0.7;
    this.defense = st.defense / 100;
    this.kickMul = 0.85 + (st.kicks == null ? 60 : st.kicks) / 100 * 0.3;
    this.handMul = 0.85 + (st.boxing == null ? 60 : st.boxing) / 100 * 0.3;
    this.heavy = (st.heavy || 0) / 100;
    this.hpMul = M.clamp((st.hp || 100) / 100, 0.5, 40);   // health: 100 is the normal body, 500 takes a gorilla's punch   // +x% on hooks, uppercuts, head kicks and committed blows

    this.pos = new V3(); this.vel = new V3(); this.yaw = 0;
    this.opponent = null;
    this.intent = { mx: 0, mz: 0, block: 'none', slipX: 0, slipZ: 0, strike: null };
    this.ragdoll = new UFC.Ragdoll(this);

    const k = (v, kk, dd) => new UFC.Spring(v, kk, dd);
    this.sp = {
      crouch: k(0, 110), hipYaw: k(-0.5 * this.s, 180), hipRoll: k(0, 120, 16),
      spPitch: k(0.12, 140, 15), spYaw: k(0, 150), spRoll: k(0, 130, 15),
      nkPitch: k(0, 170, 13), nkYaw: k(0, 170, 13), nkRoll: k(0, 170, 13),
      latShift: k(0, 120), fwdShift: k(0, 120),
    };
    this.hand = { L: new UFC.Spring3(320), R: new UFC.Spring3(320) };
    this.foot = { L: this._newFoot(), R: this._newFoot() };
    this.gloveW = { L: new V3(), R: new V3() };
    this.prevGloveW = { L: new V3(), R: new V3() };
    this.time = Math.random() * 10;
    this.resetForFight();
    if (this.technique === 'topuria' && UFC.NeonFx) { try { this.neon = new UFC.NeonFx(this); } catch (e) { this.neon = null; } }   // neon gloves, trails and an aura
  }

  setAngry(on) {
    if (this.angry === !!on) return;
    this.angry = !!on;
    if (this.neon) this.neon.setForm(!!on);
  }

  get spd() { return this._spd * (this.lowKey ? 1.15 : 1) * (this.opponent && this.opponent.lowKey ? 0.85 : 1); }
  set spd(v) { this._spd = v; }

  _newFoot() { return { planted: new V3(), from: new V3(), to: new V3(), t: 1, dur: 0.2, stepping: false, lift: 0 }; }

  resetForFight() {
    this.head = 100; this.bodyHp = 100; this.legs = 100; this.liver = 100;
    this.legDmg = { L: 0, R: 0 };   // 0 fresh .. 1 badly hurt, per leg
    this._bruiseKey = null;
    // highest value each zone can recover to (part of every hit is permanent)
    this.cap = { head: 100, bodyHp: 100, legs: 100, liver: 100 };
    this.dizzy = 0; this.faceHp = 100; this._dzFlags = {}; this._dzT = 0; this._quit = false; this._dead = false;
    this.headDmg = 0; this.headCap = 100; this.headShowT = 0; this.headSince = 9;
    this.brain = 0; this.lateHits = 0; this.noDefT = 0; this.takenLog = []; this.peakForce = 0; this._refWhy = null; this.bracedT = 0; this.hitZ = { head: {}, body: {}, legs: {}, liver: {} };
    this.taken = { head: 0, bodyHp: 0, legs: 0, liver: 0 }; this.peakDaze = 0;   // everything he absorbed, for the medical
    this.stun = 0; this.staminaCap = 100 * (this.npc ? this.npc.stamina : 1); this.stamina = this.staminaCap;
    // glycogen: the fuel that refills stamina; lactic acid: what builds up in the muscles. Only the player has them.
    { const F = UFC.fuel || { gly: 100, acid: 100 }; this.hasGly = !!this.isPlayer && !this.npc;
      this.glyMax = this.hasGly ? F.gly : 100; this.gly = this.glyMax; this.acidMax = this.hasGly ? F.acid : 100; this.acid = 0;
      this.glyCapMul = this.hasGly ? M.clamp(0.8 + 0.2 * this.glyMax / 100, 0.9, 1.4) : 1;
      this.staminaCap *= this.glyCapMul; this.stamina = this.staminaCap; }
    this.state = 'fight';
    this.strike = null; this.buffer = null; this.lastStrike = null; this.comboCount = 0; this.comboTimer = 0; this.spamHeat = 0;
    this.block = 'none'; this.blockTime = 0;
    this.hitstun = 0; this.stagger = 0; this.sinceHit = 10; this.slipCounter = 0;
    this.downTimer = 0; this.getupT = 0; this.knockdowns = 0;
    this.sweat = 0; this.flow = 0; this.flowCooldown = 0; this.commitCd = 0; this.commitLeft = 0; this.commitT = 0; this.lowKey = false; if (this.angry) this.setAngry(false); this.stumbleT = 0; this.comboLanded = 0; this.lastLandT = -9;
    this.stats = { thrown: 0, landed: 0, sigThrown: 0, sigLanded: 0, head: 0, bodyL: 0, legsL: 0, kd: 0, dmg: 0, blocked: 0, parries: 0 };
    this.roundStats = { dmg: 0, landed: 0, sig: 0, kd: 0 };
    if (this.ragdoll) this.ragdoll.stop();
    if (this.resetFace) this.resetFace();
  }

  // one number for the bar: head matters most, then body, legs, liver
  get chinF() { const c = this.chin; return c <= 1.7 ? 1.3 - 0.6 * c : 0.28 / (1 + (c - 1.7) * 1.5); }   // how much of a blow reaches the brain; keeps falling smoothly past 170
  get hpFactor() { return 1 + (this.hpMul - 1) * 0.55; }   // how much of every blow still gets through
  get hp() { return Math.max(0, 0.45 * this.head + 0.25 * this.bodyHp + 0.15 * this.legs + 0.15 * this.liver); }
  // below 20% of the glycogen tank he hits the wall; acid over 60% of what his muscles tolerate weighs on every punch and step
  get fuelFrac() { return this.hasGly ? M.sat(this.gly / (this.glyMax * 0.2)) : 1; }
  get acidLoad() { return this.hasGly ? M.sat((this.acid / this.acidMax - 0.6) / 0.6) : 0; }
  get fuelSpeed() { return (1 - 0.25 * this.acidLoad) * (0.85 + 0.15 * this.fuelFrac); }
  get fuelPower() { return (1 - 0.35 * this.acidLoad) * (0.7 + 0.3 * this.fuelFrac); }
  get rocked() { return this.stun > 55 && this.state === 'fight'; }
  // 0..1: how foggy his head is (many clean shots, low head health, a wrecked face)
  get daze() { const d = Math.max(this.dizzy || 0, M.sat(((this.headDmg || 0) - 55) / 45) * 0.7, (1 - this.head / 100) * 0.35, (1 - (this.faceHp == null ? 100 : this.faceHp) / 100) * 0.9); return d < 0 ? 0 : d > 1 ? 1 : d; }
  get busy() { return !!this.strike; }
  get staminaFrac() { return this.stamina / 100; }
  get staminaSpeed() { return this.fuelSpeed * (0.72 + 0.28 * M.sat(this.stamina / 40)) * (1 - (this.npc ? 0.10 : 0.22) * this.daze); }
  get staminaPower() { return this.fuelPower * (0.45 + 0.55 * Math.pow(M.sat(this.stamina / 50), 1.2)) * (1 - (this.npc ? 0.15 : 0.22) * this.daze); }
  canAct() { return this.state === 'fight' && this.hitstun <= 0 && this.stagger <= 0; }
  canDefend() { return (this.state === 'fight' || this.state === 'getup') && this.hitstun <= 0; }

  place(x, z, yaw) {
    this.pos.set(x, 0, z); this.vel.set(0, 0, 0); this.yaw = yaw;
    this.body.root.position.copy(this.pos); this.body.root.rotation.set(0, yaw, 0);
    this._restoreSkeleton();
    this.body.root.updateMatrixWorld(true);
    this.gait = null;
    for (const side of ['L', 'R']) {
      const f = this.foot[side];
      this._footRest(side, f.planted);
      f.stepping = false; f.t = 1; f.yaw = this._restYaw(side);
    }
    this._poseBase(0);
    this._guardTargets();
    this.hand.L.snap(this._guard.L); this.hand.R.snap(this._guard.R);
    Object.values(this.sp).forEach((s) => s.snap(s.target));
  }

  _restoreSkeleton() {
    const B = this.body.B, d = this.body.dims;
    B.hips.position.set(0, d.hipY, 0);
    for (const b of Object.values(B)) b.quaternion.identity();
  }

  // -------------------------------------------------------------------------
  // Main per-step update
  // -------------------------------------------------------------------------
  update(dt) {
    if (this.state === 'cine') { this.updateCine(dt); return; }
    this.updateFace(dt);
    this.updateBruises(dt);
    this.time += dt;
    this.sinceHit += dt;
    if (this.hitstun > 0) this.hitstun -= dt;
    if (this.stagger > 0) this.stagger -= dt;
    if (this.slipCounter > 0) this.slipCounter -= dt;
    if (this.comboTimer > 0) this.comboTimer -= dt; else this.comboCount = 0;
    // flurry fatigue cools off quickly once the hands stop
    this.spamHeat = Math.max(0, this.spamHeat - dt * (this.strike ? 0.5 : 1.7));
    if (this.flow > 0) this.flow = Math.max(0, this.flow - dt);
    if (this.flowCooldown > 0) this.flowCooldown -= dt;
    if (this.commitCd > 0) this.commitCd -= dt;
    if (this.commitT > 0) { this.commitT -= dt; if (this.commitT <= 0) this.commitLeft = 0; }
    if (this.stumbleT > 0) this.stumbleT -= dt;
    if (this.bracedT > 0) this.bracedT -= dt;
    this.headSince += dt; if (this.headShowT > 0) this.headShowT -= dt;
    { const floor = 100 - this.headCap; if (this.headSince > 0.9 && this.headDmg > floor) this.headDmg = Math.max(floor, this.headDmg - 12 * dt); }   // drains fast, but never below the floor
    if (this.liverDrop > 0) {
      this.liverDrop -= dt;
      if (this.liverDrop <= 0 && this.state === 'fight') this.game.onLiverCollapse(this);
    }

    if (this.state === 'grapple') return;
    if (this.state === 'gnp') { this._updateGnp(dt); return; }
    if (this.state === 'down' || this.state === 'ko' || this.downPhase === 'rising') {
      if (this.gnpBy) this._gnpDefend(dt);
      this._updateDown(dt);
      return;
    }

    // stun recovers once the fighter stops getting hit
    if (this.sinceHit > 0.5) this.stun = Math.max(0, this.stun - (this.stun > 55 ? UFC.TUNE.rockedDecay : UFC.TUNE.stunDecay) * this.cardio * (this.flow > 0 ? 1.3 : 1) * dt);

    const it = this.intent;
    if (this.state === 'fight') {
      const wantBlock = this.canDefend() && !this.strike ? it.block : 'none';
      if (wantBlock !== this.block) { this.block = wantBlock; this.blockTime = 0; } else this.blockTime += dt;
      if (it.strike) { this.buffer = { req: it.strike, t: 0.36 }; it.strike = null; }
      if (this.buffer) {
        this.buffer.t -= dt;
        if (this.buffer.t <= 0) this.buffer = null;
        else if (this._tryStartStrike(this.buffer.req)) this.buffer = null;
      }
    } else { it.strike = null; this.block = 'none'; }

    this._locomotion(dt);
    this._staminaTick(dt);
    if (this.strike) this._strikeTick(dt);
    this._pose(dt);
    if (this.state === 'getup') this._getupBlend(dt);
    this.sweat = Math.min(1, this.sweat + dt / 240);
    const skin = this.body.mats.skin;
    skin.clearcoat = this.sweat * 0.55;
    if (this.body.mats.armSkin !== skin) this.body.mats.armSkin.clearcoat = skin.clearcoat;
    for (const m of this.body.mats.extraSkins || []) m.clearcoat = skin.clearcoat;
    this.body.mats.headSkin.clearcoat = skin.clearcoat;
  }

  // Damage zones recover slowly when the fighter isn't being hit.
  recoverZones(dt) {
    if (this.sinceHit < 3) return;
    this.dizzy = Math.max(0, (this.dizzy || 0) - 0.3 * dt);
    const rate = { head: 0.22, bodyHp: 0.3, legs: 0.35, liver: 0.6 };
    for (const k in rate) {
      const cap = this.cap[k];
      if (this[k] < cap) this[k] = Math.min(cap, this[k] + rate[k] * this.cardio * dt);
    }
  }

  // Apply zone damage; 35% of it can never be recovered this fight.
  hurtZone(k, amount) {
    amount /= UFC.HP_MUL;   // 150 health
    if (this.taken) this.taken[k] = (this.taken[k] || 0) + amount;   // the medical still reads the full blow
    amount /= UFC.TOUGH;
    this[k] = Math.max(0, this[k] - amount);
    this.cap[k] = Math.max(this[k], this.cap[k] - amount * 0.35);
  }

  _staminaTick(dt) {
    this.recoverZones(dt);
    if (this.mcgMod) this._mcgTick(dt);
    const moving = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 2);
    let regen = (11 - 5 * moving) * this.cardio * (0.45 + 0.55 * this.bodyHp / 100) * (0.55 + 0.45 * this.liver / 100) * (this.npc ? this.npc.regen : 1);
    if (this.strike) regen = 0;
    if (this.block !== 'none') regen *= 0.55;
    if (this.rocked) regen *= 0.6;
    if (this.flow > 0) regen *= 1.5;
    if (UFC.mobile && this.isPlayer) regen *= UFC.MOBILE_TUNE.playerRegen;
    let capEff = this.staminaCap;
    if (this.hasGly) {
      const fr = this.fuelFrac;
      regen *= (0.85 + 0.15 * this.glyMax / 100) * (0.15 + 0.85 * fr);
      this.gly = Math.max(0, this.gly - dt * (0.05 + moving * 0.07) * (this.strike ? 1.8 : 1));   // burns even at rest, faster when he works
      if (!this.strike && moving < 0.4 && this.stamina > 55) this.gly = Math.min(this.glyMax, this.gly + 0.07 * dt);   // a little comes back while he breathes
      this.acid = Math.max(0, this.acid - dt * (0.8 + 0.8 * M.sat(this.stamina / 100)) * (this.block === 'none' ? 1 : 0.6) * (this.flow > 0 ? 3 : 1));
      if (this.flow > 0) this.gly = Math.min(this.glyMax, this.gly + 0.9 * dt);   // in the flow the fuel comes back
      if (this.angry) { this.gly = this.glyMax; this.acid = 0; }   // angry: the tank is full and the acid never rises
      capEff = this.staminaCap * (0.5 + 0.5 * fr);
    }
    this.stamina = Math.min(capEff, this.stamina + regen * dt);
  }

  // The McGregor mod: every 10 seconds the camp burst - strikes 30% faster, the left hand +50% (see _resolve)
  _mcgTick(dt) {
    if (this.game.phase !== 'fight') return;
    if (!this._mcgAnn) { this._mcgAnn = true; this.game.ui.hitMarker('МОД МАКГРЕГОРА · УР. ' + this.mcgLvl, this === this.game.p1 ? 0 : 1); }
    if (this.mcgBurst > 0) this.mcgBurst -= dt;
    this.mcgClock += dt;
    if (this.mcgClock >= 10) {
      this.mcgClock = 0;
      this.mcgBurst = this.mcgLvl >= 2 ? 4 : 3;
      this.game.ui.hitMarker('КЭМП МАКГРЕГОРА', this === this.game.p1 ? 0 : 1);
    }
  }

  _locomotion(dt) {
    const it = this.intent;
    const opp = this.opponent;
    let mx = this.state === 'fight' ? it.mx : 0, mz = this.state === 'fight' ? it.mz : 0;
    const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    const worstLeg = this.legDmg ? Math.max(this.legDmg.L, this.legDmg.R) : 0;
    let speed = 2.0 * this.spd * (0.62 + 0.38 * this.legs / 100) * (0.8 + 0.2 * this.staminaSpeed) * (this.npc ? this.npc.move : 1) * (1 - 0.55 * worstLeg);
    if (this.rocked) speed *= 0.55;
    if (this.strike) speed *= this.strike.def.kind === 'kick' ? 0.08 : 0.3;
    if (this.block !== 'none') speed *= 0.6;
    if (this.hitstun > 0 || this.stagger > 0) speed *= 0.3;
    if (this.state === 'getup') speed = 0;
    if (this.flow > 0) speed *= 1.5;
    if (this.stumbleT > 0) speed *= 0.25;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    // Pressing into an opponent you're already touching doesn't march in place.
    if (opp && mz > 0 && (opp.state === 'fight' || opp.state === 'getup')) {
      const gapD = Math.hypot(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
      const minD = 0.36 * (this.h + opp.h) / 1.8 + 0.05;
      if (gapD < minD + 0.04) mz *= M.sat((gapD - minD) / 0.04);
    }
    // fighting stance: fastest forward, a bit slower backing up, slowest sideways
    const mgT = this.technique === 'mcgregor';
    mz *= mz < 0 ? (mgT ? 0.96 : 0.82) : 1;   // he keeps his distance: backs up almost as fast as he advances
    mx *= mgT ? 0.88 : 0.72;                  // and slides off on angles
    let wx = (lx * mx + fx * mz) * speed, wz = (lz * mx + fz * mz) * speed;
    if (this.rocked) { wx += Math.sin(this.time * 2.3) * 0.35; wz += Math.cos(this.time * 1.7) * 0.35; }
    const accel = this.strike ? 5 : 13;
    this.vel.x = M.damp(this.vel.x, wx, accel, dt);
    this.vel.z = M.damp(this.vel.z, wz, accel, dt);
    this.pos.addScaledVector(this.vel, dt);
    UFC.clampToOctagon(this.pos, 0.42);

    if (opp) {
      let target = Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
      const dz = this.daze;
      if (dz > 0.2) target += Math.sin(this.time * 1.1 + this.index * 2.1) * dz * (this.npc ? 0.16 : 0.8);   // he barely sees where the opponent is
      const rate = (this.state === 'getup' ? 2 : this.strike ? 5 : 11) * (1 - (this.npc ? 0.1 : 0.45) * dz);
      const sk = this.strike;
      if (sk && sk.def.spin) {
        // spinning back kick: turn his back to the opponent, kick through, finish the turn
        const e = sk.phase === 'wind' ? M.smooth(sk.pt) * 0.85 : sk.phase === 'ext' ? 0.85 + 0.15 * sk.pt : sk.phase === 'hold' ? 1 : 1 + M.smooth(sk.pt);
        this.spinOff = this.s * Math.PI * e;
        this.yaw = target + this.spinOff;
      } else { this.spinOff = 0; this.yaw += M.wrap(target - this.yaw) * Math.min(1, rate * dt); }
    }
  }

  // -------------------------------------------------------------------------
  // Strikes
  // -------------------------------------------------------------------------
  _tryStartStrike(req) {
    if (!this.canAct()) return false;
    const cur = this.strike;
    if (cur) {
      const chainable = (cur.phase === 'ret' && cur.pt > (cur.def.kind === 'kick' ? 0.4 : cur.fast ? 0 : 0.1)) || cur.phase === 'hold';
      if (!chainable) return false;
      if (cur.def.kind === 'kick') this._endKickLeg(cur);
      this._finishStrikeHand(cur);
    }
    const def = MOVES[req.type];
    if (!def) return false;
    const lead = req.limb === this.leadSide;
    // Flurry fatigue: the first 3-4 strikes of a burst are free; a non-stop
    // flurry gets slower, weaker, sloppier and more expensive, and repeating
    // the exact same strike is easier to read.
    const heat = this.spamHeat;
    const spam = M.sat((heat - 3.2) / 4);
    const same = this.comboCount > 0 && this.lastStrike && this.lastStrike.type === req.type && this.lastStrike.limb === req.limb;
    const chainBonus = this.comboCount > 0 && this.lastStrike && this.lastStrike.limb !== req.limb && heat < 4 ? 0.82 : 1;
    const flowSpeed = (this.flow > 0 ? 1.5 : 1) * (this.angry ? 1.15 : 1);
    const cm = this.commitLeft > 0;   // a committed strike: everything behind it
    const qte = !!req.qte;
    if (cm) { this.commitLeft--; if (!this.commitLeft) this.commitT = 0; }
    const tpS = this.technique === 'topuria' ? (def.path === 'hook' ? 0.9 : def.path === 'straight' ? 0.94 : 1) : 1;
    const gassed = this.stamina < 20 ? 1 + (20 - this.stamina) / 20 * 0.4 : 1;   // arms like lead
    const speedScale = (lead ? def.leadT : 1) * chainBonus * (1 + spam * 0.6) * (same ? 1.1 : 1) * gassed * (req.fast ? 0.72 : 1) * tpS * (cm ? 1.25 : 1) * (this.mcgMod ? (this.mcgBurst > 0 ? 0.83 : 0.96) : 1) * (qte ? 0.8 : 1) * 0.92 / (this.spd * this.staminaSpeed * (this.rocked ? 0.8 : 1) * flowSpeed * (this.npc ? this.npc.speed : 1));
    const durs = def.t.map((x) => x * speedScale);
    const cost = def.stam * (lead ? def.leadStam : 1) / Math.sqrt(this.cardio) * (1 + spam * 0.9) * (this.flow > 0 ? 0.5 : 1) * 0.65;
    this.spamHeat = Math.min(10, this.spamHeat + (def.kind === 'kick' ? 1.5 : 1) * (same ? 1.25 : 1));
    this.stamina = Math.max(0, this.stamina - cost * (cm ? 1.8 : 1));
    if (this.hasGly) { const cheap = (def.spin ? 0.12 : 1) * (this.mcgMod ? 0.5 : 1); this.gly = Math.max(0, this.gly - cost * 0.15 * (cm ? 5 : 1) * cheap); this.acid += cost * 0.9 * (def.kind === 'kick' ? 1.3 : 1) * (cm ? 3 : 1) * cheap; }   // a committed punch burns glycogen five times faster and makes three times the acid
    if (this.isPlayer && this.stamina < 14 && (this.game.simTime || 0) - (this._noGasT || -9) > 4) { this._noGasT = this.game.simTime || 0; this.game.ui.hitMarker('НЕТ СИЛ — УДАРЫ БЕЗ ТОЛКУ', 0); }
    const s = {
      type: req.type, def, limb: req.limb, lead, t: 0, phase: 'wind', pt: 0,
      durs, total: durs[0] + durs[1] + durs[2] + durs[3],
      contact: false, whiffed: false, aim: new V3(), aimLocal: new V3(),
      start: new V3(), handPath: new V3(), cost, id: Math.random(),
      power: 0, sig: (def.dmg * (lead ? def.leadMul : 1)) >= 6,
      spamMul: (1 - spam * 0.4) * (this.stamina < 8 ? 0.8 : 1),
    };
    this._zonePoint(this.opponent, def.zone, s.aim, req.limb);
    void spam;
    const sloppy = 0.012 + this.daze * (this.npc ? 0.015 : 0.06) + (1 - this.staminaSpeed) * 0.11 + (this.rocked ? 0.03 : 0) + (1 - this.handMul + 0.15) * 0.04 + (this.npc ? this.npc.spread : 0);
    const spreadX = M.clamp(sloppy, 0, 0.075) * this.h;
    const spreadY = M.clamp(sloppy * 0.35, 0, 0.032) * this.h;
    s.aimErr = new V3(M.rand(-1, 1) * spreadX, M.rand(-1, 1) * spreadY, 0).multiplyScalar(M.rand(0.35, 1));
    if (this.angry || this.mcgMod) { s.aimErr.set(0, 0, 0); s.autoAim = true; }   // angry (and the mod): the blow flies to the target
    s.burst = !!this.mcgMod && this.mcgBurst > 0;
    if (def.kind === 'kick') {
      const f = this.foot[req.limb];
      this.body.root.worldToLocal(s.start.copy(f.planted));
      f.stepping = false;
      s.kicking = true;
    } else {
      s.start.copy(this.hand[req.limb].p);
    }
    s.fast = !!req.fast; s.commit = cm; s.qte = qte;
    this.strike = s;
    this.lastStrike = s;
    this.comboCount++; this.comboTimer = 0.9;
    this.stats.thrown++; if (s.sig) this.stats.sigThrown++;
    this.game.onStrikeStart(this, s);
    return true;
  }

  _finishStrikeHand(s) {
    if (s.def.kind === 'punch') this.hand[s.limb].vel.multiplyScalar(0.3);
  }

  _endKickLeg(s) {
    const f = this.foot[s.limb];
    const B = this.body.B;
    B['ft' + s.limb].getWorldPosition(f.planted); f.planted.y = 0;
    f.stepping = false; f.t = 1; f.yaw = this._restYaw(s.limb);
    if (this.gait) this.gait.next = null;
  }

  cancelStrike() {
    if (!this.strike) return;
    if (this.strike.def.kind === 'kick') this._endKickLeg(this.strike);
    this.strike = null;
  }

  _strikeTick(dt) {
    const s = this.strike;
    s.t += dt;
    const [dw, de, dh, dr] = s.durs;
    const prevPhase = s.phase;
    if (s.t < dw) { s.phase = 'wind'; s.pt = s.t / dw; }
    else if (s.t < dw + de) { s.phase = 'ext'; s.pt = (s.t - dw) / de; }
    else if (s.t < dw + de + dh) { s.phase = 'hold'; s.pt = (s.t - dw - de) / dh; }
    else if (s.t < s.total) { s.phase = 'ret'; s.pt = (s.t - dw - de - dh) / dr; }
    else {
      if (s.def.kind === 'kick') this._endKickLeg(s);
      this.strike = null;
      return;
    }
    // Aim tracks the target through the windup; once the strike is flying
    // the attacker is committed, which is what makes head movement work.
    if (s.phase === 'wind' || (s.phase === 'ext' && (s.pt < 0.45 || s.autoAim))) {
      this._zonePoint(this.opponent, s.def.zone, _v1, s.limb);
      _v1.add(s.aimErr);
      s.aim.lerp(_v1, s.phase === 'wind' ? 1 : s.autoAim ? 0.7 : 0.24);
    }
    if (prevPhase === 'wind' && s.phase === 'ext') {
      const lunge = s.def.lunge * (s.lead ? 1.1 : 1) * (s.commit ? 1.7 : 1) * (s.qte ? 2.2 : 1) * (this.technique === 'topuria' && s.def.path === 'hook' ? 1.4 : 1);
      const oy = this.opponent ? Math.atan2(this.opponent.pos.x - this.pos.x, this.opponent.pos.z - this.pos.z) : this.yaw;   // toward him, even with his back turned
      const fx = Math.sin(oy), fz = Math.cos(oy);
      let lg = lunge;
      if (s.autoAim && this.opponent) {   // it covers the distance on its own
        const dTo = Math.hypot(this.opponent.pos.x - this.pos.x, this.opponent.pos.z - this.pos.z), rg = UFC.AIController.prototype.ranges.call({ f: this });
        lg = Math.max(lunge, Math.min(1.8, dTo - (s.def.kind === 'kick' ? rg.kick : rg.punch) * 0.78));
      }
      if (s.autoAim && lg > lunge) { this.pos.x += fx * lg; this.pos.z += fz * lg; lg = lunge * 0.5; }   // the blow flies: he dashes onto the target
      this.vel.x += fx * lg / de * 0.9; this.vel.z += fz * lg / de * 0.9;
    }
    if (prevPhase !== 'ret' && s.phase === 'ret' && !s.contact && !s.whiffed) {
      s.whiffed = true;
      this.game.onWhiff(this, s);
      if (this.spamHeat > 6 || (this.stamina < 6 && s.def.kind === 'kick')) {
        this.stagger = Math.max(this.stagger, 0.3 + M.sat((this.spamHeat - 6) / 4) * 0.25);
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        this.vel.x += fx * 0.7; this.vel.z += fz * 0.7;
        this.sp.spPitch.kick(0.5);
        this.game.onOverextend(this);
      }
    }
  }

  // Where on `target` a strike of `zone` should land.
  _zonePoint(target, zone, out, limb) {
    const B = target.body.B, h = target.h;
    if (zone === 'head') return B.head.localToWorld(out.set(0, 0.045 * h, 0.03 * h));
    if (zone === 'body') {
      const sx = limb === 'L' ? -1 : 1; // attacker's left hand lands on target's right side
      return B.chest.localToWorld(out.set(sx * 0.03 * h, -0.05 * h, 0.07 * h));
    }
    const side = target.leadSide;
    return B['th' + side].localToWorld(out.set(0, -target.body.dims.thigh * 0.36, 0.02 * h));   // the thigh, not the knee
  }

  // -------------------------------------------------------------------------
  // Pose: procedural stance + springs + IK
  // -------------------------------------------------------------------------
  _poseBase(dt) {
    const it = this.intent, h = this.h, s = this.s, sp = this.sp;
    const st = this.strike;
    let twist = 0, strikeCrouch = 0, kickRoll = 0, kickPitch = 0;
    if (st) {
      const dir = st.lead ? -s : s;
      const amt = (st.lead ? st.def.leadTwist : st.def.twist) * (st.commit ? 1.35 : 1) * (this.technique === 'topuria' && st.def.path === 'hook' ? 1.3 : 1);
      let c;
      if (st.phase === 'wind') c = -0.25 * M.smooth(st.pt);
      else if (st.phase === 'ext') c = -0.25 + 1.25 * M.easeOut(st.pt);
      else if (st.phase === 'hold') c = 1;
      else c = 1 - M.smooth(st.pt);
      twist = st.def.spin ? 0 : dir * amt * c;
      const env = st.phase === 'ret' ? 1 - M.smooth(st.pt) : st.phase === 'wind' ? M.smooth(st.pt) : 1;
      if (st.def.kind === 'punch') strikeCrouch = (st.def.crouch || 0) * h * env * (st.commit ? 1.5 : 1) + (this.technique === 'topuria' && st.def.path === 'hook' ? 0.025 * h * env : 0);
      else {
        const limbX = st.limb === 'L' ? 1 : -1;
        kickRoll = -limbX * (0.12 + st.def.height * 0.3) * env * (st.def.karate === 'side' ? 1.35 : 1);
        kickPitch = st.def.spin ? (0.12 + st.def.height * 0.15) * env : -(0.08 + st.def.height * 0.28) * env;
        strikeCrouch = -0.01 * h * env;
      }
    }
    const slipX = this.state === 'fight' ? it.slipX : 0;
    const slipZ = this.state === 'fight' ? it.slipZ : 0;
    const lbEnv = st && st.def.lean ? (st.phase === 'ret' ? 1 - M.smooth(st.pt) : st.phase === 'wind' ? M.smooth(st.pt) : 1) : 0;
    const duck = Math.max(0, slipZ), pull = Math.max(0, -slipZ) + lbEnv * 1.1;
    const tired = 1 - M.sat(this.stamina / 60);
    let bounce = 0, shiftX = 0;
    const stepFoot = this.foot && (this.foot.L.stepping ? 'L' : this.foot.R.stepping ? 'R' : null);
    if (stepFoot) {
      const sf = this.foot[stepFoot], tt = Math.min(1, sf.t);
      bounce = -Math.sin(tt * Math.PI) * 0.007 * h;              // body rises as the leg swings through
      shiftX = (stepFoot === 'L' ? -1 : 1) * Math.sin(tt * Math.PI) * 0.012 * h; // over the planted foot
    } else if (!st && this.state === 'fight') {
      bounce = (this.technique === 'mcgregor' ? Math.sin(this.time * 5.4) * 0.009 * h : Math.sin(this.time * 4.2) * 0.004 * h) * (1 - tired * 0.7);
    }

    const casual = this.state === 'cine' && this.cine && this.cine.casual;
    let crouch = casual ? 0.012 * h + bounce * 0.5 : (UFC.judo ? 0.078 : 0.05) * h + bounce + strikeCrouch + duck * 0.11 * h + tired * 0.012 * h;
    if (this.block === 'body') crouch += 0.04 * h;
    if (this.rocked) crouch += 0.03 * h + Math.sin(this.time * 3.1) * 0.02 * h;
    if (this.state === 'getup') crouch += 0.06 * h * (1 - M.smooth(this.getupT / (this._blendDur || 0.4)));
    sp.crouch.target = crouch;
    sp.hipYaw.target = casual ? 0 : -(UFC.judo ? 0.2 : 0.5) * s + twist * 0.62;
    sp.spYaw.target = casual ? 0 : twist * 0.38;
    sp.spPitch.target = casual ? 0.03 : (UFC.judo ? 0.2 : 0.1) + duck * 0.38 - pull * 0.34 + (this.block === 'body' ? 0.22 : 0) + (this.block === 'high' ? 0.06 : 0) + tired * 0.08 + kickPitch + (this.bodyHp < 40 ? (40 - this.bodyHp) / 40 * 0.14 : 0);
    let roll = -slipX * 0.34 + kickRoll;
    if (this.rocked) roll += Math.sin(this.time * 2.2) * 0.1;
    sp.spRoll.target = roll;
    sp.latShift.target = shiftX;
    sp.fwdShift.target = -pull * 0.03 * h + duck * 0.02 * h;
    const chestYaw = sp.hipYaw.v + sp.spYaw.v;
    sp.nkYaw.target = -chestYaw * 0.85;
    sp.nkPitch.target = -sp.spPitch.v * 0.75 - 0.02 - (this.rocked ? Math.sin(this.time * 2.7) * 0.08 : 0);
    sp.nkRoll.target = -sp.spRoll.v * 0.6;
    if (this._finK > 0.01) { const fk = this._finK; sp.crouch.target += 0.48 * h * fk; sp.spPitch.target += 1.15 * fk; sp.fwdShift.target += 0.1 * h * fk; }   // bent over the fallen fighter, easing down
    if (this._quit && this.state === 'fight') { sp.spPitch.target += 0.34; sp.crouch.target += 0.03 * h; sp.latShift.target += Math.sin(this.time * 0.9) * 0.012 * h; }   // stopped: shoulders slumped
    // McGregor: tall, weight on the back foot, bladed hips, never still
    if (this.technique === 'mcgregor' && !casual) {
      sp.fwdShift.target -= 0.028 * h; sp.spPitch.target -= 0.06; sp.hipYaw.target += 0.1 * s;
      sp.latShift.target += Math.sin(this.time * 1.7) * 0.012 * h * (this.state === 'fight' && !st ? 1 : 0.3);
    }
    // Topuria: upright but loaded, chin tucked, weight forward, hands high and tight
    if (this.technique === 'topuria' && !casual) { sp.crouch.target += 0.012 * h; sp.spPitch.target += 0.05; sp.fwdShift.target += 0.012 * h; sp.hipYaw.target -= 0.04 * s; }
    if (dt > 0) for (const key in sp) sp[key].step(dt);
    else for (const key in sp) sp[key].snap(sp[key].target);
    // several hard hits in a row used to kick these springs until the body folded in half: keep the pose human
    {
      const cl = (z, lo, hi) => { if (z.v > hi) { z.v = hi; if (z.vel > 0) z.vel = 0; } else if (z.v < lo) { z.v = lo; if (z.vel < 0) z.vel = 0; } };
      cl(sp.spPitch, -0.4, this._finK > 0.01 ? 1.3 : 0.5); cl(sp.spRoll, -0.4, 0.4); cl(sp.nkPitch, -0.5, 0.45); cl(sp.nkRoll, -0.4, 0.4); cl(sp.crouch, -0.05 * h, this._finK > 0.01 ? 0.5 * h : 0.2 * h); cl(sp.hipRoll, -0.35, 0.35);
    }
    this._applySpine();
  }

  _applySpine() {
    const B = this.body.B, d = this.body.dims, sp = this.sp;
    const root = this.body.root;
    root.position.copy(this.pos);
    root.rotation.set(0, this.yaw, 0);
    B.hips.position.set(sp.latShift.v, d.hipY - sp.crouch.v, sp.fwdShift.v);
    B.hips.rotation.set(0.04, sp.hipYaw.v, sp.hipRoll.v);
    B.spine.rotation.set(sp.spPitch.v * 0.45, sp.spYaw.v * 0.5, sp.spRoll.v * 0.5);
    B.chest.rotation.set(sp.spPitch.v * 0.55, sp.spYaw.v * 0.5, sp.spRoll.v * 0.5);
    B.neck.rotation.set(sp.nkPitch.v * 0.5, sp.nkYaw.v * 0.5, sp.nkRoll.v * 0.5);
    B.head.rotation.set(sp.nkPitch.v * 0.5, sp.nkYaw.v * 0.5, sp.nkRoll.v * 0.5);
    root.updateMatrixWorld(true);
  }

  _guardTargets() {
    const h = this.h, B = this.body.B, root = this.body.root;
    this._guard = this._guard || { L: new V3(), R: new V3() };
    const head = B.head.localToWorld(_v1.set(0, 0.04 * h, 0.01 * h));
    root.worldToLocal(head);
    const tired = 1 - M.sat(this.stamina / 50);
    const drop = tired * 0.05 * h + (this._quit ? 0.16 * h : 0) + (this.rocked ? 0.07 * h : 0) + (this.stumbleT > 0 ? 0.09 * h : 0) + (this.bodyHp < 40 ? (40 - this.bodyHp) / 40 * 0.05 * h : 0);
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const lead = side === this.leadSide;
      const g = this._guard[side];
      if (this.block === 'high') g.set(head.x + sx * 0.042 * h, head.y - 0.015 * h, head.z + 0.085 * h);
      else if (this.block === 'body') g.set(head.x + sx * 0.05 * h, head.y - 0.075 * h, head.z + 0.1 * h);
      else if (this.technique === 'mcgregor') {
        // lead hand out at the opponent's face like a range finder and pawing, rear hand glued to the chin
        if (lead) g.set(head.x + sx * 0.06 * h + Math.sin(this.time * 3.3) * 0.012 * h, head.y - 0.035 * h - drop + Math.sin(this.time * 5.1) * 0.01 * h, head.z + 0.31 * h);
        else g.set(head.x + sx * 0.04 * h, head.y - 0.05 * h - drop * 0.7, head.z + 0.085 * h);
      }
      else if (this.technique === 'topuria') {
        if (lead) g.set(head.x + sx * 0.05 * h, head.y - 0.05 * h - drop, head.z + 0.17 * h + Math.sin(this.time * 4.1) * 0.006 * h);
        else g.set(head.x + sx * 0.045 * h, head.y - 0.045 * h - drop * 0.7, head.z + 0.095 * h);
      }
      else if (lead) g.set(head.x + sx * 0.055 * h, head.y - 0.085 * h - drop, head.z + 0.2 * h);
      else g.set(head.x + sx * 0.05 * h, head.y - 0.07 * h - drop * 0.7, head.z + 0.12 * h);
      if (this.state === 'win') g.set(sx * 0.16 * h, 1.22 * h, 0.03 * h);
      if (this.state === 'cine' && this.cine && this.cine.casual) {
        // arms hang relaxed and swing a little with the stride
        const swing = this.foot ? Math.sin((this.foot.L.stepping ? this.foot.L.t : this.foot.R.stepping ? -this.foot.R.t : 0) * Math.PI) * 0.05 * h : 0;
        g.set(sx * 0.215 * h, 0.5 * h, 0.03 * h + swing * sx);
      }
    }
    return this._guard;
  }

  _pose(dt) {
    this._poseBase(dt);
    const B = this.body.B, d = this.body.dims, h = this.h, root = this.body.root;
    if (this.legDmg && (this.state === 'fight' || this.state === 'getup')) {
      const dl = this.legDmg.L, dr = this.legDmg.R, bad = dl > dr ? 'L' : 'R', dmg = Math.max(dl, dr);
      if (dmg > 0.12) {
        const away = bad === 'L' ? -1 : 1;     // lean towards the good leg
        B.hips.quaternion.multiply(_q1.setFromAxisAngle(_v1.set(0, 0, 1), away * 0.07 * dmg));
        B.spine.quaternion.multiply(_q1.setFromAxisAngle(_v1.set(0, 0, 1), away * 0.09 * dmg));
        const other = this.foot[bad === 'L' ? 'R' : 'L'];
        if (other.stepping) B.hips.position.y -= Math.sin(Math.min(1, other.t) * Math.PI) * 0.025 * h * dmg;
      }
    }
    const guard = this._guardTargets();
    const st = this.strike;

    // ---- arms ----
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const hs = this.hand[side];
      const isStriking = st && st.def.kind === 'punch' && st.limb === side;
      let pole = _v2.set(sx * 0.45, -1, -0.25);
      if (isStriking && st.phase !== 'ret') {
        this._punchPath(st, side, guard[side], hs);
        if (st.def.path === 'hook') pole.set(sx * 1.0, 0.85, -0.3);
        else if (st.def.path === 'body' && st.lead) pole.set(sx * 1.0, 0.45, -0.35);
        else if (st.def.path === 'upper') pole.set(sx * 0.2, -1, 0.15);
        else pole.set(sx * 0.55, -0.9, -0.1);
      } else {
        hs.t.copy(guard[side]);
        if (st && st.def.kind === 'kick' && st.limb === side && st.phase !== 'ret') {
          // counter-balance swing of the kicking-side arm
          const env = st.phase === 'wind' ? st.pt : 1;
          hs.t.x += sx * 0.1 * h * env; hs.t.y -= 0.22 * h * env; hs.t.z -= 0.16 * h * env;
        }
        hs.k = this.block !== 'none' ? 700 : 300; hs.d = 2 * Math.sqrt(hs.k);
        hs.step(dt);
        if (this.block === 'high') pole.set(sx * 0.25, -1, 0.1);
      }
      // IK: wrist target sits a little behind the glove centre
      const target = root.localToWorld(_v3.copy(hs.p));
      const sh = B['ua' + side].getWorldPosition(_v4);
      const toT = _dir.subVectors(target, sh);
      const dist = toT.length();
      if (dist > 1e-4) target.addScaledVector(toT, -0.03 * h / dist);
      const poleW = pole.applyQuaternion(root.quaternion);
      { const KS = root.scale.x; solveTwoBone(B['ua' + side], B['fa' + side], target, poleW, d.upper * KS, d.fore * KS); }
      B['hand' + side].quaternion.identity();
    }
    root.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      this.prevGloveW[side].copy(this.gloveW[side]);
      B['hand' + side].localToWorld(this.gloveW[side].set(0, -0.042 * h, 0.004 * h));
    }

    if (this.neon) this.neon.update(dt);
    // ---- legs ----
    this._feet(dt);
  }

  _punchPath(st, side, guardPos, hs) {
    const h = this.h, root = this.body.root, B = this.body.B, d = this.body.dims;
    const sx = side === 'L' ? 1 : -1;
    const aim = root.worldToLocal(st.aimLocal.copy(st.aim));
    // clamp to arm reach from the shoulder
    const sh = root.worldToLocal(B['ua' + side].getWorldPosition(_v1));
    const reach = (d.upper + d.fore + 0.03 * h) * 0.995;
    _v2.subVectors(aim, sh);
    if (_v2.length() > reach) aim.copy(sh).addScaledVector(_v2.normalize(), reach);
    if (st.def.path === 'hook') aim.x += sx * 0.035 * h;
    const out = _v3;
    if (st.phase === 'wind') {
      const w = M.smooth(st.pt);
      out.copy(guardPos);
      if (st.def.path === 'upper') { out.y -= 0.17 * h * w; out.x -= sx * 0.015 * h * w; out.z -= 0.02 * h * w; }   // glove drops to the belt line, tight to the body
      else if (st.def.path === 'hook') { out.x += sx * (st.def.elbow ? 0.06 : this.technique === 'topuria' ? 0.1 : 0.15) * h * w; out.y = M.lerp(guardPos.y, aim.y - 0.01 * h, w); out.z -= 0.005 * h * w; }   // loaded wide, elbow up at shoulder height
      else out.z -= 0.03 * h * w;
      st.start.copy(out);
    } else if (st.phase === 'ext') {
      const e = M.easeOut(M.smooth(st.pt) * 0.4 + st.pt * 0.6);
      if (st.def.path === 'straight' || (st.def.path === 'body' && !st.lead)) {
        const es = this.technique === 'topuria' && st.def.path === 'straight' ? 1 - Math.pow(1 - st.pt, 2.6) : e;   // a snapping jab
        out.lerpVectors(st.start, aim, es);
        out.y += Math.sin(e * Math.PI) * 0.012 * h;
      } else if (st.def.path === 'hook') {
        // a real hook: the glove stays wide and level, travels forward, then swings across in a flat arc
        const c = _v4.set(st.start.x + sx * (this.technique === 'topuria' ? -0.012 : 0.03) * h, (st.start.y + aim.y) * 0.5, aim.z - 0.03 * h);   // Topuria's hook is short and tight
        bezier(st.start, c, aim, e, out);
      } else if (st.def.path === 'body') {
        const c = _v4.addVectors(st.start, aim).multiplyScalar(0.5);
        c.x += sx * 0.2 * h; c.y += 0.02 * h; c.z -= 0.02 * h;
        bezier(st.start, c, aim, e, out);
      } else {
        // uppercut: from the belt line forward and under the chin, then straight up
        const c = _v4.set((st.start.x + aim.x) * 0.5, st.start.y + (aim.y - st.start.y) * 0.12, aim.z - 0.05 * h);
        bezier(st.start, c, aim, e, out);
      }
      if (st.contact) out.copy(st.contactLocal);
    } else {
      out.copy(st.contact ? st.contactLocal : aim);
    }
    hs.vel.subVectors(out, hs.p).multiplyScalar(1 / Math.max(1e-4, 1 / 120));
    hs.p.copy(out); hs.t.copy(guardPos);
    if (st.phase === 'hold' || st.phase === 'ext') st.handPath.copy(out);
  }

  _footRest(side, out) {
    const h = this.h;
    const lead = side === this.leadSide;
    const sx = side === 'L' ? 1 : -1;
    const widen = this.sp ? this.sp.crouch.v * 0.25 : 0;
    const casual = this.state === 'cine' && this.cine && this.cine.casual;
    const local = casual ? _v1.set(sx * 0.075 * h, 0, lead ? 0.015 * h : -0.015 * h)
      : this.technique === 'mcgregor' ? (lead ? _v1.set(sx * (0.075 * h + widen), 0, 0.17 * h) : _v1.set(sx * (0.1 * h + widen), 0, -0.2 * h))
      : lead ? _v1.set(sx * (0.06 * h + widen), 0, 0.13 * h) : _v1.set(sx * (0.08 * h + widen), 0, -0.14 * h);
    return out.copy(local).applyAxisAngle(UP, this.yaw).add(this.pos).setY(0);
  }

  _restYaw(side) {
    if (this.state === 'cine' && this.cine && this.cine.casual) return this.yaw + (side === 'L' ? 0.12 : -0.12);
    const lead = side === this.leadSide;
    return this.yaw + (lead ? -0.25 * this.s : -0.75 * this.s) * 0.9;
  }

  // Start one step for `side` toward where that foot should be when the body
  // has moved on by the end of the step. The target is committed at lift-off.
  _startStep(side, gv, speed, late = 0) {
    const h = this.h, f = this.foot[side];
    f.dur = M.clamp(0.25 - speed * 0.035, 0.17, 0.25) / (0.9 + 0.1 * this.spd);
    const period = f.dur * 1.4;
    this._footRest(side, f.to);
    // Land where the stance position will be halfway through the time this
    // foot then stays planted, so the body passes over it.
    const lead = (f.dur + period) * UFC.TUNE.footLead;
    // Predict with the commanded velocity (the body is about to move that
    // way); fall back to measured motion when something blocks the body.
    const vx = Math.hypot(gv.x, gv.z) < 0.35 * Math.hypot(this.vel.x, this.vel.z) ? gv.x : this.vel.x;
    const vz = Math.hypot(gv.x, gv.z) < 0.35 * Math.hypot(this.vel.x, this.vel.z) ? gv.z : this.vel.z;
    f.to.x += vx * lead; f.to.z += vz * lead;
    // never land on the wrong side of the other foot (no crossed legs)
    const other = this.foot[side === 'L' ? 'R' : 'L'];
    const oRef = other.stepping ? other.to : other.planted;
    const sx = side === 'L' ? 1 : -1;
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    const across = ((f.to.x - oRef.x) * lx + (f.to.z - oRef.z) * lz) * sx;
    const minGap = 0.075 * this.h;
    if (across < minGap) { const k = (minGap - across) * sx; f.to.x += lx * k; f.to.z += lz * k; }
    f.from.copy(f.planted);
    f.yawFrom = f.yaw; f.yawTo = this._restYaw(side);
    f.lift = (0.016 + Math.min(speed, 2.5) * 0.008) * h;
    const hurt = this.legDmg ? this.legDmg[side] || 0 : 0;
    if (hurt > 0.05) { f.dur *= 1 + 1.7 * hurt; f.lift *= 1 - 0.65 * hurt; }
    f.stepping = true; f.t = 0;
  }

  _feet(dt) {
    const B = this.body.B, d = this.body.dims, h = this.h, root = this.body.root, st = this.strike;
    // Ground velocity from real displacement (not intent), smoothed, so feet
    // follow what the body actually does when it's blocked or pushed.
    const gait = this.gait || (this.gait = { prev: this.pos.clone(), gv: new V3(), idleErrT: 0 });
    if (dt > 0) {
      const ix = (this.pos.x - gait.prev.x) / dt, iz = (this.pos.z - gait.prev.z) / dt;
      if (Math.hypot(ix, iz) < 8) { gait.gv.x = M.damp(gait.gv.x, ix, 12, dt); gait.gv.z = M.damp(gait.gv.z, iz, 12, dt); }
    }
    gait.prev.copy(this.pos);
    const gv = gait.gv, speed = Math.hypot(gv.x, gv.z);
    const kickSide = st && st.def.kind === 'kick' ? st.limb : null;
    const rest = { L: this._footRest('L', new V3()), R: this._footRest('R', new V3()) };

    if ((this.state === 'fight' || this.state === 'getup' || this.state === 'win' || this.state === 'cine') && dt > 0) {
      const FL = this.foot.L, FR = this.foot.R;
      const busy = FL.stepping || FR.stepping || !!kickSide;
      const err = (s) => Math.hypot(this.foot[s].planted.x - rest[s].x, this.foot[s].planted.z - rest[s].z);
      const yawErr = (s) => Math.abs(M.wrap(this.foot[s].yaw - this._restYaw(s)));
      if (speed > 0.18 && !kickSide) {
        // Moving: MMA shuffle. Each cycle the foot on the side of travel
        // steps first and the other follows at ~45% of its step, so the
        // stance never stretches or collapses.
        gait.idleErrT = 0;
        const fwd = gv.x * Math.sin(this.yaw) + gv.z * Math.cos(this.yaw);
        const lat = gv.x * Math.cos(this.yaw) - gv.z * Math.sin(this.yaw);
        const first = Math.abs(fwd) >= Math.abs(lat) ? (fwd >= 0 ? this.leadSide : this.rearSide) : (lat >= 0 ? 'L' : 'R');
        const second = first === 'L' ? 'R' : 'L';
        const F1 = this.foot[first], F2 = this.foot[second];
        gait.cycleT = (gait.cycleT == null ? 99 : gait.cycleT) + dt;
        const period = M.clamp(0.25 - speed * 0.035, 0.17, 0.25) / (0.9 + 0.1 * this.spd) * 1.4;
        if (!F1.stepping && !F2.stepping && gait.cycleT >= period) { this._startStep(first, gv, speed); gait.cycleT = 0; gait.pending = second; }
        if (gait.pending && !this.foot[gait.pending].stepping && (F1.stepping ? F1.t >= 0.45 : true)) {
          this._startStep(gait.pending, gv, speed); gait.pending = null;
        }
        // safety: a foot left far behind (sharp turn, push) catches up at once
        for (const s of ['L', 'R']) {
          const o = s === 'L' ? FR : FL;
          if (!this.foot[s].stepping && !o.stepping && err(s) > 0.22 * h) { this._startStep(s, gv, speed); gait.cycleT = 0; }
        }
      } else if (!busy) {
        gait.cycleT = 99; gait.pending = null;
        {
          // standing: only step when a foot is clearly out of place for a moment
          gait.next = null;
          const eL = err('L') + yawErr('L') * 0.05 * h, eR = err('R') + yawErr('R') * 0.05 * h;
          const worst = eL > eR ? 'L' : 'R', e = Math.max(eL, eR);
          if (e > 0.085 * h) gait.idleErrT += dt; else if (e < 0.05 * h) gait.idleErrT = 0;
          if (gait.idleErrT > 0.12) { this._startStep(worst, gv, 0); gait.idleErrT = 0.06; }
        }
      }
    }

    for (const side of ['L', 'R']) {
      const f = this.foot[side];
      const sx = side === 'L' ? 1 : -1;
      if (f.yaw == null) f.yaw = this._restYaw(side);
      let ankle;
      let footFlat = true;
      let pole = _v2.set(sx * 0.25, 0, 1);
      if (side === kickSide) {
        ankle = this._kickPath(st, side);
        pole.set(sx * 0.9, 0.35, 0.55);
        footFlat = false;
      } else {
        let lift = 0;
        if (f.stepping) {
          f.t += dt / f.dur;
          const t = Math.min(1, f.t);
          const tt = M.smooth(t);
          f.planted.lerpVectors(f.from, f.to, tt);
          f.yaw = f.yawFrom + M.wrap(f.yawTo - f.yawFrom) * tt;
          lift = Math.pow(Math.sin(t * Math.PI), 0.8) * f.lift;
          const out = Math.sin(t * Math.PI) * 0.022 * h * sx;
          f.planted.x += Math.cos(this.yaw) * out; f.planted.z -= Math.sin(this.yaw) * out;
          if (f.t >= 1) { f.stepping = false; f.planted.copy(f.to); f.yaw = f.yawTo; this.game.onFootstep(this, speed); }
          ankle = _v3.copy(f.planted); ankle.y = d.ankle + lift;
          if (f.stepping) { f.planted.x -= Math.cos(this.yaw) * out; f.planted.z += Math.sin(this.yaw) * out; }
        } else {
          ankle = _v3.copy(f.planted); ankle.y = d.ankle;
        }
      }
      pole.applyAxisAngle(UP, this.yaw);
      { const KS = root.scale.x; solveTwoBone(B['th' + side], B['sn' + side], ankle, pole, d.thigh * KS, d.shin * KS, true); }
      if (footFlat) {
        let fyaw = f.yaw;
        if (st && st.def.kind === 'kick' && side !== kickSide && st.phase !== 'wind') fyaw -= (st.limb === this.leadSide ? -0.6 : 1.2) * this.s * (st.phase === 'ret' ? 1 - st.pt : 1);
        if (side !== kickSide) fyaw += this.spinOff || 0;   // the standing foot pivots with the spin
        _q1.setFromAxisAngle(UP, fyaw);
        B['sn' + side].getWorldQuaternion(_q2);
        B['ft' + side].quaternion.copy(_q2.invert().multiply(_q1));
      } else {
        B['ft' + side].quaternion.setFromAxisAngle(_v1.set(1, 0, 0), 0.9);
      }
    }
    root.updateMatrixWorld(true);
  }

  _kickPath(st, side) {
    const h = this.h, root = this.body.root, B = this.body.B, d = this.body.dims;
    const sx = side === 'L' ? 1 : -1;
    const aim = root.worldToLocal(st.aimLocal.copy(st.aim));
    const hip = root.worldToLocal(B['th' + side].getWorldPosition(_v1));
    const reach = (d.thigh + d.shin) * 1.1;
    // A round kick connects with the shin, so the ankle travels past the target.
    aim.x -= sx * 0.1 * h;
    aim.z += 0.02 * h;
    aim.y = Math.max(aim.y, 0.2 * h);
    _v2.subVectors(aim, hip);
    if (_v2.length() > reach) aim.copy(hip).addScaledVector(_v2.normalize(), reach);
    // karate: mae-geri lifts the knee straight at the target, yoko-geri chambers the knee out to the side and the heel drives across
    const kk = st.def.karate;
    const chamber = kk === 'front' ? _v4.set(sx * 0.03 * h, 0.5 * h, 0.1 * h) : kk === 'side' ? _v4.set(sx * 0.16 * h, 0.46 * h, -0.03 * h) : _v4.set(sx * 0.1 * h, M.lerp(0.26, 0.5, st.def.height) * h, 0.08 * h);
    const out = st.handPath;
    if (st.phase === 'wind') {
      out.lerpVectors(st.start, chamber, M.smooth(st.pt));
      out.y = Math.max(out.y, d.ankle);
    } else if (st.phase === 'ext') {
      const c = _v2.addVectors(chamber, aim).multiplyScalar(0.5);
      c.x += sx * (kk === 'front' ? 0.06 : kk === 'side' ? 0.12 : 0.32) * h; c.z -= 0.02 * h; c.y += 0.04 * h;
      bezier(chamber, c, aim, M.easeOut(st.pt), out);
      if (st.contact) out.copy(st.contactLocal);
    } else if (st.phase === 'hold') {
      out.copy(st.contact ? st.contactLocal : aim);
    } else {
      const from = st.contact ? st.contactLocal : aim;
      const rest = root.worldToLocal(this._footRest(side, _v2));
      rest.y = d.ankle;
      const r = M.smooth(st.pt);
      const mid = _v4.set(sx * 0.12 * h, 0.35 * h * (1 - r), 0.02 * h);
      bezier(from, mid, rest, r, out);
    }
    return root.localToWorld(_v3.copy(out));
  }

  // -------------------------------------------------------------------------
  // Damage volumes / queries
  // -------------------------------------------------------------------------
  headCenter(out) { return this.body.B.head.localToWorld(out.set(0, 0.052 * this.h, 0.01 * this.h)); }

  strikerPoints(st, outArr) {
    const B = this.body.B, h = this.h;
    outArr.length = 0;
    if (st.def.kind === 'punch') {
      outArr.push({ p: this.gloveW[st.limb], r: 0.034 * h });
    } else {
      const kn = B['sn' + st.limb].getWorldPosition(new V3());
      const an = B['ft' + st.limb].getWorldPosition(new V3());
      outArr.push({ p: kn.clone().lerp(an, 0.55), r: 0.04 * h }, { p: an, r: 0.038 * h }, { p: kn.clone().lerp(an, 0.25), r: 0.042 * h }, { p: kn, r: 0.045 * h });
    }
    return outArr;
  }

  // Is a striking sphere touching this fighter's raised gloves / forearms?
  touchesGuard(point, r) {
    const B = this.body.B, h = this.h;
    for (const s of ['L', 'R']) {
      if (point.distanceTo(this.gloveW[s]) < r + 0.036 * h) return true;
      const el = B['fa' + s].getWorldPosition(_v4);
      if (segDist(point, el, this.gloveW[s]) < r + 0.024 * h) return true;
    }
    return false;
  }

  // Returns the first zone in `zones` that the sphere touches, or null.
  testHit(point, r, zones) {
    const B = this.body.B, h = this.h, d = this.body.dims;
    for (const z of zones) {
      if (z === 'head') {
        if (point.distanceTo(this.headCenter(_v4)) < r + 0.068 * h) return z;
      } else if (z === 'body') {
        const a = B.spine.getWorldPosition(new V3());
        const b = B.chest.localToWorld(new V3(0, 0.07 * h, 0));
        if (segDist(point, a, b) < r + d.torsoR * 0.92) return z;
      } else if (z === 'legs') {
        for (const s of ['L', 'R']) {
          const th = B['th' + s].getWorldPosition(new V3()), kn = B['sn' + s].getWorldPosition(new V3()), an = B['ft' + s].getWorldPosition(new V3());
          if (segDist(point, th, kn) < r + 0.055 * h || segDist(point, kn, an) < r + 0.036 * h) return z;
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Getting hit
  // -------------------------------------------------------------------------
  // Adds a physical reaction in this fighter's local frame.
  react(dirW, power, zone, blocked) {
    const sp = this.sp;
    const inv = _q1.setFromAxisAngle(UP, -this.yaw);
    const dl = _v1.copy(dirW).applyQuaternion(inv);
    const k = blocked ? 0.25 : 1;
    if (zone === 'head') {
      sp.nkPitch.kick((dl.z * 0.85 - Math.max(0, dl.y) * 1.0) * power * k);
      sp.nkYaw.kick(dl.x * power * 0.8 * k);
      sp.nkRoll.kick(-dl.x * power * 0.6 * k);
      sp.spPitch.kick(dl.z * power * 0.28 * k);
      sp.spRoll.kick(-dl.x * power * 0.2 * k);
    } else if (zone === 'body') {
      sp.spPitch.kick(power * 0.45 * k);
      sp.nkPitch.kick(power * 0.3 * k);
      sp.spRoll.kick(-dl.x * power * 0.3 * k);
      sp.crouch.kick(power * 0.006 * this.h * k * 10);
    } else {
      sp.crouch.kick(power * 0.008 * this.h * k * 10);
      sp.hipRoll.kick(-dl.x * power * 0.25 * k);
      sp.spRoll.kick(dl.x * power * 0.18 * k);
    }
    if (blocked) {
      for (const s of ['L', 'R']) this.hand[s].vel.addScaledVector(dl, -power * 0.08);
    }
    this.vel.x += dirW.x * power * (blocked ? 0.035 : 0.055);
    this.vel.z += dirW.z * power * (blocked ? 0.035 : 0.055);
  }

  // A heavy clean shot that doesn't drop him still moves him: stumble back.
  stumble(dirW, power) {
    this.stumbleT = 0.3 + power * 0.012;
    this.vel.x += dirW.x * power * 0.07; this.vel.z += dirW.z * power * 0.07;
    this.sp.crouch.kick(0.4); this.sp.spPitch.kick(-power * 0.12);
    this.cancelStrike();
  }

  // How bloody the face is right now (0..1): a fresh cut or a bleeding nose.
  get bleeding() {
    const f = this.face;
    if (!f) return 0;
    return M.sat(Math.max(f.bleedL, f.bleedR) * 1.1 + f.noseBleed * 0.8);
  }

  // Flow is available to the player while the blood is visible.
  canFlow() { return !!this.isPlayer && this.state === 'fight' && this.flow <= 0 && this.flowCooldown <= 0 && this.bleeding > 0.25; }

  // Topuria: every 10 seconds he can sit down on his punches: the next three are extremely heavy
  canCommit() { return this.technique === 'topuria' && this.state === 'fight' && this.commitCd <= 0 && this.commitLeft <= 0; }
  startCommit() {
    this.commitLeft = 3; this.commitT = 7; this.commitCd = 10;
    this.sp.crouch.kick(0.3); this.sp.spPitch.kick(0.12);
    return true;
  }

  startFlow() {
    this.flow = UFC.TUNE.flowDur;
    this.flowCooldown = UFC.TUNE.flowCooldown;
    this.stamina = Math.min(this.staminaCap, this.stamina + 12);
    return true;
  }

  knockDown(dirW, power, kind) {
    this.cancelStrike();
    this.state = 'down';
    this.block = 'none';
    this.knockdowns++;
    if (kind === 'head') { this.headCap = Math.max(15, this.headCap - 20); this.headDmg = Math.max(this.headDmg || 0, 50); }   // the brain does not forget a knockdown
    const imp = dirW.clone().setY(0).normalize().multiplyScalar(1.2 + power * 0.09);
    if (kind === 'body' || kind === 'legs') imp.multiplyScalar(0.25);
    imp.y = kind === 'head' ? 0.4 : -0.2;
    this.ragdoll.start(imp, (Math.random() - 0.5) * 3);
    this.downTimer = 0;
    this.getupAt = 2.2 + Math.random() * 1.0 + (1 - this.head / 100) * 1.8;
  }

  knockOut(dirW, power) {
    if (this.state !== 'down') this.knockDown(dirW, power, 'head');
    this.state = 'ko';
  }

  _updateDown(dt) {
    this.downTimer += dt;
    this.ragdoll.step(dt);
    this.ragdoll.apply();
    this.pos.set(this.ragdoll.p.hips.x, 0, this.ragdoll.p.hips.z);
    this.vel.set(0, 0, 0);
    this.body.root.updateMatrixWorld(true);
    if (this.state === 'down' && this.downTimer > this.getupAt) this._beginGetup();
  }

  _beginGetup() {
    const B = this.body.B;
    this.ragdoll.stop();
    this.state = 'getup';
    this.getupT = 0;
    this.stun = 32;
    this.stamina = Math.max(this.stamina, 30);
    this._snap = {};
    for (const [k, b] of Object.entries(B)) this._snap[k] = b.quaternion.clone();
    this._snapHips = B.hips.position.clone();
    this.yaw = this.ragdoll.rootYaw;
    this.gait = null;
    for (const side of ['L', 'R']) {
      const f = this.foot[side];
      this._footRest(side, f.planted);
      f.stepping = false; f.t = 1; f.yaw = this._restYaw(side);
    }
    Object.values(this.sp).forEach((s) => { s.vel = 0; });
    this.sp.crouch.snap(0.35 * this.h);
  }

  _getupBlend(dt) {
    this.getupT += dt;
    const dur = 1.0;
    const w = 1 - M.smooth(this.getupT / dur);
    const B = this.body.B;
    if (w > 0) {
      for (const [k, b] of Object.entries(B)) b.quaternion.slerpQuaternions(b.quaternion.clone(), this._snap[k], w);
      B.hips.position.lerp(this._snapHips, w);
      this.body.root.updateMatrixWorld(true);
    }
    if (this.getupT >= dur) { this.state = 'fight'; this.hitstun = 0.1; }
  }

  celebrate() {
    this.cancelStrike();
    this.state = 'win';
    this.block = 'none';
    this.intent.mx = this.intent.mz = 0;
  }

  updateWin(dt) {
    this.time += dt;
    this.vel.multiplyScalar(0.9);
    this.intent.slipX = this.intent.slipZ = 0;
    this._locomotion(dt);
    this._pose(dt);
  }
}

UFC.Fighter = Fighter;
})();

