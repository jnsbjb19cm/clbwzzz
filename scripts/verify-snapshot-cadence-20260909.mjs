import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installAuthoritySnapshotBackpressure20260905 } from '../server/socket/AuthoritySnapshotBackpressure20260905.js';

const source = readFileSync('server/socket/registerPvpAuthorityHandlers.js', 'utf8');
const constants = source.slice(source.indexOf('const STEP_SECONDS'), source.indexOf('const FINISHED_RETENTION_MS'));
const factory = source.slice(source.indexOf('function ensureAuthorityBattle('), source.indexOf('function currentRoomAndBattle('));
let now = 1000;
const received = [];
const io = { on() {}, to() { return { emit() {}, volatile: { emit(event, payload) { received.push({ at: now, ...payload }); } } }; } };
const dateNow = Date.now;
Date.now = () => now;
installAuthoritySnapshotBackpressure20260905(io);
try {
  for (const count of [12, 30, 60, 120]) {
    let callback;
    let time = 0;
    const room = { mode: 'pvp', status: 'starting', members: new Map() };
    const units = Array.from({ length: count }, () => ({ alive: true }));
    const battle = { status: 'playing', engine: { units, projectiles: [] }, tick(dt) { time += dt; } };
    const ctx = vm.createContext({
      Map, Set, Number, Math, authorityBattles: new Map(), monotonicNowMs: () => now,
      roomManager: { getTeams: () => ({ room }), getRoom: () => room },
      createBattle: () => battle, setInterval: fn => { callback = fn; return 1; },
      emitNewProjectileLaunchEvents() {}, emitRemovedProjectileEvents() {}, runBotAI() {},
      broadcastSnapshots: () => io.to(`viewer-${count}`).emit('pvp:authority:snapshot', { units, time }),
    });
    vm.runInContext(`${constants}\n${factory}\nensureAuthorityBattle(1, {}, {});`, ctx);
    received.length = 0;
    const start = now;
    for (let tick = 1; tick <= 300; tick++) { now = start + tick * 1000 / 30; callback(); }
    const gaps = received.slice(1).map((r, i) => r.at - received[i].at);
    const maximum = Math.max(...gaps);
    console.log(`${count} units: ${received.length} snapshots/10s; maximum interval ${maximum.toFixed(1)}ms; simulation ${time.toFixed(3)}s`);
    assert.ok(maximum <= 101, `positions freeze for ${maximum.toFixed(1)}ms with ${count} units`);
    assert.ok(Math.abs(time - 10) < 0.04, 'simulation must keep real time');
  }
} finally { Date.now = dateNow; }
