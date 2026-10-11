import React from 'react';
import { useMicrophone } from './hooks/useMicrophone';
import { useWebRTCAudio } from './hooks/useWebRTCAudio';
import { AudioControls } from './components/AudioControls';
import { PeerList } from './components/PeerList';
import { SignalingLog } from './components/SignalingLog';
import { ProximitySimulator } from './components/ProximitySimulator';
import { Headphones, Radio, GitBranch, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  // Step 2: Microphone access hook
  const {
    stream: localStream,
    status: micStatus,
    isMuted,
    audioLevel,
    errorMessage: micError,
    startMicrophone,
    stopMicrophone,
    toggleMute
  } = useMicrophone();

  // Step 3 & 4: WebRTC and signaling hook
  const {
    localSocketId,
    isConnected,
    peers,
    signalingLogs,
    clearLogs,
    startCall,
    closeCall,
    setPeerVolume
  } = useWebRTCAudio(localStream);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">ProxiSpeak</h1>
                <span className="badge-role">Week 1 WebRTC Foundation</span>
              </div>
              <p className="text-[11px] text-slate-400">Member 4 — WebRTC & Proximity Audio</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 rounded-lg border border-slate-700/60 text-xs font-mono text-slate-300">
              <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
              <span>feat/webrtc-foundation</span>
            </div>

            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-mono ${
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
              <span>{isConnected ? `Socket: ${localSocketId?.substring(0, 8)}...` : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Quick Testing Instructions Banner */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 border border-indigo-500/20 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 mt-0.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">How to Test the Two-Browser Audio Connection</h3>
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                  1. Click <strong className="text-white">Start Microphone</strong> below &bull; 
                  2. Open a second tab or incognito window &bull; 
                  3. In either tab, click <strong className="text-white">Call Peer</strong> to exchange <code className="text-indigo-300 font-mono">webrtc:offer</code>, <code className="text-indigo-300 font-mono">webrtc:answer</code>, & <code className="text-indigo-300 font-mono">webrtc:ice-candidate</code>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-emerald-400" /> STUN: Google STUN
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Audio Controls & Week 2 Proximity Demo */}
          <div className="space-y-6">
            <AudioControls
              status={micStatus}
              isMuted={isMuted}
              audioLevel={audioLevel}
              errorMessage={micError}
              onStart={startMicrophone}
              onStop={stopMicrophone}
              onToggleMute={toggleMute}
            />

            <ProximitySimulator
              peers={peers}
              onSetVolume={setPeerVolume}
            />
          </div>

          {/* Right Column: Peer List & Real-time Signaling Inspector */}
          <div className="space-y-6">
            <PeerList
              peers={peers}
              localSocketId={localSocketId}
              isMicActive={micStatus === 'active'}
              onStartCall={startCall}
              onCloseCall={closeCall}
              onSetVolume={setPeerVolume}
            />

            <SignalingLog
              logs={signalingLogs}
              onClear={clearLogs}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>ProxiSpeak &bull; Geospatial Proximity Audio Ecosystem &bull; Week 1 WebRTC Foundation</p>
      </footer>
    </div>
  );
};

export default App;
