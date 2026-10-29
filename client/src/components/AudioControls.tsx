import React from 'react';
import { Mic, MicOff, AlertCircle, Radio, Volume2, ShieldCheck, Play, RotateCcw, Activity } from 'lucide-react';
import type { MicrophoneStatus } from '../types';

interface AudioControlsProps {
  status: MicrophoneStatus;
  isMuted: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  frequencyBands: number[];
  permissionState: PermissionState | 'unknown';
  availableDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  availableOutputDevices: MediaDeviceInfo[];
  selectedOutputDeviceId: string;
  onSelectOutputDevice: (deviceId: string) => void;
  audioConstraints: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  onToggleAudioConstraint: (key: 'echoCancellation' | 'noiseSuppression' | 'autoGainControl') => void;
  isSelfTesting: boolean;
  selfTestSecondsRemaining: number;
  testAudioUrl: string | null;
  onStartSelfTest: () => void;
  onClearSelfTest: () => void;
  errorMessage: string | null;
  onStart: (deviceId?: string) => void;
  onStop: () => void;
  onToggleMute: () => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  status,
  isMuted,
  isSpeaking,
  audioLevel,
  frequencyBands,
  permissionState,
  availableDevices,
  selectedDeviceId,
  onSelectDevice,
  availableOutputDevices,
  selectedOutputDeviceId,
  onSelectOutputDevice,
  audioConstraints,
  onToggleAudioConstraint,
  isSelfTesting,
  selfTestSecondsRemaining,
  testAudioUrl,
  onStartSelfTest,
  onClearSelfTest,
  errorMessage,
  onStart,
  onStop,
  onToggleMute
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center gap-1.5">
            {isSpeaking && (
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-cyan-400" /> Speaking
              </span>
            )}
            <span className="status-badge badge-active"><Radio className="w-3 h-3 animate-pulse" /> Mic Active</span>
          </div>
        );
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

  const getPermissionBadge = () => {
    switch (permissionState) {
      case 'granted':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Granted</span>;
      case 'denied':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Denied</span>;
      case 'prompt':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">Prompt</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-400">Untested</span>;
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
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Microphone & Permissions Test</h2>
              {getPermissionBadge()}
            </div>
            <p className="text-xs text-slate-400">Task 1: getUserMedia permissions, hardware diagnostics & self-test</p>
          </div>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      {errorMessage && (
        <div className="alert-box alert-error">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <div className="text-xs">
            <strong>Microphone Error:</strong> {errorMessage}
          </div>
        </div>
      )}

      {/* Hardware Device Selection (Input & Output) */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Audio Input (Microphone) */}
        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-300">Audio Input (Mic):</span>
            <span className="text-[10px] text-slate-500 font-mono">{availableDevices.length} found</span>
          </div>
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              onSelectDevice(e.target.value);
              if (isMicRunning) {
                onStart(e.target.value);
              }
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            {availableDevices.length > 0 ? (
              availableDevices.map((dev, idx) => (
                <option key={dev.deviceId || idx} value={dev.deviceId}>
                  {dev.label || `Microphone ${idx + 1} (${dev.deviceId.substring(0, 8)}...)`}
                </option>
              ))
            ) : (
              <option value="">Default System Microphone</option>
            )}
          </select>
        </div>

        {/* Audio Output (Speakers / Headphones) */}
        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-300">Audio Output (Speakers):</span>
            <span className="text-[10px] text-slate-500 font-mono">
              {availableOutputDevices.length > 0 ? `${availableOutputDevices.length} found` : 'System Default'}
            </span>
          </div>
          <select
            value={selectedOutputDeviceId}
            onChange={(e) => onSelectOutputDevice(e.target.value)}
            disabled={availableOutputDevices.length === 0}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          >
            {availableOutputDevices.length > 0 ? (
              availableOutputDevices.map((dev, idx) => (
                <option key={dev.deviceId || idx} value={dev.deviceId}>
                  {dev.label || `Speaker ${idx + 1} (${dev.deviceId.substring(0, 8)}...)`}
                </option>
              ))
            ) : (
              <option value="">System Default Speaker</option>
            )}
          </select>
        </div>
      </div>

      {/* DSP / Hardware Audio Processing Controls */}
      <div className="mt-3 p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[11px] text-slate-400 font-mono">Audio Processing Constraints:</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleAudioConstraint('echoCancellation')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
              audioConstraints.echoCancellation
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}
            title="Toggle WebRTC Echo Cancellation"
          >
            Echo Cancellation {audioConstraints.echoCancellation ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => onToggleAudioConstraint('noiseSuppression')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
              audioConstraints.noiseSuppression
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}
            title="Toggle WebRTC Noise Suppression"
          >
            Noise Suppression {audioConstraints.noiseSuppression ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => onToggleAudioConstraint('autoGainControl')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
              audioConstraints.autoGainControl
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}
            title="Toggle WebRTC Auto Gain Control (AGC)"
          >
            Auto Gain {audioConstraints.autoGainControl ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Audio Level & 8-band Frequency Visualizer */}
      {isMicRunning && (
        <div className="mt-4 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center text-xs mb-2 text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Input Level:
            </span>
            <span className={audioLevel > 50 ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
              {audioLevel}%
            </span>
          </div>

          {/* Master volume bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
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

          {/* 8-band Real-time Frequency Spectrum */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-cyan-400" /> Spectrum Analyzer (60Hz - 16kHz)</span>
              <span>8-Bands</span>
            </div>
            <div className="flex items-end justify-between gap-1.5 h-10 px-1 bg-slate-950/60 rounded-lg border border-slate-800/50">
              {frequencyBands.map((band, idx) => (
                <div key={idx} className="flex-1 flex flex-col justify-end h-full">
                  <div
                    className={`w-full rounded-t transition-all duration-75 ${
                      isMuted
                        ? 'bg-slate-700'
                        : band > 65
                        ? 'bg-gradient-to-t from-cyan-500 to-rose-400'
                        : 'bg-gradient-to-t from-indigo-600 to-cyan-400'
                    }`}
                    style={{ height: `${isMuted ? 0 : Math.max(8, band)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loopback Mic Self-Test Tool */}
      <div className="mt-4 p-3 bg-indigo-950/20 rounded-xl border border-indigo-500/20">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Mic Loopback Self-Test
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Record 3 seconds of audio to test clarity before peer calls
            </p>
          </div>

          <button
            onClick={onStartSelfTest}
            disabled={isSelfTesting}
            className={`btn btn-sm ${isSelfTesting ? 'bg-amber-600 text-white' : 'btn-secondary'}`}
          >
            {isSelfTesting ? (
              <span className="flex items-center gap-1 font-mono">
                <Radio className="w-3 h-3 animate-pulse text-rose-300" /> Recording ({selfTestSecondsRemaining}s)
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Play className="w-3 h-3 text-indigo-400" /> Run Self-Test
              </span>
            )}
          </button>
        </div>

        {/* Self-test audio preview player */}
        {testAudioUrl && (
          <div className="mt-3 p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center gap-3">
            <audio src={testAudioUrl} controls className="h-8 flex-1 outline-none" />
            <button
              onClick={onClearSelfTest}
              title="Clear recording"
              className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Primary Action Buttons */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isMicRunning ? (
          <button
            id="start-mic-btn"
            onClick={() => onStart()}
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
          <span>* Strict getUserMedia activation on user click</span>
        </div>
      </div>
    </div>
  );
};
