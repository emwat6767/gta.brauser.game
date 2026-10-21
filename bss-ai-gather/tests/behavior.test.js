const bot = require("../bss_ai_gather.js");
const assert = require("assert");
const W = 2400, H = 1080, P = { x: 1200, y: 600 }, KX = 0.24 * W, KY = 0.16 * W;
let failures = 0;
function slide(me, c, k, wall) { const n = { x: me.x + c.x * k, y: me.y + c.y * k }; if (!wall || !wall(n)) return n; if (!wall({ x: n.x, y: me.y })) return { x: n.x, y: me.y }; if (!wall({ x: me.x, y: n.y })) return { x: me.x, y: n.y }; return me; }
function check(name, fn) { try { fn(); console.log("OK  ", name); } catch (e) { failures++; console.log("FAIL", name, "-", e.message); } }

// детерминированный мир без шума: токены, пчёлы, стена; возвращает журнал
function world(o) {
  const cfg = Object.assign({}, bot.CFG, o.cfg || {});
  const b = bot.newBrain(cfg, W, o.learnedK || null);
  let me = { x: 0, y: 0 }, cmd = { x: 0, y: 0 }, stepEnd = 0, frame = 0, perc = { frame: -1, t: 0, tokens: [] }, fresh = [], lastShot = null;
  const tokens = (o.tokens || []).map(t => Object.assign({ alive: true, w: 1 }, t));
  const log = { modes: {}, targetsBee: 0, collected: [], escapes: 0, maxField: 0, maxPosErr: 0 };
  const zones = [{ x: P.x, y: P.y, r: cfg.PLAYER_IGNORE * W }];
  const det = (x, y) => x > 0 && x < W && y > cfg.IGNORE_TOP * H && y < (1 - cfg.IGNORE_BOTTOM) * H && !bot.inZone(x, y, zones);
  for (let t = 0; t < (o.T || 20000); t += 10) {
    if (t < stepEnd) { me = slide(me, cmd, 0.01, o.wall); }
    tokens.forEach(k => { if (k.alive && Math.hypot(k.x - me.x, k.y - me.y) < 0.25) { k.alive = false; log.collected.push(k.name || "?"); } });
    if (t % 100 === 0) {
      const seen = [];
      const pr = f => ({ x: P.x + (f.x - me.x) * KX, y: P.y - (f.y - me.y) * KY });
      tokens.forEach(k => { if (!k.alive) return; const s = pr(k); if (det(s.x, s.y)) seen.push({ x: s.x, y: s.y, w: k.w }); });
      (o.bees || []).forEach((bz, i) => { const a = bz.w * t / 1000 + i; const s = pr({ x: me.x + Math.cos(a) * bz.r, y: me.y + Math.sin(a) * bz.r }); if (det(s.x, s.y)) seen.push({ x: s.x, y: s.y, w: 1, bee: true }); });
      perc = { t, frame: frame++, tokens: seen, flow: o.noBg || !lastShot ? null : { dx: -(me.x - lastShot.x) * KX, dy: (me.y - lastShot.y) * KY, t0: t - 100 } };
      lastShot = { x: me.x, y: me.y };
      fresh.push(perc);
    }
    if (t >= stepEnd) {
      fresh.forEach(p => bot.observe(b, p, P, bot.makeDetectable(W, H, zones, cfg)));
      fresh = [];
      const d = bot.plan(b, t);
      log.modes[d.mode] = (log.modes[d.mode] || 0) + 1;
      if (d.mode === "escape" && d.jump) log.escapes++;
      if (d.target && (o.bees || []).length && !(o.tokens || []).some(k => k.alive && Math.hypot(k.x - d.target.f.x, k.y - d.target.f.y) < 0.6)) log.targetsBee++;
      bot.addMove(b, t, cfg.STEP_MS, d.fx, d.fy);
      cmd = d.fx || d.fy ? { x: d.fx / Math.hypot(d.fx, d.fy), y: d.fy / Math.hypot(d.fx, d.fy) } : { x: 0, y: 0 };
      stepEnd = t + cfg.STEP_MS;
      const pe = bot.posAt(b, t);
      log.maxPosErr = Math.max(log.maxPosErr, Math.hypot(pe.x - me.x, pe.y - me.y));
      log.maxField = Math.max(log.maxField, Math.hypot(me.x, me.y));
    }
  }
  log.k = [b.k.x / W, b.k.y / W];
  log.left = tokens.filter(k => k.alive).length;
  return log;
}

check("зрение: пятна, полоса и шум отсеиваются", () => {
  function disc(cx, cy, r) { const p = []; for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) if (x * x + y * y <= r * r) p.push({ x: cx + x, y: cy + y }); return p; }
  const pts = [].concat(disc(100, 100, 8), disc(300, 150, 7), disc(200, 220, 2));
  for (let x = 0; x < 480; x++) for (let y = 250; y < 254; y++) pts.push({ x, y });
  const toks = bot.blobsToTokens(bot.clusterPoints(pts, bot.CFG.CELL), 480 / W, 1, W, H, [], bot.CFG);
  assert.strictEqual(toks.length, 2);
  assert.strictEqual(bot.medianColor([0xFFFF0000 | 0, 0xFFFF0000 | 0, 0xFF00FF00 | 0]), "#FF0000");
});

check("собирает все токены вокруг", () => {
  const r = world({ tokens: [{ x: 1.5, y: -0.8 }, { x: -1.2, y: 1.0 }, { x: 0.3, y: 1.0 }, { x: -1.6, y: -1.0 }], T: 20000 });
  assert.strictEqual(r.left, 0, "осталось " + r.left);
});

check("помнит токен под верхним интерфейсом и всё равно его забирает", () => {
  // оба видны в начале; пока бежим к A вниз, B уходит под интерфейс сверху и виден перестаёт
  const r = world({ tokens: [{ x: 0, y: -1.0, name: "A" }, { x: 0.4, y: 0.85, name: "B" }], T: 12000 });
  assert.deepStrictEqual(r.collected.sort(), ["A", "B"]);
});

check("не гоняется за пчёлами (летают вокруг, цвет как у токена)", () => {
  const r = world({ bees: [{ r: 0.7, w: 2.0 }, { r: 1.0, w: -1.6 }, { r: 0.6, w: 2.6 }], T: 15000 });
  assert.ok(r.targetsBee <= 2, "целей-пчёл: " + r.targetsBee + " " + JSON.stringify(r.modes));
});

check("при пчёлах всё равно собирает настоящие токены", () => {
  const r = world({ bees: [{ r: 0.7, w: 2.0 }, { r: 1.0, w: -1.6 }], tokens: [{ x: 1.4, y: 0.6 }, { x: -1.0, y: -1.3 }], T: 15000 });
  assert.strictEqual(r.left, 0);
});

check("упёрся в стену: замечает, обходит, память поля не уплывает", () => {
  const wall = p => p.x > 0.8 && p.x < 1.2 && p.y > -1 && p.y < 1;   // стена между нами и токеном
  const r = world({ tokens: [{ x: 1.8, y: 0.1, name: "за стеной" }, { x: -1.5, y: 0.5, name: "свободный" }, { x: 0.3, y: -0.4 }], wall, T: 30000 });
  assert.ok(r.escapes >= 1, "манёвров: " + r.escapes);
  assert.ok(r.collected.indexOf("свободный") >= 0, "собрано: " + r.collected);
  assert.ok(r.maxPosErr < 1.0, "ошибка памяти поля: " + r.maxPosErr.toFixed(2));
});

check("упёрся в стену на пустом поле (ни одного токена): замечает по фону и не теряет поле", () => {
  const wall = p => p.y < -1.5;                       // забор снизу поля
  const r = world({ wall, T: 40000 });
  assert.ok(r.escapes >= 1, "манёвров: " + r.escapes);
  assert.ok(r.maxPosErr < 0.5, "ошибка памяти поля: " + r.maxPosErr.toFixed(2));
});

check("без фона (однотонное поле) всё равно работает по токенам", () => {
  const r = world({ tokens: [{ x: 1.5, y: -0.8 }, { x: -1.2, y: 1.0 }, { x: 0.3, y: 1.0 }, { x: -1.6, y: -1.0 }], noBg: true, T: 20000 });
  assert.strictEqual(r.left, 0, "осталось " + r.left);
});

check("учит масштаб камеры, даже если догадка сильно мимо", () => {
  const toks = []; for (let i = 0; i < 12; i++) toks.push({ x: Math.cos(i) * (1 + i % 3), y: Math.sin(i * 1.7) * (1 + (i + 1) % 3) });
  const r = world({ tokens: toks, cfg: { K_GUESS_X: 0.4, K_GUESS_Y: 0.3 }, T: 25000 });
  assert.ok(Math.abs(r.k[0] - 0.24) < 0.04 && Math.abs(r.k[1] - 0.16) < 0.03, "выучено " + r.k.map(v => v.toFixed(3)));
});

check("без токенов косит поле и не уходит с него", () => {
  const r = world({ T: 60000 });
  assert.ok(r.maxField < bot.CFG.FIELD_RADIUS * Math.SQRT2 + 0.5, "ушёл на " + r.maxField.toFixed(2));
  assert.ok((r.modes.patrol || 0) > 150);
});

check("выбор цели: важный токен чуть дальше выигрывает, далёкий важный — нет", () => {
  const cfg = bot.CFG, pos = { x: 0, y: 0 };
  const near = { id: 1, f: { x: 0.5, y: 0 }, w: 1 }, vipNear = { id: 2, f: { x: 0, y: 0.9 }, w: 3 }, vipFar = { id: 3, f: { x: 0, y: 12 }, w: 3 };
  assert.strictEqual(bot.bestTarget([near, vipNear], pos, null, cfg).id, 2);
  assert.strictEqual(bot.bestTarget([near, vipFar], pos, null, cfg).id, 1);
  // держится за текущую цель, если новая лишь чуть лучше
  const a = { id: 5, f: { x: 1.0, y: 0 }, w: 1 }, bb = { id: 6, f: { x: 0.95, y: 0 }, w: 1 };
  assert.strictEqual(bot.bestTarget([a, bb], pos, 5, cfg).id, 5);
});

check("жест джойстика: рывок до упора за малую долю шага", () => {
  const st = bot.joyStroke(300, 800, 0.6, -0.8, 144, 300), p = st.slice(2);
  let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  assert.ok(Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) / L < 0.2);
});

console.log(failures ? failures + " ТЕСТ(ОВ) НЕ ПРОШЛО" : "ВСЕ ТЕСТЫ ПРОШЛИ");
process.exit(failures ? 1 : 0);
