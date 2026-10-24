import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';

export default function App() {
  return (
    <div className="relative w-full h-full min-h-screen bg-stone-950">
      {/* 2D Overlay Header */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none text-center">
        <p className="text-amber-400 font-serif text-xs tracking-[0.35em] uppercase drop-shadow">
          Cosmic Clash Engine
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold font-serif text-amber-100 tracking-wider drop-shadow-[0_2px_15px_rgba(245,158,11,0.5)]">
          Core Scaffolding & Rapier Renderer
        </h1>
        <div className="w-32 h-0.5 mx-auto mt-2 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent"></div>
      </div>

      {/* Full-screen 3D Canvas */}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 6, 14], fov: 50 }}
        className="w-full h-full"
      >
        <color attach="background" args={['#0c0a09']} />

        {/* Global HDRI Environment */}
        <Suspense fallback={null}>
          <Environment preset="sunset" />
        </Suspense>

        {/* Cinematic Directional Light with Shadow Mapping */}
        <ambientLight intensity={0.25} />
        <directionalLight
          castShadow
          position={[10, 20, 10]}
          intensity={1.5}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.5}
          shadow-camera-far={50}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          shadow-bias={-0.0001}
        />

        {/* Rapier Physics System */}
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]}>
            {/* Fixed Ground Plane */}
            <RigidBody type="fixed" colliders="cuboid">
              <mesh receiveShadow position={[0, -0.5, 0]}>
                <boxGeometry args={[40, 1, 40]} />
                <meshStandardMaterial
                  color="#292524"
                  roughness={0.7}
                  metalness={0.2}
                />
              </mesh>
            </RigidBody>

            {/* Verification Dynamic Prop (falling onto the ground) */}
            <RigidBody position={[0, 6, 0]} colliders="cuboid">
              <mesh castShadow receiveShadow>
                <boxGeometry args={[1.5, 1.5, 1.5]} />
                <meshStandardMaterial
                  color="#f59e0b"
                  roughness={0.25}
                  metalness={0.75}
                />
              </mesh>
            </RigidBody>
          </Physics>
        </Suspense>

        {/* Interactive Camera Orbit Controls for Scaffolding Validation */}
        <OrbitControls makeDefault minDistance={3} maxDistance={40} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
    </div>
  );
}
