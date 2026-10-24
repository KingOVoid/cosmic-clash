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
    // 1. SINGLE FLOOR MESH (NO Z-FIGHTING, 80 x 2 x 80 at y = -1)
    // Tiled texture with RepeatWrapping (20, 20)
    // ==========================================
    const textureLoader = new THREE.TextureLoader();
    const floorTex = textureLoader.load("./assets/environment/T_UnevenBrick_BaseColor.png");
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(20, 20);
    floorTex.colorSpace = THREE.SRGBColorSpace;

    const floorNormal = textureLoader.load("./assets/environment/T_UnevenBrick_Normal.png");
    floorNormal.wrapS = THREE.RepeatWrapping;
    floorNormal.wrapT = THREE.RepeatWrapping;
    floorNormal.repeat.set(20, 20);

    const floorRoughness = textureLoader.load("./assets/environment/T_UnevenBrick_Roughness.png");
    floorRoughness.wrapS = THREE.RepeatWrapping;
    floorRoughness.wrapT = THREE.RepeatWrapping;
    floorRoughness.repeat.set(20, 20);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      normalMap: floorNormal,
      roughnessMap: floorRoughness,
      roughness: 0.85,
      metalness: 0.1
    });

    // Strictly ONE single floor mesh — no overlapping planes or tiles
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(80, 2, 80), floorMat);
    floorMesh.position.set(0, -1, 0);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Continuous floor collision bounding box
    platformBoxes.push(new THREE.Box3(
      new THREE.Vector3(-40, -2, -40),
      new THREE.Vector3(40, 0, 40)
    ));

    // ==========================================
    // 2. SOLID CEILING / ROOF (80 x 2 x 80 at y = 14)
    // ==========================================
    const ceilingTex = textureLoader.load("./assets/environment/T_Brick_BaseColor.png");
    ceilingTex.wrapS = THREE.RepeatWrapping;
    ceilingTex.wrapT = THREE.RepeatWrapping;
    ceilingTex.repeat.set(16, 16);
    ceilingTex.colorSpace = THREE.SRGBColorSpace;

    const ceilingMat = new THREE.MeshStandardMaterial({
      map: ceilingTex,
      color: 0x181a20,
      roughness: 0.95,
      metalness: 0.05
    });
    const ceilingMesh = new THREE.Mesh(new THREE.BoxGeometry(80, 2, 80), ceilingMat);
    ceilingMesh.position.set(0, 14, 0);
    ceilingMesh.receiveShadow = true;
    group.add(ceilingMesh);

    platformBoxes.push(new THREE.Box3(
      new THREE.Vector3(-40, 13, -40),
      new THREE.Vector3(40, 15, 40)
    ));

    // ==========================================
    // 3. 4 SOLID SURROUNDING BOX WALLS (80x80 Room)
    // ==========================================
    const wallHeight = 14;
    const wallThickness = 2;
    const wallTex = textureLoader.load("./assets/environment/T_RedBrick_BaseColor.png");
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(16, 3);
    wallTex.colorSpace = THREE.SRGBColorSpace;

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0x242832,
      roughness: 0.9,
      metalness: 0.1
    });

    // North Wall (Z = -41)
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(84, wallHeight, wallThickness), wallMat);
    northWall.position.set(0, wallHeight / 2, -41);
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    group.add(northWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-42, 0, -42), new THREE.Vector3(42, wallHeight, -40)));

    // South Wall (Z = 41)
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(84, wallHeight, wallThickness), wallMat);
    southWall.position.set(0, wallHeight / 2, 41);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    group.add(southWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-42, 0, 40), new THREE.Vector3(42, wallHeight, 42)));

    // West Wall (X = -41)
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, 84), wallMat);
    westWall.position.set(-41, wallHeight / 2, 0);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    group.add(westWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-42, 0, -42), new THREE.Vector3(-40, wallHeight, 42)));

    // East Wall (X = 41)
    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, 84), wallMat);
    eastWall.position.set(41, wallHeight / 2, 0);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    group.add(eastWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(40, 0, -42), new THREE.Vector3(42, wallHeight, 42)));

    // ==========================================
    // 4. 12 HIGH-RES LANTERNS (Quaternius Integration)
    // 4 directly over the corners at (±25, 10, ±25)
    // 8 perimeter wall lanterns at y = 9
    // Attach warm PointLight(0xffaa00, 1.2, 25) directly to each clone
    // ==========================================
    const lanternPositions = [
      // 4 over the corners (±25, 10, ±25)
      { x: -25, y: 10, z: -25 },
      { x: 25, y: 10, z: -25 },
      { x: -25, y: 10, z: 25 },
      { x: 25, y: 10, z: 25 },
      // 8 perimeter wall lanterns at y = 9
      { x: -20, y: 9, z: -39 },
      { x: 20, y: 9, z: -39 },
      { x: -20, y: 9, z: 39 },
      { x: 20, y: 9, z: 39 },
      { x: -39, y: 9, z: -20 },
      { x: -39, y: 9, z: 20 },
      { x: 39, y: 9, z: -20 },
      { x: 39, y: 9, z: 20 }
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
    // 5. TOP-LEFT CORNER (x: -25, z: -25): ROGUE
    // Shadowy stone blocks, stacked crates, barrels, chests, dim orange torchlight
    // ==========================================
    const rogueCenter = new THREE.Vector3(-25, 0, -25);

    const blockMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.95 });
    const rogueBlocks = [
      { size: [4.0, 3.5, 3.0], pos: [-29, 1.75, -29] },
      { size: [3.0, 5.0, 3.0], pos: [-31, 2.5, -23] },
      { size: [4.5, 2.5, 2.5], pos: [-23, 1.25, -31] },
      { size: [2.5, 3.0, 3.5], pos: [-26, 1.5, -27] }
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

    // Stacked crates
    const rogueCrates = [
      { x: rogueCenter.x + 2.0, y: 0, z: rogueCenter.z + 2.0, rot: 0.2, scale: 1.5 },
      { x: rogueCenter.x + 3.5, y: 0, z: rogueCenter.z + 1.0, rot: -0.1, scale: 1.5 },
      { x: rogueCenter.x + 1.0, y: 0, z: rogueCenter.z + 3.5, rot: 0.3, scale: 1.5 },
      { x: rogueCenter.x - 2.0, y: 0, z: rogueCenter.z + 3.0, rot: 0.5, scale: 1.4 },
      { x: rogueCenter.x + 2.5, y: 1.5, z: rogueCenter.z + 1.5, rot: 0.15, scale: 1.3 },
      { x: rogueCenter.x - 2.0, y: 1.4, z: rogueCenter.z + 3.0, rot: 0.45, scale: 1.2 }
    ];
    createInstancedProp("./assets/environment/Crate_Wooden.gltf", rogueCrates, group, obstacleBoxes, 0.9, 2.2);

    const rogueBarrelTransforms = [
      { x: rogueCenter.x + 1.0, y: 0, z: rogueCenter.z - 3.0, rot: 0.4, scale: 1.4 },
      { x: rogueCenter.x - 3.0, y: 0, z: rogueCenter.z + 1.0, rot: 1.1, scale: 1.4 },
      { x: rogueCenter.x + 3.0, y: 0, z: rogueCenter.z - 1.0, rot: 0.8, scale: 1.3 },
      { x: rogueCenter.x + 1.0, y: 1.4, z: rogueCenter.z - 3.0, rot: 0.3, scale: 1.2 }
    ];
    createInstancedProp("./assets/environment/Barrel.gltf", rogueBarrelTransforms, group, obstacleBoxes, 0.7, 1.8);

    const rogueChestTransforms = [
      { x: rogueCenter.x, y: 0, z: rogueCenter.z + 2.0, rot: 0.2, scale: 1.5 },
      { x: rogueCenter.x - 2.0, y: 0, z: rogueCenter.z - 1.0, rot: -0.8, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/Chest_Wood.gltf", rogueChestTransforms, group, obstacleBoxes, 0.8, 1.2);

    // Localized moody Rogue point light (dim orange torchlight)
    const rogueLight = new THREE.PointLight(0xea580c, 3.5, 35);
    rogueLight.position.set(rogueCenter.x, 5.0, rogueCenter.z);
    group.add(rogueLight);

    // ==========================================
    // 6. TOP-RIGHT CORNER (x: 25, z: -25): PALADIN
    // White marble pillars, banners, weapon stands, anvil, radiant golden light
    // ==========================================
    const palCenter = new THREE.Vector3(25, 0, -25);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.25, metalness: 0.1 });
    const pillarPositions = [
      { x: palCenter.x - 6.0, z: palCenter.z - 6.0 },
      { x: palCenter.x + 6.0, z: palCenter.z - 6.0 },
      { x: palCenter.x - 6.0, z: palCenter.z + 6.0 },
      { x: palCenter.x + 6.0, z: palCenter.z + 6.0 }
    ];
    for (const p of pillarPositions) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 12, 24), pillarMat);
      pillar.position.set(p.x, 6.0, p.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(p.x - 1.2, 0, p.z - 1.2),
        new THREE.Vector3(p.x + 1.2, 12, p.z + 1.2)
      ));
    }

    const palWeaponTransforms = [
      { x: palCenter.x - 3.0, y: 0, z: palCenter.z - 2.0, rot: 0.78, scale: 1.5 },
      { x: palCenter.x + 3.0, y: 0, z: palCenter.z - 2.0, rot: -0.78, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/WeaponStand.gltf", palWeaponTransforms, group, obstacleBoxes, 0.8, 1.8);

    const palBannerTransforms = [
      { x: palCenter.x, y: 0, z: palCenter.z - 7.0, rot: 0, scale: 2.0 },
      { x: palCenter.x + 7.0, y: 0, z: palCenter.z, rot: -Math.PI / 2, scale: 2.0 },
      { x: palCenter.x - 7.0, y: 0, z: palCenter.z, rot: Math.PI / 2, scale: 2.0 }
    ];
    createInstancedProp("./assets/environment/Banner_1.gltf", palBannerTransforms, group);

    const palAnvilTransforms = [
      { x: palCenter.x, y: 0, z: palCenter.z, rot: 0, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/Anvil.gltf", palAnvilTransforms, group, obstacleBoxes, 0.8, 1.4);

    // Localized warm orange / golden radiant light for Paladin
    const palLight = new THREE.PointLight(0xf59e0b, 3.5, 35);
    palLight.position.set(palCenter.x, 5.0, palCenter.z);
    group.add(palLight);

    // ==========================================
    // 7. BOTTOM-LEFT CORNER (x: -25, z: 25): SORCERER
    // High-res Cauldron + Spellbook + Custom 500-vertex Points Particle System
    // ==========================================
    const sorcCenter = new THREE.Vector3(-25, 0, 25);

    // High-Res Cauldron
    const cauldronTransforms = [
      { x: sorcCenter.x, y: 0, z: sorcCenter.z, rot: 0, scale: 2.0 }
    ];
    createInstancedProp("./assets/environment/Cauldron.gltf", cauldronTransforms, group, obstacleBoxes, 1.2, 2.0);

    // High-Res Spellbook on Pedestal
    const spellbookTransforms = [
      { x: sorcCenter.x + 3.0, y: 0, z: sorcCenter.z, rot: -Math.PI / 4, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Spellbook.gltf", spellbookTransforms, group, obstacleBoxes, 0.8, 2.0);

    // Arcane Study Table
    const sorcTableTransforms = [
      { x: sorcCenter.x - 3.0, y: 0, z: sorcCenter.z + 3.0, rot: 0.78, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/Table_Large.gltf", sorcTableTransforms, group, obstacleBoxes, 1.4, 1.6);

    // Grimoires & Book Stacks on the study table
    const sorcBooksTransforms = [
      { x: sorcCenter.x - 3.0, y: 1.5, z: sorcCenter.z + 3.0, rot: 0.2, scale: 1.4 },
      { x: sorcCenter.x - 2.2, y: 1.5, z: sorcCenter.z + 2.5, rot: -0.5, scale: 1.3 },
      { x: sorcCenter.x - 3.8, y: 1.5, z: sorcCenter.z + 3.5, rot: 0.8, scale: 1.2 }
    ];
    createInstancedProp("./assets/environment/Book_5.gltf", sorcBooksTransforms, group);

    // Particle System: Custom THREE.Points particle emitter rising out of the cauldron
    // 500 vertices, color 0x9900ff, size 0.5, transparent, opacity 0.8, AdditiveBlending
    const particleCount = 500;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleAngles = new Float32Array(particleCount);
    const particleRadii = new Float32Array(particleCount);
    const particleSpeeds = new Float32Array(particleCount);

    const cauldronBaseY = 0.9;
    const cauldronMaxY = 5.8;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.1 + Math.random() * 0.9;
      const y = cauldronBaseY + Math.random() * (cauldronMaxY - cauldronBaseY);
      particleAngles[i] = ang;
      particleRadii[i] = rad;
      particleSpeeds[i] = 0.8 + Math.random() * 0.8;

      particlePositions[i3] = sorcCenter.x + Math.cos(ang) * rad;
      particlePositions[i3 + 1] = y;
      particlePositions[i3 + 2] = sorcCenter.z + Math.sin(ang) * rad;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
      color: 0x9900ff,
      size: 0.5,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const cauldronSmoke = new THREE.Points(particleGeometry, particleMaterial);
    cauldronSmoke.name = "cauldron-smoke-particles";
    group.add(cauldronSmoke);

    // Localized purple point light for Sorcerer
    const sorcLight = new THREE.PointLight(0xa855f7, 3.5, 35);
    sorcLight.position.set(sorcCenter.x, 5.0, sorcCenter.z);
    group.add(sorcLight);

    // ==========================================
    // 8. BOTTOM-RIGHT CORNER (x: 25, z: 25): DRUID
    // Dense mini-forest (8-10 trees), rocks, bushes, glowing mushrooms, emerald light
    // ==========================================
    const druidCenter = new THREE.Vector3(25, 0, 25);

    const druidTrees1 = [
      { x: druidCenter.x - 6.0, y: 0, z: druidCenter.z - 6.0, rot: 0.3, scale: 2.0 },
      { x: druidCenter.x + 9.0, y: 0, z: druidCenter.z, rot: 2.9, scale: 2.0 }
    ];
    createInstancedProp("./assets/environment/BirchTree_1.gltf", druidTrees1, group, obstacleBoxes, 0.7, 7);

    const druidTrees2 = [
      { x: druidCenter.x + 6.0, y: 0, z: druidCenter.z - 5.0, rot: 1.1, scale: 2.2 },
      { x: druidCenter.x + 1.0, y: 0, z: druidCenter.z - 7.0, rot: 0.6, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/BirchTree_2.gltf", druidTrees2, group, obstacleBoxes, 0.7, 7);

    const druidTrees3 = [
      { x: druidCenter.x - 5.0, y: 0, z: druidCenter.z + 6.0, rot: 2.2, scale: 1.9 }
    ];
    createInstancedProp("./assets/environment/BirchTree_3.gltf", druidTrees3, group, obstacleBoxes, 0.7, 7);

    const druidCommonTrees1 = [
      { x: druidCenter.x + 7.0, y: 0, z: druidCenter.z + 6.0, rot: 0.8, scale: 2.3 },
      { x: druidCenter.x - 8.0, y: 0, z: druidCenter.z + 1.0, rot: 1.4, scale: 2.2 }
    ];
    createInstancedProp("./assets/environment/CommonTree_1.gltf", druidCommonTrees1, group, obstacleBoxes, 0.8, 7);

    const druidCommonTrees2 = [
      { x: druidCenter.x, y: 0, z: druidCenter.z + 9.0, rot: 1.7, scale: 2.1 }
    ];
    createInstancedProp("./assets/environment/CommonTree_2.gltf", druidCommonTrees2, group, obstacleBoxes, 0.8, 7);

    const druidRockTransforms = [
      { x: druidCenter.x - 4.0, y: 0, z: druidCenter.z, rot: 0.7, scale: 1.3 },
      { x: druidCenter.x + 2.0, y: 0, z: druidCenter.z - 4.0, rot: 2.2, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/Rock_Medium_1.gltf", druidRockTransforms, group, obstacleBoxes, 0.9, 1.5);

    const druidBushTransforms = [
      { x: druidCenter.x - 3.0, y: 0, z: druidCenter.z - 3.0, rot: 0.4, scale: 1.6 },
      { x: druidCenter.x + 3.0, y: 0, z: druidCenter.z - 2.0, rot: 1.8, scale: 1.5 },
      { x: druidCenter.x - 2.0, y: 0, z: druidCenter.z + 3.0, rot: 2.5, scale: 1.7 },
      { x: druidCenter.x + 4.0, y: 0, z: druidCenter.z + 3.0, rot: 0.9, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/Bush.gltf", druidBushTransforms, group);

    const druidMushroomTransforms = [
      { x: druidCenter.x - 1.0, y: 0, z: druidCenter.z - 1.0, rot: 0.5, scale: 1.8 },
      { x: druidCenter.x + 1.0, y: 0, z: druidCenter.z + 1.0, rot: 1.2, scale: 2.0 }
    ];
    createInstancedProp("./assets/environment/Mushroom_Common.gltf", druidMushroomTransforms, group);

    const druidTrenchMushrooms = [
      { x: druidCenter.x - 2.0, y: 0, z: druidCenter.z + 1.0, rot: 2.1, scale: 1.5 },
      { x: druidCenter.x + 1.0, y: 0, z: druidCenter.z - 2.0, rot: 3.0, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/2_TrenchcoatMushrooms.gltf", druidTrenchMushrooms, group);

    // Localized emerald green point light for Druid
    const druidLight = new THREE.PointLight(0x22c55e, 3.5, 35);
    druidLight.position.set(druidCenter.x, 5.0, druidCenter.z);
    group.add(druidLight);

    // ==========================================
    // 9. 10 RADIAL SPAWN POINTS (radius 10 at y = 2)
    // ==========================================
    const spawnPoints = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      spawnPoints.push(new THREE.Vector3(
        Math.cos(angle) * 10,
        2,
        Math.sin(angle) * 10
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
        // Cauldron magical energy smoke particle animation
        if (cauldronSmoke && cauldronSmoke.geometry) {
          const positions = cauldronSmoke.geometry.attributes.position.array;
          for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            // Float upward
            positions[i3 + 1] += particleSpeeds[i] * dt;

            // Swirl around cauldron center
            particleAngles[i] += (1.4 + (i % 3) * 0.3) * dt;
            const progress = (positions[i3 + 1] - cauldronBaseY) / (cauldronMaxY - cauldronBaseY);
            const currentRad = particleRadii[i] + Math.max(0, progress) * 0.8;
            positions[i3] = sorcCenter.x + Math.cos(particleAngles[i]) * currentRad;
            positions[i3 + 2] = sorcCenter.z + Math.sin(particleAngles[i]) * currentRad;

            // Reset when reaching top height
            if (positions[i3 + 1] > cauldronMaxY) {
              positions[i3 + 1] = cauldronBaseY + Math.random() * 0.2;
              particleAngles[i] = Math.random() * Math.PI * 2;
            }
          }
          cauldronSmoke.geometry.attributes.position.needsUpdate = true;
        }

        // Lantern gentle flicker
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
