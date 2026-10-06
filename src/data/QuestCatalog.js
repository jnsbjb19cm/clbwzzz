import { balanceQuestReward, levelReward } from './QuestRewardBalance.js';

export const MAX_PLAYER_LEVEL = 50;

// 《丛林保卫战 / Elfender》任务结构：
// 主线只承担魔幻森林的推进与关键冲突；支线按冒险、工坊、材料、BOSS等主题并行展开。
// 简单任务只说明目标，关键剧情任务提供更完整的背景；不使用开发备注充当世界观文本。

const q = (id, name, desc, story, goal, event, extra = {}) => ({
  id, name, desc, story, goal, event, ...extra,
});

function mainChain(rows, economy = {}) {
  return rows.map((row, index) => {
    const [name, desc, story, goal, event, extra = {}] = row;
    const base = typeof economy === 'function' ? economy(index) : economy;
    return q('m' + (index + 1), name, desc, story, goal, event, {
      ...(index > 0 ? { requires: 'm' + index } : {}),
      ...base,
      ...extra,
    });
  });
}

const mainEconomy = (i) => ({
  gold: 800 + i * 460,
  exp: 200 + i * 95,
  honor: i >= 7 ? 20 + Math.floor(i * 5) : 0,
  gem: (i + 1) % 6 === 0 ? 12 + Math.floor(i / 2) : 0,
});

// ---- 主线：魔幻森林防卫记录 ----
// “累计”类目标使用 cumulativeKey，解锁时直接读取真实总进度，不会从0重新计算。
const MAIN_QUESTS = mainChain([
  [
    '进入森林',
    '完成1个野外冒险关卡。',
    '主城外的第一段林路已经重新开放。先确认沿途的敌情与地形，为后续巡查建立一条安全路线。',
    1, 'adventure_complete',
  ],
  [
    '林径上的残痕',
    '累计完成3个野外冒险关卡。',
    '断裂的枝条、被踩乱的苔藓和散落的补给袋都指向同一个方向。异常不是偶发事件，必须继续深入。',
    3, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '失联的巡逻队',
    '累计完成5个野外冒险关卡。',
    '北侧巡逻队迟迟没有返回。沿着他们最后一次报告的位置搜索，先把外围几处危险地带清理出来。',
    5, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '被破坏的营地',
    '收集12个一级羊皮纸。',
    '临时营地遭到破坏，记录地图和传递命令用的羊皮纸几乎耗尽。先补齐最基础的物资，后续队伍才能继续向前。',
    12, 'item_gain', { itemId:50001 },
  ],
  [
    '重新整备',
    '成功强化卡牌1次。',
    '前方出现了更强的敌对单位。与其贸然推进，不如先让一名常用伙伴完成一次强化。',
    1, 'card_strengthen',
  ],
  [
    '越过旧木桥',
    '累计完成8个野外冒险关卡。',
    '旧木桥另一侧曾是稳定的运输路，如今却被敌人反复骚扰。清理沿线区域，让补给重新能够通过。',
    8, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '断掉的补给线',
    '加工2个二级羊皮纸。',
    '低阶材料已经难以支撑深入行动。把现有羊皮纸加工成更耐用的二级材料，恢复前线所需的记录与制作能力。',
    2, 'material_combine', { materialKind:'parchment', materialLevel:2 },
  ],
  [
    '暗处的目光',
    '累计完成10个野外冒险关卡。',
    '最近几次战斗中，总有敌人刻意避开正面冲突，像是在观察守卫的阵型。继续推进，找出它们撤退的方向。',
    10, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '多特的踪迹',
    '累计完成12个野外冒险关卡。',
    '被丢弃的饰物、反复出现的足迹和几处异常空旷的战场拼出了一个名字——痴情的多特。它没有停留在普通冒险路线上，而是在更深处等待挑战者。',
    12, 'adventure_complete', { cumulativeKey:'totalAdventures', bossUnlock:'boss_dot' },
  ],
  [
    '挑战前夜',
    '将1张卡牌强化到2星。',
    '多特不会像普通敌人一样被沿途清理。准备一名真正能够承担核心位置的伙伴，再进入独立BOSS挑战。',
    1, 'card_strengthen', { minStar:2 },
  ],
  [
    '痴情的多特',
    '在独立BOSS入口击败“痴情的多特”。',
    '森林外围的骚动终于找到了源头之一。击败多特不是整场战争的终点，却能让守卫重新掌握这一带的主动权。',
    1, 'boss_defeated', { bossId:'boss_dot', gold:6500, exp:1500 },
  ],
  [
    '战后的空地',
    '累计完成15个野外冒险关卡。',
    '多特倒下后，原本被它占据的区域出现了新的通路。敌人的行动却没有因此停止，反而开始向森林深处收缩。',
    15, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '烧焦的林冠',
    '累计完成18个野外冒险关卡。',
    '越往前走，树冠上的灼痕越明显。这里发生过规模不小的冲突，而且有人在刻意抹去留下的信息。',
    18, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '碎裂的宝石',
    '收集8个二级宝石。',
    '被破坏的遗迹周围散落着大量宝石碎片。整理出能够继续使用的二级宝石，或许能为后续制作提供线索。',
    8, 'item_gain', { itemId:50012 },
  ],
  [
    '守住缺口',
    '完成2场零阵亡战斗。',
    '敌人开始试探新打开的缺口。这里不能靠消耗战守住——尽量完整地保存战团力量，连续稳住两次进攻。',
    2, 'battle_nodeath',
  ],
  [
    '沉入林下的遗迹',
    '累计完成21个野外冒险关卡。',
    '旧地图上没有标记这片遗迹。它被藤蔓和泥土掩盖了很久，而近期的战斗重新暴露了入口。',
    21, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '遗迹中的残页',
    '成功制作1张卡牌。',
    '残页记载的阵型需要新的伙伴才能完整发挥。利用已经积累的材料制作一张卡牌，为战团增加一种新的选择。',
    1, 'card_craft',
  ],
  [
    '深入危险区域',
    '累计完成24个野外冒险关卡。',
    '从这里开始，敌人的部署明显更有组织。道路不再只是被占领，而像是有人正在建立一条通往森林核心的进攻线。',
    24, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '陌生的DNA样本',
    '收集8个二级卡牌DNA。',
    '前线带回了一批无法立即确认来源的样本。先整理出足够的二级DNA，为后续研究和卡牌制作保留材料。',
    8, 'item_gain', { itemId:50032 },
  ],
  [
    '逼近核心林地',
    '累计完成28个野外冒险关卡。',
    '道路越来越窄，敌人却越来越密集。魔幻森林的核心区域就在前方，任何一次失误都可能让已经恢复的补给线再次中断。',
    28, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '完整的防线',
    '完成3场零阵亡战斗。',
    '守卫已经没有多余力量反复补充损失。用更成熟的站位和阵容完成三场稳定防守。',
    3, 'battle_nodeath',
  ],
  [
    '最后一段林路',
    '累计完成32个野外冒险关卡。',
    '生命之源外围只剩最后几段路线没有完全恢复。敌人把残余力量集中在这里，试图拖住守卫前进的速度。',
    32, 'adventure_complete', { cumulativeKey:'totalAdventures' },
  ],
  [
    '通往生命之源',
    '累计完成34个野外冒险关卡。',
    '最后的障碍被清除后，主城与生命之源之间终于重新连成一条完整路线。森林仍有未解决的威胁，但至少这一阶段的主动权已经重新回到埃尔夫守卫手中。',
    34, 'adventure_complete', { cumulativeKey:'totalAdventures', gold:30000, gem:120, honor:450, exp:3800 },
  ],
], mainEconomy);

// ---- 支线：按主题并行，不再强制 s1 → s58 ----
const SIDE_QUESTS = [
  // 冒险记录
  q('s_adv_1','林外熟客','累计完成5个野外冒险关卡。','走过几次之后，外围路线已经不再陌生。',5,'adventure_complete',{cumulativeKey:'totalAdventures',gold:900,exp:180}),
  q('s_adv_2','更深一点','累计完成15个野外冒险关卡。','熟悉外围只是开始，真正复杂的地形还在更深处。',15,'adventure_complete',{requires:'s_adv_1',cumulativeKey:'totalAdventures',gold:2200,exp:360}),
  q('s_adv_3','森林行者','累计完成30个野外冒险关卡。','你已经走过大半已开放区域，也开始能够从地形判断一场战斗会在哪里变得困难。',30,'adventure_complete',{requires:'s_adv_2',cumulativeKey:'totalAdventures',gold:5200,exp:720}),

  // 强化粉
  q('s_pow_1','粉末储备','收集10个一级强化粉。','最基础的强化材料，先留出一份稳定库存。',10,'item_gain',{itemId:10001}),
  q('s_pow_2','更细的粉末','收集8个二级强化粉。','二级强化开始频繁消耗这类材料。',8,'item_gain',{requires:'s_pow_1',itemId:10002}),
  q('s_pow_3','高阶强化准备','收集5个三级强化粉。','三级强化粉不必囤得夸张，但关键时候不能没有。',5,'item_gain',{requires:'s_pow_2',itemId:10003}),

  // 羊皮纸
  q('s_par_1','空白卷册','收集15个一级羊皮纸。','制作与加工都会用到。',15,'item_gain',{itemId:50001}),
  q('s_par_2','耐用卷册','收集10个二级羊皮纸。','二级羊皮纸已经能承担更稳定的制作需求。',10,'item_gain',{requires:'s_par_1',itemId:50002}),
  q('s_par_3','珍贵残页','收集6个三级羊皮纸。','三级材料开始有明显价值，最好为真正需要的制作留一部分。',6,'item_gain',{requires:'s_par_2',itemId:50003}),

  // 宝石
  q('s_gem_1','闪光碎片','收集10个一级宝石。','把散落的小块宝石集中起来。',10,'item_gain',{itemId:50011}),
  q('s_gem_2','完整切面','收集8个二级宝石。','品质提升后，宝石开始成为制作中的重要消耗。',8,'item_gain',{requires:'s_gem_1',itemId:50012}),
  q('s_gem_3','稳定晶核','收集5个三级宝石。','高阶宝石难以大量获得，先完成一份可用储备。',5,'item_gain',{requires:'s_gem_2',itemId:50013}),

  // DNA
  q('s_dna_1','样本登记','收集10个一级卡牌DNA。','先把常见样本整理归档。',10,'item_gain',{itemId:50031}),
  q('s_dna_2','进阶样本','收集8个二级卡牌DNA。','更高阶的制作开始需要稳定的DNA来源。',8,'item_gain',{requires:'s_dna_1',itemId:50032}),
  q('s_dna_3','稀有样本','收集5个三级卡牌DNA。','这一等级的样本已经值得单独保存。',5,'item_gain',{requires:'s_dna_2',itemId:50033}),

  // 保护符
  q('s_charm_1','强化保险','收集4个二级保护符。','高星强化之前，准备一些保护符总比失败后后悔更划算。',4,'item_gain',{itemId:50022}),
  q('s_charm_2','更稳的选择','收集3个三级保护符。','真正昂贵的强化需要更可靠的保护。',3,'item_gain',{requires:'s_charm_1',itemId:50023}),

  // 工坊：制作
  q('s_craft_1','第一次成品','成功制作1张卡牌。','把材料真正变成战团成员。',1,'card_craft'),
  q('s_craft_2','不止一种选择','累计成功制作3张卡牌。','多制作几次，战团的搭配空间才会真正打开。',3,'card_craft',{requires:'s_craft_1',cumulativeKey:'totalCrafts'}),
  q('s_craft_3','三级制作','成功制作1张3级卡牌。','开始尝试高一级的制作目标。',1,'card_craft',{requires:'s_craft_2',craftLevel:3}),

  // 工坊：强化
  q('s_str_1','第二颗星','将1张卡牌强化到2星。','先确定一名常用核心。',1,'card_strengthen',{minStar:2}),
  q('s_str_2','三星主力','将1张卡牌强化到3星。','三星以后，资源投入需要更有选择。',1,'card_strengthen',{requires:'s_str_1',minStar:3}),
  q('s_str_3','四星核心','将1张卡牌强化到4星。','把真正适合当前阵容的卡牌推到四星。',1,'card_strengthen',{requires:'s_str_2',minStar:4}),

  // 材料加工
  q('s_mat_1','第一次加工','完成2次材料加工。','把低阶材料转成真正用得上的高阶材料。',2,'material_combine'),
  q('s_mat_2','二级羊皮纸','加工3个二级羊皮纸。','先把一种常用材料的加工路径走熟。',3,'material_combine',{requires:'s_mat_1',materialKind:'parchment',materialLevel:2}),
  q('s_mat_3','二级宝石','加工3个二级宝石。','宝石也需要稳定的加工来源。',3,'material_combine',{requires:'s_mat_1',materialKind:'gem',materialLevel:2}),

  // BOSS短链
  q('s_boss_1','多特现身','推进冒险，解锁独立BOSS“痴情的多特”。','普通冒险中的线索已经足够明确，独立挑战入口开始出现多特的记录。',1,'boss_unlock',{bossId:'boss_dot',unlockAdventures:12}),
  q('s_boss_2','先试一次','挑战“痴情的多特”1次。','不要求第一次就取胜，先熟悉它的节奏。',1,'boss_challenge',{requires:'s_boss_1',bossId:'boss_dot'}),
  q('s_boss_3','结束纠缠','击败“痴情的多特”1次。','熟悉机制之后，用完整战团结束这场挑战。',1,'boss_defeated',{requires:'s_boss_2',bossId:'boss_dot'}),

  // 战斗技巧
  q('s_guard_1','完整撤回','完成1场零阵亡战斗。','赢下来，同时把每名伙伴都带回来。',1,'battle_nodeath'),
  q('s_guard_2','稳定防守','累计完成3场零阵亡战斗。','偶尔一次运气很好不算稳定，连续做到才说明阵型真的可靠。',3,'battle_nodeath',{requires:'s_guard_1'}),
  q('s_fast_1','三分钟以内','完成2场180秒内结束的战斗。','熟悉关卡后，尝试减少拖延和无效部署。',2,'battle_duration',{maxDuration:180}),
];

// ---- 日常：少而明确，不做3/5/8次同类套娃 ----
const DAILY_QUESTS = [
  q('d_adv','今日巡行','完成3个野外冒险关卡。','今天去森林里走一圈。',3,'adventure_complete',{gold:1400,exp:280}),
  q('d_battle','保持手感','完成4场战斗。','完成几场正常战斗即可。',4,'battle_complete',{gold:1500,exp:280}),
  q('d_strength','一次强化','成功强化卡牌1次。','给常用卡补一点成长。',1,'card_strengthen',{gold:1500,exp:260}),
  q('d_craft','工坊开炉','成功制作1张卡牌。','完成一次制作。',1,'card_craft',{gold:1700,exp:300}),
  q('d_powder','强化粉入库','收集5个一级强化粉。','补一点基础材料。',5,'item_gain',{itemId:10001,gold:1200,exp:220}),
  q('d_parchment','羊皮纸入库','收集5个一级羊皮纸。','为制作留一份基础库存。',5,'item_gain',{itemId:50001,gold:1200,exp:220}),
  q('d_material','加工两份材料','完成2次材料加工。','把今天得到的低阶材料往上加工。',2,'material_combine',{gold:1600,exp:280}),
  q('d_safe','全员归队','完成1场零阵亡战斗。','稳稳地赢下一场。',1,'battle_nodeath',{gold:1800,exp:320}),
];

// ---- 成就：只记录长期里程碑 ----
const ACHIEVEMENT_QUESTS = [
  q('a1','初出茅庐','达到Lv.5。','最基础的战斗和养成已经熟悉。',5,'level',{gold:3000,gem:20,honor:60}),
  q('a2','独立行动','达到Lv.10。','已经能够独立处理前期冒险。',10,'level',{gold:6000,gem:35,honor:100}),
  q('a3','前线成员','达到Lv.15。','你开始成为守卫队里稳定的一份力量。',15,'level',{gold:9000,gem:50,honor:160}),
  q('a4','远征骨干','达到Lv.20。','大部分中期内容已经有能力独立面对。',20,'level',{gold:14000,gem:70,honor:240}),
  q('a5','纳斯塔勇士','达到Lv.25。','战团与材料循环都开始成型。',25,'level',{gold:20000,gem:90,honor:340}),
  q('a6','纳斯塔英雄','达到Lv.30。','高难度内容已经成为日常的一部分。',30,'level',{gold:28000,gem:120,honor:460}),
  q('a7','百次交锋','累计击败100名敌对单位。','第一份完整的长期战绩。',100,'kill_total',{gold:3500,honor:80}),
  q('a8','前线老兵','累计击败500名敌对单位。','你已经见过相当多种战场局势。',500,'kill_total',{gold:9000,honor:180}),
  q('a9','千次交锋','累计击败1000名敌对单位。','上千次正面交锋留下了真正的经验。',1000,'kill_total',{gold:18000,honor:320}),
  q('a10','传奇战绩','累计击败5000名敌对单位。','这是长期游戏过程留下的记录。',5000,'kill_total',{gold:42000,honor:700}),
  q('a11','战团成形','拥有10张卡牌。','阵容开始有了替换空间。',10,'card_total',{gem:30,honor:60}),
  q('a12','卡牌收藏家','拥有20张卡牌。','不同费用和定位的组合越来越丰富。',20,'card_total',{gem:60,honor:120}),
  q('a13','图鉴达人','拥有30张卡牌。','你的收藏已经覆盖了大量战术选择。',30,'card_total',{gem:100,honor:220}),
  q('a14','充足后勤','累计获得50000金币。','长期养成离不开稳定的金币来源。',50000,'gold_total',{gem:50,honor:100}),
  q('a15','荣誉加身','累计获得1000荣誉。','长期贡献已经得到充分认可。',1000,'honor_total',{gold:8000,gem:45,honor:120}),
  q('a16','百战之前','累计完成50场战斗。','五十场战斗足以建立自己的节奏。',50,'battle_total',{gold:10000,honor:170}),
  q('a17','森林行遍','累计完成30个野外冒险关卡。','大量区域已经留下你的足迹。',30,'adventure_total',{gold:14000,gem:80,honor:220}),
  q('a18','工坊常客','累计完成20次强化或制作。','长期养成已经形成稳定习惯。',20,'strengthen_total',{gold:10000,gem:70,honor:190}),
  q('a19','道具熟手','累计使用100次道具。','你已经很少让真正有用的道具一直躺在背包里。',100,'item_total',{gold:8500,gem:55,honor:150}),
  q('a20','魔幻森林传奇','完成19项其他成就。','从最初的试探到稳定守住前线，这份记录见证了完整的长期成长。',19,'achieve_total',{gold:60000,gem:250,honor:1200}),
];

// ---- 周常：覆盖不同系统，不重复堆高同一个数字 ----
const WEEKLY_QUESTS = [
  q('w_battle','本周出勤','本周完成12场战斗。','保持稳定出勤。',12,'battle_complete',{gold:6500,exp:850}),
  q('w_adv','本周远行','本周完成8个野外冒险关卡。','推进不同区域。',8,'adventure_complete',{gold:7800,exp:980}),
  q('w_kill','清理前线','本周累计击败80名敌对单位。','把沿途威胁控制在安全范围。',80,'kill_enemy',{gold:7600,exp:900}),
  q('w_strength','工坊强化','本周成功强化卡牌5次。','让一周获得的材料真正转化成战力。',5,'card_strengthen',{gold:8200,exp:1050}),
  q('w_craft','工坊制作','本周成功制作2张卡牌。','为战团增加新的选择。',2,'card_craft',{gold:9000,exp:1150}),
  q('w_items','补给入库','本周累计获得30件道具或材料。','不限制种类，正常冒险和养成即可累计。',30,'item_gain',{gold:7000,exp:900}),
  q('w_material','加工计划','本周完成6次材料加工。','把低阶库存逐步向上转化。',6,'material_combine',{gold:8800,exp:1100}),
  q('w_safe','稳定阵线','本周完成3场零阵亡战斗。','用稳定阵容完成高质量防守。',3,'battle_nodeath',{gold:10000,honor:180,exp:1250}),
];

// ---- 挑战：条件特殊，而不是单纯把日常数字放大 ----
const CHALLENGE_QUESTS = [
  q('c1','痴情的多特','在独立BOSS入口击败“痴情的多特”。','正面结束多特的威胁。',1,'boss_defeated',{bossId:'boss_dot',gold:6000,exp:1500}),
  q('c2','愤怒的沃里尔','在独立BOSS入口击败“愤怒的沃里尔”。','完成对应解锁后再来挑战。',1,'boss_defeated',{bossId:'boss_gravo',gold:7500,exp:1800}),
  q('c3','火焰的复仇','在独立BOSS入口击败“火焰的复仇”。','面对高压输出时重新安排防线。',1,'boss_defeated',{bossId:'boss_fire',gold:9000,exp:2100}),
  q('c4','树妖洛丽塔','在独立BOSS入口击败“树妖洛丽塔”。','处理召唤与持续压制，找到安全输出窗口。',1,'boss_defeated',{bossId:'boss_forest',gold:10500,exp:2400}),
  q('c5','毫发无损','完成3场零阵亡战斗。','不是只求胜利，而是要求完整保存战团。',3,'battle_nodeath',{gold:10000,honor:180,exp:1900}),
  q('c6','迅速解决','完成3场180秒内结束的战斗。','把熟悉的关卡打得更干净。',3,'battle_duration',{maxDuration:180,gold:10000,exp:1900}),
  q('c7','森林深行','累计完成34个野外冒险关卡。','走到当前冒险路线的尽头。',34,'adventure_complete',{cumulativeKey:'totalAdventures',gold:18000,exp:2800}),
  q('c8','核心养成','累计成功强化10次。','把资源投入真正需要的伙伴。',10,'card_strengthen',{cumulativeKey:'totalStrengthens',gold:13000,exp:2300}),
  q('c9','独立制作者','累计成功制作8张卡牌。','用自己的材料建立多样化战团。',8,'card_craft',{cumulativeKey:'totalCrafts',gold:15000,exp:2500}),
  q('c10','材料循环','累计完成15次材料加工。','建立稳定的低阶到高阶材料循环。',15,'material_combine',{gold:16000,exp:2600}),
];

const QUEST_GROUPS = {
  main: MAIN_QUESTS,
  side: SIDE_QUESTS,
  daily: DAILY_QUESTS,
  weekly: WEEKLY_QUESTS,
  achievement: ACHIEVEMENT_QUESTS,
  challenge: CHALLENGE_QUESTS,
};

const CATEGORIES = [
  { id:'main', label:'主线任务', subtitle:'魔幻森林防卫记录' },
  { id:'side', label:'支线任务', subtitle:'探索、材料与工坊委托' },
  { id:'daily', label:'日常任务', subtitle:'每日重置' },
  { id:'weekly', label:'周常任务', subtitle:'每周一重置' },
  { id:'achievement', label:'成就', subtitle:'纳斯塔里程碑' },
  { id:'challenge', label:'挑战', subtitle:'BOSS与特殊条件' },
  { id:'level', label:'等级奖励', subtitle:'Lv.1-50' },
];

const LEVEL_REWARDS = Array.from({ length: MAX_PLAYER_LEVEL }, (_, i) => levelReward(i + 1));

for (const [category, quests] of Object.entries(QUEST_GROUPS)) {
  quests.forEach((quest, index) => Object.assign(quest, balanceQuestReward(quest, category, index)));
}

export { QUEST_GROUPS, ACHIEVEMENT_QUESTS, CATEGORIES, LEVEL_REWARDS };

export function findQuestReward(category, questId) {
  const entries = category === 'level' ? LEVEL_REWARDS : QUEST_GROUPS[category];
  return entries?.find(entry => String(entry.id) === String(questId)) ?? null;
}
