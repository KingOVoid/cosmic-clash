import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AssetManager } from "./assets.js";

export class MapGenerator {
  static createMagmaCore(scene) {
    const group = new THREE.Group();
    group.name = "map-magma-core";
    scene.add(group);

    const platformBoxes = [];
    const obstacleBoxes = [];

    // Dark volcanic basalt material
    const platformMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f232b,
      roughness: 0.82,
      metalness: 0.15,
      flatShading: true
    });

    const bridgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e3440,
      roughness: 0.76,
      metalness: 0.22,
      flatShading: true
    });

    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1c23,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true
    });

    // North Platform (22 x 2 x 18) centered at z = 18
    const northGeom = new THREE.BoxGeometry(22, 2, 18);
    const northPlatform = new THREE.Mesh(northGeom, platformMaterial);
    northPlatform.position.set(0, -1, 18);
    northPlatform.receiveShadow = true;
    northPlatform.castShadow = true;
    group.add(northPlatform);
    platformBoxes.push(new THREE.Box3(new THREE.Vector3(-11, -2, 9), new THREE.Vector3(11, 0, 27)));

    // South Platform (22 x 2 x 18) centered at z = -18
    const southGeom = new THREE.BoxGeometry(22, 2, 18);
    const southPlatform = new THREE.Mesh(southGeom, platformMaterial);
    southPlatform.position.set(0, -1, -18);
    southPlatform.receiveShadow = true;
    southPlatform.castShadow = true;
    group.add(southPlatform);
    platformBoxes.push(new THREE.Box3(new THREE.Vector3(-11, -2, -27), new THREE.Vector3(11, 0, -9)));

    // Connecting Bridge (4.4 x 1.8 x 18) centered at z = 0
    const bridgeGeom = new THREE.BoxGeometry(4.4, 1.8, 18);
    const bridge = new THREE.Mesh(bridgeGeom, bridgeMaterial);
    bridge.position.set(0, -0.9, 0);
    bridge.receiveShadow = true;
    bridge.castShadow = true;
    group.add(bridge);
    platformBoxes.push(new THREE.Box3(new THREE.Vector3(-2.2, -2, -9), new THREE.Vector3(2.2, 0, 9)));

    // Bridge border curbs (visual)
    const curbGeom = new THREE.BoxGeometry(0.3, 0.4, 18);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.9 });
    const curbL = new THREE.Mesh(curbGeom, curbMat);
    curbL.position.set(-2.2, 0.2, 0);
    const curbR = new THREE.Mesh(curbGeom, curbMat);
    curbR.position.set(2.2, 0.2, 0);
    group.add(curbL);
    group.add(curbR);

    // Glowing Red Lava Plane
    const lavaGeom = new THREE.PlaneGeometry(240, 240, 32, 32);
    const lavaMat = new THREE.MeshStandardMaterial({
      color: 0xff2200,
      emissive: 0xff3800,
      emissiveIntensity: 1.45,
      roughness: 0.3,
      metalness: 0.1
    });
    const lavaMesh = new THREE.Mesh(lavaGeom, lavaMat);
    lavaMesh.rotation.x = -Math.PI / 2;
    lavaMesh.position.y = -3.0;
    lavaMesh.receiveShadow = false;
    group.add(lavaMesh);

    // Magma core ambient glow point lights
    const lavaLightNorth = new THREE.PointLight(0xff4400, 2.5, 40);
    lavaLightNorth.position.set(0, 1, 12);
    group.add(lavaLightNorth);

    const lavaLightSouth = new THREE.PointLight(0xff4400, 2.5, 40);
    lavaLightSouth.position.set(0, 1, -12);
    group.add(lavaLightSouth);

    // Tactical Basalt Pillars on North & South Platforms (obstacles)
    const pillarGeom = new THREE.BoxGeometry(1.8, 5, 1.8);
    const pillarPositions = [
      // North platform pillars
      [-7, 2.5, 14],
      [7, 2.5, 14],
      [-7, 2.5, 22],
      [7, 2.5, 22],
      // South platform pillars
      [-7, 2.5, -14],
      [7, 2.5, -14],
      [-7, 2.5, -22],
      [7, 2.5, -22]
    ];

    for (let i = 0; i < pillarPositions.length; i += 1) {
      const p = pillarPositions[i];
      const pillar = new THREE.Mesh(pillarGeom, pillarMaterial);
      pillar.position.set(p[0], p[1], p[2]);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);

      const box = new THREE.Box3();
      box.setFromCenterAndSize(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Vector3(1.8, 5, 1.8));
      obstacleBoxes.push(box);
    }

    const hazards = {
      lava: {
        active: true,
        planeY: -2,
        damagePerSec: 10,
        safeEdges: [
          new THREE.Vector3(0, 0, 9),
          new THREE.Vector3(0, 0, -9),
          new THREE.Vector3(0, 0, 18),
          new THREE.Vector3(0, 0, -18),
          new THREE.Vector3(0, 0, 0)
        ]
      },
      jumpPads: []
    };

    return {
      type: "magma",
      name: "Magma Core",
      group,
      platformBoxes,
      obstacleBoxes,
      hazards,
      spawnPoints: [new THREE.Vector3(0, 0, 18), new THREE.Vector3(0, 0, -18)],
      update: (dt, elapsed) => {
        lavaMat.emissiveIntensity = 1.35 + Math.sin(elapsed * 2.5) * 0.25;
      },
      dispose: () => {
        scene.remove(group);
      }
    };
  }

  static createClockworkVoid(scene) {
    const group = new THREE.Group();
    group.name = "map-clockwork-void";
    scene.add(group);

    const platformBoxes = [];
    const obstacleBoxes = [];
    const jumpPads = [];

    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x222738,
      roughness: 0.65,
      metalness: 0.35,
      flatShading: true
    });

    const undersideMaterial = new THREE.MeshStandardMaterial({
      color: 0x121520,
      roughness: 0.9,
      metalness: 0.2,
      flatShading: true
    });

    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.1
    });

    const islandDefs = [
      { id: "center", pos: [0, 0, 0], radius: 9, height: 3 },
      { id: "north", pos: [0, 2.5, 28], radius: 7.5, height: 3 },
      { id: "south", pos: [0, 2.5, -28], radius: 7.5, height: 3 },
      { id: "east", pos: [28, 4.0, 0], radius: 7.5, height: 3 },
      { id: "west", pos: [-28, 4.0, 0], radius: 7.5, height: 3 }
    ];

    islandDefs.forEach((def) => {
      const topGeom = new THREE.CylinderGeometry(def.radius, def.radius * 0.92, 1, 18);
      const topMesh = new THREE.Mesh(topGeom, stoneMaterial);
      topMesh.position.set(def.pos[0], def.pos[1] - 0.5, def.pos[2]);
      topMesh.receiveShadow = true;
      topMesh.castShadow = true;
      group.add(topMesh);

      const coneGeom = new THREE.ConeGeometry(def.radius * 0.92, def.height * 2.2, 12);
      const coneMesh = new THREE.Mesh(coneGeom, undersideMaterial);
      coneMesh.rotation.x = Math.PI;
      coneMesh.position.set(def.pos[0], def.pos[1] - 1 - (def.height * 1.1), def.pos[2]);
      group.add(coneMesh);

      // Walkable platform box for top
      const r = def.radius;
      platformBoxes.push(
        new THREE.Box3(
          new THREE.Vector3(def.pos[0] - r, def.pos[1] - 1.5, def.pos[2] - r),
          new THREE.Vector3(def.pos[0] + r, def.pos[1], def.pos[2] + r)
        )
      );

      // Cover monolith in center of outer islands
      if (def.id !== "center") {
        const monoGeom = new THREE.BoxGeometry(1.6, 3.8, 1.6);
        const mono = new THREE.Mesh(monoGeom, stoneMaterial);
        mono.position.set(def.pos[0], def.pos[1] + 1.9, def.pos[2]);
        mono.castShadow = true;
        mono.receiveShadow = true;
        group.add(mono);

        const monoBox = new THREE.Box3();
        monoBox.setFromCenterAndSize(mono.position, new THREE.Vector3(1.6, 3.8, 1.6));
        obstacleBoxes.push(monoBox);
      }
    });

    // Glowing Green Boxes (Jump Pads) on the edges
    const padGeom = new THREE.BoxGeometry(2.4, 0.4, 2.4);

    const padDefs = [
      // Central Island Jump Pads
      {
        pos: [0, 0.2, 7.8],
        impulse: new THREE.Vector3(0, 24, 25), // Massive +Y and +Z launching to North Island
        target: "north"
      },
      {
        pos: [0, 0.2, -7.8],
        impulse: new THREE.Vector3(0, 24, -25), // Massive +Y and -Z launching to South Island
        target: "south"
      },
      {
        pos: [7.8, 0.2, 0],
        impulse: new THREE.Vector3(25, 24, 0), // Launching to East Island
        target: "east"
      },
      {
        pos: [-7.8, 0.2, 0],
        impulse: new THREE.Vector3(-25, 24, 0), // Launching to West Island
        target: "west"
      },

      // Outer Islands Return Jump Pads (launching back to Center)
      {
        pos: [0, 2.7, 21.2],
        impulse: new THREE.Vector3(0, 22, -25), // Return to center
        target: "center"
      },
      {
        pos: [0, 2.7, -21.2],
        impulse: new THREE.Vector3(0, 22, 25), // Return to center
        target: "center"
      },
      {
        pos: [21.2, 4.2, 0],
        impulse: new THREE.Vector3(-25, 22, 0), // Return to center
        target: "center"
      },
      {
        pos: [-21.2, 4.2, 0],
        impulse: new THREE.Vector3(25, 22, 0), // Return to center
        target: "center"
      }
    ];

    padDefs.forEach((p) => {
      const padMesh = new THREE.Mesh(padGeom, padMaterial);
      padMesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
      padMesh.castShadow = true;
      group.add(padMesh);

      const box = new THREE.Box3();
      box.setFromCenterAndSize(padMesh.position, new THREE.Vector3(2.4, 0.9, 2.4));

      jumpPads.push({
        mesh: padMesh,
        box,
        impulse: p.impulse,
        cooldownUntil: 0
      });
    });

    const hazards = {
      lava: {
        active: false,
        planeY: -50,
        damagePerSec: 0,
        safeEdges: [new THREE.Vector3(0, 0, 0)]
      },
      jumpPads
    };

    return {
      type: "clockwork",
      name: "Clockwork Void",
      group,
      platformBoxes,
      obstacleBoxes,
      hazards,
      spawnPoints: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.5, 28)],
      update: (dt, elapsed) => {
        padMaterial.emissiveIntensity = 1.6 + Math.sin(elapsed * 4.0) * 0.45;
      },
      dispose: () => {
        scene.remove(group);
      }
    };
  }

  static createOvergrownSanctum(scene, envAssets) {
    const group = new THREE.Group();
    group.name = "map-overgrown-sanctum";
    scene.add(group);

    const platformBoxes = [];
    const obstacleBoxes = [];

    // Sanctum floor (60 x 60)
    const floorGeom = new THREE.BoxGeometry(60, 2, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x3d4a3e,
      roughness: 0.88,
      metalness: 0.08,
      flatShading: true
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.position.set(0, -1, 0);
    floor.receiveShadow = true;
    group.add(floor);
    platformBoxes.push(new THREE.Box3(new THREE.Vector3(-30, -2, -30), new THREE.Vector3(30, 0, 30)));

    // Outer Perimeter Boundary Walls
    const wallGeom = new THREE.BoxGeometry(60, 4.5, 1.6);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x283029, roughness: 0.9 });

    const wallN = new THREE.Mesh(wallGeom, wallMat);
    wallN.position.set(0, 2.25, 29.2);
    wallN.castShadow = true;
    wallN.receiveShadow = true;
    group.add(wallN);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-30, 0, 28.4), new THREE.Vector3(30, 4.5, 30)));

    const wallS = new THREE.Mesh(wallGeom, wallMat);
    wallS.position.set(0, 2.25, -29.2);
    wallS.castShadow = true;
    wallS.receiveShadow = true;
    group.add(wallS);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 4.5, -28.4)));

    const wallSideGeom = new THREE.BoxGeometry(1.6, 4.5, 60);
    const wallE = new THREE.Mesh(wallSideGeom, wallMat);
    wallE.position.set(29.2, 2.25, 0);
    wallE.castShadow = true;
    wallE.receiveShadow = true;
    group.add(wallE);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(28.4, 0, -30), new THREE.Vector3(30, 4.5, 30)));

    const wallW = new THREE.Mesh(wallSideGeom, wallMat);
    wallW.position.set(-29.2, 2.25, 0);
    wallW.castShadow = true;
    wallW.receiveShadow = true;
    group.add(wallW);
    obstacleBoxes.push(new THREE.Box3(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(-28.4, 4.5, 30)));

    // Retrieve Tree and Rock geometries/materials for InstancedMesh
    const treeData = (envAssets && envAssets.tree) || (envAssets && envAssets.treeGeometry && { geometry: envAssets.treeGeometry, material: envAssets.treeMaterial });
    const rockData = (envAssets && envAssets.rock) || (envAssets && envAssets.rockGeometry && { geometry: envAssets.rockGeometry, material: envAssets.rockMaterial });

    const treeGeom = (treeData && treeData.geometry) || new THREE.ConeGeometry(1.6, 4.8, 8);
    const treeMat = (treeData && treeData.material) || new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 });

    const rockGeom = (rockData && rockData.geometry) || new THREE.IcosahedronGeometry(1.4, 1);
    const rockMat = (rockData && rockData.material) || new THREE.MeshStandardMaterial({ color: 0x5a6065, roughness: 0.9 });

    // Procedural Maze Layout Pattern
    // Define wall coordinates to create maze corridors, open combat clearings, and choke points
    const mazeTreeSpots = [];
    const mazeRockSpots = [];

    // Maze grid partitions (-24 to +24 in steps of ~4.5)
    const wallLines = [
      // Horizontal wall segments
      { x1: -22, x2: -6, z: 18 },
      { x1: 6, x2: 22, z: 18 },
      { x1: -16, x2: 16, z: 10 },
      { x1: -22, x2: -10, z: 0 },
      { x1: 10, x2: 22, z: 0 },
      { x1: -16, x2: 16, z: -10 },
      { x1: -22, x2: -6, z: -18 },
      { x1: 6, x2: 22, z: -18 },
      // Vertical wall segments
      { x: -18, z1: 10, z2: 18 },
      { x: 18, z1: 10, z2: 18 },
      { x: -10, z1: -8, z2: 8 },
      { x: 10, z1: -8, z2: 8 },
      { x: -18, z1: -18, z2: -10 },
      { x: 18, z1: -18, z2: -10 }
    ];

    let seed = 12345;
    function pseudoRandom() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    wallLines.forEach((line) => {
      if (line.z !== undefined) {
        // Horizontal line
        const step = 2.4;
        for (let x = line.x1; x <= line.x2; x += step) {
          const jitterX = (pseudoRandom() - 0.5) * 0.5;
          const jitterZ = (pseudoRandom() - 0.5) * 0.5;
          const s = 0.85 + pseudoRandom() * 0.35;
          const rotY = pseudoRandom() * Math.PI * 2;
          if (pseudoRandom() > 0.32) {
            mazeTreeSpots.push({ x: x + jitterX, z: line.z + jitterZ, scale: s, rotY });
          } else {
            mazeRockSpots.push({ x: x + jitterX, z: line.z + jitterZ, scale: s * 1.1, rotY });
          }
        }
      } else if (line.x !== undefined) {
        // Vertical line
        const step = 2.4;
        for (let z = line.z1; z <= line.z2; z += step) {
          const jitterX = (pseudoRandom() - 0.5) * 0.5;
          const jitterZ = (pseudoRandom() - 0.5) * 0.5;
          const s = 0.85 + pseudoRandom() * 0.35;
          const rotY = pseudoRandom() * Math.PI * 2;
          if (pseudoRandom() > 0.35) {
            mazeTreeSpots.push({ x: line.x + jitterX, z: z + jitterZ, scale: s, rotY });
          } else {
            mazeRockSpots.push({ x: line.x + jitterX, z: z + jitterZ, scale: s * 1.1, rotY });
          }
        }
      }
    });

    // Add random accent trees and rock clusters throughout maze
    const extraSpots = [
      [-6, 6], [6, 6], [-6, -6], [6, -6],
      [-22, 8], [22, 8], [-22, -8], [22, -8],
      [0, 22], [0, -22], [-14, 22], [14, 22], [-14, -22], [14, -22]
    ];
    extraSpots.forEach((pt) => {
      const s = 0.9 + pseudoRandom() * 0.35;
      const rotY = pseudoRandom() * Math.PI * 2;
      if (pseudoRandom() > 0.5) {
        mazeTreeSpots.push({ x: pt[0], z: pt[1], scale: s, rotY });
      } else {
        mazeRockSpots.push({ x: pt[0], z: pt[1], scale: s * 1.15, rotY });
      }
    });

    // Create THREE.InstancedMesh for Trees
    const treeCount = mazeTreeSpots.length;
    const treeInstanced = new THREE.InstancedMesh(treeGeom, treeMat, treeCount);
    treeInstanced.castShadow = true;
    treeInstanced.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i += 1) {
      const spot = mazeTreeSpots[i];
      dummy.position.set(spot.x, 0, spot.z);
      dummy.rotation.set(0, spot.rotY, 0);
      dummy.scale.set(spot.scale, spot.scale, spot.scale);
      dummy.updateMatrix();
      treeInstanced.setMatrixAt(i, dummy.matrix);

      // Calculate Box3 corresponding to the X/Z coordinates of instanced tree
      const w = 1.0 * spot.scale;
      const h = 5.2 * spot.scale;
      const box = new THREE.Box3(
        new THREE.Vector3(spot.x - w, 0, spot.z - w),
        new THREE.Vector3(spot.x + w, h, spot.z + w)
      );
      obstacleBoxes.push(box);
    }
    treeInstanced.instanceMatrix.needsUpdate = true;
    group.add(treeInstanced);

    // Create THREE.InstancedMesh for Rocks
    const rockCount = mazeRockSpots.length;
    const rockInstanced = new THREE.InstancedMesh(rockGeom, rockMat, rockCount);
    rockInstanced.castShadow = true;
    rockInstanced.receiveShadow = true;

    for (let j = 0; j < rockCount; j += 1) {
      const spot = mazeRockSpots[j];
      dummy.position.set(spot.x, 0, spot.z);
      dummy.rotation.set(0, spot.rotY, 0);
      dummy.scale.set(spot.scale, spot.scale, spot.scale);
      dummy.updateMatrix();
      rockInstanced.setMatrixAt(j, dummy.matrix);

      // Calculate Box3 corresponding to the X/Z coordinates of instanced rock
      const rw = 1.25 * spot.scale;
      const rh = 2.4 * spot.scale;
      const box = new THREE.Box3(
        new THREE.Vector3(spot.x - rw, 0, spot.z - rw),
        new THREE.Vector3(spot.x + rw, rh, spot.z + rw)
      );
      obstacleBoxes.push(box);
    }
    rockInstanced.instanceMatrix.needsUpdate = true;
    group.add(rockInstanced);

    const hazards = {
      lava: {
        active: false,
        planeY: -50,
        damagePerSec: 0,
        safeEdges: [new THREE.Vector3(0, 0, 0)]
      },
      jumpPads: []
    };

    return {
      type: "overgrown",
      name: "Overgrown Sanctum",
      group,
      platformBoxes,
      obstacleBoxes,
      hazards,
      instancedMeshes: {
        trees: treeInstanced,
        rocks: rockInstanced
      },
      spawnPoints: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-14, 0, 14), new THREE.Vector3(14, 0, -14)],
      update: () => {},
      dispose: () => {
        scene.remove(group);
      }
    };
  }

  static createDesertRuins(scene, envAssets) {
    const group = new THREE.Group();
    group.name = "map-desert-ruins";
    scene.add(group);

    const platformBoxes = [];
    const obstacleBoxes = [];

    // Collision: Large flat THREE.Box3 bounding box under the walkable area to act as the floor
    const floorBox = new THREE.Box3(
      new THREE.Vector3(-18, -2, -45),
      new THREE.Vector3(18, 0, 45)
    );
    platformBoxes.push(floorBox);

    // Collision: 4 static THREE.Box3 invisible walls around the perimeter of the diorama to keep players from falling out of bounds
    const wallNorth = new THREE.Box3(
      new THREE.Vector3(-25, -2, 41.5),
      new THREE.Vector3(25, 25, 46.5)
    );
    const wallSouth = new THREE.Box3(
      new THREE.Vector3(-25, -2, -46.5),
      new THREE.Vector3(25, 25, -41.5)
    );
    const wallEast = new THREE.Box3(
      new THREE.Vector3(15.5, -2, -46),
      new THREE.Vector3(20.5, 25, 46)
    );
    const wallWest = new THREE.Box3(
      new THREE.Vector3(-20.5, -2, -46),
      new THREE.Vector3(-15.5, 25, 46)
    );

    obstacleBoxes.push(wallNorth, wallSouth, wallEast, wallWest);

    // Additional interior ruin pillar obstacles
    const ruinPillars = [
      [-6, 0, 15], [6, 0, 15],
      [-7, 0, 0], [7, 0, 0],
      [-6, 0, -15], [6, 0, -15],
      [0, 0, 28], [0, 0, -28]
    ];
    for (let i = 0; i < ruinPillars.length; i += 1) {
      const rp = ruinPillars[i];
      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(rp[0] - 1.2, 0, rp[2] - 1.2),
        new THREE.Vector3(rp[0] + 1.2, 6.0, rp[2] + 1.2)
      ));
    }

    // Load sands.gltf model and position it at the center of the scene (0, 0, 0)
    let dioramaMesh = null;
    const sandsData = envAssets && (envAssets.sands || (envAssets.getEnvModel && envAssets.getEnvModel("sands")) || (AssetManager && AssetManager.sandsScene && { scene: AssetManager.sandsScene }));

    if (sandsData && sandsData.scene) {
      dioramaMesh = sandsData.scene.clone(true);
      dioramaMesh.position.set(0, 0, 0);
      dioramaMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      group.add(dioramaMesh);
    } else {
      const loader = new GLTFLoader();
      const urls = ["./assets/environment/sands.gltf", "./assets/environment/sands map.gltf"];
      const loadAttempt = (idx) => {
        if (idx >= urls.length) return;
        loader.load(urls[idx], (gltf) => {
          if (gltf && gltf.scene) {
            dioramaMesh = gltf.scene;
            dioramaMesh.position.set(0, 0, 0);
            dioramaMesh.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            group.add(dioramaMesh);
          }
        }, undefined, () => loadAttempt(idx + 1));
      };
      loadAttempt(0);

      // Visual fallback while async load resolves
      const fallbackFloor = new THREE.Mesh(
        new THREE.BoxGeometry(32, 1, 84),
        new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.95, metalness: 0.05 })
      );
      fallbackFloor.position.set(0, -0.5, 0);
      fallbackFloor.receiveShadow = true;
      group.add(fallbackFloor);
      dioramaMesh = fallbackFloor;
    }

    const hazards = {
      lava: {
        active: false,
        planeY: -50,
        damagePerSec: 0,
        safeEdges: [new THREE.Vector3(0, 0, 0)]
      },
      jumpPads: []
    };

    return {
      type: "desert",
      name: "Desert Ruins",
      group,
      dioramaMesh,
      mesh: dioramaMesh,
      platformBoxes,
      obstacleBoxes,
      hazards,
      spawnPoints: [new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -10)],
      update: () => {},
      dispose: () => {
        scene.remove(group);
      }
    };
  }

  // ==========================================
  // THEMATIC LOBBY SCENES
  // ==========================================

  static createRogueLobby(scene) {
    const group = new THREE.Group();
    group.name = "lobby-rogue";
    scene.add(group);

    scene.background = new THREE.Color(0x0a0c10);
    scene.fog = new THREE.FogExp2(0x0a0c10, 0.045);

    // Dark Rough Cobblestone Floor
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x16181d,
      roughness: 0.94,
      metalness: 0.1,
      flatShading: true
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(22, 1, 22), floorMat);
    floor.position.set(0, -0.5, 0);
    floor.receiveShadow = true;
    group.add(floor);

    // Stone Masonry Back and Side Walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x131519,
      roughness: 0.96,
      metalness: 0.05
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 1.5), wallMat);
    backWall.position.set(0, 5.5, -8.5);
    backWall.receiveShadow = true;
    backWall.castShadow = true;
    group.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 12, 22), wallMat);
    leftWall.position.set(-8.5, 5.5, 0);
    leftWall.receiveShadow = true;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 12, 22), wallMat);
    rightWall.position.set(8.5, 5.5, 0);
    rightWall.receiveShadow = true;
    group.add(rightWall);

    // Secret Hideout Archway Pillars
    const archMat = new THREE.MeshStandardMaterial({ color: 0x1f2229, roughness: 0.88 });
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.2), archMat);
    pillarL.position.set(-3.2, 3.5, -7.5);
    pillarL.castShadow = true;
    group.add(pillarL);

    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.2), archMat);
    pillarR.position.set(3.2, 3.5, -7.5);
    pillarR.castShadow = true;
    group.add(pillarR);

    const archTop = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.2, 1.4), archMat);
    archTop.position.set(0, 7.6, -7.5);
    archTop.castShadow = true;
    group.add(archTop);

    // Wooden Crates & Smuggler Barrels
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x332014, roughness: 0.85 });
    const crateSpots = [
      { x: -5.5, y: 0.7, z: -5.5, s: 1.4 },
      { x: -4.2, y: 0.6, z: -5.8, s: 1.2 },
      { x: -5.2, y: 1.9, z: -5.6, s: 1.0 },
      { x: 5.6, y: 0.75, z: -5.2, s: 1.5 },
      { x: 4.5, y: 0.6, z: -6.0, s: 1.1 }
    ];
    crateSpots.forEach((spot) => {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(spot.s, spot.s, spot.s), woodMat);
      crate.position.set(spot.x, spot.y, spot.z);
      crate.castShadow = true;
      crate.receiveShadow = true;
      group.add(crate);
    });

    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x24150b, roughness: 0.9 });
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 12), barrelMat);
    barrel1.position.set(5.8, 0.8, -3.5);
    barrel1.castShadow = true;
    group.add(barrel1);

    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12), barrelMat);
    barrel2.position.set(-6.2, 0.7, -3.2);
    barrel2.castShadow = true;
    group.add(barrel2);

    // Torch Sconces with Flickering Amber Flame
    const torchLightL = new THREE.PointLight(0xff6600, 2.8, 16);
    torchLightL.position.set(-3.2, 4.2, -6.8);
    torchLightL.castShadow = true;
    group.add(torchLightL);

    const torchLightR = new THREE.PointLight(0xff5500, 2.6, 16);
    torchLightR.position.set(3.2, 4.2, -6.8);
    torchLightR.castShadow = true;
    group.add(torchLightR);

    // Torch flame visual cones
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
    const flameGeom = new THREE.ConeGeometry(0.12, 0.35, 6);
    const flameL = new THREE.Mesh(flameGeom, flameMat);
    flameL.position.copy(torchLightL.position);
    group.add(flameL);

    const flameR = new THREE.Mesh(flameGeom, flameMat);
    flameR.position.copy(torchLightR.position);
    group.add(flameR);

    // Low Dim Ambient & Cool Moonbeam from grate
    const amb = new THREE.AmbientLight(0x11141c, 0.4);
    group.add(amb);

    const moonbeam = new THREE.DirectionalLight(0x384a62, 0.5);
    moonbeam.position.set(0, 10, 4);
    group.add(moonbeam);

    return {
      type: "lobby",
      className: "rogue",
      group,
      update: (dt, elapsed) => {
        const flicker1 = Math.sin(elapsed * 15) * 0.35 + Math.cos(elapsed * 23) * 0.2;
        const flicker2 = Math.cos(elapsed * 13) * 0.3 + Math.sin(elapsed * 19) * 0.25;
        torchLightL.intensity = Math.max(1.8, 2.8 + flicker1);
        torchLightR.intensity = Math.max(1.6, 2.6 + flicker2);
      },
      dispose: () => {
        scene.remove(group);
      }
    };
  }

  static createPaladinLobby(scene) {
    const group = new THREE.Group();
    group.name = "lobby-paladin";
    scene.add(group);

    scene.background = new THREE.Color(0x282015);
    scene.fog = new THREE.FogExp2(0x282015, 0.022);

    // Polished Ivory Marble Floor
    const marbleMat = new THREE.MeshStandardMaterial({
      color: 0xf5f2e8,
      roughness: 0.18,
      metalness: 0.1,
      flatShading: false
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 24), marbleMat);
    floor.position.set(0, -0.5, 0);
    floor.receiveShadow = true;
    group.add(floor);

    // Grand Cathedral Back Wall
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf8f5ed,
      roughness: 0.3,
      metalness: 0.05
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 14, 1.5), wallMat);
    backWall.position.set(0, 6.5, -9.5);
    backWall.receiveShadow = true;
    group.add(backWall);

    // 4 Grand Fluted Marble Columns
    const colGeom = new THREE.CylinderGeometry(0.7, 0.8, 11, 20);
    const colMat = new THREE.MeshStandardMaterial({
      color: 0xfbf9f4,
      roughness: 0.22,
      metalness: 0.08
    });
    const colPositions = [
      [-5.5, 5, -5.5],
      [5.5, 5, -5.5],
      [-5.5, 5, 2.5],
      [5.5, 5, 2.5]
    ];
    colPositions.forEach((pos) => {
      const col = new THREE.Mesh(colGeom, colMat);
      col.position.set(pos[0], pos[1], pos[2]);
      col.castShadow = true;
      col.receiveShadow = true;
      group.add(col);

      // Capital & Base Trim
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 2.0), colMat);
      base.position.set(pos[0], 0.3, pos[2]);
      group.add(base);
    });

    // Elevated Holy Altar Dais
    const altarDais = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 4.5), marbleMat);
    altarDais.position.set(0, 0.3, -6.5);
    altarDais.receiveShadow = true;
    group.add(altarDais);

    // Golden Holy Crest / Cross
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.88,
      roughness: 0.22,
      emissive: 0x997700,
      emissiveIntensity: 0.45
    });
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.0, 0.2), goldMat);
    crossV.position.set(0, 5.5, -8.6);
    crossV.castShadow = true;
    group.add(crossV);

    const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.2), goldMat);
    crossH.position.set(0, 6.2, -8.6);
    crossH.castShadow = true;
    group.add(crossH);

    // Heraldic Red & Gold Banners on Cathedral Wall
    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0x990011,
      roughness: 0.75,
      metalness: 0.1
    });
    const bannerL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 5.5, 0.1), bannerMat);
    bannerL.position.set(-3.2, 5.0, -8.6);
    group.add(bannerL);

    const bannerR = new THREE.Mesh(new THREE.BoxGeometry(1.6, 5.5, 0.1), bannerMat);
    bannerR.position.set(3.2, 5.0, -8.6);
    group.add(bannerR);

    // Warm Cathedral Sunlight & Golden Braziers
    const holySun = new THREE.DirectionalLight(0xfffaea, 2.5);
    holySun.position.set(8, 16, 6);
    holySun.castShadow = true;
    group.add(holySun);

    const brazierL = new THREE.PointLight(0xffca55, 2.4, 20);
    brazierL.position.set(-4.0, 2.2, -4.5);
    group.add(brazierL);

    const brazierR = new THREE.PointLight(0xffca55, 2.4, 20);
    brazierR.position.set(4.0, 2.2, -4.5);
    group.add(brazierR);

    const amb = new THREE.AmbientLight(0xffeedd, 0.8);
    group.add(amb);

    return {
      type: "lobby",
      className: "paladin",
      group,
      update: (dt, elapsed) => {
        const pulse = Math.sin(elapsed * 2.5) * 0.2;
        brazierL.intensity = 2.4 + pulse;
        brazierR.intensity = 2.4 - pulse;
      },
      dispose: () => {
        scene.remove(group);
      }
    };
  }

  static createSorcererLobby(scene) {
    const group = new THREE.Group();
    group.name = "lobby-sorcerer";
    scene.add(group);

    scene.background = new THREE.Color(0x0e0918);
    scene.fog = new THREE.FogExp2(0x0e0918, 0.038);

    // Dark Mystic Obsidian Floor
    const obsMat = new THREE.MeshStandardMaterial({
      color: 0x120f21,
      roughness: 0.35,
      metalness: 0.3,
      flatShading: true
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(22, 1, 22), obsMat);
    floor.position.set(0, -0.5, 0);
    floor.receiveShadow = true;
    group.add(floor);

    // Curved Tower Chamber Wall
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x181329,
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.BackSide
    });
    const towerWall = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 13, 32, 1, true), towerMat);
    towerWall.position.set(0, 6, 0);
    towerWall.receiveShadow = true;
    group.add(towerWall);

    // Outer and Inner Glowing Purple Runic Circles
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0xba3eff,
      emissive: 0x9900ff,
      emissiveIntensity: 2.5,
      transparent: true,
      opacity: 0.88,
      roughness: 0.2
    });
    const runicOuter = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.8, 48), runeMat);
    runicOuter.rotation.x = -Math.PI / 2;
    runicOuter.position.set(0, 0.05, 0);
    group.add(runicOuter);

    const runicInner = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.4, 32), runeMat);
    runicInner.rotation.x = -Math.PI / 2;
    runicInner.position.set(0, 0.06, 0);
    group.add(runicInner);

    // Floating Arcane Crystals / Orbs
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xd946ef,
      emissive: 0xa820f0,
      emissiveIntensity: 2.0,
      roughness: 0.15,
      metalness: 0.8
    });
    const crystalGeom = new THREE.OctahedronGeometry(0.42, 0);
    const crystals = [];
    const crystalCount = 4;
    for (let i = 0; i < crystalCount; i += 1) {
      const crystal = new THREE.Mesh(crystalGeom, crystalMat);
      crystal.castShadow = true;
      group.add(crystal);
      crystals.push(crystal);
    }

    // Glowing Purple Runic Lights
    const runeLightCenter = new THREE.PointLight(0xa820f0, 3.6, 22);
    runeLightCenter.position.set(0, 1.6, 0);
    group.add(runeLightCenter);

    const deepPurpleLight = new THREE.PointLight(0x6600ee, 2.5, 18);
    deepPurpleLight.position.set(0, 6, -5);
    group.add(deepPurpleLight);

    const cyanAccentLight = new THREE.PointLight(0x00f5d4, 1.8, 14);
    cyanAccentLight.position.set(-4, 3, -3);
    group.add(cyanAccentLight);

    const amb = new THREE.AmbientLight(0x221338, 0.55);
    group.add(amb);

    return {
      type: "lobby",
      className: "sorcerer",
      group,
      update: (dt, elapsed) => {
        runicOuter.rotation.z = elapsed * 0.12;
        runicInner.rotation.z = -elapsed * 0.18;
        crystals.forEach((cr, i) => {
          const angle = elapsed * 0.8 + (i * Math.PI * 2) / crystalCount;
          cr.position.set(
            Math.cos(angle) * 2.8,
            1.8 + Math.sin(elapsed * 2.2 + i * 1.5) * 0.35,
            Math.sin(angle) * 2.8
          );
          cr.rotation.x = elapsed * 1.2;
          cr.rotation.y = elapsed * 1.5;
        });
        runeLightCenter.intensity = 3.2 + Math.sin(elapsed * 3) * 0.6;
      },
      dispose: () => {
        scene.remove(group);
      }
    };
  }

  static createDruidLobby(scene, envAssets) {
    const group = new THREE.Group();
    group.name = "lobby-druid";
    scene.add(group);

    scene.background = new THREE.Color(0x09190d);
    scene.fog = new THREE.FogExp2(0x09190d, 0.032);

    // Forest Earth and Moss Floor
    const earthMat = new THREE.MeshStandardMaterial({
      color: 0x1f3316,
      roughness: 0.94,
      metalness: 0.05,
      flatShading: true
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 24), earthMat);
    floor.position.set(0, -0.5, 0);
    floor.receiveShadow = true;
    group.add(floor);

    // Ancient Overgrown Monolith Ruins
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x3d493a,
      roughness: 0.9,
      metalness: 0.05
    });
    const dolmenL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.5, 1.2), stoneMat);
    dolmenL.position.set(-3.2, 2.75, -5.5);
    dolmenL.castShadow = true;
    group.add(dolmenL);

    const dolmenR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.5, 1.2), stoneMat);
    dolmenR.position.set(3.2, 2.75, -5.5);
    dolmenR.castShadow = true;
    group.add(dolmenR);

    const dolmenCap = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.2, 1.8), stoneMat);
    dolmenCap.position.set(0, 5.8, -5.5);
    dolmenCap.castShadow = true;
    group.add(dolmenCap);

    // Overgrown with Instanced Trees
    const treeData = (envAssets && envAssets.tree) || (envAssets && envAssets.treeGeometry && { geometry: envAssets.treeGeometry, material: envAssets.treeMaterial });
    const rockData = (envAssets && envAssets.rock) || (envAssets && envAssets.rockGeometry && { geometry: envAssets.rockGeometry, material: envAssets.rockMaterial });

    const treeGeom = (treeData && treeData.geometry) || new THREE.ConeGeometry(1.5, 4.5, 8);
    const treeMat = (treeData && treeData.material) || new THREE.MeshStandardMaterial({ color: 0x225533, roughness: 0.8 });

    const rockGeom = (rockData && rockData.geometry) || new THREE.IcosahedronGeometry(1.2, 1);
    const rockMat = (rockData && rockData.material) || new THREE.MeshStandardMaterial({ color: 0x485248, roughness: 0.92 });

    const treeSpots = [
      { x: -6.5, z: -4.5, s: 1.1 },
      { x: -5.2, z: -7.2, s: 1.3 },
      { x: 6.2, z: -4.8, s: 1.0 },
      { x: 5.5, z: -7.5, s: 1.4 },
      { x: -7.2, z: 2.2, s: 0.9 },
      { x: 7.2, z: 2.5, s: 1.0 },
      { x: 0, z: -8.5, s: 1.5 }
    ];

    const treeInstanced = new THREE.InstancedMesh(treeGeom, treeMat, treeSpots.length);
    treeInstanced.castShadow = true;
    treeInstanced.receiveShadow = true;
    const dummy = new THREE.Object3D();
    treeSpots.forEach((spot, i) => {
      dummy.position.set(spot.x, 0, spot.z);
      dummy.scale.set(spot.s, spot.s, spot.s);
      dummy.updateMatrix();
      treeInstanced.setMatrixAt(i, dummy.matrix);
    });
    treeInstanced.instanceMatrix.needsUpdate = true;
    group.add(treeInstanced);

    const rockSpots = [
      { x: -3.8, z: -3.5, s: 1.2 },
      { x: 4.2, z: -3.2, s: 1.1 },
      { x: -6.0, z: 0.5, s: 1.4 },
      { x: 6.0, z: 0.2, s: 1.3 }
    ];
    const rockInstanced = new THREE.InstancedMesh(rockGeom, rockMat, rockSpots.length);
    rockInstanced.castShadow = true;
    rockInstanced.receiveShadow = true;
    rockSpots.forEach((spot, i) => {
      dummy.position.set(spot.x, 0.4, spot.z);
      dummy.scale.set(spot.s, spot.s, spot.s);
      dummy.updateMatrix();
      rockInstanced.setMatrixAt(i, dummy.matrix);
    });
    rockInstanced.instanceMatrix.needsUpdate = true;
    group.add(rockInstanced);

    // Glowing Green Floating Particles / Fireflies
    const particleCount = 140;
    const particleGeom = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities = [];

    for (let i = 0; i < particleCount; i += 1) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 16;
      particlePositions[i * 3 + 1] = Math.random() * 7;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 16;
      particleVelocities.push({
        vy: 0.3 + Math.random() * 0.5,
        driftX: (Math.random() - 0.5) * 0.4,
        driftZ: (Math.random() - 0.5) * 0.4,
        seed: Math.random() * 100
      });
    }
    particleGeom.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x44ff88,
      size: 0.18,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particleGeom, particleMat);
    group.add(particles);

    // Glowing Green Nature Lighting
    const greenLightCenter = new THREE.PointLight(0x38ef7d, 2.8, 22);
    greenLightCenter.position.set(0, 3, -1);
    group.add(greenLightCenter);

    const emeraldLight = new THREE.PointLight(0x11998e, 2.2, 18);
    emeraldLight.position.set(3, 4, 2);
    group.add(emeraldLight);

    const sunDappled = new THREE.DirectionalLight(0xe5f8cc, 1.6);
    sunDappled.position.set(6, 14, 4);
    group.add(sunDappled);

    const amb = new THREE.AmbientLight(0x152e18, 0.7);
    group.add(amb);

    return {
      type: "lobby",
      className: "druid",
      group,
      update: (dt, elapsed) => {
        const positions = particleGeom.attributes.position.array;
        for (let i = 0; i < particleCount; i += 1) {
          const v = particleVelocities[i];
          positions[i * 3 + 1] += v.vy * dt;
          positions[i * 3] += Math.sin(elapsed * 1.5 + v.seed) * v.driftX * dt;
          positions[i * 3 + 2] += Math.cos(elapsed * 1.5 + v.seed) * v.driftZ * dt;
          if (positions[i * 3 + 1] > 7.5) {
            positions[i * 3 + 1] = 0.2;
            positions[i * 3] = (Math.random() - 0.5) * 16;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 16;
          }
        }
        particleGeom.attributes.position.needsUpdate = true;
        greenLightCenter.intensity = 2.6 + Math.sin(elapsed * 2.2) * 0.4;
      },
      dispose: () => {
        scene.remove(group);
      }
    };
  }

  static createLobbyScene(scene, className, envAssets) {
    const norm = (className || "").toLowerCase();
    if (norm === "paladin") {
      return MapGenerator.createPaladinLobby(scene);
    }
    if (norm === "sorcerer") {
      return MapGenerator.createSorcererLobby(scene);
    }
    if (norm === "druid") {
      return MapGenerator.createDruidLobby(scene, envAssets);
    }
    return MapGenerator.createRogueLobby(scene);
  }

  static loadMap(scene, mapName = "Desert Ruins", envAssets = null) {
    return MapGenerator.generate(mapName, scene, envAssets);
  }

  static generate(mapType, scene, envAssets) {
    const lower = (mapType || "").toLowerCase();
    if (lower.includes("desert") || lower.includes("sands") || lower.includes("ruins")) {
      return MapGenerator.createDesertRuins(scene, envAssets);
    }
    if (lower.includes("magma")) {
      return MapGenerator.createMagmaCore(scene);
    }
    if (lower.includes("clockwork") || lower.includes("void")) {
      return MapGenerator.createClockworkVoid(scene);
    }
    return MapGenerator.createOvergrownSanctum(scene, envAssets);
  }
}
