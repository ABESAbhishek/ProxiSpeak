import React, { useState } from 'react';
import { Terminal, Trash2, ArrowUpRight, ArrowDownLeft, CheckCircle2, Cpu } from 'lucide-react';
import type { SignalingLogEntry } from '../types';

interface SignalingLogProps {
  logs: SignalingLogEntry[];
  signalingLatencyMs?: number | null;
  onClear: () => void;
}

export const SignalingLog: React.FC<SignalingLogProps> = ({ logs, signalingLatencyMs, onClear }) => {
  const [filter, setFilter] = useState<string>('all');

  const offerCount = logs.filter((l) => l.type === 'webrtc:offer').length;
  const answerCount = logs.filter((l) => l.type === 'webrtc:answer').length;
  const iceCount = logs.filter((l) => l.type === 'webrtc:ice-candidate').length;
  const spatialCount = logs.filter((l) => l.type === 'position:update').length;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    if (filter === 'offer') return log.type === 'webrtc:offer';
    if (filter === 'answer') return log.type === 'webrtc:answer';
    if (filter === 'ice') return log.type === 'webrtc:ice-candidate';
    if (filter === 'spatial') return log.type === 'position:update';
    if (filter === 'error') return log.type === 'webrtc:error';
    return true;
  });

  return (
    <div className="card glass-panel">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Member 2 Signaling Inspector</h2>
              {signalingLatencyMs !== null && signalingLatencyMs !== undefined && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> Relay RTT: {signalingLatencyMs}ms
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Task 3: Agreed signaling protocol & live event relay audit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter options */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Events ({logs.length})</option>
            <option value="offer">Offers ({offerCount})</option>
            <option value="answer">Answers ({answerCount})</option>
            <option value="ice">ICE ({iceCount})</option>
            <option value="spatial">Spatial Moves ({spatialCount})</option>
            <option value="error">Errors</option>
          </select>

          <button
            onClick={onClear}
            className="btn btn-sm btn-secondary p-1.5"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Signaling telemetry counter chips */}
      <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
          <div className="text-[10px] text-amber-300/80 uppercase font-semibold">Offers Relayed</div>
          <div className="text-base font-bold text-amber-200 mt-0.5">{offerCount}</div>
        </div>
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
          <div className="text-[10px] text-emerald-300/80 uppercase font-semibold">Answers Relayed</div>
          <div className="text-base font-bold text-emerald-200 mt-0.5">{answerCount}</div>
        </div>
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
          <div className="text-[10px] text-cyan-300/80 uppercase font-semibold">ICE Candidates</div>
          <div className="text-base font-bold text-cyan-200 mt-0.5">{iceCount}</div>
        </div>
        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-center hidden sm:block">
          <div className="text-[10px] text-indigo-300/80 uppercase font-semibold">Spatial Sync</div>
          <div className="text-base font-bold text-indigo-200 mt-0.5">{spatialCount}</div>
        </div>
      </div>

      <div className="mt-3 bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 font-mono text-xs max-h-52 overflow-y-auto space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-6 text-slate-600">
            No signaling events logged yet. Connect two browser tabs and initiate a call to observe live SDP/ICE events.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isOut = log.direction === 'out';
            const isOffer = log.type === 'webrtc:offer';
            const isAnswer = log.type === 'webrtc:answer';
            const isIce = log.type === 'webrtc:ice-candidate';
            const isError = log.type === 'webrtc:error';
            const isSpatial = log.type === 'position:update';
            const isProfile = log.type === 'user:update-profile';

            return (
              <div
                key={log.id}
                className={`flex items-start justify-between gap-2 p-2 rounded-lg border hover:border-slate-700 transition-colors ${
                  isError ? 'bg-rose-950/20 border-rose-900/50' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isOut ? (
                    <span className="p-1 rounded bg-indigo-500/20 text-indigo-400" title="Outbound (Sent)">
                      <ArrowUpRight className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="p-1 rounded bg-emerald-500/20 text-emerald-400" title="Inbound (Received)">
                      <ArrowDownLeft className="w-3 h-3" />
                    </span>
                  )}

                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      isOffer
                        ? 'bg-amber-500/20 text-amber-300'
                        : isAnswer
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : isIce
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : isError
                        ? 'bg-rose-500/20 text-rose-300'
                        : isSpatial
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : isProfile
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {log.type}
                  </span>

                  <span className={`text-[11px] ${isError ? 'text-rose-300 font-semibold' : 'text-slate-300'}`}>{log.summary}</span>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500/70" />
                  <span>{log.timestamp}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
