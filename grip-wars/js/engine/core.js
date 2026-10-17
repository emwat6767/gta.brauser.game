//# sourceURL=ufc/core.js
(function () {
'use strict';
const UFC = window.UFC = window.UFC || {};

const M = UFC.M = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  sat: (t) => (t < 0 ? 0 : t > 1 ? 1 : t),
  smooth: (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeIn: (t) => t * t,
  rand: (a, b) => a + Math.random() * (b - a),
  chance: (p) => Math.random() < p,
  pick: (arr) => arr[(Math.random() * arr.length) | 0],
  damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
  wrap: (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; },
  weighted(entries) { // [[item, weight], ...]
    let total = 0; for (const e of entries) total += Math.max(0, e[1]);
    let r = Math.random() * total;
    for (const e of entries) { r -= Math.max(0, e[1]); if (r <= 0) return e[0]; }
    return entries.length ? entries[entries.length - 1][0] : null;
  },
};

// Damped spring on a scalar. Critically damped when d = 2*sqrt(k).
class Spring {
  constructor(v = 0, k = 120, d = null) { this.v = v; this.target = v; this.vel = 0; this.k = k; this.d = d == null ? 2 * Math.sqrt(k) : d; }
  step(dt) { this.vel += (this.k * (this.target - this.v) - this.d * this.vel) * dt; this.v += this.vel * dt; return this.v; }
  kick(x) { this.vel += x; }
  snap(v) { this.v = this.target = v; this.vel = 0; }
}

class Spring3 {
  constructor(k = 200, d = null) { this.p = new THREE.Vector3(); this.t = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.k = k; this.d = d == null ? 2 * Math.sqrt(k) : d; }
  step(dt) {
    const k = this.k, d = this.d, p = this.p, t = this.t, v = this.vel;
    v.x += (k * (t.x - p.x) - d * v.x) * dt; v.y += (k * (t.y - p.y) - d * v.y) * dt; v.z += (k * (t.z - p.z) - d * v.z) * dt;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    return p;
  }
  snap(vec) { this.p.copy(vec); this.t.copy(vec); this.vel.set(0, 0, 0); }
}
UFC.Spring = Spring;
UFC.Spring3 = Spring3;

// ---------------------------------------------------------------------------
// Input: keyboard + gamepad (PlayStation layout) + touch, merged into one pad.
// ---------------------------------------------------------------------------
const BUTTONS = ['square', 'triangle', 'cross', 'circle', 'l1', 'r1', 'l2', 'r2', 'start', 'select', 'back', 'gnp', 'grapple', 'td', 'sub', 'flow', 'commit', 'counter'];
const KEYMAP = {
  KeyJ: 'square', KeyI: 'triangle', KeyK: 'cross', KeyL: 'circle',
  KeyU: 'l1', KeyO: 'r1', KeyQ: 'l2', Space: 'r2', ShiftLeft: 'l2', ShiftRight: 'l2',
  Escape: 'start', KeyP: 'start', Tab: 'select', Backspace: 'back', KeyF: 'flow', KeyV: 'commit', KeyC: 'counter', KeyR: 'gnp', KeyG: 'grapple', KeyT: 'td', KeyH: 'sub',
};
const AXISKEYS = {
  KeyW: ['ly', 1], KeyS: ['ly', -1], KeyA: ['lx', -1], KeyD: ['lx', 1],
  ArrowUp: ['ry', 1], ArrowDown: ['ry', -1], ArrowLeft: ['rx', -1], ArrowRight: ['rx', 1],
};

class Input {
  constructor() {
    this.held = new Set();
    this.tapped = new Set(); // pressed since the last poll, so a quick tap is never lost
    this.state = this._blank();
    this.prev = this._blank();
    this.touch = this._blank();
    this.touchQ = []; // taps waiting for a frame, so a 50 ms tap is never missed
    this.gamepadConnected = false;
    this.lastDevice = 'keyboard';
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (KEYMAP[e.code] || AXISKEYS[e.code]) e.preventDefault();
      this.held.add(e.code); this.tapped.add(e.code); this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => { this.held.clear(); this.tapped.clear(); });
    window.addEventListener('gamepadconnected', () => { this.gamepadConnected = true; this.lastDevice = 'gamepad'; });
  }
  _blank() { const s = { lx: 0, ly: 0, rx: 0, ry: 0 }; BUTTONS.forEach((b) => (s[b] = false)); return s; }

  // Touch taps are shorter than a frame on a slow device. Queue them instead of
  // holding a flag and release one per poll, always as a clean rising edge.
  queueTouch(btn, mods) { this.touchQ.push({ btn, mods: mods || null }); if (this.touchQ.length > 6) this.touchQ.shift(); this.lastDevice = 'touch'; }

  // Inside an embedded frame (preview panels, iframes) the Gamepad API can be
  // forbidden by Permissions-Policy and getGamepads() throws a SecurityError
  // every call. Probe once; without permission the game simply runs on
  // keyboard / touch.
  _pads() {
    if (this.padsBlocked || !navigator.getGamepads) return [];
    try { return navigator.getGamepads() || []; } catch (e) {
      this.padsBlocked = true;
      console.warn('[UFC] Геймпад недоступен в этом окне (' + e.name + '). Управление: клавиатура / сенсор.');
      return [];
    }
  }

  poll() {
    const p = this.prev; const s = this.state;
    Object.assign(p, s);
    const n = this._blank();
    const active = new Set([...this.held, ...this.tapped]);
    this.tapped.clear();
    for (const code of active) {
      if (KEYMAP[code]) n[KEYMAP[code]] = true;
      if (AXISKEYS[code]) { const [ax, v] = AXISKEYS[code]; n[ax] += v; }
    }
    if (active.has('KeyC')) { n.l2 = true; n.r2 = true; }
    const pads = this._pads();
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
      const ax = [dz(gp.axes[0] || 0), -dz(gp.axes[1] || 0), dz(gp.axes[2] || 0), -dz(gp.axes[3] || 0)];
      if (ax.some((v) => v !== 0) || gp.buttons.some((x) => x.pressed)) this.lastDevice = 'gamepad';
      n.lx += ax[0]; n.ly += ax[1]; n.rx += ax[2]; n.ry += ax[3];
      n.cross = n.cross || b(0); n.circle = n.circle || b(1); n.square = n.square || b(2); n.triangle = n.triangle || b(3);
      n.l1 = n.l1 || b(4); n.r1 = n.r1 || b(5); n.l2 = n.l2 || b(6); n.r2 = n.r2 || b(7);
      n.select = n.select || b(8); n.back = n.back || b(8); n.start = n.start || b(9); n.gnp = n.gnp || b(11); n.grapple = n.grapple || b(11); n.td = n.td || b(10); n.flow = n.flow || (b(4) && b(5));
      if (b(12)) n.ly += 1; if (b(13)) n.ly -= 1; if (b(14)) n.lx -= 1; if (b(15)) n.lx += 1;
    }
    const t = this.touch;
    n.lx += t.lx; n.ly += t.ly; n.rx += t.rx; n.ry += t.ry;
    BUTTONS.forEach((k) => { if (t[k]) n[k] = true; });
    for (let i = 0; i < this.touchQ.length; i++) {
      const q = this.touchQ[i];
      if (p[q.btn]) continue; // the button was down last frame: wait so this stays a fresh press
      n[q.btn] = true;
      if (q.mods) for (const k in q.mods) if (q.mods[k]) n[k] = true;
      this.touchQ.splice(i, 1); break;
    }
    for (const ax of ['lx', 'ly', 'rx', 'ry']) n[ax] = M.clamp(n[ax], -1, 1);
    Object.assign(s, n);
  }
  pressed(btn) { return this.state[btn] && !this.prev[btn]; }
  released(btn) { return !this.state[btn] && this.prev[btn]; }
}
UFC.Input = Input;

// ---------------------------------------------------------------------------
// Storage: localStorage can be missing or throw (private mode, sandboxed
// frames, blocked site data). Falls back to memory and remembers that saves
// won't survive a reload, so the UI can say so instead of silently losing them.
// ---------------------------------------------------------------------------
const memStore = {};
const LS = (() => { try { return window.localStorage; } catch (e) { return null; } })();
// FNV-1a: tiny checksum so a half-written or hand-edited value is detected instead of trusted
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const pack = (value) => { const d = JSON.stringify(value); if (d === undefined) throw new Error('unserialisable'); return 'UFC2|' + Date.now() + '|' + fnv(d) + '|' + d; };
// -> { ok, value, t, legacy } | { bad:true } | null (missing)
const unpack = (raw) => {
  if (raw == null || raw === '') return null;
  if (raw.startsWith('UFC2|')) {
    const a = raw.indexOf('|', 5), b = a < 0 ? -1 : raw.indexOf('|', a + 1);
    if (a < 0 || b < 0) return { bad: true };
    const d = raw.slice(b + 1);
    if (fnv(d) !== raw.slice(a + 1, b)) return { bad: true };
    try { return { ok: true, t: +raw.slice(5, a) || 0, value: JSON.parse(d) }; } catch (e) { return { bad: true }; }
  }
  try { return { ok: true, t: 0, legacy: true, value: JSON.parse(raw) }; } catch (e) { return { bad: true }; }
};
const isBak = (k) => k.endsWith('.bak');
const noBak = (k) => k.indexOf('.ko.') >= 0;   // replays are big and never change: no second generation

// IndexedDB mirror: survives "clear site data" of localStorage only, quota errors and most corruption
let idbP = null;
const idbOpen = () => idbP || (idbP = new Promise((res) => {
  try {
    if (!window.indexedDB) return res(null);
    const r = indexedDB.open('ufc-saves', 1);
    r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) { /* exists */ } };
    r.onsuccess = () => res(r.result);
    r.onerror = r.onblocked = () => res(null);
  } catch (e) { res(null); }
}));
// once the database is open, writes are issued synchronously (IndexedDB keeps them in order), so a tab
// closed right after a save still flushes them; only writes made before it finished opening are queued
let idbDB = null, idbChain = Promise.resolve();
idbOpen().then((db) => { idbDB = db; });
const idbDo = (fn) => {
  if (idbDB) { try { fn(idbDB); } catch (e) { /* mirror is best-effort */ } return; }
  idbChain = idbChain.then(() => idbOpen().then((db) => { if (db) { idbDB = db; try { fn(db); } catch (e) { /* ignore */ } } })).catch(() => null);
};
const idbPut = (k, raw) => idbDo((db) => { db.transaction('kv', 'readwrite').objectStore('kv').put(raw, k); });
const idbDel = (k) => idbDo((db) => { db.transaction('kv', 'readwrite').objectStore('kv').delete(k); });
const idbAll = () => new Promise((res) => {
  idbOpen().then((db) => {
    if (!db) return res(null);
    try {
      const out = new Map(), t = db.transaction('kv', 'readonly'), cur = t.objectStore('kv').openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { out.set(c.key, c.value); c.continue(); } else res(out); };
      cur.onerror = () => res(null);
    } catch (e) { res(null); }
  });
});

const lsGet = (k) => { try { return LS ? LS.getItem(k) : memStore[k] == null ? null : memStore[k]; } catch (e) { return null; } };

UFC.store = {
  persistent: (() => { try { const k = '__ufc_probe'; LS.setItem(k, '1'); LS.removeItem(k); return true; } catch (e) { return false; } })(),
  idbOk: false, persisted: null, degraded: false, lastSaveAt: 0, lastError: '', healed: [], hydrated: false,

  // every readable copy of a key, best first: memory overlay (a write localStorage refused), main, previous generation
  candidates(key) {
    const out = [];
    const add = (src, raw) => { const u = unpack(raw); if (u && u.ok) out.push({ src, value: u.value, t: u.t, legacy: !!u.legacy }); else if (u && u.bad) this._bad = (this._bad || 0) + 1; };
    if (memStore[key] != null && this.persistent) add('mem', memStore[key]);
    add('main', this.persistent ? lsGet(key) : memStore[key]);
    add('bak', this.persistent ? lsGet(key + '.bak') : memStore[key + '.bak']);
    return out;
  },
  exists(key) { return (this.persistent ? lsGet(key) != null || lsGet(key + '.bak') != null : memStore[key] != null) || memStore[key] != null; },

  get(key, fallback) {
    try {
      const c = this.candidates(key);
      if (!c.length) return fallback;
      if (c[0].src !== 'main' && c[0].src !== 'mem') { this.healed.push(key); this.set(key, c[0].value); }
      else if (c[0].legacy) this.set(key, c[0].value);   // old plain-JSON value: re-save it in the checked format
      return c[0].value;
    } catch (e) { console.warn('[UFC] повреждённые данные', key, e); return fallback; }
  },

  set(key, value) {
    let raw; try { raw = pack(value); } catch (e) { this.lastError = String(e && e.message || e); return false; }
    const prevRaw = this.persistent ? lsGet(key) : memStore[key]; const prev = unpack(prevRaw);
    const keepBak = !noBak(key) && prev && prev.ok && prevRaw !== raw;
    let ok = false;
    if (this.persistent) {
      try {
        if (keepBak) LS.setItem(key + '.bak', prevRaw);
        LS.setItem(key, raw); ok = LS.getItem(key) === raw;
      } catch (e) {
        try { LS.removeItem(key + '.bak'); LS.setItem(key, raw); ok = LS.getItem(key) === raw; } catch (e2) { ok = false; this.lastError = String(e2 && e2.message || e2); }
      }
      if (ok) delete memStore[key]; else { memStore[key] = raw; this.degraded = true; console.error('[UFC] не удалось записать в localStorage', key, this.lastError); }
    } else { if (keepBak) memStore[key + '.bak'] = prevRaw; memStore[key] = raw; }
    idbPut(key, raw);
    if (keepBak) idbPut(key + '.bak', prevRaw);
    this.lastSaveAt = Date.now();
    return ok || this.idbOk;
  },

  remove(key) {
    try { if (this.persistent) { LS.removeItem(key); LS.removeItem(key + '.bak'); } } catch (e) { /* ignore */ }
    delete memStore[key]; delete memStore[key + '.bak'];
    idbDel(key); idbDel(key + '.bak');
  },

  keys(prefix) {
    const set = new Set();
    try { if (this.persistent) for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k && k.startsWith(prefix || 'ufc.') && !isBak(k)) set.add(k); } } catch (e) { /* ignore */ }
    for (const k in memStore) if (k.startsWith(prefix || 'ufc.') && !isBak(k)) set.add(k);
    return [...set];
  },

  // Boot: reconcile localStorage with the IndexedDB mirror. Whatever is newest and intact wins; a
  // wiped / corrupt localStorage is restored, a missing mirror is rebuilt.
  async hydrate() {
    try { if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((p) => { if (p) this.persisted = true; else if (navigator.storage.persist) return navigator.storage.persist().then((v) => { this.persisted = !!v; }); }).catch(() => {}); } catch (e) { /* optional */ }
    const all = await idbAll();
    this.idbOk = !!all;
    if (all) {
      const keys = new Set(); for (const k of all.keys()) keys.add(isBak(k) ? k.slice(0, -4) : k); for (const k of this.keys('ufc.')) keys.add(k);
      for (const k of keys) {
        if (!k.startsWith('ufc.')) continue;
        const cur = this.candidates(k), best = cur[0] || null;
        const im = unpack(all.get(k)), ib = unpack(all.get(k + '.bak'));
        const mirror = im && im.ok ? { raw: all.get(k), t: im.t } : ib && ib.ok ? { raw: all.get(k + '.bak'), t: ib.t } : null;
        if (mirror && (!best || (mirror.t > best.t && best.src !== 'mem'))) {
          // localStorage lost it (or holds an older one): restore from the mirror
          const u = unpack(mirror.raw);
          if (u && u.ok) { this.healed.push(k); if (best && best.src === 'main' && !noBak(k)) { /* keep the old main as previous generation */ try { this.persistent && LS.setItem(k + '.bak', lsGet(k)); } catch (e) { /* ignore */ } } this._restore(k, mirror.raw); }
        } else if (best && (!im || !im.ok || best.legacy || (best.t > (im.t || 0) && best.src !== 'bak'))) {
          // the mirror is missing / behind: bring it up to date (and convert legacy plain JSON)
          if (best.legacy) this.set(k, best.value); else { const raw = lsGet(k); if (raw) idbPut(k, raw); else if (memStore[k]) idbPut(k, memStore[k]); }
        }
      }
    } else {
      for (const k of this.keys('ufc.')) { const c = this.candidates(k); if (c[0] && c[0].legacy) this.set(k, c[0].value); }
    }
    this.hydrated = true;
    if (UFC.reloadLooks) UFC.reloadLooks();
    return this.healed.length;
  },
  _restore(k, raw) {
    if (!this.persistent) { memStore[k] = raw; return; }
    try { LS.setItem(k, raw); delete memStore[k]; } catch (e) { memStore[k] = raw; this.degraded = true; }
  },

  status() {
    const c = this.candidates('ufc.career.1').length;
    return { persistent: this.persistent, idb: this.idbOk, persisted: this.persisted, degraded: this.degraded, lastSaveAt: this.lastSaveAt, healed: this.healed.length, copies: (this.persistent ? 2 : 1) + (this.idbOk ? 2 : 0), c1: c };
  },
};

// Backup codes: one text string (also usable as a file) with every value and a checksum.
const bytesB64 = (b) => { let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64Bytes = (str) => { const bin = atob(str); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
const pipe = async (bytes, stream) => { const w = stream.writable.getWriter(); w.write(bytes); w.close(); return new Uint8Array(await new Response(stream.readable).arrayBuffer()); };
UFC.backup = {
  // keys: array of store keys; null = everything (replays included). UFCZ = gzip, UFCB = plain fallback.
  async make(keys) {
    const items = {};
    for (const k of keys || UFC.store.keys('ufc.')) { const v = UFC.store.get(k, undefined); if (v !== undefined) items[k] = v; }
    const json = JSON.stringify({ app: 'ufc', v: 2, t: Date.now(), items }), sum = fnv(json), bytes = new TextEncoder().encode(json);
    try { if (window.CompressionStream) return 'UFCZ.' + bytesB64(await pipe(bytes, new CompressionStream('gzip'))) + '.' + sum; } catch (e) { /* plain code below */ }
    return 'UFCB.' + bytesB64(bytes) + '.' + sum;
  },
  async read(text) {
    text = String(text || '').replace(/\s+/g, '');
    const m = /^(UFCB|UFCZ)\.([A-Za-z0-9+/=]+)\.([0-9a-z]+)$/.exec(text);
    if (!m) throw new Error('Это не код сохранения UFC (или он обрезан при копировании).');
    let json;
    try {
      let bytes = b64Bytes(m[2]);
      if (m[1] === 'UFCZ') { if (!window.DecompressionStream) throw new Error('Браузер не умеет распаковывать этот код.'); bytes = await pipe(bytes, new DecompressionStream('gzip')); }
      json = new TextDecoder().decode(bytes);
    } catch (e) { throw new Error(e && e.message && /браузер/i.test(e.message) ? e.message : 'Код повреждён.'); }
    if (fnv(json) !== m[3]) throw new Error('Контрольная сумма не сходится — код изменён или скопирован не полностью.');
    const o = JSON.parse(json);
    if (!o || o.app !== 'ufc' || !o.items) throw new Error('В коде нет данных игры.');
    return o;
  },
};

// One place for runtime errors: console + an on-screen note (once per message).
UFC.reportError = (e, where) => {
  const msg = String((e && e.message) || e);
  console.error('[UFC]', where || '', e);
  UFC._seenErrors = UFC._seenErrors || new Set();
  if (UFC._seenErrors.has(msg) || !UFC.showNotice) return;
  UFC._seenErrors.add(msg);
  UFC.showNotice('<b>Ошибка в игре:</b> ' + msg.replace(/</g, '&lt;') + (where ? ' <small>' + where + '</small>' : ''), false);
  clearTimeout(UFC._noticeT); UFC._noticeT = setTimeout(() => UFC.hideNotice && UFC.hideNotice(), 7000);
};

// Visual quality switches decided once at start-up (weak GPUs skip hair strands).
UFC.QUALITY = { strands: true };

// ---------------------------------------------------------------------------
// Actions a touch input can be bound to. Each one is expressed in the same
// buttons the keyboard and the gamepad use, so remapping never invents new
// combat rules: btn = strike button, mods = held modifiers, hold = trigger,
// tap = one-shot action, mod = sticky modifier.
// ---------------------------------------------------------------------------
UFC.ACTIONS = {
  none: { name: '—', short: '' },
  jab: { name: 'Джеб (передняя рука)', short: 'ДЖЕБ', btn: 'square' },
  cross: { name: 'Кросс (задняя рука)', short: 'КРОСС', btn: 'triangle' },
  hookL: { name: 'Хук передней рукой', short: 'ХУК L', btn: 'square', mods: { l1: 1 } },
  hookR: { name: 'Хук задней рукой', short: 'ХУК R', btn: 'triangle', mods: { l1: 1 } },
  upperL: { name: 'Апперкот передней', short: 'АППЕР L', btn: 'square', mods: { r1: 1 } },
  upperR: { name: 'Апперкот задней', short: 'АППЕР R', btn: 'triangle', mods: { r1: 1 } },
  bodyL: { name: 'В корпус передней рукой', short: 'КОРПУС L', btn: 'square', mods: { l1: 1, r1: 1 } },
  bodyR: { name: 'В корпус задней рукой', short: 'КОРПУС R', btn: 'triangle', mods: { l1: 1, r1: 1 } },
  lowL: { name: 'Лоу-кик передней ногой', short: 'ЛОУ L', btn: 'cross' },
  lowR: { name: 'Лоу-кик задней ногой', short: 'ЛОУ R', btn: 'circle' },
  bodyKickL: { name: 'Кик в корпус передней', short: 'КИК L', btn: 'cross', mods: { l1: 1 } },
  bodyKickR: { name: 'Кик в корпус задней', short: 'КИК R', btn: 'circle', mods: { l1: 1 } },
  headKickL: { name: 'Хай-кик передней', short: 'ХАЙ L', btn: 'cross', mods: { r1: 1 } },
  headKickR: { name: 'Хай-кик задней', short: 'ХАЙ R', btn: 'circle', mods: { r1: 1 } },
  knee: { name: 'Колено', short: 'КОЛЕНО', btn: 'cross', mods: { l1: 1, r1: 1 } },
  block: { name: 'Блок (удерживать)', short: 'БЛОК', hold: 'r2' },
  duck: { name: 'Уклон корпусом', short: 'УКЛОН', hold: 'l2' },
  modHook: { name: 'Модификатор: хук', short: 'ХУК', mod: 'l1' },
  modUpper: { name: 'Модификатор: апперкот', short: 'АППЕР', mod: 'r1' },
  gnp: { name: 'Добивание', short: 'ДОБИТЬ', tap: 'gnp' },
  flow: { name: 'FLOW', short: 'FLOW', tap: 'flow' },
  commit: { name: 'Вложиться (Топурия)', short: 'ВЛОЖ', tap: 'commit' },
  counter: { name: 'Контра (Топурия)', short: 'КОНТРА', tap: 'counter' },
};

// Inputs that can be remapped, and what they do out of the box.
UFC.BIND_SLOTS = {
  btn: [
    ['square', '□ квадрат'], ['triangle', '△ треугольник'], ['cross', '✕ крест'], ['circle', '○ круг'],
    ['l1', 'L1'], ['r1', 'R1'], ['l2', 'L2'], ['r2', 'R2'],
  ],
  swipe: [
    ['tap', 'Тап (без движения)'], ['up', 'Свайп вверх'], ['down', 'Свайп вниз'], ['left', 'Свайп влево'], ['right', 'Свайп вправо'],
    ['diagUp', 'Диагональ вверх'], ['diagDown', 'Диагональ вниз'], ['long', 'Длинный свайп'],
  ],
};
UFC.BIND_DEFAULTS = {
  btn: { square: 'jab', triangle: 'cross', cross: 'lowL', circle: 'lowR', l1: 'modHook', r1: 'modUpper', l2: 'duck', r2: 'block' },
  swipe: { tap: 'jab', up: 'upperR', down: 'bodyR', left: 'hookL', right: 'cross', diagUp: 'headKickR', diagDown: 'lowR', long: 'bodyKickR' },
};
// left/right twin of an action, so a diagonal swipe can pick the near limb
UFC.mirrorAction = (id) => {
  if (!id) return id;
  if (/L$/.test(id) && UFC.ACTIONS[id.slice(0, -1) + 'R']) return id.slice(0, -1) + 'R';
  if (/R$/.test(id) && UFC.ACTIONS[id.slice(0, -1) + 'L']) return id.slice(0, -1) + 'L';
  return id;
};

UFC.binds = (settings) => {
  const b = (settings && settings.binds) || {};
  const out = {
    btn: Object.assign({}, UFC.BIND_DEFAULTS.btn, b.btn || {}),
    swipe: Object.assign({}, UFC.BIND_DEFAULTS.swipe, b.swipe || {}),
  };
  // bindings saved for the removed grappling actions fall back to the defaults
  for (const grp of ['btn', 'swipe']) for (const k in out[grp]) if (!UFC.ACTIONS[out[grp][k]]) out[grp][k] = UFC.BIND_DEFAULTS[grp][k] || 'none';
  return out;
};

// Phone balance: a thumb cannot mash escape inputs like a keyboard, so the
// wrestling exchange is eased on touch devices (set by game.js on boot).
UFC.mobile = false;
// Every zone (head / body / legs / liver) has 1.5x the old health: 150 instead of 100.
UFC.HP_MUL = 1.5;
// the player's fuel for the coming fight, in percent (set by the career; a quick fight is 100 / 100)
UFC.fuel = { gly: 100, acid: 100 };
// Everything that can finish a fighter (zone health, the face, a leg) takes twice as much punishment.
UFC.TOUGH = 1.25;
// Striking only: no clinch, takedowns or submissions.
UFC.NO_GRAPPLE = false;
UFC.MOBILE_TUNE = { npcShot: 1 / 3, escapeEase: 2, playerRegen: 1.2 };

UFC.applyTouchSize = (size) => {
  document.body.classList.toggle('bigtouch', size === 'big');
  document.body.classList.toggle('smalltouch', size === 'small');
};

// one sentence about how safe the saves are right now
UFC.storeLine = (short) => {
  const t = UFC.store, st = t.status();
  if (!st.persistent && !st.idb) return 'Сохранения недоступны в этом окне — прогресс не переживёт перезагрузку. Откройте игру в обычной вкладке браузера и сделайте «Резервный код» (Карьера).';
  const parts = ['🛡 Каждое сохранение проверяется контрольной суммой'];
  parts.push(st.persistent ? 'хранится в двух поколениях' + (st.idb ? ' + зеркало IndexedDB' : '') : 'хранится только в памяти окна' + (st.idb ? ' + зеркало IndexedDB' : ''));
  if (st.persisted) parts.push('хранилище закреплено браузером');
  if (st.degraded) parts.push('⚠ браузер отказал в записи — данные лежат в зеркале и памяти, сделайте резервный код');
  if (st.healed) parts.push('восстановлено из копии: ' + st.healed);
  return parts.join(' · ') + (short || !st.lastSaveAt ? '' : '. Последняя запись: ' + new Date(st.lastSaveAt).toLocaleTimeString());
};

UFC.fmtTime = (sec) => { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
})();

