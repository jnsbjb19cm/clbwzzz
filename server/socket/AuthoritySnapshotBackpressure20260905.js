const installed = new WeakSet();

// Only the battle timer schedules snapshots. Do not throttle them twice.
export function installAuthoritySnapshotBackpressure20260905(io) {
  if (!io || installed.has(io)) return;
  installed.add(io);
  const previousTo = io.to.bind(io);
  io.to = function toWithAuthorityBackpressure20260905(target) {
    const operator = previousTo(target);
    if (!operator || operator.__authorityBackpressureWrapped20260905) return operator;
    operator.__authorityBackpressureWrapped20260905 = true;
    const previousEmit = operator.emit.bind(operator);
    operator.emit = function emitWithAuthorityBackpressure20260905(eventName, ...args) {
      // Replaceable world states must not queue behind older states on slow connections.
      // Combat events and results continue to use reliable delivery.
      return eventName === 'pvp:authority:snapshot'
        ? operator.volatile.emit(eventName, ...args)
        : previousEmit(eventName, ...args);
    };
    return operator;
  };
}

export const AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905 = Object.freeze({
  normalIntervalMs: 50, heavyIntervalMs: 1000 / 15, veryHeavyIntervalMs: 80,
});
