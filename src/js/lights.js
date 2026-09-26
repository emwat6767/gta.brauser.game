import * as THREE from 'three';

// Светофоры на перекрёстках. У каждого перекрёстка свой сдвиг фазы, поэтому "зелёная
// волна" по всему городу не идёт одновременно. Цикл: по оси X зелёный → жёлтый → красный,
// по оси Z — наоборот (с коротким "все красные" между ними).
// ИИ-водители (traffic.js) спрашивают state(node, axis) и тормозят у стоп-линии.
// Рисуется столбами на углах перекрёстка (InstancedMesh), у каждого столба два фонаря:
// для движения вдоль X и вдоль Z; цвет фонаря меняется через instanceColor.

const CYCLE = 26;
const COLORS = { green: new THREE.Color(0x35ff6a), yellow: new THREE.Color(0xffc21a), red: new THREE.Color(0xff2a1a) };

export class TrafficLights {
  constructor(game) {
    const world = game.world;
    this.world = world;
    this.time = 0;
    const L = world.roadLines;
    this.n = L.length;
    // Сдвиг фазы — детерминированный "шум" по координатам перекрёстка.
    this.offsets = [];
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) this.offsets[i * this.n + j] = ((i * 7.13 + j * 3.71) % 1) * CYCLE;
    }

    // Столбы на углах, где есть тротуар (квартал рядом).
    const corners = [];
    const c = world.roadHalf + 0.9;
    const isBlock = (x, z) => !!world.blockAt(x, z);
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        const x = L[i], z = L[j];
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (isBlock(x + sx * (c + 3), z + sz * (c + 3))) corners.push({ node: i * this.n + j, x: x + sx * c, z: z + sz * c, sx, sz });
        }
      }
    }
    const pole = new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6).translate(0, 1.6, 0);
    const head = new THREE.BoxGeometry(0.34, 0.5, 0.34).translate(0, 3.25, 0);
    const lamp = new THREE.CircleGeometry(0.13, 10);
    const metal = new THREE.MeshStandardMaterial({ color: 0x2d3136, roughness: 0.6, metalness: 0.4 });
    this.poles = new THREE.InstancedMesh(pole, metal, corners.length);
    this.heads = new THREE.InstancedMesh(head, metal, corners.length);
    this.lampMesh = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), corners.length * 2);
    const m = new THREE.Object3D();
    this.lamps = [];
    corners.forEach((k, idx) => {
      m.position.set(k.x, world.curbHeight, k.z);
      m.rotation.set(0, 0, 0);
      m.updateMatrix();
      this.poles.setMatrixAt(idx, m.matrix);
      this.heads.setMatrixAt(idx, m.matrix);
      // Фонарь для оси X — на грани, смотрящей вдоль X (виден машинам, едущим по X), и для оси Z.
      for (const axis of ['x', 'z']) {
        m.position.set(k.x + (axis === 'x' ? -k.sx * 0.18 : 0), world.curbHeight + 3.3, k.z + (axis === 'z' ? -k.sz * 0.18 : 0));
        m.rotation.set(0, axis === 'x' ? Math.PI / 2 : 0, 0);
        m.updateMatrix();
        const li = this.lamps.length;
        this.lampMesh.setMatrixAt(li, m.matrix);
        this.lampMesh.setColorAt(li, COLORS.red);
        this.lamps.push({ node: k.node, axis, x: k.x, z: k.z, state: null });
      }
    });
    for (const mesh of [this.poles, this.heads]) {
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
    }
    this.lampMesh.computeBoundingSphere();
    world.group.add(this.poles, this.heads, this.lampMesh);
    this._timer = 0;
  }

  // Узел перекрёстка по индексам улиц [i, j].
  nodeIndex([i, j]) {
    return i * this.n + j;
  }

  // Сигнал для движения вдоль оси axis ('x' | 'z') на перекрёстке node (индекс).
  state(node, axis) {
    const t = (this.time + this.offsets[node]) % CYCLE;
    if (axis === 'x') return t < 10.5 ? 'green' : t < 13 ? 'yellow' : 'red';
    return t < 13.5 ? 'red' : t < 23.5 ? 'green' : t < 26 ? 'yellow' : 'red';
  }

  update(dt, player) {
    this.time += dt;
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.25;
    let changed = false;
    const px = player.position.x, pz = player.position.z;
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      if (Math.abs(l.x - px) > 260 || Math.abs(l.z - pz) > 260) continue;
      const s = this.state(l.node, l.axis);
      if (s === l.state) continue;
      l.state = s;
      this.lampMesh.setColorAt(i, COLORS[s]);
      changed = true;
    }
    if (changed) this.lampMesh.instanceColor.needsUpdate = true;
  }
}
