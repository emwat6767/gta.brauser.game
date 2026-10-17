//# sourceURL=ufc/body.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V2 = THREE.Vector2, V3 = THREE.Vector3;

// ---------------------------------------------------------------------------
// Procedural athletic body. Every limb is a lathe-turned muscle profile
// hung on a real joint hierarchy, so IK and ragdoll drive the same skeleton
// the player sees. Appearance is parametric (cfg.body, cfg.look) so the
// fighter creator, generated league fighters and the real roster all use it.
// ---------------------------------------------------------------------------

// Profile along -Y: radius rFn(t) for t in [0,1], rounded caps.
function limbGeo(len, rFn, capTop = true, capBottom = true, radial = 18, seg = 16) {
  const pts = [];
  const r0 = rFn(0), r1 = rFn(1);
  if (capTop) for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new V2(Math.max(0.0001, Math.sin(a) * r0), Math.cos(a) * r0 * 0.7)); }
  else pts.push(new V2(r0, 0));
  for (let i = 1; i < seg; i++) { const t = i / seg; pts.push(new V2(rFn(t), -t * len)); }
  if (capBottom) for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new V2(Math.max(0.0001, Math.cos(a) * r1), -len - Math.sin(a) * r1 * 0.7)); }
  else pts.push(new V2(r1, -len));
  pts.reverse(); // lathe wants bottom -> top for outward normals
  const g = new THREE.LatheGeometry(pts, radial);
  g.computeVertexNormals();
  return g;
}

// Profile along +Y from y0 to y1 with radius rFn(t).
function trunkGeo(y0, y1, rFn, capBottom, capTop, radial = 26, seg = 18) {
  const pts = [];
  const r0 = rFn(0), r1 = rFn(1), len = y1 - y0;
  if (capBottom) for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new V2(Math.max(0.0001, Math.sin(a) * r0), y0 - Math.cos(a) * r0 * 0.5)); }
  else pts.push(new V2(r0, y0));
  for (let i = 1; i < seg; i++) { const t = i / seg; pts.push(new V2(rFn(t), y0 + t * len)); }
  if (capTop) for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new V2(Math.max(0.0001, Math.cos(a) * r1), y1 + Math.sin(a) * r1 * 0.5)); }
  else pts.push(new V2(r1, y1));
  const g = new THREE.LatheGeometry(pts, radial);
  g.computeVertexNormals();
  return g;
}

const bump = (t, c, w) => { const x = (t - c) / w; return Math.abs(x) >= 1 ? 0 : Math.cos(x * Math.PI / 2) ** 2; };

function sphere(r, mat, sx = 1, sy = 1, sz = 1, ws = 20, hs = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  m.scale.set(sx, sy, sz);
  return m;
}

function setSRGB(tex) { if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding; return tex; }

function skinCanvas(baseHex, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, size, size);
  const n = Math.round(2600 * (size / 256) * (size / 256));
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = Math.random() * 1.6 + 0.3;
    const d = (Math.random() - 0.5) * 0.09;
    const col = base.clone().offsetHSL(0, 0, d);
    g.fillStyle = 'rgba(' + (col.r * 255 | 0) + ',' + (col.g * 255 | 0) + ',' + (col.b * 255 | 0) + ',0.55)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function skinTexture(baseHex) {
  const tex = new THREE.CanvasTexture(skinCanvas(baseHex));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return setSRGB(tex);
}

// Baked muscle shading. Geometry alone reads well on a monitor, but on a phone
// (small screen, flat mobile lighting) the relief disappears, so the grooves
// between muscles are painted into the part's own UV space. Strength follows
// the fighter's muscularity: a lean fighter still looks trained, never a
// bodybuilder.
function paintMuscles(g, S, part, musc) {
  const k = M.clamp(0.55 + musc * 0.75, 0.45, 1.25);
  const blur = (px) => { try { g.filter = 'blur(' + (px * 1.35).toFixed(1) + 'px)'; } catch (e) { /* older canvas */ } };
  const noBlur = () => { try { g.filter = 'none'; } catch (e) { /* ignore */ } };
  // groove: soft dark line from (u0,v0) to (u1,v1), UV in 0..1, v up
  const groove = (u0, v0, u1, v1, w, a) => {
    blur(w * S * 0.5);
    g.strokeStyle = 'rgba(28,14,6,' + (a * k).toFixed(3) + ')';
    g.lineWidth = Math.max(1.5, w * S);
    g.lineCap = 'round';
    for (const wrap of [-S, 0, S]) {
      g.beginPath();
      g.moveTo(u0 * S + wrap, (1 - v0) * S);
      g.lineTo(u1 * S + wrap, (1 - v1) * S);
      g.stroke();
    }
    noBlur();
  };
  const curve = (u0, v0, uc, vc, u1, v1, w, a) => {
    blur(w * S * 0.5);
    g.strokeStyle = 'rgba(28,14,6,' + (a * k).toFixed(3) + ')';
    g.lineWidth = Math.max(1.5, w * S); g.lineCap = 'round';
    for (const wrap of [-S, 0, S]) {
      g.beginPath();
      g.moveTo(u0 * S + wrap, (1 - v0) * S);
      g.quadraticCurveTo(uc * S + wrap, (1 - vc) * S, u1 * S + wrap, (1 - v1) * S);
      g.stroke();
    }
    noBlur();
  };
  // belly: soft highlight blob on the muscle itself
  const belly = (u, v, ru, rv, a) => {
    for (const wrap of [-S, 0, S]) {
      const grd = g.createRadialGradient((u * S) + wrap, (1 - v) * S, 0, (u * S) + wrap, (1 - v) * S, Math.max(ru, rv) * S);
      grd.addColorStop(0, 'rgba(255,238,215,' + (a * k).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(255,238,215,0)');
      g.save(); g.translate((u * S) + wrap, (1 - v) * S); g.scale(1, rv / ru); g.translate(-((u * S) + wrap), -((1 - v) * S));
      g.fillStyle = grd; g.fillRect(0, 0, S, S); g.restore();
    }
  };

  if (part === 'torso') {
    // front: u 0.25 is the chest centre
    groove(0.25, 0.46, 0.25, 0.74, 0.016, 0.30);                 // sternum
    curve(0.155, 0.63, 0.25, 0.545, 0.345, 0.63, 0.022, 0.34);   // lower pec line
    belly(0.20, 0.70, 0.075, 0.065, 0.12); belly(0.30, 0.70, 0.075, 0.065, 0.12);
    groove(0.25, 0.12, 0.25, 0.50, 0.013, 0.22);                 // linea alba
    // abs: short, slightly curved rows, softer than a drawn line
    for (const v of [0.215, 0.315, 0.415]) curve(0.212, v + 0.012, 0.25, v - 0.012, 0.288, v + 0.012, 0.017, 0.20);
    curve(0.155, 0.46, 0.185, 0.28, 0.225, 0.13, 0.020, 0.22);   // obliques
    curve(0.345, 0.46, 0.315, 0.28, 0.275, 0.13, 0.020, 0.22);
    for (let i = 0; i < 3; i++) {                                 // serratus
      groove(0.135 - i * 0.004, 0.52 - i * 0.05, 0.175, 0.47 - i * 0.05, 0.012, 0.18);
      groove(0.365 + i * 0.004, 0.52 - i * 0.05, 0.325, 0.47 - i * 0.05, 0.012, 0.18);
    }
    groove(0.115, 0.80, 0.20, 0.86, 0.020, 0.20);                // collarbones
    groove(0.385, 0.80, 0.30, 0.86, 0.020, 0.20);
    // back: u 0.75 is the spine
    groove(0.75, 0.12, 0.75, 0.86, 0.016, 0.32);
    curve(0.64, 0.72, 0.68, 0.45, 0.72, 0.18, 0.024, 0.26);      // lats
    curve(0.86, 0.72, 0.82, 0.45, 0.78, 0.18, 0.024, 0.26);
    curve(0.63, 0.88, 0.70, 0.80, 0.745, 0.78, 0.022, 0.24);     // traps
    curve(0.87, 0.88, 0.80, 0.80, 0.755, 0.78, 0.022, 0.24);
    belly(0.67, 0.83, 0.06, 0.05, 0.10); belly(0.83, 0.83, 0.06, 0.05, 0.10);
  } else if (part === 'arm') {
    // biceps / triceps split runs along the limb on both sides
    groove(0.0, 0.05, 0.0, 0.95, 0.03, 0.22);
    groove(0.5, 0.05, 0.5, 0.95, 0.03, 0.22);
    belly(0.25, 0.55, 0.12, 0.28, 0.13);   // biceps belly
    belly(0.75, 0.58, 0.12, 0.26, 0.10);   // triceps belly
    groove(0.60, 0.30, 0.90, 0.30, 0.022, 0.16); // triceps horseshoe
  } else if (part === 'forearm') {
    groove(0.0, 0.05, 0.06, 0.95, 0.026, 0.16);
    groove(0.5, 0.05, 0.44, 0.95, 0.026, 0.16);
    belly(0.25, 0.68, 0.1, 0.22, 0.10);
  } else if (part === 'thigh') {
    groove(0.12, 0.05, 0.16, 0.95, 0.03, 0.22);   // vastus lateralis edge
    groove(0.38, 0.05, 0.34, 0.95, 0.03, 0.20);   // rectus / vastus medialis
    groove(0.75, 0.05, 0.75, 0.95, 0.03, 0.18);   // hamstring split
    belly(0.25, 0.55, 0.11, 0.3, 0.12);
    belly(0.45, 0.25, 0.08, 0.16, 0.09);          // teardrop above the knee
  } else if (part === 'calf') {
    groove(0.25, 0.1, 0.25, 0.9, 0.028, 0.18);
    belly(0.12, 0.62, 0.1, 0.22, 0.11); belly(0.38, 0.6, 0.1, 0.2, 0.11);
  }
}

// Part texture: skin noise + baked muscle shading + any tattoos on that part.
function muscleSkinTexture(baseHex, part, musc, items, aspect = 1) {
  const S = 512;
  const c = skinCanvas(baseHex, S);
  const g = c.getContext('2d');
  paintMuscles(g, S, part, musc);
  const tattooed = !!(items && items.length);
  if (tattooed) {
    for (const t of items) {
      const px = t.u * S, py = (1 - t.v) * S, size = t.size * S;
      for (const wrap of [-S, 0, S]) {
        g.save();
        g.translate(px + wrap, py);
        g.scale(1, aspect);
        UFC.art.drawTattoo(g, t, 0, 0, size, t.seed);
        g.restore();
      }
    }
  }
  // clean copy: fight damage is painted over it and can be reset
  const base = document.createElement('canvas'); base.width = base.height = S;
  base.getContext('2d').drawImage(c, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.base = base;
  void tattooed;
  return setSRGB(tex);
}

// Skin texture with tattoos painted in UV space: [{design, u, v, size(0..1 of width), ink, seed}]
function tattooedSkinTexture(baseHex, items, aspect = 1) {
  const S = 512;
  const c = skinCanvas(baseHex, S);
  const g = c.getContext('2d');
  for (const t of items) {
    const px = t.u * S, py = (1 - t.v) * S, size = t.size * S;
    for (const wrap of [-S, 0, S]) {
      g.save();
      g.translate(px + wrap, py);
      g.scale(1, aspect);
      UFC.art.drawTattoo(g, t, 0, 0, size, t.seed);
      g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return setSRGB(tex);
}

// Alpha texture of fine hair strands, drawn along the V axis of the head UVs.
function strandTexture(hex, count, len, seed) {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const col = new THREE.Color(hex);
  let s = (seed || 3) * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd() * S, y = rnd() * S;
    const l = (0.03 + rnd() * 0.07) * S * len;
    const drift = (rnd() - 0.5) * 0.35;
    const shade = 0.72 + rnd() * 0.5;
    g.strokeStyle = 'rgba(' + Math.round(col.r * 255 * shade) + ',' + Math.round(col.g * 255 * shade) + ',' + Math.round(col.b * 255 * shade) + ',' + (0.55 + rnd() * 0.45).toFixed(2) + ')';
    g.lineWidth = 0.8 + rnd() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + drift * l * 0.5, y + l * 0.5, x + drift * l, y + l);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return setSRGB(tex);
}

function canvasTex(w, h, paint, wrap) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c);
  const tex = new THREE.CanvasTexture(c);
  if (wrap) tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return setSRGB(tex);
}

// ---------------------------------------------------------------------------
// Normalised appearance. Old roster looks (tattoo: number, beard: bool, no
// face block) map onto the full model, so every existing fighter still works.
// ---------------------------------------------------------------------------
const DESIGN_IDS = ['tribal', 'script', 'rose', 'geometric', 'lion', 'eagle', 'dragon', 'stars'];
function normLook(look) {
  const L = Object.assign({ skin: 0xd6a57c, hair: 0x19110b, hairStyle: 'buzz', hairLen: 0.5, beard: 'none', shorts: 0x111113, shortsTrim: 0xd8b24a, shortsStyle: 'classic', motif: null, gloves: 0x121212, eye: 0x2a1b10 }, look || {});
  L.beard = L.beard === true ? 'full' : !L.beard ? 'none' : L.beard;
  L.face = Object.assign({ shape: 0.5, jaw: 0.5, nose: 0.5, eyes: 0.5, brows: 0.5, cheeks: 0.5 }, (look && look.face) || {});
  if (!Array.isArray(L.tattoos)) {
    L.tattoos = [];
    if (look && look.tattoo) {
      const n = look.tattoo | 0;
      L.tattoos.push({ design: DESIGN_IDS[n % 8], place: 'armL', size: 1, ink: 0.95 });
      L.tattoos.push({ design: DESIGN_IDS[(n + 3) % 8], place: n % 2 ? 'chest' : 'armR', size: 0.95, ink: 0.92 });
    }
  }
  return L;
}
// body types: girth of torso / limbs, muscle, shoulders, belly
const BODY_TYPES = {
  skinny: { musc: 0.3, gT: 0.92, gL: 0.88, sh: -0.05, adj: -0.1, belly: 0 },
  lean: { musc: 0.45, gT: 0.96, gL: 0.93, sh: -0.02, adj: -0.05, belly: 0 },
  athletic: { musc: null, gT: 1, gL: 1, sh: 0, adj: 0, belly: 0 },
  muscular: { musc: 0.8, gT: 1.04, gL: 1.1, sh: 0.045, adj: 0.03, belly: 0 },
  stocky: { musc: 0.65, gT: 1.08, gL: 1.05, sh: 0.02, adj: 0.06, belly: 0.04 },
  heavy: { musc: 0.45, gT: 1.14, gL: 1.08, sh: 0.025, adj: 0.14, belly: 0.3 },
};
UFC.BODY_TYPES = BODY_TYPES;
// everybody who was not built by hand gets a body from their name: no more cloned athletes
function derivedType(cfg) {
  const k = String(cfg.id || cfg.name || 'x'); let h = 2166136261;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u = ((h >>> 0) % 1000) / 1000, heavyW = (cfg.weight || 70) >= 84;
  const tbl = heavyW ? [['stocky', 0.28], ['heavy', 0.3], ['muscular', 0.3], ['athletic', 0.12]] : [['lean', 0.2], ['athletic', 0.4], ['muscular', 0.25], ['stocky', 0.15]];
  let a = 0; for (const [n, w] of tbl) { a += w; if (u < a) return n; } return 'athletic';
}
function normBody(cfg) {
  const given = cfg.body || {}, type = given.type && BODY_TYPES[given.type] ? given.type : derivedType(cfg), T = BODY_TYPES[type];
  const muscle = given.muscle != null ? given.muscle : (T.musc != null ? T.musc : (cfg.build == null ? 0.5 : 0.5 + (cfg.build - 0.5) * 0.6));
  return Object.assign({ arms: 0.5, shoulders: 0.5, legs: 0.5 }, given, { type, muscle });
}
UFC.normLook = normLook;
UFC.normBody = normBody;

// ---------------------------------------------------------------------------
// Sculpted head: one continuous surface displaced from a sphere (brow, eye
// sockets, nose, cheekbones, lips, jaw, chin) instead of stacked blobs.
// Unit-sphere coords: +Y up, +Z face forward. F = face parameters 0..1.
// ---------------------------------------------------------------------------
function sculpt(x, y, z, bulk, F) {
  const g = (dx, dy, w) => Math.exp(-(dx * dx + dy * dy) / (w * w));
  let X = x * 0.7 * (0.93 + F.shape * 0.14), Y = y * (1.03 - F.shape * 0.06), Z = z * 0.84;
  if (z < 0) Z *= 1.1;
  const low = M.smooth((-y - 0.05) / 0.95);
  X *= M.lerp(1, 0.73 + bulk * 0.12 + (F.jaw - 0.5) * 0.22, low);
  const front = M.smooth((z - 0.25) / 0.55);
  if (Z > 0.7) Z = 0.7 + (Z - 0.7) * 0.55;
  Z += front * low * 0.06;
  if (y > 0.35) Y += (y - 0.35) * 0.08;
  if (z > 0) {
    const fx = x, fy = y;
    // brow ridge
    Z += 0.05 * (0.6 + F.brows * 0.8) * Math.exp(-((fy - 0.2) ** 2) / 0.007) * Math.exp(-(fx * fx) / 0.28) * front;
    // eye sockets: deep enough to shade, shallow enough that the eyes show
    Z -= 0.066 * (0.8 + F.eyes * 0.4) * (g(fx - 0.3, (fy - 0.05) * 1.35, 0.15) + g(fx + 0.3, (fy - 0.05) * 1.35, 0.15)) * front;
    // nose: a straight bridge, a rounded tip and the wings of the nostrils
    const nt = M.sat((0.12 - fy) / 0.44);
    if (fy < 0.14 && fy > -0.4) {
      const fade = fy < -0.3 ? M.sat((fy + 0.4) / 0.1) : 1;
      Z += Math.exp(-(fx * fx) / ((0.007 + nt * 0.012) * (0.75 + F.nose * 0.5))) * (0.028 + nt * 0.1) * (0.7 + F.nose * 0.6) * fade * front;
    }
    Z += 0.036 * (0.8 + F.nose * 0.4) * g(fx * 1.05, fy + 0.3, 0.08) * front;
    Z += 0.022 * (g(fx - 0.1, fy + 0.32, 0.06) + g(fx + 0.1, fy + 0.32, 0.06)) * front;
    // the upper lip area comes forward to meet the nose: no dark cavity under it
    Z += 0.03 * g(fx / 1.8, fy + 0.41, 0.07) * front;
    Z -= 0.006 * g(fx / 0.6, fy + 0.43, 0.035) * front;                  // philtrum
    // cheekbones and the hollow under them
    Z += 0.045 * (0.5 + F.cheeks) * (g(fx - 0.4, fy + 0.04, 0.16) + g(fx + 0.4, fy + 0.04, 0.16)) * front;
    Z -= 0.014 * (g(fx - 0.42, fy + 0.34, 0.13) + g(fx + 0.42, fy + 0.34, 0.13)) * front;
    // lips: wide, closed, a little full
    Z += 0.026 * g(fx / 4.0, fy + 0.5, 0.042) * front;
    Z += 0.03 * g(fx / 3.4, fy + 0.585, 0.048) * front;
    Z -= 0.008 * g(fx / 4.2, fy + 0.545, 0.011) * front;
    // chin
    Z += 0.062 * (0.7 + F.jaw * 0.6) * g(fx * 0.95, fy + 0.82, 0.15) * front;
  }
  X += Math.sign(x) * 0.035 * (0.5 + F.cheeks) * g(Math.abs(x) - 0.55, y + 0.1, 0.25) * (z > 0 ? 1 : 0.4);
  if (y < -0.78) Z *= M.lerp(1, 0.72, (-y - 0.78) / 0.22);
  return [X, Y, Z];
}

// Eyebrow: a ribbon following the brow ridge, thick at the inner end.
function browGeo(head, sx, k) {
  const N = 12, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ux = sx * (0.09 + t * 0.37);
    const uy = 0.21 + Math.sin(t * Math.PI * 0.9) * 0.035 - t * 0.03;
    const th = (0.074 - t * 0.042) * k;
    const top = head.point(ux, uy + th * 0.55).multiplyScalar(1.014);
    const bot = head.point(ux, uy - th * 0.45).multiplyScalar(1.014);
    pos.push(top.x, top.y, top.z, bot.x, bot.y, bot.z);
    uv.push(t, 1, t, 0);
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
let _browTex = null;
function browTexture() {
  if (_browTex) return _browTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  let r = 7; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 256, t = x / 256;
    const y = 10 + rnd() * 44;
    // inner hairs point up, outer hairs sweep outwards
    const ang = -Math.PI / 2 + t * 1.25 + (rnd() - 0.5) * 0.4;
    const len = 9 + rnd() * 10;
    g.strokeStyle = 'rgba(255,255,255,' + (0.55 + rnd() * 0.45).toFixed(2) + ')';
    g.lineWidth = 1.4 + rnd();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  }
  _browTex = new THREE.CanvasTexture(c);
  return _browTex;
}
// Hair colour with combed streaks and darker roots, for the hair shell itself.
function hairTexture(hex) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const base = new THREE.Color(hex);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, S, S);
  let r = 11; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * S, y = rnd() * S, len = 12 + rnd() * 40;
    const col = base.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.14);
    g.strokeStyle = 'rgba(' + (col.r * 255 | 0) + ',' + (col.g * 255 | 0) + ',' + (col.b * 255 | 0) + ',0.7)';
    g.lineWidth = 0.8 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y + len); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 3);
  return setSRGB(tex);
}

// Per-vertex alpha that goes to zero at a mesh's border: soft beard and hairlines.
function fadeEdges(geo, unit, fn) {
  const n = unit.length / 3, col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
    col[i * 4 + 3] = M.smooth(fn(unit[i * 3], unit[i * 3 + 1], unit[i * 3 + 2]));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.userData.fade = true;
}

function buildHead(HR, bulk, look) {
  const F = look.face;
  const base = new THREE.SphereGeometry(1, 96, 72);
  const unit = base.attributes.position.array.slice();
  const make = (offsetFn, keepFn) => {
    const geo = base.clone();
    const pos = geo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = unit[i], y = unit[i + 1], z = unit[i + 2];
      const [X, Y, Z] = sculpt(x, y, z, bulk, F);
      const off = offsetFn ? offsetFn(x, y, z) : 0;
      pos[i] = X * HR * (1 + off); pos[i + 1] = Y * HR * (1 + off); pos[i + 2] = Z * HR * (1 + off);
    }
    if (keepFn) {
      const idx = geo.index.array, keep = [];
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        if (keepFn(unit[a], unit[a + 1], unit[a + 2]) && keepFn(unit[b], unit[b + 1], unit[b + 2]) && keepFn(unit[c], unit[c + 1], unit[c + 2])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      geo.setIndex(keep);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const out = { skin: make(null, null), unit };
  const beard = look.beard;
  // Natural beard line: just under the nose in the middle, rising along the
  // cheeks to the sideburns.
  const beardTop = (x) => M.lerp(-0.43, -0.02, M.smooth((Math.abs(x) - 0.2) / 0.45)) - (beard === 'short' ? 0.06 : 0);
  {
    const g2 = (dx, dy, w) => Math.exp(-(dx * dx + dy * dy) / (w * w));
    const n = unit.length / 3, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = unit[i * 3], y = unit[i * 3 + 1], z = unit[i * 3 + 2];
      let r = 1, gg = 1, b = 1;
      if (z > 0.4) {
        const lip = Math.max(g2(x / 4.0, y + 0.5, 0.04), g2(x / 3.4, y + 0.585, 0.046));
        r -= lip * 0.06; gg -= lip * 0.34; b -= lip * 0.28;
        const sock = g2(x - 0.3, (y - 0.05) * 1.3, 0.2) + g2(x + 0.3, (y - 0.05) * 1.3, 0.2);
        r -= sock * 0.12; gg -= sock * 0.15; b -= sock * 0.12;
        // eyelid crease above each eye
        const lid = g2(x - 0.3, (y - 0.13) * 3.2, 0.13) + g2(x + 0.3, (y - 0.13) * 3.2, 0.13);
        r -= lid * 0.12; gg -= lid * 0.14; b -= lid * 0.12;
        // mouth line (hidden under the moustache of a full beard)
        const crease = (beard === 'full' || beard === 'short' || beard === 'thick') ? 0 : g2(x / 4.2, y + 0.545, 0.01);
        r -= crease * 0.28; gg -= crease * 0.34; b -= crease * 0.32;
        // nostrils
        const nos = g2((x - 0.085) * 1.3, (y + 0.37) * 2.2, 0.024) + g2((x + 0.085) * 1.3, (y + 0.37) * 2.2, 0.024);
        r -= nos * 0.32; gg -= nos * 0.34; b -= nos * 0.3;
        // the underside of the nose catches some bounce light instead of going black
        const under = g2(x * 1.4, (y + 0.36) * 2.4, 0.09);
        r += under * 0.06; gg += under * 0.05; b += under * 0.04;
        // warm tip of the nose and cheeks
        const warm = g2(x * 1.1, y + 0.28, 0.1) * 0.7 + (g2(x - 0.42, y + 0.1, 0.18) + g2(x + 0.42, y + 0.1, 0.18)) * 0.5;
        gg -= warm * 0.06; b -= warm * 0.07;
      }
      if (beard !== 'none' && z > -0.3 && y < beardTop(x)) {
        let s = M.smooth((beardTop(x) - y) / 0.14) * (beard === 'stubble' ? 0.3 : 0.22);
        if (beard === 'goatee') s *= M.sat((0.4 - Math.abs(x)) / 0.12) * M.sat((-y - 0.38) / 0.1);
        // never shade the lips themselves: they show through the opening in the beard
        s *= 1 - Math.min(1, Math.max(g2(x / 3.4, y + 0.585, 0.07), g2(x / 4.0, y + 0.535, 0.05), g2(x / 1.3, y + 0.45, 0.06)) * 1.3);
        r -= s; gg -= s; b -= s * 0.9;
      }
      col[i * 3] = Math.max(0, r); col[i * 3 + 1] = Math.max(0, gg); col[i * 3 + 2] = Math.max(0, b);
    }
    out.skin.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const style = look.hairStyle || 'buzz';
  const len = 0.6 + M.clamp(look.hairLen == null ? 0.5 : look.hairLen, 0, 1) * 0.8;   // 1.0 at the default length
  const long = style === 'long';
  const hairT = (z) => (z > 0.25 ? 0.46 : z > -0.25 ? M.lerp(long ? -0.35 : 0.02, 0.46, (z + 0.25) / 0.5) : long ? -0.8 : -0.38);
  const hairline = (x, y, z) => {
    if (!long && Math.abs(x) > 0.72 && y < 0.3 && z > -0.45) return false; // around the ears
    return y > hairT(z);
  };
  // The hair shell sinks under the scalp towards its edge, so the triangle
  // cut-out never shows as a jagged step: the visible border is where the
  // two smooth surfaces cross.
  const hairEdge = (x, y, z) => {
    let e = M.sat((y - hairT(z) - 0.07) / 0.14);
    if (!long && y < 0.4 && z > -0.45) e = Math.min(e, M.sat((0.72 - Math.abs(x) - 0.06) / 0.1 + M.sat((y - 0.36) / 0.1)));
    return e;
  };
  const hairMake = (fn) => make((x, y, z) => { const e = hairEdge(x, y, z); return fn(x, y, z) * e - (1 - e) * 0.012; }, hairline);
  // the same shell, pushed out a little: carries the strand alpha texture
  const hairShellMake = (fn, k) => make((x, y, z) => { const e = hairEdge(x, y, z); return (fn(x, y, z) * (1 + k) + k * 0.012) * e - (1 - e) * 0.012; }, hairline);
  let hairFn = null;
  const top = (y) => M.sat((y - 0.42) / 0.3);
  if (style === 'bald') out.hair = null;
  else if (style === 'buzz') hairFn = () => 0.012 * Math.min(len, 1.3);
  else if (style === 'fade') hairFn = (x, y, z) => 0.006 + top(y) * (0.05 + M.sat(z) * 0.02) * len;
  else if (style === 'curly') hairFn = (x, y, z) => (0.05 + Math.max(0, y) * 0.08) * len + 0.016 * Math.sin(x * 37 + z * 11) * Math.sin(y * 41 + z * 23);
  else if (style === 'slick') hairFn = (x, y, z) => 0.016 + M.sat((y - 0.3) / 0.35) * (0.045 + M.sat(z + 0.1) * 0.075) * len;
  else if (style === 'long') hairFn = (x, y, z) => (0.045 + Math.max(0, y) * 0.05 + (z < 0 ? M.sat(-z) * 0.07 : 0) + (Math.abs(x) > 0.6 && y < 0.2 ? 0.03 : 0)) * len;
  else if (style === 'short' || style === 'bun') hairFn = (x, y) => (0.035 + Math.max(0, y) * 0.05) * len;
  else if (style === 'mohawk') {
    out.hair = make((x, y) => 0.01 + Math.max(0, 0.16 - Math.abs(x)) * Math.max(0, y) * 0.9 * len, (x, y, z) => hairline(x, y, z) && (Math.abs(x) < 0.16 || y < 0.4));
    out.hairShell = make((x, y) => (0.01 + Math.max(0, 0.16 - Math.abs(x)) * Math.max(0, y) * 0.9 * len) * 1.35 + 0.006, (x, y, z) => hairline(x, y, z) && (Math.abs(x) < 0.16 || y < 0.4));
  }
  if (hairFn) {
    out.hair = hairMake(hairFn); out.hairShell = hairShellMake(hairFn, style === 'buzz' ? 0.35 : 0.2);
    fadeEdges(out.hair, unit, (x, y, z) => M.sat((y - hairT(z)) / 0.1));
  }
  // full beards: the moustache covers the upper lip, only the lower lip shows
  const fullBeard = beard === 'full' || beard === 'short' || beard === 'thick';
  const lipTop = fullBeard ? -0.555 : -0.52, lipHalf = fullBeard ? 0.26 : 0.32;
  const lipsClear = (x, y, z) => !(Math.abs(x) < lipHalf && y > -0.66 && y < lipTop && z > 0.5);
  // 0 at the lip opening's border, 1 a little away from it
  const lipEdge = (x, y, z) => (z < 0.4 ? 1 : M.sat(-Math.min((lipHalf - Math.abs(x)) / 0.08, (y + 0.66) / 0.06, (lipTop - y) / 0.05) * 1.2 - 0.3));
  if (beard === 'full' || beard === 'short' || beard === 'thick') {
    const off = beard === 'short' ? (x, y) => 0.016 + Math.max(0, -y - 0.6) * 0.03
      : beard === 'thick' ? (x, y) => 0.042 + Math.max(0, -y - 0.45) * 0.14
      : (x, y) => 0.028 + Math.max(0, -y - 0.5) * 0.06;
    const beardKeep = (x, y, z) => {
      if (y > beardTop(x) || z < -0.3) return false;
      return lipsClear(x, y, z);
    };
    const beardOff = (k) => (x, y, z) => {
      const e = Math.min(M.sat((beardTop(x) - y - 0.07) / 0.12), lipEdge(x, y, z), M.sat((z + 0.3 - 0.07) / 0.15));
      return off(x, y) * (1 + k) * e - (1 - e) * 0.012;
    };
    out.beard = make(beardOff(0), beardKeep);
    out.beardShell = make(beardOff(0.28), beardKeep);
    fadeEdges(out.beard, unit, (x, y, z) => Math.min(M.sat((beardTop(x) - y) / 0.12), lipEdge(x, y, z), M.sat((z + 0.3) / 0.15)));
  } else if (beard === 'goatee') {
    // moustache + chin
    out.beard = make((x, y) => 0.024 + Math.max(0, -y - 0.7) * 0.05, (x, y, z) => {
      if (z < 0.35 || y > -0.38) return false;
      if (Math.abs(x) > (y > -0.56 ? 0.34 : 0.28)) return false;
      return lipsClear(x, y, z);
    });
    fadeEdges(out.beard, unit, (x, y, z) => Math.min(M.sat((-0.38 - y) / 0.06), M.sat(((y > -0.56 ? 0.34 : 0.28) - Math.abs(x)) / 0.08), lipEdge(x, y, z), M.sat((z - 0.35) / 0.12)));
  }
  out.point = (ux, uy) => {
    const uz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
    const [X, Y, Z] = sculpt(ux, uy, uz, bulk, F);
    return new V3(X * HR, Y * HR, Z * HR);
  };
  return out;
}


// Chest-space torso surface. Cross-section is an ellipse whose half-width
// and half-depth follow the athletic silhouette; pecs and shoulder blades are
// displaced into the same mesh. UVs: u around (0.25 = chest, 0.75 = back),
// v bottom -> top, so tattoos can be painted on it.
function torsoGeo(H, dims, waistR, musc, bulk, shoulders) {
  const y0 = -dims.chestLen * 0.72, y1 = dims.neckLen + 0.006 * H;
  const RAD = 40, SEG = 30;
  const pos = [], uv = [], idx = [];
  const g = (dx, dy, s) => Math.exp(-(dx * dx + dy * dy) / (s * s));
  const shK = 0.95 + shoulders * 0.1;
  const halfW = (t) => {
    const w0 = waistR * 1.12, lat = (0.112 + musc * 0.008 + bulk * 0.012) * H * shK, sh = (0.104 + bulk * 0.01) * H * shK, neck = 0.046 * H;
    if (t < 0.7) return M.lerp(w0, lat, M.smooth(t / 0.7));
    if (t < 0.9) return M.lerp(lat, sh, M.smooth((t - 0.7) / 0.2));
    return M.lerp(sh, neck, M.smooth((t - 0.9) / 0.1));
  };
  const halfD = (t) => {
    const d0 = waistR * 0.86, ch = (0.064 + bulk * 0.01) * H, top = 0.05 * H, neck = 0.038 * H;
    if (t < 0.62) return M.lerp(d0, ch, M.smooth(t / 0.62));
    if (t < 0.9) return M.lerp(ch, top, M.smooth((t - 0.62) / 0.28));
    return M.lerp(top, neck, M.smooth((t - 0.9) / 0.1));
  };
  const pec = (0.011 + musc * 0.009) * H;
  for (let j = 0; j <= SEG; j++) {
    const t = j / SEG, y = M.lerp(y0, y1, t);
    const W = halfW(t), D = halfD(t);
    for (let i = 0; i <= RAD; i++) {
      const a = (i / RAD) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      let x = c * W, z = s * D;
      if (s > 0) {
        // pectorals: rounded plates with a defined lower edge
        const ax = Math.abs(x);
        const p = g(ax - 0.048 * H, (y - 0.07 * H) * (y < 0.07 * H ? 1.6 : 1), 0.042 * H);
        z += pec * p * s;
      } else {
        // shoulder blades / upper back
        const ax = Math.abs(x);
        z -= 0.006 * H * g(ax - 0.05 * H, y - 0.075 * H, 0.04 * H) * -s;
      }
      // rounded shoulder line: pull the top corners down/in a little
      if (t > 0.85) { const k = M.smooth((t - 0.85) / 0.15); x *= 1 - 0.06 * k * Math.abs(c); }
      pos.push(x, y, z);
      uv.push(i / RAD, t);
    }
  }
  for (let j = 0; j < SEG; j++) for (let i = 0; i < RAD; i++) {
    const a = j * (RAD + 1) + i, b = a + RAD + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // close the top around the neck
  const topI = pos.length / 3;
  pos.push(0, y1 + 0.004 * H, 0); uv.push(0.5, 1);
  const ring = SEG * (RAD + 1);
  for (let i = 0; i < RAD; i++) idx.push(ring + i, topI, ring + i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function stdMat(color, rough, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra || {}));
}

function makeBone(name, parent, x, y, z) {
  const b = new THREE.Object3D();
  b.name = name; b.position.set(x, y, z); b.rotation.order = 'YXZ';
  if (parent) parent.add(b);
  return b;
}

function shadowAll(obj) { obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }

// Where each tattoo placement lands in the UV space of its mesh.
const TATTOO_UV = {
  armL: { part: 'uaL', u: 0.25, v: 0.56, k: 0.34 }, armR: { part: 'uaR', u: 0.75, v: 0.56, k: 0.34, flip: true },
  forearmL: { part: 'faL', u: 0.2, v: 0.5, k: 0.3 }, forearmR: { part: 'faR', u: 0.8, v: 0.5, k: 0.3, flip: true },
  chest: { part: 'torso', u: 0.25, v: 0.64, k: 0.13, aspect: 2.5 }, back: { part: 'torso', u: 0.75, v: 0.58, k: 0.15, aspect: 2.5 },
};

// cfg.look: see normLook; cfg.body: see normBody
UFC.buildBody = function buildBody(cfg) {
  const h = cfg.height;
  const look = normLook(cfg.look);
  const bodyP = normBody(cfg);
  const ref = look.outfit === 'referee';
  const musc = M.clamp(bodyP.muscle, 0, 1);                                   // definition / muscle size
  const T = BODY_TYPES[bodyP.type] || BODY_TYPES.athletic;
  const typeAdj = T.adj;
  const bulk = M.clamp((cfg.weight / h / h - 21.5) / 9 + typeAdj, 0, 1);      // BMI driven girth
  const armS = (cfg.reach || h) / h;

  const skinTex = skinTexture(look.skin);
  const physSkin = (map) => { const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map, roughness: 0.52, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.4 }); m.userData.baseRough = 0.52; return m; };
  const skin = physSkin(skinTex);
  const skinDark = stdMat(new THREE.Color(look.skin).offsetHSL(0, 0.02, -0.08), 0.55);
  // tattoos: one textured material per body part that carries ink
  const tatByPart = {};
  (look.tattoos || []).forEach((t, i) => {
    const P = TATTOO_UV[t.place]; if (!P) return;
    (tatByPart[P.part] = tatByPart[P.part] || []).push({ design: t.design, u: P.u, v: P.v, size: P.k * (t.size == null ? 0.85 : t.size), ink: t.ink, flip: P.flip, seed: 11 + i * 7 + (t.design || '').length, aspect: P.aspect || 1 });
  });
  const partSkin = {};
  // torso, arms and legs carry baked muscle shading so the relief survives a
  // phone screen; everything else keeps the cheap tiled skin
  const MUSCLE_PART = { torso: 'torso', uaL: 'arm', uaR: 'arm', faL: 'forearm', faR: 'forearm', thighL: 'thigh', thighR: 'thigh', calfL: 'calf', calfR: 'calf' };
  const skinFor = (part) => {
    const mp = MUSCLE_PART[part];
    if (!tatByPart[part] && !mp) return skin;
    if (!partSkin[part]) partSkin[part] = physSkin(mp
      ? muscleSkinTexture(look.skin, mp, musc, tatByPart[part], (tatByPart[part] && tatByPart[part][0].aspect) || 1)
      : tattooedSkinTexture(look.skin, tatByPart[part], tatByPart[part][0].aspect || 1));
    return partSkin[part];
  };
  const hairMat = stdMat(0xffffff, 0.9, { map: hairTexture(new THREE.Color(look.hair).multiplyScalar(0.62).getHex()) });
  // clothing
  const shirtMat = ref ? stdMat(look.shirt || 0x07080b, 0.95) : null;
  const pantsMat = ref ? stdMat(look.pants || 0x0b0c10, 0.9) : null;
  const shoeMat = ref ? stdMat(0x0b0b0c, 0.5) : null;
  let shortsMat, sleeveMatL, sleeveMatR, bandMat, trimMat;
  if (ref) {
    shortsMat = sleeveMatL = sleeveMatR = pantsMat; bandMat = trimMat = stdMat(0x0b0b0c, 0.6);
  } else {
    const fabric = (tex) => stdMat(0xffffff, 0.78, { map: tex, side: THREE.DoubleSide });
    shortsMat = fabric(canvasTex(512, 256, (c) => UFC.art.paintShorts(c, look, 'pelvis'), true));
    sleeveMatL = fabric(canvasTex(512, 384, (c) => UFC.art.paintShorts(c, look, 'L'), true));
    sleeveMatR = fabric(canvasTex(512, 384, (c) => UFC.art.paintShorts(c, look, 'R'), true));
    bandMat = stdMat(0xffffff, 0.6, { map: canvasTex(1024, 64, (c) => UFC.art.paintBand(c, look), true) });
    trimMat = stdMat(look.shortsTrim, 0.6);
  }
  const gloveMat = ref ? skin : stdMat(look.gloves, 0.42);
  const irisMat = stdMat(look.eye || 0x2a1b10, 0.2);
  const armSkin = skinFor('uaL');
  const mats = { skin, skinDark, armSkin, hairMat, shortsMat, sleeveMatL, sleeveMatR, trimMat, gloveMat, extraSkins: Object.values(partSkin) };

  const root = new THREE.Group();
  root.name = 'fighter';
  const B = {};
  const dims = {
    h, armS, musc, bulk,
    hipY: 0.548 * h,
    thigh: 0.247 * h, shin: 0.247 * h, ankle: 0.046 * h,
    hipX: 0.054 * h * (1 + bulk * 0.15),
    upper: 0.172 * h * armS, fore: 0.152 * h * armS, glove: 0.05 * h,
    shoulderX: (0.112 + musc * 0.01 + bulk * 0.008) * h * (0.94 + bodyP.shoulders * 0.12) * (1 + T.sh), shoulderY: 0.112 * h,
    spineLen: 0.028 * h, chestLen: 0.118 * h, neckLen: 0.132 * h, headPivot: 0.045 * h,
    headR: 0.066 * h, torsoR: (0.098 + bulk * 0.02) * h,
  };

  // ---- skeleton ----
  B.hips = makeBone('hips', root, 0, dims.hipY, 0);
  B.spine = makeBone('spine', B.hips, 0, dims.spineLen, 0);
  B.chest = makeBone('chest', B.spine, 0, dims.chestLen, 0);
  B.neck = makeBone('neck', B.chest, 0, dims.neckLen, -0.004 * h);
  B.head = makeBone('head', B.neck, 0, dims.headPivot, 0.006 * h);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    B['sh' + side] = makeBone('sh' + side, B.chest, sx * dims.shoulderX, dims.shoulderY, -0.006 * h);
    B['ua' + side] = makeBone('ua' + side, B['sh' + side], 0, 0, 0);
    B['fa' + side] = makeBone('fa' + side, B['ua' + side], 0, -dims.upper, 0);
    B['hand' + side] = makeBone('hand' + side, B['fa' + side], 0, -dims.fore, 0);
    B['th' + side] = makeBone('th' + side, B.hips, sx * dims.hipX, -0.018 * h, 0);
    B['sn' + side] = makeBone('sn' + side, B['th' + side], 0, -dims.thigh, 0);
    B['ft' + side] = makeBone('ft' + side, B['sn' + side], 0, -dims.shin, 0);
  }

  const add = (bone, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); bone.add(mesh); return mesh; };
  const H = h;

  // ---- pelvis / shorts ----
  const pelvisR = (0.082 + bulk * 0.016) * H;
  // Shorts: one closed pelvis shell that reaches below the hip joints, so
  // the thigh tops (which carry their own sleeves) always sit inside it.
  shortsMat.side = THREE.DoubleSide;
  const shorts = new THREE.Mesh(trunkGeo(-0.1 * H, 0.052 * H, (t) => pelvisR * (t < 0.35 ? M.lerp(0.86, 1.06, M.smooth(t / 0.35)) : M.lerp(1.06, 1.0, M.smooth((t - 0.35) / 0.65))), true, false), shortsMat);
  shorts.scale.set(1.3, 1, 0.98);
  add(B.hips, shorts);
  const band = new THREE.Mesh(trunkGeo(0.03 * H, 0.056 * H, () => pelvisR * 1.035, false, false), bandMat);
  band.scale.set(1.3, 1, 0.98);
  add(B.hips, band);

  // ---- abdomen & chest ----
  const torsoMat = ref ? shirtMat : skinFor('torso');
  const waistR = (0.068 + bulk * 0.018 + musc * 0.002) * H;
  const abd = new THREE.Mesh(trunkGeo(-0.01 * H, dims.spineLen + dims.chestLen * 0.35, (t) => M.lerp(pelvisR * 0.98, waistR, M.smooth(t * 1.4)), false, false), ref ? shirtMat : skin);
  abd.scale.set(1.14, 1, 0.84);
  add(B.spine, abd, 0, -dims.spineLen * 0.5, 0);

  // Chest: one sculpted surface with a natural V-taper (waist -> lats ->
  // shoulder line -> neck), pectorals and shoulder blades shaped into it,
  // instead of separate muscle balls.
  add(B.chest, new THREE.Mesh(torsoGeo(H, dims, waistR, musc, bulk, bodyP.shoulders), torsoMat));
  const fillMat = ref ? shirtMat : skin;
  for (const sx of [1, -1]) {
    // flattened shoulder filler inside the deltoid cap: closes the gap between
    // chest and upper arm when the arm moves, never visible as a ball
    const fill = sphere((0.024 + musc * 0.003 + bulk * 0.003) * H * (0.94 + bodyP.shoulders * 0.12), fillMat, 1.0, 0.82, 0.95);
    add(B.chest, fill, sx * (dims.shoulderX - 0.006 * H), dims.shoulderY - 0.004 * H, -0.004 * H);
  }

  // ---- neck & head ----
  const neckR = (0.039 + bulk * 0.008 + musc * 0.005) * H;
  add(B.neck, new THREE.Mesh(trunkGeo(-0.01 * H, dims.headPivot + 0.02 * H, (t) => neckR * (1 - 0.12 * t), false, false, 16, 6), skin));

  const hc = new V3(0, 0.05 * H, 0.012 * H); // head centre in head-bone space
  const HR = 0.066 * H;
  const head = buildHead(HR, bulk, look);
  const headSkin = skin.clone(); headSkin.vertexColors = true; mats.headSkin = headSkin;
  const headMesh = new THREE.Mesh(head.skin, headSkin);
  const face = { geo: head.skin, unit: head.unit, HR, baseCol: head.skin.attributes.color.array.slice(), basePos: head.skin.attributes.position.array.slice() };
  add(B.head, headMesh, hc.x, hc.y, hc.z);
  const eyes = [];
  const eyeWhiteMat = stdMat(0xe2d9cd, 0.18);
  const pupilMat = stdMat(0x050505, 0.08);
  const lidMat = skin.clone(); lidMat.color = new THREE.Color(0.86, 0.8, 0.78);
  const eyeK = 0.85 + look.face.eyes * 0.3;
  const browK = 0.7 + look.face.brows * 0.7;
  const browMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair).multiplyScalar(0.55), map: browTexture(), transparent: true, alphaTest: 0.3, roughness: 0.9, side: THREE.DoubleSide });
  for (const sx of [1, -1]) {
    const p = head.point(sx * 0.3, 0.05);
    const er = 0.0074 * H * eyeK;
    const ez = hc.z + p.z - 0.0046 * H;
    const eye = sphere(er, eyeWhiteMat, 1, 0.86, 0.9, 18, 12);
    add(B.head, eye, hc.x + p.x, hc.y + p.y, ez);
    const iris = sphere(0.0042 * H * eyeK, irisMat, 1, 1, 0.42, 14, 10);
    add(B.head, iris, hc.x + p.x, hc.y + p.y, ez + er * 0.8);
    const pupil = sphere(0.0017 * H * eyeK, pupilMat, 1, 1, 0.4, 10, 8);
    add(B.head, pupil, hc.x + p.x, hc.y + p.y, ez + er * 0.9);
    eyes.push(eye, iris, pupil);
    // upper and lower lids make the eye almond shaped instead of a round ball
    const upper = new THREE.Mesh(new THREE.SphereGeometry(er * 1.1, 18, 8, 0, Math.PI * 2, 0, 0.98), lidMat);
    upper.rotation.x = 0.28; add(B.head, upper, hc.x + p.x, hc.y + p.y, ez);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(er * 1.06, 18, 6, 0, Math.PI * 2, 0, 0.72), lidMat);
    lower.rotation.x = Math.PI - 0.22; add(B.head, lower, hc.x + p.x, hc.y + p.y, ez);
    // eyebrow: a strip of short hairs laid along the brow ridge
    add(B.head, new THREE.Mesh(browGeo(head, sx, browK), browMat), hc.x, hc.y, hc.z);
    const ear = sphere(0.017 * H, skin, 0.32, 1.0, 0.62, 12, 10);
    ear.rotation.y = sx * 0.35;
    add(B.head, ear, hc.x + sx * HR * 0.69, hc.y - 0.06 * HR, hc.z - 0.1 * HR);
  }
  if (head.hair) {
    const hm = head.hair.userData.fade ? Object.assign(hairMat.clone(), { vertexColors: true, transparent: true, alphaTest: 0.02 }) : hairMat;
    add(B.head, new THREE.Mesh(head.hair, hm), hc.x, hc.y, hc.z);
    if (head.hairShell && UFC.QUALITY.strands) {
      const strandMat = new THREE.MeshStandardMaterial({ map: strandTexture(look.hair, 520, look.hairStyle === 'long' ? 1.6 : 1.1, 5), transparent: true, alphaTest: 0.45, roughness: 0.95, side: THREE.FrontSide, depthWrite: false });
      strandMat.map.repeat.set(5, 4);
      add(B.head, new THREE.Mesh(head.hairShell, strandMat), hc.x, hc.y, hc.z);
    }
  }
  if (head.beard) {
    const beardMat = stdMat(0xffffff, 1.0, { map: hairTexture(new THREE.Color(look.hair).multiplyScalar(0.6).lerp(new THREE.Color(look.skin), 0.12).getHex()), transparent: true, opacity: 0.94 });
    if (head.beard.userData.fade) { beardMat.vertexColors = true; beardMat.opacity = 1; }
    add(B.head, new THREE.Mesh(head.beard, beardMat), hc.x, hc.y, hc.z);
    if (head.beardShell && UFC.QUALITY.strands) {
      const bs = new THREE.MeshStandardMaterial({ map: strandTexture(look.hair, 200, 0.7, 9), transparent: true, alphaTest: 0.42, roughness: 0.95, side: THREE.FrontSide, depthWrite: false });
      bs.map.repeat.set(4, 3);
      add(B.head, new THREE.Mesh(head.beardShell, bs), hc.x, hc.y, hc.z);
    }
  }
  if (look.hairStyle === 'bun') {
    const bun = sphere(0.018 * H, hairMat, 1, 0.9, 1);
    add(B.head, bun, hc.x, hc.y + 0.62 * HR, hc.z - 0.95 * HR);
  }
  if (look.hairStyle === 'long') {
    // gathered at the back of the neck
    const tail = sphere(0.016 * H, hairMat, 0.9, 1.5, 0.9);
    add(B.head, tail, hc.x, hc.y - 0.55 * HR, hc.z - 0.95 * HR);
  }

  // ---- arms ----
  const armK = (1 + musc * 0.12 + bulk * 0.1) * (0.88 + bodyP.arms * 0.24);
  const deltK = 0.7 + bodyP.shoulders * 0.6;
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    // Upper arm with the deltoid built into its top: shoulder cap -> deltoid
    // -> biceps/triceps belly -> elbow, one continuous surface.
    const ua = new THREE.Mesh(limbGeo(dims.upper + 0.012 * H, (t) => armK * H * (
      M.lerp(0.033, 0.021, M.smooth(t)) +
      bump(t, 0.12, 0.2) * 0.004 * deltK +  // deltoid
      bump(t, 0.52, 0.34) * 0.0065 -         // biceps / triceps belly
      bump(t, 0.3, 0.12) * 0.0015), true, true, 20, 20), ref ? shirtMat : skinFor('ua' + side));
    ua.scale.set(0.96, 1, 1.02);
    add(B['ua' + side], ua, 0, 0.012 * H, 0);
    if (ref) {
      // short sleeve ends above the elbow
      const sleeve = new THREE.Mesh(limbGeo(dims.upper * 0.55, (t) => armK * H * (M.lerp(0.037, 0.031, t)), true, false, 18, 6), shirtMat);
      add(B['ua' + side], sleeve, 0, 0.012 * H, 0);
      const lower = new THREE.Mesh(limbGeo(dims.upper * 0.5, (t) => armK * H * M.lerp(0.026, 0.021, t), false, true, 16, 6), skin);
      add(B['ua' + side], lower, 0, -dims.upper * 0.5, 0);
      ua.visible = false;
    }
    const faMat = skinFor('fa' + side);
    const fa = new THREE.Mesh(limbGeo(dims.fore, (t) => armK * H * (
      M.lerp(0.025, 0.0165, M.smooth(t)) +
      bump(t, 0.2, 0.3) * 0.0055), true, true, 18, 16), faMat);   // forearm flexors
    fa.scale.set(1.04, 1, 0.9);
    add(B['fa' + side], fa);
    const elbow = sphere(0.021 * H * armK, skin, 1, 1, 1, 14, 10);
    add(B['fa' + side], elbow, 0, 0.002 * H, -0.004 * H);
    if (ref) {
      const hand = sphere(0.02 * H, skin, 0.8, 1.3, 1.0);
      add(B['hand' + side], hand, 0, -0.03 * H, 0);
    } else {
      // 4oz MMA glove: open fingers, padded knuckles, wrist strap
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0172 * H, 0.0158 * H, 0.03 * H, 14), gloveMat);
      add(B['hand' + side], wrap, 0, -0.006 * H, 0);
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.0178 * H, 0.0178 * H, 0.008 * H, 14), trimMat);
      add(B['hand' + side], strap, 0, -0.006 * H, 0);
      const fist = sphere(0.0205 * H, gloveMat, 0.95, 1.2, 1.12);
      add(B['hand' + side], fist, 0, -0.034 * H, 0.004 * H);
      const fingers = sphere(0.0165 * H, skin, 0.95, 0.62, 0.8);
      add(B['hand' + side], fingers, 0, -0.049 * H, -0.01 * H);
      const thumb = sphere(0.0075 * H, gloveMat, 1, 1.6, 1);
      add(B['hand' + side], thumb, sx * 0.016 * H, -0.03 * H, 0.011 * H);
    }
  }

  // ---- legs ----
  const legK = 0.9 + bodyP.legs * 0.2;
  const thighR = (0.057 + bulk * 0.014 + musc * 0.005) * H * legK;
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const sleeveMat = side === 'L' ? sleeveMatL : sleeveMatR;
    // Same thigh shape as before; the skin only starts where the shorts end,
    // so it can never poke through the fabric.
    const thighR_at = (t) => M.lerp(thighR, 0.034 * H * legK, M.smooth(t)) + bump(t, 0.35, 0.45) * (0.007 + musc * 0.005) * H * legK;
    const SKIN_FROM = 0.36, HEM = ref ? 1.0 : 0.5;
    const thLen = dims.thigh * (1 - SKIN_FROM);
    const th = new THREE.Mesh(limbGeo(thLen, (u) => thighR_at(SKIN_FROM + u * (1 - SKIN_FROM)), false, true), ref ? skin : skinFor('thigh' + side));
    th.scale.set(1, 1, 1.02);
    add(B['th' + side], th, 0, -dims.thigh * SKIN_FROM, 0);
    if (ref) th.visible = false;
    // Sleeve follows the thigh profile with a constant fabric gap and runs up
    // into the pelvis shell; straight hem.
    const TOP = 0.035 * H;
    const slLen = dims.thigh * HEM + TOP;
    const gap = 0.0065 * H;
    const sleeve = new THREE.Mesh(limbGeo(slLen, (u) => {
      const y = u * slLen - TOP;                 // metres below the hip joint
      const t = M.clamp(y / dims.thigh, 0, 1);
      const flare = y < 0 ? (-y / TOP) * 0.003 * H : 0;
      return (thighR_at(t) + gap) * 1.02 + flare;
    }, false, ref, 22, 18), sleeveMat);
    sleeve.scale.set(1, 1, 1.02);
    add(B['th' + side], sleeve, 0, TOP, 0);
    if (!ref) {
      const hemR = (thighR_at(HEM) + gap) * 1.02;
      const sleeveTrim = new THREE.Mesh(limbGeo(0.011 * H, () => hemR + 0.0012 * H, false, false, 22, 2), trimMat);
      trimMat.side = THREE.DoubleSide;
      sleeveTrim.scale.set(1, 1, 1.02);
      add(B['th' + side], sleeveTrim, 0, -dims.thigh * HEM + 0.011 * H, 0);
    }
    const legMat = ref ? pantsMat : skinFor('calf' + side);
    const knee = sphere(0.026 * H * legK, legMat, 1.05, 1.0, 1.0);
    add(B['sn' + side], knee, 0, 0.004 * H, 0.004 * H);
    const sn = new THREE.Mesh(limbGeo(dims.shin, (t) =>
      (M.lerp(0.033 * H, 0.019 * H, M.smooth(t)) + bump(t, 0.3, 0.38) * (0.008 + musc * 0.003 + bulk * 0.004) * H) * (ref ? 1.25 : 1) * legK), legMat);
    add(B['sn' + side], sn);
    // Calf sits behind the shin bone.
    const calf = sphere((0.028 + bulk * 0.004) * H * legK, legMat, 0.95, 2.0, 1.0);
    add(B['sn' + side], calf, 0, -0.075 * H, -0.012 * H);
    const footMat = ref ? shoeMat : skin;
    const foot = sphere(0.022 * H, footMat, 0.95, ref ? 0.75 : 0.62, 2.35);
    add(B['ft' + side], foot, 0, -0.03 * H, 0.03 * H);
    const heel = sphere(0.018 * H, footMat, 1, 1.0, 1.1);
    add(B['ft' + side], heel, 0, -0.03 * H, -0.004 * H);
  }

  // every per-part skin (muscle maps, tattoos) is known only now
  mats.extraSkins = Object.values(partSkin);
  mats.partSkins = partSkin;
  shadowAll(root);
  // the face does not take shadows: at this size the nose's own shadow reads
  // as a dark hole under it
  headMesh.receiveShadow = false;
  {   // thicken or thin the whole frame by type (the skeleton and reach stay the same)
    dims.torsoR *= T.gT;
    const sc = (bn, gx, gz) => { if (!B[bn]) return; for (const m of B[bn].children) if (m.isMesh) { m.scale.x *= gx; m.scale.z *= gz; } };
    sc('hips', T.gT, T.gT); sc('spine', T.gT, T.gT * (1 + T.belly * 0.24)); sc('chest', T.gT * (1 + T.sh * 0.4), T.gT * (1 + T.belly * 0.1));
    for (const sd of ['L', 'R']) for (const bn of ['sh', 'ua', 'fa', 'th', 'sn']) sc(bn + sd, T.gL, T.gL);
  }
  return { root, B, dims, mats, eyes, face, look, bodyP };
};

UFC.body = { limbGeo, trunkGeo, stdMat, skinTexture, canvasTex, setSRGB };
})();

