import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { registerWebRTCSignaling } from './signaling';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ProxiSpeak Signaling Server' });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

interface ConnectedUser {
  id: string;
  username: string;
  position: { x: number; y: number; z: number };
  joinedAt: number;
}

const users: Map<string, ConnectedUser> = new Map();

io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Handle user joining the space
  socket.on('user:join', (data: { username?: string; position?: { x: number; y: number; z: number } }) => {
    const username = data?.username || `User_${socket.id.substring(0, 4)}`;
    const position = data?.position || { x: 0, y: 0, z: 0 };

    const newUser: ConnectedUser = {
      id: socket.id,
      username,
      position,
      joinedAt: Date.now()
    };

    users.set(socket.id, newUser);

    console.log(`[Presence] ${username} (${socket.id}) joined.`);

    // Send current world state to the newly joined client
    const worldUsers: Record<string, ConnectedUser> = {};
    users.forEach((u, id) => {
      worldUsers[id] = u;
    });

    socket.emit('world:state', { users: worldUsers });

    // Broadcast new user to all other peers
    socket.broadcast.emit('user:join', newUser);
  });

  // Handle position updates (prepared for Week 2 proximity)
  socket.on('position:update', (data: { position: { x: number; y: number; z: number } }) => {
    const user = users.get(socket.id);
    if (user && data?.position) {
      user.position = data.position;
      socket.broadcast.emit('position:update', {
        userId: socket.id,
        position: data.position
      });
    }
  });

  // Register WebRTC signaling handlers ("webrtc:offer", "webrtc:answer", "webrtc:ice-candidate")
  registerWebRTCSignaling(io, socket);

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    users.delete(socket.id);
    io.emit('user:left', { userId: socket.id });
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  ProxiSpeak Signaling Server running on :${PORT}`);
  console.log(`  WebRTC Events: webrtc:offer, webrtc:answer, webrtc:ice-candidate`);
  console.log(`===============================================`);
});
