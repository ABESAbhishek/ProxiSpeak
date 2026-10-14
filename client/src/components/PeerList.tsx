import React from 'react';
import { Users, PhoneCall, PhoneOff, Volume2, ShieldCheck, Activity, Wifi, Radio } from 'lucide-react';
import type { RemotePeerAudio, WebRTCConnectionState } from '../types';

interface PeerListProps {
  peers: Record<string, RemotePeerAudio>;
  localSocketId: string | null;
  currentRoomId: string;
  isMicActive: boolean;
  onStartCall: (peerId: string) => void;
  onCloseCall: (peerId: string) => void;
  onSetVolume: (peerId: string, volume: number) => void;
  onSwitchRoom: (roomId: string) => void;
}

export const PeerList: React.FC<PeerListProps> = ({
  peers,
  currentRoomId,
  isMicActive,
  onStartCall,
  onCloseCall,
  onSetVolume,
  onSwitchRoom
}) => {
  const peerEntries = Object.entries(peers);

  const getConnectionBadge = (state: WebRTCConnectionState) => {
    switch (state) {
      case 'connected':
        return <span className="status-badge badge-active"><ShieldCheck className="w-3 h-3" /> Audio Connected</span>;
      case 'connecting':
        return <span className="status-badge badge-info animate-pulse"><Activity className="w-3 h-3" /> Handshaking...</span>;
      case 'failed':
        return <span className="status-badge badge-error">Connection Failed</span>;
      case 'closed':
        return <span className="status-badge badge-idle">Call Ended</span>;
      case 'new':
      default:
        return <span className="status-badge badge-idle">Ready to Call</span>;
    }
  };

  const getQualityBadge = (rttMs: number, jitterMs: number) => {
    if (rttMs < 60 && jitterMs < 20) {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Excellent</span>;
    }
    if (rttMs < 150) {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">Good</span>;
    }
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">Fair</span>;
  };

  return (
    <div className="card glass-panel">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Active Room Peers</h2>
            <p className="text-xs text-slate-400">Task 2: Establish WebRTC audio connection between two browser sessions</p>
          </div>
        </div>

        {/* Room Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">Room:</span>
          <select
            value={currentRoomId}
            onChange={(e) => onSwitchRoom(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-indigo-300 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-indigo-500 font-semibold"
            title="Switch audio space / room"
          >
            <option value="global-space">global-space</option>
            <option value="audio-lab">audio-lab</option>
            <option value="spatial-room-1">spatial-room-1</option>
            <option value="quad-zone">quad-zone</option>
          </select>
        </div>
      </div>

      {peerEntries.length === 0 ? (
        <div className="empty-state">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-500">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-300">No Other Peers in '{currentRoomId}' Yet</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Open a second browser tab or incognito window at <code className="bg-slate-950 px-1 py-0.5 rounded text-indigo-400 font-mono">http://localhost:5173</code> to test the two-browser WebRTC connection.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 mt-4">
          {peerEntries.map(([peerId, peer]) => {
            const isConnected = peer.connectionState === 'connected';
            const isConnecting = peer.connectionState === 'connecting';
            const stats = peer.stats;
            const isSpeaking = peer.isSpeaking;
            const isMuted = peer.isMuted;

            return (
              <div
                key={peerId}
                className={`p-4 rounded-xl border transition-all ${
                  isConnected
                    ? 'bg-slate-900/90 border-emerald-500/30 shadow-lg shadow-emerald-950/20'
                    : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white font-mono shadow-md ${
                      isSpeaking
                        ? 'bg-gradient-to-br from-emerald-400 to-cyan-500 ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 animate-pulse'
                        : 'bg-gradient-to-br from-indigo-500 to-purple-600'
                    }`}>
                      {peer.username.substring(0, 2).toUpperCase()}
                      {isSpeaking && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950 animate-ping" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{peer.username}</span>
                        {isMuted && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">Muted</span>
                        )}
                        {isSpeaking && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono animate-pulse">Speaking</span>
                        )}
                        <span className="text-[11px] font-mono text-slate-400">ID: {peerId.substring(0, 8)}...</span>
                      </div>
                      <div className="mt-0.5">{getConnectionBadge(peer.connectionState)}</div>
                    </div>
                  </div>

                  {/* Call Actions */}
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <button
                        onClick={() => onCloseCall(peerId)}
                        className="btn btn-sm btn-danger"
                      >
                        <PhoneOff className="w-3.5 h-3.5 mr-1.5" /> End Call
                      </button>
                    ) : (
                      <button
                        onClick={() => onStartCall(peerId)}
                        disabled={isConnecting}
                        className="btn btn-sm btn-primary"
                        title={!isMicActive ? 'Start audio call' : 'Start audio call'}
                      >
                        <PhoneCall className="w-3.5 h-3.5 mr-1.5" />
                        {isConnecting ? 'Handshaking...' : 'Call Peer'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Real-time WebRTC getStats Audio Quality Telemetry */}
                {isConnected && stats && (
                  <div className="mt-3 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Wifi className="w-3 h-3 text-cyan-400" />
                      <span>RTT: <strong className="text-slate-200">{stats.rttMs}ms</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Activity className="w-3 h-3 text-indigo-400" />
                      <span>Jitter: <strong className="text-slate-200">{stats.jitterMs}ms</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Radio className="w-3 h-3 text-emerald-400" />
                      <span>Bitrate: <strong className="text-slate-200">{stats.audioBitrateKbps}kbps</strong></span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Codec: <strong className="text-slate-200 uppercase">{stats.codec}</strong></span>
                      {getQualityBadge(stats.rttMs, stats.jitterMs)}
                    </div>
                  </div>
                )}

                {/* Audio Playback & Week 2 Proximity Volume Slider */}
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Volume2 className={`w-4 h-4 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
                    <span>
                      {isConnected
                        ? 'Bidirectional Audio Active (Low-latency WebRTC)'
                        : 'Audio Stream Disconnected'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 ml-auto">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Volume: {Math.round((peer.volume ?? 1) * 100)}%
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round((peer.volume ?? 1) * 100)}
                      onChange={(e) => onSetVolume(peerId, Number(e.target.value) / 100)}
                      className="volume-slider"
                      title="Proximity Volume Control (Ready for Week 2)"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
