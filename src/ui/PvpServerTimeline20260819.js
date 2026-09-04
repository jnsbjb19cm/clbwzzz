const CLOCK_REFRESH_MS = 15_000;
const INITIAL_CLOCK_SAMPLES = 5;
const REFRESH_CLOCK_SAMPLES = 3;
const TIMELINE_VISUAL_KEYS = ['x', 'y', 'progress', 'arcOffset', 'flightT'];

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

function installTimelineVisualWriteGuard(projectile) {
  if (!projectile || projectile.__serverTimelineWriteGuard20260830) return;
  projectile.__serverTimelineWriteGuard20260830 = true;
  const state = Object.fromEntries(
    TIMELINE_VISUAL_KEYS.map((key) => [key, projectile[key]]),
  );
  Object.defineProperty(projectile, '__serverTimelineVisualState20260830', {
    configurable: true,
    enumerable: false,
    value: state,
  });

  for (const key of TIMELINE_VISUAL_KEYS) {
    Object.defineProperty(projectile, key, {
      configurable: true,
      enumerable: true,
      get() {
        return state[key];
      },
      set(value) {
        // server-timeline projectile 的可见位置只能由 applyProjectileServerTimeline 写入。
        // AuthoritySync / CombatPolish 的旧 snapshot smoothing 仍可保留兼容元数据，
        // 但不能再抢写 x/y/progress/arcOffset/flightT。
        if (!this.__serverTimelineProjectile || this.__serverTimelineWrite20260830 === true) {
          state[key] = value;
        }
      },
    });
  }
}

export function calculateClockSample({
  clientSendMs,
  serverReceiveMs,
  serverSendMs,
  clientReceiveMs,
}) {
  const t1 = Number(clientSendMs);
  const t2 = Number(serverReceiveMs);
  const t3 = Number(serverSendMs);
  const t4 = Number(clientReceiveMs);
  if (![t1, t2, t3, t4].every(Number.isFinite)) return null;

  // RFC 5905/NTP four-timestamp estimator. Server/client monotonic clocks may use
  // different origins; only the offset between them matters for the battle timeline.
  const rttMs = Math.max(0, (t4 - t1) - (t3 - t2));
  const offsetMs = ((t2 - t1) + (t3 - t4)) / 2;
  return { offsetMs, rttMs };
}

export function chooseClockEstimate(samples = []) {
  const valid = samples
    .filter((sample) => Number.isFinite(Number(sample?.offsetMs)) && Number.isFinite(Number(sample?.rttMs)))
    .map((sample) => ({ offsetMs: Number(sample.offsetMs), rttMs: Math.max(0, Number(sample.rttMs)) }))
    .sort((a, b) => a.rttMs - b.rttMs);
  if (!valid.length) return null;

  const best = valid.slice(0, Math.min(3, valid.length));
  const offsets = best.map((sample) => sample.offsetMs).sort((a, b) => a - b);
  const middle = Math.floor(offsets.length / 2);
  const offsetMs = offsets.length % 2
    ? offsets[middle]
    : (offsets[middle - 1] + offsets[middle]) / 2;
  const rttMs = best.reduce((sum, sample) => sum + sample.rttMs, 0) / best.length;
  return { offsetMs, rttMs, sampleCount: valid.length };
}

export function estimateServerNowMs(clock, localNowMs = globalThis.performance?.now?.() ?? 0) {
  const local = finite(localNowMs);
  if (!clock?.synced || !Number.isFinite(Number(clock.offsetMs))) return null;
  return local + Number(clock.offsetMs);
}

export function configureProjectileServerTimeline(projectile, payload, clock, localNowMs = globalThis.performance?.now?.() ?? 0) {
  if (!projectile || !payload) return false;
  if (!(projectile.trajectory === 'straight' || projectile.trajectory === 'parabola')) return false;

  const launchServerTimeMs = Number(payload.launchServerTimeMs);
  const endServerTimeMs = Number(payload.endServerTimeMs);
  if (!Number.isFinite(launchServerTimeMs) || !Number.isFinite(endServerTimeMs) || endServerTimeMs <= launchServerTimeMs) {
    return false;
  }

  projectile.__serverTimelineProjectile = true;
  installTimelineVisualWriteGuard(projectile);
  projectile.__serverTimelineLaunchMs = launchServerTimeMs;
  projectile.__serverTimelineEndMs = endServerTimeMs;
  projectile.__serverTimelineDurationMs = Math.max(1, endServerTimeMs - launchServerTimeMs);
  projectile.__serverTimelineLastProgress = Math.max(0, finite(projectile.__serverTimelineLastProgress));

  // If the initial clock handshake has not completed yet, anchor to the send timestamp
  // carried by this event. This is only a temporary fallback; the NTP-style samples
  // replace it as soon as they arrive.
  if (!clock?.synced && Number.isFinite(Number(payload.serverTimeMs))) {
    projectile.__serverTimelineFallbackOffsetMs = Number(payload.serverTimeMs) - finite(localNowMs);
  }
  return true;
}

export function projectileTimelineState(projectile, serverNowMs) {
  if (!projectile?.__serverTimelineProjectile || !Number.isFinite(Number(serverNowMs))) return null;
  const launchMs = Number(projectile.__serverTimelineLaunchMs);
  const endMs = Number(projectile.__serverTimelineEndMs);
  if (!Number.isFinite(launchMs) || !Number.isFinite(endMs) || endMs <= launchMs) return null;

  const rawProgress = clamp01((Number(serverNowMs) - launchMs) / (endMs - launchMs));
  const previousProgress = clamp01(projectile.__serverTimelineLastProgress);
  const progress = Math.max(previousProgress, rawProgress);

  const startCol = finite(projectile.flightStartCol, finite(projectile.startCol, projectile.x));
  const startLane = finite(projectile.flightStartLane, finite(projectile.lane, projectile.y));
  const endCol = finite(projectile.flightEndCol, finite(projectile.hitCol, startCol));
  const endLane = finite(projectile.flightEndLane, finite(projectile.hitLane, startLane));
  const x = startCol + (endCol - startCol) * progress;
  const y = startLane + (endLane - startLane) * progress;
  const arcHeight = projectile.trajectory === 'parabola'
    ? Math.max(0, finite(projectile._arcHeight))
    : 0;
  const arcOffset = projectile.trajectory === 'parabola'
    ? 4 * arcHeight * progress * (1 - progress)
    : 0;

  return { progress, x, y, arcOffset };
}

export function applyProjectileServerTimeline(view, projectile, localNowMs = globalThis.performance?.now?.() ?? 0) {
  if (!projectile?.__serverTimelineProjectile) return false;
  const serverNow = estimateServerNowMs(view?.__pvpServerClock, localNowMs);
  const fallbackServerNow = finite(localNowMs) + finite(projectile.__serverTimelineFallbackOffsetMs, NaN);
  const effectiveServerNow = Number.isFinite(serverNow)
    ? serverNow
    : (Number.isFinite(fallbackServerNow) ? fallbackServerNow : null);
  if (!Number.isFinite(effectiveServerNow)) return false;

  const state = projectileTimelineState(projectile, effectiveServerNow);
  if (!state) return false;
  projectile.__serverTimelineLastProgress = state.progress;
  projectile.__serverTimelineWrite20260830 = true;
  try {
    projectile.x = state.x;
    projectile.y = state.y;
    projectile.progress = state.progress;
    projectile.arcOffset = state.arcOffset;
    projectile.flightT = state.progress * finite(projectile.__serverTimelineDurationMs, 1000) / 1000;
  } finally {
    projectile.__serverTimelineWrite20260830 = false;
  }
  return true;
}

export async function refreshPvpServerClock(view, sampleCount = INITIAL_CLOCK_SAMPLES) {
  if (!view?.pvpSocket?.emitAck || !view.__pvpAuthorityActive) return null;
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const clientSendMs = globalThis.performance?.now?.() ?? 0;
    try {
      const response = await view.pvpSocket.emitAck('pvp:authority:clock-sync', { clientSendMs });
      const clientReceiveMs = globalThis.performance?.now?.() ?? clientSendMs;
      const sample = calculateClockSample({
        clientSendMs,
        serverReceiveMs: response?.serverReceiveMs,
        serverSendMs: response?.serverSendMs,
        clientReceiveMs,
      });
      if (sample) samples.push(sample);
    } catch {
      // Clock sync is a visual-quality channel only; battle authority must not depend on it.
    }
  }

  const estimate = chooseClockEstimate(samples);
  if (!estimate) return null;
  view.__pvpServerClock = {
    synced: true,
    offsetMs: estimate.offsetMs,
    rttMs: estimate.rttMs,
    sampleCount: estimate.sampleCount,
    updatedLocalMs: globalThis.performance?.now?.() ?? 0,
  };
  return view.__pvpServerClock;
}

export function startPvpServerClock(view) {
  if (!view || view.__pvpServerClockTimer) return;
  void refreshPvpServerClock(view, INITIAL_CLOCK_SAMPLES);
  view.__pvpServerClockTimer = setInterval(() => {
    void refreshPvpServerClock(view, REFRESH_CLOCK_SAMPLES);
  }, CLOCK_REFRESH_MS);
}

export function stopPvpServerClock(view) {
  if (!view) return;
  if (view.__pvpServerClockTimer) clearInterval(view.__pvpServerClockTimer);
  view.__pvpServerClockTimer = null;
}
