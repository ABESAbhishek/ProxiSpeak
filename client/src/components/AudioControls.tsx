import React from 'react';
import { Mic, MicOff, AlertCircle, Radio, Volume2 } from 'lucide-react';
import type { MicrophoneStatus } from '../types';

interface AudioControlsProps {
  status: MicrophoneStatus;
  isMuted: boolean;
  audioLevel: number;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  status,
  isMuted,
  audioLevel,
  errorMessage,
  onStart,
  onStop,
  onToggleMute
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'active':
        return <span className="status-badge badge-active"><Radio className="w-3 h-3 animate-pulse" /> Mic Active</span>;
      case 'muted':
        return <span className="status-badge badge-warning"><MicOff className="w-3 h-3" /> Muted</span>;
      case 'requesting':
        return <span className="status-badge badge-info animate-pulse">Requesting Permission...</span>;
      case 'denied':
        return <span className="status-badge badge-error"><AlertCircle className="w-3 h-3" /> Permission Denied</span>;
      case 'error':
        return <span className="status-badge badge-error"><AlertCircle className="w-3 h-3" /> Hardware Error</span>;
      case 'idle':
      default:
        return <span className="status-badge badge-idle">Microphone Off</span>;
    }
  };

  const isMicRunning = status === 'active' || status === 'muted';

  return (
    <div className="card glass-panel">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isMicRunning ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Local Microphone Audio</h2>
            <p className="text-xs text-slate-400">Step 2: getUserMedia stream capture & controls</p>
          </div>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      {errorMessage && (
        <div className="alert-box alert-error">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <div className="text-xs">
            <strong>Microphone Warning:</strong> {errorMessage}
          </div>
        </div>
      )}

      {/* Audio pickup visualizer meter */}
      {isMicRunning && (
        <div className="mt-4 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center text-xs mb-1.5 text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Input Level:
            </span>
            <span className={audioLevel > 50 ? 'text-emerald-400' : 'text-slate-300'}>
              {audioLevel}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 rounded-full ${
                isMuted
                  ? 'bg-slate-600'
                  : audioLevel > 70
                  ? 'bg-gradient-to-r from-emerald-500 via-yellow-400 to-rose-500'
                  : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
              }`}
              style={{ width: `${isMuted ? 0 : audioLevel}%` }}
            />
          </div>
        </div>
      )}

      {/* Primary Action Buttons */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isMicRunning ? (
          <button
            id="start-mic-btn"
            onClick={onStart}
            disabled={status === 'requesting'}
            className="btn btn-primary"
          >
            <Mic className="w-4 h-4 mr-2" />
            {status === 'requesting' ? 'Requesting Permission...' : 'Start Microphone'}
          </button>
        ) : (
          <>
            <button
              id="stop-mic-btn"
              onClick={onStop}
              className="btn btn-danger"
            >
              <MicOff className="w-4 h-4 mr-2" />
              Stop Microphone
            </button>

            <button
              id="toggle-mute-btn"
              onClick={onToggleMute}
              className={`btn ${isMuted ? 'btn-warning' : 'btn-secondary'}`}
            >
              {isMuted ? (
                <>
                  <Mic className="w-4 h-4 mr-2" /> Unmute
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4 mr-2" /> Mute
                </>
              )}
            </button>
          </>
        )}

        <div className="text-[11px] text-slate-500 ml-auto flex items-center gap-1">
          <span>* Only requests permission on user click</span>
        </div>
      </div>
    </div>
  );
};
