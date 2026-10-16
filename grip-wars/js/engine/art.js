//# sourceURL=ufc/art.js
(function () {
'use strict';
const UFC = window.UFC;

// ===========================================================================
// 2D art painted into textures: tattoo designs, animal emblems for shorts,
// short patterns. Everything is drawn procedurally on canvases, so it maps
// onto the body's UVs and moves/deforms with the skin.
// ===========================================================================

const TAU = Math.PI * 2;

function blade(g, x0, y0, ang, len, w) {
  const ex = x0 + Math.cos(ang) * len, ey = y0 + Math.sin(ang) * len;
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const mx = x0 + Math.cos(ang) * len * 0.45, my = y0 + Math.sin(ang) * len * 0.45;
  g.beginPath();
  g.moveTo(x0 + nx * w * 0.4, y0 + ny * w * 0.4);
  g.quadraticCurveTo(mx + nx * w * 1.3, my + ny * w * 1.3, ex, ey);
  g.quadraticCurveTo(mx - nx * w * 0.2, my - ny * w * 0.2, x0 - nx * w * 0.4, y0 - ny * w * 0.4);
  g.closePath(); g.fill();
}

function star(g, cx, cy, R, r, n, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU, rad = i % 2 ? r : R;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

// ---------------------------------------------------------------- emblems
// Animal heads / silhouettes used both as tattoos (ink) and shorts motifs (fill).
const EMBLEMS = {
  lion(g, S, main, detail) {
    g.fillStyle = main;
    star(g, 0, 0, S * 0.5, S * 0.36, 16, 0); g.fill();
    g.fillStyle = detail; g.beginPath(); g.ellipse(0, S * 0.03, S * 0.27, S * 0.31, 0, 0, TAU); g.fill();
    g.fillStyle = main;
    g.beginPath(); g.moveTo(-S * 0.14, -S * 0.04); g.lineTo(-S * 0.05, -S * 0.02); g.lineTo(-S * 0.12, S * 0.02); g.fill();
    g.beginPath(); g.moveTo(S * 0.14, -S * 0.04); g.lineTo(S * 0.05, -S * 0.02); g.lineTo(S * 0.12, S * 0.02); g.fill();
    g.beginPath(); g.moveTo(-S * 0.07, S * 0.1); g.lineTo(S * 0.07, S * 0.1); g.lineTo(0, S * 0.19); g.fill();
    g.fillRect(-S * 0.012, S * 0.18, S * 0.024, S * 0.08);
    g.beginPath(); g.ellipse(-S * 0.05, S * 0.26, S * 0.06, S * 0.025, 0.3, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(S * 0.05, S * 0.26, S * 0.06, S * 0.025, -0.3, 0, TAU); g.fill();
  },
  tiger(g, S, main, detail) {
    g.fillStyle = main;
    g.beginPath(); g.ellipse(0, 0, S * 0.4, S * 0.36, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(-S * 0.3, -S * 0.28, S * 0.12, 0, TAU); g.fill();
    g.beginPath(); g.arc(S * 0.3, -S * 0.28, S * 0.12, 0, TAU); g.fill();
    g.fillStyle = detail;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) blade(g, sx * S * 0.42, -S * 0.12 + i * S * 0.12, sx > 0 ? Math.PI - 0.15 * (i - 1) : 0.15 * (i - 1), S * 0.18, S * 0.035);
      g.beginPath(); g.ellipse(sx * S * 0.14, -S * 0.06, S * 0.07, S * 0.035, sx * 0.35, 0, TAU); g.fill();
    }
    for (let i = 0; i < 3; i++) blade(g, (i - 1) * S * 0.09, -S * 0.36, Math.PI / 2 + (i - 1) * 0.2, S * 0.16, S * 0.03);
    g.beginPath(); g.moveTo(-S * 0.08, S * 0.08); g.lineTo(S * 0.08, S * 0.08); g.lineTo(0, S * 0.17); g.fill();
    g.fillRect(-S * 0.012, S * 0.16, S * 0.024, S * 0.08);
  },
  bull(g, S, main, detail) {
    g.fillStyle = main;
    g.beginPath();
    g.moveTo(-S * 0.2, -S * 0.2); g.quadraticCurveTo(-S * 0.55, -S * 0.25, -S * 0.5, -S * 0.5);
    g.quadraticCurveTo(-S * 0.38, -S * 0.3, -S * 0.12, -S * 0.3); g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(S * 0.2, -S * 0.2); g.quadraticCurveTo(S * 0.55, -S * 0.25, S * 0.5, -S * 0.5);
    g.quadraticCurveTo(S * 0.38, -S * 0.3, S * 0.12, -S * 0.3); g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(-S * 0.26, -S * 0.26); g.lineTo(S * 0.26, -S * 0.26); g.lineTo(S * 0.2, S * 0.1);
    g.quadraticCurveTo(S * 0.18, S * 0.36, 0, S * 0.4); g.quadraticCurveTo(-S * 0.18, S * 0.36, -S * 0.2, S * 0.1); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-S * 0.26, -S * 0.2); g.lineTo(-S * 0.42, -S * 0.1); g.lineTo(-S * 0.22, -S * 0.05); g.fill();
    g.beginPath(); g.moveTo(S * 0.26, -S * 0.2); g.lineTo(S * 0.42, -S * 0.1); g.lineTo(S * 0.22, -S * 0.05); g.fill();
    g.fillStyle = detail;
    g.beginPath(); g.moveTo(-S * 0.15, -S * 0.1); g.lineTo(-S * 0.04, -S * 0.06); g.lineTo(-S * 0.13, -S * 0.03); g.fill();
    g.beginPath(); g.moveTo(S * 0.15, -S * 0.1); g.lineTo(S * 0.04, -S * 0.06); g.lineTo(S * 0.13, -S * 0.03); g.fill();
    g.beginPath(); g.arc(-S * 0.06, S * 0.28, S * 0.03, 0, TAU); g.fill(); g.beginPath(); g.arc(S * 0.06, S * 0.28, S * 0.03, 0, TAU); g.fill();
    g.strokeStyle = detail; g.lineWidth = S * 0.03; g.beginPath(); g.arc(0, S * 0.36, S * 0.07, 0.2, Math.PI - 0.2); g.stroke();
  },
  panther(g, S, main) {
    g.fillStyle = main;
    g.beginPath();
    g.moveTo(-S * 0.5, S * 0.12);
    g.quadraticCurveTo(-S * 0.35, -S * 0.08, -S * 0.05, -S * 0.08);
    g.quadraticCurveTo(S * 0.2, -S * 0.12, S * 0.32, -S * 0.2);
    g.lineTo(S * 0.36, -S * 0.3); g.lineTo(S * 0.42, -S * 0.2);
    g.quadraticCurveTo(S * 0.52, -S * 0.16, S * 0.5, -S * 0.08);
    g.lineTo(S * 0.36, -S * 0.04);
    g.quadraticCurveTo(S * 0.3, S * 0.04, S * 0.44, S * 0.2);
    g.lineTo(S * 0.36, S * 0.22);
    g.quadraticCurveTo(S * 0.2, S * 0.08, S * 0.1, S * 0.08);
    g.quadraticCurveTo(-S * 0.1, S * 0.12, -S * 0.2, S * 0.1);
    g.quadraticCurveTo(-S * 0.3, S * 0.26, -S * 0.44, S * 0.3);
    g.lineTo(-S * 0.46, S * 0.24);
    g.quadraticCurveTo(-S * 0.36, S * 0.2, -S * 0.36, S * 0.1);
    g.quadraticCurveTo(-S * 0.6, S * 0.2, -S * 0.72, S * 0.02);
    g.quadraticCurveTo(-S * 0.62, S * 0.14, -S * 0.5, S * 0.12);
    g.closePath(); g.fill();
  },
  eagle(g, S, main, detail) {
    g.fillStyle = main;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const a = -0.55 + i * 0.22;
        g.save(); g.scale(sx, 1);
        g.beginPath();
        g.moveTo(S * 0.06, -S * 0.02);
        g.quadraticCurveTo(S * (0.2 + i * 0.04), -S * (0.3 - i * 0.05), S * (0.56 - i * 0.03), -S * (0.34 - i * 0.14) + Math.sin(a) * S * 0.02);
        g.quadraticCurveTo(S * (0.3 + i * 0.02), -S * (0.08 - i * 0.05), S * 0.06, S * (0.06 + i * 0.02));
        g.fill(); g.restore();
      }
    }
    g.beginPath(); g.ellipse(0, S * 0.06, S * 0.09, S * 0.22, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(0, -S * 0.18, S * 0.08, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-S * 0.08, S * 0.26); g.lineTo(S * 0.08, S * 0.26); g.lineTo(0, S * 0.4); g.fill();
    g.fillStyle = detail;
    g.beginPath(); g.moveTo(S * 0.03, -S * 0.2); g.lineTo(S * 0.14, -S * 0.15); g.lineTo(S * 0.04, -S * 0.12); g.fill();
    g.beginPath(); g.arc(-S * 0.02, -S * 0.2, S * 0.015, 0, TAU); g.fill();
  },
};

// ---------------------------------------------------------------- tattoos
const SCRIPTS = ['Loyalty', 'Family', 'Honor', 'Veritas', 'Believe', 'No Fear', 'Warrior', 'Faith'];
function seededRnd(seed) { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

const DESIGNS = {
  tribal(g, S, ink, rnd) {
    g.fillStyle = ink;
    for (let k = 0; k < 7; k++) {
      const ang = -Math.PI / 2 + (k - 3) * 0.42 + (rnd() - 0.5) * 0.1;
      blade(g, 0, S * 0.12, ang, S * (0.42 + (k % 2) * 0.1), S * 0.07);
    }
    for (const sx of [-1, 1]) blade(g, 0, S * 0.12, Math.PI / 2 + sx * 0.5, S * 0.32, S * 0.06);
    g.beginPath(); g.arc(0, S * 0.12, S * 0.06, 0, TAU); g.fill();
  },
  script(g, S, ink, rnd) {
    g.fillStyle = ink;
    g.save(); g.rotate(-Math.PI / 2 + (rnd() - 0.5) * 0.2);
    g.font = 'italic 700 ' + Math.round(S * 0.26) + 'px "Brush Script MT", "Segoe Script", Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(SCRIPTS[Math.floor(rnd() * SCRIPTS.length)], 0, 0);
    g.restore();
  },
  rose(g, S, ink) {
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = S * 0.028;
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.beginPath(); g.ellipse(Math.cos(a) * S * 0.12, Math.sin(a) * S * 0.12 - S * 0.08, S * 0.13, S * 0.09, a, 0, TAU); g.stroke(); }
    g.beginPath(); for (let t = 0; t < 14; t += 0.1) { const r = t * S * 0.008; const x = Math.cos(t) * r, y = Math.sin(t) * r - S * 0.08; t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.beginPath(); g.moveTo(0, S * 0.08); g.quadraticCurveTo(S * 0.05, S * 0.3, -S * 0.02, S * 0.48); g.stroke();
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * S * 0.12, S * 0.26, S * 0.1, S * 0.04, sx * 0.6, 0, TAU); g.fill(); }
  },
  geometric(g, S, ink) {
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = S * 0.02;
    for (const r of [0.44, 0.34, 0.2]) { g.beginPath(); g.arc(0, 0, S * r, 0, TAU); g.stroke(); }
    star(g, 0, 0, S * 0.34, S * 0.2, 8, 0); g.stroke();
    g.beginPath(); g.moveTo(0, -S * 0.2); g.lineTo(S * 0.17, S * 0.1); g.lineTo(-S * 0.17, S * 0.1); g.closePath(); g.stroke();
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16; g.beginPath(); g.arc(Math.cos(a) * S * 0.39, Math.sin(a) * S * 0.39, S * 0.018, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(0, 0, S * 0.05, 0, TAU); g.fill();
  },
  lion(g, S, ink) {
    g.save(); g.globalAlpha *= 1;
    EMBLEMS.lion(g, S, ink, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000'; g.beginPath(); g.ellipse(0, S * 0.03, S * 0.22, S * 0.26, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(-S * 0.14, -S * 0.04); g.lineTo(-S * 0.05, -S * 0.02); g.lineTo(-S * 0.12, S * 0.02); g.fill();
    g.beginPath(); g.moveTo(S * 0.14, -S * 0.04); g.lineTo(S * 0.05, -S * 0.02); g.lineTo(S * 0.12, S * 0.02); g.fill();
    g.beginPath(); g.moveTo(-S * 0.07, S * 0.1); g.lineTo(S * 0.07, S * 0.1); g.lineTo(0, S * 0.19); g.fill();
    g.restore();
  },
  eagle(g, S, ink) { EMBLEMS.eagle(g, S, ink, 'rgba(0,0,0,0)'); },
  dragon(g, S, ink) {
    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round';
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.05) pts.push([Math.sin(t * Math.PI * 2.2) * S * 0.22, (t - 0.5) * S * 0.95]);
    for (let i = 1; i < pts.length; i++) {
      g.lineWidth = S * (0.1 * (1 - i / pts.length) + 0.02);
      g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
      if (i % 2 === 0) { g.beginPath(); g.moveTo(pts[i][0] + S * 0.04, pts[i][1]); g.lineTo(pts[i][0] + S * 0.12, pts[i][1] - S * 0.05); g.lineTo(pts[i][0] + S * 0.05, pts[i][1] - S * 0.06); g.fill(); }
    }
    const h = pts[0];
    g.beginPath(); g.moveTo(h[0] - S * 0.12, h[1] + S * 0.02); g.lineTo(h[0] + S * 0.1, h[1] - S * 0.1); g.lineTo(h[0] + S * 0.06, h[1] + S * 0.07); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(h[0], h[1] - S * 0.04); g.lineTo(h[0] - S * 0.02, h[1] - S * 0.16); g.lineTo(h[0] + S * 0.04, h[1] - S * 0.06); g.fill();
  },
  stars(g, S, ink) {
    g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = S * 0.02;
    const nautical = (cx, cy, R) => {
      for (let i = 0; i < 5; i++) {
        const a0 = -Math.PI / 2 + i * TAU / 5, a1 = a0 + TAU / 10;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); g.lineTo(cx + Math.cos(a1) * R * 0.4, cy + Math.sin(a1) * R * 0.4); g.closePath(); g.fill();
      }
      star(g, cx, cy, R, R * 0.4, 5); g.stroke();
    };
    nautical(-S * 0.08, -S * 0.15, S * 0.26);
    nautical(S * 0.18, S * 0.2, S * 0.15);
    nautical(-S * 0.2, S * 0.3, S * 0.09);
  },
};

// Draw one tattoo design centred at (cx, cy), S = size in pixels.
function drawTattoo(g, t, cx, cy, S, seed) {
  const fn = DESIGNS[t.design] || DESIGNS.tribal;
  g.save();
  g.translate(cx, cy);
  if (t.flip) g.scale(-1, 1);
  const ink = 'rgba(16,20,30,' + (t.ink == null ? 0.95 : Math.min(1, t.ink * 1.12)) + ')';
  try { g.filter = 'blur(0.6px)'; } catch (e) { /* older canvases */ }
  fn(g, S, ink, seededRnd(seed || 7));
  g.restore();
}

// ---------------------------------------------------------------- shorts
function hex(c) { return '#' + new THREE.Color(c).getHexString(); }
function shade(c, k) { const col = new THREE.Color(c); col.multiplyScalar(k); return '#' + col.getHexString(); }

// part: 'pelvis' (u=0 front, 0.25 left side, 0.5 back) | 'L' | 'R' (thigh sleeves, u=0.25 / 0.75 outer side)
function paintShorts(canvas, look, part) {
  const W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  const base = hex(look.shorts), trim = hex(look.shortsTrim == null ? 0xd8b24a : look.shortsTrim);
  const style = look.shortsStyle || 'classic';
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // woven fabric grain
  for (let i = 0; i < 1600; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'; g.fillRect(Math.random() * W, Math.random() * H, 3, 1); }
  const outerU = part === 'L' ? 0.25 : part === 'R' ? 0.75 : null;
  if (style === 'side') {
    const cols = part === 'pelvis' ? [0.25, 0.75] : [outerU];
    g.fillStyle = trim;
    for (const u of cols) g.fillRect((u - 0.06) * W, 0, 0.12 * W, H);
    g.fillStyle = base;
    for (const u of cols) g.fillRect((u - 0.03) * W, 0, 0.06 * W, H);
  } else if (style === 'split') {
    g.fillStyle = trim;
    if (part === 'R') g.fillRect(0, 0, W, H);
    else if (part === 'pelvis') g.fillRect(W * 0.5, 0, W * 0.5, H);
  } else if (style === 'stripes') {
    g.save(); g.fillStyle = trim; g.globalAlpha = 0.85;
    for (let x = -H; x < W + H; x += W * 0.1) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + W * 0.035, H); g.lineTo(x + W * 0.035 + H * 0.6, 0); g.lineTo(x + H * 0.6, 0); g.fill(); }
    g.restore();
  } else if (style === 'gradient') {
    const gr = g.createLinearGradient(0, part === 'pelvis' ? H : 0, 0, part === 'pelvis' ? 0 : H);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, trim);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  } else if (style === 'flames') {
    g.fillStyle = trim;
    const rnd = seededRnd(part === 'L' ? 3 : 5);
    if (part !== 'pelvis') {
      for (let x = 0; x < W; x += W * 0.07) {
        const hgt = H * (0.25 + rnd() * 0.45);
        g.beginPath(); g.moveTo(x - W * 0.04, H); g.quadraticCurveTo(x - W * 0.03, H - hgt * 0.5, x + W * 0.01, H - hgt);
        g.quadraticCurveTo(x + W * 0.02, H - hgt * 0.4, x + W * 0.05, H); g.fill();
      }
    }
  } else if (style === 'camo') {
    const rnd = seededRnd(11);
    for (let i = 0; i < 60; i++) { g.fillStyle = [shade(look.shorts, 0.6), trim, shade(look.shorts, 1.35)][i % 3]; g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 40, 10 + rnd() * 24, rnd() * 3, 0, TAU); g.fill(); }
  }
  // hem trim line on the sleeves
  if (part !== 'pelvis') { g.fillStyle = trim; g.fillRect(0, H * 0.9, W, H * 0.04); }
  // animal motif: big on the left thigh, small on the back of the waist
  if (look.motif && EMBLEMS[look.motif]) {
    const mc = hex(look.motifColor == null ? (look.shortsTrim == null ? 0xd8b24a : look.shortsTrim) : look.motifColor);
    const bg = base;
    const place = part === 'L' ? [0.25, 0.42, 0.34] : part === 'pelvis' ? [0.5, 0.45, 0.2] : null;
    if (place) {
      g.save(); g.translate(place[0] * W, place[1] * H);
      g.scale(1, (W / H) * 0.62);
      EMBLEMS[look.motif](g, place[2] * W, mc, bg);
      g.restore();
    }
  }
}

function paintBand(canvas, look) {
  const W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  g.fillStyle = hex(look.shortsTrim == null ? 0xd8b24a : look.shortsTrim); g.fillRect(0, 0, W, H);
  if (look.bandText) {
    g.fillStyle = hex(look.shorts);
    g.font = '900 ' + Math.round(H * 0.7) + 'px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = String(look.bandText).toUpperCase().slice(0, 14);
    // the lathe seam is at the front (u = 0): draw across both edges
    g.fillText(txt, 0, H * 0.54); g.fillText(txt, W, H * 0.54);
  }
}

UFC.art = { EMBLEMS, DESIGNS, drawTattoo, paintShorts, paintBand, star, seededRnd };
UFC.TATTOO_DESIGNS = [['tribal', 'Трайбл'], ['script', 'Надпись'], ['rose', 'Роза'], ['geometric', 'Геометрия'], ['lion', 'Лев'], ['eagle', 'Орёл'], ['dragon', 'Дракон'], ['stars', 'Звёзды']];
UFC.TATTOO_PLACES = [['armL', 'Левое плечо'], ['armR', 'Правое плечо'], ['forearmL', 'Левое предплечье'], ['forearmR', 'Правое предплечье'], ['chest', 'Грудь'], ['back', 'Спина']];
UFC.MOTIFS = [[null, 'Нет'], ['lion', 'Лев'], ['tiger', 'Тигр'], ['bull', 'Бык'], ['panther', 'Пантера'], ['eagle', 'Орёл']];
UFC.SHORTS_STYLES = [['classic', 'Классика'], ['side', 'Лампасы'], ['split', 'Двухцветные'], ['stripes', 'Полосы'], ['gradient', 'Градиент'], ['flames', 'Пламя'], ['camo', 'Камуфляж']];
UFC.SHORTS_COLORS = [[0x111113, 'Чёрные'], [0xf2f0ea, 'Белые'], [0xb3121b, 'Красные'], [0x1b3f8a, 'Синие'], [0x0b7a3e, 'Зелёные'], [0xd4a52c, 'Золотые'], [0xe0602b, 'Оранжевые'], [0x5b2a86, 'Фиолетовые']];
})();

