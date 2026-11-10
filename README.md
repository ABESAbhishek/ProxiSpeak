# ProxiSpeak

ProxiSpeak is a shared virtual office with account-backed profiles, authenticated real-time avatar presence, and WebRTC audio signaling. Account data, sessions, one-time codes, and presence history are stored in MongoDB; the existing 3D office and WebRTC audio flows remain in place.

## Prerequisites

- Node.js 20+ and npm
- MongoDB 6+ (required for accounts and authenticated workspace sessions)

## Install and configure

```bash
npm install
npm run install:all
```

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env.local`. The frontend uses `VITE_SOCKET_URL` (defaults to the current host on port 3001). Account login and socket entry require MongoDB; the old unauthenticated memory-only mode is no longer available for workspace access. Keep backend values out of the client env file.

For MongoDB, run a local MongoDB service or create a database with MongoDB Atlas and put its connection URI in `server/.env`. Keep credentials in local environment files; do not commit them. A configured but unreachable MongoDB prevents the backend from starting. Set `SESSION_SECRET` and `OTP_SECRET` to independent random strings with at least 32 characters. Sessions use an HttpOnly, SameSite=Strict cookie, server-side session records, 30-minute idle expiry and a warning at 28 minutes by default. Override `SESSION_IDLE_TIMEOUT_MINUTES` and `SESSION_WARNING_MINUTES` to change the timing. Production must use HTTPS so the cookie receives the Secure flag.

### Email and Google sign-in setup

Email verification, email OTP sign-in, password recovery and email changes use Resend's email API. Add a Resend API key and a verified sender address as `RESEND_API_KEY` and `EMAIL_FROM`. Until these values are configured, email-based registration and sign-in clearly report that email delivery is unavailable. Codes are random six-digit values, stored as a keyed SHA-256 digest with five-minute expiration, one-time use, a 60-second resend cooldown, and five verification attempts.

For Google sign-in, create a Google Cloud OAuth 2.0 Web application client. Set its authorized redirect URI to the exact `GOOGLE_CALLBACK_URL` (for local development, `http://localhost:3001/api/auth/google/callback`) and its authorized JavaScript origin to the exact `CLIENT_ORIGIN`. Put the client ID and secret only in `server/.env`. Configure `APP_BASE_URL` to the client origin. The server exchanges the authorization code and reads Google's verified OpenID Connect user profile; it does not accept a profile from the browser. OAuth state is single-use, short-lived, and browser-bound by a SameSite cookie.

Passwords use Node's built-in scrypt KDF with per-account random salts and fixed memory-hard parameters; session tokens are random, stored only as HMAC digests, and never put in browser storage. Session revocation disconnects that session's sockets; periodic server sweeps and per-event checks reject expired sessions. Account profile routes, team, world, and room APIs and signaling sockets require an authenticated session. `AUTHORIZED_ROOM_IDS` controls the server allowlist (defaults to `global-space`); room membership and peer signaling are checked server-side. Email changes take effect only after verifying the new address. Profile updates cannot change account verification or provider fields.

## Run

```bash
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend health: <http://localhost:3001/health>
- Current world API: <http://localhost:3001/api/world>
- Room summary API: <http://localhost:3001/api/rooms>

Open the frontend in two browser sessions. Both connect to `global-space`; movement in either office should move the corresponding peer in the other session. The connection badge shows whether the signaling server is connected. Use `npm run build` for production builds.

## Socket.IO presence events

The existing contract uses `username`, 3D `position` objects and room IDs to remain compatible with WebRTC and audio code. Client movement payloads omit identity; the server derives the sender from the socket.

```ts
// Client -> server
socket.emit('user:join', {
  username: 'Alice',
  position: { x: 500, y: 280, z: 0 },
  roomId: 'global-space', // optional
});
socket.emit('position:update', { position: { x: 510, y: 280, z: 0 } });

// Server -> client
socket.on('world:state', ({ roomId, users }) => { /* full room snapshot */ });
socket.on('user:join', (user) => { /* new peer */ });
socket.on('position:update', ({ userId, position, roomId }) => { /* peer moved */ });
socket.on('user:left', ({ userId, roomId }) => { /* peer disconnected */ });
socket.on('server:error', ({ message }) => { /* rejected payload */ });
```

The planar office bounds are `x: 0–1000`, `y: 0–560`, and `z: -50–50`. Movement is capped at 30 events per second per socket. `world:state` includes the joining user; remote-avatar consumers filter their own server socket ID. Existing `user:update-profile`, room sync, ping/pong, and WebRTC events remain available.

## Team members page

Choose **Team members** in the sidebar to see connected members, recent sessions, room, microphone status, last seen time, and a brief activity summary. Multiple sessions for one account are grouped as one member. The summary only reflects ProxiSpeak events such as joining, moving, and microphone use; it does not infer work outside the app. Members can update their profile name from this page. `GET /api/team` returns active and previous members; previous session records persist across restarts with MongoDB.

## MongoDB and geospatial preparation

The optional Mongoose model stores socket-session ID, display name, office ID, original pixel `x/y`, GeoJSON location, and last-seen time. Presence is upserted at join/profile/disconnect and at most once per ten seconds during movement. MongoDB's 2dsphere index uses `[longitude, latitude]` order. Pixel coordinates are mapped linearly into valid longitude/latitude ranges solely to prepare the index; the values are not geographic coordinates and must not be used as a substitute for pixel-distance proximity. Use preserved `x/y` for future planar distance calculations.

## Geospatial Proximity Audio & Office Acoustic Zones (Member 4)

ProxiSpeak's spatial audio engine pairs Web Audio API DSP nodes (`GainNode`, `StereoPannerNode`, and `BiquadFilterNode`) with real-time avatar movement:
- **Acoustic Zone Detection**: Automatically detects office zones based on 3D avatar position:
  - **Conference Room (`meeting`)**: Inverse-distance falloff with extended clarity (`minDistance: 50`, `maxDistance: 350`, `rolloff: 0.8`).
  - **Quiet Focus Pod (`whisper`)**: Exponential sound attenuation (`minDistance: 15`, `maxDistance: 90`, `rolloff: 1.5`) protecting deep focus.
  - **Creative Studio (`whisper`)**: Rapid sound damping inside acoustically treated production zones.
  - **All-Hands Auditorium (`auditorium`)**: Long-range linear projection (`maxDistance: 800`, `rolloff: 0.5`) carrying speech to large gatherings.
  - **Open Workspace (`normal`)**: Standard balanced linear falloff (`minDistance: 30`, `maxDistance: 260`).
- **Orientation-Aware Stereo Panning**: Derives relative sound azimuth from 3D avatar facing direction (`headingRad`), adjusting the StereoPannerNode smoothly (-1.0 to 1.0) as avatars turn in 3D space.
- **Cross-Zone Partition Occlusion**: Applies physical partition wall damping (0.42x volume multiplier and 2400 Hz low-pass filter) when communicating between private zones and the open floor.
- **Proximity Audio Simulator**: Embedded under **Audio settings & diagnostics** for real-time visualization of falloff curves, partition walls, and stereo azimuth.

## Checks and troubleshooting

```bash
npm run build
npm run test:spatial
npm run test:signaling
npm run dev:server # in one terminal
npm run test:presence # in another terminal
```

`test:presence` checks health, two clients joining, the joining snapshot, position delivery and identity, malformed coordinates, and disconnect notification against the running server. If clients cannot connect, verify the server is listening on port 3001 and `CLIENT_ORIGIN` matches the exact frontend origin. If MongoDB is configured, verify the URI and network access; `/health` reports whether persistence is configured, and the backend startup log confirms a successful database connection and index setup.
