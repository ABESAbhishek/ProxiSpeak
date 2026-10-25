import type {
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
  WebRTCConnectionState,
  PeerAudioStats
} from '../types';
import { SpatialAudioGraph } from './spatialAudio';

export interface WebRTCManagerCallbacks {
  onSendOffer: (payload: WebRTCOfferPayload) => void;
  onSendAnswer: (payload: WebRTCAnswerPayload) => void;
  onSendIceCandidate: (payload: WebRTCIceCandidatePayload) => void;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onConnectionStateChange: (peerId: string, state: WebRTCConnectionState) => void;
  onLog?: (direction: 'in' | 'out', type: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:ice-candidate' | 'webrtc:error', summary: string, details?: unknown) => void;
  onPeerStats?: (peerId: string, stats: PeerAudioStats) => void;
}


const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

export class WebRTCManager {
  private localSocketId: string = '';
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  /** Buffers ICE candidates arriving before remote description is set */
  private queuedCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private callbacks: WebRTCManagerCallbacks;
  private spatialAudio: SpatialAudioGraph = new SpatialAudioGraph();
  private statsInterval: number | null = null;
  private prevBytesReceived: Map<string, { bytes: number; timestamp: number }> = new Map();
  private disconnectTimers: Map<string, number> = new Map();
  private retryAttempts: Map<string, number> = new Map();

  private readonly MAX_ICE_RETRIES = 2;
  private readonly DISCONNECT_GRACE_PERIOD_MS = 5000;

  constructor(callbacks: WebRTCManagerCallbacks) {
    this.callbacks = callbacks;
    this.startStatsMonitoring();
  }


  public setLocalSocketId(id: string): void {
    this.localSocketId = id;
  }

  public setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream;

    // Update active senders in all existing peer connections
    this.peerConnections.forEach((pc) => {
      const senders = pc.getSenders();
      const audioSender = senders.find((s) => s.track?.kind === 'audio');

      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).catch((err) => {
              console.warn('[WebRTC] Error replacing track:', err);
            });
          } else {
            pc.addTrack(audioTrack, stream);
          }
        }
      } else {
        if (audioSender) {
          pc.removeTrack(audioSender);
        }
      }
    });
  }

  /**
   * Initializes or retrieves an RTCPeerConnection for the specified remote peer.
   */
  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    const existing = this.peerConnections.get(peerId);
    if (existing) {
      return existing;
    }

    console.log(`[WebRTC] Creating RTCPeerConnection for peer: ${peerId}`);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Attach local audio track if microphone is currently active
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // ICE Candidate generation
    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        this.callbacks.onLog?.('out', 'webrtc:ice-candidate', `Sent ICE candidate to ${peerId}`);
        this.callbacks.onSendIceCandidate({
          senderId: this.localSocketId,
          targetId: peerId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    // Remote audio track reception & playback
    pc.ontrack = (event: RTCTrackEvent) => {
      console.log(`[WebRTC] Received remote track from ${peerId}:`, event.track.kind);
      let stream = this.remoteStreams.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(peerId, stream);
      }
      stream.addTrack(event.track);
      // Connect to Web Audio API spatial panner graph
      this.spatialAudio.attachStream(peerId, stream);
      this.callbacks.onRemoteStream(peerId, stream);
    };

    // Connection state monitoring

    pc.onconnectionstatechange = () => {
      // Ignore events from a connection that has already been replaced or closed.
      if (this.peerConnections.get(peerId) !== pc) return;

      const state = pc.connectionState as WebRTCConnectionState;

      console.log(`[WebRTC] Peer ${peerId} connection state: ${state}`);
      this.callbacks.onConnectionStateChange(peerId, state);

      if (state === 'connected') {
        const timer = this.disconnectTimers.get(peerId);

        if (timer !== undefined) {
          window.clearTimeout(timer);
          this.disconnectTimers.delete(peerId);
        }

        this.retryAttempts.delete(peerId);
        return;
      }

      if (state === 'disconnected') {
        // Allow temporary network interruptions to recover.
        if (!this.disconnectTimers.has(peerId)) {
          const timer = window.setTimeout(() => {
            this.disconnectTimers.delete(peerId);

            if (
              this.peerConnections.get(peerId) === pc &&
              pc.connectionState === 'disconnected'
            ) {
              console.warn(
                `[WebRTC] Peer ${peerId} remained disconnected. Cleaning up.`
              );
              this.closePeer(peerId);
            }
          }, this.DISCONNECT_GRACE_PERIOD_MS);

          this.disconnectTimers.set(peerId, timer);
        }

        return;
      }

      if (state === 'failed') {
        console.warn(`[WebRTC] Connection failed with ${peerId}.`);

        if (!this.retryAttempts.has(peerId)) {
          void this.retryPeerConnection(peerId);
        }

        return;
      }

      if (state === 'closed') {
        this.closePeer(peerId);
      }
    };


    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${peerId} ICE state: ${pc.iceConnectionState}`);
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  /**
   * Initiates a WebRTC audio call/offer to a target peer.
   */
  public async createOffer(peerId: string): Promise<void> {
    try {
      const pc = this.getOrCreatePeerConnection(peerId);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await pc.setLocalDescription(offer);

      this.callbacks.onLog?.('out', 'webrtc:offer', `Created SDP Offer for ${peerId}`);
      this.callbacks.onSendOffer({
        senderId: this.localSocketId,
        targetId: peerId,
        sdp: offer
      });
    } catch (err) {
      console.error(`[WebRTC] Failed to create offer for ${peerId}:`, err);
    }
  }

  /**
   * Handles an incoming "webrtc:offer", sets remote description,
   * drains any early-arrived ICE candidates, and sends a "webrtc:answer".
   */
  public async handleOffer(payload: WebRTCOfferPayload): Promise<void> {
    const { senderId, sdp } = payload;
    this.callbacks.onLog?.('in', 'webrtc:offer', `Received SDP Offer from ${senderId}`);

    try {
      const pc = this.getOrCreatePeerConnection(senderId);

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`[WebRTC] Remote description set for offer from ${senderId}`);

      // Drain any ICE candidates that arrived before the offer was set
      await this.drainQueuedCandidates(senderId, pc);

      // Create and send SDP answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.callbacks.onLog?.('out', 'webrtc:answer', `Sent SDP Answer to ${senderId}`);
      this.callbacks.onSendAnswer({
        senderId: this.localSocketId,
        targetId: senderId,
        sdp: answer
      });
    } catch (err) {
      console.error(`[WebRTC] Failed to handle offer from ${senderId}:`, err);
    }
  }

  /**
   * Handles an incoming "webrtc:answer", sets remote description,
   * and drains any early-arrived ICE candidates.
   */
  public async handleAnswer(payload: WebRTCAnswerPayload): Promise<void> {
    const { senderId, sdp } = payload;
    this.callbacks.onLog?.('in', 'webrtc:answer', `Received SDP Answer from ${senderId}`);

    try {
      const pc = this.peerConnections.get(senderId);
      if (!pc) {
        console.warn(`[WebRTC] Received answer from unknown peer ${senderId}`);
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`[WebRTC] Remote description set for answer from ${senderId}`);

      // Drain queued ICE candidates
      await this.drainQueuedCandidates(senderId, pc);
    } catch (err) {
      console.error(`[WebRTC] Failed to handle answer from ${senderId}:`, err);
    }
  }

  /**
   * Handles an incoming "webrtc:ice-candidate".
   * Buffers candidate if remote description is not set yet.
   */
  public async handleIceCandidate(payload: WebRTCIceCandidatePayload): Promise<void> {
    const { senderId, candidate } = payload;
    this.callbacks.onLog?.('in', 'webrtc:ice-candidate', `Received ICE candidate from ${senderId}`);

    try {
      const pc = this.peerConnections.get(senderId);

      // If PC doesn't exist yet or remote description isn't ready, buffer candidate
      if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
        console.log(`[WebRTC] Buffering early ICE candidate from ${senderId}`);
        const queue = this.queuedCandidates.get(senderId) || [];
        queue.push(candidate);
        this.queuedCandidates.set(senderId, queue);
        return;
      }

      // Remote description is ready, add candidate immediately
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`[WebRTC] Error adding ICE candidate from ${senderId}:`, err);
    }
  }

  /**
   * Drains buffered ICE candidates once remote description is set.
   */
  private async drainQueuedCandidates(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const queue = this.queuedCandidates.get(peerId);
    if (!queue || queue.length === 0) return;

    console.log(`[WebRTC] Draining ${queue.length} queued ICE candidates for ${peerId}`);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn(`[WebRTC] Failed to add drained candidate:`, err);
      }
    }
    this.queuedCandidates.delete(peerId);
  }


  /**
   * Routes remote peer audio output to a specific audio output device (e.g. headphones).
   */
  /**
 * Audio output selection is not yet supported by the current
 * SpatialAudioGraph playback path.
 */
  public async setAudioOutputDevice(sinkId: string): Promise<void> {
    console.warn(
      `[WebRTC] Cannot switch audio output to "${sinkId}": ` +
      'remote audio currently plays through SpatialAudioGraph.'
    );
  }

  /**
   * Adjusts the volume of a remote peer's audio stream (0.0 to 1.0).
   * Ready for Week 2 proximity-based volume scaling!
   */
  /**
 * Updates remote peer volume through the Web Audio gain node.
 */
  public setPeerVolume(peerId: string, volume: number): void {
    if (!Number.isFinite(volume)) {
      volume = 0;
    }

    const clampedVolume = Math.max(0, Math.min(1, volume));

    this.spatialAudio.updateSpatialParameters(
      peerId,
      clampedVolume
    );
  }

  /**
 * Updates remote peer volume and stereo panning with smooth transitions.
 */
  public setPeerSpatial(
    peerId: string,
    volume: number,
    pan: number = 0
  ): void {
    this.spatialAudio.updateSpatialParameters(
      peerId,
      volume,
      pan
    );
  }

  /**
   * Periodically queries RTCPeerConnection.getStats() for active audio quality metrics.
   */
  private startStatsMonitoring(): void {
    if (this.statsInterval !== null) return;

    this.statsInterval = window.setInterval(async () => {
      if (this.peerConnections.size === 0 || !this.callbacks.onPeerStats) return;

      for (const [peerId, pc] of this.peerConnections.entries()) {
        if (pc.connectionState !== 'connected') continue;

        try {
          const statsReport = await pc.getStats();
          let rttMs = 0;
          let jitterMs = 0;
          let packetsLost = 0;
          let audioBitrateKbps = 0;
          let codec = 'opus';

          statsReport.forEach((report) => {
            // Check candidate pair for RTT
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              if (report.currentRoundTripTime !== undefined) {
                rttMs = Math.round(report.currentRoundTripTime * 1000);
              }
            }

            // Check inbound-rtp for audio jitter, packet loss, and bitrate
            if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
              if (report.jitter !== undefined) {
                jitterMs = Math.round(report.jitter * 1000);
              }
              if (report.packetsLost !== undefined) {
                packetsLost = report.packetsLost;
              }

              if (report.bytesReceived !== undefined) {
                const now = Date.now();
                const prev = this.prevBytesReceived.get(peerId);
                if (prev) {
                  const bytesDiff = report.bytesReceived - prev.bytes;
                  const timeDiffSec = (now - prev.timestamp) / 1000;
                  if (timeDiffSec > 0 && bytesDiff >= 0) {
                    audioBitrateKbps = Math.round((bytesDiff * 8) / timeDiffSec / 1000);
                  }
                }
                this.prevBytesReceived.set(peerId, { bytes: report.bytesReceived, timestamp: now });
              }

              if (report.codecId) {
                let codecReport: { id?: string; mimeType?: string } | undefined;
                statsReport.forEach((entry: unknown) => {
                  const item = entry as { id?: string; mimeType?: string };
                  if (item?.id === report.codecId) {
                    codecReport = item;
                  }
                });
                if (codecReport && codecReport.mimeType) {
                  codec = codecReport.mimeType.replace('audio/', '');
                }
              }
            }
          });

          this.callbacks.onPeerStats(peerId, {
            peerId,
            rttMs,
            jitterMs,
            packetsLost,
            audioBitrateKbps,
            codec
          });
        } catch {
          // ignore transient stats error
        }
      }
    }, 2000);
  }

  private stopStatsMonitoring(): void {
    if (this.statsInterval !== null) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Retries connection with ICE restart if connection failed.
   */

  private async retryPeerConnection(peerId: string): Promise<void> {
    const pc = this.peerConnections.get(peerId);

    if (
      !pc ||
      pc.connectionState === 'closed' ||
      pc.signalingState === 'closed'
    ) {
      return;
    }

    const attempts = this.retryAttempts.get(peerId) ?? 0;

    if (attempts >= this.MAX_ICE_RETRIES) {
      console.error(
        `[WebRTC] ICE restart limit reached for ${peerId}.`
      );

      this.callbacks.onLog?.(
        'in',
        'webrtc:error',
        `ICE restart limit reached for ${peerId}`
      );

      this.closePeer(peerId);
      return;
    }

    this.retryAttempts.set(peerId, attempts + 1);

    try {
      const offer = await pc.createOffer({ iceRestart: true });

      if (this.peerConnections.get(peerId) !== pc) {
        return;
      }

      await pc.setLocalDescription(offer);

      if (this.peerConnections.get(peerId) !== pc) return;

      this.callbacks.onLog?.(
        'out',
        'webrtc:offer',
        `ICE restart attempt ${attempts + 1} for ${peerId}`
      );

      this.callbacks.onSendOffer({
        senderId: this.localSocketId,
        targetId: peerId,
        sdp: offer
      });
    } catch (err) {
      console.error(`[WebRTC] ICE restart failed for ${peerId}:`, err);

      this.callbacks.onLog?.(
        'in',
        'webrtc:error',
        `ICE restart failed for ${peerId}`,
        err
      );

      if (this.peerConnections.get(peerId) === pc) {
        this.closePeer(peerId);
      }
    }
  }


  /**
   * Closes connection and cleans up all resources for a specific peer.
   */
  public closePeer(peerId: string): void {
    const disconnectTimer = this.disconnectTimers.get(peerId);

    if (disconnectTimer !== undefined) {
      window.clearTimeout(disconnectTimer);
      this.disconnectTimers.delete(peerId);
    }

    this.retryAttempts.delete(peerId);

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.onicegatheringstatechange = null;
      pc.onnegotiationneeded = null;
      pc.ondatachannel = null;

      pc.close();
      this.peerConnections.delete(peerId);
    }

    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.audioElements.delete(peerId);
    }

    this.spatialAudio.detachStream(peerId);

    const remoteStream = this.remoteStreams.get(peerId);

    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }

    this.remoteStreams.delete(peerId);
    this.prevBytesReceived.delete(peerId);
    this.queuedCandidates.delete(peerId);
    this.callbacks.onConnectionStateChange(peerId, 'closed');
    console.log(`[WebRTC] Cleaned up peer connection for ${peerId}`);
  }

  /**
   * Cleans up all peer connections, audio elements, and queues.
   */
  public destroy(): void {
    this.stopStatsMonitoring();
    this.spatialAudio.destroy();
    const peerIds = Array.from(this.peerConnections.keys());
    peerIds.forEach((id) => this.closePeer(id));
    this.localStream = null;
  }
}

