//# sourceURL=ufc/game.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3;
const STEP = 1 / 120;

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ui = new UFC.UI(this);
    const q = this.ui.settings.quality || 'auto';
    // a phone or tablet: touch is the primary pointer, not a touchscreen laptop
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const mobile = UFC.TouchControls.isTouch() && (coarse || Math.min(screen.width, screen.height) < 820);
    UFC.mobile = mobile;
    this.low = q === 'low' || (q === 'auto' && mobile);

    this.renderer = this._createRenderer();
    // Integrated / low-memory GPUs get lighter shadows and crowd automatically.
    this.medium = q === 'auto' && !this.low && this._weakGPU();
    // detailed hair strands: on by default for real GPUs, always on if the
    // player picks high quality, off on weak/mobile hardware
    UFC.QUALITY.strands = q === 'low' ? false : !this.low;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.low ? 1.25 : this.medium ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.low ? THREE.BasicShadowMap : this.medium ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace; else this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050507);
    this.scene.fog = new THREE.Fog(0x050507, 18, 42);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 120);
    this.cam = new UFC.BroadcastCamera(this.camera);

    this.arena = new UFC.Arena(this.scene, this.low, this.medium);
    this.fx = new UFC.FX(this.scene);
    this.audio = new UFC.Audio();
    this.audio.setVolume(this.ui.settings.volume);
    this.audio.enabled = this.ui.settings.speech;
    this.audio.voiceMode = this.ui.settings.voice || 'sys';
    this.audio.musicEnabled = this.ui.settings.music !== false;
    // the browser only lets sound start after a touch or a key: the first one wakes the audio and the music
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => { try { this.audio.ensure(); } catch (e) { /* no audio */ } }, { capture: true, passive: true });
    setInterval(() => this._musicTick(), 800);
    this.input = new UFC.Input();
    this.touch = new UFC.TouchControls(this.input);
    this.combat = new UFC.Combat(this);
    this.comm = new UFC.Commentary(this);

    this.phase = 'menu';
    this.paused = false;
    this.recorder = new UFC.Replay.Recorder(6);
    this.show = null;
    this.ref = null;
    this.timeScale = 1; this.slowmo = 0; this.hitstop = 0;
    this.acc = 0;
    this.p1 = null; this.p2 = null;

    this._resize();
    this._watchContext();
    window.addEventListener('resize', () => this._resize());
    // Tabbing away mid-fight pauses instead of letting the fight run blind.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ['intro', 'fight', 'break'].includes(this.phase) && !this.paused) this.setPaused(true);
    });
    this.ui.home();
    this.last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
  }

  _createRenderer() {
    const tries = [
      { antialias: !this.low, powerPreference: 'high-performance' },
      { antialias: false, powerPreference: 'default' },
      { antialias: false, powerPreference: 'low-power', precision: 'mediump', failIfMajorPerformanceCaveat: false },
    ];
    let err;
    for (const opts of tries) {
      try { return new THREE.WebGLRenderer(Object.assign({ canvas: this.canvas }, opts)); } catch (e) { err = e; }
    }
    const e = new Error('WEBGL_UNAVAILABLE');
    e.cause = err;
    throw e;
  }

  _weakGPU() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      this.gpuName = name;
      return /intel|hd graphics|uhd|iris|mali|adreno|powervr|swiftshader|llvmpipe|microsoft basic/i.test(name);
    } catch (e) { return false; }
  }

  // A GPU reset (driver timeout, memory pressure) kills the WebGL context and
  // the canvas goes black. Pause, tell the player, and resume on restore.
  _watchContext() {
    this.canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.contextLost = true;
      if (['intro', 'fight', 'break'].includes(this.phase) && !this.paused) this.setPaused(true);
      UFC.showNotice('Видеокарта сбросила 3D-графику. Восстанавливаем…');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      UFC.hideNotice();
      this._resize();
    });
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    document.body.classList.toggle('portrait', h > w);
  }

  // ---------------------------------------------------------------------
  // Menu preview
  // ---------------------------------------------------------------------
  previewFighter(cfg) { this.showPreview(cfg); }

  // One fighter standing in the octagon behind menu screens (null = none).
  showPreview(cfg) {
    if (!cfg) { this._removeFighter(this.preview); this.preview = null; return; }
    if (this.preview && this.preview.cfg === cfg) return;
    this._removeFighter(this.preview);
    this.preview = null;
    const f = new UFC.Fighter(this, cfg, 0);
    f.place(0, 0, 0);
    this.preview = f;
  }

  _removeFighter(f) {
    if (!f) return;
    if (f.neon) { try { f.neon.dispose(); } catch (e) { /* gone */ } f.neon = null; }
    this.scene.remove(f.body.root);
    const mats = new Set();
    f.body.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) mats.add(m);
    });
    for (const m of mats) {
      for (const k of ['map', 'emissiveMap']) if (m[k] && m[k].isTexture) m[k].dispose();
      m.dispose();
    }
  }

  // ---------------------------------------------------------------------
  // Fight lifecycle
  // ---------------------------------------------------------------------
  // extra: { title, divName, event, champion: 'p1'|'p2'|null, career, presentation: 'full'|'short'|'off', onEnd }
  startQuickFight(cfgA, cfgB, settings, extra = {}) {
    if (settings.technique && !cfgA.technique) cfgA = Object.assign({}, cfgA, { technique: settings.technique });
    if (!cfgA.mcgMod) {   // the McGregor mod is on for the player in every fight: Auto = level 1, level 2 with the McGregor technique; the settings can force 1, 2 or off
      const raw = +(settings.mcg || (this.ui && this.ui.settings && this.ui.settings.mcg) || 0);
      const lvl = raw < 0 ? 0 : raw > 0 ? raw : (cfgA.technique === 'mcgregor' || cfgA.id === 'mcgregor' ? 2 : 1);
      if (lvl) cfgA = Object.assign({}, cfgA, { mcgMod: lvl });
    }
    if (!extra.career) UFC.fuel = { gly: 100, acid: 100 };
    this.audio.ensure();
    this._abortShow();
    this._removeFighter(this.preview); this.preview = null;
    this._removeFighter(this.p1); this._removeFighter(this.p2);
    this.fightInfo = Object.assign({ title: false, divName: cfgA.division || '', event: 'UFC FIGHT NIGHT', champion: null, career: false }, extra, { settings });
    this.lastFight = null;
    this.koThumb = null;
    this.recorder.reset();
    this.counterWin = null; this._cwT = -9; this._formNew = null;
    this.opts = { rounds: settings.rounds === 99 ? 99 : (settings.rounds || 5), roundLen: settings.roundLen || 45, difficulty: settings.difficulty };
    this._finishFired = false;
    this.p1 = new UFC.Fighter(this, cfgA, 0);
    this.p2 = new UFC.Fighter(this, cfgB, 1);
    this.p1.opponent = this.p2; this.p2.opponent = this.p1;
    this.pc = new UFC.PlayerController(this.p1, this.input, this);
    const tm = settings.tierMods;
    this.ai = new UFC.AIController(this.p2, Math.max(0, (settings.difficulty | 0) - (tm ? tm.drop || 0 : 0)), this);
    this.p1.isPlayer = true; this.p1.npc = null;
    { const nb = UFC.NPC_MODS[M.clamp(settings.difficulty | 0, 0, UFC.NPC_MODS.length - 1)]; this.p2.npcDmgMul = cfgB.dmgMul || 1; this.p2.npc = tm ? Object.assign({}, nb, { damage: nb.damage * tm.dmg, speed: nb.speed * tm.spd, stamina: nb.stamina * (0.92 + 0.08 * tm.spd), regen: nb.regen * (0.92 + 0.08 * tm.spd), move: nb.move * (0.95 + 0.05 * tm.spd), spread: nb.spread * (tm.dmg < 1 ? 1.25 : 0.9) }) : nb; if (cfgB.dmgMul) this.p2.npc = Object.assign({}, this.p2.npc, { damage: this.p2.npc.damage * cfgB.dmgMul }); }
    this.p1.resetForFight(); this.p2.resetForFight();
    this.arena.setMatchup(UFC.shortName(cfgA).toUpperCase(), UFC.shortName(cfgB).toUpperCase());
    this.ui.hideAll();
    this.ui.hudSetup(this.p1, this.p2);
    this.touch.show(UFC.TouchControls.isTouch());
    this.cards = [];
    this.round = 1;
    this.result = null;
    this.fx.clearStains();
    if (!this.ref) this.ref = new UFC.Referee(this);
    this.ref.setVisible(true);
    if (!this.corners && (extra.presentation || this.ui.settings.presentation || 'full') === 'full') {
      this.corners = [new UFC.Cornerman(this, 0), new UFC.Cornerman(this, 1)];
      this.corners.forEach((c) => c.setVisible(false));
    }
    const mode = extra.presentation || this.ui.settings.presentation || 'full';
    if (mode === 'off') {
      this._beginRound(true);
      this.audio.say(UFC.shortName(cfgA) + ' против ' + UFC.shortName(cfgB) + '!');
      this.comm.reset();
      return;
    }
    // walkout & introductions, then round one
    this.ui.hudHide();
    this.touch.show(false);
    this.phase = 'show';
    this.show = UFC.Ceremony.walkout(this, {
      a: this.p2, b: this.p1, title: this.fightInfo.title, interim: !!this.fightInfo.interim, divName: this.fightInfo.divName, event: this.fightInfo.event, rounds: settings.rounds, short: mode === 'short',
      champion: this.fightInfo.champion === 'p1' ? 'b' : this.fightInfo.champion === 'p2' ? 'a' : null,
      onDone: () => {
        this.show = null;
        for (const f of [this.p1, this.p2]) f.endCine('fight');
        this.ui.hudSetup(this.p1, this.p2);
        this.touch.show(UFC.TouchControls.isTouch());
        this._beginRound(true);
      },
    });
  }

  // Weigh-in + face-off before a career fight (fighters built just for the show).
  startWeighIn(cfgA, cfgB, extra = {}) {
    this.audio.ensure();
    this._abortShow();
    this._removeFighter(this.preview); this.preview = null;
    this._removeFighter(this.p1); this._removeFighter(this.p2);
    this.p1 = new UFC.Fighter(this, cfgA, 0);
    this.p2 = new UFC.Fighter(this, cfgB, 1);
    this.p1.opponent = null; this.p2.opponent = null;
    if (!this.ref) this.ref = new UFC.Referee(this);
    this.ui.hideAll(); this.ui.hudHide(); this.touch.show(false);
    this.phase = 'show';
    this.show = UFC.Ceremony.weighIn(this, {
      a: this.p2, b: this.p1, title: extra.title, divName: extra.divName, event: extra.event, weights: extra.weights || [cfgB.weight, cfgA.weight],
      onDone: () => {
        this.show = null;
        this._removeFighter(this.p1); this._removeFighter(this.p2); this.p1 = this.p2 = null;
        if (this.ref) this.ref.setVisible(false);
        this.phase = 'menu';
        if (extra.onDone) extra.onDone();
      },
    });
  }

  // A scene with two fighters and a custom film (career edits)
  startEdit(cfgA, cfgB, build, onDone) {
    this.audio.ensure(); this._abortShow();
    this._removeFighter(this.preview); this.preview = null;
    this._removeFighter(this.p1); this._removeFighter(this.p2);
    this.p1 = new UFC.Fighter(this, cfgA, 0); this.p2 = new UFC.Fighter(this, cfgB, 1);
    this.p1.opponent = null; this.p2.opponent = null;
    if (!this.ref) this.ref = new UFC.Referee(this);
    this.ref.setVisible(false);
    this.ui.hideAll(); this.ui.hudHide(); this.touch.show(false);
    this.phase = 'show';
    this.show = build(this, { a: this.p2, b: this.p1, onDone: () => {
      this.show = null; this._removeFighter(this.p1); this._removeFighter(this.p2); this.p1 = this.p2 = null; this.phase = 'menu';
      if (onDone) onDone();
    } });
  }

  // Play a stored knockout clip on freshly built fighters.
  playReplay(clip, onDone, extra) {
    this._abortShow();
    this._removeFighter(this.preview); this.preview = null;
    this._removeFighter(this.p1); this._removeFighter(this.p2);
    this.p1 = new UFC.Fighter(this, Object.assign({ stats: UFC.ROSTER[0].stats }, clip.cfgs[0]), 0);
    this.p2 = new UFC.Fighter(this, Object.assign({ stats: UFC.ROSTER[0].stats }, clip.cfgs[1]), 1);
    if (this.ref) this.ref.setVisible(false);
    this.ui.hideAll(); this.ui.hudHide(); this.touch.show(false);
    this.phase = 'show';
    this.show = UFC.Ceremony.replayView(this, clip, {
      fast: !!(extra && extra.fast),
      onDone: () => {
        this.show = null;
        this._removeFighter(this.p1); this._removeFighter(this.p2); this.p1 = this.p2 = null;
        this.phase = 'menu';
        if (onDone) onDone();
      },
    });
  }

  _abortShow() {
    if (!this.show) return;
    const s = this.show; this.show = null;
    s.opts.onDone = null;
    s.finish(true);
  }

  restartFight() {
    const a = this.p1.cfg, b = this.p2.cfg;
    this.setPaused(false);
    const info = this.fightInfo || {};
    this.startQuickFight(a, b, info.settings || this.ui.settings, Object.assign({}, info, { presentation: (this.ui.settings.presentation || 'full') === 'off' ? 'off' : 'short' }));
  }

  quitToMenu() {
    try { this._quitToMenu(); } catch (e) {
      UFC.reportError(e, 'выход из боя');
      this.p1 = this.p2 = null; this.phase = 'menu'; this.show = null;
      if (this.onQuit) { const cb = this.onQuit; this.onQuit = null; cb(); } else this.ui.home();
    }
  }

  _quitToMenu() {
    this.setPaused(false);
    this._abortShow();
    if (this.ref) this.ref.setVisible(false);
    UFC.Announcer && UFC.Announcer.cancel();
    this._removeFighter(this.p1); this._removeFighter(this.p2);
    this.p1 = this.p2 = null;
    this.phase = 'menu';
    this.timeScale = 1; this.slowmo = 0;
    this.audio.setDaze(0);
    this.ui.hudHide();
    this.touch.show(false);
    this.fx.clearStains();
    this.grapple = null;
    if (this.onQuit) { const cb = this.onQuit; this.onQuit = null; cb(); } else this.ui.home();
  }

  setPaused(v) {
    if (this.phase === 'menu' || this.phase === 'result') return;
    this.paused = v;
    if (v) this.ui.go('scr-pause', null, { reset: true }); else this.ui.hideAll();
  }

  _beginRound(first) {
    const p1 = this.p1, p2 = this.p2;
    if (!first) {
      for (const f of [p1, p2]) {
        f.stun = 0; f.hitstun = 0; f.stagger = 0; f.headDmg = Math.max(100 - f.headCap, f.headDmg * 0.3);
        f.stamina = Math.min(f.staminaCap, f.stamina + 55);
        if (f.hasGly) { f.gly = Math.min(f.glyMax, f.gly + 3); f.acid *= 0.45; }   // a minute in the corner
        f.head = Math.min(f.cap.head, f.head + 8); f.bodyHp = Math.min(f.cap.bodyHp, f.bodyHp + 10); f.legs = Math.min(f.cap.legs, f.legs + 12); f.liver = Math.min(f.cap.liver, f.liver + 20);
        f.roundStats = { dmg: 0, landed: 0, sig: 0, kd: 0 };
        f.cancelStrike(); f.ragdoll.stop(); f.state = 'fight';
        f.gnp = null; f.gnpBy = null; f.downPhase = null;
        this.grapple = null;
      }
    } else {
      p1.resetForFight(); p2.resetForFight(); this.grapple = null;
      const mods = this.fightInfo && this.fightInfo.p1Mods;
      if (mods) {
        if (mods.staminaCap) { p1.staminaCap = mods.staminaCap * (p1.glyCapMul || 1); p1.stamina = Math.min(p1.stamina, p1.staminaCap); }
        if (mods.cardioMul && !p1._cardioBase) { p1._cardioBase = p1.cardio; p1.cardio *= mods.cardioMul; }
      }
    }
    { // the forms of the Topuria style: LOW KEY and the angry form, both from the first round
      const f1 = p1;
      if (f1 && f1.isPlayer && f1.technique === 'topuria') {
        if (!f1.lowKey) { f1.lowKey = true; this._formNew = 'lowkey'; }
        if (!f1.angry) { f1.setAngry(true); this._formNew = 'angry'; }
      }
    }
    p1.place(-1.25, 0, Math.PI / 2);
    p2.place(1.25, 0, -Math.PI / 2);
    this.cam.pos.set(0, 1.9, 3.8);
    this.cam.look.set(0, 1.2, 0);
    this.clock = 0;
    this.refAction = null; this.koWindow = false; this.koSide = null;
    if (first) {   // this referee's habit for the whole fight: some jump in early, some let it go too long
      let h = 2166136261; const nm = (this.p1.cfg.name || '') + '|' + (this.p2.cfg.name || '') + '|' + ((this.fightInfo && this.fightInfo.event) || '');
      for (let i = 0; i < nm.length; i++) { h ^= nm.charCodeAt(i); h = Math.imul(h, 16777619); }
      this.refDelay = 1.9 + ((h >>> 0) % 1000) / 1000 * 2.3;
    }
    if (this.ref) { this.ref.setVisible(true); this.ref.place(0, -2.4, 0); }
    this.phase = 'intro';
    this.phaseT = 0;
    this.roundKD = [0, 0];
    if (this.opts.rounds >= 99) this.ui.callout('БОЙ ДО КОНЦА', 'до нокаута, сдачи или остановки рефери', 'round', 2.2); else this.ui.callout('РАУНД ' + this.round + ' / ' + this.opts.rounds, this.opts.roundLen + ' секунд', 'round', 1.6);
  }

  _endRound() {
    this.phase = 'break';
    this.phaseT = 0;
    this.audio.bell(3);
    const score = this._scoreRound();
    this.cards.push(score);
    if (this.round >= this.opts.rounds) {
      this._decision();
    } else {
      this.ui.showRoundBreak(this, this.cards);
      this.comm.roundEnd(this.cards);
    }
  }

  _scoreRound() {
    const pts = [this.p1, this.p2].map((f) => f.roundStats.dmg + f.roundStats.sig * 1.2 + f.roundStats.kd * 30 + (f.roundStats.control || 0) * 0.6 + (f.roundStats.td || 0) * 8);
    let a = 10, b = 10;
    if (pts[0] > pts[1] * 1.04) { b = pts[0] > pts[1] * 2.6 + 20 || this.p1.roundStats.kd - this.p2.roundStats.kd >= 2 ? 8 : 9; }
    else if (pts[1] > pts[0] * 1.04) { a = pts[1] > pts[0] * 2.6 + 20 || this.p2.roundStats.kd - this.p1.roundStats.kd >= 2 ? 8 : 9; }
    else if (pts[0] >= pts[1]) b = 9; else a = 9;
    return [a, b, pts];
  }

  _decision() {
    // three judges with their own reading of each round
    const judges = [0, 1, 2].map(() => {
      let a = 0, b = 0;
      for (const c of this.cards) {
        const [p0, p1] = c[2];
        const noise = M.rand(0.85, 1.15);
        const pa = p0 * noise, pb = p1 / noise;
        let sa = 10, sb = 10;
        if (Math.abs(pa - pb) < 3) { if (Math.random() < 0.5) sa = 9; else sb = 9; }
        else if (pa > pb) sb = c[1] === 8 ? 8 : 9; else sa = c[0] === 8 ? 8 : 9;
        a += sa; b += sb;
      }
      return [a, b];
    });
    const wins = judges.map(([a, b]) => (a > b ? 1 : a < b ? -1 : 0));
    const sum = wins.reduce((x, y) => x + y, 0);
    let winner = null, text;
    const n1 = wins.filter((w) => w === 1).length, n2 = wins.filter((w) => w === -1).length;
    if (sum > 0) winner = this.p1; else if (sum < 0) winner = this.p2;
    if (!winner) text = 'Ничья решением судей';
    else {
      const wn = winner === this.p1 ? n1 : n2, ln = winner === this.p1 ? n2 : n1;
      text = (wn === 3 ? 'Единогласное решение' : ln === 1 ? 'Раздельное решение' : 'Решение большинства') + ' · ' + winner.cfg.name;
    }
    this._finish({ winner, method: winner ? 'DEC' : 'DRAW', methodText: text, cards: judges.map(([a, b]) => [a, b]), round: this.opts.rounds, time: UFC.fmtTime(this.opts.roundLen) });
  }

  // A finish: remember how/when, mark the replay, grab a snapshot, referee steps in.
  _roundTime() { return UFC.fmtTime(this.clock % this.opts.roundLen); }

  _setPending(att, method, text, detail, loser) {
    const time = this._roundTime();
    this.pendingResult = { winner: att, method, methodText: text + ' · Раунд ' + this.round + ', ' + time, round: this.round, time, detail: detail || null };
    if (method === 'KO' || method === 'TKO') {
      this.recorder.mark(1.7);
      this._thumbAt = performance.now() + 380;
    }
    if (loser) this._refStop(loser, att);
    this.koWindow = !!(loser && (loser.state === 'ko' || loser.state === 'down') && this.ref && this.ref.visible && this.refAction); this.koSide = att; this.koWindowT = 0;
    if (this.koWindow) { this.slowmo = Math.min(this.slowmo, 0.25); this.timeScale = Math.max(this.timeScale, 0.6); if (att === this.p1) this.ui.callout('ДОБИВАЙ!', 'рефери ещё бежит', 'rocked', 1.4); }   // real time: the referee does not run in slow motion this._finisherSaid = false;
  }

  _refStop(loser, winner) {
    if (!this.ref || !this.ref.visible) return;
    // three ways to stop a fight: wave it off first, dive straight between them,
    // or (ground strikes) grab the attacker and hold him off
    const w = winner || (loser === this.p1 ? this.p2 : this.p1);
    const onTop = w && w.state === 'gnp';
    const pool = onTop ? ['wrap', 'dive', 'wave'] : loser.state === 'fight' ? ['wave', 'dive'] : ['wave', 'dive', 'wave', 'cover'];
    let variant = M.pick(pool);
    if (variant === this._lastRefVariant) variant = M.pick(pool);
    this._lastRefVariant = variant;
    this.refAction = { kind: 'stop', target: loser, winner: w, t: 0, variant, wait: Math.max(0, (this.refDelay || 1.5) * 0.5 - 0.1) };
  }

  _finish(res) {
    if (res.round == null) { res.round = this.round; res.time = this._roundTime(); }
    this.result = res;
    this.phase = 'ending';
    this.phaseT = 0;
    // never celebrate from the mount: get up first if the referee has not pulled him off yet
    if (res.winner && res.winner.state === 'gnp') res.winner.endGnp(true);
    if (res.winner) {
      res.winner.celebrate();
      this.audio.cheer(1);
      this.arena.excite(1);
      this.audio.say(res.method === 'DEC' ? 'Решение судей. Победитель, ' + res.winner.cfg.name : 'Всё кончено! ' + UFC.shortName(res.winner.cfg) + ' побеждает!');
    }
    this.ui.callout(res.method === 'DEC' || res.method === 'DRAW' ? 'РЕШЕНИЕ СУДЕЙ' : res.method, res.winner ? res.winner.cfg.name : 'Ничья', 'finish', 3.2);
  }

  // ---------------------------------------------------------------------
  // Combat events
  // ---------------------------------------------------------------------
  onStrikeStart(f, s) { if (this.phase === 'fight') this.audio.whoosh(s.def.dmg); }
  onOverextend(f) {
    if (f === this.p1) this.ui.hitMarker('ПРОВАЛИЛСЯ', 0);
    else this._timing(this.p1);
  }

  // McGregor timing: when the opponent makes a mistake a short bit of slow motion gives the holder a little time
  _timing(holder) {
    if (!holder || holder !== this.p1 || holder.technique !== 'mcgregor' || this.phase !== 'fight') return;
    const t = this.simTime || 0;
    if (t - (this._twT || -9) < 2.2 || this.slowmo > 0) return;
    this._twT = t; this.slowmo = 0.34; this.timeScale = 0.42;
    this.ui.hitMarker('ТАЙМИНГ', 0); this.audio.whoosh(6);
  }

  // He missed: time slows, the button lights up. Hit it inside 0.8 seconds and the counter lands.
  _openCounter(f) {
    const t = this.simTime || 0;
    if (this.counterWin || t - (this._cwT || -9) < 2.6) return;
    this._cwT = t; this.counterWin = { t: 0.8, target: f };
    this.slowmo = 0.8; this.timeScale = 0.28;
    this.ui.counterFx(true); this.audio.whoosh(8);
  }
  fireCounter(f) {
    if (!this.counterWin || f !== this.p1) return null;
    this.counterWin = null; this.ui.counterFx(false);
    this.slowmo = 0.25; this.timeScale = 0.55;
    this.ui.hitMarker('КОНТРА!', 0); this.audio.flow(); this.cam.shake(0.35);
    return { type: 'hook', limb: f.leadSide, fast: true, qte: true };
  }

  onWhiff(f, s) {
    f.stamina = Math.max(0, f.stamina - s.cost * 0.35);
    const o = f.opponent;
    if (o === this.p1 && o.technique === 'topuria' && this.phase === 'fight' && o.state === 'fight' && Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) < 1.9) this._openCounter(f);
    if (o && Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) < 1.9) this._timing(o);
    // A punch that just misses a moving head opens a counter window.
    if (s.def.kind === 'punch' && o.intent && (Math.abs(o.intent.slipX) > 0.4 || Math.abs(o.intent.slipZ) > 0.4)) {
      const d = f.gloveW[s.limb].distanceTo(o.headCenter(new V3()));
      if (d < 0.45) { o.slipCounter = 0.6; if (o === this.p1) this.ui.hitMarker('УКЛОН', 0); }
    }
  }
  onFootstep(f, speed) { if (this.ref && f === this.ref.f) return; if (speed > 0.6) this.audio.step(Math.min(1, speed / 2)); }

  onHit(att, def, s, zone, power, point, dir, counter, viaBlock) {
    if (viaBlock) return;
    this.audio.impact(power, zone, false);
    if (def.noDefT > 0.7 || def.state === 'ko' || (def.state === 'down' && this.koWindow)) def.lateHits++;   // he was already past help
    if (zone === 'head') this.fx.sweat(point, dir, power);
    else this.fx.sweat(point, dir, power * 0.5);
    if (zone === 'head' && def.head < 72 && power > 8 && Math.random() < 0.55) this.fx.blood(point, dir, power);
    if (zone === 'head') {
      const side = s.def.path === 'hook' || s.def.kind === 'kick' ? (s.limb === 'L' ? 'R' : 'L') : 'C';
      def.faceHit(Math.max(power, (this._lastP0 || 0) * 0.55), side, s.def.kind === 'kick' || counter);
    }
    this.hitstop = Math.max(this.hitstop, Math.min(0.17, 0.045 + power * 0.008));
    this.cam.shake(Math.min(0.45, power * (zone === 'head' ? 0.022 : 0.016)));
    this.ui.impactFlash(power, zone);
    if (power > 13 && this.slowmo <= 0) { this.slowmo = 0.16; this.timeScale = 0.28; }   // the big ones hang for a moment
    if (def === this.p1 && zone === 'head' && (def.lastAccel || 0) >= 20 && (this.simTime || 0) - (this._ringT || -99) > 12) { this._ringT = this.simTime || 0; this.audio.earRing(Math.min(0.8, (def.lastAccel - 10) / 14)); }
    if (att === this.p1 && power > 9) this._vibrate(20 + power * 2);
    this.arena.excite(power * (counter ? 0.05 : 0.03));
    const name = s.def.name[s.lead ? 0 : 1];
    const side = att === this.p1 ? 0 : 1;
    if (power >= 6) this.ui.hitMarker((counter ? 'КОНТРА · ' : '') + name, side);
    if (att.comboLanded >= 3) this.ui.hitMarker('КОМБО ×' + att.comboLanded, side);
    // the referee watches a hurt fighter taking unanswered shots
    if (def.rocked && zone === 'head') { def.unanswered = (def.unansweredT > 0 ? def.unanswered || 0 : 0) + 1; def.unansweredT = 2.4; }
    // after a knockout he can be hit until the referee pulls the winner off
    if (this.koWindow && att === this.p1) { this.ui.hitMarker('ДОБИВАНИЕ', 0); if (!this._finisherSaid) { this._finisherSaid = true; this.ui.callout('ДОБИВАЕТ!', 'рефери ещё не успел', 'rocked', 1.0); } }
    if (def === this.p1 && power > 9) this._vibrate(30 + power * 3);
    if (power > 12) this.comm.say('heavy');
    else if (counter) this.comm.say('counter');
    else if (att.comboLanded >= 3) this.comm.say('combo');
    else if (zone === 'legs') this.comm.say('leg');
    else if (zone === 'body') this.comm.say('body');
    else if (s.def.path === 'straight' && s.lead) this.comm.say('jab');
    else if (zone === 'head') this.comm.say('head');
    // a hurt fighter who starts winning exchanges is a comeback story
    if (att.stun > 45 && att.comboLanded >= 2) this.comm.say('comeback');
    if (def.rocked && !def._rockedAnnounced) {
      def._rockedAnnounced = true;
      this.ui.callout('ПОТРЯСЁН!', def.cfg.name, 'rocked', 1.2);
      this.comm.say('rocked', { force: true });
      this.arena.excite(0.4);
    }
    if (!def.rocked) def._rockedAnnounced = false;
  }

  // the angry form: every blow throws him back and makes him stagger
  onAngryHit(att, def, point, power, blocked) {
    const d = new V3().subVectors(def.pos, att.pos).setY(0); if (d.lengthSq() < 1e-6) d.set(Math.sin(att.yaw), 0, Math.cos(att.yaw)); d.normalize();
    def.vel.addScaledVector(d, blocked ? 1.2 : 2.2);
    def.stagger = Math.max(def.stagger, blocked ? 0.15 : 0.35);
    if (!blocked && power > 10 && Math.random() < 0.4) def.stumble(d, 22);
    if (UFC.NeonFx && !blocked && Math.random() < 0.55) UFC.NeonFx.shockwave(this, point, 0xffb020);
  }

  onComboHit(att, def, point, power, blocked) {
    const d = new V3().subVectors(def.pos, att.pos).setY(0); if (d.lengthSq() < 1e-6) d.set(Math.sin(att.yaw), 0, Math.cos(att.yaw)); d.normalize();
    def.vel.addScaledVector(d, blocked ? 3.4 : 7.2);
    def.stagger = Math.max(def.stagger, blocked ? 0.5 : 1.2);
    if (!blocked) def.stumble(d, 60);
    this.ui.callout('КОМБО!', 'поток + вложение + тяжёлый удар', 'flow', 1.0);
    this.cam.shake(blocked ? 0.5 : 1.0); this.audio.impact(14, 'head', false);
    if (UFC.NeonFx) UFC.NeonFx.shockwave(this, point, att.technique === 'topuria' ? 0x00f0ff : 0xffd45a);
    if (this.slowmo <= 0) { this.slowmo = 0.3; this.timeScale = 0.3; }
    if (att === this.p1) this._vibrate(120);
  }

  onCommit(f) {
    this.ui.callout('ВЛОЖИСЬ!', 'следующие 3 удара — сверхтяжёлые', 'flow', 1.2);
    this.cam.shake(0.2);
    this.audio.flow();
    if (f === this.p1) this._vibrate(70);
  }

  onFlow(f) {
    this.ui.callout('FLOW', 'Восстановление +50% · расход −50% · урон +20% · сила +15%', 'flow', 1.8);
    this.comm.say('flow', { force: true });
    this.cam.shake(0.25);
    this.fx.blood(f.headCenter(new V3()), new V3(0, 1, 0.4), 8);
    this.audio.flow();
    this.arena.excite(0.5);
    if (f === this.p1) this._vibrate(60);
  }

  // ---------------------------------------------------------------- grappling events
  onGrappleStart(g, kind) {
    this.audio.impact(4, 'body', true);
    this.arena.excite(0.15);
    if (kind === 'shot') this.ui.hitMarker('ПРОХОД В НОГИ', g.a === this.p1 ? 0 : 1);
  }
  onGrappleAttempt(g, at) {
    const names = { takedown: 'ТЕЙКДАУН', cage: 'К СЕТКЕ', advance: 'ПРОХОД ПОЗИЦИИ', escape: 'ВЫХОД', sub: 'САБМИШН' };
    this.ui.grappleAttempt(at.who === this.p1, at.other === this.p1, names[at.kind] || '');
  }
  onGrappleResult(g, at, ok) {
    if (ok && at.kind === 'advance') this.comm.say('ground');
    if (!ok && at.kind === 'takedown') this.comm.say('sprawl');
    const side = at.who === this.p1 ? 0 : 1;
    if (!ok) {
      this.ui.hitMarker(at.defended ? 'ЗАЩИТИЛСЯ' : 'НЕ ПОЛУЧИЛОСЬ', at.other === this.p1 ? 0 : 1);
      if (at.kind === 'takedown') { this.audio.impact(5, 'body', true); this.arena.excite(0.2); }
    } else if (at.kind === 'advance') {
      this.ui.hitMarker(UFC.GRAPPLE_POS[at.target].name, side);
      this.arena.excite(0.25);
    } else if (at.kind === 'escape') {
      this.ui.hitMarker('ВЫШЕЛ', side);
      this.arena.excite(0.2);
    }
  }
  onTakedownStart(g, a, b) {
    this.cam.shake(0.25);
    this.arena.excite(0.5);
    this.audio.cheer(0.45);
    this.comm.say('takedown', { force: true });
  }
  onTakedownLanded(g, a, b) {
    this.audio.impact(9, 'body', false);
    this.cam.shake(0.35);
    this.hitstop = Math.max(this.hitstop, 0.05);
    this.ui.callout('ТЕЙКДАУН', UFC.GRAPPLE_POS[g.pos].name, 'rocked', 1.1);
  }
  onSubStart(g, att, def, kind) {
    this.ui.callout(UFC.SUB_NAMES[kind].toUpperCase() + '!', att === this.p1 ? 'Жми удары / G — дожимай' : 'Жми удары / G / блок — вырывайся', 'rocked', 1.4);
    this.comm.say('sub', { force: true });
    this.arena.excite(0.6);
  }
  onTap(g, att, def, kind) {
    this.audio.cheer(1);
    this.arena.excite(1);
  }
  onSubmission(g, att, def, kind) {
    if (this.phase !== 'fight') return;
    this.grapple = null;
    this.phase = 'ko';
    this.phaseT = 0;
    att.stats.subs = (att.stats.subs || 0) + 1;
    this._setPending(att, 'SUB', 'Сабмишн · ' + UFC.SUB_NAMES[kind], { type: 'sub', sub: kind });
    this.ui.callout('САБМИШН!', att.cfg.name + ' · ' + UFC.SUB_NAMES[kind], 'ko', 3.5);
    this.comm.say('tap', { force: true });
    def.state = 'ko'; def.downPhase = 'ko';
    // the loser rolls away into a sitting position rather than going limp
    def.state = 'down'; def.downPhase = 'grounded'; def.groundT = 0; def.downTimer = -99; def.getupAt = 99;
    def._downSnap = def._snapshot(def.yaw);
    att._toLiveFromGrapple = true;
    g._toLive(att);
    att.celebrate();
  }
  onSubEscape(g, att, def, kind) {
    this.ui.hitMarker('ВЫРВАЛСЯ ИЗ ' + UFC.SUB_NAMES[kind].toUpperCase(), def === this.p1 ? 0 : 1);
    this.comm.say('subEscape', { force: true });
    this.arena.excite(0.5);
    this.audio.cheer(0.4);
  }
  onGrappleEnd(g) { this.ui.grappleAttempt(false, false, ''); }
  // no referee: ground strikes never stop the fight, only an empty health bar does
  onGrappleStoppage(g, att, def) {
    if (this.phase !== 'fight' || def._dead) return;
    def._dead = true; this.grapple = null; try { g._toLive(att); } catch (e) { UFC.reportError(e, 'конец борьбы'); }
    def.knockOut(new V3().subVectors(def.pos, att.pos).setY(0).normalize(), 3);
    this.phase = 'ko'; this.phaseT = 0;
    this._setPending(att, 'TKO', 'Остановка рефери · удары в партере', { type: 'gnp' }, def);
    this.ui.callout('РЕФЕРИ ОСТАНАВЛИВАЕТ БОЙ', att.cfg.name, 'ko', 3.5);
    this.audio.say('Рефери останавливает бой!'); this.audio.cheer(1);
  }

  onFaceDamage(def, power, heavy) {
    const r = Math.random();
    def.faceHit(power, r < 0.4 ? 'C' : r < 0.7 ? 'L' : 'R', heavy);
  }

  onLiverHit(att, def, power) {
    if (power > 7) this.ui.hitMarker('В ПЕЧЕНЬ', att === this.p1 ? 0 : 1);
  }

  // Delayed liver shot: legs give out a moment after the blow.
  onLiverCollapse(f) {
    const att = f.opponent;
    const ko = f.liver <= 0;
    const dir = new V3().subVectors(f.pos, att.pos).setY(0).normalize();
    f.stats.liverKd = (f.stats.liverKd || 0) + 1;
    att.stats.kd++; att.roundStats.kd++;
    const fake = { def: { name: ['Удар по печени', 'Удар по печени'] }, lead: false, type: 'liver' };
    if (ko) f.knockOut(dir, 3); else f.knockDown(dir, 3, 'body');
    this.onKnockdown(att, f, 'body', ko, 'KO', fake);
    this.ui.callout(ko ? 'ПЕЧЕНЬ!' : 'УДАР ПО ПЕЧЕНИ', f.cfg.name + ' складывается', 'kd', 1.8);
    this.audio.say(M.pick(['По печени!', 'Удар по печени, он складывается!']));
  }

  onGnpStoppage(att, def) {
    if (this.phase !== 'fight' || def._dead) return;
    def._dead = true;
    def.knockOut(new V3().subVectors(def.pos, att.pos).setY(0).normalize(), 4);
    this.phase = 'ko'; this.phaseT = 0;
    this.slowmo = 1.0; this.timeScale = 0.45;
    this._setPending(att, 'TKO', 'Остановка рефери · удары в партере', { type: 'gnp' }, def);
    this.ui.callout('РЕФЕРИ ОСТАНАВЛИВАЕТ БОЙ', att.cfg.name, 'ko', 3.5);
    this.audio.say('Рефери останавливает бой! Удары в партере!'); this.audio.cheer(1); this.arena.excite(1);
  }

  onBlocked(att, def, s, point, power) {
    this.audio.impact(power, 'head', true);
    // a kick slamming into the arms is felt more than a jab on the gloves
    this.hitstop = Math.max(this.hitstop, Math.min(0.09, 0.02 + power * 0.004));
    this.cam.shake(Math.min(0.45, 0.05 + power * 0.016));
    if (power > 9) this.fx.sweat(point, new THREE.Vector3().subVectors(def.pos, att.pos).setY(0).normalize(), power * 0.35);
  }

  onParry(def, att, point) {
    this.audio.impact(8, 'head', true);
    this.hitstop = Math.max(this.hitstop, 0.06);
    this.ui.hitMarker('ПАРИРОВАНИЕ', def === this.p1 ? 0 : 1);
  }

  onChecked(att, def, point, power) {
    this.audio.impact(power, 'legs', true);
    this.hitstop = Math.max(this.hitstop, 0.04);
    this.cam.shake(0.1);
    this.ui.hitMarker('БЛОК ЛОУ-КИКА', def === this.p1 ? 0 : 1);
  }

  onKnockdown(att, def, kind, ko, method, s) {
    const i = att === this.p1 ? 0 : 1;
    this.roundKD[i]++;
    this.slowmo = ko ? 1.8 : 0.9;
    this.timeScale = ko ? 0.28 : 0.4;
    this.cam.cinematic(def, ko ? 3.2 : 1.6, { lookY: 0.4, height: ko ? 0.6 : 0.9, fov: 34, flip: i === 1 });
    this.cam.shake(0.8);
    this.arena.excite(1);
    this.audio.cheer(ko ? 1 : 0.7);
    this._vibrate(def === this.p1 ? 180 : 80);
    if (ko) {
      this.phase = 'ko';
      this.phaseT = 0;
      this._setPending(att, method, (method === 'KO' ? 'Нокаут' : 'Технический нокаут') + ' · ' + s.def.name[s.lead ? 0 : 1], { type: s.type || (s.def && s.def.type) || (kind === 'body' ? 'liver' : ''), lead: !!s.lead }, def);
      this.ui.callout(method === 'KO' ? 'НОКАУТ!' : 'ТЕХНИЧЕСКИЙ НОКАУТ', att.cfg.name, 'ko', 3.5);
      this.comm.say(method === 'KO' ? 'ko' : 'tko', { force: true });
    } else {
      this.ui.callout('НОКДАУН!', def.cfg.name, 'kd', 1.6);
      this.comm.say('knockdown', { force: true });
    }
  }

  _vibrate(ms) {
    try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(ms); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------
  _frame(now) {
    requestAnimationFrame((t) => this._frame(t));
    if (this.contextLost) { this.last = now; return; }
    try {
      this._tick(now);
      this._badFrames = 0;
    } catch (e) {
      this._badFrames = (this._badFrames || 0) + 1;
      this.errors = (this.errors || 0) + 1;
      UFC.reportError(e, 'кадр');
      // still show the scene, and after ~1.5 s of failing frames offer a way out
      try { this.renderer.render(this.scene, this.camera); } catch (e2) { /* nothing more to do */ }
      if (this._badFrames === 90) this.ui.fatal(e);
    }
  }

  _tick(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.input.poll();

    if (this.phase === 'menu') {
      if (this.preview && this.ui.current && this.ui.current !== 'scr-menu') {
        this.preview.intent.mx = this.preview.intent.mz = 0;
        this.preview.time += dt;
        this.preview.yaw = Math.sin(now * 0.0004) * 0.6;
        this.preview._pose(dt);
        this.cam.preview(dt, this.preview.pos, this.ui.current === 'scr-look' || !!(this.ui.routes[this.ui.current] || {}).editor);
      } else this.cam.menu(dt);
      this.arena.update(dt, now / 1000, this.camera);
      this.arena.updateFence(this.camera, dt);
      this.ui.navTick(this.input);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'show') {
      const inp = this.input;
      if (this.show && (inp.pressed('start') || inp.pressed('cross') || inp.pressed('back') || this._skipClicked)) this.show.skip();
      this._skipClicked = false;
      if (this.show) this.show.update(Math.min(dt, 1 / 20));
      this.arena.update(dt, now / 1000, this.camera);
      this.arena.updateFence(this.camera, dt);
      this.fx.update(dt);
      this.audio.setCrowd(this.arena.crowdLevel);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.input.pressed('start') && ['intro', 'fight', 'break'].includes(this.phase)) {
      // Esc inside a sub-screen of the pause menu goes back to the pause menu.
      if (this.paused && this.ui.current !== 'scr-pause') this.ui.back();
      else this.setPaused(!this.paused);
    }
    if (this.paused || this.phase === 'result') this.ui.navTick(this.input);
    if (this.paused) { this.renderer.render(this.scene, this.camera); return; }

    if (this.counterWin) { this.counterWin.t -= dt; if (this.counterWin.t <= 0 || this.phase !== 'fight') { this.counterWin = null; this.ui.counterFx(false); } }
    // time control: hit-stop freezes, slow-mo stretches
    if (this.slowmo > 0) { this.slowmo -= dt; if (this.slowmo <= 0) this.timeScale = 1; }
    let simDt = dt * this.timeScale;
    if (this.hitstop > 0) { this.hitstop -= dt; simDt = 0; }
    // Read the pad once per rendered frame so a press is one action.
    if ((this.phase === 'fight' || (this.phase === 'ko' && this.koWindow && this.koSide === this.p1)) && this.pc) this.pc.update();
    this.acc += simDt;
    let steps = 0;
    while (this.acc >= STEP && steps < 10) { this._step(STEP); this.acc -= STEP; steps++; }
    if (steps >= 10) this.acc = 0;

    if (this.phase === 'fight' || this.phase === 'ko' || this.phase === 'ending') this.recorder.sample(simDt, [this.p1, this.p2]);
    if (this.comm) this.comm.tick(simDt);
    this._phaseTick(simDt);
    if (this.phase === 'show') { this.renderer.render(this.scene, this.camera); return; }
    this._refTick(dt);
    this.cam.follow(dt, this.p1, this.p2, this.p1);
    this.arena.update(dt, now / 1000, this.camera);
    this.arena.updateFence(this.camera, dt);
    this.fx.update(simDt);
    if (UFC.NeonFx) UFC.NeonFx.tick(simDt);
    this.audio.setCrowd(this.arena.crowdLevel);
    this.audio.setDaze(this.p1 && ['fight', 'ko', 'ending', 'intro'].includes(this.phase) ? this.p1.daze : 0);
    this.ui.hudUpdate(this);
    this.ui.promptUpdate(this);
    this.renderer.render(this.scene, this.camera);
    if (this._thumbAt && performance.now() >= this._thumbAt) { this._thumbAt = null; this.koThumb = this._captureThumb(); }
  }

  // Small JPEG of the current frame (read right after rendering).
  _captureThumb() {
    try {
      const src = this.renderer.domElement;
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const g = c.getContext('2d');
      const ar = src.width / src.height, tw = ar > 16 / 9 ? src.height * 16 / 9 : src.width, th = ar > 16 / 9 ? src.height : src.width * 9 / 16;
      g.drawImage(src, (src.width - tw) / 2, (src.height - th) / 2, tw, th, 0, 0, 320, 180);
      return c.toDataURL('image/jpeg', 0.62);
    } catch (e) { return null; }
  }

  _refTick(dt) {
    const ref = this.ref;
    if (!ref || !ref.visible || !this.p1 || !this.p2) return;
    const act = this.refAction;
    if (act && act.kind === 'stop') {
      act.t += dt;
      if (act.pushed || act.checking) this.koWindow = false;   // the referee has got between them: no more shots
      const f = ref.f, tg = act.target, win = act.winner || (tg === this.p1 ? this.p2 : this.p1);
      if (!f.cine) f.startCine({ casual: true });
      if (act.t < (act.wait || 0)) { f.updateCine(dt); return; }   // a slow referee is still working out what he has seen
      const tp = tg.body.B.hips.getWorldPosition(new V3());
      // 1) sprint in and wave the fight off, 2) shove the winner away,
      // 3) crouch over the beaten fighter and check on him
      if (!act.arrived) {
        const d = Math.hypot(tp.x - f.pos.x, tp.z - f.pos.z);
        if (d > 1.0) { if (!f.cine.walk || act.t % 0.3 < dt) f.cineWalkTo(tp.x - (tp.x - f.pos.x) / (d || 1) * 0.9, tp.z - (tp.z - f.pos.z) / (d || 1) * 0.9, { speed: 3.4 }); }
        else { act.arrived = true; act.t = 0; }
      } else if (act.t < (act.variant === 'wave' ? 1.1 : act.variant === 'cover' ? 0.5 : 0.15)) {
        f.cineFaceTo(tp.x, tp.z);
        const wave = Math.floor(act.t / 0.3) % 2 ? 'refWaveA' : 'refWaveB';
        if (f.cine.poseName !== wave) f.cinePose(wave, 0.16);
      } else if (act.variant === 'cover' && !act.checking) {
        // drops over the beaten fighter and shields him with his body
        act.checking = true;
        if (win && win.state === 'gnp') win.endGnp(true);
        else if (win && (win.state === 'fight' || win.state === 'win')) { win.stagger = Math.max(win.stagger, 0.3); win.cancelStrike(); }
        f.cineWalkTo(tp.x + 0.35, tp.z + 0.2, { speed: 3.0, yaw: Math.atan2(tp.x - f.pos.x, tp.z - f.pos.z), onArrive: () => f.cinePose('kneelDown', 0.25) });
      } else if (act.variant !== 'cover' && act.t < (act.variant === 'wrap' ? 2.9 : 2.4)) {
        // push the winner off: the referee steps between them
        if (!act.pushed && win && win.state !== 'down' && win.state !== 'ko') {
          act.pushed = true;
          const dx = win.pos.x - tp.x, dz = win.pos.z - tp.z, dd = Math.hypot(dx, dz) || 1;
          f.cineWalkTo(tp.x + dx / dd * 0.75, tp.z + dz / dd * 0.75, { speed: 3.2 });
          f.cinePose('refStop', 0.2);
          const shove = act.variant === 'wrap' ? 3.4 : act.variant === 'dive' ? 3.0 : 2.6;
          win._shoveV = new V3(dx / dd * shove * 1.6, 0, dz / dd * shove * 1.6); win._shoveT = 0.45; win._finishing = false;   // a real shove: he is carried back and can't finish
          if (win.state === 'gnp') win.endGnp(true);
          else if (win.state === 'fight' || win.state === 'win') { win.stagger = Math.max(win.stagger, 0.7); win.cancelStrike(); }
          this.audio.impact(5, 'body', true); this.ui.hitMarker('РЕФЕРИ ОТТАЛКИВАЕТ', win === this.p1 ? 0 : 1);
        }
        f.cineFaceTo(win ? win.pos.x : tp.x, win ? win.pos.z : tp.z);
      } else if (!act.checking) {
        // check on the fallen fighter
        act.checking = true;
        f.cineWalkTo(tp.x + 0.55, tp.z + 0.35, { speed: 2.2, yaw: Math.atan2(tp.x - f.pos.x, tp.z - f.pos.z), onArrive: () => { if (tg.state !== 'fight') f.cinePose('kneelDown', 0.5); } });
      }
      f.updateCine(dt);
      return;
    }
    if (['fight', 'intro', 'break'].includes(this.phase)) ref.followFight(dt, this.p1, this.p2, this.camera.position);
    else ref.update(dt);
  }

  _step(dt) {
    this.simTime = (this.simTime || 0) + dt;
    const p1 = this.p1, p2 = this.p2;
    const fighting = this.phase === 'fight';
    if (fighting) this.ai.update(dt);
    else { for (const f of [p1, p2]) { if (this.koWindow && this.koSide === p1 && f === p1) continue; f.intent.mx = f.intent.mz = 0; f.intent.strike = null; f.intent.block = 'none'; } }   // (the winner keeps control while the referee runs in)
    if (fighting) { this._daze(p1, dt); this._daze(p2, dt); }
    p1._finishing = p2._finishing = false;
    if (this.koWindow && this.koSide) {
      const att = this.koSide, def = att === p1 ? p2 : p1;
      if (att.state === 'fight') {
        // step in over him and lean down, so the blows really land on the fallen fighter
        // (from the side: the body lies in the way, so he stands beside his head)
        const hd = def.headCenter(new V3()), sd = (att.pos.z - hd.z) >= 0 ? 1 : -1, k = Math.min(1, 2.6 * dt);   // he steps over, he does not teleport
        att.pos.x += (hd.x - att.pos.x) * k; att.pos.z += (hd.z + sd * 0.42 - att.pos.z) * k; att._finishing = true;
        if (att === p2 && (this.refDelay || 1) > 1.1 && (this.simTime - (this._finT2 || -9)) > 0.5) {   // a slow referee: the opponent keeps hitting
          this._finT2 = this.simTime; p2.intent.strike = { type: M.pick(['straight', 'hook']), limb: p2.rearSide };
        }
      }
    }
    for (const f of [p1, p2]) f._finK = f._finishing ? Math.min(1, (f._finK || 0) + dt * 1.5) : Math.max(0, (f._finK || 0) - dt * 2.5);
    for (const f of [p1, p2]) if (f._shoveT > 0) { f.pos.addScaledVector(f._shoveV, dt); f._shoveT -= dt; UFC.clampToOctagon(f.pos, 0.42); }
    for (const f of [p1, p2]) {
      if (f._quit) f.getupAt = 999;   // a fighter who quit stays down
      if (f.state === 'win') f.updateWin(dt); else f.update(dt);
      if (f.unansweredT > 0) { f.unansweredT -= dt; if (f.unansweredT <= 0) f.unanswered = 0; }
    }
    if (this.grapple) {
      if (fighting) this.grapple.step(dt);
      else { for (const f of [p1, p2]) f.time += dt; }
    }
    if (!this.grapple) this._separate(dt);
    if ((fighting || (this.phase === 'ko' && this.koWindow)) && !this.grapple) {
      this.combat.step(p1, p2);
    }
    if (fighting) this._deathCheck();
  }

  _separateNoop() {}

  _separate() {
    const a = this.p1, b = this.p2;
    const up = (f) => f.state === 'fight' || f.state === 'getup' || f.state === 'win';
    if (up(a) !== up(b)) {
      const stand = up(a) ? a : b, down = up(a) ? b : a;
      const B = down.body.B;
      const pts = down.ragdoll.active ? ['hips', 'chest', 'head', 'knL', 'knR'].map((k) => down.ragdoll.p[k])
        : [B.hips, B.chest, B.head, B.snL, B.snR].map((b) => b.getWorldPosition(new V3()));
      for (const p of pts) {
        const dx = stand.pos.x - p.x, dz = stand.pos.z - p.z;
        const d = Math.hypot(dx, dz) || 1e-4, min = 0.34;
        if (d < min) { stand.pos.x += dx / d * (min - d); stand.pos.z += dz / d * (min - d); }
      }
      UFC.clampToOctagon(stand.pos, 0.42);
      return;
    }
    if (!up(a) || !up(b)) return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz) || 1e-4;
    const min = 0.36 * (a.h + b.h) / 1.8 + 0.03;
    if (d < min) {
      const push = (min - d) * 0.5, nx = dx / d, nz = dz / d;
      const wa = b.cfg.weight / (a.cfg.weight + b.cfg.weight), wb = 1 - wa;
      a.pos.x -= nx * push * 2 * wa; a.pos.z -= nz * push * 2 * wa;
      b.pos.x += nx * push * 2 * wb; b.pos.z += nz * push * 2 * wb;
      const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rel < 0) {
        a.vel.x += nx * rel * wa; a.vel.z += nz * rel * wa;
        b.vel.x -= nx * rel * wb; b.vel.z -= nz * rel * wb;
      }
      UFC.clampToOctagon(a.pos, 0.42); UFC.clampToOctagon(b.pos, 0.42);
    }
  }

  _collectFight() {
    const res = this.result;
    const p = this.p1, o = this.p2;
    const koMethod = res.method === 'KO' || res.method === 'TKO';
    let clip = null;
    if (koMethod && res.winner) {
      try { clip = this.recorder.export([p.cfg, o.cfg], { loser: res.winner === p ? 1 : 0, method: res.method, round: res.round, time: res.time }); } catch (e) { UFC.reportError(e, 'повтор'); }
    }
    this.lastFight = {
      res, won: res.winner === p, draw: !res.winner, method: res.method, methodText: res.methodText, round: res.round, time: res.time,
      koType: koMethod ? UFC.koTypeOf(res.detail, res.winner ? res.winner.s : 1) : res.method === 'SUB' && res.detail ? (UFC.SUB_NAMES[res.detail.sub] || 'SUB') : '',
      stats: { p: Object.assign({}, p.stats), o: Object.assign({}, o.stats) },
      damage: { head: Math.max(0, Math.min(p.cap.head, 100 - (p.taken ? p.taken.head : 0) * 0.6)), body: Math.max(0, Math.min(p.cap.bodyHp, 100 - (p.taken ? p.taken.bodyHp : 0) * 0.6)), legs: Math.max(0, Math.min(p.cap.legs, 100 - (p.taken ? p.taken.legs : 0) * 0.6)) },
      medWeeks: (() => { try { return UFC.medical.assess(p, { koLoser: koMethod && res.winner && res.winner !== p }).weeks; } catch (e) { return 0; } })(),
      replay: clip, thumb: this.koThumb,
    };
    if (p.lateHits > 0) this.lastFight.methodText = (this.lastFight.methodText || '') + ' · рефери остановил поздно: +' + p.lateHits + ' ударов по мне';
    else if (o.lateHits > 3) this.lastFight.methodText = (this.lastFight.methodText || '') + ' · поздняя остановка';
    if (!this._finishFired && this.fightInfo && this.fightInfo.onFinish) {
      this._finishFired = true;
      try { this.fightInfo.onFinish(this.lastFight); } catch (e) { UFC.reportError(e, 'автосохранение боя'); }
    }
    return this.lastFight;
  }

  _startPostFight(mode) {
    const res = this.result;
    const fight = this._collectFight();
    const info = this.fightInfo || {};
    const winner = res.winner, loser = winner ? (winner === this.p1 ? this.p2 : this.p1) : null;
    const retained = !!(info.title && winner && ((info.champion === 'p1' && winner === this.p1) || (info.champion === 'p2' && winner === this.p2)));
    this.grapple = null;
    this.refAction = null;
    this.audio.setDaze(0);
    this.ui.hudHide();
    this.ui.promptUpdate && this.ui.grappleAttempt(false, false, '');
    this.touch.show(false);
    this.phase = 'show';
    this.show = UFC.Ceremony.postFight(this, {
      res, winner, loser, title: info.title, interim: !!info.interim, retained, divName: info.divName, playerLost: !!winner && winner !== this.p1,
      firstBig: !!(info.career && info.firstBig), comeback: !!(winner && winner.knockdowns > 0),
      replay: mode === 'full' ? fight.replay : null,
      onDone: () => { this.show = null; this._showResults(); },
    });
  }

  _showResults() {
    if (!this.lastFight) this._collectFight();
    // what the fight did to both fighters, for the post-fight medical
    try { this.lastMedical = UFC.medical.snapshot(this); } catch (e) { UFC.reportError(e, 'медосмотр'); this.lastMedical = null; }
    this.phase = 'result';
    this.touch.show(false);
    this.ui.hudHide();
    this.ui.showResult(this, this.result);
    if (this.fightInfo && this.fightInfo.onEnd) {
      const cb = this.fightInfo.onEnd; this.fightInfo.onEnd = null;
      try { cb(this.lastFight); } catch (e) { UFC.reportError(e, 'итог боя'); }
    }
  }

  // A beaten head: he misses inputs, weaves off line, drops his guard and stumbles. The AI "thinks" just as badly.
  _daze(f, dt) {
    const d = f.daze; f._dzT = (f._dzT || 0) + dt;
    if (d > (f.peakDaze || 0)) f.peakDaze = d;
    if (d < 0.18 || f.state !== 'fight') return;
    const it = f.intent, t = f._dzT, k0 = (d - 0.1) / 0.9, k = f.npc ? k0 * 0.2 : k0;
    if (it.strike && it.strike !== f._dzSeen) { f._dzSeen = it.strike; if (Math.random() < 0.6 * k) it.strike = null; }   // the punch never comes out
    const a = Math.sin(t * 1.9 + f.index * 2) * k, c = Math.cos(a), sn = Math.sin(a), mx = it.mx, mz = it.mz, sl = 1 - 0.3 * k;
    const moving = Math.hypot(mx, mz) > 0.1, w = moving ? 1 : 0.12;   // he sways while walking, but does not wander off when he is standing still
    it.mx = (mx * c - mz * sn + Math.sin(t * 2.3) * k * 0.45 * w) * sl; it.mz = (mx * sn + mz * c + Math.cos(t * 1.6 + 1) * k * 0.25 * w) * sl;
    it.slipX += Math.sin(t * 2.7) * k * 0.5;
    if (it.block !== 'none' && Math.sin(t * 3.3 + f.index) > 1 - 1.1 * k) it.block = 'none';   // the guard drops
    f._dzStumble = (f._dzStumble == null ? M.rand(2, 5) : f._dzStumble) - dt * (0.4 + k);
    if (f._dzStumble <= 0) {
      f._dzStumble = M.rand(3, 6);
      if (k0 > 0.5 && (!f.npc || Math.random() < 0.3) && !f.strike && f.hitstun <= 0 && f.stumbleT <= 0) f.stumble(new V3(M.rand(-1, 1), 0, M.rand(-1, 1)).normalize(), 5 + k * 10);
    }
  }

  // callouts for the state of his head, once each
  _dazeTalk(f, i) {
    const fl = f._dzFlags || (f._dzFlags = {}), d = f.daze, e = f.face ? Math.max(f.face.eyeL, f.face.eyeR) : 0;
    if (d > 0.5 && !fl.fog) { fl.fog = 1; this.ui.callout('ТУМАН В ГОЛОВЕ', f.cfg.name + ' ничего не соображает', 'rocked', 1.6); this.ui.hitMarker('ГОЛОВА ЗВЕНИТ', i); if (f === this.p1) this.audio.earRing(0.9); }
    if (e > 0.8 && !fl.eye) { fl.eye = 1; this.ui.callout('ГЛАЗ ЗАПЛЫЛ', f.cfg.name + ' почти не видит', 'rocked', 1.6); }
    if (f.faceHp < 35 && !fl.face) { fl.face = 1; this.ui.callout('ЛИЦО РАЗБИТО', 'ещё немного — и ' + f.cfg.name + ' сдастся', 'kd', 1.8); }
  }

  // bones: cracked ribs take his wind, a cracked shin makes him limp, a broken leg ends it
  _bonesTalk(f, i) {
    const fl = f._dzFlags || (f._dzFlags = {}), tk = f.taken || {}, ld = f.legDmg || { L: 0, R: 0 };
    if (tk.bodyHp > 48 && !fl.rib) { fl.rib = 1; f.staminaCap = Math.max(40, f.staminaCap - 25); this.ui.callout('СЛОМАНО РЕБРО', f.cfg.name + ' едва дышит', 'kd', 1.6); this.ui.hitMarker('РЕБРО', i); this.audio.impact(9, 'body', false); }
    if (Math.max(ld.L, ld.R) > 0.75 && !fl.shin) { fl.shin = 1; this.ui.callout('ТРЕЩИНА В ГОЛЕНИ', f.cfg.name + ' хромает', 'rocked', 1.6); }
  }

  _legBreak(def, att) {
    if (this.phase !== 'fight' || def._dead) return;
    def._dead = true; def._quit = true;
    if (att.state === 'gnp') att.endGnp(true);
    def.legDmg[def._legBreak] = 1;
    def.knockDown(new V3().subVectors(def.pos, att.pos).setY(0).normalize(), 5, 'legs', 'kdSide');
    def.getupAt = 999;
    this.phase = 'ko'; this.phaseT = 0; this.slowmo = 1.4; this.timeScale = 0.35;
    this.cam.cinematic(def, 2.4, { lookY: 0.3, height: 0.5, fov: 34, flip: att === this.p2 });
    this.cam.shake(0.9);
    this._setPending(att, 'TKO', 'Перелом ноги · не может продолжать', { type: 'lowKick' }, def);
    this.ui.callout('ПЕРЕЛОМ НОГИ', def.cfg.name + ' не может встать', 'ko', 3.5);
    this.audio.say('Перелом ноги! ' + UFC.shortName(def.cfg) + ' не может продолжать!');
    this.audio.cheer(1); this.audio.impact(14, 'legs', false); this.audio.earRing(0.8);
    this.arena.excite(1);
    this._vibrate(def === this.p1 ? 260 : 120);
  }

  // a blow on a knocked-out fighter before the referee gets there (a punch can't reach the floor, so it is resolved directly)
  _finishHit(att, def) {
    const st = att.intent.strike, heavy = st && (st.type === 'hook' || st.type === 'uppercut' || /Kick/.test(st.type));
    const power = (heavy ? 11 : 8) * att.pow * M.rand(0.9, 1.1);
    const nm = st ? st.type : 'straight';
    const fake = { def: { name: [nm, nm], kind: 'punch', path: 'straight', zone: 'head' }, lead: false, limb: (st && st.limb) || att.rearSide, type: nm, sig: true, contact: true };
    def.lateHits++; def.brain += 8;
    this.combat._applyDamage(att, def, fake, 'head', power, new V3().subVectors(def.pos, att.pos).setY(0).normalize(), def.headCenter(new V3()), false, false);
  }

  // The referee watches whether a hurt fighter is still intelligently defending himself. Each referee reacts at his own speed.
  _refJudge(def, att, dt) {
    const sim = this.simTime || 0;
    const hurt = def.stun > 64 || def.daze > 0.6 || def.head < 28 || (def.headDmg || 0) > 82 || (def.faceHp != null && def.faceHp < 22);
    const fightingBack = !!def.strike || (sim - (def.lastLandT || -9)) < 1.6;
    const defending = def.block !== 'none' && def.canDefend();
    let helpless = false;
    if (def.state === 'fight') {
      if (hurt && def.sinceHit < 1.3 && !fightingBack && !defending) helpless = true;
      else if ((def.stun > 88 || def.daze > 0.86) && !fightingBack && !defending && def.sinceHit < 2.6) helpless = true;   // out on his feet
    } else if (def.state === 'down' && def.gnpBy) {
      helpless = def.sinceHit < 1.3 && !((def.gnpCover || 0) > 0.6 && def.stun < 110);
    }
    // a barrage: many clean blows lately and almost nothing coming back. Toughness does not matter: nobody lets it go on.
    if ((def.state === 'fight' || (def.state === 'down' && def.isGrounded && def.isGrounded() && !def.gnpBy)) && !def._refStop) {
      let n5 = 0, p8 = 0;
      for (const e of def.takenLog || []) { if (sim - e.t < 8) p8 += e.p; if (sim - e.t < 5) n5++; }
      const returnFire = (sim - (def.lastLandT || -9)) < 3, slack = def === this.p1 ? 1.3 : 1;
      const big = Math.pow(Math.max(1, (def.hpMul || 1) / 1.5), 0.3);   // a fighter with ten times the health is stopped later
      if (!returnFire && (n5 >= Math.round((def.state === 'down' ? 5 : 7) * slack * big) || (n5 >= 4 && p8 >= 240 * slack * big * big))) { def._refWhy = 'Остановка рефери · град ударов'; def._refStop = true; return; }
    }
    if (helpless) def.noDefT += dt; else def.noDefT = Math.max(0, def.noDefT - dt * 1.5);
    if (def.noDefT > (this.refDelay || 1.5) * (def === this.p1 ? 1.45 : 1) * (this.fightInfo && this.fightInfo.title ? 1.3 : 1)) def._refStop = true;   // he gives the player more time to get out of it
  }

  _refCall(def, att, why) {
    if (this.phase !== 'fight' || def._dead) return;
    def._dead = true;
    const early = def.head > 55 && def.daze < 0.6;
    if (att.state === 'gnp') att.endGnp(true);
    if (this.grapple) { const g = this.grapple; this.grapple = null; try { g._toLive(att); } catch (e) { UFC.reportError(e, 'конец борьбы'); } }
    def._quit = true;
    if (def.state === 'down') def.getupAt = 999;   // already on the canvas: he stays there
    else if (def.head <= 25 && def.state === 'fight' && def.stun > 140) def.knockOut(new V3().subVectors(def.pos, att.pos).setY(0).normalize(), 5);   // out on his feet, he finally goes
    // anyone else just stands there, hands down: no automatic fall
    this.phase = 'ko'; this.phaseT = 0; this.slowmo = 1.0; this.timeScale = 0.45;
    this.cam.cinematic(def, 2.5, { lookY: 0.5, height: 0.8, fov: 36 });
    this._setPending(att, 'TKO', why || (early ? 'Остановка рефери · слишком рано?' : 'Остановка рефери'), { type: 'referee' }, def);
    const kd3 = !!why && /нокдаун/i.test(why);
    this.ui.callout(kd3 ? (/Десять/.test(why) ? 'ДЕСЯТЬ НОКДАУНОВ' : 'ТРИ НОКДАУНА') : 'РЕФЕРИ ОСТАНАВЛИВАЕТ БОЙ', kd3 ? att.cfg.name + ' · рефери останавливает бой' : why ? att.cfg.name + ' · град ударов' : early ? att.cfg.name + ' · многие сочтут это рано' : att.cfg.name, 'ko', 3.5);
    this.audio.say('Рефери останавливает бой!'); this.audio.cheer(1);
  }

  _surrender(def, att) {
    if (this.phase !== 'fight' || def._dead) return;
    def._dead = true;
    if (att.state === 'gnp') att.endGnp(true);
    if (def.state !== 'down') def.knockDown(new V3().subVectors(def.pos, att.pos).setY(0).normalize(), 2, 'body', M.pick(['kdSit', 'kdBack', 'kdSide']));   // a fall that ends on the canvas, not a knee-rise
    def.getupAt = 999; def._quit = true;   // he is not getting up: he quits
    this.phase = 'ko'; this.phaseT = 0; this.slowmo = 1.2; this.timeScale = 0.4;
    this.cam.cinematic(def, 2.4, { lookY: 0.4, height: 0.8, fov: 34, flip: att === this.p2 });
    this.cam.shake(0.6);
    this._setPending(att, 'TKO', 'Сдался · сломано лицо', { type: 'face' }, def);
    this.ui.callout('ЛИЦО СЛОМАНО', def.cfg.name + ' сдаётся', 'ko', 3.5);
    this.audio.say('Лицо сломано! ' + UFC.shortName(def.cfg) + ' больше не может продолжать. Он сдаётся!');
    this.audio.cheer(1); this.audio.impact(9, 'head', false); this.audio.earRing(1);
    this.arena.excite(1);
    this._vibrate(def === this.p1 ? 260 : 120);
  }

  // Safety net for every way a fighter can run out of health (ground strikes, grappling, liver, legs, blocked hits).
  // the earliest round a fight can be finished in: UFC 3 (title 4), the small leagues 2 (title 3)
  _minRound() {
    return 0;   // no protection by round any more: health, the knockdown rule and the referee decide
    if (!this.opts || this.opts.rounds >= 99) return 0;
    const fi = this.fightInfo || {}, big = (fi.tier || 'ufc') === 'ufc';
    return fi.title ? (big ? 4 : 3) : (big ? 3 : 2);
  }
  _earlyRound() { return this.round < this._minRound(); }

  _deathCheck() {
    if (this.phase !== 'fight') return;
    for (const [def, att] of [[this.p1, this.p2], [this.p2, this.p1]]) {
      if (def.state === 'ko' || def._dead) continue;
      this._refJudge(def, att, 1 / 60);
      if (this._earlyRound()) {   // too early to end it: the referee lets it go, the beaten fighter hangs on
        def._refStop = false; def.noDefT = 0; def._legBreak = null;
        if (def.faceHp < 6) def.faceHp = 6;
        if (def.head < 3) def.head = 3; if (def.bodyHp < 3) def.bodyHp = 3; if (def.legs < 3) def.legs = 3; if (def.liver < 3) def.liver = 3;
      }
      if (def._refStop && !def._dead) { this._refCall(def, att, def._refWhy); return; }
      if (false) {
        def._dead = true;
        def.knockOut(new V3().subVectors(def.pos, att.pos).setY(0).normalize(), 6);
        this.phase = 'ko'; this.phaseT = 0; this.slowmo = 1.2; this.timeScale = 0.4;
        this.cam.cinematic(def, 2.5, { lookY: 0.5, height: 0.8, fov: 36 });
        this._setPending(att, 'TKO', 'Остановка рефери', { type: 'referee' }, def);
        this.ui.callout('РЕФЕРИ ОСТАНАВЛИВАЕТ БОЙ', att.cfg.name, 'ko', 3.5);
        this.audio.say('Рефери останавливает бой!'); this.audio.cheer(1);
        return;
      }
      this._dazeTalk(def, def === this.p1 ? 0 : 1);
      if (def.faceHp <= 0) { this._surrender(def, att); return; }
      this._bonesTalk(def, def === this.p1 ? 0 : 1);
      if (def._legBreak) { this._legBreak(def, att); return; }
      if (def.head <= 0.5 || def.bodyHp <= 0.5 || def.legs <= 0.5 || def.liver <= 0.5) { this._death(def, att); return; }
    }
  }

  _death(def, att) {
    if (this.phase !== 'fight' || def._dead) return;
    def._dead = true;
    const gr = this.grapple;
    if (gr) { this.grapple = null; try { gr._toLive(att); } catch (e) { UFC.reportError(e, 'конец борьбы'); } }
    const ground = att.state === 'gnp' || !!def.gnpBy || !!gr;
    def.knockOut(new V3().subVectors(def.pos, att.pos).setY(0).normalize(), 5);
    this.phase = 'ko'; this.phaseT = 0;
    this.slowmo = 1.6; this.timeScale = 0.35;
    this.cam.cinematic(def, 2.6, { lookY: 0.4, height: 0.7, fov: 34, flip: att === this.p2 });
    this.cam.shake(1);
    const z = [['голова', def.head], ['печень', def.liver], ['корпус', def.bodyHp], ['ноги', def.legs]].sort((a, b) => a[1] - b[1])[0][0];
    this._setPending(att, 'KO', 'Нокаут · здоровье на нуле (' + z + ')', { type: ground ? 'gnp' : (z === 'печень' ? 'liver' : '') }, def);
    this.ui.callout('НОКАУТ!', att.cfg.name, 'ko', 3.5);
    this.comm.say('ko', { force: true });
    this.audio.cheer(1); this.audio.impact(14, 'head', false); this.audio.earRing(1);
    this.arena.excite(1);
    this._vibrate(def === this.p1 ? 260 : 120);
  }

  // menu and results: a slow dramatic theme; in the fight: a quiet driving track under the crowd. Walkouts and edits run their own music.
  _musicTick() {
    const a = this.audio;
    if (!a || !a.ctx || a.ctx.state !== 'running') return;
    if (!a.musicEnabled) { if (a._scene) { a.stopMusic(0.5); a._scene = null; } return; }
    if (this.show || this.phase === 'show' || document.getElementById('edit-ov')) { a._scene = null; return; }
    const want = (this.phase === 'menu' || this.phase === 'result' || this.phase === 'ending') ? 'menu' : 'fight';
    if (a._scene === want && a.music) return;
    a._scene = want;
    a.startMusic(want === 'menu' ? 'dramatic' : 'aggressive', want === 'menu' ? 0.85 : 0.38);
  }

  _phaseTick(dt) {
    this.phaseT += dt;
    if (this.phase === 'intro') {
      if (this.phaseT > 1.7) {
        this.phase = 'fight';
        this.audio.bell(1);
        this.ui.callout('БОЙ!', '', 'fight', 0.8);
        if (this._formNew) {
          const k = this._formNew; this._formNew = null;
          if (k === 'angry') this.ui.callout('ЗЛАЯ ФОРМА', 'удары на 15% быстрее и на 20% тяжелее · гликоген не кончается · 170 см', 'ko', 2.8);
          else this.ui.callout('LOW KEY', 'во всём на 15% быстрее · соперник на 15% медленнее', 'flow', 2.2);
          this.audio.flow(); this.cam.shake(k === 'angry' ? 0.8 : 0.25);
        }
        this.comm.reset();
        this.comm.say('start', { force: true });
      }
    } else if (this.phase === 'fight') {
      this.clock += dt;
      if (this.opts.rounds < 99) { if (this.clock >= this.opts.roundLen) this._endRound(); }   // the clock counts the current round
      else {
        const r = 1 + Math.floor(this.clock / this.opts.roundLen);
        if (r !== this.round) { this.round = r; this.audio.bell(1); this.ui.hitMarker('РАУНД ' + r, 0); }
      }
    } else if (this.phase === 'break') {
      if (this.phaseT > 3.6) { this.round++; this._beginRound(false); }
    } else if (this.phase === 'ko') {
      if (this.koWindow) { this.koWindowT = (this.koWindowT || 0) + dt; if (this.koWindowT > 6) this.koWindow = false; }
      if (this.phaseT > 2.4 && !this.koWindow && !this.result) this._finish(this.pendingResult);
    } else if (this.phase === 'ending') {
      const mode = (this.fightInfo && this.fightInfo.presentation) || this.ui.settings.presentation || 'full';
      if (mode !== 'off' && this.phaseT > 1.3) this._startPostFight(mode);
      else if (this.phaseT > 4.2) this._showResults();
    }
  }
}

UFC.Game = Game;
UFC.showNotice = (html, fatal) => {
  const n = document.getElementById('notice');
  n.innerHTML = html + (fatal ? '<button class="btn primary" onclick="location.reload()">Перезапустить</button>' : '');
  n.classList.remove('hidden'); n.classList.toggle('fatal', !!fatal);
};
UFC.hideNotice = () => document.getElementById('notice').classList.add('hidden');

const bootGame = () => {
  try {
    window.__UFC__ = new Game();
    const bootEl = document.getElementById('boot'); if (bootEl) bootEl.remove();
  } catch (e) {
    console.error(e);
    const bootEl = document.getElementById('boot'); if (bootEl) bootEl.remove();
    const ui = document.getElementById('ui'); ui.innerHTML = '';
    if (e.message === 'WEBGL_UNAVAILABLE') {
      UFC.showNotice('<h2>3D-графика недоступна</h2><p>Браузер не смог включить WebGL, без него октагон и бойцы не отрисуются.</p>' +
        '<p><b>Как исправить:</b> Настройки браузера → Система → включите «Использовать аппаратное ускорение», перезапустите браузер. ' +
        'Проверить можно на странице <code>chrome://gpu</code> или <code>edge://gpu</code> (WebGL должен быть «Hardware accelerated»). Также помогает обновить драйвер видеокарты.</p>', true);
    } else {
      UFC.showNotice('<h2>Ошибка запуска</h2><p>' + String(e && e.message || e).replace(/</g, '&lt;') + '</p>', true);
    }
  }
};
// restore anything localStorage lost from the IndexedDB mirror first, but never wait for it longer than 2.5 s
window.addEventListener('load', () => {
  let started = false; const go = () => { if (started) return; started = true; bootGame(); };
  try { Promise.race([UFC.store.hydrate(), new Promise((r) => setTimeout(r, 2500))]).then(go, go); } catch (e) { go(); }
});
// flush the open career whenever the page is hidden or closed
const flushSaves = () => { try { if (UFC.saveCareerNow) UFC.saveCareerNow(); } catch (e) { /* ignore */ } };
window.addEventListener('pagehide', flushSaves);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSaves(); });

// Any runtime error from event handlers is shown instead of silently freezing.
window.addEventListener('error', (ev) => {
  if (!window.__UFC__) return;
  const where = (ev.filename || '') + ':' + (ev.lineno || '');
  const g = window.__UFC__;
  g.errors = (g.errors || 0) + 1;
  UFC.reportError(ev.error || ev.message, where);
});
window.addEventListener('unhandledrejection', (ev) => {
  if (!window.__UFC__) return;
  window.__UFC__.errors = (window.__UFC__.errors || 0) + 1;
  UFC.reportError(ev.reason, 'promise');
});

})();

