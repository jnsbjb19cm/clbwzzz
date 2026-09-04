function isNearBlack(r, g, b, threshold) {
  return r <= threshold && g <= threshold && b <= threshold;
}

function isOpaqueNonBlack(data, p, blackThreshold) {
  const i = p * 4;
  if (data[i + 3] < 16) return false;
  return !isNearBlack(data[i], data[i + 1], data[i + 2], blackThreshold);
}

function countOpaqueNonBlackNeighbors4(data, width, height, x, y, blackThreshold) {
  let count = 0;
  if (x > 0 && isOpaqueNonBlack(data, y * width + x - 1, blackThreshold)) count += 1;
  if (x + 1 < width && isOpaqueNonBlack(data, y * width + x + 1, blackThreshold)) count += 1;
  if (y > 0 && isOpaqueNonBlack(data, (y - 1) * width + x, blackThreshold)) count += 1;
  if (y + 1 < height && isOpaqueNonBlack(data, (y + 1) * width + x, blackThreshold)) count += 1;
  return count;
}

/** 对 RGBA 缓冲区从四边泛洪去除黑底 */
export function chromaKeyBlackFromEdgesBuffer(data, width, height, threshold = 24) {
  const remove = new Uint8Array(width * height);
  const queue = [];

  const pushIfBg = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const p = y * width + x;
    if (remove[p]) return;
    const i = p * 4;
    if (isNearBlack(data[i], data[i + 1], data[i + 2], threshold)) {
      remove[p] = 1;
      queue.push(p);
    }
  };

  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (queue.length) {
    const p = queue.pop();
    const x = p % width;
    const y = Math.floor(p / width);
    pushIfBg(x - 1, y);
    pushIfBg(x + 1, y);
    pushIfBg(x, y - 1);
    pushIfBg(x, y + 1);
  }

  for (let p = 0; p < width * height; p++) {
    if (remove[p]) data[p * 4 + 3] = 0;
  }
}

/**
 * 去除贴透明边缘的深色晕边。
 * 仅从透明区泛洪到近黑像素，并跳过被足够多非黑不透明像素包围的内部细节(瞳孔等)。
 */
export function defringeDarkEdgesBuffer(data, width, height, threshold = 40, minInteriorNeighbors = 2) {
  const total = width * height;
  const fringe = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = [];

  const tryEnqueue = (p) => {
    if (visited[p]) return;
    const i = p * 4;
    if (data[i + 3] < 16) {
      visited[p] = 1;
      queue.push(p);
      return;
    }
    if (!isNearBlack(data[i], data[i + 1], data[i + 2], threshold)) return;
    const x = p % width;
    const y = Math.floor(p / width);
    if (countOpaqueNonBlackNeighbors4(data, width, height, x, y, threshold) >= minInteriorNeighbors) {
      return;
    }
    visited[p] = 1;
    fringe[p] = 1;
    queue.push(p);
  };

  for (let x = 0; x < width; x++) {
    tryEnqueue(x);
    tryEnqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(y * width);
    tryEnqueue(y * width + width - 1);
  }
  for (let p = 0; p < total; p++) {
    if (data[p * 4 + 3] < 16) tryEnqueue(p);
  }

  while (queue.length) {
    const p = queue.pop();
    const x = p % width;
    const y = Math.floor(p / width);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      tryEnqueue(ny * width + nx);
    }
  }

  for (let p = 0; p < total; p++) {
    if (!fringe[p]) continue;
    const i = p * 4;
    data[i + 3] = 0;
  }
}

/** 柔化仍贴在边缘的半透明深色像素，减轻压缩黑边 */
export function softenDarkSemiTransparentEdgesBuffer(data, width, height, threshold = 52) {
  const alpha = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    alpha[p] = data[p * 4 + 3];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const a = alpha[p];
      if (a < 8 || a >= 248) continue;
      const i = p * 4;
      if (!isNearBlack(data[i], data[i + 1], data[i + 2], threshold)) continue;

      let touchesClear = false;
      for (let dy = -1; dy <= 1 && !touchesClear; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            touchesClear = true;
            break;
          }
          if (alpha[ny * width + nx] < 16) {
            touchesClear = true;
            break;
          }
        }
      }
      if (touchesClear) data[i + 3] = 0;
    }
  }
}

export function chromaKeyRgbaBuffer(data, width, height, {
  threshold = 20,
  defringe = true,
  soften = true,
} = {}) {
  const small = width * height <= 520;
  chromaKeyBlackFromEdgesBuffer(data, width, height, threshold);
  if (defringe) {
    defringeDarkEdgesBuffer(
      data,
      width,
      height,
      threshold + (small ? 10 : 16),
      small ? 3 : 2,
    );
  }
  if (soften) {
    softenDarkSemiTransparentEdgesBuffer(data, width, height, threshold + 28);
  }
  return data;
}