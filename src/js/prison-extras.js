import { Humanoid } from './humanoid.js';
import { civilianLook } from './outfits.js';
import { presentation } from './names.js';
import { createRng, dampAngle } from './utils.js';
import { jumpsuitLook, guardUniformLook } from './prison-crew.js';

// Статисты тюрьмы без ИИ: часовые в кабинах вышек (поворачиваются за игроком), посетители в комнате свиданий и на подъезде
// в приёмные часы. Это просто модели людей (Humanoid), которые появляются, когда игрок рядом, и убираются, когда далеко.

const SHOW_R = 170;
const HIDE_R = 240;
const ANIM_R = 70;
const FAR_R = 150;
const VISIT = [12.5, 16.5];
const DAY = [9, 17.5];

export class PrisonExtras {
  constructor(prison) {
    this.prison = prison;
    this.game = prison.game;
    this.L = prison.layout;
    this.rng = createRng(31337);
    this.t = 0;
    this.on = false;
    this.defs = this._makeDefs();
  }

  _look(kind) {
    const rng = this.rng;
    let look = civilianLook(rng, {});
    if (kind !== 'visitorF') for (let k = 0; k < 10 && presentation(look) === 'f'; k++) look = civilianLook(rng, {});
    if (kind === 'inmate') return jumpsuitLook({ ...look, bulk: Math.max(look.bulk ?? 1, rng.range(0.98, 1.12)) }, rng.int(0, 2) === 2 ? 1 : 0);
    if (kind === 'guard') return guardUniformLook(rng);
    return look;
  }

  _makeDefs() {
    const L = this.L;
    const defs = [];
    const FLOOR = 0.18;
    // Часовые: центр кабины чуть смещён к двери, взгляд — наружу, с поворотами по сторонам.
    L.towers.forEach((t, i) => {
      defs.push({
        id: `tower${i}`, tower: t, look: this._look('guard'), local: [t.x - t.sx * 0.8, t.z - t.sz * 0.2], y: 8.8, heading: Math.atan2(t.sx, t.sz),
        pose: 'normal', weapon: 'shotgun', scan: { amp: 1.1, speed: 0.33, phase: i * 1.7 }, watch: 55,
      });
    });
    // Свидания: заключённые у стекла (x 11.7) и посетители с другой стороны (x 17.3) — с трубками у уха.
    [0, 1, 3].forEach((k, n) => {
      const z = 22.5 + k * 2.2;
      defs.push({ id: `vin${k}`, look: this._look('inmate'), local: [11.7, z], y: FLOOR, heading: Math.PI / 2, pose: 'sit', sitHeight: 0.47, gesture: n % 2 ? 'talk' : 'phone', hours: VISIT });
      defs.push({ id: `vvis${k}`, look: this._look(n === 1 ? 'visitorF' : 'visitor'), local: [17.3, z], y: FLOOR, heading: -Math.PI / 2, pose: 'sit', sitHeight: 0.47, gesture: n % 2 ? 'phone' : 'talk', hours: VISIT });
    });
    // Подъезд: двое у знака «Посетители», двое на скамьях.
    defs.push({ id: 'out1', look: this._look('visitorF'), local: [10.4, 40.4], y: 0.15, heading: -2.4, pose: 'normal', gesture: 'talk', hours: DAY });
    defs.push({ id: 'out2', look: this._look('visitor'), local: [12.6, 40.5], y: 0.15, heading: 2.5, pose: 'normal', gesture: 'talk', hours: DAY });
    defs.push({ id: 'out3', look: this._look('visitor'), local: [15.5, 41.5], y: 0.15, heading: 0, pose: 'sit', sitHeight: 0.47, gesture: null, hours: DAY });
    defs.push({ id: 'out4', look: this._look('visitorF'), local: [-17.5, 41.5], y: 0.15, heading: 0.3, pose: 'sit', sitHeight: 0.47, gesture: 'phone', hours: DAY });
    return defs;
  }

  _spawn(d) {
    const m = new Humanoid(d.look);
    if (d.weapon) m.setWeapon(d.weapon);
    this.game.scene.add(m.root);
    d.model = m;
    const [wx, wz] = this.L.toWorld(d.local[0], d.local[1]);
    d.pos = { x: wx, z: wz };
    d.h = this.L.headingW(d.heading);
    m.root.position.set(wx, d.y, wz);
    m.root.rotation.y = d.h;
  }

  _remove(d) {
    if (!d.model) return;
    this.game.scene.remove(d.model.root);
    d.model.dispose?.();
    d.model = null;
  }

  update(dt) {
    const game = this.game;
    const p = game.player.position, c = this.L.center;
    const dist = Math.hypot(p.x - c.x, p.z - c.z);
    const near = this.on ? dist < HIDE_R : dist < SHOW_R;
    if (near !== this.on) {
      this.on = near;
      if (!near) { for (const d of this.defs) this._remove(d); return; }
    }
    if (!this.on) return;
    this.t += dt;
    const h = game.daynight.hour;
    const cam = game.camera.position;
    let made = 0;
    for (const d of this.defs) {
      const active = (!d.hours || (h >= d.hours[0] && h < d.hours[1])) && !d.tower?.dead;
      if (active && !d.model && made < 2) { this._spawn(d); made++; }
      else if (!active && d.model) this._remove(d);
      if (!d.model) continue;
      const dc = Math.hypot(d.pos.x - cam.x, d.pos.z - cam.z);
      const m = d.model;
      m.root.visible = dc < FAR_R;
      if (dc > ANIM_R) continue;
      // Часовой следит за игроком, если тот рядом; иначе осматривает территорию.
      if (d.scan) {
        const dx = p.x - d.pos.x, dz = p.z - d.pos.z;
        const target = Math.hypot(dx, dz) < d.watch ? Math.atan2(dx, dz) : this.L.headingW(d.heading) + Math.sin(this.t * d.scan.speed + d.scan.phase) * d.scan.amp;
        d.h = dampAngle(d.h, target, 2.2, dt);
      }
      m.root.rotation.y = d.h;
      m.animate(dt, { pose: d.pose, sitHeight: d.sitHeight ?? 0.5, gesture: d.gesture ?? null, speed: 0 });
    }
  }
}
