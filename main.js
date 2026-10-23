import * as THREE from "three";
import { AssetManager, PLAYER_HEIGHT, PLAYER_RADIUS, CLASS_COLORS } from "./assets.js";
import {
  createFighterState,
  getClassDef,
  getMoveSpeed,
  serializeFighter
} from "./classes.js";
import {
  applyIncomingHit,
  applyMeshDownedScale,
  CombatSystem,
  computeWarpSlow,
  findPinningPaladin,
  getAllFighters,
  getProjectiles,
  getTraps,
  getZones,
  snapshotWorld,
  tickDots,
  tickTimers,
  tickVanguardCharge,
  tickWorld,
  tryPrimary,
  trySkill1,
  trySkill2,
  updateHazards,
  upsertFighter
} from "./combat.js";
import { MapGenerator, LobbyEnvironment } from "./maps.js";
import { VFXManager } from "./vfx.js";
import {
  getConnectedPlayers,
  getLocalPlayer,
  initLobby,
  isPlayerLocal,
  onNetworkPlayerJoin,
  onNetworkPlayerQuit,
  publishCombat,
  publishLocalPose,
  selectedClass,
  selectedTeam,
  selectedMap,
  hostMatch,
  joinMatch
} from "./network.js";

const CAMERA_LERP = 12.0;
const REMOTE_LERP = 12;
const NETWORK_INTERVAL = 0.05;
const JOYSTICK_MAX = 48;
const ARENA_RADIUS = 22;
const CAMERA_OFFSET_Y = 2.5;
const CAMERA_OFFSET_Z = 5.0;
const CAMERA_OFFSET = new THREE.Vector3(0, CAMERA_OFFSET_Y, CAMERA_OFFSET_Z);

const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd2b48c);
scene.fog = new THREE.FogExp2(0xd2b48c, 0.015);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.copy(CAMERA_OFFSET);

const ambient = new THREE.AmbientLight(0xffdfba, 0.65);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff1c9, 1.4);
sun.position.set(18, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 70;
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);

const hemi = new THREE.HemisphereLight(0xffe8c2, 0xa67c52, 0.45);
scene.add(hemi);

const projectileGeom = new THREE.SphereGeometry(0.22, 8, 8);
const zoneGeom = new THREE.CylinderGeometry(1, 1, 0.12, 24);
const trapGeom = new THREE.CylinderGeometry(1, 1, 0.18, 8);

VFXManager.attach(scene);

let activeMapType = "Desert";
let currentMapData = null;

// ==========================================
// GLOBAL STATE & HOOKS FOR EXTERNAL UI
// ==========================================
window.gameState = "TITLE_SCREEN";
window.isServerBrowserOpen = false;

window.openServerBrowser = function () {
  window.isServerBrowserOpen = true;
};

window.closeServerBrowser = function () {
  window.isServerBrowserOpen = false;
};

window.hostMatch = async function (mapName) {
  const masterUi = document.getElementById('master-ui');
  if (masterUi) {
    masterUi.style.display = 'none';
  }
  return await hostMatch(mapName);
};

window.joinMatch = async function (roomCode) {
  const masterUi = document.getElementById('master-ui');
  if (masterUi) {
    masterUi.style.display = 'none';
  }
  return await joinMatch(roomCode);
};

export async function selectClass(className) {
  const id = (className || selectedClass || "rogue").toLowerCase();
  // 1. Set gameState = 'LOBBY'
  window.gameState = "LOBBY";

  // 3. Call LobbyEnvironment.loadRoom(className) to switch 3D scene to corresponding diorama
  LobbyEnvironment.loadRoom(id, AssetManager.envModels);

  // 2. Trigger AssetManager to quietly load the selected character's .glb model in background
  try {
    await AssetManager.loadCharacter(id);
  } catch (e) {
    console.warn("Quiet load character model:", e);
  }

  // When selectClass resolves, place 3D character mesh directly in center of active diorama
  LobbyEnvironment.setCharacter(id);
  return id;
}
window.selectClass = selectClass;

export function updateLobbyScene(className) {
  selectClass(className);
}
window.updateLobbyScene = updateLobbyScene;

export function loadMap(type) {
  LobbyEnvironment.dispose();
  if (currentMapData && currentMapData.dispose) {
    currentMapData.dispose();
  }
  let target = type;
  if (!target && window.Playroom && typeof window.Playroom.getState === "function") {
    target = window.Playroom.getState("selectedMap");
  }
  activeMapType = target || selectedMap || "Desert";
  currentMapData = MapGenerator.loadMap(scene, activeMapType, AssetManager.envModels);
  return currentMapData;
}

// Ensure the floor THREE.Box3 is generated before physics loop starts applying gravity
currentMapData = MapGenerator.loadMap(scene, 'Desert');

const avatars = new Map();
const keys = Object.create(null);
const moveInput = new THREE.Vector2();
const aimInput = new THREE.Vector2();
const lookTarget = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
const desiredMove = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const fxMeshes = new Map();

let cameraYaw = 0;
let cameraPitch = 0.2;
let networkAccumulator = 0;
let lastFrameTime = performance.now();
let gameStarted = false;
let outgoingHits = [];
let assetsReady = false;

function spawnOffset(index) {
  const count = Math.max(getConnectedPlayers().length, 1);
  const angle = (index / count) * Math.PI * 2;
  return {
    x: Math.cos(angle) * 8,
    y: 25, // Drop from y = 25 onto initialized floor
    z: Math.sin(angle) * 8
  };
}

function readClassTeam(player) {
  const classId = isPlayerLocal(player)
    ? selectedClass
    : player.getState("classId") || (player.getState("fighter") && player.getState("fighter").classId) || "rogue";
  const networkedTeam = player.getState("team");
  const team = isPlayerLocal(player)
    ? selectedTeam
    : typeof networkedTeam === "number"
      ? networkedTeam
      : 0;
  return { classId, team };
}

function createAvatar(player) {
  const { classId, team } = readClassTeam(player);
  const rig = AssetManager.createRig(classId);
  scene.add(rig.root);

  const mapSpawns = currentMapData && currentMapData.spawnPoints;
  const teamSpawn = mapSpawns && (mapSpawns[team % mapSpawns.length] || mapSpawns[0]);
  const spawn = player.getState("pos") || (teamSpawn ? { x: teamSpawn.x, y: 25, z: teamSpawn.z } : spawnOffset(avatars.size));
  const initialY = (spawn.y !== undefined && spawn.y >= 25) ? spawn.y : 25;
  rig.root.position.set(spawn.x, initialY, spawn.z);
  rig.root.rotation.y = player.getState("rot") || 0;

  const fighter = createFighterState(player.id, classId, team);
  const remote = player.getState("fighter");
  if (remote && !isPlayerLocal(player)) {
    Object.assign(fighter, remote);
  }
  upsertFighter(fighter);

  const avatar = {
    id: player.id,
    player,
    mesh: rig.root,
    rig,
    classId,
    targetPos: new THREE.Vector3(spawn.x, rig.root.position.y, spawn.z),
    targetRot: rig.root.rotation.y,
    velocity: new THREE.Vector3(0, 0, 0),
    isGrounded: false
  };
  rig.root.userData.avatar = avatar;
  rig.root.userData.velocity = avatar.velocity;
  avatars.set(player.id, avatar);
  return avatar;
}

function removeAvatar(player) {
  const avatar = avatars.get(player.id);
  if (!avatar) {
    return;
  }
  scene.remove(avatar.mesh);
  avatars.delete(player.id);
}

function refreshPlayerHud() {
  const hudPlayers = document.getElementById("hud-players");
  if (hudPlayers) {
    hudPlayers.textContent = `${getConnectedPlayers().length} PLAYERS`;
  }
}

function bindJoinHandlers() {
  onNetworkPlayerJoin((player) => {
    const masterUi = document.getElementById("master-ui");
    if (masterUi) {
      masterUi.style.display = "none";
    }
    document.querySelectorAll(".debug, #debug, [data-debug], #server-browser-hint, #lobby-status, #room-code-display").forEach((el) => {
      el.style.display = "none";
    });

    if (window.Playroom && typeof window.Playroom.getState === "function") {
      const syncdMap = window.Playroom.getState("selectedMap");
      if (syncdMap && currentMapData && currentMapData.name !== syncdMap && currentMapData.type !== syncdMap.toLowerCase()) {
        loadMap(syncdMap);
      }
    }

    if (!assetsReady) {
      return;
    }
    if (!avatars.has(player.id)) {
      const avatar = createAvatar(player);
      if (isPlayerLocal(player) && !player.getState("pos")) {
        const placed = spawnOffset(avatars.size - 1);
        avatar.mesh.position.set(placed.x, 25, placed.z);
        avatar.velocity.set(0, 0, 0);
        avatar.isGrounded = false;
        player.setState("pos", { x: placed.x, y: 25, z: placed.z }, true);
      }
    }
    refreshPlayerHud();
  });

  onNetworkPlayerQuit((player) => {
    removeAvatar(player);
    refreshPlayerHud();
  });
}

window.addEventListener("keydown", (event) => {
  keys[event.code] = true;
  if (gameStarted && (event.code === "KeyQ" || event.code === "KeyE")) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

function readKeyboardMove() {
  let x = 0;
  let y = 0;
  if (keys.KeyW || keys.ArrowUp) {
    y += 1;
  }
  if (keys.KeyS || keys.ArrowDown) {
    y -= 1;
  }
  if (keys.KeyA || keys.ArrowLeft) {
    x -= 1;
  }
  if (keys.KeyD || keys.ArrowRight) {
    x += 1;
  }
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  return { x, y };
}

function bindJoystick(root, vector, onAim) {
  if (!root) {
    return;
  }
  const knob = root.querySelector(".joystick-knob");
  let pointerId = null;

  function resetKnob() {
    knob.style.transform = "translate(0px, 0px)";
    vector.set(0, 0);
  }

  function updateFromEvent(event) {
    const rect = root.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > JOYSTICK_MAX) {
      dx *= JOYSTICK_MAX / distance;
      dy *= JOYSTICK_MAX / distance;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    vector.set(dx / JOYSTICK_MAX, -dy / JOYSTICK_MAX);
    if (onAim) {
      onAim(vector);
    }
  }

  root.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    root.setPointerCapture(pointerId);
    updateFromEvent(event);
  });

  root.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }
    updateFromEvent(event);
  });

  function endPointer(event) {
    if (pointerId !== event.pointerId) {
      return;
    }
    pointerId = null;
    resetKnob();
  }

  root.addEventListener("pointerup", endPointer);
  root.addEventListener("pointercancel", endPointer);
  resetKnob();
}

bindJoystick(document.getElementById("joystick-move"), moveInput, null);
bindJoystick(document.getElementById("joystick-aim"), aimInput, (vector) => {
  if (Math.abs(vector.x) > 0.08) {
    cameraYaw -= vector.x * 0.065;
  }
  if (Math.abs(vector.y) > 0.08) {
    cameraPitch += vector.y * 0.04;
    cameraPitch = Math.max(-0.45, Math.min(1.15, cameraPitch));
  }
});

function clampToArena(position, yLocked) {
  const lower = (activeMapType || "").toLowerCase();
  if (lower.includes("desert") || lower.includes("sands")) {
    position.x = Math.max(-15.5, Math.min(15.5, position.x));
    position.z = Math.max(-41.5, Math.min(41.5, position.z));
    return;
  }
  if (lower.includes("swamp")) {
    position.x = Math.max(-33.5, Math.min(33.5, position.x));
    position.z = Math.max(-33.5, Math.min(33.5, position.z));
    return;
  }
  if (lower.includes("village") || lower.includes("overgrown")) {
    position.x = Math.max(-28.2, Math.min(28.2, position.x));
    position.z = Math.max(-28.2, Math.min(28.2, position.z));
    return;
  }
  const maxBound = 65;
  if (Math.abs(position.x) > maxBound) {
    position.x = Math.sign(position.x) * maxBound;
  }
  if (Math.abs(position.z) > maxBound) {
    position.z = Math.sign(position.z) * maxBound;
  }
  if (yLocked && !lower.includes("magma") && !lower.includes("clockwork")) {
    position.y = 0;
  }
}

function collectPositions() {
  const positions = new Map();
  avatars.forEach((avatar, id) => {
    positions.set(id, {
      x: avatar.mesh.position.x,
      y: PLAYER_HEIGHT * 0.5,
      z: avatar.mesh.position.z
    });
  });
  return positions;
}

function onVictimPacket(target, packet) {
  outgoingHits.push(packet);
  const local = getLocalPlayer();
  if (local && target.id === local.id) {
    const fighter = getAllFighters().get(local.id);
    applyIncomingHit(fighter, packet);
  }
}

function fireAbility(kind) {
  const player = getLocalPlayer();
  if (!player || !gameStarted) {
    return;
  }
  const avatar = avatars.get(player.id);
  const fighter = getAllFighters().get(player.id);
  if (!avatar || !fighter) {
    return;
  }
  if (document.pointerLockElement) {
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() > 0.0001) {
      avatar.mesh.rotation.y = Math.atan2(cameraForward.x, cameraForward.z);
    }
  }
  const origin = {
    x: avatar.mesh.position.x,
    y: PLAYER_HEIGHT * 0.5,
    z: avatar.mesh.position.z
  };
  const facing = avatar.mesh.rotation.y;
  const positions = collectPositions();
  if (kind === "primary") {
    tryPrimary(fighter, origin, facing, positions, onVictimPacket);
  } else if (kind === "skill1") {
    trySkill1(fighter, origin, facing, positions, onVictimPacket);
  } else if (kind === "skill2") {
    trySkill2(fighter, origin, facing, positions, onVictimPacket);
  }
}

window.addEventListener("mousedown", (event) => {
  if (!gameStarted || event.button !== 0) {
    return;
  }
  if (event.target.closest("#lobby, #mobile-controls, #hud")) {
    return;
  }
  fireAbility("primary");
});

window.addEventListener("keydown", (event) => {
  if (!gameStarted) {
    return;
  }
  if (event.repeat) {
    return;
  }
  if (event.code === "KeyQ") {
    fireAbility("skill1");
  }
  if (event.code === "KeyE") {
    fireAbility("skill2");
  }
});

["btn-primary", "btn-skill1", "btn-skill2"].forEach((id, index) => {
  const button = document.getElementById(id);
  if (!button) {
    return;
  }
  const kinds = ["primary", "skill1", "skill2"];
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    fireAbility(kinds[index]);
  });
});

function lerpAngle(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) {
    diff -= Math.PI * 2;
  }
  while (diff < -Math.PI) {
    diff += Math.PI * 2;
  }
  return from + diff * t;
}

function followLocalPlayer(avatar, dt) {
  if (!avatar) {
    return;
  }
  const pos = avatar.mesh.position;
  const horizontalDist = CAMERA_OFFSET_Z * Math.cos(cameraPitch);
  const verticalDist = CAMERA_OFFSET_Z * Math.sin(cameraPitch);

  cameraGoal.set(
    pos.x + Math.sin(cameraYaw) * horizontalDist,
    pos.y + CAMERA_OFFSET_Y + verticalDist,
    pos.z + Math.cos(cameraYaw) * horizontalDist
  );

  const t = 1 - Math.exp(-CAMERA_LERP * dt);
  camera.position.lerp(cameraGoal, t);

  lookTarget.set(pos.x, pos.y + 1.4, pos.z);
  camera.lookAt(lookTarget);
  sun.target.position.copy(pos);
}

function mergeRemoteFighter(player) {
  const data = player.getState("fighter");
  if (!data) {
    return getAllFighters().get(player.id);
  }
  let fighter = getAllFighters().get(player.id);
  if (!fighter) {
    fighter = createFighterState(player.id, data.classId || "rogue", data.team || 0);
    upsertFighter(fighter);
  }
  fighter.classId = data.classId || fighter.classId;
  fighter.team = data.team;
  fighter.hp = data.hp;
  fighter.maxHp = data.maxHp;
  fighter.state = data.state;
  fighter.reviveMeter = data.reviveMeter;
  fighter.isInvulnerable = data.isInvulnerable;
  fighter.isCharging = data.isCharging;
  fighter.isPinned = data.isPinned;
  fighter.pinnedBy = data.pinnedBy;
  fighter.pinnedEnemies = Array.isArray(data.pinnedEnemies) ? data.pinnedEnemies.slice() : [];
  fighter.wildShape = data.wildShape;
  fighter.veilArmed = data.veilArmed;
  fighter.opacity = data.opacity;
  fighter.anim = data.anim;
  fighter.chargeUntil = data.chargeUntil;
  fighter.rootUntil = data.rootUntil;
  fighter.warpSlow = data.warpSlow;
  return fighter;
}

function applyVisualState(avatar, fighter) {
  applyMeshDownedScale(avatar.mesh, fighter.state === "downed");
  const baseScale = fighter.wildShape ? 1.35 : 1;
  avatar.mesh.scale.x = baseScale;
  avatar.mesh.scale.z = baseScale;
  AssetManager.tintOpacity(avatar.mesh, fighter.opacity == null ? 1 : fighter.opacity);
  if (fighter.wildShape && avatar.mesh.userData.body) {
    avatar.mesh.userData.body.material.color.setHex(0x6f4e37);
  } else if (avatar.mesh.userData.body) {
    avatar.mesh.userData.body.material.color.setHex(CLASS_COLORS[fighter.classId] || 0xffffff);
  }
  const moving = avatar.rig && avatar.rig.current;
  const desired = fighter.anim || "Idle";
  if (fighter.state === "downed") {
    avatar.rig.play("Downed");
  } else if (desired === "Attack") {
    avatar.rig.play("Attack");
  } else if (moving) {
    avatar.rig.play(desired);
  }
  void moving;
}

function pullIncomingHits(localFighter) {
  const players = getConnectedPlayers();
  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    if (isPlayerLocal(player)) {
      continue;
    }
    const hits = player.getState("lastHits");
    if (!Array.isArray(hits)) {
      continue;
    }
    for (let h = 0; h < hits.length; h += 1) {
      applyIncomingHit(localFighter, hits[h]);
    }
  }
}

function updateLocalPlayer(dt) {
  const player = getLocalPlayer();
  if (!player) {
    return null;
  }
  const avatar = avatars.get(player.id);
  const fighter = getAllFighters().get(player.id);
  if (!avatar || !fighter) {
    return null;
  }

  pullIncomingHits(fighter);
  tickTimers(fighter, dt);
  tickDots(fighter, dt);

  const positions = collectPositions();
  computeWarpSlow(fighter, positions.get(player.id) || avatar.mesh.position);
  tickVanguardCharge(fighter, positions.get(player.id), avatar.mesh.rotation.y, positions, dt, onVictimPacket);
  tickWorld(dt, positions, onVictimPacket, currentMapData ? currentMapData.obstacleBoxes : []);

  const pinning = findPinningPaladin(player.id);
  if (pinning && pinning.id !== player.id) {
    const paladinAvatar = avatars.get(pinning.id);
    if (paladinAvatar) {
      const facing = paladinAvatar.mesh.rotation.y;
      avatar.mesh.position.x = paladinAvatar.mesh.position.x + Math.sin(facing) * 1.2;
      avatar.mesh.position.z = paladinAvatar.mesh.position.z + Math.cos(facing) * 1.2;
      fighter.isPinned = true;
      fighter.pinnedBy = pinning.id;
      fighter.anim = "Idle";
      clampToArena(avatar.mesh.position, false);
      applyVisualState(avatar, fighter);
      avatar.rig.update(dt);
      return avatar;
    }
  } else if (fighter.isPinned && !pinning) {
    fighter.isPinned = false;
    fighter.pinnedBy = null;
  }

  const keyboard = readKeyboardMove();
  const inputX = Math.abs(moveInput.x) + Math.abs(moveInput.y) > 0.02 ? moveInput.x : keyboard.x;
  const inputZ = Math.abs(moveInput.x) + Math.abs(moveInput.y) > 0.02 ? moveInput.y : keyboard.y;

  camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;
  if (cameraForward.lengthSq() < 0.0001) {
    cameraForward.set(0, 0, -1);
  } else {
    cameraForward.normalize();
  }
  cameraRight.crossVectors(cameraForward, worldUp).normalize();

  desiredMove
    .set(0, 0, 0)
    .addScaledVector(cameraRight, inputX)
    .addScaledVector(cameraForward, inputZ);

  if (desiredMove.lengthSq() > 1) {
    desiredMove.normalize();
  }

  const speed = getMoveSpeed(fighter);
  let moveX = 0;
  let moveZ = 0;

  if (fighter.sidestepUntil > 0) {
    moveX += fighter.sidestepVx * dt;
    moveZ += fighter.sidestepVz * dt;
  } else if (desiredMove.lengthSq() > 0.0001 && !fighter.isPinned) {
    moveX += desiredMove.x * speed * dt;
    moveZ += desiredMove.z * speed * dt;
  }

  if (fighter.knockbackUntil > 0) {
    moveX += fighter.knockbackX * dt;
    moveZ += fighter.knockbackZ * dt;
  }

  if (Math.abs(avatar.velocity.x) > 0.01) {
    moveX += avatar.velocity.x * dt;
    avatar.velocity.x *= Math.exp(-2.2 * dt);
  }
  if (Math.abs(avatar.velocity.z) > 0.01) {
    moveZ += avatar.velocity.z * dt;
    avatar.velocity.z *= Math.exp(-2.2 * dt);
  }

  // Pass obstacleBoxes to block movement from passing through instanced trees/rocks
  const obstacles = currentMapData ? currentMapData.obstacleBoxes : [];
  const pos = avatar.mesh.position;

  if (Math.abs(moveX) > 0.00001) {
    const nextX = pos.x + moveX;
    let blockedX = false;
    for (let i = 0; i < obstacles.length; i += 1) {
      const b = obstacles[i];
      if (
        nextX >= b.min.x - PLAYER_RADIUS &&
        nextX <= b.max.x + PLAYER_RADIUS &&
        pos.z >= b.min.z - PLAYER_RADIUS &&
        pos.z <= b.max.z + PLAYER_RADIUS &&
        pos.y + 1.2 >= b.min.y &&
        pos.y <= b.max.y
      ) {
        blockedX = true;
        break;
      }
    }
    if (!blockedX) {
      pos.x = nextX;
    }
  }

  if (Math.abs(moveZ) > 0.00001) {
    const nextZ = pos.z + moveZ;
    let blockedZ = false;
    for (let i = 0; i < obstacles.length; i += 1) {
      const b = obstacles[i];
      if (
        pos.x >= b.min.x - PLAYER_RADIUS &&
        pos.x <= b.max.x + PLAYER_RADIUS &&
        nextZ >= b.min.z - PLAYER_RADIUS &&
        nextZ <= b.max.z + PLAYER_RADIUS &&
        pos.y + 1.2 >= b.min.y &&
        pos.y <= b.max.y
      ) {
        blockedZ = true;
        break;
      }
    }
    if (!blockedZ) {
      pos.z = nextZ;
    }
  }

  // Gravity & Continuous Floor Collision with Spawn Clipping Failsafe
  if (!MapGenerator.isLoaded) {
    // Failsafe: gravity is 0 and Y-velocity is frozen until MapGenerator.isLoaded === true
    avatar.velocity.y = 0;
    if (pos.y < 25) {
      pos.y = 25;
    }
    avatar.isGrounded = false;
  } else {
    const GRAVITY = -32;
    const prevY = pos.y;
    avatar.velocity.y += GRAVITY * dt;
    const nextY = pos.y + avatar.velocity.y * dt;

    // Ensure floor THREE.Box3 is generated before physics loop starts applying gravity
    const platforms = (currentMapData && currentMapData.platformBoxes && currentMapData.platformBoxes.length > 0)
      ? currentMapData.platformBoxes
      : [new THREE.Box3(new THREE.Vector3(-60, -10, -60), new THREE.Vector3(60, 0, 60))];

    let groundY = -Infinity;
    for (let i = 0; i < platforms.length; i += 1) {
      const p = platforms[i];
      if (pos.x >= p.min.x && pos.x <= p.max.x && pos.z >= p.min.z && pos.z <= p.max.z) {
        if (prevY >= p.max.y - 0.5 && nextY <= p.max.y) {
          if (p.max.y > groundY) {
            groundY = p.max.y;
          }
        } else if (nextY >= p.min.y && nextY <= p.max.y) {
          if (p.max.y > groundY) {
            groundY = p.max.y;
          }
        }
      }
    }

    if (groundY !== -Infinity && nextY <= groundY) {
      pos.y = groundY;
      avatar.velocity.y = 0;
      avatar.isGrounded = true;
    } else {
      pos.y = nextY;
      avatar.isGrounded = false;
    }
  }

  // Call CombatSystem.updateHazards()
  CombatSystem.updateHazards(avatar, currentMapData, dt);

  // Falloff Failsafe: If player.position.y < -50, teleport to 0, 25, 0 and subtract 20% Max HP
  if (pos.y < -50) {
    pos.set(0, 25, 0);
    avatar.velocity.set(0, 0, 0);
    if (fighter && fighter.state === "alive") {
      const penalty = Math.round(fighter.maxHp * 0.2);
      fighter.hp = Math.max(1, fighter.hp - penalty);
    }
  }

  if (aimInput.lengthSq() > 0.08) {
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.crossVectors(cameraForward, worldUp).normalize();
    const aimX = cameraRight.x * aimInput.x + cameraForward.x * aimInput.y;
    const aimZ = cameraRight.z * aimInput.x + cameraForward.z * aimInput.y;
    avatar.mesh.rotation.y = Math.atan2(aimX, aimZ);
  } else if (desiredMove.lengthSq() > 0.0001 && fighter.sidestepUntil <= 0) {
    // Omnidirectional WASD: avatar faces the direction of desired movement (allows walking towards camera)
    avatar.mesh.rotation.y = Math.atan2(desiredMove.x, desiredMove.z);
  }

  clampToArena(avatar.mesh.position, false);

  if (fighter.state === "downed") {
    fighter.anim = "Downed";
  } else if (fighter.attackUntil > 0) {
    fighter.anim = "Attack";
  } else if (desiredMove.lengthSq() > 0.04 || fighter.isCharging || fighter.sidestepUntil > 0) {
    fighter.anim = "Run";
  } else {
    fighter.anim = "Idle";
  }

  applyVisualState(avatar, fighter);
  avatar.rig.update(dt);
  return avatar;
}

function syncRemotePlayers(dt) {
  const players = getConnectedPlayers();
  const lerpT = 1 - Math.exp(-REMOTE_LERP * dt);
  refreshPlayerHud();

  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    if (isPlayerLocal(player)) {
      continue;
    }
    let avatar = avatars.get(player.id);
    if (!avatar) {
      avatar = createAvatar(player);
    }
    const fighter = mergeRemoteFighter(player);
    const pos = player.getState("pos");
    const rot = player.getState("rot");
    if (pos) {
      avatar.targetPos.set(pos.x, (pos.y !== undefined ? pos.y - PLAYER_HEIGHT * 0.5 : 0), pos.z);
      avatar.mesh.position.x = THREE.MathUtils.lerp(avatar.mesh.position.x, avatar.targetPos.x, lerpT);
      avatar.mesh.position.y = THREE.MathUtils.lerp(avatar.mesh.position.y, avatar.targetPos.y, lerpT);
      avatar.mesh.position.z = THREE.MathUtils.lerp(avatar.mesh.position.z, avatar.targetPos.z, lerpT);
    }
    if (typeof rot === "number") {
      avatar.targetRot = rot;
      avatar.mesh.rotation.y = lerpAngle(avatar.mesh.rotation.y, avatar.targetRot, lerpT);
    }
    applyVisualState(avatar, fighter);
    avatar.rig.update(dt);
  }
}

function syncFxMesh(map, id, factory) {
  let mesh = map.get(id);
  if (!mesh) {
    mesh = factory();
    scene.add(mesh);
    map.set(id, mesh);
  }
  return mesh;
}

function renderWorldFx() {
  const live = new Set();
  const shots = getProjectiles();
  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    live.add(shot.id);
    const mesh = syncFxMesh(fxMeshes, shot.id, () => {
      return new THREE.Mesh(
        projectileGeom,
        new THREE.MeshStandardMaterial({
          color: shot.color,
          emissive: shot.color,
          emissiveIntensity: 0.7
        })
      );
    });
    mesh.position.set(shot.x, shot.y, shot.z);
  }

  const zones = getZones();
  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i];
    live.add(zone.id);
    const mesh = syncFxMesh(fxMeshes, zone.id, () => {
      const material = new THREE.MeshStandardMaterial({
        color: 0x4cc9f0,
        transparent: true,
        opacity: 0.32,
        emissive: 0x4cc9f0,
        emissiveIntensity: 0.4
      });
      const m = new THREE.Mesh(zoneGeom, material);
      return m;
    });
    mesh.scale.set(zone.radius, 1, zone.radius);
    mesh.position.set(zone.x, 0.08, zone.z);
  }

  const traps = getTraps();
  for (let i = 0; i < traps.length; i += 1) {
    const trap = traps[i];
    live.add(trap.id);
    const mesh = syncFxMesh(fxMeshes, trap.id, () => {
      return new THREE.Mesh(
        trapGeom,
        new THREE.MeshStandardMaterial({
          color: 0x40916c,
          emissive: 0x2d6a4f,
          emissiveIntensity: 0.5
        })
      );
    });
    mesh.scale.set(trap.radius, 1, trap.radius);
    mesh.position.set(trap.x, 0.06, trap.z);
  }

  const players = getConnectedPlayers();
  for (let p = 0; p < players.length; p += 1) {
    if (isPlayerLocal(players[p])) {
      continue;
    }
    const fx = players[p].getState("fx");
    if (!fx) {
      continue;
    }
    const remoteShots = fx.projectiles || [];
    for (let i = 0; i < remoteShots.length; i += 1) {
      const shot = remoteShots[i];
      live.add(shot.id);
      const mesh = syncFxMesh(fxMeshes, shot.id, () => {
        return new THREE.Mesh(
          projectileGeom,
          new THREE.MeshStandardMaterial({
            color: shot.color || 0xffffff,
            emissive: shot.color || 0xffffff,
            emissiveIntensity: 0.7
          })
        );
      });
      mesh.position.set(shot.x, shot.y, shot.z);
    }
    const remoteZones = fx.zones || [];
    for (let i = 0; i < remoteZones.length; i += 1) {
      const zone = remoteZones[i];
      live.add(zone.id);
      const mesh = syncFxMesh(fxMeshes, zone.id, () => {
        return new THREE.Mesh(
          zoneGeom,
          new THREE.MeshStandardMaterial({
            color: 0x4cc9f0,
            transparent: true,
            opacity: 0.32
          })
        );
      });
      mesh.scale.set(zone.radius || 4, 1, zone.radius || 4);
      mesh.position.set(zone.x, 0.08, zone.z);
    }
    const remoteTraps = fx.traps || [];
    for (let i = 0; i < remoteTraps.length; i += 1) {
      const trap = remoteTraps[i];
      live.add(trap.id);
      const mesh = syncFxMesh(fxMeshes, trap.id, () => {
        return new THREE.Mesh(
          trapGeom,
          new THREE.MeshStandardMaterial({ color: 0x40916c })
        );
      });
      mesh.scale.set(trap.radius || 1.6, 1, trap.radius || 1.6);
      mesh.position.set(trap.x, 0.06, trap.z);
    }
  }

  fxMeshes.forEach((mesh, id) => {
    if (!live.has(id)) {
      scene.remove(mesh);
      fxMeshes.delete(id);
    }
  });
}

function updateHud(fighter) {
  if (!fighter) {
    return;
  }
  const fill = document.getElementById("hp-fill");
  const text = document.getElementById("hp-text");
  const klass = document.getElementById("hud-class");
  const state = document.getElementById("hud-state");
  const ratio = Math.max(0, fighter.hp) / Math.max(fighter.maxHp, 1);
  if (fill) {
    fill.style.width = `${Math.round(ratio * 100)}%`;
  }
  if (text) {
    text.textContent = `${Math.ceil(Math.max(0, fighter.hp))}/${fighter.maxHp}`;
  }
  if (klass) {
    klass.textContent = getClassDef(fighter.classId).name.toUpperCase();
  }
  if (state) {
    if (fighter.state === "downed") {
      state.textContent = `DOWNED ${Math.min(100, fighter.reviveMeter)}%`;
    } else if (fighter.isCharging) {
      state.textContent = `CHARGING ${fighter.pinnedEnemies.length} PINNED`;
    } else if (fighter.isPinned) {
      state.textContent = "PINNED";
    } else {
      state.textContent = "ALIVE";
    }
  }
  const def = getClassDef(fighter.classId);
  const s1 = document.getElementById("btn-skill1");
  const s2 = document.getElementById("btn-skill2");
  const p = document.getElementById("btn-primary");
  if (s1) {
    s1.textContent = fighter.cooldowns.skill1 > 0 ? `${fighter.cooldowns.skill1.toFixed(1)}` : def.skill1;
    s1.classList.toggle("cooling", fighter.cooldowns.skill1 > 0);
  }
  if (s2) {
    s2.textContent = fighter.cooldowns.skill2 > 0 ? `${fighter.cooldowns.skill2.toFixed(1)}` : def.skill2;
    s2.classList.toggle("cooling", fighter.cooldowns.skill2 > 0);
  }
  if (p) {
    p.classList.toggle("cooling", fighter.cooldowns.primary > 0);
  }
}

function pushLocalNetworkState(avatar) {
  const player = getLocalPlayer();
  if (!player || !avatar) {
    return;
  }
  const fighter = getAllFighters().get(player.id);
  publishLocalPose(player, {
    x: avatar.mesh.position.x,
    y: avatar.mesh.position.y + PLAYER_HEIGHT * 0.5,
    z: avatar.mesh.position.z
  }, avatar.mesh.rotation.y);
  if (fighter) {
    publishCombat(player, serializeFighter(fighter), outgoingHits, snapshotWorld());
    outgoingHits = [];
  }
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

window.addEventListener("resize", onResize);

window.addEventListener("keydown", (event) => {
  if (event.code === "Digit1") {
    loadMap("Desert");
  } else if (event.code === "Digit2") {
    loadMap("Village");
  } else if (event.code === "Digit3") {
    loadMap("Swamp");
  } else if (event.code === "Digit4") {
    loadMap("magma");
  }
});

function initPointerLockControls() {
  const hostBtn = document.getElementById("btn-host");
  const joinBtn = document.getElementById("btn-join");
  const lockPointer = () => {
    try {
      document.body.requestPointerLock();
    } catch (e) {}
  };
  if (hostBtn) hostBtn.addEventListener("click", lockPointer);
  if (joinBtn) joinBtn.addEventListener("click", lockPointer);

  canvas.addEventListener("click", () => {
    if (gameStarted && !document.pointerLockElement) {
      lockPointer();
    }
  });

  window.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement) {
      const MOUSE_SENSITIVITY = 0.0024;
      cameraYaw -= event.movementX * MOUSE_SENSITIVITY;
      cameraPitch -= event.movementY * MOUSE_SENSITIVITY;
      cameraPitch = Math.max(-0.45, Math.min(1.15, cameraPitch));
    }
  });
}

export function showWinLossOverlay(type) {
  const overlay = document.getElementById("win-loss-overlay");
  const title = document.getElementById("banner-title");
  const subtitle = document.getElementById("banner-subtitle");
  if (!overlay) return;

  overlay.classList.remove("overlay-hidden", "state-win", "state-loss");
  document.body.classList.remove("game-over-loss");

  if (type === "win") {
    overlay.classList.add("state-win");
    if (title) title.textContent = "YOU WIN";
    if (subtitle) subtitle.textContent = "Glory to the Realm · Victory Achieved";
  } else {
    overlay.classList.add("state-loss");
    document.body.classList.add("game-over-loss");
    if (title) title.textContent = "YOU LOST";
    if (subtitle) subtitle.textContent = "Fallen in Combat · The Realm Has Fallen";
  }

  if (document.exitPointerLock) {
    try {
      document.exitPointerLock();
    } catch (e) {}
  }
}
window.showWinLossOverlay = showWinLossOverlay;

export function hideWinLossOverlay() {
  const overlay = document.getElementById("win-loss-overlay");
  if (overlay) {
    overlay.classList.add("overlay-hidden");
    overlay.classList.remove("state-win", "state-loss");
  }
  document.body.classList.remove("game-over-loss");
}
window.hideWinLossOverlay = hideWinLossOverlay;

const bannerBtn = document.getElementById("btn-banner-action");
if (bannerBtn) {
  bannerBtn.addEventListener("click", () => {
    hideWinLossOverlay();
    window.location.reload();
  });
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  // Pause background rendering updates if server browser is open
  if (window.isServerBrowserOpen) {
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  if (currentMapData && currentMapData.update) {
    currentMapData.update(dt, now / 1000);
  }

  // Lobby 3D Scene Animation & Camera Position Lock
  if ((window.gameState === "TITLE_SCREEN" || window.gameState === "LOBBY") && !gameStarted) {
    LobbyEnvironment.update(dt, now / 1000);
  }

  let localAvatar = null;
  if (gameStarted && assetsReady) {
    localAvatar = updateLocalPlayer(dt);
    followLocalPlayer(localAvatar, dt);
    syncRemotePlayers(dt);
    renderWorldFx();
    const local = getLocalPlayer();
    if (local) {
      const localFighter = getAllFighters().get(local.id);
      updateHud(localFighter);
      // Win/Loss Condition Check
      if (localFighter && localFighter.hp <= 0 && localFighter.state === "downed" && !window._outcomeTriggered) {
        window._outcomeTriggered = true;
        setTimeout(() => showWinLossOverlay("loss"), 1200);
      }
    }
    networkAccumulator += dt;
    if (networkAccumulator >= NETWORK_INTERVAL) {
      networkAccumulator = 0;
      pushLocalNetworkState(localAvatar);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener("cosmic-clash-start", () => {
  gameStarted = true;
  window.gameState = "IN_GAME";
  LobbyEnvironment.dispose();

  let targetMap = "Desert";
  if (window.Playroom && typeof window.Playroom.getState === "function") {
    const syncd = window.Playroom.getState("selectedMap");
    if (syncd) {
      targetMap = syncd;
    }
  } else if (selectedMap) {
    targetMap = selectedMap;
  }
  loadMap(targetMap);

  const masterUi = document.getElementById("master-ui");
  if (masterUi) {
    masterUi.style.display = "none";
  }
  document.querySelectorAll(".debug, #debug, [data-debug], #server-browser-hint, #lobby-status, #room-code-display").forEach((el) => {
    el.style.display = "none";
  });

  const mobile = document.getElementById("mobile-controls");
  if (mobile) {
    mobile.hidden = false;
  }
  getConnectedPlayers().forEach((player) => {
    let avatar = avatars.get(player.id);
    if (!avatar) {
      avatar = createAvatar(player);
    }
    if (isPlayerLocal(player)) {
      avatar.mesh.position.y = 25;
      avatar.velocity.set(0, 0, 0);
      avatar.isGrounded = false;
    }
  });
});

window.addEventListener("cosmic-clash-map-change", (event) => {
  if (gameStarted) {
    loadMap(event.detail);
  }
});

async function boot() {
  initPointerLockControls();
  window._threeScene = scene;
  window._threeCamera = camera;
  LobbyEnvironment.init(scene, camera);

  // Ensure the floor THREE.Box3 is generated before physics loop starts applying gravity
  currentMapData = MapGenerator.loadMap(scene, 'Desert');

  // Initial title screen state & diorama
  window.gameState = "TITLE_SCREEN";
  LobbyEnvironment.loadRoom(selectedClass || "rogue", AssetManager.envModels);

  bindJoinHandlers();
  initLobby();
  requestAnimationFrame(frame);

  await AssetManager.loadModels();
  assetsReady = true;

  // Place initial character model in center of diorama once assets ready
  if (window.gameState !== "IN_GAME") {
    LobbyEnvironment.setCharacter(selectedClass || "rogue");
  }
}

boot();
