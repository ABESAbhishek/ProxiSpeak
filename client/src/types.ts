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
  WebRTCConnectionState,
  MicrophoneStatus,
  RemotePeerAudio
} from '../../shared/types';

export interface SignalingLogEntry {
  id: string;
  timestamp: string;
  direction: 'in' | 'out';
  type: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:ice-candidate' | 'user:join' | 'user:left' | 'world:state';
  summary: string;
  details?: unknown;
}
