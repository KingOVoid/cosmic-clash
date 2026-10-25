import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, KeyboardControls } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import PlayerController from './PlayerController.jsx';
import RoundtableLobby from './RoundtableLobby.jsx';

const keyboardMap = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
];

export default function App() {
  return (
    <KeyboardControls map={keyboardMap}>
      <div className="relative w-full h-full min-h-screen bg-stone-950">
        {/* 2D Overlay Header */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none text-center">
          <p className="text-amber-400 font-serif text-xs tracking-[0.35em] uppercase drop-shadow">
            Roundtable Hold
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-amber-100 tracking-wider drop-shadow-[0_2px_15px_rgba(245,158,11,0.5)]">
            Cosmic Clash Lobby
          </h1>
          <div className="w-32 h-0.5 mx-auto mt-2 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent"></div>
          <p className="text-stone-400 font-serif text-xs mt-2 drop-shadow">
            <span className="text-amber-300 font-bold">WASD / Arrows</span> to Move · Player automatically aims with Camera · Orbit mouse to look
          </p>
        </div>

        {/* Full-screen 3D Canvas */}
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 8, 20], fov: 50 }}
          className="w-full h-full"
        >
          <color attach="background" args={['#0a0c10']} />

          {/* Global HDRI Environment */}
          <Suspense fallback={null}>
            <Environment preset="sunset" />
          </Suspense>

          {/* Cinematic Directional Light with Shadow Mapping */}
          <ambientLight intensity={0.4} />
          <directionalLight
            castShadow
            position={[15, 25, 15]}
            intensity={1.8}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={70}
            shadow-camera-left={-35}
            shadow-camera-right={35}
            shadow-camera-top={35}
            shadow-camera-bottom={-35}
            shadow-bias={-0.0001}
          />

          {/* Rapier Physics System */}
          <Suspense fallback={null}>
            <Physics gravity={[0, -9.81, 0]}>
              {/* Active Player Character Controller */}
              <PlayerController speed={8} position={[0, 3, 10]} />

              {/* Unified Roundtable Lobby Environment with Trimesh Collider */}
              <RoundtableLobby />

              {/* Dynamic Interactive Prop */}
              <RigidBody position={[4, 5, 6]} colliders="cuboid">
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

          {/* Interactive Camera Orbit Controls */}
          <OrbitControls
            makeDefault
            minDistance={4}
            maxDistance={50}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
        </Canvas>
      </div>
    </KeyboardControls>
  );
}
