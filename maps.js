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
    scene.fog = new THREE.FogExp2(0x14161d, 0.002);

    SharedLobby.ensureLighting(scene);

    const platformBoxes = [];
    const obstacleBoxes = [];

    // ==========================================
    // 1. STRICT SQUARE FLOOR (60 x 2 x 60 at y = -1)
    // ==========================================
    // Floor top surface is exactly at y = 0. No gaps.
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e2128,
      roughness: 0.85,
      metalness: 0.15
    });
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 60), floorMat);
    floorMesh.position.set(0, -1, 0);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Continuous floor collision bounding box
    platformBoxes.push(new THREE.Box3(
      new THREE.Vector3(-30, -2, -30),
      new THREE.Vector3(30, 0, 30)
    ));

    // ==========================================
    // 2. 4 SOLID SURROUNDING BOX WALLS
    // ==========================================
    const wallHeight = 16;
    const wallThickness = 2;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x272b35,
      roughness: 0.9,
      metalness: 0.1
    });

    // North Wall (Z = -31)
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(64, wallHeight, wallThickness), wallMat);
    northWall.position.set(0, wallHeight / 2, -31);
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    group.add(northWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-32, -2, -32), new THREE.Vector3(32, wallHeight, -30)));

    // South Wall (Z = 31)
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(64, wallHeight, wallThickness), wallMat);
    southWall.position.set(0, wallHeight / 2, 31);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    group.add(southWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-32, -2, 30), new THREE.Vector3(32, wallHeight, 32)));

    // West Wall (X = -31)
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, 64), wallMat);
    westWall.position.set(-31, wallHeight / 2, 0);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    group.add(westWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-32, -2, -32), new THREE.Vector3(-30, wallHeight, 32)));

    // East Wall (X = 31)
    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, 64), wallMat);
    eastWall.position.set(31, wallHeight / 2, 0);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    group.add(eastWall);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(30, -2, -32), new THREE.Vector3(32, wallHeight, 32)));

    // Perimeter decorative modular stone walls
    const perimeterWallTransforms = [];
    for (let x = -27; x <= 27; x += 6) {
      perimeterWallTransforms.push({ x, y: 0, z: -29.8, rot: 0, scale: { x: 3.0, y: 3.5, z: 2.5 } });
      perimeterWallTransforms.push({ x, y: 0, z: 29.8, rot: Math.PI, scale: { x: 3.0, y: 3.5, z: 2.5 } });
    }
    for (let z = -27; z <= 27; z += 6) {
      perimeterWallTransforms.push({ x: -29.8, y: 0, z, rot: Math.PI / 2, scale: { x: 3.0, y: 3.5, z: 2.5 } });
      perimeterWallTransforms.push({ x: 29.8, y: 0, z, rot: -Math.PI / 2, scale: { x: 3.0, y: 3.5, z: 2.5 } });
    }
    createInstancedProp("./assets/environment/Wall_UnevenBrick_Straight.gltf", perimeterWallTransforms, group);

    // Floor stone pavers
    const floorTileTransforms = [];
    for (let x = -26; x <= 26; x += 5.2) {
      for (let z = -26; z <= 26; z += 5.2) {
        floorTileTransforms.push({
          x: x + (Math.sin(x * 3 + z) * 0.3),
          y: 0.02,
          z: z + (Math.cos(z * 3 + x) * 0.3),
          rot: (x + z) * 0.2,
          scale: 2.6
        });
      }
    }
    createInstancedProp("./assets/environment/Floor_UnevenBrick.gltf", floorTileTransforms, group);

    // ==========================================
    // 3. CENTRAL ROUNDTABLE & BRAZIER
    // ==========================================
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x3d352e, roughness: 0.7, metalness: 0.2 });
    const tableMesh = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.0, 1.2, 32), tableMat);
    tableMesh.position.set(0, 0.6, 0);
    tableMesh.castShadow = true;
    tableMesh.receiveShadow = true;
    group.add(tableMesh);
    platformBoxes.push(new THREE.Box3(new THREE.Vector3(-5.8, 0, -5.8), new THREE.Vector3(5.8, 1.2, 5.8)));

    const brazierMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const brazier = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.4, 0.8, 16), brazierMat);
    brazier.position.set(0, 1.6, 0);
    group.add(brazier);

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.5, 8), flameMat);
    flame.position.set(0, 2.35, 0);
    group.add(flame);

    const centerLight = new THREE.PointLight(0xff7700, 3.2, 38);
    centerLight.position.set(0, 3, 0);
    group.add(centerLight);

    // ==========================================
    // 4. TOP-LEFT CORNER (x: -20, z: -20): ROGUE
    // Shadowy dark stone blocks, barrels, chests, orange torchlight
    // ==========================================
    const rogueCenter = new THREE.Vector3(-20, 0, -20);
    const rogueDaisMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.95, metalness: 0.1 });
    const rogueDais = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 15), rogueDaisMat);
    rogueDais.position.set(rogueCenter.x, 0.175, rogueCenter.z);
    rogueDais.receiveShadow = true;
    group.add(rogueDais);

    // Shadowy dark stone blocks (varying heights & cover)
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.9 });
    const rogueBlocks = [
      { size: [3.2, 3.0, 3.2], pos: [-24.5, 1.5, -24.5] },
      { size: [2.5, 4.5, 2.5], pos: [-25.0, 2.25, -18.5] },
      { size: [4.0, 2.0, 2.2], pos: [-17.5, 1.0, -25.0] },
      { size: [2.2, 3.5, 3.0], pos: [-21.0, 1.75, -23.0] },
      { size: [2.0, 1.6, 2.0], pos: [-16.0, 0.8, -17.5] }
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

    // Barrels & Chests
    const rogueBarrelTransforms = [
      { x: rogueCenter.x - 2.5, y: 0.35, z: rogueCenter.z - 2.0, rot: 0.2, scale: 1.6 },
      { x: rogueCenter.x + 3.0, y: 0.35, z: rogueCenter.z - 4.5, rot: 0.8, scale: 1.5 },
      { x: rogueCenter.x - 4.0, y: 0.35, z: rogueCenter.z + 3.5, rot: 1.1, scale: 1.6 },
      { x: rogueCenter.x + 4.5, y: 0.35, z: rogueCenter.z + 2.5, rot: 1.4, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/Barrel.gltf", rogueBarrelTransforms, group, obstacleBoxes, 0.8, 1.6);

    const rogueChestTransforms = [
      { x: rogueCenter.x + 2.0, y: 0.35, z: rogueCenter.z + 4.0, rot: 0.3, scale: 1.6 },
      { x: rogueCenter.x - 1.5, y: 0.35, z: rogueCenter.z + 4.2, rot: -0.2, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/Chest_Wood.gltf", rogueChestTransforms, group, obstacleBoxes, 0.8, 1.2);

    const rogueLight = new THREE.PointLight(0xf97316, 3.5, 32);
    rogueLight.position.set(rogueCenter.x, 5.5, rogueCenter.z);
    group.add(rogueLight);

    // ==========================================
    // 5. TOP-RIGHT CORNER (x: 20, z: -20): PALADIN
    // White marble pillars, bright radiant light, weapon racks, banners
    // ==========================================
    const palCenter = new THREE.Vector3(20, 0, -20);
    const palDaisMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3, metalness: 0.15 });
    const palDais = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 15), palDaisMat);
    palDais.position.set(palCenter.x, 0.175, palCenter.z);
    palDais.receiveShadow = true;
    group.add(palDais);

    // White Marble Pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.25, metalness: 0.1 });
    const pillarPositions = [
      { x: palCenter.x - 5.5, z: palCenter.z - 5.5 },
      { x: palCenter.x + 5.5, z: palCenter.z - 5.5 },
      { x: palCenter.x - 5.5, z: palCenter.z + 5.5 },
      { x: palCenter.x + 5.5, z: palCenter.z + 5.5 }
    ];
    for (const p of pillarPositions) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 9, 24), pillarMat);
      pillar.position.set(p.x, 4.5, p.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(p.x - 1.2, 0, p.z - 1.2),
        new THREE.Vector3(p.x + 1.2, 9, p.z + 1.2)
      ));
    }

    // Weapon Stands, Banners & Anvil
    const palWeaponTransforms = [
      { x: palCenter.x - 3.5, y: 0.35, z: palCenter.z - 4.0, rot: 0.78, scale: 1.6 },
      { x: palCenter.x + 3.5, y: 0.35, z: palCenter.z - 4.0, rot: -0.78, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/WeaponStand.gltf", palWeaponTransforms, group, obstacleBoxes, 0.9, 2);

    const palBannerTransforms = [
      { x: palCenter.x - 6.0, y: 0.35, z: palCenter.z - 6.0, rot: 0.8, scale: 2.0 },
      { x: palCenter.x + 6.0, y: 0.35, z: palCenter.z - 6.0, rot: -0.8, scale: 2.0 }
    ];
    createInstancedProp("./assets/environment/Banner_1.gltf", palBannerTransforms, group);

    const palAnvilTransforms = [
      { x: palCenter.x, y: 0.35, z: palCenter.z, rot: 0, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Anvil.gltf", palAnvilTransforms, group, obstacleBoxes, 0.8, 1.5);

    const palLight = new THREE.PointLight(0xfffbeb, 4.5, 36);
    palLight.position.set(palCenter.x, 6.5, palCenter.z);
    group.add(palLight);

    // ==========================================
    // 6. BOTTOM-LEFT CORNER (x: -20, z: 20): SORCERER
    // Purple glowing floating geometric shapes, study tables, grimoires
    // ==========================================
    const sorcCenter = new THREE.Vector3(-20, 0, 20);
    const sorcDaisMat = new THREE.MeshStandardMaterial({ color: 0x1f1433, roughness: 0.6, metalness: 0.2 });
    const sorcDais = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 15), sorcDaisMat);
    sorcDais.position.set(sorcCenter.x, 0.175, sorcCenter.z);
    sorcDais.receiveShadow = true;
    group.add(sorcDais);

    // Floating Glowing Geometric Shapes Group
    const floatingRunesGroup = new THREE.Group();
    floatingRunesGroup.position.set(sorcCenter.x, 3.2, sorcCenter.z);
    group.add(floatingRunesGroup);

    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x9333ea,
      emissive: 0xa855f7,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.8
    });

    // Glowing Toruses
    const torus1 = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.3, 16, 32), runeMat);
    torus1.rotation.x = Math.PI / 4;
    floatingRunesGroup.add(torus1);

    const torus2 = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.2, 16, 32), runeMat);
    torus2.rotation.y = Math.PI / 3;
    floatingRunesGroup.add(torus2);

    // Floating Octahedrons & Crystals
    const octa1 = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), runeMat);
    octa1.position.set(-3.5, 0.8, -2.5);
    floatingRunesGroup.add(octa1);

    const octa2 = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), runeMat);
    octa2.position.set(3.5, 0.5, 2.5);
    floatingRunesGroup.add(octa2);

    const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2), runeMat);
    crystal.position.set(0, 0.2, 0);
    floatingRunesGroup.add(crystal);

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
    const numBooks = 6;
    for (let i = 0; i < numBooks; i++) {
      const ang = (i / numBooks) * Math.PI * 2;
      floatingBooksTransforms.push({
        x: Math.cos(ang) * 4.2,
        y: 2.8 + Math.sin(i * 1.5) * 0.5,
        z: Math.sin(ang) * 4.2,
        rotY: -ang + Math.PI / 2,
        rotX: 0.2,
        rotZ: 0.1,
        scale: 1.8
      });
    }
    createInstancedProp("./assets/environment/Book_5.gltf", floatingBooksTransforms, floatingBooksGroup);

    const sorcLight = new THREE.PointLight(0xa855f7, 4.5, 36);
    sorcLight.position.set(sorcCenter.x, 6.5, sorcCenter.z);
    group.add(sorcLight);

    // ==========================================
    // 7. BOTTOM-RIGHT CORNER (x: 20, z: 20): DRUID
    // Green instanced trees and rocks, bushes, emerald light
    // ==========================================
    const druidCenter = new THREE.Vector3(20, 0, 20);
    const druidDaisMat = new THREE.MeshStandardMaterial({ color: 0x193b2a, roughness: 0.85, metalness: 0.1 });
    const druidDais = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 15), druidDaisMat);
    druidDais.position.set(druidCenter.x, 0.175, druidCenter.z);
    druidDais.receiveShadow = true;
    group.add(druidDais);

    // Green Instanced Trees
    const druidTreeTransforms = [
      { x: druidCenter.x - 5, y: 0, z: druidCenter.z - 4, rot: 0.4, scale: 2.2 },
      { x: druidCenter.x + 5, y: 0, z: druidCenter.z - 5, rot: 1.2, scale: 2.4 },
      { x: druidCenter.x - 4, y: 0, z: druidCenter.z + 5, rot: 2.1, scale: 1.9 },
      { x: druidCenter.x + 5, y: 0, z: druidCenter.z + 4, rot: 3.5, scale: 2.1 }
    ];
    createInstancedProp("./assets/environment/BirchTree_1.gltf", druidTreeTransforms, group, obstacleBoxes, 0.7, 8);

    // Rocks
    const druidRockTransforms = [
      { x: druidCenter.x - 2, y: 0, z: druidCenter.z - 2, rot: 0.5, scale: 1.4 },
      { x: druidCenter.x + 2, y: 0, z: druidCenter.z - 1, rot: 1.7, scale: 1.2 },
      { x: druidCenter.x - 1, y: 0, z: druidCenter.z + 2, rot: 2.4, scale: 1.5 },
      { x: druidCenter.x + 3, y: 0, z: druidCenter.z + 2, rot: 4.2, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/Rock_Medium_1.gltf", druidRockTransforms, group, obstacleBoxes, 1.2, 2);

    // Bushes
    const druidBushTransforms = [
      { x: druidCenter.x - 3, y: 0, z: druidCenter.z - 1, rot: 0.8, scale: 1.6 },
      { x: druidCenter.x + 3, y: 0, z: druidCenter.z - 3, rot: 1.9, scale: 1.8 },
      { x: druidCenter.x - 2, y: 0, z: druidCenter.z + 4, rot: 2.7, scale: 1.5 },
      { x: druidCenter.x + 1, y: 0, z: druidCenter.z + 4, rot: 3.4, scale: 1.7 }
    ];
    createInstancedProp("./assets/environment/Bush.gltf", druidBushTransforms, group);

    const druidLight = new THREE.PointLight(0x2ecc71, 4.0, 35);
    druidLight.position.set(druidCenter.x, 6.5, druidCenter.z);
    group.add(druidLight);

    // ==========================================
    // 8. 10 RADIAL SPAWN POINTS (radius 10 at y = 10)
    // ==========================================
    const spawnPoints = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      spawnPoints.push(new THREE.Vector3(
        Math.cos(angle) * 10,
        10,
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
        if (floatingRunesGroup) {
          floatingRunesGroup.rotation.y = elapsed * 0.45;
          torus1.rotation.z = elapsed * 0.8;
          torus2.rotation.x = -elapsed * 0.6;
          octa1.position.y = 0.8 + Math.sin(elapsed * 2.5) * 0.35;
          octa2.position.y = 0.5 + Math.cos(elapsed * 2.2) * 0.3;
          crystal.rotation.x = elapsed * 0.5;
          crystal.rotation.y = elapsed * 0.7;
        }
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
