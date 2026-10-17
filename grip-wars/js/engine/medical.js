//# sourceURL=ufc/medical.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------------
// Post-fight medical: what the fight actually did to a fighter, read from his
// state when it ended (head, face, body, liver, each leg, knockdowns, KO),
// shown as an X-ray of the whole skeleton and an MRI of the brain.
// zone keys are drawn on the X-ray; sev 0..3; weeks = time out.
// ---------------------------------------------------------------------------
function assess(f, ctx = {}) {
  const list = [];
  const add = (zone, name, sev, weeks, note) => list.push({ zone, name, sev, weeks, note: note || '' });
  const face = f.face || {}, tk = f.taken || { head: 0, bodyHp: 0, legs: 0, liver: 0 };
  const ko = !!ctx.koLoser, fh = f.faceHp == null ? 100 : f.faceHp, pk = Math.max(f.peakDaze || 0, f.daze || 0);
  const TR = { straight: 'прямых', hook: 'хуков', uppercut: 'апперкотов', body: 'ударов в корпус', lowKick: 'лоу-киков', bodyKick: 'киков в корпус', headKick: 'хай-киков', knee: 'колен', elbow: 'локтей', spinKick: 'вертушек', spinKickHead: 'вертушек', layback: 'контр' };
  const cause = (z) => { const o = (f.hitZ && f.hitZ[z]) || {}; const top = Object.keys(o).sort((a, b) => o[b] - o[a]).slice(0, 2).map((k) => TR[k] || k); return top.length ? 'от ' + top.join(' и ') : ''; };
  const brain = f.brain || 0, late = f.lateHits || 0;
  // the exam reads everything he absorbed, not what had healed by the final bell
  // brain
  if (late >= 10 || brain > 320) add('brain', 'Субдуральная гематома', 3, 22, 'удары по потерявшему защиту, наблюдение в стационаре ' + cause('head'));
  else if (ko || brain > 150 || pk > 0.9) add('brain', 'Сотрясение мозга', 3, 10, ('потеря сознания или тяжёлое состояние ' + cause('head')).trim());
  else if (brain > 70 || pk > 0.7 || f.knockdowns >= 3) add('brain', 'Сотрясение мозга', 2, 6, ('нокдауны и чистые удары ' + cause('head')).trim());
  else if (brain > 25 || f.knockdowns >= 2 || pk > 0.5) add('brain', 'Лёгкое сотрясение', 1, 3, ('головная боль, наблюдение ' + cause('head')).trim());
  if ((f.peakForce || 0) >= 100 || brain > 700) add('brain', 'Тяжёлая черепно-мозговая травма (реанимация)', 3, 40, 'удар запредельной силы, интенсивная терапия ' + cause('head'));
  if (late >= 1) add('brain', 'Лишние удары после потери защиты: ' + late, late >= 6 ? 3 : late >= 3 ? 2 : 1, Math.round(3 + late * 1.8), 'рефери остановил бой поздно: восстановление дольше');
  // face bones
  if (fh < 50 || (face.nose || 0) > 0.9) add('nose', 'Перелом носа', 2, 6, 'смещение носовой перегородки');
  else if (fh < 78 || (face.nose || 0) > 0.6) add('nose', 'Ушиб носа', 1, 2);
  for (const [s, side] of [['L', 'левой'], ['R', 'правой']]) {
    const e = face['eye' + s] || 0;
    if (fh < 35 && e > 0.8) add('orbit' + s, 'Перелом ' + side + ' глазницы и скуловой кости', 3, 12, 'КТ глазницы, осмотр окулиста');
    else if (e > 0.5) add('eye' + s, 'Гематома под ' + (s === 'L' ? 'левым' : 'правым') + ' глазом', 1, 2);
  }
  if (fh <= 0) add('jaw', 'Множественные переломы костей лица', 3, 18, 'лицо сломано, бой остановлен сдачей');
  else if (fh < 20 || (ko && f.head < 15)) add('jaw', 'Перелом нижней челюсти', 3, 14, 'пластина, жидкая диета');
  const stitches = Math.round(((face.cutL || 0) + (face.cutR || 0)) * 7 + ((face.cheekCutL || 0) + (face.cheekCutR || 0)) * 4 + (face.lip || 0) * 3);
  if (stitches > 0) add('cut', 'Рассечения: ' + stitches + ' швов', stitches > 12 ? 2 : 1, stitches > 12 ? 4 : 2, 'бровь, скула, губа');
  // body
  const ribs = Math.min(8, Math.floor(tk.bodyHp / 28));
  if (ribs >= 1) add('ribs', ribs > 1 ? 'Переломы рёбер: ' + ribs : 'Перелом ребра', ribs >= 3 ? 3 : 2, 6 + ribs, (cause('body') || 'удары в корпус'));
  else if (tk.bodyHp > 14) add('ribs', 'Ушиб рёбер', 1, 3);
  const lv = tk.liver || 0;
  if (lv > 55 || (f.liver != null && f.liver < 15)) add('liver', 'Ушиб печени с надрывом капсулы', 2, 7, 'УЗИ контроль');
  else if (lv > 25 || (f.liver != null && f.liver < 35)) add('liver', 'Ушиб печени', 1, 3, 'УЗИ контроль');
  // legs
  const ld = f.legDmg || { L: 0, R: 0 }, worse = (ld.L || 0) >= (ld.R || 0) ? 'L' : 'R';
  for (const [s, side] of [['L', 'левого'], ['R', 'правого']]) {
    const d = ld[s] || 0, mine = s === worse, gol = s === 'L' ? 'левой' : 'правой';
    if ((mine && tk.legs > 75) || d > 0.9) add('leg' + s, 'Перелом малоберцовой кости ' + gol + ' голени', 3, 10, (cause('legs') || 'лоу-кики') + ', гипс');
    else if ((mine && tk.legs > 35) || d > 0.7) add('leg' + s, 'Гематома ' + side + ' бедра, ушиб надкостницы', 2, 6, 'лоу-кики, хромота');
    else if ((mine && tk.legs > 16) || d > 0.4) add('leg' + s, 'Гематома ' + side + ' бедра', 1, 3, 'лоу-кики');
  }
  list.sort((a, b) => b.sev - a.sev);
  const weeks = list.length ? Math.round(Math.max(...list.map((x) => x.weeks)) + list.reduce((p, x) => p + x.weeks, 0) * 0.15) : 0;
  return { name: f.cfg ? f.cfg.name : '', list, weeks };
}

function snapshot(game) {
  if (!game.p1 || !game.p2) return null;
  const r = game.result || {};
  const koMethod = r.method === 'KO' || r.method === 'TKO';
  const ctx = (f) => ({ koLoser: koMethod && r.winner && r.winner !== f });
  return { opp: assess(game.p2, ctx(game.p2)), me: assess(game.p1, ctx(game.p1)), method: r.method || '' };
}

// ---------------------------------------------------------------------------
// X-ray: a front view skeleton, glowing white on dark film.
// Coordinates are fractions of the canvas; the fighter's left is on the right.
// ---------------------------------------------------------------------------
const SPOTS = {
  brain: [0.5, 0.085], nose: [0.5, 0.118], orbitL: [0.535, 0.098], orbitR: [0.465, 0.098], eyeL: [0.535, 0.104], eyeR: [0.465, 0.104],
  cut: [0.47, 0.08], jaw: [0.5, 0.155], ribs: [0.56, 0.33], liver: [0.44, 0.4], legL: [0.565, 0.72], legR: [0.435, 0.72],
};
function drawXray(cv, inj, t) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const X = (x) => x * W, Y = (y) => y * H;
  const bg = g.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.45, H * 0.7);
  bg.addColorStop(0, '#16263a'); bg.addColorStop(1, '#03070c');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // film grain
  for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(160,190,220,' + (Math.random() * 0.05).toFixed(3) + ')'; g.fillRect(Math.random() * W, Math.random() * H, 1, 1); }
  g.save();
  g.strokeStyle = 'rgba(215,232,255,0.82)'; g.fillStyle = 'rgba(200,222,250,0.18)';
  g.shadowColor = 'rgba(160,200,255,0.8)'; g.shadowBlur = 8; g.lineCap = 'round'; g.lineJoin = 'round';
  const line = (pts, w) => { g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); };
  const bone = (x0, y0, x1, y1, w) => { line([[x0, y0], [x1, y1]], w); g.beginPath(); g.arc(X(x0), Y(y0), w * 0.8, 0, 7); g.arc(X(x1), Y(y1), w * 0.8, 0, 7); g.fill(); };
  // skull
  g.lineWidth = 3; g.beginPath(); g.ellipse(X(0.5), Y(0.085), W * 0.075, H * 0.075, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(X(0.5 + sx * 0.033), Y(0.1), W * 0.021, H * 0.016, 0, 0, Math.PI * 2); g.stroke(); }
  line([[0.5, 0.108], [0.49, 0.128], [0.51, 0.128], [0.5, 0.108]], 1.6);
  g.lineWidth = 2.6; g.beginPath(); g.moveTo(X(0.445), Y(0.12)); g.quadraticCurveTo(X(0.455), Y(0.172), X(0.5), Y(0.172)); g.quadraticCurveTo(X(0.545), Y(0.172), X(0.555), Y(0.12)); g.stroke();
  for (let i = 0; i < 6; i++) line([[0.47 + i * 0.012, 0.145], [0.47 + i * 0.012, 0.153]], 1.4);
  // spine
  for (let i = 0; i < 20; i++) { const y = 0.185 + i * 0.019; g.beginPath(); g.roundRect ? g.roundRect(X(0.487), Y(y), W * 0.026, H * 0.013, 3) : g.rect(X(0.487), Y(y), W * 0.026, H * 0.013); g.fill(); g.stroke(); }
  // clavicles, ribs, sternum
  line([[0.49, 0.215], [0.42, 0.205], [0.36, 0.215]], 3); line([[0.51, 0.215], [0.58, 0.205], [0.64, 0.215]], 3);
  bone(0.5, 0.225, 0.5, 0.37, 3.5);
  for (let i = 0; i < 10; i++) {
    const y = 0.235 + i * 0.022, spread = 0.1 + Math.sin(i / 9 * Math.PI) * 0.035;
    for (const sx of [-1, 1]) { g.lineWidth = 2.2; g.beginPath(); g.moveTo(X(0.5 + sx * 0.012), Y(y)); g.bezierCurveTo(X(0.5 + sx * (spread + 0.02)), Y(y - 0.012), X(0.5 + sx * (spread + 0.03)), Y(y + 0.03), X(0.5 + sx * 0.03), Y(y + 0.045)); g.stroke(); }
  }
  // pelvis
  g.lineWidth = 3; g.beginPath(); g.moveTo(X(0.44), Y(0.565)); g.bezierCurveTo(X(0.38), Y(0.55), X(0.38), Y(0.62), X(0.45), Y(0.635)); g.lineTo(X(0.55), Y(0.635));
  g.bezierCurveTo(X(0.62), Y(0.62), X(0.62), Y(0.55), X(0.56), Y(0.565)); g.stroke();
  for (const sx of [-1, 1]) { g.beginPath(); g.arc(X(0.5 + sx * 0.035), Y(0.615), W * 0.014, 0, Math.PI * 2); g.stroke(); }
  // arms
  for (const sx of [-1, 1]) {
    bone(0.5 + sx * 0.14, 0.225, 0.5 + sx * 0.19, 0.4, 4);
    bone(0.5 + sx * 0.19, 0.405, 0.5 + sx * 0.215, 0.545, 2.6); bone(0.5 + sx * 0.2, 0.405, 0.5 + sx * 0.23, 0.54, 2.2);
    for (let k = 0; k < 4; k++) line([[0.5 + sx * (0.215 + k * 0.006), 0.555], [0.5 + sx * (0.212 + k * 0.009), 0.6]], 1.6);
  }
  // legs
  for (const sx of [-1, 1]) {
    bone(0.5 + sx * 0.06, 0.635, 0.5 + sx * 0.07, 0.805, 5);
    g.beginPath(); g.arc(X(0.5 + sx * 0.07), Y(0.812), W * 0.014, 0, Math.PI * 2); g.fill(); g.stroke();
    bone(0.5 + sx * 0.068, 0.825, 0.5 + sx * 0.066, 0.965, 4); bone(0.5 + sx * 0.085, 0.83, 0.5 + sx * 0.082, 0.96, 2);
    line([[0.5 + sx * 0.066, 0.975], [0.5 + sx * 0.1, 0.99]], 3);
  }
  g.restore();
  // injuries: pulsing glow, cracks for fractures, labels
  const pulse = 0.65 + 0.35 * Math.sin(t * 4);
  const labels = [];
  for (const it of inj.list) {
    const sp = SPOTS[it.zone]; if (!sp) continue;
    const col = it.sev >= 3 ? '255,40,40' : it.sev === 2 ? '255,110,40' : '255,200,60';
    const r = (it.zone === 'brain' ? 0.1 : it.zone.startsWith('leg') ? 0.065 : it.zone === 'ribs' || it.zone === 'liver' ? 0.06 : 0.03) * W;
    const grd = g.createRadialGradient(X(sp[0]), Y(sp[1]), 0, X(sp[0]), Y(sp[1]), r);
    grd.addColorStop(0, 'rgba(' + col + ',' + (0.55 * pulse).toFixed(3) + ')'); grd.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = grd; g.beginPath(); g.arc(X(sp[0]), Y(sp[1]), r, 0, Math.PI * 2); g.fill();
    if (/Перелом|Трещина/.test(it.name)) {
      g.strokeStyle = 'rgba(255,60,50,0.95)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(X(sp[0] - 0.02), Y(sp[1] - 0.012)); g.lineTo(X(sp[0] - 0.004), Y(sp[1] + 0.004)); g.lineTo(X(sp[0] + 0.006), Y(sp[1] - 0.006)); g.lineTo(X(sp[0] + 0.022), Y(sp[1] + 0.012)); g.stroke();
    }
    labels.push({ sp, it, col });
  }
  g.font = '600 ' + Math.round(W * 0.03) + 'px Segoe UI, Arial'; g.textBaseline = 'middle';
  // labels wrap inside their column so nothing is cut at the film's edge
  const wrap = (text, maxW) => {
    const out = []; let cur = '';
    for (const w of text.split(' ')) { const tt = cur ? cur + ' ' + w : w; if (g.measureText(tt).width > maxW && cur) { out.push(cur); cur = w; } else cur = tt; }
    if (cur) out.push(cur); return out;
  };
  const used = { L: 0.05, R: 0.05 };
  labels.forEach((L) => {
    const right = L.sp[0] >= 0.5, key = right ? 'R' : 'L';
    const lx = right ? 0.66 : 0.02;
    const lines = wrap(L.it.name, W * 0.31);
    const ly = Math.max(used[key], Math.min(0.9, L.sp[1] - 0.02));
    used[key] = ly + lines.length * 0.03 + 0.02;
    g.strokeStyle = 'rgba(' + L.col + ',0.8)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(L.sp[0]), Y(L.sp[1])); g.lineTo(X(right ? lx - 0.01 : lx + 0.3), Y(ly)); g.stroke();
    g.fillStyle = 'rgba(' + L.col + ',1)'; g.textAlign = 'left';
    lines.forEach((w, k) => g.fillText(w, X(lx), Y(ly + k * 0.03)));
  });
  g.fillStyle = 'rgba(180,210,240,0.5)'; g.font = Math.round(W * 0.028) + 'px monospace'; g.textAlign = 'left';
  g.fillText('R', X(0.03), Y(0.985)); g.textAlign = 'right'; g.fillText('L', X(0.97), Y(0.985));
}

// MRI: an axial slice of the brain; a bruised area lights up after a concussion.
function drawMri(cv, inj, t, kind) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.52;
  let rnd = 3; const rn = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
  if (kind === 'liver') {
    // abdomen: body outline, spine, liver on the image's left
    g.fillStyle = '#3a3a3a'; g.beginPath(); g.ellipse(cx, cy, W * 0.42, H * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6e6e6e'; g.beginPath(); g.ellipse(cx - W * 0.14, cy - H * 0.03, W * 0.2, H * 0.16, -0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8d8d8'; g.beginPath(); g.arc(cx, cy + H * 0.2, W * 0.05, 0, Math.PI * 2); g.fill();
    const liver = inj.list.find((x) => x.zone === 'liver');
    if (liver) { const a = 0.45 + 0.25 * Math.sin(t * 3); const grd = g.createRadialGradient(cx - W * 0.16, cy - H * 0.05, 0, cx - W * 0.16, cy - H * 0.05, W * 0.09); grd.addColorStop(0, 'rgba(20,20,20,' + (0.8).toFixed(2) + ')'); grd.addColorStop(1, 'rgba(20,20,20,0)'); g.fillStyle = grd; g.beginPath(); g.arc(cx - W * 0.16, cy - H * 0.05, W * 0.09, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,70,60,' + a.toFixed(2) + ')'; g.lineWidth = 2; g.beginPath(); g.arc(cx - W * 0.16, cy - H * 0.05, W * 0.1, 0, 7); g.stroke(); }
    label(g, W, H, 'МРТ брюшной полости', liver ? liver.name : 'без патологий');
    return;
  }
  // skull ring and brain
  g.fillStyle = '#e6e6e6'; g.beginPath(); g.ellipse(cx, cy, W * 0.36, H * 0.42, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a1a1a'; g.beginPath(); g.ellipse(cx, cy, W * 0.335, H * 0.395, 0, 0, Math.PI * 2); g.fill();
  const br = g.createRadialGradient(cx, cy, 10, cx, cy, W * 0.33);
  br.addColorStop(0, '#9a9a9a'); br.addColorStop(1, '#6a6a6a');
  g.fillStyle = br; g.beginPath(); g.ellipse(cx, cy, W * 0.32, H * 0.38, 0, 0, Math.PI * 2); g.fill();
  // gyri
  g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = 2;
  for (let i = 0; i < 46; i++) {
    const a = rn() * Math.PI * 2, rr = 0.55 + rn() * 0.4;
    const x = cx + Math.cos(a) * W * 0.32 * rr, y = cy + Math.sin(a) * H * 0.38 * rr;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (rn() - 0.5) * 30, y + (rn() - 0.5) * 30, x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.stroke();
  }
  // midline and ventricles
  g.strokeStyle = 'rgba(20,20,20,0.8)'; g.beginPath(); g.moveTo(cx, cy - H * 0.37); g.lineTo(cx, cy + H * 0.37); g.stroke();
  g.fillStyle = '#151515';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * W * 0.045, cy - H * 0.02, W * 0.03, H * 0.1, sx * 0.25, 0, Math.PI * 2); g.fill(); }
  const brain = inj.list.find((x) => x.zone === 'brain');
  if (brain) {
    // where it hit hardest: the side of the face that took more
    const a = 0.55 + 0.35 * Math.sin(t * 3.5);
    const spots = brain.sev >= 3 ? 3 : brain.sev === 2 ? 2 : 1;
    for (let i = 0; i < spots; i++) {
      const x = cx + (i % 2 ? -1 : 1) * W * (0.12 + i * 0.04), y = cy - H * (0.18 - i * 0.12);
      const grd = g.createRadialGradient(x, y, 0, x, y, W * (0.05 + brain.sev * 0.015));
      grd.addColorStop(0, 'rgba(255,245,200,' + (0.9 * a).toFixed(2) + ')'); grd.addColorStop(0.5, 'rgba(255,90,60,' + (0.5 * a).toFixed(2) + ')'); grd.addColorStop(1, 'rgba(255,60,40,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, W * (0.05 + brain.sev * 0.015), 0, Math.PI * 2); g.fill();
    }
  }
  label(g, W, H, 'МРТ головного мозга', brain ? brain.name : 'без патологий');
}
function label(g, W, H, title, sub) {
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '700 ' + Math.round(W * 0.05) + 'px Segoe UI, Arial'; g.textAlign = 'left';
  g.fillText(title, W * 0.04, H * 0.06);
  g.fillStyle = 'rgba(255,200,120,0.95)'; g.font = Math.round(W * 0.042) + 'px Segoe UI, Arial';
  g.fillText(sub, W * 0.04, H * 0.115);
}

// ---------------------------------------------------------------------------
// The overlay
// ---------------------------------------------------------------------------
let raf = null;
function open(data, who) {
  if (!data) return;
  let box = $('#medical');
  if (!box) {
    box = document.createElement('div'); box.id = 'medical';
    document.body.appendChild(box);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-med]'); if (!b) return;
      if (b.dataset.med === 'close') close();
      else open(box._data, b.dataset.med);
    });
    box.addEventListener('click', (e) => { if (e.target === box) close(); });   // a tap outside the panel closes it
    window.addEventListener('keydown', (e) => { if ((e.code === 'Escape' || e.code === 'Backspace') && box.classList.contains('show')) { close(); e.stopPropagation(); e.preventDefault(); } }, true);
  }
  box._data = data;
  who = who || 'opp';
  const inj = data[who];
  const sevName = ['—', 'лёгкая', 'средняя', 'тяжёлая'];
  box.innerHTML = '<div class="med-panel">' +
    '<div class="med-head"><h2>✚ Медосмотр</h2><div class="med-tabs">' +
      '<button class="tab' + (who === 'opp' ? ' on' : '') + '" data-med="opp">Соперник</button><button class="tab' + (who === 'me' ? ' on' : '') + '" data-med="me">Я</button></div>' +
      '</div>' +
    '<div class="med-name">' + esc(inj.name) + '</div>' +
    '<div class="med-grid"><canvas id="med-xray" width="360" height="560"></canvas>' +
      '<div class="med-side"><canvas id="med-mri" width="300" height="300"></canvas>' +
      (inj.list.some((x) => x.zone === 'liver') ? '<canvas id="med-mri2" width="300" height="220"></canvas>' : '') +
      '<div class="med-list">' + (inj.list.length ? inj.list.map((x) => '<div class="med-row s' + x.sev + '"><b>' + esc(x.name) + '</b><span>' + sevName[x.sev] + ' · ' + x.weeks + ' нед.' + (x.note ? ' · ' + esc(x.note) : '') + '</span></div>').join('') : '<div class="med-row s0"><b>Серьёзных травм нет</b><span>можно тренироваться через неделю</span></div>') +
      '</div><div class="med-total">Медицинская отстранка: <b>' + (inj.weeks || 1) + ' нед.</b></div></div></div>' +
    '<div class="med-foot"><button class="btn primary" data-med="close">✕ Закрыть</button></div></div>';
  box.classList.add('show');
  const t0 = performance.now();
  cancelAnimationFrame(raf);
  const draw = () => {
    if (!box.classList.contains('show')) return;
    const t = (performance.now() - t0) / 1000;
    const xr = $('#med-xray'), mr = $('#med-mri'), m2 = $('#med-mri2');
    if (xr) drawXray(xr, inj, t);
    if (mr) drawMri(mr, inj, t, 'brain');
    if (m2) drawMri(m2, inj, t, 'liver');
    raf = requestAnimationFrame(draw);
  };
  draw();
}
function close() { const box = $('#medical'); if (box) box.classList.remove('show'); cancelAnimationFrame(raf); }

UFC.medical = { assess, snapshot, open, close, drawXray, drawMri };
})();

