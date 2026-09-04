export const ITEM_EXTENSION_URL = new URL(
  '../../resources/img/itemextension.png',
  import.meta.url,
).href;

// Calculated from the 1536 x 1024 source sheet by
// scripts/analyze-itemextension-sprites.mjs (alpha >= 4 plus a 2 px safety
// margin). Do not replace these with rough grid cells: the rows and glow
// extents are irregular.
export const ITEM_EXTENSION_SPRITES = new Map([
  [80, { x: 10, y: 357, width: 152, height: 150 }],
  [81, { x: 166, y: 355, width: 154, height: 157 }],
  [82, { x: 316, y: 351, width: 156, height: 160 }],
  [83, { x: 468, y: 352, width: 152, height: 158 }],
  [84, { x: 625, y: 362, width: 141, height: 150 }],
  [85, { x: 772, y: 364, width: 144, height: 149 }],
  [86, { x: 919, y: 365, width: 152, height: 148 }],
  [87, { x: 1066, y: 355, width: 163, height: 159 }],
  [88, { x: 1225, y: 357, width: 159, height: 155 }],
  [89, { x: 1379, y: 356, width: 149, height: 152 }],
  [90, { x: 12, y: 521, width: 147, height: 151 }],
  [91, { x: 165, y: 519, width: 155, height: 154 }],
  [92, { x: 316, y: 526, width: 143, height: 151 }],
]);

const SHOP_ITEM_EXTENSION_SPRITES = new Map([
  [32, { x: 471, y: 529, width: 142, height: 151 }],
  [33, { x: 622, y: 529, width: 151, height: 146 }],
  [34, { x: 775, y: 528, width: 152, height: 147 }],
  [35, { x: 931, y: 527, width: 140, height: 149 }],
  [36, { x: 1080, y: 520, width: 148, height: 156 }],
  [37, { x: 1224, y: 526, width: 155, height: 149 }],
  [38, { x: 1374, y: 526, width: 144, height: 146 }],
  [39, { x: 13, y: 667, width: 149, height: 159 }],
  [40, { x: 170, y: 669, width: 150, height: 161 }],
  [41, { x: 327, y: 672, width: 153, height: 160 }],
  [42, { x: 491, y: 671, width: 154, height: 162 }],
  [43, { x: 4, y: 831, width: 175, height: 161 }],
  [44, { x: 212, y: 837, width: 156, height: 154 }],
  [45, { x: 398, y: 842, width: 175, height: 154 }],
  [46, { x: 597, y: 830, width: 181, height: 162 }],
  [47, { x: 800, y: 820, width: 188, height: 169 }],
  [48, { x: 1003, y: 815, width: 186, height: 176 }],
]);

export const CLOVER_EXTENSION_SPRITES = new Map([
  [1, { x: 15, y: 189, width: 155, height: 155 }],
  [2, { x: 182, y: 188, width: 173, height: 154 }],
  [3, { x: 368, y: 187, width: 167, height: 156 }],
  [4, { x: 543, y: 185, width: 160, height: 159 }],
  [5, { x: 699, y: 186, width: 160, height: 158 }],
]);

export function getItemExtensionSprite(itemId) {
  return ITEM_EXTENSION_SPRITES.get(Number(itemId)) ?? null;
}

// Exact access to the historical shop artwork. ShopViewController uses this
// only for explicit, user-approved aliases so indexes cannot accidentally
// override unrelated products.
export function getLegacyShopExtensionSprite(shopIndex) {
  return SHOP_ITEM_EXTENSION_SPRITES.get(Number(shopIndex)) ?? null;
}

export function getShopExtensionSprite(shopIndex, itemId) {
  return getItemExtensionSprite(itemId)
    ?? SHOP_ITEM_EXTENSION_SPRITES.get(Number(shopIndex))
    ?? null;
}

// ShopView imports this resource module already. Bootstrap the focused shop
// controller after the current module graph finishes; Node regression imports
// stay side-effect free because there is no DOM/window there.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  queueMicrotask(() => {
    import('./ClassicShopController.js')
      .then(({ installClassicShopController }) => installClassicShopController())
      .catch((error) => console.error('[classic-shop] controller install failed', error));
  });
}
