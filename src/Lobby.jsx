import React, { useRef, useMemo, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Environment, OrbitControls, KeyboardControls, Text } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import PlayerController from './PlayerController.jsx';

// =========================================================================
// 1. SPAWN POINTS & CORNER CONFIGURATION
// =========================================================================
export const LOBBY_SPAWN_POINTS = {
  paladin: [-19, 1.8, -19],
  sorcerer: [19, 1.8, -19],
  druid: [19, 1.8, 19],
  rogue: [-19, 1.8, 19],
};

export const CORNER_CONFIG = {
  paladin: {
    name: 'Paladin',
    sub: 'Oathbound',
    spawn: LOBBY_SPAWN_POINTS.paladin,
    color: '#fbbf24',
    emissive: '#f59e0b',
    desc: 'Regal armory, holy banners, pristine heavy armor',
  },
  sorcerer: {
    name: 'Sorcerer',
    sub: 'Arcane Force',
    spawn: LOBBY_SPAWN_POINTS.sorcerer,
    color: '#38bdf8',
    emissive: '#818cf8',
    desc: 'Mystical sanctuary, floating tomes, arcane runic circles',
  },
  druid: {
    name: 'Druid',
    sub: 'Wild Growth',
    spawn: LOBBY_SPAWN_POINTS.druid,
    color: '#10b981',
    emissive: '#34d399',
    desc: 'Overgrown flora, ancient roots, bioluminescent sanctuary',
  },
  rogue: {
    name: 'Rogue',
    sub: 'Shadowstep',
    spawn: LOBBY_SPAWN_POINTS.rogue,
    color: '#c084fc',
    emissive: '#7c3aed',
    desc: 'Shadowy alcove, assassin gear, poison stash, practice dummies',
  },
};

const KEYBOARD_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
];

// =========================================================================
// 2. DYNAMIC LIGHTING COMPONENTS
// =========================================================================

// Warm flickering torchlight for Paladin & Rogue
function FlickeringTorch({ position, color = '#f59e0b', baseIntensity = 35, distance = 20, flickerSpeed = 7 }) {
  const lightRef = useRef();

  useFrame(({ clock }) => {
    if (lightRef.current) {
      const t = clock.getElapsedTime() * flickerSpeed;
      const flicker = Math.sin(t) * 0.22 + Math.sin(t * 2.3) * 0.14 + Math.sin(t * 5.1) * 0.08;
      lightRef.current.intensity = Math.max(10, baseIntensity * (1 + flicker));
    }
  });

  return (
    <group position={position}>
      <pointLight
        ref={lightRef}
        color={color}
        distance={distance}
        castShadow
        shadow-bias={-0.0005}
      />
      {/* Visual Glowing Flame */}
      <mesh>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

// Emissive pulsing glow for Sorcerer (Arcane) & Druid (Bioluminescent)
function PulsingGlowLight({ position, color, baseIntensity = 30, distance = 18, pulseSpeed = 2 }) {
  const lightRef = useRef();

  useFrame(({ clock }) => {
    if (lightRef.current) {
      const p = Math.sin(clock.getElapsedTime() * pulseSpeed) * 0.35 + 1;
      lightRef.current.intensity = baseIntensity * p;
    }
  });

  return (
    <group position={position}>
      <pointLight ref={lightRef} color={color} distance={distance} />
      <mesh>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

// Floating animated arcane book
function FloatingArcaneBook({ position = [19, 2.7, -15] }) {
  const groupRef = useRef();

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime();
      groupRef.current.position.y = position[1] + Math.sin(t * 2.2) * 0.14;
      groupRef.current.rotation.y = t * 0.45;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Book Cover */}
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.12, 0.65]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Glowing Pages */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.82, 0.1, 0.6]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={2.0} />
      </mesh>
    </group>
  );
}

// Glowing Spawn Marker Rune
function SpawnMarker({ cornerKey, config }) {
  const [x, , z] = config.spawn;
  const ringRef = useRef();

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.getElapsedTime() * 0.5;
    }
  });

  return (
    <group position={[x, 0.64, z]}>
      {/* Outer Rotating Rune Ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.8, 32]} />
        <meshBasicMaterial color={config.emissive} side={THREE.DoubleSide} transparent opacity={0.7} />
      </mesh>
      {/* Inner Soft Circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.3, 32]} />
        <meshBasicMaterial color={config.color} transparent opacity={0.25} />
      </mesh>
      {/* 3D Label */}
      <Text
        position={[0, 1.8, 0]}
        fontSize={0.45}
        color={config.color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#09090b"
      >
        {config.name.toUpperCase()}
      </Text>
    </group>
  );
}

// =========================================================================
// 3. UNIFIED GLTF ENVIRONMENT (Master .glb Loader)
// =========================================================================
export function RoundtableLobbyModel() {
  const { scene } = useGLTF('./assets/environment/high-fantasy-lobby.glb');

  useMemo(() => {
    scene.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <RigidBody type="fixed" colliders="trimesh">
      <primitive object={scene} />
    </RigidBody>
  );
}

useGLTF.preload('./assets/environment/high-fantasy-lobby.glb');

// =========================================================================
// 4. LOBBY 3D SCENE (Lighting, Environment, Props, Spawns)
// =========================================================================
export function LobbyScene({ selectedClass = 'paladin' }) {
  const spawnPos = LOBBY_SPAWN_POINTS[selectedClass] || [0, 3, 10];

  return (
    <>
      {/* Base Moody HDRI Environment */}
      <Suspense fallback={null}>
        <Environment preset="night" />
      </Suspense>

      {/* Atmospheric Ambient Moonlight Tint */}
      <ambientLight intensity={0.2} color="#1e1b4b" />

      {/* Subtle Central Moonlight Beam */}
      <directionalLight
        position={[0, 22, 0]}
        intensity={0.6}
        color="#c7d2fe"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />

      {/* ------------------------------------------------------------- */}
      {/* CORNER 1: PALADIN (Oathbound) LIGHTING - Regal Golden Braziers */}
      {/* ------------------------------------------------------------- */}
      <FlickeringTorch position={[-23, 4.0, -25]} color="#f59e0b" baseIntensity={45} />
      <FlickeringTorch position={[-25, 4.0, -23]} color="#fbbf24" baseIntensity={40} />
      <spotLight
        position={[-19, 13, -19]}
        target-position={[-22, 1, -22]}
        color="#fbbf24"
        intensity={90}
        angle={0.45}
        penumbra={0.6}
        castShadow
        shadow-bias={-0.0005}
      />

      {/* ------------------------------------------------------------- */}
      {/* CORNER 2: SORCERER (Arcane Force) LIGHTING - Cool Blues & Purples */}
      {/* ------------------------------------------------------------- */}
      <PulsingGlowLight position={[22, 3.6, -22]} color="#38bdf8" baseIntensity={50} pulseSpeed={2.5} />
      <PulsingGlowLight position={[19, 3.2, -15]} color="#a855f7" baseIntensity={35} pulseSpeed={1.8} />
      <spotLight
        position={[19, 13, -19]}
        target-position={[19, 1, -19]}
        color="#38bdf8"
        intensity={110}
        angle={0.5}
        penumbra={0.5}
        castShadow
        shadow-bias={-0.0005}
      />
      <FloatingArcaneBook position={[19, 2.7, -15]} />

      {/* ------------------------------------------------------------- */}
      {/* CORNER 3: DRUID (Wild Growth) LIGHTING - Bioluminescent Emeralds */}
      {/* ------------------------------------------------------------- */}
      <PulsingGlowLight position={[23, 3.0, 23]} color="#10b981" baseIntensity={45} pulseSpeed={1.5} />
      <PulsingGlowLight position={[17, 2.0, 18]} color="#34d399" baseIntensity={35} pulseSpeed={2.0} />
      <spotLight
        position={[19, 13, 19]}
        target-position={[19, 1, 19]}
        color="#10b981"
        intensity={85}
        angle={0.55}
        penumbra={0.7}
      />

      {/* ------------------------------------------------------------- */}
      {/* CORNER 4: ROGUE (Shadowstep) LIGHTING - Deep Dim Torches & Shadows */}
      {/* ------------------------------------------------------------- */}
      <FlickeringTorch position={[-25, 3.8, 21]} color="#ea580c" baseIntensity={30} flickerSpeed={9} />
      <FlickeringTorch position={[-21, 3.8, 25]} color="#b91c1c" baseIntensity={25} flickerSpeed={8} />
      <spotLight
        position={[-19, 13, 19]}
        target-position={[-22, 1, 22]}
        color="#7c3aed"
        intensity={45}
        angle={0.4}
        penumbra={0.8}
      />

      {/* Rapier Physics World */}
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          {/* Master Unified High-Fantasy GLB Lobby */}
          <RoundtableLobbyModel />

          {/* 4 Thematic Class Spawn Markers */}
          {Object.entries(CORNER_CONFIG).map(([key, config]) => (
            <SpawnMarker key={key} cornerKey={key} config={config} />
          ))}

          {/* Local Active Player RigidBody Capsule */}
          <PlayerController speed={8} position={spawnPos} />
        </Physics>
      </Suspense>

      {/* Action-Orbit Camera */}
      <OrbitControls
        makeDefault
        minDistance={3}
        maxDistance={45}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </>
  );
}

// =========================================================================
// 5. TAILWIND UI OVERLAYS (STRICTLY absolute z-10 pointer-events-none)
// =========================================================================
export function LobbyOverlay({ selectedClass, onSelectClass, isHost = false }) {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 select-none">
      {/* Top Header Bar */}
      <header className="flex justify-between items-start w-full">
        <div className="bg-stone-950/80 border border-amber-600/40 backdrop-blur-md px-5 py-3 rounded-xl shadow-2xl">
          <p className="text-amber-400 font-serif text-xs tracking-[0.3em] uppercase">
            Realm of the Ancients
          </p>
          <h1 className="text-xl sm:text-2xl font-bold font-serif text-amber-100 tracking-wider">
            Roundtable Hold
          </h1>
        </div>

        {/* Room Code & Connection Pill */}
        <div className="bg-stone-950/80 border border-amber-600/40 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-stone-300 font-serif text-xs uppercase tracking-wider">
            {isHost ? 'Host Session' : 'Connected to Lobby'}
          </span>
        </div>
      </header>

      {/* Center Status: "Waiting for Host" Banner */}
      <div className="self-center text-center">
        {!isHost ? (
          <div className="bg-stone-950/85 border border-amber-500/50 backdrop-blur-lg px-8 py-4 rounded-2xl shadow-[0_0_35px_rgba(245,158,11,0.25)] flex flex-col items-center gap-1.5 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping"></span>
              <p className="text-amber-200 font-serif text-base sm:text-lg font-bold tracking-widest uppercase">
                Waiting for Host to Begin Match
              </p>
            </div>
            <p className="text-stone-400 font-serif text-xs">
              Explore your class sanctuary corner · WASD to move · Orbit mouse to look
            </p>
          </div>
        ) : (
          <div className="bg-stone-950/85 border border-amber-500/50 backdrop-blur-lg px-8 py-4 rounded-2xl shadow-[0_0_35px_rgba(245,158,11,0.3)] flex flex-col items-center gap-3 pointer-events-auto">
            <p className="text-amber-300 font-serif text-sm tracking-widest uppercase font-semibold">
              Host Controls
            </p>
            <button
              type="button"
              className="px-6 py-2.5 bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-500 text-amber-100 font-serif font-bold text-sm rounded-lg border border-amber-400/60 shadow-lg cursor-pointer transition-all transform hover:scale-105 active:scale-95"
              onClick={() => alert('Launching Arena Match...')}
            >
              Start Arena Match
            </button>
          </div>
        )}
      </div>

      {/* Bottom 4-Corner Sanctuary Class Bar */}
      <footer className="w-full flex flex-col sm:flex-row justify-between items-end gap-4">
        {/* Class Selector Pills (Interactive with pointer-events-auto) */}
        <div className="flex gap-2.5 bg-stone-950/80 border border-amber-600/30 backdrop-blur-md p-2 rounded-2xl shadow-xl pointer-events-auto">
          {Object.entries(CORNER_CONFIG).map(([key, config]) => {
            const isSelected = selectedClass === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectClass && onSelectClass(key)}
                className={`px-3.5 py-2 rounded-xl font-serif text-xs font-semibold tracking-wider transition-all cursor-pointer flex flex-col items-center ${
                  isSelected
                    ? 'bg-amber-600/40 text-amber-200 border border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 border border-transparent'
                }`}
              >
                <span>{config.name}</span>
                <span className="text-[10px] opacity-75">{config.sub}</span>
              </button>
            );
          })}
        </div>

        {/* Controls Info Badge */}
        <div className="bg-stone-950/80 border border-amber-600/30 backdrop-blur-md px-4 py-2 rounded-xl text-stone-300 font-serif text-xs shadow-xl">
          <span className="text-amber-300 font-bold">WASD / Arrows</span> to Move · Player aims with camera
        </div>
      </footer>
    </div>
  );
}

// =========================================================================
// 6. MAIN COMPLETE LOBBY EXPORT
// =========================================================================
export default function Lobby({ defaultClass = 'paladin', isHost = false }) {
  const [selectedClass, setSelectedClass] = React.useState(defaultClass);

  return (
    <KeyboardControls map={KEYBOARD_MAP}>
      <div className="relative w-full h-full min-h-screen bg-stone-950 overflow-hidden select-none">
        {/* UI Overlay (Strictly absolute z-10 pointer-events-none) */}
        <LobbyOverlay
          selectedClass={selectedClass}
          onSelectClass={setSelectedClass}
          isHost={isHost}
        />

        {/* Full-Screen 3D Scene */}
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 10, 24], fov: 50 }}
          className="w-full h-full"
        >
          <color attach="background" args={['#070709']} />
          <LobbyScene selectedClass={selectedClass} />
        </Canvas>
      </div>
    </KeyboardControls>
  );
}
