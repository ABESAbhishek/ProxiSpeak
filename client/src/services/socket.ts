import { io, Socket } from 'socket.io-client';
import type {
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
  UserJoinPayload
} from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

/**
 * Singleton Socket.io client connection to avoid duplicate sockets.
 */
export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

export const socketService = {
  get socketId(): string | undefined {
    return socket.id;
  },

  get isConnected(): boolean {
    return socket.connected;
  },

  join(payload: UserJoinPayload): void {
    socket.emit('user:join', payload);
  },

  // 1. "webrtc:offer"
  sendOffer(payload: WebRTCOfferPayload): void {
    socket.emit('webrtc:offer', payload);
  },

  // 2. "webrtc:answer"
  sendAnswer(payload: WebRTCAnswerPayload): void {
    socket.emit('webrtc:answer', payload);
  },

  // 3. "webrtc:ice-candidate"
  sendIceCandidate(payload: WebRTCIceCandidatePayload): void {
    socket.emit('webrtc:ice-candidate', payload);
  },

  // 4. "signaling:ping" for latency monitoring
  ping(timestamp: number = Date.now()): void {
    socket.emit('signaling:ping', { timestamp });
  }
};

