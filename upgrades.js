export const UPGRADE_DEFS = {
  windstrider: {
    id: "windstrider",
    name: "Windstrider",
    row: "equipment",
    summary: "+5% speed per second in a straight line. Resets if you stop or attack."
  },
  ironward: {
    id: "ironward",
    name: "Ironward Plate",
    row: "equipment",
    summary: "Take 12% less damage from all sources."
  },
  vampiricEdge: {
    id: "vampiricEdge",
    name: "Vampiric Edge",
    row: "equipment",
    summary: "Restore 8% of damage dealt as real HP (converts phantom HP first)."
  },
  quickenedRelic: {
    id: "quickenedRelic",
    name: "Quickened Relic",
    row: "equipment",
    summary: "Skill cooldowns recover 18% faster."
  },
  phantomVitality: {
    id: "phantomVitality",
    name: "Phantom Vitality",
    row: "mutation",
    summary: "Fatal blows lock you at 1 HP and grant 50 phantom HP that decays at 10/sec."
  },
  berserker: {
    id: "berserker",
    name: "Berserker",
    row: "mutation",
    summary: "+25% attack speed. You take +10% damage."
  },
  colossusBlood: {
    id: "colossusBlood",
    name: "Colossus Blood",
    row: "mutation",
    summary: "+20% max HP. Recalculate current health to the new ceiling."
  },
  cursedEdge: {
    id: "cursedEdge",
    name: "Cursed Edge",
    row: "mutation",
    summary: "Primary attacks deal +15% damage."
  }
};

const EQUIPMENT_IDS = ["windstrider", "ironward", "vampiricEdge", "quickenedRelic"];
const MUTATION_IDS = ["phantomVitality", "berserker", "colossusBlood", "cursedEdge"];

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function generateDraftCards(seed) {
  const rng = mulberry32(seed == null ? Date.now() : seed);
  const equipment = shuffle(EQUIPMENT_IDS, rng)
    .slice(0, 2)
    .map((id) => UPGRADE_DEFS[id]);
  const mutations = shuffle(MUTATION_IDS, rng)
    .slice(0, 2)
    .map((id) => UPGRADE_DEFS[id]);
  return {
    seed: seed == null ? Date.now() : seed,
    equipment,
    mutations,
    all: equipment.concat(mutations)
  };
}

export function hasUpgrade(fighter, upgradeId) {
  return Boolean(fighter && fighter.upgrades && fighter.upgrades.indexOf(upgradeId) >= 0);
}

export function applyUpgrade(player, upgradeId) {
  if (!player || !UPGRADE_DEFS[upgradeId]) {
    return player;
  }
  if (!player.upgrades) {
    player.upgrades = [];
  }
  if (player.upgrades.indexOf(upgradeId) >= 0) {
    return player;
  }
  player.upgrades.push(upgradeId);

  if (upgradeId === "colossusBlood") {
    const ratio = player.hp / Math.max(player.maxHp, 1);
    player.maxHp = Math.round(player.maxHp * 1.2);
    player.hp = Math.min(player.maxHp, Math.max(1, player.maxHp * ratio));
  }
  if (upgradeId === "berserker") {
    player.attackSpeedMul = (player.attackSpeedMul || 1) * 1.25;
    player.incomingMul = (player.incomingMul || 1) * 1.1;
  }
  if (upgradeId === "ironward") {
    player.incomingMul = (player.incomingMul || 1) * 0.88;
  }
  if (upgradeId === "cursedEdge") {
    player.outgoingMul = (player.outgoingMul || 1) * 1.15;
  }
  if (upgradeId === "quickenedRelic") {
    player.cooldownMul = (player.cooldownMul || 1) * 0.82;
  }
  if (upgradeId === "vampiricEdge") {
    player.lifesteal = (player.lifesteal || 0) + 0.08;
  }
  if (upgradeId === "windstrider") {
    player.windstrider = true;
    player.windstriderStacks = 0;
  }
  if (upgradeId === "phantomVitality") {
    player.phantomVitality = true;
  }
  return player;
}

export function recalculateStats(fighter, baseMaxHp) {
  let maxHp = baseMaxHp;
  if (hasUpgrade(fighter, "colossusBlood")) {
    maxHp = Math.round(maxHp * 1.2);
  }
  fighter.maxHp = maxHp;
  fighter.attackSpeedMul = hasUpgrade(fighter, "berserker") ? 1.25 : 1;
  fighter.incomingMul = 1;
  if (hasUpgrade(fighter, "berserker")) {
    fighter.incomingMul *= 1.1;
  }
  if (hasUpgrade(fighter, "ironward")) {
    fighter.incomingMul *= 0.88;
  }
  fighter.outgoingMul = hasUpgrade(fighter, "cursedEdge") ? 1.15 : 1;
  fighter.cooldownMul = hasUpgrade(fighter, "quickenedRelic") ? 0.82 : 1;
  fighter.lifesteal = hasUpgrade(fighter, "vampiricEdge") ? 0.08 : 0;
  fighter.windstrider = hasUpgrade(fighter, "windstrider");
  fighter.phantomVitality = hasUpgrade(fighter, "phantomVitality");
  return fighter;
}

export function healFighter(fighter, amount) {
  if (!fighter || amount <= 0) {
    return 0;
  }
  let remaining = amount;
  if (fighter.phantomHP > 0) {
    const converted = Math.min(remaining, fighter.phantomHP);
    fighter.phantomHP -= converted;
    fighter.hp = Math.min(fighter.maxHp, fighter.hp + converted);
    remaining -= converted;
  }
  if (remaining > 0 && fighter.state === "alive") {
    fighter.hp = Math.min(fighter.maxHp, fighter.hp + remaining);
  }
  return amount;
}
