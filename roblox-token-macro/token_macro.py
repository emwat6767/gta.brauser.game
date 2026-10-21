"""
Roblox Token Farm — автосбор токенов.

Смотрит на окно Roblox, ищет токены по цвету и бежит к ближайшему.
Токенов не видно — ходит змейкой и ищет. В игру ничего не внедряет:
только скриншоты + нажатия клавиш, как обычный человек.

F6  — старт / пауза
F8  — добавить цвет токена (наведи курсор на токен и нажми)
F7  — сбросить все цвета
F9  — указать, где персонаж (наведи курсор на персонажа и нажми)
F10 — окно отладки (что видит макрос)
F5  — перечитать config.json
End — выход
"""
import json
import math
import os
import sys
import time

import cv2
import numpy as np

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
PROC_WIDTH = 640  # кадр ужимается до этой ширины; все пиксели в конфиге — в этом масштабе

DEFAULT_CONFIG = {
    "window_title": "Roblox",
    "token_colors": [],
    "hsv_tolerance": [8, 60, 60],
    "min_blob_area": 30,
    "max_blob_area": 6000,
    "anchor": [0.5, 0.5],
    "ignore_radius": 20,
    "ignore_top": 0.12,
    "ignore_bottom": 0.15,
    "deadzone": 6,
    "overshoot": 0.3,
    "target_timeout": 3.0,
    "blacklist_seconds": 6.0,
    "blacklist_radius": 25,
    "fps": 30,
    "patrol": [["w", 1.2], ["d", 0.5], ["s", 1.2], ["d", 0.5],
               ["w", 1.2], ["a", 0.5], ["s", 1.2], ["a", 0.5]],
    "auto_click": False,
    "click_interval": 0.12,
    "jump_when_stuck": True,
}

# 8 направлений: 0° — вправо, 90° — вперёд (вверх по экрану)
DIRECTIONS = [{"d"}, {"w", "d"}, {"w"}, {"w", "a"}, {"a"}, {"s", "a"}, {"s"}, {"s", "d"}]


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg.update(json.load(f))
    else:
        save_config(cfg)
    return cfg


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def color_mask(hsv, colors, tolerance):
    h = hsv[:, :, 0].astype(np.int16)
    s = hsv[:, :, 1].astype(np.int16)
    v = hsv[:, :, 2].astype(np.int16)
    th, ts, tv = tolerance
    mask = np.zeros(h.shape, bool)
    for h0, s0, v0 in colors:
        dh = np.abs(h - int(h0))
        dh = np.minimum(dh, 180 - dh)  # оттенок замкнут по кругу (красный у 0 и у 179)
        mask |= (dh <= th) & (np.abs(s - int(s0)) <= ts) & (np.abs(v - int(v0)) <= tv)
    return mask.astype(np.uint8) * 255


def find_tokens(frame, cfg, anchor_px):
    """Возвращает [(x, y, площадь), ...] пятен цвета токенов и маску."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = color_mask(hsv, cfg["token_colors"], cfg["hsv_tolerance"])
    hh = mask.shape[0]
    mask[: int(hh * cfg["ignore_top"])] = 0
    bottom = int(hh * cfg["ignore_bottom"])
    if bottom:
        mask[hh - bottom:] = 0
    cv2.circle(mask, anchor_px, int(cfg["ignore_radius"]), 0, -1)

    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.dilate(mask, kernel, iterations=2)

    n, _, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    blobs = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if cfg["min_blob_area"] <= area <= cfg["max_blob_area"]:
            blobs.append((float(centroids[i][0]), float(centroids[i][1]), area))
    return blobs, mask


def keys_toward(dx, dy, deadzone):
    if math.hypot(dx, dy) <= deadzone:
        return set()
    angle = math.degrees(math.atan2(-dy, dx)) % 360
    return set(DIRECTIONS[int(((angle + 22.5) % 360) // 45)])


def sample_hsv(patch_bgr):
    hsv = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2HSV).reshape(-1, 3).astype(float)
    ang = hsv[:, 0] * (2 * math.pi / 180)
    h = (math.degrees(math.atan2(np.sin(ang).mean(), np.cos(ang).mean())) / 2) % 180
    return [int(round(h)) % 180, int(np.median(hsv[:, 1])), int(np.median(hsv[:, 2]))]


class Win:
    """Немного WinAPI через ctypes: найти окно, его область, курсор."""

    def __init__(self):
        import ctypes
        from ctypes import wintypes
        self.ct, self.wt = ctypes, wintypes
        self.u32 = ctypes.windll.user32
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            try:
                self.u32.SetProcessDPIAware()
            except Exception:
                pass
        self.u32.FindWindowW.restype = wintypes.HWND
        self.u32.GetForegroundWindow.restype = wintypes.HWND
        self.u32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        self.u32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]

    def find(self, title):
        return self.u32.FindWindowW(None, title)

    def foreground(self):
        return self.u32.GetForegroundWindow()

    def client_rect(self, hwnd):
        r = self.wt.RECT()
        if not self.u32.GetClientRect(hwnd, self.ct.byref(r)) or r.right <= 0 or r.bottom <= 0:
            return None
        p = self.wt.POINT(0, 0)
        self.u32.ClientToScreen(hwnd, self.ct.byref(p))
        return {"left": p.x, "top": p.y, "width": r.right, "height": r.bottom}

    def cursor(self):
        p = self.wt.POINT()
        self.u32.GetCursorPos(self.ct.byref(p))
        return p.x, p.y


class Keys:
    def __init__(self, pdi):
        self.pdi = pdi
        self.held = set()

    def set(self, keys):
        for k in self.held - keys:
            self.pdi.keyUp(k)
        for k in keys - self.held:
            self.pdi.keyDown(k)
        self.held = set(keys)

    def tap(self, key):
        self.pdi.keyDown(key)
        time.sleep(0.05)
        self.pdi.keyUp(key)

    def release_all(self):
        self.set(set())


def draw_debug(frame, mask, cfg, anchor_px, blobs, target, blacklist, status):
    vis = frame.copy()
    tint = np.zeros_like(vis)
    tint[:, :, 2] = 255
    m = mask > 0
    vis[m] = (vis[m] * 0.4 + tint[m] * 0.6).astype(np.uint8)

    hh, ww = vis.shape[:2]
    top, bottom = int(hh * cfg["ignore_top"]), hh - int(hh * cfg["ignore_bottom"])
    cv2.line(vis, (0, top), (ww, top), (80, 80, 80), 1)
    cv2.line(vis, (0, bottom), (ww, bottom), (80, 80, 80), 1)
    cv2.circle(vis, anchor_px, int(cfg["ignore_radius"]), (255, 160, 0), 1)
    cv2.drawMarker(vis, anchor_px, (255, 160, 0), cv2.MARKER_CROSS, 12, 2)
    for x, y, _ in blobs:
        cv2.circle(vis, (int(x), int(y)), 8, (0, 255, 0), 2)
    for x, y, _ in blacklist:
        cv2.drawMarker(vis, (int(x), int(y)), (128, 128, 128), cv2.MARKER_TILTED_CROSS, 14, 2)
    if target:
        t = (int(target[0]), int(target[1]))
        cv2.line(vis, anchor_px, t, (0, 0, 255), 2)
        cv2.circle(vis, t, 11, (0, 0, 255), 2)
    cv2.putText(vis, status, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.imshow("token macro", vis)
    cv2.waitKey(1)


def main():
    if os.name != "nt":
        print("Макрос работает только на Windows (там, где запущен Roblox).")
        return
    import keyboard
    import mss
    import pydirectinput

    pydirectinput.PAUSE = 0
    failsafe_exc = getattr(pydirectinput, "FailSafeException", ())
    cfg = load_config()
    win = Win()
    keys = Keys(pydirectinput)

    flags = {"running": False, "debug": False, "quit": False,
             "sample": False, "anchor": False, "clear": False, "reload": False}

    def flip(name):
        flags[name] = not flags[name]

    def raise_flag(name):
        flags[name] = True

    keyboard.add_hotkey("f6", flip, args=("running",))
    keyboard.add_hotkey("f10", flip, args=("debug",))
    keyboard.add_hotkey("f8", raise_flag, args=("sample",))
    keyboard.add_hotkey("f9", raise_flag, args=("anchor",))
    keyboard.add_hotkey("f7", raise_flag, args=("clear",))
    keyboard.add_hotkey("f5", raise_flag, args=("reload",))
    keyboard.add_hotkey("end", raise_flag, args=("quit",))

    print(__doc__)
    print(f"Цветов токенов в конфиге: {len(cfg['token_colors'])}")
    if not cfg["token_colors"]:
        print("Сначала наведи курсор на токен в игре и нажми F8.")

    blacklist = []  # [(x, y, до_какого_времени)]
    track_pos = None
    track_best = 0.0
    track_improved_at = 0.0
    last_keys = set()
    overshoot_until = 0.0
    patrol_i, patrol_until = -1, 0.0
    next_click = 0.0
    next_status = 0.0
    debug_open = False

    try:
        with mss.mss() as sct:
            while not flags["quit"]:
                loop_start = time.time()
                now = loop_start

                if flags["reload"]:
                    flags["reload"] = False
                    cfg = load_config()
                    print("\nconfig.json перечитан")
                if flags["clear"]:
                    flags["clear"] = False
                    cfg["token_colors"] = []
                    save_config(cfg)
                    print("\nВсе цвета сброшены")

                hwnd = win.find(cfg["window_title"])
                rect = win.client_rect(hwnd) if hwnd else None
                if not rect:
                    keys.release_all()
                    if now >= next_status:
                        print(f"\rОкно '{cfg['window_title']}' не найдено...        ", end="")
                        next_status = now + 1
                    time.sleep(0.5)
                    continue

                if flags["sample"]:
                    flags["sample"] = False
                    cx, cy = win.cursor()
                    try:
                        patch = np.asarray(sct.grab({"left": cx - 4, "top": cy - 4, "width": 9, "height": 9}))[:, :, :3]
                        color = sample_hsv(np.ascontiguousarray(patch))
                        cfg["token_colors"].append(color)
                        save_config(cfg)
                        print(f"\nЦвет добавлен HSV{tuple(color)} — всего цветов: {len(cfg['token_colors'])}")
                    except Exception as e:
                        print(f"\nНе смог взять цвет: {e}")
                if flags["anchor"]:
                    flags["anchor"] = False
                    cx, cy = win.cursor()
                    fx = min(max((cx - rect["left"]) / rect["width"], 0.0), 1.0)
                    fy = min(max((cy - rect["top"]) / rect["height"], 0.0), 1.0)
                    cfg["anchor"] = [round(fx, 3), round(fy, 3)]
                    save_config(cfg)
                    print(f"\nПерсонаж отмечен: {cfg['anchor']}")

                active = flags["running"] and win.foreground() == hwnd and cfg["token_colors"]
                if not active:
                    keys.release_all()
                if not (active or flags["debug"]):
                    if debug_open:
                        cv2.destroyAllWindows()
                        debug_open = False
                    if now >= next_status:
                        state = "ПАУЗА (F6 — старт)" if not flags["running"] else \
                            "нет цветов (F8)" if not cfg["token_colors"] else "окно Roblox не активно"
                        print(f"\r{state}                              ", end="")
                        next_status = now + 1
                    time.sleep(0.1)
                    continue

                shot = np.asarray(sct.grab(rect))[:, :, :3]
                scale = PROC_WIDTH / rect["width"]
                fh = max(1, round(rect["height"] * scale))
                frame = cv2.resize(shot, (PROC_WIDTH, fh), interpolation=cv2.INTER_AREA)
                ax, ay = int(cfg["anchor"][0] * PROC_WIDTH), int(cfg["anchor"][1] * fh)

                if cfg["token_colors"]:
                    blobs, mask = find_tokens(frame, cfg, (ax, ay))
                else:
                    blobs, mask = [], np.zeros(frame.shape[:2], np.uint8)

                blacklist = [b for b in blacklist if b[2] > now]
                br = cfg["blacklist_radius"]
                blobs = [b for b in blobs
                         if all(math.hypot(b[0] - x, b[1] - y) > br for x, y, _ in blacklist)]
                target = min(blobs, key=lambda b: math.hypot(b[0] - ax, b[1] - ay)) if blobs else None
                close_dist = cfg["ignore_radius"] * 2 + cfg["deadzone"]

                if active:
                    if target:
                        tx, ty, _ = target
                        dist = math.hypot(tx - ax, ty - ay)
                        same = track_pos and math.hypot(tx - track_pos[0], ty - track_pos[1]) < br
                        if same:
                            if dist < track_best - 3:
                                track_best, track_improved_at = dist, now
                            elif now - track_improved_at > cfg["target_timeout"]:
                                # не приближаемся — застряли или это не токен
                                blacklist.append((tx, ty, now + cfg["blacklist_seconds"]))
                                if cfg["jump_when_stuck"]:
                                    keys.tap("space")
                                track_pos = None
                                continue
                        else:
                            # прошлая цель пропала рядом с персонажем — значит подобрали, добегаем
                            if track_pos and track_best < close_dist:
                                overshoot_until = now + cfg["overshoot"]
                            track_best, track_improved_at = dist, now
                        track_pos = (tx, ty)
                        if now >= overshoot_until:
                            last_keys = keys_toward(tx - ax, ty - ay, cfg["deadzone"])
                        keys.set(last_keys)
                    else:
                        if track_pos and track_best < close_dist:
                            overshoot_until = now + cfg["overshoot"]
                        track_pos = None
                        if now < overshoot_until:
                            keys.set(last_keys)
                        elif cfg["patrol"]:
                            if now >= patrol_until:
                                patrol_i = (patrol_i + 1) % len(cfg["patrol"])
                                patrol_until = now + float(cfg["patrol"][patrol_i][1])
                            keys.set(set(str(cfg["patrol"][patrol_i][0]).lower().split("+")))
                        else:
                            keys.release_all()

                    if cfg["auto_click"] and now >= next_click:
                        pydirectinput.click()
                        next_click = now + cfg["click_interval"]

                status = ("ФАРМ" if active else "ПАУЗА") + f" | токенов: {len(blobs)}"
                if target:
                    status += f" | до цели: {math.hypot(target[0] - ax, target[1] - ay):.0f}px"
                elif active:
                    status += " | ищу..."
                if now >= next_status:
                    print(f"\r{status}                    ", end="")
                    next_status = now + 0.5

                if flags["debug"]:
                    draw_debug(frame, mask, cfg, (ax, ay), blobs, target, blacklist, status)
                    debug_open = True
                elif debug_open:
                    cv2.destroyAllWindows()
                    debug_open = False

                time.sleep(max(0.0, 1.0 / cfg["fps"] - (time.time() - loop_start)))
    except KeyboardInterrupt:
        pass
    except failsafe_exc:
        print("\nМышь в углу экрана — аварийная остановка.")
    finally:
        keys.release_all()
        cv2.destroyAllWindows()
        print("\nМакрос остановлен, все клавиши отпущены.")


if __name__ == "__main__":
    main()
