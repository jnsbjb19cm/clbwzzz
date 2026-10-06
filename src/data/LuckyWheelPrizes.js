/**
 * 幸运大转盘的奖池与任务（2026-10-06）。
 *
 * 刻度：**50000 = 100%**（1 权重 = 0.002%）。
 *
 * 版面只画 9 格：顶奖 1 格（0.2%，落上去后再按内部权重决定具体是什么）+ 常规 8 格。
 * 之前把 6 个顶奖各画一格，格子碎得很；现在合成一格，扇区上直接画道具图标。
 *
 * 强化粉 / 羊皮纸是"随机等级"：出低阶给 5 个，出高阶给 3 个。
 */
export const RARE_TIER_TOTAL = 0.2;
export const DAILY_FREE_SPINS = 1;
export const WEIGHT_SCALE = 50000; // = 100%

/** 顶级档内部权重（合计 100 → 占全盘 0.2%） */
export const RARE_SUBPRIZES = Object.freeze([
  { id: 'perfect4', kind: 'card', weight: 10, label: '完美 4 星卡', desc: '随机 4 级卡，完美品质 + 4 星', cardQuality: 4, star: 4 },
  { id: 'perfect3', kind: 'card', weight: 20, label: '完美 3 星卡', desc: '随机 3 级卡，完美品质 + 3 星', cardQuality: 3, star: 3 },
  { id: 'perfect2', kind: 'card', weight: 30, label: '完美 2 星卡', desc: '随机 2 级卡，完美品质 + 2 星', cardQuality: 2, star: 2 },
  { id: 'gemStone', kind: 'item', weight: 15, label: '品质升阶石', desc: '卡牌制作品质提升一级', itemId: 82, count: 1 },
  { id: 'ancientScroll', kind: 'item', weight: 10, label: '远古召唤卷', desc: '随机获得 2~4 级卡牌', itemId: 60017, count: 1 },
  { id: 'skillBook', kind: 'item', weight: 15, label: '随机技能书', desc: '随机一本技能书', itemId: 60015, count: 1 },
]);

/** "随机等级"奖品的档位表：低阶给 5 个，高阶给 3 个 */
const TIER_ROLL_POWDER = Object.freeze({ low: [10001, 10002], high: [10003, 10004, 10005], lowCount: 5, highCount: 3, highChance: 0.45 });
const TIER_ROLL_PARCHMENT = Object.freeze({ low: [50001, 50002], high: [50003, 50004], lowCount: 5, highCount: 3, highChance: 0.45 });

export const WHEEL_PRIZES = Object.freeze([
  {
    id: 'rare', kind: 'rare', tier: 'rare', weight: 100, label: '顶奖', icon: '★',
    desc: '完美 2~4 星卡 / 品质升阶石 / 远古召唤卷 / 随机技能书',
    sub: RARE_SUBPRIZES,
  },

  // ── 常规档：合计 49900 / 50000 = 99.8% ──
  { id: 'gold', kind: 'currency', tier: 'common', weight: 6000, label: '金币 ×5000', desc: '直接进账', currency: 'gold', amount: 5000, icon: '💰' },
  { id: 'powder', kind: 'tierItem', tier: 'common', weight: 9000, label: '强化粉（随机等级）', desc: '低阶 5 包，高阶 3 包', tierRoll: TIER_ROLL_POWDER, icon: '✦' },
  { id: 'parchment', kind: 'tierItem', tier: 'common', weight: 8000, label: '羊皮纸（随机等级）', desc: '低阶 5 张，高阶 3 张', tierRoll: TIER_ROLL_PARCHMENT, icon: '📜' },
  { id: 'gem2', kind: 'item', tier: 'common', weight: 7000, label: '宝石 ×3', desc: '一炉要吃三颗', itemId: 50012, count: 3, icon: '🔶' },
  { id: 'charm1', kind: 'item', tier: 'common', weight: 6000, label: '保护符 ×2', desc: '强化失败不掉星', itemId: 50021, count: 2, icon: '🛡️' },
  { id: 'egg', kind: 'item', tier: 'common', weight: 7000, label: '卡蛋 ×1', desc: '随机开出 1~2 级卡', itemId: 93, count: 1, icon: '🥚' },
  { id: 'gem', kind: 'currency', tier: 'common', weight: 4200, label: '钻石 ×5', desc: '直接进账', currency: 'gem', amount: 5, icon: '🔷' },
  { id: 'honor', kind: 'currency', tier: 'common', weight: 2700, label: '荣誉 ×300', desc: '直接进账', currency: 'honor', amount: 300, icon: '🎖️' },
]);

export const WEIGHT_TOTAL = WHEEL_PRIZES.reduce((sum, prize) => sum + Number(prize.weight || 0), 0);

/** 每天可做的"转盘任务"：每个 +1 次 */
export const WHEEL_TASKS = Object.freeze([
  { id: 'online30', label: '在线 30 分钟', spins: 1, kind: 'online', minutes: 30 },
  { id: 'online60', label: '在线 60 分钟', spins: 1, kind: 'online', minutes: 60 },
  { id: 'online120', label: '在线 120 分钟', spins: 1, kind: 'online', minutes: 120 },
  { id: 'battle3', label: '完成 3 场战斗', spins: 1, kind: 'event', event: 'battle_complete', count: 3 },
  { id: 'strength1', label: '强化卡牌 1 次', spins: 1, kind: 'event', event: 'card_strengthen', count: 1 },
  { id: 'combine1', label: '完成 1 次材料加工', spins: 1, kind: 'event', event: 'material_combine', count: 1 },
]);

function pickFrom(list, random) {
  const total = list.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
  const roll = random() * total;
  let acc = 0;
  for (const entry of list) {
    acc += Number(entry.weight || 0);
    if (roll < acc) return entry;
  }
  return list[list.length - 1];
}

/** 按权重抽一个扇区（roll 取 [0,1)） */
export function pickWheelPrize(random = Math.random) {
  return pickFrom(WHEEL_PRIZES, random);
}

/** 顶级档内部再抽一次（只有落到顶奖扇区才会用） */
export function pickRareSubprize(random = Math.random) {
  return pickFrom(RARE_SUBPRIZES, random);
}

/**
 * 把抽到的扇区落成"实际发什么"。
 * - rare：再按顶奖内部权重抽一次
 * - tierItem：随机等级（低阶给 lowCount 个，高阶给 highCount 个）
 */
export function resolveWheelPrize(prize, random = Math.random) {
  if (!prize) return null;
  if (prize.kind === 'rare') {
    const sub = pickRareSubprize(random);
    return { ...sub, sectorId: prize.id, tier: 'rare' };
  }
  if (prize.kind === 'tierItem') {
    const roll = prize.tierRoll;
    const useHigh = random() < Number(roll.highChance ?? 0.45);
    const pool = useHigh ? roll.high : roll.low;
    const itemId = pool[Math.floor(random() * pool.length)];
    return {
      ...prize,
      kind: 'item',
      itemId,
      count: useHigh ? roll.highCount : roll.lowCount,
      tierName: useHigh ? '高阶' : '低阶',
    };
  }
  return { ...prize };
}

/** 每个扇区在转盘上占的区间（百分比，从 12 点方向顺时针） */
export function wheelSectors() {
  let acc = 0;
  return WHEEL_PRIZES.map((prize) => {
    const from = (acc / WEIGHT_TOTAL) * 100;
    acc += Number(prize.weight || 0);
    const to = (acc / WEIGHT_TOTAL) * 100;
    return { prize, from, to, centerPct: (from + to) / 2 };
  });
}

/** 让某个扇区停在指针下需要旋转的角度（指针在 12 点） */
export function wheelAngleFor(prize, extraTurns = 5) {
  const sectors = wheelSectors();
  const sector = sectors.find((entry) => entry.prize.id === prize.id) ?? sectors[0];
  const centerDeg = (sector.centerPct / 100) * 360;
  return 360 * extraTurns + (360 - centerDeg);
}
