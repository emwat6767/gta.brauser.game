// Цикл «сбор → сдача мёда» в модели игры: старая сдача (по одному пикселю) против новой (по уровню рюкзака).
// Модель (допущения из вики/кода Natro Macro): рюкзак наполняется на поле за Tg минут; мёд делается только
// у улья после Make Honey (повторное нажатие выключает), полный рюкзак перерабатывается за Tc минут;
// ресет обычно ставит к улью (иногда — нет); полоска убывает справа. Зрение — кадры раз в 150 мс,
// с шумом, «морганием» одной точки и редкими сбойными кадрами.
const bot = require("../bss_ai_gather.js");
const assert = require("assert");
const CFG = Object.assign({}, bot.CFG, { HIVE_WALK: [], ROUTE_TO_FIELD: [[90, 8000]] });

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function game(o, R) {
  const g = { t: 0, L: 0, atHive: false, making: false, startAt: 0, gathering: true, honey: 0, Tg: o.Tg * 60000, Tc: o.Tc * 60000 };
  g.advance = ms => {
    for (let e = 0; e < ms; e += 50) {
      g.t += 50;
      if (g.gathering) g.L = Math.min(1, g.L + 50 / g.Tg);
      else if (g.making && g.atHive && g.t >= g.startAt) { const d = Math.min(g.L, 50 / g.Tc); g.L -= d; g.honey += d; if (g.L <= 0) g.making = false; }
    }
  };
  let cacheF = -1, cacheV = 0;
  g.frame = () => Math.floor(g.t / 150);
  g.level = () => {
    if (g.frame() !== cacheF) {
      cacheF = g.frame();
      let v = Math.round(g.L * 48 + (R() - 0.5) * 0.6) / 48;
      if (R() < (o.flicker || 0)) v -= 1 / 48;          // «моргнула» одна точка
      if (R() < (o.zero || 0)) v = 0;                    // сбойный кадр (что-то закрыло полоску)
      cacheV = Math.min(1, Math.max(0, v));
    }
    return cacheV;
  };
  g.endPixelFull = () => g.L > 0.98;
  g.io = {
    now: () => g.t,
    wait: ms => { g.advance(ms); return true; },
    status: () => {},
    level: () => g.level(),
    frame: () => g.frame(),
    tap: (id, after) => {
      g.gathering = false;
      if (id === "resetOk") { g.atHive = R() < o.reachHive; g.making = false; }
      if (id === "honey" && g.atHive && R() < o.tapOk) { g.making = !g.making; g.startAt = g.t + (o.delay || 0); }
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

// старая сдача — как было в коде до изменения (читает точное значение, без сбоев зрения — ей это в плюс)
function oldConvert(g) {
  const io = g.io;
  io.tap("menu", 900); io.tap("reset", 700); io.tap("resetOk", CFG.RESPAWN_MS); io.walk(CFG.HIVE_WALK);
  io.tap("honey", 2000);
  const end = g.t + 6 * 60 * 1000; // предел старой версии
  while (g.t < end && g.endPixelFull()) io.wait(1000);
  io.wait(3000);
}

function run(kind, o, seed, hours) {
  const R = rng(seed), g = game(o, R), history = [];
  let fullSince = null, cycles = 0, fails = 0, stoppedAt = null, drops = [], tries = [], streak = 0;
  while (g.t < hours * 3600000) {
    g.gathering = true; g.advance(500);
    if (g.endPixelFull()) fullSince = fullSince === null ? g.t : fullSince; else fullSince = null;
    if (fullSince !== null && g.t - fullSince >= CFG.BAG_FULL_MS) {
      fullSince = null; cycles++;
      const before = g.L;
      if (kind === "old") oldConvert(g);
      else {
        const r = bot.runConvert(g.io, CFG, history);
        if (r.result !== "ok") {
          const pol = bot.convertFailurePolicy(++streak, CFG);
          if (pol.stop) { fails++; stoppedAt = g.t; break; }       // бот останавливается и пишет причину
          g.io.walk(CFG.ROUTE_TO_FIELD); g.gathering = true; g.advance(pol.cooldownMs); fullSince = null; continue;
        }
        streak = 0;
        history.push({ ms: r.ms, drainMs: r.drainMs, drop: r.from - r.to });
        tries.push(r.tries);
      }
      drops.push(before - g.L);
      g.io.walk(CFG.ROUTE_TO_FIELD);
    }
  }
  const avg = a => a.length ? a.reduce((x, y) => x + y) / a.length : 0;
  return { perHour: g.honey / hours, cycles, fails, stoppedAt, drop: avg(drops), tries: avg(tries) }; // остановился — дальше мёда ноль
}

function many(kind, o, n, hours) {
  const r = { perHour: 0, drop: 0, tries: 0, fails: 0 };
  for (let s = 1; s <= n; s++) { const x = run(kind, o, s, hours); r.perHour += x.perHour / n; r.drop += x.drop / n; r.tries += x.tries / n; r.fails += x.fails; }
  return r;
}

const GLITCH = { flicker: 0.05, zero: 0.01 };
const SCEN = [
  ["обычно", { Tg: 4, Tc: 2, tapOk: 0.95, reachHive: 1 }],
  ["ранняя игра (сдача 20 с)", { Tg: 2, Tc: 0.33, tapOk: 0.95, reachHive: 1 }],
  ["медленная сдача 15 мин", { Tg: 6, Tc: 15, tapOk: 0.95, reachHive: 1 }],
  ["сдача 20 мин + задержка 6 с", { Tg: 6, Tc: 20, tapOk: 0.95, reachHive: 1, delay: 6000 }],
  ["нажатия часто мимо", { Tg: 4, Tc: 2, tapOk: 0.6, reachHive: 1 }],
  ["ресет иногда не к улью", { Tg: 4, Tc: 2, tapOk: 0.95, reachHive: 0.8 }],
  ["сбои зрения", Object.assign({ Tg: 4, Tc: 2, tapOk: 0.95, reachHive: 1 }, GLITCH)],
];
console.log("рюкзаков мёда в час (20 прогонов по 4 часа; в скобках — сколько рюкзака сдаётся за раз):");
for (const [name, o] of SCEN) {
  const a = many("old", o, 20, 4), b = many("new", o, 20, 4);
  console.log(`  ${name.padEnd(28)} старая ${a.perHour.toFixed(2)} (${Math.round(a.drop * 100)}%)  новая ${b.perHour.toFixed(2)} (${Math.round(b.drop * 100)}%, попыток ${b.tries.toFixed(2)}, стопов ${b.fails})  ×${(b.perHour / a.perHour).toFixed(1)}`);
  assert.ok(b.perHour > a.perHour, name);
  assert.ok(b.drop > 0.85, name + ": сдаёт почти весь рюкзак");
}
// медленная сдача: не выключает уже идущую переработку вторым нажатием
assert.ok(many("new", SCEN[3][1], 10, 3).tries < 1.2, "медленная сдача — с первой попытки");
// не у улья + «моргание» полоски: старая крутится вечно, новая останавливается с причиной
const bad = Object.assign({ Tg: 4, Tc: 2, tapOk: 0.95, reachHive: 0 }, GLITCH);
const o1 = run("old", bad, 1, 1), n1 = run("new", bad, 1, 1);
console.log(`  не у улья (+сбои зрения): старая — ${o1.cycles} бесполезных циклов за час; новая — стоп с причиной через ${(n1.stoppedAt / 60000).toFixed(1)} мин`);
assert.ok(n1.fails === 1 && n1.stoppedAt < 25 * 60000, "должна остановиться");

// уровень рюкзака по точкам полоски
assert.strictEqual(bot.bagLevelFromFlags([1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0].map(Boolean), 2), 6 / 12);
assert.strictEqual(bot.bagLevelFromFlags(new Array(10).fill(false), 2), 0);

// полоска пыльцы: 5 px толщиной, цвет от зелёного к красному, белые цифры поверх (в том числе над пустой
// частью), голубое небо вокруг, жёлтый значок рядом; палец промахнулся на 10 px
function barScreen(level) {
  const x0 = 1300, x1 = 1900, y0 = 40, fillCol = level < 0.5 ? 0xFF33DD22 | 0 : 0xFFF70017 | 0;
  return (x, y) => {
    if (y >= y0 && y < y0 + 5 && x >= x0 && x <= x1) {
      if (x > 1560 && x < 1700 && y === y0 + 2) return 0xFFFFFFFF | 0;         // цифры «1234/5000»
      return (x - x0) / (x1 - x0) <= level ? fillCol : 0xFF2A2A2A | 0;          // заполнено / пусто
    }
    if (y > 58 && y < 70 && x > 1300 && x < 1420) return 0xFFFFC000 | 0;        // жёлтый значок ниже полоски
    return 0xFF6FA8DC | 0;                                                       // небо/фон
  };
}
for (const lv of [0, 0.37, 0.45, 0.8, 1]) {
  const fit = bot.readBag(barScreen(lv), { x: 1300, y: 52 }, { x: 1900, y: 52 }, 16, 13, "#2A2A2A", bot.CFG);
  const read = bot.readBag(barScreen(lv), { x: 1300, y: 52 + fit.dy }, { x: 1900, y: 52 + fit.dy }, 48, 1, "#2A2A2A", bot.CFG).level;
  console.log(`  полоска ${Math.round(lv * 100)}% → строка сдвинута на ${fit.dy}, прочитано ${Math.round(read * 100)}%`);
  assert.ok(Math.abs(read - lv) <= 0.04, "уровень " + lv);
}
console.log("ТЕСТЫ СДАЧИ ПРОШЛИ");
