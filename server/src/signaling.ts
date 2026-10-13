import { Server, Socket } from 'socket.io';

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

/**
 * Registers WebRTC signaling handlers for a connected socket.
 * Implements the exact 3 agreed events:
 * 1. "webrtc:offer"
 * 2. "webrtc:answer"
 * 3. "webrtc:ice-candidate"
 * 
 * Part of Member 2 & Member 4 backend signaling relay integration.
 */
export function registerWebRTCSignaling(io: Server, socket: Socket): void {
  // 1. "webrtc:offer"
  socket.on('webrtc:offer', (payload: WebRTCOfferPayload) => {
    if (!payload?.targetId || !payload?.sdp) {
      console.warn(`[Signaling] Invalid offer payload from ${socket.id}`, payload);
      return;
    }

    const targetSocket = io.sockets.sockets.get(payload.targetId);
    if (!targetSocket) {
      console.warn(`[Signaling] Target peer ${payload.targetId} is not connected for offer.`);
      socket.emit('webrtc:error', {
        message: `Peer ${payload.targetId} is no longer connected.`,
        targetId: payload.targetId
      });
      return;
    }

    console.log(`[Signaling] Relaying offer: ${socket.id} -> ${payload.targetId}`);
    io.to(payload.targetId).emit('webrtc:offer', {
      ...payload,
      senderId: socket.id // Ensure authenticated sender
    });
  });

  // 2. "webrtc:answer"
  socket.on('webrtc:answer', (payload: WebRTCAnswerPayload) => {
    if (!payload?.targetId || !payload?.sdp) {
      console.warn(`[Signaling] Invalid answer payload from ${socket.id}`, payload);
      return;
    }

    const targetSocket = io.sockets.sockets.get(payload.targetId);
    if (!targetSocket) {
      console.warn(`[Signaling] Target peer ${payload.targetId} is not connected for answer.`);
      return;
    }

    console.log(`[Signaling] Relaying answer: ${socket.id} -> ${payload.targetId}`);
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

    const targetSocket = io.sockets.sockets.get(payload.targetId);
    if (!targetSocket) {
      return; // Target already disconnected, drop candidate silently
    }

    console.log(`[Signaling] Relaying ICE candidate: ${socket.id} -> ${payload.targetId}`);
    io.to(payload.targetId).emit('webrtc:ice-candidate', {
      ...payload,
      senderId: socket.id
    });
  });

  // 4. "signaling:ping" for real-time telemetry and latency measurement
  socket.on('signaling:ping', (payload: { timestamp: number }) => {
    socket.emit('signaling:pong', {
      clientTimestamp: payload?.timestamp || Date.now(),
      serverTimestamp: Date.now()
    });
  });
}

