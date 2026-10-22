import * as THREE from "three";

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

  static generate(mapType, scene, envAssets) {
    if (mapType === "magma" || mapType === "Magma Core") {
      return MapGenerator.createMagmaCore(scene);
    }
    if (mapType === "clockwork" || mapType === "Clockwork Void") {
      return MapGenerator.createClockworkVoid(scene);
    }
    return MapGenerator.createOvergrownSanctum(scene, envAssets);
  }
}
