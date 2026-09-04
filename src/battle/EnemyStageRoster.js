const MAX_ENEMY_CARD_TYPES = 15;
// The design document numbers columns from the enemy area's left edge (nearest the player).
// Logical columns 1..5 correspond to grid columns 7..11.
const ENEMY_COLUMNS = Object.freeze({ 1: 7, 2: 8, 3: 9, 4: 10, 5: 11 });

// Fixed adventure roster rules. `column` follows the document: enemy-area left to right.
const RULES = [
  { id: 2, from: 1, column: 3, count: [3, 3, 5], defense: true, replaceAt: 8, replaceWith: 21 },
  { id: 1, from: 1, to: 5, column: 4, count: 3, defense: true, replaceAt: 6, replaceWith: 18 },
  { id: 4, from: 1, to: 2, column: 4, count: 1, defense: true, replaceAt: 3, replaceWith: 25 },
  { id: 9, from: 1, to: 8, column: 4, count: 3, defense: true },
  { id: 11, from: 1, to: 9, column: 3, count: [1, 3, 3], defense: true },
  { id: 82, from: 1, to: 5, column: 5, count: 1, defense: true, replaceAt: 5, replaceStage: 2, replaceWith: 70 },
  { id: 17, from: 1, to: 5, column: 5, count: 1, defense: true, replaceAt: 5, replaceWith: 54 },
  { id: 62, from: 1, column: 4, count: 2, defense: true },
  { id: 5, from: 1, to: 8, column: 3, count: [1, 3, 3] },
  { id: 6, from: 1, to: 8, column: 3, count: [1, 3, 3] },
  { id: 7, from: 1, to: 5, column: 3, count: [1, 3, 3], replaceAt: 6, replaceWith: 30 },
  { id: 8, from: 1, to: 8, column: 3, count: 1, replaceAt: 2, replaceWith: 31 },
  { id: 12, from: 1, to: 8, column: 4, count: [1, 3, 3] },
  { id: 16, from: 1, column: 3, count: [1, 3, 5] },
  { id: 65, from: 5, column: 3, count: [1, 2, 3] },
  { id: 69, from: 4, to: 9, column: 3, count: 3, replaceAt: 10, replaceWith: 102 },
  { id: 18, from: 6, column: 5, count: [1, 2, 3], defense: true },
  { id: 19, from: 4, to: 7, column: 4, count: [1, 2, 3], defense: true, replaceAt: 8, replaceStage: 4, replaceWith: 32 },
  { id: 20, from: 5, column: [3, 4, 5], count: 3, defense: true },
  { id: 21, from: 8, column: 1, count: [3, 3, 5], defense: true },
  { id: 22, from: 5, to: 6, column: [2, 4], count: [2, 3, 3], defense: true, replaceAt: 7, replaceStage: 3, replaceWith: 36 },
  { id: 23, from: 5, to: 9, column: 4, count: 3 },
  { id: 24, from: 5, to: 8, column: 4, count: [1, 2, 3], defense: true, replaceAt: 9, replaceWith: 39 },
  { id: 25, from: 3, column: [3, 4, 5], count: [1, 2, 3], defense: true },
  { id: 26, from: 3, to: 6, column: 4, count: [1, 2, 3], defense: true, replaceAt: 7, replaceWith: 51 },
  { id: 27, from: 4, column: 3, count: [1, 3, 3] },
  { id: 28, from: 3, minStage: 3, column: 3, count: [1, 2, 3] },
  { id: 30, from: 2, column: 3, count: [1, 2, 3] },
  { id: 31, from: 2, column: 3, count: [1, 2, 3] },
  { id: 36, from: 7, minStage: 3, column: [3, 4, 5], count: 1, defense: true },
  { id: 39, from: 9, column: 4, count: [1, 2, 3], defense: true },
  { id: 40, from: 5, column: 4, count: [1, 2, 3] },
  { id: 41, from: 8, column: 4, count: 1 },
  { id: 43, from: 8, column: 4, count: 1 },
  { id: 45, from: 4, minStage: 5, column: 4, count: [1, 2, 3] },
  { id: 46, from: 9, column: 5, count: 1, defense: true },
  { id: 48, from: 10, column: 2, count: 1, defense: true },
  { id: 51, from: 7, column: 4, count: [1, 2, 3], defense: true },
  { id: 54, from: 5, column: 3, count: 1, defense: true },
  { id: 55, from: 9, minStage: 3, column: 3, count: 1, defense: true },
  { id: 58, from: 7, minStage: 4, column: [3, 4, 5], count: 1, defense: true },
  { id: 63, from: 4, minStage: 3, column: 4, count: [1, 1, 2], defense: true },
  { id: 64, from: 7, column: [3, 4], count: [1, 2, 3] },
  { id: 70, from: 5, minStage: 2, column: 5, count: 1, defense: true },
  { id: 72, from: 8, minStage: 5, column: [4, 5], count: 1, defense: true },
  { id: 73, from: 6, column: 3, count: [1, 2, 3] },
  { id: 75, from: 9, minStage: 5, column: 4, count: 1, defense: true },
  { id: 76, from: 10, minStage: 3, column: 4, count: 1 },
  { id: 77, from: 10, minStage: 4, column: 4, count: 1, defense: true },
  { id: 85, from: 6, column: 4, count: 1 },
  { id: 87, from: 9, column: 3, count: [1, 2, 3] },
  { id: 92, from: 7, minStage: 3, column: 2, count: 1, defense: true },
  { id: 95, from: 9, minStage: 5, column: 3, count: 1 },
  { id: 100, from: 11, column: 3, count: 2 },
  { id: 102, from: 10, column: 3, count: 2 },
  { id: 104, from: 10, minStage: 5, column: [3, 4, 5], count: 1, defense: true },
  { id: 105, from: 8, column: 3, count: [1, 1, 3] },
  { id: 110, from: 10, minStage: 4, column: 5, count: 1 },
  { id: 114, from: 7, column: [4, 5], count: 1, defense: true },
  { id: 116, from: 14, column: 3, count: 1, defense: true },
  { id: 56, from: 14, minStage: 2, column: 3, count: 1 },
];

function phaseFor(chapter) { return chapter <= 5 ? 0 : chapter <= 10 ? 1 : 2; }
function reached(chapter, stageNum, targetChapter, targetStage = 1) {
  return chapter > targetChapter || (chapter === targetChapter && stageNum >= targetStage);
}
function countFor(value, phase) {
  return Array.isArray(value) ? (value[Math.min(value.length - 1, phase)] ?? 1) : (value ?? 1);
}
function colFor(value, seed) {
  const logical = Array.isArray(value) ? value[seed % value.length] : value;
  return ENEMY_COLUMNS[logical] ?? ENEMY_COLUMNS[3];
}
function rankFor(id, stageId) { return ((id * 1103515245) ^ (stageId * 2654435761)) >>> 0; }

export function buildEnemyStageRoster(stage, db, { randomMode = false } = {}) {
  const chapter = Math.max(1, Number(stage.map_id) || 1);
  const stageNum = Math.max(1, Number(stage.stage_num) || 1);
  const stageId = Math.max(1, Number(stage.stage_id) || 1);
  const phase = phaseFor(chapter);
  const seen = new Set();
  const entries = [];
  for (const rule of RULES) {
    if (chapter < rule.from || (rule.to && chapter > rule.to)) continue;
    if (chapter === rule.from && rule.minStage && stageNum < rule.minStage) continue;
    const replaced = rule.replaceWith && reached(chapter, stageNum, rule.replaceAt, rule.replaceStage ?? 1);
    const id = replaced ? rule.replaceWith : rule.id;
    if (seen.has(id)) continue;
    const card = db.getById(id);
    if (!card) continue;
    seen.add(id);
    // 纯防御高血卡(核桃卫兵/巨盾核桃卫兵这类 atkStyle=1 肉盾)必须放敌方最前排
    // (敌方视角第五列 = 网格第 7 列 = 靠近中心柱子的第一列)，挡在进攻单位前面。
    const isPureDefense = card.atkStyle === 1 && (card.type === 2 || !(card.moveSpeed > 0));
    entries.push({
      card,
      cardId: id,
      defense: rule.defense ?? !(card.moveSpeed > 0),
      count: countFor(rule.count, phase),
      col: isPureDefense ? ENEMY_COLUMNS[1] : colFor(rule.column, stageId + id),
      required: chapter === rule.from && stageNum === (rule.minStage ?? 1),
      rank: rankFor(id, stageId),
    });
  }
  const defenses = entries.filter((entry) => entry.defense)
    .sort((a, b) => Number(b.required) - Number(a.required) || a.rank - b.rank);
  const movers = entries.filter((entry) => !entry.defense)
    .sort((a, b) => Number(b.required) - Number(a.required) || a.rank - b.rank);
  const defensePool = randomMode ? [...defenses].sort(() => Math.random() - 0.5) : defenses;
  const moverPool = randomMode ? [...movers].sort(() => Math.random() - 0.5) : movers;
  const roster = [...defensePool.slice(0, 6), ...moverPool.slice(0, 9)];
  return roster.slice(0, MAX_ENEMY_CARD_TYPES);
}

export function getEnemyStageInstance(stage, waveIndex = 1, card = null) {
  const chapter = Math.max(1, Number(stage.map_id) || 1);
  const stageNum = Math.max(1, Number(stage.stage_num) || 1);
  const progress = (chapter - 1) * 5 + stageNum;
  let star = Math.min(9, Math.max(0, Math.floor((progress - 3) / 7)));
  let craftQuality = Math.min(4, 1 + Math.floor((chapter - 1) / 4));
  if (waveIndex <= 2) star = Math.max(0, star - 1);
  if ((card?.quality ?? 1) >= 5) {
    star = Math.min(star, 3);
    craftQuality = Math.min(craftQuality, 2);
  }
  return { star, strengthLv: star, craftQuality };
}

export { MAX_ENEMY_CARD_TYPES };
