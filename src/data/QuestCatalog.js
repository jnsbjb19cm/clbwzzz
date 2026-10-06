import { balanceQuestReward, levelReward, CARD_EGG_IDS, QUEST_ITEM_IDS } from './QuestRewardBalance.js';

export const MAX_PLAYER_LEVEL = 50;

const q=(id,name,desc,story,goal,event,extra={})=>({id,name,desc,story,goal,event,...extra});
const R=(rewardProfile,rewardTier=1,rewardTheme=null,extra={})=>({
  rewardProfile,rewardTier,...(rewardTheme?{rewardTheme}:{}),...extra,
});

function mainChain(rows){
  return rows.map((row,index)=>{
    const [name,desc,story,goal,event,extra={}]=row;
    return q(`mq${String(index+1).padStart(2,'0')}`,name,desc,story,goal,event,{
      ...(index>0?{requires:`mq${String(index).padStart(2,'0')}`}:{}),
      ...extra,
    });
  });
}

function sideArc(prefix,arc,rows){
  return rows.map((row,index)=>{
    const [name,desc,story,goal,event,extra={}]=row;
    return q(`${prefix}${index+1}`,name,desc,story,goal,event,{
      arc,
      ...(index>0?{requires:`${prefix}${index}`}:{}),
      ...extra,
    });
  });
}

// ==================== 主线 ====================
// 主线只放：推进、关键战斗、BOSS、少量必要成长。
// 不再用“累计完成X次冒险”填空，也不把每日养成动作硬塞进剧情。
const MAIN_QUESTS=mainChain([
  ['林路重开','完成植物线 1-1。','结界外的林路刚恢复通行，前哨就传回了敌情。先把第一段路重新控制下来。',1,'adventure_complete',{
    chapter:'第一章 · 出发',route:0,adventureIndex:1,adventureKey:'0:1',...R('main_step',1,'adventure')
  }],
  ['第一处关隘','完成植物线 1-4。','敌人已经在第一处关隘布下完整阵线。打穿这里，确认这不是一次普通骚扰。',1,'adventure_complete',{
    chapter:'第一章 · 出发',route:0,adventureIndex:4,adventureKey:'0:4',...R('main_checkpoint',1,'adventure')
  }],
  ['另一条路','完成怪物线 1-4。','另一侧也在同时交战。把怪物线推进到第一处关隘，两边的情报才能对上。',1,'adventure_complete',{
    chapter:'第一章 · 出发',route:1,adventureIndex:4,adventureKey:'1:4',...R('main_checkpoint',1,'adventure')
  }],
  ['把队伍整好','成功强化卡牌1次。','后面的敌人不会再给你慢慢试阵容的机会。先完成一次强化，再继续向密林推进。',1,'card_strengthen',{
    chapter:'第一章 · 出发',...R('main_step',1,'strengthen')
  }],

  ['旧诊所','完成植物线 2-1。','前哨附近留着一批废弃医疗物资，签名都指向同一个人：多特。档案里，他曾是一名医生。',1,'adventure_complete',{
    chapter:'第二章 · 多特',route:0,adventureIndex:5,adventureKey:'0:5',...R('main_step',2,'adventure')
  }],
  ['痴情的多特','挑战“痴情的多特”1次。','战争夺走了多特的妻子，也把一个医生变成了现在的样子。先进入他的战场，摸清召唤和技能节奏。',1,'boss_challenge',{
    chapter:'第二章 · 多特',bossId:'boss_dot',bossChallengeId:'boss_dot',...R('main_checkpoint',2,'boss')
  }],
  ['医生的终点','击败“痴情的多特”。','他把对战争的恨全都留在了战场上。击败多特，让这片区域先停下来。',1,'boss_defeated',{
    chapter:'第二章 · 多特',bossId:'boss_dot',bossDefeatId:'boss_dot',
    ...R('main_boss',2,'boss',{items:[{id:CARD_EGG_IDS[2],count:1}]})
  }],

  ['第二道防线','完成植物线 2-4。','多特倒下后，前线没有散。新的阵地已经接上来了。',1,'adventure_complete',{
    chapter:'第三章 · 军令',route:0,adventureIndex:8,adventureKey:'0:8',...R('main_checkpoint',2,'adventure')
  }],
  ['镜像阵地','完成怪物线 2-4。','另一条路线也出现了同等级的防线。对方显然有人统一调度。',1,'adventure_complete',{
    chapter:'第三章 · 军令',route:1,adventureIndex:8,adventureKey:'1:8',...R('main_checkpoint',2,'adventure')
  }],
  ['补进一张牌','成功制作1张卡牌。','把这一路拿到的材料变成实际战力。做一张新卡，不要求品质。',1,'card_craft',{
    chapter:'第三章 · 军令',...R('main_step',2,'craft')
  }],
  ['被踩进泥里的军令','完成植物线 3-1。','一张军令被踩进泥里，编号和部署方式却还看得清。留下它的人受过正规的军事训练。',1,'adventure_complete',{
    chapter:'第三章 · 军令',route:0,adventureIndex:9,adventureKey:'0:9',...R('main_step',3,'adventure')
  }],
  ['愤怒的沃里尔','挑战“愤怒的沃里尔”1次。','沃里尔曾是一名军官。妻子和儿子死于战争后，他把悲痛变成了对所有敌人的怒火。',1,'boss_challenge',{
    chapter:'第三章 · 军令',bossId:'boss_gravo',bossChallengeId:'boss_gravo',...R('main_checkpoint',3,'boss')
  }],
  ['军官的怒火','击败“愤怒的沃里尔”。','他的阵线依然像军队一样整齐。击溃指挥核心，结束这段推进。',1,'boss_defeated',{
    chapter:'第三章 · 军令',bossId:'boss_gravo',bossDefeatId:'boss_gravo',
    ...R('main_boss',3,'boss',{items:[{id:CARD_EGG_IDS[3],count:1}]})
  }],

  ['第三道防线','完成植物线 3-4。','前线开始出现更完整的远近配合。这里以后，每一处空位都会被利用。',1,'adventure_complete',{
    chapter:'第四章 · 寒潮',route:0,adventureIndex:12,adventureKey:'0:12',...R('main_checkpoint',3,'adventure')
  }],
  ['南线跟上','完成怪物线 3-4。','别让另一条路线落下。两线同时推进，才能继续向核心区域压缩。',1,'adventure_complete',{
    chapter:'第四章 · 寒潮',route:1,adventureIndex:12,adventureKey:'1:12',...R('main_checkpoint',3,'adventure')
  }],
  ['全员归队','完成1场零阵亡战斗。','越往里走，补充人员越困难。这一战，尽量把所有人带回来。',1,'battle_nodeath',{
    chapter:'第四章 · 寒潮',...R('main_step',3,'adventure')
  }],
  ['白霜边界','完成植物线 4-1。','气温突然开始下降，路边的施法痕迹都冻在了原地。安娜就在前面。',1,'adventure_complete',{
    chapter:'第四章 · 寒潮',route:0,adventureIndex:13,adventureKey:'0:13',...R('main_step',4,'adventure')
  }],
  ['疯狂的安娜','挑战“疯狂的安娜”1次。','安娜从小跟随母亲学习魔法。母亲被觊觎魔法力量的敌人绑架并杀害后，她只剩下了复仇。',1,'boss_challenge',{
    chapter:'第四章 · 寒潮',bossId:'boss_ice',bossChallengeId:'boss_ice',...R('main_checkpoint',4,'boss')
  }],
  ['寒风止息','击败“疯狂的安娜”。','她学会魔法原本不是为了杀戮。结束这场战斗，把通往深处的路重新打开。',1,'boss_defeated',{
    chapter:'第四章 · 寒潮',bossId:'boss_ice',bossDefeatId:'boss_ice',
    ...R('main_boss',4,'boss',{items:[{id:QUEST_ITEM_IDS.rerollStat,count:1}]})
  }],

  ['古树攻坚','完成植物线 4-4。','植物线最后一道阶段防线已经摆在面前。突破它，路线就能推进到终点。',1,'adventure_complete',{
    chapter:'第五章 · 树影',route:0,adventureIndex:16,adventureKey:'0:16',...R('main_checkpoint',4,'adventure')
  }],
  ['怪物线终点','完成怪物线 4-4。','另一条路线也只剩最后一段。把两线都推到底。',1,'adventure_complete',{
    chapter:'第五章 · 树影',route:1,adventureIndex:16,adventureKey:'1:16',...R('main_checkpoint',4,'adventure')
  }],
  ['最后整备','完成1次强化，强化后达到3星或以上。','前面就是密林最后一名守关者。把一张主力卡再往上推一步。',1,'card_strengthen',{
    chapter:'第五章 · 树影',minStar:3,...R('main_step',4,'strengthen')
  }],
  ['树妖萝莉塔','挑战“树妖萝莉塔”1次。','萝莉塔幼年失去父母，由外婆抚养。后来男友被征召并死于战场，她最终在绝望中与树妖力量融合。',1,'boss_challenge',{
    chapter:'第五章 · 树影',bossId:'boss_forest',bossChallengeId:'boss_forest',...R('main_checkpoint',4,'boss')
  }],
  ['悲伤密林的最后一战','击败“树妖萝莉塔”。','这不是一场能改变过去的战斗，但至少能阻止她继续把痛苦还给整片森林。',1,'boss_defeated',{
    chapter:'第五章 · 树影',bossId:'boss_forest',bossDefeatId:'boss_forest',
    ...R('main_boss',5,'boss',{items:[{id:QUEST_ITEM_IDS.rerollQuality,count:1}]})
  }],
  ['双线会合','完成大陆最终关。','植物线与怪物线已经全部打通。完成最后的会合战，当前阶段的冒险大陆正式收束。',1,'adventure_complete',{
    chapter:'终章 · 会合',finalOnly:true,adventureKey:'final',
    ...R('main_final',5,'adventure',{items:[{id:CARD_EGG_IDS[4],count:1},{id:QUEST_ITEM_IDS.qualityStone,count:1}]})
  }],
]);

// ==================== 支线 ====================
const SIDE_ROUTE_PLANT=sideArc('spr','植物线战术记录',[
  ['错峰夹击','完成植物线第6节点。','上下路轮流施压，别把资源一次用空。',1,'adventure_complete',{route:0,adventureIndex:6,adventureKey:'0:6',...R('side',1,'adventure')}],
  ['地底来客','完成植物线第10节点。','钻地单位会绕开正面。给后排留一个能补位的位置。',1,'adventure_complete',{route:0,adventureIndex:10,adventureKey:'0:10',...R('side',2,'adventure')}],
  ['炮阵试炼','完成植物线第12节点。','巨盾顶在前面时，不要把火力平均分出去。先打出一个缺口。',1,'adventure_complete',{route:0,adventureIndex:12,adventureKey:'0:12',...R('side',3,'adventure')}],
  ['剑客合击','完成植物线第15节点。','控制、近战和后排同时出现，阵容必须有替补方案。',1,'adventure_complete',{route:0,adventureIndex:15,adventureKey:'0:15',...R('side',4,'adventure')}],
]);

const SIDE_ROUTE_MONSTER=sideArc('smr','怪物线战术记录',[
  ['换一种解法','完成怪物线第2节点。','同等级的敌人换成怪物单位后，出手节奏已经不一样。',1,'adventure_complete',{route:1,adventureIndex:2,adventureKey:'1:2',...R('side',1,'adventure')}],
  ['控制的另一面','完成怪物线第5节点。','同样是控制主题，危险窗口和植物线并不相同。',1,'adventure_complete',{route:1,adventureIndex:5,adventureKey:'1:5',...R('side',2,'adventure')}],
  ['镜像火网','完成怪物线第9节点。','先判断哪一排才是真正的主攻方向。',1,'adventure_complete',{route:1,adventureIndex:9,adventureKey:'1:9',...R('side',3,'adventure')}],
  ['终点之前','完成怪物线第15节点。','把最后一段节奏摸熟，再去碰终局。',1,'adventure_complete',{route:1,adventureIndex:15,adventureKey:'1:15',...R('side',4,'adventure')}],
]);

const SIDE_WORKSHOP=sideArc('swk','铁匠铺委托',[
  ['先试一次','成功强化卡牌1次。','先确认材料、成功率和强化结果是怎么一回事。',1,'card_strengthen',{...R('side_growth',1,'strengthen')}],
  ['做一张自己的卡','成功制作1张卡牌。','不要求品质，先把完整制作流程走一遍。',1,'card_craft',{...R('side_growth',1,'craft')}],
  ['材料别堆着','完成2次材料加工。','十份低阶材料才能换一份高阶材料，先做两次熟悉流程。',2,'material_combine',{...R('side_growth',2,'material')}],
  ['三星主力','完成1次强化，强化后达到3星或以上。','从“能用”开始往“主力”走。',1,'card_strengthen',{minStar:3,...R('side_growth',2,'strengthen')}],
  ['二级制作','成功制作1张2级卡牌。','材料成本提高以后，再完成一次制作。',1,'card_craft',{craftLevel:2,...R('side_growth',2,'craft')}],
  ['工坊常客','累计完成5次制作。','做到第五张以后，工坊就不再只是试用功能了。',5,'card_craft',{cumulativeKey:'totalCrafts',...R('side_growth',3,'craft')}],
]);

const SIDE_SUPPLY=sideArc('ssp','补给处委托',[
  ['基础强化粉','累计获得10个一级强化粉。','前期最常用的消耗品，留一小批在手上。',10,'item_gain',{itemId:10001,lifetimeItemId:10001,...R('side',1,'collection')}],
  ['二级羊皮纸','累计获得6个二级羊皮纸。','二级制作开始以后，这东西很快就会不够。',6,'item_gain',{itemId:50002,lifetimeItemId:50002,...R('side',2,'collection')}],
  ['二级宝石','累计获得8个二级宝石。','一张二级卡要消耗3枚宝石，多留一点余量。',8,'item_gain',{itemId:50012,lifetimeItemId:50012,...R('side',2,'collection')}],
  ['DNA样本','累计获得5个二级卡牌DNA。','DNA不是普通耗材，先攒到能真正派上用场的数量。',5,'item_gain',{itemId:50032,lifetimeItemId:50032,...R('side',3,'collection')}],
  ['保护符','累计获得3个二级保护符。','强化和制作代价上来以后，保护符才真正值钱。',3,'item_gain',{itemId:50022,lifetimeItemId:50022,...R('side',3,'collection')}],
  ['高阶粉末','累计获得12个三级强化粉。','三级强化粉开始对应更长的养成阶段。',12,'item_gain',{itemId:10003,lifetimeItemId:10003,...R('side',3,'collection')}],
]);

const SIDE_COMBAT=sideArc('sbt','战斗训练',[
  ['先赢五场','累计获得5场战斗胜利。','先把胜率稳定下来。',5,'battle_win',{cumulativeKey:'totalBattleWins',...R('side',1,'adventure')}],
  ['全员归队','累计完成3场零阵亡战斗。','赢得干净，比单纯赢下来更难。',3,'battle_nodeath',{cumulativeKey:'totalNoDeath',...R('side',2,'adventure')}],
  ['三分钟','完成3场180秒内结束的战斗。','熟悉的关卡，不要一直拖到最后。',3,'battle_duration',{maxDuration:180,...R('side',2,'adventure')}],
  ['两分半','完成2场150秒内结束的战斗。','把部署和收尾再压紧一点。',2,'battle_duration',{maxDuration:150,...R('side',3,'adventure')}],
  ['百名敌兵','累计击败100名敌对单位。','打一百个以后，很多单位该先处理还是后处理已经很清楚了。',100,'kill_enemy',{cumulativeKey:'totalKills',...R('side',3,'adventure')}],
  ['五十场','累计完成50场战斗。','这时候，常用阵容应该已经有自己的节奏。',50,'battle_complete',{cumulativeKey:'totalBattles',...R('side',4,'adventure')}],
]);

const SIDE_COOP=sideArc('scp','并肩作战',[
  ['第一次组队','完成1场多人PVE。','共用基地生命，但每个人的费用和部署仍然独立。先打一场熟悉配合。',1,'coop_battle_complete',{...R('side_social',1,null)}],
  ['开始有配合','累计完成3场多人PVE。','三场以后，谁顶前排、谁补后排应该有点默契了。',3,'coop_battle_complete',{cumulativeKey:'totalCoopBattles',...R('side_social',2,null)}],
  ['固定搭档','累计完成10场多人PVE。','十场不是很多，但足够看出一支队伍是不是会配合。',10,'coop_battle_complete',{cumulativeKey:'totalCoopBattles',...R('side_social',3,null)}],
]);

const SIDE_PVP=sideArc('spv','竞技切磋',[
  ['第一场PVP','完成1场PVP。','真人不会按照固定波次下牌。先完整打一场。',1,'battle_pvp',{...R('side_social',1,null)}],
  ['第一胜','累计获得1场PVP胜利。','赢下一场，先证明这套卡组能对付真人。',1,'pvp_win',{cumulativeKey:'totalPvpWins',...R('side_social',2,null)}],
  ['五场交手','累计完成5场PVP。','多看几种阵容，比只打一个对手更有用。',5,'battle_pvp',{cumulativeKey:'totalPvpBattles',...R('side_social',2,null)}],
  ['五胜','累计获得5场PVP胜利。','能反复赢下来，说明阵容开始有适应性。',5,'pvp_win',{cumulativeKey:'totalPvpWins',...R('side_social',3,null)}],
]);

const SIDE_BOSS=[
  ...sideArc('sbd','多特复战',[
    ['再见多特','累计挑战“痴情的多特”2次。','第一次是过关，第二次开始才有余裕看清他的节奏。',2,'boss_challenge',{
      requiresMain:'mq07',bossId:'boss_dot',bossChallengeId:'boss_dot',...R('side',2,'boss')
    }],
  ]),
  ...sideArc('sbg','沃里尔复战',[
    ['再见沃里尔','累计挑战“愤怒的沃里尔”2次。','再打一场，重点看他的召唤和压线时机。',2,'boss_challenge',{
      requiresMain:'mq13',bossId:'boss_gravo',bossChallengeId:'boss_gravo',...R('side',3,'boss')
    }],
  ]),
  ...sideArc('sbi','安娜复战',[
    ['再见安娜','累计挑战“疯狂的安娜”2次。','第二次进场，把注意力放在暴风雪和冻结后的处理。',2,'boss_challenge',{
      requiresMain:'mq19',bossId:'boss_ice',bossChallengeId:'boss_ice',...R('side',4,'boss')
    }],
  ]),
  ...sideArc('sbf','萝莉塔复战',[
    ['再见萝莉塔','累计挑战“树妖萝莉塔”2次。','再打一次，观察自然魔法和召唤之间的空档。',2,'boss_challenge',{
      requiresMain:'mq24',bossId:'boss_forest',bossChallengeId:'boss_forest',...R('side',4,'boss')
    }],
  ]),
];

const SIDE_QUESTS=[
  ...SIDE_ROUTE_PLANT,
  ...SIDE_ROUTE_MONSTER,
  ...SIDE_WORKSHOP,
  ...SIDE_SUPPLY,
  ...SIDE_COMBAT,
  ...SIDE_COOP,
  ...SIDE_PVP,
  ...SIDE_BOSS,
];

// ==================== 日常 ====================
// 不要求玩家每天制作高阶卡、打BOSS或PVP；日常只维持基础循环。
const DAILY_QUESTS=[
  q('dq1','今日出征','完成2个野外冒险关卡。','出去打两场，够了。',2,'adventure_complete',{...R('daily',1,'adventure')}),
  q('dq2','保持手感','完成3场战斗。','不论输赢，完成三场。',3,'battle_complete',{...R('daily',1,'adventure')}),
  q('dq3','拿下两场','获得2场战斗胜利。','今天至少赢两场。',2,'battle_win',{...R('daily',1,'adventure')}),
  q('dq4','清理战场','击败20名敌对单位。','正常推进时顺手完成。',20,'kill_enemy',{...R('daily',1,'adventure')}),
  q('dq5','工坊维护','成功制作或强化1次。','工坊今天动一次就算完成。',1,'card_upgrade',{...R('daily',1,'workshop')}),
  q('dq6','补给入库','获得8件道具或材料。','不限制种类。',8,'item_gain',{...R('daily',1,'collection')}),
];

// ==================== 周常 ====================
const WEEKLY_QUESTS=[
  q('wq1','本周出勤','本周完成12场战斗。','稳定打，比一天刷完更舒服。',12,'battle_complete',{...R('weekly',2,'adventure')}),
  q('wq2','本周远征','本周完成8个野外冒险关卡。','两条路线都可以计数。',8,'adventure_complete',{...R('weekly',2,'adventure')}),
  q('wq3','本周胜场','本周获得6场胜利。','不要求连胜。',6,'battle_win',{...R('weekly',2,'adventure')}),
  q('wq4','前线清理','本周击败100名敌对单位。','正常打本即可推进。',100,'kill_enemy',{...R('weekly',2,'adventure')}),
  q('wq5','工坊周记','本周成功制作或强化5次。','制作和强化都算。',5,'card_upgrade',{...R('weekly',2,'workshop')}),
  q('wq6','面对强敌','本周挑战任意BOSS 1次。','只要求挑战，不强制获胜。',1,'boss_challenge',{...R('weekly',3,'boss')}),
];

// ==================== 成就 ====================
const ACHIEVEMENT_QUESTS=[
  q('aq1','站稳脚跟','达到Lv.10。','前期成长完成。',10,'level',{...R('achievement',1,null)}),
  q('aq2','独当一面','达到Lv.20。','中期系统基本都已经接触。',20,'level',{...R('achievement',2,null)}),
  q('aq3','前线骨干','达到Lv.30。','常用战团应该已经成形。',30,'level',{...R('achievement',3,null,{items:[{id:QUEST_ITEM_IDS.rerollStat,count:1}]})}),
  q('aq4','高阶守卫','达到Lv.40。','开始进入高阶养成。',40,'level',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.rerollQuality,count:1}]})}),
  q('aq5','满级','达到Lv.50。','当前等级成长到达终点。',50,'level',{...R('achievement',5,null,{items:[{id:QUEST_ITEM_IDS.qualityStone,count:1}]})}),

  q('aq6','百人斩','累计击败100名敌对单位。','第一份完整击杀记录。',100,'kill_total',{...R('achievement',1,null)}),
  q('aq7','五百','累计击败500名敌对单位。','五百次交锋。',500,'kill_total',{...R('achievement',2,null)}),
  q('aq8','千人斩','累计击败1000名敌对单位。','已经经历足够多的阵形。',1000,'kill_total',{...R('achievement',3,null)}),

  q('aq9','五十场','累计完成50场战斗。','开始有自己的战斗习惯。',50,'battle_total',{...R('achievement',2,null)}),
  q('aq10','两百场','累计完成200场战斗。','经验已经不是纸面上的数字。',200,'battle_total',{...R('achievement',4,null)}),
  q('aq11','二十五胜','累计获得25场战斗胜利。','稳定胜利的起点。',25,'battle_win_total',{...R('achievement',2,null)}),
  q('aq12','百胜','累计获得100场战斗胜利。','一百场胜利。',100,'battle_win_total',{...R('achievement',4,null)}),

  q('aq13','走完双线','累计完成34个野外冒险关卡。','当前大陆两条路线都留下了足迹。',34,'adventure_total',{...R('achievement',3,null)}),
  q('aq14','百次远征','累计完成100个野外冒险关卡。','已经反复走过大量区域。',100,'adventure_total',{...R('achievement',5,null)}),

  q('aq15','十张卡','拥有10张卡牌。','战团开始有替换空间。',10,'card_total',{...R('achievement',1,null)}),
  q('aq16','二十张卡','拥有20张卡牌。','阵容选择明显多起来了。',20,'card_total',{...R('achievement',2,null)}),
  q('aq17','三十张卡','拥有30张卡牌。','收藏已经足够支撑多套打法。',30,'card_total',{...R('achievement',3,null,{items:[{id:CARD_EGG_IDS[3],count:1}]})}),

  q('aq18','强化常客','累计成功强化20次。','战团开始稳定成长。',20,'strengthen_total',{...R('achievement',2,null)}),
  q('aq19','强化老手','累计成功强化50次。','强化已经成为长期养成的一部分。',50,'strengthen_total',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.reverse,count:1}]})}),
  q('aq20','制作者','累计成功制作10张卡牌。','能靠自己的材料补充战团。',10,'craft_total',{...R('achievement',2,null)}),
  q('aq21','工坊老手','累计成功制作30张卡牌。','制作系统已经真正用起来了。',30,'craft_total',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.rerollQuality,count:1}]})}),

  q('aq22','BOSS猎手','累计击败4次BOSS。','至少完成一轮森林BOSS挑战。',4,'boss_defeat_total',{...R('achievement',3,null,{items:[{id:CARD_EGG_IDS[3],count:1}]})}),
  q('aq23','十次首领战','累计击败10次BOSS。','BOSS战已经成为常规内容。',10,'boss_defeat_total',{...R('achievement',5,null,{items:[{id:QUEST_ITEM_IDS.qualityStone,count:1}]})}),
  q('aq24','竞技十胜','累计获得10场PVP胜利。','真人对战的十场胜利。',10,'pvp_win_total',{...R('achievement',3,null)}),
  q('aq25','并肩二十场','累计完成20场多人PVE。','已经习惯和别人共守一座基地。',20,'coop_total',{...R('achievement',3,null)}),
];

// ==================== 挑战 ====================
const CHALLENGE_QUESTS=[
  q('cq1','多特讨伐','击败“痴情的多特”。','完成多特的BOSS战。',1,'boss_defeated',{
    requiresMain:'mq05',bossId:'boss_dot',bossDefeatId:'boss_dot',...R('challenge_boss',2,'boss')
  }),
  q('cq2','沃里尔讨伐','击败“愤怒的沃里尔”。','完成沃里尔的BOSS战。',1,'boss_defeated',{
    requiresMain:'mq11',bossId:'boss_gravo',bossDefeatId:'boss_gravo',...R('challenge_boss',3,'boss')
  }),
  q('cq3','安娜讨伐','击败“疯狂的安娜”。','完成安娜的BOSS战。',1,'boss_defeated',{
    requiresMain:'mq17',bossId:'boss_ice',bossDefeatId:'boss_ice',...R('challenge_boss',4,'boss')
  }),
  q('cq4','萝莉塔讨伐','击败“树妖萝莉塔”。','完成萝莉塔的BOSS战。',1,'boss_defeated',{
    requiresMain:'mq22',bossId:'boss_forest',bossDefeatId:'boss_forest',...R('challenge_boss',5,'boss')
  }),

  q('cq5','狂暴的刀牙','击败海底神殿BOSS“狂暴的刀牙”。','海底神殿首领挑战。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_shark',bossDefeatId:'boss_shark',...R('challenge_boss',4,'boss')
  }),
  q('cq6','龙虾战士','击败海底神殿BOSS“龙虾战士”。','注意横扫、湍流与突袭。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_lobster',bossDefeatId:'boss_lobster',...R('challenge_boss',4,'boss')
  }),
  q('cq7','失控的蓝贝贝','击败海底神殿BOSS“失控的蓝贝贝”。','处理好海之门和控制技能。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_bluebaby',bossDefeatId:'boss_bluebaby',...R('challenge_boss',4,'boss')
  }),
  q('cq8','龟老师','击败海底神殿BOSS“龟老师”。','技能很多，先分清真正危险的窗口。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_turtle',bossDefeatId:'boss_turtle',...R('challenge_boss',5,'boss')
  }),
  q('cq9','人鱼公主琴音','击败海底神殿BOSS“人鱼公主琴音”。','完成目前海底神殿最复杂的首领战。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_princess',bossDefeatId:'boss_princess',
    ...R('challenge_boss',5,'boss',{items:[{id:CARD_EGG_IDS[5],count:1}]})
  }),

  q('cq10','零阵亡五场','累计完成5场零阵亡战斗。','连续保持阵线完整。',5,'battle_nodeath',{
    cumulativeKey:'totalNoDeath',...R('challenge',3,'adventure')
  }),
  q('cq11','两分钟','完成3场120秒内结束的战斗。','三场都要在两分钟内收尾。',3,'battle_duration',{
    maxDuration:120,...R('challenge',4,'adventure')
  }),
  q('cq12','双线终局','完成大陆最终关。','把两条路线全部推进到尽头。',1,'adventure_complete',{
    requiresMain:'mq24',finalOnly:true,adventureKey:'final',
    ...R('challenge',5,'adventure',{items:[{id:QUEST_ITEM_IDS.qualityStone,count:1}]})
  }),
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
  {id:'main',label:'主线任务',subtitle:'冒险大陆主线'},
  {id:'side',label:'支线任务',subtitle:'战术、成长与联机委托'},
  {id:'daily',label:'日常任务',subtitle:'当天完成，当天结算'},
  {id:'weekly',label:'周常任务',subtitle:'本周目标'},
  {id:'achievement',label:'成就',subtitle:'长期记录'},
  {id:'challenge',label:'挑战',subtitle:'首领与高难目标'},
  {id:'level',label:'等级奖励',subtitle:'Lv.1-50'},
];

const LEVEL_REWARDS=Array.from({length:MAX_PLAYER_LEVEL},(_,i)=>levelReward(i+1));

for(const [category,quests] of Object.entries(QUEST_GROUPS)){
  quests.forEach((quest)=>Object.assign(quest,balanceQuestReward(quest,category)));
}

export {QUEST_GROUPS,ACHIEVEMENT_QUESTS,CATEGORIES,LEVEL_REWARDS};

export function findQuestReward(category,questId){
  const entries=category==='level'?LEVEL_REWARDS:QUEST_GROUPS[category];
  return entries?.find(entry=>String(entry.id)===String(questId))??null;
}
