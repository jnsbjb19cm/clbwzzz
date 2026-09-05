const PATCH_FLAG = Symbol.for('clbwz.authoritySnapshotBackpressure20260905');
const lastSnapshotAt = new Map();

function snapshotIntervalMs(payload) {
  const unitCount = Array.isArray(payload?.units) ? payload.units.length : 0;
  if (unitCount >= 48) return 145; // ~7Hz，重场景优先保最新状态
  if (unitCount >= 24) return 110; // ~9Hz
  return 80; // ~12.5Hz
}

function keyOf(target) {
  if (Array.isArray(target)) return target.map(String).sort().join('|');
  if (target instanceof Set) return [...target].map(String).sort().join('|');
  return String(target ?? '');
}

/**
 * Socket.IO 默认会把所有普通 emit 排队；当客户端网络慢或服务器瞬间繁忙时，
 * 30Hz 世界快照会越积越多，玩家看到的就是“服务器延迟越来越大”。
 * 世界快照本身是可替代状态：旧的一帧没有价值，所以改为 volatile + 自适应限频。
 * 技能、子弹生成/命中、聊天、结算等事件仍然可靠发送，不做丢弃。
 */
export function installAuthoritySnapshotBackpressure20260905(io) {
  if (!io || globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousTo = io.to.bind(io);
  io.to = function toWithAuthorityBackpressure20260905(target) {
    const operator = previousTo(target);
    if (!operator || operator.__authorityBackpressureWrapped20260905) return operator;
    operator.__authorityBackpressureWrapped20260905 = true;

    const previousEmit = operator.emit.bind(operator);
    operator.emit = function emitWithAuthorityBackpressure20260905(eventName, ...args) {
      if (eventName !== 'pvp:authority:snapshot') {
        return previousEmit(eventName, ...args);
      }

      const payload = args[0] ?? {};
      const key = keyOf(target);
      const now = Date.now();
      const interval = snapshotIntervalMs(payload);
      const previousAt = lastSnapshotAt.get(key) ?? 0;
      if (now - previousAt < interval) return true;
      lastSnapshotAt.set(key, now);

      // volatile 确保传输层繁忙时直接丢旧快照，而不是形成排队延迟。
      return operator.volatile.emit(eventName, ...args);
    };
    return operator;
  };

  io.on('connection', (socket) => {
    socket.on('disconnect', () => {
      lastSnapshotAt.delete(String(socket.id));
    });
  });
}

export const AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905 = Object.freeze({
  normalIntervalMs: 80,
  heavyIntervalMs: 110,
  veryHeavyIntervalMs: 145,
});
