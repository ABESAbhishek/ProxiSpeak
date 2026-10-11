import { Server, Socket } from 'socket.io';

export interface WebRTCOfferPayload {
  senderId: string;
  targetId: string;
  sdp: any;
}

export interface WebRTCAnswerPayload {
  senderId: string;
  targetId: string;
  sdp: any;
}

export interface WebRTCIceCandidatePayload {
  senderId: string;
  targetId: string;
  candidate: any;
}

/**
 * Registers WebRTC signaling handlers for a connected socket.
 * Uses the agreed exact event names:
 * 1. "webrtc:offer"
 * 2. "webrtc:answer"
 * 3. "webrtc:ice-candidate"
 * 
 * Designed for clean coordination with Member 2 (Backend).
 */
export function registerWebRTCSignaling(io: Server, socket: Socket): void {
  // 1. "webrtc:offer"
  socket.on('webrtc:offer', (payload: WebRTCOfferPayload) => {
    if (!payload?.targetId || !payload?.sdp) {
      console.warn(`[Signaling] Invalid offer payload from ${socket.id}`, payload);
      return;
    }

    console.log(`[Signaling] Relaying offer: ${socket.id} -> ${payload.targetId}`);
    // Forward the offer directly to the intended peer
    io.to(payload.targetId).emit('webrtc:offer', {
      ...payload,
      senderId: socket.id // Ensure senderId matches authenticated socket
    });
  });

  // 2. "webrtc:answer"
  socket.on('webrtc:answer', (payload: WebRTCAnswerPayload) => {
    if (!payload?.targetId || !payload?.sdp) {
      console.warn(`[Signaling] Invalid answer payload from ${socket.id}`, payload);
      return;
    }

    console.log(`[Signaling] Relaying answer: ${socket.id} -> ${payload.targetId}`);
    // Forward the answer directly to the intended peer
    io.to(payload.targetId).emit('webrtc:answer', {
      ...payload,
      senderId: socket.id
    });
  });

  // 3. "webrtc:ice-candidate"
  socket.on('webrtc:ice-candidate', (payload: WebRTCIceCandidatePayload) => {
    if (!payload?.targetId || !payload?.candidate) {
      console.warn(`[Signaling] Invalid ICE candidate payload from ${socket.id}`, payload);
      return;
    }

    console.log(`[Signaling] Relaying ICE candidate: ${socket.id} -> ${payload.targetId}`);
    // Forward ICE candidate to the intended peer
    io.to(payload.targetId).emit('webrtc:ice-candidate', {
      ...payload,
      senderId: socket.id
    });
  });
}
