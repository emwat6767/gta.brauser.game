/**
 * BSS AI Gather — бот-сборщик для Bee Swarm Simulator на Android.
 * Запускается в приложении AutoJs6 (github.com/SuperMonster003/AutoJs6).
 *
 * Что умеет:
 *  - видит токены на экране (по цвету + форма похожа на круг);
 *  - выбирает самый выгодный токен: важность / расстояние, не дёргается между целями;
 *  - бежит к нему джойстиком под любым углом и добегает, когда токен подобран;
 *  - если токенов нет — косит поле змейкой и тапает инструментом;
 *  - помнит, где центр поля, и не убегает далеко за токенами (поводок);
 *  - застрял — прыгает и временно игнорирует эту цель;
 *  - рюкзак полный — ресет, Make Honey у улья, ждёт переработку, бежит обратно на поле.
 *
 * Управление — плавающая панель поверх игры (подробно в README.md).
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

    // мозг
    STICKY: 1.4,              // бонус текущей цели, чтобы не метаться
    SAME_ANGLE: 30,           // градусов: насколько может сместиться направление на ту же цель
    CLOSE: 0.07,              // цель ближе этого (доля ширины) и пропала = подобрали
    OVERSHOOT_MS: 300,        // сколько добегать после подбора
    STUCK_MS: 2500,           // не приближаемся столько — застряли
    BLACKLIST_MS: 6000,       // сколько игнорировать направление, в котором застряли
    BLACKLIST_ANGLE: 25,      // градусов вокруг этого направления
    MERGE_RADIUS: 0.04,       // токены ближе этого (доля ширины) — один токен
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
    { id: "player", name: "ПЕРСОНАЖ — центр твоего персонажа" },
    { id: "joy", name: "ДЖОЙСТИК — где ставишь палец слева" },
    { id: "tap", name: "ТАП — пустое место справа (махать инструментом)" },
    { id: "jump", name: "ПРЫЖОК — кнопка прыжка" },
    { id: "bag", name: "РЮКЗАК — конец полоски пыльцы (рюкзак НЕ полный)" },
    { id: "menu", name: "МЕНЮ — значок Roblox слева сверху" },
    { id: "reset", name: "RESET CHARACTER — открой меню и наведи" },
    { id: "resetOk", name: "RESET — кнопка подтверждения" },
    { id: "honey", name: "MAKE HONEY — встань у улья и наведи на кнопку" }
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

function newBrain(cfg) {
    return {
        pos: { x: 0, y: 0 },      // где мы относительно центра поля, в секундах ходьбы (y — вперёд)
        wp: snakeWaypoints(cfg.FIELD_RADIUS, cfg.SNAKE_STEP),
        wpIdx: 0,
        track: null,              // текущая цель: {dx, dy, d} относительно персонажа
        trackBest: 0,
        trackImprovedAt: 0,
        posAtImprove: { x: 0, y: 0 },
        lastVec: null,
        overshootUntil: 0,
        blacklist: []
    };
}

// главное решение: куда тянуть джойстик на следующий шаг
function decide(brain, tokens, player, W, now, cfg) {
    var out = { vx: 0, vy: 0, jump: false, mode: "patrol", target: null };
    brain.blacklist = brain.blacklist.filter(function (b) { return b.until > now; });
    var cands = tokens.filter(function (t) {
        return brain.blacklist.every(function (b) {
            return angleBetween(t.x - player.x, t.y - player.y, b.dx, b.dy) > cfg.BLACKLIST_ANGLE;
        });
    });

    // поводок: убежали далеко от поля — берём только токены в сторону поля
    var px = brain.pos.x, py = brain.pos.y;
    if (Math.sqrt(px * px + py * py) > cfg.LEASH) {
        cands = cands.filter(function (t) {
            return (t.x - player.x) * px + (-(t.y - player.y)) * py < 0;
        });
    }

    function sameAsTrack(t) {
        if (!brain.track) return false;
        var dx = t.x - player.x, dy = t.y - player.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        return angleBetween(dx, dy, brain.track.dx, brain.track.dy) < cfg.SAME_ANGLE &&
            d < brain.track.d + 0.05 * W;
    }

    var k = 0.05 * W, best = null, bestScore = 0;
    cands.forEach(function (t) {
        var s = t.w / (dist(t, player) + k);
        if (sameAsTrack(t)) s *= cfg.STICKY;
        if (s > bestScore) {
            bestScore = s;
            best = t;
        }
    });

    var closeDist = cfg.CLOSE * W;
    if (best) {
        var d = dist(best, player);
        if (!sameAsTrack(best)) {
            // сменили цель; если прошлая была вплотную — её подобрали, добегаем
            if (brain.track && brain.track.d < closeDist) brain.overshootUntil = now + cfg.OVERSHOOT_MS;
            brain.trackBest = d;
            brain.trackImprovedAt = now;
            brain.posAtImprove = { x: px, y: py };
        } else if (d < brain.trackBest - 0.01 * W) {
            brain.trackBest = d;
            brain.trackImprovedAt = now;
            brain.posAtImprove = { x: px, y: py };
        } else if (now - brain.trackImprovedAt > cfg.STUCK_MS) {
            // всё это время стояли на месте — память поля откатываем
            brain.pos = { x: brain.posAtImprove.x, y: brain.posAtImprove.y };
            brain.blacklist.push({ dx: best.x - player.x, dy: best.y - player.y, until: now + cfg.BLACKLIST_MS });
            brain.track = null;
            out.jump = true;
            best = null;
        }
        if (best) {
            brain.track = { dx: best.x - player.x, dy: best.y - player.y, d: d };
            out.target = best;
            if (now < brain.overshootUntil && brain.lastVec) {
                out.vx = brain.lastVec.x;
                out.vy = brain.lastVec.y;
                out.mode = "overshoot";
                return out;
            }
            var v = norm(best.x - player.x, best.y - player.y);
            brain.lastVec = v;
            out.vx = v.x;
            out.vy = v.y;
            out.mode = "token";
            return out;
        }
    } else if (brain.track) {
        if (brain.track.d < closeDist) brain.overshootUntil = now + cfg.OVERSHOOT_MS;
        brain.track = null;
    }

    if (now < brain.overshootUntil && brain.lastVec) {
        out.vx = brain.lastVec.x;
        out.vy = brain.lastVec.y;
        out.mode = "overshoot";
        return out;
    }

    // токенов нет — косим поле змейкой
    var wp = brain.wp[brain.wpIdx];
    var fx = wp[0] - px, fy = wp[1] - py;
    if (Math.sqrt(fx * fx + fy * fy) < cfg.WAYPOINT_REACH) {
        brain.wpIdx = (brain.wpIdx + 1) % brain.wp.length;
        wp = brain.wp[brain.wpIdx];
        fx = wp[0] - px;
        fy = wp[1] - py;
    }
    var pv = norm(fx, -fy); // поле: y вперёд, экран: y вниз
    out.vx = pv.x;
    out.vy = pv.y;
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

// отметить, что прошли шаг: обновить позицию на поле
function integrate(brain, vx, vy, ms) {
    brain.pos.x += vx * ms / 1000;
    brain.pos.y -= vy * ms / 1000;
}

// ===================== ТЕЛЕФОН =====================

function main() {
    var store = storages.create("bss_ai_gather_v1");
    var P = store.get("points", {});
    var tokenColors = store.get("colors", []); // [{c: "#RRGGBB", w: важность}]
    var bagEmpty = store.get("bagEmpty", null);

    var state = {
        running: false,
        mode: "gather",
        status: "",
        perception: { tokens: [], bagFull: false, t: 0 },
        requests: [],                          // пробы цвета для потока зрения
        aimVisible: false,
        aimCenter: null,
        wizard: -1,
        panelRect: null,
        aimRect: null
    };
    var brain = newBrain(CFG);
    var screen = { W: 0, H: 0 };

    auto.waitFor();
    if (!requestScreenCapture(true)) {
        toast("Нет разрешения на снимок экрана");
        exit();
    }

    var dm = context.getResources().getDisplayMetrics();

    // ---------- панель ----------
    var panel = floaty.window(
        '<vertical bg="#cc111111" padding="4">' +
        '  <horizontal>' +
        '    <text id="swatch" w="14" h="14" bg="#00000000" margin="2"/>' +
        '    <text id="status" text="BSS AI Gather (тяни меня)" textColor="#ffffff" textSize="11sp" maxLines="3" w="190"/>' +
        '  </horizontal>' +
        '  <horizontal>' +
        '    <button id="start" text="СТАРТ" w="72" h="38" textSize="10sp"/>' +
        '    <button id="aim" text="ПРИЦЕЛ" w="72" h="38" textSize="10sp"/>' +
        '    <button id="exit" text="ВЫХОД" w="72" h="38" textSize="10sp"/>' +
        '  </horizontal>' +
        '  <horizontal>' +
        '    <button id="token" text="+ТОКЕН" w="72" h="38" textSize="10sp"/>' +
        '    <button id="vip" text="+ВАЖНЫЙ" w="72" h="38" textSize="10sp"/>' +
        '    <button id="clear" text="СБРОС" w="72" h="38" textSize="10sp"/>' +
        '  </horizontal>' +
        '  <horizontal>' +
        '    <button id="point" text="ТОЧКИ" w="108" h="38" textSize="10sp"/>' +
        '    <button id="skip" text="ПРОПУСК" w="108" h="38" textSize="10sp"/>' +
        '  </horizontal>' +
        '</vertical>'
    );

    var aim = floaty.rawWindow(
        '<frame id="root" w="90" h="90">' +
        '  <text bg="#ff2020" w="3" h="34" layout_gravity="top|center_horizontal"/>' +
        '  <text bg="#ff2020" w="3" h="34" layout_gravity="bottom|center_horizontal"/>' +
        '  <text bg="#ff2020" w="34" h="3" layout_gravity="left|center_vertical"/>' +
        '  <text bg="#ff2020" w="34" h="3" layout_gravity="right|center_vertical"/>' +
        '</frame>'
    );

    function viewRect(view) {
        var loc = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 2);
        view.getLocationOnScreen(loc);
        return { x: loc[0], y: loc[1], w: view.getWidth(), h: view.getHeight() };
    }

    function refreshRects() {
        try {
            state.panelRect = viewRect(panel.status.getRootView());
            if (state.aimVisible) {
                var r = viewRect(aim.root);
                state.aimRect = r;
                state.aimCenter = { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
            } else {
                state.aimRect = null;
            }
        } catch (e) { /* окно ещё не разложено */ }
    }

    function makeDraggable(win, view) {
        var ME = android.view.MotionEvent;
        var sx = 0, sy = 0, wx = 0, wy = 0;
        view.setOnTouchListener(function (v, ev) {
            switch (ev.getAction()) {
                case ME.ACTION_DOWN:
                    sx = ev.getRawX();
                    sy = ev.getRawY();
                    wx = win.getX();
                    wy = win.getY();
                    return true;
                case ME.ACTION_MOVE:
                    win.setPosition(Math.round(wx + (ev.getRawX() - sx)), Math.round(wy + (ev.getRawY() - sy)));
                    return true;
                case ME.ACTION_UP:
                    refreshRects();
                    return true;
            }
            return true;
        });
    }

    function setStatus(s) {
        state.status = s;
        ui.run(function () { panel.status.setText(s); });
    }

    function setAimVisible(v) {
        state.aimVisible = v;
        ui.run(function () {
            aim.root.setVisibility(v ? 0 : 4);
            aim.setTouchable(v);
            refreshRects();
        });
    }

    ui.run(function () {
        makeDraggable(panel, panel.status);
        makeDraggable(aim, aim.root);
        aim.setPosition(Math.round(dm.widthPixels / 2 - 45 * dm.density), Math.round(dm.heightPixels / 2 - 45 * dm.density));
        panel.setPosition(Math.round(dm.widthPixels - 240 * dm.density), Math.round(60 * dm.density));
        aim.root.setVisibility(4);
        aim.setTouchable(false);
    });

    function requestSample(type, extra) {
        refreshRects();
        if (!state.aimVisible || !state.aimCenter) {
            toast("Сначала включи ПРИЦЕЛ и наведи его");
            return;
        }
        state.requests.push({ type: type, x: state.aimCenter.x, y: state.aimCenter.y, extra: extra });
    }

    function wizardText() {
        return "Прицел на: " + POINTS[state.wizard].name + " → ТОЧКИ (сохранить) / ПРОПУСК";
    }

    function wizardNext() {
        state.wizard++;
        if (state.wizard >= POINTS.length) {
            state.wizard = -1;
            setAimVisible(false);
            store.put("points", P);
            setStatus("Точки сохранены. Добавь цвета токенов: ПРИЦЕЛ → +ТОКЕН");
        } else {
            setStatus(wizardText());
        }
    }

    panel.start.click(function () {
        state.running = !state.running;
        if (state.running) {
            state.mode = "gather";
            brain = newBrain(CFG); // СТАРТ = стою в центре поля
            setAimVisible(false);
        }
        panel.start.setText(state.running ? "СТОП" : "СТАРТ");
        setStatus(state.running ? "Поехали" : "Пауза");
    });

    panel.aim.click(function () {
        setAimVisible(!state.aimVisible);
    });

    panel.exit.click(function () {
        exit();
    });

    panel.token.click(function () { requestSample("token", 1); });
    panel.vip.click(function () { requestSample("token", 3); });

    panel.clear.click(function () {
        tokenColors = [];
        store.put("colors", tokenColors);
        setStatus("Цвета токенов сброшены");
    });

    panel.point.click(function () {
        if (state.wizard < 0) {
            state.running = false;
            panel.start.setText("СТАРТ");
            state.wizard = 0;
            setAimVisible(true);
            setStatus(wizardText());
            return;
        }
        refreshRects();
        if (!state.aimCenter) return;
        var pt = POINTS[state.wizard];
        P[pt.id] = { x: state.aimCenter.x, y: state.aimCenter.y };
        if (pt.id === "bag") state.requests.push({ type: "bag", x: P.bag.x, y: P.bag.y });
        wizardNext();
    });

    panel.skip.click(function () {
        if (state.wizard >= 0) wizardNext();
    });

    // ---------- поток зрения ----------
    var bagSince = 0;
    function see() {
        if (!state.running && !state.requests.length) {
            sleep(150);
            return;
        }
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
            ui.run(function () { panel.swatch.setBackgroundColor(android.graphics.Color.parseColor(hex)); });
        }
        if (!state.running) return;

        var zones = [];
        if (state.panelRect) zones.push(state.panelRect);
        if (P.player) zones.push({ x: P.player.x, y: P.player.y, r: CFG.PLAYER_IGNORE * W });
        ["joy", "jump", "tap", "menu"].forEach(function (id) {
            if (P[id]) zones.push({ x: P[id].x, y: P[id].y, r: CFG.BUTTON_IGNORE * W });
        });

        var scale = CFG.VISION_WIDTH / W;
        var small = images.scale(img, scale, scale);
        var tokens = [];
        try {
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
        state.perception = { tokens: tokens, bagFull: bagFull, t: Date.now() };
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
            strokes.push(joyStroke(P.joy.x, P.joy.y, vx, vy, CFG.JOY_RADIUS * (screen.W || dm.widthPixels), ms));
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

    function convert() {
        state.mode = "convert";
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
            state.running = false;
            ui.run(function () { panel.start.setText("СТАРТ"); });
            setStatus("Мёд готов. Маршрут на поле не задан — доведи персонажа и жми СТАРТ");
            return;
        }
        setStatus("Бегу на поле");
        if (!walkRoute(CFG.ROUTE_TO_FIELD)) return;
        brain = newBrain(CFG);
        state.mode = "gather";
    }

    setStatus(P.player && P.joy ? "Готов. Жми СТАРТ" : "Сначала жми ТОЧКИ и отметь всё по порядку");
    sleep(800);
    ui.run(refreshRects);

    // ---------- главный цикл ----------
    var lastStatus = 0;
    while (true) {
        if (!state.running) {
            sleep(100);
            continue;
        }
        if (!P.player || !P.joy) {
            state.running = false;
            ui.run(function () { panel.start.setText("СТАРТ"); });
            setStatus("Не отмечены ПЕРСОНАЖ и ДЖОЙСТИК → ТОЧКИ");
            continue;
        }
        if (currentPackage() !== CFG.ROBLOX_PACKAGE) {
            setStatus("Жду Roblox на экране...");
            sleep(500);
            continue;
        }
        if (state.mode === "convert" || (state.perception.bagFull && canConvert())) {
            convert();
            continue;
        }
        var now = Date.now();
        var dec = decide(brain, state.perception.tokens, P.player, screen.W || dm.widthPixels, now, CFG);
        step(dec.vx, dec.vy, CFG.STEP_MS, { tap: CFG.AUTO_TAP, jump: dec.jump });
        integrate(brain, dec.vx, dec.vy, CFG.STEP_MS);
        if (now - lastStatus > 700) {
            lastStatus = now;
            var names = { token: "к токену", overshoot: "подбираю", patrol: "кошу поле" };
            setStatus(names[dec.mode] + " | токенов: " + state.perception.tokens.length +
                (state.perception.bagFull ? " | рюкзак ПОЛНЫЙ" : "") +
                " | поле: " + brain.pos.x.toFixed(1) + "," + brain.pos.y.toFixed(1));
        }
    }
}

if (typeof floaty === "undefined") {
    module.exports = {
        CFG: CFG, clusterPoints: clusterPoints, looksLikeToken: looksLikeToken, blobsToTokens: blobsToTokens,
        mergeTokens: mergeTokens, snakeWaypoints: snakeWaypoints, newBrain: newBrain, decide: decide,
        integrate: integrate, medianColor: medianColor, colorDiff: colorDiff, angleToVec: angleToVec, intToHex: intToHex, joyStroke: joyStroke
    };
} else {
    main();
}
