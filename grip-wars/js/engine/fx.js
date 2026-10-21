//# sourceURL=ufc/fx.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3;

// ---------------------------------------------------------------------------
// Particles: sweat spray, blood droplets and mat stains. Kept subtle on
// purpose - sport broadcast, not cartoon sparks.
// ---------------------------------------------------------------------------
class FX {
  constructor(scene) {
    this.scene = scene;
    const MAX = 600;
    this.max = MAX;
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const sprite = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })();
    this.mat = new THREE.PointsMaterial({ size: 0.028, map: sprite, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, opacity: 0.85 });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.parts.push({ alive: false, p: new V3(), v: new V3(), life: 0, max: 1, c: new THREE.Color(), blood: false });
    this.stains = [];
    this.stainMat = new THREE.MeshStandardMaterial({ color: 0x5a0508, roughness: 0.35, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.stainGeo = new THREE.CircleGeometry(1, 10);
  }

  _spawn(pos, vel, life, color, blood) {
    const p = this.parts.find((x) => !x.alive);
    if (!p) return;
    p.alive = true; p.p.copy(pos); p.v.copy(vel); p.life = life; p.max = life; p.c.set(color); p.blood = blood;
  }

  sweat(point, dir, power) {
    const n = Math.floor(8 + power * 2.2);
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(M.rand(0.8, 2.6) + power * 0.08);
      v.x += M.rand(-1, 1) * 0.9; v.y += M.rand(-0.2, 1.2); v.z += M.rand(-1, 1) * 0.9;
      this._spawn(point, v, M.rand(0.25, 0.6), 0xdfe8f0, false);
    }
  }

  blood(point, dir, power) {
    const n = Math.floor(3 + power * 0.8);
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(M.rand(0.5, 2.0));
      v.x += M.rand(-0.6, 0.6); v.y += M.rand(0, 1.3); v.z += M.rand(-0.6, 0.6);
      this._spawn(point, v, M.rand(0.6, 1.2), 0x7a0a0e, true);
    }
  }

  _stain(x, z, r) {
    if (this.stains.length > 70) { const old = this.stains.shift(); this.scene.remove(old); }
    const m = new THREE.Mesh(this.stainGeo, this.stainMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z);
    m.scale.set(r * M.rand(0.8, 1.4), r, 1);
    m.rotation.z = Math.random() * 3;
    this.scene.add(m); this.stains.push(m);
  }

  clearStains() { this.stains.forEach((s) => this.scene.remove(s)); this.stains.length = 0; }

  update(dt) {
    const pos = this.positions, col = this.colors;
    let n = 0;
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life -= dt;
      p.v.y -= 9.8 * dt;
      p.v.multiplyScalar(p.blood ? 0.995 : 0.97);
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.01) {
        if (p.blood && Math.random() < 0.6) this._stain(p.p.x, p.p.z, M.rand(0.015, 0.045));
        p.alive = false; continue;
      }
      if (p.life <= 0) { p.alive = false; continue; }
      const a = M.sat(p.life / p.max * 1.6);
      pos[n * 3] = p.p.x; pos[n * 3 + 1] = p.p.y; pos[n * 3 + 2] = p.p.z;
      col[n * 3] = p.c.r * a; col[n * 3 + 1] = p.c.g * a; col[n * 3 + 2] = p.c.b * a;
      n++;
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
UFC.FX = FX;

// ---------------------------------------------------------------------------
// Broadcast camera: side-on to the fight line, framed on both fighters,
// with trauma-based shake and cinematic overrides for knockdowns.
// ---------------------------------------------------------------------------
class BroadcastCamera {
  constructor(camera) {
    this.cam = camera;
    this.pos = new V3(0, 2.2, 7);
    this.look = new V3(0, 1.2, 0);
    this.side = 1;
    this.trauma = 0;
    this.cine = null;
    this.menuT = 0;
    this.fovTarget = 42;
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  cinematic(target, dur, opts) { this.cine = Object.assign({ target, t: 0, dur }, opts || {}); }

  menu(dt) {
    this.menuT += dt * 0.08;
    const a = this.menuT;
    const want = new V3(Math.cos(a) * 7.5, 2.6 + Math.sin(a * 0.7) * 0.5, Math.sin(a) * 7.5);
    this.pos.lerp(want, 1 - Math.exp(-2 * dt));
    this.look.lerp(new V3(0, 0.9, 0), 1 - Math.exp(-2 * dt));
    this._apply(dt, 50);
  }

  preview(dt, target, editor) {
    // In the appearance editor the panel covers the left side: shift the
    // fighter right and come closer so the face and body read clearly.
    const narrow = innerWidth < innerHeight * 1.2;
    const sx = editor ? (narrow ? -0.45 : -0.75) : 0;
    const want = editor ? new V3(target.x + sx, 1.3, target.z + 3.1) : new V3(target.x + 0.2, 1.35, target.z + 2.9);
    this.pos.lerp(want, 1 - Math.exp(-4 * dt));
    this.look.lerp(editor ? new V3(target.x + sx, 1.05, target.z) : new V3(target.x, 1.1, target.z), 1 - Math.exp(-4 * dt));
    this._apply(dt, 40);
  }

  follow(dt, a, b, player) {
    const mid = new V3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
    const axis = new V3().subVectors(b.pos, a.pos); axis.y = 0;
    const sep = axis.length();
    if (sep > 1e-3) axis.divideScalar(sep); else axis.set(1, 0, 0);
    let perp = new V3(-axis.z, 0, axis.x);
    // stay on the same side of the fight line (no 180 flips)
    const cur = new V3().subVectors(this.pos, mid); cur.y = 0;
    if (cur.dot(perp) < 0) perp.negate();
    // The camera lives inside the cage. If the fighters drift toward the
    // fence on our side, cut to the side with room instead of clipping.
    const room = (dir) => {
      let best = 99;
      for (let k = 0; k < 8; k++) {
        const a = (k + 1) * Math.PI / 4, nx = Math.cos(a), nz = Math.sin(a);
        const un = dir.x * nx + dir.z * nz;
        if (un > 1e-4) best = Math.min(best, (UFC.OCT.APOTHEM - 0.3 - (mid.x * nx + mid.z * nz)) / un);
      }
      return best;
    };
    let cut = false;
    const desired = M.clamp(2.6 + sep * 1.1, 3.0, 4.6);
    const here = room(perp), there = room(perp.clone().negate());
    if (here < 2.4 && there > here + 1.2 && (this._cutCooldown || 0) <= 0) { perp.negate(); cut = true; this._cutCooldown = 2.5; }
    this._cutCooldown = (this._cutCooldown || 0) - dt;
    const avail = cut ? there : here;
    const dist = Math.max(1.6, Math.min(desired, avail));
    const cramped = M.sat((desired - dist) / 1.6);
    const want = mid.clone().addScaledVector(perp, dist);
    want.y = 1.75 + sep * 0.1 + cramped * 1.1;
    // keep the camera inside the arena bowl but outside the cage looking in is fine
    let lookT = new V3(mid.x, 1.18 - cramped * 0.15, mid.z);
    let fov = 50 + cramped * 12;
    if (cut) { this.pos.copy(want); this.look.copy(lookT); }
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const tp = c.target.pos;
      const k = M.smooth(Math.min(1, c.t / 0.35)) * (c.t > c.dur - 0.4 ? M.sat((c.dur - c.t) / 0.4) : 1);
      const low = new V3(tp.x, 0, tp.z).addScaledVector(perp, 2.4).addScaledVector(axis, c.flip ? 1.0 : -1.0);
      UFC.clampToOctagon(low, 0.3);
      low.y = c.height || 0.75;
      want.lerp(low, k);
      lookT.lerp(new V3(tp.x, c.lookY || 0.5, tp.z), k);
      fov = M.lerp(fov, c.fov || 36, k);
      if (c.t >= c.dur) this.cine = null;
    }
    this.pos.lerp(want, 1 - Math.exp(-(this.cine ? 6 : 3.2) * dt));
    this.look.lerp(lookT, 1 - Math.exp(-(this.cine ? 7 : 5) * dt));
    this._apply(dt, fov);
  }

  _apply(dt, fov) {
    const cam = this.cam;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma;
    const t = performance.now() * 0.001;
    cam.position.copy(this.pos);
    cam.position.x += (Math.sin(t * 43) * 0.06 + Math.sin(t * 71) * 0.03) * s;
    cam.position.y += (Math.sin(t * 37 + 1) * 0.05 + Math.sin(t * 89) * 0.02) * s;
    cam.lookAt(this.look);
    cam.rotation.z += Math.sin(t * 29) * 0.02 * s;
    cam.fov = M.damp(cam.fov, fov, 5, dt);
    cam.updateProjectionMatrix();
  }
}
UFC.BroadcastCamera = BroadcastCamera;
})();

