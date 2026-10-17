// Re-export shared types for client use
export type {
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
  Position3D,
  UserProfile,
  UserJoinPayload,
  UserLeftPayload,
  WorldStatePayload,
  PositionUpdatePayload,
  UserProfileUpdatePayload,
  WebRTCConnectionState,
  MicrophoneStatus,
  RemotePeerAudio,
  PeerAudioStats,
  SignalingPingPayload,
  SignalingPongPayload
} from '../../shared/types';

export interface SignalingLogEntry {
  id: string;
  timestamp: string;
  direction: 'in' | 'out';
  type:
    | 'webrtc:offer'
    | 'webrtc:answer'
    | 'webrtc:ice-candidate'
    | 'webrtc:error'
    | 'user:join'
    | 'user:left'
    | 'world:state'
    | 'position:update'
    | 'user:update-profile';
  summary: string;
  details?: unknown;
}
