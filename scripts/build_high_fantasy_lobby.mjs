import fs from 'fs';
import path from 'path';

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

async function buildMasterHighFantasyLobby() {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

  const scene = new THREE.Scene();
  scene.name = 'MasterHighFantasyLobby';

  // Base Materials
  const floorStone = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, metalness: 0.2 });
  const platformStone = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.8, metalness: 0.2 });
  const wallStone = new THREE.MeshStandardMaterial({ color: 0x202023, roughness: 0.9, metalness: 0.1 });
  const goldTrim = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.85 });
  const silverTrim = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.9 });
  const darkIron = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.5, metalness: 0.7 });
  const woodOak = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7, metalness: 0.05 });
  const clothRuby = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.95 });
  const clothNavy = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.95 });

  // Thematic Corner Materials
  const sorcererRuneMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.8,
    roughness: 0.2
  });

  const druidGlowMat = new THREE.MeshStandardMaterial({
    color: 0x065f46,
    emissive: 0x10b981,
    emissiveIntensity: 1.5,
    roughness: 0.3
  });

  const rogueShadowMat = new THREE.MeshStandardMaterial({
    color: 0x2e1065,
    emissive: 0x7c3aed,
    emissiveIntensity: 1.0,
    roughness: 0.4
  });

  const paladinHolyMat = new THREE.MeshStandardMaterial({
    color: 0xca8a04,
    emissive: 0xfacc15,
    emissiveIntensity: 1.2,
    roughness: 0.25
  });

  // 1. MAIN ARENA FLOOR (64 x 1.5 x 64)
  const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(64, 1.5, 64), floorStone);
  floorMesh.position.set(0, -0.75, 0);
  floorMesh.name = 'Hall_Floor';
  scene.add(floorMesh);

  // Central Ornate Ring
  const centerRing = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.05, 48), goldTrim);
  centerRing.position.set(0, 0.02, 0);
  scene.add(centerRing);

  // 2. CENTRAL ROUNDTABLE
  const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.6, 1.1, 32), platformStone);
  tableBase.position.set(0, 0.55, 0);
  scene.add(tableBase);

  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.35, 32), woodOak);
  tableTop.position.set(0, 1.15, 0);
  scene.add(tableTop);

  const tableRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.1, 12, 48), goldTrim);
  tableRing.rotation.x = Math.PI / 2;
  tableRing.position.set(0, 1.25, 0);
  scene.add(tableRing);

  // 3. SURROUNDING WALLS (Height 16)
  const wallH = 16;
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(66, wallH, 2), wallStone);
  northWall.position.set(0, wallH / 2, -32);
  scene.add(northWall);

  const southWall = new THREE.Mesh(new THREE.BoxGeometry(66, wallH, 2), wallStone);
  southWall.position.set(0, wallH / 2, 32);
  scene.add(southWall);

  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(2, wallH, 66), wallStone);
  eastWall.position.set(32, wallH / 2, 0);
  scene.add(eastWall);

  const westWall = new THREE.Mesh(new THREE.BoxGeometry(2, wallH, 66), wallStone);
  westWall.position.set(-32, wallH / 2, 0);
  scene.add(westWall);

  // Wall Battlement Trims
  const trimN = new THREE.Mesh(new THREE.BoxGeometry(66, 1.2, 2.4), goldTrim);
  trimN.position.set(0, wallH, -32);
  scene.add(trimN);
  const trimS = new THREE.Mesh(new THREE.BoxGeometry(66, 1.2, 2.4), goldTrim);
  trimS.position.set(0, wallH, 32);
  scene.add(trimS);
  const trimE = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 66), goldTrim);
  trimE.position.set(32, wallH, 0);
  scene.add(trimE);
  const trimW = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 66), goldTrim);
  trimW.position.set(-32, wallH, 0);
  scene.add(trimW);

  // 4. PILLARS & ARCHED CORRIDORS
  const pillarCoords = [
    [-9, -9], [9, -9], [-9, 9], [9, 9],
    [-24, 0], [24, 0], [0, -24], [0, 24],
    [-19, -9], [-9, -19], [19, -9], [9, -19],
    [-19, 9], [-9, 19], [19, 9], [9, 19]
  ];
  pillarCoords.forEach(([px, pz], idx) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, wallH, 16), platformStone);
    col.position.set(px, wallH / 2, pz);
    col.name = `Column_${idx + 1}`;
    scene.add(col);

    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 2.2), platformStone);
    base.position.set(px, 0.4, pz);
    scene.add(base);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), goldTrim);
    cap.position.set(px, wallH - 0.4, pz);
    scene.add(cap);
  });

  // Crossbeams
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 1), platformStone);
  b1.position.set(0, wallH - 2, -9);
  scene.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 1), platformStone);
  b2.position.set(0, wallH - 2, 9);
  scene.add(b2);
  const b3 = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 18), platformStone);
  b3.position.set(-9, wallH - 2, 0);
  scene.add(b3);
  const b4 = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 18), platformStone);
  b4.position.set(9, wallH - 2, 0);
  scene.add(b4);

  // =========================================================================
  // CORNER 1: PALADIN (Oathbound) - North-West [-18, 0, -18]
  // Regal armory, banners, pristine heavy armor, golden altar, holy symbols
  // =========================================================================
  const paladinPlatform = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 16), platformStone);
  paladinPlatform.position.set(-19, 0.3, -19);
  paladinPlatform.name = 'Paladin_Dais';
  scene.add(paladinPlatform);

  // Holy Rune Inlay on Floor
  const paladinRune = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.04, 32), paladinHolyMat);
  paladinRune.position.set(-19, 0.62, -19);
  scene.add(paladinRune);

  // Paladin Steps
  const palStep = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 5), platformStone);
  palStep.position.set(-11.5, 0.15, -11.5);
  scene.add(palStep);

  // Pristine Heavy Armor Pedestal & Statue
  const armorPedestal = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), platformStone);
  armorPedestal.position.set(-22, 1.2, -22);
  scene.add(armorPedestal);

  const armorCuirass = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 1.6, 12), silverTrim);
  armorCuirass.position.set(-22, 2.6, -22);
  scene.add(armorCuirass);

  const armorHelm = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), goldTrim);
  armorHelm.position.set(-22, 3.7, -22);
  scene.add(armorHelm);

  // Tower Shields on Display
  [-25, -19].forEach((sz, i) => {
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 1.2), silverTrim);
    shield.position.set(-26.5, 2.2, sz);
    shield.rotation.y = Math.PI / 6;
    scene.add(shield);

    const shieldEmblem = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.6), goldTrim);
    shieldEmblem.position.set(-26.45, 2.2, sz);
    scene.add(shieldEmblem);
  });

  // Weapon Stand with Broadswords
  const paladinTable = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 1.4), woodOak);
  paladinTable.position.set(-19, 1.05, -25);
  scene.add(paladinTable);

  const swordBlade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.3), silverTrim);
  swordBlade.position.set(-19, 2.4, -25);
  scene.add(swordBlade);

  // Heraldic Banners
  const palBanner = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 0.1), clothRuby);
  palBanner.position.set(-19, 9, -30.9);
  scene.add(palBanner);

  // =========================================================================
  // CORNER 2: SORCERER (Arcane Force) - North-East [18, 0, -18]
  // Mystical corner, floating books, runic circles, alchemy shelves, crystal orb
  // =========================================================================
  const sorcPlatform = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 16), platformStone);
  sorcPlatform.position.set(19, 0.3, -19);
  sorcPlatform.name = 'Sorcerer_Dais';
  scene.add(sorcPlatform);

  // Arcane Runic Circle
  const sorcRune = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.04, 32), sorcererRuneMat);
  sorcRune.position.set(19, 0.62, -19);
  scene.add(sorcRune);

  const sorcStep = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 5), platformStone);
  sorcStep.position.set(11.5, 0.15, -11.5);
  scene.add(sorcStep);

  // Mystical Crystal Orb on Ornate Pedestal
  const orbPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 2.0, 16), platformStone);
  orbPedestal.position.set(22, 1.6, -22);
  scene.add(orbPedestal);

  const crystalOrb = new THREE.Mesh(new THREE.SphereGeometry(0.8, 24, 24), sorcererRuneMat);
  crystalOrb.position.set(22, 3.2, -22);
  scene.add(crystalOrb);

  // Massive Bookshelves with Tomes
  const bookcase = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 1.2), woodOak);
  bookcase.position.set(22, 3.1, -26);
  scene.add(bookcase);

  // Floating Arcane Tome Lectern
  const lecternBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.8, 12), darkIron);
  lecternBase.position.set(19, 1.5, -15);
  scene.add(lecternBase);

  const openBook = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.9), goldTrim);
  openBook.position.set(19, 2.5, -15);
  openBook.rotation.x = -Math.PI / 6;
  scene.add(openBook);

  // Alchemy Flasks Table
  const sorcTable = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 1.4), woodOak);
  sorcTable.position.set(26, 1.05, -19);
  sorcTable.rotation.y = Math.PI / 2;
  scene.add(sorcTable);

  // =========================================================================
  // CORNER 3: DRUID (Wild Growth) - South-East [18, 0, 18]
  // Overgrown flora, roots, natural sanctuary, bioluminescent mushrooms, mossy stones
  // =========================================================================
  const druidPlatform = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 16), platformStone);
  druidPlatform.position.set(19, 0.3, 19);
  druidPlatform.name = 'Druid_Dais';
  scene.add(druidPlatform);

  // Sanctuary Flora Circle
  const druidRune = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.04, 32), druidGlowMat);
  druidRune.position.set(19, 0.62, 19);
  scene.add(druidRune);

  const druidStep = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 5), platformStone);
  druidStep.position.set(11.5, 0.15, 11.5);
  scene.add(druidStep);

  // Ancient Sanctuary Tree Trunk
  const treeTrunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 8, 12), woodOak);
  treeTrunk.position.set(23, 4.6, 23);
  scene.add(treeTrunk);

  // Sprawling Roots
  const root1 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.6, 1.2), woodOak);
  root1.position.set(20.5, 0.8, 22.5);
  root1.rotation.y = Math.PI / 4;
  scene.add(root1);

  const root2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 4.5), woodOak);
  root2.position.set(22.5, 0.8, 20.5);
  root2.rotation.y = -Math.PI / 6;
  scene.add(root2);

  // Foliage Canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 12), druidGlowMat);
  canopy.position.set(23, 9.5, 23);
  scene.add(canopy);

  // Bioluminescent Mushrooms
  const shroomCoords = [
    [16, 17, 0.5, 0.6],
    [17, 22, 0.7, 0.8],
    [22, 17, 0.4, 0.5],
    [20, 15, 0.6, 0.7]
  ];
  shroomCoords.forEach(([sx, sz, rad, h], i) => {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, h, 8), platformStone);
    stem.position.set(sx, 0.6 + h / 2, sz);
    scene.add(stem);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), druidGlowMat);
    cap.position.set(sx, 0.6 + h, sz);
    scene.add(cap);
  });

  // Mossy Monolith / Menhir
  const monolith = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.8, 1.0), platformStone);
  monolith.position.set(16, 2.5, 23);
  monolith.rotation.y = Math.PI / 7;
  scene.add(monolith);

  // =========================================================================
  // CORNER 4: ROGUE (Shadowstep) - South-West [-18, 0, 18]
  // Dark corner, shadow themes, assassin gear, target dummy, daggers, poison chest
  // =========================================================================
  const roguePlatform = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 16), platformStone);
  roguePlatform.position.set(-19, 0.3, 19);
  roguePlatform.name = 'Rogue_Dais';
  scene.add(roguePlatform);

  // Shadow Rune Inlay
  const rogueRune = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.04, 32), rogueShadowMat);
  rogueRune.position.set(-19, 0.62, 19);
  scene.add(rogueRune);

  const rogueStep = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 5), platformStone);
  rogueStep.position.set(-11.5, 0.15, 11.5);
  scene.add(rogueStep);

  // Training Target Dummy with Stabs
  const dummyPost = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.5, 8), woodOak);
  dummyPost.position.set(-22, 1.8, 22);
  scene.add(dummyPost);

  const dummyBody = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.55, 1.6, 12), platformStone);
  dummyBody.position.set(-22, 2.6, 22);
  scene.add(dummyBody);

  const dummyHead = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), clothRuby);
  dummyHead.position.set(-22, 3.7, 22);
  scene.add(dummyHead);

  // Crossed Daggers in Target Dummy
  const dagger1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.12), silverTrim);
  dagger1.position.set(-21.4, 2.7, 22);
  dagger1.rotation.z = Math.PI / 3;
  scene.add(dagger1);

  // Assassin Gear Workbench
  const rogueTable = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 1.4), darkIron);
  rogueTable.position.set(-25, 1.05, 19);
  rogueTable.rotation.y = Math.PI / 2;
  scene.add(rogueTable);

  // Poison Chest & Gold Stash
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.1), darkIron);
  chest.position.set(-19, 1.15, 25);
  scene.add(chest);

  const goldPile = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.25, 16), goldTrim);
  goldPile.position.set(-17, 0.72, 24);
  scene.add(goldPile);

  // Wall Shadow Tapestry
  const rogueTapestry = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 0.1), clothNavy);
  rogueTapestry.position.set(-19, 9, 30.9);
  scene.add(rogueTapestry);

  // EXPORT
  const exporter = new GLTFExporter();
  const glbData = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (res) => resolve(res),
      (err) => reject(err),
      { binary: true }
    );
  });

  const outDir = path.resolve('assets/environment');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'high-fantasy-lobby.glb');
  fs.writeFileSync(outPath, Buffer.from(glbData));

  const publicDir = path.resolve('public/assets/environment');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'high-fantasy-lobby.glb'), Buffer.from(glbData));

  console.log(`Successfully generated master high-fantasy-lobby.glb (${glbData.byteLength} bytes)`);
}

buildMasterHighFantasyLobby().catch((err) => {
  console.error('Failed to build master high-fantasy-lobby.glb:', err);
  process.exit(1);
});
