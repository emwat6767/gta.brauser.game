import * as THREE from 'three';
import { mergeColored } from '../js/geometry.js';
import { SCHOOL } from './config.js';
import { ROOM_BY_ID, EXITS } from './layout.js';
import { Intruder, Zombie, Rescuer, intruderSpawn } from './threats.js';
import { createBusParts } from './yard.js';

// Режиссёр дня: перемена → звонок → урок; в случайный момент — пожар, нападение или зомби.
// Ведёт таймеры (датчик дыма, пожарные, полиция, автобус МЧС), объявления по громкой связи,
// задачу игрока на экране, условия конца и итоговый экран с советами.

const FIRE_SPOTS = [
  { zone: 'cafe', name: 'кухня столовой', pick: (z) => z.fireSpots?.[0] },
  { zone: 'chem', name: 'кабинет химии', pick: (z) => ({ x: z.x0 + 3, z: z.z0 + 4 }) },
  { zone: 'library', name: 'библиотека', pick: (z) => ({ x: z.x1 - 3, z: z.z0 + 5.5 }) },
  { zone: 'storage', name: 'подсобка', pick: (z) => ({ x: (z.x0 + z.x1) / 2, z: z.z1 - 2 }) },
  { zone: 'c105', name: 'кабинет информатики', pick: (z) => ({ x: z.x1 - 3, z: z.z1 - 3 }) },
  { zone: 'gymstore', name: 'инвентарная спортзала', pick: (z) => ({ x: 47, z: 8.5 }) },
  { zone: 'assembly', name: 'актовый зал', pick: () => ({ x: -4.8, z: -6 }) },
  { zone: 'teachers', name: 'учительская', pick: () => ({ x: 3.6, z: 8.8 }) },
];

const TIPS = {
  fire: [
    'Услышал тревогу — сразу выходи, вещи не собирай.',
    'Дым опаснее огня: пригнись (C), под дымом воздух чище.',
    'Закрывай за собой двери — огонь и дым идут медленнее.',
    'Не прячься под партой или в шкафу: пожарные тебя не найдут.',
    'Звони 101 или 112. Нажми пожарную кнопку, если тревоги ещё нет.',
    'Выйди к месту сбора на стадионе и отметься у учителя.',
  ],
  attack: [
    'Если можно уйти безопасно — уходи и уводи других.',
    'Нельзя уйти — прячься: дверь на замок (R), свет выключи, отойди от двери.',
    'Придвинь парту к двери (B), выключи звук телефона, не шуми.',
    'Нападать — только в крайнем случае и вместе: когда он перезаряжается или ослеп.',
    'Огнетушитель в лицо даёт несколько секунд — этого хватит, чтобы повалить.',
    'Звони 112, когда безопасно. Полиции не мешай, держи руки на виду.',
  ],
  zombie: [
    'Зомби идут на шум — не кричи и не бегай без нужды.',
    'Запертая дверь с баррикадой держит долго.',
    'Бита из инвентарной спортзала и огнетушитель — лучшее оружие.',
    'Держитесь вместе: «За мной» (1) и «Бей его!» (3).',
    'Автобус МЧС приедет к воротам — доберись до него.',
  ],
};

export class Scenario {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;           // { type, difficulty, alarmMode: 'random' | 'soon' }
    this.type = opts.type === 'random' ? (Math.random() < 0.5 ? 'fire' : 'attack') : opts.type;
    this.phase = 'break';
    this.t = 0;
    const [a, b] = SCHOOL.alarmWindow;
    this.alarmAt = opts.alarmMode === 'soon' ? 8 + Math.random() * 6 : a + Math.random() * (b - a);
    this.started = false;
    this.events = [];          // таймеры { at, fn }
    this.helpAt = null;        // когда приедут помощь
    this.helpName = '';
    this.rescueHere = false;
    this.over = false;
    this.result = null;
    this.alarmPulled = false;
    this.intruders = [];
    this.saved = new Set();
    this.dayStart = 9 * 60 + 13;   // 9:13 — перемена перед вторым уроком
  }

  // --- время и статус -------------------------------------------------------------------

  clockText() {
    const m = this.dayStart + this.t / 20;   // минута игры = 3 минуты школьных часов
    const hh = Math.floor(m / 60), mm = Math.floor(m % 60);
    return `${hh}:${String(mm).padStart(2, '0')}`;
  }

  status() {
    const g = this.game;
    const cls = g.player.cls;
    let phase, kind = 'calm', objective, timer = null;
    if (!g.alarm.type) {
      if (this.phase === 'break') {
        phase = 'Перемена';
        objective = `Скоро урок: ${cls.subject}, ${ROOM_BY_ID.get(cls.room).short ? 'кабинет ' + ROOM_BY_ID.get(cls.room).short : ROOM_BY_ID.get(cls.room).name}`;
      } else {
        phase = `Урок: ${cls.subject}`;
        objective = g.player.sitting ? 'Слушай учителя… (обычный день)' : `Иди в кабинет ${ROOM_BY_ID.get(cls.room).short ?? ''} и садись за парту (E)`;
      }
      if (this.type === 'fire' && g.fire.active && !g.alarm.type) { phase += ' · пахнет дымом?'; }
    } else if (g.alarm.type === 'fire') {
      phase = 'ПОЖАРНАЯ ТРЕВОГА';
      kind = 'fire';
      objective = g.player.saved ? 'Ты на месте сбора. Помоги остальным или дождись переклички.'
        : 'Выбирайся на стадион к месту сбора. Пригнись в дыму (C).';
    } else if (g.alarm.type === 'attack') {
      phase = 'ОПАСНОСТЬ: НАПАДЕНИЕ';
      kind = 'attack';
      const free = this.intruders.some((i) => !i.neutralized);
      objective = !free ? 'Нападающий обезврежен!' : g.player.saved ? 'Ты в безопасности на улице. Дождись полиции.'
        : 'Уйди из здания или спрячься: запри дверь (R), выключи свет, не шуми.';
    } else {
      phase = 'ЗОМБИ В ШКОЛЕ';
      kind = 'zombie';
      objective = this.rescueHere ? 'Автобус МЧС у ворот — беги к нему!' : 'Выживи: запрись, держись вместе, дождись спасателей.';
    }
    if (this.helpAt !== null && !this.helpArrived) {
      const left = Math.max(0, this.helpAt - this.t);
      timer = `${this.helpName}: ~${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    }
    return { clock: this.clockText(), phase, kind, objective, timer };
  }

  at(dt, fn) {
    this.events.push({ at: this.t + dt, fn });
  }

  // --- кадр -------------------------------------------------------------------------------

  update(dt) {
    const g = this.game;
    this.t += dt;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.t >= this.events[i].at) { const e = this.events[i]; this.events.splice(i, 1); e.fn(); }
    }
    if (this.phase === 'break' && this.t > SCHOOL.breakLength) {
      this.phase = 'lesson';
      g.audio.bell();
      g.hud.flash('Звонок на урок!');
    }
    if (!this.started && this.t >= this.alarmAt) this.start();
    if (this.helpAt !== null && !this.helpArrived && this.t >= this.helpAt) { this.helpArrived = true; this.onHelp(); }
    if (!this.over) this.checkEnd(dt);
  }

  start() {
    this.started = true;
    if (this.type === 'fire') this.startFire();
    else if (this.type === 'attack') this.startAttack();
    else this.startZombie();
  }

  // --- пожар ------------------------------------------------------------------------------

  startFire() {
    const g = this.game;
    const p = g.player;
    const options = FIRE_SPOTS.map((f) => ({ ...f, z: g.school.zoneById.get(f.zone) }))
      .filter((f) => f.z && Math.hypot((f.z.x0 + f.z.x1) / 2 - p.pos.x, (f.z.z0 + f.z.z1) / 2 - p.pos.z) > 12);
    const f = options[Math.floor(Math.random() * options.length)] ?? FIRE_SPOTS[0];
    const spot = f.pick(f.z ?? g.school.zoneById.get(f.zone));
    g.fire.start(spot.x, spot.z, f.z.floor, 1.0);
    this.fireName = f.name;
    // Двое «в наушниках» ушли в туалет и не услышат сирену — их можно найти и вывести.
    const cands = g.npcs.filter((n) => n.alive && n.role === 'student' && !n.cls?.player && n.cls?.room !== 'gym');
    const wcs = g.school.zones.filter((z) => z.type === 'wc' && z.floor !== f.z.floor);
    for (let i = 0; i < 2 && cands.length && wcs.length; i++) {
      const n = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
      const z = wcs[Math.floor(Math.random() * wcs.length)];
      n.headphones = true;
      n.truant = true;
      n.model.setLook({ ...n.look, headphones: '#1a1a1a' });
      n.look = n.model.look;
      if (n.sitting) n.leaveSeat();
      const spot = z.hideSpots.find((s) => s.type === 'stall' && !s.occupant) ?? z.hideSpots[0];
      if (spot) n.setTask({ type: 'hide', spot, until: 1e9 });
    }
    // Датчик дыма — через несколько секунд, если раньше никто не нажал кнопку.
    this.at(SCHOOL.fire.detector + Math.random() * 6, () => this.raiseAlarm('fire', 'detector'));
  }

  // --- нападение ----------------------------------------------------------------------------

  startAttack() {
    const g = this.game;
    const n = SCHOOL.intruder.count[g.difficulty];
    for (let i = 0; i < n; i++) {
      const sp = intruderSpawn(g);
      const t = new Intruder(g, sp);
      g.threats.push(t);
      this.intruders.push(t);
      // Через главный вход — его видит охранник и жмёт тревожную кнопку.
      if (sp.exit.id === 'main') this.at(9 + Math.random() * 3, () => this.raiseAlarm('attack', 'guard'));
    }
    // Если никто не поднял тревогу — после первых выстрелов или через 25 с.
    this.at(25, () => this.raiseAlarm('attack', 'call'));
  }

  // --- зомби ---------------------------------------------------------------------------------

  startZombie() {
    const g = this.game;
    const d = g.difficulty;
    // Нулевой пациент: ученик из чужого класса, подальше от игрока.
    const cands = g.npcs.filter((n) => n.alive && n.role === 'student' && n.cls && !n.cls.player && n.distTo(g.player) > 15);
    const zero = cands[Math.floor(Math.random() * cands.length)];
    if (zero) {
      zero.say('Мне плохо... меня кто-то укусил на улице...', 3);
      zero.infected = 7;
      zero.cough = 5;
      this.at(4, () => zero.alive && zero.say('Кха... кха...', 2));
    }
    // Ещё несколько приходят со стороны стадиона.
    const extra = SCHOOL.zombie.start[d] - 1;
    this.at(18, () => {
      for (let i = 0; i < extra; i++) {
        const x = -20 + Math.random() * 40, z = 22 + Math.random() * 8;
        const look = g.randomLook();
        const zb = new Zombie(g, x, z, 0, look);
        zb.investigate = { x: [-31, 50, 0][i % 3], z: [0, 0, -12][i % 3], floor: 0, t: g.time };
        g.threats.push(zb);
      }
    });
    this.at(10, () => this.raiseAlarm('zombie', 'first'));
  }

  // Тревога: объявление, сирена, все NPC узнают.
  raiseAlarm(type, why) {
    const g = this.game;
    if (g.alarm.type) return;
    g.alarm.type = type;
    g.alarm.t = this.t;
    const d = g.difficulty;
    if (type === 'fire') {
      g.audio.alarmMode = 'fire';
      g.audio.announce('Внимание! Пожарная тревога! Всем покинуть здание и пройти к месту сбора на стадионе!');
      g.hud.banner('ПОЖАРНАЯ ТРЕВОГА — всем на выход, место сбора на стадионе', 'fire', 7);
      this.helpAt = this.t + SCHOOL.fire.firemenAfter[d];
      this.helpName = 'Пожарные';
      if (why === 'player') g.hud.flash('Ты включил пожарную тревогу. Все слышат сирену.');
    } else if (type === 'attack') {
      g.audio.alarmMode = 'danger';
      g.audio.announce('Внимание! Опасность! Это не учения! Всем закрыться в кабинетах и сохранять тишину!');
      g.hud.banner('ОПАСНОСТЬ! В школе вооружённый человек. Закройтесь и не шумите', 'attack', 7);
      this.helpAt = this.t + SCHOOL.intruder.policeAfter[d];
      this.helpName = 'Полиция';
    } else {
      g.audio.alarmMode = 'danger';
      g.audio.announce('Внимание! В школе опасность! Закройтесь в кабинетах! Не открывайте двери! Помощь уже едет!');
      g.hud.banner('ЗОМБИ! Закрывайтесь в кабинетах — помощь уже едет', 'zombie', 7);
      this.helpAt = this.t + SCHOOL.zombie.rescueAfter[d];
      this.helpName = 'Автобус МЧС';
    }
    g.noise(g.player.pos, 999, 'alarm', null);
    for (const n of g.npcs) if (n.alive && !n.headphones) n.becomeAware();
  }

  // --- помощь -----------------------------------------------------------------------------------

  onHelp() {
    const g = this.game;
    g.audio.sirenOn = true;
    this.at(18, () => { g.audio.sirenOn = false; });
    if (g.alarm.type === 'fire') {
      g.hud.banner('Приехали пожарные!', 'calm', 4);
      this.vehicle('fire', 6, -26);
      for (let i = 0; i < 3; i++) g.rescuers.push(new Rescuer(g, 'fireman', -1.5 + i * 1.5, -15));
    } else if (g.alarm.type === 'attack') {
      g.hud.banner('Приехала полиция! Спецназ входит в школу', 'calm', 4);
      this.vehicle('police', 6, -26);
      this.vehicle('police', -7, -27);
      for (let i = 0; i < 3; i++) g.rescuers.push(new Rescuer(g, 'swat', -1.5 + i * 1.5, -15));
    } else {
      this.rescueHere = true;
      g.hud.banner('Автобус МЧС у главных ворот! Все к автобусу!', 'calm', 6);
      g.audio.announce('Автобус МЧС у главных ворот! Все выходите к автобусу!');
      this.vehicle('bus', SCHOOL.bus.x, SCHOOL.bus.z);
      g.rescuers.push(new Rescuer(g, 'soldier', SCHOOL.bus.x - 4, SCHOOL.bus.z + 4));
      g.rescuers.push(new Rescuer(g, 'soldier', SCHOOL.bus.x + 4, SCHOOL.bus.z + 4));
      for (const n of g.npcs) if (n.alive && !n.saved && n.infected <= 0) n.task = null;
      g.evacDirty = true;
    }
  }

  vehicle(kind, x, z) {
    const g = this.game;
    let parts;
    if (kind === 'bus') parts = createBusParts('#f4f4f4', '#d62c2c');
    else {
      parts = [];
      const box = (sx, sy, sz, cx, cy, cz, c) => parts.push({ geometry: new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy + sy / 2, cz), color: c });
      const body = kind === 'fire' ? '#c62828' : '#f4f4f4';
      const len = kind === 'fire' ? 8 : 4.6;
      box(2.3, kind === 'fire' ? 2.4 : 0.9, len, 0, 0.35, 0, body);
      if (kind === 'police') { box(2.2, 0.08, len * 0.98, 0, 0.75, 0, '#1d4fa0'); box(1.9, 0.6, 2.4, 0, 1.25, 0.2, body); box(1.92, 0.45, 2.2, 0, 1.3, 0.2, '#2a3440'); }
      else { box(2.2, 1.2, 2.2, 0, 0.35, len / 2 + 0.9, body); box(2.0, 0.6, 0.1, 0, 1.0, len / 2 + 2.0, '#2a3440'); box(2.0, 0.3, 6, 0, 2.8, -0.5, '#c8ccd0'); }
      box(1.2, 0.2, 0.4, 0, kind === 'fire' ? 2.75 : 1.85, kind === 'fire' ? len / 2 + 0.6 : 0.2, '#ff2a2a');
      for (const dx of [-1.1, 1.1]) for (const dz of [-len / 2 + 0.9, len / 2 - 0.9]) {
        parts.push({ geometry: new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12).rotateZ(Math.PI / 2).translate(dx, 0.42, dz), color: '#141414' });
      }
    }
    const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    mesh.castShadow = true;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = kind === 'bus' ? Math.PI / 2 : 0;
    g.scene.add(mesh);
    g.vehicles.push(mesh);
    // Мигалка.
    const light = new THREE.PointLight(kind === 'bus' ? '#ff7a2a' : kind === 'police' ? '#3a6aff' : '#ff2a2a', 0, 14, 2);
    light.position.set(x, 3, z);
    g.scene.add(light);
    g.flashers.push(light);
  }

  // --- конец --------------------------------------------------------------------------------------

  checkEnd(dt) {
    const g = this.game, p = g.player;
    if (!p.alive) {
      const why = p.lastHurtKind === 'smoke' ? 'Ты задохнулся в дыму' : p.lastHurtKind === 'fire' ? 'Ты попал в огонь'
        : p.lastHurtKind === 'bite' ? 'Тебя укусили…' : 'Ты погиб';
      this.finish(false, why);
      return;
    }
    if (!g.alarm.type) return;
    if (g.alarm.type === 'fire') {
      if (!p.saved && g.atAssembly(p)) {
        p.saved = true;
        g.hud.banner('Ты на месте сбора! Учителя проводят перекличку', 'calm', 5);
        this.rollCallAt = this.t + 25;
      }
      // Перекличка — когда игрок стоит на месте сбора (можно вернуться за кем-то и прийти снова).
      if (p.saved && this.rollCallAt && this.t >= this.rollCallAt && g.atAssembly(p)) this.finish(true, 'Ты эвакуировался');
      else if (p.saved && g.fire.out) this.finish(true, 'Пожар потушен, ты в безопасности');
    } else if (g.alarm.type === 'attack') {
      const free = this.intruders.some((i) => !i.neutralized);
      if (!free) {
        this.clearT = (this.clearT ?? 0) + dt;
        if (this.clearT > 6) this.finish(true, this.byPlayer ? 'Ты помог обезвредить нападающего' : 'Нападающего обезвредили');
      }
      if (!p.saved && !p.zone && g.atAssembly(p)) { p.saved = true; g.hud.flash('Ты убежал далеко от школы. Жди полицию.'); }
    } else {
      if (this.rescueHere && g.atBus(p)) {
        p.saved = true;
        this.busT = (this.busT ?? 0) + dt;
        if (this.busT > 3) this.finish(true, 'Ты добрался до автобуса МЧС');
      }
    }
  }

  finish(win, why) {
    if (this.over) return;
    this.over = true;
    const g = this.game;
    const people = g.npcs;
    const savedCount = people.filter((n) => n.alive && (n.saved || n.inBus || (g.alarm.type === 'attack' && !g.threats.some((t) => !t.neutralized)))).length;
    const lost = people.filter((n) => !n.alive || n.turned).length;
    const pl = g.player.stats;
    const lines = [];
    if (g.alarm.type === 'fire') {
      lines.push(['Очаг', this.fireName ?? '—']);
      lines.push(['Пожарную кнопку нажал', this.alarmPulled ? 'да' : 'нет']);
      lines.push(['Потушил огня (клеток)', g.fire.extinguished]);
    }
    if (g.alarm.type === 'attack') {
      lines.push(['Дверей запер', pl.locked]);
      lines.push(['Баррикад', pl.barricades]);
      lines.push(['Ударов по нападающему', pl.threatsHit]);
    }
    if (g.alarm.type === 'zombie') {
      lines.push(['Зомби повержено', g.zombiesDown]);
      lines.push(['Ударов', pl.threatsHit]);
    }
    lines.push(['Команд одноклассникам', pl.commands]);
    lines.push(['Спасены с твоей помощью', g.savedByPlayer]);
    let stars = win ? 1 : 0;
    if (win && lost <= 3) stars++;
    if (win && g.savedByPlayer >= 3) stars++;
    this.result = {
      win, why, type: g.alarm.type ?? this.type, time: this.t, saved: savedCount, lost, total: people.length, lines, stars,
      tips: TIPS[g.alarm.type ?? this.type],
    };
    g.onEnd(this.result);
  }
}

export function exitById(id) {
  return EXITS.find((e) => e.id === id);
}
