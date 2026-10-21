//# sourceURL=ufc/arena.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;

// Octagon geometry: vertices sit at angles (k + 0.5) * 45deg, so the flat
// fence panels face the world axes. R = centre-to-post distance.
const R = 4.6;
const APOTHEM = R * Math.cos(Math.PI / 8);
UFC.OCT = { R, APOTHEM };

function setSRGB(tex) { if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding; return tex; }

function matTexture() {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const cx = S / 2;
  // canvas base
  const grad = g.createRadialGradient(cx, cx, 100, cx, cx, S * 0.7);
  grad.addColorStop(0, '#d9d6cf'); grad.addColorStop(1, '#bdb9b0');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
    g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 3, 1);
  }
  // scuffs
  for (let i = 0; i < 160; i++) {
    g.fillStyle = 'rgba(60,50,40,' + (Math.random() * 0.05) + ')';
    g.beginPath(); g.ellipse(cx + (Math.random() - 0.5) * S * 0.6, cx + (Math.random() - 0.5) * S * 0.6, 20 + Math.random() * 90, 8 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  // world metres -> texture pixels (texture spans the mat's bounding circle)
  const px = (m) => (m / (R + 0.9)) * (S / 2);
  const oct = (rad) => { g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const x = cx + Math.cos(a) * rad, y = cx + Math.sin(a) * rad; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
  // dark apron from just inside the fence outward
  oct(px(R + 0.5)); g.lineWidth = px(1.0); g.strokeStyle = '#141416'; g.stroke();
  oct(px(R - 0.45)); g.lineWidth = 7; g.strokeStyle = '#b3121b'; g.stroke();
  // centre logo
  g.save(); g.translate(cx, cx);
  g.beginPath(); g.arc(0, 0, S * 0.155, 0, Math.PI * 2); g.fillStyle = 'rgba(20,20,22,0.92)'; g.fill();
  g.lineWidth = 10; g.strokeStyle = '#c8101a'; g.stroke();
  g.fillStyle = '#f2f0ea';
  g.font = '900 ' + (S * 0.12) + 'px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('UFC', 0, S * 0.006);
  g.restore();
  // corner/side marks
  g.save(); g.translate(cx, cx);
  g.font = '900 ' + (S * 0.032) + 'px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = ['ULTIMATE', 'FIGHTING', 'CHAMPIONSHIP', 'UFC', 'ULTIMATE', 'FIGHTING', 'CHAMPIONSHIP', 'UFC'];
  for (let k = 0; k < 8; k++) {
    g.save(); g.rotate(k * Math.PI / 4); g.translate(0, S * 0.36);
    g.fillStyle = k % 2 ? 'rgba(180,16,26,0.55)' : 'rgba(25,25,28,0.45)';
    g.fillText(words[k], 0, 0); g.restore();
  }
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return setSRGB(tex);
}

function fenceTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(12,12,14,0.95)'; g.lineWidth = 7;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S);
  g.moveTo(-S / 2, S / 2); g.lineTo(S / 2, S * 1.5); g.moveTo(S / 2, -S / 2); g.lineTo(S * 1.5, S / 2);
  g.moveTo(S / 2, -S / 2); g.lineTo(-S / 2, S / 2); g.moveTo(S * 1.5, S / 2); g.lineTo(S / 2, S * 1.5);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function textTexture(lines, w = 1024, hgt = 256, bg = '#0b0b0d') {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const draw = (ls) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, hgt);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(200,16,26,0.35)'); grad.addColorStop(0.5, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(200,16,26,0.35)');
    g.fillStyle = grad; g.fillRect(0, 0, w, hgt);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    ls.forEach((l, i) => {
      g.font = (i === 0 ? '900 ' + hgt * 0.36 : '700 ' + hgt * 0.2) + 'px Impact, "Arial Black", sans-serif';
      g.fillStyle = i === 0 ? '#ffffff' : '#e3b341';
      g.fillText(l, w / 2, hgt * (ls.length === 1 ? 0.5 : 0.38 + i * 0.36));
    });
    tex.needsUpdate = true;
  };
  draw(lines);
  tex.redraw = draw;
  return setSRGB(tex);
}

class Arena {
  constructor(scene, lowPerf, medium) {
    this.scene = scene;
    this.low = lowPerf;
    this.medium = !!medium;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.crowdLevel = 0.2;
    this._build();
  }

  _build() {
    const G = this.group;
    const std = (color, rough = 0.7, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra || {}));

    // arena floor
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), std(0x0c0c0e, 0.95));
    this.floorMesh = floor;
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.0; floor.receiveShadow = true;
    G.add(floor);

    // platform apron + mat
    const _nMat0 = G.children.length;
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.9, R + 1.0, 1.0, 8, 1), std(0x111113, 0.6));
    apron.rotation.y = Math.PI / 8; apron.position.y = -0.505; apron.receiveShadow = true;
    G.add(apron);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.01, R + 1.01, 0.72, 8, 1, true), std(0x1a1a1d, 0.5, { emissive: 0x2a0205, emissiveIntensity: 0.6 }));
    skirt.rotation.y = Math.PI / 8; skirt.position.y = -0.55;
    G.add(skirt);
    const mat = new THREE.Mesh(new THREE.CircleGeometry(R + 0.9, 8), std(0xffffff, 0.88, { map: matTexture() }));
    mat.rotation.x = -Math.PI / 2; mat.rotation.z = Math.PI / 8; mat.position.y = 0.001; mat.receiveShadow = true;
    // CircleGeometry(8) puts vertices at k*45deg; rotating by 22.5deg aligns
    // them with the posts and the painted octagon in the texture.
    mat.geometry.rotateZ(0);
    G.add(mat);
    this.mat = mat;

    this.matObjs = G.children.slice(_nMat0);
    // cage
    const _nCage0 = G.children.length;
    const postMat = std(0x0a0a0b, 0.45);
    const padMat = std(0x121214, 0.55);
    const fenceTex = fenceTexture();
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x151517, map: fenceTex, transparent: true, alphaTest: 0.01, depthWrite: false, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 });
    this.panels = [];
    // chain-link uses the texture's alpha
    fenceMat.map = fenceTex;
    const H = 1.8, side = 2 * R * Math.sin(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * Math.PI / 4;
      const px = Math.cos(a) * R, pz = Math.sin(a) * R;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, H + 0.12, 16), postMat);
      post.position.set(px, H / 2, pz); post.castShadow = true;
      G.add(post);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.25, 16), padMat);
      pad.position.set(px * 0.99, 0.95, pz * 0.99);
      G.add(pad);

      const mid = (k + 1) * Math.PI / 4; // centre of panel between post k and k+1
      const ex = Math.cos(mid) * APOTHEM, ez = Math.sin(mid) * APOTHEM;
      const tex = fenceTex.clone(); tex.needsUpdate = true;
      tex.repeat.set(side / 0.12, (H - 0.3) / 0.12);
      const panelMat = fenceMat.clone(); panelMat.map = tex;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(side, H - 0.3), panelMat);
      panel.position.set(ex, 0.3 + (H - 0.3) / 2, ez);
      panel.lookAt(0, panel.position.y, 0);
      G.add(panel);
      this.panels.push({ mesh: panel, nx: Math.cos(mid), nz: Math.sin(mid) });
      // top rail, axis laid along the panel tangent
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, side + 0.1, 12), padMat);
      rail.position.set(ex, H, ez);
      rail.rotation.set(Math.PI / 2, -mid, 0, 'YXZ');
      G.add(rail);
      // bottom padding with red stripe
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(side, 0.32, 0.1), std(0x141416, 0.6));
      bottom.position.set(ex, 0.16, ez); bottom.lookAt(0, 0.16, 0);
      G.add(bottom);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(side * 0.98, 0.03, 0.102), std(0xb3121b, 0.5, { emissive: 0x300000 }));
      stripe.position.set(ex, 0.26, ez); stripe.lookAt(0, 0.26, 0);
      G.add(stripe);
    }

    this.cageObjs = G.children.slice(_nCage0);
    // ---- lighting ----
    const hemi = new THREE.HemisphereLight(0x8a93a8, 0x0b0b0d, 0.22);
    G.add(hemi);
    this.hemi = hemi;
    this.fills = [];
    const key = new THREE.SpotLight(0xfff4e6, 1.75, 30, Math.PI / 4.2, 0.6, 1.2);
    key.position.set(0, 11, 0.8); key.target.position.set(0, 0, 0);
    key.castShadow = !this.low;
    const sm = this.low ? 512 : this.medium ? 1024 : 2048;
    key.shadow.mapSize.set(sm, sm);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 4; key.shadow.camera.far = 16;
    G.add(key, key.target);
    this.key = key;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const s = new THREE.SpotLight(0xdfe6ff, 0.75, 26, Math.PI / 7, 0.7, 1.5);
      s.position.set(Math.cos(a) * 9, 8.5, Math.sin(a) * 9); s.target.position.set(0, 1, 0);
      G.add(s, s.target);
      this.fills.push(s);
    }
    const rim = new THREE.DirectionalLight(0x9fb4ff, 0.25);
    rim.position.set(-6, 5, -8); G.add(rim);

    // lighting rig (truss with light boxes) above the cage
    const trussMat = std(0x1b1b1f, 0.5, { metalness: 0.6 });
    const rig = new THREE.Group(); rig.position.y = 8.2;
    const ringGeo = new THREE.TorusGeometry(4.2, 0.08, 6, 8);
    const ring = new THREE.Mesh(ringGeo, trussMat); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 8; rig.add(ring);
    const lampMat = std(0x222222, 0.4, { emissive: 0xfff3dc, emissiveIntensity: 2.2 });
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10), lampMat);
      lamp.position.set(Math.cos(a) * 4.2, -0.18, Math.sin(a) * 4.2);
      rig.add(lamp);
    }
    G.add(rig);

    // hanging screens with the matchup
    this.screenTex = textTexture(['UFC', 'FIGHT NIGHT']);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false });
    const boxMat = std(0x0a0a0a, 0.4);
    const cube = new THREE.Group(); cube.position.y = 11.2;
    for (let k = 0; k < 4; k++) {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), screenMat);
      const a = k * Math.PI / 2;
      scr.position.set(Math.sin(a) * 2.11, 0, Math.cos(a) * 2.11);
      scr.rotation.y = a;
      cube.add(scr);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 4.2), boxMat); cube.add(back);
    G.add(cube);

    this._buildTunnel();

    // follow spot for walkouts: a single moving beam over the fighter
    const spot = new THREE.SpotLight(0xfff1d6, 0, 34, 0.30, 0.55, 1.1);
    spot.position.set(0, 9.6, -6);
    this.spotTarget = new THREE.Object3D(); this.spotTarget.position.set(0, 1, -7);
    G.add(this.spotTarget); spot.target = this.spotTarget;
    G.add(spot); this.spot = spot; this.spotWant = 0;

    this._buildCrowd();

    // light beams for walkouts (additive cones hanging from the rig)
    this.beams = [];
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    for (let k = 0; k < 6; k++) {
      const geo = new THREE.ConeGeometry(1.1, 9, 24, 1, true); geo.translate(0, -4.5, 0);
      const beam = new THREE.Mesh(geo, beamMat.clone());
      beam.position.set(Math.cos(k * Math.PI / 3) * 4.2, 8.2, Math.sin(k * Math.PI / 3) * 4.2);
      beam.visible = false;
      G.add(beam); this.beams.push(beam);
    }
    this.lightMode = 'fight';
    this.lightLevel = { key: 1.75, fill: 0.75, hemi: 0.22, beams: 0 };
  }

  // 'fight' normal broadcast lighting, 'walkout' dim house + beams, 'stage' weigh-in
  showLights(mode) { this.lightMode = mode; }

  // Entrance tunnel behind -Z: a dark portal with a lit frame, a carpet to the
  // cage and steps up to the door.
  _buildTunnel() {
    const G = this.group;
    const std = (color, rough = 0.7, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra || {}));
    const T = new THREE.Group(); T.position.set(0, -1.0, -8.5);
    const dark = std(0x08080a, 0.92);
    const W = 3.4, H = 3.0, D = 3.0;
    const wall = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, D), dark); m.position.set(x, H / 2, -D / 2); T.add(m); };
    wall(-W / 2 - 0.2); wall(W / 2 + 0.2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(W + 1.0, 0.5, D), dark); top.position.set(0, H + 0.25, -D / 2); T.add(top);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x050506 }));
    back.position.set(0, H / 2, -D + 0.02); T.add(back);
    // lit red frame around the opening
    const neon = new THREE.MeshBasicMaterial({ color: 0xd20a11, toneMapped: false });
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), neon); m.position.set(x, y, 0.06); T.add(m); };
    bar(W + 0.9, 0.12, 0, H + 0.02); bar(0.12, H, -W / 2 - 0.18, H / 2); bar(0.12, H, W / 2 + 0.18, H / 2);
    // event name over the mouth of the tunnel
    this.tunnelTex = textTexture(['UFC'], 512, 128, '#111114');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, 0.5), new THREE.MeshBasicMaterial({ map: this.tunnelTex, toneMapped: false }));
    sign.position.set(0, H + 0.55, 0.05); T.add(sign);
    // glow from inside the tunnel
    const gl = new THREE.PointLight(0xffd7a0, 1.1, 10, 1.6); gl.position.set(0, 1.7, -1.4); T.add(gl);
    this.tunnelLight = gl;
    // carpet from the tunnel to the cage
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.6), std(0x131317, 0.95));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.012, 2.4); T.add(carpet);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.8), std(0x6a0a0f, 0.9));
    edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.006, 2.4); T.add(edge);
    G.add(T); this.tunnel = T;

    // steps up to the cage door
    const steps = new THREE.Group(); steps.position.set(0, -1.0, -5.55);
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.34, 0.42), std(0x141418, 0.9));
      st.position.set(0, 0.17 + i * 0.33, -0.45 + i * 0.42); steps.add(st);
    }
    G.add(steps); this.steps = steps;
  }

  // point the follow spot at a spot on the floor (world x/z), and switch it on
  spotTo(x, z, y = 1.0) {
    if (!this.spot) return;
    this.spotTarget.position.set(x, y, z);
    this.spot.position.set(x * 0.35, 9.6, z * 0.55 - 1.2);
  }
  spotOn(v) { this.spotWant = v ? 3.2 : 0; }

  _updateLights(dt, time) {
    const want = this.lightMode === 'walkout' ? { key: 1.1, fill: 0.25, hemi: 0.1, beams: 0.16 }
      : this.lightMode === 'stage' ? { key: 1.35, fill: 0.9, hemi: 0.3, beams: 0.05 }
      : { key: 1.75, fill: 0.75, hemi: 0.22, beams: 0 };
    const L = this.lightLevel;
    for (const k in want) L[k] = M.damp(L[k], want[k], 2.5, dt);
    this.key.intensity = L.key;
    for (const s of this.fills) s.intensity = L.fill;
    this.hemi.intensity = L.hemi;
    if (this.spot) this.spot.intensity = M.damp(this.spot.intensity, this.spotWant || 0, 3, dt);
    if (this.tunnelLight) this.tunnelLight.intensity = this.lightMode === 'walkout' ? 1.5 : 0.5;
    this.beams.forEach((b, i) => {
      b.visible = L.beams > 0.005;
      if (!b.visible) return;
      b.material.opacity = L.beams * (0.7 + 0.3 * Math.sin(time * 2 + i));
      b.rotation.set(Math.sin(time * 0.6 + i * 1.3) * 0.45, 0, Math.cos(time * 0.5 + i * 0.9) * 0.45);
    });
  }

  _buildCrowd() {
    const count = this.low ? 700 : this.medium ? 1400 : 2200;
    const bodyGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.75, 7);
    bodyGeo.translate(0, 0.375, 0);
    const headGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    const heads = new THREE.InstancedMesh(headGeo, headMat, count);
    const seatGroup = new THREE.Group();
    this.crowd = { bodies, heads, data: [] };
    const dummy = new THREE.Object3D();
    const clothes = [0x1c1c22, 0x2b2b33, 0x3a1f1f, 0x1f2a3a, 0x444444, 0x5a5a5a, 0x7a1515, 0x0f3a2a, 0x6b5a3a, 0x202020];
    const skins = [0xd9b08c, 0xc68e64, 0x8d5a3b, 0xe8c4a2, 0x5c3a24];
    const col = new THREE.Color();
    let i = 0;
    // tiered bowl
    const tiers = [];
    for (let row = 0; row < 24; row++) {
      const rad = 8.6 + row * 0.95;
      const y = -0.2 + row * 0.45;
      tiers.push({ rad, y });
    }
    // tier risers
    const riserMat = new THREE.MeshLambertMaterial({ color: 0x0e0e11 });
    for (let r = 0; r < tiers.length; r += 1) {
      const t = tiers[r];
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(t.rad + 0.5, t.rad + 0.5, 0.42, 48, 1, true), riserMat);
      riser.position.y = t.y - 0.21; riser.material.side = THREE.BackSide;
      seatGroup.add(riser);
      const step = new THREE.Mesh(new THREE.RingGeometry(t.rad - 0.45, t.rad + 0.5, 48), riserMat);
      step.rotation.x = -Math.PI / 2; step.position.y = t.y; seatGroup.add(step);
    }
    while (i < count) {
      const t = tiers[(Math.random() * tiers.length) | 0];
      const a = Math.random() * Math.PI * 2;
      // aisles
      if (Math.abs(((a / (Math.PI / 4)) % 1) - 0.5) < 0.04) continue;
      const rad = t.rad + (Math.random() - 0.5) * 0.3;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      // keep the entrance corridor clear: no seats in front of the tunnel
      if (z < -6.5 && Math.abs(x) < 2.9 && rad < 13.5) continue;
      const sc = 0.9 + Math.random() * 0.2;
      this.crowd.data.push({ x, y: t.y, z, a, sc, phase: Math.random() * 10, amp: Math.random(), standing: Math.random() < 0.25 });
      dummy.position.set(x, t.y, z); dummy.rotation.set(0, -a - Math.PI / 2, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      col.setHex(clothes[(Math.random() * clothes.length) | 0]).multiplyScalar(0.22 + Math.random() * 0.18);
      bodies.setColorAt(i, col);
      col.setHex(skins[(Math.random() * skins.length) | 0]).multiplyScalar(0.3);
      heads.setColorAt(i, col);
      i++;
    }
    bodies.instanceColor.needsUpdate = true; heads.instanceColor.needsUpdate = true;
    this.group.add(seatGroup, bodies, heads);
    // crowd lighting (dim warm)
    const crowdLight = new THREE.PointLight(0xffc89a, 0.35, 30, 1.5);
    const barrier = new THREE.Mesh(new THREE.CylinderGeometry(7.9, 7.9, 1.3, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x220205, emissiveIntensity: 0.5 }));
    barrier.position.y = -0.35; this.group.add(barrier);
    crowdLight.position.set(0, 7, 0); this.group.add(crowdLight);

    // camera flashes
    const flashGeo = new THREE.PlaneGeometry(0.35, 0.35);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.flashes = [];
    for (let k = 0; k < 18; k++) {
      const f = new THREE.Mesh(flashGeo, flashMat.clone());
      f.visible = false; this.group.add(f); this.flashes.push({ mesh: f, t: 0 });
    }
    this._dummy = dummy;
  }

  setMatchup(a, b) { this.screenTex.redraw([a + '  VS  ' + b, 'UFC FIGHT NIGHT']); }

  // Fade fence panels that sit between the camera and the fighters.
  updateFence(camera, dt) {
    for (const p of this.panels) {
      const outside = camera.position.x * p.nx + camera.position.z * p.nz > APOTHEM - 0.2;
      p.mesh.material.opacity = M.damp(p.mesh.material.opacity, outside ? 0.1 : 1, 6, dt);
    }
  }

  excite(amount) { this.crowdLevel = Math.min(1, this.crowdLevel + amount); }

  update(dt, time, camera) {
    this._updateLights(dt, time);
    this.crowdLevel = M.damp(this.crowdLevel, 0.2, 0.35, dt);
    const lvl = this.crowdLevel;
    const { bodies, heads, data } = this.crowd;
    const d = this._dummy;
    // Animate a rotating subset each frame to keep it cheap.
    const n = data.length;
    const stride = this.low ? 3 : 2;
    const offset = (this._frame = ((this._frame || 0) + 1) % stride);
    for (let i = offset; i < n; i += stride) {
      const p = data[i];
      const jump = Math.max(0, Math.sin(time * (5 + p.amp * 4) + p.phase)) * lvl * lvl * 0.28 * p.amp;
      const stand = (p.standing || lvl > 0.65) ? 0.18 : 0;
      d.position.set(p.x, p.y + jump + stand, p.z);
      d.rotation.set(0, -p.a - Math.PI / 2, 0);
      d.scale.setScalar(p.sc);
      d.updateMatrix();
      bodies.setMatrixAt(i, d.matrix);
      d.position.y += 0.87 * p.sc;
      d.updateMatrix();
      heads.setMatrixAt(i, d.matrix);
    }
    bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;

    // phone/camera flashes, more when the crowd is loud
    for (const f of this.flashes) {
      if (f.t > 0) {
        f.t -= dt; f.mesh.material.opacity = Math.max(0, f.t / 0.12);
        if (f.t <= 0) f.mesh.visible = false;
      } else if (Math.random() < dt * (0.25 + lvl * 3.5)) {
        const p = data[(Math.random() * n) | 0];
        f.mesh.position.set(p.x, p.y + 1.1, p.z);
        if (camera) f.mesh.quaternion.copy(camera.quaternion);
        f.mesh.visible = true; f.t = 0.12;
      }
    }
  }
}

UFC.Arena = Arena;

// Keep a point inside the octagon (margin in metres). Returns true if pushed.
UFC.clampToOctagon = function (pos, margin) {
  let pushed = false;
  const lim = APOTHEM - margin;
  for (let k = 0; k < 8; k++) {
    const a = (k + 1) * Math.PI / 4;
    const nx = Math.cos(a), nz = Math.sin(a);
    const d = pos.x * nx + pos.z * nz;
    if (d > lim) { pos.x -= (d - lim) * nx; pos.z -= (d - lim) * nz; pushed = true; }
  }
  return pushed;
};
UFC.distToCage = function (pos) {
  let best = 1e9;
  for (let k = 0; k < 8; k++) {
    const a = (k + 1) * Math.PI / 4;
    best = Math.min(best, APOTHEM - (pos.x * Math.cos(a) + pos.z * Math.sin(a)));
  }
  return best;
};
})();

