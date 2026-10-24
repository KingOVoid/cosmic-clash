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
        obj.color.setHex(0x333b4d);
        obj.intensity = 0.05;
      }
      if (obj.isDirectionalLight) {
        hasDirectional = true;
        obj.color.setHex(0xffeedd);
        obj.intensity = 0.25;
      }
    });

    if (!hasAmbient) {
      const ambient = new THREE.AmbientLight(0x333b4d, 0.05);
      ambient.name = "roundtable-ambient";
      scene.add(ambient);
    }
    if (!hasDirectional) {
      const dirLight = new THREE.DirectionalLight(0xffeedd, 0.25);
      dirLight.name = "roundtable-sun";
      dirLight.position.set(10, 11, 10);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(1024, 1024);
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 40;
      dirLight.shadow.camera.left = -25;
      dirLight.shadow.camera.right = 25;
      dirLight.shadow.camera.top = 25;
      dirLight.shadow.camera.bottom = -25;
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

    scene.background = new THREE.Color(0x0a0c10);
    scene.fog = new THREE.FogExp2(0x0a0c10, 0.015);

    SharedLobby.ensureLighting(scene);

    const platformBoxes = [];
    const obstacleBoxes = [];

    // ==========================================
    // 1. SINGLE FLOOR MESH (NO Z-FIGHTING, 40 x 2 x 40 at y = -1)
    // Tiled texture with RepeatWrapping (10, 10)
    // ==========================================
    const textureLoader = new THREE.TextureLoader();
    const floorTex = textureLoader.load("./assets/environment/T_UnevenBrick_BaseColor.png");
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(10, 10);
    floorTex.colorSpace = THREE.SRGBColorSpace;

    const floorNormal = textureLoader.load("./assets/environment/T_UnevenBrick_Normal.png");
    floorNormal.wrapS = THREE.RepeatWrapping;
    floorNormal.wrapT = THREE.RepeatWrapping;
    floorNormal.repeat.set(10, 10);

    const floorRoughness = textureLoader.load("./assets/environment/T_UnevenBrick_Roughness.png");
    floorRoughness.wrapS = THREE.RepeatWrapping;
    floorRoughness.wrapT = THREE.RepeatWrapping;
    floorRoughness.repeat.set(10, 10);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      normalMap: floorNormal,
      roughnessMap: floorRoughness,
      roughness: 0.85,
      metalness: 0.1
    });

    // Strictly ONE single floor mesh — no overlapping planes or tiles
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40), floorMat);
    floorMesh.position.set(0, -1, 0);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Continuous floor collision bounding box
    platformBoxes.push(new THREE.Box3(
      new THREE.Vector3(-20, -2, -20),
      new THREE.Vector3(20, 0, 20)
    ));

    // ==========================================
    // 2. SOLID CEILING / ROOF (40 x 2 x 40 at y = 12)
    // ==========================================
    const ceilingTex = textureLoader.load("./assets/environment/T_Brick_BaseColor.png");
    ceilingTex.wrapS = THREE.RepeatWrapping;
    ceilingTex.wrapT = THREE.RepeatWrapping;
    ceilingTex.repeat.set(8, 8);
    ceilingTex.colorSpace = THREE.SRGBColorSpace;

    const ceilingMat = new THREE.MeshStandardMaterial({
      map: ceilingTex,
      color: 0x181a20,
      roughness: 0.95,
      metalness: 0.05
    });
    const ceilingMesh = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40), ceilingMat);
    ceilingMesh.position.set(0, 12, 0);
    ceilingMesh.receiveShadow = true;
    group.add(ceilingMesh);

    platformBoxes.push(new THREE.Box3(
      new THREE.Vector3(-20, 11, -20),
      new THREE.Vector3(20, 13, 20)
    ));

    // ==========================================
    // 3. 4 SOLID SURROUNDING BOX WALLS (40x40 Room)
    // ==========================================
    const wallHeight = 12;
    const wallThickness = 2;
    const wallTex = textureLoader.load("./assets/environment/T_RedBrick_BaseColor.png");
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(8, 3);
    wallTex.colorSpace = THREE.SRGBColorSpace;

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0x242832,
      roughness: 0.9,
      metalness: 0.1
    });

    // North Wall (Z = -21)
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(44, wallHeight, wallThickness), wallMat);
    northWall.position.set(0, wallHeight / 2, -21);
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    group.add(northWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-22, 0, -22), new THREE.Vector3(22, wallHeight, -20)));

    // South Wall (Z = 21)
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(44, wallHeight, wallThickness), wallMat);
    southWall.position.set(0, wallHeight / 2, 21);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    group.add(southWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-22, 0, 20), new THREE.Vector3(22, wallHeight, 22)));

    // West Wall (X = -21)
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, 44), wallMat);
    westWall.position.set(-21, wallHeight / 2, 0);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    group.add(westWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-22, 0, -22), new THREE.Vector3(-20, wallHeight, 22)));

    // East Wall (X = 21)
    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, 44), wallMat);
    eastWall.position.set(21, wallHeight / 2, 0);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    group.add(eastWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(20, 0, -22), new THREE.Vector3(22, wallHeight, 22)));

    // ==========================================
    // 4. HIGH-RES LANTERNS (Quaternius Integration)
    // Asynchronously load ./assets/environment/Lantern.glb
    // Position 4 clones near ceiling in 4 corners (x: ±15, y: 10, z: ±15)
    // Attach warm PointLight(0xffaa00, 1.2, 25) directly to each clone
    // ==========================================
    const lanternPositions = [
      { x: 15, y: 10, z: 15 },
      { x: -15, y: 10, z: 15 },
      { x: 15, y: 10, z: -15 },
      { x: -15, y: 10, z: -15 }
    ];

    const lobbyLanterns = [];
    const loadHighResLanterns = async () => {
      let lanternScene = null;
      const urls = [
        "./assets/environment/Lantern.glb",
        "./assets/environment/Lantern.gltf",
        "./assets/environment/Lantern_Wall.gltf"
      ];
      for (const url of urls) {
        try {
          const gltf = await gltfLoader.loadAsync(url);
          if (gltf && gltf.scene) {
            lanternScene = gltf.scene;
            break;
          }
        } catch (e) {}
      }

      if (!lanternScene) return;

      for (const pos of lanternPositions) {
        const lanternClone = lanternScene.clone(true);
        lanternClone.position.set(pos.x, pos.y, pos.z);
        lanternClone.scale.set(1.5, 1.5, 1.5);

        lanternClone.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Attach warm PointLight directly to the loaded GLTF clone
        const light = new THREE.PointLight(0xffaa00, 1.2, 25);
        light.position.set(0, -0.3, 0);
        lanternClone.add(light);

        group.add(lanternClone);
        lobbyLanterns.push({ lantern: lanternClone, light });
      }
    };
    loadHighResLanterns();

    // ==========================================
    // 5. TOP-LEFT CORNER (x: -13, z: -13): ROGUE
    // Shadowy stone blocks, barrels, chests, dim orange torchlight
    // ==========================================
    const rogueCenter = new THREE.Vector3(-13, 0, -13);

    const blockMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.95 });
    const rogueBlocks = [
      { size: [2.5, 2.4, 2.5], pos: [-15.5, 1.2, -15.5] },
      { size: [2.0, 3.6, 2.0], pos: [-16.0, 1.8, -11.5] },
      { size: [3.0, 1.6, 1.8], pos: [-11.5, 0.8, -16.0] },
      { size: [1.8, 2.4, 2.2], pos: [-13.5, 1.2, -14.0] }
    ];
    for (const b of rogueBlocks) {
      const blockMesh = new THREE.Mesh(new THREE.BoxGeometry(...b.size), blockMat);
      blockMesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
      blockMesh.castShadow = true;
      blockMesh.receiveShadow = true;
      group.add(blockMesh);
      const halfX = b.size[0] / 2;
      const halfZ = b.size[2] / 2;
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(b.pos[0] - halfX, 0, b.pos[2] - halfZ),
        new THREE.Vector3(b.pos[0] + halfX, b.size[1], b.pos[2] + halfZ)
      ));
    }

    const rogueBarrelTransforms = [
      { x: rogueCenter.x - 2.0, y: 0, z: rogueCenter.z + 2.5, rot: 0.2, scale: 1.4 },
      { x: rogueCenter.x + 2.5, y: 0, z: rogueCenter.z - 2.0, rot: 0.8, scale: 1.3 },
      { x: rogueCenter.x + 2.0, y: 0, z: rogueCenter.z + 2.0, rot: 1.2, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/Barrel.gltf", rogueBarrelTransforms, group, obstacleBoxes, 0.7, 1.5);

    const rogueChestTransforms = [
      { x: rogueCenter.x, y: 0, z: rogueCenter.z + 3.0, rot: 0.3, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/Chest_Wood.gltf", rogueChestTransforms, group, obstacleBoxes, 0.7, 1.0);

    // Localized moody Rogue point light (dim orange torchlight)
    const rogueLight = new THREE.PointLight(0xea580c, 2.5, 22);
    rogueLight.position.set(rogueCenter.x, 4.0, rogueCenter.z);
    group.add(rogueLight);

    // ==========================================
    // 6. TOP-RIGHT CORNER (x: 13, z: -13): PALADIN
    // White marble pillars, banners, weapon stands, anvil, warm orange light
    // ==========================================
    const palCenter = new THREE.Vector3(13, 0, -13);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.25, metalness: 0.1 });
    const pillarPositions = [
      { x: palCenter.x - 3.5, z: palCenter.z - 3.5 },
      { x: palCenter.x + 3.5, z: palCenter.z - 3.5 },
      { x: palCenter.x - 3.5, z: palCenter.z + 3.5 },
      { x: palCenter.x + 3.5, z: palCenter.z + 3.5 }
    ];
    for (const p of pillarPositions) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 8, 24), pillarMat);
      pillar.position.set(p.x, 4.0, p.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(p.x - 1.0, 0, p.z - 1.0),
        new THREE.Vector3(p.x + 1.0, 8, p.z + 1.0)
      ));
    }

    const palWeaponTransforms = [
      { x: palCenter.x - 2.2, y: 0, z: palCenter.z - 2.5, rot: 0.78, scale: 1.4 },
      { x: palCenter.x + 2.2, y: 0, z: palCenter.z - 2.5, rot: -0.78, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/WeaponStand.gltf", palWeaponTransforms, group, obstacleBoxes, 0.8, 1.8);

    const palBannerTransforms = [
      { x: palCenter.x, y: 0, z: palCenter.z - 5.5, rot: 0, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Banner_1.gltf", palBannerTransforms, group);

    const palAnvilTransforms = [
      { x: palCenter.x, y: 0, z: palCenter.z, rot: 0, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/Anvil.gltf", palAnvilTransforms, group, obstacleBoxes, 0.7, 1.3);

    // Localized warm orange / golden radiant light for Paladin
    const palLight = new THREE.PointLight(0xf59e0b, 2.8, 22);
    palLight.position.set(palCenter.x, 4.5, palCenter.z);
    group.add(palLight);

    // ==========================================
    // 7. BOTTOM-LEFT CORNER (x: -13, z: 13): SORCERER
    // Purple glowing floating geometric shapes, study table, grimoires, purple light
    // ==========================================
    const sorcCenter = new THREE.Vector3(-13, 0, 13);

    const floatingRunesGroup = new THREE.Group();
    floatingRunesGroup.position.set(sorcCenter.x, 2.8, sorcCenter.z);
    group.add(floatingRunesGroup);

    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x9333ea,
      emissive: 0xa855f7,
      emissiveIntensity: 2.5,
      roughness: 0.2,
      metalness: 0.8
    });

    const torus1 = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.25, 16, 32), runeMat);
    torus1.rotation.x = Math.PI / 4;
    floatingRunesGroup.add(torus1);

    const torus2 = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 16, 32), runeMat);
    torus2.rotation.y = Math.PI / 3;
    floatingRunesGroup.add(torus2);

    const octa1 = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), runeMat);
    octa1.position.set(-2.5, 0.6, -1.8);
    floatingRunesGroup.add(octa1);

    const octa2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), runeMat);
    octa2.position.set(2.5, 0.4, 1.8);
    floatingRunesGroup.add(octa2);

    const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9), runeMat);
    crystal.position.set(0, 0.2, 0);
    floatingRunesGroup.add(crystal);

    const sorcTableTransforms = [
      { x: sorcCenter.x, y: 0, z: sorcCenter.z + 3.0, rot: 0, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/Table_Large.gltf", sorcTableTransforms, group, obstacleBoxes, 1.2, 1.3);

    const floatingBooksGroup = new THREE.Group();
    floatingBooksGroup.position.set(sorcCenter.x, 0, sorcCenter.z);
    group.add(floatingBooksGroup);

    const floatingBooksTransforms = [];
    const numBooks = 5;
    for (let i = 0; i < numBooks; i++) {
      const ang = (i / numBooks) * Math.PI * 2;
      floatingBooksTransforms.push({
        x: Math.cos(ang) * 3.2,
        y: 2.2 + Math.sin(i * 1.5) * 0.4,
        z: Math.sin(ang) * 3.2,
        rotY: -ang + Math.PI / 2,
        rotX: 0.2,
        rotZ: 0.1,
        scale: 1.5
      });
    }
    createInstancedProp("./assets/environment/Book_5.gltf", floatingBooksTransforms, floatingBooksGroup);

    // Localized purple point light for Sorcerer
    const sorcLight = new THREE.PointLight(0xa855f7, 3.0, 22);
    sorcLight.position.set(sorcCenter.x, 4.5, sorcCenter.z);
    group.add(sorcLight);

    // ==========================================
    // 8. BOTTOM-RIGHT CORNER (x: 13, z: 13): DRUID
    // Green instanced trees, rocks, bushes, green light
    // ==========================================
    const druidCenter = new THREE.Vector3(13, 0, 13);

    const druidTreeTransforms = [
      { x: druidCenter.x - 3.5, y: 0, z: druidCenter.z - 3.0, rot: 0.4, scale: 1.8 },
      { x: druidCenter.x + 3.5, y: 0, z: druidCenter.z - 3.5, rot: 1.2, scale: 2.0 },
      { x: druidCenter.x - 2.5, y: 0, z: druidCenter.z + 3.5, rot: 2.1, scale: 1.7 }
    ];
    createInstancedProp("./assets/environment/BirchTree_1.gltf", druidTreeTransforms, group, obstacleBoxes, 0.6, 6);

    const druidRockTransforms = [
      { x: druidCenter.x - 1.5, y: 0, z: druidCenter.z - 1.5, rot: 0.5, scale: 1.2 },
      { x: druidCenter.x + 1.8, y: 0, z: druidCenter.z - 0.8, rot: 1.7, scale: 1.1 },
      { x: druidCenter.x - 0.8, y: 0, z: druidCenter.z + 1.8, rot: 2.4, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/Rock_Medium_1.gltf", druidRockTransforms, group, obstacleBoxes, 0.9, 1.5);

    const druidBushTransforms = [
      { x: druidCenter.x - 2.0, y: 0, z: druidCenter.z - 0.8, rot: 0.8, scale: 1.4 },
      { x: druidCenter.x + 2.0, y: 0, z: druidCenter.z - 2.0, rot: 1.9, scale: 1.5 },
      { x: druidCenter.x + 0.8, y: 0, z: druidCenter.z + 2.5, rot: 3.4, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/Bush.gltf", druidBushTransforms, group);

    // Localized emerald green point light for Druid
    const druidLight = new THREE.PointLight(0x22c55e, 2.8, 22);
    druidLight.position.set(druidCenter.x, 4.5, druidCenter.z);
    group.add(druidLight);

    // ==========================================
    // 9. 10 RADIAL SPAWN POINTS (radius 6 at y = 3)
    // ==========================================
    const spawnPoints = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      spawnPoints.push(new THREE.Vector3(
        Math.cos(angle) * 6,
        3,
        Math.sin(angle) * 6
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
        if (floatingRunesGroup) {
          floatingRunesGroup.rotation.y = elapsed * 0.45;
          torus1.rotation.z = elapsed * 0.8;
          torus2.rotation.x = -elapsed * 0.6;
          octa1.position.y = 0.6 + Math.sin(elapsed * 2.5) * 0.25;
          octa2.position.y = 0.4 + Math.cos(elapsed * 2.2) * 0.2;
          crystal.rotation.x = elapsed * 0.5;
          crystal.rotation.y = elapsed * 0.7;
        }
        if (floatingBooksGroup) {
          floatingBooksGroup.rotation.y = elapsed * 0.35;
          floatingBooksGroup.position.y = Math.sin(elapsed * 2.0) * 0.2;
        }
        if (lobbyLanterns) {
          lobbyLanterns.forEach((l, idx) => {
            l.light.intensity = 1.2 + Math.sin(elapsed * 5.0 + idx * 1.5) * 0.15;
          });
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
