import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  CLOVER_EXTENSION_SPRITES,
  getShopExtensionSprite,
  ITEM_EXTENSION_SPRITES,
} from '../src/ui/ItemExtensionSprites.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'resources', 'img', 'itemextension.png');
const DETECT_ALPHA = 32;
const CROP_ALPHA = 4;
const CROP_PADDING = 2;
const EXPECTED_ROW_COUNTS = [9, 5, 10, 10, 4, 6];

function findComponents(data, width, height, alphaThreshold) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components = [];

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || data[start * 4 + 3] < alphaThreshold) continue;
    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let pixels = 0;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixels += 1;

      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (let direction = 0; direction < neighbors.length; direction += 1) {
        const next = neighbors[direction];
        if (next < 0 || next >= pixelCount || visited[next]) continue;
        if (direction === 0 && x === 0) continue;
        if (direction === 1 && x === width - 1) continue;
        if (data[next * 4 + 3] < alphaThreshold) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      pixels,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    });
  }
  return components;
}

function splitRows(components) {
  const sorted = [...components].sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
  const rows = [];
  for (const component of sorted) {
    const row = rows.at(-1);
    if (!row || Math.abs(component.centerY - row.centerY) > 70) {
      rows.push({ centerY: component.centerY, items: [component] });
      continue;
    }
    row.items.push(component);
    row.centerY = row.items.reduce((sum, item) => sum + item.centerY, 0) / row.items.length;
  }
  return rows.map((row) => ({
    centerY: row.centerY,
    items: row.items.sort((a, b) => a.centerX - b.centerX),
  }));
}

function measureByNearestCenter(data, imageWidth, imageHeight, components) {
  const bounds = components.map(() => ({
    minX: imageWidth,
    minY: imageHeight,
    maxX: -1,
    maxY: -1,
  }));
  for (let y = 0; y < imageHeight; y += 1) {
    for (let x = 0; x < imageWidth; x += 1) {
      if (data[(y * imageWidth + x) * 4 + 3] < CROP_ALPHA) continue;
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < components.length; index += 1) {
        const component = components[index];
        const dx = x - component.centerX;
        const dy = y - component.centerY;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      }
      const box = bounds[nearest];
      box.minX = Math.min(box.minX, x);
      box.minY = Math.min(box.minY, y);
      box.maxX = Math.max(box.maxX, x);
      box.maxY = Math.max(box.maxY, y);
    }
  }
  return bounds.map((box, index) => {
    assert(box.maxX >= box.minX && box.maxY >= box.minY, `empty sprite ${index + 1}`);
    const minX = Math.max(0, box.minX - CROP_PADDING);
    const minY = Math.max(0, box.minY - CROP_PADDING);
    const maxX = Math.min(imageWidth - 1, box.maxX + CROP_PADDING);
    const maxY = Math.min(imageHeight - 1, box.maxY + CROP_PADDING);
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  });
}

const { data, info } = await sharp(SOURCE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

assert.equal(info.width, 1536);
assert.equal(info.height, 1024);

const mainComponents = findComponents(data, info.width, info.height, DETECT_ALPHA)
  .filter((component) => component.width >= 100
    && component.height >= 100
    && component.pixels >= 10_000);
const rows = splitRows(mainComponents);
assert.deepEqual(rows.map((row) => row.items.length), EXPECTED_ROW_COUNTS);
const orderedComponents = rows.flatMap((row) => row.items);
const measured = measureByNearestCenter(data, info.width, info.height, orderedComponents)
  .map((sprite, index) => ({ number: index + 1, ...sprite }));

for (const sprite of measured) {
  console.log(
    `${String(sprite.number).padStart(2, '0')}: { x: ${sprite.x}, y: ${sprite.y}, width: ${sprite.width}, height: ${sprite.height} }`,
  );
}

const byNumber = new Map(measured.map(({ number, ...rect }) => [number, rect]));
for (let level = 1; level <= 5; level += 1) {
  assert.deepEqual(
    CLOVER_EXTENSION_SPRITES.get(level),
    byNumber.get(level + 9),
    `clover level ${level} crop is stale`,
  );
}
for (let itemId = 80; itemId <= 92; itemId += 1) {
  assert.deepEqual(
    ITEM_EXTENSION_SPRITES.get(itemId),
    byNumber.get(itemId - 65),
    `item ${itemId} crop is stale`,
  );
}
for (let shopIndex = 32; shopIndex <= 48; shopIndex += 1) {
  assert.deepEqual(
    getShopExtensionSprite(shopIndex, Number.NaN),
    byNumber.get(shopIndex - 4),
    `shop product ${shopIndex} crop is stale`,
  );
}
console.log('itemextension sprite mappings match calculated alpha bounds');
