import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const CLASS_COLORS = {
  sorcerer: 0x3a86ff,
  paladin: 0xffd60a,
  rogue: 0x7b2cbf,
  druid: 0x2d6a4f
};

const MODEL_FILES = {
  sorcerer: "./models/sorcerer.glb",
  paladin: "./models/paladin.glb",
  rogue: "./models/rogue.glb",
  druid: "./models/druid.glb"
};

const ANIM_NAMES = ["Idle", "Run", "Attack", "Downed"];
const CAPSULE_RADIUS = 0.42;
const CAPSULE_HEIGHT = 1.55;

function makeScalarTrack(name, times, values) {
  return new THREE.NumberKeyframeTrack(name, times, values);
}

function buildFallbackClips() {
  const idle = new THREE.AnimationClip("Idle", 1.6, [
    makeScalarTrack(".position[y]", [0, 0.8, 1.6], [0.78, 0.86, 0.78])
  ]);
  const run = new THREE.AnimationClip("Run", 0.4, [
    makeScalarTrack(".rotation[z]", [0, 0.2, 0.4], [0.12, -0.12, 0.12])
  ]);
  const attack = new THREE.AnimationClip("Attack", 0.35, [
    makeScalarTrack(".rotation[x]", [0, 0.12, 0.35], [0, -0.55, 0])
  ]);
  const downed = new THREE.AnimationClip("Downed", 1.2, [
    makeScalarTrack(".rotation[x]", [0, 0.6, 1.2], [1.2, 1.28, 1.2])
  ]);
  return [idle, run, attack, downed];
}

function findClip(clips, name) {
  const lower = name.toLowerCase();
  for (let i = 0; i < clips.length; i += 1) {
    if (clips[i].name && clips[i].name.toLowerCase() === lower) {
      return clips[i];
    }
  }
  for (let i = 0; i < clips.length; i += 1) {
    if (clips[i].name && clips[i].name.toLowerCase().includes(lower)) {
      return clips[i];
    }
  }
  return null;
}

function enableShadows(root) {
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}

function fitModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const height = Math.max(size.y, 0.001);
  const scale = CAPSULE_HEIGHT / height;
  root.scale.multiplyScalar(scale);
  const fitted = new THREE.Box3().setFromObject(root);
  root.position.y -= fitted.min.y;
}

function createFallbackModel(classId) {
  const group = new THREE.Group();
  const color = CLASS_COLORS[classId] || 0xffffff;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HEIGHT - CAPSULE_RADIUS * 2, 4, 8),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.16,
      transparent: true,
      opacity: 1
    })
  );
  body.position.y = CAPSULE_HEIGHT * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.16, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0xf4fbff,
      emissive: color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 1
    })
  );
  visor.position.set(0, 1.18, CAPSULE_RADIUS + 0.02);
  group.add(body);
  group.add(visor);
  group.userData.fallback = true;
  group.userData.body = body;
  return group;
}

export class AnimRig {
  constructor(root, mixer, actions) {
    this.root = root;
    this.mixer = mixer;
    this.actions = actions;
    this.current = "Idle";
    this.play("Idle");
  }

  play(name) {
    const clipName = ANIM_NAMES.indexOf(name) >= 0 ? name : "Idle";
    if (this.current === clipName && this.actions[clipName] && this.actions[clipName].isRunning()) {
      return;
    }
    const next = this.actions[clipName] || this.actions.Idle;
    const prev = this.actions[this.current];
    if (prev && prev !== next) {
      prev.fadeOut(0.12);
    }
    if (next) {
      next.reset();
      next.setEffectiveWeight(1);
      next.fadeIn(0.12);
      next.play();
    }
    this.current = clipName;
  }

  update(dt) {
    if (this.mixer) {
      this.mixer.update(dt);
    }
  }
}

function createFallbackPineTree() {
  const cone = new THREE.ConeGeometry(1.6, 4.8, 8);
  cone.translate(0, 2.4, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2d6a4f,
    roughness: 0.8,
    metalness: 0.1,
    flatShading: true
  });
  return { geometry: cone, material: mat };
}

function createFallbackRock() {
  const ico = new THREE.IcosahedronGeometry(1.4, 1);
  ico.scale(1.2, 0.9, 1.1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5a6065,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true
  });
  return { geometry: ico, material: mat };
}

function createFallbackSands() {
  const geom = new THREE.BoxGeometry(60, 2, 60);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd2b48c,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: true
  });
  const mesh = new THREE.Mesh(geom, mat);
  return { geometry: geom, material: mat, scene: mesh };
}

class AssetManagerImpl {
  constructor() {
    this.loader = new GLTFLoader();
    this.templates = new Map();
    this.fallbackClips = buildFallbackClips();
    this.ready = false;
    this.treeGeometry = null;
    this.treeMaterial = null;
    this.rockGeometry = null;
    this.rockMaterial = null;
    this.sandsGeometry = null;
    this.sandsMaterial = null;
    this.sandsScene = null;
    this.envModels = {
      tree: null,
      rock: null,
      sands: null
    };
  }

  async loadOne(classId, url) {
    try {
      const gltf = await this.loader.loadAsync(url);
      if (!gltf || !gltf.scene) {
        throw new Error("GLTF scene missing");
      }
      gltf.scene.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      this.templates.set(classId, {
        scene: gltf.scene,
        clips: Array.isArray(gltf.animations) ? gltf.animations : [],
        fallback: false
      });
    } catch (error) {
      this.templates.set(classId, {
        scene: null,
        clips: this.fallbackClips,
        fallback: true,
        reason: error && error.message ? error.message : "missing glb"
      });
    }
  }

  async loadEnvModel(key, urls, fallbackFactory) {
    for (let i = 0; i < urls.length; i += 1) {
      try {
        const gltf = await this.loader.loadAsync(urls[i]);
        if (gltf && gltf.scene) {
          let foundMesh = null;
          gltf.scene.traverse((node) => {
            if (node.isMesh && !foundMesh) {
              foundMesh = node;
            }
          });
          if (foundMesh && foundMesh.geometry && foundMesh.material) {
            const entry = {
              geometry: foundMesh.geometry,
              material: foundMesh.material,
              scene: gltf.scene
            };
            this.envModels[key] = entry;
            if (key === "tree") {
              this.treeGeometry = entry.geometry;
              this.treeMaterial = entry.material;
            } else if (key === "rock") {
              this.rockGeometry = entry.geometry;
              this.rockMaterial = entry.material;
            } else if (key === "sands") {
              this.sandsGeometry = entry.geometry;
              this.sandsMaterial = entry.material;
              this.sandsScene = gltf.scene;
            }
            return entry;
          }
        }
      } catch (error) {
        // Continue trying next candidate
      }
    }
    const fallback = fallbackFactory();
    this.envModels[key] = fallback;
    if (key === "tree") {
      this.treeGeometry = fallback.geometry;
      this.treeMaterial = fallback.material;
    } else if (key === "rock") {
      this.rockGeometry = fallback.geometry;
      this.rockMaterial = fallback.material;
    } else if (key === "sands") {
      this.sandsGeometry = fallback.geometry;
      this.sandsMaterial = fallback.material;
      this.sandsScene = fallback.scene;
    }
    return fallback;
  }

  getEnvModel(key) {
    return this.envModels[key] || null;
  }

  async loadModels() {
    const ids = Object.keys(MODEL_FILES);
    const jobs = [];
    for (let i = 0; i < ids.length; i += 1) {
      jobs.push(this.loadOne(ids[i], MODEL_FILES[ids[i]]));
    }
    jobs.push(this.loadEnvModel(
      "tree",
      ["./assets/environment/PineTree.gltf", "./assets/environment/BirchTree_1.gltf"],
      createFallbackPineTree
    ));
    jobs.push(this.loadEnvModel(
      "rock",
      ["./assets/environment/Rocks.gltf", "./assets/environment/Bush.gltf"],
      createFallbackRock
    ));
    jobs.push(this.loadEnvModel(
      "sands",
      ["./assets/environment/sands map.gltf", "./assets/environment/sands.gltf"],
      createFallbackSands
    ));
    await Promise.all(jobs);
    this.ready = true;
    return this.templates;
  }

  createRig(classId) {
    const id = CLASS_COLORS[classId] ? classId : "rogue";
    const template = this.templates.get(id);
    let root;
    let clips;
    if (!template || template.fallback || !template.scene) {
      root = createFallbackModel(id);
      clips = this.fallbackClips;
    } else {
      root = template.scene.clone(true);
      enableShadows(root);
      fitModel(root);
      clips = template.clips.length > 0 ? template.clips : this.fallbackClips;
    }

    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (let i = 0; i < ANIM_NAMES.length; i += 1) {
      const name = ANIM_NAMES[i];
      const clip = findClip(clips, name) || this.fallbackClips[i] || this.fallbackClips[0];
      const action = mixer.clipAction(clip);
      if (name === "Attack") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      actions[name] = action;
    }
    return new AnimRig(root, mixer, actions);
  }

  tintOpacity(root, opacity) {
    root.traverse((node) => {
      if (node.isMesh && node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (let i = 0; i < materials.length; i += 1) {
          materials[i].transparent = opacity < 0.999;
          materials[i].opacity = opacity;
          materials[i].depthWrite = opacity > 0.8;
        }
      }
    });
  }
}

export const AssetManager = new AssetManagerImpl();
export const PLAYER_HEIGHT = CAPSULE_HEIGHT;
export const PLAYER_RADIUS = CAPSULE_RADIUS;
