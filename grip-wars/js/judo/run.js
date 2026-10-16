//# sourceURL=judo/run.js
// Judo: running one throw: the entry (kuzushi), the drive, the fall, the landing and the score for it.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const M = UFC.M;
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = cl(x); return x * x * (3 - 2 * x); };
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'snL', 'thR', 'snR', 'ftL', 'ftR'];
const CORE = ['hips', 'chest', 'neck', 'head', 'shL', 'shR', 'hpL', 'hpR'];
const LIMB_W = { knL: 0.8, ftL: 0.75, knR: 0.8, ftR: 0.75, elL: 0.45, haL: 0.35, elR: 0.45, haR: 0.35 };   // how much of the limbs moves with the body
const CONTACT = ['hips', 'chest', 'shL', 'shR', 'head'];
const RADIUS = { head: 0.11, hips: 0.12, chest: 0.13, shL: 0.07, shR: 0.07 };
// kneeling over the thrown man: the back knee on the mat, the front foot planted, the chest over him
const PRESS = { hip: [0, 0.3, -0.03], hr: [0.4, 0, 0], sp: [0.75, 0, 0], nk: [-0.45, 0, 0], fL: [0.11, 0.05, 0.17], fR: [-0.1, 0.035, -0.3], kn: [1.0, 0.3] };
// working a choke or a lock: lower, the chest closer to him
const SUBP = { hip: [0, 0.26, 0.02], hr: [0.55, 0, 0], sp: [0.95, 0, 0], nk: [-0.55, 0, 0], fL: [0.12, 0.05, 0.2], fR: [-0.1, 0.035, -0.28], kn: [1.05, 0.3] };

function snap(f) {
  const B = f.body.B, s = { q: {}, hips: B.hips.position.clone(), pos: f.pos.clone(), yaw: f.yaw };
  for (const n of BONES) s.q[n] = B[n].quaternion.clone();
  return s;
}
function blendFrom(f, s, w) {
  if (w >= 1) return;
  const B = f.body.B;
  for (const n of BONES) { _q.copy(B[n].quaternion); B[n].quaternion.slerpQuaternions(s.q[n], _q, w); }
  _v.copy(B.hips.position); B.hips.position.lerpVectors(s.hips, _v, w);
  f.body.root.updateMatrixWorld(true);
}
const _q = new Q(), _v = new V3(), _qa = new Q(), _ea = new THREE.Euler();

// ---------------------------------------------------------------- bodies do not pass through each other
// closest points of two segments p1-q1 and p2-q2
function segSeg(p1, q1, p2, q2, c1, c2) {
  const d1 = _s1.subVectors(q1, p1), d2 = _s2.subVectors(q2, p2), r = _s3.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-8 && e <= 1e-8) { s = t = 0; }
  else if (a <= 1e-8) { s = 0; t = cl(f / e); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-8) { t = 0; s = cl(-c / a); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? cl((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = cl(-c / a); } else if (t > 1) { t = 1; s = cl((b - c) / a); }
    }
  }
  c1.copy(p1).addScaledVector(d1, s); c2.copy(p2).addScaledVector(d2, t);
  return c1.distanceTo(c2);
}
const _s1 = new V3(), _s2 = new V3(), _s3 = new V3(), _c1 = new V3(), _c2 = new V3(), _np = new V3();
function capsules(f) {
  const B = f.body.B, H = f.h;
  const w = (bone, x, y, z) => bone.localToWorld(new V3(x * H, y * H, z * H));
  return [
    [w(B.hips, 0, -0.03, 0), w(B.chest, 0, 0.09, 0), 0.072 * H],
    [w(B.head, 0, 0.04, 0.01), w(B.head, 0, 0.06, 0.01), 0.06 * H],
    [w(B.thL, 0, -0.02, 0), w(B.snL, 0, 0, 0), 0.042 * H],
    [w(B.thR, 0, -0.02, 0), w(B.snR, 0, 0, 0), 0.042 * H],
  ];
}
J.capsules = capsules;
J.segSeg = segSeg;

// standing in the frame of the throw: x to the left of uke (who faces tori), z towards tori
class ThrowRun {
  constructor(game, tori, uke, tech, opts) {
    this.g = game; this.tori = tori; this.uke = uke; this.tech = tech; this.opts = opts || {};
    this.fail = !!this.opts.fail;
    this.m = this.opts.m || (tori.s === 1 ? 1 : -1);
    const dx = tori.pos.x - uke.pos.x, dz = tori.pos.z - uke.pos.z;
    this.phi = Math.atan2(dx, dz);
    this.O = uke.pos.clone(); this.O.y = 0;
    this.Xu = new V3(Math.cos(this.phi), 0, -Math.sin(this.phi));
    this.Zu = new V3(Math.sin(this.phi), 0, Math.cos(this.phi));
    this.H = (tori.h + uke.h) / 2;
    this.k = this.H / 1.8;
    const d0 = cl(Math.hypot(dx, dz), 0.7, 1.7) / this.k;
    this.tk = tech.tori(this.m).map((a) => a.slice()); this.tk[0][2] = d0;
    this.uk = this.fail ? this.resistTrack() : tech.uke(this.m);
    this.drive = Object.assign({}, tech.drive(this.m));
    this.power = this.opts.power || 1;
    this.drive.dur /= Math.max(0.7, Math.min(1.3, this.power));
    const sp = this.opts.speed || 1.18;
    this.tk = this.tk.map((k) => { const c = k.slice(); c[0] /= sp; return c; });
    this.uk = this.uk.map((k) => { const c = k.slice(); c[0] /= sp; return c; });
    this.drive.t0 /= sp;
    this.tEnd = this.tk[this.tk.length - 1][0];
    this.failEnd = this.drive.t0 + 0.55;
    this.t = 0; this.stage = 'entry';
    this.sT = snap(tori); this.sU = snap(uke);
    tori.yaw0 = tori.yaw;
    for (const f of [tori, uke]) { f.cancelStrike(); f.state = 'grapple'; f.block = 'none'; f.vel.set(0, 0, 0); f.hitstun = 0; f.intent.strike = null; f.intent.mx = f.intent.mz = 0; f._judoBusy = true; }
    uke.yaw = this.phi;
    this.result = null; this.released = false; this.vImpact = 0; this.contact = {}; this.vyPrev = {}; this.yPrev = {};
    this.landT = null; this.done = false;
    // the thrower is carried by the throw: forward over his own hip, or into the man he reaps
    const fd = tech.fall === 'forward' ? 1 : (tech.fall === 'backward' || tech.fall === 'back') ? -1 : 0.6;
    this.followAmt = (tech.follow != null ? tech.follow : (fd > 0 ? 0.42 : 0.5)) * Math.max(0.7, Math.min(1.3, this.power));
    this.followZ = fd;
    this.landAfter = 0;
  }

  // uke braces in time: the attempt turns into a failed one
  resist() {
    if (this.fail || this.stage !== 'entry' || this.t > this.drive.t0 - 0.08) return false;
    this.fail = true; this.resisted = true;
    this.sU = snap(this.uke); this.ukT0 = this.t;
    const t0 = this.t;
    this.uk = this.resistTrack().map((k) => { const c = k.slice(); c[0] += t0; return c; });
    this.uk.unshift([0, 0, 0, 0, {}]);
    this.failEnd = this.t + 0.55;
    return true;
  }

  resistTrack() {
    const rs = { hip: [0, 0.5, -0.14], sp: [0.4, 0, 0], nk: [-0.2, 0, 0], fL: [0.09, 0.046, -0.1], fR: [-0.09, 0.046, -0.24], kn: [0.5, 0.35] };
    return [[0, 0, 0, 0, {}], [0.4, 0, -0.04, 0, { hip: [0, 0.53, -0.06], sp: [0.25, 0, 0] }], [0.7, 0, -0.1, 0, rs], [1.4, 0, -0.14, 0, rs]];
  }

  w(x, z, out) { return out.copy(this.O).addScaledVector(this.Xu, x).addScaledVector(this.Zu, z); }

  place(f, s, yawU) {
    this.w(s.x, s.z, _v);
    f.pos.set(_v.x, 0, _v.z); f.yaw = this.phi + yawU;
    f.body.root.position.copy(f.pos); f.body.root.rotation.set(0, f.yaw, 0);
    f.body.root.updateMatrixWorld(true);
  }

  grips(f, o, who) {
    const spec = this.tech.grips(this.m)[0];
    const g = {};
    if (who === 'tori') {
      for (const side of ['L', 'R']) { const a = spec[side]; if (a) g[side] = J.anchor(o, a[0], new V3()); }
    } else {
      // uke holds on to the jacket of tori
      g.L = J.anchor(o, 'shoulderR', new V3()); g.R = J.anchor(o, 'lapelL', new V3());
    }
    return g;
  }

  update(dt) {
    if (this.done) return;
    const tori = this.tori, uke = this.uke, g = this.g;
    this.t += dt;
    const t = this.t, H = this.H;
    tori.time += dt; uke.time += dt;

    if (!this.fail && this.released && !this.pressing && t - this.releaseT > 0.3) { this.pressing = true; this.pressT = 0; this.sP = snap(tori); }
    // tori
    const st = J.sampleTrack(this.tk, Math.min(t, this.tEnd), H);
    if (!this.fail) { const f0 = this.drive.t0 - 0.08, fk = ease((t - f0) / (this.drive.dur + 0.55)); st.z += this.followZ * this.followAmt * fk * this.k; }
    this.place(tori, st, st.yaw);
    // uke while he is still on his feet
    if (!this.released && this.stage !== 'drive') {
      const su = J.sampleTrack(this.uk, Math.min(t, this.uk[this.uk.length - 1][0]), H);
      this.place(uke, su, su.yaw);
      J.applyRig(uke, su.rig, this.grips(uke, tori, 'uke'));
      blendFrom(uke, this.sU, ease(this.ukT0 != null ? (t - this.ukT0) / 0.18 : t / 0.22));
    }
    const ug = (this.stage === 'entry' || this.stage === 'drive') ? this.grips(tori, uke, 'tori') : null;
    J.applyRig(tori, st.rig, ug);
    blendFrom(tori, this.sT, ease(t / 0.22));
    if (this.pressing) this.pressStep(dt);
    // the bodies touch, they do not pass into each other: tori is moved out of uke
    else if (!this.released || this.t - this.releaseT < 0.3) {
      const need = this.separation();
      this.off = this.off || new V3();
      this.off.lerp(need, 0.5);
      if (this.off.lengthSq() > 1e-6) {
        tori.pos.add(this.off); tori.body.root.position.copy(tori.pos); tori.body.root.updateMatrixWorld(true);
        J.applyRig(tori, st.rig, ug ? this.grips(tori, uke, 'tori') : null);
        blendFrom(tori, this.sT, ease(t / 0.22));
      }
    }

    if (!this.fail && this.stage === 'entry' && t >= this.drive.t0) this.startDrive();
    if (this.stage === 'drive') this.driveStep(dt);
    else if (this.stage === 'fall') this.fallStep(dt);

    if (this.fail && t >= this.failEnd) { this.finish(); return; }
    if (this.stage === 'fall' && !this.result && t - this.releaseT > 0.5) this.judge(dt);
    if (this.result && t >= Math.max(this.tEnd, this.releaseT + 1.2)) this.finish();
  }

  separation() {
    const A = capsules(this.tori), Bc = capsules(this.uke), push = new V3();
    for (let it = 0; it < 2; it++) {
      for (const a of A) for (const b of Bc) {
        const d = segSeg(a[0], a[1], b[0], b[1], _c1, _c2), min = a[2] + b[2] - 0.012 * this.H;
        if (d < min) {
          const n = new V3().subVectors(_c1, _c2); n.y = 0;
          if (n.lengthSq() < 1e-8) n.subVectors(this.tori.pos, this.uke.pos).setY(0);
          n.normalize().multiplyScalar(Math.min(0.25, min - d) * 0.5);
          push.add(n);
          for (const p of a.slice(0, 2)) p.add(n);
        }
      }
    }
    return push;
  }

  // the falling body slides off tori instead of passing through him
  ragdollOut() {
    const rd = this.uke.ragdoll; if (!rd.active) return;
    const A = capsules(this.tori).slice(0, 2), RAD = { head: 0.11, hips: 0.12, chest: 0.13, shL: 0.07, shR: 0.07, knL: 0.06, knR: 0.06 };
    let moved = false;
    for (const k in RAD) {
      const p = rd.p[k];
      for (const a of A) {
        const d = segSeg(a[0], a[1], p, p, _c1, _c2), min = a[2] + RAD[k] * 0.85;
        if (d < min && d > 1e-5) {
          const n = new V3().subVectors(p, _c1).normalize().multiplyScalar(min - d);
          p.add(n); rd.prev[k].addScaledVector(n, 0.6); moved = true;
        }
      }
    }
    if (moved) rd.apply();
  }

  startDrive() {
    const u = this.uke, rd = u.ragdoll;
    this.stage = 'drive'; this.driveT = 0;
    // the hip and shoulder throws: over the fulcrum, three quarters of a turn, and a little longer in the air
    this.over = this.drive.ang > 2.5 && !this.drive.noOver;
    if (this.over) { this.overAng = this.drive.overAng || this.drive.ang + 1.45; this.drive.dur *= 1.15; }
    rd.rootYaw = u.yaw;
    rd.start(new V3(), 0, 0.9);
    this.p0 = {}; this.kinPrev = {};
    for (const k of CORE.concat(Object.keys(LIMB_W))) { this.p0[k] = rd.p[k].clone(); this.kinPrev[k] = rd.p[k].clone(); }
    const g = this.g;
    if (this.opts.cinema !== false) { g.slowmo = Math.max(g.slowmo || 0, this.over ? 0.85 : 0.6); g.timeScale = 0.5; if (g.cam && g.cam.cinematic) g.cam.cinematic(this.uke, 1.7, { lookY: 0.7, height: 1.35, fov: 48 }); }
    g.audio.whoosh && g.audio.whoosh(9);
    this.twist = 0; this.twistDir = Math.random() < 0.5 ? 1 : -1;
    // the thrown man turns out of it by himself as often as the opponent does; L1 in the air gives the player more
    if (this.opts.partial) this.twist = 3.1;   // the throw goes through, but he turns in the air and lands on his belly
    else if (this.opts.twist !== false) {
      const r = Math.random(), p = J.twistChance ? J.twistChance(u, this.tori, this.power) : 0.25;
      this.twist = r < p ? 3.1 : r < p + 0.22 ? (this.over ? 1.2 : 1.55) : 0;   // onto the belly (no score) or onto the side
    }
    if (u.isPlayer && g.ui) g.ui.hitMarker('L1 — ВЫКРУТИТЬСЯ!', 0);
  }

  // the man in the air turns away from his back
  twistTry() {
    if (this.stage !== 'drive' || this.twistTried) return null;
    this.twistTried = true;
    if (this.twist > 3) return 'full';
    if (this.driveT / this.drive.dur > 0.75) return 'late';
    const p = J.twistChance ? J.twistChance(this.uke, this.tori, this.power, true) : 0.4;
    this.twist = Math.random() < p ? 3.1 : this.over ? 1.2 : 1.55;
    return this.twist > 3 ? 'full' : 'half';
  }

  // tori follows him down and holds him: one knee on the mat, the hands on the jacket
  pressStep(dt) {
    const tori = this.tori, uke = this.uke, p = uke.ragdoll.p, H = this.H;
    this.pressT += dt;
    const cx = (p.chest.x + p.hips.x) / 2, cz = (p.chest.z + p.hips.z) / 2;
    let sx = p.neck.x - p.hips.x, sz = p.neck.z - p.hips.z; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    let nx = -sz, nz = sx;
    if ((tori.pos.x - cx) * nx + (tori.pos.z - cz) * nz < 0) { nx = -nx; nz = -nz; }
    const tx = cx + nx * 0.5 * H / 1.8 * 1.0 - sx * 0.05, tz = cz + nz * 0.5 * H / 1.8 - sz * 0.05;
    const kk = Math.min(1, dt * 5);
    tori.pos.x += (tx - tori.pos.x) * kk; tori.pos.z += (tz - tori.pos.z) * kk;
    const want = Math.atan2(cx - tori.pos.x, cz - tori.pos.z);
    tori.yaw += M.wrap(want - tori.yaw) * kk;
    tori.body.root.position.copy(tori.pos); tori.body.root.rotation.set(0, tori.yaw, 0); tori.body.root.updateMatrixWorld(true);
    const ne = this.g.judoNe, SB = ne && ne.tori === tori && ne.sub, arm = SB && /руку/.test(SB.T.name);
    const grip = SB ? (arm ? { L: J.anchor(uke, 'sleeveL', new V3()), R: J.anchor(uke, 'elbowL', new V3()) } : { L: J.anchor(uke, 'collarR', new V3()), R: J.anchor(uke, 'collarL', new V3()) })
      : { L: J.anchor(uke, 'lapelR', new V3()), R: J.anchor(uke, 'sleeveL', new V3()) };
    J.applyRig(tori, SB ? SUBP : PRESS, grip);
    blendFrom(tori, this.sP, ease(this.pressT / 0.45));
  }

  // tori lets go and stands up
  toriUp() {
    const tori = this.tori, B = tori.body.B;
    tori._snap = {}; for (const [k, b] of Object.entries(B)) tori._snap[k] = b.quaternion.clone();
    tori._snapHips = B.hips.position.clone();
    tori.state = 'getup'; tori.getupT = 0; tori._blendDur = 0.5; tori.hitstun = 0; tori.gait = null;
    for (const side of ['L', 'R']) { const f = tori.foot[side]; tori._footRest(side, f.planted); f.stepping = false; f.t = 1; f.yaw = tori._restYaw(side); }
    Object.values(tori.sp).forEach((s) => { s.vel = 0; });
    tori.sp.crouch.snap(0.1 * tori.h);
    tori._judoBusy = false;
  }

  driveStep(dt) {
    const d = this.drive, u = this.uke, rd = u.ragdoll, k = this.k;
    this.driveT += dt; this.lastDt = dt;
    const s = cl(this.driveT / d.dur);
    // he twists out in the air: the turn about his own spine, to the side or onto the belly
    this.twistNow = (this.twistNow || 0) + ((this.twist || 0) - (this.twistNow || 0)) * Math.min(1, dt * 9);
    const tw = this.twistNow * ease((s - 0.25) / 0.75);
    const e = 0.55 * s * s * (3 - 2 * s) + 0.45 * s;   // keeps some speed at the end: he leaves the hands flying
    const pivot = new V3().copy(this.O).addScaledVector(this.Xu, d.pivot[0] * k).addScaledVector(this.Zu, d.pivot[2] * k); pivot.y = d.pivot[1] * k;
    const axis = new V3().addScaledVector(this.Xu, d.axis[0]).addScaledVector(this.Zu, d.axis[2]); axis.y = d.axis[1]; axis.normalize();
    const ang = d.ang * e;
    const push = new V3().addScaledVector(this.Xu, d.push[0] * k).addScaledVector(this.Zu, d.push[1] * k);
    rd.step(dt);
    let kin;
    if (this.over) {
      // his hips travel a curve: up onto tori's hip or back, over it, and down in front of him; the body turns
      // about the hips three quarters of a circle, so he comes down on his back with the legs still above him
      if (!this.path) {
        const P0 = this.p0.hips.clone(), Pt = pivot.clone(); Pt.y += (d.over != null ? d.over : 0.12) * k;
        const land = d.land || [d.pivot[0] + d.push[0], d.pivot[2] + 0.75];
        const P1 = this.w(land[0] * k, land[1] * k, new V3()); P1.y = 0.27 * k;
        this.path = [P0, Pt, P1];
      }
      const [P0, Pt, P1] = this.path, L0 = 2 * (e - 0.5) * (e - 1), L1 = -4 * e * (e - 1), L2 = 2 * e * (e - 0.5);
      const hc = new V3().addScaledVector(P0, L0).addScaledVector(Pt, L1).addScaledVector(P1, L2), A = this.overAng * e;
      kin = (key, out) => out.copy(this.p0[key]).sub(this.p0.hips).applyAxisAngle(axis, A).add(hc);
    } else kin = (key, out) => { out.copy(this.p0[key]).sub(pivot).applyAxisAngle(axis, ang).add(pivot).addScaledVector(push, e); out.y += d.lift * k * Math.sin(Math.PI * s) - (d.drop || 0) * k * e * e; return out; };   // drop: he rolls over the back and comes down in front
    const tc = kin('hips', new V3()), ta = kin('neck', new V3()).sub(tc).normalize();
    const twist = (out) => { if (Math.abs(tw) > 1e-3) out.sub(tc).applyAxisAngle(ta, tw * this.twistDir).add(tc); return out; };
    const tgt = this.tgt || (this.tgt = {});
    for (const key of CORE) twist(kin(key, tgt[key] || (tgt[key] = new V3())));
    // the limbs fly with the body (the legs over the top), a little loose
    for (const key in LIMB_W) {
      const v = kin(key, tgt[key] || (tgt[key] = new V3()));
      if (key[0] === 'k' || key[0] === 'f') {
        const whip = (d.ang > 0 ? (this.over ? 0.3 : 0.55) : -0.35) * Math.sin(Math.PI * s) * (1 - 0.6 * Math.min(1, Math.abs(tw) / 2));
        v.sub(tc).applyAxisAngle(axis, whip).add(tc);
      }
      twist(v);
    }
    // he rolls over tori, not through him: the whole body is lifted out of tori's back and hip
    if (this.over) {
      // on the way up and over he lies on tori; coming down in front he is free of him
      const caps = capsules(this.tori), sep = this.sepU || (this.sepU = new V3()), free = ease((s - 0.62) / 0.3);
      sep.multiplyScalar(Math.pow(0.03, dt) * (1 - 0.5 * free));
      if (free < 1)
      for (const key of ['hips', 'chest', 'head', 'shL', 'shR', 'hpL', 'hpR']) {
        const p = _v.copy(tgt[key]).add(sep);
        for (const c of caps) {
          const dd = segSeg(c[0], c[1], p, p, _c1, _c2), min = c[2] + (RADIUS[key] || 0.08) * 0.9;
          if (dd < min && dd > 1e-5) { _np.subVectors(p, _c1).normalize().multiplyScalar((min - dd) * (1 - free)); sep.add(_np); p.add(_np); }
        }
      }
      for (const key in tgt) tgt[key].add(sep);
    }
    for (const key of CORE) {
      const p = rd.p[key], v = tgt[key];
      if (v.y < 0.1) v.y = 0.1;
      rd.prev[key].copy(this.kinPrev[key]);
      p.copy(v); this.kinPrev[key].copy(v);
    }
    for (const key in LIMB_W) {
      const w = LIMB_W[key], p = rd.p[key], v = tgt[key];
      if (v.y < 0.06) v.y = 0.06;
      p.lerp(v, w); rd.prev[key].lerp(this.kinPrev[key], w); this.kinPrev[key].copy(v);
    }
    rd.apply();
    u.pos.set(rd.p.hips.x, 0, rd.p.hips.z);
    this.track(dt);
    if (s >= 1) this.release();
  }

  release() {
    const u = this.uke;
    // he comes down flat: the fall keeps its speed, most of the turn is spent, so he does not roll on over his head
    if (this.over) {
      const rd = u.ragdoll, dh = new V3().subVectors(rd.p.hips, rd.prev.hips);
      // the force of the throw is the speed he was carried with through the air, not the last few centimetres:
      // the length of the arc and the turn, over the time the drive took (a stronger throw is a faster one)
      if (this.path) {
        const [P0, Pt, P1] = this.path, q = new V3(), prevQ = P0.clone(); let len = 0;
        for (let i = 1; i <= 12; i++) { const e = i / 12; q.set(0, 0, 0).addScaledVector(P0, 2 * (e - 0.5) * (e - 1)).addScaledVector(Pt, -4 * e * (e - 1)).addScaledVector(P1, 2 * e * (e - 0.5)); len += q.distanceTo(prevQ); prevQ.copy(q); }
        this.vThrow = (len + 0.35 * this.overAng) / this.drive.dur;
      }
      for (const key in rd.p) {
        const d = _np.subVectors(rd.p[key], rd.prev[key]).sub(dh).multiplyScalar(0.35).add(dh);
        rd.prev[key].copy(rd.p[key]).sub(d);
      }
    }
    this.stage = 'fall'; this.released = true; this.releaseT = this.t;
    u.state = 'ko'; u.downPhase = 'fall'; u.downTimer = 0; u.getupAt = 99; this.keepDown = true; u.rise = null; u.fall = null; u._judoBusy = true;
  }

  fallStep(dt) {
    this.uke.getupAt = this.keepDown ? 99 : this.uke.getupAt;
    if (this.t - this.releaseT < 0.6) this.ragdollOut();
    this.track(dt);
    if (this.landT != null && !this.landFx) {
      this.landFx = true;
      const g = this.g, p = cl(this.vImpact * (this.tech.vk || 1) / 4, 0.2, 1);
      g.audio.impact && g.audio.impact(6 + 10 * p, 'body', false);
      g.cam.shake && g.cam.shake(0.25 + 0.5 * p);
      g.arena && g.arena.excite(0.3 * p);
      g.hitstop = Math.max(g.hitstop || 0, 0.04 + 0.05 * p);
      const rp = this.uke.ragdoll.p, c = new V3().addVectors(rp.hips, rp.chest).multiplyScalar(0.5);
      J.matHit(g, c.x, c.z, p);
    }
    if (this.landT != null && !this.uke._lie) this.uke._lie = { t: 0 };
  }

  // the speed at which the body first touches the mat
  track(dt) {
    const rd = this.uke.ragdoll;
    for (const k of CONTACT) {
      const y = rd.p[k].y;
      if (this.yPrev[k] == null) { this.yPrev[k] = y; this.vyPrev[k] = 0; continue; }
      const vy = (y - this.yPrev[k]) / dt;
      if (!this.contact[k] && y <= RADIUS[k] + 0.04) { this.contact[k] = true; this.vImpact = Math.max(this.vImpact, -this.vyPrev[k], -vy, this.vThrow || 0); if (this.landT == null) this.landT = this.t; }
      this.vyPrev[k] = vy; this.yPrev[k] = y;
    }
  }

  // how he lies: chest up (on the back) or not
  lie() {
    const p = this.uke.ragdoll.p;
    const left = new V3().subVectors(p.shL, p.shR), up = new V3().subVectors(p.neck, p.hips);
    const front = left.cross(up).normalize();
    return { back: front.y, low: p.hips.y, head: p.head.y, hipsX: p.hips.x, hipsZ: p.hips.z };
  }

  judge(dt) {
    const rd = this.uke.ragdoll;
    if (this.landT == null && this.t - this.releaseT < 1.6) return;
    if (this.landT != null && this.t - this.landT < 0.4 && rd.settle > 0.01) return;
    const L = this.lie();
    const ukeDef = ((this.uke.cfg.stats.defense || 60) + (this.uke.cfg.stats.wrestling || 60)) / 200;
    const v = this.vImpact * ((this.over && this.tech.vkOver) || this.tech.vk || 1) * this.tech.power * (this.opts.power || 1) * (1.08 - 0.28 * ukeDef);
    let score = 'none';
    if (L.back > 0.6 && v > 3.6) score = 'ippon';
    else if (L.back > 0.45 && v > 1.3) score = 'wazaari';
    else if (L.back > 0.15 || (v > 1.0 && Math.abs(L.back) < 0.5)) score = 'yuko';   // on the side, or on the back without force
    if (J.forceScore) score = J.forceScore;
    this.result = { score, back: L.back, v, vRaw: this.vImpact };
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const tori = this.tori, uke = this.uke;
    for (const f of [tori, uke]) f._judoBusy = false;
    // tori keeps the pressure on him until he gets up, or goes back to the stance
    if (this.pressing) { tori._judoBusy = true; this.g.judoPress = this; }
    else this.toriUp();
    if (this.fail) {
      const B2 = uke.body.B;
      uke._snap = {}; for (const [k, b] of Object.entries(B2)) uke._snap[k] = b.quaternion.clone();
      uke._snapHips = B2.hips.position.clone();
      uke.state = 'getup'; uke.getupT = 0; uke._blendDur = 0.5; uke.hitstun = 0; uke.gait = null;
      for (const side of ['L', 'R']) { const f = uke.foot[side]; uke._footRest(side, f.planted); f.stepping = false; f.t = 1; f.yaw = uke._restYaw(side); }
      Object.values(uke.sp).forEach((s) => { s.vel = 0; });
      uke.sp.crouch.snap(0.1 * uke.h);
    }
    if (this.opts.onDone) this.opts.onDone(this);
  }
}
J.ThrowRun = ThrowRun;

// ---------------------------------------------------------------- the breakfall and how he lies
// held in the ragdoll itself, so it stays until he gets up: on the back the arms slap the mat at
// 45 degrees, the chin is tucked, the knees come up with the feet flat; on the side the top leg
// bends; face down the forearms take the fall
const _a = new V3(), _b = new V3(), _u = new V3(), _l = new V3(), _n = new V3();
function pull(rd, k, target, a) {
  const p = rd.p[k];
  _a.subVectors(target, p).multiplyScalar(a);
  p.add(_a); rd.prev[k].lerp(p, 0.25);
}
function lieHold(rd, dt) {
  const L = rd.f._lie; L.t += dt;
  const p = rd.p, d = rd.f.body.dims, t = L.t;
  _u.subVectors(p.neck, p.hips).normalize();
  _l.subVectors(p.shL, p.shR).normalize();
  _n.crossVectors(_l, _u).normalize();
  const arm = (d.upper + d.fore) * 0.95;
  const slap = Math.min(1, t / 0.12), legs = Math.min(1, t / 0.45);
  const rate = Math.min(1, dt * 14);
  if (_n.y > 0.35) {   // on the back
    for (const [S, s] of [['L', 1], ['R', -1]]) {
      _b.copy(_l).multiplyScalar(s * 0.72).addScaledVector(_u, -0.5).normalize().multiplyScalar(arm).add(p['sh' + S]); _b.y = 0.035;
      pull(rd, 'ha' + S, _b, rate * slap);
      _b.add(p['sh' + S]).multiplyScalar(0.5); _b.y = Math.max(0.05, _b.y);
      pull(rd, 'el' + S, _b, rate * slap * 0.7);
      _b.copy(_u).multiplyScalar(-0.45).addScaledVector(_n, 0.85).addScaledVector(_l, s * 0.22).normalize().multiplyScalar(d.thigh).add(p['hp' + S]);
      pull(rd, 'kn' + S, _b, rate * legs * 0.4);
      _a.copy(_u).multiplyScalar(-0.7).addScaledVector(_n, -0.7).addScaledVector(_l, s * 0.08).normalize().multiplyScalar(d.shin);
      _b.copy(p['kn' + S]).add(_a); _b.y = Math.max(0.05, _b.y);
      pull(rd, 'ft' + S, _b, rate * legs * 0.4);
    }
    // the back stays on the mat: he does not sit up
    _b.copy(p.chest); _b.y = Math.min(_b.y, 0.13); pull(rd, 'chest', _b, rate * legs * 0.5);
    _b.copy(p.neck); _b.y = Math.min(_b.y, 0.12); pull(rd, 'neck', _b, rate * legs * 0.35);
    if (t < 1.6) {   // the chin on the chest: the head never hits the mat
      const hk = (t < 1.0 ? 1 : (1.6 - t) / 0.6) * 0.22;
      _b.copy(_u).multiplyScalar(0.7).addScaledVector(_n, 0.7).normalize().multiplyScalar(p.head.distanceTo(p.neck)).add(p.neck);
      pull(rd, 'head', _b, rate * hk);
    }
  } else if (_n.y < -0.35) {   // face down: the forearms and the hands take it
    for (const [S, s] of [['L', 1], ['R', -1]]) {
      _b.copy(_u).multiplyScalar(0.55).addScaledVector(_l, s * 0.5).normalize().multiplyScalar(arm * 0.8).add(p['sh' + S]); _b.y = 0.035;
      pull(rd, 'ha' + S, _b, rate * slap * 0.8);
      _b.copy(p['sh' + S]).addScaledVector(_l, s * 0.12 * arm); _b.y = 0.05;
      pull(rd, 'el' + S, _b, rate * slap * 0.5);
    }
  } else {   // on the side: the lower arm slaps, the top knee comes forward
    const top = _l.y > 0 ? 'L' : 'R', low = top === 'L' ? 'R' : 'L', sl = low === 'L' ? 1 : -1;
    _b.copy(_l).multiplyScalar(sl * 0.6).addScaledVector(_n, 0.3).addScaledVector(_u, -0.4).normalize().multiplyScalar(arm).add(p['sh' + low]); _b.y = 0.035;
    pull(rd, 'ha' + low, _b, rate * slap);
    _b.copy(_u).multiplyScalar(-0.3).addScaledVector(_n, 0.9).normalize().multiplyScalar(d.thigh).add(p['hp' + top]);
    pull(rd, 'kn' + top, _b, rate * legs * 0.5);
  }
}
// the mat answers a body that lands on it: a wave of light across it and a puff of dust from the cover
const RINGS = [];
let ringGeo = null;
J.matHit = function (g, x, z, p) {
  if (!g.scene) return;
  ringGeo = ringGeo || new THREE.RingGeometry(0.82, 1, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 * (0.5 + p), depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(ringGeo, mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); m.scale.setScalar(0.25);
  g.scene.add(m); RINGS.push({ m, t: 0, dur: 0.45 + 0.25 * p, r: 0.9 + 0.9 * p, g });
  if (g.fx && g.fx._spawn) {
    const n = Math.round(10 + 22 * p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * (0.8 + 1.6 * p);
      g.fx._spawn(new V3(x + Math.cos(a) * 0.25, 0.04, z + Math.sin(a) * 0.25), new V3(Math.cos(a) * sp, 0.4 + Math.random() * 0.9 * p, Math.sin(a) * sp), 0.25 + Math.random() * 0.3, 0xf3ead2, false);
    }
  }
};
J.ringsTick = function (dt) {
  for (let i = RINGS.length - 1; i >= 0; i--) {
    const r = RINGS[i]; r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    r.m.scale.setScalar(0.25 + r.r * (1 - (1 - k) * (1 - k)));
    r.m.material.opacity *= Math.pow(0.02, dt / r.dur);
    if (k >= 1) { r.g.scene.remove(r.m); r.m.material.dispose(); RINGS.splice(i, 1); }
  }
};
const GP = UFC.Game.prototype, gStep = GP._step;
GP._step = function (dt) { gStep.call(this, dt); if (RINGS.length) J.ringsTick(dt); };
const R = UFC.Ragdoll.prototype, rStep = R.step, rStart = R.start, rStop = R.stop;
R.step = function (dt) { rStep.call(this, dt); if (this.active && this.f._lie && UFC.judo) lieHold(this, dt); };
R.start = function (...a) { this.f._lie = null; return rStart.apply(this, a); };
R.stop = function (...a) { this.f._lie = null; return rStop.apply(this, a); };
})();

