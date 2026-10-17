# ProxiSpeak Backend & Signaling Server (Member 2 Architecture)

This service powers real-time user presence, geospatial spatial state synchronization, and WebRTC signaling for the **ProxiSpeak Geospatial Proximity Audio Ecosystem**.

---

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Development Mode
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

---

## 🌐 REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server health, uptime, active connections, and active rooms count. |
| `GET` | `/api/world` | List of all currently connected users, their 3D positions, and rooms. |
| `GET` | `/api/rooms` | Summary of active rooms and user counts. |

---

## 📡 Socket.io Event Specification

### 1. User Presence & World State

#### `user:join` (Client &rarr; Server)
Sent when a client enters a space.
```json
{
  "username": "Alice",
  "position": { "x": 100, "y": 150, "z": 0 },
  "roomId": "global-space" // optional, defaults to "global-space"
}
```

#### `world:state` (Server &rarr; Client)
Emitted to the joining client with a full snapshot of all peers in their room.
```json
{
  "roomId": "global-space",
  "users": {
    "socket_id_1": {
      "id": "socket_id_1",
      "username": "Alice",
      "position": { "x": 100, "y": 150, "z": 0 },
      "roomId": "global-space",
      "isMuted": false,
      "joinedAt": 1728669000000
    }
  }
}
```

#### `user:left` (Server &rarr; Room Clients)
Broadcast when a peer disconnects or leaves.
```json
{
  "userId": "socket_id_1",
  "roomId": "global-space"
}
```

---

### 2. Geospatial Movement

#### `position:update` (Client &rarr; Server &rarr; Room Clients)
Broadcasts updated 3D coordinates to other peers in the room for proximity volume calculation.
```json
{
  "userId": "socket_id_1",
  "position": { "x": 125.5, "y": 180.2, "z": 0 },
  "roomId": "global-space"
}
```

---

### 3. WebRTC Audio Signaling (Member 4 Integration)

The backend acts as a low-latency relay routing SDP and ICE candidates directly to the intended peer:

#### `webrtc:offer`
```json
{
  "senderId": "socket_id_A",
  "targetId": "socket_id_B",
  "sdp": { "type": "offer", "sdp": "..." }
}
```

#### `webrtc:answer`
```json
{
  "senderId": "socket_id_B",
  "targetId": "socket_id_A",
  "sdp": { "type": "answer", "sdp": "..." }
}
```

#### `webrtc:ice-candidate`
```json
{
  "senderId": "socket_id_A",
  "targetId": "socket_id_B",
  "candidate": { "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 }
}
```

---

## 🧪 Automated Testing

Run the multi-client WebRTC signaling integration test:
```bash
node test-signaling.mjs
```
Verifies bidirectional delivery of all 3 WebRTC events between two simulated clients.
