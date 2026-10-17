import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { registerWebRTCSignaling } from './signaling';
import { roomManager } from './roomManager';

const app = express();
const PORT = process.env.PORT || 3001;
const startTime = Date.now();

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// REST Endpoints (Server Monitoring & API)
// -------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ProxiSpeak Backend & Signaling Server',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    activeUsers: roomManager.getTotalUsersCount(),
    activeRooms: roomManager.getRoomSummaries().length,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/world', (_req, res) => {
  res.json({
    totalUsers: roomManager.getTotalUsersCount(),
    users: roomManager.getAllUsers().map((u) => ({
      id: u.id,
      username: u.username,
      position: u.position,
      roomId: u.roomId,
      isMuted: u.isMuted
    }))
  });
});

app.get('/api/rooms', (_req, res) => {
  res.json({
    rooms: roomManager.getRoomSummaries()
  });
});

// -------------------------------------------------------------
// Socket.io Real-Time Server
// -------------------------------------------------------------

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // 1. User Join Event
  socket.on(
    'user:join',
    (data: {
      username?: string;
      position?: { x: number; y: number; z: number };
      roomId?: string;
    }) => {
      const user = roomManager.addUser(socket.id, data?.username, data?.position, data?.roomId);
      socket.join(user.roomId);

      console.log(`[Presence] ${user.username} (${user.id}) joined room: '${user.roomId}'`);

      // Send the snapshot of the world in this room to the joining user
      const roomUsers = roomManager.getUsersInRoom(user.roomId);
      socket.emit('world:state', {
        roomId: user.roomId,
        users: roomUsers
      });

      // Broadcast to all other peers in the room
      socket.to(user.roomId).emit('user:join', user);
    }
  );

  // 2. Spatial Position Update Event (Prepared for Week 2 Proximity Audio)
  socket.on(
    'position:update',
    (data: { position: { x: number; y: number; z: number } }) => {
      const updatedUser = roomManager.updatePosition(socket.id, data?.position);
      if (updatedUser) {
        socket.to(updatedUser.roomId).emit('position:update', {
          userId: socket.id,
          position: updatedUser.position,
          roomId: updatedUser.roomId
        });
      }
    }
  );

  // 3. User Profile Update Event (e.g. mic mute/unmute state broadcast)
  socket.on(
    'user:update-profile',
    (data: { isMuted?: boolean; isSpeaking?: boolean; username?: string }) => {
      const updatedUser = roomManager.updateProfile(socket.id, data);
      if (updatedUser) {
        socket.to(updatedUser.roomId).emit('user:update-profile', {
          userId: socket.id,
          isMuted: updatedUser.isMuted,
          isSpeaking: updatedUser.isSpeaking,
          username: updatedUser.username
        });
      }
    }
  );

  // 4. Client World Refresh Request
  socket.on('world:sync', (data?: { roomId?: string }) => {
    const user = roomManager.getUser(socket.id);
    const targetRoom = data?.roomId || user?.roomId || roomManager.DEFAULT_ROOM;
    const roomUsers = roomManager.getUsersInRoom(targetRoom);
    socket.emit('world:state', {
      roomId: targetRoom,
      users: roomUsers
    });
  });

  // 5. Register WebRTC Signaling Relay ("webrtc:offer", "webrtc:answer", "webrtc:ice-candidate")
  registerWebRTCSignaling(io, socket);

  // 6. Handle Disconnection
  socket.on('disconnect', (reason: string) => {
    console.log(`[Socket] Client disconnected: ${socket.id} (reason: ${reason})`);
    const removedUser = roomManager.removeUser(socket.id);
    if (removedUser) {
      io.to(removedUser.roomId).emit('user:left', {
        userId: socket.id,
        roomId: removedUser.roomId
      });
    }
  });
});

// -------------------------------------------------------------
// Graceful Shutdown Handling
// -------------------------------------------------------------

function shutdown() {
  console.log('[Server] Gracefully shutting down...');
  io.close(() => {
    console.log('[Socket] Socket.io server closed.');
    server.close(() => {
      console.log('[HTTP] HTTP server closed.');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  ProxiSpeak Backend & Signaling Server on :${PORT}`);
  console.log(`  Health & Metrics: http://localhost:${PORT}/health`);
  console.log(`  World API:        http://localhost:${PORT}/api/world`);
  console.log(`  WebRTC Events:    webrtc:offer, webrtc:answer, webrtc:ice-candidate`);
  console.log(`=======================================================`);
});
