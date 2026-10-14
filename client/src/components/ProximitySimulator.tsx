import React, { useState, useEffect } from 'react';
import { Compass, Sparkles, Sliders, Volume2, Move } from 'lucide-react';
import type { RemotePeerAudio } from '../types';
import {
  computeSpatialAudio,
  AttenuationModel,
  DEFAULT_SPATIAL_CONFIG
} from '../services/spatialAudio';

interface ProximitySimulatorProps {
  peers: Record<string, RemotePeerAudio>;
  localIsSpeaking?: boolean;
  onSetSpatial: (peerId: string, volume: number, pan?: number) => void;
  onLocalMove?: (position: { x: number; y: number; z: number }) => void;
}

export const ProximitySimulator: React.FC<ProximitySimulatorProps> = ({
  peers,
  localIsSpeaking,
  onSetSpatial,
  onLocalMove
}) => {
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: 140, y: 130 });
  const [listenerHeadingDeg, setListenerHeadingDeg] = useState<number>(0); // 0 = Facing North
  const [peerPositions, setPeerPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [model, setModel] = useState<AttenuationModel>('linear');

  // Sync positions when peers change (adopts real positions from Member 2 signaling when available)
  useEffect(() => {
    setPeerPositions((prev) => {
      const next: Record<string, { x: number; y: number }> = { ...prev };
      const peerIds = Object.keys(peers);
      peerIds.forEach((id, index) => {
        const peer = peers[id];
        if (peer?.position && typeof peer.position.x === 'number' && typeof peer.position.y === 'number') {
          next[id] = { x: peer.position.x, y: peer.position.y };
        } else if (!next[id]) {
          // Distribute initial positions
          next[id] = {
            x: 90 + ((index * 130) % 240),
            y: 80 + ((index * 80) % 160)
          };
        }
      });
      return next;
    });
  }, [peers]);

  // When positions or orientation change and simulation is active, compute spatial audio
  useEffect(() => {
    if (!isSimulating) return;

    const headingRad = (listenerHeadingDeg * Math.PI) / 180;
    const config = {
      ...DEFAULT_SPATIAL_CONFIG,
      model
    };

    Object.entries(peerPositions).forEach(([peerId, pos]) => {
      if (peers[peerId]) {
        const result = computeSpatialAudio(
          { x: localPos.x, y: localPos.y, z: 0 },
          headingRad,
          { x: pos.x, y: pos.y, z: 0 },
          config
        );

        onSetSpatial(peerId, result.volume, result.pan);
      }
    });
  }, [localPos, listenerHeadingDeg, peerPositions, isSimulating, peers, model, onSetSpatial]);

  const peerEntries = Object.entries(peers);

  return (
    <div className="card glass-panel">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Week 2 Proximity Audio Engine Demo</h2>
            <p className="text-xs text-slate-400">
              Task 4: Prepare audio module for distance attenuation & stereo spatialization
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Attenuation Curve Model Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-300 font-mono">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as AttenuationModel)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none"
              title="Mathematical distance falloff curve"
            >
              <option value="linear" className="bg-slate-900">Linear Falloff</option>
              <option value="inverse" className="bg-slate-900">Inverse Acoustic (1/d)</option>
              <option value="exponential" className="bg-slate-900">Exponential Decay</option>
            </select>
          </div>

          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`btn btn-sm ${isSimulating ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {isSimulating ? 'Proximity Active' : 'Enable Demo'}
          </button>
        </div>
      </div>

      {/* Orientation & Heading Controller */}
      <div className="mt-3 flex items-center justify-between gap-3 p-2 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Move className="w-3.5 h-3.5 text-cyan-400" />
          <span>Listener Heading / Facing Angle:</span>
          <span className="font-mono text-cyan-300 font-semibold">{listenerHeadingDeg}&deg;</span>
        </div>
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <span className="text-[10px] text-slate-500 font-mono">-180&deg;</span>
          <input
            type="range"
            min="-180"
            max="180"
            value={listenerHeadingDeg}
            onChange={(e) => setListenerHeadingDeg(Number(e.target.value))}
            className="volume-slider flex-1"
            title="Adjust listener facing orientation to test left/right stereo panning"
          />
          <span className="text-[10px] text-slate-500 font-mono">+180&deg;</span>
        </div>
      </div>

      {/* 2D Interactive Spatial Soundstage */}
      <div className="mt-3 relative w-full h-56 bg-slate-950/90 rounded-xl border border-slate-800 overflow-hidden select-none">
        {/* Radar concentric distance grid */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />

        {/* Center Audible Radius Ring around Local User */}
        {isSimulating && (
          <div
            style={{
              transform: `translate(${localPos.x}px, ${localPos.y}px)`,
              width: `${DEFAULT_SPATIAL_CONFIG.maxDistance * 2}px`,
              height: `${DEFAULT_SPATIAL_CONFIG.maxDistance * 2}px`,
              marginLeft: `-${DEFAULT_SPATIAL_CONFIG.maxDistance}px`,
              marginTop: `-${DEFAULT_SPATIAL_CONFIG.maxDistance}px`
            }}
            className="absolute top-0 left-0 rounded-full border border-indigo-500/15 bg-indigo-500/5 pointer-events-none transition-all duration-75"
          />
        )}

        {/* Local user draggable node */}
        <div
          style={{
            transform: `translate(${localPos.x}px, ${localPos.y}px)`
          }}
          className="absolute top-0 left-0 -ml-5 -mt-5 cursor-grab active:cursor-grabbing z-20 transition-transform duration-75"
          onMouseDown={(e) => {
            const rect = e.currentTarget.parentElement?.getBoundingClientRect();
            if (!rect) return;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const x = Math.max(20, Math.min(rect.width - 20, moveEvent.clientX - rect.left));
              const y = Math.max(20, Math.min(rect.height - 20, moveEvent.clientY - rect.top));
              const roundedPos = { x: Math.round(x), y: Math.round(y) };
              setLocalPos(roundedPos);
              onLocalMove?.({ x: roundedPos.x, y: roundedPos.y, z: 0 });
            };

            const handleMouseUp = () => {
              window.removeEventListener('mousemove', handleMouseMove);
              window.removeEventListener('mouseup', handleMouseUp);
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div className="relative flex flex-col items-center">
            {/* Directional heading orientation pointer */}
            <div
              style={{
                transform: `rotate(${listenerHeadingDeg}deg)`
              }}
              className="absolute -top-3 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-cyan-400 filter drop-shadow"
            />

            <div className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 border-2 border-white shadow-xl flex items-center justify-center text-xs font-bold text-white shadow-indigo-500/40">
              ME
              {localIsSpeaking && (
                <span className="absolute -inset-1.5 rounded-full bg-cyan-400/30 border border-cyan-400/50 animate-ping pointer-events-none" />
              )}
            </div>
            <span className="text-[10px] font-mono text-indigo-200 font-semibold mt-1 bg-slate-900/95 px-2 py-0.5 rounded border border-indigo-500/40 shadow-sm whitespace-nowrap">
              ({Math.round(localPos.x)}, {Math.round(localPos.y)})
            </span>
          </div>
        </div>

        {/* Remote peer nodes */}
        {peerEntries.map(([peerId, peer]) => {
          const pos = peerPositions[peerId] || { x: 220, y: 120 };
          const dist = Math.round(Math.hypot(pos.x - localPos.x, pos.y - localPos.y));
          const pan = peer.pan ?? 0;
          const isPeerSpeaking = peer.isSpeaking;

          return (
            <div
              key={peerId}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`
              }}
              className="absolute top-0 left-0 -ml-5 -mt-5 z-10 select-none cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => {
                const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                if (!rect) return;

                const handlePeerMove = (moveEvent: MouseEvent) => {
                  const x = Math.max(20, Math.min(rect.width - 20, moveEvent.clientX - rect.left));
                  const y = Math.max(20, Math.min(rect.height - 20, moveEvent.clientY - rect.top));
                  setPeerPositions((prev) => ({
                    ...prev,
                    [peerId]: { x: Math.round(x), y: Math.round(y) }
                  }));
                };

                const handlePeerUp = () => {
                  window.removeEventListener('mousemove', handlePeerMove);
                  window.removeEventListener('mouseup', handlePeerUp);
                };

                window.addEventListener('mousemove', handlePeerMove);
                window.addEventListener('mouseup', handlePeerUp);
              }}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-slate-700 shadow-md ${
                    isPeerSpeaking
                      ? 'bg-emerald-500 ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950 animate-pulse'
                      : peer.connectionState === 'connected'
                      ? 'bg-emerald-600'
                      : 'bg-slate-700'
                  }`}
                >
                  {peer.username.substring(0, 2).toUpperCase()}
                  {isPeerSpeaking && (
                    <span className="absolute -inset-1.5 rounded-full bg-emerald-400/30 border border-emerald-400/50 animate-ping pointer-events-none" />
                  )}
                </div>
                <div className="text-[9px] font-mono mt-1 bg-slate-900/95 px-2 py-1 rounded text-slate-300 border border-slate-800 text-center shadow-md">
                  <div className="font-semibold text-slate-100 flex items-center justify-center gap-1">
                    <span>{peer.username}</span>
                    {peer.isMuted && <span className="text-rose-400 text-[8px]">(Muted)</span>}
                  </div>
                  <div className="text-emerald-400 font-bold">{Math.round((peer.volume ?? 1) * 100)}% vol</div>
                  <div className="text-[8px] text-cyan-400">
                    Pan: {pan > 0.05 ? `R ${Math.round(pan * 100)}%` : pan < -0.05 ? `L ${Math.round(Math.abs(pan) * 100)}%` : 'Center'}
                  </div>
                  <div className="text-[8px] text-slate-500">{dist}px away</div>
                </div>
              </div>
            </div>
          );
        })}

        {peerEntries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 pointer-events-none">
            Open a second browser tab to see remote peer audio node spatialization
          </div>
        )}
      </div>

      {/* Spatial telemetry and Week 2 readiness badge */}
      <div className="mt-3 p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Volume2 className="w-4 h-4 text-cyan-400" />
          <span>Web Audio API <code className="text-indigo-300 font-mono">GainNode</code> & <code className="text-indigo-300 font-mono">StereoPannerNode</code> active.</span>
        </div>
        <div className="text-emerald-400 font-mono text-[11px] font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          Ready for Week 2 3D Avatar Coordinates (x, y, z)
        </div>
      </div>
    </div>
  );
};
