import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltfLoader = new GLTFLoader();
const cachedTemplates = new Map();

async function getMeshTemplates(url) {
  if (cachedTemplates.has(url)) {
    return cachedTemplates.get(url);
  }
  try {
    const gltf = await gltfLoader.loadAsync(url);
    if (!gltf || !gltf.scene) {
      return [];
    }
    gltf.scene.updateMatrixWorld(true);
    const templates = [];
    gltf.scene.traverse((node) => {
      if (node.isMesh && node.geometry && node.material) {
        const geom = node.geometry.clone();
        geom.applyMatrix4(node.matrixWorld);
        node.castShadow = true;
        node.receiveShadow = true;
        templates.push({
          geometry: geom,
          material: node.material
        });
      }
    });
    cachedTemplates.set(url, templates);
    return templates;
  } catch (error) {
    console.warn("Could not load modular asset:", url, error);
    return [];
  }
}

async function createInstancedProp(url, transforms, parentGroup, obstacleBoxes = null, collisionRadius = 0, collisionHeight = 3) {
  const templates = await getMeshTemplates(url);
  if (!templates || templates.length === 0) return [];
  const dummy = new THREE.Object3D();
  const instancedList = [];

  for (const tpl of templates) {
    const count = transforms.length;
    const imesh = new THREE.InstancedMesh(tpl.geometry, tpl.material, count);
    imesh.castShadow = true;
    imesh.receiveShadow = true;

    for (let i = 0; i < count; i++) {
      const t = transforms[i];
      dummy.position.set(t.x || 0, t.y || 0, t.z || 0);
      if (t.rotX !== undefined || t.rotY !== undefined || t.rotZ !== undefined) {
        dummy.rotation.set(t.rotX || 0, t.rotY || 0, t.rotZ || 0);
      } else if (t.rot !== undefined) {
        dummy.rotation.set(0, t.rot, 0);
      } else {
        dummy.rotation.set(0, 0, 0);
      }

      if (typeof t.scale === "number") {
        dummy.scale.set(t.scale, t.scale, t.scale);
      } else if (t.scale) {
        dummy.scale.set(t.scale.x || 1, t.scale.y || 1, t.scale.z || 1);
      } else {
        dummy.scale.set(1, 1, 1);
      }

      dummy.updateMatrix();
      imesh.setMatrixAt(i, dummy.matrix);

      if (obstacleBoxes && collisionRadius > 0 && tpl === templates[0]) {
        const r = collisionRadius * (typeof t.scale === "number" ? t.scale : (t.scale ? t.scale.x : 1));
        const h = collisionHeight * (typeof t.scale === "number" ? t.scale : (t.scale ? t.scale.y : 1));
        obstacleBoxes.push(new THREE.Box3(
          new THREE.Vector3((t.x || 0) - r, t.y || 0, (t.z || 0) - r),
          new THREE.Vector3((t.x || 0) + r, (t.y || 0) + h, (t.z || 0) + r)
        ));
      }
    }

    imesh.instanceMatrix.needsUpdate = true;
    parentGroup.add(imesh);
    instancedList.push(imesh);
  }

  return instancedList;
}

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

    scene.background = new THREE.Color(0x14161d);
    scene.fog = new THREE.FogExp2(0x14161d, 0.0025);

    SharedLobby.ensureLighting(scene);

    const platformBoxes = [];
    const obstacleBoxes = [];

    // Continuous floor collision box covering radius 42 at y = 0
    platformBoxes.push(new THREE.Box3(
      new THREE.Vector3(-42, -5, -42),
      new THREE.Vector3(42, 0, 42)
    ));

    // Outer boundary collision boxes
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-45, -2, 39.5), new THREE.Vector3(45, 25, 46)));
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-45, -2, -46), new THREE.Vector3(45, 25, -39.5)));
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(39.5, -2, -45), new THREE.Vector3(46, 25, 45)));
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-46, -2, -45), new THREE.Vector3(-39.5, 25, 45)));

    // ==========================================
    // 1. BASE FOUNDATION SLAB (Continuous Floor)
    // ==========================================
    const floorFoundationMat = new THREE.MeshStandardMaterial({
      color: 0x1f2229,
      roughness: 0.9,
      metalness: 0.1
    });
    const floorMesh = new THREE.Mesh(new THREE.CylinderGeometry(40.5, 40.5, 2, 64), floorFoundationMat);
    floorMesh.position.set(0, -1.0, 0);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // ==========================================
    // 2. MODULAR STONE FLOOR TILES (Medieval Village Megakit)
    // ==========================================
    const floorTileTransforms = [];
    // Central tile
    floorTileTransforms.push({ x: 0, y: 0.02, z: 0, rot: 0, scale: 2.6 });
    // Concentric radial rings of stone tiles
    const ringRadii = [5, 10, 15, 20, 25, 30, 35, 38.5];
    const ringCounts = [6, 12, 18, 24, 30, 36, 42, 48];
    for (let rIdx = 0; rIdx < ringRadii.length; rIdx++) {
      const radius = ringRadii[rIdx];
      const count = ringCounts[rIdx];
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (rIdx * 0.25);
        floorTileTransforms.push({
          x: Math.cos(angle) * radius,
          y: 0.02,
          z: Math.sin(angle) * radius,
          rot: angle + Math.sin(i * 11) * 0.15,
          scale: 2.6
        });
      }
    }
    createInstancedProp("./assets/environment/Floor_UnevenBrick.gltf", floorTileTransforms, group);

    // ==========================================
    // 3. RING OF WALL SEGMENTS (Medieval Village Megakit)
    // ==========================================
    const wallTransforms = [];
    const wallCount = 44;
    const wallRadius = 39.8;
    for (let i = 0; i < wallCount; i++) {
      const angle = (i / wallCount) * Math.PI * 2;
      wallTransforms.push({
        x: Math.cos(angle) * wallRadius,
        y: 0,
        z: Math.sin(angle) * wallRadius,
        rot: -angle + Math.PI / 2,
        scale: { x: 2.9, y: 3.5, z: 2.9 }
      });
    }
    createInstancedProp("./assets/environment/Wall_UnevenBrick_Straight.gltf", wallTransforms, group);

    // ==========================================
    // 4. CENTRAL ROUNDTABLE & BRAZIER
    // ==========================================
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x3d352e, roughness: 0.7, metalness: 0.2 });
    const tableMesh = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 1.2, 32), tableMat);
    tableMesh.position.set(0, 0.6, 0);
    tableMesh.castShadow = true;
    tableMesh.receiveShadow = true;
    group.add(tableMesh);
    platformBoxes.push(new THREE.Box3(new THREE.Vector3(-7, 0, -7), new THREE.Vector3(7, 1.2, 7)));

    const brazierMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const brazier = new THREE.Mesh(new THREE.CylinderGeometry(2, 1.5, 0.8, 16), brazierMat);
    brazier.position.set(0, 1.6, 0);
    group.add(brazier);

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 8), flameMat);
    flame.position.set(0, 2.4, 0);
    group.add(flame);

    const centerLight = new THREE.PointLight(0xff7700, 3.2, 38);
    centerLight.position.set(0, 3, 0);
    group.add(centerLight);

    // ==========================================
    // 5. DRUID CORNER (Stylized Nature Megakit)
    // ==========================================
    const druidCenter = new THREE.Vector3(22, 0, -22);
    const druidDaisMat = new THREE.MeshStandardMaterial({ color: 0x24543d, roughness: 0.85 });
    const druidDais = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.35, 32), druidDaisMat);
    druidDais.position.set(druidCenter.x, 0.175, druidCenter.z);
    druidDais.receiveShadow = true;
    group.add(druidDais);

    // Trees (Birch & Pine)
    const druidTreeTransforms = [
      { x: druidCenter.x - 7, y: 0, z: druidCenter.z - 5, rot: 0.4, scale: 2.2 },
      { x: druidCenter.x + 6, y: 0, z: druidCenter.z - 6, rot: 1.2, scale: 2.4 },
      { x: druidCenter.x - 5, y: 0, z: druidCenter.z + 6, rot: 2.1, scale: 1.9 },
      { x: druidCenter.x + 7, y: 0, z: druidCenter.z + 5, rot: 3.5, scale: 2.1 },
      { x: druidCenter.x, y: 0, z: druidCenter.z - 8, rot: 4.8, scale: 2.5 },
      { x: druidCenter.x - 8, y: 0, z: druidCenter.z, rot: 5.2, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/BirchTree_1.gltf", druidTreeTransforms, group, obstacleBoxes, 0.7, 8);

    // Bushes
    const druidBushTransforms = [
      { x: druidCenter.x - 4, y: 0, z: druidCenter.z - 3, rot: 0.8, scale: 1.6 },
      { x: druidCenter.x + 4, y: 0, z: druidCenter.z - 4, rot: 1.9, scale: 1.8 },
      { x: druidCenter.x - 3, y: 0, z: druidCenter.z + 4, rot: 2.7, scale: 1.5 },
      { x: druidCenter.x + 4, y: 0, z: druidCenter.z + 3, rot: 3.4, scale: 1.7 },
      { x: druidCenter.x - 6, y: 0, z: druidCenter.z - 2, rot: 4.1, scale: 1.4 },
      { x: druidCenter.x + 2, y: 0, z: druidCenter.z - 7, rot: 5.0, scale: 1.5 },
      { x: druidCenter.x - 2, y: 0, z: druidCenter.z + 7, rot: 0.3, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/Bush.gltf", druidBushTransforms, group);

    // Rocks
    const druidRockTransforms = [
      { x: druidCenter.x - 2, y: 0, z: druidCenter.z - 2, rot: 0.5, scale: 1.3 },
      { x: druidCenter.x + 2, y: 0, z: druidCenter.z - 1, rot: 1.7, scale: 1.1 },
      { x: druidCenter.x - 1, y: 0, z: druidCenter.z + 2, rot: 2.4, scale: 1.4 },
      { x: druidCenter.x + 3, y: 0, z: druidCenter.z + 2, rot: 4.2, scale: 1.2 },
      { x: druidCenter.x - 5, y: 0, z: druidCenter.z + 3, rot: 5.5, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/Rock_Medium_1.gltf", druidRockTransforms, group, obstacleBoxes, 1.2, 2);

    const druidLight = new THREE.PointLight(0x2ecc71, 3.5, 35);
    druidLight.position.set(druidCenter.x, 6, druidCenter.z);
    group.add(druidLight);

    // ==========================================
    // 6. PALADIN CORNER (Fantasy Props Megakit)
    // ==========================================
    const palCenter = new THREE.Vector3(-22, 0, 22);
    const palDaisMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.35, metalness: 0.15 });
    const palDais = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.35, 32), palDaisMat);
    palDais.position.set(palCenter.x, 0.175, palCenter.z);
    palDais.receiveShadow = true;
    group.add(palDais);

    // Weapon Racks
    const palWeaponTransforms = [
      { x: palCenter.x - 4, y: 0.35, z: palCenter.z - 4, rot: 0.78, scale: 1.6 },
      { x: palCenter.x + 4, y: 0.35, z: palCenter.z - 4, rot: -0.78, scale: 1.6 },
      { x: palCenter.x - 5, y: 0.35, z: palCenter.z + 2, rot: 1.57, scale: 1.6 },
      { x: palCenter.x + 5, y: 0.35, z: palCenter.z + 2, rot: -1.57, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/WeaponStand.gltf", palWeaponTransforms, group, obstacleBoxes, 0.9, 2);

    // Banners along wall
    const palBannerTransforms = [
      { x: palCenter.x - 7, y: 0.35, z: palCenter.z - 7, rot: 0.8, scale: 2.0 },
      { x: palCenter.x + 7, y: 0.35, z: palCenter.z - 7, rot: -0.8, scale: 2.0 },
      { x: palCenter.x - 8, y: 0.35, z: palCenter.z + 3, rot: 1.6, scale: 2.0 },
      { x: palCenter.x + 8, y: 0.35, z: palCenter.z + 3, rot: -1.6, scale: 2.0 }
    ];
    createInstancedProp("./assets/environment/Banner_1.gltf", palBannerTransforms, group);

    // Anvils
    const palAnvilTransforms = [
      { x: palCenter.x, y: 0.35, z: palCenter.z + 4, rot: 0, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Anvil.gltf", palAnvilTransforms, group, obstacleBoxes, 0.8, 1.5);

    const palLight = new THREE.PointLight(0xfef08a, 3.5, 35);
    palLight.position.set(palCenter.x, 6, palCenter.z);
    group.add(palLight);

    // ==========================================
    // 7. SORCERER CORNER (Fantasy Props Megakit)
    // ==========================================
    const sorcCenter = new THREE.Vector3(-22, 0, -22);
    const sorcDaisMat = new THREE.MeshStandardMaterial({ color: 0x23143d, roughness: 0.65 });
    const sorcDais = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 18), sorcDaisMat);
    sorcDais.position.set(sorcCenter.x, 0.175, sorcCenter.z);
    sorcDais.receiveShadow = true;
    group.add(sorcDais);

    // Study Tables
    const sorcTableTransforms = [
      { x: sorcCenter.x - 4, y: 0.35, z: sorcCenter.z - 3, rot: 0.6, scale: 1.5 },
      { x: sorcCenter.x + 4, y: 0.35, z: sorcCenter.z - 3, rot: -0.6, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/Table_Large.gltf", sorcTableTransforms, group, obstacleBoxes, 1.4, 1.5);

    // Floating Grimoires / Books
    const floatingBooksGroup = new THREE.Group();
    floatingBooksGroup.position.set(sorcCenter.x, 0, sorcCenter.z);
    group.add(floatingBooksGroup);

    const floatingBooksTransforms = [];
    const numBooks = 8;
    for (let i = 0; i < numBooks; i++) {
      const ang = (i / numBooks) * Math.PI * 2;
      floatingBooksTransforms.push({
        x: Math.cos(ang) * 4.5,
        y: 2.8 + Math.sin(i * 1.5) * 0.6,
        z: Math.sin(ang) * 4.5,
        rotY: -ang + Math.PI / 2,
        rotX: 0.2,
        rotZ: 0.1,
        scale: 1.8
      });
    }
    createInstancedProp("./assets/environment/Book_5.gltf", floatingBooksTransforms, floatingBooksGroup);

    const sorcLight = new THREE.PointLight(0xa855f7, 4.0, 35);
    sorcLight.position.set(sorcCenter.x, 6, sorcCenter.z);
    group.add(sorcLight);

    // ==========================================
    // 8. ROGUE CORNER (Fantasy Props Megakit)
    // ==========================================
    const rogueCenter = new THREE.Vector3(22, 0, 22);
    const rogueDaisMat = new THREE.MeshStandardMaterial({ color: 0x16171b, roughness: 0.9 });
    const rogueDais = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 18), rogueDaisMat);
    rogueDais.position.set(rogueCenter.x, 0.175, rogueCenter.z);
    rogueDais.receiveShadow = true;
    group.add(rogueDais);

    // Barrels
    const rogueBarrelTransforms = [
      { x: rogueCenter.x - 5, y: 0.35, z: rogueCenter.z - 5, rot: 0.2, scale: 1.6 },
      { x: rogueCenter.x - 3.5, y: 0.35, z: rogueCenter.z - 6, rot: 0.8, scale: 1.5 },
      { x: rogueCenter.x - 4.2, y: 1.75, z: rogueCenter.z - 5.5, rot: 0.5, scale: 1.5 },
      { x: rogueCenter.x + 5, y: 0.35, z: rogueCenter.z - 5, rot: 1.1, scale: 1.6 },
      { x: rogueCenter.x + 3.8, y: 0.35, z: rogueCenter.z - 6.2, rot: 2.1, scale: 1.5 },
      { x: rogueCenter.x - 6, y: 0.35, z: rogueCenter.z + 4, rot: 0.9, scale: 1.5 },
      { x: rogueCenter.x + 6, y: 0.35, z: rogueCenter.z + 4, rot: 1.4, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/Barrel.gltf", rogueBarrelTransforms, group, obstacleBoxes, 0.8, 1.6);

    // Wooden Chests
    const rogueChestTransforms = [
      { x: rogueCenter.x - 2, y: 0.35, z: rogueCenter.z + 5, rot: 0.3, scale: 1.6 },
      { x: rogueCenter.x + 2, y: 0.35, z: rogueCenter.z + 5, rot: -0.3, scale: 1.6 },
      { x: rogueCenter.x, y: 0.35, z: rogueCenter.z - 3, rot: 0, scale: 1.7 }
    ];
    createInstancedProp("./assets/environment/Chest_Wood.gltf", rogueChestTransforms, group, obstacleBoxes, 0.8, 1.2);

    const rogueLight = new THREE.PointLight(0xf97316, 3.2, 32);
    rogueLight.position.set(rogueCenter.x, 5.5, rogueCenter.z);
    group.add(rogueLight);

    // ==========================================
    // 9. 10 RADIAL SPAWN POINTS
    // ==========================================
    const spawnPoints = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      spawnPoints.push(new THREE.Vector3(
        Math.cos(angle) * 12,
        10,
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
      update: (dt, elapsed) => {
        if (floatingBooksGroup) {
          floatingBooksGroup.rotation.y = elapsed * 0.35;
          floatingBooksGroup.position.y = Math.sin(elapsed * 2.0) * 0.25;
        }
        if (centerLight) {
          centerLight.intensity = 3.0 + Math.sin(elapsed * 8.0) * 0.35;
        }
      },
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
