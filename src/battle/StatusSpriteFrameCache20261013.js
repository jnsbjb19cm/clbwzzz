// Share color-filtered animation frames across units. Never cache unit/UI canvases.
const frames = new Map();
const ids = new WeakMap();
let nextId = 0;
let bytes = 0;
let hits = 0;
let misses = 0;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 256;

export function statusFrameCacheStats() { return { entries: frames.size, bytes, hits, misses }; }

export function drawStatusSpriteFrame(ctx, source, sx, sy, sw, sh, dx, dy, dw, dh) {
  const filter = ctx.filter;
  // Spatial filters need padding; leave them on the original path.
  if (!filter || filter === 'none' || /blur|drop-shadow|url\(/.test(filter)
    || sw * sh > 1024 * 1024 || sw <= 0 || sh <= 0) {
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  if (!ids.has(source)) ids.set(source, ++nextId);
  const key = `${ids.get(source)}:${sx}:${sy}:${sw}:${sh}:${filter}`;
  let entry = frames.get(key);
  if (entry) {
    hits++;
    frames.delete(key);
    frames.set(key, entry);
  } else {
    misses++;
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(Math.ceil(sw), Math.ceil(sh))
      : Object.assign(document.createElement('canvas'), { width: Math.ceil(sw), height: Math.ceil(sh) });
    const target = canvas.getContext('2d');
    if (!target || !('filter' in target)) {
      ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    target.filter = filter;
    target.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    entry = { canvas, bytes: canvas.width * canvas.height * 4 };
    while (frames.size && (bytes + entry.bytes > MAX_BYTES || frames.size >= MAX_ENTRIES)) {
      const oldest = frames.keys().next().value;
      bytes -= frames.get(oldest).bytes;
      frames.delete(oldest);
    }
    frames.set(key, entry);
    bytes += entry.bytes;
  }
  ctx.save();
  ctx.filter = 'none';
  ctx.drawImage(entry.canvas, 0, 0, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}
