import { useState, useEffect, useRef, useCallback } from 'react';
import { socket, socketService } from '../services/socket';
import { WebRTCManager } from '../services/webrtcManager';
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
  signalingLatencyMs: number | null;
  currentRoomId: string;
  peers: Record<string, RemotePeerAudio>;
  signalingLogs: SignalingLogEntry[];
  clearLogs: () => void;
  startCall: (peerId: string) => Promise<void>;
  closeCall: (peerId: string) => void;
  setPeerVolume: (peerId: string, volume: number) => void;
  setPeerSpatial: (peerId: string, volume: number, pan?: number) => void;
  updateLocalPosition: (position: Position3D) => void;
  switchRoom: (roomId: string) => void;
  setAudioOutputDevice: (sinkId: string) => Promise<void>;
}

export function useWebRTCAudio(
  localStream: MediaStream | null,
  isSpeaking: boolean = false,
  isMuted: boolean = false
): UseWebRTCAudioResult {
  const [localSocketId, setLocalSocketId] = useState<string | null>(socket.id || null);
  const [isConnected, setIsConnected] = useState<boolean>(socket.connected);
  const [currentRoomId, setCurrentRoomId] = useState<string>('global-space');
  const [signalingLatencyMs, setSignalingLatencyMs] = useState<number | null>(null);
  const [peers, setPeers] = useState<Record<string, RemotePeerAudio>>({});
  const [signalingLogs, setSignalingLogs] = useState<SignalingLogEntry[]>([]);

  const webrtcManagerRef = useRef<WebRTCManager | null>(null);

  const addLog = useCallback(
    (direction: 'in' | 'out', type: SignalingLogEntry['type'], summary: string, details?: unknown) => {
      const entry: SignalingLogEntry = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        direction,
        type,
        summary,
        details
      };
      setSignalingLogs((prev) => [entry, ...prev.slice(0, 49)]); // keep last 50 logs
    },
    []
  );

  const clearLogs = useCallback(() => {
    setSignalingLogs([]);
  }, []);

  // Initialize WebRTCManager once
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
              username: existing?.username || `Peer_${peerId.substring(0, 4)}`,
              stream,
              connectionState: existing?.connectionState || 'connecting',
              volume: existing?.volume ?? 1.0,
              pan: existing?.pan ?? 0,
              isMuted: false
            }
          };
        });
      },
      onConnectionStateChange: (peerId: string, state: WebRTCConnectionState) => {
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

  // Synchronize localStream updates with the WebRTCManager
  useEffect(() => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.setLocalStream(localStream);
    }
  }, [localStream]);

  // Synchronize socket events
  useEffect(() => {
    const handleConnect = () => {
      const id = socket.id || null;
      setLocalSocketId(id);
      setIsConnected(true);
      if (id && webrtcManagerRef.current) {
        webrtcManagerRef.current.setLocalSocketId(id);
      }
      addLog('in', 'user:join', `Connected to signaling server with ID: ${id}`);

      // Announce join
      socketService.join({
        username: `User_${id?.substring(0, 4) || 'Guest'}`
      });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      addLog('in', 'user:left', 'Disconnected from signaling server');
    };

    const handleWorldState = (payload: WorldStatePayload) => {
      addLog('in', 'world:state', `Received world state with ${Object.keys(payload.users || {}).length} users`);
      const currentId = socket.id;

      setPeers((prev) => {
        const next: Record<string, RemotePeerAudio> = { ...prev };
        Object.values(payload.users || {}).forEach((user: UserProfile) => {
          if (user.id !== currentId) {
            if (!next[user.id]) {
              next[user.id] = {
                peerId: user.id,
                username: user.username,
                stream: new MediaStream(),
                connectionState: 'new',
                volume: 1.0,
                isMuted: user.isMuted || false,
                isSpeaking: user.isSpeaking || false,
                position: user.position
              };
            } else {
              next[user.id] = {
                ...next[user.id],
                position: user.position || next[user.id].position,
                isMuted: user.isMuted ?? next[user.id].isMuted,
                isSpeaking: user.isSpeaking ?? next[user.id].isSpeaking
              };
            }
          }
        });
        return next;
      });
    };

    const handleUserJoin = (user: UserProfile) => {
      if (user.id === socket.id) return;
      addLog('in', 'user:join', `Peer joined: ${user.username} (${user.id})`);

      setPeers((prev) => {
        if (prev[user.id]) return prev;
        return {
          ...prev,
          [user.id]: {
            peerId: user.id,
            username: user.username,
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
      addLog('in', 'user:left', `Peer left: ${data.userId}`);
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.closePeer(data.userId);
      }
      setPeers((prev) => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
    };

    // The 3 exact WebRTC events:
    // 1. "webrtc:offer"
    const handleOffer = (payload: WebRTCOfferPayload) => {
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.handleOffer(payload);
      }
    };

    // 2. "webrtc:answer"
    const handleAnswer = (payload: WebRTCAnswerPayload) => {
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.handleAnswer(payload);
      }
    };

    // 3. "webrtc:ice-candidate"
    const handleIceCandidate = (payload: WebRTCIceCandidatePayload) => {
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.handleIceCandidate(payload);
      }
    };

    // 4. "signaling:pong" latency measurement
    const handlePong = (payload: { clientTimestamp: number }) => {
      const latency = Math.max(1, Date.now() - (payload.clientTimestamp || Date.now()));
      setSignalingLatencyMs(latency);
    };

    // 5. "position:update" spatial movement from peers
    const handlePositionUpdate = (payload: { userId: string; position: { x: number; y: number; z: number }; roomId?: string }) => {
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

    // 6. "user:update-profile" mic mute/speaking status from peers
    const handleProfileUpdate = (payload: { userId: string; isMuted?: boolean; isSpeaking?: boolean; username?: string }) => {
      setPeers((prev) => {
        const existing = prev[payload.userId];
        if (!existing) return prev;
        return {
          ...prev,
          [payload.userId]: {
            ...existing,
            isMuted: typeof payload.isMuted === 'boolean' ? payload.isMuted : existing.isMuted,
            isSpeaking: typeof payload.isSpeaking === 'boolean' ? payload.isSpeaking : existing.isSpeaking,
            username: payload.username || existing.username
          }
        };
      });
    };

    // 7. "webrtc:error"
    const handleWebRTCError = (payload: { message: string; targetId?: string }) => {
      addLog('in', 'webrtc:error', payload.message, payload);
    };

    // Bind listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
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

    if (socket.connected) {
      handleConnect();
    }

    // Cleanup: Strictly remove listeners to avoid memory leaks or duplicate triggers
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
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
    };
  }, [addLog]);

  // Sync local speaking and mute state to signaling server
  useEffect(() => {
    if (isConnected) {
      socketService.updateProfile({ isMuted, isSpeaking });
    }
  }, [isConnected, isMuted, isSpeaking]);

  // Periodic signaling latency ping
  useEffect(() => {
    if (!isConnected) return;
    socketService.ping();
    const interval = setInterval(() => {
      socketService.ping();
    }, 4000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const startCall = useCallback(async (peerId: string) => {
    if (webrtcManagerRef.current) {
      await webrtcManagerRef.current.createOffer(peerId);
    }
  }, []);

  const closeCall = useCallback((peerId: string) => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.closePeer(peerId);
    }
  }, []);

  const setPeerVolume = useCallback((peerId: string, volume: number) => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.setPeerVolume(peerId, volume);
    }
    setPeers((prev) => {
      const existing = prev[peerId];
      if (!existing) return prev;
      return {
        ...prev,
        [peerId]: {
          ...existing,
          volume: Math.max(0, Math.min(1, volume))
        }
      };
    });
  }, []);

  const setPeerSpatial = useCallback((peerId: string, volume: number, pan: number = 0) => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.setPeerSpatial(peerId, volume, pan);
    }
    setPeers((prev) => {
      const existing = prev[peerId];
      if (!existing) return prev;
      return {
        ...prev,
        [peerId]: {
          ...existing,
          volume: Math.max(0, Math.min(1, volume)),
          pan: Math.max(-1, Math.min(1, pan))
        }
      };
    });
  }, []);

  const updateLocalPosition = useCallback((position: { x: number; y: number; z: number }) => {
    if (isConnected) {
      socketService.updatePosition(position);
    }
  }, [isConnected]);

  const switchRoom = useCallback((roomId: string) => {
    setCurrentRoomId(roomId);
    socketService.switchRoom(roomId);
    addLog('out', 'user:join', `Switched to room: '${roomId}'`);
  }, [addLog]);

  const setAudioOutputDevice = useCallback(async (sinkId: string) => {
    if (webrtcManagerRef.current) {
      await webrtcManagerRef.current.setAudioOutputDevice(sinkId);
    }
  }, []);

  return {
    localSocketId,
    isConnected,
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
    setAudioOutputDevice
  };
}

