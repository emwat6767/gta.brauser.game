import * as THREE from 'three';
import { createRng } from '../js/utils.js';
import { separateCircles } from '../js/collision.js';
import { Effects } from '../js/effects.js';
import { SCHOOL } from './config.js';
import { BLD, GYM, EXITS, ROOM_BY_ID, floorOfY, zoneAt } from './layout.js';
import { SchoolWorld } from './world.js';
import { createSchoolTextures } from './textures.js';
import { buildSchool, setZoneLights } from './build.js';
import { DoorSystem } from './doors.js';
import { Navigator } from './nav.js';
import { FireSystem } from './fire.js';
import { Input } from './input.js';
import { SchoolCamera } from './camera.js';
import { Player } from './player.js';
import { NPC, pickLine } from './npc.js';
import { Zombie } from './threats.js';
import { Hud } from './hud.js';
import { SchoolAudio } from './audio.js';
import { Scenario } from './scenario.js';
import { itemGeometry } from './person.js';
import { CLASSES, TEACHERS, STAFF, studentLook, teacherLook, staffLook, studentName } from './people-data.js';
import { bindMenus } from './menu.js';

// «Школа № 17: Тревога» — 3D-игра про один школьный день. Готовые NPC из Open City
// (Humanoid, гардероб, образы), школа из процедурной геометрии, сценарии: пожар, нападение, зомби.

const ITEM_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });

class Game {
  constructor() {
    this.mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.gfx = this.mobile ? SCHOOL.graphics.mobile : SCHOOL.graphics.desktop;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.gfx.pixelRatio));
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = this.gfx.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.fogColor = new THREE.Color('#cfe0ec');
    this.scene.fog = new THREE.Fog(this.fogColor.clone(), 60, 230);
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 600);
    addEventListener('resize', () => {
      r.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });

    // Свет: небо, солнце с тенями, пул ламп вокруг камеры.
    this.scene.add(new THREE.HemisphereLight('#dceaff', '#7a6e5e', 1.05));
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.28));
    const sun = this.sun = new THREE.DirectionalLight('#fff1dc', this.gfx.shadows ? 2.5 : 1.2);
    sun.castShadow = this.gfx.shadows;
    sun.shadow.mapSize.set(this.gfx.shadowMap, this.gfx.shadowMap);
    Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 220 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun, sun.target);
    this.pool = [];
    for (let i = 0; i < this.gfx.lights; i++) {
      const l = new THREE.PointLight('#fff2dd', 0, 9, 2);
      this.scene.add(l);
      this.pool.push(l);
    }
    this.sky();

    this.rng = createRng(Date.now() & 0xffff);
    this.world = new SchoolWorld();
    this.textures = createSchoolTextures(r);
    this.school = buildSchool(this.scene, this.world, this.textures, { mobile: this.mobile });
    this.addWindowExits();
    this.doors = new DoorSystem(this.scene, this.world, this.school, {
      onSlam: (d, k) => this.audio.door(d, k),
      onRattle: (d, who) => { this.audio.rattle(d); this.noise(d, 10, 'door', who); },
      onBang: (d) => this.audio.bang(d, 0.8),
      onBreak: (d) => { this.audio.bang(d, 1.4); this.effects.burst({ x: d.x, y: d.y0 + 1, z: d.z }, { x: 0, y: 1, z: 0 }, 'debris', 14); },
    });
    this.nav = new Navigator(this.world, this.doors);
    this.nav.build();
    this.effects = new Effects(this.scene);
    this.effects.renderer = r;
    this.effects.camera = this.camera;
    this.input = new Input(r.domElement);
    if (this.input.touch) document.body.classList.add('touch');
    this.input.bindTouch(document.getElementById('touch'));
    this.cam = this.cameraRig = new SchoolCamera(this.camera, this.world);
    this.audio = new SchoolAudio(this);
    this.fire = new FireSystem(this);
    this.hud = new Hud(this);
    // Статическое поле до места сбора (без огня) — основа для пересчётов.
    this.fields = {};
    this.fields.assembly = this.nav.buildField(SCHOOL.assembly);
    this.fieldsBase = { assembly: this.fields.assembly.f0 };

    this.time = 0;
    this.paused = true;
    this.running = false;
    this.people = [];
    this.npcs = [];
    this.threats = [];
    this.rescuers = [];
    this.items = [];
    this.vehicles = [];
    this.flashers = [];
    this.noiseEvents = [];
    this.alarm = { type: null, t: 0 };
    this.difficulty = 1;
    this.settings = { type: 'random', difficulty: 1, alarmMode: 'random', fem: Math.random() < 0.5 };
    this.menu = bindMenus(this);
    // Мышь отпустили (Esc) во время игры — пауза.
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.wasLocked && this.running && !this.paused && !this.input.touch) this.menu.togglePause();
      this.wasLocked = locked;
    });
    this.clock = new THREE.Clock();
    this.idleYaw = 0;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
    window.game = this;
  }

  sky() {
    const g = new THREE.SphereGeometry(450, 24, 12);
    const m = new THREE.MeshBasicMaterial({ map: null, side: THREE.BackSide, fog: false, vertexColors: true });
    const col = [];
    const pos = g.attributes.position;
    const top = new THREE.Color('#3f7fd0'), mid = new THREE.Color('#8fc0ec'), low = new THREE.Color('#dfeaf2');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 450;
      if (y > 0.25) c.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.75));
      else c.copy(low).lerp(mid, Math.max(0, (y + 0.05) / 0.3));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.skyMesh = new THREE.Mesh(g, m);
    this.scene.add(this.skyMesh);
  }

  // Окна 1 этажа, через которые можно вылезти (не туалеты и не спортзал).
  addWindowExits() {
    for (const o of this.school.openings) {
      if (o.kind !== 'window' || !o.ext || o.y0 > 1.2) continue;
      const m = (o.a + o.b) / 2;
      const sgn = o.axis === 'x' ? (o.c < 0 ? 1 : -1) : (o.c < 0 ? 1 : -1);
      const inside = o.axis === 'x' ? { x: m, z: o.c + sgn * 0.6 } : { x: o.c + sgn * 0.6, z: m };
      const out = o.axis === 'x' ? { x: m, z: o.c - sgn * 1.3 } : { x: o.c - sgn * 1.3, z: m };
      this.school.windows.push({ ...inside, out });
    }
  }

  // ------------------------------------------------------------------ запуск дня

  startGame(settings) {
    Object.assign(this.settings, settings);
    this.clear();
    this.difficulty = this.settings.difficulty;
    this.audio.unlock();
    const rng = this.rng;
    // Игрок.
    const look = studentLook(rng, this.settings.fem, 9);
    this.player = new Player(this, look);
    this.player.cls = CLASSES[0];
    this.player.pos.set(9.5, 0, 0.7);
    this.player.heading = -Math.PI / 2;
    this.people.push(this.player);
    this.cam.yaw = -Math.PI / 2;
    this.cam.pitch = 0.15;
    this.spawnPopulation();
    this.spawnItems();
    this.scenario = new Scenario(this, this.settings);
    this.hud.flash('Перемена. Скоро звонок на урок физики (кабинет 104).', 4);
    this.time = 0;
    this.paused = false;
    this.running = true;
    this.input.enabled = true;
  }

  clear() {
    for (const p of [...this.people, ...this.threats, ...this.rescuers]) { p.dropItemMesh?.(); p.dispose(); }
    for (const v of this.vehicles) v.removeFromParent();
    for (const l of this.flashers) l.removeFromParent();
    for (const it of this.items) it.mesh?.removeFromParent();
    this.people = []; this.npcs = []; this.threats = []; this.rescuers = []; this.items = []; this.vehicles = []; this.flashers = [];
    this.noiseEvents = [];
    this.alarm = { type: null, t: 0 };
    this.savedByPlayer = 0;
    this.zombiesDown = 0;
    this.doors.reset();
    this.fire.reset();
    for (const z of this.school.zones) { if (!z.lightsOn) setZoneLights(z, true); z.lastNoise = -99; }
    for (const s of this.school.hideSpots) { s.occupant = null; s.reserved = null; }
    for (const s of this.school.seats) s.taken = null;
    this.audio.alarmMode = null;
    this.audio.sirenOn = false;
    this.fields.bus = null;
    this.evacDirty = false;
    this.hud.toggleBig(false);
  }

  spawnPopulation() {
    const rng = this.rng, k = this.gfx.people;
    const classes = this.mobile ? CLASSES.slice(0, 5) : CLASSES;
    const wander = this.school.wander;
    const persona = (extra = {}) => ({
      courage: rng.range(0.05, 0.85), panic: rng.range(0.1, 0.95), obedience: rng.range(0.4, 1), speed: rng.range(0.88, 1.12),
      smart: rng.chance(0.45), ...extra,
    });
    for (const cls of classes) {
      const zone = this.school.zoneById.get(cls.room);
      const seats = [...(zone.seats ?? [])].sort(() => Math.random() - 0.5);
      const n = Math.round((cls.player ? 6 : 5) * k);
      const grade = parseInt(cls.name, 10);
      for (let i = 0; i < n; i++) {
        const fem = rng.chance(0.5);
        const nm = studentName(rng, fem);
        const big = grade >= 10 && rng.chance(0.3);
        const look = studentLook(rng, fem, grade);
        if (big) { look.bulk = 1.12; look.scale = Math.max(look.scale, 1.0); }
        // Где стоит на перемене.
        let at;
        const r = rng.next();
        if (r < 0.35 && zone.type !== 'gym') at = { ...zone.board ? { x: (zone.x0 + zone.x1) / 2, z: (zone.z0 + zone.z1) / 2 + rng.range(-1.5, 1.5) } : { x: (zone.x0 + zone.x1) / 2, z: 0 }, floor: zone.floor };
        else {
          const ws = wander.filter((w) => w.floor === zone.floor || rng.chance(0.2));
          const w = ws[Math.floor(rng.next() * ws.length)];
          at = { x: w.x + rng.range(-0.8, 0.8), z: w.z + rng.range(-0.5, 0.5), floor: w.floor };
        }
        const npc = new NPC(this, {
          look, name: nm.full, short: nm.first, role: 'student', cls, fem, seat: seats[i] ?? null,
          persona: persona(big ? { courage: rng.range(0.8, 0.98), panic: rng.range(0.05, 0.3) } : {}),
          x: at.x, z: at.z, y: at.floor * 3.6,
        });
        this.addNpc(npc);
      }
      // Учитель.
      const t = TEACHERS[cls.teacher];
      const tz = zone.teacherDesk ?? { x: 34, z: 0 };
      const teacher = new NPC(this, {
        look: teacherLook(rng, t), name: t.name, short: t.name, role: 'teacher', cls, fem: t.fem,
        persona: { courage: t.brave, panic: 0.15, obedience: 0.5, speed: 1, smart: true },
        x: tz.x, z: tz.z, y: zone.floor * 3.6, health: 70,
      });
      this.addNpc(teacher);
    }
    // Персонал.
    const staff = [
      ['guard', this.school.zoneById.get('lobby').guardSpot ?? { x: -4.4, z: -6.1, heading: Math.PI }, 0.85],
      ['cook', { x: -28.3, z: -8.4, heading: Math.PI }, 0.3],
      ['nurse', { x: -16.5, z: -7, heading: Math.PI / 2 }, 0.3],
      ['cleaner', { x: -10, z: -0.5, heading: Math.PI / 2 }, 0.4],
      ['principal', { x: -9.5, z: -7.6, heading: 0 }, 0.6],
    ];
    for (const [kind, post, brave] of (this.mobile ? staff.slice(0, 3) : staff)) {
      const s = STAFF[kind];
      const npc = new NPC(this, {
        look: staffLook(rng, kind), name: s.name, short: s.name, role: 'staff', staff: kind, post: { ...post, floor: 0 },
        persona: { courage: brave, panic: 0.3, obedience: 0.6, speed: 0.95, smart: true }, x: post.x, z: post.z, y: 0, health: 70,
      });
      if (kind === 'cleaner') npc.holdItem({ type: 'mop' });
      this.addNpc(npc);
    }
  }

  addNpc(npc) {
    this.npcs.push(npc);
    this.people.push(npc);
  }

  spawnItems() {
    for (const spec of this.school.items) {
      const it = { ...spec, taken: false, holder: null };
      it.charge = 1;
      it.mesh = new THREE.Mesh(itemGeometry(it.type), ITEM_MAT);
      it.mesh.castShadow = true;
      if (spec.cabinet) it.mesh.position.set(spec.cabinet.x, spec.cabinet.y + 0.28, spec.cabinet.z);
      else if (it.type === 'extinguisher') it.mesh.position.set(it.x, it.y + 0.45, it.z);
      else if (it.type === 'bat') { it.mesh.position.set(it.x, it.y + 0.06, it.z); it.mesh.rotation.z = Math.PI / 2; }
      else { it.mesh.position.set(it.x, it.y + 0.05, it.z); it.mesh.rotation.x = 0.25; }
      this.scene.add(it.mesh);
      this.items.push(it);
    }
  }

  dropItem(it, pos) {
    if (!it) return;
    const y = this.world.groundAt(pos.x, pos.z, pos.y ?? 0);
    it.taken = false;
    it.holder = null;
    it.x = pos.x; it.z = pos.z; it.y = y; it.floor = floorOfY(y);
    it.mesh = new THREE.Mesh(itemGeometry(it.type), ITEM_MAT);
    it.mesh.castShadow = true;
    it.mesh.position.set(pos.x, y + 0.1, pos.z);
    it.mesh.rotation.z = Math.PI / 2;
    this.scene.add(it.mesh);
    if (!this.items.includes(it)) this.items.push(it);
  }

  // ------------------------------------------------------------------ сервисы для систем

  noise(pos, r, kind, src) {
    const n = { x: pos.x, y: pos.y ?? pos.y0 ?? 0, z: pos.z, r, kind, src, t: this.time };
    this.noiseEvents.push(n);
    const zid = this.zoneIdAt(n.x, n.z, n.y);
    if (zid && kind !== 'steps') this.school.zoneById.get(zid).lastNoise = this.time;
    if (kind === 'scream' && src && Math.random() < 0.5) this.audio.scream(pos, src.fem);
    for (const t of this.threats) if (t.alive && t.hear) t.hear(n);
    if (src && src !== this.player && this.player.alive && this.threats.includes(src)) {
      const d = Math.hypot(n.x - this.player.pos.x, n.z - this.player.pos.z);
      if (d < r * 0.6) src.knownT = this.time;
    }
  }

  zoneIdAt(x, z, y) {
    return zoneAt(x, z, floorOfY(y))?.id ?? null;
  }

  zoneHasNoise(zoneId, secs) {
    const z = this.school.zoneById.get(zoneId);
    if (!z) return false;
    if (this.time - (z.lastNoise ?? -99) < secs) return true;
    // Или там просто кто-то есть и он не прячется в шкафчике.
    return [this.player, ...this.npcs].some((p) => p.alive && p.zone?.id === zoneId && p.noise > 0.3);
  }

  setLights(zone, on) {
    setZoneLights(zone, on);
    this.audio.click();
  }

  pickWander(npc, task) {
    let list = this.school.wander;
    if (task.corridor) list = list.filter((w) => w.kind === 'walk' && w.floor === 0);
    else {
      const same = list.filter((w) => w.floor === npc.floor && w.kind !== 'play');
      list = Math.random() < 0.8 && same.length ? same : list.filter((w) => w.kind !== 'play');
    }
    const w = list[Math.floor(Math.random() * list.length)];
    return w ? { x: w.x + (Math.random() - 0.5), z: w.z + (Math.random() - 0.5) * 0.6, floor: w.floor, kind: w.kind } : null;
  }

  findHideSpot(npc, opts = {}) {
    let best = null, bs = -1e9;
    const zid = npc.zone?.id;
    for (const s of this.school.hideSpots) {
      if (s.floor !== npc.floor) continue;
      if (s.occupant && s.occupant !== npc) continue;
      if (s.reserved && s.reserved !== npc && s.reserved.alive && s.reserved.task?.spot === s) continue;
      if (opts.sameZone && s.zone !== zid) continue;
      const d = Math.hypot(s.x - npc.pos.x, s.z - npc.pos.z);
      if (d > 30) continue;
      let sc = -d - s.cover * 8;
      if (s.zone === zid) sc += 6;
      if (opts.preferRoom && !s.zone.startsWith('cor')) sc += 4;
      if (opts.near) sc -= Math.hypot(s.x - opts.near.pos.x, s.z - opts.near.pos.z) * 1.5;
      if (opts.avoid) {
        const ad = Math.hypot(s.x - opts.avoid.pos.x, s.z - opts.avoid.pos.z);
        if (ad < 8) sc -= (8 - ad) * 5;
      }
      if (this.fire.active) {
        sc -= this.fire.smokeOf(s.zone) * 40;
        if (this.fire.heatNear(s.x, s.z, s.floor, 3) > 0.2) sc -= 100;
      }
      if (s.type === 'locker' && opts.sameZone) sc -= 5;
      if (sc > bs) { bs = sc; best = s; }
    }
    if (best) best.reserved = npc;
    return best;
  }

  exitNear(npc, dist, away) {
    for (const e of EXITS) {
      const room = ROOM_BY_ID.get(e.room);
      const ex = e.wall === 'z0' ? { x: e.at, z: -10 } : e.wall === 'x0' ? { x: -30, z: e.at } : { x: 50, z: e.at };
      const d = Math.hypot(ex.x - npc.pos.x, ex.z - npc.pos.z);
      if (d > dist || npc.floor !== 0) continue;
      if (away) {
        const th = this.threats.find((t) => t.alive && !t.neutralized && Math.hypot(t.pos.x - ex.x, t.pos.z - ex.z) < d + 4 && t.floor === 0);
        if (th) continue;
      }
      void room;
      return e;
    }
    return null;
  }

  fleePoint(npc, threat) {
    const cands = [];
    for (const e of EXITS) cands.push({ x: e.out.x, z: e.out.z, floor: 0, evac: true });
    for (const z of this.school.zones) {
      if (!z.doors || z.type === 'wc' && Math.random() < 0.5) continue;
      cands.push({ x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2, floor: z.floor });
    }
    let best = null, bs = -1e9;
    for (const c of cands) {
      const dn = Math.hypot(c.x - npc.pos.x, c.z - npc.pos.z) + (c.floor !== npc.floor ? 18 : 0);
      const dt = threat ? Math.hypot(c.x - threat.pos.x, c.z - threat.pos.z) + (c.floor !== threat.floor ? 18 : 0) : 30;
      const s = dt * 1.2 - dn + (c.evac && npc.floor === 0 ? 6 : 0) + Math.random() * 4;
      if (dt < dn) continue;
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  evacFields(target) {
    if (target === 'bus') {
      if (!this.fields.bus) this.fields.bus = this.nav.buildField(SCHOOL.bus);
      return this.fields.bus;
    }
    return this.fields.assembly;
  }

  atAssembly(p) {
    const A = SCHOOL.assembly;
    return !p.zone && Math.hypot(p.pos.x - A.x, p.pos.z - A.z) < A.r;
  }

  atBus(p) {
    const B = SCHOOL.bus;
    return this.scenario?.rescueHere && Math.hypot(p.pos.x - B.x, p.pos.z - B.z) < B.r;
  }

  onSaved(npc) {
    if (npc.cmd?.type === 'follow' && npc.leader === this.player) {
      this.savedByPlayer++;
      npc.say('Спасибо!', 2);
    }
    if (this.alarm.type === 'zombie' && this.atBus(npc)) { npc.inBus = true; npc.setVisible(false); }
  }

  nearestThreat(p, range) {
    let best = null, bd = range;
    for (const t of this.threats) {
      if (!t.alive || t.neutralized) continue;
      const d = p.distTo(t);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  melee(attacker, target, dmg) {
    target.hitBy?.(attacker, dmg, 'punch');
    this.audio.punch(target.pos);
    this.noise(attacker.pos, 10, 'fight', attacker);
  }

  zombieBite(z, victim) {
    const dmg = SCHOOL.zombie.damage[this.difficulty] * (0.8 + Math.random() * 0.4);
    const died = victim.takeDamage(victim === this.player ? dmg : dmg * 1.6, z, 'bite');
    this.audio.punch(victim.pos);
    // Укушенный ученик через какое-то время сам станет зомби.
    if (!died && victim !== this.player && victim.infected <= 0 && !victim.bitten) {
      victim.bitten = true;
      victim.infectAt = this.time + SCHOOL.zombie.turnTime[this.difficulty] * 2 + Math.random() * 8;
    }
    if (victim !== this.player && victim.alive) victim.speak?.('hurt', true);
    if (victim === this.player) this.cam.shake = Math.min(1, this.cam.shake + 0.5);
    if (!this.alarm.type) this.scenario.raiseAlarm('zombie', 'bite');
    this.noise(victim.pos, 18, 'scream', victim);
    return died;
  }

  onPersonDown(p, kind, source) {
    if (p === this.player) { this.audio.hurt(); return; }
    if (kind === 'bite' || kind === 'infection') p.turnAt = this.time + SCHOOL.zombie.turnTime[this.difficulty] * (0.7 + Math.random() * 0.6);
    if (p.task?.spot) p.task.spot.reserved = null;
    if (p.distTo?.(this.player) < 14 && this.player.alive) {
      const why = kind === 'shot' ? 'ранен' : kind === 'smoke' ? 'потерял сознание в дыму' : kind === 'fire' ? 'обгорел' : kind === 'bite' ? 'укушен' : 'упал';
      this.hud.flash(`${p.short ?? p.name} ${p.fem && why.endsWith('н') ? why + 'а' : p.fem && why === 'упал' ? 'упала' : why}`);
    }
    void source;
  }

  turnToZombie(npc) {
    npc.turned = true;
    npc.turnAt = null;
    const z = new Zombie(this, npc.pos.x, npc.pos.z, npc.pos.y, npc.look, { rise: true, name: npc.short });
    z.heading = npc.heading;
    this.threats.push(z);
    npc.setVisible(false);
    npc.model.root.removeFromParent();
    if (npc.distTo(this.player) < 15) this.hud.flash(`${npc.short} встаёт… это уже не ${npc.fem ? 'она' : 'он'}!`);
  }

  onZombieDown() {
    this.zombiesDown++;
  }

  onIntruderDown(t, by) {
    const helpers = by === this.player || (by?.cmd?.type === 'fight' && by.leader === this.player) || by?.cmd?.type === 'fight';
    if (helpers) this.scenario.byPlayer = true;
    if (by?.role !== 'swat') this.hud.banner('Нападающий повален! Подойди и свяжи его (E)', 'calm', 5);
  }

  onIntruderTied() {
    this.scenario.byPlayer = true;
  }

  onThreatSees(t, target) {
    if (target === this.player) t.knownT = this.time;
  }

  cameraShakeAt(pos, k) {
    const d = Math.hypot(pos.x - this.camera.position.x, pos.z - this.camera.position.z);
    if (d < 15) this.cam.shake = Math.min(1, this.cam.shake + k * (1 - d / 15));
  }

  pullAlarm(by) {
    const s = this.scenario;
    if (this.alarm.type) { this.hud.flash('Тревога уже включена'); return; }
    if (s.type === 'fire' && this.fire.active) {
      s.alarmPulled = true;
      s.raiseAlarm('fire', 'player');
      return;
    }
    if (s.type === 'fire' || !s.started) { this.hud.flash('Без пожара кнопку жать нельзя — это ложный вызов!'); return; }
    this.hud.flash('Это не пожар — сирена тут не поможет');
    void by;
  }

  randomLook() {
    return studentLook(this.rng, this.rng.chance(0.5), 8);
  }

  // Команда игрока ближайшим людям.
  command(type) {
    const p = this.player;
    if (!p.alive) return;
    const NAMES = { follow: 'За мной!', hide: 'Прячьтесь!', fight: 'Бей его!', quiet: 'Тихо!', wait: 'Ждите здесь!', run: 'Бегите к выходу!' };
    p.say(NAMES[type], 1.6);
    p.stats.commands++;
    if (type !== 'quiet') this.noise(p.pos, type === 'fight' ? 14 : 8, 'voice', p);
    if (type === 'fight' && !this.nearestThreat(p, 16)) { this.hud.flash('Рядом нет угрозы'); return; }
    const cands = this.npcs.filter((n) => n.alive && !n.turned && !n.inBus && n.infected <= 0 && n.floor === p.floor &&
      p.distTo(n) < SCHOOL.npc.commandRadius && (p.distTo(n) < 4 || this.world.lineOfSight(p.eye(), n.eye())))
      .sort((a, b) => p.distTo(a) - p.distTo(b));
    let yes = 0, no = 0, spoke = 0;
    const limit = type === 'follow' ? SCHOOL.npc.followers : 99;
    for (const n of cands) {
      if (type === 'follow' && n.cmd?.type === 'follow') { yes++; continue; }
      if (yes >= limit && type === 'follow') break;
      if (type !== 'follow' && type !== 'quiet' && n.cmd?.type !== 'follow' && p.distTo(n) > 5 && type !== 'run') continue;
      const r = n.receiveCommand(type, p);
      if (!r) continue;
      if (r === 'refuse' || r === 'fightNo') no++; else yes++;
      if (spoke < 2) { n.speak(r, true); spoke++; }
    }
    // Порядок в колонне за игроком.
    let i = 0;
    for (const n of this.npcs) if (n.cmd?.type === 'follow' && n.leader === p) n.followIndex = i++;
    const MSG = {
      follow: yes ? `За тобой идут: ${i}` : 'Никто не пошёл за тобой',
      hide: yes ? `Прячутся: ${yes}` : 'Некому прятаться рядом',
      fight: yes ? `На нападающего бросились: ${yes}` : 'Никто не решился',
      quiet: yes ? 'Все притихли' : 'Рядом никого',
      wait: yes ? `Ждут: ${yes}` : 'Рядом никого',
      run: yes ? `Побежали к выходу: ${yes}` : 'Рядом никого',
    };
    this.hud.flash(MSG[type] + (no ? ` · отказались: ${no}` : ''));
  }

  onEnd(result) {
    this.running = false;
    this.input.releaseAll();
    this.audio.alarmMode = null;
    this.audio.sirenOn = false;
    setTimeout(() => this.menu.showEnd(result), result.win ? 600 : 1600);
  }

  // ------------------------------------------------------------------ цикл

  frame() {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    this.input.beginFrame(now);
    if (this.input.pressed('mute')) { const m = this.audio.toggleMute(); this.hud.flash(m ? 'Звук выключен' : 'Звук включён'); }
    if (this.running && this.input.pressed('pause')) this.menu.togglePause();
    if (this.running && this.input.pressed('map')) this.hud.toggleBig();
    if (this.running && this.input.pressed('help')) this.menu.toggleHelp();
    if (this.running && this.input.pressed('view')) this.cam.first = !this.cam.first;
    if (this.running && !this.paused) this.step(dt);
    else if (!this.running) this.idleCamera(dt);
    this.render(dt);
    this.input.endFrame();
  }

  idleCamera(dt) {
    if (this.player && this.scenario?.over) {
      // После конца — облёт вокруг игрока.
      this.idleYaw += dt * 0.15;
      const p = this.player.pos;
      this.camera.position.set(p.x + Math.sin(this.idleYaw) * 6, p.y + 3, p.z + Math.cos(this.idleYaw) * 6);
      this.camera.lookAt(p.x, p.y + 1, p.z);
      return;
    }
    this.idleYaw += dt * 0.05;
    const r = 58;
    this.camera.position.set(10 + Math.sin(this.idleYaw) * r, 16, -6 - Math.cos(this.idleYaw) * r);
    this.camera.lookAt(8, 3, 2);
  }

  step(dt) {
    this.time += dt;
    this.pathBudget = 6;
    const p = this.player;
    this.cam.look(this.input.lookDX, this.input.lookDY);
    this.scenario.update(dt);
    p.update(dt, this.input, this.cam);
    for (const n of this.npcs) {
      if (n.turned) continue;
      if (n.infected > 0) {
        n.infected -= dt;
        n.stop();
        n.gesture = 'cover';
        n.crouch = true;
        n.physics(dt);
        if (Math.random() < dt * 0.8) this.audio.cough(n.pos);
        if (n.infected <= 0) { n.die('infection'); }
        continue;
      }
      n.update(dt);
      if (n.alive && n.infectAt && this.time >= n.infectAt) {
        n.infectAt = null;
        if (n.hidden) n.leaveHide();
        n.say('Мне... плохо...', 2.5);
        n.infected = 4;
      }
      if (!n.alive && n.turnAt && this.time >= n.turnAt) this.turnToZombie(n);
    }
    for (const t of this.threats) t.update(dt);
    for (const r of this.rescuers) r.update(dt);
    this.separate();
    this.doors.update(dt);
    this.fire.update(dt);
    this.fire.hurtPeople(dt, this.people);
    if (this.fire.active) {
      this.fieldT = (this.fieldT ?? 0) - dt;
      if (this.fieldT <= 0) {
        this.fieldT = 2;
        this.fire.applyNavCosts(this.nav);
        this.fields.assembly = this.nav.buildField(SCHOOL.assembly, undefined, this.fieldsBase.assembly);
      }
    }
    if (this.evacDirty) { this.evacDirty = false; this.fields.bus = null; }
    // Кашель игрока в дыму.
    if (p.cough > 0.6 && Math.random() < dt * 0.9) { this.audio.cough(p.pos); p.cough = 0.2; }
    // Видимые игроку угрозы — на карту.
    this.seeT = (this.seeT ?? 0) - dt;
    if (this.seeT <= 0) {
      this.seeT = 0.3;
      const eye = p.eye();
      for (const t of this.threats) {
        if (!t.alive && t.kind === 'zombie') continue;
        const d = p.distTo(t);
        if (d < 6 || (d < 30 && this.world.lineOfSight(eye, t.eye()))) t.knownT = this.time;
      }
    }
    this.noiseEvents = this.noiseEvents.filter((n) => n.t > this.time - 2);
    for (const l of this.flashers) l.intensity = (Math.sin(this.time * 12 + l.position.x) > 0 ? 25 : 0);
    this.hud.update(dt);
  }

  // Люди не проходят друг сквозь друга (простое расталкивание кругов).
  separate() {
    const list = [];
    for (const p of this.people) if (p.alive && !p.hidden && !p.sitting && !p.turned && !p.inBus) list.push(p);
    for (const t of this.threats) if (t.alive || t.neutralized) list.push(t);
    for (const r of this.rescuers) list.push(r);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (Math.abs(a.pos.y - b.pos.y) > 1.2) continue;
        const wa = a === this.player ? 0.3 : !a.alive ? 0 : 0.5, wb = b === this.player ? 0.3 : !b.alive ? 0 : 0.5;
        if (wa + wb === 0) continue;
        if (separateCircles(a.pos, a.radius, b.pos, b.radius, wa / (wa + wb), wb / (wa + wb))) { a._pushed = true; b._pushed = true; }
      }
    }
    // Толпа не должна выдавливать людей сквозь стены: после расталкивания — снова стены.
    for (const p of list) {
      if (!p._pushed) continue;
      p._pushed = false;
      if (p.alive) this.world.resolveCircle(p.pos, p.radius, p.crouch ? 1.0 : 1.5);
    }
  }

  render(dt) {
    const p = this.player;
    if (this.running && p) this.cam.update(dt, p);
    const cp = this.camera.position;
    // Какой этаж рисовать: камера внутри корпуса — только её этаж (+ лестницы, спортзал).
    const inMain = cp.x > BLD.x0 && cp.x < BLD.x1 && cp.z > BLD.z0 && cp.z < BLD.z1;
    const camFloor = cp.y > 3.5 ? 1 : 0;
    const inGym = cp.x > GYM.x0 && cp.x < GYM.x1 && cp.z > GYM.z0 && cp.z < GYM.z1;
    for (const z of this.school.zones) {
      let vis;
      if (!inMain && !inGym) {
        // Снаружи интерьер виден только вблизи (через окна).
        const dx = Math.max(z.x0 - cp.x, 0, cp.x - z.x1), dz = Math.max(z.z0 - cp.z, 0, cp.z - z.z1);
        vis = dx * dx + dz * dz < 26 * 26;
      } else vis = !inMain || z.type === 'stairs' || z.type === 'gym' || z.type === 'gymstore' || z.floor === camFloor ||
        (camFloor === 0 && cp.y > 2.8);
      if (z._vis !== vis) { z._vis = vis; for (const m of z.meshes) m.visible = vis; }
    }
    for (const q of this.people) {
      if (!q.model) continue;
      const far = q.pos.distanceToSquared(cp) > 55 * 55;
      const hideFloor = inMain && q !== p && floorOfY(q.pos.y) !== camFloor && !(q.zone?.type === 'stairs');
      const show = q.visibleModel && !q.turned && !q.inBus && !far && !hideFloor;
      if (q !== p || !this.running) q.model.root.visible = show;
      q.render(dt);
    }
    for (const t of [...this.threats, ...this.rescuers]) {
      const hideFloor = inMain && floorOfY(t.pos.y) !== camFloor && t.zone?.type !== 'stairs';
      t.model.root.visible = !hideFloor && t.pos.distanceToSquared(cp) < 70 * 70;
      t.render(dt);
    }
    // Солнце и тени — вокруг камеры.
    const tx = p ? p.pos.x : cp.x, tz = p ? p.pos.z : cp.z;
    this.sun.position.set(tx + 32, 55, tz - 44);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.target.updateMatrixWorld();
    this.updateLightPool();
    // Дым — туман гуще.
    const fog = this.scene.fog;
    let far = 230, near = 60;
    if (this.fire?.active && p?.zone) {
      const s = this.fire.smokeOf(p.zone.id);
      far = THREE.MathUtils.lerp(230, 7, Math.min(1, s * 1.1));
      near = Math.min(near, far * 0.15);
    } else if (p?.zone) { far = 160; near = 40; }
    fog.far += (far - fog.far) * Math.min(1, dt * 3);
    fog.near += (near - fog.near) * Math.min(1, dt * 3);
    const smokeK = this.fire?.active && p?.zone ? Math.min(1, this.fire.smokeOf(p.zone.id)) : 0;
    fog.color.copy(this.fogColor).lerp(new THREE.Color('#47433f'), smokeK);
    this.effects.update(dt);
    this.audio.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateLightPool() {
    this.poolT = (this.poolT ?? 0) - 1;
    if (this.poolT > 0) return;
    this.poolT = 6;
    const cp = this.camera.position;
    const cand = [];
    for (const f of this.school.fixtures) {
      if (Math.abs(f.y - cp.y) > 3.6) continue;
      const z = this.school.zoneById.get(f.zone);
      if (!z.lightsOn) continue;
      cand.push({ f, d: (f.x - cp.x) ** 2 + (f.z - cp.z) ** 2 });
    }
    cand.sort((a, b) => a.d - b.d);
    this.pool.forEach((l, i) => {
      const c = cand[i];
      if (c && c.d < 400) { l.position.set(c.f.x, c.f.y, c.f.z); l.intensity = this.gfx.shadows ? 5 : 7; }
      else l.intensity = 0;
    });
  }
}

void pickLine;
new Game();
