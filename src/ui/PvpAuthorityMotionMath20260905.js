export const UNIT_EXTRAPOLATE_SEC_20260905 = 0.1;
export const UNIT_CORRECTION_RATE_20260905 = 28;
export const UNIT_SNAP_DISTANCE_20260905 = 1.2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

  if (
    forceSnap
    || Math.abs(error) >= Math.max(0.01, finite(snapDistance, UNIT_SNAP_DISTANCE_20260905))
  ) {
    return { value: predicted, predicted, error, snapped: true };
  }

  const alpha = 1 - Math.exp(
    -Math.max(0, finite(correctionRate, UNIT_CORRECTION_RATE_20260905))
      * Math.max(0, finite(frameDt)),
  );
  return {
    value: from + error * clamp(alpha, 0, 1),
    predicted,
    error,
    snapped: false,
  };
}
