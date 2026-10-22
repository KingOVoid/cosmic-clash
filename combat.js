import * as THREE from "three";
import { CLASS_DEFS, getClassDef, getPrimaryProfile, serializeFighter } from "./classes.js";
import { healFighter } from "./upgrades.js";
import { VFXManager } from "./vfx.js";

export const HIT_RADIUS = 0.55;
export const CHARGE_PIN_RANGE = 1.85;
export const CHARGE_PIN_DOT = 0.35;
export const AURA_RADIUS = 6.2;
export const GRAVITON_RADIUS = 6.5;
export const GRAVITON_FORCE = 11;
export const WARP_RADIUS = 4.4;
export const ROOT_RADIUS = 1.65;
export const PROJECTILE_SPEED = 18;
export const PROJECTILE_RADIUS = 0.28;

const scratchTo = new THREE.Vector3();
const scratchFwd = new THREE.Vector3();
const scratchPlayerBox = new THREE.Box3();
const scratchPlayerSize = new THREE.Vector3(0.9, 1.8, 0.9);
const scratchProjPoint = new THREE.Vector3();

let hitSeq = 1;
const processedHits = new Map();
const projectiles = [];
const zones = [];
const traps = [];
const fighters = new Map();
const visualFx = [];

export function getFighter(id) {
  return fighters.get(id) || null;
}

export function getAllFighters() {
  return fighters;
}

export function upsertFighter(state) {
  fighters.set(state.id, state);
  return state;
}

export function removeFighter(id) {
  fighters.delete(id);
}

export function downPlayer(target) {
  target.hp = 0;
  target.state = "downed";
  target.reviveMeter = 0;
  target.isCharging = false;
  target.isInvulnerable = false;
  target.anim = "Downed";
  target.wildShape = false;
  target.maxHp = getClassDef(target.classId).maxHp;
}

export function revivePlayer(target) {
  target.state = "alive";
  target.maxHp = target.wildShape && target.classId === "druid" ? 210 : getClassDef(target.classId).maxHp;
  target.hp = target.maxHp * 0.4;
  target.reviveMeter = 0;
  target.anim = "Idle";
}

export function applyMeshDownedScale(mesh, downed) {
  if (!mesh) {
    return;
  }
  mesh.scale.y = downed ? 0.3 : 1;
}

export function checkHit(attacker, target, damage, type) {
  if (!attacker || !target) {
    return { applied: false, reason: "missing" };
  }
  if (target.isInvulnerable) {
    return { applied: false, reason: "invulnerable" };
  }
  if (target.team !== attacker.team && target.state === "alive") {
    const dealt = Math.max(0, damage);
    target.hp -= dealt;
    if (target.hp <= 0) {
      downPlayer(target);
    }
    return { applied: true, kind: "damage", damage: dealt, type };
  }
  if (target.team === attacker.team && target.state === "downed") {
    target.reviveMeter += 25;
    if (target.reviveMeter >= 100) {
      revivePlayer(target);
      return { applied: true, kind: "revived", type };
    }
    return { applied: true, kind: "revive", type, reviveMeter: target.reviveMeter };
  }
  return { applied: false, reason: "no-rule" };
}

export function facingAndRange(origin, yaw, targetPos, range, arc) {
  scratchTo.set(targetPos.x - origin.x, 0, targetPos.z - origin.z);
  const dist = scratchTo.length();
  if (dist > range || dist < 0.0001) {
    return false;
  }
  scratchFwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  scratchTo.multiplyScalar(1 / dist);
  return scratchFwd.dot(scratchTo) >= Math.cos(arc);
}

export function inRadius(a, b, radius) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz <= radius * radius;
}

function nextHit(attackerId, targetId, damage, type, extra) {
  const packet = {
    seq: hitSeq,
    attackerId,
    targetId,
    damage,
    type,
    extra: extra || null
  };
  hitSeq += 1;
  return packet;
}

export function collectArcTargets(attacker, origin, yaw, range, arc, fightersById, positions) {
  const hits = [];
  fightersById.forEach((target, id) => {
    if (id === attacker.id) {
      return;
    }
    const pos = positions.get(id);
    if (!pos) {
      return;
    }
    if (facingAndRange(origin, yaw, pos, range, arc)) {
      hits.push(target);
    }
  });
  return hits;
}

export function applyIncomingHit(localFighter, packet) {
  if (!localFighter || !packet) {
    return null;
  }
  const key = packet.attackerId;
  const last = processedHits.get(key) || 0;
  if (packet.seq <= last) {
    return null;
  }
  processedHits.set(key, packet.seq);
  if (packet.targetId !== localFighter.id) {
    return null;
  }

  const attacker = fighters.get(packet.attackerId) || {
    id: packet.attackerId,
    team: packet.extra && typeof packet.extra.team === "number" ? packet.extra.team : 1 - localFighter.team
  };

  if (packet.type === "graviton") {
    localFighter.knockbackX = packet.extra ? packet.extra.kx : 0;
    localFighter.knockbackZ = packet.extra ? packet.extra.kz : 0;
    localFighter.knockbackUntil = 0.28;
    return { kind: "graviton" };
  }
  if (packet.type === "pin") {
    localFighter.isPinned = true;
    localFighter.pinnedBy = packet.attackerId;
    return { kind: "pin" };
  }
  if (packet.type === "unpin") {
    localFighter.isPinned = false;
    localFighter.pinnedBy = null;
    return { kind: "unpin" };
  }
  if (packet.type === "root") {
    localFighter.rootUntil = 1.5;
    return { kind: "root" };
  }
  if (packet.type === "valor") {
    localFighter.hp = Math.min(localFighter.maxHp, localFighter.hp + 10);
    localFighter.valorUntil = 4;
    localFighter.valorSpeed = 1.15;
    return { kind: "valor" };
  }
  if (packet.type === "veil-dot") {
    localFighter.dots.push({
      ticks: 3,
      timer: 0,
      interval: 0.7,
      damage: 8,
      from: packet.attackerId
    });
  }

  const result = checkHit(attacker, localFighter, packet.damage, packet.type);
  if (packet.type === "veilstrike" && result.kind === "damage") {
    localFighter.dots.push({
      ticks: 3,
      timer: 0,
      interval: 0.7,
      damage: 8,
      from: packet.attackerId
    });
  }
  return result;
}

export function updateHazards(player, mapData, dt = 0.016) {
  if (!player || !mapData || !mapData.hazards) {
    return;
  }
  const pos = player.position || (player.mesh && player.mesh.position) || (player.getState && player.getState("pos"));
  if (!pos) {
    return;
  }
  const fighter = player.fighter || (player.id && fighters.get(player.id)) || (player.getState && fighters.get(player.id));
  const vel = player.velocity || (player.mesh && player.mesh.userData && player.mesh.userData.velocity);

  // 1. Lava Hazard: If y < -2, apply 10 damage/sec. If downed by lava, place player on nearest safe edge.
  const lava = mapData.hazards.lava;
  const isLavaActive = lava && (lava.active !== false);
  const lavaThreshold = (lava && typeof lava.planeY === "number") ? lava.planeY : -2;

  if (isLavaActive && pos.y < lavaThreshold) {
    const dps = (lava && typeof lava.damagePerSec === "number") ? lava.damagePerSec : 10;
    const damage = dps * dt;
    let shouldRespawn = false;

    if (fighter && fighter.state === "alive" && !fighter.isInvulnerable) {
      fighter.hp -= damage;
      if (fighter.hp <= 0) {
        downPlayer(fighter);
        shouldRespawn = true;
      }
    } else if (fighter && fighter.state === "downed") {
      shouldRespawn = true;
    }

    if (shouldRespawn) {
      // If downed by lava, place player on nearest safe edge
      const safeEdges = (lava && Array.isArray(lava.safeEdges) && lava.safeEdges.length > 0)
        ? lava.safeEdges
        : [new THREE.Vector3(0, 0, 9), new THREE.Vector3(0, 0, -9), new THREE.Vector3(0, 0, 0)];

      let nearest = safeEdges[0];
      let minDistSq = Infinity;
      for (let i = 0; i < safeEdges.length; i += 1) {
        const edge = safeEdges[i];
        const dSq = (edge.x - pos.x) ** 2 + (edge.z - pos.z) ** 2;
        if (dSq < minDistSq) {
          minDistSq = dSq;
          nearest = edge;
        }
      }
      pos.set(nearest.x, (nearest.y || 0) + 0.1, nearest.z);
      if (vel) {
        vel.set(0, 0, 0);
      }
    }
  }

  // 2. Jump Pads: Intersecting a green pad applies massive +Y and +Z impulse to launch to the next island
  const jumpPads = mapData.hazards.jumpPads;
  if (Array.isArray(jumpPads) && jumpPads.length > 0) {
    scratchPlayerBox.setFromCenterAndSize(pos, scratchPlayerSize);
    const now = performance.now();
    for (let i = 0; i < jumpPads.length; i += 1) {
      const pad = jumpPads[i];
      if (pad.box && pad.box.intersectsBox(scratchPlayerBox)) {
        if (!pad.cooldownUntil || now > pad.cooldownUntil) {
          pad.cooldownUntil = now + 450;
          if (vel) {
            const imp = pad.impulse || { x: 0, y: 24, z: 24 };
            vel.x = imp.x || 0;
            vel.y = imp.y || 24;
            vel.z = imp.z || 24;
          }
          if (player.isGrounded !== undefined) {
            player.isGrounded = false;
          }
          VFXManager.createHitFlash(pos, 0x00ff88);
        }
      }
    }
  }
}

export function tickDots(fighter, dt) {
  if (!fighter.dots.length) {
    return;
  }
  const attackerStub = { id: "dot", team: 1 - fighter.team, state: "alive" };
  for (let i = fighter.dots.length - 1; i >= 0; i -= 1) {
    const dot = fighter.dots[i];
    dot.timer += dt;
    if (dot.timer >= dot.interval) {
      dot.timer -= dot.interval;
      dot.ticks -= 1;
      if (fighter.state === "alive" && !fighter.isInvulnerable) {
        fighter.hp -= dot.damage;
        if (fighter.hp <= 0) {
          downPlayer(fighter);
        }
      }
      if (dot.ticks <= 0) {
        fighter.dots.splice(i, 1);
      }
    }
  }
  void attackerStub;
}

export function tickTimers(fighter, dt) {
  const cds = fighter.cooldowns;
  cds.primary = Math.max(0, cds.primary - dt);
  cds.skill1 = Math.max(0, cds.skill1 - dt);
  cds.skill2 = Math.max(0, cds.skill2 - dt);
  fighter.sidestepUntil = Math.max(0, fighter.sidestepUntil - dt);
  fighter.valorUntil = Math.max(0, fighter.valorUntil - dt);
  fighter.rootUntil = Math.max(0, fighter.rootUntil - dt);
  fighter.knockbackUntil = Math.max(0, fighter.knockbackUntil - dt);
  fighter.attackUntil = Math.max(0, fighter.attackUntil - dt);
  fighter.veilUntil = Math.max(0, fighter.veilUntil - dt);
  if (fighter.sidestepUntil <= 0) {
    fighter.isInvulnerable = false;
  }
  if (fighter.veilUntil <= 0 && !fighter.veilArmed) {
    fighter.opacity = 1;
  }
  if (fighter.valorUntil <= 0) {
    fighter.valorSpeed = 1;
  }
}

export function spawnProjectile(owner, origin, yaw, damage, color, type) {
  const projectile = {
    id: `${owner.id}-${hitSeq}`,
    ownerId: owner.id,
    team: owner.team,
    x: origin.x + Math.sin(yaw) * 0.8,
    y: origin.y + 0.4,
    z: origin.z + Math.cos(yaw) * 0.8,
    vx: Math.sin(yaw) * PROJECTILE_SPEED,
    vz: Math.cos(yaw) * PROJECTILE_SPEED,
    damage,
    type: type || "projectile",
    life: 1.15,
    color,
    radius: PROJECTILE_RADIUS
  };
  projectiles.push(projectile);
  return projectile;
}

export function spawnZone(owner, origin, kind, duration, radius) {
  const zone = {
    id: `${kind}-${owner.id}-${hitSeq}`,
    ownerId: owner.id,
    team: owner.team,
    kind,
    x: origin.x,
    y: 0.08,
    z: origin.z,
    radius,
    life: duration
  };
  zones.push(zone);
  return zone;
}

export function spawnTrap(owner, origin) {
  const trap = {
    id: `root-${owner.id}-${hitSeq}`,
    ownerId: owner.id,
    team: owner.team,
    x: origin.x + Math.sin(owner.yaw || 0) * 1.4,
    z: origin.z + Math.cos(owner.yaw || 0) * 1.4,
    y: 0.05,
    radius: ROOT_RADIUS,
    life: 8,
    sprung: {}
  };
  traps.push(trap);
  return trap;
}

export function getProjectiles() {
  return projectiles;
}

export function getZones() {
  return zones;
}

export function getTraps() {
  return traps;
}

export function tickWorld(dt, positions, onVictimPacket, obstacleBoxes) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const shot = projectiles[i];
    shot.x += shot.vx * dt;
    shot.z += shot.vz * dt;
    shot.life -= dt;
    let consumed = shot.life <= 0;

    // Check collision against obstacleBoxes using raycaster logic
    if (!consumed && obstacleBoxes && obstacleBoxes.length > 0) {
      scratchProjPoint.set(shot.x, shot.y, shot.z);
      const prevX = shot.x - shot.vx * dt;
      const prevY = shot.y;
      const prevZ = shot.z - shot.vz * dt;
      scratchTo.set(prevX, prevY, prevZ);
      scratchFwd.set(shot.vx, 0, shot.vz).normalize();
      const stepDist = Math.hypot(shot.vx * dt, shot.vz * dt);
      const projRay = new THREE.Ray(scratchTo, scratchFwd);
      const hitPt = new THREE.Vector3();

      for (let b = 0; b < obstacleBoxes.length; b += 1) {
        const box = obstacleBoxes[b];
        if (box.containsPoint(scratchProjPoint) || (projRay.intersectBox(box, hitPt) && scratchTo.distanceTo(hitPt) <= stepDist + shot.radius)) {
          consumed = true;
          VFXManager.createHitFlash(hitPt.x ? hitPt : scratchProjPoint, shot.color || 0xffd60a);
          break;
        }
      }
    }
    fighters.forEach((target) => {
      if (consumed || target.id === shot.ownerId || target.team === shot.team) {
        return;
      }
      const pos = positions.get(target.id);
      if (!pos) {
        return;
      }
      const dx = pos.x - shot.x;
      const dz = pos.z - shot.z;
      if (dx * dx + dz * dz <= (HIT_RADIUS + shot.radius) * (HIT_RADIUS + shot.radius)) {
        const attacker = fighters.get(shot.ownerId);
        if (attacker) {
          const packet = nextHit(attacker.id, target.id, shot.damage, shot.type || "projectile", { team: attacker.team });
          onVictimPacket(target, packet);
        }
        consumed = true;
      }
    });
    if (consumed) {
      projectiles.splice(i, 1);
    }
  }

  for (let i = zones.length - 1; i >= 0; i -= 1) {
    zones[i].life -= dt;
    if (zones[i].life <= 0) {
      zones.splice(i, 1);
    }
  }

  for (let i = traps.length - 1; i >= 0; i -= 1) {
    const trap = traps[i];
    trap.life -= dt;
    fighters.forEach((target) => {
      if (target.team === trap.team || target.state !== "alive") {
        return;
      }
      const pos = positions.get(target.id);
      if (!pos) {
        return;
      }
      if (inRadius(pos, trap, trap.radius) && !trap.sprung[target.id]) {
        trap.sprung[target.id] = true;
        const attacker = fighters.get(trap.ownerId);
        if (attacker) {
          onVictimPacket(target, nextHit(attacker.id, target.id, 0, "root", { team: attacker.team }));
        }
      }
    });
    if (trap.life <= 0) {
      traps.splice(i, 1);
    }
  }
}

export function computeWarpSlow(fighter, position) {
  let slow = 1;
  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i];
    if (zone.kind !== "timeWarp" || zone.team === fighter.team) {
      continue;
    }
    if (inRadius(position, zone, zone.radius)) {
      slow = Math.min(slow, 0.4);
    }
  }
  fighter.warpSlow = slow;
}

export function tryPrimary(fighter, origin, yaw, positions, onVictimPacket) {
  const def = getClassDef(fighter.classId);
  if (fighter.cooldowns.primary > 0 || fighter.state !== "alive") {
    return null;
  }
  fighter.cooldowns.primary = def.primaryCd;
  fighter.anim = "Attack";
  fighter.attackUntil = 0.35;
  const profile = getPrimaryProfile(fighter);
  const outgoing = [];

  if (profile.kind === "ranged") {
    const dmg = fighter.veilArmed ? profile.damage * 2 : profile.damage;
    const type = fighter.veilArmed ? "veilstrike" : "projectile";
    spawnProjectile(fighter, origin, yaw, dmg, 0x80ffdb, type);
    if (fighter.veilArmed) {
      fighter.veilArmed = false;
      fighter.opacity = 1;
    }
    return { kind: "ranged", outgoing };
  }

  const targets = collectArcTargets(fighter, origin, yaw, profile.range, profile.arc, fighters, positions);
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    let damage = profile.damage;
    let type = "melee";
    if (fighter.veilArmed && target.team !== fighter.team) {
      damage *= 2;
      type = "veilstrike";
    }
    const packet = nextHit(fighter.id, target.id, damage, type, { team: fighter.team });
    outgoing.push(packet);
    onVictimPacket(target, packet);
  }
  if (fighter.veilArmed) {
    fighter.veilArmed = false;
    fighter.opacity = 1;
  }

  if (fighter.classId === "paladin") {
    spawnProjectile(
      fighter,
      origin,
      yaw,
      def.primaryDamage * def.projectileDamageScale,
      0xffe29a
    );
  }
  return { kind: "melee", outgoing };
}

export function trySkill1(fighter, origin, yaw, positions, onVictimPacket) {
  const def = getClassDef(fighter.classId);
  if (fighter.cooldowns.skill1 > 0 || fighter.state !== "alive") {
    return null;
  }
  fighter.cooldowns.skill1 = def.skill1Cd;

  if (def.skill1 === "sidestep") {
    fighter.isInvulnerable = true;
    fighter.sidestepUntil = 0.5;
    fighter.sidestepVx = Math.sin(yaw) * 16;
    fighter.sidestepVz = Math.cos(yaw) * 16;
    return { kind: "sidestep" };
  }

  if (def.skill1 === "timeWarp") {
    spawnZone(fighter, origin, "timeWarp", 5.5, WARP_RADIUS);
    return { kind: "timeWarp" };
  }

  if (def.skill1 === "wildShape") {
    fighter.wildShape = !fighter.wildShape;
    if (fighter.wildShape) {
      const ratio = fighter.hp / Math.max(fighter.maxHp, 1);
      fighter.maxHp = 210;
      fighter.hp = Math.min(210, Math.max(1, 210 * ratio));
    } else {
      const ratio = fighter.hp / Math.max(fighter.maxHp, 1);
      fighter.maxHp = CLASS_DEFS.druid.maxHp;
      fighter.hp = Math.min(fighter.maxHp, Math.max(1, fighter.maxHp * ratio));
    }
    return { kind: "wildShape", wildShape: fighter.wildShape };
  }

  if (def.skill1 === "auraOfValor") {
    fighters.forEach((ally) => {
      if (ally.team !== fighter.team) {
        return;
      }
      const pos = positions.get(ally.id);
      if (!pos || !inRadius(origin, pos, AURA_RADIUS)) {
        return;
      }
      const packet = nextHit(fighter.id, ally.id, 0, "valor", { team: fighter.team });
      onVictimPacket(ally, packet);
    });
    return { kind: "auraOfValor" };
  }
  return null;
}

export function trySkill2(fighter, origin, yaw, positions, onVictimPacket) {
  const def = getClassDef(fighter.classId);
  if (fighter.cooldowns.skill2 > 0 || fighter.state !== "alive") {
    return null;
  }
  fighter.cooldowns.skill2 = def.skill2Cd;

  if (def.skill2 === "shadowVeil") {
    fighter.veilArmed = true;
    fighter.veilUntil = 6;
    fighter.opacity = 0.2;
    return { kind: "shadowVeil" };
  }

  if (def.skill2 === "gravitonPush") {
    fighters.forEach((target) => {
      if (target.id === fighter.id || target.team === fighter.team || target.state !== "alive") {
        return;
      }
      const pos = positions.get(target.id);
      if (!pos || !inRadius(origin, pos, GRAVITON_RADIUS)) {
        return;
      }
      const dx = pos.x - origin.x;
      const dz = pos.z - origin.z;
      const len = Math.hypot(dx, dz) || 1;
      const packet = nextHit(fighter.id, target.id, 0, "graviton", {
        team: fighter.team,
        kx: (dx / len) * GRAVITON_FORCE,
        kz: (dz / len) * GRAVITON_FORCE
      });
      onVictimPacket(target, packet);
    });
    return { kind: "gravitonPush" };
  }

  if (def.skill2 === "roots") {
    const trapOrigin = { x: origin.x, z: origin.z };
    fighter.yaw = yaw;
    spawnTrap(fighter, trapOrigin);
    return { kind: "roots" };
  }

  if (def.skill2 === "vanguardCharge") {
    fighter.isCharging = true;
    fighter.chargeUntil = 3;
    fighter.pinnedEnemies = [];
    return { kind: "vanguardCharge" };
  }
  return null;
}

export function tickVanguardCharge(fighter, origin, yaw, positions, dt, onVictimPacket) {
  if (!fighter.isCharging) {
    return;
  }
  fighter.chargeUntil -= dt;
  scratchFwd.set(Math.sin(yaw), 0, Math.cos(yaw));

  fighters.forEach((target) => {
    if (target.id === fighter.id || target.team === fighter.team || target.state !== "alive") {
      return;
    }
    if (fighter.pinnedEnemies.indexOf(target.id) >= 0) {
      return;
    }
    const pos = positions.get(target.id);
    if (!pos) {
      return;
    }
    const dx = pos.x - origin.x;
    const dz = pos.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > CHARGE_PIN_RANGE || dist < 0.0001) {
      return;
    }
    const dirX = dx / dist;
    const dirZ = dz / dist;
    if (scratchFwd.x * dirX + scratchFwd.z * dirZ < CHARGE_PIN_DOT) {
      return;
    }
    fighter.pinnedEnemies.push(target.id);
    onVictimPacket(target, nextHit(fighter.id, target.id, 0, "pin", { team: fighter.team }));
  });

  if (fighter.chargeUntil <= 0) {
    const finisher = 30 + fighter.pinnedEnemies.length * 20;
    for (let i = 0; i < fighter.pinnedEnemies.length; i += 1) {
      const id = fighter.pinnedEnemies[i];
      const target = fighters.get(id);
      if (!target) {
        continue;
      }
      onVictimPacket(target, nextHit(fighter.id, id, finisher, "finisher", { team: fighter.team }));
      onVictimPacket(target, nextHit(fighter.id, id, 0, "unpin", { team: fighter.team }));
    }
    fighter.pinnedEnemies = [];
    fighter.isCharging = false;
    fighter.chargeUntil = 0;
  }
}

export function findPinningPaladin(localId) {
  let found = null;
  fighters.forEach((fighter) => {
    if (fighter.isCharging && fighter.pinnedEnemies.indexOf(localId) >= 0) {
      found = fighter;
    }
  });
  return found;
}

export function snapshotWorld() {
  return {
    projectiles: projectiles.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      color: p.color
    })),
    zones: zones.map((z) => ({
      id: z.id,
      x: z.x,
      z: z.z,
      radius: z.radius,
      kind: z.kind,
      team: z.team
    })),
    traps: traps.map((t) => ({
      id: t.id,
      x: t.x,
      z: t.z,
      radius: t.radius
    }))
  };
}

export function consumeRemoteWorld(ownerId, remote, isOwnerLocal) {
  if (isOwnerLocal || !remote) {
    return;
  }
  void ownerId;
}

export const CombatSystem = {
  updateHazards,
  checkHit,
  applyIncomingHit,
  tickWorld,
  tickTimers,
  tickDots,
  downPlayer,
  revivePlayer,
  upsertFighter,
  getFighter,
  getAllFighters
};

export { serializeFighter, visualFx };
