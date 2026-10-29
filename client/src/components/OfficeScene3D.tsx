import React, { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Position3D, RemotePeerAudio } from '../types';

type OfficeScene3DProps = {
  position: Position3D;
  displayName: string;
  avatarUrl?: string;
  onMove: (position: Position3D) => void;
  peers: RemotePeerAudio[];
  isLocationTracking: boolean;
  theme: 'dark' | 'light';
  selectedParticipantId: string | null;
  onSelectParticipant: (participantId: string | null) => void;
};

const SCALE = 0.018;
const FLOOR_WIDTH = 20;
const FLOOR_DEPTH = 11.2;
const HALF_WIDTH = FLOOR_WIDTH / 2;
const HALF_DEPTH = FLOOR_DEPTH / 2;
const OFFICE_BOUNDS = { minX: -9.15, maxX: 9.15, minZ: -5.2, maxZ: 5.2 };
const FURNITURE_BLOCKS = [
  { x: -6.2, z: -3.45, halfX: 1.55, halfZ: 1.05 },
  { x: 6.2, z: -3.45, halfX: 1.55, halfZ: 1.05 },
  { x: -6.2, z: 3.35, halfX: 1.55, halfZ: 1.05 },
  { x: 6.2, z: 3.35, halfX: 1.55, halfZ: 1.05 },
  { x: -2.85, z: -0.62, halfX: 0.65, halfZ: 1.5 },
  { x: 2.85, z: -0.62, halfX: 0.65, halfZ: 1.5 },
  { x: 0, z: -1.45, halfX: 1.25, halfZ: 0.75 },
  { x: -8.25, z: -4.25, halfX: 0.42, halfZ: 0.42 },
  { x: 8.25, z: -4.25, halfX: 0.42, halfZ: 0.42 },
  { x: -8.25, z: 4.25, halfX: 0.42, halfZ: 0.42 },
  { x: 8.25, z: 4.25, halfX: 0.42, halfZ: 0.42 },
];
const NEARBY_DISTANCE = 260;

const toWorld = (position: Position3D) => new THREE.Vector3(
  (position.x - 500) * SCALE,
  position.z * SCALE,
  (position.y - 280) * SCALE,
);

const toOfficePosition = (point: THREE.Vector3): Position3D => ({
  x: Math.round(point.x / SCALE + 500),
  y: Math.round(point.z / SCALE + 280),
  z: Math.round(point.y / SCALE),
});

const isBlocked = (x: number, z: number) =>
  x < OFFICE_BOUNDS.minX || x > OFFICE_BOUNDS.maxX || z < OFFICE_BOUNDS.minZ || z > OFFICE_BOUNDS.maxZ ||
  FURNITURE_BLOCKS.some((block) => Math.abs(x - block.x) < block.halfX && Math.abs(z - block.z) < block.halfZ);

const WindowPanel: React.FC<{ position: [number, number, number]; width?: number }> = ({ position, width = 2.5 }) => (
  <group position={position}>
    <mesh castShadow>
      <boxGeometry args={[width + 0.12, 1.28, 0.12]} />
      <meshStandardMaterial color="#795941" roughness={0.72} />
    </mesh>
    <mesh position={[0, 0, 0.075]}>
      <boxGeometry args={[width, 1.16, 0.035]} />
      <meshPhysicalMaterial color="#dce9df" roughness={0.18} metalness={0.04} transmission={0.12} transparent opacity={0.88} />
    </mesh>
    <mesh position={[0, 0, 0.1]}>
      <boxGeometry args={[0.045, 1.16, 0.04]} />
      <meshStandardMaterial color="#9d7959" roughness={0.58} />
    </mesh>
    <mesh position={[0, -0.1, 0.1]}>
      <boxGeometry args={[width, 0.035, 0.04]} />
      <meshStandardMaterial color="#9d7959" roughness={0.58} />
    </mesh>
  </group>
);

const Desk: React.FC<{ position: [number, number, number]; label: string; rotation?: number }> = ({ position, label, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
      <boxGeometry args={[2.8, 0.18, 1.35]} />
      <meshStandardMaterial color="#9a6846" roughness={0.52} />
    </mesh>
    <mesh position={[0, 0.82, 0]}>
      <boxGeometry args={[2.68, 0.035, 1.24]} />
      <meshStandardMaterial color="#b9885d" roughness={0.44} />
    </mesh>
    {([-1.1, 1.1] as const).flatMap((x) => ([-0.48, 0.48] as const).map((z) => (
      <mesh key={`${x}-${z}`} position={[x, 0.34, z]} castShadow>
        <boxGeometry args={[0.12, 0.68, 0.12]} />
        <meshStandardMaterial color="#73523b" roughness={0.68} />
      </mesh>
    )))}
    <mesh position={[0, 0.88, -0.38]} castShadow>
      <boxGeometry args={[0.92, 0.63, 0.09]} />
      <meshStandardMaterial color="#59473a" roughness={0.48} />
    </mesh>
    <mesh position={[0, 0.9, -0.325]}>
      <boxGeometry args={[0.79, 0.49, 0.025]} />
      <meshStandardMaterial color="#a8beb0" emissive="#789387" emissiveIntensity={0.14} roughness={0.38} />
    </mesh>
    <mesh position={[0, 0.795, -0.32]}>
      <boxGeometry args={[0.16, 0.1, 0.08]} />
      <meshStandardMaterial color="#584537" roughness={0.56} />
    </mesh>
    <mesh position={[0, 0.81, 0.24]}>
      <boxGeometry args={[0.72, 0.025, 0.24]} />
      <meshStandardMaterial color="#49392e" roughness={0.7} />
    </mesh>
    <mesh position={[0, 0.46, 1.02]} castShadow>
      <cylinderGeometry args={[0.43, 0.46, 0.16, 24]} />
      <meshStandardMaterial color="#a85b43" roughness={0.76} />
    </mesh>
    <mesh position={[0, 0.23, 1.02]}>
      <cylinderGeometry args={[0.07, 0.09, 0.42, 12]} />
      <meshStandardMaterial color="#775b44" roughness={0.6} />
    </mesh>
    <Html position={[0, 1.18, 0]} center distanceFactor={13}>
      <span className="scene-furniture-label">{label}</span>
    </Html>
  </group>
);

const Plant: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    <mesh position={[0, 0.22, 0]} castShadow>
      <cylinderGeometry args={[0.35, 0.28, 0.44, 20]} />
      <meshStandardMaterial color="#bd8660" roughness={0.72} />
    </mesh>
    <mesh position={[0, 0.45, 0]}>
      <cylinderGeometry args={[0.26, 0.26, 0.035, 20]} />
      <meshStandardMaterial color="#614b37" roughness={0.98} />
    </mesh>
    {Array.from({ length: 7 }, (_, index) => {
      const angle = (index / 7) * Math.PI * 2;
      return (
        <mesh key={index} position={[Math.cos(angle) * 0.16, 0.82 + (index % 2) * 0.13, Math.sin(angle) * 0.16]} rotation={[0.12, angle, -0.2]} castShadow>
          <capsuleGeometry args={[0.105, 0.48, 4, 8]} />
          <meshStandardMaterial color={index % 2 ? '#71855f' : '#87956a'} roughness={0.84} />
        </mesh>
      );
    })}
  </group>
);

const Sofa: React.FC<{ position: [number, number, number]; rotation?: number }> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0.33, 0]} castShadow receiveShadow>
      <boxGeometry args={[2.8, 0.62, 0.88]} />
      <meshStandardMaterial color="#9c725e" roughness={0.86} />
    </mesh>
    <mesh position={[0, 0.7, -0.34]} castShadow>
      <boxGeometry args={[2.8, 0.68, 0.2]} />
      <meshStandardMaterial color="#885e4b" roughness={0.86} />
    </mesh>
    {[-1.25, 1.25].map((x) => (
      <mesh key={x} position={[x, 0.48, 0.02]} castShadow>
        <boxGeometry args={[0.3, 0.65, 1.05]} />
        <meshStandardMaterial color="#a77c66" roughness={0.8} />
      </mesh>
    ))}
    {[-0.83, 0, 0.83].map((x) => (
      <mesh key={x} position={[x, 0.66, 0.02]} castShadow>
        <boxGeometry args={[0.76, 0.16, 0.64]} />
        <meshStandardMaterial color="#c59679" roughness={0.92} />
      </mesh>
    ))}
  </group>
);

const MeetingTable: React.FC = () => (
  <group position={[0, 0, -1.45]}>
    <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[1.12, 1.12, 0.16, 48]} />
      <meshStandardMaterial color="#9a6846" roughness={0.48} />
    </mesh>
    <mesh position={[0, 0.33, 0]} castShadow>
      <cylinderGeometry args={[0.13, 0.22, 0.55, 20]} />
      <meshStandardMaterial color="#6b4c37" roughness={0.63} />
    </mesh>
    <mesh position={[0, 0.75, 0]}>
      <cylinderGeometry args={[0.36, 0.36, 0.025, 32]} />
      <meshStandardMaterial color="#f0dfc6" roughness={0.78} />
    </mesh>
  </group>
);

const Avatar: React.FC<{
  name: string;
  avatarUrl?: string;
  local?: boolean;
  muted?: boolean;
  speaking?: boolean;
  selected?: boolean;
  accentColor: string;
  speakingColor: string;
  onSelect?: () => void;
}> = ({ name, avatarUrl, local = false, muted = false, speaking = false, selected = false, accentColor, speakingColor, onSelect }) => (
  <group onClick={(event) => { event.stopPropagation(); onSelect?.(); }}>
    <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
      <capsuleGeometry args={[0.28, 0.45, 6, 12]} />
      <meshStandardMaterial color={local ? accentColor : '#718a98'} roughness={0.76} />
    </mesh>
    <mesh position={[0, 0.55, 0]} castShadow>
      <sphereGeometry args={[0.22, 24, 16]} />
      <meshStandardMaterial color="#e6bb99" roughness={0.82} />
    </mesh>
    <mesh position={[0, 0.67, -0.02]}>
      <sphereGeometry args={[0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
      <meshStandardMaterial color="#594537" roughness={0.88} />
    </mesh>
    {(local || speaking || selected) && (
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.39, 0.44, 48]} />
        <meshBasicMaterial color={speaking ? speakingColor : accentColor} transparent opacity={speaking ? 0.9 : 0.76} side={THREE.DoubleSide} />
      </mesh>
    )}
    <Html position={[0, 1.02, 0]} center distanceFactor={11}>
      <button type="button" className={`scene-avatar-label ${local ? 'is-local' : ''} ${selected ? 'is-selected' : ''}`} onClick={(event) => { event.stopPropagation(); onSelect?.(); }}>
        {avatarUrl ? <img className="scene-avatar-photo" src={avatarUrl} alt="" /> : null}<span>{name}</span>{local ? <small>You</small> : muted ? <small>Muted</small> : speaking ? <small>Speaking</small> : null}
      </button>
    </Html>
  </group>
);

const MovingLocalAvatar: React.FC<{
  position: Position3D;
  displayName: string;
  avatarUrl?: string;
  onMove: (position: Position3D) => void;
  isLocationTracking: boolean;
  onSelect: () => void;
  accentColor: string;
  speakingColor: string;
}> = ({ position, displayName, avatarUrl, onMove, isLocationTracking, onSelect, accentColor, speakingColor }) => {
  const avatar = useRef<THREE.Group>(null);
  const target = useRef(toWorld(position));
  const keys = useRef(new Set<string>());
  const reportElapsed = useRef(0);
  const lastReported = useRef(toWorld(position));
  const previousPosition = useRef(position);
  const wasTracking = useRef(isLocationTracking);

  useLayoutEffect(() => {
    if (!avatar.current) return;
    avatar.current.position.copy(toWorld(position));
    target.current.copy(toWorld(position));
    lastReported.current.copy(toWorld(position));
  }, []);

  useEffect(() => {
    const positionChanged = position.x !== previousPosition.current.x
      || position.y !== previousPosition.current.y
      || position.z !== previousPosition.current.z;
    if (isLocationTracking && (!wasTracking.current || positionChanged)) {
      target.current.copy(toWorld(position));
    }
    previousPosition.current = position;
    wasTracking.current = isLocationTracking;
  }, [isLocationTracking, position]);

  useEffect(() => {
    const isTypingTarget = (targetElement: EventTarget | null) => {
      if (!(targetElement instanceof HTMLElement)) return false;
      return targetElement.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(targetElement.tagName);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isLocationTracking || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        keys.current.add(key);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const onBlur = () => keys.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.current.clear();
    };
  }, [isLocationTracking]);

  useFrame((_, delta) => {
    const node = avatar.current;
    if (!node) return;

    const safeDelta = Math.min(delta, 0.05);
    const active = keys.current;
    let dx = Number(active.has('d') || active.has('arrowright')) - Number(active.has('a') || active.has('arrowleft'));
    let dz = Number(active.has('s') || active.has('arrowdown')) - Number(active.has('w') || active.has('arrowup'));
    const length = Math.hypot(dx, dz);
    if (length > 0) {
      dx = (dx / length) * 3.8 * safeDelta;
      dz = (dz / length) * 3.8 * safeDelta;
      const nextX = THREE.MathUtils.clamp(target.current.x + dx, OFFICE_BOUNDS.minX, OFFICE_BOUNDS.maxX);
      const nextZ = THREE.MathUtils.clamp(target.current.z + dz, OFFICE_BOUNDS.minZ, OFFICE_BOUNDS.maxZ);
      if (!isBlocked(nextX, target.current.z)) target.current.x = nextX;
      if (!isBlocked(target.current.x, nextZ)) target.current.z = nextZ;
      node.rotation.y = THREE.MathUtils.damp(node.rotation.y, Math.atan2(dx, dz), 10, safeDelta);
    }

    node.position.x = THREE.MathUtils.damp(node.position.x, target.current.x, 12, safeDelta);
    node.position.z = THREE.MathUtils.damp(node.position.z, target.current.z, 12, safeDelta);
    reportElapsed.current += safeDelta;

    if (!isLocationTracking && reportElapsed.current >= 0.1 && node.position.distanceTo(lastReported.current) >= 0.035) {
      reportElapsed.current = 0;
      lastReported.current.copy(node.position);
      onMove(toOfficePosition(node.position));
    }
  });

  return (
    <group ref={avatar}>
      <Avatar name={displayName} avatarUrl={avatarUrl} local selected accentColor={accentColor} speakingColor={speakingColor} onSelect={onSelect} />
    </group>
  );
};

const OfficeContents: React.FC<OfficeScene3DProps & { onReady: () => void }> = ({ position, displayName, avatarUrl, onMove, peers, isLocationTracking, theme, selectedParticipantId, onSelectParticipant, onReady }) => {
  const localWorld = useMemo(() => toWorld(position), [position]);
  const audiblePeers = peers.filter((peer) => peer.position);
  const selectedParticipant = audiblePeers.find((peer) => peer.peerId === selectedParticipantId);
  const selectedWorld = selectedParticipant?.position ? toWorld(selectedParticipant.position) : localWorld;
  const palette = useMemo(() => theme === 'dark'
    ? { background: '#0B0F14', floor: '#1C2734', grid: '#2B3645', wall: '#101720', trim: '#2B3645', ambient: '#d9e5ee', local: '#10B981', teammate: '#6EE7B7' }
    : { background: '#F5F7FA', floor: '#F8FAFC', grid: '#DCE3EA', wall: '#EDF2F7', trim: '#DCE3EA', ambient: '#fff8ee', local: '#047857', teammate: '#10B981',
    }, [theme]);
  useEffect(() => { onReady(); }, [onReady]);

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <ambientLight intensity={theme === 'dark' ? 0.85 : 1.25} color={palette.ambient} />
      <hemisphereLight args={[theme === 'dark' ? '#b7c8d8' : '#fff7e9', theme === 'dark' ? '#263444' : '#876a4d', 1.05]} />
      <directionalLight position={[-5, 11, 6]} intensity={theme === 'dark' ? 1.6 : 2.2} color={theme === 'dark' ? '#dbe9f2' : '#fff1d5'} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <pointLight position={[0, 4.4, -2.4]} intensity={theme === 'dark' ? 24 : 35} distance={12} color={theme === 'dark' ? '#6EE7B7' : '#ffe1b4'} />

      <mesh position={[0, -0.18, 0]} receiveShadow>
        <boxGeometry args={[FLOOR_WIDTH, 0.36, FLOOR_DEPTH]} />
        <meshStandardMaterial color={palette.floor} roughness={0.78} />
      </mesh>
      <gridHelper args={[FLOOR_WIDTH, 40, palette.grid, palette.grid]} position={[0, 0.006, 0]} />

      {/* Walnut skirting and a bright open-front room make the floor easy to read. */}
      <mesh position={[0, 1.55, -HALF_DEPTH]} castShadow>
        <boxGeometry args={[FLOOR_WIDTH, 3.1, 0.24]} />
        <meshStandardMaterial color={palette.wall} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.22, -HALF_DEPTH + 0.14]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.38, 0.035]} />
        <meshStandardMaterial color={palette.trim} roughness={0.68} />
      </mesh>
      <mesh position={[-HALF_WIDTH, 1.1, 0]} castShadow>
        <boxGeometry args={[0.22, 2.2, FLOOR_DEPTH]} />
        <meshStandardMaterial color={palette.wall} roughness={0.82} />
      </mesh>
      <mesh position={[HALF_WIDTH, 1.1, 0]} castShadow>
        <boxGeometry args={[0.22, 2.2, FLOOR_DEPTH]} />
        <meshStandardMaterial color={palette.wall} roughness={0.82} />
      </mesh>
      <WindowPanel position={[-5.2, 2.03, -5.43]} />
      <WindowPanel position={[-1.75, 2.03, -5.43]} />
      <WindowPanel position={[1.75, 2.03, -5.43]} />
      <WindowPanel position={[5.2, 2.03, -5.43]} />

      <Desk position={[-6.2, 0, -3.45]} label="Design" rotation={Math.PI} />
      <Desk position={[6.2, 0, -3.45]} label="Engineering" rotation={Math.PI} />
      <Desk position={[-6.2, 0, 3.35]} label="Studio" />
      <Desk position={[6.2, 0, 3.35]} label="Focus" />
      <MeetingTable />
      <Sofa position={[-2.85, 0, -0.62]} rotation={Math.PI / 2} />
      <Sofa position={[2.85, 0, -0.62]} rotation={-Math.PI / 2} />
      <Plant position={[-8.25, 0, -4.25]} />
      <Plant position={[8.25, 0, -4.25]} />
      <Plant position={[-8.25, 0, 4.25]} />
      <Plant position={[8.25, 0, 4.25]} />

      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, NEARBY_DISTANCE * SCALE, 64]} />
        <meshBasicMaterial color={palette.local} transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
      <MovingLocalAvatar position={position} displayName={displayName} avatarUrl={avatarUrl} onMove={onMove} isLocationTracking={isLocationTracking} onSelect={() => onSelectParticipant(null)} accentColor={palette.local} speakingColor={palette.teammate} />

      {audiblePeers.map((peer) => {
        const point = toWorld(peer.position!);
        const distance = localWorld.distanceTo(point);
        const nearby = distance <= NEARBY_DISTANCE * SCALE;
        return (
          <group key={peer.peerId} position={point.toArray()}>
            {nearby && (
              <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.38, 0.46, 48]} />
                <meshBasicMaterial color={palette.teammate} transparent opacity={0.28} side={THREE.DoubleSide} />
              </mesh>
            )}
            <Avatar
              name={peer.username}
              avatarUrl={peer.avatarUrl}
              muted={peer.isMuted}
              speaking={Boolean(peer.isSpeaking)}
              selected={selectedParticipantId === peer.peerId}
              accentColor={palette.local}
              speakingColor={palette.teammate}
              onSelect={() => onSelectParticipant(peer.peerId)}
            />
          </group>
        );
      })}

      {selectedParticipantId && (
        <Html position={[selectedWorld.x, 2.15, selectedWorld.z]} center distanceFactor={14}>
          <div className="scene-selection-card">
            {selectedParticipant?.username ?? 'Member'}
            <small>{selectedParticipant?.connectionState ?? 'Online'}</small>
          </div>
        </Html>
      )}

      {peers.length === 0 && (
        <Html position={[0, 0.04, 4.6]} center distanceFactor={15}>
          <div className="scene-empty-note">The room is ready for your team</div>
        </Html>
      )}

      <ContactShadows position={[0, 0.006, 0]} opacity={0.24} scale={22} blur={2.8} far={8} />
      <OrbitControls makeDefault target={[0, 0.4, 0]} minDistance={9} maxDistance={24} minPolarAngle={0.24} maxPolarAngle={1.24} enablePan={false} dampingFactor={0.08} />
    </>
  );
};

const SceneLoading: React.FC = () => <div className="scene-loading-card">Preparing the office…</div>;

class SceneErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) {
      return <div className="scene-fallback" role="status"><strong>3D view unavailable</strong><span>Your audio workspace is still ready. Try a browser with WebGL enabled.</span></div>;
    }
    return this.props.children;
  }
}

export const OfficeScene3D: React.FC<OfficeScene3DProps> = (props) => {
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);

  return (
    <SceneErrorBoundary>
      <div className="office-scene-viewport" aria-label="Interactive 3D virtual office">
        <Canvas
          shadows
          dpr={[1, 1.6]}
          camera={{ position: [0, 12.5, 16], fov: 42, near: 0.1, far: 80 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          fallback={<div className="scene-fallback" role="status"><strong>3D view unavailable</strong><span>Enable WebGL or use a browser that supports 3D graphics.</span></div>}
        >
          <Suspense fallback={<Html center><SceneLoading /></Html>}>
            <OfficeContents {...props} onReady={markReady} />
          </Suspense>
        </Canvas>
        {!ready && <div className="scene-loading-overlay"><SceneLoading /></div>}
        <div className="scene-control-hint" aria-hidden="true">WASD / arrows to walk · drag to orbit · scroll to zoom</div>
      </div>
    </SceneErrorBoundary>
  );
};

export default OfficeScene3D;
