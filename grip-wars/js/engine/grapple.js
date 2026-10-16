//# sourceURL=ufc/grapple.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;

// ===========================================================================
// Grappling: a pair state machine. Both fighters are posed relative to one
// shared anchor; every change of position is a timed, contested transition
// that blends bones and roots (no teleporting).
//   a = the fighter in control (top / shooter / clinch initiator)
//   b = the other fighter
// Anchor for ground positions: bottom fighter's pelvis, +Z toward his feet.
// ===========================================================================

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'snL', 'thR', 'snR', 'ftL', 'ftR'];
const P = (hipsY, hips, spine, chest, neck, head, uaL, faL, uaR, faR, thL, snL, thR, snR, ftL, ftR) =>
  ({ hipsY, hips, spine, chest, neck, head, uaL, faL, uaR, faR, thL, snL, thR, snR, ftL, ftR });
const Z = [0, 0, 0];
const ARMS_UP = [[-1.2, 0, 0.35], [-2.0, 0, 0], [-1.2, 0, -0.35], [-2.0, 0, 0]];

const POSE = {
  clinchA: P(0.5, [0.3, 0, 0], [0.2, 0, 0], [0.15, 0, 0], [-0.3, 0, 0], [-0.1, 0, 0], ...ARMS_UP, [-0.35, 0, 0.1], [0.6, 0, 0], [-0.1, 0, -0.1], [0.45, 0, 0], [0.25, 0, 0], [0.15, 0, 0]),
  clinchB: P(0.51, [0.2, 0, 0], [0.2, 0, 0], [0.1, 0, 0], [-0.2, 0, 0], [-0.1, 0, 0], ...ARMS_UP, [-0.25, 0, 0.1], [0.5, 0, 0], [-0.05, 0, -0.1], [0.4, 0, 0], [0.2, 0, 0], [0.15, 0, 0]),
  cageA: P(0.48, [0.45, 0, 0], [0.2, 0, 0], [0.15, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0], ...ARMS_UP, [-0.6, 0, 0.12], [0.75, 0, 0], [0.1, 0, -0.12], [0.55, 0, 0], [0.3, 0, 0], [0.4, 0, 0]),
  cageB: P(0.5, [-0.05, 0, 0], [0.1, 0, 0], [0.05, 0, 0], [-0.1, 0, 0], [0, 0, 0], ...ARMS_UP, [-0.3, 0, 0.12], [0.5, 0, 0], [-0.2, 0, -0.12], [0.45, 0, 0], [0.2, 0, 0], [0.2, 0, 0]),
  shotA: P(0.29, [0.9, 0, 0], [0.35, 0, 0], [0.25, 0, 0], [-0.6, 0, 0], [-0.3, 0, 0], ...ARMS_UP, [-1.5, 0, 0.15], [1.5, 0, 0], [0.35, 0, -0.1], [1.6, 0, 0], [0, 0, 0], [0.9, 0, 0]),
  shotB: P(0.52, [-0.25, 0, 0], [-0.1, 0, 0], [-0.1, 0, 0], [0.2, 0, 0], [0, 0, 0], ...ARMS_UP, [0.2, 0, 0.12], [0.3, 0, 0], [0.05, 0, -0.12], [0.25, 0, 0], [0, 0, 0], [0, 0, 0]),
  sprawledA: P(0.28, [1.0, 0, 0], [0.4, 0, 0], [0.3, 0, 0], [-0.2, 0, 0], [0, 0, 0], ...ARMS_UP, [-0.3, 0, 0.2], [1.57, 0, 0], [-0.3, 0, -0.2], [1.57, 0, 0], [0.9, 0, 0], [0.9, 0, 0]),
  sprawlB: P(0.3, [1.35, 0, 0], [0.1, 0, 0], [0.05, 0, 0], [-0.4, 0, 0], [-0.2, 0, 0], ...ARMS_UP, [0.1, 0, 0.3], [0.2, 0, 0], [0.1, 0, -0.3], [0.2, 0, 0], [1.0, 0, 0], [1.0, 0, 0]),
  flatBot: P(0.08, [-1.5, 0, 0], [0.05, 0, 0], [0.05, 0, 0], [0.25, 0, 0], [0.1, 0, 0], [0.3, 0, 0.5], [-1.2, 0, 0], [0.3, 0, -0.5], [-1.2, 0, 0], [-0.25, 0, 0.25], [0.55, 0, 0], [-0.25, 0, -0.25], [0.55, 0, 0], [0.3, 0, 0], [0.3, 0, 0]),
  guardBot: P(0.1, [-1.35, 0, 0], [0.1, 0, 0], [0.1, 0, 0], [0.35, 0, 0], [0.15, 0, 0], [-0.8, 0, 0.3], [-1.4, 0, 0], [-0.8, 0, -0.3], [-1.4, 0, 0], [-1.1, 0, 0.45], [1.3, 0, 0], [-1.1, 0, -0.45], [1.3, 0, 0], [0.3, 0, 0], [0.3, 0, 0]),
  guardTop: P(0.29, [0.7, 0, 0], [0.25, 0, 0], [0.15, 0, 0], [-0.45, 0, 0], [-0.2, 0, 0], ...ARMS_UP, [-0.7, 0, 0.22], [1.57, 0, 0], [-0.7, 0, -0.22], [1.57, 0, 0], [0.9, 0, 0], [0.9, 0, 0]),
  halfBot: P(0.09, [-1.45, 0, 0.35], [0.05, 0, 0.1], [0.05, 0, 0], [0.3, 0, 0], [0.1, 0, 0], [-1.2, 0, 0.4], [-1.6, 0, 0], [0.2, 0, -0.5], [-1.3, 0, 0], [-0.9, 0, 0.4], [1.4, 0, 0], [-0.3, 0, -0.1], [0.8, 0, 0], [0.3, 0, 0], [0.3, 0, 0]),
  halfTop: P(0.24, [1.25, 0, 0.1], [0.1, 0, 0], [0.05, 0, 0], [-0.2, 0, 0], [-0.1, 0, 0], ...ARMS_UP, [-1.2, 0, 0.3], [1.4, 0, 0], [-1.0, 0, -0.35], [1.57, 0, 0], [0.9, 0, 0], [0.9, 0, 0]),
  sideTop: P(0.24, [1.35, 0, 0], [0.05, 0, 0], [0, 0, 0], [-0.3, 0, 0], [-0.1, 0, 0], ...ARMS_UP, [-1.0, 0, 0.5], [1.6, 0, 0], [-1.4, 0, -0.2], [1.6, 0, 0], [0.9, 0, 0], [0.9, 0, 0]),
  mountTop: P(0.22, [0.2, 0, 0], [0.15, 0, 0], [0.1, 0, 0], [-0.35, 0, 0], [-0.15, 0, 0], ...ARMS_UP, [-0.5, 0, 0.95], [2.2, 0, 0], [-0.5, 0, -0.95], [2.2, 0, 0], [1.2, 0, 0], [1.2, 0, 0]),
  seatedBot: P(0.09, [-0.35, 0, 0], [0.2, 0, 0], [0.15, 0, 0], [0.1, 0, 0], [0, 0, 0], [-0.6, 0, 0.4], [-1.4, 0, 0], [-0.6, 0, -0.4], [-1.4, 0, 0], [-1.35, 0, 0.25], [0.6, 0, 0], [-1.35, 0, -0.25], [0.6, 0, 0], [0.2, 0, 0], [0.2, 0, 0]),
  backTop: P(0.09, [-0.25, 0, 0], [0.25, 0, 0], [0.35, 0, 0], [-0.1, 0, 0], [0, 0, 0], ...ARMS_UP, [-1.25, 0, 0.55], [1.0, 0, 0], [-1.25, 0, -0.55], [1.0, 0, 0], [0.4, 0, 0], [0.4, 0, 0]),
  armbarBot: P(0.08, [-1.5, 0, 0], [0.05, 0, 0], [0.05, 0, 0], [0.3, 0, 0], [0.1, 0, 0], [0.3, 0, 0.5], [-1.4, 0, 0], [-1.74, 0, 0], [0, 0, 0], [-0.4, 0, 0.3], [0.9, 0, 0], [-0.6, 0, -0.3], [1.1, 0, 0], [0.3, 0, 0], [0.3, 0, 0]),
  armbarTop: P(0.08, [-1.45, 0, 0], [0.05, 0, 0], [0.05, 0, 0], [0.35, 0, 0], [0.15, 0, 0], ...ARMS_UP, [-0.5, 0, 0.14], [0.3, 0, 0], [-0.38, 0, -0.14], [0.4, 0, 0], [0.3, 0, 0], [0.3, 0, 0]),
  triangleBot: P(0.12, [-1.25, 0, 0], [0.15, 0, 0], [0.15, 0, 0], [0.45, 0, 0], [0.2, 0, 0], [-1.3, 0, 0.3], [-1.6, 0, 0], [-1.3, 0, -0.3], [-1.6, 0, 0], [-1.7, 0, 0.6], [1.7, 0, 0], [-1.6, 0, -0.4], [1.2, 0, 0], [0.4, 0, 0], [0.4, 0, 0]),
  triangleTop: P(0.27, [1.1, 0, 0], [0.3, 0, 0], [0.3, 0, 0], [0.15, 0, 0], [0.2, 0, 0], ...ARMS_UP, [-0.7, 0, 0.22], [1.57, 0, 0], [-0.7, 0, -0.22], [1.57, 0, 0], [0.9, 0, 0], [0.9, 0, 0]),
  kimuraBot: P(0.08, [-1.5, 0, 0], [0.05, 0, 0], [0.05, 0, 0], [0.25, 0, 0], [0.1, 0, 0], [0.9, 0, 1.0], [-1.8, 0, 0], [0.3, 0, -0.5], [-1.2, 0, 0], [-0.5, 0, 0.25], [1.0, 0, 0], [-0.3, 0, -0.25], [0.6, 0, 0], [0.3, 0, 0], [0.3, 0, 0]),
  guillB: P(0.4, [0.75, 0, 0], [0.2, 0, 0], [0.1, 0, 0], [-0.3, 0, 0], [-0.1, 0, 0], ...ARMS_UP, [-0.7, 0, 0.2], [1.1, 0, 0], [-0.2, 0, -0.2], [0.8, 0, 0], [0.4, 0, 0], [0.3, 0, 0]),
  guillA: P(0.3, [1.15, 0, 0], [0.35, 0, 0], [0.3, 0, 0], [0.2, 0, 0], [0.15, 0, 0], ...ARMS_UP, [-0.55, 0, 0.2], [1.57, 0, 0], [-0.55, 0, -0.2], [1.57, 0, 0], [0.9, 0, 0], [0.9, 0, 0]),
  standUp: P(0.45, [0.1, 0, 0], [0.12, 0, 0], [0.1, 0, 0], [-0.05, 0, 0], [0, 0, 0], ...ARMS_UP, [-0.25, 0, 0.05], [0.75, 0, 0], [-0.8, 0, -0.05], [0.95, 0, 0], [0, 0, 0], [0, 0, 0]),
};
const C = {};
const _e = new E(0, 0, 0, 'YXZ');
for (const [k, p] of Object.entries(POSE)) {
  C[k] = { hipsY: p.hipsY, q: {} };
  for (const b of BONES) { const r = p[b] || Z; C[k].q[b] = new Q().setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')); }
}
UFC.GPOSE = POSE;

// Position table: poses + root offsets in anchor frame [right, fwd, yawOffset]
// (metres at 1.8 m body height) + limb contacts solved with IK.
const POS = {
  clinch: { name: 'КЛИНЧ', ground: false, a: ['clinchA', [0, -0.26, 0]], b: ['clinchB', [0, 0.26, Math.PI]] },
  cage: { name: 'КЛИНЧ У СЕТКИ', ground: false, a: ['cageA', [0, -0.3, 0]], b: ['cageB', [0, 0.18, Math.PI]] },
  shot: { name: 'ПРОХОД В НОГИ', ground: false, a: ['shotA', [0, -0.2, 0]], b: ['shotB', [0, 0.32, Math.PI]] },
  sprawl: { name: 'СПРОЛ', ground: false, a: ['sprawledA', [0, -0.28, 0]], b: ['sprawlB', [0, 0.3, Math.PI]] },
  guard: { name: 'ГАРД', ground: true, rank: 1, a: ['guardTop', [0, 0.36, Math.PI]], b: ['guardBot', [0, 0, 0]] },
  half: { name: 'ПОЛУГАРД', ground: true, rank: 2, a: ['halfTop', [0.05, 0.2, Math.PI]], b: ['halfBot', [0, 0, 0]] },
  side: { name: 'БОКОВОЙ КОНТРОЛЬ', ground: true, rank: 3, a: ['sideTop', [0.33, -0.12, -Math.PI / 2]], b: ['flatBot', [0, 0, 0]] },
  mount: { name: 'МАУНТ', ground: true, rank: 4, a: ['mountTop', [0, 0.02, Math.PI]], b: ['flatBot', [0, 0, 0]] },
  back: { name: 'СПИНА', ground: true, rank: 5, a: ['backTop', [0, -0.17, 0]], b: ['seatedBot', [0, 0, 0]] },
  // submissions
  armbar: { name: 'РЫЧАГ ЛОКТЯ', ground: true, sub: true, a: ['armbarTop', [-0.2, -0.22, Math.PI / 2]], b: ['armbarBot', [0, 0, 0]] },
  rnc: { name: 'УДУШЕНИЕ СЗАДИ', ground: true, sub: true, a: ['backTop', [0, -0.17, 0]], b: ['seatedBot', [0, 0, 0]] },
  kimura: { name: 'КИМУРА', ground: true, sub: true, a: ['sideTop', [0.33, -0.12, -Math.PI / 2]], b: ['kimuraBot', [0, 0, 0]] },
  triangle: { name: 'ТРЕУГОЛЬНИК', ground: true, sub: true, a: ['triangleTop', [0, 0.34, Math.PI]], b: ['triangleBot', [0, 0, 0]] },
  guillotine: { name: 'ГИЛЬОТИНА', ground: false, sub: true, a: ['guillA', [0, -0.22, 0]], b: ['guillB', [0, 0.3, Math.PI]] },
};
UFC.GRAPPLE_POS = POS;
const NEXT = { guard: 'half', half: 'side', side: 'mount', mount: 'back' };
const ESCAPE = { back: 'guard', mount: 'half', side: 'guard', half: 'guard', guard: 'STAND' };
const SUB_FROM = { mount: { sub: 'armbar', by: 'a' }, back: { sub: 'rnc', by: 'a' }, side: { sub: 'kimura', by: 'a' }, guard: { sub: 'triangle', by: 'b' }, sprawl: { sub: 'guillotine', by: 'b' } };
UFC.SUB_NAMES = { armbar: 'Рычаг локтя', rnc: 'Удушение сзади', kimura: 'Кимура', triangle: 'Треугольник', guillotine: 'Гильотина' };

const skill = (f, k) => ((f.cfg.stats[k] == null ? 60 : f.cfg.stats[k]) / 100);

const _v = new V3(), _w = new V3(), _q = new Q(), _q2 = new Q();

class Grapple {
  constructor(game, a, b, pos, anchor, fromLive) {
    this.game = game; this.a = a; this.b = b;
    this.pos = pos;
    this.anchor = anchor;           // {x, z, yaw}
    this.t = 0; this.idleT = 0;
    this.attempt = null;             // contested transition in progress
    this.trans = null;               // animated blend between positions
    this.sub = null;                 // submission struggle
    this.strikes = new Map();
    this.controlT = 0;
    for (const f of [a, b]) {
      f.cancelStrike(); f.state = 'grapple'; f.block = 'none'; f.vel.set(0, 0, 0);
      f.gnp = null; f.gnpBy = null;
    }
    this._startTrans(pos, fromLive ? 0.4 : 0.001, null, true);
  }

  get def() { return POS[this.pos]; }
  scale(f) { return f.h / 1.8; }

  // ---------------------------------------------------------------- posing
  _snapFighter(f) {
    const B = f.body.B, s = { q: {}, hipsPos: B.hips.position.clone(), pos: f.pos.clone(), yaw: f.yaw };
    for (const n of BONES) s.q[n] = B[n].quaternion.clone();
    return s;
  }

  _startTrans(to, dur, onDone, fromLive) {
    this.posT = 0;
    this.trans = { from: { a: this._snapFighter(this.a), b: this._snapFighter(this.b) }, to, t: 0, dur, onDone, live: fromLive };
    this.pos = to;
  }

  _rootFor(role, posName, out) {
    const d = POS[posName][role], A = this.anchor, f = this[role], k = (this.b.h + this.a.h) / 3.6;
    const rx = Math.cos(A.yaw), rz = -Math.sin(A.yaw), fx = Math.sin(A.yaw), fz = Math.cos(A.yaw);
    out.x = A.x + (rx * d[1][0] + fx * d[1][1]) * k;
    out.z = A.z + (rz * d[1][0] + fz * d[1][1]) * k;
    out.yaw = A.yaw + d[1][2];
    void f;
    return out;
  }

  _pose(role, dt) {
    const f = this[role], B = f.body.B, root = f.body.root, h = f.h, tr = this.trans;
    const cur = POS[this.pos][role][0];
    const target = this._rootFor(role, this.pos, { x: 0, z: 0, yaw: 0 });
    let w = 1;
    if (tr) w = M.smooth(Math.min(1, tr.t / tr.dur));
    const from = tr ? tr.from[role] : null;
    if (from) {
      f.pos.set(M.lerp(from.pos.x, target.x, w), 0, M.lerp(from.pos.z, target.z, w));
      f.yaw = from.yaw + M.wrap(target.yaw - from.yaw) * w;
    } else { f.pos.set(target.x, 0, target.z); f.yaw = target.yaw; }
    root.position.copy(f.pos); root.rotation.set(0, f.yaw, 0);
    const pose = C[cur];
    for (const n of BONES) {
      if (from) B[n].quaternion.slerpQuaternions(from.q[n], pose.q[n], w);
      else B[n].quaternion.copy(pose.q[n]);
    }
    for (const s of ['L', 'R']) B['hand' + s].quaternion.identity();
    if (from) B.hips.position.lerpVectors(from.hipsPos, _v.set(0, pose.hipsY * h, 0), w);
    else B.hips.position.set(0, pose.hipsY * h, 0);
    // life: breathing and effort
    const effort = (this.attempt && this.attempt.who === f) || (this.sub) ? 1 : 0.35;
    B.chest.quaternion.multiply(_q.setFromEuler(_e.set(Math.sin(f.time * 2.2 + (role === 'a' ? 0 : 1.3)) * 0.035 * effort, 0, 0, 'YXZ')));
    root.updateMatrixWorld(true);
    return w;
  }

  // IK contacts: hands / feet onto the other fighter
  _contacts(w) {
    const a = this.a, b = this.b, pos = this.pos;
    const ik = (f, limb, target, pole) => {
      const Bf = f.body.B, d = f.body.dims, root = f.body.root;
      const arm = limb === 'L' || limb === 'R';
      const side = arm ? limb : limb.slice(1);
      const upper = arm ? Bf['ua' + side] : Bf['th' + side], lower = arm ? Bf['fa' + side] : Bf['sn' + side];
      const cur = arm ? Bf['hand' + side].getWorldPosition(new V3()) : Bf['ft' + side].getWorldPosition(new V3());
      const t = cur.lerp(target, w);
      const p = pole.clone().applyQuaternion(root.quaternion);
      UFC.solveTwoBone(upper, lower, t, p, arm ? d.upper : d.thigh, arm ? d.fore : d.shin, true);
      if (arm) Bf['hand' + side].quaternion.identity();
      root.updateMatrixWorld(true);
    };
    const W = (f, bone, x, y, z) => f.body.B[bone].localToWorld(new V3(x * f.h, y * f.h, z * f.h));
    const down = new V3(0.4, -1, -0.3), downR = new V3(-0.4, -1, -0.3);
    const tap = this.sub && this.sub.tapT != null ? Math.abs(Math.sin(this.sub.tapT * 10)) * 0.08 : 0;
    switch (pos) {
      case 'clinch': case 'cage':
        ik(a, 'L', W(b, 'neck', 0.035, 0.03, -0.045), down); ik(a, 'R', W(b, 'neck', -0.035, 0.03, -0.045), downR);
        ik(b, 'L', W(a, 'uaR', 0, -0.09, 0.02), down); ik(b, 'R', W(a, 'uaL', 0, -0.09, 0.02), downR);
        break;
      case 'shot':
        ik(a, 'L', W(b, 'thR', 0.0, -0.1, -0.05), down); ik(a, 'R', W(b, 'thL', 0.0, -0.1, -0.05), downR);
        ik(b, 'L', W(a, 'chest', 0.07, 0.08, -0.07), down); ik(b, 'R', W(a, 'chest', -0.07, 0.08, -0.07), downR);
        break;
      case 'sprawl': case 'guillotine': {
        const g = pos === 'guillotine';
        ik(b, 'L', W(a, g ? 'neck' : 'chest', g ? -0.03 : 0.07, g ? 0.02 : 0.06, g ? 0.06 : -0.08), down);
        ik(b, 'R', W(a, g ? 'neck' : 'chest', g ? 0.03 : -0.07, g ? 0.02 : 0.06, g ? 0.07 : -0.08), downR);
        break;
      }
      case 'guard':
        ik(b, 'fL', W(a, 'spine', 0.03, 0.02, -0.11), new V3(0.4, 0.3, 1)); ik(b, 'fR', W(a, 'spine', -0.03, 0.0, -0.11), new V3(-0.4, 0.3, 1));
        ik(a, 'L', W(b, 'chest', 0.07, 0.06, 0.09), down); ik(a, 'R', W(b, 'chest', -0.07, 0.06, 0.09), downR);
        ik(b, 'L', W(a, 'uaR', 0, -0.1, 0), down); ik(b, 'R', W(a, 'uaL', 0, -0.1, 0), downR);
        break;
      case 'triangle':
        ik(b, 'fL', W(a, 'neck', -0.02, 0.02, -0.07), new V3(0.5, 0.5, 1)); ik(b, 'fR', W(a, 'neck', 0.04, -0.02, -0.08), new V3(-0.5, 0.5, 1));
        ik(b, 'L', W(a, 'head', 0.03, 0.06, -0.05), down); ik(b, 'R', W(a, 'head', -0.03, 0.06, -0.05), downR);
        ik(a, 'L', W(b, 'chest', 0.06, 0.04, 0.09), down);
        break;
      case 'half':
        ik(a, 'L', W(b, 'neck', 0.0, 0.02, -0.06), down); ik(a, 'R', W(b, 'hips', -0.1, 0.0, 0.05), downR);
        ik(b, 'L', W(a, 'neck', 0.03, 0.0, 0.04), down); ik(b, 'R', W(a, 'hips', 0.05, 0.0, 0.03), downR);
        break;
      case 'side': case 'kimura':
        if (pos === 'kimura') {
          ik(b, 'L', W(b, 'hips', 0.12, 0.02, -0.06), new V3(1, 0, 0));
          const wrist = b.body.B.handL.getWorldPosition(new V3());
          ik(a, 'L', wrist, down); ik(a, 'R', wrist.clone().add(new V3(0, 0.05 * a.h, 0)), downR);
        } else {
          ik(a, 'L', W(b, 'neck', 0.05, 0.02, -0.05), down); ik(a, 'R', W(b, 'hips', 0.08, 0.02, 0.05), downR);
          ik(b, 'L', W(a, 'neck', 0.0, 0.02, 0.05), down);
        }
        break;
      case 'mount':
        ik(a, 'L', W(b, 'chest', 0.08, 0.08, 0.09), down); ik(a, 'R', W(b, 'chest', -0.08, 0.08, 0.09), downR);
        ik(b, 'L', W(a, 'hips', 0.08, 0.0, 0.06), down); ik(b, 'R', W(a, 'hips', -0.08, 0.0, 0.06), downR);
        break;
      case 'back': case 'rnc':
        if (pos === 'rnc') {
          ik(a, 'R', W(b, 'neck', 0.05, 0.03, 0.07), downR); ik(a, 'L', W(b, 'head', -0.05, -0.01, -0.05), down);
        } else {
          ik(a, 'R', W(b, 'chest', 0.05, 0.1, 0.08), downR); ik(a, 'L', W(b, 'chest', -0.05, 0.02, 0.07), down);
        }
        ik(a, 'fL', W(b, 'thL', -0.02, -0.12, 0.02), new V3(1, 0.4, 0.4)); ik(a, 'fR', W(b, 'thR', 0.02, -0.12, 0.02), new V3(-1, 0.4, 0.4));
        ik(b, 'L', W(a, 'faR', 0, -0.06 - tap, 0.02), down); ik(b, 'R', W(a, 'faR', 0, -0.12, 0.02), downR);
        break;
      case 'armbar': {
        ik(b, 'R', W(a, 'chest', 0.0, 0.1, 0.06), new V3(0, 0, -1));
        const wrist = b.body.B.handR.getWorldPosition(new V3());
        ik(a, 'L', wrist, down); ik(a, 'R', wrist.clone().add(new V3(0, -0.04 * a.h, 0)), downR);
        ik(b, 'L', W(a, 'thL', 0, -0.15 - tap * 2, 0.02), down);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- per step
  // How long the NPC has held the player down in one stretch.
  _controlWatch(dt) {
    const game = this.game;
    const player = game.p1;
    if (game.p1AI || !player) return;
    const d = UFC.GRAPPLE_POS[this.pos];
    const npcOnTop = d.ground && !d.sub && this.a !== player;
    if (!npcOnTop) { this.npcControlT = 0; return; }
    this.npcControlT = (this.npcControlT || 0) + dt;
    if (this.npcControlT > 11 && !this.sub && !this.trans && !this.attempt) {
      // referee-style reset: the fighters are stood up
      this.npcControlT = 0;
      game.ui.hitMarker('БОЙЦЫ ПОДНЯЛИСЬ', 0);
      this.standUp();
    }
  }

  step(dt) {
    this._controlWatch(dt);
    const a = this.a, b = this.b, game = this.game;
    this.t += dt; this.idleT += dt; this.posT = (this.posT || 0) + dt;
    a.time += dt; b.time += dt;
    if (this.trans) { this.trans.t += dt; }
    const wA = this._pose('a', dt); this._pose('b', dt);
    // referee keeps the cage honest
    UFC.clampToOctagon(a.pos, 0.3); UFC.clampToOctagon(b.pos, 0.3);
    this._contacts(this.trans ? M.smooth(Math.min(1, this.trans.t / this.trans.dur)) : 1);
    this._strikesStep(dt);
    if (this.trans && this.trans.t >= this.trans.dur) {
      const done = this.trans.onDone; this.trans = null;
      if (done) done();
      if (!game.grapple) return;
    }
    void wA;
    // stamina: grappling is expensive for both, more for whoever works
    for (const f of [a, b]) {
      f.recoverZones(dt);
      const work = (this.attempt && this.attempt.who === f) ? 7 : this.sub && (this.sub.att === f || this.sub.def === f) ? 5 : 1.2;
      f.stamina = Math.max(0, Math.min(f.staminaCap, f.stamina - work * dt + (work < 2 ? 3.5 * f.cardio * dt : 0)));
      if (f.sinceHit > 0.6) f.stun = Math.max(0, f.stun - 10 * dt);
      f.sinceHit += dt;
    }
    if (POS[this.pos].ground && !POS[this.pos].sub) { a.stats.control = (a.stats.control || 0) + dt; a.roundStats.control = (a.roundStats.control || 0) + dt; }
    if (this.attempt) this._attemptStep(dt);
    if (this.sub) this._subStep(dt);
    // referee: stalled clinch is separated, stalled ground is stood up
    if (!this.trans && !this.attempt && !this.sub) {
      const pt = this.posT;
      if (this.pos === 'sprawl' && pt > 3.5) this.breakApart();
      else if (this.pos === 'shot' && pt > 2.5) this.breakApart();
      else if (!POS[this.pos].ground && (this.idleT > 7 || pt > 12)) this.breakApart('Бойцы разошлись');
      else if (POS[this.pos].ground && (this.idleT > 14 || pt > 25)) this.standUp('Бойцы поднялись');
    }
    if (!this.game.grapple) return;
    this._ai(dt);
  }

  // ---------------------------------------------------------------- actions
  // `who` wants to act. kind: 'advance' | 'escape' | 'takedown' | 'cage' | 'sub' | 'break'
  request(who, kind) {
    if (this.trans || this.attempt || this.sub || !this.game.grapple) return false;
    const role = who === this.a ? 'a' : 'b', pos = this.pos, d = POS[pos];
    const other = role === 'a' ? this.b : this.a;
    if (kind === 'break') {
      if (d.ground) return false;
      if (role === 'a') { this.breakApart(); return true; }
      kind = 'escape';
    }
    if (kind === 'sub') {
      const s = SUB_FROM[pos];
      if (!s || s.by !== role) return false;
      return this._beginAttempt(who, other, 'sub', 0.8, s.sub);
    }
    if (kind === 'advance' && role === 'a') {
      if (pos === 'clinch') return this._beginAttempt(who, other, UFC.distToCage(this.b.pos) < 1.4 ? 'cage' : 'takedown', 0.7);
      if (pos === 'cage' || pos === 'shot') return this._beginAttempt(who, other, 'takedown', pos === 'shot' ? 0.55 : 0.75);
      if (NEXT[pos]) return this._beginAttempt(who, other, 'advance', 0.9, NEXT[pos]);
      return false;
    }
    if (kind === 'takedown' && role === 'a' && !d.ground) return this._beginAttempt(who, other, 'takedown', 0.7);
    if (kind === 'escape' && role === 'b') {
      if (pos === 'clinch' || pos === 'cage') return this._beginAttempt(who, other, 'escape', 0.6, 'BREAK');
      if (pos === 'sprawl') return this._beginAttempt(who, other, 'escape', 0.5, 'BREAK');
    }
    if (kind === 'advance' && role === 'a' && pos === 'sprawl') return this._beginAttempt(who, other, 'takedown', 0.65);
    if (kind === 'escape' && role === 'a' && pos === 'sprawl') { this.breakApart(); return true; }
    if (kind === 'escape' && role === 'b') {
      if (ESCAPE[pos]) return this._beginAttempt(who, other, 'escape', 0.95, ESCAPE[pos]);
    }
    return false;
  }

  _beginAttempt(who, other, kind, dur, target) {
    this.attempt = { who, other, kind, dur, target, t: 0, defended: false, defendT: null };
    this.idleT = 0;
    who.stamina = Math.max(0, who.stamina - (kind === 'takedown' ? 7 : 4));
    // AI defender reaction
    if (other !== this.game.p1) {
      const P = this.game.ai.P;
      const skillK = kind === 'takedown' || kind === 'cage' ? skill(other, 'wrestling') : skill(other, 'bjj');
      if (Math.random() < P.block * 0.55 + skillK * 0.3 - (other.stamina < 25 ? 0.2 : 0)) this.attempt.defendT = M.rand(0.15, 0.55) * dur;
    }
    this.game.onGrappleAttempt(this, this.attempt);
    return true;
  }

  // the player (or AI) presses defend during an attempt against them
  defend(f) {
    const at = this.attempt;
    if (at && at.other === f && !at.defended && at.t < at.dur * 0.92) { at.defended = true; f.stamina = Math.max(0, f.stamina - 3); return true; }
    if (this.sub && this.sub.def === f) { this.sub.escape += 3.3 * (0.7 + skill(f, 'bjj') * 0.6) * (0.5 + f.stamina / 200); f.stamina = Math.max(0, f.stamina - 0.8); return true; }
    return false;
  }

  _attemptStep(dt) {
    const at = this.attempt;
    at.t += dt;
    if (at.defendT != null && !at.defended && at.t >= at.defendT) at.defended = true;
    if (at.t < at.dur) return;
    this.attempt = null;
    const W = at.who, O = at.other;
    const stamDiff = (W.stamina - O.stamina) / 300;
    const hurt = (1 - O.head / 100) * 0.2 + (O.stun > 55 ? 0.2 : 0);
    let p;
    if (at.kind === 'takedown') p = 0.38 + (skill(W, 'wrestling') - skill(O, 'wrestling')) * 0.9 + stamDiff + hurt + (this.pos === 'cage' ? 0.08 : 0) + (this.pos === 'shot' && at.midStrike ? 0.25 : 0);
    else if (at.kind === 'cage') p = 0.6 + (skill(W, 'wrestling') - skill(O, 'wrestling')) * 0.7 + stamDiff;
    else if (at.kind === 'advance') p = 0.36 + M.sat(this.posT / 8) * 0.16 + (skill(W, 'bjj') - skill(O, 'bjj')) * 0.8 + stamDiff + hurt - (this.pos === 'mount' ? 0.06 : 0);
    else if (at.kind === 'escape') p = 0.36 + (skill(W, 'bjj') - skill(O, 'bjj')) * 0.8 + (skill(W, 'wrestling') - skill(O, 'wrestling')) * 0.3 + stamDiff * 1.2 - hurt * 0.5
      - ({ back: 0.12, mount: 0.1, side: 0.05 }[this.pos] || 0) + (this.pos === 'clinch' ? 0.2 : 0);
    else if (at.kind === 'sub') p = (at.target === 'guillotine' ? 0.18 : at.target === 'triangle' ? 0.24 : 0.32) + (skill(W, 'bjj') - skill(O, 'bjj')) * 0.8 + stamDiff + hurt;
    if (at.defended) p -= 0.38;
    // The player is never held down for minutes: escapes are much easier and
    // shooting on a fresh NPC is a real commitment.
    if (at.who === this.game.p1 && !this.game.p1AI) {
      if (at.kind === 'escape') p = 1 - (1 - p) / (1.8 * (UFC.mobile ? UFC.MOBILE_TUNE.escapeEase : 1));
      if (at.kind === 'takedown') p *= 0.75;
    }
    p = M.clamp(p, 0.05, 0.92);
    const ok = Math.random() < p;
    this.game.onGrappleResult(this, at, ok);
    if (!ok) {
      W.stamina = Math.max(0, W.stamina - 4);
      if (at.kind === 'takedown' && (this.pos === 'shot')) {
        // stuffed shot: sprawl
        this._startTrans('sprawl', 0.45);
      }
      return;
    }
    if (at.kind === 'cage') {
      const c = this._cageAnchor(); this.anchor = c;
      this._startTrans('cage', 0.55);
    } else if (at.kind === 'takedown') {
      this._takedown();
    } else if (at.kind === 'advance') {
      this._startTrans(at.target, 0.75);
      W.stats.passes = (W.stats.passes || 0) + 1;
    } else if (at.kind === 'escape') {
      if (at.target === 'BREAK') this.breakApart();
      else if (at.target === 'STAND') this.standUp();
      else this._startTrans(at.target, 0.75);
    } else if (at.kind === 'sub') {
      this._beginSub(at.target, W, O);
    }
  }

  _cageAnchor() {
    const b = this.b, a = this.a;
    // push the defender straight back to the nearest fence
    let best = null, bd = 1e9;
    for (let k = 0; k < 8; k++) {
      const ang = (k + 1) * Math.PI / 4, nx = Math.cos(ang), nz = Math.sin(ang);
      const dist = UFC.OCT.APOTHEM - (b.pos.x * nx + b.pos.z * nz);
      if (dist < bd) { bd = dist; best = { nx, nz }; }
    }
    const k = (a.h + b.h) / 3.6;
    const px = b.pos.x + best.nx * (bd - 0.55), pz = b.pos.z + best.nz * (bd - 0.55);
    const yaw = Math.atan2(best.nx, best.nz);
    // anchor such that b sits at +0.18 along yaw from the anchor
    return { x: px - Math.sin(yaw) * 0.18 * k, z: pz - Math.cos(yaw) * 0.18 * k, yaw };
  }

  _takedown() {
    const a = this.a, b = this.b;
    // b lands on his back where he stood, feet toward the shooter
    const yaw = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    const bx = b.pos.x + Math.sin(yaw) * 0.1, bz = b.pos.z + Math.cos(yaw) * 0.1;
    this.anchor = { x: bx, z: bz, yaw };
    const r = Math.random() + (skill(a, 'wrestling') - skill(b, 'wrestling'));
    const land = r > 1.05 ? 'side' : r > 0.62 ? 'half' : 'guard';
    this._startTrans(land, 0.85, () => {
      this.game.onTakedownLanded(this, a, b);
    });
    a.stats.td = (a.stats.td || 0) + 1;
    b.stun += 6;
    b.bodyHp = Math.max(0, b.bodyHp - 3 / UFC.HP_MUL / UFC.TOUGH);
    this.game.onTakedownStart(this, a, b);
  }

  // ---------------------------------------------------------------- submissions
  _beginSub(kind, att, def) {
    const wasPos = this.pos;
    this.sub = { kind, att, def, pressure: 4, escape: 0, t: 0, from: wasPos, tapT: null };
    this._startTrans(kind, 0.8);
    this.game.onSubStart(this, att, def, kind);
  }

  _subStep(dt) {
    const s = this.sub;
    s.t += dt;
    if (s.tapT != null) {
      s.tapT += dt;
      if (s.tapT > 1.1) { const at = s.att, df = s.def, k = s.kind; this.sub = null; this.game.onSubmission(this, at, df, k); }
      return;
    }
    if (this.trans) return;
    const att = s.att, def = s.def;
    // attacker squeezes, defender fights the hands / posture
    const hurtDef = (1 - def.head / 100) * 0.5 + (def.stamina < 25 ? 0.4 : 0);
    const tight = { rnc: 1.15, armbar: 1.05, kimura: 0.95, triangle: 0.9, guillotine: 0.8 }[s.kind] || 1;
    s.pressure += dt * (3.2 + skill(att, 'bjj') * 5) * tight * (0.6 + att.stamina / 250) * (1 + hurtDef);
    s.escape += dt * (4.8 + skill(def, 'bjj') * 4.2 + skill(def, 'wrestling') * 1.6) / tight * (0.45 + def.stamina / 180) * (def === this.game.p1 && !this.game.p1AI ? 1.25 : 1);
    // AI mashing
    for (const f of [att, def]) {
      if (f === this.game.p1 && !this.game.p1AI) continue;
      const P = this.game.ai.P;
      if (Math.random() < dt * (3 + P.block * 6)) { if (f === att) this.squeeze(f); else this.defend(f); }
    }
    if (s.pressure >= 100 && this.game._earlyRound()) { s.pressure = 60; s.escape = 100; }   // too early for a tap: he survives the submission
    if (s.pressure >= 100) { s.tapT = 0; def.stats.tapped = true; this.game.onTap(this, att, def, s.kind); return; }
    if (s.escape >= 100) {
      const back = { armbar: 'guard', rnc: 'back', kimura: 'side', triangle: 'guard', guillotine: 'sprawl' }[s.kind];
      this.sub = null;
      if (s.kind === 'armbar') { const t = this.a; this.a = this.b; this.b = t; }       // stacked his way out on top
      this.game.onSubEscape(this, att, def, s.kind);
      if (back === 'sprawl') this.breakApart();
      else this._startTrans(back, 0.8);
      att.stamina = Math.max(0, att.stamina - 10);
    }
  }

  squeeze(f) {
    if (this.sub && this.sub.att === f && this.sub.tapT == null) { this.sub.pressure += 2.6 * (0.7 + skill(f, 'bjj') * 0.6) * (0.5 + f.stamina / 200); f.stamina = Math.max(0, f.stamina - 0.9); return true; }
    return false;
  }

  // ---------------------------------------------------------------- strikes
  strike(who, kind) {
    if (this.trans || this.sub || this.strikes.has(who)) return false;
    const pos = this.pos, d = POS[pos], role = who === this.a ? 'a' : 'b';
    if (d.sub) return false;
    let mv;
    if (!d.ground) mv = kind === 'knee' ? { k: 'knee', t: 0.45, hit: 0.24, dmg: 9, stam: 5, zone: 'body', name: 'Колено в клинче' } : { k: 'short', t: 0.32, hit: 0.18, dmg: 5.5, stam: 3, zone: 'head', name: 'Удар в клинче' };
    else if (role === 'a') mv = kind === 'elbow' ? { k: 'elbow', t: 0.5, hit: 0.3, dmg: 10, stam: 5, zone: 'head', name: 'Локоть в партере' } : { k: 'gp', t: 0.36, hit: 0.22, dmg: 7, stam: 3.5, zone: 'head', name: 'Удар в партере' };
    else if (pos === 'guard' || pos === 'half') mv = { k: 'up', t: 0.34, hit: 0.2, dmg: 3.5, stam: 3, zone: 'head', name: 'Удар снизу' };
    else return false;
    this.strikes.set(who, { mv, t: 0, hit: false, limb: Math.random() < 0.5 ? 'L' : 'R', target: who === this.a ? this.b : this.a });
    who.stamina = Math.max(0, who.stamina - mv.stam);
    who.stats.thrown++;
    this.idleT = Math.min(this.idleT, 3);
    this.game.audio.whoosh(mv.dmg);
    return true;
  }

  _strikesStep(dt) {
    for (const [f, s] of this.strikes) {
      s.t += dt;
      const env = Math.sin(Math.min(1, s.t / s.mv.t) * Math.PI);
      const B = f.body.B, tgt = s.target;
      if (s.mv.k === 'knee') {
        const leg = s.limb === 'L' ? 'thL' : 'thR';
        B[leg].quaternion.multiply(_q.setFromEuler(_e.set(-1.3 * env, 0, 0, 'YXZ')));
        B[leg === 'thL' ? 'snL' : 'snR'].quaternion.multiply(_q.setFromEuler(_e.set(0.9 * env, 0, 0, 'YXZ')));
      } else {
        const side = s.limb, d = f.body.dims;
        const head = tgt.headCenter(new V3());
        const hand = B['hand' + side].getWorldPosition(new V3());
        const pole = new V3(side === 'L' ? 0.8 : -0.8, s.mv.k === 'elbow' ? 0.5 : -0.6, -0.3).applyQuaternion(f.body.root.quaternion);
        UFC.solveTwoBone(B['ua' + side], B['fa' + side], hand.lerp(head, env * 0.95), pole, d.upper, d.fore, true);
      }
      f.body.root.updateMatrixWorld(true);
      if (!s.hit && s.t >= s.mv.hit) { s.hit = true; this._impact(f, tgt, s.mv); }
      if (s.t >= s.mv.t) this.strikes.delete(f);
    }
  }

  _impact(att, def, mv) {
    const game = this.game;
    const covering = def === game.p1 ? (game.input.state.r2 || game.input.state.l2 ? 0.8 : 0.35) : 0.5;
    const zone = mv.zone === 'body' && def.stun > 60 && Math.random() < 0.35 ? 'head' : mv.zone;
    let power = mv.dmg * att.pow * (0.6 + 0.4 * M.sat(att.stamina / 50)) * M.rand(0.85, 1.15) * (1 - covering * 0.45);
    const point = zone === 'head' ? def.headCenter(new V3()) : def.body.B.chest.getWorldPosition(new V3());
    const dir = new V3().subVectors(point, att.headCenter(new V3())).normalize();
    def.sinceHit = 0;
    { const hf = def.hpFactor || 1; power /= hf; }
    if (zone === 'head') { def.hurtZone('head', power * 0.2); def.stun += power * 1.0 * (1 + (1 - def.head / 100)); }
    else { def.hurtZone('bodyHp', power * 0.6); if (Math.random() < 0.5) def.hurtZone('liver', power * 0.7); def.stamina = Math.max(0, def.stamina - power * 1.1); def.stun += power * 0.4; }
    att.stats.landed++; att.stats.sigLanded++; att.stats.dmg += power; att.roundStats.landed++; att.roundStats.sig++; att.roundStats.dmg += power;
    if (zone === 'head') att.stats.head++; else att.stats.bodyL++;
    game.audio.impact(power, zone, false);
    game.fx.sweat(point, dir, power * 0.6);
    if (zone === 'head' && def.head < 70 && Math.random() < 0.35) game.fx.blood(point, dir, power * 0.7);
    game.cam.shake(Math.min(0.5, power * 0.04));
    game.hitstop = Math.max(game.hitstop, 0.045);
    game.ui.impactFlash(power, zone);
    game.arena.excite(0.06);
    if (zone === 'head' && game.onFaceDamage) game.onFaceDamage(def, power, mv.k === 'elbow');
    if (game.onZoneHit) game.onZoneHit(att, def, zone, power);
    game.ui.hitMarker(mv.name, att === game.p1 ? 0 : 1);
    // no referee: the fight only ends when his health is gone
    if (def.noDefT > 0.7) def.lateHits++;
    if (def.head <= 0) game.onGrappleStoppage(this, att, def);
  }

  // ---------------------------------------------------------------- endings
  breakApart(msg) {
    const game = this.game, a = this.a, b = this.b;
    game.grapple = null;
    const yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    for (const [f, sgn] of [[a, -1], [b, 1]]) {
      this._toLive(f);
      f.pos.x += Math.sin(yaw) * 0.28 * sgn; f.pos.z += Math.cos(yaw) * 0.28 * sgn;
      f.vel.set(Math.sin(yaw) * 0.8 * sgn, 0, Math.cos(yaw) * 0.8 * sgn);
    }
    if (msg) game.ui.callout(msg, '', 'break', 1.2);
    game.onGrappleEnd(this);
  }

  standUp(msg) {
    const game = this.game, a = this.a, b = this.b;
    game.grapple = null;
    const top = a, bot = b;
    // bottom fighter works up through the real get-up; top backs off
    this._toLive(top);
    top.pos.x -= Math.sin(top.yaw) * 0.4; top.pos.z -= Math.cos(top.yaw) * 0.4;
    bot.state = 'down'; bot.downPhase = 'rising'; bot.riseT = 0.45; bot.riseSpeed = 1.1; bot.downTimer = 0; bot.gnpBy = null;
    bot.yaw = Math.atan2(top.pos.x - bot.pos.x, top.pos.z - bot.pos.z);
    if (msg) game.ui.callout(msg, '', 'break', 1.2);
    game.onGrappleEnd(this);
  }

  _toLive(f) {
    const B = f.body.B;
    f._snap = {};
    for (const [k, bn] of Object.entries(B)) f._snap[k] = bn.quaternion.clone();
    f._snapHips = B.hips.position.clone();
    f.state = 'getup'; f.getupT = 0; f._blendDur = 0.5; f.downPhase = null;
    f.gait = null;
    for (const side of ['L', 'R']) { const ft = f.foot[side]; f._footRest(side, ft.planted); ft.stepping = false; ft.t = 1; ft.yaw = f._restYaw(side); }
    Object.values(f.sp).forEach((s) => { s.vel = 0; });
    f.sp.crouch.snap(0.1 * f.h);
    f.stumbleT = 0;
  }

  // ---------------------------------------------------------------- AI
  _ai(dt) {
    const game = this.game;
    for (const f of [this.a, this.b]) {
      if ((f === game.p1 && !game.p1AI) || !game.ai) continue;
      const P = game.ai.P;
      this._aiTs = this._aiTs || new Map();
      const tLeft = (this._aiTs.get(f) || 0) - dt;
      this._aiTs.set(f, tLeft);
      if (this._aiT > 50 || tLeft > 0 || this.trans || this.attempt || this.sub) continue;
      this._aiTs.set(f, M.rand(0.6, 1.3) * (1.35 - P.block * 0.5));
      const role = f === this.a ? 'a' : 'b', pos = this.pos, d = POS[pos];
      const wr = skill(f, 'wrestling'), bjj = skill(f, 'bjj');
      const opts = [];
      if (role === 'a') {
        if (!d.ground) {
          opts.push(['advance', 0.25 + wr * 0.6]);
          opts.push(['knee', 0.5]); opts.push(['short', 0.35]);
          if (pos === 'clinch' && f.cfg.style !== 'wrestler') opts.push(['break', 0.3]);
        } else {
          // settle in, strike and wait for an opening before passing / attacking
          if (NEXT[pos] && this.posT > 3.5) opts.push(['advance', 0.16 + bjj * 0.3]);
          if (SUB_FROM[pos] && SUB_FROM[pos].by === 'a' && this.posT > 6) opts.push(['sub', 0.04 + bjj * 0.2 + (1 - this.b.head / 100) * 0.3 + (this.b.stamina < 30 ? 0.15 : 0)]);
          opts.push(['gp', 0.55]); opts.push(['elbow', 0.25]);
        }
      } else {
        if (!d.ground) { opts.push(['escape', 0.45]); opts.push(['knee', 0.35]); opts.push(['short', 0.3]); if (pos === 'sprawl' && this.posT > 0.6) opts.push(['sub', bjj * 0.12]); }
        else {
          opts.push(['escape', 0.45 + wr * 0.2]);
          if (pos === 'guard' || pos === 'half') opts.push(['up', 0.25]);
          if (SUB_FROM[pos] && SUB_FROM[pos].by === 'b' && this.posT > 2.5) opts.push(['sub', bjj * 0.14]);
        }
      }
      if (f.stamina < 15) continue;
      const act = M.weighted(opts);
      if (act === 'advance' || act === 'escape' || act === 'sub' || act === 'break') this.request(f, act);
      else if (act === 'knee') this.strike(f, 'knee');
      else if (act === 'short' || act === 'up' || act === 'gp') this.strike(f, 'punch');
      else if (act === 'elbow') this.strike(f, 'elbow');
    }
  }
}
UFC.Grapple = Grapple;

// ---------------------------------------------------------------- entry points
// Clinch: close range, a short tie-up attempt the other fighter can shrug off.
UFC.grapAllowed = function (game, f) {   // one clinch or takedown attempt per fighter and round
  if (f._grapRound === game.round) { if (f === game.p1 && game.phase === 'fight' && (game.simTime || 0) - (f._grapMsgT || -9) > 2) { f._grapMsgT = game.simTime || 0; game.ui.hitMarker('БОРЬБА — 1 РАЗ ЗА РАУНД', 0); } return false; }
  return true;
};
UFC.tryClinch = function (game, f) {
  if (UFC.NO_GRAPPLE) return false;
  const o = f.opponent;
  if (game.grapple || f.state !== 'fight' || o.state !== 'fight' || f.strike || f.hitstun > 0) return false;
  const dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  if (dist > 1.05) return false;
  if (!UFC.grapAllowed(game, f)) return false;
  f._grapRound = game.round;
  let p = 0.55 + (skill(f, 'wrestling') - skill(o, 'wrestling')) * 0.6 + (o.rocked ? 0.25 : 0) - (o.block !== 'none' ? 0.05 : 0) + (o.strike ? 0.15 : 0);
  if (o !== game.p1 && Math.random() < game.ai.P.block * 0.3) p -= 0.25;
  f.stamina = Math.max(0, f.stamina - 3);
  if (Math.random() > M.clamp(p, 0.1, 0.9)) { f.stagger = 0.35; game.ui.hitMarker('ВЫРВАЛСЯ ИЗ КЛИНЧА', o === game.p1 ? 0 : 1); return false; }
  const yaw = Math.atan2(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  const anchor = { x: (f.pos.x + o.pos.x) / 2, z: (f.pos.z + o.pos.z) / 2, yaw };
  game.grapple = new Grapple(game, f, o, 'clinch', anchor, true);
  game.onGrappleStart(game.grapple, 'clinch');
  return true;
};

// Takedown shot from distance: an actual level change and drive; a defender
// who reads it sprawls.
UFC.tryShot = function (game, f) {
  if (UFC.NO_GRAPPLE) return false;
  const o = f.opponent;
  if (game.grapple) return game.grapple.a === f ? game.grapple.request(f, 'takedown') : false;
  if (f.state !== 'fight' || o.state !== 'fight' || f.strike || f.hitstun > 0) return false;
  const dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  if (dist > 1.75) return false;
  if (!UFC.grapAllowed(game, f)) return false;
  f._grapRound = game.round;
  const yaw = Math.atan2(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  const midStrike = !!o.strike;
  const anchor = { x: o.pos.x - Math.sin(yaw) * 0.32, z: o.pos.z - Math.cos(yaw) * 0.32, yaw };
  const g = new Grapple(game, f, o, 'shot', anchor, true);
  g.trans.dur = 0.32;
  game.grapple = g;
  g._beginAttempt(f, o, 'takedown', 0.5);
  g.attempt.midStrike = midStrike;
  game.onGrappleStart(g, 'shot');
  return true;
};
})();

