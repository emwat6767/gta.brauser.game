//# sourceURL=ufc/ceremony.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ===========================================================================
// Fight-week presentation: weigh-in + face-off, walkout / fighter
// introductions, post-fight replay, referee raising the hand, celebrations,
// belt ceremony and the arena announcer. Every show is a skippable timeline
// driving the real fighters (cine state), the referee and a shot camera.
// ===========================================================================

// ---------------------------------------------------------------- props
function gold(rough = 0.28) { return new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.85, roughness: rough, emissive: 0x4a3208, emissiveIntensity: 0.55 }); }
function silver(rough = 0.3) { return new THREE.MeshStandardMaterial({ color: 0xc9d2de, metalness: 0.85, roughness: rough, emissive: 0x1d2530, emissiveIntensity: 0.5 }); }

// the centre plate: a toothed rim, laurel dots, an enamel disc with a burst, the name of the belt (gold: champion, silver and blue: interim)
function emblemTex(lines, kind) {
  const sv = kind === 'interim';
  return UFC.body.canvasTex(512, 512, (c) => {
    const g = c.getContext('2d'), S = 512, cx = S / 2;
    const gr = g.createRadialGradient(cx * 0.8, cx * 0.7, 20, cx, cx, cx);
    if (sv) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#cfd6e0'); gr.addColorStop(1, '#6a7482'); } else { gr.addColorStop(0, '#fff2b8'); gr.addColorStop(0.45, '#e6b84e'); gr.addColorStop(1, '#8c5e12'); }
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cx, cx, 0, Math.PI * 2); g.fill();
    g.strokeStyle = sv ? '#59616e' : '#6b440a'; g.lineWidth = 3;
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * (cx - 6), cx + Math.sin(a) * (cx - 6)); g.lineTo(cx + Math.cos(a) * (cx - 26), cx + Math.sin(a) * (cx - 26)); g.stroke(); }
    g.lineWidth = 10; g.beginPath(); g.arc(cx, cx, cx - 34, 0, Math.PI * 2); g.stroke();
    g.fillStyle = sv ? '#3b4452' : '#7a520c';
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * (cx - 62), cx + Math.sin(a) * (cx - 62), 5, 0, Math.PI * 2); g.fill(); }
    const eg = g.createRadialGradient(cx, cx * 0.9, 10, cx, cx, cx * 0.52);
    if (sv) { eg.addColorStop(0, '#3a6df0'); eg.addColorStop(1, '#10285f'); } else { eg.addColorStop(0, '#e0242f'); eg.addColorStop(1, '#6e0a10'); }
    g.fillStyle = eg; g.beginPath(); g.arc(cx, cx, cx * 0.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = sv ? '#e8edf5' : '#ffe08a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cx, cx * 0.5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = sv ? 'rgba(255,255,255,0.12)' : 'rgba(255,230,150,0.15)';
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, cx * 0.48, a, a + 0.12); g.closePath(); g.fill(); }
    g.fillStyle = '#fff6d8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 120px Impact, "Arial Black", sans-serif'; g.fillText(lines[0], cx, cx - 10);
    g.font = '700 40px Impact, "Arial Black", sans-serif'; g.fillStyle = sv ? '#e6ecf7' : '#ffe9a8'; g.fillText(lines[1], cx, cx + 78);
    g.fillStyle = sv ? '#2a3140' : '#5a3a08'; g.font = '700 30px Impact, "Arial Black", sans-serif'; g.fillText(lines[2] || '', cx, 92);
    g.font = '700 20px Impact, "Arial Black", sans-serif'; g.fillText('ULTIMATE FIGHTING CHAMPIONSHIP', cx, S - 66);
  });
}
// side plates: a bevelled frame, a dark enamel inlay and a diamond pattern
function sideTex(kind) {
  const sv = kind === 'interim';
  return UFC.body.canvasTex(256, 128, (c) => {
    const g = c.getContext('2d'), W = 256, H = 128;
    const gr = g.createLinearGradient(0, 0, W, H);
    if (sv) { gr.addColorStop(0, '#f2f5fa'); gr.addColorStop(0.5, '#aeb8c6'); gr.addColorStop(1, '#6a7482'); } else { gr.addColorStop(0, '#ffe9a0'); gr.addColorStop(0.5, '#d9a63a'); gr.addColorStop(1, '#8c5e12'); }
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = sv ? '#4a5260' : '#5e3d08'; g.lineWidth = 5; g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = sv ? '#10285f' : '#4a0a0f'; g.fillRect(22, 22, W - 44, H - 44);
    g.strokeStyle = sv ? 'rgba(220,230,250,0.45)' : 'rgba(255,215,120,0.5)'; g.lineWidth = 2;
    for (let x = -H; x < W + H; x += 22) { g.beginPath(); g.moveTo(x, H - 22); g.lineTo(x + (H - 44), 22); g.stroke(); g.beginPath(); g.moveTo(x, 22); g.lineTo(x + (H - 44), H - 22); g.stroke(); }
  });
}
// the leather: grain, gold stitching along both edges
function strapTex(kind) {
  const sv = kind === 'interim';
  return UFC.body.canvasTex(1024, 128, (c) => {
    const g = c.getContext('2d'), W = 1024, H = 128;
    g.fillStyle = '#0d0d10'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')'; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    g.fillStyle = sv ? '#cfd6e0' : '#e6b84e';
    for (let x = 6; x < W; x += 16) { g.fillRect(x, 14, 9, 4); g.fillRect(x, H - 18, 9, 4); }
    g.fillRect(0, 4, W, 3); g.fillRect(0, H - 7, W, 3);
  });
}
function plateSet(kind, divName) {
  const sv = kind === 'interim', metal = (r) => (sv ? silver(r) : gold(r));
  const G = new THREE.Group();
  const centre = new THREE.Group();
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.012, 8), metal(0.32)); back.rotation.x = Math.PI / 2; back.rotation.y = Math.PI / 8; centre.add(back);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.018, 48), [metal(0.3), new THREE.MeshStandardMaterial({ map: emblemTex(['UFC', sv ? 'INTERIM' : 'CHAMPION', String(divName || '').toUpperCase().slice(0, 16)], kind), metalness: 0.55, roughness: 0.38, emissive: 0x201004, emissiveIntensity: 0.4 }), metal(0.3)]);
  plate.rotation.x = Math.PI / 2; plate.position.z = 0.011; centre.add(plate);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.006, 8, 48), metal(0.25)); rim.position.z = 0.012; centre.add(rim);
  const gem = new THREE.MeshStandardMaterial({ color: sv ? 0x3a78ff : 0xd9202b, metalness: 0.2, roughness: 0.15, emissive: sv ? 0x0a2a7a : 0x6a0810, emissiveIntensity: 0.9 });
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const st = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), gem); st.position.set(Math.cos(a) * 0.126, Math.sin(a) * 0.126, 0.014); centre.add(st); }
  G.add(centre);
  const sides = [];
  const sm = [metal(0.3), metal(0.3), metal(0.3), metal(0.3), new THREE.MeshStandardMaterial({ map: sideTex(kind), metalness: 0.5, roughness: 0.4, emissive: 0x201004, emissiveIntensity: 0.35 }), metal(0.3)];
  [[0.17, 0.092, 0.2], [0.125, 0.08, 0.33], [0.09, 0.07, 0.43]].forEach(([w, h, x]) => {
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), sm); p.position.set(sx * x, 0, 0.004); G.add(p);
      const gm = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), gem); gm.position.set(sx * x, 0, 0.013); G.add(gm);
      sides.push(p);
    }
  });
  return { G, centre, sides };
}

// Flat championship belt (carried, lifted overhead): strap along X, plates facing +Z. kind: 'interim' = silver and blue.
function makeFlatBelt(divName, interim) {
  const kind = interim ? 'interim' : 'gold', sv = !!interim;
  const G = new THREE.Group();
  G.name = 'belt';
  const strap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.112, 0.012), new THREE.MeshStandardMaterial({ map: strapTex(kind), roughness: 0.6, metalness: 0.1 }));
  G.add(strap);
  for (const sy of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.007, 0.014), sv ? silver(0.3) : gold(0.3)); e.position.y = sy * 0.056; G.add(e); }
  const P = plateSet(kind, divName); P.G.position.z = 0.008; G.add(P.G);
  G.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return G;
}

function makeBelt(divName, interim) {
  const kind = interim ? 'interim' : 'gold', sv = !!interim;
  const G = new THREE.Group();
  G.name = 'belt';
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.02, 8, 48), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.55, metalness: 0.1 }));
  strap.scale.set(1.28, 1, 3.4);   // flat, wide leather band (ring in the XZ plane after rotation)
  strap.rotation.x = Math.PI / 2;
  G.add(strap);
  const P = plateSet(kind, divName); P.G.scale.setScalar(0.82); P.G.position.set(0, 0, 0.215);
  // the side plates follow the curve of the hips
  P.sides.forEach((p) => { const sx = Math.sign(p.position.x), a = Math.abs(p.position.x) * 1.6; p.position.z = 0.004 - Math.abs(p.position.x) * Math.abs(p.position.x) * 1.7; p.rotation.y = -sx * a * 0.9; });
  P.G.children.forEach((ch) => { if (ch.geometry && ch.geometry.type === 'SphereGeometry' && Math.abs(ch.position.x) > 0.15) { const sx = Math.sign(ch.position.x); ch.position.z = 0.013 - ch.position.x * ch.position.x * 1.7; ch.rotation.y = -sx * Math.abs(ch.position.x) * 1.44; } });
  G.add(P.G);
  G.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return G;
}

UFC.makeFlatBelt = makeFlatBelt; UFC.makeBelt = makeBelt;
// A small cup for the signature celebration.
function makeCup() {
  const G = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.35, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.06, 16, 1, true), mat);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), mat); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.03;
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.4 }));
  tea.rotation.x = -Math.PI / 2; tea.position.y = 0.018;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12, Math.PI * 1.4), mat);
  handle.position.set(0.036, 0, 0); handle.rotation.set(0, Math.PI / 2, 0.4);
  G.add(body, bottom, tea, handle);
  G.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return G;
}

function makeScale() {
  const G = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.7, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.5), metal); base.position.y = 0.03; G.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.008, 0.44), new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.9 })); top.position.y = 0.064; G.add(top);
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), metal); col.position.set(0, 0.55, -0.22); G.add(col);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const tex = new THREE.CanvasTexture(c); UFC.body.setSRGB(tex);
  const draw = (text, sub) => {
    const g = c.getContext('2d');
    g.fillStyle = '#050806'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#3cff7a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 64px Consolas, "Courier New", monospace'; g.fillText(text, 128, 56);
    g.font = '700 20px Consolas, monospace'; g.fillText(sub || 'KG', 128, 108);
    tex.needsUpdate = true;
  };
  draw('--.-');
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.06), metal); head.position.set(0, 1.12, -0.22); G.add(head);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); screen.position.set(0, 1.12, -0.188); G.add(screen);
  G.userData.draw = draw;
  G.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return G;
}

function makeBackdrop(title, sub, names) {
  const tex = UFC.body.canvasTex(1536, 768, (c) => {
    const g = c.getContext('2d'), W = c.width, H = c.height;
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a0204'); gr.addColorStop(0.55, '#5a060b'); gr.addColorStop(1, '#0a0a0c');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.08; g.fillStyle = '#fff';
    for (let x = 0; x < W; x += 180) for (let y = 0; y < H; y += 110) { g.font = '900 40px Impact'; g.fillText('UFC', x + (y / 110 % 2) * 90, y + 60); }
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.font = '900 120px Impact, "Arial Black", sans-serif'; g.fillText(title, W / 2, H * 0.28);
    g.fillStyle = '#e3b341'; g.font = '700 58px Impact, "Arial Black", sans-serif'; g.fillText(sub, W / 2, H * 0.48);
    g.fillStyle = '#fff'; g.font = '900 84px Impact, "Arial Black", sans-serif'; g.fillText(names, W / 2, H * 0.68);
    g.fillStyle = '#d20a11'; g.fillRect(W * 0.1, H * 0.82, W * 0.8, 10);
  });
  const G = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
  board.position.set(0, 1.55, 0); G.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.0, 0.08), new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.6 })); frame.position.set(0, 1.55, -0.05); G.add(frame);
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.0), new THREE.MeshStandardMaterial({ color: 0x1a0507, roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.004, 1.4); carpet.receiveShadow = true; G.add(carpet);
  return G;
}

// Gold / white confetti falling slowly, for title wins.
class Confetti {
  constructor(scene, n = 420) {
    this.scene = scene;
    const geo = new THREE.PlaneGeometry(0.035, 0.018);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.p = [];
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.p.push({ x: M.rand(-4, 4), y: M.rand(3, 9), z: M.rand(-4, 4), vx: M.rand(-0.2, 0.2), vy: -M.rand(0.5, 1.1), rx: Math.random() * 6, ry: Math.random() * 6, sp: M.rand(3, 9) });
      col.setHex([0xf3c74a, 0xffffff, 0xd8a83a, 0xd20a11][i % 4]);
      this.mesh.setColorAt(i, col);
    }
    this.dummy = new THREE.Object3D();
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(dt) {
    const d = this.dummy;
    this.p.forEach((q, i) => {
      q.x += (q.vx + Math.sin(q.ry) * 0.25) * dt; q.y += q.vy * dt; q.rx += q.sp * dt; q.ry += q.sp * 0.7 * dt;
      if (q.y < 0.02) { q.y = 0.02; q.vy = 0; q.sp = 0; }
      d.position.set(q.x, q.y, q.z); d.rotation.set(q.rx, q.ry, 0); d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------------------------------------------------------------- announcer
const Announcer = {
  voices() { try { return window.speechSynthesis ? window.speechSynthesis.getVoices() : []; } catch (e) { return []; } },
  cancel() { try { if (UFC.Voice) UFC.Voice.cancel(); if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* optional */ } },
  // Big arena voice: slow, low and loud. An original style, not an imitation.
  say(game, text, opts = {}) {
    if (game.audio.enabled && game.audio.voiceMode === 'own' && UFC.Voice) {
      try {
        if (game.audio.ensure()) {
          const big = /чемпион|побежд|победитель|новый/i.test(text);
          UFC.Voice.speak(game.audio, text, { voice: 'ring', queue: true, energy: opts.energy != null ? opts.energy : big ? 0.85 : /!/.test(text) ? 0.6 : 0.35 });
          return;
        }
      } catch (e) { /* fall back to the system voice */ }
    }
    if (game.audio.enabled && !opts.en) { game.audio._sysSay(text, 'ring', opts.energy != null ? opts.energy : /чемпион|побежд|победитель|новый/i.test(text) ? 0.85 : /!/.test(text) ? 0.6 : 0.35, true); return; }
    if (!game.audio.enabled || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const vs = this.voices();
      const want = opts.en ? /en(-|_)?(US|GB)?/i : /ru/i;
      const v = vs.find((x) => want.test(x.lang) && /male|pavel|dmitr|david|guy|george|mark|daniel/i.test(x.name)) || vs.find((x) => want.test(x.lang));
      if (v) u.voice = v;
      u.lang = opts.en ? 'en-US' : 'ru-RU';
      u.pitch = opts.pitch || 0.62; u.rate = opts.rate || 0.9; u.volume = Math.min(1, game.audio.volume + 0.2);
      window.speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  },
  lowerThird(html, dur = 3.5) {
    const el = $('#lower3'); if (!el) return;
    el.innerHTML = html; el.classList.add('show');
    clearTimeout(this._lt); this._lt = setTimeout(() => el.classList.remove('show'), dur * 1000);
  },
  big(text, sub, cls, dur = 2.5) {
    const el = $('#announce'); if (!el) return;
    el.className = 'show ' + (cls || '');
    el.innerHTML = '<div>' + text + '</div>' + (sub ? '<small>' + sub + '</small>' : '');
    clearTimeout(this._bt); this._bt = setTimeout(() => (el.className = ''), dur * 1000);
  },
  clear() { ['#lower3', '#announce'].forEach((s) => { const e = $(s); if (e) e.className = e.id === 'announce' ? '' : ''; }); },
};
UFC.Announcer = Announcer;

function recordLine(cfg) {
  const r = cfg.record;
  return r ? r.w + '–' + r.l + (r.d ? '–' + r.d : '') : '';
}
function nameCard(cfg, corner) {
  const flag = UFC.league ? UFC.league.flag(cfg.flag) : '';
  return '<div class="l3-corner ' + (corner === 'red' ? 'red' : 'blue') + '">' + (corner === 'red' ? 'КРАСНЫЙ УГОЛ' : 'СИНИЙ УГОЛ') + '</div>' +
    '<div class="l3-name">' + flag + ' ' + cfg.name + '</div>' +
    '<div class="l3-sub">«' + (cfg.nick || '') + '»' + (cfg.record ? ' · ' + recordLine(cfg) : '') + (cfg.rankLabel ? ' · ' + cfg.rankLabel : '') + '</div>';
}

// ---------------------------------------------------------------- shot camera
class ShotCam {
  constructor(game) { this.game = game; this.shot = null; }
  // pos/look: V3 or () => V3
  set(pos, look, fov = 40, opts = {}) { this.shot = { pos, look, fov, cut: opts.cut !== false, rate: opts.rate || 2.2, orbit: opts.orbit || 0, t: 0 }; }
  update(dt) {
    const s = this.shot; if (!s) return;
    s.t += dt;
    const cam = this.game.cam;
    let p = typeof s.pos === 'function' ? s.pos(s.t) : s.pos.clone();
    const l = typeof s.look === 'function' ? s.look(s.t) : s.look.clone();
    if (s.orbit) {
      const ang = s.orbit * s.t, dx = p.x - l.x, dz = p.z - l.z;
      p = new V3(l.x + dx * Math.cos(ang) - dz * Math.sin(ang), p.y, l.z + dx * Math.sin(ang) + dz * Math.cos(ang));
    }
    if (s.cut && s.t <= dt + 1e-6) { cam.pos.copy(p); cam.look.copy(l); cam.cam.fov = s.fov; }
    else { cam.pos.lerp(p, 1 - Math.exp(-s.rate * dt)); cam.look.lerp(l, 1 - Math.exp(-s.rate * 1.3 * dt)); }
    cam._apply(dt, s.fov);
  }
}

// ---------------------------------------------------------------- base show
class Show {
  constructor(game, name, opts = {}) {
    this.game = game; this.name = name; this.opts = opts;
    this.t = 0; this.steps = []; this.duration = 10;
    this.cam = new ShotCam(game);
    this.actors = []; this.props = [];
    this.done = false;
    this.skippable = opts.skippable !== false;
  }
  at(t, fn) { this.steps.push({ t, fn, fired: false }); return this; }
  every(fn) { this.tickFns = this.tickFns || []; this.tickFns.push(fn); return this; }
  addProp(obj) { this.game.scene.add(obj); this.props.push(obj); return obj; }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    for (const s of this.steps) {
      if (!s.fired && this.t >= s.t) {
        s.fired = true;
        try { s.fn(this); } catch (e) { UFC.reportError(e, 'презентация ' + this.name); }
      }
    }
    for (const f of this.actors) if (f && f.state === 'cine') f.updateCine(dt);
    if (this.game.ref && this.game.ref.visible) this.game.ref.update(dt);
    if (this.tickFns) for (const fn of this.tickFns) { try { fn(dt, this); } catch (e) { UFC.reportError(e, 'презентация ' + this.name); } }
    this.cam.update(dt);
    if (this.t >= this.duration) this.finish();
  }
  skip() { if (this.skippable && !this.done) { Announcer.cancel(); this.finish(true); } }
  finish(skipped) {
    if (this.done) return;
    this.done = true;
    for (const p of this.props) this.game.scene.remove(p);
    document.body.classList.remove('letterbox');
    const skip = $('#skiphint'); if (skip) skip.classList.remove('show');
    try { if (this.cleanup) this.cleanup(skipped); } catch (e) { UFC.reportError(e, 'презентация'); }
    if (this.opts.onDone) this.opts.onDone(skipped);
  }
  begin() {
    const co = $('#callout'); if (co) co.classList.remove('show');
    document.body.classList.add('letterbox');
    const skip = $('#skiphint'); if (skip && this.skippable) skip.classList.add('show');
    return this;
  }
}

// ---------------------------------------------------------------- weigh-in + face-off
// opts: { a: Fighter (left / opponent), b: Fighter (right / player), title, divName, event, weights:[a,b], onDone }
function weighIn(game, opts) {
  const S = new Show(game, 'weighin', opts);
  const { a, b } = opts;
  const ref = game.ref;
  const title = !!opts.title;
  S.duration = title ? 25 : 21;
  S.actors = [a, b];
  const scale = S.addProp(makeScale()); scale.position.set(0, 0, -0.35);
  const backdrop = S.addProp(makeBackdrop('ВЗВЕШИВАНИЕ', (opts.event || 'UFC FIGHT NIGHT') + (title ? ' · БОЙ ЗА ТИТУЛ' : ''), UFC.shortName(a.cfg).toUpperCase() + '  VS  ' + UFC.shortName(b.cfg).toUpperCase()));
  backdrop.position.set(0, 0, -1.6);
  let belt = null;
  for (const [f, x] of [[a, -3.0], [b, 3.0]]) { f.place(x, 0.5, x < 0 ? Math.PI / 2 : -Math.PI / 2); f.startCine({ casual: true }); }
  if (ref) { ref.setVisible(title); ref.place(2.1, -0.9, -0.4); }
  game.arena.showLights && game.arena.showLights('stage');
  const front = new V3(0, 1.45, 4.3);
  S.cam.set(new V3(0, 2.1, 6.2), new V3(0, 1.25, -0.4), 44);
  Announcer.lowerThird('<div class="l3-name">ОФИЦИАЛЬНОЕ ВЗВЕШИВАНИЕ</div><div class="l3-sub">' + (opts.event || 'UFC FIGHT NIGHT') + ' · ' + (opts.divName || '') + '</div>', 3);

  const weighOne = (f, t0, side, kg) => {
    S.at(t0, () => {
      f.cineWalkTo(0, 0.02, { speed: 1.25, yaw: 0, onArrive: () => { f.cineLift(0.065, 0.25); } });
      S.cam.set(() => new V3(f.pos.x * 0.4, 1.5, 3.4), () => new V3(f.pos.x * 0.8, 1.2, 0), 40, { cut: false, rate: 1.5 });
    });
    S.at(t0 + 2.6, () => {
      f.cinePose('flex', 0.5);
      game.audio.cheer(0.5); game.arena.excite(0.5);
      S.cam.set(new V3(0.35, 1.55, 2.6), new V3(0, 1.3, 0), 36, { cut: true, rate: 1.2 });
      Announcer.lowerThird(nameCard(f.cfg, side), 4);
    });
    let shown = 0;
    S.every((dt) => {
      if (S.t < t0 + 2.6 || S.t > t0 + 5.2) return;
      const k = M.smooth((S.t - (t0 + 2.6)) / 1.2);
      const val = k < 1 ? (kg * k + M.rand(-3, 3) * (1 - k)) : kg;
      if (Math.abs(val - shown) > 0.05) { shown = val; scale.userData.draw(val.toFixed(1), (kg * 2.2046).toFixed(1) + ' LBS'); }
    });
    S.at(t0 + 3.4, () => Announcer.say(game, f.cfg.name + '. ' + kg.toFixed(1).replace('.', ',') + ' килограмма!'));
    S.at(t0 + 5.4, () => {
      f.cinePose(null); f.cineLift(0, 0.2);
      f.cineWalkTo(side === 'red' ? 1.05 : -1.05, 0.55, { speed: 1.2, yaw: 0 });
      scale.userData.draw('--.-');
    });
  };
  weighOne(a, 0.6, 'blue', opts.weights[0]);
  weighOne(b, 6.6, 'red', opts.weights[1]);

  // face-off
  const fo = 12.8;
  S.at(fo, () => {
    a.cineWalkTo(-0.34, 0.75, { speed: 1.1, yaw: Math.PI / 2 });
    b.cineWalkTo(0.34, 0.75, { speed: 1.1, yaw: -Math.PI / 2 });
    S.cam.set(new V3(0, 1.6, 3.6), new V3(0, 1.4, 0.7), 34, { cut: true });
    Announcer.big('ФЕЙС-ОФФ', '', 'faceoff', 1.6);
    game.audio.horn(0.6);
  });
  S.at(fo + 2.2, () => {
    for (const f of [a, b]) { f.cine.casual = false; }
    game.audio.cheer(0.6); game.arena.excite(0.6);
    S.cam.set(() => new V3(a.pos.x - 1.05, 1.66, a.pos.z + 0.95), () => b.headCenter(new V3()).add(new V3(0, -0.04, 0)), 32, { cut: true });
  });
  S.at(fo + 4.2, () => S.cam.set(() => new V3(b.pos.x + 1.05, 1.66, b.pos.z + 0.95), () => a.headCenter(new V3()).add(new V3(0, -0.04, 0)), 32, { cut: true }));
  let t = fo + 6.2;
  if (title && ref) {
    S.at(t, () => {
      belt = makeFlatBelt(opts.divName, opts.interim);
      ref.f.body.B.handR.add(belt); belt.position.set(0.3, -0.05, 0.06); belt.rotation.set(0, 0, 0);
      ref.f.cineWalkTo(0, 1.35, { speed: 1.3, yaw: Math.PI });
      S.cam.set(new V3(0, 1.8, 3.9), new V3(0, 1.5, 1.0), 36, { cut: true });
    });
    S.at(t + 2.0, () => {
      ref.f.cinePose('beltUp', 0.5);
      if (belt) { ref.f.body.B.handR.remove(belt); ref.f.body.B.chest.add(belt); belt.position.set(0, 0.5, 0.12); belt.rotation.set(0, 0, 0); }
      Announcer.big(opts.interim ? 'ВРЕМЕННЫЙ ПОЯС' : 'ЧЕМПИОНСКИЙ ПОЯС', opts.divName || '', 'belt', 2.4);
      game.audio.cheer(0.8); game.arena.excite(0.8);
      S.cam.set(() => (belt ? belt.getWorldPosition(new V3()).add(new V3(0.1, -0.1, 1.1)) : new V3(0, 2, 2)), () => (belt ? belt.getWorldPosition(new V3()) : new V3(0, 2, 1)), 32, { cut: true, rate: 3 });
    });
    t += 4.2;
  }
  // reactions
  S.at(t, () => {
    const acts = [['point', 'flex'], ['flex', 'stand'], ['armsUp', 'point'], ['stand', 'handsHead']];
    const pick = M.pick(acts);
    for (const f of [a, b]) f.cine.casual = true;
    a.cineWalkTo(-0.7, 0.75, { speed: 1, yaw: 0.25 }); b.cineWalkTo(0.7, 0.75, { speed: 1, yaw: -0.25 });
    S.at(t + 0.9, () => { a.cinePose(pick[0], 0.5); b.cinePose(pick[1], 0.5); game.audio.cheer(0.5); });
    S.cam.set(front, new V3(0, 1.2, 0.3), 42, { cut: true });
    if (ref && title) { ref.f.cinePose(null); ref.f.cineWalkTo(2.2, -0.9, { speed: 1.2 }); }
  });
  S.cleanup = () => {
    if (belt && belt.parent) belt.parent.remove(belt);
    scale.userData.draw('--.-');
    game.arena.showLights && game.arena.showLights('fight');
    Announcer.clear();
  };
  return S.begin();
}

// ---------------------------------------------------------------- walkout / introductions
// opts: { a: Fighter (blue / opponent), b: Fighter (red / player), title, divName, event, rounds, onDone }
// Full entrance: tunnel -> walk to the cage with cinematic camera work and
// original entrance music -> climb in -> own pose -> referee instructions.
// opts: { a: Fighter (blue / opponent), b: Fighter (red / player), title, divName, event, rounds, champion, short, onDone }
function walkout(game, opts) {
  const S = new Show(game, 'walkout', opts);
  const { a, b } = opts;
  const ref = game.ref;
  const arena = game.arena;
  const short = !!opts.short;
  const K = short ? 0.42 : 1;              // time scale for the career's repeat viewings
  const TUNNEL = -8.4, DOOR = -4.35;
  const CORNER = { a: [3.1, 0.2, -Math.PI / 2], b: [-3.1, -0.2, Math.PI / 2] };
  const champ = opts.champion === 'b' ? b : opts.champion === 'a' ? a : null;

  S.actors = [a, b];
  for (const f of [a, b]) {
    f.place(0, TUNNEL - 2.5, 0);
    f.startCine({ casual: true });
    f.cineFree(true);                      // outside the cage during the entrance
    f.cineLift(-1.0, 0.01);                // the arena floor is a metre below the cage
    f.setVisible && f.setVisible(false);
  }
  if (ref) { ref.setVisible(true); ref.place(0, -2.4, 0); }
  arena.showLights && arena.showLights('walkout');
  arena.excite(0.6);
  game.audio.cheer(0.6);
  if (arena.screenTex) arena.screenTex.redraw([(opts.event || 'UFC FIGHT NIGHT'), (opts.divName || '') + (opts.title ? (opts.interim ? ' · ВРЕМЕННЫЙ ТИТУЛ' : ' · ТИТУЛ') : '')]);

  const bounce = (f, on) => { f.cine && (f.cine.casual = !on); };
  const cornerOf = (f) => (f === a ? CORNER.a : CORNER.b);

  // ---- one fighter's entrance, t0 = when the tunnel lights up
  const entrance = (f, t0, corner, first) => {
    const [cx, cz, cyaw] = cornerOf(f);
    const isChamp = champ === f;
    const style = UFC.Audio.musicFor(f.cfg, isChamp);
    let belt = null;

    S.at(t0, () => {
      game.audio.stopMusic(0.5);
      game.audio.startMusic(style);
      arena.spotTo && arena.spotTo(0, TUNNEL + 0.5);
      arena.spotOn && arena.spotOn(true);
      if (arena.tunnelTex) arena.tunnelTex.redraw([UFC.shortName(f.cfg).toUpperCase()]);
      if (arena.screenTex) arena.screenTex.redraw([UFC.shortName(f.cfg).toUpperCase(), f.cfg.nick ? '«' + f.cfg.nick + '»' : (opts.divName || '')]);
      Announcer.lowerThird(nameCard(f.cfg, corner), 4.2 * K);
      game.audio.cheer(0.8); arena.excite(0.8);
      // wide shot of the dark arena and the lit tunnel
      S.cam.set(new V3(0, 4.4, TUNNEL + 9.0), new V3(0, -0.1, TUNNEL + 1.0), 46, { cut: true, rate: 1.1 });
      if (!short && first) Announcer.say(game, 'Дамы и господа! ' + (opts.title ? (opts.interim ? 'Главный бой вечера. Бой за временный титул чемпиона!' : 'Главный бой вечера. Бой за титул чемпиона!') : 'Главный бой вечера!'));
    });

    // fighter steps out of the tunnel
    S.at(t0 + 1.5 * K, () => {
      f.setVisible && f.setVisible(true);
      f.place(0, TUNNEL, 0);
      f.cineFree(true);
      f.cineLift(-1.0, 0.01);
      if (isChamp) {
        belt = makeFlatBelt(opts.divName, opts.interim);
        f.body.B.chest.add(belt);
        belt.position.set(0, 0.24, 0.03); belt.rotation.set(0, 0, -0.32);
        Announcer.lowerThird('<div class="l3-corner red">ДЕЙСТВУЮЩИЙ ЧЕМПИОН</div><div class="l3-name">' + esc(f.cfg.name) + '</div>', 3 * K);
      }
      bounce(f, true);
      f.cineWalkTo(0, DOOR - 1.15, { speed: 1.05, yaw: 0 });
      // low angle in front of him, walking into camera
      // from the mouth of the tunnel, over his shoulder, towards the lit cage
      S.cam.set(() => new V3(f.pos.x - 0.5, 0.55, Math.max(f.pos.z - 2.2, -10.1)), () => new V3(f.pos.x, -0.15, f.pos.z + 1.4), 42, { cut: true, rate: 1.5 });
      if (!short) Announcer.say(game, (corner === 'red' ? 'В красном углу! ' : 'В синем углу! ') + (f.cfg.nick ? '«' + f.cfg.nick + '». ' : '') + f.cfg.name + '!');
    });
    S.every((dt) => { if (arena.spotTo && f.state === 'cine') arena.spotTo(f.pos.x, f.pos.z); });

    if (!short) {
      // face
      S.at(t0 + 3.4, () => S.cam.set(() => new V3(f.pos.x + 0.52, 0.5, f.pos.z + 1.2), () => new V3(f.pos.x, 0.42, f.pos.z), 30, { cut: true, rate: 2.4 }));
      // body and legs from the side
      S.at(t0 + 4.6, () => S.cam.set(() => new V3(f.pos.x + 2.6, 0.35, f.pos.z + 1.9), () => new V3(f.pos.x, -0.3, f.pos.z), 38, { cut: true, rate: 2.0 }));
      // crowd
      S.at(t0 + 5.6, () => { S.cam.set(new V3(0.8, 0.7, TUNNEL + 3.4), new V3(7.0, 2.6, -3.0), 52, { cut: true, rate: 1.4 }); arena.excite(0.7); game.audio.cheer(0.8); });
      S.at(t0 + 6.5, () => S.cam.set(() => new V3(f.pos.x - 2.3, 0.4, Math.max(f.pos.z - 1.2, -9.6)), () => new V3(f.pos.x, -0.2, f.pos.z), 36, { cut: true, rate: 1.8 }));
    }

    // climb into the cage
    const tc = t0 + (short ? 3.1 : 7.4);
    S.at(tc, () => {
      // at the steps: rise the metre from the arena floor to the cage platform
      f.cineFree(true);
      f.place(0, DOOR - 0.85, 0);
      f.cineLift(-1.0, 0.01);
      f.cinePose('climb', 0.4);
      f.cineLift(0, 1.15);
      S.cam.set(new V3(1.6, 1.15, DOOR + 2.2), () => new V3(f.pos.x, 0.15, f.pos.z), 44, { cut: true, rate: 1.8 });
    });
    S.at(tc + 1.35, () => {
      f.cinePose(null);
      f.place(0, DOOR, 0);
      f.cineFree(false);                   // back inside the cage
      f.cineLift(0, 0.01);
      bounce(f, true);
      f.cineWalkTo(cx, cz, { speed: 1.3, yaw: cyaw });
    });
    // his own pose in the cage
    S.at(tc + 2.6, () => {
      const pose = isChamp ? 'beltUp' : M.pick(['armsUp', 'point', 'flex', 'cagePunch', 'oneArmUpL']);
      f.cinePose(pose, 0.35);
      game.audio.cheer(0.9); game.audio.horn(0.5); arena.excite(0.9);
      S.cam.set(() => new V3(f.pos.x * 0.35, 1.3, f.pos.z * 0.35 + 2.6), () => new V3(f.pos.x, 1.15, f.pos.z), 36, { cut: true, rate: 1.7 });
    });
    S.at(tc + 3.9, () => { f.cinePose(null); bounce(f, true); });
    return { belt: () => belt, end: tc + 4.1 };
  };

  // opponent first, the player last, the way a main event runs
  const e1 = entrance(a, 0.6 * K, 'blue', true);
  const e2 = entrance(b, (short ? 5.2 : 11.6) * K + 0.6, 'red', false);

  // ---- referee instructions and glove touch
  const tm = e2.end + 0.2;
  const TT = short ? 0 : 9.4;   // face to face: they promise to kill each other
  S.duration = tm + 5.2 + TT;
  S.at(tm, () => {
    arena.spotOn && arena.spotOn(false);
    game.audio.stopMusic(1.4);
    for (const f of [a, b]) bounce(f, false);
    if (ref) ref.f.cineWalkTo(0, -0.9, { speed: 1.4, yaw: 0 });
    a.cineWalkTo(0.48, 0, { speed: 1.4, yaw: -Math.PI / 2 });
    b.cineWalkTo(-0.48, 0, { speed: 1.4, yaw: Math.PI / 2 });
    S.cam.set(new V3(0, 1.5, 3.3), new V3(0, 1.2, 0), 38, { cut: true, rate: 1.4 });
    const belt = e1.belt() || e2.belt();
    if (belt && belt.parent) belt.parent.remove(belt);
    if (!short) Announcer.say(game, 'Рефери в центре. Бойцы, слушаем команды. Касание перчаток!');
    else Announcer.lowerThird('<div class="l3-name">ИНСТРУКЦИИ РЕФЕРИ</div>', 2);
  });
  S.at(tm + 1.9, () => { if (ref) ref.f.cinePose('refStop', 0.4); });
  if (!short) {
    const talk = (f, o, at, who) => S.at(at, () => {
      const line = UFC.trashTalk(UFC.shortName(o.cfg), f.cfg.name + (opts.event || ''), who);
      Announcer.lowerThird('<div class="l3-name">' + (f.cfg.nick ? '«' + f.cfg.nick + '» ' : '') + f.cfg.name + '</div><div class="l3-sub">«' + line + '»</div>', 4);
      game.audio.say(line, 1.0, false, { energy: 0.72, voice: who === 'o' ? 'color' : 'pbp' });
    });
    talk(a, b, tm + 5.4, 'o'); talk(b, a, tm + 8.2, 'p');
  }
  S.at(tm + 2.9 + TT, () => { a.cinePose('touchGloves', 0.3); b.cinePose('touchGloves', 0.3); });
  S.at(tm + 4.0 + TT, () => {
    a.cinePose(null); b.cinePose(null);
    a.cineWalkTo(1.25, 0, { speed: 1.3, yaw: -Math.PI / 2 }); b.cineWalkTo(-1.25, 0, { speed: 1.3, yaw: Math.PI / 2 });
    if (ref) { ref.f.cinePose(null); ref.f.cineWalkTo(0, -2.3, { speed: 1.4, yaw: 0 }); }
    S.cam.set(new V3(0, 1.9, 4.2), new V3(0, 1.2, 0), 50, { cut: false, rate: 1.6 });
    arena.showLights && arena.showLights('fight');
  });

  S.cleanup = () => {
    game.audio.stopMusic(0.6);
    arena.spotOn && arena.spotOn(false);
    for (const f of [a, b]) {
      f.setVisible && f.setVisible(true);
      if (f.cine) { f.cineFree(false); f.cineLift(0, 0.01); }
      if (Math.hypot(f.pos.x, f.pos.z) > 4.0) f.place(f === a ? 1.25 : -1.25, 0, f === a ? -Math.PI / 2 : Math.PI / 2);
    }
    for (const belt of [e1.belt(), e2.belt()]) if (belt && belt.parent) belt.parent.remove(belt);
    if (game.corners) game.corners.forEach((c) => c.setVisible(false));
    if (arena.screenTex) arena.screenTex.redraw([(opts.event || 'UFC FIGHT NIGHT'), UFC.shortName(a.cfg).toUpperCase() + ' — ' + UFC.shortName(b.cfg).toUpperCase()]);
    arena.showLights && arena.showLights('fight');
    Announcer.clear();
  };

  // cornermen walk out of the tunnel behind their fighter and wait by the fence
  if (game.corners && game.corners.length === 2) {
    [[a, game.corners[0], e1], [b, game.corners[1], e2]].forEach(([f, cm, e], i) => {
      const [cx, cz] = cornerOf(f);
      cm.setVisible(true);
      cm.place(0.9, TUNNEL - 2.0, 0);
      cm.f.cineFree && cm.f.cineFree(true);
      cm.f.cineLift && cm.f.cineLift(-1.0, 0.01);
      S.actors.push(cm.f);
      const t0 = e.end - (short ? 3.4 : 7.0);
      S.at(t0 + 1.7, () => { cm.place(0.95, TUNNEL - 0.3, 0); cm.f.cineFree && cm.f.cineFree(true); cm.f.cineLift && cm.f.cineLift(-1.0, 0.01); cm.f.cineWalkTo(0.95, DOOR - 1.3, { speed: 1.05, yaw: 0 }); });
      S.at(e.end - 1.2, () => { cm.place(cx * 1.35, cz * 1.35 + (i ? 0.8 : -0.8), Math.atan2(-cx, -cz)); cm.f.cineFree && cm.f.cineFree(false); cm.f.cineLift && cm.f.cineLift(0, 0.01); });
    });
  }
  return S.begin();
}

// ---------------------------------------------------------------- post fight
// opts: { res, winner, loser, title, retained, divName, playerWon, replay (clip), onDone, method }
function postFight(game, opts) {
  const S = new Show(game, 'postfight', opts);
  const { winner, loser, res } = opts;
  const ref = game.ref;
  const draw = !winner;
  const A = winner || game.p1, Bf = loser || game.p2;
  S.actors = [A, Bf];
  let t = 0.2;

  // ---- replay of the finish
  let player = null;
  if (opts.replay && opts.replay.n > 10) {
    try {
      player = new UFC.Replay.Player(opts.replay, [game.p1, game.p2]);
      const start = Math.max(0, player.markT - 2.4), end = Math.min(player.duration, player.markT + 1.0);
      const speed = 0.45;
      const len = (end - start) / speed;
      let rt = start;
      Announcer.big('ПОВТОР', '', 'replay', len);
      if (ref) ref.setVisible(false);
      const mid = () => { const a1 = game.p1.body.B.hips.getWorldPosition(new V3()), b1 = game.p2.body.B.hips.getWorldPosition(new V3()); return a1.add(b1).multiplyScalar(0.5); };
      player.apply(player.markT);
      const ax = new V3().subVectors(game.p2.pos, game.p1.pos).setY(0).normalize();
      const side = new V3(-ax.z, 0, ax.x);
      const baseAng = Math.atan2(side.z, side.x) - 0.5;
      S.cam.set((tt) => { const m = mid(); return new V3(m.x + Math.cos(baseAng + tt * 0.1) * 3.3, 1.35, m.z + Math.sin(baseAng + tt * 0.1) * 3.3); }, () => { const m = mid(); m.y = 0.95; return m; }, 40, { cut: true, rate: 4 });
      S.every((dt) => { if (S.t < len + 0.2) { rt = Math.min(end, rt + dt * speed); player.apply(rt); } });
      S.actors = [];
      document.body.classList.add('replaymode');
      t = len + 0.3;
      S.at(t, () => { document.body.classList.remove('replaymode'); S.actors = [A, Bf]; if (ref) ref.setVisible(true); });
    } catch (e) { UFC.reportError(e, 'повтор'); player = null; }
  }

  const t0 = t;
  const koLoss = !draw && (res.method === 'KO' || res.method === 'TKO');
  S.at(t0, () => {
    // everybody into presentation control
    const lp = Bf.body.root.position.clone();
    A.startCine({ casual: true, snap: true });
    if (!koLoss) Bf.startCine({ casual: true, snap: true });
    void lp;
    if (!draw) {
      const kind = opts.celebration || pickCelebration(opts);
      opts.celebration = kind;
      celebrate(S, game, A, kind);
      if (koLoss) { Bf.startCine({ casual: true, keepPose: true }); Bf.cinePose('sitDown', 2.4); }
      else { Bf.cinePose('dejected', 0.6); }
    } else {
      A.cinePose('handsHead', 0.6); Bf.cinePose('dejected', 0.6);
    }
    if (ref) { ref.f.cineWalkTo(A.pos.x * 0.3, A.pos.z * 0.3 - 0.6, { speed: 1.4 }); }
    S.cam.set(() => new V3(A.pos.x + 2.4, 1.5, A.pos.z + 2.4), () => new V3(A.pos.x, 1.3 + (A.cine ? A.cine.lift * 0.8 : 0), A.pos.z), 40, { cut: true, rate: 1.4 });
    game.arena.excite(1); game.audio.cheer(1);
  });
  const celebLen = 5.2;
  const tr = t0 + celebLen;
  // ---- gather in the centre, announcement, hand raise
  S.at(tr, () => {
    if (!A.cine) return;
    A.cineLift(0, 0.4); A.cineOverlay(null); A.cine.free = false;
    A.cineWalkTo(0.55, 0.15, { speed: 1.8, yaw: 0 });
    if (koLoss) { Bf.cinePose(null); Bf.cineWalkTo(-0.6, 0.15, { speed: 0.9, yaw: 0 }); }
    else { Bf.cinePose(null); Bf.cineWalkTo(-0.6, 0.15, { speed: 1.2, yaw: 0 }); }
    if (ref) { ref.f.cinePose(null); ref.f.cineWalkTo(0, 0.05, { speed: 1.5, yaw: 0 }); }
    S.cam.set(new V3(0, 1.55, 3.6), new V3(0, 1.25, 0), 40, { cut: true, rate: 1.4 });
  });
  const lines = announceLines(opts);
  // a decision is read out card by card
  const cards = res.method === 'DEC' || res.method === 'DRAW' ? (res.cards || []) : null;
  const judgeT = cards && cards.length ? 1.1 + cards.length * 1.25 : 0;
  if (cards && cards.length) {
    S.at(tr + 1.2, () => {
      Announcer.big('СУДЕЙСКИЕ ЗАПИСКИ', 'Бой отправляется к судьям', 'replay', 2);
      Announcer.say(game, 'Дамы и господа, этот бой отправляется к судьям у октагона.');
      S.cam.set(new V3(0, 1.5, 3.2), new V3(0, 1.3, 0), 36, { cut: true, rate: 1.6 });
    });
    cards.forEach((c, i) => {
      S.at(tr + 2.3 + i * 1.25, () => {
        const mine = c[0], his = c[1];
        Announcer.lowerThird('<div class="l3-corner red">СУДЬЯ ' + (i + 1) + '</div><div class="l3-name">' + mine + ' — ' + his + '</div><div class="l3-sub">' + (mine > his ? UFC.shortName(game.p1.cfg) : mine < his ? UFC.shortName(game.p2.cfg) : 'ничья') + '</div>', 1.6);
        Announcer.say(game, mine + ', ' + his + '.', { rate: 0.85, pitch: 0.6 });
        game.audio.horn(0.35);
      });
    });
  }
  S.at(tr + 1.8 + judgeT, () => { Announcer.cancel(); lines.speech.forEach((l) => Announcer.say(game, l.text, l)); Announcer.lowerThird(lines.card, 4.5); });
  const tRaise = tr + 4.6 + judgeT;
  S.at(tRaise, () => {
    Announcer.big(lines.big, lines.bigSub, opts.title ? 'title' : 'winner', 3.2);
    game.audio.cheer(1); game.audio.horn(1); game.arena.excite(1);
    if (!draw) {
      // winner stands at the referee's left: raise his right (inner) arm
      A.cinePose('oneArmUpR', 0.35);
      Bf.cinePose('dejected', 0.6);
      if (ref) ref.f.cinePose('oneArmUpL', 0.35);
      S.cam.set((tt) => new V3(0.2, 1.4 + tt * 0.05, 2.5 - tt * 0.08), () => new V3(0.3, 1.75, 0.1), 36, { cut: true, rate: 2 });
    } else {
      A.cinePose('oneArmUpL', 0.35); Bf.cinePose('oneArmUpR', 0.35);
      if (ref) ref.f.cinePose('armsUp', 0.35);
    }
  });
  S.every(() => {
    // referee's hand holds the winner's wrist once the arm is up
    if (!draw && ref && S.t > tRaise + 0.35 && ref.f.cine && ref.f.cine.poseName === 'oneArmUpL') ref.holdWrist(A, 'R');
  });
  if (!draw) {
    S.at(tRaise + 2.6, () => {
      const line = emotionLine(opts);
      Announcer.lowerThird('<div class="l3-corner red">🎤 ' + esc(UFC.shortName(A.cfg)) + '</div><div class="l3-name" style="font-size:22px;line-height:1.25">«' + esc(line) + '»</div>', 5);
      Announcer.say(game, line, { pitch: 0.95, rate: 1.0 });
      S.cam.set(() => A.headCenter(new V3()).add(new V3(0.55, 0.05, 1.0)), () => A.headCenter(new V3()), 30, { cut: true, rate: 2 });
    });
  }
  let end = tRaise + 6.2;
  let belt = null, confetti = null;
  if (opts.title && !draw) {
    const tb = tRaise + 3.4;
    S.at(tb, () => {
      confetti = new Confetti(game.scene);
      if (ref) {
        ref.f.cinePose(null);
        belt = makeFlatBelt(opts.divName, opts.interim);
        ref.f.body.B.handR.add(belt); belt.position.set(0.3, -0.05, 0.06); belt.rotation.set(0, 0, 0);
        ref.f.cineWalkTo(0.55, 0.62, { speed: 0.9, yaw: Math.PI });
      }
      A.cinePose('stand', 0.5);
      Announcer.big(opts.retained ? 'И ВСЁ ЕЩЁ ЧЕМПИОН' : opts.interim ? 'ВРЕМЕННЫЙ ЧЕМПИОН' : 'НОВЫЙ ЧЕМПИОН', opts.divName || '', 'title', 3.4);
      game.audio.horn(1);
      S.cam.set(new V3(1.3, 1.45, 2.4), new V3(0.55, 1.1, 0.3), 36, { cut: true, rate: 1.5 });
    });
    S.at(tb + 2.1, () => {
      // belt goes around the waist
      if (belt) { belt.parent && belt.parent.remove(belt); belt = makeBelt(opts.divName, opts.interim); A.body.B.hips.add(belt); belt.position.set(0, 0.04 * A.h, 0.0); belt.rotation.set(0, 0, 0); belt.scale.set(1.0, 1.0, 0.95); }
      if (ref) ref.f.cineWalkTo(1.6, -0.3, { speed: 1.2, yaw: -0.5 });
      game.audio.cheer(1); game.arena.excite(1);
    });
    S.at(tb + 3.4, () => { A.cinePose('kneelDown', 0.6); S.cam.set(new V3(0.55, 0.9, 2.2), new V3(0.55, 0.75, 0.15), 34, { cut: true, rate: 1.4 }); });
    S.at(tb + 5.2, () => {
      // lift the belt overhead
      if (belt) { belt.parent && belt.parent.remove(belt); belt = makeFlatBelt(opts.divName, opts.interim); A.body.B.chest.add(belt); belt.position.set(0, 0.62 * A.h * 0.62, 0.02); belt.rotation.set(-0.12, 0, 0); }
      A.cinePose('beltUp', 0.5);
      S.cam.set((tt) => new V3(0.55 + Math.sin(tt * 0.35) * 2.2, 1.3, 0.15 + Math.cos(tt * 0.35) * 2.2), () => new V3(0.55, 1.75, 0.15), 38, { cut: true, rate: 2 });
      Announcer.say(game, opts.retained ? 'И всё ещё чемпион!' : opts.interim ? 'И новый временный чемпион!' : 'И новый чемпион!', { pitch: 0.6, rate: 0.85 });
    });
    end = tb + 9.5;
  } else if (!draw && opts.playerLost) {
    S.at(tRaise + 2.2, () => S.cam.set(() => Bf.headCenter(new V3()).add(new V3(0.7, 0.05, 1.3)), () => Bf.headCenter(new V3()), 30, { cut: true, rate: 2 }));
    end = tRaise + 4.8;
  }
  S.duration = end;
  S.every((dt) => { if (confetti) confetti.update(dt); });
  S.cleanup = () => {
    document.body.classList.remove('replaymode');
    if (confetti) confetti.dispose();
    if (belt && belt.parent) {
      // keep the belt on the champion in the result screen background
      if (opts.title && !draw && belt.parent !== A.body.B.hips) { belt.parent.remove(belt); belt = makeBelt(opts.divName, opts.interim); A.body.B.hips.add(belt); belt.position.set(0, 0.04 * A.h, 0); belt.rotation.set(0, 0, 0); }
    }
    Announcer.clear();
  };
  return S.begin();
}

// Knockout collection: play a stored clip twice (real speed, then slow motion) from two angles.
function replayView(game, clip, opts) {
  const S = new Show(game, 'replay', opts);
  const player = new UFC.Replay.Player(clip, [game.p1, game.p2]);
  const focus = player.focus(new V3());
  const d = player.duration;
  const fast = !!opts.fast, t0 = fast ? Math.max(0, player.markT - 1.5) : 0, dd = d - t0, off = fast ? 0.15 : 0.6;
  const slowStart = fast ? Math.max(0, player.markT - 0.3) : Math.max(0, player.markT - 1.8), slowEnd = Math.min(d, player.markT + (fast ? 0.7 : 1.2)), slow = fast ? 0.3 : 0.35;
  const slowLen = (slowEnd - slowStart) / slow;
  S.duration = dd + off + slowLen + (fast ? 0.3 : 0.8);
  if (fast) S.at(Math.max(0.05, player.markT - t0), () => { game.audio.impact(18, 'head', false); game.cam.shake(0.7); game.arena.excite(1); game.audio.cheer(0.9); });
  const meta = clip.meta || {};
  Announcer.big(meta.type || 'НОКАУТ', (meta.oppName ? 'против ' + meta.oppName + ' · ' : '') + (meta.round ? 'Раунд ' + meta.round + ' · ' + (meta.time || '') : ''), 'replay', 2.6);
  const mid = () => { const a1 = game.p1.body.B.hips.getWorldPosition(new V3()), b1 = game.p2.body.B.hips.getWorldPosition(new V3()); return a1.add(b1).multiplyScalar(0.5); };
  S.cam.set((tt) => { const m = mid(); return new V3(m.x + Math.cos(tt * 0.2) * 3.6, 1.45, m.z + Math.sin(tt * 0.2) * 3.6); }, () => { const m = mid(); m.y = 1.0; return m; }, 40, { cut: true, rate: 4 });
  S.every(() => {
    if (S.t <= dd) player.apply(S.t + t0);
    else if (S.t > dd + off) player.apply(Math.min(slowEnd, slowStart + (S.t - dd - off) * slow));
  });
  S.at(dd + off, () => {
    if (!fast) Announcer.big('ЗАМЕДЛЕННЫЙ ПОВТОР', '', 'replay', 2);
    S.cam.set((tt) => { const m = mid(); return new V3(m.x + Math.cos(2.2 + tt * 0.12) * 2.6, 1.1, m.z + Math.sin(2.2 + tt * 0.12) * 2.6); }, () => { const m = mid(); m.y = 0.9; return m; }, 34, { cut: true, rate: 4 });
    document.body.classList.add('replaymode');
  });
  S.cleanup = () => { document.body.classList.remove('replaymode'); Announcer.clear(); };
  game.arena.excite(1);
  return S.begin();
}

// The signature cup celebration shows up now and then, never twice in a row.
function pickCelebration(opts) {
  const m = opts.res.method;
  const rare = UFC._lastCeleb !== 'cup' && Math.random() < 0.22;
  let kind;
  if (rare) kind = 'cup';
  else if (opts.title) kind = M.pick(['kneel', 'emotional', 'cageClimb']);
  else if (m === 'KO' || m === 'TKO') kind = M.pick(['cageClimb', 'cageHit', 'run', 'armsUp']);
  else if (m === 'SUB') kind = M.pick(['armsUp', 'run', 'kneel']);
  else kind = M.pick(['calm', 'armsUp', 'emotional']);
  UFC._lastCeleb = kind;
  return kind;
}

// A short, human moment right after the hand raise; several variants so it
// never sounds like the same recording.
const EMOTION = {
  title: ['Всю жизнь я шёл к этому поясу. Спасибо моей семье и команде — мы сделали это вместе.', 'Я благодарю Бога и своих близких. Этот пояс — за всех, кто верил, когда не верил никто.'],
  defense: ['Я защитил этот пояс, но работа не закончена. Я хочу лучших — присылайте кого угодно.', 'Спасибо команде: каждый день в зале ради таких вечеров.'],
  ko: ['Я знал, что найду этот удар. Мы отрабатывали его весь лагерь.', 'Это спорт тяжёлых решений. Сегодня моя ночь — спасибо всем, кто рядом.'],
  first: ['Это мой первый большой бой здесь, и я запомню его навсегда. Спасибо, что поддерживали.', 'Я приехал издалека, чтобы стоять сейчас в этом октагоне. Это только начало.'],
  comeback: ['Меня уже хоронили, а я вернулся. Никогда не сдавайтесь — никогда.', 'Тяжёлый путь, травмы, поражения. Но я здесь, и я снова побеждаю.'],
  win: ['Спасибо сопернику за бой и спасибо залу. Мы оба оставили здесь всё.', 'Я благодарю свою семью и команду. Дальше — только выше.'],
};
function emotionLine(opts) {
  const key = opts.title ? (opts.retained ? 'defense' : 'title')
    : opts.firstBig ? 'first'
    : opts.comeback ? 'comeback'
    : (opts.res.method === 'KO' || opts.res.method === 'TKO') ? 'ko' : 'win';
  return M.pick(EMOTION[key]);
}

// Winner celebration performed on the live fighter.
function celebrate(S, game, f, kind) {
  const R = UFC.OCT.R, AP = UFC.OCT.APOTHEM;
  const t0 = S.t;
  if (kind === 'armsUp') { f.cinePose('armsUp', 0.35); f.cine.bounce = 0.012; }
  else if (kind === 'calm') { f.cinePose('stand', 0.5); S.at(t0 + 1.6, () => f.cinePose('point', 0.5)); }
  else if (kind === 'kneel') { f.cinePose('kneelDown', 0.6); S.at(t0 + 2.2, () => f.cinePose('kneelUp', 0.6)); }
  else if (kind === 'emotional') { f.cinePose('handsHead', 0.45); S.at(t0 + 1.8, () => f.cinePose('kneelDown', 0.7)); }
  else if (kind === 'cup') {
    // signature: walk to the centre, take a slow sip, salute the crowd
    f.cineWalkTo(f.pos.x * 0.35, f.pos.z * 0.35, {
      speed: 1.5, onArrive: () => {
        if (!f.cine) return;
        const cup = makeCup();
        f.body.B.handR.add(cup); cup.position.set(0.02, -0.05, 0.03);
        f.cinePose('sipCup', 0.5);
        S.props.push({ traverse() {}, parent: null, cup });
        S.at(S.t + 2.6, () => { if (cup.parent) cup.parent.remove(cup); if (f.cine) f.cinePose('armsUp', 0.4); game.audio.cheer(0.9); });
      },
    });
  } else if (kind === 'run') {
    const a0 = Math.atan2(f.pos.z, f.pos.x);
    const pts = [0.6, 1.3, 2.0].map((k) => [Math.cos(a0 + k) * (AP - 1.0), Math.sin(a0 + k) * (AP - 1.0)]);
    f.cineOverlay('armsUp', 0.9);
    let i = 0;
    const next = () => { if (i >= pts.length || !f.cine) return; const p = pts[i++]; f.cineWalkTo(p[0], p[1], { speed: 2.6, onArrive: next }); f.cineOverlay('armsUp', 0.9); };
    next();
  } else if (kind === 'cageHit' || kind === 'cageClimb') {
    // nearest panel centre (hit) or post (climb)
    const ang = Math.atan2(f.pos.z, f.pos.x);
    let best;
    if (kind === 'cageHit') { const k = Math.round(ang / (Math.PI / 4) - 1); const a = (k + 1) * Math.PI / 4; best = [Math.cos(a), Math.sin(a), AP - 0.55, a]; }
    else { const k = Math.round(ang / (Math.PI / 4) - 0.5); const a = (k + 0.5) * Math.PI / 4; best = [Math.cos(a), Math.sin(a), R - 0.5, a]; }
    const tx = best[0] * best[2], tz = best[1] * best[2];
    const outYaw = Math.atan2(best[0], best[1]);
    f.cineWalkTo(tx, tz, {
      speed: 2.3, yaw: outYaw, onArrive: () => {
        if (!f.cine) return;
        if (kind === 'cageHit') {
          let n = 0;
          const hit = () => { if (!f.cine || n > 5) return; f.cinePose(n % 2 ? 'armsUp' : 'cagePunch', 0.18); if (n % 2 === 0) { game.audio.impact(9, 'body', true); game.cam.shake(0.08); } n++; S.at(S.t + 0.45, hit); };
          hit();
        } else {
          f.cine.free = true;
          f.cinePose('climb', 0.3);
          f.cineLift(0.95, 0.7);
          S.at(S.t + 0.75, () => { if (!f.cine) return; f.pos.set(best[0] * (R - 0.18), 0, best[1] * (R - 0.18)); f.cineLift(1.72, 0.55); });
          S.at(S.t + 1.35, () => { if (!f.cine) return; f.cineFace(outYaw + Math.PI); f.cinePose('armsUp', 0.35); f.cine.bounce = 0.006; game.audio.cheer(1); game.arena.excite(1); });
        }
      },
    });
  }
}

function announceLines(o) {
  const w = o.winner, res = o.res;
  const div = o.divName || '';
  if (!w) {
    return { speech: [{ text: 'Дамы и господа, после ' + (res.rounds || 3) + ' раундов судьи объявляют… ничью!' }], big: 'НИЧЬЯ', bigSub: res.methodText || '', card: '<div class="l3-name">НИЧЬЯ</div><div class="l3-sub">' + (res.methodText || '') + '</div>' };
  }
  const name = w.cfg.name;
  const how = { KO: 'нокаутом', TKO: 'сдачей соперника', SUB: 'сабмишном', DEC: 'решением судей' }[res.method] || '';
  const en = { KO: 'BY KNOCKOUT!', TKO: 'BY SURRENDER!', SUB: 'BY SUBMISSION!', DEC: 'BY DECISION!' }[res.method] || 'THE WINNER!';
  const when = res.method === 'DEC' ? '' : (res.time ? 'на отметке ' + res.time + ' ' : '') + (res.round ? res.round + '-го раунда, ' : '');
  const speech = [{ text: 'Дамы и господа! ' + (when ? 'Бой окончен ' + when : 'Судьи вынесли решение. ') }];
  if (o.title) speech.push({ text: o.retained ? 'И всё ещё!' : 'И новый!', pitch: 0.55, rate: 0.8 });
  speech.push({ text: 'Победитель ' + how + (o.title ? ', чемпион в дивизионе ' + div : '') + '…' });
  speech.push({ text: name + '!', pitch: 0.58, rate: 0.78 });
  const big = o.title ? (o.retained ? 'AND STILL!' : 'AND NEW!') : en;
  const bigSub = name + ' · ' + (UFC.METHOD_NAMES ? UFC.METHOD_NAMES[res.method] : res.method) + (res.round && res.method !== 'DEC' ? ' · R' + res.round + ' ' + (res.time || '') : '');
  const card = '<div class="l3-corner red">ПОБЕДИТЕЛЬ</div><div class="l3-name">' + (UFC.league ? UFC.league.flag(w.cfg.flag) + ' ' : '') + name + '</div><div class="l3-sub">' + (res.methodText || '') + '</div>';
  return { speech, big, bigSub, card };
}

// ---- career films: the sad one (after a loss) and the glory one ----
function editSad(game, opts) {
  const S = new Show(game, 'editSad', opts);
  const { a, b } = opts, B = b.body.B;
  S.duration = 27; S.actors = [a, b]; S.skippable = true;
  b.place(-0.5, 0, Math.PI / 2); b.startCine({ casual: true, snap: true }); b.cinePose('sitDown', 0.01);
  a.place(1.4, 0.3, -Math.PI / 2); a.startCine({ casual: true, snap: true }); a.cinePose('armsUp', 0.3);
  game.audio.cheer(1); game.arena.excite(1);
  S.cam.set(new V3(-3.4, 1.2, 2.4), new V3(-0.5, 0.7, 0), 40, { cut: true, rate: 1.2 });
  const line = (t, text) => S.at(t, () => Announcer.lowerThird('<div class="l3-name">' + text + '</div>', 3.6));
  S.at(0.2, () => Announcer.big('ПОРАЖЕНИЕ', opts.resText || '', 'replay', 3.2));
  line(1.5, 'Они кричат не мне.');
  S.at(3.5, () => { S.cam.set(new V3(-1.9, 0.95, 0.9), () => b.headCenter(new V3()), 30, { cut: false, rate: 0.9 }); game.arena.excite(0.15); });
  line(5, 'Столько лет — ради одного вечера.');
  S.at(7, () => b.cinePose('handsHead', 0.9));
  line(8.5, 'Я был так близко…');
  S.at(10.5, () => {
    b.cinePose('dejected', 0.5); a.cinePose('stand', 0.8);
    b.cineWalkTo(0, -4.35, { speed: 0.75, yaw: Math.PI });
    S.cam.set(() => new V3(b.pos.x * 0.8, 0.95, b.pos.z + 3.0), () => new V3(b.pos.x, 1.2, b.pos.z - 0.6), 42, { cut: true, rate: 1.4 });
    game.arena.spotOn && game.arena.spotOn(false);
  });
  line(12.5, 'Не оборачиваться. Только не оборачиваться.');
  line(16.5, 'Я даже не слышу зал.');
  S.at(19, () => { b.cineWalkTo(0, -6.4, { speed: 0.6, yaw: Math.PI }); });
  S.at(21, () => { S.cam.set(() => new V3(1.6, 0.8, b.pos.z + 1.6), () => new V3(b.pos.x, 1.3, b.pos.z), 34, { cut: true, rate: 1.2 }); });
  line(21.5, 'Поражение — тоже часть пути.');
  S.at(24.5, () => opts.fade && opts.fade(1));
  // head down, shoulders shaking: he is crying as he walks
  S.every(() => {
    if (S.t > 3.5 && S.t < 10.5) { B.neck.rotation.x += 0.5; B.head.rotation.x += 0.25; B.chest.rotation.z += Math.sin(S.t * 13) * 0.03; }
    else if (S.t >= 10.5) { B.neck.rotation.x += 0.55; B.head.rotation.x += 0.3; B.chest.rotation.x += 0.12; B.chest.rotation.z += Math.sin(S.t * 12) * 0.035; b.body.root.position.y += Math.sin(S.t * 12) * 0.004; }
    else if (S.t > 0.5) { B.neck.rotation.x += 0.2; }
    b.body.root.updateMatrixWorld(true);
  });
  S.cleanup = () => { Announcer.clear(); };
  return S.begin();
}

function editGlory(game, opts) {
  const S = new Show(game, 'editGlory', opts);
  const { a, b } = opts, B = b.body.B;
  S.duration = 24; S.actors = [a, b];
  b.place(0, 0.2, 0); b.startCine({ casual: true, snap: true }); b.cinePose('armsUp', 0.4);
  a.place(-3.2, -2.2, Math.PI / 2); a.startCine({ casual: true, snap: true }); a.cinePose('sitDown', 0.01);
  const belt = S.addProp(makeFlatBelt(opts.divName || '', opts.interim)); belt.scale.setScalar(1.2);
  const conf = new Confetti(game.scene, 420); S.props.push({ isConf: true }); S.props.pop();
  game.audio.cheer(1); game.arena.excite(1);
  S.cam.set(() => new V3(Math.cos(S.t * 0.25) * 3.4, 1.35, Math.sin(S.t * 0.25) * 3.4), new V3(0, 1.2, 0), 40, { cut: true, rate: 1.4 });
  const line = (t, text) => S.at(t, () => { Announcer.lowerThird('<div class="l3-name">' + text + '</div>', 3.6); });
  S.at(0.2, () => Announcer.big(opts.bigText || 'ЛЕГЕНДА', opts.bigSub || '', 'title', 4));
  (opts.lines || []).forEach((l, i) => line(2 + i * 3.4, l));
  S.at(8, () => { b.cinePose('kneelDown', 0.7); S.cam.set(() => new V3(2.4, 0.9, 2.2), () => new V3(0, 0.8, 0), 34, { cut: true, rate: 1.2 }); });
  S.at(12, () => { b.cinePose('handsHead', 0.6); game.audio.cheer(1); });
  S.at(15.5, () => { b.cinePose('armsUp', 0.4); S.cam.set(() => new V3(Math.cos(S.t * 0.3) * 2.6, 0.6, Math.sin(S.t * 0.3) * 2.6), new V3(0, 1.7, 0), 44, { cut: true, rate: 1.4 }); });
  S.at(21.5, () => opts.fade && opts.fade(1));
  S.every((dt) => { conf.update(dt); const h = B.handR.getWorldPosition(new V3()); belt.position.set(h.x - 0.05, h.y + 0.14, h.z); belt.rotation.set(0, S.t * 0.5, 0.2); });
  S.cleanup = () => { conf.dispose(); Announcer.clear(); };
  return S.begin();
}

UFC.Ceremony = { editSad, editGlory, weighIn, walkout, postFight, replayView, makeBelt, makeFlatBelt, makeScale, Confetti, Show, ShotCam, Announcer, pickCelebration, announceLines };
})();

