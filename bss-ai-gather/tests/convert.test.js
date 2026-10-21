// Цикл «сбор → сдача мёда» в модели игры: старая сдача (по одному пикселю) против новой (с проверкой уровня).
// Модель (допущения): рюкзак наполняется на поле за Tg минут; мёд делается только у улья после Make Honey,
// полный рюкзак перерабатывается за Tc минут; ресет ставит персонажа к улью; полоска убывает справа.
const bot = require("../bss_ai_gather.js");
const assert = require("assert");
const CFG = Object.assign({}, bot.CFG, { HIVE_WALK: [], ROUTE_TO_FIELD: [[90, 8000]] });

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function game(o, R) {
  const g = { t: 0, L: 0, atHive: false, making: false, gathering: true, honey: 0, Tg: o.Tg * 60000, Tc: o.Tc * 60000, wasted: 0 };
  g.advance = ms => {
    for (let e = 0; e < ms; e += 100) {
      g.t += 100;
      if (g.gathering) g.L = Math.min(1, g.L + 100 / g.Tg);
      else if (g.making && g.atHive) { const d = Math.min(g.L, 100 / g.Tc); g.L -= d; g.honey += d; if (g.L <= 0) g.making = false; }
    }
  };
  g.level = () => Math.min(1, Math.max(0, Math.round(g.L * 48 + (R() - 0.5) * 0.6) / 48));
  g.endPixelFull = () => g.L > 0.98;
  g.io = {
    now: () => g.t,
    wait: ms => { g.advance(ms); return true; },
    status: () => {},
    level: () => g.level(),
    tap: (id, after) => {
      g.gathering = false;
      if (id === "resetOk") { g.atHive = R() < o.reachHive; g.making = false; }
      if (id === "honey" && g.atHive && R() < o.tapOk) g.making = !g.making; // Make Honey включает/выключает
      g.advance(after);
      return true;
    },
    walk: route => {
      for (const [, ms] of route) g.advance(ms);
      if (route.length) { g.atHive = false; g.making = false; }
      return true;
    }
  };
  return g;
}

// старая сдача — как было в коде до этого изменения
function oldConvert(g) {
  const io = g.io;
  io.tap("menu", 900); io.tap("reset", 700); io.tap("resetOk", CFG.RESPAWN_MS); io.walk(CFG.HIVE_WALK);
  io.tap("honey", 2000);
  const end = g.t + CFG.CONVERT_TIMEOUT_MS;
  let full = 0;
  while (g.t < end) { full = g.endPixelFull() ? full + 1000 : 0; if (!g.endPixelFull()) break; io.wait(1000); }
  io.wait(3000);
  return { ok: true };
}

function run(kind, o, seed, hours) {
  const R = rng(seed), g = game(o, R), history = [];
  let fullSince = null, cycles = 0, fails = 0, stoppedAt = null;
  while (g.t < hours * 3600000) {
    g.gathering = true; g.advance(500);
    if (g.endPixelFull()) fullSince = fullSince === null ? g.t : fullSince; else fullSince = null;
    if (fullSince !== null && g.t - fullSince >= CFG.BAG_FULL_MS) {
      fullSince = null; cycles++;
      if (kind === "old") oldConvert(g);
      else {
        const r = bot.runConvert(g.io, CFG, history);
        if (r.result !== "ok") { fails++; stoppedAt = g.t; break; } // бот останавливается и пишет причину
        history.push({ ms: r.ms, drop: r.from - r.to });
      }
      g.io.walk(CFG.ROUTE_TO_FIELD);
    }
  }
  return { honey: g.honey, perHour: g.honey / hours, cycles, fails, stoppedAt }; // остановился — дальше мёда ноль
}

const SCEN = [
  ["обычно", { Tg: 4, Tc: 2, tapOk: 0.95, reachHive: 1 }],
  ["медленная переработка", { Tg: 3, Tc: 5, tapOk: 0.95, reachHive: 1 }],
  ["нажатия часто мимо", { Tg: 4, Tc: 2, tapOk: 0.6, reachHive: 1 }],
];
console.log("рюкзаков мёда в час (среднее по 20 прогонам по 4 часа):");
for (const [name, o] of SCEN) {
  let a = 0, b = 0;
  for (let s = 1; s <= 20; s++) { a += run("old", o, s, 4).perHour; b += run("new", o, s, 4).perHour; }
  a /= 20; b /= 20;
  console.log(`  ${name.padEnd(24)} старая ${a.toFixed(2)}  новая ${b.toFixed(2)}  (×${(b / a).toFixed(1)})`);
  assert.ok(b > a, name);
}
// не у улья (маршрут к улью неверный): старая крутится вечно, новая останавливается с причиной
const bad = { Tg: 4, Tc: 2, tapOk: 0.95, reachHive: 0 };
const o1 = run("old", bad, 1, 1), n1 = run("new", bad, 1, 1);
console.log(`  не у улья: старая — ${o1.cycles} бесполезных циклов за час; новая — стоп с причиной через ${(n1.stoppedAt / 60000).toFixed(1)} мин`);
assert.ok(n1.fails === 1 && n1.stoppedAt < 10 * 60000);
// уровень рюкзака по полоске с цифрами поверх
assert.strictEqual(bot.bagLevelFromFlags([1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0].map(Boolean), 2), 6 / 12);
assert.strictEqual(bot.bagLevelFromFlags(new Array(10).fill(false), 2), 0);
console.log("ТЕСТЫ СДАЧИ ПРОШЛИ");
