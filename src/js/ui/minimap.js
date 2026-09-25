import { damp } from '../utils.js';

// Круглая миникарта в стиле GTA: вращается вместе с камерой, в машине отдаляется.
// Статичная карта города рисуется один раз во внеэкранный canvas (1 px ≈ 1 м),
// каждый кадр — только кусок вокруг игрока + метки.
//
// Добавить новый тип меток: допишите цикл в _drawBlips() (например, маркер задания) —
// функция toScreen() переводит мир в пиксели миникарты.

const COLORS = {
  background: '#3f5236',
  road: '#8b9097',
  sidewalk: '#b3afa6',
  lot: '#6c6a66',
  park: '#5d8f4a',
  building: '#434a54',
  buildingEdge: '#2f343b',
  tree: '#2f5a2a',
  barrier: '#9d9a93',
};

export class Minimap {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.radiusMeters = 110;      // видимый радиус, м
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.map = this._renderStatic();
  }

  // Размер берётся из CSS (на телефоне миникарта меньше).
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = this.canvas.clientWidth || 200;
    this.dpr = dpr * (this.size / 200); // метки и шрифт масштабируются вместе с картой
    this.canvas.width = Math.round(this.size * dpr);
    this.canvas.height = Math.round(this.size * dpr);
  }

  _renderStatic() {
    const world = this.game.world;
    const S = world.size;
    const px = 2048 / S; // пикселей на метр
    const c = document.createElement('canvas');
    c.width = c.height = 2048;
    const ctx = c.getContext('2d');
    ctx.scale(px, px);
    ctx.translate(world.half, world.half); // теперь рисуем в мировых координатах (x, z)

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(-world.half, -world.half, S, S);

    ctx.fillStyle = COLORS.road;
    const rw = world.roadHalf * 2;
    for (const c0 of world.roadLines) {
      ctx.fillRect(-world.half, c0 - world.roadHalf, S, rw);
      ctx.fillRect(c0 - world.roadHalf, -world.half, rw, S);
    }

    for (const b of world.blocks) {
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
      ctx.fillStyle = b.type === 'park' ? COLORS.park : COLORS.lot;
      ctx.fillRect(b.lot.minX, b.lot.minZ, b.lot.maxX - b.lot.minX, b.lot.maxZ - b.lot.minZ);
    }

    ctx.fillStyle = COLORS.tree;
    for (const t of world.trees) {
      ctx.beginPath();
      ctx.arc(t.x, t.z, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = COLORS.buildingEdge;
    ctx.fillStyle = COLORS.building;
    for (const b of world.buildings) {
      ctx.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
      ctx.strokeRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    }

    ctx.strokeStyle = COLORS.barrier;
    ctx.lineWidth = 2;
    ctx.strokeRect(-world.half + 1, -world.half + 1, S - 2, S - 2);
    return c;
  }

  update(dt) {
    const { player, cameraRig, world } = this.game;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const R = W / 2;

    const speed = player.vehicle ? Math.abs(player.vehicle.speed) : 0;
    this.radiusMeters = damp(this.radiusMeters, 110 + Math.min(speed * 3.5, 130), 2, dt);
    const scale = R / this.radiusMeters;       // пикселей на метр
    const rot = cameraRig.yaw + Math.PI;       // вперёд камеры = вверх карты
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const cx = player.position.x, cz = player.position.z;

    // Мир -> пиксели миникарты (с учётом поворота).
    this.toScreen = (x, z) => {
      const dx = x - cx, dz = z - cz;
      return [R + (dx * cos - dz * sin) * scale, R + (dx * sin + dz * cos) * scale];
    };

    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(R, R, R - 2 * this.dpr, 0, Math.PI * 2);
    ctx.clip();

    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cz);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(cx - this.radiusMeters * 1.5, cz - this.radiusMeters * 1.5, this.radiusMeters * 3, this.radiusMeters * 3);
    ctx.drawImage(this.map, -world.half, -world.half, world.size, world.size);
    // Территории банд — полупрозрачные кварталы цвета банды.
    for (const gang of this.game.gangs?.gangs ?? []) {
      ctx.fillStyle = gang.color;
      ctx.globalAlpha = 0.38;
      for (const b of gang.blocks) ctx.fillRect(b.x0 + 3, b.z0 + 3, b.x1 - b.x0 - 6, b.z1 - b.z0 - 6);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this._drawBlips(R);
    ctx.restore();

    // Рамка и "N" (север = -Z).
    ctx.lineWidth = 3 * this.dpr;
    ctx.strokeStyle = 'rgba(10,10,10,0.85)';
    ctx.beginPath();
    ctx.arc(R, R, R - 2 * this.dpr, 0, Math.PI * 2);
    ctx.stroke();
    const [nx, ny] = this.toScreen(cx, cz - 1e4);
    const a = Math.atan2(ny - R, nx - R);
    const nr = R - 13 * this.dpr;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.arc(R + Math.cos(a) * nr, R + Math.sin(a) * nr, 9 * this.dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${11 * this.dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', R + Math.cos(a) * nr, R + Math.sin(a) * nr + 0.5);
  }

  _drawBlips(R) {
    const { player, vehicles, npcs } = this.game;
    const ctx = this.ctx;
    const d = this.dpr;

    const flash = Math.floor(performance.now() / 250) % 2 === 0;

    // Оружие на земле — цветные ромбики.
    for (const it of this.game.pickups?.items ?? []) {
      if (!it.active) continue;
      const [x, y] = this.toScreen(it.x, it.z);
      if ((x - R) ** 2 + (y - R) ** 2 > R * R) continue;
      const s = 4 * d;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(x, y - s - d); ctx.lineTo(x + s + d, y); ctx.lineTo(x, y + s + d); ctx.lineTo(x - s - d, y);
      ctx.fill();
      ctx.fillStyle = '#' + it.ring.material.color.getHexString();
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
      ctx.fill();
    }
    const gangColor = (id) => this.game.gangs?.byId.get(id)?.color ?? '#ffe27a';

    // NPC: прохожие — светлые точки, бандиты — цвет банды, полиция мигает, погибшие — серые.
    for (const npc of npcs.list) {
      if (npc.vehicle) continue;
      const [x, y] = this.toScreen(npc.position.x, npc.position.z);
      if ((x - R) ** 2 + (y - R) ** 2 > R * R) continue;
      let color = '#f3e6b0', r = 2.6;
      if (npc.isDead) color = '#7a7a7a';
      else if (npc.role === 'gang') { color = gangColor(npc.gang); r = 3.2; }
      else if (npc.role === 'police') { color = flash ? '#3d7cff' : '#ff3b3b'; r = 3.4; }
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(x, y, (r + 1) * d, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r * d, 0, Math.PI * 2);
      ctx.fill();
    }

    // Машины: полиция мигает, трафик — мелкие серые, свободные — синие (далёкие прижаты к краю).
    for (const v of vehicles) {
      if (v === player.vehicle) continue;
      let [x, y] = this.toScreen(v.position.x, v.position.z);
      const dx = x - R, dy = y - R;
      const dist = Math.hypot(dx, dy);
      const edge = R - 10 * d;
      const traffic = !!v.ai && !v.police;
      if (traffic && dist > edge) continue;
      let s = (traffic ? 3.5 : 5) * d;
      if (dist > edge) {
        x = R + (dx / dist) * edge;
        y = R + (dy / dist) * edge;
        s = 3.5 * d;
      }
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(x - s - d, y - s - d, (s + d) * 2, (s + d) * 2);
      ctx.fillStyle = v.police && v.sirenOn ? (flash ? '#ff3b3b' : '#3d7cff') : traffic ? '#a9b0b8' : '#4aa3ff';
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
    }

    // Игрок — стрелка по направлению взгляда персонажа/машины.
    const h = player.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = -fz, rz = fx;
    const p = player.position;
    const pt = (f, r) => this.toScreen(p.x + fx * f + rx * r, p.z + fz * f + rz * r);
    const m = (9 * d * this.radiusMeters) / R; // ~9 px независимо от зума
    const tip = pt(m, 0), left = pt(-m * 0.7, -m * 0.7), back = pt(-m * 0.35, 0), right = pt(-m * 0.7, m * 0.7);
    ctx.beginPath();
    ctx.moveTo(...tip);
    ctx.lineTo(...left);
    ctx.lineTo(...back);
    ctx.lineTo(...right);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2 * d;
    ctx.stroke();
    ctx.fill();
  }
}
