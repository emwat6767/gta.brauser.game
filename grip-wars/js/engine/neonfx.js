//# sourceURL=ufc/neonfx.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;

// ===========================================================================
// Neon: glowing gloves, light trails behind the fists and a hard energy aura.
// Colours follow the state: cyan/magenta (style), violet/cyan (Low Key),
// gold (flow), red-orange (committed strikes).
// ===========================================================================
const COL = { base: [0x00f0ff, 0xff2bd6], lowkey: [0x8a5cff, 0x00f0ff], flow: [0xffd45a, 0xff8a1a], commit: [0xff4a1a, 0xffd0a0], angry: [0xffc21a, 0xff5a00] };
let glowTexture = null;
function glowTex() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.28, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

class Trail {
  constructor(scene, n) {
    this.n = n || 18; this.scene = scene; this.pts = []; this.seeded = false;
    for (let i = 0; i < this.n; i++) this.pts.push(new THREE.Vector3());
    this.pos = new Float32Array(this.n * 2 * 3); this.col = new Float32Array(this.n * 2 * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx = []; for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c0 = new THREE.Color(); this._c1 = new THREE.Color(); this._c = new THREE.Color();
  }
  push(p) {
    if (!this.seeded) { for (const q of this.pts) q.copy(p); this.seeded = true; return; }
    for (let i = this.n - 1; i > 0; i--) this.pts[i].copy(this.pts[i - 1]);
    this.pts[0].copy(p);
  }
  build(c0, c1, alpha, width, camPos) {
    this._c0.setHex(c0); this._c1.setHex(c1);
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1), p = this.pts[i], pa = this.pts[Math.max(0, i - 1)], pb = this.pts[Math.min(this.n - 1, i + 1)];
      this._a.subVectors(pa, pb);                      // direction of travel
      this._b.subVectors(camPos, p);
      this._a.cross(this._b);
      if (this._a.lengthSq() < 1e-9) this._a.set(0, 1, 0);
      this._a.normalize().multiplyScalar(width * Math.pow(1 - t, 0.8));
      const o = i * 6;
      this.pos[o] = p.x + this._a.x; this.pos[o + 1] = p.y + this._a.y; this.pos[o + 2] = p.z + this._a.z;
      this.pos[o + 3] = p.x - this._a.x; this.pos[o + 4] = p.y - this._a.y; this.pos[o + 5] = p.z - this._a.z;
      this._c.copy(this._c0).lerp(this._c1, t);
      const al = alpha * Math.pow(1 - t, 1.4), q = i * 8;
      this.col[q] = this.col[q + 4] = this._c.r; this.col[q + 1] = this.col[q + 5] = this._c.g; this.col[q + 2] = this.col[q + 6] = this._c.b;
      this.col[q + 3] = this.col[q + 7] = al;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

function auraMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uTime: { value: 0 }, uInt: { value: 0 }, uC0: { value: new THREE.Color(0x00f0ff) }, uC1: { value: new THREE.Color(0xff2bd6) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uTime; uniform float uInt; uniform vec3 uC0; uniform vec3 uC1; varying vec3 vN; varying vec3 vV; varying float vY;' +
      'void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.35); float b = 0.5 + 0.5 * sin(vY * 22.0 - uTime * 7.0); float b2 = 0.5 + 0.5 * sin(vY * 9.0 + uTime * 3.0);' +
      'float a = f * (0.3 + 0.7 * b) * (0.55 + 0.45 * b2) * uInt; vec3 c = mix(uC0, uC1, 0.5 + 0.5 * sin(vY * 5.0 + uTime * 2.0)); gl_FragColor = vec4(c * a * 2.8, min(1.0, a * 1.6)); }',
  });
}

class NeonFx {
  constructor(f) {
    this.f = f; this.t = Math.random() * 5; this.int = 0; this.glove = 0.7;
    const scene = f.game.scene, h = f.h;
    this.trL = new Trail(scene); this.trR = new Trail(scene);
    const sm = () => new THREE.SpriteMaterial({ map: glowTex(), color: 0x00f0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.gL = new THREE.Sprite(sm()); this.gR = new THREE.Sprite(sm());
    this.gL.renderOrder = 7; this.gR.renderOrder = 7; scene.add(this.gL); scene.add(this.gR);
    this.aura = new THREE.Mesh(new THREE.CapsuleGeometry(0.235 * h, 0.6 * h, 8, 24), auraMaterial());
    this.aura.position.y = 0.52 * h; this.aura.visible = false; this.aura.renderOrder = 5; f.body.root.add(this.aura);
    const N = 40; this.sp = new Float32Array(N * 3); this.spT = new Float32Array(N);
    for (let i = 0; i < N; i++) this.spT[i] = Math.random();
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.sp, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.07 * h, map: glowTex(), color: 0x00f0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    this.sparks.frustumCulled = false; this.sparks.visible = false; f.body.root.add(this.sparks);
    this._v = new THREE.Vector3();
  }
  state() {
    const f = this.f;
    if (f.commitLeft > 0) return { c: COL.commit, a: 1.0, g: 2.0 };
    if (f.angry) return { c: COL.angry, a: 1.25, g: 2.4 };
    if (f.flow > 0) return { c: COL.flow, a: 0.9, g: 1.7 };
    if (f.lowKey) return { c: COL.lowkey, a: 1.0, g: 1.6 };
    return { c: COL.base, a: 0, g: 1.0 };
  }
  update(dt) {
    const f = this.f, game = f.game;
    if (dt > 0) this.t += dt;
    const live = f.state === 'fight' || f.state === 'getup';
    const st = this.state();
    this.int += (st.a * (live ? 1 : 0) - this.int) * Math.min(1, (dt || 0) * 6);
    // neon gloves
    const mat = f.body.mats && f.body.mats.gloveMat;
    if (mat && mat.emissive) { mat.emissive.setHex(st.c[0]); mat.emissiveIntensity = (0.9 + 0.5 * Math.sin(this.t * 6)) * st.g; }
    const cam = game.camera ? game.camera.position : this._v.set(0, 1.6, 4);
    for (const side of ['L', 'R']) {
      const p = f.gloveW[side], prev = f.prevGloveW[side], tr = side === 'L' ? this.trL : this.trR, gs = side === 'L' ? this.gL : this.gR;
      if (live) tr.push(p);
      const sp = dt > 0 ? p.distanceTo(prev) / dt : 0;
      const striking = f.strike && f.strike.limb === side && f.strike.phase !== 'wind';
      const al = live ? M.clamp(sp / 4.5, 0, 1) * 0.85 + (striking ? 0.25 : 0) + this.int * 0.22 : 0;
      tr.build(st.c[0], st.c[1], Math.min(1, al * 1.5), 0.055 * f.h / 1.8 * (1 + this.int * 0.7), cam);
      gs.position.copy(p); gs.material.color.setHex(st.c[0]);
      gs.material.opacity = live ? 0.55 + 0.25 * Math.sin(this.t * 7 + (side === 'L' ? 0 : 2)) + (striking ? 0.25 : 0) : 0;
      const sc = (0.26 + 0.1 * this.int) * f.h / 1.8; gs.scale.set(sc, sc, sc);
      gs.visible = live;
    }
    // aura and sparks
    const u = this.aura.material.uniforms;
    this.aura.visible = this.int > 0.02 && !f.angry;   // no aura around the angry form
    if (this.aura.visible) { u.uTime.value = this.t; u.uInt.value = this.int; u.uC0.value.setHex(st.c[0]); u.uC1.value.setHex(st.c[1]); }
    this.sparks.visible = this.int > 0.05 && !f.angry;
    if (this.sparks.visible) {
      const h = f.h, N = this.spT.length;
      for (let i = 0; i < N; i++) {
        this.spT[i] = (this.spT[i] + (dt || 0) * (0.55 + (i % 5) * 0.12)) % 1;
        const a = i * 2.399 + this.t * 1.4, r = (0.26 + 0.07 * Math.sin(i * 1.7)) * h / 1.8;
        this.sp[i * 3] = Math.cos(a) * r; this.sp[i * 3 + 1] = this.spT[i] * 1.15 * h; this.sp[i * 3 + 2] = Math.sin(a) * r;
      }
      this.sparks.geometry.attributes.position.needsUpdate = true;
      this.sparks.material.color.setHex(st.c[0]); this.sparks.material.opacity = 0.9 * this.int;
    }
  }
  // The angry form: gold gloves, red-and-orange camouflage shorts, a red body, a compact 170 cm frame
  setForm(on) {
    const f = this.f, m = f.body.mats; if (!m) return;
    if (on) {
      if (this._orig) return;
      const o = this._orig = { skins: [], scale: f.body.root.scale.x };
      const skins = new Set([m.skin, m.skinDark, m.armSkin].concat(m.extraSkins || []).filter((x) => x && x !== m.headSkin));   // the face is painted separately
      for (const k of skins) { o.skins.push([k, k.color.clone(), k.emissive ? k.emissive.clone() : null]); k.color.setRGB(1.0, 0.66, 0.6); if (k.emissive) k.emissive.setRGB(0.08, 0.01, 0.01); }
      if (m.headSkin) { o.head = m.headSkin.color.clone(); m.headSkin.color.setRGB(1.0, 0.74, 0.68); }
      if (m.gloveMat) { o.glove = [m.gloveMat.color.clone(), m.gloveMat.metalness, m.gloveMat.roughness]; m.gloveMat.color.setHex(0xffc21a); m.gloveMat.metalness = 0.85; m.gloveMat.roughness = 0.28; }
      const cloth = [m.shortsMat, m.sleeveMatL, m.sleeveMatR].filter(Boolean);
      if (cloth.length) {
        o.cloth = cloth.map((x) => [x, x.map, x.color.clone()]);
        const tex = UFC.body.canvasTex(256, 256, (c) => {
          const g = c.getContext('2d'); g.fillStyle = '#a50f16'; g.fillRect(0, 0, 256, 256);
          const cols = ['#ff7a1a', '#7a0a10', '#ffb04a', '#d8231b', '#ff5a00'];
          for (let i = 0; i < 70; i++) { g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.rotate(Math.random() * 3); g.fillStyle = cols[i % cols.length]; g.beginPath(); g.ellipse(0, 0, 10 + Math.random() * 26, 6 + Math.random() * 14, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
        }, true);
        for (const x of cloth) { x.map = tex; x.color.setHex(0xffffff); x.needsUpdate = true; }
      }
      if (m.trimMat) { o.trim = m.trimMat.color.clone(); m.trimMat.color.setHex(0xff6a00); }
      f.body.root.scale.setScalar(1.7 / f.h);   // he becomes 170 cm
      f.angryFace = true; f._faceDirty = true; f._faceT = 0;   // a flushed face, a bruise under the eye, a little blood
    } else if (this._orig) {
      const o = this._orig; this._orig = null;
      for (const [k, c, e] of o.skins) { k.color.copy(c); if (e && k.emissive) k.emissive.copy(e); }
      if (o.head) m.headSkin.color.copy(o.head);
      if (o.glove) { m.gloveMat.color.copy(o.glove[0]); m.gloveMat.metalness = o.glove[1]; m.gloveMat.roughness = o.glove[2]; }
      if (o.cloth) for (const [x, mp, c] of o.cloth) { x.map = mp; x.color.copy(c); x.needsUpdate = true; }
      if (o.trim) m.trimMat.color.copy(o.trim);
      f.body.root.scale.setScalar(o.scale);
      f.angryFace = false; f._faceDirty = true; f._faceT = 0;
    }
  }

  dispose() {
    const scene = this.f.game.scene;
    this.trL.dispose(); this.trR.dispose();
    for (const s of [this.gL, this.gR]) { scene.remove(s); s.material.dispose(); }
    this.f.body.root.remove(this.aura); this.aura.geometry.dispose(); this.aura.material.dispose();
    this.f.body.root.remove(this.sparks); this.sparks.geometry.dispose(); this.sparks.material.dispose();
  }

  // an expanding ring where the big blow lands
  static shockwave(game, point, hex) {
    const list = NeonFx.rings || (NeonFx.rings = []);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 48), new THREE.MeshBasicMaterial({ color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(point); m.renderOrder = 8; game.scene.add(m);
    list.push({ m, t: 0, game });
  }
  static tick(dt) {
    const list = NeonFx.rings; if (!list || !list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i]; r.t += dt;
      const k = r.t / 0.5, cam = r.game.camera;
      if (cam) r.m.lookAt(cam.position);
      r.m.scale.setScalar(1 + k * 9); r.m.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { r.game.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); list.splice(i, 1); }
    }
  }
}
UFC.NeonFx = NeonFx;
})();

