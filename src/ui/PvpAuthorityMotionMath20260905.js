export const UNIT_EXTRAPOLATE_SEC_20260905 = 0.1;
export const UNIT_CORRECTION_RATE_20260905 = 28;
export const UNIT_SNAP_DISTANCE_20260905 = 1.2;
export const UNIT_MAX_CORRECTION_SPEED_20260906 = 10;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 权威坐标只在显式 forceSnap 时瞬移。
 * 普通快照即使误差超过 1~3 格，也采用有速度上限的渐进纠正，避免多人高负载时
 * 因某一帧快照延迟直接把单位“拉”到服务端目标点。
 */
export function predictAuthorityAxis20260905({
  authoritative,
  velocity = 0,
  age = 0,
  current,
  frameDt = 1 / 60,
  min = -Infinity,
  max = Infinity,
  locked = false,
  forceSnap = false,
  maxExtrapolate = UNIT_EXTRAPOLATE_SEC_20260905,
  correctionRate = UNIT_CORRECTION_RATE_20260905,
  snapDistance = UNIT_SNAP_DISTANCE_20260905,
  maxCorrectionSpeed = UNIT_MAX_CORRECTION_SPEED_20260906,
} = {}) {
  const base = finite(authoritative, finite(current));
  const elapsed = clamp(
    finite(age),
    0,
    Math.max(0, finite(maxExtrapolate, UNIT_EXTRAPOLATE_SEC_20260905)),
  );
  const predicted = clamp(
    base + (locked ? 0 : finite(velocity) * elapsed),
    min,
    max,
  );
  const from = finite(current, predicted);
  const error = predicted - from;

  if (forceSnap) {
    return { value: predicted, predicted, error, snapped: true };
  }

  // snapDistance 保留在函数签名中兼容旧调用/诊断，但普通网络误差不再触发硬跳。
  void snapDistance;
  const dt = Math.max(0, finite(frameDt));
  const alpha = 1 - Math.exp(
    -Math.max(0, finite(correctionRate, UNIT_CORRECTION_RATE_20260905)) * dt,
  );
  const wantedStep = error * clamp(alpha, 0, 1);
  const maxStep = Math.max(0, finite(maxCorrectionSpeed, UNIT_MAX_CORRECTION_SPEED_20260906)) * dt;
  const correction = maxStep > 0
    ? clamp(wantedStep, -maxStep, maxStep)
    : 0;

  return {
    value: clamp(from + correction, min, max),
    predicted,
    error,
    snapped: false,
  };
}
