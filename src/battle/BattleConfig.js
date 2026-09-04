/**
 * 基地列在血池球处，不计入此 12 列)
 * 左 5 列我方 | 6–7 列缓冲 | 8–12 列敌方
 */
export const LANES = 5;
export const COLS = 12;

export const PLAYER_PLACE_MIN = 0;
export const PLAYER_PLACE_MAX = 4;
export const PLAYER_MOVABLE_MAX_COL = 2;
export const BUFFER_COLS = [5, 6];
export const ENEMY_PLACE_MIN = 7;
export const ENEMY_PLACE_MAX = 11;
export const ENEMY_MOVABLE_MIN_COL = 9;

export const GAME_W = 1248;
export const GAME_H = 832;
export const FIELD_LEFT = 135;
export const FIELD_TOP = 105;
export const BOTTOM_BAR_H = 56;
export const FIELD_BOTTOM = 25;
export const FIELD_W = GAME_W - FIELD_LEFT * 2;
export const FIELD_H = GAME_H - FIELD_TOP - FIELD_BOTTOM;

/**
 * 12×5 方格区：更改意见.png 蓝框 + 顶对齐均分(scripts/render-user-grid-feedback.mjs)
 * 蓝框 field Y=81 顶满宽；12 列(5+2+5) × 5 行正方形，首行贴蓝框顶 vPad=0
 */
export const PLAYER_TREE_BEARD_BOTTOM_GAME_Y = 192;
export const PLAYER_TREE_BEARD_LEFT_FIELD_X = 0;
export const BOTTOM_ROOT_TOP_FIELD_Y = 645;

/** 用户蓝框(更改意见.png 手绘，非脚本推断的 YouTube 框) */
export const GRID_BOX_TOP_FIELD_Y = 81;
export const GRID_BOX_INNER_W = 977;
export const GRID_BOX_INNER_H = 574;

export const GRID_ORIGIN_X = 0;
export const GRID_ORIGIN_Y = GRID_BOX_TOP_FIELD_Y;
export const GRID_GAP = 3;

export const CELL_SIZE = Math.min(
  (GRID_BOX_INNER_W - GRID_GAP * (COLS - 1)) / COLS,
  (GRID_BOX_INNER_H - GRID_GAP * (LANES - 1)) / LANES,
);
export const CELL_W = CELL_SIZE;
export const CELL_H = CELL_SIZE;

export const GRID_BODY_W = COLS * CELL_SIZE + (COLS - 1) * GRID_GAP;
export const GRID_BODY_H = LANES * CELL_SIZE + (LANES - 1) * GRID_GAP;
/** 顶对齐：首行 = 蓝框顶，不用走廊全高居中 */
export const GRID_V_PAD = 0;
export const GRID_RIGHT_MARGIN = Math.max(0, FIELD_W - GRID_ORIGIN_X - GRID_BODY_W);

/** 标定元数据 */
export const BATTLE_GRID = {
  originX: GRID_ORIGIN_X,
  originY: GRID_ORIGIN_Y,
  boxTop: GRID_BOX_TOP_FIELD_Y,
  boxInnerW: GRID_BOX_INNER_W,
  boxInnerH: GRID_BOX_INNER_H,
  bodyW: GRID_BODY_W,
  bodyH: GRID_BODY_H,
  gap: GRID_GAP,
  cellW: CELL_W,
  cellH: CELL_H,
  vPad: GRID_V_PAD,
  beardLeftField: PLAYER_TREE_BEARD_LEFT_FIELD_X,
  rightMargin: GRID_RIGHT_MARGIN,
  rootTop: BOTTOM_ROOT_TOP_FIELD_Y,
  row4Bottom: GRID_ORIGIN_Y + GRID_V_PAD + GRID_BODY_H,
};

export function cellX(col) {
  return GRID_ORIGIN_X + col * (CELL_W + GRID_GAP);
}

export function cellY(lane) {
  return GRID_ORIGIN_Y + GRID_V_PAD + lane * (CELL_H + GRID_GAP);
}

export function cellCenterX(col) {
  return cellX(col) + CELL_W / 2;
}

export function cellCenterY(lane) {
  return cellY(lane) + CELL_H / 2;
}

/** 血池槽 UI(与 style.css .base-hp-slot 一致)，基地判定对齐槽中心 */
export const BASE_HP_SLOT_W = 197;
export const BASE_HP_SLOT_H = 43;
export const BASE_HP_SLOT_EDGE = 14;
/** @deprecated 兼容旧引用 */
export const BASE_ORB_MARGIN = BASE_HP_SLOT_EDGE;
export const BASE_ORB_SIZE = BASE_HP_SLOT_W;
export const PLAYER_BASE_FIELD_X =
  BASE_HP_SLOT_EDGE + BASE_HP_SLOT_W / 2 - FIELD_LEFT;
export const ENEMY_BASE_FIELD_X =
  GAME_W - BASE_HP_SLOT_EDGE - BASE_HP_SLOT_W / 2 - FIELD_LEFT;

export function fracColToCenterX(fracCol) {
  return GRID_ORIGIN_X + fracCol * (CELL_W + GRID_GAP) + CELL_W / 2;
}

export function centerXToFracCol(x) {
  return (x - GRID_ORIGIN_X - CELL_W / 2) / (CELL_W + GRID_GAP);
}

export const PLAYER_BASE_FRAC = centerXToFracCol(PLAYER_BASE_FIELD_X);
export const ENEMY_BASE_FRAC = centerXToFracCol(ENEMY_BASE_FIELD_X);

/** 攻基地时单位停住的渲染位置(最后一格边缘，不跳到球心) */
export const PLAYER_GRID_EDGE_FRAC = centerXToFracCol(cellX(0));
export const ENEMY_GRID_EDGE_FRAC = centerXToFracCol(cellX(COLS - 1) + CELL_W);

export function getBaseFracCol(team) {
  return team === 'player' ? PLAYER_BASE_FRAC : ENEMY_BASE_FRAC;
}

export function getOpponentBaseFracCol(attackerTeam) {
  return attackerTeam === 'player' ? ENEMY_BASE_FRAC : PLAYER_BASE_FRAC;
}

export function getOpponentBaseFieldX(attackerTeam) {
  return attackerTeam === 'player' ? ENEMY_BASE_FIELD_X : PLAYER_BASE_FIELD_X;
}

/** 近战卡(atk_style=7 或 view_type=2) */
export function isMeleeCard(card) {
  return card.atkStyle === 7 || card.viewType === 2;
}

export function adjustMeleeAtk(atk) {
  const a = Number(atk) || 0;
  if (a <= 200) return a;
  if (a >= 400) return Math.floor(a * 0.75);
  if (a > 300) return a - 50;
  if (a > 250) return a - 30;
  return a - 20;
}


/** 弹道命中：目标格靠射手一侧的前沿(避免飞到格尾才结算) */
export function getProjectileHitFrac(attackerTeam, targetCol) {
  const tc = Math.max(0, Math.min(COLS - 1, Math.round(targetCol)));
  const edgeX = attackerTeam === 'player' ? cellX(tc) : cellX(tc) + CELL_W;
  return centerXToFracCol(edgeX);
}

/** 基地在网格外，射程需补偿球心超出最后一格的列距 */
export const BASE_RANGE_SLACK = 1.5;

/** 按列距判定是否可攻击对方基地(基地 frac 在网格外，与 REMOTE_RANGE 一致) */
export function canUnitHitBase(unit) {
  if (unit.attackingBase) return true;
  const baseFrac = getOpponentBaseFracCol(unit.team);
  const colDist = Math.abs(baseFrac - unit.col);
  return colDist <= unit.range + BASE_RANGE_SLACK;
}

/** 含格子间隙在内的点击判定，避免点不中 */
export function pointerToCol(x) {
  if (x < 0 || x >= FIELD_W) return -1;
  for (let c = COLS - 1; c >= 0; c--) {
    if (x >= cellX(c) - GRID_GAP * 0.5) return c;
  }
  return -1;
}

export function pointerToLane(y) {
  if (y < 0 || y >= FIELD_H) return -1;
  for (let l = LANES - 1; l >= 0; l--) {
    if (y >= cellY(l) - GRID_GAP * 0.5) return l;
  }
  return -1;
}

export function colFracToX(fracCol) {
  return fracColToCenterX(fracCol);
}

export function laneFracToY(fracLane, arcOffset = 0) {
  const l0 = Math.max(0, Math.min(LANES - 1, Math.floor(fracLane)));
  const f = fracLane - l0;
  return cellY(l0) + CELL_H * f - arcOffset * CELL_H;
}

export const JUNGLE_ASSETS = {
  resSun: '/battle/jungle/res_sun.png',
  resFood: '/battle/jungle/res_food.png',
};

export const BATTLE_UI_PARTS = {
  topBarBg: '/sprites/parts/HeroHP_big_bg.png',
  cardBarBg: '/sprites/parts/battle_card_bg.png',
  hpSlotLeft: '/sprites/parts/HeroHP_left_bg.png',
  hpSlotRight: '/sprites/parts/HeroHP_right_bg.png',
};

/** 顶栏 874×95(对齐 155721；透明槽，不用 cardslot 贴图) */
export const TOP_UI_W = 874;
export const TOP_UI_H = 95;
export const TOP_UI_LEFT = 171;
const CSX = TOP_UI_W / 3104;
const CSY = TOP_UI_H / 336;

export const RES_SUN_ICON = {
  left: Math.round(72 * CSX),
  top: Math.round(28 * CSY),
  size: 34,
};
export const RES_FOOD_ICON = {
  left: Math.round(72 * CSX),
  top: Math.round(168 * CSY),
  size: 34,
};
export const RES_SUN_NUM = {
  left: Math.round(168 * CSX),
  top: Math.round(95 * CSY),
};
export const RES_FOOD_NUM = {
  left: Math.round(168 * CSX),
  top: Math.round(210 * CSY),
};

/**
 * 手牌透明槽：155721 标定(缩放到顶栏 874×95)，槽占顶栏 ~98% 高
 */
export const HAND_SLOT_COUNT = 10;
export const HAND_SLOTS_LEFT = 113;
export const HAND_SLOTS_TOP = 33;
export const HAND_SLOT_W = 74;
export const HAND_SLOT_GAP = 0;
export const HAND_SLOTS_WIDTH = HAND_SLOT_COUNT * HAND_SLOT_W;
export const HAND_SLOTS_HEIGHT = 48;
export const HAND_SLOT_FACE_INSET = { top: 0, right: 0, bottom: 0, left: 0 };

export const REMOTE_RANGE = 12;
export const TICK_INTERVAL = 0.155;
export const MAX_RESOURCE = 40;
export const RESOURCE_START = 10;
export const RESOURCE_REGEN = 1;
export const RESOURCE_REGEN_INTERVAL = 1.6;

export const WAVE_FIRST_DELAY = 5;
export const WAVE_INTERVAL = 10;

/** 训练场：选卡界面 value="training" */
export const TRAINING_STAGE_VALUE = 'training';
export const TRAINING_ENEMY_BASE_HP = 9_999_999;
export const TRAINING_PLAYER_BASE_HP = 9_999_999;
export const TRAINING_RESOURCE = 9999;

export const STARTER_DECK = [1, 2, 4, 15, 19, 25, 22, 17, 11, 3];

/** 战斗数值全局缩放(缓解数值膨胀) */
export const BATTLE_STAT_SCALE = 0.75;

/** 伤害/治疗数值：保留两位小数 */
export function roundBattleAmount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/** 飘字显示：整数不带小数，否则最多两位并去掉末尾 0 */
export function formatBattleAmount(n) {
  const v = roundBattleAmount(n);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2).replace(/\.?0+$/, '');
}

/** 带符号的伤害/治疗飘字(+治疗 / -伤害) */
export function formatBattleDelta(amount) {
  const v = roundBattleAmount(amount);
  const body = formatBattleAmount(Math.abs(v));
  if (v > 0) return `+${body}`;
  if (v < 0) return `-${body}`;
  return '0';
}

export function scaleBattleHp(hp) {
  return Math.max(1, Math.floor((Number(hp) || 1) * BATTLE_STAT_SCALE));
}

export function scaleBattleAtk(atk) {
  return roundBattleAmount(Math.max(0, (Number(atk) || 0) * BATTLE_STAT_SCALE));
}

export function calcHeroHp(stageHp) {
  return Math.max(400, Math.floor(Number(stageHp) * 50 * BATTLE_STAT_SCALE));
}

export function getMoveEvery(moveSpeed) {
  if (!moveSpeed || moveSpeed <= 0) return 99;
  if (moveSpeed <= 1) return 20;
  if (moveSpeed <= 2) return 15;
  if (moveSpeed <= 3) return 13;
  return 10;
}

/** 每帧平滑移动：列/秒，对齐原 moveEvery × TICK_INTERVAL 节奏 */
export function getMoveColPerSec(moveSpeed) {
  if (!moveSpeed || moveSpeed <= 0) return 0;
  const map = { 1: 0.32, 2: 0.43, 3: 0.5, 4: 0.65, 5: 0.85 };
  return map[Math.min(5, Math.max(1, moveSpeed))] ?? 0.43;
}

export function getAttackCooldown(atkSpeed) {
  // 攻速等级 → 攻击间隔(秒)，基准至少 2s；0=不攻击，1~6 递增攻速
  const map = {
    0: 99,
    1: 8.6,
    2: 5.0,
    3: 4.2,
    4: 3.8,
    5: 3.5,
    6: 3.0,
  };
  const speed = Math.max(0, Number(atkSpeed) || 0);
  if (speed >= 6) return 2.0; // 特殊攻速(18/20/50)按最高档
  return map[speed] ?? 2.1;
}

/**
 card_category"字段为0的卡牌
  0=植物，1=怪物，2=主动技能，3=被动技能，4=功能卡牌


 */
/** 卡牌阵营与用途只允许通过 card_category 判断。 */
export const CARD_CATEGORY = Object.freeze({
  PLANT: 0,
  MONSTER: 1,
  ACTIVE_SKILL: 2,
  PASSIVE_SKILL: 3,
  SPECIAL: 4,
});

export function getCardCategory(card) {
  const rawCategory = card?.card_category ?? card?.category;
  if (rawCategory == null) return null;
  const value = Number(rawCategory);
  return Number.isInteger(value) && value >= CARD_CATEGORY.PLANT && value <= CARD_CATEGORY.SPECIAL
    ? value
    : null;
}

export function isMonsterCard(card) {
  return getCardCategory(card) === CARD_CATEGORY.MONSTER;
}

export function isPlantCard(card) {
  return getCardCategory(card) === CARD_CATEGORY.PLANT;
}

export function usesFoodCost(card) {
  return isMonsterCard(card);
}

export function isProtectorCard(card) {
  return card.atkStyle === 1 && (card.type === 2 || card.id === 2 || card.id === 21);
}

export function getCellZone(col) {
  if (col >= PLAYER_PLACE_MIN && col <= PLAYER_MOVABLE_MAX_COL) return 'player-movable';
  if (col >= PLAYER_PLACE_MIN && col <= PLAYER_PLACE_MAX) return 'player-fixed';
  if (BUFFER_COLS.includes(col)) return 'buffer';
  if (col >= ENEMY_PLACE_MIN && col <= ENEMY_PLACE_MAX) return 'enemy';
  return 'void';
}

export function canPlayerPlaceCol(col, isMovable) {
  if (col < PLAYER_PLACE_MIN || col > PLAYER_PLACE_MAX) return false;
  if (isMovable && col > PLAYER_MOVABLE_MAX_COL) return false;
  return true;
}
