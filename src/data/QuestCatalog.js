import { balanceQuestReward, levelReward, CARD_EGG_IDS, QUEST_ITEM_IDS } from './QuestRewardBalance.js';

export const MAX_PLAYER_LEVEL = 50;

/**
 * 2026-10-09：任务目录整体重写 —— 依据策划 txt《丛林保卫战主线支线任务》，
 * 主线 1~59（txt 里两条都写「58」，按确认拆成 58 挑战 / 59 击败）+ 支线 1~11。
 *
 * 奖励规则：txt 写明的金币/经验/道具/卡牌**精确发**（exactReward），
 * 没写的项回落到 QuestRewardBalance 的档位公式（见 balanceQuestReward）。
 */

// 名称 → id 速查（来源：src/data/card.json / item.json / functionalItems.json / craftMaterials.json）。
// 解析失败不抛错，登记到 CATALOG_PROBLEMS 供验证脚本断言，避免线上崩。
const ID = Object.freeze({
  card: {
    大耳怪: 8, 跑鞋怪: 3, 飞行忍者: 12, 地刺: 15, 蒲公英医生: 22, 喷喷怪: 62,
    寒冰椰子: 17, 花生射手: 1, 猕猴桃剑客: 69, 小臭鼬: 92, 幼小玉米: 82,
    西瓜太郎: 7, 真西瓜太郎: 30, 幻飞行忍者: 45,
  },
  item: {
    一级羊皮纸: 50001, 二级羊皮纸: 50002, 三级羊皮纸: 50003, 四级羊皮纸: 50004,
    一级宝石: 50011, 二级宝石: 50012, 三级宝石: 50013, 四级宝石: 50014,
    一级保护符: 50021, 二级保护符: 50022, 三级保护符: 50023, 四级保护符: 50024,
    一级DNA: 50031, 二级DNA: 50032, 三级DNA: 50033, 四级DNA: 50034,
    一级强化粉: 10001, 二级强化粉: 10002, 三级强化粉: 10003, 四级强化粉: 10004, 五级强化粉: 10005,
    金币礼盒: 1, 道具礼盒: 9,
    随机2级卡蛋: 94,
    新手礼包: 60100, 新手大礼包: 60101, 五级礼包: 60102, 十级礼包: 60103,
    神秘的蛋I: 60104, 神秘的卡蛋III: 60105, 神秘包裹: 60106, 神秘福袋: 60107,
    奇珍礼盒: 60108, 悲伤密林的情报: 60109,
    远古召唤卷: 60017,
    三头仙人掌DNA: 30006, 怪物面包机DNA: 30002, 战盔巨头怪DNA: 30007,
    蒲公英精灵DNA: 30018, 玉米炮手DNA: 30013, 真西瓜太郎DNA: 30009,
    多特的巫蛊: 53001,
    // 2026-10-09：体验卡（支线4 奖励）。
    '真·西瓜太郎体验卡（7天）': 60200, '幻·飞行忍者体验卡（7天）': 60201,
  },
});

const CATALOG_PROBLEMS = [];

function it(name, count = 1) {
  const id = ID.item[name];
  if (!id) CATALOG_PROBLEMS.push(`item:${name}`);
  return { id, count: Math.max(1, Math.floor(Number(count) || 1)) };
}

function card(name, craftQuality) {
  const id = ID.card[name];
  if (!id) CATALOG_PROBLEMS.push(`card:${name}`);
  return craftQuality ? { id, craftQuality: Math.max(1, Math.min(5, craftQuality)) } : id;
}

export function catalogProblems() {
  return [...CATALOG_PROBLEMS];
}

function mainChapter(n) {
  if (n <= 9) return '序幕 · 新兵手册';
  if (n <= 23) return '第一章 · 反击的开始';
  if (n <= 36) return '第二章 · 铁匠与情报';
  if (n <= 48) return '第三章 · 深入密林';
  return '终章 · 悲伤密林';
}

/**
 * 主线行：[名称, 目标次数, 事件, 额外字段]
 * - desc  : 任务目标（面板「任务目标」栏）
 * - story : 任务说明（面板「任务说明」栏）
 * - items : [['道具名', 数量], ...]     cards: ['卡名' | ['卡名', 制作品质], ...]
 */
const MAIN_ROWS = [
  // ===== 序幕 · 新兵手册（1~9）=====
  ['完成新手教程', 1, 'tutorial_complete', {
    desc: '完成新手教程（跳过也算）。',
    story: '欢迎来到丛林前线，新兵。先跟着教官走一遍基础操作，再上战场。',
    cards: ['大耳怪'], items: [['一级羊皮纸', 2], ['一级宝石', 3], ['三头仙人掌DNA', 1], ['新手礼包', 1]],
  }],
  ['制作一张卡牌', 1, 'card_craft', {
    desc: '成功制作一张卡牌。',
    story: '手里有材料就别闲着 —— 去铁匠铺做一张真正属于你的卡。',
    cards: ['飞行忍者'], gold: 350, exp: 200,
  }],
  ['完成冒险 1-1', 1, 'adventure_complete', {
    desc: '完成冒险模式 1-1（任意线）。',
    adventureIndex: 1, rewardTier: 1,
    cards: ['地刺'], items: [['一级强化粉', 10]], gold: 200, exp: 330,
  }],
  ['强化粉的加工', 1, 'material_combine', {
    desc: '完成一次强化粉的加工。',
    story: '十个一级粉换一个二级粉，仓库就是这么清出来的。',
    materialKind: 'powder', rewardTier: 1,
    cards: ['跑鞋怪'], items: [['一级强化粉', 5]], gold: 40, exp: 260,
  }],
  ['卡牌升星', 1, 'card_strengthen', {
    desc: '完成一次卡牌强化升星。',
    rewardTier: 1,
    items: [['一级羊皮纸', 3], ['一级DNA', 2], ['一级宝石', 4]], gold: 500, exp: 400,
  }],
  ['完成冒险 1-2', 1, 'adventure_complete', {
    desc: '通过冒险模式 1-2（任意线）。',
    adventureIndex: 2, rewardTier: 1, gold: 300, exp: 500,
  }],
  ['学习一个技能', 1, 'skill_learn', {
    desc: '学习一个英雄技能。',
    story: '技能点攒着不会自己变成战力，去天赋界面点亮第一个技能。',
    rewardTier: 1, items: [['随机2级卡蛋', 1]], gold: 20, exp: 100,
  }],
  ['商场采购', 1, 'shop_buy', {
    desc: '从商场购买任意一件道具。',
    rewardTier: 1, items: [['随机2级卡蛋', 1], ['五级礼包', 1]],
  }],
  ['初入竞技场', 1, 'battle_pvp', {
    desc: '尝试一局 PVP（输赢均可）。',
    rewardTier: 1, gold: 200, exp: 300, gem: 100,
  }],

  // ===== 第一章 · 反击的开始（10~23）=====
  ['西瓜也会用双刀？', 1, 'adventure_complete', {
    desc: '通过植物线 1-4。',
    route: 0, adventureIndex: 4, rewardTier: 1,
    cards: ['蒲公英医生'], gold: 500, exp: 600,
  }],
  ['大大的脑袋！', 1, 'adventure_complete', {
    desc: '通过怪物线 1-4。',
    route: 1, adventureIndex: 4, rewardTier: 1,
    cards: ['喷喷怪'], gold: 500, exp: 600,
  }],
  ['垂耳兔也会忧郁吗', 1, 'adventure_complete', {
    desc: '通关怪物线 2-1。',
    route: 1, adventureIndex: 5, rewardTier: 2, gold: 600, exp: 800,
  }],
  ['强化不能停 II', 4, 'card_strengthen', {
    desc: '强化成功 4 张卡牌。',
    rewardTier: 2, gold: 800, exp: 90,
  }],
  ['大转盘', 1, 'lucky_wheel', {
    desc: '进行一次大转盘抽奖。',
    story: '大转盘奥，一百块钱一次（假的）。谁玩谁合适。',
    rewardTier: 2, gold: 200, exp: 300,
  }],
  ['寒冷的椰子？', 1, 'adventure_attempt', {
    desc: '尝试通关植物线 2-1（没有通关也可以领取）。',
    route: 0, adventureIndex: 5, rewardTier: 2,
    cards: [['寒冰椰子', 3]], gold: 300, exp: 500,
  }],
  ['你这瓜保熟吗', 5, 'kill_card', {
    desc: '累计击败 5 个西瓜太郎或真·西瓜太郎。',
    killCardIds: [7, 30], rewardTier: 2,
    items: [['真西瓜太郎DNA', 1]], gold: 150, exp: 300,
  }],
  ['玉米大作战 I', 1, 'card_obtain', {
    desc: '合成或从卡蛋中获得 1 张「幼小玉米」。',
    obtainCardId: 82, rewardTier: 2,
    items: [['一级强化粉', 15], ['一级保护符', 2]], gold: 300, exp: 125,
  }],
  ['玉米大作战 II', 3, 'card_use', {
    desc: '在战斗中累计使用 3 次「幼小玉米」。',
    useCardId: 82, rewardTier: 2,
    items: [['三级羊皮纸', 1]], gold: 600, exp: 150,
  }],
  ['"神射手"华生', 1, 'adventure_complete', {
    desc: '通关植物线 2-2。',
    route: 0, adventureIndex: 6, rewardTier: 2, gold: 600, exp: 230,
  }],
  ['强化不能停 III', 10, 'card_strengthen', {
    desc: '强化 10 次任意卡牌。',
    rewardTier: 2, items: [['三级羊皮纸', 1]], exp: 300,
  }],
  ['冒失的铁匠', 5, 'monster_line_clear', {
    desc: '在怪物线战场找回 5 块精密铁矿（每打赢一次怪物线任意关卡/难度得 1 块）。',
    story: '你好，%玩家名%，我是埃戎·史密斯。上次的保卫战里，我不小心把精密铁矿遗失在了前线上 —— 那种铁矿十分珍贵，能帮我再找一些回来吗？万分感谢！当然，报酬是少不了的。',
    rewardTier: 3, items: [['三级羊皮纸', 1]], gold: 2000, exp: 200,
  }],
  ['制造不能停 II', 6, 'card_craft', {
    desc: '制造 6 张卡牌。',
    rewardTier: 3, items: [['神秘包裹', 1]], gold: 400, exp: 800,
  }],
  ['升至 10 级', 10, 'level', {
    desc: '角色等级达到 Lv.10。',
    rewardTier: 2, gold: 1000, exp: 666,
  }],

  // ===== 第二章 · 铁匠与情报（24~36）=====
  ['反弹子弹？', 1, 'adventure_complete', {
    desc: '通关怪物线 2-4。',
    story: '据情报，蒙斯特族的铁匠师造出了一种特殊头盔，有概率反弹掉直线攻击的子弹，许多植物都因此受伤 —— 小心他们。',
    route: 1, adventureIndex: 8, rewardTier: 2,
    items: [['战盔巨头怪DNA', 1]], gold: 500, exp: 800,
  }],
  ['艾米丽的请求', 2, 'adventure_complete', {
    desc: '通关 2 次怪物线 2-4。',
    story: '你好，勇士 %玩家名%，我是艾米丽·亨特，卡尔医生的助手。我最近在寻找一种特殊的草药红冬蛇菰，但它只长在巨头怪的领地附近；最近伤员太多，我实在走不开，而最后一批草药又快用光了。能帮我采集一些回来吗？万分感激！',
    route: 1, adventureIndex: 8, rewardTier: 3,
    items: [['蒲公英精灵DNA', 1]], gold: 2000, exp: 900,
  }],
  ['好运来', 10, 'playtime', {
    desc: '累计在线等待 10 分钟（挂机也算）。',
    cumulativeKey: 'totalPlayMinutes', rewardTier: 2,
    items: [['神秘福袋', 1]],
  }],
  ['以牙还牙', 1, 'adventure_complete', {
    desc: '通关植物线 2-4。',
    story: '可恶的埃尔夫族，居然也研发出了反弹子弹的盾牌，并安装在了核桃卫兵上。士兵，无妨 —— 击溃他们！',
    route: 0, adventureIndex: 8, rewardTier: 2,
    items: [['二级DNA', 1]], gold: 750, exp: 700,
  }],
  ['仙人指路', 1, 'adventure_complete', {
    desc: '完成植物线 3-1。',
    story: '指挥官，我们收到情报：仙人掌可以攻击三路目标；而且在三头仙人掌不足一格距离内，三路子弹会全部打在面前的单位上，造成三倍伤害。请小心对待。',
    route: 0, adventureIndex: 9, rewardTier: 3,
    items: [['三头仙人掌DNA', 1]], gold: 800, exp: 700,
  }],
  ['强化不能停 IV', 10, 'card_strengthen_attempt', {
    desc: '强化 10 次卡牌（成功失败均可）。',
    cumulativeKey: 'totalStrengthenAttempts', rewardTier: 3, gold: 800, exp: 1000,
  }],
  ['大蒜也会遁地？', 1, 'adventure_complete', {
    desc: '通关植物线 3-2。',
    story: '据情报，埃尔夫族派出了钻地大蒜进行突击 —— 它能从地面下钻出，然后「背刺」。用蘑菇怪可以有效防御它们。',
    route: 0, adventureIndex: 10, rewardTier: 3, exp: 1000,
  }],
  ['结伴而行', 1, 'guild_join', {
    desc: '加入或创建一个公会。',
    rewardTier: 3, exp: 300,
  }],
  ['熊猫还是猫熊？', 1, 'adventure_complete', {
    desc: '通关怪物线 3-1。',
    story: '情报：蒙斯特族的熊猫捶手和熊猫猎手都是熊猫家族的成员。捶手力量更大，可以攻击两格内的目标；猎手更善于弓箭射击，箭矢命中后有概率让我方卡牌中毒。勇士，请谨慎对待他们。',
    route: 1, adventureIndex: 9, rewardTier: 3,
    cards: ['小臭鼬'], gold: 500, exp: 900,
  }],
  ['战斗的艺术', 10, 'skill_cast', {
    desc: '累计释放 10 次技能。',
    cumulativeKey: 'totalSkillCasts', rewardTier: 3, gold: 100, exp: 600,
  }],
  ['会飞的水蜜桃', 1, 'adventure_complete', {
    desc: '通关植物线 3-3。',
    story: '情报：飞行水蜜桃是飞行单位，尤其喜欢用火药研究一些奇怪的东西 —— 碰到空中单位后会直接拉出火药引爆，然后自己逃离现场。实在太可恶了。',
    route: 0, adventureIndex: 11, rewardTier: 3,
    items: [['怪物面包机DNA', 1]],
  }],
  ['强化粉的加工 II', 5, 'material_combine', {
    desc: '加工 5 次强化粉。',
    materialKind: 'powder', rewardTier: 3,
  }],
  ['玉米炮？', 1, 'adventure_complete', {
    desc: '通关植物线 3-4。',
    story: '前线传来最新情报：埃尔夫族派出了玉米炮手 —— 抛物线弹道，发射的玉米炮弹有概率将集中的目标眩晕。',
    route: 0, adventureIndex: 12, rewardTier: 3,
    items: [['玉米炮手DNA', 1]], gold: 800, exp: 1500,
  }],

  // ===== 第三章 · 深入密林（37~48）=====
  ['地道战', 1, 'adventure_complete', {
    desc: '通关怪物线 3-2。',
    story: '蒙斯特族得知我们派出了钻地大蒜，也加急训练了一批地道兵 —— 他们会从我方基地出土，向后发动突袭。不过我们也有对应手段：黑铁土豆雷就是用来招呼他们的。',
    route: 1, adventureIndex: 10, rewardTier: 3,
    items: [['四级强化粉', 5]],
  }],
  ['蘑菇也会吐泡泡吗', 1, 'adventure_complete', {
    desc: '完成植物线 4-1。',
    story: '情报：蘑菇仙人可攻击场上所有非我方单位卡牌并造成伤害。（PS：蘑菇仙人的小蘑菇还会不灵不灵地动。）',
    route: 0, adventureIndex: 13, rewardTier: 4,
    items: [['三级羊皮纸', 1]],
  }],
  ['冒险不能停 I', 1, 'adventure_complete', {
    desc: '通关怪物线 3-3。',
    route: 1, adventureIndex: 11, rewardTier: 4,
    cards: [['花生射手', 5]], exp: 1000,
  }],
  ['冒险不能停 II', 1, 'adventure_complete', {
    desc: '通关植物线 4-2。',
    route: 0, adventureIndex: 14, rewardTier: 4,
    items: [['四级强化粉', 10], ['三级强化粉', 20], ['二级强化粉', 30], ['一级强化粉', 30]], exp: 2000,
  }],
  ['面包の诱惑', 1, 'adventure_complete', {
    desc: '通关怪物线 3-4。',
    story: '谁会拒绝一片面包呢？什么叫对面向我们往空中扔面包？浪费粮食可耻！不过好在对面的幻·飞行忍者还会回收面包片。（情报：幻飞行忍者落地或血量小于 50% 时会分身四个；怪物面包机会投掷面包片造成减速，优先攻击空中目标。可以用南瓜投手等卡牌将其击落，或利用暴风雪冰冻期间直接令其死亡 —— 这样他就没有时间分身了。）',
    route: 1, adventureIndex: 12, rewardTier: 4, gold: 6666,
  }],
  ['这是 KIWI？', 1, 'adventure_attempt', {
    desc: '尝试通关植物线 4-3（没通过也可以领取）。',
    story: '猕猴桃剑客死亡时会自爆，眩晕所在格子的所有敌方单位。（PS：爆汁了。）',
    route: 0, adventureIndex: 15, rewardTier: 4,
    cards: ['猕猴桃剑客'],
  }],
  ['冒险不能停 III', 1, 'adventure_complete', {
    desc: '通关怪物线 4-1。',
    route: 1, adventureIndex: 13, rewardTier: 4,
    items: [['四级DNA', 1]], gold: 600, exp: 800,
  }],
  ['狂暴的法师', 1, 'adventure_complete', {
    desc: '通关怪物线 4-2。',
    story: '情报：狂暴法师命中目标后有概率眩晕目标，并对目标范围内 3×3 所有敌方单位造成伤害。',
    route: 1, adventureIndex: 14, rewardTier: 4, gold: 1200, exp: 1800,
  }],
  ['会跑的大树？', 1, 'adventure_complete', {
    desc: '通关植物线 4-4。',
    story: '埃尔夫族派出了战争古树，可真是大手笔啊。指挥官，我们立刻前往前线击溃他们！（附带战争古树情报：可攻击两格内的所有目标，造成的伤害 20% 恢复为体力值。）',
    route: 0, adventureIndex: 16, rewardTier: 4,
  }],
  ['冒险不能停 IV', 1, 'adventure_complete', {
    desc: '通关怪物线 4-2。',
    route: 1, adventureIndex: 14, rewardTier: 4,
    items: [['三级强化粉', 10]], gold: 900, exp: 1800,
  }],
  ['冒险不能停 V', 1, 'adventure_complete', {
    desc: '通关怪物线 4-3。',
    route: 1, adventureIndex: 15, rewardTier: 4,
    items: [['三级强化粉', 15]], gold: 1000, exp: 1800,
  }],
  ['龙，可是帝王之征啊', 1, 'adventure_complete', {
    desc: '通关怪物线 4-4。',
    story: '蒙斯特族居然把火龙都请来助战了，这要花费多少金银财宝啊……勇士，请小心些！（火龙情报：向前方三格吐出火焰，攻击三格内所有敌方单位，且造成的伤害为敌方两个资源的总和。）',
    route: 1, adventureIndex: 16, rewardTier: 5,
    items: [['五级强化粉', 20]], gold: 3350, exp: 2000,
  }],

  // ===== 终章 · 悲伤密林（49~59）=====
  ['终极混战', 1, 'adventure_complete', {
    desc: '通关冒险大陆最终关「大混战」。',
    finalOnly: true, rewardTier: 5,
    items: [['神秘的卡蛋III', 1]], gold: 50000, exp: 2000,
  }],
  ['片刻喘息', 1, 'auto', {
    desc: '无需操作 —— 完成大混战后自动达成。',
    story: '经历了大混战后，埃尔夫族和蒙斯特族仍然没有分出胜负，于是双方约定休战。',
    rewardTier: 3, gold: 5000, exp: 900,
  }],
  ['悲伤密林', 1, 'visit_area', {
    desc: '前往悲伤密林。',
    story: '勇士，最近我们的法师检测到悲伤密林附近的魔法能量有异常波动，请你去查看一下，万分感谢！',
    areaId: 'painforest', rewardTier: 4,
    items: [['远古召唤卷', 1]], gold: 850, exp: 1500,
  }],
  ['痴情的多特', 1, 'boss_challenge', {
    desc: '挑战一次痴情的多特（无论输赢）。',
    story: '西北地区有不明魔力波动……而且有一股……曼陀罗的味道？',
    bossId: 'boss_dot', rewardTier: 4, gold: 1600, exp: 1200,
  }],
  ['痴情的多特 II', 1, 'boss_defeated', {
    desc: '击败痴情的多特（任意难度）。',
    story: '是多特！他正在攻击魔法石阵 —— 那是上古时期大法师封印邪灵的巨大法阵，一旦被破坏就会放出邪灵！快阻止他！',
    bossId: 'boss_dot', rewardTier: 4,
    items: [['多特的巫蛊', 1]], gold: 1800, exp: 1600,
  }],
  ['愤怒的沃里尔', 1, 'boss_challenge', {
    desc: '挑战愤怒的沃里尔（任意难度）。',
    bossId: 'boss_gravo', rewardTier: 4, gold: 800, exp: 900,
  }],
  ['愤怒的沃里尔 II', 1, 'boss_defeated', {
    desc: '击败愤怒的沃里尔（任意难度）。',
    bossId: 'boss_gravo', rewardTier: 4, gold: 1700, exp: 800,
  }],
  ['疯狂的安娜', 1, 'boss_challenge', {
    desc: '挑战疯狂的安娜（任意难度）。',
    bossId: 'boss_ice', rewardTier: 4, gold: 800, exp: 900,
  }],
  ['疯狂的安娜 II', 1, 'boss_defeated', {
    desc: '击败疯狂的安娜（任意难度）。',
    bossId: 'boss_ice', rewardTier: 4, gold: 1900, exp: 1800,
  }],
  ['树妖萝莉塔', 1, 'boss_challenge', {
    desc: '挑战树妖萝莉塔（任意难度）。',
    bossId: 'boss_forest', rewardTier: 4, gold: 1700, exp: 800,
  }],
  ['树妖萝莉塔 II', 1, 'boss_defeated', {
    desc: '击败树妖萝莉塔（任意难度）。',
    bossId: 'boss_forest', rewardTier: 4, gold: 1700, exp: 801,
  }],
];

const MAIN_QUESTS = MAIN_ROWS.map((row, index) => {
  const n = index + 1;
  const { items, cards, ...rest } = row[3] || {};
  const id = `mq${String(n).padStart(2, '0')}`;
  const prev = n > 1 ? `mq${String(n - 1).padStart(2, '0')}` : null;
  return {
    id,
    name: row[0],
    goal: row[1],
    event: row[2],
    desc: rest.desc || row[0],
    chapter: rest.chapter || mainChapter(n),
    ...(prev ? { requires: prev } : {}),
    exactReward: true,
    ...rest,
    ...(items ? { items: items.map((e) => it(e[0], e[1])) } : {}),
    ...(cards ? { cards: cards.map((c) => (Array.isArray(c) ? card(c[0], c[1]) : card(c))) } : {}),
  };
});

// ==================== 支线 ====================
/**
 * 2026-10-09（用户要求）：原本在「等级奖励」页的 10 档固定金币，挪到支线当委托。
 * lv → 金币：2/6/7/8/9/10/13/15/18/21 → 1000/1200/1800/2400/4000/4500/5000/5100/5300/5500。
 */
const LEVEL_TIER_GOLD = Object.freeze({
  2: 1000, 6: 1200, 7: 1800, 8: 2400, 9: 4000, 10: 4500, 13: 5000, 15: 5100, 18: 5300, 21: 5500,
});

const LEVEL_TIER_GOLD_SIDE_ROWS = Object.entries(LEVEL_TIER_GOLD).map(([lv, gold]) => ([
  `等级成长补给 · Lv.${lv}`, Number(lv), 'level', {
    desc: `角色达到 Lv.${lv}。`,
    story: `达到 Lv.${lv} 后，可以领一份等级成长补给（${gold} 金币）。`,
    requiresMain: 'mq01', rewardTier: 1, exactReward: true, gold: Number(gold), exp: 0, items: [],
  },
]));

const SIDE_ROWS = [
  ['强化不能停 I', 4, 'card_strengthen', {
    desc: '强化 4 次卡牌。', requiresMain: 'mq01', rewardTier: 1,
    items: [['金币礼盒', 1]], exp: 80,
  }],
  ['制造不能停 I', 2, 'card_craft', {
    desc: '制造 2 次卡牌。', requiresMain: 'mq01', rewardTier: 1,
    items: [['神秘的蛋I', 1]],
  }],
  ['经验之谈', 8, 'battle_complete', {
    desc: '完成 8 场战斗。', requiresMain: 'mq03', rewardTier: 2,
    items: [['二级羊皮纸', 1], ['二级宝石', 1], ['一级保护符', 1], ['道具礼盒', 5]],
  }],
  ['朋友多又多 I', 1, 'friend_add', {
    desc: '尝试添加一次好友。', requiresMain: 'mq06', rewardTier: 2,
    // 2026-10-09：txt 写「真·西瓜太郎体验卡 / 幻·飞行忍者体验卡 各 7 天」，
    // 体验卡系统已实装（function 64）：使用后给对应卡牌一张 7 天限时副本，到期自动失效。
    items: [['真·西瓜太郎体验卡（7天）', 1], ['幻·飞行忍者体验卡（7天）', 1]],
  }],
  ['挑战自己 I', 1, 'adventure_complete', {
    desc: '完成冒险大陆任意线 1-3（任意难度）。',
    story: '条件：本场不使用任何防御类卡牌。（当前版本尚未接入「防御类」判定，先只校验通关。）',
    requiresMain: 'mq06', adventureIndex: 3, noDefenseOnly: true, rewardTier: 2,
  }],
  ['你好，世界', 1, 'world_chat', {
    desc: '在世界频道发送一次信息。', requiresMain: 'mq07', rewardTier: 2,
    items: [['新手大礼包', 1]],
  }],
  ['强化不能停 II', 12, 'card_strengthen', {
    desc: '累计成功强化 12 次。', requiresMain: 'mq10', rewardTier: 3, gold: 660,
  }],
  ['制造不能停 II', 8, 'card_craft', {
    desc: '累计成功制造 8 张卡牌。', requiresMain: 'mq10', rewardTier: 3, gold: 660,
  }],
  ['加工不能停', 6, 'material_combine', {
    desc: '累计完成 6 次材料加工。', requiresMain: 'mq10', materialKind: null, rewardTier: 3, gold: 660,
  }],
  ['游行商人 · 买下情报', 1, 'auto', {
    desc: '给皮埃尔 9999 金币，买下他的奇珍异宝。',
    story: '你好 %玩家名%，我是皮埃尔。我这里有许多奇珍异宝 —— 各类羊皮纸、宝石、卡牌，甚至还有密林的情报。价格嘛，也非常美丽，只需要 9999 金币。',
    requiresMain: 'mq32', exclusiveGroup: 'parade_merchant', consumeGold: 9999, rewardTier: 4,
    items: [['奇珍礼盒', 1]],
  }],
  ['游行商人 · 婉拒', 1, 'auto', {
    desc: '放弃这次交易；皮埃尔还是资助了你一些资源。',
    story: '没有关系，如果你觉得这些道具不太适合你，看在我们这么有缘的份上，我资助你一些资源。',
    requiresMain: 'mq32', exclusiveGroup: 'parade_merchant', rewardTier: 4,
    items: [['三级羊皮纸', 1], ['三级宝石', 1]], exp: 800,
  }],
  ['神秘的援助', 1, 'auto', {
    desc: '完成大混战后自动达成。',
    story: '远方飞来一片叶子，那叶子似乎散发着奇异的光线。你出于好奇拾了起来 —— 居然是一份远古羊皮纸！同时有一个声音在脑海里响起（阻止…灵…）。',
    requiresMain: 'mq49', rewardTier: 5,
    items: [['四级羊皮纸', 1], ['四级保护符', 2], ['四级宝石', 4]],
  }],
  // 2026-10-09（用户要求）：原来的「等级奖励 10 档金币」从等级页挪到支线，等级页恢复成每级一份成长补给。
  ...LEVEL_TIER_GOLD_SIDE_ROWS,
];

const SIDE_QUESTS = SIDE_ROWS.map(([name, goal, event, extra], index) => {
  const { items, cards, ...rest } = extra || {};
  return {
    id: `sq${index + 1}`,
    name, goal, event,
    chapter: '支线委托',
    desc: rest.desc || name,
    exactReward: true,
    ...rest,
    ...(items ? { items: items.map((e) => it(e[0], e[1])) } : {}),
    ...(cards ? { cards: cards.map((c) => (Array.isArray(c) ? card(c[0], c[1]) : card(c))) } : {}),
  };
});

// ==================== 日常 / 周常 / 成就 / 挑战 ====================
// 2026-10-09：本次只重写主线与支线；日常、周常、成就、挑战沿用原目录。
const q=(id,name,desc,story,goal,event,extra={})=>({id,name,desc,story,goal,event,...extra});
const R=(rewardProfile,rewardTier=1,rewardTheme=null,extra={})=>({
  rewardProfile,rewardTier,...(rewardTheme?{rewardTheme}:{}),...extra,
});

const DAILY_QUESTS=[
  q('dq1','两趟巡逻','完成2个野外冒险关卡。','',2,'adventure_complete',{...R('daily',1,'adventure')}),
  q('dq2','每日操练','完成3场战斗。','',3,'battle_complete',{...R('daily',1,'adventure')}),
  q('dq3','小试身手','获得2场战斗胜利。','',2,'battle_win',{...R('daily',2,'adventure')}),
  q('dq4','清剿','击败20名敌对单位。','',20,'kill_enemy',{...R('daily',1,'adventure')}),
  q('dq5','切磋琢磨','成功制作或强化1次。','',1,'card_upgrade',{...R('daily',2,'workshop')}),
  q('dq6','多多益善','获得8件道具或材料。','',8,'item_gain',{...R('daily',1,'collection')}),
  q('dq7','强化能手','强化卡牌1次。','',1,'card_strengthen',{...R('daily',5,null,{gold:1800,gem:15,exp:380000,items:[{id:QUEST_ITEM_IDS.powder[3],count:2}]})}),
];

const WEEKLY_QUESTS=[
  q('wq1','战斗训练','本周完成12场战斗。','',12,'battle_complete',{...R('weekly',2,'adventure')}),
  q('wq2','探索专家','本周完成8个野外冒险关卡。','',8,'adventure_complete',{...R('weekly',2,'adventure')}),
  q('wq3','常胜将军','本周获得6场胜利。','',6,'battle_win',{...R('weekly',3,'adventure')}),
  q('wq4','本周百人斩','本周击败100名敌对单位。','',100,'kill_enemy',{...R('weekly',2,'adventure')}),
  q('wq5','千锤百炼','本周成功制作或强化5次。','',5,'card_upgrade',{...R('weekly',3,'workshop')}),
  q('wq6','迎战强敌','本周挑战任意BOSS 1次。','',1,'boss_challenge',{...R('weekly',3,'boss')}),
];

const ACHIEVEMENT_QUESTS=[
  q('aq1','初窥门径','达到Lv.10。','',10,'level',{...R('achievement',1,null)}),
  q('aq2','登堂入室','达到Lv.20。','',20,'level',{...R('achievement',2,null)}),
  q('aq3','独当一面','达到Lv.30。','',30,'level',{...R('achievement',3,null,{items:[{id:QUEST_ITEM_IDS.rerollStat,count:1}]})}),
  q('aq4','一方强者','达到Lv.40。','',40,'level',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.rerollQuality,count:1}]})}),
  q('aq5','满级','达到Lv.50。','',50,'level',{...R('achievement',5,null,{items:[{id:QUEST_ITEM_IDS.qualityStone,count:1}]})}),
  q('aq6','百人斩','累计击败100名敌对单位。','',100,'kill_total',{...R('achievement',1,null)}),
  q('aq7','五百人斩','累计击败500名敌对单位。','',500,'kill_total',{...R('achievement',2,null)}),
  q('aq8','千人斩','累计击败1000名敌对单位。','',1000,'kill_total',{...R('achievement',3,null)}),
  q('aq9','微小的一步，成功的一大步','累计完成50场战斗。','',50,'battle_total',{...R('achievement',2,null)}),
  q('aq10','身经百战','累计完成200场战斗。','',200,'battle_total',{...R('achievement',4,null)}),
  q('aq11','初露锋芒','累计获得25场战斗胜利。','',25,'battle_win_total',{...R('achievement',2,null)}),
  q('aq12','百战百胜','累计获得100场战斗胜利。','',100,'battle_win_total',{...R('achievement',4,null)}),
  q('aq13','广度遍历者','累计完成34个野外冒险关卡。','',34,'adventure_total',{...R('achievement',3,null)}),
  q('aq14','深度遍历者','累计完成100个野外冒险关卡。','',100,'adventure_total',{...R('achievement',5,null)}),
  q('aq15','十全十美','拥有10张卡牌。','',10,'card_total',{...R('achievement',1,null)}),
  q('aq16','双倍「十全十美」','拥有20张卡牌。','',20,'card_total',{...R('achievement',2,null)}),
  q('aq17','三十而立','拥有30张卡牌。','',30,'card_total',{...R('achievement',3,null,{items:[{id:CARD_EGG_IDS[3],count:1}]})}),
  q('aq18','强化不能停 I','累计成功强化20次。','',20,'strengthen_total',{...R('achievement',2,null)}),
  q('aq19','强化不能停 II','累计成功强化50次。','',50,'strengthen_total',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.reverse,count:1}]})}),
  q('aq20','初具规模','累计成功制作10张卡牌。','',10,'craft_total',{...R('achievement',2,null)}),
  q('aq21','炉火纯青','累计成功制作30张卡牌。','',30,'craft_total',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.rerollQuality,count:1}]})}),
  q('aq22','所向披靡','累计击败4次BOSS。','',4,'boss_defeat_total',{...R('achievement',3,null,{items:[{id:CARD_EGG_IDS[3],count:1}]})}),
  q('aq23','战无不胜','累计击败10次BOSS。','',10,'boss_defeat_total',{...R('achievement',5,null,{items:[{id:QUEST_ITEM_IDS.qualityStone,count:1}]})}),
  q('aq24','积少成多','累计获得10场PVP胜利。','',10,'pvp_win_total',{...R('achievement',3,null)}),
  q('aq25','老战友','累计完成20场多人PVE。','',20,'coop_total',{...R('achievement',3,null)}),
];

const CHALLENGE_QUESTS=[
  q('cq1','痴情的多特','击败悲伤密林BOSS「痴情的多特」。','小心！多特的毒术很厉害，已经有很多的战士因此受伤了。',1,'boss_defeated',{bossId:'boss_dot',bossDefeatId:'boss_dot',...R('challenge_boss',2,'boss')}),
  q('cq2','愤怒的沃里尔','击败悲伤密林BOSS「愤怒的沃里尔」。','沃里尔的指挥非常出色，尽量多带治疗卡牌，防止他突破防线。',1,'boss_defeated',{requires:'cq1',bossId:'boss_gravo',bossDefeatId:'boss_gravo',...R('challenge_boss',3,'boss')}),
  q('cq3','疯狂的安娜','击败悲伤密林BOSS「疯狂的安娜」。','那些可恶的家伙，居然这么对待安娜……但现在不是哀悼的时候。勇士，请你制止住安娜疯狂的行为。',1,'boss_defeated',{requires:'cq2',bossId:'boss_ice',bossDefeatId:'boss_ice',...R('challenge_boss',4,'boss')}),
  q('cq4','树妖萝莉塔','击败悲伤密林BOSS「树妖萝莉塔」。','萝莉塔的根会缠住你的前排。带一张清场的卡，别让它长起来。',1,'boss_defeated',{requires:'cq3',bossId:'boss_forest',bossDefeatId:'boss_forest',...R('challenge_boss',5,'boss')}),
  q('cq5','狂暴的刀牙','击败海底神殿BOSS「狂暴的刀牙」。','它能把倒下的兵整队拉回来！别给它复苏的机会，一波压死！',1,'boss_defeated',{requiresMain:'mf01',bossId:'boss_shark',bossDefeatId:'boss_shark',...R('challenge_boss',4,'boss')}),
  q('cq6','龙虾战士','击败海底神殿BOSS「龙虾战士」。','它一突袭就能咬穿前排！手里留一张卡，随时补位！',1,'boss_defeated',{requiresMain:'mf01',bossId:'boss_lobster',bossDefeatId:'boss_lobster',...R('challenge_boss',4,'boss')}),
  q('cq7','失控的蓝贝贝','击败海底神殿BOSS“失控的蓝贝贝”。','它会开海之门放小怪，还会布幻境！先堵住门口，别被幻影骗了！',1,'boss_defeated',{requiresMain:'mf01',bossId:'boss_bluebaby',bossDefeatId:'boss_bluebaby',...R('challenge_boss',4,'boss')}),
  q('cq8','龟老师','击败海底神殿BOSS“龟老师”。','铁壳功一开，输出全白打！等它技能间隙再压上去！',1,'boss_defeated',{requiresMain:'mf01',bossId:'boss_turtle',bossDefeatId:'boss_turtle',...R('challenge_boss',5,'boss')}),
  q('cq9','琴音','击败海底神殿BOSS“人鱼公主琴音”。','她的歌声会让你的卡停手！关键卡别一次全摆上去！',1,'boss_defeated',{requiresMain:'mf01',bossId:'boss_princess',bossDefeatId:'boss_princess',...R('challenge_boss',5,'boss',{items:[{id:CARD_EGG_IDS[5],count:1}]})}),
  q('cq10','战争与和平','累计完成5场零阵亡战斗。','大家都要活下去啊。',5,'battle_nodeath',{cumulativeKey:'totalNoDeath',...R('challenge',3,'adventure')}),
  q('cq11','「闪」击战','完成3场120秒内结束的胜利。','两分钟？！我突破防线都要五分钟，你怎么做到的？？？',3,'battle_duration',{maxDuration:120,...R('challenge',4,'adventure')}),
  q('cq12','首领猎手','累计击败8次BOSS。','今天要「特殊照顾」哪位呢？',8,'boss_defeated',{cumulativeKey:'totalBossDefeats',...R('challenge',5,'boss',{items:[{id:CARD_EGG_IDS[4],count:1},{id:QUEST_ITEM_IDS.reverse,count:2}]})}),
];

const QUEST_GROUPS={
  main:MAIN_QUESTS,
  side:SIDE_QUESTS,
  daily:DAILY_QUESTS,
  weekly:WEEKLY_QUESTS,
  achievement:ACHIEVEMENT_QUESTS,
  challenge:CHALLENGE_QUESTS,
};

const CATEGORIES=[
  {id:'main',label:'主线任务',subtitle:'新手手册 → 双线推进 → 悲伤密林'},
  {id:'side',label:'支线任务',subtitle:'强化、制造、加工与游行商人'},
  {id:'daily',label:'日常任务',subtitle:'当天随手做'},
  {id:'weekly',label:'周常任务',subtitle:'一周慢慢完成'},
  {id:'achievement',label:'成就',subtitle:'长期记录'},
  {id:'challenge',label:'挑战',subtitle:'BOSS和高难条件'},
  {id:'level',label:'等级奖励',subtitle:'每级一份成长补给'},
];

/**
 * 2026-10-09（用户要求，第二轮）：
 *  - 等级奖励**恢复到之前的「每级一份成长补给」**（QuestRewardBalance.levelReward，Lv1~50）。
 *  - 但**去掉技能书**：用户明确「不要给技能」，所以过滤 skillBook* 类道具（Lv.40 原本发技能书·攻击）。
 *  - 曾经短暂上线的「10 档固定金币」已改为支线委托（LEVEL_TIER_GOLD_SIDE_ROWS）。
 */
const SKILL_ITEM_IDS = new Set([
  QUEST_ITEM_IDS.skillBookAttack,
  QUEST_ITEM_IDS.skillBookDefense,
  QUEST_ITEM_IDS.skillBookSupport,
].filter((value) => value != null));

const stripSkillRewards = (reward) => ({
  ...reward,
  items: (reward.items ?? []).filter((row) => !SKILL_ITEM_IDS.has(Number(row.id))),
});

const LEVEL_REWARDS = Array.from(
  { length: MAX_PLAYER_LEVEL },
  (_, index) => stripSkillRewards(levelReward(index + 1)),
);

for(const [category,quests] of Object.entries(QUEST_GROUPS)){
  quests.forEach((quest)=>Object.assign(quest,balanceQuestReward(quest,category)));
}

export {QUEST_GROUPS,ACHIEVEMENT_QUESTS,CATEGORIES,LEVEL_REWARDS};

export function findQuestReward(category,questId){
  const entries=category==='level'?LEVEL_REWARDS:QUEST_GROUPS[category];
  return entries?.find(entry=>String(entry.id)===String(questId))??null;
}
