import assert from 'node:assert/strict';
import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';

const baseUrl = process.env.TEST_SERVER_URL || 'http://localhost:3001';
const waitFor = (socket, event, predicate = () => true, timeoutMs = 4000) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out waiting for ${event}`)); }, timeoutMs);
  const listener = (payload) => {
    if (!predicate(payload)) return;
    clearTimeout(timeout);
    socket.off(event, listener);
    resolve(payload);
  };
  socket.on(event, listener);
});

const a = io(baseUrl, { autoConnect: false, reconnection: false });
const b = io(baseUrl, { autoConnect: false, reconnection: false });
try {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  await Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect'), a.connect(), b.connect()]);

  const rejectedJoin = await new Promise((resolve) => a.emit('user:join', { username: '   ' }, resolve));
  assert.equal(rejectedJoin.ok, false);
  assert.match(rejectedJoin.message, /1–32/);
  console.log('[PASS] blank display name rejected before registration');

  const aWorld = waitFor(a, 'world:state', (payload) => Object.keys(payload.users || {}).length === 1);
  const aAck = new Promise((resolve) => a.emit('user:join', { username: 'Alice', position: { x: 100, y: 120, z: 0 } }, resolve));
  const [firstSnapshot, firstAck] = await Promise.all([aWorld, aAck]);
  const aId = a.id;
  assert.equal(firstAck.ok, true);
  assert.equal(firstAck.userId, aId, 'server provides the participant identity');
  assert.equal(firstSnapshot.users[aId].username, 'Alice');

  const bJoinOnA = waitFor(a, 'user:join', (user) => user.username === 'Bob');
  const bWorld = waitFor(b, 'world:state', (payload) => Object.keys(payload.users || {}).length === 2);
  const bAck = new Promise((resolve) => b.emit('user:join', { username: 'Bob', position: { x: 200, y: 220, z: 0 } }, resolve));
  const [joined, snapshot, secondAck] = await Promise.all([bJoinOnA, bWorld, bAck]);
  assert.equal(secondAck.ok, true);
  assert.equal(secondAck.userId, b.id);
  assert.equal(joined.id, b.id);
  assert.equal(Object.keys(snapshot.users).length, 2);
  assert.equal(snapshot.users[a.id].username, 'Alice');
  console.log('[PASS] health, joining snapshot, and two-user join broadcast');

  const teamBefore = await (await fetch(`${baseUrl}/api/team`)).json();
  assert.equal(teamBefore.active.length, 2);

  const movement = waitFor(b, 'position:update', (payload) => payload.userId === a.id);
  a.emit('position:update', { userId: b.id, position: { x: 345, y: 240, z: 0 } });
  const moved = await movement;
  assert.equal(moved.position.x, 345);
  assert.equal(moved.userId, a.id, 'sender identity must come from the socket');
  console.log('[PASS] position update broadcast and server-controlled sender identity');

  const badPosition = waitFor(a, 'server:error');
  a.emit('position:update', { x: Number.NaN, y: 9000, z: 0 });
  assert.match((await badPosition).message, /Position/);
  console.log('[PASS] malformed/out-of-bounds position rejected');

  const disconnectedUserId = b.id;
  const left = waitFor(a, 'user:left', (payload) => payload.userId === disconnectedUserId);
  b.disconnect();
  await left;
  const teamAfter = await (await fetch(`${baseUrl}/api/team`)).json();
  assert.equal(teamAfter.active.some((member) => member.id === disconnectedUserId), false);
  assert.equal(teamAfter.previous.some((member) => member.id === disconnectedUserId), true);
  assert.match(teamAfter.previous.find((member) => member.id === disconnectedUserId).summary, /Left/);
  console.log('[PASS] disconnect notification and previous-session activity summary');
} finally {
  a.disconnect();
  b.disconnect();
}
