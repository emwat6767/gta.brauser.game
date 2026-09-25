import * as THREE from 'three';

// Визуальные эффекты стрельбы. Всё на пулах объектов, 3 draw call на все эффекты:
//   tracer(from, to)            — след пули (короткая яркая линия)
//   muzzle(position, dir)       — вспышка у ствола
//   burst(point, dir, kind, n)  — частицы: 'blood' | 'spark' | 'dust'

const MAX_TRACERS = 48;
const MAX_PARTICLES = 500;
const MAX_FLASHES = 8;

const COLORS = {
  blood: [new THREE.Color(0x8a0a0a), new THREE.Color(0xc0141a)],
  spark: [new THREE.Color(0xffd27a), new THREE.Color(0xfff4c2)],
  dust: [new THREE.Color(0x8d877c), new THREE.Color(0xb7b1a5)],
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // Трассеры: пары вершин в одном буфере, прозрачность — через цвет (аддитивное смешивание).
    this.tracerPos = new Float32Array(MAX_TRACERS * 6);
    this.tracerCol = new Float32Array(MAX_TRACERS * 6);
    this.tracerLife = new Float32Array(MAX_TRACERS);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.tracers.frustumCulled = false;
    this.nextTracer = 0;

    // Частицы.
    this.pPos = new Float32Array(MAX_PARTICLES * 3).fill(-9999);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false,
    }));
    this.particles.frustumCulled = false;
    this.nextParticle = 0;

    // Вспышки у ствола: две скрещённые плоскости, аддитивно.
    const fg = new THREE.PlaneGeometry(0.34, 0.34);
    const fg2 = fg.clone().rotateY(Math.PI / 2);
    const flashGeo = new THREE.BufferGeometry();
    flashGeo.setAttribute('position', new THREE.Float32BufferAttribute([...fg.attributes.position.array, ...fg2.attributes.position.array], 3));
    flashGeo.setAttribute('uv', new THREE.Float32BufferAttribute([...fg.attributes.uv.array, ...fg2.attributes.uv.array], 2));
    flashGeo.setIndex([...fg.index.array, ...fg2.index.array.map((i) => i + 4)]);
    const flashMat = new THREE.MeshBasicMaterial({
      map: flashTexture(), color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this.flashes = [];
    for (let i = 0; i < MAX_FLASHES; i++) {
      const m = new THREE.Mesh(flashGeo, flashMat);
      m.visible = false;
      m.userData.life = 0;
      this.flashes.push(m);
      scene.add(m);
    }
    this.nextFlash = 0;

    scene.add(this.tracers, this.particles);
  }

  tracer(from, to) {
    const i = this.nextTracer;
    this.nextTracer = (i + 1) % MAX_TRACERS;
    // Рисуем не всю траекторию, а "штрих" длиной до 6 м ближе к цели — так читается как пуля.
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const k = Math.max(0, 1 - 6 / len);
    this.tracerPos.set([from.x + dx * k * 0.3, from.y + dy * k * 0.3, from.z + dz * k * 0.3, to.x, to.y, to.z], i * 6);
    this.tracerLife[i] = 0.07;
  }

  // Вспышка у ствола. Если передано оружие (weaponMesh), вспышка крепится к нему и
  // двигается вместе со стволом при отдаче; иначе ставится в мировую точку.
  muzzle(position, dir, weaponMesh = null) {
    const m = this.flashes[this.nextFlash];
    this.nextFlash = (this.nextFlash + 1) % MAX_FLASHES;
    if (weaponMesh) {
      weaponMesh.add(m);
      m.position.copy(weaponMesh.userData.muzzle);
      m.position.z += 0.08;
      m.rotation.set(0, 0, Math.random() * Math.PI);
    } else {
      this.scene.add(m);
      m.position.copy(position).addScaledVector(dir, 0.08);
      m.lookAt(position.x + dir.x, position.y + dir.y, position.z + dir.z);
      m.rotateZ(Math.random() * Math.PI);
    }
    m.scale.setScalar(0.8 + Math.random() * 0.5);
    m.visible = true;
    m.userData.life = 0.05;
  }

  burst(point, dir, kind = 'dust', count = 8) {
    const [c0, c1] = COLORS[kind];
    const speed = kind === 'spark' ? 5 : kind === 'blood' ? 2.2 : 1.6;
    for (let n = 0; n < count; n++) {
      const i = this.nextParticle;
      this.nextParticle = (i + 1) % MAX_PARTICLES;
      this.pPos[i * 3] = point.x;
      this.pPos[i * 3 + 1] = point.y;
      this.pPos[i * 3 + 2] = point.z;
      this.pVel[i * 3] = (dir.x + (Math.random() - 0.5) * 1.4) * speed;
      this.pVel[i * 3 + 1] = (dir.y + Math.random() * 0.9) * speed;
      this.pVel[i * 3 + 2] = (dir.z + (Math.random() - 0.5) * 1.4) * speed;
      const t = Math.random();
      this.pCol[i * 3] = c0.r + (c1.r - c0.r) * t;
      this.pCol[i * 3 + 1] = c0.g + (c1.g - c0.g) * t;
      this.pCol[i * 3 + 2] = c0.b + (c1.b - c0.b) * t;
      this.pLife[i] = kind === 'spark' ? 0.25 : 0.5 + Math.random() * 0.3;
    }
  }

  update(dt) {
    let anyTracer = false;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tracerLife[i] <= 0) continue;
      this.tracerLife[i] -= dt;
      const a = Math.max(0, this.tracerLife[i] / 0.07);
      this.tracerCol.set([0.35 * a, 0.3 * a, 0.18 * a, 1 * a, 0.9 * a, 0.6 * a], i * 6);
      if (this.tracerLife[i] <= 0) this.tracerPos.fill(0, i * 6, i * 6 + 6);
      anyTracer = true;
    }
    if (anyTracer) {
      this.tracers.geometry.attributes.position.needsUpdate = true;
      this.tracers.geometry.attributes.color.needsUpdate = true;
    }

    let anyParticle = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      anyParticle = true;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        this.pPos[i * 3 + 1] = -9999;
        continue;
      }
      this.pVel[i * 3 + 1] -= 9.8 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
    }
    if (anyParticle) {
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.geometry.attributes.color.needsUpdate = true;
    }

    for (const m of this.flashes) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      if (m.userData.life <= 0) m.visible = false;
    }
  }
}

// Текстура вспышки: звезда с мягким центром (canvas).
function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.3, 'rgba(255,200,90,0.9)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const r = k % 2 ? 12 : 31;
    ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
