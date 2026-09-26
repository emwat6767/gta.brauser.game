import * as THREE from 'three';

// Визуальные эффекты. Всё на пулах объектов, несколько draw call на все эффекты:
//   tracer(from, to, tint, life) — след пули / энергетический луч (tint — цвет)
//   muzzle(position, dir)        — вспышка у ствола
//   burst(point, dir, kind, n)   — частицы: 'blood' | 'spark' | 'dust' | 'energy' | 'fire' | 'debris' | 'water'
//   explosion(point, scale)      — взрыв: вспышка, огонь, дым, обломки
//   ring(point, radius)          — ударная волна по земле (расходящееся кольцо)
//   puff(kind, point, vel, scale) — облако: 'fire' | 'smoke' | 'haze' | 'dust' | 'spray' (растёт, всплывает, тает)
//   dustRing(point, radius)      — кольцо пыли (удар о землю)

const MAX_TRACERS = 48;
const MAX_PARTICLES = 500;
const MAX_FLASHES = 8;

const COLORS = {
  blood: [new THREE.Color(0x8a0a0a), new THREE.Color(0xc0141a)],
  spark: [new THREE.Color(0xffd27a), new THREE.Color(0xfff4c2)],
  dust: [new THREE.Color(0x8d877c), new THREE.Color(0xb7b1a5)],
  energy: [new THREE.Color(0x7fd8ff), new THREE.Color(0xe8fbff)],
  fire: [new THREE.Color(0xff5a14), new THREE.Color(0xffc23a)],
  debris: [new THREE.Color(0x3a3a3a), new THREE.Color(0x77716a)],
  water: [new THREE.Color(0x8fc9ff), new THREE.Color(0xe6f4ff)],
};
const SPEED = { spark: 5, blood: 2.2, dust: 1.6, energy: 6, fire: 3.5, debris: 6, water: 4 };
const LIFE = { spark: 0.25, energy: 0.3, fire: 0.45 };
const MAX_RINGS = 6;

// Облака — мягкие круглые спрайты с размером в метрах. Огонь светится (складывается с фоном),
// дым и пыль — обычная прозрачность. Количество ограничено: старые облака переиспользуются.
const PUFF = {
  fire: { c0: 0xffd98a, c1: 0xd2340c, life: [0.45, 0.8], s0: 1.1, s1: 2.4, rise: 2.4, alpha: 0.85, add: true },
  smoke: { c0: 0x1c1a19, c1: 0x57534f, life: [3, 4.5], s0: 1.3, s1: 6.5, rise: 1.8, alpha: 0.72 },
  haze: { c0: 0x8f8a84, c1: 0xb9b5b0, life: [1.6, 2.4], s0: 0.5, s1: 2.2, rise: 1.2, alpha: 0.35 },
  dust: { c0: 0x8c7f6d, c1: 0xa89d8c, life: [1, 1.6], s0: 1.2, s1: 4.4, rise: 0.35, alpha: 0.6 },
  spray: { c0: 0xeef7ff, c1: 0xa8cdea, life: [0.8, 1.2], s0: 0.35, s1: 1.4, rise: -4.5, alpha: 0.6 }, // вода: вверх и вниз
};
// Шейдер облаков пишет цвет в кадр как есть, поэтому храним его без перевода в линейное пространство.
for (const k in PUFF) {
  PUFF[k].c0 = new THREE.Color().setHex(PUFF[k].c0, THREE.LinearSRGBColorSpace);
  PUFF[k].c1 = new THREE.Color().setHex(PUFF[k].c1, THREE.LinearSRGBColorSpace);
}
const PUFF_VS = `
attribute vec3 pcolor;
attribute float psize;
attribute float palpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pcolor;
  vAlpha = palpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PUFF_FS = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = vAlpha * smoothstep(0.5, 0.12, d);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`;

class PuffLayer {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3).fill(-9999);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.scale = new Float32Array(max);
    this.kind = new Array(max).fill(null);
    this.next = 0;
    this.active = 0;
    const g = new THREE.BufferGeometry();
    const attr = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr(this.pos, 3));
    g.setAttribute('pcolor', attr(this.col, 3));
    g.setAttribute('psize', attr(this.size, 1));
    g.setAttribute('palpha', attr(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, vertexShader: PUFF_VS, fragmentShader: PUFF_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  add(kind, point, vel, scale) {
    const K = PUFF[kind];
    const i = this.next;
    this.next = (i + 1) % this.max;
    if (!this.kind[i]) this.active++;
    this.kind[i] = K;
    this.pos[i * 3] = point.x;
    this.pos[i * 3 + 1] = point.y;
    this.pos[i * 3 + 2] = point.z;
    this.vel[i * 3] = vel.x;
    this.vel[i * 3 + 1] = vel.y;
    this.vel[i * 3 + 2] = vel.z;
    this.maxLife[i] = this.life[i] = K.life[0] + Math.random() * (K.life[1] - K.life[0]);
    this.scale[i] = scale * (0.8 + Math.random() * 0.4);
    this.alpha[i] = 0;
  }

  update(dt, uScale) {
    this.material.uniforms.uScale.value = uScale;
    if (!this.active) return;
    const c = new THREE.Color();
    for (let i = 0; i < this.max; i++) {
      const K = this.kind[i];
      if (!K) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kind[i] = null;
        this.active--;
        this.alpha[i] = 0;
        this.pos[i * 3 + 1] = -9999;
        continue;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      const drag = Math.max(0, 1 - 2.2 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + K.rise * 2.2 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const grow = 1 - (1 - t) * (1 - t);
      this.size[i] = (K.s0 + (K.s1 - K.s0) * grow) * this.scale[i];
      this.alpha[i] = K.alpha * (t < 0.12 ? t / 0.12 : Math.pow((1 - t) / 0.88, 1.3));
      c.copy(K.c0).lerp(K.c1, Math.min(1, t * 1.4));
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.pcolor.needsUpdate = a.psize.needsUpdate = a.palpha.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // Трассеры: пары вершин в одном буфере, прозрачность — через цвет (аддитивное смешивание).
    this.tracerPos = new Float32Array(MAX_TRACERS * 6);
    this.tracerCol = new Float32Array(MAX_TRACERS * 6);
    this.tracerLife = new Float32Array(MAX_TRACERS);
    this.tracerMax = new Float32Array(MAX_TRACERS).fill(0.07);
    this.tracerTint = new Float32Array(MAX_TRACERS * 3).fill(1);
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

    // Ударные волны: плоские кольца на земле, расширяются и гаснут.
    const ringGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xfff1c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.visible = false;
      m.userData = { life: 0, radius: 1 };
      this.rings.push(m);
      scene.add(m);
    }
    this.nextRing = 0;
    this.flashMat = flashMat;

    this.smokeLayer = new PuffLayer(scene, 110, false);
    this.fireLayer = new PuffLayer(scene, 70, true);
    this.renderer = null; // main.js: для размера облаков в пикселях
    this.camera = null;

    scene.add(this.tracers, this.particles);
  }

  // Ударная волна радиуса radius (за 0.45 с).
  ring(point, radius = 6, color = 0xfff1c8) {
    const m = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % MAX_RINGS;
    m.position.set(point.x, point.y + 0.08, point.z);
    m.material.color.set(color);
    m.userData.life = 0.45;
    m.userData.radius = radius;
    m.visible = true;
  }

  // Взрыв: большая вспышка, огонь, дым, обломки, ударная волна.
  explosion(point, scale = 1) {
    const f = this.flashes[this.nextFlash];
    this.nextFlash = (this.nextFlash + 1) % MAX_FLASHES;
    this.scene.add(f);
    f.position.copy(point);
    f.rotation.set(Math.random(), Math.random(), Math.random());
    f.scale.setScalar(9 * scale);
    f.visible = true;
    f.userData.life = 0.18;
    const up = { x: 0, y: 1, z: 0 };
    this.burst(point, up, 'fire', Math.round(40 * scale));
    this.burst(point, up, 'dust', Math.round(30 * scale));
    this.burst(point, up, 'debris', Math.round(16 * scale));
    this.ring(point, 7 * scale, 0xffc27a);
    // Огненный шар и столб дыма.
    const v = { x: 0, y: 0, z: 0 };
    const p = { x: 0, y: 0, z: 0 };
    for (let n = Math.round(9 * scale); n > 0; n--) {
      const a = Math.random() * Math.PI * 2, r = Math.random();
      p.x = point.x + Math.cos(a) * r * scale;
      p.y = point.y + 0.4 + Math.random() * scale;
      p.z = point.z + Math.sin(a) * r * scale;
      v.x = Math.cos(a) * (2 + Math.random() * 4) * scale;
      v.y = (1.5 + Math.random() * 3) * scale;
      v.z = Math.sin(a) * (2 + Math.random() * 4) * scale;
      this.puff('fire', p, v, 1.3 * scale);
    }
    for (let n = Math.round(7 * scale); n > 0; n--) {
      const a = Math.random() * Math.PI * 2;
      p.x = point.x + Math.cos(a) * scale;
      p.y = point.y + 1 + Math.random() * scale;
      p.z = point.z + Math.sin(a) * scale;
      v.x = Math.cos(a) * (0.8 + Math.random() * 1.5);
      v.y = 2 + Math.random() * 2.5;
      v.z = Math.sin(a) * (0.8 + Math.random() * 1.5);
      this.puff('smoke', p, v, scale);
    }
  }

  puff(kind, point, vel = { x: 0, y: 0, z: 0 }, scale = 1) {
    (PUFF[kind].add ? this.fireLayer : this.smokeLayer).add(kind, point, vel, scale);
  }

  dustRing(point, radius = 5) {
    const n = Math.min(14, Math.round(radius * 2));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.3;
      this.puff('dust', { x: point.x + Math.cos(a) * 0.8, y: point.y + 0.4, z: point.z + Math.sin(a) * 0.8 },
        { x: Math.cos(a) * radius * 1.4, y: 0.4, z: Math.sin(a) * radius * 1.4 }, 0.7 + radius * 0.06);
    }
  }

  tracer(from, to, tint = null, life = 0.07) {
    const i = this.nextTracer;
    this.nextTracer = (i + 1) % MAX_TRACERS;
    // Рисуем не всю траекторию, а "штрих" длиной до 6 м ближе к цели — так читается как пуля.
    // Луч (tint задан) — целиком.
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const k = tint ? 0 : Math.max(0, 1 - 6 / len);
    this.tracerPos.set([from.x + dx * k * 0.3, from.y + dy * k * 0.3, from.z + dz * k * 0.3, to.x, to.y, to.z], i * 6);
    this.tracerLife[i] = life;
    this.tracerMax[i] = life;
    this.tracerTint.set(tint ? [tint.r, tint.g, tint.b] : [1, 1, 1], i * 3);
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
    const speed = SPEED[kind] ?? 1.6;
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
      this.pLife[i] = LIFE[kind] ?? 0.5 + Math.random() * 0.3;
    }
  }

  update(dt) {
    let anyTracer = false;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tracerLife[i] <= 0) continue;
      this.tracerLife[i] -= dt;
      const a = Math.max(0, this.tracerLife[i] / this.tracerMax[i]);
      const tr = this.tracerTint[i * 3], tg = this.tracerTint[i * 3 + 1], tb = this.tracerTint[i * 3 + 2];
      this.tracerCol.set([0.35 * a * tr, 0.3 * a * tg, 0.18 * a * tb + (tb > tr ? 0.4 * a : 0), 1 * a * tr, 0.9 * a * tg, 0.6 * a * tb + (tb > tr ? 0.4 * a : 0)], i * 6);
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

    // Размер облака: psize (м) * uScale / расстояние = пиксели.
    const uScale = this.renderer && this.camera
      ? (this.renderer.getContext().drawingBufferHeight * this.camera.projectionMatrix.elements[5]) / 2 : 400;
    this.smokeLayer.update(dt, uScale);
    this.fireLayer.update(dt, uScale);

    for (const m of this.flashes) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      if (m.userData.life <= 0) m.visible = false;
    }
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life -= dt;
      if (u.life <= 0) {
        m.visible = false;
        continue;
      }
      const k = 1 - u.life / 0.45;
      m.scale.setScalar(0.5 + u.radius * k);
      m.material.opacity = 0.8 * (1 - k);
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
