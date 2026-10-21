//# sourceURL=ufc/replay.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3, Q = THREE.Quaternion;

// ===========================================================================
// Compact fight replays for knockouts. Both skeletons are sampled at 30 Hz
// into a ring buffer: root position + yaw, hips offset and 17 bone rotations
// quantised to int8. A 4.5 s knockout clip is ~20 KB of base64, small enough
// to keep a collection of them in localStorage and play them back on the
// real 3D fighters.
// ===========================================================================
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'handL', 'uaR', 'faR', 'handR', 'thL', 'snL', 'ftL', 'thR', 'snR', 'ftR'];
const RATE = 30;
const PER = 2 + 3 + 2 + 3 + BONES.length * 4;   // int16 slots: pos(x,z) rootY yaw(2 bytes... see pack)

// frame layout per fighter (Int16Array): px, pz, py, yaw, hx, hy, hz, then quats as int16 (x,y,z,w) * 32767/1
const SLOTS = 7 + BONES.length * 4;

class Recorder {
  constructor(seconds = 6) {
    this.cap = Math.round(seconds * RATE);
    this.buf = [];
    this.acc = 0;
    this.frozen = false;
  }
  reset() { this.buf.length = 0; this.acc = 0; this.frozen = false; this.markIdx = null; }
  sample(dt, fighters) {
    if (this.frozen) return;
    this.acc += dt;
    if (this.acc < 1 / RATE) return;
    this.acc -= 1 / RATE;
    if (this.acc > 1 / RATE) this.acc = 0;
    const frame = new Int16Array(SLOTS * 2);
    fighters.forEach((f, k) => {
      const o = k * SLOTS, root = f.body.root, B = f.body.B;
      frame[o] = Math.round(root.position.x * 1000); frame[o + 1] = Math.round(root.position.z * 1000); frame[o + 2] = Math.round(root.position.y * 1000);
      frame[o + 3] = Math.round(M.wrap(root.rotation.y) / Math.PI * 32767);
      frame[o + 4] = Math.round(B.hips.position.x * 1000); frame[o + 5] = Math.round(B.hips.position.y * 1000); frame[o + 6] = Math.round(B.hips.position.z * 1000);
      BONES.forEach((b, i) => {
        const q = B[b].quaternion, p = o + 7 + i * 4;
        frame[p] = Math.round(q.x * 32767); frame[p + 1] = Math.round(q.y * 32767); frame[p + 2] = Math.round(q.z * 32767); frame[p + 3] = Math.round(q.w * 32767);
      });
    });
    this.buf.push(frame);
    if (this.buf.length > this.cap) { this.buf.shift(); if (this.markIdx != null) this.markIdx--; }
    if (this.markIdx != null && this.buf.length - 1 - this.markIdx >= this.after * RATE) this.frozen = true;
  }
  // Remember "now" as the knockout moment and keep recording `after` seconds.
  mark(after = 1.6) { if (this.markIdx == null) { this.markIdx = this.buf.length - 1; this.after = after; } }

  // Clip [mark - before, end] as a compact serialisable object.
  export(cfgs, meta, before = 3) {
    if (!this.buf.length) return null;
    const mark = this.markIdx == null ? this.buf.length - 1 : this.markIdx;
    const start = Math.max(0, mark - Math.round(before * RATE));
    const frames = this.buf.slice(start);
    const all = new Int16Array(frames.length * SLOTS * 2);
    frames.forEach((fr, i) => all.set(fr, i * SLOTS * 2));
    const bytes = new Uint8Array(all.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return {
      v: 1, rate: RATE, n: frames.length, markAt: mark - start, data: btoa(bin),
      cfgs: cfgs.map((c) => ({ name: c.name, short: c.short, height: c.height, weight: c.weight, reach: c.reach, build: c.build, body: c.body, stance: c.stance, style: c.style, stats: c.stats, look: c.look })),
      meta: meta || {},
    };
  }
}

function decode(clip) {
  const bin = atob(clip.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

const _qa = new Q(), _qb = new Q();

// Plays a clip on two Fighter bodies (already in the scene).
class Player {
  constructor(clip, fighters) {
    this.clip = clip;
    this.arr = decode(clip);
    this.fighters = fighters;
    this.t = 0;
    this.speed = 1;
    this.duration = (clip.n - 1) / clip.rate;
    this.markT = clip.markAt / clip.rate;
  }
  frameIdx(t) { return M.clamp(t * this.clip.rate, 0, this.clip.n - 1); }
  apply(t) {
    const fi = this.frameIdx(t), i0 = Math.floor(fi), i1 = Math.min(this.clip.n - 1, i0 + 1), w = fi - i0;
    const A = this.arr;
    this.fighters.forEach((f, k) => {
      const oa = i0 * SLOTS * 2 + k * SLOTS, ob = i1 * SLOTS * 2 + k * SLOTS;
      const lerp = (j, s) => M.lerp(A[oa + j], A[ob + j], w) / s;
      const root = f.body.root, B = f.body.B;
      root.position.set(lerp(0, 1000), lerp(2, 1000), lerp(1, 1000));
      const ya = A[oa + 3] / 32767 * Math.PI, yb = A[ob + 3] / 32767 * Math.PI;
      root.rotation.set(0, ya + M.wrap(yb - ya) * w, 0);
      B.hips.position.set(lerp(4, 1000), lerp(5, 1000), lerp(6, 1000));
      BONES.forEach((b, i) => {
        const pa = oa + 7 + i * 4, pb = ob + 7 + i * 4;
        _qa.set(A[pa], A[pa + 1], A[pa + 2], A[pa + 3]).normalize();
        _qb.set(A[pb], A[pb + 1], A[pb + 2], A[pb + 3]).normalize();
        B[b].quaternion.slerpQuaternions(_qa, _qb, w);
      });
      f.pos.set(root.position.x, 0, root.position.z); f.yaw = root.rotation.y;
      root.updateMatrixWorld(true);
    });
  }
  // world position of the knockout (loser's head at the marked moment)
  focus(out) {
    const saveT = this.t;
    this.apply(this.markT);
    const loser = this.fighters[this.clip.meta.loser == null ? 1 : this.clip.meta.loser];
    const p = loser.headCenter(out || new V3());
    this.apply(saveT);
    return p;
  }
}

UFC.Replay = { Recorder, Player, decode, RATE };
})();

