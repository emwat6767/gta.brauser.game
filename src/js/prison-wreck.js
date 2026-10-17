import * as THREE from 'three';
import { NPC_STATE } from './npc.js';

// Разгром тюрьмы. Ломаются: телевизоры и телефоны, двери камер и карцера, ворота шлюза, секции сетки, четыре «заплатки» в стене
// и угловые вышки (падают). Урон приходит от ударов игрока (combat:whiff), взрывов и ударов сил (chaos:blast), самодельных бомб.
// Заодно: побег в бельевой тележке и вызов братвы снаружи (подрыв стены). Подмешивается в PrisonSystem (installWreck).
//
// Реестр this.brk: { id, kind, x, z, y, r, hp, maxHp, broken, ... }. Починка — repairAll() при новом аресте.

const UP = { x: 0, y: 1, z: 0 };
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t1 = new THREE.Matrix4(), _t2 = new THREE.Matrix4();

// Во сколько раз взрыв/сила сильнее бьёт по виду предмета и сколько очков пути он даёт.
const KIND = {
  tv: { blast: 3, melee: 1, pts: 1, label: 'Телевизор', noise: 0.35 },
  phone: { blast: 3, melee: 1, pts: 0.5, label: 'Телефон', noise: 0.3 },
  door: { blast: 2, melee: 1, pts: 0.5, label: 'Дверь камеры', noise: 0.45 },
  hole: { blast: 2, melee: 0.6, pts: 1, label: 'Дверь карцера', noise: 0.5 },
  gate: { blast: 1.2, melee: 0.5, pts: 2, label: 'Ворота шлюза', noise: 1 },
  fence: { blast: 2, melee: 1.2, pts: 0.5, label: 'Сетка', noise: 0.6 },
  wall: { blast: 1, melee: 0, pts: 3, label: 'Стена', noise: 1 },
  tower: { blast: 0.9, melee: 0, pts: 4, label: 'Вышка', noise: 1 },
};

const M = {
  _initWreck() {
    const L = this.layout, game = this.game;
    this.brk = [];
    this.bombs = [];
    this.breakoutAt = 0;
    this.fx = [];      // анимации падающих дверей, ворот, вышек
    for (const b of L.breakables) {
      this.brk.push({ ...b, kind: b.kind, broken: false, chunk: L.chunks.find((c) => c.name === b.chunk) });
    }
    for (const cell of L.cells) this.brk.push({ id: `door-${cell.id}`, kind: 'door', cell, x: cell.w.door.x, z: cell.w.door.z, y: 1.3, r: 1.1, hp: 60, maxHp: 60, broken: false });
    for (const cell of L.holeCells) {
      this.brk.push({ id: `hole-${cell.id}`, kind: 'hole', cell, x: (cell.inside.x + cell.outside.x) / 2, z: (cell.inside.z + cell.outside.z) / 2, y: 1.3, r: 1.3, hp: 130, maxHp: 130, broken: false });
    }
    for (const gt of L.gates.list) {
      const p = L.P(0, gt.lz);
      this.brk.push({ id: `gate-${gt.id}`, kind: 'gate', gate: gt, x: p.x, z: p.z, y: 1.8, r: 3.2, hp: 240, maxHp: 240, broken: false });
    }
    for (const seg of L.fenceSegs) {
      const p = L.P(32, seg.mid);
      this.brk.push({ id: `fence-${seg.index}`, kind: 'fence', seg, x: p.x, z: p.z, y: 1.8, r: 2.4, hp: 70, maxHp: 70, broken: false });
    }
    for (const pt of L.patches) this.brk.push({ id: `wall-${pt.id}`, kind: 'wall', patch: pt, x: pt.x, z: pt.z, y: 3, r: 2.6, hp: pt.hp, maxHp: pt.hp, broken: false });
    L.towers.forEach((t, i) => {
      const p = L.P(t.x, t.z);
      this.brk.push({ id: `tower-${i}`, kind: 'tower', tower: t, i, x: p.x, z: p.z, y: 5, r: 3.4, hp: t.hp, maxHp: t.hp, broken: false });
    });
    // Исходные позиции створок — чтобы чинить.
    for (const b of this.brk) {
      if (b.cell) b.home = { pos: b.cell.doorMesh.position.clone(), rot: b.cell.doorMesh.rotation.clone() };
      if (b.gate) b.home = { l: b.gate.planeL.position.clone(), r: b.gate.planeR.position.clone() };
    }
    game.events.on('chaos:blast', (e) => this._wreckBlast(e));
    game.events.on('combat:whiff', (e) => this._wreckSwing(e));
  },

  get wreckTier() { return this.pathTier('wreck'); },

  _wreckDamage(b, dmg, quiet = false) {
    if (b.broken || dmg <= 0) return;
    b.hp -= dmg;
    const game = this.game;
    if (b.hp <= 0) { this._wreckBreak(b); return; }
    if (b.kind === 'tv' || b.kind === 'phone') game.effects.burst(_v.set(b.x, b.y, b.z), UP, 'spark', 4);
    else if (b.kind === 'wall' || b.kind === 'tower') game.effects.burst(_v.set(b.x, b.y, b.z), UP, 'dust', 5);
    else game.effects.burst(_v.set(b.x, b.y, b.z), UP, 'debris', 3);
    if (!quiet) this._wreckNoise(b, 0.5);
  },

  // Удар игрока «в воздух» (рядом с предметом): ломает мягкие вещи.
  _wreckSwing({ attacker, range, damage }) {
    const game = this.game, p = game.player;
    if (attacker !== p || !this.brk || p.vehicle) return;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    // Заодно толкаем свободные предметы рядом с ударом (chaos.js).
    const cx = p.position.x + fx * (range * 0.6 + 0.3), cz = p.position.z + fz * (range * 0.6 + 0.3);
    if (this.layout.inCompound(p.position.x, p.position.z) || this.inCustody) {
      for (const pr of game.chaos._near(cx, cz, 1.0)) game.chaos.knock(pr, fx * 5, 3, fz * 5);
    }
    const bonus = this.wreckTier >= 0 ? 1.5 : 1;
    for (const b of this.brk) {
      if (b.broken || !KIND[b.kind].melee) continue;
      const dx = b.x - p.position.x, dz = b.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > b.r + range * 0.9 + 0.3 || Math.abs(p.position.y - (b.y - 1.3)) > 2.6) continue;
      if (d > 0.8 && (dx * fx + dz * fz) / d < 0.25) continue;
      this._wreckDamage(b, Math.max(8, damage) * KIND[b.kind].melee * (b.kind === 'door' || b.kind === 'hole' ? bonus : 1));
      break;
    }
  },

  // Взрывы и удары сил: урон по всему, что в радиусе.
  _wreckBlast({ point, radius, attacker, damage = 0 }) {
    const game = this.game;
    if (!this.brk || attacker === undefined) return;
    if (attacker && attacker !== game.player && !attacker.follower) return;
    for (const b of this.brk) {
      if (b.broken) continue;
      const d = Math.max(0, Math.hypot(point.x - b.x, point.z - b.z) - b.r * 0.6);
      if (d > radius || Math.abs(point.y - b.y) > radius + 3) continue;
      const k = 1 - (d / radius) * 0.6;
      this._wreckDamage(b, damage * k * KIND[b.kind].blast, true);
    }
  },

  // Охрана слышит и видит погром: рядом — подозрение, большое разрушение — тревога.
  _wreckNoise(b, mult = 1) {
    if (!this.inCustody || this.alert >= 2 || this.bribe > 0 || this.crew.riot) return;
    const k = KIND[b.kind];
    if (b.broken && k.noise >= 1) { this.startAlarm(`${k.label}: погром!`, true); return; }
    const pp = this.game.player.position;
    for (const g of this.crew.guards) {
      const n = g.npc;
      if (!n || n.isDead || g.noGuard || g.id === 'clerk' || g.id === 'medic') continue;
      if (Math.hypot(n.position.x - pp.x, n.position.z - pp.z) < 24 && this._losSoft(n.position.x, 1.5, n.position.z, pp.x, 1.3, pp.z)) {
        this.sus = Math.min(1.3, this.sus + k.noise * mult);
        if (this.sus >= 0.5 && !this.warned) { this.warned = true; n.say('Эй! Что ты ломаешь?!', true); this.game.hud.toast('Охрана видит погром!', 2.2); }
        break;
      }
    }
  },

  _wreckBreak(b) {
    const game = this.game, fxs = game.effects;
    b.broken = true;
    b.hp = 0;
    const pos = _v.set(b.x, b.y, b.z).clone();
    const p = game.player;
    const away = Math.hypot(b.x - p.position.x, b.z - p.position.z) || 1;
    const dx = (b.x - p.position.x) / away, dz = (b.z - p.position.z) / away;
    const K = KIND[b.kind];
    switch (b.kind) {
      case 'tv':
      case 'phone': {
        if (b.chunk) { b.chunk.broken = true; for (const m of b.chunk.meshes) m.visible = false; }
        fxs.burst(pos, UP, 'spark', 18);
        fxs.burst(pos, UP, 'debris', 8);
        game.audio.slam?.(pos, 0.25);
        this._disableSpot(b.kind === 'tv' ? 'tv' : 'phone', b);
        if (b.kind === 'tv') game.hud.toast('Телевизор разбит. Зато тихо', 2.2);
        break;
      }
      case 'door':
      case 'hole': {
        const cell = b.cell;
        cell.broken = true;
        this._setDoor(cell, true, true);
        b.fly = { t: 0, vx: dx * 6, vz: dz * 6, vy: 4, wz: (Math.random() - 0.5) * 8 };
        this.fx.push(b);
        fxs.burst(pos, UP, 'debris', 14);
        fxs.burst(pos, UP, 'spark', 8);
        game.audio.slam?.(pos, 0.5);
        break;
      }
      case 'gate': {
        const gt = b.gate;
        gt.broken = true;
        this.setGate(gt, true);
        if (gt.colOn) { game.world.colliders.remove(gt.collider); gt.colOn = false; }
        b.fly = { t: 0 };
        this.fx.push(b);
        fxs.burst(pos, UP, 'spark', 20);
        fxs.burst(pos, UP, 'debris', 18);
        game.audio.slam?.(pos, 0.8);
        game.cameraRig.addShake?.(0.25);
        break;
      }
      case 'fence': {
        this._cutFence(b.seg);
        fxs.burst(pos, UP, 'spark', 10);
        fxs.burst(pos, UP, 'debris', 6);
        game.audio.slam?.(pos, 0.3);
        break;
      }
      case 'wall': {
        const pt = b.patch;
        pt.broken = true;
        pt.mesh.visible = false;
        pt.rubble.visible = true;
        game.world.colliders.remove(pt.collider);
        fxs.explosion(pos, 1.0);
        fxs.burst(pos, UP, 'debris', 40);
        game.audio.explosion?.(pos);
        game.cameraRig.addShake?.(0.45);
        game.hud.news(`Стена «Редрока» пробита (${pt.id})!`, '#ffb45a');
        break;
      }
      case 'tower': {
        const t = b.tower;
        t.dead = true;
        for (const c of t.cols) game.world.colliders.remove(c);
        const beam = this.layout.beams[b.i];
        if (beam) { beam.dead = true; beam.mesh.visible = false; }
        const ch = this.layout.chunks.find((c) => c.name === `tower${b.i}`);
        if (ch) { b.chunk = ch; ch.falling = true; }
        b.fall = { t: 0, dir: this.layout.dirW(t.sx, t.sz) };
        this.fx.push(b);
        fxs.explosion(pos, 1.3);
        fxs.burst(pos, UP, 'debris', 36);
        game.audio.explosion?.(pos);
        game.cameraRig.addShake?.(0.55);
        game.hud.news(`Вышка «Редрока» №${b.i + 1} рушится!`, '#ffb45a');
        break;
      }
      default: break;
    }
    if (this.inCustody || this.state === 'fugitive') {
      this.addPath('wreck', K.pts, K.label.toLowerCase() + ' разбит(а)');
      this.stats.respect += K.pts * 0.5;
    }
    this._wreckNoise(b, 1);
  },

  // Станция (телевизор, телефон) больше не работает.
  _disableSpot(id, b) {
    const st = this.stationList?.find((s) => s.id === id);
    if (!st) return;
    st.allSpots ??= [...st.spots];
    st.spots = st.spots.filter((s) => Math.hypot(s.x - b.x, s.z - b.z) > 4.5);
  },

  // Починка всего при новом аресте: «пока вас не было, тюрьму привели в порядок».
  repairAll() {
    if (!this.brk) return;
    const game = this.game, L = this.layout;
    for (const b of this.brk) {
      b.hp = b.maxHp;
      if (!b.broken) continue;
      b.broken = false;
      b.fly = null;
      b.fall = null;
      switch (b.kind) {
        case 'tv':
        case 'phone':
          if (b.chunk) { b.chunk.broken = false; for (const m of b.chunk.meshes) m.visible = true; }
          break;
        case 'door':
        case 'hole':
          b.cell.broken = false;
          b.cell.doorMesh.visible = true;
          b.cell.doorMesh.position.copy(b.home.pos);
          b.cell.doorMesh.rotation.copy(b.home.rot);
          break;
        case 'gate':
          b.gate.broken = false;
          b.gate.planeL.visible = b.gate.planeR.visible = true;
          b.gate.planeL.position.copy(b.home.l);
          b.gate.planeR.position.copy(b.home.r);
          b.gate.planeL.rotation.set(0, 0, 0);
          b.gate.planeR.rotation.set(0, 0, 0);
          b.gate.open = 0;
          b.gate.target = 0;
          break;
        case 'fence': this._mend(b.seg); break;
        case 'wall':
          b.patch.broken = false;
          b.patch.mesh.visible = true;
          b.patch.rubble.visible = false;
          game.world.colliders.add(b.patch.collider);
          break;
        case 'tower': {
          const t = b.tower;
          t.dead = false;
          for (const c of t.cols) game.world.colliders.add(c);
          const beam = L.beams[b.i];
          if (beam) beam.dead = false;
          const ch = L.chunks.find((c) => c.name === `tower${b.i}`);
          if (ch) { ch.falling = false; for (const m of ch.meshes) { m.matrix.identity(); m.matrixWorldNeedsUpdate = true; } }
          break;
        }
        default: break;
      }
    }
    this.fx.length = 0;
    for (const st of this.stationList ?? []) if (st.allSpots) st.spots = [...st.allSpots];
    for (const bm of this.bombs) bm.mesh.removeFromParent();
    this.bombs.length = 0;
    this.breakoutAt = 0;
  },

  // ------------------------------------------------------------ самодельная бомба
  plantBomb() {
    const game = this.game, p = game.player;
    if (!this.has('bomb')) return;
    this.ui.close();
    this.startAction({ id: 'bomb', label: 'Закладываете бомбу', dur: 3.5, illegal: true, major: true, rate: 0.8, noise: 5, done: () => {
      if (!this.take('bomb')) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), new THREE.MeshBasicMaterial({ color: 0xff3a2a }));
      mesh.position.set(p.position.x, p.position.y + 0.1, p.position.z);
      game.scene.add(mesh);
      this.bombs.push({ x: p.position.x, y: p.position.y + 0.3, z: p.position.z, t: 5, mesh });
      game.hud.toast('БОМБА заложена! Отбегайте — взрыв через 5 секунд', 3.5);
    } });
  },

  _explode(bm) {
    const game = this.game, p = game.player;
    const pos = new THREE.Vector3(bm.x, bm.y, bm.z);
    bm.mesh.removeFromParent();
    game.effects.explosion(pos, 1.4);
    game.audio.explosion?.(pos);
    game.cameraRig.addShake?.(0.5);
    game.chaos.blast(pos, 7, 520, 16, p, { ignore: p });
    const d = Math.hypot(p.position.x - bm.x, p.position.z - bm.z);
    if (d < 4.5 && !p.isDead) {
      const dx = (p.position.x - bm.x) / (d || 1), dz = (p.position.z - bm.z) / (d || 1);
      p.knockDown?.(dx * 6, dz * 6, 3, 1.2);
      p.takeDamage(40 * (1 - d / 4.5), null, dx, dz, 'blast');
    }
    if (this.inCustody) this.startAlarm('Взрыв в тюрьме!', true);
  },

  // ------------------------------------------------------------ звонок братве: подрыв стены снаружи
  callBreakout() {
    const { game } = this;
    if (this.breakoutAt > 0) return { ok: false, msg: 'Братва уже в пути' };
    if (!this.has('phone')) return { ok: false, msg: 'Нужен мобильный телефон (чёрный рынок)' };
    if (!game.wallet.spend(400)) return { ok: false, msg: 'Братва берёт $400 вперёд' };
    this.breakoutAt = this.t + 40;
    game.hud.toast('Братва снаружи: «Через 40 секунд ломаем стену. Будьте у заплатки!»', 5);
    return { ok: true, msg: 'Через 40 секунд стену рванут. Подберитесь к заплатке (светлая кладка)' };
  },

  // ------------------------------------------------------------ побег в тележке
  cartStation() {
    const h = this.hour;
    const hours = h >= 9 && h < 11;
    if (!this.know.has('cart')) return { label: 'Тележка с бельём', run: () => this.game.hud.toast('Просто тележка с бельём. Но куда её увозят?', 2.5) };
    if (!hours) return { label: 'Бельевая тележка (грузовик приезжает с 9:00 до 11:00)', run: null };
    if (this.alert >= 2) return { label: 'Тележка (не сейчас: тревога)', run: null };
    return { label: 'Спрятаться в бельевой тележке', run: () => this.startAction({ id: 'cart', label: 'Прячетесь под бельё', dur: 5, illegal: true, rate: 0.45, noise: 0.5, done: () => this._cartEscape() }) };
  },

  async _cartEscape() {
    if (this.busy) return;
    this.busy = true;
    const { game } = this;
    const chance = 0.8 + (this.bribe > 0 ? 0.2 : 0) + (this.stats.respect > 20 ? 0.05 : 0);
    try {
      if (Math.random() > chance) {
        await this._blackout('Тележку катят к грузовику...', () => {}, 900);
        this.busy = false;
        this.punish('hole', 6, 'Грузчики нашли вас под бельём');
        return;
      }
      await this._blackout('Вас накрыли бельём. Тележку закатили в грузовик, мотор заурчал...', () => {
        const o = this.layout.P(-42, 6);
        game.player.position.set(o.x, game.world.getGroundHeight(o.x, o.z), o.z);
        game.player.velocity.set(0, 0, 0);
        game.cameraRig.initialized = false;
        this._onEscaped('cart');
      }, 1300);
    } finally {
      this.busy = false;
    }
  },

  // ------------------------------------------------------------ каждый кадр
  _wreckTick(dt) {
    const game = this.game;
    // Бомбы.
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bm = this.bombs[i];
      bm.t -= dt;
      bm.mesh.visible = Math.floor(bm.t * 4) % 2 === 0;
      if (bm.t <= 0) { this.bombs.splice(i, 1); this._explode(bm); }
    }
    // Звонок братве.
    if (this.breakoutAt > 0 && this.t >= this.breakoutAt) {
      this.breakoutAt = 0;
      const p = game.player.position;
      let best = null, bd = 1e9;
      for (const b of this.brk) {
        if (b.kind !== 'wall' || b.broken) continue;
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        game.hud.toast('ВЗРЫВ! Братва пробила стену — бегите в пролом!', 4);
        game.effects.explosion(new THREE.Vector3(best.x, 2, best.z), 1.6);
        this._wreckDamage(best, 9999);
      }
    }
    // Анимации.
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const b = this.fx[i];
      if (b.kind === 'door' || b.kind === 'hole') {
        const f = b.fly, m = b.cell.doorMesh;
        f.t += dt;
        m.position.x += f.vx * dt;
        m.position.z += f.vz * dt;
        f.vy -= 14 * dt;
        m.position.y = Math.max(0, m.position.y + f.vy * dt);
        if (m.position.y === 0) { f.vx *= 0.9; f.vz *= 0.9; f.vy = 0; }
        m.rotation.z += f.wz * dt * Math.max(0, 1 - f.t / 1.2);
        if (f.t > 3.5) { m.visible = false; this.fx.splice(i, 1); }
      } else if (b.kind === 'gate') {
        const f = b.fly, gt = b.gate;
        f.t += dt;
        const k = Math.min(1, f.t / 0.9);
        gt.planeL.rotation.z = 0.5 * k;
        gt.planeR.rotation.z = -0.5 * k;
        gt.planeL.position.y = 1.8 - 0.9 * k;
        gt.planeR.position.y = 1.8 - 0.9 * k;
        if (f.t > 2.5) { gt.planeL.visible = gt.planeR.visible = false; this.fx.splice(i, 1); }
      } else if (b.kind === 'tower') {
        this._towerFall(b, dt, i);
      }
    }
  },

  _towerFall(b, dt, idx) {
    const game = this.game, f = b.fall, ch = b.chunk;
    f.t += dt;
    const k = Math.min(1, f.t / 2.6);
    const angle = (k * k) * 1.38;
    if (ch) {
      const [dx, dz] = f.dir;
      const l = Math.hypot(dx, dz) || 1;
      const axis = _v.set(dz / l, 0, -dx / l).clone();
      _t1.makeTranslation(b.x, 0, b.z);
      _r.makeRotationAxis(axis, angle);
      _t2.makeTranslation(-b.x, 0, -b.z);
      _m.copy(_t1).multiply(_r).multiply(_t2);
      for (const m of ch.meshes) {
        m.matrixAutoUpdate = false;
        m.matrix.copy(_m);
        m.matrixWorldNeedsUpdate = true;
      }
    }
    if (!f.dusted && k > 0.97) {
      f.dusted = true;
      game.effects.explosion(_v.set(b.x + f.dir[0] * 7, 1, b.z + f.dir[1] * 7), 1.4);
      game.effects.burst(_v.set(b.x + f.dir[0] * 7, 1, b.z + f.dir[1] * 7), UP, 'debris', 40);
      game.audio.explosion?.(_v);
      game.cameraRig.addShake?.(0.5);
      this.fx.splice(idx, 1);
    }
    // Часовой падает вместе с вышкой (extras скрывает модель).
    void NPC_STATE;
  },
};

export function installWreck(PrisonSystem) {
  Object.defineProperties(PrisonSystem.prototype, Object.getOwnPropertyDescriptors(M));
}
