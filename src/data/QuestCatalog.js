import { balanceQuestReward, levelReward } from './QuestRewardBalance.js';

export const MAX_PLAYER_LEVEL = 50;

// 任务设计原则：
// 1. 主线承担森林战争的推进、危机与阶段收束；工坊/收集只在剧情确实需要时进入主线。
// 2. 支线按区域、资源、养成、技巧、BOSS人物弧拆分成短任务弧，不做一条超长串行清单。
// 3. 简单目标短写；人物与关键转折才展开背景。
// 4. 收集任务对应真实道具ID；“累计”目标读取长期统计，不在解锁后重新从0计算。
// 5. BOSS人物弧沿用 bossList.js 的既有背景，不另造相互冲突的身世。

const q=(id,name,desc,story,goal,event,extra={})=>({id,name,desc,story,goal,event,...extra});

function mainChain(rows,economy={}){
  return rows.map((row,index)=>{
    const [name,desc,story,goal,event,extra={}]=row;
    const base=typeof economy==='function'?economy(index):economy;
    return q('m'+(index+1),name,desc,story,goal,event,{
      ...(index>0?{requires:'m'+index}:{}),
      ...base,...extra,
    });
  });
}

function sideArc(prefix,arc,rows,economy={}){
  return rows.map((row,index)=>{
    const [name,desc,story,goal,event,extra={}]=row;
    const base=typeof economy==='function'?economy(index):economy;
    return q(prefix+(index+1),name,desc,story,goal,event,{
      arc,
      ...(index>0?{requires:prefix+index}:{}),
      ...base,...extra,
    });
  });
}

const mainEconomy=(i)=>({
  gold:900+i*520,
  exp:220+i*105,
  honor:i>=7?25+Math.floor(i*5):0,
  gem:(i+1)%6===0?12+Math.floor(i/2):0,
});
const sideEconomy=(i)=>({
  gold:650+i*240,
  exp:120+i*45,
  honor:i>=2?10+i*4:0,
});

// ---- 主线：五个BOSS人物弧 + 双线冒险会合 ----
const MAIN_QUESTS=mainChain([
  ['林缘警报','完成1个野外冒险关卡。','主城外的林路重新开放不久，巡逻队便发现了新的战斗痕迹。先走进森林，确认最外围的情况。',1,'adventure_complete',{chapter:'第一章 · 林缘警报',cumulativeKey:'totalAdventures'}],
  ['防线之外','累计完成3个野外冒险关卡。','零散的冲突正在连成一条线。敌人并不是偶然闯入，它们正沿着两侧路线向更深处活动。',3,'adventure_complete',{chapter:'第一章 · 林缘警报',cumulativeKey:'totalAdventures'}],
  ['缺少的记录','累计收集10个一级羊皮纸。','巡逻记录在混乱中损坏了不少。补齐一批基础羊皮纸，把地图、敌情和伤员名单重新整理出来。',10,'item_gain',{chapter:'第一章 · 林缘警报',itemId:50001,lifetimeItemId:50001}],
  ['西瓜突围','完成植物线第4节点“西瓜突围”。','植物线第一次真正遭遇多路推进。守住这一处，才能确认敌人是否在试探防线的承受极限。',1,'adventure_complete',{chapter:'第一章 · 林缘警报',route:0,adventureIndex:4,adventureKey:'0:4'}],
  ['另一侧的回应','完成怪物线第4节点。','另一条路线几乎同时出现了同等级别的压力。两边的异动彼此呼应，说明背后有人在有意识地调动战力。',1,'adventure_complete',{chapter:'第一章 · 林缘警报',route:1,adventureIndex:4,adventureKey:'1:4'}],
  ['先把队伍站稳','成功强化卡牌1次。','在继续追踪之前，至少让一名常用伙伴完成强化。后面的敌人不会再像林缘那些散兵一样容易处理。',1,'card_strengthen',{chapter:'第一章 · 林缘警报'}],

  ['药箱上的名字','累计完成8个野外冒险关卡。','一处被遗弃的临时诊疗点里还留着旧药箱和手写记录。记录的主人曾是一名医生——多特。后来，战争夺走了他的妻子，也改变了他。',8,'adventure_complete',{chapter:'第二章 · 多特的旧日',cumulativeKey:'totalAdventures'}],
  ['不再救人的医生','挑战“痴情的多特”1次。','多特曾经救人，如今却把对战争的仇恨倾泻在战场上。进入独立BOSS挑战，亲自确认他现在的力量。',1,'boss_challenge',{chapter:'第二章 · 多特的旧日',bossId:'boss_dot',bossChallengeId:'boss_dot'}],
  ['痴情的多特','击败“痴情的多特”1次。','失去妻子的那一刻让多特走向了另一个极端。击败他无法抹去过去，却能阻止更多人继续被他的仇恨吞没。',1,'boss_defeated',{chapter:'第二章 · 多特的旧日',bossId:'boss_dot',bossDefeatId:'boss_dot'}],
  ['坚盾连阵','完成植物线第8节点“坚盾连阵”。','多特倒下后，正面战线并没有松动。巨盾与冰系后排组成的新阵地，说明敌人的组织性正在提高。',1,'adventure_complete',{chapter:'第二章 · 多特的旧日',route:0,adventureIndex:8,adventureKey:'0:8'}],
  ['镜像战线','完成怪物线第8节点。','怪物线也出现了相同强度的阵地。两条路线都在被迫升级，森林里的冲突已经不再是小规模骚扰。',1,'adventure_complete',{chapter:'第二章 · 多特的旧日',route:1,adventureIndex:8,adventureKey:'1:8'}],

  ['残破的军令','累计完成14个野外冒险关卡。','被踩进泥里的军令仍能辨认出整齐的编号和部署记号。留下它的人显然受过严格训练——这与沃里尔曾经的军官身份完全吻合。',14,'adventure_complete',{chapter:'第三章 · 沃里尔的怒火',cumulativeKey:'totalAdventures'}],
  ['别再留下空位','完成1场零阵亡战斗。','沃里尔失去了妻子和儿子，最终把悲痛变成了怒火。面对他的部队，这一次尽量让所有伙伴都完整归队。',1,'battle_nodeath',{chapter:'第三章 · 沃里尔的怒火'}],
  ['愤怒的沃里尔','挑战“愤怒的沃里尔”1次。','他仍保留着军官的指挥方式，只是目标已经从守护变成了报复。进入独立BOSS挑战。',1,'boss_challenge',{chapter:'第三章 · 沃里尔的怒火',bossId:'boss_gravo',bossChallengeId:'boss_gravo'}],
  ['让怒火停下','击败“愤怒的沃里尔”1次。','沃里尔并非不知道自己失去了什么，正因为知道，他才始终无法从痛苦里走出来。结束这场战斗，让他的怒火不再继续蔓延。',1,'boss_defeated',{chapter:'第三章 · 沃里尔的怒火',bossId:'boss_gravo',bossDefeatId:'boss_gravo'}],

  ['焦黑的树冠','累计完成18个野外冒险关卡。','越往前走，树冠上的灼痕越密。火焰并不是战斗留下的偶然痕迹，而像是有人主动让它沿着林路扩散。',18,'adventure_complete',{chapter:'第四章 · 灼烧地带',cumulativeKey:'totalAdventures'}],
  ['残留的高温','累计收集8个二级宝石。','高温让普通碎片失去稳定性。整理一批能够承受更强法术的二级宝石，为进入灼烧区域做准备。',8,'item_gain',{chapter:'第四章 · 灼烧地带',itemId:50012,lifetimeItemId:50012}],
  ['炮阵试炼','完成植物线第12节点“炮阵试炼”。','玉米炮手与巨盾构成的阵地封住了正面。只有突破这一层火力网，才能继续追踪异常火焰的源头。',1,'adventure_complete',{chapter:'第四章 · 灼烧地带',route:0,adventureIndex:12,adventureKey:'0:12'}],
  ['另一面的火网','完成怪物线第12节点。','另一条路线同样进入高压阶段。两侧同时传来的火光，把那个只剩复仇念头的火球术士推到了视野中央。',1,'adventure_complete',{chapter:'第四章 · 灼烧地带',route:1,adventureIndex:12,adventureKey:'1:12'}],
  ['火焰的复仇','挑战“火焰的复仇”1次。','火焰扭曲了他的心智，复仇成了他继续存在的唯一理由。进入独立BOSS挑战，切断这场不断扩散的灼烧。',1,'boss_challenge',{chapter:'第四章 · 灼烧地带',bossId:'boss_fire',bossChallengeId:'boss_fire'}],
  ['熄灭复仇','击败“火焰的复仇”1次。','火焰可以继续燃烧，仇恨却不能永远把整片森林当作燃料。击败他，保住剩下的林地。',1,'boss_defeated',{chapter:'第四章 · 灼烧地带',bossId:'boss_fire',bossDefeatId:'boss_fire'}],

  ['树根下的旧物','累计完成22个野外冒险关卡。','一片被树根顶起的旧物把线索带向了萝莉塔。她幼年失去父母，由外婆抚养长大；后来连唯一以为能够抓住的幸福，也随着男友被征召并死在战场上而破碎。',22,'adventure_complete',{chapter:'第五章 · 树影中的萝莉塔',cumulativeKey:'totalAdventures'}],
  ['树荫防线','完成植物线第13节点“树荫防线”。','树精守卫开始直接介入前线。自然力量正在变得异常活跃，而萝莉塔正是这股变化最危险的中心。',1,'adventure_complete',{chapter:'第五章 · 树影中的萝莉塔',route:0,adventureIndex:13,adventureKey:'0:13'}],
  ['蘑菇回廊','完成植物线第14节点“蘑菇回廊”。','地下单位和蘑菇仙人不断拖慢推进速度。穿过这段回廊，才能接近树妖活动最频繁的区域。',1,'adventure_complete',{chapter:'第五章 · 树影中的萝莉塔',route:0,adventureIndex:14,adventureKey:'0:14'}],
  ['树妖萝莉塔','挑战“树妖萝莉塔”1次。','萝莉塔在绝望中接触到神秘的自然力量，最终与树妖融合。进入独立BOSS挑战，面对她把痛苦归还给世界的决意。',1,'boss_challenge',{chapter:'第五章 · 树影中的萝莉塔',bossId:'boss_forest',bossChallengeId:'boss_forest'}],
  ['让森林安静下来','击败“树妖萝莉塔”1次。','她曾经只是想拥有一个不会再次失去的家。如今必须先阻止失控的力量继续伤害森林，才能让这片区域真正安静下来。',1,'boss_defeated',{chapter:'第五章 · 树影中的萝莉塔',bossId:'boss_forest',bossDefeatId:'boss_forest'}],

  ['骤降的温度','累计完成27个野外冒险关卡。','火焰熄灭、树影退去之后，另一种更加直接的异常出现了：气温骤降，地面开始结霜，连施法留下的痕迹都被冻在原地。',27,'adventure_complete',{chapter:'第六章 · 安娜的寒风',cumulativeKey:'totalAdventures'}],
  ['稳定法术结界','累计收集5个三级宝石。','面对强大的冰系魔法，临时拼凑的低阶材料已经不够。准备几枚三级宝石，维持更稳定的法术结界。',5,'item_gain',{chapter:'第六章 · 安娜的寒风',itemId:50013,lifetimeItemId:50013}],
  ['剑客合击','完成植物线第15节点“剑客合击”。','前线进入最后阶段，剑客与勇士交替推进。守住阵形，不要让寒潮掩盖掉真正的攻击方向。',1,'adventure_complete',{chapter:'第六章 · 安娜的寒风',route:0,adventureIndex:15,adventureKey:'0:15'}],
  ['古树攻坚','完成植物线第16节点“古树攻坚”。','战争古树与全线支援构成了植物线最后一道阶段难关。突破这里，植物线就只剩最终会合。',1,'adventure_complete',{chapter:'第六章 · 安娜的寒风',route:0,adventureIndex:16,adventureKey:'0:16'}],
  ['另一条线的终点','完成怪物线第16节点。','怪物线也终于推进到尽头。两条战线都完成之后，通往最终区域的条件已经具备。',1,'adventure_complete',{chapter:'第六章 · 安娜的寒风',route:1,adventureIndex:16,adventureKey:'1:16'}],
  ['疯狂的安娜','挑战“疯狂的安娜”1次。','安娜从小跟随母亲学习魔法。母亲因敌人觊觎魔法力量而被绑架并杀害，从那以后，仇恨彻底吞没了她。进入独立BOSS挑战，面对她已经失控的极寒魔法。',1,'boss_challenge',{chapter:'第六章 · 安娜的寒风',bossId:'boss_ice',bossChallengeId:'boss_ice'}],
  ['冰封终止','击败“疯狂的安娜”1次。','强大的法术曾经来自母亲的教导，如今却只剩复仇与杀戮。击败安娜，结束寒风对森林核心区域的封锁。',1,'boss_defeated',{chapter:'第六章 · 安娜的寒风',bossId:'boss_ice',bossDefeatId:'boss_ice'}],
  ['双线会合','完成大陆最终关。','植物线与怪物线终于在最后区域会合。跨过这道关卡，当前阶段的森林防卫告一段落；那些被战争撕开的伤口不会立刻消失，但通往生命之源的道路重新掌握在守卫手中。',1,'adventure_complete',{chapter:'终章 · 双线会合',finalOnly:true,adventureKey:'final',gold:36000,gem:150,honor:520,exp:4500}],
],mainEconomy);

// ---- 支线：区域见闻。目标来自 AdventureStageDesign 的实际节点内容。 ----
const SIDE_ADVENTURE_PLANT=sideArc('sp','植物线见闻',[
  ['第一次站稳','完成植物线第1节点。','前排负责撑住冲击，两翼才有时间稳定输出。先把最基础的阵形打顺。',1,'adventure_complete',{route:0,adventureIndex:1,adventureKey:'0:1'}],
  ['投手加入','完成植物线第2节点。','南瓜加入后排以后，战场第一次真正要求兼顾远近距离。',1,'adventure_complete',{route:0,adventureIndex:2,adventureKey:'0:2'}],
  ['补给阵地','完成植物线第3节点。','小麦与投手同时出现时，拖得越久越麻烦。试着先处理会让阵线持续成长的单位。',1,'adventure_complete',{route:0,adventureIndex:3,adventureKey:'0:3'}],
  ['寒冰前哨','完成植物线第5节点。','控制单位开始进入阵容。被减速和卡位以后，原本安全的后排也可能突然暴露。',1,'adventure_complete',{route:0,adventureIndex:5,adventureKey:'0:5'}],
  ['错峰夹击','完成植物线第6节点。','上下路不会同时压满，这反而更考验什么时候补位、什么时候保留资源。',1,'adventure_complete',{route:0,adventureIndex:6,adventureKey:'0:6'}],
  ['补给护卫','完成植物线第7节点。','医生支援让轻装阵线变得难缠。先拆支援，再处理前排。',1,'adventure_complete',{route:0,adventureIndex:7,adventureKey:'0:7'}],
  ['交叉火网','完成植物线第9节点。','三头仙人掌把火力铺向多条路线。过度集中站位会让整条防线一起吃下压力。',1,'adventure_complete',{route:0,adventureIndex:9,adventureKey:'0:9'}],
  ['地底来客','完成植物线第10节点。','地下单位会绕过习惯中的正面节奏。给后排留出能够重新补位的空间。',1,'adventure_complete',{route:0,adventureIndex:10,adventureKey:'0:10'}],
  ['空地交替','完成植物线第11节点。','空中与地面威胁交替出现，单一功能的阵容开始暴露短板。',1,'adventure_complete',{route:0,adventureIndex:11,adventureKey:'0:11'}],
  ['树荫之下','再次完成植物线第13节点。','树精守卫能把前排拖得很久。与其平均分火，不如先打开一个真正能推进的缺口。',1,'adventure_complete',{route:0,adventureIndex:13,adventureKey:'0:13'}],
  ['回廊里的蘑菇','再次完成植物线第14节点。','地下单位负责牵制，蘑菇仙人负责把战线拉长。分批处理会比一次铺满单位更稳。',1,'adventure_complete',{route:0,adventureIndex:14,adventureKey:'0:14'}],
  ['最后的合击','再次完成植物线第15节点。','剑客、勇士和控制单位同时出现时，真正考验的是阵容有没有替补方案。',1,'adventure_complete',{route:0,adventureIndex:15,adventureKey:'0:15'}],
],sideEconomy);

const SIDE_ADVENTURE_MONSTER=sideArc('sm','怪物线见闻',[
  ['另一面的初阵','完成怪物线第1节点。','相同的战斗预算换成怪物单位后，攻击节奏会明显变化。先熟悉这条路线的出手方式。',1,'adventure_complete',{route:1,adventureIndex:1,adventureKey:'1:1'}],
  ['第二种解法','完成怪物线第2节点。','同等级并不代表同打法。观察怪物单位的技能节奏，再决定资源应该花在哪一排。',1,'adventure_complete',{route:1,adventureIndex:2,adventureKey:'1:2'}],
  ['怪物线补给战','完成怪物线第3节点。','支援与输出换了角色以后，原先在植物线形成的优先级需要重新判断。',1,'adventure_complete',{route:1,adventureIndex:3,adventureKey:'1:3'}],
  ['冰冷的镜像','完成怪物线第5节点。','同样是控制主题，怪物单位带来的威胁窗口并不相同。',1,'adventure_complete',{route:1,adventureIndex:5,adventureKey:'1:5'}],
  ['错峰的另一侧','完成怪物线第6节点。','把植物线学到的补位习惯带过来，再看看哪些地方需要改变。',1,'adventure_complete',{route:1,adventureIndex:6,adventureKey:'1:6'}],
  ['镜像火网','完成怪物线第9节点。','面对多路输出时，怪物线更容易让人误判真正的主攻方向。',1,'adventure_complete',{route:1,adventureIndex:9,adventureKey:'1:9'}],
  ['地下的回声','完成怪物线第10节点。','当地面与地下威胁互换角色，保留机动位置比堆满一排更重要。',1,'adventure_complete',{route:1,adventureIndex:10,adventureKey:'1:10'}],
  ['终点之前','完成怪物线第15节点。','距离路线终点只剩一步。把这条线真正稳定下来，再考虑最后的会合。',1,'adventure_complete',{route:1,adventureIndex:15,adventureKey:'1:15'}],
],sideEconomy);

// ---- 支线：真实材料收集 ----
const SIDE_POWDER=sideArc('sf','强化粉储备',[
  ['一小袋粉末','累计收集12个一级强化粉。','最常用的强化材料，不用囤太多，但手里不能一点没有。',12,'item_gain',{itemId:10001,lifetimeItemId:10001}],
  ['二级粉末','累计收集10个二级强化粉。','二星以后的成长会越来越依赖它。',10,'item_gain',{itemId:10002,lifetimeItemId:10002}],
  ['三级粉末','累计收集8个三级强化粉。','开始进入真正需要规划资源的阶段。',8,'item_gain',{itemId:10003,lifetimeItemId:10003}],
  ['四级粉末','累计收集5个四级强化粉。','高阶资源数量少，优先留给核心卡。',5,'item_gain',{itemId:10004,lifetimeItemId:10004}],
  ['五级粉末','累计收集3个五级强化粉。','这一等级已经属于后期储备。',3,'item_gain',{itemId:10005,lifetimeItemId:10005}],
],sideEconomy);

const SIDE_PARCHMENT=sideArc('ss','羊皮纸档案',[
  ['空白卷册','累计收集18个一级羊皮纸。','造卡和加工都会用到，先准备一批基础库存。',18,'item_gain',{itemId:50001,lifetimeItemId:50001}],
  ['耐用卷册','累计收集12个二级羊皮纸。','二级材料开始进入日常制作。',12,'item_gain',{itemId:50002,lifetimeItemId:50002}],
  ['古旧残页','累计收集8个三级羊皮纸。','越高阶越不适合随手消耗。',8,'item_gain',{itemId:50003,lifetimeItemId:50003}],
  ['完整古卷','累计收集4个四级羊皮纸。','能稳定留下四级羊皮纸，说明材料循环已经进入后期。',4,'item_gain',{itemId:50004,lifetimeItemId:50004}],
],sideEconomy);

const SIDE_GEM=sideArc('sg','宝石储藏',[
  ['微光碎石','累计收集15个一级宝石。','基础宝石数量多，用途也最广。',15,'item_gain',{itemId:50011,lifetimeItemId:50011}],
  ['清晰切面','累计收集10个二级宝石。','二级宝石已经足够承担中期制作。',10,'item_gain',{itemId:50012,lifetimeItemId:50012}],
  ['稳定晶核','累计收集6个三级宝石。','高阶法术与制作都需要更稳定的晶核。',6,'item_gain',{itemId:50013,lifetimeItemId:50013}],
  ['完整晶核','累计收集3个四级宝石。','真正稀有的库存，不要为了清背包随意消耗。',3,'item_gain',{itemId:50014,lifetimeItemId:50014}],
],sideEconomy);

const SIDE_DNA=sideArc('sd','DNA样本库',[
  ['基础样本','累计收集12个一级卡牌DNA。','先把常见样本整理完整。',12,'item_gain',{itemId:50031,lifetimeItemId:50031}],
  ['进阶样本','累计收集9个二级卡牌DNA。','更高等级的制作开始需要稳定DNA来源。',9,'item_gain',{itemId:50032,lifetimeItemId:50032}],
  ['稀有样本','累计收集6个三级卡牌DNA。','三级样本已经值得单独保存。',6,'item_gain',{itemId:50033,lifetimeItemId:50033}],
  ['核心样本','累计收集3个四级卡牌DNA。','这一等级的DNA应该只投入真正确定的目标。',3,'item_gain',{itemId:50034,lifetimeItemId:50034}],
],sideEconomy);

const SIDE_CHARM=sideArc('sc','保护符准备',[
  ['第一张护符','累计收集5个一级保护符。','低阶强化也可以提前熟悉保护机制。',5,'item_gain',{itemId:50021,lifetimeItemId:50021}],
  ['二级保护','累计收集4个二级保护符。','失败代价变高之后，保护符的价值开始明显。',4,'item_gain',{itemId:50022,lifetimeItemId:50022}],
  ['三级保护','累计收集3个三级保护符。','为高星核心留出真正可靠的保护材料。',3,'item_gain',{itemId:50023,lifetimeItemId:50023}],
  ['最后保险','累计收集2个四级保护符。','四级保护符不是常规消耗品，而是关键强化时的最后保险。',2,'item_gain',{itemId:50024,lifetimeItemId:50024}],
],sideEconomy);

// ---- 支线：工坊 ----
const SIDE_MATERIAL=sideArc('sx','材料加工',[
  ['第一次精炼','完成2次材料加工。','把低阶库存真正转成能继续使用的高阶材料。',2,'material_combine'],
  ['二级羊皮纸','加工3个二级羊皮纸。','先走熟羊皮纸的第一段加工链。',3,'material_combine',{materialKind:'parchment',materialLevel:2}],
  ['三级羊皮纸','加工2个三级羊皮纸。','从这里开始，每一次加工都更值得提前规划。',2,'material_combine',{materialKind:'parchment',materialLevel:3}],
  ['四级羊皮纸','加工1个四级羊皮纸。','完成一次最高阶段的羊皮纸加工。',1,'material_combine',{materialKind:'parchment',materialLevel:4}],
  ['二级宝石','加工3个二级宝石。','把宝石加工链也建立起来。',3,'material_combine',{materialKind:'gem',materialLevel:2}],
  ['三级宝石','加工2个三级宝石。','中高阶制作会持续消耗三级宝石。',2,'material_combine',{materialKind:'gem',materialLevel:3}],
  ['四级宝石','加工1个四级宝石。','得到一枚真正完整的四级宝石。',1,'material_combine',{materialKind:'gem',materialLevel:4}],
],sideEconomy);

const SIDE_STRENGTH=sideArc('su','卡牌强化',[
  ['第二颗星','将1张卡牌强化到2星。','先确定一名经常上场的伙伴。',1,'card_strengthen',{minStar:2}],
  ['三星主力','将1张卡牌强化到3星。','三星开始，材料投入要更有选择。',1,'card_strengthen',{minStar:3}],
  ['四星核心','将1张卡牌强化到4星。','把真正适合阵容的卡牌推到四星。',1,'card_strengthen',{minStar:4}],
  ['五星伙伴','将1张卡牌强化到5星。','一张五星卡意味着你已经愿意长期围绕它构筑阵容。',1,'card_strengthen',{minStar:5}],
  ['长期培养','累计成功强化10次。','不是只堆一张卡，把整个战团逐渐养起来。',10,'card_strengthen',{cumulativeKey:'totalStrengthens'}],
],sideEconomy);

const SIDE_CRAFT=sideArc('sv','卡牌制作',[
  ['第一张成品','成功制作1张1级卡牌。','从最基础的材料开始。',1,'card_craft',{craftLevel:1}],
  ['二级制作','成功制作1张2级卡牌。','材料要求提高，选择也开始变多。',1,'card_craft',{craftLevel:2}],
  ['三级制作','成功制作1张3级卡牌。','三级制作已经进入中期养成。',1,'card_craft',{craftLevel:3}],
  ['四级制作','成功制作1张4级卡牌。','准备好高阶材料，再完成一次四级制作。',1,'card_craft',{craftLevel:4}],
  ['自己的工坊','累计成功制作8张卡牌。','当制作不再只是尝试，战团的构成才真正掌握在自己手里。',8,'card_craft',{cumulativeKey:'totalCrafts'}],
],sideEconomy);

// ---- 支线：战斗技巧 ----
const SIDE_COMBAT=sideArc('st','战斗技巧',[
  ['先活着回来','完成1场零阵亡战斗。','赢并不难，完整地赢下来更重要。',1,'battle_nodeath'],
  ['稳定阵形','累计完成3场零阵亡战斗。','一次可以是运气，三次才说明阵形真的稳定。',3,'battle_nodeath',{cumulativeKey:'totalNoDeath'}],
  ['三分钟','完成2场180秒内结束的战斗。','熟悉战场后，减少无意义的等待和错误部署。',2,'battle_duration',{maxDuration:180}],
  ['两分半','完成2场150秒内结束的战斗。','再压缩一点时间，但不要为了快而让防线失控。',2,'battle_duration',{maxDuration:150}],
  ['十场胜利','累计获得10场战斗胜利。','稳定获胜比偶尔打出一场漂亮战斗更难。',10,'battle_win',{cumulativeKey:'totalBattleWins'}],
  ['百次交锋','累计击败100名敌对单位。','开始形成一份真正像样的前线记录。',100,'kill_enemy',{cumulativeKey:'totalKills'}],
  ['不靠侥幸','累计获得25场战斗胜利。','当胜利成为常态，阵容才算真正成型。',25,'battle_win',{cumulativeKey:'totalBattleWins'}],
  ['前线老兵','累计完成50场战斗。','五十场之后，许多判断已经不需要再犹豫。',50,'battle_complete',{cumulativeKey:'totalBattles'}],
],sideEconomy);


// ---- 支线：联机玩法只做可选任务弧，不阻塞主线 ----
const SIDE_COOP=sideArc('sw','并肩作战',[
  ['第一次并肩','完成1场多人PVE。','同一座基地由多名玩家共同防守，先熟悉各自费用与部署不会互相覆盖的节奏。',1,'coop_battle_complete'],
  ['开始有配合','累计完成3场多人PVE。','当队友开始知道谁负责前排、谁补后排，协作才真正出现。',3,'coop_battle_complete',{cumulativeKey:'totalCoopBattles'}],
  ['固定搭档','累计完成10场多人PVE。','十场之后，临时队伍也会形成一套不用多说的配合习惯。',10,'coop_battle_complete',{cumulativeKey:'totalCoopBattles'}],
],sideEconomy);

const SIDE_PVP=sideArc('sr','竞技切磋',[
  ['第一次交手','完成1场PVP。','真正的玩家不会照着固定波次出牌，先完整打一场。',1,'battle_pvp'],
  ['三种对手','累计完成3场PVP。','多打几场，才能看见不同卡组真正的节奏差异。',3,'battle_pvp',{cumulativeKey:'totalPvpBattles'}],
  ['第一场竞技胜利','累计获得1场PVP胜利。','读懂一次对手的资源与部署，然后把优势保持到最后。',1,'pvp_win',{cumulativeKey:'totalPvpWins'}],
  ['不止赢一次','累计获得5场PVP胜利。','能反复取胜，说明阵容已经不只适合打固定关卡。',5,'pvp_win',{cumulativeKey:'totalPvpWins'}],
],sideEconomy);


// ---- 支线：混合目标短任务弧。每条会改变玩家动词，避免一直做同一种计数。 ----
const SIDE_STORY_ARCS=[
  ...sideArc('sn1','损坏的补给册',[
    ['被雨泡烂的记录','累计收集8个一级羊皮纸。','前线找回的补给册几乎被雨水泡烂，只能先准备新的纸张，把还能辨认的信息重新誊写。',8,'item_gain',{requiresMain:'m3',itemId:50001,lifetimeItemId:50001}],
    ['重新装订','加工2个二级羊皮纸。','普通纸张经不起前线反复使用，把其中一部分加工成更耐用的二级羊皮纸。',2,'material_combine',{materialKind:'parchment',materialLevel:2}],
    ['把记录变成战力','成功制作1张卡牌。','补给册里最有价值的不是文字本身，而是记录下来的阵形。照着其中一套思路制作一张新的卡牌。',1,'card_craft'],
  ],sideEconomy),
  ...sideArc('sn2','冻裂的晶石',[
    ['碎在冰里的光','累计收集6个一级宝石。','寒冷让一些低阶晶石出现裂纹，先把还能使用的碎片收起来。',6,'item_gain',{requiresMain:'m7',itemId:50011,lifetimeItemId:50011}],
    ['回到寒冰前哨','完成植物线第5节点“寒冰前哨”。','带着新的观察再走一次控制型关卡，确认低温对部署节奏究竟造成了什么影响。',1,'adventure_complete',{route:0,adventureIndex:5,adventureKey:'0:5'}],
    ['让核心先适应','将1张卡牌强化到2星。','在真正遇到更强的冰系敌人之前，先让一名核心伙伴拥有更稳定的基础属性。',1,'card_strengthen',{minStar:2}],
  ],sideEconomy),
  ...sideArc('sn3','地下回廊样本',[
    ['地底来客','完成植物线第10节点“地底来客”。','钻地单位让后排第一次失去绝对安全的位置。把这一战的异常样本带回去分析。',1,'adventure_complete',{requiresMain:'m18',route:0,adventureIndex:10,adventureKey:'0:10'}],
    ['整理样本','累计收集5个二级卡牌DNA。','把零散样本整理到能够实际用于制作的数量。',5,'item_gain',{itemId:50032,lifetimeItemId:50032}],
    ['验证结果','成功制作1张2级卡牌。','真正的验证不是把样本放在仓库里，而是确认它能不能转化成可用的战团成员。',1,'card_craft',{craftLevel:2}],
  ],sideEconomy),
  ...sideArc('sn4','树影后的准备',[
    ['穿过蘑菇回廊','完成植物线第14节点“蘑菇回廊”。','这一区域的地下牵制与持续支援让推进变得缓慢，先完整走过一次。',1,'adventure_complete',{requiresMain:'m22',route:0,adventureIndex:14,adventureKey:'0:14'}],
    ['准备保护','累计收集3个二级保护符。','越接近树妖活动区域，强化失败带来的资源损失越难补回来。',3,'item_gain',{itemId:50022,lifetimeItemId:50022}],
    ['不冒险的强化','成功强化卡牌1次。','材料已经准备好，把一次谨慎的强化真正完成，再继续进入高压区域。',1,'card_strengthen'],
  ],sideEconomy),
];

// ---- 支线：BOSS人物弧。沿用现有背景，作为主线之外的补充理解。 ----
const SIDE_BOSS=[
  ...sideArc('sb1','多特 · 失去之后',[
    ['不要再少一个人','累计完成2场零阵亡战斗。','多特曾经是医生。比起击败多少敌人，这份委托更在意有没有人能够完整回来。',2,'battle_nodeath',{requiresMain:'m7',cumulativeKey:'totalNoDeath'}],
    ['再见多特','累计挑战“痴情的多特”2次。','第一次见到的是他的力量，再去一次，试着看清他的召唤与技能节奏。',2,'boss_challenge',{bossId:'boss_dot',bossChallengeId:'boss_dot'}],
  ],sideEconomy),
  ...sideArc('sb2','沃里尔 · 军人的旧习惯',[
    ['像军官一样整队','累计获得5场战斗胜利。','沃里尔即使陷入疯狂，也没有丢掉军官式的组织和压迫感。用稳定胜利回应这种纪律。',5,'battle_win',{requiresMain:'m12',cumulativeKey:'totalBattleWins'}],
    ['再见沃里尔','累计挑战“愤怒的沃里尔”2次。','再进入一次他的战场，观察他怎样把愤怒变成指挥。',2,'boss_challenge',{bossId:'boss_gravo',bossChallengeId:'boss_gravo'}],
  ],sideEconomy),
  ...sideArc('sb3','火焰 · 只剩复仇',[
    ['别让火势拖长','完成2场180秒内结束的战斗。','火焰一旦蔓延，时间本身就会变成压力。练习更快结束战斗。',2,'battle_duration',{requiresMain:'m16',maxDuration:180}],
    ['再入火场','累计挑战“火焰的复仇”2次。','第二次进入火场，不只是求胜，而是看懂哪些技能真正让战线失控。',2,'boss_challenge',{bossId:'boss_fire',bossChallengeId:'boss_fire'}],
  ],sideEconomy),
  ...sideArc('sb4','萝莉塔 · 树下旧事',[
    ['回到树荫','完成植物线第13节点。','树妖的力量并非凭空出现。重新走过树荫防线，能更直观地感受到这片区域怎样被自然魔法改变。',1,'adventure_complete',{requiresMain:'m22',route:0,adventureIndex:13,adventureKey:'0:13'}],
    ['再见萝莉塔','累计挑战“树妖萝莉塔”2次。','她的压迫来自长期积累的痛苦。第二次挑战，专注观察召唤与技能之间的空隙。',2,'boss_challenge',{bossId:'boss_forest',bossChallengeId:'boss_forest'}],
  ],sideEconomy),
  ...sideArc('sb5','安娜 · 母亲留下的魔法',[
    ['冰冷的前哨','完成植物线第5节点“寒冰前哨”。','这里的冰系控制远不及安娜强大，却足够让人重新熟悉被冻结后的节奏。',1,'adventure_complete',{requiresMain:'m27',route:0,adventureIndex:5,adventureKey:'0:5'}],
    ['再见安娜','累计挑战“疯狂的安娜”2次。','母亲教给她的是魔法，而不是仇恨。第二次进入极寒战场，试着从技能循环中找回主动权。',2,'boss_challenge',{bossId:'boss_ice',bossChallengeId:'boss_ice'}],
  ],sideEconomy),
];

const SIDE_QUESTS=[
  ...SIDE_ADVENTURE_PLANT,...SIDE_ADVENTURE_MONSTER,
  ...SIDE_POWDER,...SIDE_PARCHMENT,...SIDE_GEM,...SIDE_DNA,...SIDE_CHARM,
  ...SIDE_MATERIAL,...SIDE_STRENGTH,...SIDE_CRAFT,...SIDE_COMBAT,...SIDE_COOP,...SIDE_PVP,...SIDE_STORY_ARCS,...SIDE_BOSS,
];

// ---- 日常：12项，覆盖不同核心循环，不做同类3/5/8套娃 ----
const DAILY_QUESTS=[
  q('d1','今日巡行','完成2个野外冒险关卡。','去森林里走一圈。',2,'adventure_complete',{gold:1400,exp:260}),
  q('d2','保持手感','完成3场战斗。','三场即可。',3,'battle_complete',{gold:1400,exp:250}),
  q('d3','两场胜利','获得2场战斗胜利。','把今天的基础战绩打出来。',2,'battle_win',{gold:1600,exp:280}),
  q('d4','清理前线','击败25名敌对单位。','正常推进时顺手完成。',25,'kill_enemy',{gold:1500,exp:260}),
  q('d5','全员归队','完成1场零阵亡战斗。','稳稳地赢一场。',1,'battle_nodeath',{gold:1800,exp:320}),
  q('d6','三分钟内','完成1场180秒内结束的战斗。','熟悉的关卡可以打得更干净。',1,'battle_duration',{maxDuration:180,gold:1700,exp:300}),
  q('d7','一次强化','成功强化卡牌1次。','给常用伙伴补一点成长。',1,'card_strengthen',{gold:1600,exp:280}),
  q('d8','工坊开炉','成功制作1张卡牌。','完成一次正常制作。',1,'card_craft',{gold:1800,exp:320}),
  q('d9','加工两份','完成2次材料加工。','把低阶库存向上转一转。',2,'material_combine',{gold:1700,exp:300}),
  q('d10','物资入库','获得10件道具或材料。','不限制种类。',10,'item_gain',{gold:1500,exp:260}),
  q('d11','强化粉补给','收集5个一级强化粉。','基础材料补一点就够。',5,'item_gain',{itemId:10001,gold:1300,exp:230}),
  q('d12','羊皮纸补给','收集5个一级羊皮纸。','为制作留一份基础库存。',5,'item_gain',{itemId:50001,gold:1300,exp:230}),
];

// ---- 成就：长期记录，不承担短期剧情 ----
const ACHIEVEMENT_QUESTS=[
  q('a1','初出茅庐','达到Lv.5。','最基础的战斗与养成已经熟悉。',5,'level',{gold:3000,gem:20,honor:60}),
  q('a2','独立行动','达到Lv.10。','已经能够独立处理前期冒险。',10,'level',{gold:6000,gem:35,honor:100}),
  q('a3','前线成员','达到Lv.15。','你开始成为稳定的守卫力量。',15,'level',{gold:9000,gem:50,honor:160}),
  q('a4','远征骨干','达到Lv.20。','大部分中期内容已经能够独立面对。',20,'level',{gold:14000,gem:70,honor:240}),
  q('a5','纳斯塔勇士','达到Lv.25。','战团与材料循环已经成型。',25,'level',{gold:20000,gem:90,honor:340}),
  q('a6','纳斯塔英雄','达到Lv.30。','高难度内容开始成为日常。',30,'level',{gold:28000,gem:120,honor:460}),
  q('a7','高阶守卫','达到Lv.40。','长期成长已经跨过大多数中期门槛。',40,'level',{gold:42000,gem:160,honor:650}),
  q('a8','满级征程','达到Lv.50。','当前等级成长走到终点。',50,'level',{gold:65000,gem:260,honor:1000}),
  q('a9','百次交锋','累计击败100名敌对单位。','第一份完整战绩。',100,'kill_total',{gold:3500,honor:80}),
  q('a10','前线老兵','累计击败500名敌对单位。','已经经历大量不同阵形。',500,'kill_total',{gold:9000,honor:180}),
  q('a11','千次交锋','累计击败1000名敌对单位。','上千次正面交锋留下了真正经验。',1000,'kill_total',{gold:18000,honor:320}),
  q('a12','传奇战绩','累计击败5000名敌对单位。','这是长期游戏留下的记录，而不是某一晚刷出来的数字。',5000,'kill_total',{gold:42000,honor:700}),
  q('a13','战团成形','拥有10张卡牌。','阵容开始有替换空间。',10,'card_total',{gem:30,honor:60}),
  q('a14','卡牌收藏家','拥有20张卡牌。','费用与定位的组合越来越丰富。',20,'card_total',{gem:60,honor:120}),
  q('a15','图鉴达人','拥有30张卡牌。','收藏已经覆盖大量战术选择。',30,'card_total',{gem:100,honor:220}),
  q('a16','充足后勤','累计获得50000金币。','稳定的金币流支撑长期养成。',50000,'gold_total',{gem:50,honor:100}),
  q('a17','富足仓库','累计获得200000金币。','后勤已经从够用变成真正充裕。',200000,'gold_total',{gem:120,honor:260}),
  q('a18','五十场','累计完成50场战斗。','五十场足以建立自己的战斗节奏。',50,'battle_total',{gold:10000,honor:170}),
  q('a19','两百场','累计完成200场战斗。','许多判断已经成为习惯。',200,'battle_total',{gold:26000,honor:420}),
  q('a20','胜者记录','累计获得25场胜利。','稳定赢下比赛。',25,'battle_win_total',{gold:9000,honor:160}),
  q('a21','百胜','累计获得100场胜利。','胜利已经不再依赖偶然。',100,'battle_win_total',{gold:30000,honor:520}),
  q('a22','森林行者','累计完成16个野外冒险关卡。','一条完整路线已经走过大半。',16,'adventure_total',{gold:9000,gem:45,honor:130}),
  q('a23','双线远征','累计完成34个野外冒险关卡。','森林的两条主要路线都留下了足迹。',34,'adventure_total',{gold:16000,gem:80,honor:220}),
  q('a24','百次远行','累计完成100个野外冒险关卡。','你已经反复走过大量危险区域。',100,'adventure_total',{gold:38000,gem:160,honor:480}),
  q('a25','强化达人','累计成功强化20次。','战团开始拥有稳定核心。',20,'strengthen_total',{gold:10000,gem:70,honor:190}),
  q('a26','长期培养','累计成功强化50次。','成长已经从一两张卡扩展到整个战团。',50,'strengthen_total',{gold:26000,gem:120,honor:360}),
  q('a27','独立制作者','累计成功制作10张卡牌。','能够稳定用材料扩充战团。',10,'craft_total',{gold:12000,gem:70,honor:180}),
  q('a28','工坊大师','累计成功制作30张卡牌。','制作已经成为主要成长方式之一。',30,'craft_total',{gold:32000,gem:150,honor:420}),
  q('a29','材料循环','累计完成20次材料加工。','低阶到高阶的资源循环已经稳定。',20,'material_total',{gold:14000,gem:80,honor:210}),
  q('a30','BOSS猎手','累计击败5次BOSS。','已经不止一次正面跨过大型挑战。',5,'boss_defeat_total',{gold:24000,gem:130,honor:400}),
  q('a31','多人同路','累计完成20场多人PVE。','和不同队友一起守过足够多次基地。',20,'coop_total',{gold:18000,gem:80,honor:260}),
  q('a32','竞技常客','累计完成30场PVP。','面对真人阵容已经成为熟悉的体验。',30,'pvp_total',{gold:20000,gem:90,honor:300}),
  q('a33','竞技赢家','累计获得10场PVP胜利。','真正玩家之间的十场胜利比固定关卡更难复制。',10,'pvp_win_total',{gold:24000,gem:110,honor:380}),
];

// ---- 周常：12项，强调一周内的广度 ----
const WEEKLY_QUESTS=[
  q('w1','本周出勤','本周完成12场战斗。','保持稳定出勤。',12,'battle_complete',{gold:6500,exp:850}),
  q('w2','本周胜利','本周获得6场胜利。','不要求连胜，只要稳定完成。',6,'battle_win',{gold:7600,honor:120,exp:950}),
  q('w3','本周远行','本周完成8个野外冒险关卡。','推进不同区域。',8,'adventure_complete',{gold:7800,exp:980}),
  q('w4','清理前线','本周击败120名敌对单位。','把沿途威胁控制下来。',120,'kill_enemy',{gold:7600,exp:900}),
  q('w5','完整阵线','本周完成3场零阵亡战斗。','让胜利质量更高一点。',3,'battle_nodeath',{gold:9000,honor:160,exp:1100}),
  q('w6','效率训练','本周完成4场180秒内结束的战斗。','在熟悉的战场上减少拖延。',4,'battle_duration',{maxDuration:180,gold:8800,exp:1080}),
  q('w7','强化计划','本周成功强化卡牌5次。','把一周材料转成战力。',5,'card_strengthen',{gold:8200,exp:1050}),
  q('w8','制作计划','本周成功制作2张卡牌。','为阵容增加新的选择。',2,'card_craft',{gold:9000,exp:1150}),
  q('w9','加工计划','本周完成6次材料加工。','清理低阶库存。',6,'material_combine',{gold:8800,exp:1100}),
  q('w10','补给周','本周获得50件道具或材料。','正常冒险和养成即可累计。',50,'item_gain',{gold:7600,exp:950}),
  q('w11','二级宝石储备','本周收集8个二级宝石。','给中期制作留一份稳定库存。',8,'item_gain',{itemId:50012,gold:8500,exp:1000}),
  q('w12','面对强敌','本周挑战任意BOSS 1次。','完成一次独立BOSS挑战即可。',1,'boss_challenge',{gold:10000,honor:180,exp:1200}),
];

// ---- 挑战：特殊条件 + BOSS，不只是放大日常数字 ----
const CHALLENGE_QUESTS=[
  q('c1','痴情的多特','击败“痴情的多特”。','结束多特在悲伤密林中的威胁。',1,'boss_defeated',{requiresMain:'m7',bossId:'boss_dot',bossDefeatId:'boss_dot',gold:6500,exp:1600}),
  q('c2','愤怒的沃里尔','击败“愤怒的沃里尔”。','正面击溃这名仍保持军官式压迫感的对手。',1,'boss_defeated',{requiresMain:'m12',bossId:'boss_gravo',bossDefeatId:'boss_gravo',gold:8000,exp:1900}),
  q('c3','火焰的复仇','击败“火焰的复仇”。','在火势彻底失控前结束战斗。',1,'boss_defeated',{requiresMain:'m16',bossId:'boss_fire',bossDefeatId:'boss_fire',gold:9500,exp:2200}),
  q('c4','树妖萝莉塔','击败“树妖萝莉塔”。','穿过自然魔法与召唤形成的压迫。',1,'boss_defeated',{requiresMain:'m22',bossId:'boss_forest',bossDefeatId:'boss_forest',gold:11000,exp:2500}),
  q('c5','疯狂的安娜','击败“疯狂的安娜”。','在极寒法术封锁战场前找到输出窗口。',1,'boss_defeated',{requiresMain:'m27',bossId:'boss_ice',bossDefeatId:'boss_ice',gold:13000,exp:2900}),
  q('c6','狂暴的刀牙','击败海底神殿BOSS“狂暴的刀牙”。','进入海底神殿后的第一场大型挑战。',1,'boss_defeated',{requiresMain:'m34',bossId:'boss_shark',bossDefeatId:'boss_shark',gold:14500,exp:3100}),
  q('c7','龙虾战士','击败海底神殿BOSS“龙虾战士”。','注意横扫、湍流与突袭形成的连续压力。',1,'boss_defeated',{requiresMain:'m34',bossId:'boss_lobster',bossDefeatId:'boss_lobster',gold:15500,exp:3250}),
  q('c8','失控的蓝贝贝','击败海底神殿BOSS“失控的蓝贝贝”。','海之门与冰系技能会不断改变战场节奏。',1,'boss_defeated',{requiresMain:'m34',bossId:'boss_bluebaby',bossDefeatId:'boss_bluebaby',gold:16500,exp:3400}),
  q('c9','龟老师','击败海底神殿BOSS“龟老师”。','技能数量很多，先学会分辨真正危险的窗口。',1,'boss_defeated',{requiresMain:'m34',bossId:'boss_turtle',bossDefeatId:'boss_turtle',gold:17500,exp:3550}),
  q('c10','人鱼公主琴音','击败海底神殿BOSS“人鱼公主琴音”。','面对海底神殿目前最复杂的技能组合。',1,'boss_defeated',{requiresMain:'m34',bossId:'boss_princess',bossDefeatId:'boss_princess',gold:19000,exp:3800}),
  q('c11','毫发无损','累计完成5场零阵亡战斗。','不只要赢，还要完整保存战团。',5,'battle_nodeath',{cumulativeKey:'totalNoDeath',gold:11000,honor:200,exp:2000}),
  q('c12','三分钟节奏','完成5场180秒内结束的战斗。','稳定保持效率。',5,'battle_duration',{maxDuration:180,gold:11000,exp:2000}),
  q('c13','两分钟压制','完成3场120秒内结束的战斗。','在更短窗口内完成部署、推进和收尾。',3,'battle_duration',{maxDuration:120,gold:13500,exp:2400}),
  q('c14','森林深行','累计完成34个野外冒险关卡。','走过当前冒险体系的大部分路线。',34,'adventure_complete',{cumulativeKey:'totalAdventures',gold:18000,exp:2800}),
  q('c15','五十胜','累计获得50场战斗胜利。','把胜利变成稳定能力。',50,'battle_win',{cumulativeKey:'totalBattleWins',gold:20000,honor:320,exp:3000}),
  q('c16','核心养成','累计成功强化20次。','持续把资源投入真正需要的伙伴。',20,'card_strengthen',{cumulativeKey:'totalStrengthens',gold:15000,exp:2500}),
  q('c17','独立工坊','累计成功制作12张卡牌。','用自己的材料扩充多套阵容。',12,'card_craft',{cumulativeKey:'totalCrafts',gold:17000,exp:2700}),
  q('c18','完整材料循环','累计完成20次材料加工。','长期维持低阶到高阶的转换。',20,'material_combine',{cumulativeKey:'totalMaterialCombines',gold:17000,exp:2700}),
  q('c19','三级晶核储备','累计收集20个三级宝石。','真正建立一批高价值材料库存。',20,'item_gain',{itemId:50013,lifetimeItemId:50013,gold:19000,exp:2900}),
  q('c20','双线终局','完成大陆最终关。','两条路线全部推进到尽头，并通过最终会合战。',1,'adventure_complete',{requiresMain:'m33',finalOnly:true,adventureKey:'final',gold:30000,gem:120,honor:500,exp:4200}),
  q('c21','十场协作','累计完成10场多人PVE。','把协作从偶尔体验变成稳定能力。',10,'coop_battle_complete',{cumulativeKey:'totalCoopBattles',gold:18000,honor:260,exp:2800}),
  q('c22','竞技十胜','累计获得10场PVP胜利。','对手每一场都不同，十场胜利证明卡组拥有真正的适应性。',10,'pvp_win',{cumulativeKey:'totalPvpWins',gold:22000,honor:420,exp:3200}),
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
  {id:'main',label:'主线任务',subtitle:'魔幻森林防卫记录'},
  {id:'side',label:'支线任务',subtitle:'区域见闻与成长任务弧'},
  {id:'daily',label:'日常任务',subtitle:'每日重置'},
  {id:'weekly',label:'周常任务',subtitle:'每周一重置'},
  {id:'achievement',label:'成就',subtitle:'长期里程碑'},
  {id:'challenge',label:'挑战',subtitle:'BOSS与特殊条件'},
  {id:'level',label:'等级奖励',subtitle:'Lv.1-50'},
];

const LEVEL_REWARDS=Array.from({length:MAX_PLAYER_LEVEL},(_,i)=>levelReward(i+1));

for(const [category,quests] of Object.entries(QUEST_GROUPS)){
  quests.forEach((quest,index)=>Object.assign(quest,balanceQuestReward(quest,category,index)));
}

export {QUEST_GROUPS,ACHIEVEMENT_QUESTS,CATEGORIES,LEVEL_REWARDS};

export function findQuestReward(category,questId){
  const entries=category==='level'?LEVEL_REWARDS:QUEST_GROUPS[category];
  return entries?.find(entry=>String(entry.id)===String(questId))??null;
}
