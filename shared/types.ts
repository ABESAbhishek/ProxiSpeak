/**
 * ProxiSpeak — Shared Types and Signaling Protocol
 * 
 * This file defines the shared contract between the frontend client and the backend server.
 * Specifically for WebRTC audio foundation (Member 4) and Backend coordination (Member 2).
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
// Geospatial World & Presence Events (Coordinated with Member 2 / 3)
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
  isMuted?: boolean;
}

export interface UserJoinPayload {
  username: string;
  position?: Position3D;
}

export interface UserLeftPayload {
  userId: string;
}

export interface WorldStatePayload {
  users: Record<string, UserProfile>;
}

export interface PositionUpdatePayload {
  userId: string;
  position: Position3D;
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
  isMuted: boolean;
}
