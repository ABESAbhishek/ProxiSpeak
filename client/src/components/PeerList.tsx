import React from 'react';
import { Users, PhoneCall, PhoneOff, Volume2, ShieldCheck, Activity } from 'lucide-react';
import type { RemotePeerAudio, WebRTCConnectionState } from '../types';

interface PeerListProps {
  peers: Record<string, RemotePeerAudio>;
  localSocketId: string | null;
  isMicActive: boolean;
  onStartCall: (peerId: string) => void;
  onCloseCall: (peerId: string) => void;
  onSetVolume: (peerId: string, volume: number) => void;
}

export const PeerList: React.FC<PeerListProps> = ({
  peers,
  isMicActive,
  onStartCall,
  onCloseCall,
  onSetVolume
}) => {
  const peerEntries = Object.entries(peers);

  const getConnectionBadge = (state: WebRTCConnectionState) => {
    switch (state) {
      case 'connected':
        return <span className="status-badge badge-active"><ShieldCheck className="w-3 h-3" /> Connected</span>;
      case 'connecting':
        return <span className="status-badge badge-info animate-pulse"><Activity className="w-3 h-3" /> Handshaking...</span>;
      case 'failed':
        return <span className="status-badge badge-error">Failed</span>;
      case 'closed':
        return <span className="status-badge badge-idle">Closed</span>;
      case 'new':
      default:
        return <span className="status-badge badge-idle">Ready to Call</span>;
    }
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
            <p className="text-xs text-slate-400">Step 3 & 4: WebRTC RTCPeerConnection audio handshake</p>
          </div>
        </div>
        <div className="text-xs font-mono bg-slate-900/80 px-2.5 py-1 rounded-md text-slate-400 border border-slate-800">
          Peers in space: {peerEntries.length}
        </div>
      </div>

      {peerEntries.length === 0 ? (
        <div className="empty-state">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-500">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-300">No Other Peers Detected Yet</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Open another browser window or incognito tab at <code className="bg-slate-950 px-1 py-0.5 rounded text-indigo-400 font-mono">http://localhost:5173</code> to test the two-browser audio connection.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 mt-4">
          {peerEntries.map(([peerId, peer]) => {
            const isConnected = peer.connectionState === 'connected';
            const isConnecting = peer.connectionState === 'connecting';

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
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white font-mono shadow-md">
                      {peer.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{peer.username}</span>
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
                        title={!isMicActive ? 'Tip: You can start call now or turn mic on anytime' : 'Start audio call'}
                      >
                        <PhoneCall className="w-3.5 h-3.5 mr-1.5" />
                        {isConnecting ? 'Connecting...' : 'Call Peer'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Audio Playback & Week 2 Proximity Volume Slider */}
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Volume2 className={`w-4 h-4 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
                    <span>
                      {isConnected
                        ? 'Audio Connected (Native WebRTC)'
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
