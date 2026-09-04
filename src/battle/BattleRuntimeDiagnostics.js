const MAX_RECORDED_ERRORS = 80;
const LOG_THROTTLE_MS = 1500;

const errorLog = [];
const lastLogAt = new Map();

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export class BattleRuntimeError extends Error {
  constructor(phase, cause, context = {}) {
    super(`[battle:${phase}] ${errorMessage(cause)}`, { cause });
    this.name = 'BattleRuntimeError';
    this.phase = phase;
    this.context = context;
  }
}

export function reportBattleRuntimeError(phase, cause, context = {}) {
  const error = cause instanceof BattleRuntimeError
    ? cause
    : new BattleRuntimeError(phase, cause, context);
  const record = {
    at: Date.now(),
    phase: error.phase,
    message: error.message,
    context: error.context,
    stack: error.stack ?? '',
  };
  errorLog.push(record);
  if (errorLog.length > MAX_RECORDED_ERRORS) errorLog.splice(0, errorLog.length - MAX_RECORDED_ERRORS);
  globalThis.__battleRuntimeErrors = errorLog;

  const logKey = `${record.phase}:${record.context?.uid ?? record.context?.skillId ?? ''}:${record.message}`;
  const previous = lastLogAt.get(logKey) ?? 0;
  if (record.at - previous >= LOG_THROTTLE_MS) {
    lastLogAt.set(logKey, record.at);
    console.error(error.message, error.context, error.cause ?? cause);
  }

  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('battle:runtime-error', { detail: record }));
  }
  return error;
}

export function guardBattleRuntime(phase, context, operation, fallback = undefined) {
  try {
    return operation();
  } catch (cause) {
    const error = reportBattleRuntimeError(phase, cause, {
      battleTime: finite(context?.battleTime),
      tick: finite(context?.tick),
      ...context,
    });
    if (globalThis.__battleThrowRuntimeErrors === true) throw error;
    return fallback;
  }
}

export function guardBattlePromise(phase, context, promise) {
  return Promise.resolve(promise).catch((cause) => {
    const error = reportBattleRuntimeError(phase, cause, context);
    if (globalThis.__battleThrowRuntimeErrors === true) throw error;
    return undefined;
  });
}

export function clearBattleRuntimeErrors() {
  errorLog.length = 0;
  lastLogAt.clear();
}
