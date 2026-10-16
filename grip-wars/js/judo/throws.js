//# sourceURL=judo/throws.js
// Judo: the throws. Tori (the one who throws) is animated through a semantic rig (hips, torso, feet and hands placed with IK);
// uke (the one who is thrown) is carried by a rigid-body motion of his core and the rest of him is the verlet ragdoll, which lands him.
(function () {
'use strict';
const UFC = window.UFC;
const J = (window.JUDO = window.JUDO || {});
const M = UFC.M;
const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;
UFC.judo = true;

const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = cl(x); return x * x * (3 - 2 * x); };
const PI = Math.PI;
const _e = new E(0, 0, 0, 'YXZ'), _q = new Q(), _q2 = new Q(), _v = new V3(), _v2 = new V3(), _v3 = new V3();

// ---------------------------------------------------------------- the rig
// hip [x,y,z] in body heights (standing: y = 0.548), hr = pelvis rotation [pitch,yaw,roll], sp = torso bend, nk = neck, fL/fR = ankle targets in root space
const STAND = { hip: [0, 0.548, 0], hr: [0.04, 0, 0], sp: [0.12, 0, 0], nk: [-0.08, 0, 0], fL: [0.06, 0.046, 0.03], fR: [-0.06, 0.046, -0.03], kn: [0.35, 0.35] };
const KEYS = ['hip', 'hr', 'sp', 'nk', 'fL', 'fR', 'kn'];
function fullRig(r) { const o = {}; for (const k of KEYS) o[k] = (r && r[k]) || STAND[k]; return o; }
function mixRig(a, b, w) {
  const o = {};
  for (const k of KEYS) { const x = a[k], y = b[k]; o[k] = x.map((v, i) => v + (y[i] - v) * w); }
  return o;
}

function applyRig(f, r, grip) {
  const B = f.body.B, d = f.body.dims, H = f.h, root = f.body.root, KS = root.scale.x;
  B.hips.position.set(r.hip[0] * H, r.hip[1] * H, r.hip[2] * H);
  B.hips.quaternion.setFromEuler(_e.set(r.hr[0], r.hr[1], r.hr[2], 'YXZ'));
  B.spine.quaternion.setFromEuler(_e.set(r.sp[0] * 0.45, r.sp[1] * 0.5, r.sp[2] * 0.5, 'YXZ'));
  B.chest.quaternion.setFromEuler(_e.set(r.sp[0] * 0.55, r.sp[1] * 0.5, r.sp[2] * 0.5, 'YXZ'));
  B.neck.quaternion.setFromEuler(_e.set(r.nk[0] * 0.5, r.nk[1] * 0.5, r.nk[2] * 0.5, 'YXZ'));
  B.head.quaternion.setFromEuler(_e.set(r.nk[0] * 0.5, r.nk[1] * 0.5, r.nk[2] * 0.5, 'YXZ'));
  root.updateMatrixWorld(true);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1, ft = r['f' + side];
    const target = root.localToWorld(_v.set(ft[0] * H, ft[1] * H, ft[2] * H));
    const pole = _v2.set(sx * r.kn[1], 0.15, r.kn[0] + 0.6).applyQuaternion(root.quaternion);
    UFC.solveTwoBone(B['th' + side], B['sn' + side], target, pole, d.thigh * KS, d.shin * KS, true);
    root.updateMatrixWorld(true);
    B['sn' + side].getWorldQuaternion(_q).invert();
    B['ft' + side].quaternion.copy(_q.multiply(root.quaternion));
  }
  root.updateMatrixWorld(true);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    let target = grip && grip[side];
    if (!target) target = B.chest.localToWorld(_v3.set(sx * 0.21 * H, -0.18 * H, 0.05 * H));
    else target = target.clone();
    const sh = B['ua' + side].getWorldPosition(_v);
    const dir = _v2.subVectors(target, sh), dist = dir.length();
    if (dist > 1e-4) target.addScaledVector(dir, -0.03 * H / dist);
    const pole = new V3(sx * 0.6, -1, -0.25).applyQuaternion(root.quaternion);
    UFC.solveTwoBone(B['ua' + side], B['fa' + side], target, pole, d.upper * KS, d.fore * KS, true);
    B['hand' + side].quaternion.identity();
  }
  root.updateMatrixWorld(true);
}
J.applyRig = applyRig;

// points on a body used for grips (bones are always current: even a ragdoll is written to them)
function anchor(f, name, out) {
  const B = f.body.B, H = f.h;
  switch (name) {
    case 'collarL': return B.chest.localToWorld(out.set(0.05 * H, 0.1 * H, 0.05 * H));
    case 'collarR': return B.chest.localToWorld(out.set(-0.05 * H, 0.1 * H, 0.05 * H));
    case 'lapelL': return B.chest.localToWorld(out.set(0.07 * H, 0.05 * H, 0.085 * H));
    case 'lapelR': return B.chest.localToWorld(out.set(-0.07 * H, 0.05 * H, 0.085 * H));
    case 'sleeveL': return B.faL.localToWorld(out.set(0, -0.03 * H, 0.0));
    case 'sleeveR': return B.faR.localToWorld(out.set(0, -0.03 * H, 0.0));
    case 'elbowL': return B.faL.localToWorld(out.set(0, 0, 0));
    case 'elbowR': return B.faR.localToWorld(out.set(0, 0, 0));
    case 'armpitL': return B.chest.localToWorld(out.set(0.1 * H, 0.04 * H, 0));
    case 'armpitR': return B.chest.localToWorld(out.set(-0.1 * H, 0.04 * H, 0));
    case 'shoulderL': return B.chest.localToWorld(out.set(0.11 * H, 0.11 * H, -0.01 * H));
    case 'shoulderR': return B.chest.localToWorld(out.set(-0.11 * H, 0.11 * H, -0.01 * H));
    case 'backBelt': return B.hips.localToWorld(out.set(0, 0.04 * H, -0.09 * H));
    case 'backTop': return B.chest.localToWorld(out.set(0, 0.07 * H, -0.09 * H));
    case 'hipL': return B.hips.localToWorld(out.set(0.09 * H, 0.0, 0.01 * H));
    case 'thighL': return B.thL.localToWorld(out.set(0.0, -0.09 * H, 0.0));
    case 'thighR': return B.thR.localToWorld(out.set(0.0, -0.09 * H, 0.0));
    case 'kneeL': return B.snL.localToWorld(out.set(0, 0.0, 0.0));
    case 'kneeR': return B.snR.localToWorld(out.set(0, 0.0, 0.0));
    case 'belly': return B.hips.localToWorld(out.set(0, 0.03 * H, 0.09 * H));
    default: return B.chest.localToWorld(out.set(0, 0.05 * H, 0.08 * H));
  }
}
J.anchor = anchor;

// ---------------------------------------------------------------- keyframes
// a track is [t, x, z, yaw, rig]; x, z in metres (at 1.8 m) in the frame of uke's start, yaw relative to uke facing tori
function sample(track, t, H) {
  const k = H / 1.8;
  let i = 0;
  while (i < track.length - 2 && t > track[i + 1][0]) i++;
  const a = track[i], b = track[Math.min(i + 1, track.length - 1)];
  const span = Math.max(1e-4, b[0] - a[0]);
  const w = a === b ? 0 : ease((t - a[0]) / span);
  const ra = a.rigF || (a.rigF = fullRig(a[4])), rb = b.rigF || (b.rigF = fullRig(b[4]));
  return { x: (a[1] + (b[1] - a[1]) * w) * k, z: (a[2] + (b[2] - a[2]) * w) * k, yaw: a[3] + (b[3] - a[3]) * w, rig: mixRig(ra, rb, w) };
}

J.sampleTrack = sample;
// ---------------------------------------------------------------- techniques
// m = +1 / -1: the side to which the thrower turns. Each technique: tori track, uke track, grips, drive of uke's body, range, cost.
const T = {};
const mk = (id, spec) => (T[id] = Object.assign({ id }, spec));

// helpers for the author of a technique
const R = (o) => o;
const hipTurn = (m, t0, x0, z0) => (t) => t;
void hipTurn;

// stand-in values of the uke that is pulled forward (kuzushi)
const UK_STAND = [0, 0, 0, 0, R({})];
// tori after the throw: straightening up over the thrown man, feet on the mat
const REC = R({ hip: [0, 0.5, 0.03], hr: [0.15, 0, 0], sp: [0.42, 0, 0], nk: [-0.15, 0, 0], fL: [0.09, 0.046, 0.05], fR: [-0.09, 0.046, -0.05], kn: [0.6, 0.35] });
const UK_PULLED = R({ hip: [0, 0.545, 0.1], sp: [0.52, 0, 0], nk: [-0.28, 0, 0], fL: [0.06, 0.085, 0.08], fR: [-0.06, 0.06, -0.02], kn: [0.25, 0.3] });
const UK_BACK = R({ hip: [0, 0.54, -0.07], sp: [-0.1, 0, 0], nk: [0, 0, 0], fL: [0.06, 0.05, 0.03], fR: [-0.06, 0.07, -0.04] });

// 1 ПОДХВАТ (harai-goshi): turn in, load him on the hip, sweep his leg with the straight leg
mk('podhvat', {
  vk: 0.75, vkOver: 0.48,
  name: 'Подхват', jp: 'Харай-госи', range: 1.7, cost: 12, base: 0.6, power: 1.0, fall: 'forward',
  tori(m) {
    const fit = R({ hip: [0.02 * m, 0.45, -0.03], hr: [0.2, 0, 0], sp: [0.55, 0, 0], nk: [-0.2, 0, 0], fL: [0.075, 0.046, 0.0], fR: [-0.1, 0.046, 0.0] });
    const kake = R({ hip: [0.0, 0.47, -0.04], hr: [0.6, 0, 0], sp: [1.25, 0, 0.05 * m], nk: [-0.75, 0, 0], fL: [0.07, 0.046, 0.0], fR: [-0.07, 0.55, -0.42] });
    return [[0, 0, 1.0, PI, R({})], [0.3, 0.05 * m, 0.7, PI - m * PI * 0.5, R({ hip: [0, 0.5, 0], sp: [0.25, 0, 0], fL: [0.08, 0.046, 0.06], fR: [-0.08, 0.046, -0.04] })],
      [0.52, 0.1 * m, 0.4, PI - m * PI, fit], [0.88, 0.1 * m, 0.4, PI - m * PI, kake], [1.25, 0.1 * m, 0.45, PI - m * PI, REC], [1.9, 0.0, 0.7, PI - m * PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.35, 0, 0.04, 0, UK_PULLED], [0.62, 0, 0.1, 0, R({ hip: [0, 0.56, 0.12], sp: [0.55, 0, 0], nk: [-0.3, 0, 0], fL: [0.07, 0.12, 0.1], fR: [-0.06, 0.046, -0.02] })]]; },
  grips(m) { return { 0.0: { L: ['lapelR', 'u'], R: ['sleeveL', 'u'] } }; },
  drive: (m) => ({ t0: 0.64, dur: 0.34, pivot: [0.1 * m, 0.95, 0.42], axis: [1, 0, 0], ang: 3.1, lift: 0.08, drop: 0.25, push: [0, 0.5], over: 0.12, land: [0.12 * m, 1.5] }),
});

// 2 ПИСТОЛЕТ: a grab of the near leg and the sleeve, lift and drive him over
// 2 ПИСТОЛЕТ: the sleeve held like a pistol grip, a turn in and a drop to both knees under him: he goes over the shoulder (seoi-otoshi)
mk('pistol', {
  vk: 0.37, vkOver: 0.55,
  name: 'Пистолет', jp: 'Сэои-отоси (захват «пистолет»)', range: 1.65, cost: 13, base: 0.56, power: 1.05, fall: 'forward',
  tori(m) {
    const turn = R({ hip: [0, 0.44, 0], hr: [0.2, 0, 0], sp: [0.3, 0, 0], nk: [-0.1, 0, 0], fL: [0.09, 0.046, 0.05], fR: [-0.09, 0.046, -0.04], kn: [0.8, 0.35] });
    const drop = R({ hip: [0, 0.27, 0.0], hr: [0.38, 0, 0], sp: [0.8, 0, 0], nk: [-0.5, 0, 0], fL: [0.1, 0.05, -0.24], fR: [-0.1, 0.05, -0.27], kn: [1.2, 0.3] });
    const kake = R({ hip: [0, 0.23, 0.02], hr: [0.55, 0, 0], sp: [1.15, 0, 0], nk: [-0.75, 0, 0], fL: [0.1, 0.05, -0.27], fR: [-0.1, 0.05, -0.3], kn: [1.2, 0.3] });
    const up = R({ hip: [0, 0.4, 0.02], hr: [0.25, 0, 0], sp: [0.5, 0, 0], nk: [-0.2, 0, 0], fL: [0.1, 0.046, 0.0], fR: [-0.1, 0.046, -0.12], kn: [0.9, 0.35] });
    return [[0, 0, 1.0, PI, R({})], [0.28, 0.04 * m, 0.68, PI - m * PI * 0.5, turn], [0.5, 0.06 * m, 0.4, PI - m * PI, drop], [0.86, 0.06 * m, 0.42, PI - m * PI, kake], [1.3, 0.06 * m, 0.2, PI - m * PI, up], [1.8, 0, 0.1, PI - m * PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.32, 0, 0.06, 0, UK_PULLED], [0.6, 0, 0.14, 0, R({ hip: [0, 0.55, 0.18], sp: [0.75, 0, 0], nk: [-0.35, 0, 0], fL: [0.07, 0.15, 0.14], fR: [-0.06, 0.06, -0.02] })]]; },
  grips(m) { return { 0: { L: ['sleeveL', 'u'], R: ['armpitR', 'u'] } }; },
  drive: (m) => ({ t0: 0.62, dur: 0.4, pivot: [0.06 * m, 0.5, 0.65], axis: [1, 0, 0], ang: 3.2, lift: 0.05, push: [0, 0.8], over: 0.3, land: [0.06 * m, 1.6] }),   // he rolls over the back and the shoulder
});

// 3 ПЛЕЧО (ippon-seoi-nage): drop under him, load him on the back, throw him over the shoulder
mk('plecho', {
  vk: 0.72, vkOver: 0.49,
  name: 'Плечо', jp: 'Иппон-сэои-нагэ', range: 1.6, cost: 12, base: 0.58, power: 1.05, fall: 'forward',
  tori(m) {
    const fit = R({ hip: [0.0, 0.36, -0.04], hr: [0.28, 0, 0], sp: [0.72, 0, 0], nk: [-0.4, 0, 0], fL: [0.09, 0.046, 0.03], fR: [-0.09, 0.046, -0.02], kn: [0.9, 0.35] });
    const kake = R({ hip: [0, 0.36, -0.08], hr: [0.75, 0, 0], sp: [1.5, 0, 0], nk: [-0.95, 0, 0], fL: [0.09, 0.046, 0.04], fR: [-0.09, 0.046, -0.01], kn: [0.95, 0.35] });   // deep: his back is the table uke rolls over
    return [[0, 0, 1.0, PI, R({})], [0.3, 0.05 * m, 0.7, PI - m * PI * 0.5, R({ hip: [0, 0.45, 0], sp: [0.3, 0, 0], fL: [0.08, 0.046, 0.06], fR: [-0.08, 0.046, -0.05] })],
      [0.55, 0.08 * m, 0.38, PI - m * PI, fit], [0.92, 0.08 * m, 0.4, PI - m * PI, kake], [1.3, 0.08 * m, 0.4, PI - m * PI, REC], [1.9, 0, 0.7, PI - m * PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.35, 0, 0.05, 0, UK_PULLED], [0.65, 0, 0.1, 0, R({ hip: [0, 0.56, 0.14], sp: [0.6, 0, 0], nk: [-0.3, 0, 0], fL: [0.07, 0.14, 0.12], fR: [-0.06, 0.05, -0.02] })]]; },
  grips(m) { return { 0: { L: ['armpitR', 'u'], R: ['sleeveL', 'u'] } }; },
  drive: (m) => ({ t0: 0.68, dur: 0.4, pivot: [0.08 * m, 0.95, 0.45], axis: [1, 0, 0], ang: 3.1, lift: 0.05, drop: 0.3, push: [0, 0.55], over: 0.1, land: [0.08 * m, 1.5] }),
});

// 4 СКОЛЕН (hiza-guruma): the sole blocks his knee, the hands turn him over it
mk('skolen', {
  vk: 0.3, vkOver: 0.53,
  name: 'Сколен', jp: 'Хиза-гурума', range: 1.55, cost: 9, base: 0.62, power: 0.9, fall: 'side',
  tori(m) {
    const blk = R({ hip: [0, 0.5, 0.05], hr: [0.1, 0, 0], sp: [0.25, 0, 0.12 * m], nk: [0, 0, 0], fL: [0.08, 0.046, 0.0], fR: [-0.06, 0.28, 0.42], kn: [0.2, 0.2] });
    return [[0, 0, 1.0, PI, R({})], [0.35, 0, 0.95, PI, R({ hip: [0, 0.52, 0.04], sp: [0.2, 0, 0], fL: [0.07, 0.046, 0.05], fR: [-0.06, 0.1, 0.2] })], [0.6, 0, 0.9, PI, blk], [1.0, 0, 0.9, PI, blk], [1.45, 0, 0.9, PI, blk], [1.9, 0, 0.95, PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.4, 0, 0.05, 0, R({ hip: [0.02 * m, 0.55, 0.05], sp: [0.22, 0, 0.05], nk: [-0.1, 0, 0] })], [0.62, 0, 0.1, 0, R({ hip: [0.04 * m, 0.55, 0.08], sp: [0.35, 0, 0.1 * m], nk: [-0.15, 0, 0] })]]; },
  grips(m) { return { 0: { L: ['lapelR', 'u'], R: ['sleeveL', 'u'] } }; },
  drive: (m) => ({ t0: 0.62, dur: 0.4, pivot: [0, 0.45, 0.2], axis: [0.7, 0, 0.7], ang: 3.0, lift: 0.1, push: [0, 0.1], over: 0.35, overAng: 4.4, land: [-0.55, 0.75] }),
});

// 5 ЗАЦЕП (o-uchi-gari): step in, hook his inside leg and push him back
mk('zacep', {
  vk: 0.42,
  name: 'Зацеп', jp: 'О-ути-гари', range: 1.4, cost: 9, base: 0.66, power: 0.95, fall: 'backward',
  tori(m) {
    const hook = R({ hip: [0, 0.5, 0.18], hr: [0.15, 0, 0], sp: [0.28, 0, 0], nk: [0, 0, 0], fL: [0.07, 0.046, 0.3], fR: [-0.07, 0.16, 0.62], kn: [0.2, 0.2] });
    return [[0, 0, 1.0, PI, R({})], [0.3, 0, 0.8, PI, R({ hip: [0, 0.5, 0.1], sp: [0.2, 0, 0], fL: [0.07, 0.046, 0.25], fR: [-0.07, 0.046, -0.02] })], [0.6, 0, 0.62, PI, hook], [1.0, 0, 0.6, PI, R({ hip: [0, 0.5, 0.25], hr: [0.2, 0, 0], sp: [0.5, 0, 0], fL: [0.07, 0.046, 0.35], fR: [-0.07, 0.1, 0.8] })], [1.3, 0, 0.7, PI, REC], [1.9, 0, 0.8, PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.45, 0, 0.02, 0, R({ hip: [0, 0.545, 0.0], sp: [0.05, 0, 0], fL: [0.07, 0.046, 0.0], fR: [-0.1, 0.1, -0.05] })], [0.7, 0, 0.02, 0, R({ hip: [0, 0.54, -0.04], sp: [-0.12, 0, 0], fL: [0.06, 0.046, 0.0], fR: [-0.1, 0.12, -0.08] })]]; },
  grips(m) { return { 0: { L: ['lapelR', 'u'], R: ['sleeveL', 'u'] } }; },
  drive: (m) => ({ t0: 0.72, dur: 0.34, pivot: [0, 0.06, -0.03], axis: [1, 0, 0], ang: -1.55, lift: 0.04, push: [0, -0.1] }),
});

// 6 ПОДСЕЧКА (de-ashi-barai): the sole sweeps the stepping foot
mk('podsechka', {
  vk: 0.4,
  name: 'Подсечка', jp: 'Де-аши-барай', range: 1.45, cost: 7, base: 0.7, power: 0.8, fall: 'side',
  tori(m) {
    const sw = R({ hip: [0, 0.52, 0.05], hr: [0.1, 0, 0], sp: [0.2, 0, 0.1 * m], nk: [0, 0, 0], fL: [0.07, 0.046, 0.0], fR: [-0.06, 0.1, 0.55], kn: [0.2, 0.2] });
    return [[0, 0, 1.0, PI, R({})], [0.28, 0, 0.95, PI, R({ hip: [0, 0.53, 0.04], sp: [0.18, 0, 0], fR: [-0.06, 0.07, 0.25] })], [0.5, 0, 0.9, PI, sw], [0.9, 0, 0.9, PI, R({ hip: [0, 0.52, 0.12], sp: [0.35, 0, 0.1 * m], fL: [0.07, 0.046, 0.1], fR: [-0.06, 0.1, 0.62] })], [1.2, 0, 0.95, PI, R({ hip: [0, 0.52, 0.1], sp: [0.3, 0, 0.05 * m], fL: [0.07, 0.046, 0.1], fR: [-0.06, 0.046, 0.3] })], [1.7, 0, 1.0, PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.4, 0, 0.0, 0, R({ hip: [0, 0.55, 0.03], sp: [0.12, 0, 0], fL: [0.07, 0.15, 0.2], fR: [-0.06, 0.046, -0.04] })], [0.58, 0, 0.02, 0, R({ hip: [0, 0.55, 0.06], sp: [0.15, 0, 0], fL: [0.07, 0.12, 0.3], fR: [-0.06, 0.046, -0.04] })]]; },
  grips(m) { return { 0: { L: ['lapelR', 'u'], R: ['sleeveL', 'u'] } }; },
  drive: (m) => ({ t0: 0.6, dur: 0.3, pivot: [0, 0.05, 0.0], axis: [-0.3, 0, -0.95], ang: 1.7, lift: 0.1, push: [-0.45 * m, 0.25] }),
});

// 7 БЕДРО (o-goshi): the hip as a fulcrum, an arm around his waist
mk('bedro', {
  vk: 0.7, vkOver: 0.54,
  name: 'Бедро', jp: 'О-госи', range: 1.5, cost: 11, base: 0.6, power: 0.95, fall: 'forward',
  tori(m) {
    const fit = R({ hip: [0, 0.42, -0.05], hr: [0.25, 0, 0], sp: [0.5, 0, 0], nk: [-0.2, 0, 0], fL: [0.1, 0.046, 0.0], fR: [-0.1, 0.046, 0.0], kn: [0.8, 0.35] });
    const kake = R({ hip: [0, 0.42, -0.06], hr: [0.7, 0, 0], sp: [1.3, 0, 0], nk: [-0.8, 0, 0], fL: [0.1, 0.046, 0.0], fR: [-0.1, 0.046, 0.0], kn: [0.85, 0.35] });
    return [[0, 0, 1.0, PI, R({})], [0.3, 0.05 * m, 0.7, PI - m * PI * 0.5, R({ hip: [0, 0.5, 0], sp: [0.25, 0, 0], fL: [0.08, 0.046, 0.06], fR: [-0.08, 0.046, -0.04] })], [0.54, 0.05 * m, 0.38, PI - m * PI, fit], [0.9, 0.05 * m, 0.4, PI - m * PI, kake], [1.3, 0.05 * m, 0.4, PI - m * PI, REC], [1.9, 0, 0.7, PI - m * PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.35, 0, 0.04, 0, UK_PULLED], [0.64, 0, 0.1, 0, R({ hip: [0, 0.56, 0.1], sp: [0.5, 0, 0], nk: [-0.25, 0, 0], fL: [0.07, 0.1, 0.1], fR: [-0.06, 0.05, -0.02] })]]; },
  grips(m) { return { 0: { L: ['backBelt', 'u'], R: ['sleeveL', 'u'] } }; },
  drive: (m) => ({ t0: 0.66, dur: 0.34, pivot: [0.05 * m, 0.9, 0.42], axis: [1, 0, 0], ang: 3.2, lift: 0.05, drop: 0.2, push: [0, 0.5], over: 0.12, land: [0.06 * m, 1.45] }),
});

// 8 ОТХВАТ (o-soto-gari): beside him, a big reap of the outside leg, a push on the chest
mk('otkhvat', {
  vk: 0.33,
  name: 'Отхват', jp: 'О-сото-гари', range: 1.45, cost: 11, base: 0.58, power: 1.05, fall: 'backward',
  tori(m) {
    const swing = R({ hip: [0, 0.51, 0.08], hr: [0.12, 0, 0], sp: [0.32, 0, 0], nk: [-0.05, 0, 0], fL: [0.1, 0.046, 0.02], fR: [-0.1, 0.17, 0.24], kn: [0.45, 0.25] });
    const reap = R({ hip: [0, 0.5, 0.12], hr: [0.3, 0, 0], sp: [0.6, 0, 0], nk: [-0.15, 0, 0], fL: [0.1, 0.046, 0.0], fR: [-0.1, 0.3, -0.26], kn: [0.2, 0.2] });
    const fwd = R({ hip: [0, 0.5, 0.18], hr: [0.45, 0, 0], sp: [0.9, 0, 0], nk: [-0.4, 0, 0], fL: [0.1, 0.046, 0.0], fR: [-0.1, 0.56, -0.58], kn: [0.2, 0.2] });
    return [[0, 0, 1.0, PI, R({})], [0.3, 0.2 * m, 0.7, PI, R({ hip: [0, 0.52, 0.04], sp: [0.2, 0, 0], fL: [0.09, 0.046, 0.12], fR: [-0.08, 0.046, -0.02] })], [0.55, 0.22 * m, 0.42, PI, swing], [0.74, 0.22 * m, 0.4, PI, reap], [0.98, 0.22 * m, 0.38, PI, fwd], [1.28, 0.22 * m, 0.42, PI, REC], [1.9, 0.1 * m, 0.7, PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.45, 0, 0.0, 0, R({ hip: [0, 0.545, -0.02], sp: [0.02, 0, 0], fL: [0.07, 0.046, 0.0], fR: [-0.07, 0.07, -0.02] })], [0.72, 0, 0, 0, R({ hip: [0, 0.54, -0.06], sp: [-0.2, 0, 0], nk: [0.15, 0, 0] })]]; },
  grips(m) { return { 0: { L: ['collarR', 'u'], R: ['sleeveL', 'u'] } }; },
  drive: (m) => ({ t0: 0.72, dur: 0.36, pivot: [0, 0.06, -0.03], axis: [1, 0, 0], ang: -1.6, lift: 0.06, push: [0, -0.1] }),
});

// 9 ЧЕРЕЗ СПИНУ (morote-seoi-nage): both hands, a deep turn under him
mk('spina', {
  vk: 0.85, vkOver: 0.47,
  name: 'Через спину', jp: 'Мороте-сэои-нагэ', range: 1.6, cost: 13, base: 0.56, power: 1.1, fall: 'forward',
  tori(m) {
    const fit = R({ hip: [0, 0.34, -0.05], hr: [0.3, 0, 0], sp: [0.8, 0, 0], nk: [-0.4, 0, 0], fL: [0.1, 0.046, 0.03], fR: [-0.1, 0.046, -0.02], kn: [1.0, 0.35] });
    const kake = R({ hip: [0, 0.36, -0.1], hr: [0.8, 0, 0], sp: [1.55, 0, 0], nk: [-1.0, 0, 0], fL: [0.1, 0.046, 0.04], fR: [-0.1, 0.046, -0.01], kn: [1.0, 0.35] });
    return [[0, 0, 1.0, PI, R({})], [0.3, 0, 0.72, PI - m * PI * 0.5, R({ hip: [0, 0.45, 0], sp: [0.3, 0, 0], fL: [0.08, 0.046, 0.06], fR: [-0.08, 0.046, -0.05] })], [0.58, 0, 0.36, PI - m * PI, fit], [0.95, 0, 0.38, PI - m * PI, kake], [1.3, 0, 0.38, PI - m * PI, REC], [1.9, 0, 0.7, PI - m * PI, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.35, 0, 0.06, 0, UK_PULLED], [0.68, 0, 0.12, 0, R({ hip: [0, 0.56, 0.15], sp: [0.65, 0, 0], nk: [-0.35, 0, 0], fL: [0.07, 0.15, 0.13], fR: [-0.06, 0.05, -0.02] })]]; },
  grips(m) { return { 0: { L: ['armpitL', 'u'], R: ['armpitR', 'u'] } }; },
  drive: (m) => ({ t0: 0.72, dur: 0.42, pivot: [0, 0.98, 0.45], axis: [1, 0, 0], ang: 3.3, lift: 0.05, drop: 0.3, push: [0, 0.6], over: 0.1, land: [0, 1.55] }),
});

// 10 ТОМОЭ-НАГЭ: a sacrifice throw, he sits back and the foot in his belly sends him over the head
mk('tomoe', {
  vk: 0.55, vkOver: 0.46,
  name: 'Томоэ-нагэ', jp: 'Томоэ-нагэ', range: 1.65, cost: 12, base: 0.64, power: 1.15, fall: 'forward', follow: 0,
  tori(m) {
    // he pulls uke onto his toes, drops on his seat right between uke's feet, the sole on the belly
    const step = R({ hip: [0, 0.46, 0.0], hr: [0.1, 0, 0], sp: [0.15, 0, 0], fL: [0.09, 0.046, 0.12], fR: [-0.08, 0.046, 0.0], kn: [0.7, 0.35] });
    const sit = R({ hip: [0, 0.16, -0.05], hr: [-0.6, 0, 0], sp: [-0.35, 0, 0], nk: [0.35, 0, 0], fL: [0.12, 0.04, 0.22], fR: [-0.06, 0.3, 0.2], kn: [0.9, 0.35] });
    const roll = R({ hip: [0, 0.09, -0.16], hr: [-1.25, 0, 0], sp: [-0.25, 0, 0], nk: [0.6, 0, 0], fL: [0.12, 0.04, 0.1], fR: [-0.05, 0.42, 0.14], kn: [0.9, 0.35] });
    const kick = R({ hip: [0, 0.09, -0.2], hr: [-1.4, 0, 0], sp: [-0.2, 0, 0], nk: [0.6, 0, 0], fL: [0.12, 0.04, 0.05], fR: [-0.05, 0.5, -0.05], kn: [0.6, 0.35] });
    return [[0, 0, 1.0, PI, R({})], [0.26, 0, 0.62, PI, step], [0.46, 0, 0.42, PI, sit], [0.6, 0, 0.42, PI, roll], [0.9, 0, 0.42, PI, kick], [1.5, 0, 0.42, PI, roll], [2.0, 0, 0.42, PI, roll]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.3, 0, 0.08, 0, UK_PULLED], [0.55, 0, 0.2, 0, R({ hip: [0, 0.52, 0.16], sp: [0.7, 0, 0], nk: [-0.4, 0, 0], fL: [0.07, 0.12, 0.16], fR: [-0.06, 0.05, 0.02], kn: [0.4, 0.3] })]]; },
  grips(m) { return { 0: { L: ['lapelR', 'u'], R: ['lapelL', 'u'] } }; },
  drive: (m) => ({ t0: 0.6, dur: 0.42, pivot: [0, 0.8, 0.42], axis: [1, 0, 0], ang: 3.3, lift: 0.15, push: [0, 1.25], over: 0.15, land: [0, 1.95] }),   // over tori's head on his foot, not onto him
});

// 11 ТАЙ-ОТОСИ (передняя подножка): a three-quarter turn in front of him, the straight leg across his shin,
// the hands pull him forward and down over it: no hip under him, he trips over the leg and rolls over in front
mk('taiotoshi', {
  vk: 0.25, vkOver: 0.36,
  name: 'Тай-отоси', jp: 'Тай-отоси (передняя подножка)', range: 1.6, cost: 10, base: 0.58, power: 1.0, fall: 'forward',
  tori(m) {
    const turn = R({ hip: [0, 0.48, 0], hr: [0.15, 0, 0], sp: [0.25, 0, 0], nk: [-0.1, 0, 0], fL: [0.09, 0.046, 0.05], fR: [-0.09, 0.046, -0.05], kn: [0.6, 0.35] });
    // the left foot planted in front of him, the right leg straight across his right shin, the knees bent, the chest turned
    const block = R({ hip: [0.02, 0.42, -0.02], hr: [0.25, 0, 0], sp: [0.55, -0.25, 0.1], nk: [-0.3, 0.2, 0], fL: [0.12, 0.046, 0.06], fR: [-0.36, 0.09, -0.06], kn: [0.9, 0.6] });
    const kake = R({ hip: [0.02, 0.4, -0.02], hr: [0.35, 0, 0], sp: [0.8, -0.4, 0.15], nk: [-0.45, 0.3, 0], fL: [0.12, 0.046, 0.06], fR: [-0.37, 0.09, -0.06], kn: [0.95, 0.6] });
    return [[0, 0, 1.0, PI, R({})], [0.28, 0.05 * m, 0.7, PI - m * PI * 0.4, turn], [0.52, 0.12 * m, 0.42, PI - m * PI * 0.75, block], [0.88, 0.12 * m, 0.42, PI - m * PI * 0.8, kake], [1.25, 0.12 * m, 0.45, PI - m * PI * 0.8, REC], [1.9, 0, 0.7, PI - m * PI * 0.8, R({})]];
  },
  uke(m) { return [[0, 0, 0, 0, R({})], [0.3, 0, 0.06, 0, UK_PULLED], [0.6, 0, 0.14, 0, R({ hip: [0, 0.55, 0.16], sp: [0.7, 0, 0], nk: [-0.35, 0, 0], fL: [0.07, 0.12, 0.14], fR: [-0.06, 0.05, 0.05], kn: [0.3, 0.3] })]]; },
  grips(m) { return { 0: { L: ['sleeveL', 'u'], R: ['lapelR', 'u'] } }; },
  drive: (m) => ({ t0: 0.64, dur: 0.38, pivot: [-0.05 * m, 0.55, 0.32], axis: [1, 0, 0.25 * m], ang: 3.0, lift: 0.15, drop: 0.1, push: [0.15 * m, 0.55], over: 0.3, land: [0.12 * m, 1.4] }),
});

J.TECHS = T;
J.TECH_ORDER = ['podhvat', 'pistol', 'plecho', 'skolen', 'zacep', 'podsechka', 'bedro', 'otkhvat', 'spina', 'tomoe', 'taiotoshi'];
J.loadout = ['podhvat', 'plecho'];   // the two trained throws on the square and the triangle

// the buttons: square / triangle = the two trained throws; cross / circle = the leg techniques; L1 and R1 open the other throws
J.mapReq = function (f, req) {
  const L = req.limb === 'L';
  switch (req.type) {
    case 'straight': case 'body': return L ? J.loadout[0] : J.loadout[1];
    case 'lowKick': case 'headKick': return L ? 'podsechka' : 'zacep';
    case 'hook': return L ? 'bedro' : 'spina';
    case 'bodyKick': return L ? 'otkhvat' : 'skolen';
    case 'uppercut': return L ? 'pistol' : 'tomoe';
    default: return J.loadout[0];
  }
};
})();

