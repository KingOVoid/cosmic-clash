import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';

export default function PlayerController({ speed = 8, position = [0, 3, 10] }) {
  const bodyRef = useRef(null);
  const meshRef = useRef(null);
  const [, getKeys] = useKeyboardControls();

  useFrame((state, delta) => {
    if (!bodyRef.current) return;

    // 1. Grab active keys
    const { forward, backward, left, right } = getKeys();

    // 2. Calculate movement direction relative to camera rotation
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion);
    forwardDir.y = 0;
    forwardDir.normalize();

    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(state.camera.quaternion);
    rightDir.y = 0;
    rightDir.normalize();

    // Combine vectors based on pressed keys
    const movement = new THREE.Vector3(0, 0, 0);
    if (forward) movement.add(forwardDir);
    if (backward) movement.sub(forwardDir);
    if (right) movement.add(rightDir);
    if (left) movement.sub(rightDir);

    // Normalize and scale by speed
    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(speed);
    }

    // 3. Apply physics: inject X and Z velocity while preserving Y (gravity)
    const linvel = bodyRef.current.linvel();
    bodyRef.current.setLinvel({ x: movement.x, y: linvel.y, z: movement.z }, true);

    // 4. Mesh Rotation Sync: Extract camera Y-axis rotation (Yaw) and smoothly slerp
    const cameraEuler = new THREE.Euler().setFromQuaternion(state.camera.quaternion, 'YXZ');
    const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cameraEuler.y);
    if (meshRef.current) {
      const slerpFactor = Math.min(1, delta * 15);
      meshRef.current.quaternion.slerp(targetQuat, slerpFactor);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      position={position}
      colliders={false}
      enabledRotations={[false, false, false]}
      friction={0.5}
      restitution={0}
    >
      <CapsuleCollider args={[0.6, 0.4]} position={[0, 1, 0]} />

      {/* Synchronized Player Mesh Group */}
      <group ref={meshRef} position={[0, 1, 0]}>
        <mesh castShadow receiveShadow>
          <capsuleGeometry args={[0.4, 1.2, 8, 16]} />
          <meshStandardMaterial
            color="#38bdf8"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
        {/* Visor facing forward (-Z) */}
        <mesh position={[0, 0.4, -0.35]} castShadow>
          <boxGeometry args={[0.4, 0.15, 0.2]} />
          <meshStandardMaterial
            color="#f59e0b"
            roughness={0.2}
            emissive="#f59e0b"
            emissiveIntensity={0.8}
          />
        </mesh>
      </group>
    </RigidBody>
  );
}
