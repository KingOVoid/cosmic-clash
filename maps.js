import * as THREE from "three";

export class SharedLobby {
  static currentLobby = null;
  static isLoaded = true;

  static ensureLighting(scene) {
    if (!scene) return;
    let hasAmbient = false;
    let hasDirectional = false;
    scene.traverse((obj) => {
      if (obj.isAmbientLight) {
        hasAmbient = true;
        obj.color.setHex(0xffffff);
        obj.intensity = Math.max(obj.intensity, 1.5);
      }
      if (obj.isDirectionalLight) {
        hasDirectional = true;
        obj.color.setHex(0xffffff);
        obj.intensity = Math.max(obj.intensity, 2.2);
      }
    });

    if (!hasAmbient) {
      const ambient = new THREE.AmbientLight(0xffffff, 1.5);
      ambient.name = "roundtable-ambient";
      scene.add(ambient);
    }
    if (!hasDirectional) {
      const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
      dirLight.name = "roundtable-sun";
      dirLight.position.set(20, 50, 20);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(1024, 1024);
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 120;
      dirLight.shadow.camera.left = -50;
      dirLight.shadow.camera.right = 50;
      dirLight.shadow.camera.top = 50;
      dirLight.shadow.camera.bottom = -50;
      scene.add(dirLight);
    }
  }

  static build(scene) {
    if (SharedLobby.currentLobby && SharedLobby.currentLobby.dispose) {
      try {
        SharedLobby.currentLobby.dispose();
      } catch (e) {}
      SharedLobby.currentLobby = null;
    }

    const group = new THREE.Group();
    group.name = "roundtable-lobby";
    scene.add(group);

    scene.background = new THREE.Color(0x181a20);
    scene.fog = new THREE.FogExp2(0x181a20, 0.003);

    SharedLobby.ensureLighting(scene);

    const platformBoxes = [];
    const obstacleBoxes = [];

    // ==========================================
    // 1. CENTRAL CIRCULAR FLOOR (radius 40, dark grey)
    // ==========================================
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x272930,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true
    });
    // Radius 40, height 2, top at y = 0
    const floorGeom = new THREE.CylinderGeometry(40, 40, 2, 64);
    const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
    floorMesh.position.set(0, -1, 0);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Floor collision box covering radius 40
    platformBoxes.push(new THREE.Box3(
      new THREE.Vector3(-41, -5, -41),
      new THREE.Vector3(41, 0, 41)
    ));

    // Outer rim / boundary pillars around radius 40 to visually mark room edge
    const outerWallMat = new THREE.MeshStandardMaterial({
      color: 0x1f2127,
      roughness: 0.9,
      metalness: 0.1
    });
    const rimPillarGeo = new THREE.BoxGeometry(2.5, 4, 2.5);
    const numRimPillars = 40;
    for (let i = 0; i < numRimPillars; i++) {
      const angle = (i / numRimPillars) * Math.PI * 2;
      const x = Math.cos(angle) * 40;
      const z = Math.sin(angle) * 40;
      const p = new THREE.Mesh(rimPillarGeo, outerWallMat);
      p.position.set(x, 2, z);
      p.rotation.y = -angle;
      p.castShadow = true;
      p.receiveShadow = true;
      group.add(p);
    }

    // 4 invisible perimeter walls for physics safety
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-45, -2, 39), new THREE.Vector3(45, 20, 45))); // North
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-45, -2, -45), new THREE.Vector3(45, 20, -39))); // South
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(39, -2, -45), new THREE.Vector3(45, 20, 45))); // East
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-45, -2, -45), new THREE.Vector3(-39, 20, 45))); // West

    // ==========================================
    // CENTRAL ROUNDTABLE DAIS & BRAZIER
    // ==========================================
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x3d352e,
      roughness: 0.7,
      metalness: 0.2
    });
    const tableMesh = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 1.2, 32), tableMat);
    tableMesh.position.set(0, 0.6, 0);
    tableMesh.castShadow = true;
    tableMesh.receiveShadow = true;
    group.add(tableMesh);
    platformBoxes.push(new THREE.Box3(new THREE.Vector3(-7, 0, -7), new THREE.Vector3(7, 1.2, 7)));

    // Central embers / brazier
    const brazierMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const brazier = new THREE.Mesh(new THREE.CylinderGeometry(2, 1.5, 0.8, 16), brazierMat);
    brazier.position.set(0, 1.6, 0);
    group.add(brazier);

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 8), flameMat);
    flame.position.set(0, 2.4, 0);
    group.add(flame);

    const centerLight = new THREE.PointLight(0xff7700, 3.0, 35);
    centerLight.position.set(0, 3, 0);
    group.add(centerLight);

    // ==========================================
    // 2. THE FOUR THEMATIC CORNERS
    // ==========================================

    // --- CORNER 1: DRUID (Green cylinder area with cone trees) ---
    const druidCenter = new THREE.Vector3(22, 0, -22);
    const druidMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 });
    const druidDais = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.5, 32), druidMat);
    druidDais.position.set(druidCenter.x, 0.25, druidCenter.z);
    druidDais.receiveShadow = true;
    group.add(druidDais);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.75, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.9 });
    const treeOffsets = [
      [-6, -6, 2.5, 9], [6, -6, 3.0, 10], [-6, 6, 2.2, 8], [6, 6, 2.8, 9], [0, -8, 3.2, 11]
    ];
    treeOffsets.forEach(([dx, dz, r, h]) => {
      const tx = druidCenter.x + dx;
      const tz = druidCenter.z + dz;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.35, h * 0.35, 8), trunkMat);
      trunk.position.set(tx, h * 0.175, tz);
      trunk.castShadow = true;
      group.add(trunk);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.8, 8), leafMat);
      cone.position.set(tx, h * 0.35 + h * 0.4, tz);
      cone.castShadow = true;
      group.add(cone);
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(tx - r * 0.5, 0, tz - r * 0.5),
        new THREE.Vector3(tx + r * 0.5, h, tz + r * 0.5)
      ));
    });
    const druidLight = new THREE.PointLight(0x2ecc71, 3.5, 35);
    druidLight.position.set(druidCenter.x, 6, druidCenter.z);
    group.add(druidLight);

    // --- CORNER 2: SORCERER (Purple box area with floating runes) ---
    const sorcCenter = new THREE.Vector3(-22, 0, -22);
    const sorcMat = new THREE.MeshStandardMaterial({ color: 0x2a164d, roughness: 0.7 });
    const sorcDais = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 18), sorcMat);
    sorcDais.position.set(sorcCenter.x, 0.25, sorcCenter.z);
    sorcDais.receiveShadow = true;
    group.add(sorcDais);

    const runeMat = new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: 0x9333ea,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      metalness: 0.4
    });
    const runeConfigs = [
      { dx: 0, dz: 0, y: 5.5, r: 3.2, tube: 0.45, rot: [Math.PI / 3, 0, 0] },
      { dx: -5, dz: -5, y: 4.0, r: 2.0, tube: 0.3, rot: [0.4, 0.6, 0] },
      { dx: 5, dz: -5, y: 4.0, r: 2.0, tube: 0.3, rot: [-0.4, -0.6, 0] },
      { dx: -5, dz: 5, y: 4.0, r: 1.8, tube: 0.25, rot: [Math.PI / 2, 0, 0.3] },
      { dx: 5, dz: 5, y: 4.0, r: 1.8, tube: 0.25, rot: [Math.PI / 2, 0, -0.3] }
    ];
    runeConfigs.forEach(cfg => {
      const rune = new THREE.Mesh(new THREE.TorusGeometry(cfg.r, cfg.tube, 16, 32), runeMat);
      rune.position.set(sorcCenter.x + cfg.dx, cfg.y, sorcCenter.z + cfg.dz);
      rune.rotation.set(...cfg.rot);
      group.add(rune);
    });
    const sorcLight = new THREE.PointLight(0xa855f7, 4.0, 35);
    sorcLight.position.set(sorcCenter.x, 6, sorcCenter.z);
    group.add(sorcLight);

    // --- CORNER 3: PALADIN (White pillars on marble dais) ---
    const palCenter = new THREE.Vector3(-22, 0, 22);
    const marbleFloorMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.3, metalness: 0.1 });
    const palDais = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.5, 32), marbleFloorMat);
    palDais.position.set(palCenter.x, 0.25, palCenter.z);
    palDais.receiveShadow = true;
    group.add(palDais);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.2, metalness: 0.05 });
    const pillarGeo = new THREE.CylinderGeometry(1.6, 1.8, 14, 24);
    const palPillars = [
      [-6, -6], [6, -6], [-6, 6], [6, 6], [0, 8]
    ];
    palPillars.forEach(([dx, dz]) => {
      const px = palCenter.x + dx;
      const pz = palCenter.z + dz;
      const pil = new THREE.Mesh(pillarGeo, pillarMat);
      pil.position.set(px, 7, pz);
      pil.castShadow = true;
      pil.receiveShadow = true;
      group.add(pil);
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(px - 1.8, 0, pz - 1.8),
        new THREE.Vector3(px + 1.8, 14, pz + 1.8)
      ));
    });
    const palLight = new THREE.PointLight(0xfef08a, 3.5, 35);
    palLight.position.set(palCenter.x, 6, palCenter.z);
    group.add(palLight);

    // --- CORNER 4: ROGUE (Black blocks on dark stone) ---
    const rogueCenter = new THREE.Vector3(22, 0, 22);
    const rogueFloorMat = new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.9 });
    const rogueDais = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 18), rogueFloorMat);
    rogueDais.position.set(rogueCenter.x, 0.25, rogueCenter.z);
    rogueDais.receiveShadow = true;
    group.add(rogueDais);

    const blackBlockMat = new THREE.MeshStandardMaterial({ color: 0x1f2024, roughness: 0.85, metalness: 0.2 });
    const blackBlocks = [
      { dx: -6, dz: -6, w: 4, h: 10, d: 4 },
      { dx: 6, dz: -6, w: 4, h: 12, d: 4 },
      { dx: -6, dz: 6, w: 4, h: 8, d: 4 },
      { dx: 6, dz: 6, w: 4, h: 11, d: 4 },
      { dx: 0, dz: 7, w: 6, h: 5, d: 3 }
    ];
    blackBlocks.forEach(b => {
      const bx = rogueCenter.x + b.dx;
      const bz = rogueCenter.z + b.dz;
      const block = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), blackBlockMat);
      block.position.set(bx, b.h * 0.5, bz);
      block.castShadow = true;
      block.receiveShadow = true;
      group.add(block);
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(bx - b.w * 0.5, 0, bz - b.d * 0.5),
        new THREE.Vector3(bx + b.w * 0.5, b.h, bz + b.d * 0.5)
      ));
    });
    const rogueLight = new THREE.PointLight(0xf97316, 2.8, 30);
    rogueLight.position.set(rogueCenter.x, 5, rogueCenter.z);
    group.add(rogueLight);

    // ==========================================
    // 10 Radial Spawn Points around center
    // ==========================================
    const spawnPoints = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      spawnPoints.push(new THREE.Vector3(
        Math.cos(angle) * 12,
        10, // spawn height: drop onto floor at y = 0
        Math.sin(angle) * 12
      ));
    }

    const lobbyData = {
      name: "Roundtable Hold",
      type: "roundtable",
      group,
      mesh: floorMesh,
      platformBoxes,
      obstacleBoxes,
      spawnPoints,
      dispose: () => {
        scene.remove(group);
      }
    };

    SharedLobby.currentLobby = lobbyData;
    SharedLobby.isLoaded = true;
    if (typeof window !== "undefined") {
      window.isMapLoaded = true;
    }

    return lobbyData;
  }
}

// Proxies for backwards compatibility with any legacy hooks
export const MapGenerator = {
  isLoaded: true,
  loadMap: (scene) => SharedLobby.build(scene),
  generate: (name, scene) => SharedLobby.build(scene),
  ensureLighting: (scene) => SharedLobby.ensureLighting(scene)
};

export const LobbyEnvironment = {
  init: () => {},
  loadRoom: () => {},
  setCharacter: () => {},
  update: () => {},
  dispose: () => {}
};
