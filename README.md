# ProxiSpeak — Geospatial Proximity Audio Ecosystem

**Week 1 Deliverable: WebRTC Audio Foundation & Signaling Coordination**  
*Role: Member 4 (WebRTC & Proximity Audio Integration) in coordination with Member 2 (Backend & Signaling Architecture)*

---

## 📌 Deliverable Summary

This repository contains the Week 1 WebRTC audio foundation for **ProxiSpeak**, enabling real-time, low-latency voice communication across multiple browser sessions with signaling relay and proximity-ready volume controls.

### ✅ Completed Tasks

1. **Microphone Permissions via `getUserMedia`**
   - Implemented in [`client/src/hooks/useMicrophone.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/hooks/useMicrophone.ts) and [`client/src/components/AudioControls.tsx`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/components/AudioControls.tsx).
   - Strict explicit user activation (avoids autoplay restrictions).
   - Dynamic permission state tracking (`idle`, `requesting`, `active`, `muted`, `denied`, `error`).
   - Web Audio API real-time microphone level meter (0–100%).
   - Clean hardware track cleanup on teardown or device disconnect.

2. **WebRTC Audio Connection Between Two Browser Sessions**
   - Implemented in [`client/src/services/webrtcManager.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/services/webrtcManager.ts) and [`client/src/hooks/useWebRTCAudio.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/hooks/useWebRTCAudio.ts).
   - Peer connection management with public STUN servers (`stun.l.google.com:19302`).
   - Early ICE candidate queuing/buffering before SDP negotiation completes.
   - Automatic remote stream playback via `HTMLAudioElement` with autoplay policies handled.
   - Automatic ICE restart on connection failure.

3. **Signaling Coordination with Member 2**
   - Agreed protocol implemented in [`server/src/signaling.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/server/src/signaling.ts), [`server/src/roomManager.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/server/src/roomManager.ts), and [`shared/types.ts`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/shared/types.ts).
   - **Exact 3 WebRTC signaling events**:
     - `webrtc:offer` &rarr; Relays SDP offer to target peer.
     - `webrtc:answer` &rarr; Relays SDP answer to target peer.
     - `webrtc:ice-candidate` &rarr; Relays ICE candidates.
   - Multi-room state & presence integration (`user:join`, `user:left`, `world:state`, `position:update`).
   - Automated two-peer signaling test script: [`server/test-signaling.mjs`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/server/test-signaling.mjs).

4. **Preparation for Week 2 Proximity-Based Audio Integration**
   - Independent peer volume control hook: `setPeerVolume(peerId, volume)` in `WebRTCManager`.
   - Built-in interactive Proximity Simulator in [`client/src/components/ProximitySimulator.tsx`](file:///c:/Users/lokes/OneDrive/Desktop/Infotact%20Project-1/ProxiSpeak/client/src/components/ProximitySimulator.tsx) simulating 2D/3D distance falloff:
     $$\text{Volume} = \max\left(0, 1 - \frac{\text{Distance}}{\text{MaxDistance}}\right)$$
   - Ready for plug-and-play binding with 3D avatar coordinates from Member 1 & Member 3 in Week 2.

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

### 3. How to Test Two-Peer WebRTC Audio
1. Open [http://localhost:5173](http://localhost:5173) in Browser Tab 1.
2. Click **Start Microphone** and allow mic permissions.
3. Open [http://localhost:5173](http://localhost:5173) in an Incognito window or second browser (Browser Tab 2).
4. Click **Start Microphone** in Tab 2.
5. In either tab, find the peer in the **Active Room Peers** list and click **Call Peer**.
6. Observe the bidirectional exchange in the **Live Signaling Event Log** (`webrtc:offer` &rarr; `webrtc:answer` &rarr; `webrtc:ice-candidate`).
7. Speak into the microphone to verify bidirectional audio.
8. Use the **Proximity Audio Simulator** slider to test distance-based volume attenuation.