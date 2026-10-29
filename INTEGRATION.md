# ProxiSpeak Integration Guide

## Existing Architecture

- Frontend: React, TypeScript, Vite, and Socket.IO Client
- Backend: Node.js, Express, Socket.IO, and TypeScript
- Shared contracts: `shared/types.ts`
- Client socket service: `client/src/services/socket.ts`
- Backend entry point: `server/src/index.ts`
- WebRTC signaling: `server/src/signaling.ts`

## Existing Communication Events

### Client to Server

- `user:join`
- `position:update`
- `user:update-profile`
- `world:sync`
- `webrtc:offer`
- `webrtc:answer`
- `webrtc:ice-candidate`
- `signaling:ping`

### Server to Client

- `world:state`
- `user:join`
- `user:left`
- `position:update`
- `user:update-profile`
- `webrtc:offer`
- `webrtc:answer`
- `webrtc:ice-candidate`
- `webrtc:error`
- `signaling:pong`

## Configuration

- Default backend port: `3001`
- Frontend configuration variable: `VITE_SERVER_URL`
- Health endpoint: `/health`
- World endpoint: `/api/world`
- Rooms endpoint: `/api/rooms`

## Integration Rules

1. Reuse the existing Socket.IO singleton.
2. Use `shared/types.ts` as the shared type contract.
3. Confirm event payloads against the backend handlers before adding new events.
4. Validate position updates on the server.
5. Clean up WebRTC connections and event listeners when peers disconnect.
6. Never commit secrets or environment files.
7. Merge changes through reviewed pull requests.

## Pending Work

Confirm the virtual-office Canvas implementation and integrate it with the existing position and world-state events. Confirm any additional proximity events with the backend and audio owners before implementing them.