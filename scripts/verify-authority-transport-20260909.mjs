import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { AUTHORITY_TRANSPORT_OPTIONS } from '../server/socket/AuthorityTransportOptions.js';
import { installAuthoritySnapshotBackpressure20260905 } from '../server/socket/AuthoritySnapshotBackpressure20260905.js';

const httpServer = http.createServer();
const io = new Server(httpServer, { ...AUTHORITY_TRANSPORT_OPTIONS, transports: ['websocket'] });
installAuthoritySnapshotBackpressure20260905(io);
await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
let client;
const deadline = setTimeout(() => { console.error('transport test timeout'); process.exit(1); }, 10000);
try {
  const socketReady = new Promise(resolve => io.once('connection', resolve));
  client = connect(`http://127.0.0.1:${httpServer.address().port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  const socket = await socketReady;
  assert.match(socket.conn.transport.socket.extensions, /permessage-deflate/);
  const units = Array.from({ length: 120 }, (_, i) => ({ uid: i, col: i % 12, lane: i % 5, state: 'moving', hp: 1000 }));
  const received = new Promise(resolve => client.once('pvp:authority:snapshot', resolve));
  // Wait until the transport has flushed the connection handshake before testing volatile delivery.
  await new Promise(resolve => setTimeout(resolve, 20));
  io.to(socket.id).emit('pvp:authority:snapshot', { seq: 1, units });
  assert.deepEqual((await received).units, units);
  const finished = new Promise(resolve => client.once('pvp:authority:finished', resolve));
  io.to(socket.id).emit('pvp:authority:finished', { winner: 'blue' });
  assert.deepEqual(await finished, { winner: 'blue' });
  console.log('PASS real Socket.IO: compression negotiated, 120-unit snapshot intact, reliable result delivered');
} finally {
  clearTimeout(deadline);
  client?.disconnect();
  await new Promise(resolve => io.close(resolve));
}
