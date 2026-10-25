import fs from 'fs';
import path from 'path';

// Polyfill FileReader for GLTFExporter in Node
class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onload) this.onload({ target: this });
      if (this.onloadend) this.onloadend({ target: this });
    }).catch((err) => {
      if (this.onerror) this.onerror(err);
    });
  }
}
globalThis.FileReader = FileReader;

async function buildLobby() {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

  const lobbyScene = new THREE.Scene();
  lobbyScene.name = 'RoundtableLobby';

  // Materials
  const stoneFloorMat = new THREE.MeshStandardMaterial({
    color: 0x33302c,
    roughness: 0.85,
    metalness: 0.15,
  });

  const daisFloorMat = new THREE.MeshStandardMaterial({
    color: 0x44403c,
    roughness: 0.8,
    metalness: 0.2,
  });

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x242220,
    roughness: 0.9,
    metalness: 0.1,
  });

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x57534e,
    roughness: 0.75,
    metalness: 0.2,
  });

  const woodOakMat = new THREE.MeshStandardMaterial({
    color: 0x3d271d,
    roughness: 0.65,
    metalness: 0.05,
  });

  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.35,
    metalness: 0.85,
  });

  const emissiveLanternMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });

  const rubyBannerMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.9,
  });

  const blueBannerMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    roughness: 0.9,
  });

  // 1. MAIN FLOOR (60 x 1 x 60)
  const floorGeom = new THREE.BoxGeometry(60, 1, 60);
  const floorMesh = new THREE.Mesh(floorGeom, stoneFloorMat);
  floorMesh.position.set(0, -0.5, 0);
  floorMesh.name = 'Main_Floor';
  lobbyScene.add(floorMesh);

  // 2. RAISED NORTH DAIS (Platform at y = 1.5)
  const daisGeom = new THREE.BoxGeometry(24, 1.5, 14);
  const daisMesh = new THREE.Mesh(daisGeom, daisFloorMat);
  daisMesh.position.set(0, 0.75, -21);
  daisMesh.name = 'North_Dais';
  lobbyScene.add(daisMesh);

  // 3. STAIRS LEADING TO NORTH DAIS (6 steps, rise 0.25 each, run 0.5)
  const stepCount = 6;
  const stepWidth = 10;
  const stepDepth = 0.55;
  const stepHeight = 0.25;
  for (let i = 0; i < stepCount; i++) {
    const stepGeom = new THREE.BoxGeometry(stepWidth, (i + 1) * stepHeight, stepDepth);
    const stepMesh = new THREE.Mesh(stepGeom, daisFloorMat);
    stepMesh.position.set(
      0,
      ((i + 1) * stepHeight) / 2,
      -14 + (stepCount - 1 - i) * stepDepth
    );
    stepMesh.name = `North_Stair_Step_${i + 1}`;
    lobbyScene.add(stepMesh);
  }

  // 4. EAST & WEST WING BALCONIES (Platform at y = 1.5)
  const wingGeom = new THREE.BoxGeometry(10, 1.5, 24);
  const eastWing = new THREE.Mesh(wingGeom, daisFloorMat);
  eastWing.position.set(23, 0.75, 0);
  eastWing.name = 'East_Wing_Balcony';
  lobbyScene.add(eastWing);

  const westWing = new THREE.Mesh(wingGeom, daisFloorMat);
  westWing.position.set(-23, 0.75, 0);
  westWing.name = 'West_Wing_Balcony';
  lobbyScene.add(westWing);

  // East Wing Stairs
  for (let i = 0; i < stepCount; i++) {
    const stepGeom = new THREE.BoxGeometry(stepDepth, (i + 1) * stepHeight, 8);
    const stepMesh = new THREE.Mesh(stepGeom, daisFloorMat);
    stepMesh.position.set(18 - (stepCount - 1 - i) * stepDepth, ((i + 1) * stepHeight) / 2, 0);
    stepMesh.name = `East_Stair_Step_${i + 1}`;
    lobbyScene.add(stepMesh);
  }

  // West Wing Stairs
  for (let i = 0; i < stepCount; i++) {
    const stepGeom = new THREE.BoxGeometry(stepDepth, (i + 1) * stepHeight, 8);
    const stepMesh = new THREE.Mesh(stepGeom, daisFloorMat);
    stepMesh.position.set(-18 + (stepCount - 1 - i) * stepDepth, ((i + 1) * stepHeight) / 2, 0);
    stepMesh.name = `West_Stair_Step_${i + 1}`;
    lobbyScene.add(stepMesh);
  }

  // 5. PERIMETER BOUNDARY WALLS (Height 14)
  const wallHeight = 14;
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(62, wallHeight, 2), wallMat);
  northWall.position.set(0, wallHeight / 2, -30);
  northWall.name = 'Wall_North';
  lobbyScene.add(northWall);

  const southWall = new THREE.Mesh(new THREE.BoxGeometry(62, wallHeight, 2), wallMat);
  southWall.position.set(0, wallHeight / 2, 30);
  southWall.name = 'Wall_South';
  lobbyScene.add(southWall);

  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(2, wallHeight, 62), wallMat);
  eastWall.position.set(30, wallHeight / 2, 0);
  eastWall.name = 'Wall_East';
  lobbyScene.add(eastWall);

  const westWall = new THREE.Mesh(new THREE.BoxGeometry(2, wallHeight, 62), wallMat);
  westWall.position.set(-30, wallHeight / 2, 0);
  westWall.name = 'Wall_West';
  lobbyScene.add(westWall);

  // 6. GRAND PILLARS & ARCHWAYS
  const pillarPositions = [
    [-12, -10], [12, -10],
    [-12, 10], [12, 10],
    [-12, -22], [12, -22],
    [-12, 22], [12, 22]
  ];

  pillarPositions.forEach(([x, z], idx) => {
    // Column shaft
    const colMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, wallHeight, 16), pillarMat);
    colMesh.position.set(x, wallHeight / 2, z);
    colMesh.name = `Pillar_${idx + 1}`;
    lobbyScene.add(colMesh);

    // Pillar base
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 2.2), pillarMat);
    baseMesh.position.set(x, 0.5, z);
    lobbyScene.add(baseMesh);

    // Pillar capital
    const capMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 2.4), pillarMat);
    capMesh.position.set(x, wallHeight - 0.5, z);
    lobbyScene.add(capMesh);

    // Wall sconce lantern
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), emissiveLanternMat);
    lantern.position.set(x > 0 ? x - 1.2 : x + 1.2, 4, z);
    lobbyScene.add(lantern);
  });

  // 7. THE ROUNDTABLE HOLD (CENTRAL ICONIC TABLE)
  const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.4, 0.9, 32), pillarMat);
  tableBase.position.set(0, 0.45, 0);
  tableBase.name = 'Roundtable_Base';
  lobbyScene.add(tableBase);

  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.25, 32), woodOakMat);
  tableTop.position.set(0, 1.0, 0);
  tableTop.name = 'Roundtable_Top';
  lobbyScene.add(tableTop);

  const tableRing = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.08, 8, 32), goldAccentMat);
  tableRing.rotation.x = Math.PI / 2;
  tableRing.position.set(0, 1.1, 0);
  lobbyScene.add(tableRing);

  // 4 Stone Thrones / Benches around Roundtable
  const benchDist = 6.2;
  const benchAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  benchAngles.forEach((angle, idx) => {
    const bx = Math.sin(angle) * benchDist;
    const bz = Math.cos(angle) * benchDist;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.9), woodOakMat);
    bench.position.set(bx, 0.35, bz);
    bench.rotation.y = angle;
    bench.name = `Roundtable_Bench_${idx + 1}`;
    lobbyScene.add(bench);
  });

  // 8. HANGING BANNERS
  const bannerPositions = [
    { pos: [0, 8, -28.9], rot: 0, mat: rubyBannerMat },
    { pos: [-10, 8, -28.9], rot: 0, mat: blueBannerMat },
    { pos: [10, 8, -28.9], rot: 0, mat: blueBannerMat },
    { pos: [-28.9, 8, -10], rot: Math.PI / 2, mat: rubyBannerMat },
    { pos: [28.9, 8, -10], rot: -Math.PI / 2, mat: rubyBannerMat },
  ];
  bannerPositions.forEach((b, idx) => {
    const banner = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 0.1), b.mat);
    banner.position.set(...b.pos);
    banner.rotation.y = b.rot;
    banner.name = `Wall_Banner_${idx + 1}`;
    lobbyScene.add(banner);
  });

  // EXPORT AS GLB
  const exporter = new GLTFExporter();
  const glbData = await new Promise((resolve, reject) => {
    exporter.parse(
      lobbyScene,
      (result) => resolve(result),
      (err) => reject(err),
      { binary: true }
    );
  });

  const outDir = path.resolve('assets/environment');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'lobby.glb');
  fs.writeFileSync(outPath, Buffer.from(glbData));
  console.log(`Successfully generated ${outPath} (${glbData.byteLength} bytes)`);
}

buildLobby().catch((err) => {
  console.error('Failed to build lobby.glb:', err);
  process.exit(1);
});
