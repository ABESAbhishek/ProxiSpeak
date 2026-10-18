import { useEffect, useState } from 'react';
import { Activity, Clock3, MapPin, Mic, MicOff, RefreshCw, Users, Wifi } from 'lucide-react';

type TeamMember = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  status: 'active' | 'previous';
  roomId: string;
  summary: string;
  lastSeenAt: string;
  joinedAt: string;
  isMuted: boolean;
  isSpeaking: boolean;
  sessionCount?: number;
};

type TeamResponse = {
  active: TeamMember[];
  previous: TeamMember[];
  persistence: 'mongo' | 'memory';
};

const SERVER_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`;

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

function MemberCard({ member, active, isYou = false }: { member: TeamMember; active: boolean; isYou?: boolean }) {
  return (
    <article className="rounded-2xl border border-[#8c62451c] bg-white/65 p-5 shadow-[0_12px_32px_rgba(94,64,44,0.06)]">
      <div className="flex items-start gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-[#efe3d5] text-[#76563f]'}`}>
          {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : initials(member.displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[#352820]">{member.displayName}</h3>
            {isYou && <span className="rounded-md bg-[#f2e4d7] px-2 py-0.5 text-[10px] font-medium text-[#8e563d]">You</span>}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-stone-400'}`} />
              {active ? 'Active now' : 'Previously active'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#887665]">
            <span className="inline-flex items-center gap-1"><MapPin size={12} />{member.roomId}</span>
            {(member.sessionCount ?? 1) > 1 && <span>{member.sessionCount} active sessions</span>}
            {active && <span className="inline-flex items-center gap-1">{member.isMuted ? <MicOff size={12} /> : <Mic size={12} />}{member.isMuted ? 'Mic muted' : member.isSpeaking ? 'Speaking' : 'Mic on'}</span>}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-[#f6efe7] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a16a4e]">Recent activity</p>
        <p className="mt-1.5 text-sm leading-5 text-[#574538]">{member.summary}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-[#9a8878]">
        <span className="inline-flex items-center gap-1.5"><Clock3 size={12} />{active ? 'Joined' : 'Last seen'} {formatTime(active ? member.joinedAt : member.lastSeenAt)}</span>
        {active && member.isSpeaking && <span className="inline-flex items-center gap-1 text-emerald-700"><Activity size={12} />Voice activity</span>}
      </div>
    </article>
  );
}

export function TeamMembersPage({ isConnected, localUserId, displayName, onSaveDisplayName }: {
  isConnected: boolean;
  localUserId: string | null;
  displayName: string;
  onSaveDisplayName: (name: string) => void;
}) {
  const [team, setTeam] = useState<TeamResponse>({ active: [], previous: [], persistence: 'memory' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nameDraft, setNameDraft] = useState(displayName);

  useEffect(() => setNameDraft(displayName), [displayName]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/api/team`, { signal: controller.signal, credentials: 'include' });
        if (!response.ok) throw new Error(`Team activity request failed (${response.status}).`);
        const data = await response.json() as TeamResponse;
        if (disposed) return;
        setTeam(data);
        setError(null);
        setLastUpdated(new Date());
      } catch (cause) {
        if (disposed || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setError(cause instanceof Error ? cause.message : 'Could not load team activity.');
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [isConnected]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="flex flex-col justify-between gap-5 rounded-3xl border border-[#8c62451c] bg-white/55 p-6 shadow-[0_18px_46px_rgba(95,63,40,0.07)] sm:p-8 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#b45c41]"><Users size={15} />Team directory</div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#352820] sm:text-4xl">People &amp; activity</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#806f60]">See who is in the office, who was here recently, and a short summary of their latest ProxiSpeak activity.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-[#8c624522] bg-[#fffaf4] px-3.5 py-2.5 text-xs text-[#765b47] lg:self-auto">
          <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          {isConnected ? 'Live presence connected' : 'Live presence disconnected'}
        </div>
      </section>

      <form className="flex flex-col gap-3 rounded-2xl border border-[#8c62451c] bg-white/65 p-5 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); onSaveDisplayName(nameDraft); }}>
        <label className="flex-1 text-xs font-semibold text-[#765b47]">Your team name
          <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={32} required className="mt-2 block w-full rounded-xl border border-[#8c624533] bg-[#fffaf4] px-3 py-2.5 text-sm font-normal text-[#352820] outline-none focus:border-[#bd674b]" placeholder="Enter your name" />
        </label>
        <button type="submit" className="rounded-xl bg-[#b85e43] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#a64f38]">Save name</button>
      </form>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#8c62451c] bg-white/65 p-5"><p className="text-xs text-[#927e6c]">Active now</p><p className="mt-2 text-3xl font-semibold text-[#352820]">{team.active.length}</p><p className="mt-1 text-[11px] text-[#9a8878]">Connected team members</p></div>
        <div className="rounded-2xl border border-[#8c62451c] bg-white/65 p-5"><p className="text-xs text-[#927e6c]">Recently active</p><p className="mt-2 text-3xl font-semibold text-[#352820]">{team.previous.length}</p><p className="mt-1 text-[11px] text-[#9a8878]">Previous sessions available</p></div>
        <div className="rounded-2xl border border-[#8c62451c] bg-white/65 p-5"><p className="text-xs text-[#927e6c]">Activity history</p><p className="mt-2 flex items-center gap-2 text-lg font-semibold text-[#352820]"><Wifi size={17} className={team.persistence === 'mongo' ? 'text-emerald-700' : 'text-amber-700'} />{team.persistence === 'mongo' ? 'Saved across restarts' : 'Current server session'}</p><p className="mt-1 text-[11px] text-[#9a8878]">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting for the first refresh'}</p></div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error} Make sure the backend is running and reachable.</div>}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a16a4e]">Right now</p><h2 className="mt-1 text-xl font-semibold text-[#352820]">Currently active</h2></div>
          <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">{team.active.length} online</span>
        </div>
        {loading && team.active.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl border border-[#8c62451c] bg-white/55 p-6 text-sm text-[#887665]"><RefreshCw size={15} className="animate-spin" />Loading current team…</div>
        ) : team.active.length ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{team.active.map((member) => <MemberCard key={member.id} member={member} active isYou={member.id === localUserId} />)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#8c624544] bg-white/35 p-8 text-center text-sm text-[#887665]">No active members are currently connected.</div>
        )}
      </section>

      <section className="space-y-4 pb-5">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a16a4e]">Session history</p><h2 className="mt-1 text-xl font-semibold text-[#352820]">Previously active</h2></div>
          <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">Most recent first</span>
        </div>
        {team.previous.length ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{team.previous.map((member) => <MemberCard key={member.id} member={member} active={false} />)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#8c624544] bg-white/35 p-8 text-center text-sm text-[#887665]">{loading ? 'Checking session history…' : 'Previous sessions will appear here after a teammate disconnects.'}</div>
        )}
      </section>

      <p className="pb-4 text-[11px] leading-5 text-[#9a8878]">Summaries reflect recorded app activity (joining, moving in the office, and microphone state); they do not infer work outside ProxiSpeak.</p>
    </div>
  );
}
