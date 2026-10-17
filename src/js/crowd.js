import * as THREE from 'three';
import { mergeColored } from './geometry.js';

// Упрощённые фигуры людей вдали (LOD). Полная модель человека — 12 мешей и анимация
// суставов; дальше CONFIG.npc.lodDistance её не отличить, поэтому NPC вдали рисуются
// тремя InstancedMesh на всех сразу (брюки, одежда, кожа — цвет у каждого свой)
// и не анимируются (только лёгкое покачивание при ходьбе). NPC помечается npc.lod,
// его настоящая модель при этом скрыта (npcs.update, model.body.visible = false).

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _c = new THREE.Color();

function parts() {
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  return {
    pants: mergeColored([
      { geometry: box(0.13, 0.9, 0.15, 0.1, 0.47, 0), color: '#ffffff' },
      { geometry: box(0.13, 0.9, 0.15, -0.1, 0.47, 0), color: '#ffffff' },
      { geometry: box(0.34, 0.2, 0.22, 0, 0.95, 0), color: '#ffffff' },
    ]),
    shirt: mergeColored([
      { geometry: new THREE.CapsuleGeometry(0.18, 0.3, 3, 8).scale(1.05, 1, 0.72).translate(0, 1.26, 0), color: '#ffffff' },
      { geometry: box(0.1, 0.55, 0.11, 0.26, 1.2, 0), color: '#ffffff' },
      { geometry: box(0.1, 0.55, 0.11, -0.26, 1.2, 0), color: '#ffffff' },
    ]),
    skin: mergeColored([
      { geometry: new THREE.SphereGeometry(0.12, 10, 8).scale(1, 1.1, 1).translate(0, 1.69, 0), color: '#ffffff' },
      { geometry: box(0.09, 0.14, 0.09, 0, 1.57, 0), color: '#ffffff' },
    ]),
  };
}

export class CrowdRenderer {
  constructor(scene, max = 220) {
    const P = parts();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.meshes = ['pants', 'shirt', 'skin'].map((k) => {
      const m = new THREE.InstancedMesh(P[k], mat, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _c.set(0xffffff)); // создаёт instanceColor
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      scene.add(m);
      return m;
    });
    this.max = max;
    this.time = 0;
  }

  update(dt, npcs) {
    this.time += dt;
    let i = 0;
    for (const n of npcs) {
      if (!n.lod || !n.model.root.visible || n.vehicle || n.ragdoll) continue;
      if (i >= this.max) break;
      const L = n.model.look;
      n._crowdCol ??= [new THREE.Color(L.pants), new THREE.Color(L.shirt), new THREE.Color(L.skin)];
      const walking = n.speed > 0.3;
      const bob = walking ? Math.abs(Math.sin(this.time * (5 + n.speed * 1.4) + n.walkSpeed * 10)) * 0.05 : 0;
      const lying = n.isDown ? Math.min(1, n.fall) : 0;
      _e.set(-Math.PI / 2 * lying, n.heading, 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(n.position.x, n.visualY + bob + lying * 0.15, n.position.z);
      _s.setScalar(L.scale ?? 1);
      _m.compose(_p, _q, _s);
      for (let k = 0; k < 3; k++) {
        this.meshes[k].setMatrixAt(i, _m);
        this.meshes[k].setColorAt(i, n._crowdCol[k]);
      }
      i++;
    }
    for (const m of this.meshes) {
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
