import * as THREE from "three";

const HIT_FLASH_LIFE = 0.2;
const TRAIL_LIFE = 0.28;
const TRAIL_INTERVAL = 0.032;

const flashVertex = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const flashFragment = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
void main() {
  float rim = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.4);
  gl_FragColor = vec4(uColor * (0.65 + rim), uOpacity);
}
`;

class VFXManagerImpl {
  constructor() {
    this.scene = null;
    this.flashes = [];
    this.trails = [];
    this.trackedProjectiles = new Map();
    this.flashGeom = new THREE.SphereGeometry(0.35, 12, 12);
    this.trailGeom = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  }

  attach(scene) {
    this.scene = scene;
  }

  createHitFlash(position, color) {
    if (!this.scene || !position) {
      return null;
    }
    const tint = new THREE.Color(color == null ? 0xffe29a : color);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: tint },
        uOpacity: { value: 0.95 }
      },
      vertexShader: flashVertex,
      fragmentShader: flashFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(this.flashGeom, material);
    mesh.position.set(position.x, position.y + 0.7, position.z);
    mesh.scale.set(0.35, 0.35, 0.35);
    this.scene.add(mesh);
    const flash = { mesh, material, age: 0, life: HIT_FLASH_LIFE };
    this.flashes.push(flash);
    return flash;
  }

  createProjectileTrail(projectileMesh, color) {
    if (!projectileMesh) {
      return;
    }
    const id = projectileMesh.uuid;
    this.trackedProjectiles.set(id, {
      mesh: projectileMesh,
      color: new THREE.Color(color == null ? 0xffffff : color),
      acc: 0
    });
  }

  dropTrailBox(x, y, z, color) {
    if (!this.scene) {
      return;
    }
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });
    const box = new THREE.Mesh(this.trailGeom, material);
    box.position.set(x, y, z);
    this.scene.add(box);
    this.trails.push({ mesh: box, material, age: 0, life: TRAIL_LIFE });
  }

  forgetProjectile(projectileMesh) {
    if (projectileMesh) {
      this.trackedProjectiles.delete(projectileMesh.uuid);
    }
  }

  update(dt) {
    this.trackedProjectiles.forEach((track, id) => {
      if (!track.mesh.parent) {
        this.trackedProjectiles.delete(id);
        return;
      }
      track.acc += dt;
      if (track.acc >= TRAIL_INTERVAL) {
        track.acc = 0;
        this.dropTrailBox(track.mesh.position.x, track.mesh.position.y, track.mesh.position.z, track.color);
      }
    });

    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      const flash = this.flashes[i];
      flash.age += dt;
      const t = Math.min(1, flash.age / flash.life);
      const scale = 0.35 + t * 2.4;
      flash.mesh.scale.set(scale, scale, scale);
      flash.material.uniforms.uOpacity.value = 0.95 * (1 - t);
      if (flash.age >= flash.life) {
        this.scene.remove(flash.mesh);
        flash.material.dispose();
        this.flashes.splice(i, 1);
      }
    }

    for (let i = this.trails.length - 1; i >= 0; i -= 1) {
      const trail = this.trails[i];
      trail.age += dt;
      const t = Math.min(1, trail.age / trail.life);
      trail.material.opacity = 0.7 * (1 - t);
      const s = 1 - t * 0.7;
      trail.mesh.scale.set(s, s, s);
      if (trail.age >= trail.life) {
        this.scene.remove(trail.mesh);
        trail.material.dispose();
        this.trails.splice(i, 1);
      }
    }
  }

  clear() {
    for (let i = 0; i < this.flashes.length; i += 1) {
      this.scene.remove(this.flashes[i].mesh);
      this.flashes[i].material.dispose();
    }
    for (let i = 0; i < this.trails.length; i += 1) {
      this.scene.remove(this.trails[i].mesh);
      this.trails[i].material.dispose();
    }
    this.flashes.length = 0;
    this.trails.length = 0;
    this.trackedProjectiles.clear();
  }
}

export const VFXManager = new VFXManagerImpl();
