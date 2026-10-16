//# sourceURL=judo/gi.js
// Judo: the kimono (judogi). Jacket with lapels and a name patch on the back, a black belt, wide trousers; white and blue.
(function () {
'use strict';
const UFC = window.UFC;
const J = (window.JUDO = window.JUDO || {});
const M = UFC.M;
const { limbGeo, trunkGeo, stdMat } = UFC.body;

J.GI = {
  white: { base: '#f3f3ee', shade: '#d5d6d2', lapel: '#e6e6e0', stitch: 'rgba(110,110,100,0.55)', name: 'Белое кимоно' },
  blue: { base: '#1d4fae', shade: '#123577', lapel: '#2a63cc', stitch: 'rgba(200,220,255,0.5)', name: 'Синее кимоно' },
};
const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const srgb = (t) => { if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding; return t; };

// the cloth: a pique weave, drawn once per colour
const _fab = {};
function fabricMap(kind) {
  if (_fab[kind]) return _fab[kind];
  const P = J.GI[kind], c = cvs(256, 256), g = c.getContext('2d');
  g.fillStyle = P.base; g.fillRect(0, 0, 256, 256);
  g.globalAlpha = 0.07;
  for (let i = 0; i < 256; i += 8) { g.fillStyle = P.shade; g.fillRect(0, i, 256, 3); g.fillRect(i, 0, 3, 256); }
  let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 600; i++) { g.globalAlpha = 0.03; g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.anisotropy = 8;
  return (_fab[kind] = srgb(t));
}

// the chest of the jacket: lapels in a V (the skin shows between them), stitching, the name patch on the back
function chestMap(kind, skin, name, country) {
  const P = J.GI[kind], W = 1024, Hc = 256, c = cvs(W, Hc), g = c.getContext('2d');
  g.fillStyle = P.base; g.fillRect(0, 0, W, Hc);
  g.globalAlpha = 0.06;
  for (let i = 0; i < W; i += 5) { g.fillStyle = P.shade; g.fillRect(i, 0, 1.4, Hc); }
  for (let i = 0; i < Hc; i += 5) { g.fillStyle = P.shade; g.fillRect(0, i, W, 1.4); }
  g.globalAlpha = 1;
  // the V of the neckline: skin between the lapels (front = the texture seam, so everything is drawn twice)
  const sk = '#' + new THREE.Color(skin).multiplyScalar(0.92).getHexString();
  const lap = (ox) => {
    g.save(); g.translate(ox, 0);
    // opening
    g.fillStyle = sk; g.beginPath(); g.moveTo(-34, 0); g.lineTo(34, 0); g.lineTo(3, Hc * 0.68); g.lineTo(-3, Hc * 0.68); g.closePath(); g.fill();
    // collar bands up the V (the right one goes over the left)
    const band = (x0, x1, col) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + (x1 > x0 ? 46 : -46), 0); g.lineTo(x0 > 0 ? 70 : -70, Hc * 0.97); g.lineTo(x0 > 0 ? 40 : -40, Hc * 0.97); g.closePath(); g.fill();
    };
    void band;
    g.lineWidth = 11; g.strokeStyle = P.lapel; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-36, 0); g.lineTo(-2, Hc * 0.7); g.stroke();
    g.beginPath(); g.moveTo(36, 0); g.lineTo(2, Hc * 0.7); g.stroke();
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.moveTo(-43, 0); g.lineTo(-8, Hc * 0.72); g.stroke(); g.beginPath(); g.moveTo(43, 0); g.lineTo(8, Hc * 0.72); g.stroke();
    // a thick lapel crossing down the chest, with stitching
    g.lineWidth = 15; g.strokeStyle = P.lapel;
    g.beginPath(); g.moveTo(-3, Hc * 0.68); g.lineTo(-90, Hc); g.stroke(); g.beginPath(); g.moveTo(3, Hc * 0.68); g.lineTo(90, Hc); g.stroke();
    g.lineWidth = 2; g.strokeStyle = P.stitch; g.setLineDash([6, 5]);
    g.beginPath(); g.moveTo(-3, Hc * 0.68); g.lineTo(-84, Hc); g.stroke(); g.beginPath(); g.moveTo(3, Hc * 0.68); g.lineTo(84, Hc); g.stroke();
    g.setLineDash([]);
    g.restore();
  };
  lap(0); lap(W);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 6;
  return srgb(t);
}

J.backName = (cfg) => String((cfg.look && cfg.look.backName) || cfg.backName || cfg.short || cfg.name || '').toUpperCase().slice(0, 14);

// the big white patch on the back: the country above, the name in black capitals
function patchMap(name, country) {
  const W = 512, H = 300, c = cvs(W, H), g = c.getContext('2d');
  g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; g.strokeRect(5, 5, W - 10, H - 10);
  g.fillStyle = '#c3222c'; g.fillRect(14, 14, W - 28, 30);
  g.fillStyle = '#fff'; g.font = '800 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((country || 'JUDO') + '  ·  JUDO', W / 2, 30);
  g.fillStyle = '#0d0d0d'; g.textBaseline = 'middle';
  let fs = 120; g.font = '900 ' + fs + 'px "Arial Black", Impact, sans-serif';
  while (g.measureText(name).width > W - 44 && fs > 30) { fs -= 4; g.font = '900 ' + fs + 'px "Arial Black", Impact, sans-serif'; }
  g.fillText(name, W / 2, 44 + (H - 44) / 2);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return srgb(t);
}

// folds: a low-frequency radial displacement, so the cloth hangs instead of being a pipe
function folds(geo, amp, f1, f2, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z) || 1e-4, th = Math.atan2(x, z);
    const k = 1 + amp * (Math.sin(th * f1 + y * 18 + seed) * 0.6 + Math.sin(th * f2 - y * 31 + seed * 2.3) * 0.4);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

J.dressGi = function (body, cfg) {
  const kind = cfg.gi === 'blue' ? 'blue' : 'white';
  const { B, dims: d, mats } = body, H = d.h, look = body.look, bp = body.bodyP;
  const musc = M.clamp(bp.muscle, 0, 1), bulk = d.bulk;
  const fab = fabricMap(kind);
  const mk = (extra) => new THREE.MeshStandardMaterial(Object.assign({ map: fab, roughness: 0.93, metalness: 0, side: THREE.DoubleSide }, extra || {}));
  const cloth = mk();
  const chestTex = chestMap(kind, look.skin, '', '');
  const chestMat = mk({ map: chestTex });
  const collarMat = mk({ color: new THREE.Color(kind === 'blue' ? 0xb8c8ee : 0xf6f6f2) });
  const beltCol = cfg.belt != null ? cfg.belt : 0x0a0a0b, blackBelt = beltCol < 0x202020;   // the belt colour: white to black along the career
  const beltMat = stdMat(beltCol, 0.62, { side: THREE.DoubleSide });
  const stripeMat = stdMat(0xe6e0cf, 0.6, { side: THREE.DoubleSide });
  const add = (bone, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; bone.add(mesh); return mesh; };
  const armK = (1 + musc * 0.12 + bulk * 0.1) * (0.88 + bp.arms * 0.24);
  const legK = 0.9 + bp.legs * 0.2;
  const pelvisR = (0.082 + bulk * 0.016) * H, waistR = (0.068 + bulk * 0.018 + musc * 0.002) * H;
  const gi = { meshes: [] }; body.gi = gi;
  const keep = (m) => { gi.meshes.push(m); return m; };
  let sd = 1; for (const ch of (cfg.id || cfg.name || 'x')) sd = (sd * 31 + ch.charCodeAt(0)) % 997;

  for (const m of [mats.shortsMat, mats.sleeveMatL, mats.sleeveMatR]) { if (!m) continue; m.map = fab; m.color.set(0xffffff); m.needsUpdate = true; }
  if (mats.trimMat) mats.trimMat.color.set(J.GI[kind].base);
  body.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === mats.gloveMat) o.material = mats.skin;
    else if (o.material === mats.trimMat && o.parent && /^hand/.test(o.parent.name)) o.visible = false;
    else if (o.geometry && o.geometry.type === 'CylinderGeometry' && o.parent && /^hand/.test(o.parent.name)) o.visible = false;
  });
  { const ms = B.hips.children.filter((o) => o.isMesh); if (ms[1]) ms[1].visible = false; }   // the waistband of the shorts (the bones of the legs are children of the hips too)

  // trousers: wide, tapering a little to the ankle, with folds
  for (const side of ['L', 'R']) {
    const th = keep(new THREE.Mesh(folds(limbGeo(d.thigh * 1.02, (t) => H * legK * M.lerp(0.06 + bulk * 0.008, 0.05, M.smooth(t)), false, false, 28, 12), 0.03, 5, 9, sd + (side === 'L' ? 1 : 4)), cloth));
    th.scale.set(1, 1, 1.03); add(B['th' + side], th, 0, 0.03 * H, 0);
    const knee = keep(new THREE.Mesh(new THREE.SphereGeometry(0.05 * H * legK, 18, 12), cloth));
    knee.scale.set(1, 1.05, 1.05); add(B['sn' + side], knee, 0, 0.004 * H, 0.002 * H);
    const sn = keep(new THREE.Mesh(folds(limbGeo(d.shin * 0.94, (t) => H * legK * M.lerp(0.05, 0.048 + 0.005 * t * t, t), false, false, 28, 12), 0.04, 6, 11, sd + 7), cloth));
    sn.scale.set(1, 1, 1.03); add(B['sn' + side], sn, 0, 0.004 * H, 0);
  }
  // jacket skirt, hanging past the belt and flaring a little
  const skirt = keep(new THREE.Mesh(folds(trunkGeo(-0.1 * H, 0.06 * H, (t) => pelvisR * M.lerp(1.28, 1.08, M.smooth(t)), false, false, 40, 10), 0.035, 7, 13, sd), cloth));
  skirt.scale.set(1.2, 1, 1.08); add(B.hips, skirt);
  // the belt: two turns, a flat knot and two tails with the dan stripes
  const belt = keep(new THREE.Mesh(trunkGeo(0.012 * H, 0.056 * H, () => pelvisR * 1.2, false, false, 40, 2), beltMat));
  belt.scale.set(1.28, 1, 1.1); add(B.hips, belt);
  const belt2 = keep(new THREE.Mesh(trunkGeo(0.02 * H, 0.048 * H, () => pelvisR * 1.23, false, false, 40, 2), beltMat));
  belt2.scale.set(1.28, 1, 1.1); add(B.hips, belt2);
  const kz = pelvisR * 1.23 * 1.1;
  const knot = keep(new THREE.Mesh(new THREE.BoxGeometry(0.04 * H, 0.032 * H, 0.02 * H), beltMat)); add(B.hips, knot, 0, 0.034 * H, kz + 0.004 * H);
  for (const s of [-1, 1]) {
    const tail = keep(new THREE.Mesh(new THREE.BoxGeometry(0.02 * H, 0.14 * H, 0.008 * H), beltMat));
    tail.rotation.z = s * 0.2; tail.rotation.x = 0.1; add(B.hips, tail, s * 0.024 * H, -0.03 * H, kz + 0.012 * H);
    for (let k = 0; k < (blackBelt ? 2 : 0); k++) { const st = keep(new THREE.Mesh(new THREE.BoxGeometry(0.0205 * H, 0.006 * H, 0.0092 * H), stripeMat)); st.rotation.z = s * 0.2; st.rotation.x = 0.1; add(B.hips, st, s * (0.024 + 0.0085) * H, (-0.085 - k * 0.014) * H, kz + 0.012 * H); }
  }
  const waist = keep(new THREE.Mesh(folds(trunkGeo(-0.03 * H, d.spineLen + d.chestLen * 0.9, () => waistR * 1.22, false, false, 40, 6), 0.025, 7, 11, sd + 2), cloth));
  waist.scale.set(1.26, 1, 1.1); add(B.spine, waist);
  const chestTop = 0.128 * H, rC = (t) => waistR * 1.26 * (1 + 0.05 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5)) * (t > 0.86 ? M.lerp(1, 0.7, (t - 0.86) / 0.14) : 1);
  const sx = 1.4 + (bp.shoulders - 0.5) * 0.1;
  const chest = keep(new THREE.Mesh(folds(trunkGeo(-0.1 * H, chestTop, rC, false, false, 40, 18), 0.012, 6, 10, sd + 3), chestMat));
  chest.scale.set(sx, 1, 1.12); add(B.chest, chest);
  // the lapels: two thick cloth bands crossing in a V, the right one over the left
  const zf = (y) => { const t = (y + 0.1 * H) / (chestTop + 0.1 * H); return rC(Math.max(0, Math.min(1, t))) * 1.12; };
  const lapel = (side, over) => {
    const sgn = side, bump = over ? 0.022 : 0.008;
    const pts = [
      new THREE.Vector3(sgn * 0.038 * H, 0.14 * H, zf(0.12 * H) * 0.72),
      new THREE.Vector3(sgn * 0.026 * H, 0.1 * H, zf(0.1 * H) + bump * H),
      new THREE.Vector3(sgn * 0.004 * H, 0.05 * H, zf(0.05 * H) + (bump + 0.002) * H),
      new THREE.Vector3(-sgn * 0.03 * H, 0.0 * H, zf(0.0) + (bump + 0.003) * H),
      new THREE.Vector3(-sgn * 0.06 * H, -0.03 * H, zf(-0.03 * H) + (bump + 0.003) * H),
    ];
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.014 * H, 8, false);
    const m = keep(new THREE.Mesh(tube, collarMat));
    m.scale.set(sx * 0.95, 1, 0.7); add(B.chest, m);
  };
  lapel(1, false); lapel(-1, true);
  const collar = keep(new THREE.Mesh(trunkGeo(0.096 * H, 0.158 * H, (t) => 0.054 * H * M.lerp(1.0, 0.9, t), false, false, 30, 4), collarMat));
  collar.scale.set(1.05, 1, 0.97); add(B.chest, collar, 0, 0, -0.004 * H);
  // the name on the back: a big white patch that follows the curve of the jacket
  {
    const y0 = 0.0 * H, hh = 0.105 * H, rr = rC((y0 + 0.1 * H + hh / 2) / (chestTop + 0.1 * H)) * 1.05, arc = 1.28;
    const geo = new THREE.CylinderGeometry(rr, rr, hh, 24, 1, true, Math.PI - arc / 2, arc);
    const pm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: patchMap(J.backName(cfg), (cfg.flag || '').toUpperCase()), roughness: 0.85, side: THREE.DoubleSide }));
    pm.scale.set(sx, 1, 1.12); pm.castShadow = true; add(B.chest, pm, 0, y0 + hh / 2, 0);
    keep(pm);
  }
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const cap = keep(new THREE.Mesh(new THREE.SphereGeometry(0.047 * H * armK, 18, 12), cloth));
    cap.scale.set(1.0, 0.95, 1.0); add(B.chest, cap, s * (d.shoulderX - 0.004 * H), d.shoulderY - 0.008 * H, -0.004 * H);
    const ua = keep(new THREE.Mesh(folds(limbGeo(d.upper + 0.01 * H, (t) => armK * H * M.lerp(0.036, 0.04, t), false, false, 28, 8), 0.035, 5, 9, sd + 11), cloth));
    add(B['ua' + side], ua, 0, 0.01 * H, 0);
    const fa = keep(new THREE.Mesh(folds(limbGeo(d.fore * 0.82, (t) => armK * H * M.lerp(0.04, 0.047, t * t), false, false, 28, 8), 0.04, 5, 9, sd + 13), cloth));
    add(B['fa' + side], fa, 0, 0.004 * H, 0);
  }
  return body;
};

// every body built for a fighter with a gi
const origBuild = UFC.buildBody;
UFC.buildBody = function (cfg) {
  const body = origBuild(cfg);
  try { if (cfg && cfg.gi) J.dressGi(body, cfg); } catch (e) { UFC.reportError && UFC.reportError(e, 'кимоно'); }
  return body;
};
})();

