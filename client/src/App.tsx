import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AudioLines, ChevronDown, Headphones, LayoutDashboard, LocateFixed,
  MapPin, Mic, MicOff, Moon, PanelRightClose, PanelRightOpen, Radio, Settings2, ShieldCheck, Sun, Users, Volume2, Wifi,
} from 'lucide-react';
import { useMicrophone } from './hooks/useMicrophone';
import { useWebRTCAudio } from './hooks/useWebRTCAudio';
import { useDeviceLocation } from './hooks/useDeviceLocation';
import { AudioControls } from './components/AudioControls';
import { PeerList } from './components/PeerList';
import { SignalingLog } from './components/SignalingLog';
import { TeamMembersPage } from './components/TeamMembersPage';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { AuthPage } from './components/AuthPage';
import { AccountPage } from './components/AccountPage';
import { authRequest } from './services/authApi';
import type { AccountProfile } from './services/authApi';
import { computeSpatialAudio } from './services/spatialAudio';
import { deriveActiveDiscussions } from './services/workspacePresence';
import type { ActiveDiscussion, WorkspaceMember } from './services/workspacePresence';
import { socketService } from './services/socket';
import type { Position3D } from './types';

const OfficeScene3D = lazy(() => import('./components/OfficeScene3D'));

const hasControlCharacters = (value: string) => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
};

export const App: React.FC = () => {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activePage, setActivePage] = useState<'office' | 'team' | 'account'>('office');
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [idleWarning, setIdleWarning] = useState(false);
  const [idleSeconds, setIdleSeconds] = useState(120);
  const [sessionTimeoutMs, setSessionTimeoutMs] = useState(30 * 60_000);
  const [sessionWarningMs, setSessionWarningMs] = useState(28 * 60_000);
  const [lastActivityAt, setLastActivityAt] = useState(0);
  const activityRequestAt = useRef(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = window.localStorage.getItem('proxispeak.theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => window.matchMedia('(min-width: 1536px)').matches);
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = useState(() => window.matchMedia('(min-width: 1536px)').matches);
  const [isWorkspacePanelCollapsed, setIsWorkspacePanelCollapsed] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const location = useDeviceLocation();
  const locationOrigin = useRef<{ latitude: number; longitude: number } | null>(null);
  const [localPosition, setLocalPosition] = useState<Position3D>({ x: 500, y: 269, z: 0 });
  const manualPeerVolumes = useRef<Record<string, number>>({});
  const appliedSpatial = useRef<Record<string, { volume: number; pan: number }>>({});

  const {
    stream: localStream,
    status: micStatus,
    isMuted,
    isSpeaking,
    audioLevel,
    frequencyBands,
    permissionState,
    availableDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    availableOutputDevices,
    selectedOutputDeviceId,
    setSelectedOutputDeviceId,
    audioConstraints,
    toggleAudioConstraint,
    isSelfTesting,
    selfTestSecondsRemaining,
    testAudioUrl,
    startSelfTest,
    clearSelfTest,
    errorMessage: micError,
    startMicrophone,
    stopMicrophone,
    toggleMute,
  } = useMicrophone();

  const {
    localSocketId,
    isConnected,
    isRegistered,
    joinError,
    retryJoin,
    signalingLatencyMs,
    currentRoomId,
    peers,
    signalingLogs,
    clearLogs,
    startCall,
    closeCall,
    setPeerVolume,
    setPeerSpatial,
    updateLocalPosition,
    switchRoom,
    setAudioOutputDevice,
  } = useWebRTCAudio(localStream, isSpeaking, isMuted, localPosition, displayName, Boolean(displayName));

  useEffect(() => {
    let alive = true;
    const authError = new URLSearchParams(window.location.search).get('authError');
    if (authError) { setProviderError('Google sign-in was cancelled or could not be verified. Try another sign-in method.'); window.history.replaceState({}, '', window.location.pathname); }
    authRequest<{ user: AccountProfile; session: { idleMs: number; idleTimeoutMs?: number; warningMs?: number } }>('/me').then(({ user, session }) => {
      if (!alive) return; setAccount(user); setDisplayName(user.fullName); setLastActivityAt(Date.now() - session.idleMs); if (session.idleTimeoutMs) setSessionTimeoutMs(session.idleTimeoutMs); if (session.warningMs) setSessionWarningMs(session.warningMs);
    }).catch((error: unknown) => { if (alive) { setAccount(null); setDisplayName(''); setSessionExpired(error instanceof Error && error.message.toLowerCase().includes('expired')); } }).finally(() => { if (alive) setAuthLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('proxispeak-session');
    channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'signed-out') { socketService.disconnect(); setAccount(null); setDisplayName(''); setSessionExpired(false); }
      if (event.data?.type === 'signed-in' || event.data?.type === 'profile-updated') {
        void authRequest<{ user: AccountProfile }>('/me').then(({ user }) => { setAccount(user); setDisplayName(user.fullName); }).catch(() => undefined);
      }
    };
    return () => channel.close();
  }, []);

  useEffect(() => {
    if (!account) return;
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('proxispeak-session') : null;
    const signalActivity = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now(); setLastActivityAt(now); channel?.postMessage({ at: now });
      if (now - activityRequestAt.current < 45_000) return;
      activityRequestAt.current = now;
      authRequest('/activity', 'POST', { activity: true }).catch(() => {
        void authRequest('/me').catch(() => { setSessionExpired(true); setAccount(null); setDisplayName(''); });
      });
    };
    const receive = (event: MessageEvent<{ at?: number }>) => { if (typeof event.data?.at === 'number' && event.data.at > lastActivityAt) setLastActivityAt(event.data.at); };
    channel?.addEventListener('message', receive);
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, signalActivity, { passive: true }));
    const timer = window.setInterval(() => {
      const remaining = Math.ceil((lastActivityAt + sessionTimeoutMs - Date.now()) / 1000);
      if (remaining <= 0) { setSessionExpired(true); setAccount(null); setDisplayName(''); socketService.disconnect(); }
      else { setIdleSeconds(remaining); setIdleWarning(Date.now() - lastActivityAt >= sessionWarningMs); }
    }, 1000);
    return () => { window.clearInterval(timer); events.forEach(event => window.removeEventListener(event, signalActivity)); channel?.removeEventListener('message', receive); channel?.close(); };
  }, [account, lastActivityAt, sessionTimeoutMs, sessionWarningMs]);

  const peerList = Object.values(peers);
  const micIsActive = Boolean(localStream?.active);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1536px)');
    const onChange = (event: MediaQueryListEvent) => {
      setIsDesktopLayout(event.matches);
      setIsWorkspacePanelOpen(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('proxispeak.theme', theme);
  }, [theme]);

  const toggleWorkspacePanel = () => {
    if (isDesktopLayout) setIsWorkspacePanelCollapsed((collapsed) => !collapsed);
    else setIsWorkspacePanelOpen((open) => !open);
  };

  const liveMembers = useMemo<WorkspaceMember[]>(() => {
    const byId = new Map<string, WorkspaceMember>();
    if (isConnected && localSocketId) {
      byId.set(account?.id || localSocketId, {
        id: localSocketId,
        name: displayName,
        avatarUrl: account?.avatarUrl,
        isYou: true,
        speaking: isSpeaking && micIsActive && !isMuted,
        nearby: false,
        activity: !micIsActive ? 'Microphone off' : isMuted ? 'Microphone muted' : isSpeaking ? 'Voice activity' : 'Microphone ready',
      });
    }
    peerList.forEach((peer) => {
      const distance = peer.position
        ? Math.hypot(peer.position.x - localPosition.x, peer.position.y - localPosition.y, peer.position.z - localPosition.z)
        : Number.POSITIVE_INFINITY;
      if (peer.accountId === account?.id) return;
      const memberKey = peer.accountId || peer.peerId;
      if (byId.has(memberKey)) return;
      byId.set(memberKey, {
        id: peer.peerId,
        name: peer.username,
        avatarUrl: peer.avatarUrl,
        isYou: peer.peerId === localSocketId,
        speaking: Boolean(peer.isSpeaking),
        nearby: distance <= 260,
        activity: peer.connectionState === 'connected' ? 'Audio connected' : 'Online',
      });
    });
    return Array.from(byId.values());
  }, [account?.avatarUrl, account?.id, displayName, isConnected, isMuted, isSpeaking, localPosition, localSocketId, micIsActive, peerList]);
  const participantCount = liveMembers.length;

  const activeDiscussions = useMemo<ActiveDiscussion[]>(
    () => deriveActiveDiscussions(peerList, displayName, isSpeaking && micIsActive && !isMuted),
    [displayName, micIsActive, isMuted, isSpeaking, peerList],
  );
  const visibleSelectedMemberId = liveMembers.some((member) => member.id === selectedMemberId) ? selectedMemberId : null;
  const visibleSelectedDiscussionId = activeDiscussions.some((discussion) => discussion.id === selectedDiscussionId) ? selectedDiscussionId : null;

  const reportLocalPosition = useCallback((position: Position3D) => {
    setLocalPosition(position);
    updateLocalPosition(position);
  }, [updateLocalPosition]);

  const saveDisplayName = useCallback((name: string) => {
    const cleaned = name.trim();
    if (!cleaned || cleaned.length > 32 || hasControlCharacters(cleaned)) return;
    void authRequest<{ user: AccountProfile }>('/profile', 'PATCH', { fullName: cleaned }).then(({ user }) => {
      setAccount(user); setDisplayName(user.fullName);
    }).catch(() => undefined);
  }, []);

  const finishAuthentication = useCallback((user: AccountProfile) => { setAccount(user); setDisplayName(user.fullName); setLastActivityAt(Date.now()); setSessionExpired(false); if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('proxispeak-session'); channel.postMessage({ type: 'signed-in' }); channel.close(); } }, []);
  const signOut = useCallback(async () => {
    try { await authRequest('/logout', 'POST', {}); } finally { socketService.disconnect(); setAccount(null); setDisplayName(''); setSessionExpired(false); setActivePage('office'); if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('proxispeak-session'); channel.postMessage({ type: 'signed-out' }); channel.close(); } }
  }, []);
  const saveAccountProfile = useCallback((user: AccountProfile) => { setAccount(user); setDisplayName(user.fullName); if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('proxispeak-session'); channel.postMessage({ type: 'profile-updated' }); channel.close(); } }, []);

  const setManualPeerVolume = useCallback((peerId: string, volume: number) => {
    manualPeerVolumes.current[peerId] = Math.max(0, Math.min(1, volume));
    setPeerVolume(peerId, volume);
  }, [setPeerVolume]);

  const peerControls = useMemo(() => Object.fromEntries(
    Object.entries(peers).map(([peerId, peer]) => [
      peerId,
      { ...peer, volume: manualPeerVolumes.current[peerId] ?? peer.volume },
    ]),
  ), [peers]);

  const handleSelectOutputDevice = (sinkId: string) => {
    setSelectedOutputDeviceId(sinkId);
    setAudioOutputDevice(sinkId);
  };

  useEffect(() => {
    if (!location.enabled || !location.coordinates) return;

    const { latitude, longitude } = location.coordinates;
    if (!locationOrigin.current) locationOrigin.current = { latitude, longitude };

    // Anchor the first fix at the office center, then map local GPS movement
    // to canvas meters while retaining the existing 1000 × 560 x/y/z contract.
    const origin = locationOrigin.current;
    const metersPerLatitudeDegree = 111_320;
    const eastMeters = (longitude - origin.longitude)
      * metersPerLatitudeDegree
      * Math.cos((origin.latitude * Math.PI) / 180);
    const northMeters = (latitude - origin.latitude) * metersPerLatitudeDegree;
    const x = Math.max(0.08, Math.min(0.92, 0.5 + (eastMeters * 2) / 1000));
    const y = Math.max(0.12, Math.min(0.88, 0.48 - (northMeters * 2) / 560));
    reportLocalPosition({ x: Math.round(x * 1000), y: Math.round(y * 560), z: 0 });
  }, [location.coordinates, location.enabled, reportLocalPosition]);

  useEffect(() => {
    const activeIds = new Set<string>();
    peerList.forEach((peer) => {
      if (!peer.position || peer.connectionState !== 'connected') return;
      activeIds.add(peer.peerId);
      manualPeerVolumes.current[peer.peerId] ??= peer.volume;

      // Use the project's established distance/falloff/pan rules and the
      // existing Web Audio graph exposed by useWebRTCAudio.
      const spatial = computeSpatialAudio(localPosition, 0, peer.position);
      const volume = spatial.volume * manualPeerVolumes.current[peer.peerId];
      const previous = appliedSpatial.current[peer.peerId];
      if (!previous || Math.abs(previous.volume - volume) > 0.01 || Math.abs(previous.pan - spatial.pan) > 0.01) {
        appliedSpatial.current[peer.peerId] = { volume, pan: spatial.pan };
        setPeerSpatial(peer.peerId, volume, spatial.pan);
      }
    });

    Object.keys(appliedSpatial.current).forEach((peerId) => {
      if (!activeIds.has(peerId)) delete appliedSpatial.current[peerId];
    });
  }, [localPosition, peerList, setPeerSpatial]);

  const toggleLocationSharing = () => {
    locationOrigin.current = null;
    if (location.enabled) location.stop();
    else location.start();
  };

  // Muting changes the hook status to `muted` while the stream remains live.
  const connectionLabel = isConnected ? 'Connected' : 'Disconnected';
  const micLabel = micStatus === 'requesting'
    ? 'Requesting access'
    : micStatus === 'denied'
      ? 'Permission denied'
      : micStatus === 'error'
        ? 'Needs attention'
        : !micIsActive
          ? 'Microphone off'
          : isMuted
            ? 'Muted'
            : 'Microphone on';

  if (authLoading) return <main className="app-shell flex min-h-screen items-center justify-center text-sm text-[#887665]" data-theme={theme}><Activity className="mr-2 animate-pulse" size={17} />Checking your ProxiSpeak session…</main>;
  if (!account) return <AuthPage theme={theme} onTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} onAuthenticated={finishAuthentication} expired={sessionExpired} providerError={providerError} />;
  if (!isRegistered) return <main className="app-shell flex min-h-screen items-center justify-center px-5 py-10 text-[#352820]" data-theme={theme}><section className="welcome-card w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-xl">{joinError ? <><h1 className="text-xl font-semibold">Could not join the office</h1><p role="alert" className="my-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{joinError}</p><button className="w-full rounded-xl bg-[#bd674b] px-4 py-3 font-semibold text-white" onClick={retryJoin}>Retry connection</button><button className="mt-3 text-sm underline" onClick={() => { void signOut(); }}>Sign out</button></> : <><Activity className="mx-auto mb-3 animate-pulse text-[#bd674b]" size={24} /><h1 className="text-xl font-semibold">Joining ProxiSpeak…</h1><p className="mt-2 text-sm text-[#887665]">Connecting your account to the virtual office.</p></>}</section></main>;

  return (
    <div className="app-shell min-h-screen bg-[#f4eee4] text-[#352820]" data-theme={theme}>
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-48 h-96 w-96 rounded-full bg-indigo-600/[0.08] blur-3xl" />
        <div className="absolute -right-48 top-64 h-96 w-96 rounded-full bg-violet-600/[0.06] blur-3xl" />
      </div>

      <div className="relative min-h-screen">
        {/* Top navigation */}
        <header className="app-header sticky top-0 z-40 border-b border-white/[0.07] bg-[#080b14]/90 backdrop-blur-2xl">
          <div className="mx-auto flex h-[72px] max-w-[1800px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#c96e51] to-[#a94e37] text-white shadow-lg shadow-orange-950/15">
                <Headphones size={21} />
              </div>

              <div>
                <h1 className="text-base font-bold tracking-tight">
                  ProxiSpeak
                </h1>
                <p className="text-[11px] text-slate-500">
                  A little room to think together
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2 sm:px-3">
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-emerald-600' : 'bg-rose-500'
                }`}
              />
              <span className="text-xs text-slate-300">
                {connectionLabel}
              </span>

              {signalingLatencyMs !== null && (
                <>
                  <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
                  <Activity size={13} className="hidden text-emerald-400 sm:block" />
                  <span className="hidden font-mono text-xs text-slate-400 sm:inline">
                    {signalingLatencyMs} ms
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="workspace-header-button"
                onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              {activePage === 'office' && <button
                type="button"
                className="workspace-header-button"
                onClick={toggleWorkspacePanel}
                aria-label={isDesktopLayout ? (isWorkspacePanelCollapsed ? 'Expand workspace panel' : 'Collapse workspace panel') : (isWorkspacePanelOpen ? 'Close workspace panel' : 'Open workspace panel')}
                aria-expanded={isDesktopLayout ? !isWorkspacePanelCollapsed : isWorkspacePanelOpen}
                title="Workspace members and discussions"
              >
                {isDesktopLayout && !isWorkspacePanelCollapsed ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
              </button>}
              <div className="hidden text-right sm:block">
                <p className="max-w-36 truncate text-xs font-medium text-slate-200">{displayName}</p>
                <p className="text-[11px] text-slate-500">Team member</p>
              </div>

              <button type="button" onClick={() => setActivePage('account')} aria-label="Open account profile" title="Account profile" className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-orange-300 bg-orange-100 text-sm font-bold text-orange-900">
                {account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" /> : displayName.slice(0, 1).toUpperCase()}
              </button>
            </div>
          </div>
        </header>

        <div className={`app-layout mx-auto grid max-w-[1800px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] ${activePage !== 'office' ? '2xl:grid-cols-[220px_minmax(0,1fr)]' : isWorkspacePanelCollapsed ? '2xl:grid-cols-[220px_minmax(0,1fr)_60px]' : '2xl:grid-cols-[220px_minmax(0,1fr)_320px]'}`}>
          <nav aria-label="Workspace pages" className="flex gap-2 border-b border-[#8c62451c] bg-[#f8f1e8]/90 px-4 py-3 lg:hidden">
            <button type="button" onClick={() => setActivePage('office')} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${activePage === 'office' ? 'bg-[#c96e5115] text-[#a7533b]' : 'text-[#887665]'}`}><LayoutDashboard size={15} />Office</button>
            <button type="button" onClick={() => setActivePage('team')} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${activePage === 'team' ? 'bg-[#c96e5115] text-[#a7533b]' : 'text-[#887665]'}`}><Users size={15} />Team members <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px]">{participantCount}</span></button><button type="button" onClick={() => setActivePage('account')} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${activePage === 'account' ? 'bg-[#c96e5115] text-[#a7533b]' : 'text-[#887665]'}`}><ShieldCheck size={15} />Profile</button>
          </nav>
          {/* Sidebar */}
          <aside className="app-sidebar hidden border-r border-white/[0.06] px-4 py-7 lg:block">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
              Workspace
            </p>

            <div className="space-y-1">
              <button type="button" onClick={() => setActivePage('office')} aria-current={activePage === 'office' ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${activePage === 'office' ? 'border border-[#bf73541f] bg-[#c96e5115] text-[#a7533b]' : 'text-[#887665] hover:bg-white/50 hover:text-[#574538]'}`}>
                <LayoutDashboard size={17} />
                Virtual office
              </button>

              <button type="button" onClick={() => setActivePage('team')} aria-current={activePage === 'team' ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${activePage === 'team' ? 'border border-[#bf73541f] bg-[#c96e5115] font-medium text-[#a7533b]' : 'text-[#887665] hover:bg-white/50 hover:text-[#574538]'}`}>
                <Users size={17} />
                Team members
                <span className="ml-auto rounded-md bg-white/70 px-2 py-0.5 text-[10px]">
                  {participantCount}
                </span>
              </button>
              <button type="button" onClick={() => setActivePage('account')} aria-current={activePage === 'account' ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${activePage === 'account' ? 'border border-[#bf73541f] bg-[#c96e5115] font-medium text-[#a7533b]' : 'text-[#887665] hover:bg-white/50 hover:text-[#574538]'}`}><ShieldCheck size={17} />My profile</button>

              <button
                type="button"
                onClick={() => { setActivePage('office'); setShowDiagnostics(!showDiagnostics); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[#887665] transition hover:bg-white/50 hover:text-[#574538]"
              >
                <Settings2 size={17} />
                Diagnostics
              </button>
            </div>

            <div className="my-7 border-t border-white/[0.06]" />

            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
              Current room
            </p>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span className="text-xs font-semibold text-slate-200">
                  {currentRoomId}
                </span>
              </div>
              <p className="text-[11px] leading-5 text-slate-500">
                Your current voice workspace.
              </p>
            </div>

            <div className="mt-7 rounded-xl border border-white/[0.06] bg-gradient-to-br from-indigo-500/[0.08] to-transparent p-3">
              <ShieldCheck size={17} className="mb-2 text-indigo-300" />
              <p className="text-xs font-semibold text-slate-300">
                Voice controls
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Manage your microphone and audio devices from this workspace.
              </p>
            </div>
          </aside>

          {/* Main workspace */}
          <main className="app-main min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {activePage === 'team' ? <TeamMembersPage isConnected={isConnected} localUserId={account.id} displayName={displayName} onSaveDisplayName={saveDisplayName} /> : activePage === 'account' ? <AccountPage profile={account} onProfile={saveAccountProfile} onLogout={() => { void signOut(); }} /> : <>
            {/* Page heading */}
            <section className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
                  <AudioLines size={15} />
                  Your shared workspace
                </div>

                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Work better,{' '}
                  <span className="bg-gradient-to-r from-[#c96e51] to-[#a94e37] bg-clip-text text-transparent">
                    together.
                  </span>
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                  Move around your virtual office. Your position is the
                  foundation for natural, proximity-based conversations.
                </p>
                {!isDesktopLayout && (
                  <button type="button" className="workspace-panel-toggle mt-4" onClick={toggleWorkspacePanel} aria-expanded={isWorkspacePanelOpen}>
                    <Users size={16} /> {isWorkspacePanelOpen ? 'Close team panel' : `Team workspace · ${liveMembers.length} online`}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-[#a7533b]">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{peerList.length}</p>
                    <p className="text-[11px] text-slate-500">Connected peers</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                    <Wifi size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {isConnected ? 'Online' : 'Offline'}
                    </p>
                    <p className="text-[11px] text-slate-500">Server connection</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Office and voice panel */}
            <section className="workspace-grid grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:gap-6">
              {/* Office */}
              <div className="glass-card office-card min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c111e] shadow-2xl shadow-black/10">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-[#a7533b]">
                      <MapPin size={19} />
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold">Virtual office</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Walk with WASD / arrows · drag to orbit
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-[11px] font-medium text-slate-300">
                      {isConnected ? 'Live room' : 'Preview room'}
                    </span>
                  </div>
                </div>

                <div className="p-2 sm:p-3">
                    <Suspense fallback={<div className="office-scene-viewport scene-fallback" role="status"><strong>Loading interactive office…</strong><span>Preparing the studio for your team.</span></div>}>
                      <OfficeScene3D
                        position={localPosition}
                        displayName={displayName}
                        avatarUrl={account.avatarUrl}
                        onMove={reportLocalPosition}
                        peers={peerList}
                        isLocationTracking={location.enabled}
                        theme={theme}
                        selectedParticipantId={visibleSelectedMemberId === localSocketId ? null : visibleSelectedMemberId}
                        onSelectParticipant={setSelectedMemberId}
                      />
                    </Suspense>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#bd674b]" />
                      You
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#78936e]" />
                      Connected teammates
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleLocationSharing}
                      aria-pressed={location.enabled}
                      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${location.enabled ? 'border border-[#a7533b]/25 bg-[#a7533b]/10 text-[#8d402d] hover:bg-[#a7533b]/15' : 'bg-[#a7533b] text-white shadow-md shadow-orange-950/15 hover:bg-[#98452f]'}`}
                    >
                      <LocateFixed size={15} />
                      {location.enabled ? 'Stop sharing' : 'Share my location'}
                    </button>
                    <span role="status" aria-live="polite" className={`text-[11px] ${location.error ? 'text-rose-700' : 'text-slate-500'}`}>
                      {location.error ?? (location.coordinates ? `Following device · ±${Math.round(location.coordinates.accuracy)} m` : location.enabled ? 'Waiting for location permission…' : 'Location sharing is off')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Audio and people */}
              <aside className="space-y-5">
                {/* Microphone card */}
                <section className="glass-card rounded-2xl border border-white/[0.08] bg-[#0c111e] p-5">
                  <div className="mb-5 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Volume2 size={16} className="text-indigo-300" />
                        <h3 className="text-sm font-semibold">Your audio</h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Microphone and voice activity
                      </p>
                    </div>

                    <span className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${micIsActive && !isMuted ? 'bg-emerald-500/10 text-emerald-300' : micIsActive && isMuted ? 'bg-amber-500/10 text-amber-300' : micStatus === 'error' || micStatus === 'denied' ? 'bg-rose-500/10 text-rose-300' : 'bg-white/[0.05] text-slate-400'}`}>
                      {micLabel}
                    </span>
                  </div>

                  <div className="mb-4 rounded-xl border border-white/[0.05] bg-black/20 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Input level</span>
                      <span className="font-mono text-xs text-slate-400">
                        {Math.round(Math.min(100, Math.max(0, audioLevel)))}%
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-100"
                        style={{
                          width: `${Math.min(100, Math.max(0, audioLevel))}%`,
                        }}
                      />
                    </div>

                    <p className="mt-3 text-[11px] text-slate-500">
                      {!micIsActive
                        ? 'Start your mic to check input'
                        : isMuted
                          ? 'Input paused while muted'
                          : isSpeaking
                            ? 'Voice activity detected'
                            : 'Waiting for voice activity'}
                    </p>
                  </div>

                  {micError && (
                    <p role="alert" className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2 text-xs leading-5 text-rose-200">
                      {micError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (micIsActive) toggleMute();
                      else void startMicrophone();
                    }}
                    disabled={micStatus === 'requesting'}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isMuted
                        ? 'border border-rose-400/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15'
                        : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/10 hover:bg-indigo-400'
                    }`}
                  >
                    {micIsActive && !isMuted ? <MicOff size={17} /> : <Mic size={17} />}
                    {micStatus === 'requesting'
                      ? 'Requesting microphone…'
                      : !micIsActive
                        ? 'Start microphone'
                        : isMuted
                          ? 'Unmute microphone'
                          : 'Mute microphone'}
                  </button>

                  <p className="mt-3 text-center text-[11px] text-slate-600">
                    {micIsActive ? 'Use Audio settings to stop the microphone or change devices.' : 'Your microphone stays off until you start it.'}
                  </p>
                </section>

                {/* Participants */}
                <section className="glass-card rounded-2xl border border-white/[0.08] bg-[#0c111e] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-indigo-300" />
                        <h3 className="text-sm font-semibold">In this room</h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Real people connected to this room
                      </p>
                    </div>

                    <span className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300">
                      {participantCount}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-bold text-indigo-200">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{displayName} <span className="text-[10px] text-slate-500">(you)</span></p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {micIsActive
                          ? isMuted
                            ? 'Microphone muted'
                            : isSpeaking
                              ? 'Speaking'
                              : 'Microphone ready'
                          : 'Microphone idle'}
                      </p>
                    </div>

                    <span
                      className={`h-2 w-2 rounded-full ${
                        isConnected ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                  </div>

                  {peerList.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {peerList.map((peer) => (
                        <div
                          key={peer.peerId}
                          className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-300">
                            {peer.username.slice(0, 1).toUpperCase()}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {peer.username}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {peer.connectionState}
                            </p>
                          </div>

                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center">
                      <Radio size={20} className="mx-auto mb-2 text-slate-600" />
                      <p className="text-xs font-medium text-slate-400">
                        Just you for now
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-600">
                        Connect another browser session to see real participants here.
                      </p>
                    </div>
                  )}
                </section>
              </aside>
            </section>

            {/* Advanced settings */}
            <section className="glass-card mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c111e]">
              <button
                type="button"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                aria-expanded={showDiagnostics}
                className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/[0.02] sm:px-6"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-slate-300">
                    <Settings2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">
                      Audio settings & diagnostics
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Devices, peer management and signaling logs
                    </p>
                  </div>
                </div>

                <ChevronDown
                  size={18}
                  className={`shrink-0 text-slate-500 transition-transform ${
                    showDiagnostics ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showDiagnostics && (
                <div className="space-y-6 border-t border-white/[0.06] p-4 sm:p-6">
                  <AudioControls
                    status={micStatus}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                    audioLevel={audioLevel}
                    frequencyBands={frequencyBands}
                    permissionState={permissionState}
                    availableDevices={availableDevices}
                    selectedDeviceId={selectedDeviceId}
                    onSelectDevice={setSelectedDeviceId}
                    availableOutputDevices={availableOutputDevices}
                    selectedOutputDeviceId={selectedOutputDeviceId}
                    onSelectOutputDevice={handleSelectOutputDevice}
                    audioConstraints={audioConstraints}
                    onToggleAudioConstraint={toggleAudioConstraint}
                    isSelfTesting={isSelfTesting}
                    selfTestSecondsRemaining={selfTestSecondsRemaining}
                    testAudioUrl={testAudioUrl}
                    onStartSelfTest={startSelfTest}
                    onClearSelfTest={clearSelfTest}
                    errorMessage={micError}
                    onStart={startMicrophone}
                    onStop={stopMicrophone}
                    onToggleMute={toggleMute}
                  />

                  <div className="border-t border-white/[0.06] pt-6">
                    <PeerList
                      peers={peerControls}
                      localSocketId={localSocketId}
                      currentRoomId={currentRoomId}
                      isMicActive={micIsActive}
                      onStartCall={startCall}
                      onCloseCall={closeCall}
                      onSetVolume={setManualPeerVolume}
                      onSwitchRoom={switchRoom}
                    />
                  </div>

                  <div className="border-t border-white/[0.06] pt-6">
                    <SignalingLog
                      logs={signalingLogs}
                      signalingLatencyMs={signalingLatencyMs}
                      onClear={clearLogs}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Footer */}
            <footer className="flex flex-col justify-between gap-3 py-7 text-[11px] text-slate-600 sm:flex-row sm:items-center">
              <p>
                ProxiSpeak <span className="px-1.5 text-slate-700">/</span>
                Geospatial Proximity Audio Ecosystem
              </p>

              <div className="flex items-center gap-2">
                <ShieldCheck size={13} />
                <span>Spatial voice workspace</span>
              </div>
            </footer>
            </>}
          </main>
          {activePage === 'office' && (isDesktopLayout || isWorkspacePanelOpen) && (
            <>
              {!isDesktopLayout && <button type="button" className="workspace-panel-backdrop" onClick={() => setIsWorkspacePanelOpen(false)} aria-label="Close workspace panel" />}
              <div className={`workspace-sidebar-host ${isWorkspacePanelCollapsed ? 'is-collapsed' : ''}`}>
                <WorkspaceSidebar
                  members={liveMembers}
                  discussions={activeDiscussions}
                  selectedMemberId={visibleSelectedMemberId}
                  selectedDiscussionId={visibleSelectedDiscussionId}
                  onSelectMember={(id) => { setSelectedMemberId(id); setSelectedDiscussionId(null); if (!isDesktopLayout) setIsWorkspacePanelOpen(false); }}
                  onSelectDiscussion={(discussionId, memberId) => { setSelectedDiscussionId(discussionId); setSelectedMemberId(memberId); if (!isDesktopLayout) setIsWorkspacePanelOpen(false); }}
                  collapsed={isDesktopLayout && isWorkspacePanelCollapsed}
                  onToggleCollapsed={toggleWorkspacePanel}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {idleWarning && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-5" role="presentation"><section className="w-full max-w-md rounded-2xl border border-[#8c62451c] bg-[#fffaf2] p-6 text-[#352820] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="idle-title"><h2 id="idle-title" className="text-xl font-semibold">Still there?</h2><p className="mt-2 text-sm leading-6 text-[#887665]">Your session will expire in {Math.floor(idleSeconds / 60)}:{String(idleSeconds % 60).padStart(2, '0')} unless you continue.</p><div className="mt-5 flex justify-end gap-3"><button type="button" className="auth-secondary w-auto" onClick={() => { void signOut(); }}>Sign out</button><button type="button" className="rounded-xl bg-[#bd674b] px-4 py-2.5 text-sm font-semibold text-white" onClick={() => { setLastActivityAt(Date.now()); setIdleWarning(false); void authRequest('/activity', 'POST', { activity: true }).catch(() => { setSessionExpired(true); setAccount(null); setDisplayName(''); }); }}>Continue session</button></div></section></div>}
    </div>
  );
};

export default App;
