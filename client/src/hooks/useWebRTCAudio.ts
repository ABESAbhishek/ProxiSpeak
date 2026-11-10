
import { useState, useEffect, useRef, useCallback } from 'react';
import { socket, socketService } from '../services/socket';
import { WebRTCManager } from '../services/webrtcManager';
import { evaluateOccludedSpatialAudio, detectAcousticZone, areZonesOccluded } from '../services/spatialAudio';
import type {
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
  WebRTCConnectionState,
  RemotePeerAudio,
  PeerAudioStats,
  SignalingLogEntry,
  WorldStatePayload,
  UserProfile,
  UserLeftPayload,
  Position3D
} from '../types';

export interface UseWebRTCAudioResult {
  localSocketId: string | null;
  isConnected: boolean;
  isRegistered: boolean;
  joinError: string | null;
  retryJoin: () => void;
  signalingLatencyMs: number | null;
  currentRoomId: string;
  peers: Record<string, RemotePeerAudio>;
  signalingLogs: SignalingLogEntry[];
  clearLogs: () => void;
  startCall: (peerId: string) => Promise<void>;
  restartIce: (peerId: string) => Promise<boolean>;
  closeCall: (peerId: string) => void;
  setPeerVolume: (peerId: string, volume: number) => void;
  setPeerSpatial: (peerId: string, volume: number, pan?: number, cutoffHz?: number, smoothing?: number) => void;
  updateLocalPosition: (position: Position3D) => void;
  updateLocalHeading: (headingRad: number) => void;
  localHeadingRad: number;
  culledPeerCount: number;
  activeStreamCount: number;
  switchRoom: (roomId: string) => void;
  setAudioOutputDevice: (sinkId: string) => Promise<void>;
}

export function useWebRTCAudio(
  localStream: MediaStream | null,
  isSpeaking: boolean = false,
  isMuted: boolean = false,
  initialPosition: Position3D = { x: 500, y: 280, z: 0 },
  displayName = '',
  joinEnabled = false,
  initialHeadingRad: number = 0
): UseWebRTCAudioResult {
  const [localSocketId, setLocalSocketId] = useState<string | null>(
    socket.id || null
  );
  const [isConnected, setIsConnected] = useState<boolean>(socket.connected);
  const [isRegistered, setIsRegistered] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [currentRoomId, setCurrentRoomId] = useState<string>('global-space');
  const [signalingLatencyMs, setSignalingLatencyMs] = useState<number | null>(
    null
  );
  const [peers, setPeers] = useState<Record<string, RemotePeerAudio>>({});
  const [localPosition, setLocalPosition] =
    useState<Position3D>(initialPosition);
  const [localHeadingRad, setLocalHeadingRad] = useState<number>(initialHeadingRad);
  const [culledPeerCount, setCulledPeerCount] = useState<number>(0);
  const [activeStreamCount, setActiveStreamCount] = useState<number>(0);
  const [signalingLogs, setSignalingLogs] = useState<SignalingLogEntry[]>([]);

  const webrtcManagerRef = useRef<WebRTCManager | null>(null);
  const remotePeerIdsRef = useRef(new Set<string>());
  const initialPositionRef = useRef<Position3D>(initialPosition);
  const displayNameRef = useRef(displayName);
  const registeredRef = useRef(false);
  const currentRoomIdRef = useRef(currentRoomId);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  const retryJoin = useCallback(() => {
    setJoinError(null);
    registeredRef.current = false;
    setIsRegistered(false);

    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
    }

    if (socket.connected) {
      socket.disconnect();
    }

    setRetryNonce((value) => value + 1);
  }, []);

  const addLog = useCallback(
    (
      direction: 'in' | 'out',
      type: SignalingLogEntry['type'],
      summary: string,
      details?: unknown
    ) => {
      const entry: SignalingLogEntry = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        direction,
        type,
        summary,
        details
      };

      setSignalingLogs((prev) => [entry, ...prev.slice(0, 49)]);
    },
    []
  );

  const clearLogs = useCallback(() => {
    setSignalingLogs([]);
  }, []);

  // Initialize WebRTCManager once.
  useEffect(() => {
    const manager = new WebRTCManager({
      onSendOffer: (payload: WebRTCOfferPayload) => {
        socketService.sendOffer(payload);
      },

      onSendAnswer: (payload: WebRTCAnswerPayload) => {
        socketService.sendAnswer(payload);
      },

      onSendIceCandidate: (payload: WebRTCIceCandidatePayload) => {
        socketService.sendIceCandidate(payload);
      },

      onRemoteStream: (peerId: string, stream: MediaStream) => {
        setPeers((prev) => {
          const existing = prev[peerId];

          return {
            ...prev,
            [peerId]: {
              peerId,
              accountId: existing?.accountId,
              username: existing?.username || `Peer_${peerId.substring(0, 4)}`,
              stream,
              connectionState: existing?.connectionState || 'connecting',
              volume: existing?.volume ?? 1.0,
              pan: existing?.pan ?? 0,
              isMuted: existing?.isMuted ?? false,
              isSpeaking: existing?.isSpeaking ?? false,
              position: existing?.position,
              roomId: existing?.roomId
            }
          };
        });
      },

      onConnectionStateChange: (
        peerId: string,
        state: WebRTCConnectionState
      ) => {
        setPeers((prev) => {
          const existing = prev[peerId];
          if (!existing) return prev;

          return {
            ...prev,
            [peerId]: {
              ...existing,
              connectionState: state
            }
          };
        });
      },

      onPeerStats: (peerId: string, stats: PeerAudioStats) => {
        setPeers((prev) => {
          const existing = prev[peerId];
          if (!existing) return prev;

          return {
            ...prev,
            [peerId]: {
              ...existing,
              stats
            }
          };
        });
      },

      onLog: (direction, type, summary, details) => {
        addLog(direction, type, summary, details);
      }
    });

    webrtcManagerRef.current = manager;

    return () => {
      manager.destroy();
      webrtcManagerRef.current = null;
    };
  }, [addLog]);

  // Synchronize local microphone stream with WebRTC.
  useEffect(() => {
    webrtcManagerRef.current?.setLocalStream(localStream);
  }, [localStream]);

  // Synchronize socket events.
  useEffect(() => {
    const handleConnect = () => {
      const id = socket.id || null;

      setLocalSocketId(id);
      setIsConnected(true);
      setIsRegistered(false);
      registeredRef.current = false;
      setJoinError(null);

      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }

      if (id && webrtcManagerRef.current) {
        webrtcManagerRef.current.setLocalSocketId(id);
      }

      addLog(
        'in',
        'user:join',
        `Connected to signaling server with ID: ${id}`
      );

      socketService.join(
        {
          username: displayNameRef.current,
          position: initialPositionRef.current,
          roomId: currentRoomIdRef.current
        },
        (result) => {
          if (joinTimeoutRef.current) {
            clearTimeout(joinTimeoutRef.current);
          }

          if (result.ok) {
            setIsRegistered(true);
            registeredRef.current = true;
            setJoinError(null);

            if (result.userId && webrtcManagerRef.current) {
              webrtcManagerRef.current.setLocalSocketId(result.userId);
            }

            addLog(
              'in',
              'user:join',
              `Registered as ${displayNameRef.current} (${result.userId})`
            );
          } else {
            setJoinError(
              result.message || 'Unable to join the office. Please try again.'
            );
          }
        }
      );

      joinTimeoutRef.current = setTimeout(() => {
        if (!registeredRef.current) {
          setJoinError(
            'The server did not confirm your registration. Check the connection and retry.'
          );
        }
      }, 8000);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setIsRegistered(false);
      registeredRef.current = false;

      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }

      remotePeerIdsRef.current.forEach((peerId) => {
        webrtcManagerRef.current?.closePeer(peerId);
      });

      remotePeerIdsRef.current.clear();
      setPeers({});
      addLog('in', 'user:left', 'Disconnected from signaling server');
    };

    const handleConnectError = () => {
      setJoinError(
        'Could not connect to the office server. Check your connection and retry.'
      );
    };

    const handleWorldState = (payload: WorldStatePayload) => {
      addLog(
        'in',
        'user:join',
        `Received world state with ${Object.keys(payload.users || {}).length} users`
      );

      const currentId = socket.id;
      const localUser = currentId
        ? payload.users?.[currentId]
        : undefined;

      // Support servers that confirm registration through world:state.
      if (localUser?.username === displayNameRef.current) {
        registeredRef.current = true;
        setIsRegistered(true);
        setJoinError(null);

        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
        }
      }

      const remoteUsers = Object.values(payload.users || {}).filter(
        (user) => user.id !== currentId
      );

      const nextIds = new Set(remoteUsers.map((user) => user.id));

      remotePeerIdsRef.current.forEach((peerId) => {
        if (!nextIds.has(peerId)) {
          webrtcManagerRef.current?.closePeer(peerId);
        }
      });

      remotePeerIdsRef.current = nextIds;

      setPeers((prev) => {
        const next: Record<string, RemotePeerAudio> = {};

        remoteUsers.forEach((user: UserProfile) => {
          const existing = prev[user.id];

          next[user.id] = existing
            ? {
              ...existing,
              accountId: user.accountId ?? existing.accountId,
              username: user.username || existing.username,
              avatarUrl: user.avatarUrl ?? existing.avatarUrl,
              roomId: user.roomId ?? payload.roomId,
              position: user.position || existing.position,
              isMuted: user.isMuted ?? existing.isMuted,
              isSpeaking: user.isSpeaking ?? existing.isSpeaking
            }
            : {
              peerId: user.id,
              accountId: user.accountId,
              username: user.username,
              avatarUrl: user.avatarUrl,
              roomId: user.roomId ?? payload.roomId,
              stream: new MediaStream(),
              connectionState: 'new',
              volume: 1.0,
              isMuted: user.isMuted || false,
              isSpeaking: user.isSpeaking || false,
              position: user.position
            };
        });

        return next;
      });
    };

    const handleUserJoin = (user: UserProfile) => {
      if (user.id === socket.id) return;

      remotePeerIdsRef.current.add(user.id);
      addLog('in', 'user:join', `Peer joined: ${user.username} (${user.id})`);

      setPeers((prev) => {
        if (prev[user.id]) return prev;

        return {
          ...prev,
          [user.id]: {
            peerId: user.id,
            accountId: user.accountId,
            username: user.username,
            avatarUrl: user.avatarUrl,
            roomId: user.roomId ?? currentRoomIdRef.current,
            stream: new MediaStream(),
            connectionState: 'new',
            volume: 1.0,
            isMuted: user.isMuted || false,
            isSpeaking: user.isSpeaking || false,
            position: user.position
          }
        };
      });
    };

    const handleUserLeft = (data: UserLeftPayload) => {
      remotePeerIdsRef.current.delete(data.userId);

      addLog('in', 'user:left', `Peer left: ${data.userId}`);

      webrtcManagerRef.current?.closePeer(data.userId);

      setPeers((prev) => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
    };

    const handleOffer = (payload: WebRTCOfferPayload) => {
      webrtcManagerRef.current?.handleOffer(payload);
    };

    const handleAnswer = (payload: WebRTCAnswerPayload) => {
      webrtcManagerRef.current?.handleAnswer(payload);
    };

    const handleIceCandidate = (payload: WebRTCIceCandidatePayload) => {
      webrtcManagerRef.current?.handleIceCandidate(payload);
    };

    const handlePong = (payload: { clientTimestamp: number }) => {
      const latency = Math.max(
        1,
        Date.now() - (payload.clientTimestamp || Date.now())
      );

      setSignalingLatencyMs(latency);
    };

    const handlePositionUpdate = (payload: {
      userId: string;
      position: Position3D;
      roomId?: string;
    }) => {
      setPeers((prev) => {
        const existing = prev[payload.userId];
        if (!existing) return prev;

        return {
          ...prev,
          [payload.userId]: {
            ...existing,
            position: payload.position
          }
        };
      });
    };

    const handleProfileUpdate = (payload: {
      userId: string;
      isMuted?: boolean;
      isSpeaking?: boolean;
      username?: string;
      avatarUrl?: string;
    }) => {
      setPeers((prev) => {
        const existing = prev[payload.userId];
        if (!existing) return prev;

        return {
          ...prev,
          [payload.userId]: {
            ...existing,
            isMuted:
              typeof payload.isMuted === 'boolean'
                ? payload.isMuted
                : existing.isMuted,
            isSpeaking:
              typeof payload.isSpeaking === 'boolean'
                ? payload.isSpeaking
                : existing.isSpeaking,
            username: payload.username || existing.username,
            avatarUrl: payload.avatarUrl ?? existing.avatarUrl
          }
        };
      });
    };

    const handleWebRTCError = (payload: {
      message: string;
      targetId?: string;
    }) => {
      addLog('in', 'webrtc:error', payload.message, payload);
      if (payload.targetId) {
        const targetId = payload.targetId;
        const peer = peers[targetId];
        if (peer && (peer.connectionState === 'failed' || peer.connectionState === 'disconnected')) {
          console.warn(`[WebRTC] Initiating ICE restart for peer ${targetId} following error notification`);
          void webrtcManagerRef.current?.restartIce(targetId);
        }
      }
    };

    const handleServerError = (payload: { message?: string }) => {
      if (!registeredRef.current) {
        setJoinError(
          payload.message || 'The server could not register your session.'
        );
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('world:state', handleWorldState);
    socket.on('user:join', handleUserJoin);
    socket.on('user:left', handleUserLeft);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);
    socket.on('signaling:pong', handlePong);
    socket.on('position:update', handlePositionUpdate);
    socket.on('user:update-profile', handleProfileUpdate);
    socket.on('webrtc:error', handleWebRTCError);
    socket.on('server:error', handleServerError);

    if (!joinEnabled) {
      if (socket.connected) socket.disconnect();
    } else if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('world:state', handleWorldState);
      socket.off('user:join', handleUserJoin);
      socket.off('user:left', handleUserLeft);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      socket.off('signaling:pong', handlePong);
      socket.off('position:update', handlePositionUpdate);
      socket.off('user:update-profile', handleProfileUpdate);
      socket.off('webrtc:error', handleWebRTCError);
      socket.off('server:error', handleServerError);

      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }
    };
  }, [addLog, joinEnabled, retryNonce]);

  // Synchronize mute and speaking state.
  useEffect(() => {
    if (isConnected) {
      socketService.updateProfile({ isMuted, isSpeaking });
    }
  }, [isConnected, isMuted, isSpeaking]);

  // Periodically measure signaling latency.
  useEffect(() => {
    if (!isConnected) return;

    socketService.ping();

    const interval = setInterval(() => {
      socketService.ping();
    }, 4000);

    return () => clearInterval(interval);
  }, [isConnected]);

  // Automatically calculate and apply each remote user's spatial audio
  // and manage WebRTC mesh spatial culling whenever positions change.
  useEffect(() => {
    const MAX_AUDIBLE_MESH_STREAMS = 6;
    const CULLING_DISTANCE_THRESHOLD = 285; // Distance to suspend audio decoding (with hysteresis)
    const CULLING_RECOVERY_THRESHOLD = 260; // Distance to resume audio decoding

    interface PeerSpatialCandidate {
      peerId: string;
      distance: number;
      isSpeaking: boolean;
      volume: number;
      pan: number;
      cutoffHz: number;
      wasCulled: boolean;
    }

    const candidates: PeerSpatialCandidate[] = [];

    Object.values(peers).forEach((peer) => {
      if (!peer.position) return;

      const peerZone = detectAcousticZone(peer.position);
      const localZone = detectAcousticZone(localPosition);
      const isOccluded = areZonesOccluded(localZone, peerZone);

      const spatial = evaluateOccludedSpatialAudio(
        localPosition,
        localHeadingRad,
        peer.position,
        {
          preset: localZone.preset,
          isDifferentRoom: isOccluded,
          wallCount: 1
        }
      );

      const volume = Math.max(0, Math.min(1, spatial.volume));
      const pan = Math.max(-1, Math.min(1, spatial.pan));
      const cutoffHz = spatial.cutoffFrequencyHz;
      const distance = spatial.distance;
      const wasCulled = Boolean(peer.isCulled);

      candidates.push({
        peerId: peer.peerId,
        distance,
        isSpeaking: Boolean(peer.isSpeaking),
        volume,
        pan,
        cutoffHz,
        wasCulled
      });
    });

    // 1. Identify candidates that must be culled due to distance / occlusion
    const outOfRangeSet = new Set<string>();
    candidates.forEach((cand) => {
      // Hysteresis: if already culled, require entering <= 260; if active, allow until > 285
      const isOutOfRange = cand.wasCulled
        ? cand.distance > CULLING_RECOVERY_THRESHOLD
        : cand.distance > CULLING_DISTANCE_THRESHOLD;

      if (isOutOfRange || cand.volume <= 0.0001) {
        outOfRangeSet.add(cand.peerId);
      }
    });

    // 2. For remaining audible candidates, apply mesh concurrency limit
    const inRangeCandidates = candidates.filter((c) => !outOfRangeSet.has(c.peerId));
    inRangeCandidates.sort((a, b) => {
      // Prioritize active speakers
      if (a.isSpeaking !== b.isSpeaking) {
        return a.isSpeaking ? -1 : 1;
      }
      // Then prioritize closer distance
      return a.distance - b.distance;
    });

    const activeSet = new Set<string>();
    inRangeCandidates.slice(0, MAX_AUDIBLE_MESH_STREAMS).forEach((c) => {
      activeSet.add(c.peerId);
    });

    const spatialUpdates: Record<
      string,
      {
        volume: number;
        pan: number;
        cutoffHz: number;
        isCulled: boolean;
        cullReason?: 'out-of-range' | 'mesh-limit' | 'occluded-silent';
      }
    > = {};

    let culledCount = 0;
    let activeCount = 0;

    // 3. Dispatch spatial audio parameters and track culling to WebRTCManager
    candidates.forEach((cand) => {
      const isCulled = !activeSet.has(cand.peerId);
      const cullReason = outOfRangeSet.has(cand.peerId)
        ? (cand.volume <= 0.0001 && cand.distance <= CULLING_RECOVERY_THRESHOLD ? 'occluded-silent' : 'out-of-range')
        : (isCulled ? 'mesh-limit' : undefined);

      if (isCulled) {
        culledCount++;
      } else {
        activeCount++;
      }

      spatialUpdates[cand.peerId] = {
        volume: isCulled ? 0 : cand.volume,
        pan: cand.pan,
        cutoffHz: cand.cutoffHz,
        isCulled,
        cullReason
      };

      webrtcManagerRef.current?.setPeerCulled(cand.peerId, isCulled);
      if (!isCulled) {
        webrtcManagerRef.current?.setPeerSpatial(
          cand.peerId,
          cand.volume,
          cand.pan,
          cand.cutoffHz
        );
      }
    });

    setCulledPeerCount(culledCount);
    setActiveStreamCount(activeCount);

    setPeers((previous) => {
      let changed = false;
      const next = { ...previous };

      Object.entries(spatialUpdates).forEach(([peerId, spatial]) => {
        const existing = previous[peerId];
        if (!existing) return;

        if (
          Math.abs((existing.volume ?? 1) - spatial.volume) > 0.01 ||
          Math.abs((existing.pan ?? 0) - spatial.pan) > 0.01 ||
          (spatial.cutoffHz && Math.abs((existing.cutoffFrequencyHz ?? 20000) - spatial.cutoffHz) > 50) ||
          existing.isCulled !== spatial.isCulled ||
          existing.cullReason !== spatial.cullReason
        ) {
          next[peerId] = {
            ...existing,
            volume: spatial.volume,
            pan: spatial.pan,
            cutoffFrequencyHz: spatial.cutoffHz ?? existing.cutoffFrequencyHz,
            isCulled: spatial.isCulled,
            cullReason: spatial.cullReason
          };

          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [peers, localPosition, localHeadingRad]);

  const startCall = useCallback(async (peerId: string) => {
    if (webrtcManagerRef.current) {
      await webrtcManagerRef.current.createOffer(peerId);
    }
  }, []);

  const restartIce = useCallback(async (peerId: string): Promise<boolean> => {
    if (webrtcManagerRef.current) {
      return await webrtcManagerRef.current.restartIce(peerId);
    }
    return false;
  }, []);

  const closeCall = useCallback((peerId: string) => {
    webrtcManagerRef.current?.closePeer(peerId);
  }, []);

  // Handle network reconnection recovery
  useEffect(() => {
    const handleOnline = () => {
      addLog('in', 'user:join', 'Network reconnected. Verifying peer connections...');
      Object.values(peers).forEach((peer) => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          addLog('out', 'webrtc:offer', `Auto-recovering disconnected peer ${peer.peerId}`);
          void webrtcManagerRef.current?.restartIce(peer.peerId);
        }
      });
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [addLog, peers]);

  const setPeerVolume = useCallback((peerId: string, volume: number) => {
    const safeVolume = Math.max(0, Math.min(1, volume));

    webrtcManagerRef.current?.setPeerVolume(peerId, safeVolume);

    setPeers((prev) => {
      const existing = prev[peerId];
      if (!existing) return prev;

      return {
        ...prev,
        [peerId]: {
          ...existing,
          volume: safeVolume
        }
      };
    });
  }, []);

  const setPeerSpatial = useCallback(
    (peerId: string, volume: number, pan: number = 0, cutoffHz?: number, smoothing?: number) => {
      const safeVolume = Math.max(0, Math.min(1, volume));
      const safePan = Math.max(-1, Math.min(1, pan));

      webrtcManagerRef.current?.setPeerSpatial(
        peerId,
        safeVolume,
        safePan,
        cutoffHz,
        smoothing
      );

      setPeers((prev) => {
        const existing = prev[peerId];
        if (!existing) return prev;

        return {
          ...prev,
          [peerId]: {
            ...existing,
            volume: safeVolume,
            pan: safePan,
            cutoffFrequencyHz: typeof cutoffHz === 'number' ? cutoffHz : existing.cutoffFrequencyHz
          }
        };
      });
    },
    []
  );

  const updateLocalHeading = useCallback((headingRad: number) => {
    setLocalHeadingRad(headingRad);
  }, []);

  const updateLocalPosition = useCallback(
    (position: Position3D) => {
      initialPositionRef.current = position;
      setLocalPosition(position);

      if (isConnected) {
        socketService.updatePosition(position);
      }
    },
    [isConnected]
  );

  const switchRoom = useCallback(
    (roomId: string) => {
      currentRoomIdRef.current = roomId;
      setCurrentRoomId(roomId);

      socketService.switchRoom(
        roomId,
        displayName,
        initialPositionRef.current
      );

      Object.keys(peers).forEach((peerId) => {
        webrtcManagerRef.current?.closePeer(peerId);
      });

      setPeers({});
      addLog('out', 'user:join', `Switched to room: '${roomId}'`);
    },
    [addLog, peers, displayName]
  );

  const setAudioOutputDevice = useCallback(async (sinkId: string) => {
    if (webrtcManagerRef.current) {
      await webrtcManagerRef.current.setAudioOutputDevice(sinkId);
    }
  }, []);

  return {
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
    restartIce,
    closeCall,
    setPeerVolume,
    setPeerSpatial,
    updateLocalPosition,
    updateLocalHeading,
    localHeadingRad,
    culledPeerCount,
    activeStreamCount,
    switchRoom,
    setAudioOutputDevice
  };
}
