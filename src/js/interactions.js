import { CONFIG } from './config.js';
import { separateCircles } from './collision.js';

// Столкновения между подвижными объектами (мир обрабатывает каждый сам):
//   машина <-> машина, машина <-> игрок, машина <-> NPC, игрок <-> NPC, NPC <-> NPC.
// Вызывается после update() всех сущностей на каждом шаге симуляции.

export function resolveInteractions(game) {
  const { player, vehicles } = game;
  const npcs = game.npcs.list;

  for (const v of vehicles) v.updateCircles();

  // --- Машина <-> машина ---
  for (let a = 0; a < vehicles.length; a++) {
    for (let b = a + 1; b < vehicles.length; b++) {
      vehicleVsVehicle(vehicles[a], vehicles[b]);
    }
  }

  // Пешие NPC рядом с игроком (дальние заморожены и не сталкиваются).
  const p = player.position;
  const near = npcs.filter((n) => !n.vehicle && n.model.root.visible && Math.abs(n.position.x - p.x) < 120 && Math.abs(n.position.z - p.z) < 120);

  // --- Машина <-> пешеходы ---
  for (const v of vehicles) {
    if (player.isOnFoot) vehicleVsPlayer(v, player);
    for (const npc of near) vehicleVsNpc(v, npc);
  }

  // --- Игрок <-> NPC ---
  if (player.isOnFoot) {
    for (const npc of near) playerVsNpc(player, npc);
  }

  // --- NPC <-> NPC (просто расталкиваются) ---
  for (let a = 0; a < near.length; a++) {
    for (let b = a + 1; b < near.length; b++) {
      separateCircles(near[a].position, near[a].radius, near[b].position, near[b].radius);
    }
  }
}

function vehicleVsVehicle(a, b) {
  const V = CONFIG.vehicle;
  const reach = 2 * (Math.abs(V.circleOffsets[0]) + V.collisionRadius);
  if (a.position.distanceToSquared(b.position) > reach * reach) return;
  for (const ca of a.circles) {
    for (const cb of b.circles) {
      const pa = { x: ca.x, z: ca.z }, pb = { x: cb.x, z: cb.z };
      const hit = separateCircles(pa, a.radius, pb, b.radius);
      if (!hit) continue;
      a.position.x += pa.x - ca.x; a.position.z += pa.z - ca.z;
      b.position.x += pb.x - cb.x; b.position.z += pb.z - cb.z;
      // Равные массы: обмен импульсом вдоль нормали.
      const rvx = b.velocity.x - a.velocity.x, rvz = b.velocity.z - a.velocity.z;
      const vn = rvx * hit.nx + rvz * hit.nz;
      if (vn < 0) {
        const j = (-(1 + V.restitution) * vn) / 2;
        a.velocity.x -= hit.nx * j; a.velocity.z -= hit.nz * j;
        b.velocity.x += hit.nx * j; b.velocity.z += hit.nz * j;
        a.spin += (-hit.nx * j * (ca.z - a.position.z) + hit.nz * j * (ca.x - a.position.x)) * V.impactSpin;
        b.spin += (hit.nx * j * (cb.z - b.position.z) - hit.nz * j * (cb.x - b.position.x)) * V.impactSpin;
        if (j > 2) a.game.events.emit('vehicle:crash', { vehicle: a, impulse: j, other: b });
      }
      a.updateCircles();
      b.updateCircles();
    }
  }
}

function vehicleVsPlayer(v, player) {
  for (const c of v.circles) {
    const hit = separateCircles({ x: c.x, z: c.z }, v.radius, player.position, player.radius, 0, 1);
    if (!hit) continue;
    const approach = v.velocity.x * hit.nx + v.velocity.z * hit.nz;
    if (approach > 4.5 && !player.isDown) {
      // Сбит машиной: урон и отлёт.
      player.knockDown(v.velocity.x * 0.8 + hit.nx * 2, v.velocity.z * 0.8 + hit.nz * 2, Math.min(6, approach * 0.3));
      player.takeDamage((approach - 3) * 4, v.driver ?? v, hit.nx, hit.nz, 'vehicle');
      v.velocity.multiplyScalar(0.9);
      continue;
    }
    const vn = player.velocity.x * hit.nx + player.velocity.z * hit.nz;
    if (vn < 0) {
      player.velocity.x -= vn * hit.nx;
      player.velocity.z -= vn * hit.nz;
    }
  }
}

function vehicleVsNpc(v, npc) {
  for (const c of v.circles) {
    const hit = separateCircles({ x: c.x, z: c.z }, v.radius, npc.position, npc.radius, 0, 1);
    if (!hit) continue;
    // Скорость машины в сторону пешехода.
    const approach = v.velocity.x * hit.nx + v.velocity.z * hit.nz;
    const by = v.driver ?? v;
    if (approach > 3.5) {
      const up = Math.min(7, approach * 0.35);
      const done = npc.knockDown(v.velocity.x * 1.1 + hit.nx * 2, v.velocity.z * 1.1 + hit.nz * 2, up, by, 'vehicle');
      if (done) {
        npc.takeDamage((approach - 2.5) * 5, by, hit.nx, hit.nz, 'vehicle');
        v.velocity.multiplyScalar(0.92);
      }
    } else if (approach > 0.8) {
      npc.stumble(hit.nx, hit.nz, 2 + approach, by);
    }
    return;
  }
}

function playerVsNpc(player, npc) {
  // Игрок сдвигается на 30%, NPC — на 70%: игрок "проталкивается".
  const hit = separateCircles(player.position, player.radius, npc.position, npc.radius, 0.3, 0.7);
  if (!hit || npc.isDown || player.isDown) return;
  const approach = player.velocity.x * hit.nx + player.velocity.z * hit.nz;
  if (approach < 0.5) return;
  if (player.horizontalSpeed > CONFIG.npc.runKnockSpeed) {
    npc.knockDown(hit.nx * approach * 1.2, hit.nz * approach * 1.2, 1.5, player, 'player');
  } else {
    npc.stumble(hit.nx, hit.nz, 1.5 + approach, player);
  }
}
