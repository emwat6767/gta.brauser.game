// Названия мест: при входе в район или к достопримечательности на экране появляется табличка
// (та же, что у территорий банд). Раз в полсекунды проверяем, где игрок.

const DISTRICTS = { downtown: 'Даунтаун', port: 'Порт', suburb: 'Пригород', park: 'Парк', city: null };
const RADIUS = { plaza: 20, arena: 48, showroom: 46, tower: 44 };

export class Places {
  constructor(game) {
    this.game = game;
    this.timer = 1;
    this.current = null;
  }

  update(dt) {
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.5;
    const { world, player, hud } = this.game;
    const p = player.position;
    let name = null, key = null;
    for (const [id, L] of Object.entries(world.landmarks)) {
      if (Math.hypot(L.x - p.x, L.z - p.z) < (RADIUS[id] ?? 30)) { name = L.name; key = id; break; }
    }
    if (!name) {
      const d = world.districtAt(p.x, p.z);
      if (d && DISTRICTS[d]) { name = DISTRICTS[d]; key = d; }
    }
    if (!key || key === this.current) {
      if (!key) this.current = null;
      return;
    }
    this.current = key;
    hud.announce(name, '#f2f2f2');
  }
}
