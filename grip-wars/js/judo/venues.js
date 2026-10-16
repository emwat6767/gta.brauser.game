//# sourceURL=judo/venues.js
// Judo: the two tatami venues. A hall with a mat instead of the cage.
(function () {
'use strict';
const UFC = window.UFC;
const J = (window.JUDO = window.JUDO || {});
const M = UFC.M;

// the mat: 8 x 8 contest area (1 m red danger zone inside it), a safety area around it
const HALF = 4.0, SAFE = 5.5;
J.HALF = HALF;

// fighters stay on the mat: a square instead of the octagon
const LIM = 4.45;
UFC.clampToOctagon = function (pos, margin) {
  const lim = LIM - margin;
  let pushed = false;
  if (pos.x > lim) { pos.x = lim; pushed = true; } else if (pos.x < -lim) { pos.x = -lim; pushed = true; }
  if (pos.z > lim) { pos.z = lim; pushed = true; } else if (pos.z < -lim) { pos.z = -lim; pushed = true; }
  return pushed;
};
UFC.distToCage = function (pos) { return LIM - Math.max(Math.abs(pos.x), Math.abs(pos.z)); };

// ---------------------------------------------------------------- venues
// A: world championships and the Olympics (night arena, blue tatami). B: Grand Slam, Asia and Europe (bright hall, green tatami)
const STYLES = {
  A: {
    center: '#dcae14', centerHi: '#f0c82c', zone: '#9a121b', safe: '#18306a', seam: 'rgba(8,20,60,0.55)', line: '#f4f7ff', text: 'rgba(255,255,255,0.42)',
    floor: 0x070b18, platform: 0x0b1530, led: 0x4db2ff, key: 0xf0f6ff, keyI: 1.4, fillC: 0xcfe0ff, fillI: 0.85, hemiSky: 0xaec4ff, hemiGround: 0x0a1020, hemiI: 0.42, banner: ['#0b1a44', '#1f56c9'], bannerText: '#ffffff', accent: '#ffd25e',
  },
  B: {
    center: '#dcae14', centerHi: '#f0c82c', zone: '#9a121b', safe: '#1a5a38', seam: 'rgba(6,40,18,0.5)', line: '#ffffff', text: 'rgba(255,255,255,0.45)',
    floor: 0x14171c, platform: 0xdfe3e8, led: 0xffffff, key: 0xfffaf0, keyI: 1.5, fillC: 0xffffff, fillI: 0.95, hemiSky: 0xfff6e8, hemiGround: 0x20262b, hemiI: 0.55, banner: ['#f1f4f7', '#bfe7d0'], bannerText: '#0f4d2a', accent: '#0f7a3d',
  },
};
J.EVENTS = {
  grandslam: { id: 'grandslam', name: 'Гранд-слэм', style: 'B', fights: 2, line: 'GRAND SLAM · ТУР ПО ДЗЮДО', floor: 'GRAND SLAM', prize: 1 },
  worlds: { id: 'worlds', name: 'Чемпионат мира', style: 'A', fights: 3, line: 'ЧЕМПИОНАТ МИРА ПО ДЗЮДО', floor: 'WORLD CHAMPIONSHIPS', prize: 2 },
  masters: { id: 'masters', name: 'Мастерс', style: 'A', fights: 3, line: 'МАСТЕРС ПО ДЗЮДО', floor: 'WORLD MASTERS', prize: 1.5 },
  olympics: { id: 'olympics', name: 'Олимпиада', style: 'A', fights: 3, line: 'ОЛИМПИЙСКИЙ ТУРНИР ПО ДЗЮДО', floor: 'OLYMPIC JUDO', prize: 4 },
  europe: { id: 'europe', name: 'Чемпионат Европы', style: 'B', fights: 3, line: 'ЧЕМПИОНАТ ЕВРОПЫ ПО ДЗЮДО', floor: 'EUROPEAN CHAMPIONSHIPS', prize: 0.8 },
  asia: { id: 'asia', name: 'Чемпионат Азии', style: 'B', fights: 3, line: 'ЧЕМПИОНАТ АЗИИ ПО ДЗЮДО', floor: 'ASIAN CHAMPIONSHIPS', prize: 0.8 },
};
J.venueId = 'worlds';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function srgb(tex) { if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding; return tex; }

// tatami: 1 x 2 m puzzle mats with a woven top, the red danger zone, start marks and the event name in the safety area
function tatamiTexture(st, ev) {
  const S = 2048, c = canvas(S, S), g = c.getContext('2d');
  const W = SAFE * 2, PX = S / W, X = (m) => S / 2 + m * PX;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = st.safe; g.fillRect(0, 0, S, S);
  g.fillStyle = st.zone; g.fillRect(X(-HALF), X(-HALF), 2 * HALF * PX, 2 * HALF * PX);
  const grd = g.createRadialGradient(S / 2, S / 2, PX * 0.5, S / 2, S / 2, PX * 3.6);
  grd.addColorStop(0, st.centerHi); grd.addColorStop(1, st.center);
  g.fillStyle = grd; g.fillRect(X(-HALF + 1), X(-HALF + 1), (2 * HALF - 2) * PX, (2 * HALF - 2) * PX);
  // woven top: fine diagonal weave
  g.save(); g.globalAlpha = 0.07;
  for (let i = -S; i < S * 2; i += 5) {
    g.strokeStyle = '#000'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
    g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(i + 2.5, 0); g.lineTo(i + 2.5 - S, S); g.stroke();
  }
  g.restore();
  for (let i = 0; i < 24000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)'; g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 1 + rnd() * 2); }
  // puzzle mats 1 x 2 m, laid in a brick pattern
  g.strokeStyle = st.seam; g.lineWidth = 3;
  for (let k = -SAFE; k <= SAFE + 0.01; k += 1) { g.beginPath(); g.moveTo(0, X(k)); g.lineTo(S, X(k)); g.stroke(); }
  for (let row = -SAFE; row < SAFE; row += 1) {
    const off = (Math.round(row + SAFE) % 2) * 1;
    for (let k = -SAFE - 1 + off; k <= SAFE + 1; k += 2) { g.beginPath(); g.moveTo(X(k), X(row)); g.lineTo(X(k), X(row + 1)); g.stroke(); }
  }
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1.5;
  for (let k = -SAFE; k <= SAFE + 0.01; k += 1) { g.beginPath(); g.moveTo(0, X(k) + 3); g.lineTo(S, X(k) + 3); g.stroke(); }
  // the line between the safe area / danger zone and the main area
  g.strokeStyle = st.line; g.globalAlpha = 0.9; g.lineWidth = 5;
  g.strokeRect(X(-HALF), X(-HALF), 2 * HALF * PX, 2 * HALF * PX);
  g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(X(-HALF + 1), X(-HALF + 1), (2 * HALF - 2) * PX, (2 * HALF - 2) * PX);
  g.globalAlpha = 1;
  // start marks: white (left) and blue (right) bars at +-1 m
  g.fillStyle = '#f5f5f5'; g.fillRect(X(-1.0) - 5, X(-0.25), 10, 0.5 * PX);
  g.fillStyle = '#2f6dff'; g.fillRect(X(1.0) - 5, X(-0.25), 10, 0.5 * PX);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(X(-1.0) - 5, X(-0.25), 10, 0.5 * PX);
  // the centre emblem
  g.save(); g.translate(S / 2, S / 2);
  g.globalAlpha = 0.16; g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, PX * 1.55, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.3; g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, PX * 1.55, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.6; g.fillStyle = '#fff'; g.font = '900 ' + PX * 0.95 + 'px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('JUDO', 0, PX * 0.04);
  g.restore();
  // the event name in the safety area, readable from the default camera on both ends
  g.fillStyle = st.text; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 ' + PX * 0.5 + 'px "Arial Black", Impact, sans-serif';
  g.save(); g.translate(S / 2, X(-HALF - 0.75)); g.fillText(ev.floor, 0, 0); g.restore();
  g.save(); g.translate(S / 2, X(HALF + 0.75)); g.rotate(Math.PI); g.fillText(ev.floor, 0, 0); g.restore();
  g.font = '700 ' + PX * 0.28 + 'px "Arial Black", Impact, sans-serif';
  g.save(); g.translate(X(-HALF - 0.75), S / 2); g.rotate(-Math.PI / 2); g.fillText('ДЗЮДО', 0, 0); g.restore();
  g.save(); g.translate(X(HALF + 0.75), S / 2); g.rotate(Math.PI / 2); g.fillText('ДЗЮДО', 0, 0); g.restore();
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
  return srgb(tex);
}

function bannerTexture(st, text, sub) {
  const w = 1024, h = 256, c = canvas(w, h), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, st.banner[0]); grd.addColorStop(1, st.banner[1]);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = -h; i < w; i += 64) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.lineTo(i + h + 26, 0); g.lineTo(i + 26, h); g.fill(); }
  g.fillStyle = st.bannerText; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 ' + h * 0.34 + 'px "Arial Black", Impact, sans-serif'; g.fillText(text, w / 2, h * 0.42);
  g.fillStyle = st.accent; g.font = '700 ' + h * 0.17 + 'px "Arial Black", Impact, sans-serif'; g.fillText(sub, w / 2, h * 0.78);
  return srgb(new THREE.CanvasTexture(c));
}

// ---------------------------------------------------------------- dressing the arena
J.dressArena = function (arena, venueId) {
  if (!arena) return;
  const ev = J.EVENTS[venueId] || J.EVENTS.worlds, st = STYLES[ev.style];
  J.venueId = ev.id; J.event = ev;
  for (const o of (arena.cageObjs || []).concat(arena.matObjs || [])) o.visible = false;
  if (arena.tunnel) arena.tunnel.visible = false;
  if (arena.steps) arena.steps.visible = false;
  if (arena.judoG) { arena.group.remove(arena.judoG); arena.judoG.traverse((o) => { for (const m of [].concat(o.material || [])) { if (m.map && m.map.dispose) m.map.dispose(); m.dispose(); } if (o.geometry) o.geometry.dispose(); }); }
  const G = new THREE.Group(); arena.judoG = G; arena.group.add(G);
  const std = (color, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra || {}));
  if (arena.floorMesh) arena.floorMesh.material.color.setHex(st.floor);

  const W = SAFE * 2;
  // platform under the mat: a 1 m high stage with a glowing edge
  const plat = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, 1.0, W + 0.7), std(st.platform, 0.55));
  plat.position.y = -0.5; plat.receiveShadow = true; G.add(plat);
  const ledMat = new THREE.MeshBasicMaterial({ color: st.led, toneMapped: false });
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(W + 0.74, 0.06, 0.06), ledMat); a.position.set(0, -0.12, s * (W + 0.7) / 2); G.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, W + 0.74), ledMat); b.position.set(s * (W + 0.7) / 2, -0.12, 0); G.add(b);
  }
  // the mat itself, a little raised so the edge reads
  const mat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, W), [std(st.safe, 0.9), std(st.safe, 0.9), new THREE.MeshStandardMaterial({ map: tatamiTexture(st, ev), roughness: 0.82, metalness: 0 }), std(st.safe, 0.9), std(st.safe, 0.9), std(st.safe, 0.9)]);
  mat.position.y = -0.025 + 0.001; mat.receiveShadow = true; G.add(mat);
  arena.tatami = mat;

  // advertising boards along the platform (low, so the camera looks over them)
  const bt = bannerTexture(st, ev.name.toUpperCase(), 'ДЗЮДО');
  const boardGeo = new THREE.BoxGeometry(2.4, 0.5, 0.12);
  const boardMat = new THREE.MeshBasicMaterial({ map: bt, toneMapped: false });
  const edge = (W + 0.7) / 2 + 0.55;
  for (let side = 0; side < 4; side++) {
    const ang = side * Math.PI / 2, c = Math.cos(ang), sn = Math.sin(ang);
    for (let k = -2; k <= 2; k++) {
      const m = new THREE.Mesh(boardGeo, boardMat);
      m.position.set(c * edge - sn * k * 2.5, -0.25, sn * edge + c * k * 2.5);
      m.rotation.y = Math.PI / 2 - ang; G.add(m);
    }
  }

  // overhead: hanging banners and a bright truss ring
  const flag = new THREE.MeshBasicMaterial({ map: bannerTexture(st, ev.name.toUpperCase(), ev.line), toneMapped: false, side: THREE.DoubleSide });
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), flag);
    b.position.set(Math.cos(a) * 9.4, 6.8, Math.sin(a) * 9.4); b.lookAt(0, 4.2, 0); G.add(b);
  }

  // lights
  if (arena.key) { arena.key.color.setHex(st.key); }
  for (const f of arena.fills || []) f.color.setHex(st.fillC);
  if (arena.hemi) { arena.hemi.color.setHex(st.hemiSky); arena.hemi.groundColor.setHex(st.hemiGround); }
  arena.judo = { keyI: st.keyI, fillI: st.fillI, hemiI: st.hemiI };
  if (arena.screenTex) arena.screenTex.redraw(['ДЗЮДО', ev.line]);
};

// bright halls: lights stay on in every phase
const origUpdateLights = UFC.Arena.prototype._updateLights;
UFC.Arena.prototype._updateLights = function (dt, time) {
  origUpdateLights.call(this, dt, time);
  if (this.judo) {
    this.key.intensity = this.judo.keyI; for (const s of this.fills) s.intensity = this.judo.fillI;
    this.hemi.intensity = this.judo.hemiI;
  }
};
UFC.Arena.prototype.setMatchup = function (a, b) { if (this.screenTex) this.screenTex.redraw([a + '  VS  ' + b, (J.event || J.EVENTS.worlds).line]); };
// the fence fading is for the cage only
UFC.Arena.prototype.updateFence = function () {};
const origBuild = UFC.Arena.prototype._build;
UFC.Arena.prototype._build = function () { origBuild.call(this); J.dressArena(this, J.venueId); };

J.setVenue = function (id) { const g = window.__UFC__; J.venueId = id; J.event = J.EVENTS[id]; if (g && g.arena) J.dressArena(g.arena, id); };
})();

