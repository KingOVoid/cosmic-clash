const PLAYER_COLORS = [
  0xff4d6d,
  0x4cc9f0,
  0x80ffdb,
  0xffd166,
  0xc77dff,
  0x7bf1a8,
  0xff9f1c,
  0x48bfe3,
  0xf72585,
  0xb8f2e6,
  0xfee440,
  0x9b5de5
];

const DEFAULT_STATS = Object.freeze({
  hp: 100,
  isAlive: true
});

export let selectedClass = "rogue";
export let selectedTeam = 0;
export let selectedMap = "Desert Ruins";

const connectedPlayers = [];
const playerColorById = new Map();

let joinHandler = null;
let quitHandler = null;
let sessionReady = false;
let localPlayer = null;

if (typeof window !== "undefined" && (!window.Playroom || typeof window.Playroom.insertCoin !== "function")) {
  const fallbackScript = document.createElement("script");
  fallbackScript.src = "./dist/playroomkit.js";
  document.head.appendChild(fallbackScript);
}

async function ensurePlayroom() {
  if (window.Playroom && typeof window.Playroom.insertCoin === "function") {
    return window.Playroom;
  }
  await new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "./dist/playroomkit.js";
    script.onload = () => resolve();
    script.onerror = () => {
      const cdnFallback = document.createElement("script");
      cdnFallback.src = "https://unpkg.com/playroomkit/multiplayer.full.umd.js";
      cdnFallback.onload = () => resolve();
      cdnFallback.onerror = () => resolve();
      document.head.appendChild(cdnFallback);
    };
    document.head.appendChild(script);
  });
  return window.Playroom;
}

function getPlayroom() {
  const playroom = window.Playroom;
  if (!playroom || typeof playroom.insertCoin !== "function") {
    throw new Error("Playroom SDK is not available. Check the script tag in index.html.");
  }
  return playroom;
}

function normalizeRoomCode(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();
}

function colorForJoinIndex(index) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function isLocalPlayer(player) {
  if (!player) {
    return false;
  }
  if (typeof player.isLocal === "function") {
    return player.isLocal();
  }
  if (typeof player.isMe === "function") {
    return player.isMe();
  }
  const mine = localPlayer || getPlayroom().myPlayer();
  return Boolean(mine && player.id === mine.id);
}

function ensurePlayerStats(player) {
  const current = player.getState("playerStats");
  const classId = isLocalPlayer(player) ? selectedClass : (player.getState("classId") || "rogue");
  const team = isLocalPlayer(player) ? selectedTeam : (typeof player.getState("team") === "number" ? player.getState("team") : connectedPlayers.length % 2);
  if (isLocalPlayer(player)) {
    player.setState("classId", classId, true);
    player.setState("team", team, true);
  }
  if (current && typeof current.hp === "number") {
    return current;
  }
  const stats = { hp: DEFAULT_STATS.hp, isAlive: DEFAULT_STATS.isAlive, classId, team };
  player.setState("playerStats", stats, true);
  return stats;
}

function bindPlayer(player) {
  const existing = connectedPlayers.find((entry) => entry.id === player.id);
  if (existing) {
    return existing;
  }

  const color = colorForJoinIndex(connectedPlayers.length);
  playerColorById.set(player.id, color);
  ensurePlayerStats(player);

  if (!player.getState("pos")) {
    player.setState("pos", { x: 0, y: 1.1, z: 0 }, true);
  }
  if (typeof player.getState("rot") !== "number") {
    player.setState("rot", 0, true);
  }

  connectedPlayers.push(player);

  if (isLocalPlayer(player)) {
    localPlayer = player;
  }

  player.onQuit(() => {
    const index = connectedPlayers.findIndex((entry) => entry.id === player.id);
    if (index >= 0) {
      connectedPlayers.splice(index, 1);
    }
    playerColorById.delete(player.id);
    if (quitHandler) {
      quitHandler(player);
    }
  });

  if (joinHandler) {
    joinHandler(player);
  }

  return player;
}

function setLobbyMessage(text) {
  const status = document.getElementById("lobby-status");
  if (status) {
    status.textContent = text;
  }
}

function setButtonsDisabled(disabled) {
  const hostButton = document.getElementById("btn-host");
  const joinButton = document.getElementById("btn-join");
  if (hostButton) {
    hostButton.disabled = disabled;
  }
  if (joinButton) {
    joinButton.disabled = disabled;
  }
}

function showAssignedRoomCode(code) {
  const display = document.getElementById("room-code-display");
  const input = document.getElementById("room-code-input");
  if (input && code) {
    input.value = code;
  }
  if (display && code) {
    display.hidden = false;
    display.textContent = `ROOM ${code}`;
  }
  const hudRoom = document.getElementById("hud-room");
  if (hudRoom && code) {
    hudRoom.textContent = `ROOM ${code}`;
  }
}

async function connectToRoom(options) {
  await ensurePlayroom();
  const Playroom = getPlayroom();
  setButtonsDisabled(true);
  setLobbyMessage(options.roomCode ? `Joining ${options.roomCode}…` : "Opening a new arena…");

  const config = {
    skipLobby: true,
    maxPlayersPerRoom: 12
  };
  if (options.roomCode) {
    config.roomCode = options.roomCode;
  }
  await Playroom.insertCoin(config);

  sessionReady = true;
  localPlayer = Playroom.myPlayer();
  Playroom.onPlayerJoin(bindPlayer);

  const code = typeof Playroom.getRoomCode === "function" ? Playroom.getRoomCode() : options.roomCode;
  showAssignedRoomCode(code);
  setLobbyMessage(code ? `Connected to ${code}. Entering arena…` : "Connected. Entering arena…");
  startGame();
}

export function onNetworkPlayerJoin(handler) {
  joinHandler = handler;
  connectedPlayers.forEach((player) => handler(player));
}

export function onNetworkPlayerQuit(handler) {
  quitHandler = handler;
}

export function getConnectedPlayers() {
  return connectedPlayers;
}

export function getLocalPlayer() {
  return localPlayer;
}

export function getPlayerColor(playerId) {
  return playerColorById.get(playerId) || PLAYER_COLORS[0];
}

export function isPlayerLocal(player) {
  return isLocalPlayer(player);
}

export function getRoomSnapshot() {
  const Playroom = getPlayroom();
  return Playroom.getState("arena") || null;
}

export function publishLocalPose(player, pos, rot) {
  player.setState("pos", { x: pos.x, y: pos.y, z: pos.z });
  player.setState("rot", rot);
}

export function publishCombat(player, fighter, lastHits, fx) {
  player.setState("fighter", fighter);
  player.setState("classId", fighter.classId);
  player.setState("team", fighter.team);
  if (lastHits && lastHits.length) {
    player.setState("lastHits", lastHits);
  }
  if (fx) {
    player.setState("fx", fx);
  }
}

export function startGame() {
  document.body.classList.add("lobby-hidden");
  const lobby = document.getElementById("lobby");
  if (lobby) {
    lobby.hidden = true;
  }
  const hud = document.getElementById("hud");
  if (hud) {
    hud.hidden = false;
  }
  const mobile = document.getElementById("mobile-controls");
  if (mobile) {
    mobile.hidden = false;
  }
  window.dispatchEvent(new CustomEvent("cosmic-clash-start"));
}

export function initLobby() {
  const hostButton = document.getElementById("btn-host");
  const joinButton = document.getElementById("btn-join");
  const input = document.getElementById("room-code-input");
  const classSelect = document.getElementById("class-select");
  const teamSelect = document.getElementById("team-select");

  if (classSelect) {
    classSelect.addEventListener("click", (event) => {
      const button = event.target.closest("[data-class]");
      if (!button) {
        return;
      }
      selectedClass = button.getAttribute("data-class");
      classSelect.querySelectorAll(".class-card").forEach((node) => {
        node.classList.toggle("selected", node === button);
      });
    });
  }
  if (teamSelect) {
    teamSelect.addEventListener("click", (event) => {
      const button = event.target.closest("[data-team]");
      if (!button) {
        return;
      }
      selectedTeam = Number(button.getAttribute("data-team")) === 1 ? 1 : 0;
      teamSelect.querySelectorAll(".team-btn").forEach((node) => {
        node.classList.toggle("selected", node === button);
      });
    });
  }

  const mapSelect = document.getElementById("map-select");
  if (mapSelect) {
    mapSelect.addEventListener("click", (event) => {
      const button = event.target.closest("[data-map]");
      if (!button) {
        return;
      }
      selectedMap = button.getAttribute("data-map");
      mapSelect.querySelectorAll(".map-btn").forEach((node) => {
        node.classList.toggle("selected", node === button);
      });
      window.dispatchEvent(new CustomEvent("cosmic-clash-map-change", { detail: selectedMap }));
    });
  }

  if (input) {
    input.addEventListener("input", () => {
      const caret = input.selectionStart;
      input.value = normalizeRoomCode(input.value);
      input.setSelectionRange(caret, caret);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        joinButton.click();
      }
    });
  }

  hostButton.addEventListener("click", async () => {
    if (sessionReady) {
      return;
    }
    try {
      await connectToRoom({});
    } catch (error) {
      setButtonsDisabled(false);
      setLobbyMessage(error.message || "Could not host a room.");
    }
  });

  joinButton.addEventListener("click", async () => {
    if (sessionReady) {
      return;
    }
    const roomCode = normalizeRoomCode(input ? input.value : "");
    if (roomCode.length !== 4) {
      setLobbyMessage("Enter a 4-character room code to join.");
      return;
    }
    try {
      await connectToRoom({ roomCode });
    } catch (error) {
      setButtonsDisabled(false);
      setLobbyMessage(error.message || "Could not join that room.");
    }
  });
}
