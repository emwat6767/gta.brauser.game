//# sourceURL=ufc/ragdoll.js
(function () {
'use strict';
const UFC = window.UFC;
const V3 = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;

const _x = new V3(), _y = new V3(), _z = new V3(), _m = new M4(), _q = new Q(), _q2 = new Q(), _v = new V3();

// Quaternion that maps local -Y onto `dir`, with local +Z leaning toward `pole`.
function aimDown(dir, pole, out) {
  _y.copy(dir).normalize().negate();
  _z.copy(pole).addScaledVector(_y, -pole.dot(_y));
  if (_z.lengthSq() < 1e-8) { _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0); }
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
// Basis from +X (right->left axis) and +Y (up axis).
function basisXY(xAxis, yAxis, out) {
  _y.copy(yAxis).normalize();
  _x.copy(xAxis).addScaledVector(_y, -xAxis.dot(_y));
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
UFC.aimDown = aimDown;
UFC.basisXY = basisXY;

const P = ['hips', 'chest', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'hpL', 'knL', 'ftL', 'hpR', 'knR', 'ftR'];
const RADIUS = { head: 0.11, hips: 0.12, chest: 0.13, neck: 0.07, shL: 0.07, shR: 0.07, elL: 0.045, elR: 0.045, haL: 0.05, haR: 0.05, hpL: 0.08, hpR: 0.08, knL: 0.06, knR: 0.06, ftL: 0.05, ftR: 0.05 };
const MASS = { head: 1.2, hips: 3.0, chest: 3.0, neck: 0.8, shL: 1.2, shR: 1.2, elL: 0.7, elR: 0.7, haL: 0.5, haR: 0.5, hpL: 1.6, hpR: 1.6, knL: 1.2, knR: 1.2, ftL: 0.8, ftR: 0.8 };

class Ragdoll {
  constructor(fighter) {
    this.f = fighter;
    this.active = false;
    this.p = {}; this.prev = {};
    P.forEach((k) => { this.p[k] = new V3(); this.prev[k] = new V3(); });
    this.sticks = [];
    this.time = 0;
    this.settle = 0;
  }

  _headCenter(out) {
    const f = this.f, B = f.body.B, h = f.body.dims.h;
    return B.head.localToWorld(out.set(0, 0.05 * h, 0.01 * h));
  }

  start(impulse, spin, tone = 0) {
    this.tone = tone;
    const f = this.f, B = f.body.B;
    f.body.root.updateMatrixWorld(true);
    const wp = (bone, key) => bone.getWorldPosition(this.p[key]);
    wp(B.hips, 'hips'); wp(B.chest, 'chest'); wp(B.neck, 'neck'); this._headCenter(this.p.head);
    wp(B.uaL, 'shL'); wp(B.faL, 'elL'); wp(B.handL, 'haL');
    wp(B.uaR, 'shR'); wp(B.faR, 'elR'); wp(B.handR, 'haR');
    wp(B.thL, 'hpL'); wp(B.snL, 'knL'); wp(B.ftL, 'ftL');
    wp(B.thR, 'hpR'); wp(B.snR, 'knR'); wp(B.ftR, 'ftR');

    // Seed velocities from the last frame's motion plus the blow.
    const dt = 1 / 120;
    const base = f.vel.clone();
    P.forEach((k) => {
      const v = base.clone();
      const y = this.p[k].y;
      const topW = Math.max(0, (y - 0.7) / 1.1); // upper body takes the impulse
      v.addScaledVector(impulse, topW * (k === 'head' ? 1.5 : 1));
      if (k === 'ftL' || k === 'ftR' || k === 'knL' || k === 'knR') v.addScaledVector(impulse, -0.12);
      if (spin) { v.x += -this.p[k].z * spin * topW * 0.2; v.z += this.p[k].x * spin * topW * 0.2; }
      this.prev[k].copy(this.p[k]).addScaledVector(v, -dt);
    });

    const s = (a, b, stiff = 1, minOnly = false) => this.sticks.push({ a, b, len: this.p[a].distanceTo(this.p[b]), stiff, minOnly });
    this.sticks.length = 0;
    s('hips', 'chest'); s('chest', 'neck'); s('neck', 'head'); s('hips', 'neck', 0.8);
    s('neck', 'shL'); s('neck', 'shR'); s('shL', 'shR'); s('chest', 'shL'); s('chest', 'shR');
    s('hips', 'hpL'); s('hips', 'hpR'); s('hpL', 'hpR');
    s('shL', 'hpL', 0.8); s('shR', 'hpR', 0.8); s('shL', 'hpR', 0.6); s('shR', 'hpL', 0.6);
    s('chest', 'hpL', 0.7); s('chest', 'hpR', 0.7);
    s('head', 'shL', 0.35); s('head', 'shR', 0.35); s('head', 'chest', 0.3);
    s('shL', 'elL'); s('elL', 'haL'); s('shR', 'elR'); s('elR', 'haR');
    s('hpL', 'knL'); s('knL', 'ftL'); s('hpR', 'knR'); s('knR', 'ftR');
    // joint limits: don't let limbs fold through themselves
    const lim = (a, b, frac) => { const st = { a, b, len: 0, stiff: 0.5, minOnly: true }; this.sticks.push(st); st.len = frac; };
    const d = f.body.dims;
    lim('shL', 'haL', (d.upper + d.fore) * 0.35); lim('shR', 'haR', (d.upper + d.fore) * 0.35);
    lim('hpL', 'ftL', (d.thigh + d.shin) * 0.45); lim('hpR', 'ftR', (d.thigh + d.shin) * 0.45);
    lim('head', 'hips', d.chestLen + d.neckLen);

    this.active = true;
    this.time = 0;
    this.settle = 0;
    this.rootYaw = f.yaw;
  }

  step(dt) {
    if (!this.active) return;
    this.time += dt;
    const g = -9.81 * dt * dt;
    // Conscious fall: muscles still work. The head is held off the canvas and
    // the hands reach down to break the fall.
    if (this.tone > 0 && this.time < 1.4) {
      const k = this.tone * (1 - this.time / 1.4), p = this.p, a = -g;
      p.head.y += a * 0.55 * k; p.neck.y += a * 0.35 * k; p.chest.y += a * 0.15 * k;
      p.haL.y -= a * 0.5 * k; p.haR.y -= a * 0.5 * k;
    }
    let motion = 0;
    for (const k of P) {
      const p = this.p[k], pr = this.prev[k];
      const vx = (p.x - pr.x) * 0.995, vy = (p.y - pr.y) * 0.995, vz = (p.z - pr.z) * 0.995;
      pr.copy(p);
      p.x += vx; p.y += vy + g; p.z += vz;
      motion += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
    }
    for (let it = 0; it < 10; it++) {
      for (const s of this.sticks) {
        const a = this.p[s.a], b = this.p[s.b];
        _v.subVectors(b, a);
        const dist = _v.length() || 1e-6;
        if (s.minOnly && dist >= s.len) continue;
        const diff = (dist - s.len) / dist;
        const wa = 1 / MASS[s.a], wb = 1 / MASS[s.b];
        const k = s.stiff * diff / (wa + wb);
        a.addScaledVector(_v, k * wa);
        b.addScaledVector(_v, -k * wb);
      }
      for (const k of P) {
        const p = this.p[k], r = RADIUS[k];
        if (p.y < r) {
          p.y = r;
          const pr = this.prev[k];
          // ground friction
          pr.x += (p.x - pr.x) * 0.35; pr.z += (p.z - pr.z) * 0.35;
          if (pr.y < p.y - 0.0001) pr.y = p.y + (pr.y - p.y) * -0.2;
        }
        UFC.clampToOctagon(p, r + 0.12);
      }
    }
    this.settle = motion;
  }

  // Write particle state back onto the skeleton.
  apply() {
    if (!this.active) return;
    const f = this.f, B = f.body.B, root = f.body.root, p = this.p;
    root.position.set(p.hips.x, 0, p.hips.z);
    root.rotation.set(0, this.rootYaw, 0);
    root.updateMatrixWorld(true);
    const rootQ = root.getWorldQuaternion(new Q());
    const rootQi = rootQ.clone().invert();

    B.hips.position.copy(root.worldToLocal(_v.copy(p.hips)));
    const hipX = new V3().subVectors(p.hpL, p.hpR);
    const hipUp = new V3().subVectors(p.chest, p.hips);
    const Qh = basisXY(hipX, hipUp, new Q());
    B.hips.quaternion.copy(rootQi).multiply(Qh);
    B.spine.quaternion.identity();

    const shX = new V3().subVectors(p.shL, p.shR);
    const chUp = new V3().subVectors(p.neck, p.chest);
    const Qc = basisXY(shX, chUp, new Q());
    B.chest.quaternion.copy(Qh).invert().multiply(Qc);

    const Qn = basisXY(shX, new V3().subVectors(p.head, p.neck), new Q());
    B.neck.quaternion.copy(Qc).invert().multiply(Qn);
    B.head.quaternion.identity();

    const fwdC = new V3(0, 0, 1).applyQuaternion(Qc);
    const fwdH = new V3(0, 0, 1).applyQuaternion(Qh);
    for (const s of ['L', 'R']) {
      const Qu = aimDown(new V3().subVectors(p['el' + s], p['sh' + s]), fwdC, new Q());
      B['ua' + s].quaternion.copy(Qc).invert().multiply(Qu);
      const zU = new V3(0, 0, 1).applyQuaternion(Qu);
      const Qf = aimDown(new V3().subVectors(p['ha' + s], p['el' + s]), zU, new Q());
      B['fa' + s].quaternion.copy(Qu).invert().multiply(Qf);
      B['hand' + s].quaternion.identity();

      const Qt = aimDown(new V3().subVectors(p['kn' + s], p['hp' + s]), fwdH, new Q());
      B['th' + s].quaternion.copy(Qh).invert().multiply(Qt);
      const zT = new V3(0, 0, 1).applyQuaternion(Qt);
      const Qs = aimDown(new V3().subVectors(p['ft' + s], p['kn' + s]), zT, new Q());
      B['sn' + s].quaternion.copy(Qt).invert().multiply(Qs);
      B['ft' + s].quaternion.identity();
    }
  }

  stop() { this.active = false; }
}

UFC.Ragdoll = Ragdoll;
})();

