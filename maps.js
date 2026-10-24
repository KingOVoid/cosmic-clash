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
    // 2. SOLID CEILING / ROOF (80 x 2 x 80 at y = 20)
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
    ceilingMesh.position.set(0, 20, 0);
    ceilingMesh.receiveShadow = true;
    group.add(ceilingMesh);

    platformBoxes.push(new THREE.Box3(
      new THREE.Vector3(-40, 19, -40),
      new THREE.Vector3(40, 21, 40)
    ));

    // ==========================================
    // 3. 4 SOLID SURROUNDING BOX WALLS (80x80 Room, Height 20)
    // ==========================================
    const wallHeight = 20;
    const wallThickness = 2;
    const wallTex = textureLoader.load("./assets/environment/T_RedBrick_BaseColor.png");
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(16, 4);
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
    // 4. CHANDELIER (Dead Center at 0, 18, 0)
    // Attach massive THREE.PointLight(0xffeedd, 2.5, 100)
    // ==========================================
    const chandelierChain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.0, 8),
      new THREE.MeshStandardMaterial({ color: 0x1f1f1f, metalness: 0.9, roughness: 0.2 })
    );
    chandelierChain.position.set(0, 19, 0);
    group.add(chandelierChain);

    createInstancedProp("./assets/environment/Chandelier.gltf", [{ x: 0, y: 18, z: 0, scale: 2.6 }], group);

    const chandelierLight = new THREE.PointLight(0xffeedd, 2.5, 100);
    chandelierLight.position.set(0, 18, 0);
    chandelierLight.castShadow = true;
    chandelierLight.shadow.mapSize.set(1024, 1024);
    chandelierLight.shadow.bias = -0.0005;
    group.add(chandelierLight);

    // ==========================================
    // 5. FILL THE VOID (Make 80x80 Room Feel Dense)
    // 4 Pillars around center at (±15, z: ±15)
    // Scatter Table.glb, Bench.glb, Rug.glb in empty middle space
    // ==========================================
    const centerPillarPositions = [
      { x: -15, z: -15 },
      { x: 15, z: -15 },
      { x: -15, z: 15 },
      { x: 15, z: 15 }
    ];
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.25, metalness: 0.1 });
    for (const p of centerPillarPositions) {
      const pillarMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 20, 24), pillarMat);
      pillarMesh.position.set(p.x, 10, p.z);
      pillarMesh.castShadow = true;
      pillarMesh.receiveShadow = true;
      group.add(pillarMesh);
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(p.x - 1.4, 0, p.z - 1.4),
        new THREE.Vector3(p.x + 1.4, 20, p.z + 1.4)
      ));
    }

    // Medieval Woven Rugs in Center Hall
    const rugCanvas = document.createElement("canvas");
    rugCanvas.width = 512;
    rugCanvas.height = 512;
    const rugCtx = rugCanvas.getContext("2d");
    if (rugCtx) {
      rugCtx.fillStyle = "#4a0e17";
      rugCtx.fillRect(0, 0, 512, 512);
      rugCtx.lineWidth = 24;
      rugCtx.strokeStyle = "#c59b27";
      rugCtx.strokeRect(12, 12, 488, 488);
      rugCtx.lineWidth = 8;
      rugCtx.strokeStyle = "#801b2b";
      rugCtx.strokeRect(40, 40, 432, 432);
      rugCtx.fillStyle = "#c59b27";
      rugCtx.beginPath();
      rugCtx.arc(256, 256, 80, 0, Math.PI * 2);
      rugCtx.fill();
    }
    const rugTex = new THREE.CanvasTexture(rugCanvas);
    const rugMat = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.85, metalness: 0.05 });

    const centerRug = new THREE.Mesh(new THREE.PlaneGeometry(12, 16), rugMat);
    centerRug.position.set(0, 0.02, -3.5);
    centerRug.rotation.x = -Math.PI / 2;
    centerRug.receiveShadow = true;
    group.add(centerRug);

    const sideRug = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), rugMat);
    sideRug.position.set(0, 0.02, 6);
    sideRug.rotation.x = -Math.PI / 2;
    sideRug.receiveShadow = true;
    group.add(sideRug);

    // Center Council Table & Side Tables
    const centerTables = [
      { x: 0, y: 0, z: -3.5, rot: 0, scale: 1.8 },
      { x: -6, y: 0, z: 5, rot: Math.PI / 2, scale: 1.4 },
      { x: 6, y: 0, z: 5, rot: -Math.PI / 2, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/Table.gltf", centerTables, group, obstacleBoxes, 1.4, 1.8);

    // Benches and Stools in Center Space
    const centerBenches = [
      { x: 0, y: 0, z: -5.8, rot: 0, scale: 1.6 },
      { x: 0, y: 0, z: -1.2, rot: 0, scale: 1.6 },
      { x: -8, y: 0, z: 5, rot: Math.PI / 2, scale: 1.4 },
      { x: 8, y: 0, z: 5, rot: -Math.PI / 2, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/Bench.gltf", centerBenches, group, obstacleBoxes, 0.8, 1.2);

    const centerStools = [
      { x: -3.5, y: 0, z: -3.5, rot: 0, scale: 1.3 },
      { x: 3.5, y: 0, z: -3.5, rot: 0, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/Stool.gltf", centerStools, group);

    // Feast props on Center Council Table
    const tablePlates = [
      { x: -1.2, y: 1.5, z: -3.5, scale: 1.2 },
      { x: 1.2, y: 1.5, z: -3.5, scale: 1.2 }
    ];
    createInstancedProp("./assets/environment/Table_Plate.gltf", tablePlates, group);

    const tableChalices = [
      { x: -0.6, y: 1.5, z: -3.2, scale: 1.3 },
      { x: 0.6, y: 1.5, z: -3.2, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/Chalice.gltf", tableChalices, group);

    const tableCandles = [
      { x: 0, y: 1.5, z: -3.5, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/CandleStick_Triple.gltf", tableCandles, group);
    const tableCandleLight = new THREE.PointLight(0xff9933, 1.4, 10);
    tableCandleLight.position.set(0, 2.4, -3.5);
    group.add(tableCandleLight);

    // ==========================================
    // 6. HIGH-RES LANTERNS (12 Total: 4 Over Corners, 8 Wall Lanterns)
    // ==========================================
    const lanternPositions = [
      // 4 over corners (±25, 14, ±25)
      { x: -25, y: 14, z: -25 },
      { x: 25, y: 14, z: -25 },
      { x: -25, y: 14, z: 25 },
      { x: 25, y: 14, z: 25 },
      // 8 perimeter wall lanterns at y = 12
      { x: -20, y: 12, z: -39 },
      { x: 20, y: 12, z: -39 },
      { x: -20, y: 12, z: 39 },
      { x: 20, y: 12, z: 39 },
      { x: -39, y: 12, z: -20 },
      { x: -39, y: 12, z: 20 },
      { x: 39, y: 12, z: -20 },
      { x: 39, y: 12, z: 20 }
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

        const light = new THREE.PointLight(0xffaa00, 1.2, 25);
        light.position.set(0, -0.3, 0);
        lanternClone.add(light);

        group.add(lanternClone);
        lobbyLanterns.push({ lantern: lanternClone, light });
      }
    };
    loadHighResLanterns();

    // ==========================================
    // 7. PALADIN CORNER (Holy Warrior, x: 25, z: -25)
    // No fences. Altar built with Table.glb covered in Candle.glb and Book.glb.
    // Statue.glb behind it flanked by Banner.glb.
    // Sword.glb and Shield.glb leaning against altar.
    // ==========================================
    const palCenter = new THREE.Vector3(25, 0, -25);

    // Altar Table
    const palAltar = [
      { x: palCenter.x, y: 0, z: palCenter.z - 2.5, rot: 0, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Table.gltf", palAltar, group, obstacleBoxes, 1.5, 1.8);

    // Altar Candles
    const palCandles = [
      { x: palCenter.x - 1.2, y: 1.5, z: palCenter.z - 2.5, rot: 0.2, scale: 1.3 },
      { x: palCenter.x + 1.2, y: 1.5, z: palCenter.z - 2.5, rot: -0.4, scale: 1.3 },
      { x: palCenter.x, y: 1.5, z: palCenter.z - 2.8, rot: 0, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/Candle.gltf", palCandles, group);
    const palCandleLight = new THREE.PointLight(0xffd54f, 1.8, 12);
    palCandleLight.position.set(palCenter.x, 2.5, palCenter.z - 2.5);
    group.add(palCandleLight);

    // Holy Tomes on Altar
    const palBooks = [
      { x: palCenter.x - 0.4, y: 1.5, z: palCenter.z - 2.3, rot: 0.15, scale: 1.4 },
      { x: palCenter.x + 0.5, y: 1.5, z: palCenter.z - 2.3, rot: -0.2, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/Book.gltf", palBooks, group);

    // Sword and Shield leaning against Altar
    const palSword = [
      { x: palCenter.x - 1.4, y: 0.5, z: palCenter.z - 1.3, rotX: 0.35, rotY: 0.2, rotZ: 0.2, scale: 1.7 }
    ];
    createInstancedProp("./assets/environment/Sword.gltf", palSword, group);

    const palShield = [
      { x: palCenter.x + 1.4, y: 0.5, z: palCenter.z - 1.3, rotX: 0.3, rotY: -0.3, rotZ: -0.15, scale: 1.7 }
    ];
    createInstancedProp("./assets/environment/Shield.gltf", palShield, group);

    // Statue behind Altar
    const palStatue = [
      { x: palCenter.x, y: 0, z: palCenter.z - 7.5, rot: 0, scale: 2.2 }
    ];
    createInstancedProp("./assets/environment/Statue.gltf", palStatue, group, obstacleBoxes, 1.2, 3.5);

    // Flanking Banners
    const palBanners = [
      { x: palCenter.x - 4.5, y: 0, z: palCenter.z - 7.5, rot: 0.2, scale: 2.4 },
      { x: palCenter.x + 4.5, y: 0, z: palCenter.z - 7.5, rot: -0.2, scale: 2.4 }
    ];
    createInstancedProp("./assets/environment/Banner.gltf", palBanners, group);

    // 4 Sanctuary Pillars
    const palPillars = [
      { x: palCenter.x - 6.0, z: palCenter.z - 6.0 },
      { x: palCenter.x + 6.0, z: palCenter.z - 6.0 },
      { x: palCenter.x - 6.0, z: palCenter.z + 6.0 },
      { x: palCenter.x + 6.0, z: palCenter.z + 6.0 }
    ];
    for (const p of palPillars) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 16, 24), pillarMat);
      pillar.position.set(p.x, 8.0, p.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(p.x - 1.2, 0, p.z - 1.2),
        new THREE.Vector3(p.x + 1.2, 16, p.z + 1.2)
      ));
    }

    // Radiant golden light for Paladin
    const palLight = new THREE.PointLight(0xf59e0b, 3.2, 32);
    palLight.position.set(palCenter.x, 6.0, palCenter.z - 2.5);
    group.add(palLight);

    // ==========================================
    // 8. ROGUE CORNER (Thief/Assassin, x: -25, z: -25)
    // Planning table with Map.glb and Dagger.glb.
    // GoldCoin.glb stacks, TargetDummy.glb, dim dark red light.
    // ==========================================
    const rogueCenter = new THREE.Vector3(-25, 0, -25);

    // Planning Table
    const rogueTable = [
      { x: rogueCenter.x, y: 0, z: rogueCenter.z, rot: 0, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Table.gltf", rogueTable, group, obstacleBoxes, 1.4, 1.8);

    // Map on Planning Table
    const rogueMap = [
      { x: rogueCenter.x, y: 1.5, z: rogueCenter.z, rot: 0.2, scale: 1.4 }
    ];
    createInstancedProp("./assets/environment/Map.gltf", rogueMap, group);

    // Dagger sticking into the Map
    const rogueDagger = [
      { x: rogueCenter.x + 0.3, y: 1.5, z: rogueCenter.z + 0.2, rotX: 1.2, rotY: 0.4, rotZ: 0.5, scale: 1.6 }
    ];
    createInstancedProp("./assets/environment/Dagger.gltf", rogueDagger, group);

    // Gold Coin stacks on Table
    const rogueTableCoins = [
      { x: rogueCenter.x - 0.7, y: 1.5, z: rogueCenter.z - 0.3, rot: 0.4, scale: 1.4 },
      { x: rogueCenter.x + 0.6, y: 1.5, z: rogueCenter.z - 0.4, rot: 0.8, scale: 1.3 }
    ];
    createInstancedProp("./assets/environment/GoldCoin.gltf", rogueTableCoins, group);

    // Target Dummy for knife training
    const rogueDummy = [
      { x: rogueCenter.x + 4.5, y: 0, z: rogueCenter.z + 2.0, rot: -0.6, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/TargetDummy.gltf", rogueDummy, group, obstacleBoxes, 0.9, 2.2);

    // Weapon Stand with daggers & blades
    const rogueWeaponStand = [
      { x: rogueCenter.x + 4.5, y: 0, z: rogueCenter.z - 2.5, rot: -1.2, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/WeaponStand.gltf", rogueWeaponStand, group, obstacleBoxes, 0.8, 1.8);

    // Floor Gold Coin stacks & Loot Chest
    const rogueFloorCoins = [
      { x: rogueCenter.x - 2.5, y: 0, z: rogueCenter.z + 2.0, rot: 0.3, scale: 1.6 },
      { x: rogueCenter.x - 1.5, y: 0, z: rogueCenter.z + 3.0, rot: 1.1, scale: 1.4 },
      { x: rogueCenter.x + 1.5, y: 0, z: rogueCenter.z - 3.5, rot: 0.6, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/GoldCoin.gltf", rogueFloorCoins, group);

    const rogueChest = [
      { x: rogueCenter.x - 2.5, y: 0, z: rogueCenter.z - 2.5, rot: 0.45, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/Chest_Wood.gltf", rogueChest, group, obstacleBoxes, 0.8, 1.2);

    // Dark Hideout Cover Blocks
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.95 });
    const rogueBlocks = [
      { size: [3.5, 4.0, 3.0], pos: [-31, 2.0, -23] },
      { size: [4.0, 2.5, 2.5], pos: [-23, 1.25, -31] }
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

    // Dim dark red corner light
    const rogueLight = new THREE.PointLight(0xcc1111, 2.8, 25);
    rogueLight.position.set(rogueCenter.x, 5.0, rogueCenter.z);
    group.add(rogueLight);

    // ==========================================
    // 9. SORCERER CORNER (Arcane, x: -25, z: 25)
    // Keep Cauldron + multiple Bookshelf.glb + glowing Crystal.glb clusters
    // + floating Potion.glb bottles with sine wave animation
    // ==========================================
    const sorcCenter = new THREE.Vector3(-25, 0, 25);

    // Cauldron
    const cauldronTransforms = [
      { x: sorcCenter.x, y: 0, z: sorcCenter.z, rot: 0, scale: 2.0 }
    ];
    createInstancedProp("./assets/environment/Cauldron.gltf", cauldronTransforms, group, obstacleBoxes, 1.2, 2.0);

    // Multiple Bookshelf.glb models lining walls
    const sorcBookshelves = [
      { x: sorcCenter.x - 8.0, y: 0, z: sorcCenter.z - 1.0, rot: Math.PI / 2, scale: 1.8 },
      { x: sorcCenter.x - 8.0, y: 0, z: sorcCenter.z + 4.0, rot: Math.PI / 2, scale: 1.8 },
      { x: sorcCenter.x + 1.0, y: 0, z: sorcCenter.z + 8.0, rot: 0, scale: 1.8 },
      { x: sorcCenter.x - 4.0, y: 0, z: sorcCenter.z + 8.0, rot: 0, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Bookshelf.gltf", sorcBookshelves, group, obstacleBoxes, 1.2, 3.5);

    // Spellbook on Pedestal
    const spellbookTransforms = [
      { x: sorcCenter.x + 3.2, y: 0, z: sorcCenter.z - 2.0, rot: -Math.PI / 4, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Spellbook.gltf", spellbookTransforms, group, obstacleBoxes, 0.8, 2.0);

    // Arcane Study Table
    const sorcTableTransforms = [
      { x: sorcCenter.x - 3.0, y: 0, z: sorcCenter.z + 3.0, rot: 0.78, scale: 1.5 }
    ];
    createInstancedProp("./assets/environment/Table.gltf", sorcTableTransforms, group, obstacleBoxes, 1.4, 1.6);

    // Glowing Crystal Clusters around Cauldron
    const crystalGeo = new THREE.OctahedronGeometry(0.5, 0);
    const crystalMatCyan = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 2.5,
      roughness: 0.1,
      metalness: 0.9
    });
    const crystalMatViolet = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0xa855f7,
      emissiveIntensity: 2.5,
      roughness: 0.1,
      metalness: 0.9
    });

    const crystalClusters = [
      { x: sorcCenter.x - 2.5, z: sorcCenter.z - 2.5, mat: crystalMatCyan },
      { x: sorcCenter.x + 2.5, z: sorcCenter.z + 2.5, mat: crystalMatViolet },
      { x: sorcCenter.x - 2.5, z: sorcCenter.z + 2.5, mat: crystalMatCyan }
    ];
    for (const c of crystalClusters) {
      const cGroup = new THREE.Group();
      cGroup.position.set(c.x, 0, c.z);
      for (let k = 0; k < 4; k++) {
        const cMesh = new THREE.Mesh(crystalGeo, c.mat);
        const ang = (k / 4) * Math.PI * 2;
        cMesh.position.set(Math.cos(ang) * 0.4, 0.4 + k * 0.15, Math.sin(ang) * 0.4);
        cMesh.scale.set(0.6, 1.2 + k * 0.3, 0.6);
        cMesh.rotation.set((k - 2) * 0.15, ang, (k - 1) * 0.2);
        cGroup.add(cMesh);
      }
      group.add(cGroup);
    }

    // Floating Potion bottles
    const floatingPotions = [];
    const potionPositions = [
      { x: sorcCenter.x - 1.8, y: 2.2, z: sorcCenter.z - 1.2, phase: 0 },
      { x: sorcCenter.x + 1.8, y: 2.5, z: sorcCenter.z - 1.0, phase: 1.2 },
      { x: sorcCenter.x - 1.5, y: 2.3, z: sorcCenter.z + 1.8, phase: 2.4 },
      { x: sorcCenter.x + 1.6, y: 2.1, z: sorcCenter.z + 1.5, phase: 3.6 },
      { x: sorcCenter.x, y: 2.6, z: sorcCenter.z + 2.4, phase: 4.8 }
    ];

    const loadFloatingPotions = async () => {
      let potionScene = null;
      try {
        const gltf = await gltfLoader.loadAsync("./assets/environment/Potion.gltf");
        if (gltf && gltf.scene) potionScene = gltf.scene;
      } catch (e) {}

      for (const p of potionPositions) {
        let potionMesh;
        if (potionScene) {
          potionMesh = potionScene.clone(true);
        } else {
          potionMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.3, 0.6, 8),
            new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.1, transparent: true, opacity: 0.85 })
          );
        }
        potionMesh.position.set(p.x, p.y, p.z);
        potionMesh.scale.set(1.5, 1.5, 1.5);
        group.add(potionMesh);
        floatingPotions.push({ mesh: potionMesh, baseY: p.y, phase: p.phase });
      }
    };
    loadFloatingPotions();

    // Particle System: Custom THREE.Points particle emitter rising out of the cauldron
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
    const sorcLight = new THREE.PointLight(0xa855f7, 3.5, 32);
    sorcLight.position.set(sorcCenter.x, 5.5, sorcCenter.z);
    group.add(sorcLight);

    // ==========================================
    // 10. DRUID CORNER (Nature, x: 25, z: 25)
    // No scarecrow/doll. Massive OakTree.glb and PineTree.glb forest.
    // Ring of Rock.glb, glowing Mushroom.glb, Flower.glb patches.
    // ==========================================
    const druidCenter = new THREE.Vector3(25, 0, 25);

    // Thick forest of massive Oak & Pine Trees
    const druidOakTrees = [
      { x: druidCenter.x - 7.0, y: 0, z: druidCenter.z - 7.0, rot: 0.3, scale: 2.6 },
      { x: druidCenter.x + 8.0, y: 0, z: druidCenter.z - 6.0, rot: 1.1, scale: 2.8 },
      { x: druidCenter.x + 9.0, y: 0, z: druidCenter.z + 1.0, rot: 2.9, scale: 2.5 },
      { x: druidCenter.x - 8.0, y: 0, z: druidCenter.z + 3.0, rot: 1.4, scale: 2.7 },
      { x: druidCenter.x + 2.0, y: 0, z: druidCenter.z - 8.5, rot: 0.6, scale: 2.5 }
    ];
    createInstancedProp("./assets/environment/OakTree.gltf", druidOakTrees, group, obstacleBoxes, 0.9, 8);

    const druidPineTrees = [
      { x: druidCenter.x + 6.0, y: 0, z: druidCenter.z + 7.0, rot: 0.8, scale: 2.8 },
      { x: druidCenter.x - 6.0, y: 0, z: druidCenter.z + 7.0, rot: 2.2, scale: 2.6 },
      { x: druidCenter.x, y: 0, z: druidCenter.z + 9.5, rot: 1.7, scale: 2.9 },
      { x: druidCenter.x - 9.0, y: 0, z: druidCenter.z - 2.0, rot: 2.1, scale: 2.5 },
      { x: druidCenter.x + 7.0, y: 0, z: druidCenter.z - 2.0, rot: 0.4, scale: 2.7 }
    ];
    createInstancedProp("./assets/environment/PineTree.gltf", druidPineTrees, group, obstacleBoxes, 0.9, 9);

    // Ring of Rock.glb forming a sacred stone circle (radius ~ 5.0)
    const stoneCircleRocks = [];
    const numRocks = 8;
    for (let r = 0; r < numRocks; r++) {
      const rockAng = (r / numRocks) * Math.PI * 2;
      stoneCircleRocks.push({
        x: druidCenter.x + Math.cos(rockAng) * 4.8,
        y: 0,
        z: druidCenter.z + Math.sin(rockAng) * 4.8,
        rot: rockAng + 0.5,
        scale: 1.4 + (r % 3) * 0.2
      });
    }
    createInstancedProp("./assets/environment/Rock.gltf", stoneCircleRocks, group, obstacleBoxes, 0.9, 1.6);

    // Glowing Mushroom.glb nestled around the stone circle
    const druidMushrooms = [
      { x: druidCenter.x - 2.0, y: 0, z: druidCenter.z - 2.0, rot: 0.5, scale: 2.0 },
      { x: druidCenter.x + 2.0, y: 0, z: druidCenter.z + 2.0, rot: 1.2, scale: 2.2 },
      { x: druidCenter.x - 2.5, y: 0, z: druidCenter.z + 1.5, rot: 2.1, scale: 1.8 },
      { x: druidCenter.x + 1.8, y: 0, z: druidCenter.z - 2.5, rot: 3.0, scale: 1.9 }
    ];
    createInstancedProp("./assets/environment/Mushroom.gltf", druidMushrooms, group);

    // Flower.glb patches carpeting the sacred grove
    const druidFlowers = [
      { x: druidCenter.x - 1.2, y: 0, z: druidCenter.z, rot: 0.4, scale: 1.8 },
      { x: druidCenter.x + 1.2, y: 0, z: druidCenter.z, rot: 1.8, scale: 1.8 },
      { x: druidCenter.x, y: 0, z: druidCenter.z - 1.5, rot: 2.5, scale: 1.8 },
      { x: druidCenter.x, y: 0, z: druidCenter.z + 1.5, rot: 0.9, scale: 1.8 }
    ];
    createInstancedProp("./assets/environment/Flower.gltf", druidFlowers, group);

    // Sacred emerald grove light
    const druidLight = new THREE.PointLight(0x22c55e, 3.5, 32);
    druidLight.position.set(druidCenter.x, 5.5, druidCenter.z);
    group.add(druidLight);

    // ==========================================
    // 11. 10 RADIAL SPAWN POINTS (radius 10 at y = 2)
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
            positions[i3 + 1] += particleSpeeds[i] * dt;
            particleAngles[i] += (1.4 + (i % 3) * 0.3) * dt;
            const progress = (positions[i3 + 1] - cauldronBaseY) / (cauldronMaxY - cauldronBaseY);
            const currentRad = particleRadii[i] + Math.max(0, progress) * 0.8;
            positions[i3] = sorcCenter.x + Math.cos(particleAngles[i]) * currentRad;
            positions[i3 + 2] = sorcCenter.z + Math.sin(particleAngles[i]) * currentRad;

            if (positions[i3 + 1] > cauldronMaxY) {
              positions[i3 + 1] = cauldronBaseY + Math.random() * 0.2;
              particleAngles[i] = Math.random() * Math.PI * 2;
            }
          }
          cauldronSmoke.geometry.attributes.position.needsUpdate = true;
        }

        // Floating Potion bottles gentle sine wave animation
        if (floatingPotions.length > 0) {
          for (const p of floatingPotions) {
            p.mesh.position.y = p.baseY + Math.sin(elapsed * 2.5 + p.phase) * 0.22;
            p.mesh.rotation.y = elapsed * 0.8 + p.phase;
            p.mesh.rotation.z = Math.sin(elapsed * 1.5 + p.phase) * 0.12;
          }
        }

        // Lantern & Chandelier gentle warmth flicker
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
