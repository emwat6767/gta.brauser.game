import * as THREE from 'three';
import { lineOfSight } from '../ballistics.js';
import { fighterTag } from '../fighters.js';

// Именные таблички над бойцами из ростера: имя, прозвище, страна, стиль и статус (чемпион, легенда...).
// Показываем только ближайших видимых (не дальше SHOW_DISTANCE, не за стеной), не больше MAX штук:
// иначе экран превращается в лес подписей.

const SHOW_DISTANCE = 24;
const MAX = 6;
const _v = new THREE.Vector3(), _eye = new THREE.Vector3();

export class Nameplates {
  constructor(game) {
    this.game = game;
    this.layer = document.createElement('div');
    this.layer.id = 'nameplates';
    document.getElementById('hud')?.appendChild(this.layer);
    this.slots = [];
    this.losTimer = 0;
    this.visible = new Map(); // npc -> видит ли камера (обновляется раз в 0.25 с)
  }

  _slot(i) {
    let s = this.slots[i];
    if (!s) {
      const el = document.createElement('div');
      el.className = 'nameplate';
      el.innerHTML = '<b></b><small></small>';
      this.layer.appendChild(el);
      s = this.slots[i] = { el, name: el.firstChild, sub: el.lastChild, npc: null };
    }
    return s;
  }

  update(dt) {
    const { game } = this;
    const cam = game.camera;
    const p = game.player.position;
    const list = [];
    for (const n of game.npcs.list) {
      if (!n.fighter || n.isDead || n.vehicle || !n.model.root.visible) continue;
      const d2 = (n.position.x - p.x) ** 2 + (n.position.z - p.z) ** 2;
      if (d2 < SHOW_DISTANCE * SHOW_DISTANCE) list.push([d2, n]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const refreshLos = (this.losTimer -= dt) <= 0;
    if (refreshLos) this.losTimer = 0.25;
    const w = window.innerWidth, h = window.innerHeight;
    let used = 0;
    for (const [d2, n] of list) {
      if (used >= MAX) break;
      const head = n.visualY + 1.95 * (n.model.look.scale ?? 1);
      _v.set(n.position.x, head + 0.25, n.position.z).project(cam);
      if (_v.z >= 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) continue;
      if (refreshLos || !this.visible.has(n)) {
        _eye.set(n.position.x, head - 0.3, n.position.z);
        this.visible.set(n, lineOfSight(game, cam.position, _eye));
      }
      if (!this.visible.get(n)) continue;
      const s = this._slot(used++);
      if (s.npc !== n) {
        s.npc = n;
        const tag = fighterTag(n.fighter);
        s.name.textContent = tag.title;
        s.sub.textContent = tag.sub;
        s.el.classList.toggle('gold', tag.gold);
      }
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      s.el.style.display = 'block';
      s.el.style.opacity = String(Math.min(1, (SHOW_DISTANCE - Math.sqrt(d2)) / 8));
      s.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    }
    for (let i = used; i < this.slots.length; i++) {
      this.slots[i].el.style.display = 'none';
      this.slots[i].npc = null;
    }
    if (this.visible.size > 80) this.visible.clear();
  }
}
