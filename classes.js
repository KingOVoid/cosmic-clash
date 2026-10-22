export const BASE_MOVE = 8.4;

export const CLASS_IDS = ["rogue", "sorcerer", "druid", "paladin"];

export const CLASS_DEFS = {
  rogue: {
    id: "rogue",
    name: "Rogue",
    maxHp: 100,
    speed: 1.2,
    primaryDamage: 18,
    attackRange: 2.15,
    attackArc: 0.72,
    attackKind: "melee",
    primaryCd: 0.4,
    skill1Cd: 5.5,
    skill2Cd: 9,
    skill1: "sidestep",
    skill2: "shadowVeil"
  },
  sorcerer: {
    id: "sorcerer",
    name: "Sorcerer",
    maxHp: 100,
    speed: 1.0,
    primaryDamage: 16,
    attackRange: 11,
    attackArc: 0.2,
    attackKind: "ranged",
    primaryCd: 0.5,
    skill1Cd: 8,
    skill2Cd: 7,
    skill1: "voidCurse",
    skill2: "arcaneAscension",
    altSkill1: "timeWarp",
    altSkill2: "gravitonPush"
  },
  druid: {
    id: "druid",
    name: "Druid",
    maxHp: 150,
    speed: 0.9,
    primaryDamage: 14,
    bearDamage: 22,
    attackRange: 10,
    meleeRange: 2.3,
    attackArc: 0.8,
    attackKind: "ranged",
    primaryCd: 0.48,
    skill1Cd: 1.2,
    skill2Cd: 10,
    skill1: "wildShape",
    skill2: "roots"
  },
  paladin: {
    id: "paladin",
    name: "Paladin",
    maxHp: 200,
    speed: 0.8,
    primaryDamage: 20,
    projectileDamageScale: 0.25,
    attackRange: 2.4,
    attackArc: 1.05,
    attackKind: "melee",
    primaryCd: 0.55,
    skill1Cd: 9,
    skill2Cd: 12,
    skill1: "auraOfValor",
    skill2: "vanguardCharge"
  }
};

export function createFighterState(id, classId, team) {
  const def = CLASS_DEFS[classId] || CLASS_DEFS.rogue;
  return {
    id,
    classId: def.id,
    team: team === 1 ? 1 : 0,
    hp: def.maxHp,
    maxHp: def.maxHp,
    state: "alive",
    reviveMeter: 0,
    isInvulnerable: false,
    isCharging: false,
    isPinned: false,
    pinnedBy: null,
    pinnedEnemies: [],
    speedMul: 1,
    wildShape: false,
    veilArmed: false,
    veilUntil: 0,
    chargeUntil: 0,
    sidestepUntil: 0,
    sidestepVx: 0,
    sidestepVz: 0,
    rootUntil: 0,
    warpSlow: 1,
    valorUntil: 0,
    valorSpeed: 1,
    knockbackX: 0,
    knockbackZ: 0,
    knockbackUntil: 0,
    anim: "Idle",
    attackUntil: 0,
    opacity: 1,
    cooldowns: {
      primary: 0,
      skill1: 0,
      skill2: 0
    },
    dots: [],
    upgrades: [],
    phantomHP: 0,
    phantomVitality: false,
    windstrider: false,
    windstriderStacks: 0,
    attackSpeedMul: 1,
    incomingMul: 1,
    outgoingMul: 1,
    cooldownMul: 1,
    lifesteal: 0,
    comboWindow: false,
    comboUntil: 0,
    cursedUntil: 0,
    curseAmp: 1,
    ascendUntil: 0,
    groundImmune: false,
    paladinRegenUntil: 0,
    lastMoveX: 0,
    lastMoveZ: 0
  };
}

export function getClassDef(classId) {
  return CLASS_DEFS[classId] || CLASS_DEFS.rogue;
}

export function getMoveSpeed(fighter) {
  const def = getClassDef(fighter.classId);
  let scale = def.speed;
  if (fighter.classId === "druid" && fighter.wildShape) {
    scale = 0.7;
  }
  if (fighter.isCharging) {
    scale = 1.5;
  }
  if (fighter.state === "downed") {
    scale *= 0.22;
  }
  if (fighter.rootUntil > 0) {
    scale = 0;
  }
  scale *= fighter.warpSlow;
  if (fighter.valorUntil > 0) {
    scale *= fighter.valorSpeed;
  }
  if (fighter.windstrider) {
    scale *= 1 + fighter.windstriderStacks * 0.05;
  }
  return BASE_MOVE * scale * fighter.speedMul;
}

export function getPrimaryProfile(fighter) {
  const def = getClassDef(fighter.classId);
  if (fighter.classId === "druid" && fighter.wildShape) {
    return {
      damage: def.bearDamage,
      range: def.meleeRange,
      arc: def.attackArc,
      kind: "melee"
    };
  }
  return {
    damage: def.primaryDamage,
    range: def.attackRange,
    arc: def.attackArc,
    kind: def.attackKind
  };
}

export function serializeFighter(fighter) {
  return {
    id: fighter.id,
    classId: fighter.classId,
    team: fighter.team,
    hp: fighter.hp,
    maxHp: fighter.maxHp,
    state: fighter.state,
    reviveMeter: fighter.reviveMeter,
    isInvulnerable: fighter.isInvulnerable,
    isCharging: fighter.isCharging,
    isPinned: fighter.isPinned,
    pinnedBy: fighter.pinnedBy,
    pinnedEnemies: fighter.pinnedEnemies.slice(),
    wildShape: fighter.wildShape,
    veilArmed: fighter.veilArmed,
    opacity: fighter.opacity,
    anim: fighter.anim,
    chargeUntil: fighter.chargeUntil,
    rootUntil: fighter.rootUntil,
    warpSlow: fighter.warpSlow,
    upgrades: (fighter.upgrades || []).slice(),
    phantomHP: fighter.phantomHP,
    comboWindow: fighter.comboWindow,
    comboUntil: fighter.comboUntil,
    cursedUntil: fighter.cursedUntil,
    ascendUntil: fighter.ascendUntil,
    groundImmune: fighter.groundImmune,
    windstriderStacks: fighter.windstriderStacks
  };
}
