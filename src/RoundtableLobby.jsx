import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';

export default function RoundtableLobby(props) {
  const { scene } = useGLTF('./assets/environment/lobby.glb');

  useMemo(() => {
    scene.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <RigidBody type="fixed" colliders="trimesh" {...props}>
      <primitive object={scene} />
    </RigidBody>
  );
}

useGLTF.preload('./assets/environment/lobby.glb');
