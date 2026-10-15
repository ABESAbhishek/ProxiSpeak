/**
 * ProxiSpeak — Shared Types and Signaling Protocol
 * 
 * This file defines the shared contract between frontend clients and the backend server.
 * Specifically for WebRTC audio foundation (Member 4), Backend architecture (Member 2),
 * and Spatial physics/avatars (Member 1 & 3).
 */

// -------------------------------------------------------------
// Core WebRTC Signaling Events (Agreed exact event names)
// 1. "webrtc:offer"
// 2. "webrtc:answer"
// 3. "webrtc:ice-candidate"
// -------------------------------------------------------------

export interface WebRTCOfferPayload {
  senderId: string;
  targetId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WebRTCAnswerPayload {
  senderId: string;
  targetId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WebRTCIceCandidatePayload {
  senderId: string;
  targetId: string;
  candidate: RTCIceCandidateInit;
}

// -------------------------------------------------------------
// Geospatial World & Presence Events (Member 2 Backend Architecture)
// -------------------------------------------------------------

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface UserProfile {
  id: string;
  username: string;
  position: Position3D;
  roomId?: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
  joinedAt?: number;
}

export interface UserJoinPayload {
  username: string;
  position?: Position3D;
  roomId?: string;
}

export interface UserLeftPayload {
  userId: string;
  roomId?: string;
}

export interface WorldStatePayload {
  roomId: string;
  users: Record<string, UserProfile>;
}

export interface PositionUpdatePayload {
  userId: string;
  position: Position3D;
  roomId?: string;
}

export interface UserProfileUpdatePayload {
  userId: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
  username?: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  userCount: number;
}

// -------------------------------------------------------------
// Audio Module Types (Prepared for Week 2 Proximity Control)
// -------------------------------------------------------------

export type WebRTCConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type MicrophoneStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'muted'
  | 'denied'
  | 'error';

export interface RemotePeerAudio {
  peerId: string;
  username: string;
  stream: MediaStream;
  connectionState: WebRTCConnectionState;
  /** Volume level between 0.0 (silent) and 1.0 (full volume), ready for Week 2 proximity calculation */
  volume: number;
  /** Stereo pan between -1.0 (full left) and 1.0 (full right) */
  pan?: number;
  isMuted: boolean;
  isSpeaking?: boolean;
  position?: Position3D;
  stats?: PeerAudioStats;
}

export interface PeerAudioStats {
  peerId: string;
  rttMs: number;
  jitterMs: number;
  packetsLost: number;
  audioBitrateKbps: number;
  codec: string;
}

export interface SignalingPingPayload {
  timestamp: number;
}

export interface SignalingPongPayload {
  clientTimestamp: number;
  serverTimestamp: number;
}

