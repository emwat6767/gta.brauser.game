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
  // D: the small club dojo - worn mats, painted walls, tube lights, no crowd
  L: { dojo: true, center: '#d2ba40', safe: '#345ca8', floor: 0x6b5a44, key: 0xffffff, keyI: 1.1, fillC: 0xf4f6ff, fillI: 0.75, hemiSky: 0xf4f8ff, hemiGround: 0x5a5040, hemiI: 0.85 },
  D: { dojo: true, center: '#6f8a4e', safe: '#8a3d33', floor: 0x3b2e22, key: 0xfff0d8, keyI: 1.05, fillC: 0xffe6c4, fillI: 0.7, hemiSky: 0xfff3e0, hemiGround: 0x4a3626, hemiI: 0.8 },
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
J.EVENTS.gym = { id: 'gym', name: 'Районное первенство', style: 'L', gym: true, fights: 3, line: 'ПЕРВЕНСТВО РАЙОНА ПО ДЗЮДО', floor: 'РАЙОН', sign: 'СПОРТШКОЛА № 3', sub: 'ПЕРВЕНСТВО РАЙОНА ПО ДЗЮДО', prize: 0 };
J.EVENTS.dojo = { id: 'dojo', name: 'Додзё «Сакура»', style: 'D', fights: 2, line: 'СК «САКУРА» · ДЗЮДО', floor: 'САКУРА', prize: 0 };
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

// ---------------------------------------------------------------- the club dojo
// the mats of a small club: faded green and red, every mat its own shade, tape over the torn ones, scuffs
function dojoTatamiTexture(gym) {
  const S = 1024, c = canvas(S, S), g = c.getContext('2d'), W = SAFE * 2, PX = S / W, X = (m) => S / 2 + m * PX;
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = -SAFE; row < SAFE; row += 1) {
    const off = (Math.round(row + SAFE) % 2);
    for (let k = -SAFE - 1 + off; k < SAFE + 1; k += 2) {
      const inner = Math.abs(row + 0.5) < HALF && Math.abs(k + 1) < HALF;
      const base = gym ? (inner ? [210, 186, 64] : [52, 92, 168]) : inner ? [104, 132, 74] : [134, 58, 48];
      const f = 0.82 + rnd() * 0.3;
      g.fillStyle = 'rgb(' + base.map((v) => Math.min(255, Math.round(v * f))).join(',') + ')';
      g.fillRect(X(k), X(row), 2 * PX, PX);
      // the sun and the years: a lighter worn patch
      g.fillStyle = 'rgba(255,240,200,' + (rnd() * 0.12).toFixed(3) + ')'; g.fillRect(X(k) + rnd() * PX, X(row) + rnd() * PX * 0.5, PX * (0.4 + rnd() * 0.8), PX * (0.2 + rnd() * 0.4));
    }
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.55 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 4, 1 + rnd() * 2); }
  // seams with small gaps
  g.strokeStyle = 'rgba(20,14,8,0.75)'; g.lineWidth = 3;
  for (let k = -SAFE; k <= SAFE + 0.01; k += 1) { g.beginPath(); g.moveTo(0, X(k)); g.lineTo(S, X(k)); g.stroke(); }
  for (let row = -SAFE; row < SAFE; row += 1) { const off = (Math.round(row + SAFE) % 2); for (let k = -SAFE - 1 + off; k <= SAFE + 1; k += 2) { g.beginPath(); g.moveTo(X(k), X(row)); g.lineTo(X(k), X(row + 1)); g.stroke(); } }
  // grey tape over the torn corners
  for (let i = 0; i < (gym ? 3 : 14); i++) {
    g.save(); g.translate(rnd() * S, rnd() * S); g.rotate((rnd() - 0.5) * 0.6);
    g.fillStyle = 'rgba(150,150,145,0.9)'; g.fillRect(-PX * 0.25, -PX * 0.05, PX * (0.3 + rnd() * 0.4), PX * 0.1);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(-PX * 0.25, -PX * 0.05, PX * 0.6, PX * 0.02); g.restore();
  }
  // dark scuffs where everybody falls
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,20,10,' + (0.05 + rnd() * 0.08).toFixed(3) + ')'; g.beginPath(); g.ellipse(S / 2 + (rnd() - 0.5) * PX * 6, S / 2 + (rnd() - 0.5) * PX * 6, PX * (0.2 + rnd() * 0.5), PX * (0.1 + rnd() * 0.3), rnd() * 3, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  return srgb(tex);
}
// the walls: wooden panels below, tired green paint above, a few stains
function dojoWallTexture(paint) {
  const w = 1024, h = 512, c = canvas(w, h), g = c.getContext('2d');
  let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = paint || '#b8c3a4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '90,80,60' : '255,255,240') + ',' + (0.03 + rnd() * 0.06).toFixed(3) + ')'; g.beginPath(); g.ellipse(rnd() * w, rnd() * h * 0.55, 20 + rnd() * 80, 10 + rnd() * 40, 0, 0, Math.PI * 2); g.fill(); }
  const py = h * 0.58;
  for (let x = 0; x < w; x += 32) { const f = 0.85 + rnd() * 0.25; g.fillStyle = 'rgb(' + [Math.round(122 * f), Math.round(84 * f), Math.round(52 * f)].join(',') + ')'; g.fillRect(x, py, 32, h - py); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, py, 2, h - py); }
  g.fillStyle = '#6b4a2c'; g.fillRect(0, py - 10, w, 12);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  return srgb(tex);
}
function dojoSignTexture(text, sub, bg, fg) {
  const w = 1024, h = 256, c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 ' + h * 0.36 + 'px "Arial Black", Impact, sans-serif'; g.fillText(text, w / 2, h * 0.42);
  g.font = '700 ' + h * 0.16 + 'px Arial, sans-serif'; g.fillText(sub, w / 2, h * 0.8);
  return srgb(new THREE.CanvasTexture(c));
}
function buildDojo(arena, G, std, ev) {
  const gym = !!ev.gym, W = SAFE * 2, R = gym ? 20 : 16, Hh = gym ? 6 : 4.2;
  // the room: a box seen from inside, so the camera outside a wall looks straight through it
  const wall = new THREE.MeshStandardMaterial({ map: dojoWallTexture(gym ? '#9fb4cc' : null), roughness: 0.92, side: THREE.BackSide });
  const ceil = std(0xd8d2c4, 0.95, { side: THREE.BackSide }), floor = std(0x4a3a2a, 0.85, { side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(R, Hh, R), [wall, wall, ceil, floor, wall, wall]);
  room.position.y = Hh / 2 - 0.06; room.receiveShadow = true; G.add(room);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, W), [std(0x6e3029, 0.9), std(0x6e3029, 0.9), new THREE.MeshStandardMaterial({ map: dojoTatamiTexture(gym), roughness: 0.9, metalness: 0 }), std(0x6e3029, 0.9), std(0x6e3029, 0.9), std(0x6e3029, 0.9)]);
  mat.position.y = -0.025 + 0.001; mat.receiveShadow = true; G.add(mat);
  arena.tatami = mat;
  // tube lights on the ceiling
  const tube = new THREE.MeshBasicMaterial({ color: 0xfff6e6, toneMapped: false });
  for (const x of [-3.2, 0, 3.2]) for (const z of [-3, 3]) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.16), tube); t.position.set(x, Hh - 0.12, z); G.add(t); }
  // wall bars on the far wall, a bench, a clock, the club sign, the windows
  const wood = std(0x9a6a3c, 0.7);
  for (let k = 0; k < 5; k++) {
    const x = -5 + k * 1.1;
    for (const s of [-0.42, 0.42]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.06), wood); p.position.set(x + s, 1.3, -R / 2 + 0.12); G.add(p); }
    for (let r = 0; r < 9; r++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.84, 6), wood); b.rotation.z = Math.PI / 2; b.position.set(x, 0.25 + r * 0.27, -R / 2 + 0.12); G.add(b); }
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.36), wood); bench.position.set(3.6, 0.45, -R / 2 + 0.5); G.add(bench);
  for (const s of [-1.3, 1.3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.3), std(0x333333, 0.6)); l.position.set(3.6 + s, 0.22, -R / 2 + 0.5); G.add(l); }
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 24), std(0xf4f1e8, 0.5)); clock.rotation.x = Math.PI / 2; clock.position.set(0, 3.3, -R / 2 + 0.05); G.add(clock);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.01), std(0x111111, 0.5)); hand.position.set(0, 3.36, -R / 2 + 0.09); G.add(hand);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: dojoSignTexture(ev.sign || 'СК «САКУРА»', ev.sub || 'ДЗЮДО · СЕКЦИЯ С 1987 ГОДА', '#f2ecdc', gym ? '#1d3f8a' : '#8a1d1d'), roughness: 0.8 }));
  sign.position.set(-R / 2 + 0.04, 2.9, 0); sign.rotation.y = Math.PI / 2; G.add(sign);
  const rules = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshStandardMaterial({ map: dojoSignTexture('ПРАВИЛА', 'поклон · чистое кимоно · уважение', '#ffffff', '#222'), roughness: 0.8 }));
  rules.position.set(-R / 2 + 0.04, 1.6, -2.8); rules.rotation.y = Math.PI / 2; G.add(rules);
  const glass = new THREE.MeshBasicMaterial({ color: 0xdfefff, toneMapped: false });
  for (const z of [-4.5, -1.5, 1.5, 4.5]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), glass); win.position.set(R / 2 - 0.04, 2.9, z); win.rotation.y = -Math.PI / 2; G.add(win); const fr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.08), wood); fr.position.set(R / 2 - 0.05, 2.9, z); G.add(fr); }
  // the school gym: a basketball board on the wall and long benches for the parents
  if (gym) {
    const bb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 1.8), std(0xf4f4f4, 0.5)); bb.position.set(R / 2 - 0.3, 3.4, 0); G.add(bb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 18), std(0xe0561c, 0.5)); ring.rotation.x = Math.PI / 2; ring.position.set(R / 2 - 0.6, 3.05, 0); G.add(ring);
    for (const x of [-6, -2.5, 1, 4.5]) { const b2 = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.4), wood); b2.position.set(x, 0.45, -R / 2 + 1.3); G.add(b2); }
  }
  // a pile of old mats and a bag in the corner
  const pile = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 2.0), std(0x5c7a40, 0.9)); pile.position.set(R / 2 - 1.2, 0.2, R / 2 - 1.6); G.add(pile);
  const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 12), std(0x2a2a30, 0.8)); bag.rotation.z = Math.PI / 2; bag.position.set(R / 2 - 2.4, 0.22, R / 2 - 0.8); G.add(bag);
}

// ---------------------------------------------------------------- dressing the arena
J.dressArena = function (arena, venueId) {
  if (!arena) return;
  const ev = J.EVENTS[venueId] || J.EVENTS.worlds, st = STYLES[ev.style];
  J.venueId = ev.id; J.event = ev;
  // the dojo hides the whole hall (stands, crowd, screens); every other venue brings it back
  if (st.dojo) { arena._dojoHidden = arena._dojoHidden || []; for (const o of arena.group.children) if (o !== arena.judoG && !o.isLight && o.visible) { o.visible = false; arena._dojoHidden.push(o); } }
  else if (arena._dojoHidden) { for (const o of arena._dojoHidden) o.visible = true; arena._dojoHidden = null; }
  for (const o of (arena.cageObjs || []).concat(arena.matObjs || [])) o.visible = false;
  if (arena.tunnel) arena.tunnel.visible = false;
  if (arena.steps) arena.steps.visible = false;
  if (arena.judoG) { arena.group.remove(arena.judoG); arena.judoG.traverse((o) => { for (const m of [].concat(o.material || [])) { if (m.map && m.map.dispose) m.map.dispose(); m.dispose(); } if (o.geometry) o.geometry.dispose(); }); }
  const G = new THREE.Group(); arena.judoG = G; arena.group.add(G);
  const std = (color, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra || {}));
  if (arena.floorMesh) arena.floorMesh.material.color.setHex(st.floor);
  if (st.dojo) {
    buildDojo(arena, G, std, ev);
    if (arena.key) arena.key.color.setHex(st.key);
    for (const f of arena.fills || []) f.color.setHex(st.fillC);
    if (arena.hemi) { arena.hemi.color.setHex(st.hemiSky); arena.hemi.groundColor.setHex(st.hemiGround); }
    arena.judo = { keyI: st.keyI, fillI: st.fillI, hemiI: st.hemiI };
    return;
  }

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

