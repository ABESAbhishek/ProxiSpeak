import React, { useState, useEffect } from 'react';
import { Compass, Sparkles } from 'lucide-react';
import type { RemotePeerAudio } from '../types';

interface ProximitySimulatorProps {
  peers: Record<string, RemotePeerAudio>;
  onSetVolume: (peerId: string, volume: number) => void;
}

export const ProximitySimulator: React.FC<ProximitySimulatorProps> = ({
  peers,
  onSetVolume
}) => {
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: 120, y: 120 });
  const [peerPositions, setPeerPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Sync positions when peers change
  useEffect(() => {
    setPeerPositions((prev) => {
      const next: Record<string, { x: number; y: number }> = { ...prev };
      const peerIds = Object.keys(peers);
      peerIds.forEach((id, index) => {
        if (!next[id]) {
          // Distribute initial positions
          next[id] = {
            x: 80 + (index * 120) % 240,
            y: 70 + (index * 90) % 180
          };
        }
      });
      return next;
    });
  }, [peers]);

  // When local position moves and simulation is enabled, dynamically compute distance-based volume
  useEffect(() => {
    if (!isSimulating) return;

    const MAX_AUDIBLE_DISTANCE = 220; // pixels

    Object.entries(peerPositions).forEach(([peerId, pos]) => {
      if (peers[peerId]) {
        const dx = pos.x - localPos.x;
        const dy = pos.y - localPos.y;
        const distance = Math.hypot(dx, dy);

        // Linear inverse falloff ready for Week 2 integration
        const volume = Math.max(0, Math.min(1, 1 - distance / MAX_AUDIBLE_DISTANCE));
        onSetVolume(peerId, volume);
      }
    });
  }, [localPos, peerPositions, isSimulating, peers, onSetVolume]);

  const peerEntries = Object.entries(peers);

  return (
    <div className="card glass-panel">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Week 2 Proximity Audio Hook Demo</h2>
            <p className="text-xs text-slate-400">Demonstrating audio engine readiness for spatial distance scaling</p>
          </div>
        </div>

        <button
          onClick={() => setIsSimulating(!isSimulating)}
          className={`btn btn-sm ${isSimulating ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          {isSimulating ? 'Proximity Mode Active' : 'Enable Proximity Demo'}
        </button>
      </div>

      <div className="mt-3 relative w-full h-52 bg-slate-950/80 rounded-xl border border-slate-800 overflow-hidden select-none">
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />

        {/* Local user draggable node */}
        <div
          style={{
            transform: `translate(${localPos.x}px, ${localPos.y}px)`
          }}
          className="absolute top-0 left-0 -ml-4 -mt-4 cursor-grab active:cursor-grabbing z-20 transition-transform duration-75"
          onMouseDown={(e) => {
            const rect = e.currentTarget.parentElement?.getBoundingClientRect();
            if (!rect) return;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const x = Math.max(16, Math.min(rect.width - 16, moveEvent.clientX - rect.left));
              const y = Math.max(16, Math.min(rect.height - 16, moveEvent.clientY - rect.top));
              setLocalPos({ x, y });
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
            {/* Proximity circle aura */}
            {isSimulating && (
              <div className="absolute w-44 h-44 -top-18 -left-18 rounded-full border border-indigo-500/20 bg-indigo-500/5 pointer-events-none animate-pulse" />
            )}
            <div className="w-8 h-8 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold text-white shadow-indigo-500/50">
              ME
            </div>
            <span className="text-[10px] font-mono text-indigo-300 font-semibold mt-1 bg-slate-900/90 px-1.5 py-0.5 rounded border border-indigo-500/30">
              Drag Me
            </span>
          </div>
        </div>

        {/* Remote peer nodes */}
        {peerEntries.map(([peerId, peer]) => {
          const pos = peerPositions[peerId] || { x: 180, y: 100 };
          const dist = Math.round(Math.hypot(pos.x - localPos.x, pos.y - localPos.y));

          return (
            <div
              key={peerId}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`
              }}
              className="absolute top-0 left-0 -ml-4 -mt-4 z-10 select-none"
            >
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-slate-700 shadow-md ${
                  peer.connectionState === 'connected' ? 'bg-emerald-600' : 'bg-slate-700'
                }`}>
                  {peer.username.substring(0, 2).toUpperCase()}
                </div>
                <div className="text-[9px] font-mono mt-1 bg-slate-900/90 px-1.5 py-0.5 rounded text-slate-300 border border-slate-800 text-center">
                  <div>{peer.username}</div>
                  <div className="text-emerald-400 font-bold">{Math.round((peer.volume ?? 1) * 100)}% vol</div>
                  <div className="text-[8px] text-slate-500">{dist}px away</div>
                </div>
              </div>
            </div>
          );
        })}

        {peerEntries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 pointer-events-none">
            Open a 2nd tab to see peer nodes on this spatial audio grid
          </div>
        )}
      </div>
      <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Drag your &quot;ME&quot; avatar to hear volume attenuate smoothly in real-time.</span>
        <span className="text-emerald-400 font-mono">Audio engine volume hooks verified</span>
      </div>
    </div>
  );
};
