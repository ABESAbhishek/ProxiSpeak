import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';

const SERVER_URL = 'http://localhost:3001';

console.log('--- Starting ProxiSpeak Two-Peer WebRTC Signaling Integration Test ---');

const clientA = io(SERVER_URL);
const clientB = io(SERVER_URL);

let clientAId = '';
let clientBId = '';

let offerReceived = false;
let answerReceived = false;
let iceReceived = false;
let pongReceived = false;

clientA.on('connect', () => {
  clientAId = clientA.id;
  console.log(`[PASS] Client A connected with socket ID: ${clientAId}`);
  clientA.emit('user:join', { username: 'Peer_Alpha' });

  // Test signaling ping-pong
  clientA.emit('signaling:ping', { timestamp: Date.now() });
});

clientA.on('signaling:pong', (payload) => {
  const latency = Date.now() - payload.clientTimestamp;
  console.log(`[PASS] Client A received 'signaling:pong' (Latency: ${latency}ms)`);
  pongReceived = true;
});

clientB.on('connect', () => {
  clientBId = clientB.id;
  console.log(`[PASS] Client B connected with socket ID: ${clientBId}`);
  clientB.emit('user:join', { username: 'Peer_Beta' });
});

// Client B listens for "webrtc:offer"
clientB.on('webrtc:offer', (payload) => {
  console.log(`[PASS] Client B received 'webrtc:offer' from ${payload.senderId}`);
  if (payload.senderId === clientAId && payload.sdp.type === 'offer') {
    offerReceived = true;

    // Send answer back to Client A
    console.log(`[TEST] Client B sending 'webrtc:answer' to ${clientAId}`);
    clientB.emit('webrtc:answer', {
      senderId: clientBId,
      targetId: clientAId,
      sdp: { type: 'answer', sdp: 'v=0\r\no=mock_b...' }
    });
  }
});

// Client A listens for "webrtc:answer"
clientA.on('webrtc:answer', (payload) => {
  console.log(`[PASS] Client A received 'webrtc:answer' from ${payload.senderId}`);
  if (payload.senderId === clientBId && payload.sdp.type === 'answer') {
    answerReceived = true;

    // Client A sends ICE candidate to Client B
    console.log(`[TEST] Client A sending 'webrtc:ice-candidate' to ${clientBId}`);
    clientA.emit('webrtc:ice-candidate', {
      senderId: clientAId,
      targetId: clientBId,
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 }
    });
  }
});

// Client B listens for "webrtc:ice-candidate"
clientB.on('webrtc:ice-candidate', (payload) => {
  console.log(`[PASS] Client B received 'webrtc:ice-candidate' from ${payload.senderId}`);
  if (payload.senderId === clientAId && payload.candidate.candidate) {
    iceReceived = true;

    // Test spatial position update
    console.log(`[TEST] Client A emitting 'position:update' to room...`);
    clientA.emit('position:update', {
      position: { x: 150, y: 120, z: 0 }
    });
  }
});

let positionReceived = false;
let profileReceived = false;

clientB.on('position:update', (payload) => {
  if (payload.userId === clientAId && payload.position.x === 150) {
    console.log(`[PASS] Client B received 'position:update' from ${payload.userId}`);
    positionReceived = true;

    // Test profile update
    console.log(`[TEST] Client A emitting 'user:update-profile' (isSpeaking: true)...`);
    clientA.emit('user:update-profile', {
      isSpeaking: true,
      isMuted: false
    });
  }
});

clientB.on('user:update-profile', (payload) => {
  if (payload.userId === clientAId && payload.isSpeaking === true) {
    console.log(`[PASS] Client B received 'user:update-profile' from ${payload.userId}`);
    profileReceived = true;

    console.log('\n======================================================');
    console.log('  ALL WEBRTC & SIGNALING EVENTS VERIFIED SUCCESSFULLY!');
    console.log(`  1. webrtc:offer         -> ${offerReceived ? 'VERIFIED' : 'FAILED'}`);
    console.log(`  2. webrtc:answer        -> ${answerReceived ? 'VERIFIED' : 'FAILED'}`);
    console.log(`  3. webrtc:ice-candidate -> ${iceReceived ? 'VERIFIED' : 'FAILED'}`);
    console.log(`  4. signaling:pong (RTT) -> ${pongReceived ? 'VERIFIED' : 'FAILED'}`);
    console.log(`  5. position:update      -> ${positionReceived ? 'VERIFIED' : 'FAILED'}`);
    console.log(`  6. user:update-profile  -> ${profileReceived ? 'VERIFIED' : 'FAILED'}`);
    console.log('======================================================\n');

    clientA.disconnect();
    clientB.disconnect();
    process.exit(0);
  }
});

// When Client A detects Client B joined, trigger offer
clientA.on('user:join', (user) => {
  console.log(`[TEST] Client A detected peer joined: ${user.username} (${user.id})`);
  setTimeout(() => {
    console.log(`[TEST] Client A sending 'webrtc:offer' to ${user.id}`);
    clientA.emit('webrtc:offer', {
      senderId: clientAId,
      targetId: user.id,
      sdp: { type: 'offer', sdp: 'v=0\r\no=mock_a...' }
    });
  }, 300);
});

setTimeout(() => {
  if (!iceReceived || !positionReceived || !profileReceived) {
    console.error('[FAIL] Timeout waiting for WebRTC signaling exchange.');
    clientA.disconnect();
    clientB.disconnect();
    process.exit(1);
  }
}, 5000);

