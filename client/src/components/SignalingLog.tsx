import React, { useState } from 'react';
import { Terminal, Trash2, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
import type { SignalingLogEntry } from '../types';

interface SignalingLogProps {
  logs: SignalingLogEntry[];
  onClear: () => void;
}

export const SignalingLog: React.FC<SignalingLogProps> = ({ logs, onClear }) => {
  const [filter, setFilter] = useState<string>('all');

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    if (filter === 'offer') return log.type === 'webrtc:offer';
    if (filter === 'answer') return log.type === 'webrtc:answer';
    if (filter === 'ice') return log.type === 'webrtc:ice-candidate';
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
            <h2 className="text-lg font-bold text-white tracking-tight">WebRTC Signaling Inspector</h2>
            <p className="text-xs text-slate-400">
              Real-time audit: <code className="text-indigo-400 font-mono">webrtc:offer</code>, <code className="text-indigo-400 font-mono">webrtc:answer</code>, <code className="text-indigo-400 font-mono">webrtc:ice-candidate</code>
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
            <option value="offer">Offers Only</option>
            <option value="answer">Answers Only</option>
            <option value="ice">ICE Candidates Only</option>
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

      <div className="mt-3 bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 font-mono text-xs max-h-56 overflow-y-auto space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-6 text-slate-600">
            No signaling events logged yet. Connect two tabs and initiate a call to see live SDP/ICE packets.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isOut = log.direction === 'out';
            const isOffer = log.type === 'webrtc:offer';
            const isAnswer = log.type === 'webrtc:answer';
            const isIce = log.type === 'webrtc:ice-candidate';

            return (
              <div
                key={log.id}
                className="flex items-start justify-between gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors"
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
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {log.type}
                  </span>

                  <span className="text-slate-300 text-[11px]">{log.summary}</span>
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
