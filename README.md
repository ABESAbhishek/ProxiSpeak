# ProxiSpeak — Geospatial Proximity Audio Ecosystem

**Week 1 Deliverable: WebRTC Audio Foundation & Signaling Coordination**  
*Role: Member 4 (WebRTC & Proximity Audio Integration) in coordination with Member 2 (Backend & Signaling Architecture)*

---

## 📌 Deliverable Summary

This repository contains the Week 1 WebRTC audio foundation for **ProxiSpeak**, enabling real-time, low-latency voice communication across multiple browser sessions with signaling relay, connection telemetry, and proximity-ready spatial audio controls.

### ✅ Completed Tasks

1. **Microphone Permissions via `getUserMedia`**
   - Implemented in [`client/src/hooks/useMicrophone.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/hooks/useMicrophone.ts) and [`client/src/components/AudioControls.tsx`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/components/AudioControls.tsx).
   - **Permissions API Query:** Real-time browser permission state tracking (`granted`, `prompt`, `denied`).
   - **Hardware Device Enumeration:** Detects and allows dynamic switching between all available audio input devices (`navigator.mediaDevices.enumerateDevices()`).
   - **Hardware Loopback Self-Test:** Built-in 3-second audio recorder and instant playback to test voice clarity before entering peer calls.
   - **Web Audio API Spectrum Analyzer:** 8-band frequency visualizer (60Hz–16kHz) and input volume meter (0–100%).
   - Strict explicit user activation and clean hardware track cleanup on teardown or device change.

2. **WebRTC Audio Connection Between Two Browser Sessions**
   - Implemented in [`client/src/services/webrtcManager.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/services/webrtcManager.ts), [`client/src/hooks/useWebRTCAudio.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/hooks/useWebRTCAudio.ts), and [`client/src/components/PeerList.tsx`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/components/PeerList.tsx).
   - **Peer Connection Management:** Multi-STUN server configuration (`stun.l.google.com:19302`) with early ICE candidate buffering.
   - **Real-Time WebRTC Audio Telemetry:** Periodic `RTCPeerConnection.getStats()` monitoring displaying round-trip time (RTT), jitter (ms), audio bitrate (kbps), and Opus codec.
   - **Automatic Playback & Recovery:** HTMLAudioElement autoplay handling with automatic ICE restart on connection failure.

3. **Signaling Coordination with Member 2**
   - Agreed protocol implemented in [`server/src/signaling.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/server/src/signaling.ts), [`server/src/roomManager.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/server/src/roomManager.ts), [`shared/types.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/shared/types.ts), and [`client/src/components/SignalingLog.tsx`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/components/SignalingLog.tsx).
   - **Exact 3 WebRTC signaling events**:
     - `webrtc:offer` &rarr; Relays SDP offer to target peer.
     - `webrtc:answer` &rarr; Relays SDP answer to target peer.
     - `webrtc:ice-candidate` &rarr; Relays ICE candidates.
   - **Signaling Telemetry & Latency Ping:** Real-time `signaling:ping` / `signaling:pong` measurement showing round-trip latency to Member 2's relay server.
   - **Live Event Audit:** Filterable event inspector and real-time counter chips for offers, answers, and candidates.
   - **Automated Verification Test:** Comprehensive test script in [`server/test-signaling.mjs`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/server/test-signaling.mjs).

4. **Preparation for Week 2 Proximity-Based Audio Integration**
   - Implemented in [`client/src/services/spatialAudio.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/services/spatialAudio.ts) and [`client/src/components/ProximitySimulator.tsx`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/components/ProximitySimulator.tsx).
   - **Spatial Audio Engine (`SpatialAudioGraph`):** Connects remote audio streams to Web Audio API `GainNode` and `StereoPannerNode` with smooth exponential ramps to prevent clipping artifacts.
   - **Multiple Falloff Curves:**
     - *Linear Falloff:* $\text{Volume} = \max\left(0, 1 - \frac{d - d_{min}}{d_{max} - d_{min}}\right)$
     - *Inverse Acoustic Law ($1/d$):* $\text{Volume} = \frac{d_{min}}{d_{min} + \text{rolloff} \cdot (d - d_{min})}$
     - *Exponential Decay:* $\text{Volume} = e^{-\alpha \cdot d}$
   - **Stereo Directional Panning:** Calculates azimuth angle and left/right ear pan based on listener heading orientation.
   - **Plug-and-Play 3D Coordinates:** Schema `(x, y, z)` aligned with Member 1 & Member 3 for 3D avatar coordinate binding in Week 2.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
npm run install:all
```

### 2. Start Both Server and Client
```bash
npm run dev
```
- **Client UI:** [http://localhost:5173](http://localhost:5173)
- **Signaling Server:** [http://localhost:3001](http://localhost:3001)

### 3. Run Automated Signaling Verification
```bash
node server/test-signaling.mjs
```

### 4. How to Test Two-Peer WebRTC Audio
1. Open [http://localhost:5173](http://localhost:5173) in Browser Tab 1.
2. Click **Start Microphone** (or click **Run Self-Test** to verify microphone recording locally).
3. Open [http://localhost:5173](http://localhost:5173) in an Incognito window or second browser (Browser Tab 2).
4. Click **Start Microphone** in Tab 2.
5. In either tab, find the peer in the **Active Room Peers** list and click **Call Peer**.
6. Observe the bidirectional exchange in the **Member 2 Signaling Inspector** (`webrtc:offer` &rarr; `webrtc:answer` &rarr; `webrtc:ice-candidate`).
7. Speak into the microphone to verify bidirectional low-latency audio and check live WebRTC stats (RTT, Jitter, Bitrate).
8. Use the **Week 2 Proximity Audio Engine Demo** soundstage to test distance falloff curves and stereo panning.