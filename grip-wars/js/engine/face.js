//# sourceURL=ufc/face.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;

// ---------------------------------------------------------------------------
// Visible face damage, painted into the sculpted head's vertex colours and
// displaced geometry: redness -> bruising on the struck cheek, swelling
// around the eye, a cut over the brow that bleeds down the face, and a
// bloody nose from straight punches. Builds up from actual head shots.
// Unit-sphere head coords: +X = fighter's left, +Y up, +Z forward.
// ---------------------------------------------------------------------------
const P = UFC.Fighter.prototype;
const g2 = (dx, dy, w) => Math.exp(-(dx * dx + dy * dy) / (w * w));

P.resetFace = function () {
  this.face = { cheekL: 0, cheekR: 0, eyeL: 0, eyeR: 0, cutL: 0, cutR: 0, bleedL: 0, bleedR: 0, nose: 0, noseBleed: 0 };
  this._faceDirty = true;
  this._faceT = 0;
};

// side: 'L' | 'R' (fighter's own side that got hit) or 'C' for straight down the middle
P.faceHit = function (power, side, heavy) {
  if (!this.face) this.resetFace();
  const f = this.face;
  // every clean head shot adds to the fog and wears the face down for good
  const chinK = Math.max(0.2, 1.25 - this.chin * 0.4), hv = heavy ? 1.4 : 1;
  this.dizzy = Math.min(1, (this.dizzy || 0) + power * 0.0008 * chinK * hv);
  this.faceHp = Math.max(0, (this.faceHp == null ? 100 : this.faceHp) - power * 0.176 / UFC.TOUGH * chinK * hv * (1 + (1 - this.head / 100) * 0.8));
  // damage shows fast: a hard fight leaves the face wrecked
  const k = Math.min(3.2, power / 10) * Math.max(0.55, 1.25 - this.chin * 0.4) * (1 + (1 - this.head / 100) * 1.1) * 1.28;
  const sides = side === 'C' ? ['L', 'R'] : [side];
  for (const s of sides) {
    const w = side === 'C' ? 0.45 : 1;
    f['cheek' + s] = Math.min(1, f['cheek' + s] + k * 0.16 * w);
    f['eye' + s] = Math.min(1, f['eye' + s] + k * (side === 'C' ? 0.07 : 0.11) * w * 0.35);   // an eye swells over a fight, not over two punches
    const cutChance = (power > 7.5 ? 0.12 : 0.03) * k * (heavy ? 2.2 : 1) * (1 + (1 - this.head / 100) * 2.5);
    if (Math.random() < cutChance * w) f['cut' + s] = Math.max(f['cut' + s], 0.55 + Math.random() * 0.45);
    if (f['cut' + s] > 0) f['bleed' + s] = Math.min(1, f['bleed' + s] + k * 0.3 * w);
    // a second cut on the cheekbone after a lot of punishment
    if (this.head < 55 && Math.random() < cutChance * 0.6 * w) f['cheekCut' + s] = Math.max(f['cheekCut' + s] || 0, 0.6 + Math.random() * 0.4);
  }
  // split lip and swollen mouth from straight shots
  if (side === 'C' || Math.random() < 0.3) f.lip = Math.min(1, (f.lip || 0) + k * 0.12);
  if (side === 'C') f.nose = Math.min(1, f.nose + k * 0.2);
  if (f.nose > 0.35) f.noseBleed = Math.min(1, f.noseBleed + k * 0.22);
  // a broken face looks broken: both eyes swell shut, nose and cheeks go
  const ruin = 1 - this.faceHp / 100;
  if (ruin > 0.15) {
    for (const s of ['L', 'R']) { f['eye' + s] = Math.max(f['eye' + s], Math.min(1, ruin * 1.05)); f['cheek' + s] = Math.max(f['cheek' + s], ruin * 0.9); }
    f.nose = Math.max(f.nose, ruin); if (ruin > 0.35) f.noseBleed = Math.max(f.noseBleed, ruin * 0.9);
  }
  this._faceDirty = true;
};

P.updateFace = function (dt) {
  if (!this.face) this.resetFace();
  this._faceT -= dt;
  if (!this._faceDirty || this._faceT > 0) return;
  this._faceDirty = false;
  this._faceT = 0.12;
  const fd = this.body.face;
  if (!fd) return;
  let f = this.face;
  if (this.angryFace) {   // the angry form: a reddened face, a bruise under the left eye, a little blood from the brow and nose
    f = Object.assign({}, f, { eyeL: Math.max(f.eyeL, 0.5), cutL: Math.max(f.cutL, 0.6), bleedL: Math.max(f.bleedL, 0.2), noseBleed: Math.max(f.noseBleed, 0.14), nose: Math.max(f.nose, 0.2) });
  }
  const unit = fd.unit, base = fd.baseCol, pos = fd.geo.attributes.position.array, col = fd.geo.attributes.color.array, bp = fd.basePos, HR = fd.HR;
  const n = unit.length / 3;
  for (let i = 0; i < n; i++) {
    const x = unit[i * 3], y = unit[i * 3 + 1], z = unit[i * 3 + 2];
    let r = base[i * 3], g = base[i * 3 + 1], b = base[i * 3 + 2];
    let swell = 0;
    if (z > 0.15) {
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        // cheek redness turning into a bruise
        const ch = f['cheek' + s] * g2(x - sx * 0.44, y + 0.12, 0.28);
        if (ch > 0.01) {
          const bruise = M.sat((f['cheek' + s] - 0.3) / 0.5);
          r -= ch * (0.12 + bruise * 0.42); g -= ch * (0.3 + bruise * 0.2); b -= ch * (0.22 - bruise * 0.12);
          swell += ch * 0.05;
        }
        // swollen, discoloured eye: red, then purple, then closing shut
        const ey = f['eye' + s] * g2(x - sx * 0.3, (y - 0.1) * 1.3, 0.22);
        if (ey > 0.01) { r -= ey * 0.42; g -= ey * 0.64; b -= ey * 0.06; swell += ey * 0.24; const dk = M.sat((ey - 0.6) / 0.4) * 0.5; r *= 1 - dk; g *= 1 - dk; b *= 1 - dk * 0.6; }   // red, then purple, then black and swollen shut
        // cut on the cheekbone
        const cc = f['cheekCut' + s] || 0;
        if (cc > 0) {
          const c2 = g2((x - sx * 0.46) / 1.6, y + 0.05, 0.03);
          if (c2 > 0.05) { const t = c2 * cc; r = r * (1 - t) + 0.3 * t; g = g * (1 - t) + 0.02 * t; b = b * (1 - t) + 0.03 * t; }
          if (y < -0.05 && y > -0.05 - cc * 0.5) {
            const lane = Math.exp(-Math.pow((x - sx * 0.47) / 0.035, 2)) * cc * 0.6;
            r = r * (1 - lane) + 0.48 * lane; g = g * (1 - lane) + 0.03 * lane; b = b * (1 - lane) + 0.04 * lane;
          }
        }
        // cut over the brow and the blood running down from it
        const cut = f['cut' + s];
        if (cut > 0) {
          const c = g2((x - sx * 0.4) / 2.2, y - 0.29, 0.035);
          if (c > 0.05) { const t = c * cut; r = r * (1 - t) + 0.32 * t; g = g * (1 - t) + 0.02 * t; b = b * (1 - t) + 0.03 * t; }
          const bl = f['bleed' + s];
          if (bl > 0.02 && y < 0.29 && y > 0.29 - bl * 0.95) {
            const lane = Math.exp(-Math.pow((x - sx * (0.5 + (0.29 - y) * 0.12)) / (0.04 + bl * 0.03), 2));
            const fade = 1 - (0.29 - y) / (bl * 0.95 + 1e-4);
            const t = Math.min(0.75, lane * (0.25 + bl * 0.5) * M.sat(fade * 1.4));
            r = r * (1 - t) + 0.5 * t; g = g * (1 - t) + 0.03 * t; b = b * (1 - t) + 0.04 * t;
          }
        }
      }
      // split, swollen lip
      const lp = (f.lip || 0) * g2(x * 1.4, y + 0.52, 0.1);
      if (lp > 0.02) { r = r * (1 - lp * 0.6) + 0.45 * lp * 0.6; g -= lp * 0.4; b -= lp * 0.3; swell += lp * 0.05; }
      // after a long beating the whole face is flushed and puffy
      const ruin = 1 - (this.faceHp == null ? 100 : this.faceHp) / 100;
      const beat = Math.max(M.sat((1 - this.head / 100 - 0.1) / 0.6) * 0.3, ruin * 0.45, this.angryFace ? 0.62 : 0);
      if (beat > 0) { g -= beat * 0.4; b -= beat * 0.3; r -= beat * 0.1; swell += ruin * 0.05; }   // the whole face flushed, puffy and blotchy
      // angry form: a purple bruise right under the left eye
      if (this.angryFace) { const ub = g2(x - 0.3, (y + 0.0) * 1.4, 0.13); if (ub > 0.02) { r -= ub * 0.34; g -= ub * 0.42; b -= ub * 0.1; const dk = ub * 0.28; r *= 1 - dk; g *= 1 - dk; b *= 1 - dk * 0.3; swell += ub * 0.03; } }
      // nose
      const nz = f.nose * g2(x, (y + 0.22) * 0.8, 0.12);
      if (nz > 0.01) { r -= nz * 0.15; g -= nz * 0.35; b -= nz * 0.2; swell += nz * 0.06; }
      if (f.noseBleed > 0.02 && Math.abs(x) < 0.12 && y < -0.38 && y > -0.38 - f.noseBleed * 0.35) {
        const t = Math.exp(-Math.pow(x / 0.06, 2)) * f.noseBleed * 0.9;
        r = r * (1 - t) + 0.5 * t; g = g * (1 - t) + 0.02 * t; b = b * (1 - t) + 0.03 * t;
      }
    }
    col[i * 3] = Math.max(0, r); col[i * 3 + 1] = Math.max(0, g); col[i * 3 + 2] = Math.max(0, b);
    const k = 1 + swell;
    pos[i * 3] = bp[i * 3] * k; pos[i * 3 + 1] = bp[i * 3 + 1] * (1 + swell * 0.3); pos[i * 3 + 2] = bp[i * 3 + 2] * k;
  }
  void g2;
  fd.geo.attributes.color.needsUpdate = true;
  fd.geo.attributes.position.needsUpdate = true;
  fd.geo.computeVertexNormals();
  void HR;
};

// ---------------------------------------------------------------------------
// Body damage painted onto the skin: kicked legs go red, then purple; body and
// liver shots bruise the ribs; a bleeding face drips down the chest. Redrawn
// only when a damage level actually changes.
// ---------------------------------------------------------------------------
function blot(g, S, u, v, ru, rv, rgb, a) {
  if (a <= 0.01) return;
  for (const wrap of [-S, 0, S]) {
    const x = u * S + wrap, y = (1 - v) * S;
    g.save(); g.translate(x, y); g.scale(1, rv / ru);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, ru * S);
    grd.addColorStop(0, 'rgba(' + rgb + ',' + Math.min(1, a).toFixed(3) + ')');
    grd.addColorStop(0.55, 'rgba(' + rgb + ',' + Math.min(1, a * 0.6).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd; g.fillRect(-ru * S, -ru * S, ru * S * 2, ru * S * 2);
    g.restore();
  }
}
function paintLeg(g, S, side, d, calf) {
  if (d <= 0.02) return;
  const outer = side === 'L' ? 0.25 : 0.75;
  // fresh redness first, then deep purple where the shin landed again and again
  blot(g, S, outer, 0.5, 0.3, 0.42, '205,38,34', 0.62 * M.sat(d / 0.45));
  blot(g, S, 0.0, 0.52, 0.2, 0.34, '205,45,40', 0.4 * M.sat(d / 0.5));
  if (d > 0.35) blot(g, S, outer, calf ? 0.6 : 0.48, 0.16, 0.2, '105,32,88', 0.85 * M.sat((d - 0.35) / 0.45));
  if (d > 0.6) blot(g, S, outer + 0.05, calf ? 0.64 : 0.44, 0.07, 0.09, '60,18,55', 0.8 * M.sat((d - 0.6) / 0.35));
}
function paintTorso(g, S, body, liver, blood) {
  // ribs on both sides, liver on the fighter's right
  blot(g, S, 0.13, 0.36, 0.1, 0.12, '200,45,42', 0.55 * body);
  blot(g, S, 0.38, 0.36, 0.1, 0.12, '200,45,42', 0.55 * body);
  if (body > 0.4) blot(g, S, 0.13, 0.36, 0.06, 0.07, '100,32,85', 0.8 * M.sat((body - 0.4) / 0.5));
  blot(g, S, 0.37, 0.31, 0.09, 0.1, '180,40,45', 0.7 * liver);
  if (liver > 0.3) blot(g, S, 0.37, 0.31, 0.06, 0.07, '95,30,90', 0.9 * M.sat((liver - 0.3) / 0.5));
  blot(g, S, 0.25, 0.5, 0.07, 0.06, '190,50,45', 0.35 * body);
  // blood from the face: a smear under the chin and a few uneven runs down the chest
  if (blood > 0.05) {
    blot(g, S, 0.25, 0.95, 0.05, 0.03, '125,10,12', 0.55 * blood);
    const runs = [[-0.028, 0.34, 1.0], [0.012, 0.22, 0.7], [0.041, 0.28, 0.85], [-0.006, 0.12, 0.55]];
    const n = 1 + Math.round(blood * 3);
    for (let i = 0; i < n; i++) {
      const [du, lenK, wK] = runs[i];
      const u0 = 0.25 + du, len = lenK * (0.5 + blood * 0.8);
      const w0 = S * 0.012 * wK;
      g.fillStyle = 'rgba(118,8,10,' + (0.45 + blood * 0.4).toFixed(3) + ')';
      g.beginPath();
      // a run that narrows as it goes and wanders a little
      const steps = 10;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, y = (1 - (0.95 - len * t)) * S;
        const x = (u0 + Math.sin(t * 5 + i) * 0.006) * S + w0 * (1 - t * 0.8) * 0.5;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      for (let k = steps; k >= 0; k--) {
        const t = k / steps, y = (1 - (0.95 - len * t)) * S;
        const x = (u0 + Math.sin(t * 5 + i) * 0.006) * S - w0 * (1 - t * 0.8) * 0.5;
        g.lineTo(x, y);
      }
      g.closePath(); g.fill();
      blot(g, S, u0 + Math.sin(5 + i) * 0.006, 0.95 - len, 0.008, 0.011, '105,6,8', 0.8 * blood);
    }
  }
}
function repaint(mat, fn) {
  const tex = mat && mat.map;
  if (!tex || !tex.image || !tex.userData || !tex.userData.base) return;
  const c = tex.image, g = c.getContext('2d'), S = c.width;
  g.clearRect(0, 0, S, S);
  g.drawImage(tex.userData.base, 0, 0);
  fn(g, S);
  tex.needsUpdate = true;
}
P.updateBruises = function (dt) {
  this._bruiseT = (this._bruiseT || 0) - dt;
  if (this._bruiseT > 0) return;
  this._bruiseT = 0.3;
  const parts = this.body.mats.partSkins;
  if (!parts) return;
  const f = this.face || {};
  const ld = this.legDmg || { L: 0, R: 0 };
  const body = M.sat((100 - this.bodyHp) / 70), liver = M.sat((100 - (this.liver == null ? 100 : this.liver)) / 65);
  const blood = M.sat(((f.bleedL || 0) + (f.bleedR || 0) + (f.noseBleed || 0)) / 1.4);
  const key = [ld.L, ld.R, body, liver, blood].map((v) => Math.round(v * 12)).join(',');
  if (key === this._bruiseKey) return;
  this._bruiseKey = key;
  for (const side of ['L', 'R']) {
    const d = ld[side] || 0;
    for (const part of ['thigh' + side, 'calf' + side]) {
      const m = parts[part]; if (!m) continue;
      repaint(m, (g, S) => paintLeg(g, S, side, d, part.startsWith('calf')));
      // the whole leg flushes red as it keeps getting kicked
      m.color.setRGB(1, 1 - 0.28 * d, 1 - 0.3 * d);
    }
  }
  if (parts.torso) repaint(parts.torso, (g, S) => paintTorso(g, S, body, liver, blood));
};
})();

