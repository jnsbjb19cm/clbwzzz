/**
 * 2026-10-06：按**文件名**取物品图标。
 *
 * 背景：`resources/img/<物品名>.png` 放的是单张美术图（多特的巫蛊.png、安娜的冰晶.png、
 * 沃里尔的铠甲.png、树妖的核心.png、神秘技能书.png…），而背包/商店走的是精灵图集
 * （`item_img` 里的数字索引）。新加的材料只有单图、没有图集条目，于是按名字兜底。
 *
 * 用法：`namedItemIconUrl(item)`，取不到返回 null（调用方回落到图集/占位）。
 */
const SOURCES = import.meta.glob('../../resources/img/*.png', { eager: true, query: '?url', import: 'default' });

/** 美术文件名 → URL（键同时存原名与小写，方便大小写不一致时命中） */
const BY_FILE_NAME = new Map();
for (const [path, url] of Object.entries(SOURCES)) {
  const file = String(path).split('/').pop().replace(/\.png$/i, '');
  if (!file) continue;
  BY_FILE_NAME.set(file, url);
  BY_FILE_NAME.set(file.toLowerCase(), url);
}

/** 名字对不上美术文件时的显式别名（物品名 → 美术文件名） */
const ALIASES = Object.freeze({
  树妖的精元: '树妖的核心',
  树妖的核心: '树妖的精元',
});

export function namedItemIconByName(name) {
  const key = String(name ?? '').trim();
  if (!key) return null;
  const alias = ALIASES[key];
  return BY_FILE_NAME.get(key) ?? BY_FILE_NAME.get(key.toLowerCase()) ?? (alias ? BY_FILE_NAME.get(alias) ?? null : null);
}

/**
 * 传物品对象（Item / 物品表条目 / {name} 都行）：
 * 先按 `img`（新材料的 item_img 直接写了名字）再按 `name` 找单图。
 */
export function namedItemIconUrl(item) {
  if (!item) return null;
  return namedItemIconByName(item.img) ?? namedItemIconByName(item.name) ?? namedItemIconByName(item.item_name) ?? null;
}
