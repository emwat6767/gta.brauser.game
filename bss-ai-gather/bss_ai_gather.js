/**
 * BSS AI Gather — бот-сборщик для Bee Swarm Simulator на Android.
 * Запускается в приложении AutoJs6 (github.com/SuperMonster003/AutoJs6).
 *
 * Мозг:
 *  - держит карту токенов в координатах поля и ПОМНИТ токены, ушедшие под интерфейс или за край;
 *  - САМ УЧИТСЯ масштабу камеры (с учётом наклона) и точнее целится;
 *  - верит только тому, что стоит на месте в мире: летающие пчёлы и мелькания отсеиваются;
 *  - выбирает токен по выгоде: ценность против времени пути, не мечется между целями;
 *  - отличает мир от всего остального: доверяет только тому, что сдвигается на экране так,
 *    как должен сдвигаться мир, когда идёшь (пчёлы летают за тобой, интерфейс стоит на месте — не проходят);
 *  - сверяет свою позицию по картинке (визуальная одометрия): следит, как сдвигается само поле
 *    (и токены), а не только верит командам джойстика — поэтому не теряется, даже если джойстик
 *    отстаёт, персонаж разгоняется, игра лагает или на экране нет ни одного токена;
 *  - замечает застревание по тому, что поле на экране перестало сдвигаться, и обходит препятствие;
 *  - что-то мелькнуло и ушло из виду — запоминает место и, когда нечего делать, идёт проверить;
 *    сам следит, окупаются ли такие проверки, и бросает их, если это обычно пчёлы;
 *  - косит поле змейкой, когда токенов нет, и не убегает с поля;
 *  - рюкзак полный — ресет, Make Honey у улья, ждёт переработку, бежит обратно на поле.
 *
 * Управление — одна плавающая кнопка 🐝: нажми, чтобы открыть/закрыть панель (подробно в README.md).
 */

// ===================== НАСТРОЙКИ =====================
var CFG = {
    ROBLOX_PACKAGE: "com.roblox.client",

    // зрение
    VISION_WIDTH: 480,        // кадр ужимается до этой ширины для поиска
    COLOR_THRESHOLD: 28,      // насколько цвет может отличаться (0..255 по каждому каналу R, G, B)
    CELL: 5,                  // клетка для склейки точек в пятна, px уменьшенного кадра
    MIN_TOKEN_CELLS: 3,       // пятно меньше — шум
    MAX_TOKEN_CELLS: 80,      // пятно больше — это не токен (цветы, трава, интерфейс)
    MAX_POINTS_PER_COLOR: 8000, // цвет встречается слишком часто — он плохой, пропускаем
    IGNORE_TOP: 0.14,         // доля экрана сверху (интерфейс) — не смотрим
    IGNORE_BOTTOM: 0.03,
    IGNORE_LEFT: 0.0,
    IGNORE_RIGHT: 0.0,
    PLAYER_IGNORE: 0.035,     // радиус вокруг персонажа (доля ширины экрана)
    BUTTON_IGNORE: 0.08,      // радиус вокруг джойстика, прыжка, тапа, меню
    MERGE_RADIUS: 0.04,       // токены ближе этого (доля ширины) — один токен
    CAPTURE_LAG_MS: 30,       // насколько снимок экрана старше момента вызова

    // мозг
    K_GUESS_X: 0.20,          // стартовая догадка: доля ширины экрана, которую персонаж проходит за секунду по горизонтали
    K_GUESS_Y: 0.14,          // ...и по вертикали (камера под углом). Дальше бот учится сам и запоминает
    LEARN_RATE: 0.15,
    GATE: 0.05,               // радиус сопоставления токена между кадрами (доля ширины)
    CONFIRM_HITS: 2,          // сколько раз увидеть токен, чтобы поверить
    SPEED_MAX: 0.5,           // токен лежит на месте; «токен», который ползёт быстрее (сек. ходьбы в секунду), — пчела
    TRUST_RATIO: 0.4,         // объект сдвигается на экране хотя бы на 40% от ожидаемого — он часть мира
    LEARN_WINDOW: 30,         // по скольким последним замерам учить масштаб камеры
    MISS_FRAMES: 3,           // должен быть виден, но нет столько кадров — подобран/исчез
    MEMORY_MS: 12000,         // сколько помнить токен, который ушёл под интерфейс/за край
    CHECK_MS: 6000,           // мелькнуло и ушло из виду — столько помнить место, чтобы сходить проверить
    CHECK_TRUST_MIN: 0.25,    // проверки почти никогда не находят токен (это были пчёлы) — перестаём отвлекаться
    REACH: 0.15,              // ближе этого (сек. ходьбы) — подобран
    DISCOUNT: 0.8,            // ценность токена падает в 0.8 раза за каждую секунду пути до него
    PICKUP_S: 0.15,
    TARGET_STICKY: 1.15,      // новая цель должна быть лучше текущей на 15%, иначе не переключаемся
    OUTSIDE_VALUE: 0.5,       // токен за краем поля ценится вдвое меньше
    FLOW_MIN: 0.015,          // ожидаемый сдвиг картинки (доля ширины), с которого проверяем застревание
    BLOCKED_RATIO: 0.25,      // мир на экране сдвинулся меньше 25% от ожидаемого — упёрлись
    BLOCKED_FRAMES: 3,
    ESCAPE_MS: 600,           // манёвр выхода: отойти вбок с прыжком
    BAN_MS: 6000,             // сколько не соваться туда, где застряли
    BAN_ANGLE: 25,
    BUDGET_FACTOR: 2.5,       // время на погоню: 2.5× оценки пути...
    BUDGET_MS: 1500,          // ...плюс 1.5 с, потом цель бросается
    FIELD_RADIUS: 3.0,        // полуширина поля в секундах ходьбы
    SNAKE_STEP: 1.0,          // шаг змейки, секунд ходьбы
    WAYPOINT_REACH: 0.35,
    LEASH: 5.0,               // дальше этого от центра поля за токенами не бегаем

    // руки
    JOY_RADIUS: 0.06,         // насколько оттягивать джойстик (доля ширины)
    STEP_MS: 300,             // длина одного движения, потом новое решение
    AUTO_TAP: true,           // тапать инструментом (сбор пыльцы)
    TAP_EVERY_MS: 120,

    // рюкзак и улей
    BAG_DIFF: 60,             // насколько должен измениться цвет конца полоски, чтобы считать её полной
    BAG_FULL_MS: 2000,
    RESPAWN_MS: 8000,
    CONVERT_TIMEOUT_MS: 6 * 60 * 1000,
    AFTER_CONVERT_MS: 3000,
    // Маршруты: список [угол, миллисекунды]. 90 = вперёд, 0 = вправо, 180 = влево, 270 = назад.
    HIVE_WALK: [],            // от точки респавна до места, где появляется Make Honey
    ROUTE_TO_FIELD: []        // от улья до центра поля, например [[90, 4000], [0, 1500]]
};

var POINTS = [
    { id: "player", name: "на своего ПЕРСОНАЖА (в центр)" },
    { id: "joy", name: "туда, где ставишь палец для ХОДЬБЫ (слева)" },
    { id: "tap", name: "на пустое место справа, куда тапаешь, чтобы МАХАТЬ инструментом" },
    { id: "jump", name: "на кнопку ПРЫЖКА" },
    { id: "bag", name: "на правый конец полоски ПЫЛЬЦЫ (рюкзак сейчас НЕ полный)" },
    { id: "honey", name: "на кнопку MAKE HONEY (стой у улья; если не у улья — ПРОПУСК)" },
    { id: "menu", name: "на значок МЕНЮ Roblox (слева сверху) — бот сам его откроет" },
    { id: "reset", name: "на пункт RESET CHARACTER в открывшемся меню" },
    { id: "resetOk", name: "на кнопку подтверждения RESET (бот её НЕ нажмёт)" }
];

// ===================== ЛОГИКА (без телефона) =====================

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function intToHex(c) {
    return rgbToHex((c >> 16) & 255, (c >> 8) & 255, c & 255);
}

function colorDiff(a, b) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2]));
}

function medianColor(pixels) {
    var r = [], g = [], b = [];
    pixels.forEach(function (c) {
        r.push((c >> 16) & 255);
        g.push((c >> 8) & 255);
        b.push(c & 255);
    });
    function med(a) {
        a.sort(function (p, q) { return p - q; });
        return a[a.length >> 1];
    }
    return rgbToHex(med(r), med(g), med(b));
}

function dist(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

function norm(x, y) {
    var l = Math.sqrt(x * x + y * y);
    return l > 1e-9 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

function angleBetween(ax, ay, bx, by) {
    var la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
    if (la < 1e-9 || lb < 1e-9) return 0;
    var c = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    return Math.acos(c) * 180 / Math.PI;
}

// угол маршрута (90 = вперёд) -> вектор джойстика в экранных координатах (y вниз)
function angleToVec(deg) {
    var a = deg * Math.PI / 180;
    return { x: Math.cos(a), y: -Math.sin(a) };
}

// точки одного цвета -> пятна (склейка соседних клеток)
function clusterPoints(points, cell) {
    var cells = {}, i;
    for (i = 0; i < points.length; i++) {
        var p = points[i];
        var cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
        var key = cx + "," + cy;
        var c = cells[key];
        if (!c) c = cells[key] = { cx: cx, cy: cy, n: 0, sx: 0, sy: 0, seen: false };
        c.n++;
        c.sx += p.x;
        c.sy += p.y;
    }
    var blobs = [];
    for (var k in cells) {
        var start = cells[k];
        if (start.seen) continue;
        start.seen = true;
        var stack = [start];
        var b = { n: 0, sx: 0, sy: 0, cells: 0, x0: start.cx, x1: start.cx, y0: start.cy, y1: start.cy };
        while (stack.length) {
            var cur = stack.pop();
            b.n += cur.n;
            b.sx += cur.sx;
            b.sy += cur.sy;
            b.cells++;
            b.x0 = Math.min(b.x0, cur.cx);
            b.x1 = Math.max(b.x1, cur.cx);
            b.y0 = Math.min(b.y0, cur.cy);
            b.y1 = Math.max(b.y1, cur.cy);
            for (var dx = -1; dx <= 1; dx++) {
                for (var dy = -1; dy <= 1; dy++) {
                    var nb = cells[(cur.cx + dx) + "," + (cur.cy + dy)];
                    if (nb && !nb.seen) {
                        nb.seen = true;
                        stack.push(nb);
                    }
                }
            }
        }
        blobs.push({ x: b.sx / b.n, y: b.sy / b.n, n: b.n, cells: b.cells, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });
    }
    return blobs;
}

// токен в BSS — круглая монетка: компактное пятно, не длинная полоса и не огромная заливка
function looksLikeToken(blob, cfg) {
    if (blob.cells < cfg.MIN_TOKEN_CELLS || blob.cells > cfg.MAX_TOKEN_CELLS) return false;
    var aspect = blob.w / blob.h;
    if (aspect < 0.4 || aspect > 2.5) return false;
    return blob.cells / (blob.w * blob.h) >= 0.35;
}

function inZone(x, y, zones) {
    for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (z.r !== undefined) {
            if ((x - z.x) * (x - z.x) + (y - z.y) * (y - z.y) <= z.r * z.r) return true;
        } else if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
            return true;
        }
    }
    return false;
}

// пятна одного цвета (координаты уменьшенного кадра) -> токены в координатах экрана
function blobsToTokens(blobs, scale, weight, W, H, zones, cfg) {
    var out = [];
    blobs.forEach(function (b) {
        if (!looksLikeToken(b, cfg)) return;
        var x = b.x / scale, y = b.y / scale;
        if (y < cfg.IGNORE_TOP * H || y > (1 - cfg.IGNORE_BOTTOM) * H) return;
        if (x < cfg.IGNORE_LEFT * W || x > (1 - cfg.IGNORE_RIGHT) * W) return;
        if (inZone(x, y, zones)) return;
        out.push({ x: x, y: y, w: weight, size: b.cells });
    });
    return out;
}

// один токен может попасть под два цвета — оставляем один, с большей важностью
function mergeTokens(tokens, radius) {
    var out = [];
    tokens.forEach(function (t) {
        for (var i = 0; i < out.length; i++) {
            if (dist(out[i], t) < radius) {
                if (t.w > out[i].w) out[i].w = t.w;
                return;
            }
        }
        out.push({ x: t.x, y: t.y, w: t.w, size: t.size });
    });
    return out;
}

function snakeWaypoints(r, step) {
    var wps = [], left = true;
    for (var y = -r; y <= r + 1e-9; y += step) {
        wps.push(left ? [-r, y] : [r, y]);
        wps.push(left ? [r, y] : [-r, y]);
        left = !left;
    }
    for (var i = wps.length - 2; i > 0; i--) wps.push(wps[i]); // и обратно, без прыжка через поле
    return wps;
}

// ===================== МОЗГ =====================
// Координаты поля: единица = секунда ходьбы, x вправо, y вперёд (вверх по экрану).
// Джойстик управляется прямо в координатах поля, а экран связан с полем через масштаб
// камеры k (px за секунду ходьбы, отдельно по x и y — камера смотрит под углом).
// k бот выучивает сам: сравнивает, куда сдвинулись токены на экране, с тем, куда он шёл.

function median(a) {
    var s = a.slice().sort(function (p, q) { return p - q; });
    return s[s.length >> 1];
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function len(p) {
    return Math.sqrt(p.x * p.x + p.y * p.y);
}

function makeDetectable(W, H, zones, cfg) {
    return function (x, y) {
        if (x < cfg.IGNORE_LEFT * W || x > (1 - cfg.IGNORE_RIGHT) * W) return false;
        if (y < cfg.IGNORE_TOP * H || y > (1 - cfg.IGNORE_BOTTOM) * H) return false;
        return !inZone(x, y, zones);
    };
}

function newBrain(cfg, W, learnedK) {
    return {
        cfg: cfg,
        W: W,
        k: learnedK ? { x: learnedK.x * W, y: learnedK.y * W } : { x: cfg.K_GUESS_X * W, y: cfg.K_GUESS_Y * W },
        kSamples: 0,
        kxWin: [],
        kyWin: [],
        rMed: 1,                  // обычное отношение «сдвиг мира / ожидаемый сдвиг», когда идём свободно
        segs: [],                 // журнал команд джойстика: {t0, t1, vx, vy, x, y}
        corr: [],                 // поправки позиции по картинке: {t, x, y} (накопленные)
        map: [],                  // токены в координатах поля
        nextId: 1,
        lastFrame: -1,
        lastSeenT: -1,
        blockedFrames: 0,
        escape: null,             // манёвр обхода: {until, x, y, started}
        escapeBase: null,         // куда шли, когда упёрлись в первый раз
        escapeTry: 0,
        blockGraceUntil: 0,
        bans: [],                 // запрещённые направления после застревания
        target: null,
        targetDeadline: 0,
        checkId: null,            // какое мелькание сейчас идём проверять
        checkTrust: 0.5,          // как часто проверки находили настоящий токен
        lastCmd: { x: 0, y: 1 },
        wp: snakeWaypoints(cfg.FIELD_RADIUS, cfg.SNAKE_STEP),
        wpIdx: 0
    };
}

// где мы были бы в момент t, если бы джойстик слушался идеально
function rawAt(b, t) {
    for (var i = b.segs.length - 1; i >= 0; i--) {
        var g = b.segs[i];
        if (t >= g.t0) {
            var dt = (Math.min(t, g.t1) - g.t0) / 1000;
            return { x: g.x + g.vx * dt, y: g.y + g.vy * dt };
        }
    }
    return b.segs.length ? { x: b.segs[0].x, y: b.segs[0].y } : { x: 0, y: 0 };
}

function corrAt(b, t) {
    for (var i = b.corr.length - 1; i >= 0; i--) if (b.corr[i].t <= t) return b.corr[i];
    return { x: 0, y: 0 };
}

// где мы были на самом деле: команды + поправки по тому, как сдвигался мир на экране
function posAt(b, t) {
    var r = rawAt(b, t), c = corrAt(b, t);
    return { x: r.x + c.x, y: r.y + c.y };
}

// записать шаг: с момента t0 ms миллисекунд идём со скоростью (fx, fy)
function addMove(b, t0, ms, fx, fy) {
    var p = rawAt(b, t0);
    b.segs.push({ t0: t0, t1: t0 + ms, vx: fx, vy: fy, x: p.x, y: p.y });
    while (b.segs.length > 2 && b.segs[1].t1 < t0 - 10000) b.segs.shift();
}

function correct(b, t, dx, dy) {
    var c = corrAt(b, Infinity);
    b.corr.push({ t: t, x: c.x + dx, y: c.y + dy });
    while (b.corr.length > 2 && b.corr[1].t < t - 10000) b.corr.shift();
}

function toField(b, s, P, pos) {
    return { x: pos.x + (s.x - P.x) / b.k.x, y: pos.y - (s.y - P.y) / b.k.y };
}

function toScreen(b, f, P, pos) {
    return { x: P.x + (f.x - pos.x) * b.k.x, y: P.y - (f.y - pos.y) * b.k.y };
}

// часть мира: раз за разом сдвигается на экране ровно навстречу нашему движению и одинаково
// (fr — во сколько раз сдвиг больше ожидаемого, fd — насколько это скачет, fp — уход вбок).
// Пчела летает вокруг: сдвиг скачет и уходит вбок. Интерфейс стоит: fr около нуля.
// Доверие держится и пока мы упёрлись (тогда мир на экране как раз стоит).
function updateTrust(m, cfg) {
    if (m.hits >= 4 && m.fn >= 3 && m.fr > cfg.TRUST_RATIO && m.fd < 0.3 && m.fp < 0.3) m.ok = true;
    else if (m.fn >= 6 && (m.fr < 0.15 || m.fd > 0.6 || m.fp > 0.6)) m.ok = false;
}

// настоящий токен: увиден несколько раз, стоит на месте и не доказал, что он не часть мира
function isSolid(m, cfg) {
    return m.hits >= cfg.CONFIRM_HITS && m.spd < cfg.SPEED_MAX && !(m.fn >= 3 && (m.fr < 0.15 || m.fp > 0.6));
}

function pushWin(win, v, n) {
    win.push(v);
    if (win.length > n) win.shift();
}

function findById(b, id) {
    for (var i = 0; i < b.map.length; i++) if (b.map[i].id === id) return b.map[i];
    return null;
}

function banned(b, dx, dy) {
    for (var i = 0; i < b.bans.length; i++) {
        if (angleBetween(dx, dy, b.bans[i].x, b.bans[i].y) < b.cfg.BAN_ANGLE) return true;
    }
    return false;
}

// новый кадр зрения: perc = {t, frame, tokens: [{x, y, w}], flow: {dx, dy, t0} | null} в координатах экрана
// (flow — на сколько сдвинулась картинка поля с момента t0: фон виден всегда, даже без токенов)
function observe(b, perc, P, detectable) {
    var cfg = b.cfg, W = b.W;
    if (perc.frame === b.lastFrame) return;
    b.lastFrame = perc.frame;
    var t = perc.t, pos = posAt(b, t), raw = rawAt(b, t);
    var obs = perc.tokens.map(function (o) { return { x: o.x, y: o.y, w: o.w, used: false }; });

    // 1. сопоставляем увиденное с памятью: где каждый токен должен быть сейчас
    var pairs = [];
    b.map.forEach(function (m) {
        m.matched = false;
        m.pred = toScreen(b, m.f, P, pos);
        var moved = 0;
        if (m.lastT !== null) {
            var p0 = posAt(b, m.lastT);
            moved = Math.sqrt(Math.pow((pos.x - p0.x) * b.k.x, 2) + Math.pow((pos.y - p0.y) * b.k.y, 2));
        }
        var gate = Math.min(cfg.GATE * W + 0.4 * moved, 2.5 * cfg.GATE * W);
        var recent = m.lastT !== null && t - m.lastT < 1000;
        obs.forEach(function (o) {
            // ищем и там, где токен должен быть, и там, где он был, — на случай, если мы на самом деле не сдвинулись
            var d = Math.min(dist(m.pred, o), recent ? dist({ x: m.sx, y: m.sy }, o) : Infinity);
            if (d < gate) pairs.push({ m: m, o: o, d: d });
        });
    });
    pairs.sort(function (p, q) { return p.d - q.d; });
    var matches = [];
    pairs.forEach(function (pr) {
        if (pr.m.matched || pr.o.used) return;
        pr.m.matched = true;
        pr.o.used = true;
        matches.push(pr);
    });

    // 2. как сдвинулся мир на экране против того, куда мы велели идти
    var flows = [], vox = [], voy = [], voSolo = false;
    matches.forEach(function (pr) {
        var m = pr.m, o = pr.o;
        pr.fl = null;
        if (m.lastT === null || t - m.lastT > 800 || m.hits < 3) return;
        var r0 = rawAt(b, m.lastT), p0 = posAt(b, m.lastT);
        var fl = { mx: raw.x - r0.x, my: raw.y - r0.y, sx: o.x - m.sx, sy: o.y - m.sy, r: null, p: 0 };
        var ex = -fl.mx * b.k.x, ey = fl.my * b.k.y, e2 = ex * ex + ey * ey;
        if (e2 > Math.pow(cfg.FLOW_MIN * W, 2)) {
            fl.r = (fl.sx * ex + fl.sy * ey) / e2;
            fl.p = Math.abs(fl.sx * ey - fl.sy * ex) / e2;
        }
        pr.fl = fl;
        if (m.ok) {
            // проверенные объекты мира: по ним видно застревание и насколько мы сдвинулись на самом деле
            if (fl.r !== null) flows.push(fl.r);
            vox.push(-fl.sx / b.k.x - (pos.x - p0.x));
            voy.push(fl.sy / b.k.y - (pos.y - p0.y));
            voSolo = m.fn >= 8 && m.fd < 0.2 && m.fp < 0.2; // одному объекту верим, только если он давно и ровно себя ведёт
        }
    });
    // сдвиг фона: самый надёжный признак того, куда мы на самом деле сдвинулись
    var bg = null, bgVo = null;
    if (perc.flow && perc.flow.t0 < t && t - perc.flow.t0 < 1000) {
        var br0 = rawAt(b, perc.flow.t0), bp0 = posAt(b, perc.flow.t0);
        bg = { mx: raw.x - br0.x, my: raw.y - br0.y, sx: perc.flow.dx, sy: perc.flow.dy };
        var bex = -bg.mx * b.k.x, bey = bg.my * b.k.y, be2 = bex * bex + bey * bey;
        if (be2 > Math.pow(cfg.FLOW_MIN * W, 2)) flows.push((bg.sx * bex + bg.sy * bey) / be2);
        bgVo = { x: -bg.sx / b.k.x - (pos.x - bp0.x), y: bg.sy / b.k.y - (pos.y - bp0.y) };
    }

    // 3. визуальная одометрия: поправляем свою позицию по картинке
    // (по фону, а без него — по согласным между собой объектам; разошлись — в этом кадре не поправляем)
    if (bgVo && cfg.VO !== false) {
        correct(b, t, bgVo.x, bgVo.y);
        pos = posAt(b, t);
    } else if ((vox.length >= 2 || voSolo) && cfg.VO !== false) {
        var cx = median(vox), cy = median(voy), ax = 0, ay = 0, n = 0;
        for (var i = 0; i < vox.length; i++) {
            if (Math.abs(vox[i] - cx) < 0.15 && Math.abs(voy[i] - cy) < 0.15) {
                ax += vox[i];
                ay += voy[i];
                n++;
            }
        }
        if (n * 2 > vox.length) {
            correct(b, t, ax / n, ay / n);
            pos = posAt(b, t);
        }
    }
    // все проверенные объекты разом встали — это мы упёрлись, а не они плохие:
    // в таком кадре не учимся и доверие никому не пересчитываем
    var stuckFrame = flows.length > 0 && Math.max.apply(null, flows) < cfg.BLOCKED_RATIO * b.rMed;
    var frameR = flows.length ? median(flows) : null;
    var learnOk = !stuckFrame && (frameR === null || frameR > 0.5 * b.rMed);
    if (frameR !== null && frameR > 0.3 * b.rMed) b.rMed = b.rMed * 0.9 + frameR * 0.1;

    var kxN = 0, kyN = 0;
    function learnK(mx, my, sx, sy) {
        if (Math.abs(mx) > 0.05) {
            var kx = -sx / mx;
            if (kx > 0.3 * b.k.x && kx < 3.3 * b.k.x) {
                pushWin(b.kxWin, kx, cfg.LEARN_WINDOW);
                kxN++;
            }
        }
        if (Math.abs(my) > 0.05) {
            var ky = sy / my;
            if (ky > 0.3 * b.k.y && ky < 3.3 * b.k.y) {
                pushWin(b.kyWin, ky, cfg.LEARN_WINDOW);
                kyN++;
            }
        }
    }
    if (bg && learnOk) learnK(bg.mx, bg.my, bg.sx, bg.sy);
    matches.forEach(function (pr) {
        var m = pr.m, o = pr.o, fl = pr.fl;
        if (fl && fl.r !== null && !stuckFrame) {
            m.fd = m.fn ? m.fd * 0.7 + Math.abs(fl.r - m.fr) * 0.3 : 0;
            m.fp = m.fn ? m.fp * 0.7 + fl.p * 0.3 : fl.p;
            m.fr = m.fn ? m.fr * 0.7 + fl.r * 0.3 : fl.r;
            m.fn++;
            updateTrust(m, cfg);
        }
        // 4. учимся масштабу камеры только на том, что ведёт себя как часть мира
        if (fl && learnOk && m.fn >= 2 && m.fr > 0.15 && m.fp < 0.3) learnK(fl.mx, fl.my, fl.sx, fl.sy);
        var fo = toField(b, o, P, pos);
        var gap = m.lastT !== null ? t - m.lastT : Infinity;
        if (gap <= 400) {
            // скорость меряем только между соседними кадрами
            var v = dist(fo, m.f) / Math.max(0.05, gap / 1000);
            m.spd = m.hits === 1 ? v : m.spd * 0.6 + v * 0.4;
            m.f = { x: (m.f.x + fo.x) / 2, y: (m.f.y + fo.y) / 2 };
        } else {
            m.f = fo; // давно не видели — просто уточняем, где он (это не значит, что он ползёт)
        }
        m.hits++;
        m.missed = 0;
        m.lastT = t;
        m.seen = t;
        m.sx = o.x;
        m.sy = o.y;
        if (o.w > m.w) m.w = o.w;
        if (m.id === b.checkId) checkResult(b, true); // проверили — там правда что-то есть
    });

    // 5. кого не увидели: должен был быть виден — подобран/исчез; не виден — помним
    var keep = [];
    b.map.forEach(function (m) {
        if (m.matched) {
            keep.push(m);
            return;
        }
        if (m.hits < 2) {
            // мелькнул один раз: на виду и пропал — шум; ушёл из виду — запомним место, чтобы проверить
            if (!detectable(m.pred.x, m.pred.y) && t - m.seen < cfg.CHECK_MS) keep.push(m);
            else if (m.id === b.checkId) checkResult(b, false); // пришли посмотреть — пусто
            return;
        }
        if (detectable(m.pred.x, m.pred.y)) {
            if (++m.missed < cfg.MISS_FRAMES) keep.push(m);
            return;
        }
        if (t - m.seen < cfg.MEMORY_MS) keep.push(m);
    });
    obs.forEach(function (o) {
        if (o.used) return;
        keep.push({ id: b.nextId++, f: toField(b, o, P, pos), w: o.w, hits: 1, missed: 0,
            lastT: t, seen: t, sx: o.x, sy: o.y, spd: 0, fr: 0, fd: 0, fp: 0, fn: 0, ok: false, banUntil: 0 });
    });
    b.map = keep;

    // медиана по окну замеров: случайные выбросы не сбивают обучение
    if (kxN && b.kxWin.length >= 5) b.k.x = clamp(b.k.x + (median(b.kxWin) - b.k.x) * cfg.LEARN_RATE, 0.03 * W, 2 * W);
    if (kyN && b.kyWin.length >= 5) b.k.y = clamp(b.k.y + (median(b.kyWin) - b.k.y) * cfg.LEARN_RATE, 0.03 * W, 2 * W);
    b.kSamples += kxN + kyN;

    b.lastSeenT = t;

    // 6. упёрлись: ни один проверенный объект мира не сдвинулся как надо
    if (stuckFrame && t > b.blockGraceUntil) b.blockedFrames++;
    else if (flows.length && Math.max.apply(null, flows) > 0.5 * b.rMed) b.blockedFrames = 0;
}

function checkResult(b, found) {
    b.checkTrust = b.checkTrust * 0.7 + (found ? 0.3 : 0);
    b.checkId = null;
}

function tokenValue(m, cfg) {
    return m.w * (len(m.f) > cfg.FIELD_RADIUS * 1.25 ? cfg.OUTSIDE_VALUE : 1);
}

// лучший токен: ценность, которая дешевеет с каждой секундой пути; текущая цель держится,
// пока новая не станет заметно выгоднее (иначе бот мечется между двумя токенами)
function bestTarget(cands, pos, currentId, cfg) {
    var best = null, bestScore = -1, cur = null, curScore = -1;
    cands.forEach(function (m) {
        var s = tokenValue(m, cfg) * Math.pow(cfg.DISCOUNT, dist(m.f, pos) + cfg.PICKUP_S);
        if (s > bestScore) {
            bestScore = s;
            best = m;
        }
        if (m.id === currentId) {
            cur = m;
            curScore = s;
        }
    });
    return cur && curScore * cfg.TARGET_STICKY >= bestScore ? cur : best;
}

// куда отходить, когда упёрлись: назад, назад-вбок, вбок, вперёд-вбок — по очереди, мимо запрещённых
var ESCAPE_ANGLES = [180, 135, -135, 90, -90, 45, -45];

function escapeDir(b, base, tryNo) {
    for (var i = 0; i < ESCAPE_ANGLES.length; i++) {
        var a = ESCAPE_ANGLES[(tryNo + i) % ESCAPE_ANGLES.length] * Math.PI / 180;
        var x = base.x * Math.cos(a) - base.y * Math.sin(a), y = base.x * Math.sin(a) + base.y * Math.cos(a);
        if (!banned(b, x, y)) return { x: x, y: y };
    }
    return { x: -base.x, y: -base.y };
}

// решение на следующий шаг: направление джойстика в координатах поля
function plan(b, now) {
    var cfg = b.cfg, pos = posAt(b, now);
    var out = { fx: 0, fy: 0, jump: false, mode: "patrol", target: null };
    b.bans = b.bans.filter(function (x) { return x.until > now; });

    if (b.blockedFrames >= cfg.BLOCKED_FRAMES) {
        // упёрлись: направление и цель — под запрет, отходим с прыжком
        // (позицию уже поправила визуальная одометрия: картинка показала, что мы стоим)
        b.blockedFrames = 0;
        var d = b.lastCmd;
        b.bans.push({ x: d.x, y: d.y, until: now + cfg.BAN_MS });
        var tm = findById(b, b.target);
        if (tm) tm.banUntil = now + cfg.BAN_MS;
        b.target = null;
        // снова упёрлись сразу после обхода (угол) — пробуем следующее направление от исходного препятствия
        if (b.escape && now - b.escape.started < cfg.ESCAPE_MS + 1500) b.escapeTry++;
        else {
            b.escapeTry = 0;
            b.escapeBase = d;
        }
        var e = escapeDir(b, b.escapeBase, b.escapeTry);
        b.escape = { until: now + cfg.ESCAPE_MS, x: e.x, y: e.y, started: now };
        b.blockGraceUntil = now + 200; // кадры, снятые до начала манёвра, не в счёт
        out.jump = true;
    }
    if (b.escape && now < b.escape.until) {
        out.fx = b.escape.x;
        out.fy = b.escape.y;
        out.mode = "escape";
        b.lastCmd = { x: out.fx, y: out.fy };
        return out;
    }

    var cands = [];
    b.map = b.map.filter(function (m) {
        if (!isSolid(m, cfg)) return true;
        if (dist(m.f, pos) < cfg.REACH) return false; // дошли до токена — подобран
        if (m.banUntil > now || len(m.f) > cfg.LEASH || banned(b, m.f.x - pos.x, m.f.y - pos.y)) return true;
        cands.push(m);
        return true;
    });

    var cur = b.target !== null ? findById(b, b.target) : null;
    if (cur && cands.indexOf(cur) >= 0 && now > b.targetDeadline) {
        // гонимся слишком долго (не дойти или это не токен) — бросаем
        cur.banUntil = now + cfg.BAN_MS;
        cands.splice(cands.indexOf(cur), 1);
    }
    if (!cur || cands.indexOf(cur) < 0) b.target = null;

    if (cands.length) {
        var tgt = bestTarget(cands, pos, b.target, cfg);
        if (tgt.id !== b.target) {
            b.target = tgt.id;
            b.targetDeadline = now + dist(tgt.f, pos) * 1000 * cfg.BUDGET_FACTOR + cfg.BUDGET_MS;
        }
        var v = norm(tgt.f.x - pos.x, tgt.f.y - pos.y);
        out.fx = v.x;
        out.fy = v.y;
        out.mode = tgt.seen === b.lastSeenT ? "token" : "memory";
        out.target = tgt;
        b.lastCmd = v;
        return out;
    }

    // токенов нет — сходить проверить место, где что-то мелькнуло и ушло из виду
    // (если такие проверки окупаются; доверие к ним медленно восстанавливается)
    b.checkTrust += (0.5 - b.checkTrust) * 0.002;
    var probe = null, pd = Infinity;
    b.map.forEach(function (m) {
        if (m.hits !== 1 || m.banUntil > now || len(m.f) > cfg.LEASH || banned(b, m.f.x - pos.x, m.f.y - pos.y)) return;
        var d = dist(m.f, pos);
        if (d < cfg.REACH) {
            m.banUntil = now + cfg.BAN_MS; // пришли — ничего нет
            if (m.id === b.checkId) checkResult(b, false);
        } else if (d < pd) {
            pd = d;
            probe = m;
        }
    });
    if (probe && b.checkTrust < cfg.CHECK_TRUST_MIN) probe = null;
    b.checkId = probe ? probe.id : null;
    if (probe) {
        var pv0 = norm(probe.f.x - pos.x, probe.f.y - pos.y);
        out.fx = pv0.x;
        out.fy = pv0.y;
        out.mode = "check";
        b.lastCmd = pv0;
        return out;
    }

    // и этого нет — косим поле змейкой (запрещённые направления пропускаем)
    for (var tries = 0; tries < b.wp.length; tries++) {
        var wp = b.wp[b.wpIdx];
        var fx = wp[0] - pos.x, fy = wp[1] - pos.y;
        if (Math.sqrt(fx * fx + fy * fy) >= cfg.WAYPOINT_REACH && !banned(b, fx, fy)) {
            var pv = norm(fx, fy);
            out.fx = pv.x;
            out.fy = pv.y;
            b.lastCmd = pv;
            return out;
        }
        b.wpIdx = (b.wpIdx + 1) % b.wp.length;
    }
    return out;
}

// Жест джойстика. Android ведёт палец по пути с постоянной скоростью по ДЛИНЕ пути,
// поэтому после рывка до упора палец мелко дрожит на месте: рывок занимает ~1/7 шага,
// остальное время джойстик зажат до упора.
function joyStroke(jx, jy, vx, vy, R, ms) {
    var ex = jx + vx * R, ey = jy + vy * R;
    var a = Math.max(3, 0.03 * R);
    var px = -vy * a, py = vx * a;
    var path = [0, ms, [Math.round(jx), Math.round(jy)], [Math.round(ex), Math.round(ey)]];
    var legs = Math.ceil(6 * R / a);
    for (var i = 0; i < legs; i++) {
        path.push(i % 2 ? [Math.round(ex), Math.round(ey)] : [Math.round(ex + px), Math.round(ey + py)]);
    }
    return path;
}

// ===================== ТЕЛЕФОН =====================

// Кусочки поля в стороне от персонажа: в следующем кадре ищем, куда они сдвинулись.
// Места, где кнопки/джойстик/панель, пропускаем (там картинка двигается сама по себе),
// однотонный кусочек тоже не годится — совпадёт где угодно.
var BG_SPOTS = [[0.22, 0.55], [0.78, 0.55], [0.32, 0.42], [0.68, 0.42], [0.2, 0.35], [0.8, 0.35]];

function rectHitsZone(x, y, w, h, z) {
    if (z.r === undefined) return x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y;
    var cx = clamp(z.x, x, x + w), cy = clamp(z.y, y, y + h);
    return (cx - z.x) * (cx - z.x) + (cy - z.y) * (cy - z.y) < z.r * z.r;
}

// avoid — зоны в координатах уменьшенного кадра
function clipBgPatches(small, avoid) {
    var w = small.getWidth(), h = small.getHeight();
    var pw = Math.round(w * 0.1), ph = Math.round(h * 0.16);
    var spots = BG_SPOTS.map(function (sp) {
        return { x: Math.round(w * sp[0] - pw / 2), y: Math.round(h * sp[1] - ph / 2) };
    }).filter(function (sp) {
        return !avoid.some(function (z) { return rectHitsZone(sp.x, sp.y, pw, ph, z); });
    }).slice(0, 2);
    return spots.map(function (sp) {
        var x = sp.x, y = sp.y;
        var lum = [];
        for (var i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) {
                var c = images.pixel(small, x + Math.round((i + 0.5) * pw / 4), y + Math.round((j + 0.5) * ph / 4));
                lum.push(((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11);
            }
        }
        var mean = lum.reduce(function (a, v) { return a + v; }, 0) / lum.length;
        var sd = Math.sqrt(lum.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / lum.length);
        return sd < 10 ? null : { img: images.clip(small, x, y, pw, ph), x: x, y: y };
    });
}

function recyclePatches(patches) {
    (patches || []).forEach(function (p) { if (p) p.img.recycle(); });
}

// сдвиг картинки (px уменьшенного кадра) или null, если кусочки не нашлись или не согласны
function matchBgPatches(patches, small) {
    if (!patches) return null;
    var w = small.getWidth(), h = small.getHeight(), mg = Math.round(w * 0.12), res = [];
    patches.forEach(function (p) {
        if (!p) return;
        var rx = Math.max(0, p.x - mg), ry = Math.max(0, p.y - mg);
        var rw = Math.min(w - rx, p.img.getWidth() + 2 * mg), rh = Math.min(h - ry, p.img.getHeight() + 2 * mg);
        var best = images.matchTemplate(small, p.img, { threshold: 0.75, region: [rx, ry, rw, rh], max: 1, level: 0 }).best();
        if (best) res.push({ dx: best.point.x - p.x, dy: best.point.y - p.y });
    });
    if (res.length < 2 || Math.abs(res[0].dx - res[1].dx) > 3 || Math.abs(res[0].dy - res[1].dy) > 3) return null;
    return { dx: (res[0].dx + res[1].dx) / 2, dy: (res[0].dy + res[1].dy) / 2 };
}

// запустил скрипт второй раз — старая копия закрывается, чтобы не было двух панелей
function stopOtherCopies() {
    try {
        var me = engines.myEngine(), src = String(me.getSource());
        var all = engines.all();
        for (var i = 0; i < all.length; i++) {
            if (!all[i].equals(me) && String(all[i].getSource()) === src) all[i].forceStop();
        }
    } catch (err) {
        console.warn("Проверка копий скрипта: " + err);
    }
}

function main() {
    stopOtherCopies();

    var store = storages.create("bss_ai_gather_v1");
    var P = store.get("points", {});
    var tokenColors = store.get("colors", []); // [{c: "#RRGGBB", w: важность}]
    var bagEmpty = store.get("bagEmpty", null);
    var learnedK = store.get("k", null);       // выученный масштаб камеры (доли ширины экрана)

    var state = {
        running: false,
        mode: "gather",
        perception: { tokens: [], zones: [], bagFull: false, t: 0, frame: -1 },
        percQueue: [],                         // все кадры с прошлого решения — мозг смотрит каждый
        requests: [],                          // пробы цвета для потока зрения
        status: "BSS AI Gather",
        menuOpen: false,
        busy: false,                           // идёт настройка касаниями
        bubbleRect: null,
        menuRect: null
    };
    var screen = { W: 0, H: 0 };
    var brain = null;

    auto.waitFor();
    if (!requestScreenCapture(true)) {
        toast("Нет разрешения на снимок экрана");
        exit();
    }

    function metrics() {
        return context.getResources().getDisplayMetrics();
    }

    function screenW() { // Roblox всегда лёжа: ширина — большая сторона
        var m = metrics();
        return screen.W || Math.max(m.widthPixels, m.heightPixels);
    }

    // ---------- кнопка БОТ и меню: только обычные нажатия, без перетаскиваний ----------
    function dp(v) {
        return Math.round(v * metrics().density);
    }

    // Не называть элементы close, x, y, width, height, setPosition... — это имена самого окна,
    // window.close тогда вернёт функцию окна, а не кнопку.
    function rawWindow(xmlText) {
        try {
            return floaty.rawWindow(xmlText);
        } catch (e) {
            return floaty.rawWindow(new XML(xmlText)); // AutoJs6 до 6.7.0 принимает только XML
        }
    }

    var BUBBLE_DP = 60, MENU_DP = 270, MENU_H_DP = 290;
    var bubble = rawWindow(
        '<button id="btn" text="БОТ" w="60" h="60" textSize="14sp" textColor="#ffffff" bg="#cc333333"/>'
    );
    var menu = rawWindow(
        '<vertical id="root" w="270" bg="#ee1b1b1b" padding="8">' +
        '  <horizontal>' +
        '    <text id="swatch" w="16" h="16" bg="#00000000" margin="4"/>' +
        '    <text id="status" text="BSS AI Gather" textColor="#ffffff" textSize="13sp" maxLines="3" w="230"/>' +
        '  </horizontal>' +
        '  <button id="start" text="▶ СТАРТ" w="*" h="46" textSize="16sp"/>' +
        '  <horizontal>' +
        '    <button id="token" text="+ ТОКЕН" w="127" h="42"/>' +
        '    <button id="vip" text="+ ВАЖНЫЙ" w="127" h="42"/>' +
        '  </horizontal>' +
        '  <horizontal>' +
        '    <button id="points" text="ТОЧКИ" w="127" h="42"/>' +
        '    <button id="clear" text="СБРОС ЦВЕТОВ" w="127" h="42" textSize="12sp"/>' +
        '  </horizontal>' +
        '  <horizontal>' +
        '    <button id="move" text="ПЕРЕНЕСТИ БОТ" w="127" h="42" textSize="12sp"/>' +
        '    <button id="exit" text="ВЫКЛЮЧИТЬ" w="127" h="42" textSize="12sp"/>' +
        '  </horizontal>' +
        '  <button id="hide" text="✕ ЗАКРЫТЬ" w="*" h="42"/>' +
        '</vertical>'
    );

    var PICK_XML =
        '<frame id="root" w="*" h="*" bg="#26000000">' +
        '  <vertical id="bar" layout_gravity="bottom|center_horizontal" bg="#ee1b1b1b" padding="8" margin="6">' +
        '    <text id="msg" textColor="#ffffff" textSize="16sp" gravity="center" w="380"/>' +
        '    <horizontal layout_gravity="center_horizontal">' +
        '      <button id="skip" text="ПРОПУСК" w="140" h="44"/>' +
        '      <button id="cancel" text="ОТМЕНА" w="140" h="44"/>' +
        '    </horizontal>' +
        '  </vertical>' +
        '</frame>';

    // кнопка БОТ: x, y — где должен быть её центр (px); место запоминается долями экрана
    function placeBubble(x, y, save) { // только из UI-потока
        var m = metrics(), s = dp(BUBBLE_DP);
        var px = clamp(Math.round(x - s / 2), 0, Math.max(0, m.widthPixels - s));
        var py = clamp(Math.round(y - s / 2), 0, Math.max(0, m.heightPixels - s));
        bubble.setPosition(px, py);
        state.bubbleRect = { x: px, y: py, w: s, h: s };
        if (save) store.put("bubble", { fx: (px + s / 2) / m.widthPixels, fy: (py + s / 2) / m.heightPixels });
    }

    function placeBubbleSaved() { // только из UI-потока
        var m = metrics(), saved = store.get("bubble", null);
        if (saved) placeBubble(saved.fx * m.widthPixels, saved.fy * m.heightPixels, false);
        else placeBubble(dp(BUBBLE_DP / 2 + 2), m.heightPixels * 0.4, false);
    }

    // экран повернулся (скрипт запустили в AutoJs6 стоя, а Roblox — лёжа) — вернуть кнопку и меню на экран
    var fitW = 0, fitH = 0;
    function refit() { // только из UI-потока
        var m = metrics();
        if (m.widthPixels === fitW && m.heightPixels === fitH) return;
        fitW = m.widthPixels;
        fitH = m.heightPixels;
        placeBubbleSaved();
        if (state.menuOpen) setMenuOpen(true);
    }

    // меню всегда по центру экрана; спрятанное меню — окно 0×0, нажатиям не мешает
    function setMenuOpen(open) { // только из UI-потока
        state.menuOpen = open;
        if (open) {
            var m = metrics(), w = dp(MENU_DP), h = dp(MENU_H_DP);
            var x = Math.max(0, Math.round((m.widthPixels - w) / 2)), y = Math.max(0, Math.round((m.heightPixels - h) / 2));
            menu.setPosition(x, y);
            state.menuRect = { x: x, y: y, w: w, h: h };
            menu.status.setText(state.status);
        } else {
            state.menuRect = null;
        }
        menu.root.setVisibility(open ? 0 : 8);
    }

    function paintBubble() { // только из UI-потока
        bubble.btn.setBackgroundColor(android.graphics.Color.parseColor(state.running ? "#cc2e7d32" : "#cc333333"));
        menu.start.setText(state.running ? "■ СТОП" : "▶ СТАРТ");
    }

    function setStatus(s) {
        state.status = s;
        ui.run(function () { menu.status.setText(s); });
    }

    // Подсказка на весь экран и ожидание одного касания. Возвращает {x, y}, "skip" или "cancel".
    // Звать только не из UI-потока.
    function pickPoint(message, allowSkip) {
        var result = null;
        var w = rawWindow(PICK_XML);
        ui.run(function () {
            w.setSize(-1, -1);
            w.setPosition(0, 0);
            w.msg.setText(message);
            w.skip.setVisibility(allowSkip ? 0 : 8);
            w.bar.setClickable(true); // касание по самой подсказке — не выбор точки
            w.skip.click(function () { result = "skip"; });
            w.cancel.click(function () { result = "cancel"; });
            w.root.on("touch_down", function (e) {
                e.consumed = true;
                if (result === null) result = { x: Math.round(e.getRawX()), y: Math.round(e.getRawY()) };
            });
        });
        while (result === null) sleep(50);
        ui.run(function () { w.close(); });
        sleep(300); // подсказка убралась с экрана — теперь можно снимать картинку или нажимать
        return result;
    }

    // сценарий в отдельном потоке: меню на это время прячется, потом открывается снова
    function runFlow(fn) { // только из UI-потока
        if (state.busy) return;
        state.busy = true;
        if (state.running) {
            // иначе нажатия самого бота попадут в подсказку как будто это ты нажал
            state.running = false;
            saveK();
            paintBubble();
        }
        setMenuOpen(false);
        threads.start(function () {
            try {
                sleep(CFG.STEP_MS + 200); // дождаться, пока закончится движение, которое уже идёт
                fn();
            } catch (e) {
                console.error(e);
                setStatus("Ошибка: " + e);
            } finally {
                state.busy = false;
                ui.run(function () { setMenuOpen(true); });
            }
        });
    }

    function addTokenColor(weight) {
        var r = pickPoint("Нажми на " + (weight > 1 ? "ВАЖНЫЙ " : "") + "токен на экране", false);
        if (r === "cancel") {
            setStatus("Отменено");
            return;
        }
        state.requests.push({ type: "token", x: r.x, y: r.y, extra: weight });
        var end = Date.now() + 3000;
        while (state.requests.length && Date.now() < end) sleep(50); // ждём, пока возьмётся цвет
    }

    function setupPoints() {
        var openedMenu = false;
        for (var i = 0; i < POINTS.length; i++) {
            var pt = POINTS[i];
            var r = pickPoint("Шаг " + (i + 1) + " из " + POINTS.length + ". Нажми: " + pt.name, true);
            if (r === "cancel") {
                setStatus("Настройка прервана. Отмеченное сохранено");
                return;
            }
            if (r === "skip") continue;
            P[pt.id] = r;
            store.put("points", P);
            if (pt.id === "bag") {
                state.requests.push({ type: "bag", x: r.x, y: r.y });
                var end = Date.now() + 3000;
                while (state.requests.length && Date.now() < end) sleep(50); // цвет взят до следующей подсказки
            }
            // пункты меню Roblox видны, только когда меню открыто — откроем его сами
            if (pt.id === "menu") {
                press(r.x, r.y, 80);
                sleep(1200);
                openedMenu = true;
            }
            if (pt.id === "reset" && openedMenu) {
                press(r.x, r.y, 80);
                sleep(1000);
            }
        }
        setStatus(openedMenu ? "Точки сохранены. Закрой меню Roblox (Cancel) и добавь цвета: + ТОКЕН"
            : "Точки сохранены. Теперь добавь цвета: + ТОКЕН");
    }

    ui.run(function () {
        state.menuOpen = true; // при запуске меню сразу открыто
        refit();
        setMenuOpen(true);
    });

    bubble.btn.click(function () {
        refit();
        if (!state.busy) setMenuOpen(!state.menuOpen);
    });

    menu.hide.click(function () {
        setMenuOpen(false);
    });

    menu.start.click(function () {
        state.running = !state.running;
        if (state.running) {
            state.mode = "gather";
            brain = newBrain(CFG, screenW(), learnedK); // СТАРТ = стою в центре поля
            state.percQueue = [];
            setMenuOpen(false);
            setStatus("Поехали");
        } else {
            saveK();
            setStatus("Пауза");
        }
        paintBubble();
    });

    menu.exit.click(function () {
        exit();
    });

    menu.token.click(function () { runFlow(function () { addTokenColor(1); }); });
    menu.vip.click(function () { runFlow(function () { addTokenColor(3); }); });

    menu.clear.click(function () {
        tokenColors = [];
        store.put("colors", tokenColors);
        setStatus("Цвета токенов сброшены");
    });

    menu.points.click(function () {
        runFlow(setupPoints);
    });

    menu.move.click(function () {
        runFlow(function () {
            var r = pickPoint("Нажми, куда поставить кнопку БОТ", false);
            if (r !== "cancel") ui.run(function () { placeBubble(r.x, r.y, true); });
        });
    });

    function saveK() {
        if (!brain || brain.kSamples < 20) return;
        learnedK = { x: brain.k.x / brain.W, y: brain.k.y / brain.W };
        store.put("k", learnedK);
    }

    events.on("exit", function () {
        try {
            saveK();
        } catch (e) { /* выходим всё равно */ }
    });

    // ---------- поток зрения ----------
    var bagSince = 0, frame = 0, bgPatches = null, bgT = 0;
    function see() {
        if (!state.running && !state.requests.length) {
            sleep(150);
            return;
        }
        var shotT = Date.now() - CFG.CAPTURE_LAG_MS;
        var img = captureScreen();
        var W = img.getWidth(), H = img.getHeight();
        screen.W = W;
        screen.H = H;

        while (state.requests.length) {
            var rq = state.requests.shift();
            var px = [];
            for (var dx = -2; dx <= 2; dx++) {
                for (var dy = -2; dy <= 2; dy++) {
                    var x = Math.min(W - 1, Math.max(0, rq.x + dx)), y = Math.min(H - 1, Math.max(0, rq.y + dy));
                    px.push(images.pixel(img, x, y));
                }
            }
            var hex = medianColor(px);
            if (rq.type === "token") {
                tokenColors.push({ c: hex, w: rq.extra });
                store.put("colors", tokenColors);
                setStatus("Цвет " + hex + (rq.extra > 1 ? " (важный)" : "") + " добавлен. Всего: " + tokenColors.length);
            } else {
                bagEmpty = hex;
                store.put("bagEmpty", hex);
            }
            ui.run(function () { menu.swatch.setBackgroundColor(android.graphics.Color.parseColor(hex)); });
        }
        if (!state.running) return;

        var zones = [];
        if (state.bubbleRect) zones.push(state.bubbleRect);
        if (state.menuRect) zones.push(state.menuRect);
        if (P.player) zones.push({ x: P.player.x, y: P.player.y, r: CFG.PLAYER_IGNORE * W });
        ["joy", "jump", "tap", "menu"].forEach(function (id) {
            if (P[id]) zones.push({ x: P[id].x, y: P[id].y, r: CFG.BUTTON_IGNORE * W });
        });

        var scale = CFG.VISION_WIDTH / W;
        var small = images.scale(img, scale, scale);
        var tokens = [], flow = null;
        try {
            try {
                // сдвиг фона; если тут что-то сломалось — токены всё равно ищем
                var sh = shotT - bgT < 600 ? matchBgPatches(bgPatches, small) : null;
                if (sh) flow = { dx: sh.dx / scale, dy: sh.dy / scale, t0: bgT };
                recyclePatches(bgPatches);
                bgPatches = null;
                bgPatches = clipBgPatches(small, zones.map(function (z) {
                    return z.r !== undefined ? { x: z.x * scale, y: z.y * scale, r: z.r * scale + 4 }
                        : { x: z.x * scale - 4, y: z.y * scale - 4, w: z.w * scale + 8, h: z.h * scale + 8 };
                }));
                bgT = shotT;
            } catch (e) {
                console.warn("Сдвиг фона: " + e);
            }
            tokenColors.forEach(function (col) {
                var pts = images.findAllPointsForColor(small, col.c, { threshold: CFG.COLOR_THRESHOLD });
                if (pts.length > CFG.MAX_POINTS_PER_COLOR) return; // цвет везде — это фон, а не токен
                var list = [];
                for (var i = 0; i < pts.length; i++) list.push({ x: pts[i].x, y: pts[i].y });
                tokens = tokens.concat(blobsToTokens(clusterPoints(list, CFG.CELL), scale, col.w, W, H, zones, CFG));
            });
        } finally {
            small.recycle();
        }
        tokens = mergeTokens(tokens, CFG.MERGE_RADIUS * W);

        var bagFull = false;
        if (P.bag && bagEmpty) {
            var now = Date.now();
            var cur = intToHex(images.pixel(img, P.bag.x, P.bag.y));
            if (colorDiff(cur, bagEmpty) > CFG.BAG_DIFF) {
                if (!bagSince) bagSince = now;
                bagFull = now - bagSince > CFG.BAG_FULL_MS;
            } else {
                bagSince = 0;
            }
        }
        state.perception = { tokens: tokens, zones: zones, flow: flow, bagFull: bagFull, t: shotT, frame: frame++ };
        state.percQueue.push(state.perception);
        if (state.percQueue.length > 15) state.percQueue.shift();
        sleep(20);
    }

    threads.start(function () {
        while (true) {
            try {
                see();
            } catch (e) {
                console.error("Зрение: " + e);
                sleep(500);
            }
        }
    });

    // ---------- руки ----------
    function step(vx, vy, ms, opts) {
        var strokes = [];
        if (vx || vy) {
            strokes.push(joyStroke(P.joy.x, P.joy.y, vx, vy, CFG.JOY_RADIUS * screenW(), ms));
        }
        if (opts.tap && P.tap) {
            for (var t = 0; t + 60 <= ms; t += CFG.TAP_EVERY_MS) strokes.push([t, 40, [P.tap.x, P.tap.y]]);
        }
        if (opts.jump && P.jump) strokes.push([0, 80, [P.jump.x, P.jump.y]]);
        if (!strokes.length) {
            sleep(ms);
            return;
        }
        gestures.apply(null, strokes);
    }

    function alive() {
        return state.running;
    }

    function waitMs(ms) {
        var end = Date.now() + ms;
        while (Date.now() < end) {
            if (!alive()) return false;
            sleep(Math.min(200, end - Date.now()));
        }
        return alive();
    }

    function walkRoute(route) {
        for (var i = 0; i < route.length; i++) {
            var v = angleToVec(route[i][0]);
            var left = route[i][1];
            while (left > 0) {
                if (!alive()) return false;
                var ms = Math.min(CFG.STEP_MS, left);
                step(v.x, v.y, ms, {});
                left -= ms;
            }
        }
        return true;
    }

    function tapPoint(id, waitAfter) {
        press(P[id].x, P[id].y, 80);
        return waitMs(waitAfter);
    }

    function canConvert() {
        return P.menu && P.reset && P.resetOk && P.honey && P.bag && bagEmpty;
    }

    function stopRunning(msg) {
        state.running = false;
        ui.run(paintBubble);
        setStatus(msg);
    }

    function convert() {
        state.mode = "convert";
        saveK();
        setStatus("Рюкзак полный → в улей");
        if (!tapPoint("menu", 900) || !tapPoint("reset", 700) || !tapPoint("resetOk", CFG.RESPAWN_MS)) return;
        if (!walkRoute(CFG.HIVE_WALK)) return;
        if (!tapPoint("honey", 2000)) return;
        setStatus("Делаю мёд...");
        var end = Date.now() + CFG.CONVERT_TIMEOUT_MS;
        while (state.perception.bagFull && Date.now() < end) {
            if (!waitMs(1000)) return;
        }
        if (!waitMs(CFG.AFTER_CONVERT_MS)) return;
        if (!CFG.ROUTE_TO_FIELD.length) {
            stopRunning("Мёд готов. Маршрут на поле не задан — доведи персонажа и жми СТАРТ");
            return;
        }
        setStatus("Бегу на поле");
        if (!walkRoute(CFG.ROUTE_TO_FIELD)) return;
        brain = newBrain(CFG, screenW(), learnedK);
        state.percQueue = [];
        state.mode = "gather";
    }

    setStatus(P.player && P.joy ? "Готов. Встань в центр поля и жми СТАРТ" : "Сначала жми ТОЧКИ и отметь всё по порядку");

    // ---------- главный цикл ----------
    var NAMES = { token: "к токену", memory: "к токену по памяти", check: "проверяю, что мелькнуло", escape: "обхожу препятствие", patrol: "кошу поле" };
    var lastStatus = 0, lastSave = Date.now();
    var lastFit = 0;
    while (true) {
        if (Date.now() - lastFit > 1000) {
            lastFit = Date.now();
            ui.run(refit);
        }
        if (!state.running || state.busy) {
            sleep(100);
            continue;
        }
        if (!P.player || !P.joy) {
            stopRunning("Не отмечены ПЕРСОНАЖ и ДЖОЙСТИК → ТОЧКИ");
            continue;
        }
        if (currentPackage() !== CFG.ROBLOX_PACKAGE) {
            setStatus("Жду Roblox на экране...");
            state.percQueue = []; // кадры чужого экрана мозгу не нужны
            sleep(500);
            continue;
        }
        if (state.mode === "convert" || (state.perception.bagFull && canConvert())) {
            convert();
            continue;
        }
        if (screen.W && brain.W !== screen.W) brain = newBrain(CFG, screen.W, learnedK);
        var b = brain, perc = state.perception, queue = state.percQueue;
        state.percQueue = [];
        if (screen.W) {
            queue.forEach(function (q) {
                observe(b, q, P.player, makeDetectable(screen.W, screen.H, q.zones, CFG));
            });
        }
        var now = Date.now();
        var dec = plan(b, now);
        addMove(b, Date.now(), CFG.STEP_MS, dec.fx, dec.fy);
        step(dec.fx, -dec.fy, CFG.STEP_MS, { tap: CFG.AUTO_TAP, jump: dec.jump });

        if (now - lastSave > 20000) {
            lastSave = now;
            saveK();
        }
        if (now - lastStatus > 700) {
            lastStatus = now;
            var solid = b.map.filter(function (m) { return isSolid(m, CFG); }).length;
            setStatus(NAMES[dec.mode] +
                " | вижу: " + perc.tokens.length + " | помню: " + solid +
                (b.kSamples > 30 ? " | камера изучена" : " | изучаю камеру") +
                (perc.bagFull ? " | рюкзак ПОЛНЫЙ" : ""));
        }
    }
}

if (typeof floaty === "undefined") {
    module.exports = {
        CFG: CFG, clusterPoints: clusterPoints, looksLikeToken: looksLikeToken, blobsToTokens: blobsToTokens,
        mergeTokens: mergeTokens, snakeWaypoints: snakeWaypoints, medianColor: medianColor, colorDiff: colorDiff,
        angleToVec: angleToVec, intToHex: intToHex, joyStroke: joyStroke, inZone: inZone, escapeDir: escapeDir,
        newBrain: newBrain, observe: observe, plan: plan, addMove: addMove, posAt: posAt,
        makeDetectable: makeDetectable, isSolid: isSolid, bestTarget: bestTarget,
        clipBgPatches: clipBgPatches, matchBgPatches: matchBgPatches, rectHitsZone: rectHitsZone
    };
} else {
    main();
}
