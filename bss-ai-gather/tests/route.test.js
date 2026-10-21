// Маршруты (запись по картинке и проход с поправкой), Wealth Clock по расписанию, приоритет тикетов.
const bot = require("../bss_ai_gather.js");
const assert = require("assert");
const W = 2400, H = 1080, P = { x: 1200, y: 600 };
const RCFG = Object.assign({}, bot.CFG, { LEARN_RATE: 0 });
let failures = 0;
function check(name, fn) { try { fn(); console.log("OK  ", name); } catch (e) { failures++; console.log("FAIL", name, "-", e.message); } }
function slide(me, c, k, wall) {
  const n = { x: me.x + c.x * k, y: me.y + c.y * k };
  if (!wall || !wall(n)) return n;
  if (!wall({ x: n.x, y: me.y })) return { x: n.x, y: me.y };
  if (!wall({ x: me.x, y: n.y })) return { x: me.x, y: n.y };
  return me;
}

// человек идёт сам по отрезкам [[fx, fy, ms]], бот только смотрит (сдвиг фона) и пишет маршрут
function record(segments, o) {
  o = o || {};
  const kx = 0.24 * W, ky = 0.16 * W, guess = o.kGuess || { x: 0.24, y: 0.16 };
  const b = bot.newBrain(RCFG, W, guess), rec = bot.newRecorder(0);
  let me = { x: 0, y: 0 }, last = { x: 0, y: 0 }, t = 0, frame = 0;
  for (const [fx, fy, ms] of segments) {
    for (let e = 0; e < ms; e += 10) {
      t += 10; me = slide(me, { x: fx, y: fy }, 0.01, o.wall);
      if (t % 100 === 0) {
        const lost = o.lose && (frame % 10) < o.lose * 10;
        const flow = lost ? null : { dx: -(me.x - last.x) * kx, dy: (me.y - last.y) * ky, t0: t - 100 };
        last = { x: me.x, y: me.y };
        bot.observe(b, { t, frame: frame++, tokens: [], flow }, P, () => true);
        bot.recordSample(rec, t, bot.posAt(b, t), !!flow, RCFG);
      }
    }
  }
  return { route: bot.finishRecording(rec, bot.posAt(b, t), b.k, W, RCFG), end: me };
}

// проход маршрута; speed — насколько персонаж на деле быстрее/медленнее, lag — задержка жеста
function replay(route, o) {
  o = o || {};
  const kx = 0.24 * W, ky = 0.16 * W;
  const b = bot.newBrain(RCFG, W, route.k), rt = bot.newRouteRun(route, 0);
  let me = { x: 0, y: 0 }, last = { x: 0, y: 0 }, t = 0, frame = 0, cmd = { x: 0, y: 0 }, stepEnd = 0, stepStart = 0, fresh = [], escapes = 0;
  while (t < 60000) {
    t += 10;
    if (t < stepEnd && t >= stepStart + (o.lag || 0)) me = slide(me, cmd, 0.01 * (o.speed || 1), o.wall);
    if (t % 100 === 0) {
      const lost = o.lose && (frame % 10) < o.lose * 10;
      fresh.push({ t, frame: frame++, tokens: [], flow: lost ? null : { dx: -(me.x - last.x) * kx, dy: (me.y - last.y) * ky, t0: t - 100 } });
      last = { x: me.x, y: me.y };
    }
    if (t >= stepEnd) {
      fresh.forEach(p => bot.observe(b, p, P, () => true)); fresh = [];
      const d = bot.routeStep(b, rt, t, RCFG);
      if (d.jump) escapes++;
      if (d.done) return { done: d.done, me, escapes, t };
      bot.addMove(b, t, 300, d.fx, d.fy);
      cmd = d.fx || d.fy ? { x: d.fx, y: d.fy } : { x: 0, y: 0 };
      stepStart = t; stepEnd = t + 300 + (o.lag || 0);
    }
  }
  return { done: "sim-timeout", me, escapes, t };
}

// слепой повтор тех же отрезков (как раньше делал walkRoute)
function blind(segments, o) {
  let me = { x: 0, y: 0 };
  for (const [fx, fy, ms] of segments) for (let e = 0; e < ms; e += 10) if (e >= (o.lag || 0) % 300) me = slide(me, { x: fx, y: fy }, 0.01 * (o.speed || 1), o.wall);
  return me;
}

const L_PATH = [[0, 1, 3000], [1, 0, 2000], [0, 1, 1500]];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

check("запись: конец маршрута там, куда пришёл человек", () => {
  const r = record(L_PATH);
  const e = r.route.pts[r.route.pts.length - 1];
  assert.ok(!r.route.error, r.route.error);
  assert.ok(Math.hypot(e[0] - r.end.x, e[1] - r.end.y) < 0.15, "конец " + e + " vs " + JSON.stringify(r.end));
});

check("запись без сдвига фона больше чем в 15% кадров — не сохраняется", () => {
  assert.strictEqual(record(L_PATH, { lose: 0.3 }).route.error, "lost");
});

check("проход с поправкой доходит, когда персонаж медленнее и жест запаздывает; слепой — мимо", () => {
  const r = record(L_PATH);
  const o = { speed: 0.8, lag: 60 };
  const rp = replay(r.route, o), bl = blind(L_PATH, o);
  console.log(`      с поправкой: ${rp.done}, промах ${dist(rp.me, r.end).toFixed(2)} | слепой: промах ${dist(bl, r.end).toFixed(2)}`);
  assert.strictEqual(rp.done, "ok");
  assert.ok(dist(rp.me, r.end) < 0.45);
  assert.ok(dist(bl, r.end) > 1.0);
});

check("неверный масштаб камеры при записи — проход всё равно доходит (единицы те же)", () => {
  const r = record(L_PATH, { kGuess: { x: 0.31, y: 0.21 } });
  const rp = replay(r.route, { speed: 0.9 });
  assert.strictEqual(rp.done, "ok");
  assert.ok(dist(rp.me, r.end) < 0.45, "промах " + dist(rp.me, r.end).toFixed(2));
});

check("стена с проходом: человек обошёл её, бот проходит тем же путём", () => {
  const wall = p => p.y > 1.9 && p.y < 2.1 && p.x < 0.8;
  const path = [[0, 1, 1500], [1, 0, 1200], [0, 1, 1500], [-1, 0, 1200], [0, 1, 1000]];
  const r = record(path, { wall });
  const rp = replay(r.route, { speed: 0.85, wall });
  assert.strictEqual(rp.done, "ok", rp.done);
  assert.ok(dist(rp.me, r.end) < 0.5, "промах " + dist(rp.me, r.end).toFixed(2));
});

check("новая сплошная стена на пути: честно «застрял», а не «дошёл»", () => {
  const r = record(L_PATH);
  const rp = replay(r.route, { wall: p => p.y > 1.5 && p.y < 1.7 });
  assert.ok(rp.done === "stuck" || rp.done === "timeout", rp.done);
});

check("пропуски кадров фона при проходе — доходит", () => {
  const r = record(L_PATH);
  const rp = replay(r.route, { lose: 0.3, speed: 0.9 });
  assert.strictEqual(rp.done, "ok");
  assert.ok(dist(rp.me, r.end) < 0.5, "промах " + dist(rp.me, r.end).toFixed(2));
});

check("часы: ждать до часа; потом сейчас или вместе со сдачей, если рюкзак вот-вот полный", () => {
  const cfg = bot.CFG, clk = { lastOk: 0 };
  assert.strictEqual(bot.clockPlan(3000000, clk, 0.5, 240000, cfg), "wait");
  assert.strictEqual(bot.clockPlan(3700000, clk, 0.2, 240000, cfg), "now");
  assert.strictEqual(bot.clockPlan(3700000, clk, 0.9, 240000, cfg), "combine");
  assert.strictEqual(bot.clockPlan(3700000, clk, null, null, cfg), "now");
});

check("часы: после неудачи — пауза растёт, после 3 подряд выключаются, удача всё сбрасывает", () => {
  const cfg = bot.CFG;
  let c = bot.clockAfterResult({ lastOk: 1 }, false, 1000, cfg);
  assert.ok(c.retryAt === 1000 + 5 * 60000 && !c.off);
  c = bot.clockAfterResult(c, false, 2000, cfg); assert.ok(c.retryAt === 2000 + 10 * 60000);
  c = bot.clockAfterResult(c, false, 3000, cfg); assert.ok(c.off);
  assert.strictEqual(bot.clockPlan(9e9, c, 0.1, 240000, cfg), "wait");
  c = bot.clockAfterResult(c, true, 4000, cfg); assert.ok(!c.off && c.lastOk === 4000 && c.failStreak === 0);
});

check("тикет перевешивает обычные и важные токены, если не намного дальше", () => {
  const cfg = bot.CFG, pos = { x: 0, y: 0 };
  const near = { id: 1, f: { x: 0.5, y: 0 }, w: 1 }, vip = { id: 2, f: { x: 0, y: 0.6 }, w: 3 };
  const ticket = { id: 3, f: { x: 6, y: 0 }, w: cfg.TICKET_WEIGHT }, farTicket = { id: 4, f: { x: 30, y: 0 }, w: cfg.TICKET_WEIGHT };
  assert.strictEqual(bot.bestTarget([near, vip, ticket], pos, null, cfg).id, 3);
  assert.strictEqual(bot.bestTarget([near, farTicket], pos, null, cfg).id, 1);
});

check("тикет за краем поля: бот идёт за ним дальше, чем за обычным токеном", () => {
  const cfg = bot.CFG;
  const b = bot.newBrain(cfg, W, null);
  b.map = [{ id: 1, f: { x: 6.5, y: 0 }, w: 1, hits: 5, spd: 0, fn: 0, fr: 0, seen: 0, banUntil: 0 }];
  assert.notStrictEqual(bot.plan(b, 0).mode, "token");
  b.map = [{ id: 2, f: { x: 6.5, y: 0 }, w: cfg.TICKET_WEIGHT, hits: 5, spd: 0, fn: 0, fr: 0, seen: 0, banUntil: 0 }];
  const d = bot.plan(b, 0);
  assert.ok(d.target && d.target.id === 2 && d.fx > 0.9, JSON.stringify(d));
});

check("полный рюкзак, а рядом тикет — сперва тикет; далеко — сразу в улей", () => {
  const cfg = bot.CFG, b = bot.newBrain(cfg, W, null);
  b.map = [{ id: 1, f: { x: 2, y: 1 }, w: cfg.TICKET_WEIGHT, hits: 5, spd: 0, fn: 0, fr: 0, banUntil: 0 }];
  assert.strictEqual(bot.ticketNearby(b, 0), true);
  b.map[0].f = { x: 9, y: 0 };
  assert.strictEqual(bot.ticketNearby(b, 0), false);
});

check("ложный «тикет», который не исчезает после подбора, перестаёт приманивать", () => {
  const cfg = bot.CFG, b = bot.newBrain(cfg, W, null);
  b.pickedTickets.push({ x: 0.2, y: 0.1, t: 0 });
  // тот же «тикет» снова на экране в том же месте (кусок интерфейса цвета тикета)
  bot.observe(b, { t: 100, frame: 1, tokens: [{ x: P.x + 0.2 * b.k.x, y: P.y - 0.1 * b.k.y, w: cfg.TICKET_WEIGHT }], flow: null }, P, () => true);
  assert.ok(b.map.length === 1 && b.map[0].banUntil > 100, JSON.stringify(b.map));
});

console.log(failures ? failures + " ТЕСТ(ОВ) НЕ ПРОШЛО" : "ВСЕ ТЕСТЫ МАРШРУТОВ, ЧАСОВ И ТИКЕТОВ ПРОШЛИ");
process.exit(failures ? 1 : 0);
