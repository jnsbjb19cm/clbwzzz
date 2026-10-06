import { balanceQuestReward, levelReward, CARD_EGG_IDS, QUEST_ITEM_IDS } from './QuestRewardBalance.js';

export const MAX_PLAYER_LEVEL = 50;

const q=(id,name,desc,story,goal,event,extra={})=>({id,name,desc,story,goal,event,...extra});
const R=(rewardProfile,rewardTier=1,rewardTheme=null,extra={})=>({
  rewardProfile,rewardTier,...(rewardTheme?{rewardTheme}:{}),...extra,
});

function stageReward(tier,node){
  const t=Math.max(1,Math.min(4,Number(tier)||1));
  const n=Math.max(1,Math.min(4,Number(node)||1));
  const matTier=t;
  const baseGold=[0,450,700,1050,1450][t];
  const stepGold=[0,70,100,130,170][t];
  const baseExp=[0,140,220,330,450][t];
  const stepExp=[0,20,30,40,50][t];
  const itemByNode={
    1:{id:QUEST_ITEM_IDS.powder[t],count:2+t},
    2:{id:QUEST_ITEM_IDS.parchment[matTier],count:2},
    3:{id:QUEST_ITEM_IDS.gem[matTier],count:3},
    4:{id:CARD_EGG_IDS[t],count:1},
  };
  const checkpoint=n===4;
  return R(checkpoint?'main_checkpoint':'main_step',t,'none',{
    gold:checkpoint?baseGold+stepGold*3+240:baseGold+stepGold*(n-1),
    exp:checkpoint?baseExp+stepExp*3+100:baseExp+stepExp*(n-1),
    honor:checkpoint?10+t*8:0,
    gem:checkpoint?t*2:0,
    items:[itemByNode[n]],
  });
}

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
// 两条冒险路线的同编号关卡都可推进主线；-4 是阶段关。
// 每一关都有独立任务和奖励，BOSS放在对应章节收尾。
const MAIN_QUESTS=mainChain([
  ['林口有人','通关主线 1-1「初识防线」。','路障才挪开，前面就打起来了。远程单位躲得深，先别让前排把路堵死。',1,'adventure_complete',{
    chapter:'第一章 · 林口',adventureIndex:1,...stageReward(1,1)
  }],
  ['后排的南瓜','通关主线 1-2「投手加入」。','南瓜投手缩在后面一直扔，前排一拖住你，它就舒服了。',1,'adventure_complete',{
    chapter:'第一章 · 林口',adventureIndex:2,...stageReward(1,2)
  }],
  ['先断补给','通关主线 1-3「补给阵地」。','小麦和投手挤在一块儿。拖久了不好收场，能先拆支援就别磨前排。',1,'adventure_complete',{
    chapter:'第一章 · 林口',adventureIndex:3,...stageReward(1,3)
  }],
  ['西瓜压过来了','通关主线 1-4「西瓜突围」。','这一关不跟你排队，多路一起上。哪边漏了，哪边就得马上补。',1,'adventure_complete',{
    chapter:'第一章 · 林口',adventureIndex:4,challengeOnly:true,...stageReward(1,4)
  }],
  ['旧药箱','挑战“痴情的多特”1次。','营地边翻出一个旧药箱，名字还在：多特。档案里的他以前是医生。',1,'boss_challenge',{
    chapter:'第一章 · 多特',bossId:'boss_dot',bossChallengeId:'boss_dot',...R('main_checkpoint',2,'boss')
  }],
  ['多特倒下了','击败“痴情的多特”。','妻子死在战争里以后，多特再也没回过诊所。先把眼前这场仗结束。',1,'boss_defeated',{
    chapter:'第一章 · 多特',bossId:'boss_dot',bossDefeatId:'boss_dot',
    ...R('main_boss',2,'boss',{items:[{id:CARD_EGG_IDS[2],count:1}]})
  }],

  ['路上结冰了','通关主线 2-1「寒冰前哨」。','地面开始打滑，控制单位也多了。后排被冻住的时候，空位会一下子变得很贵。',1,'adventure_complete',{
    chapter:'第二章 · 往里走',adventureIndex:5,...stageReward(2,1)
  }],
  ['上下轮着来','通关主线 2-2「错峰夹击」。','上路刚停，下路就动。手里最好留点能马上补进去的牌。',1,'adventure_complete',{
    chapter:'第二章 · 往里走',adventureIndex:6,...stageReward(2,2)
  }],
  ['医生在后面','通关主线 2-3「补给护卫」。','这回麻烦的是后面的支援。前排再硬，也架不住一直有人往回抬血。',1,'adventure_complete',{
    chapter:'第二章 · 往里走',adventureIndex:7,...stageReward(2,3)
  }],
  ['把盾敲开','通关主线 2-4「坚盾连阵」。','巨盾顶在前面，冰系单位藏在后面。第五波会一起压上来。',1,'adventure_complete',{
    chapter:'第二章 · 往里走',adventureIndex:8,challengeOnly:true,...stageReward(2,4)
  }],
  ['军令上的名字','挑战“愤怒的沃里尔”1次。','泥里那张军令还看得清编号。沃里尔以前带兵，这套阵形也是他的老习惯。',1,'boss_challenge',{
    chapter:'第二章 · 沃里尔',bossId:'boss_gravo',bossChallengeId:'boss_gravo',...R('main_checkpoint',3,'boss')
  }],
  ['别让他再往前推','击败“愤怒的沃里尔”。','他的妻子和儿子都没能从战争里回来。沃里尔把剩下的东西全压进了这支队伍。',1,'boss_defeated',{
    chapter:'第二章 · 沃里尔',bossId:'boss_gravo',bossDefeatId:'boss_gravo',
    ...R('main_boss',3,'boss',{items:[{id:CARD_EGG_IDS[3],count:1}]})
  }],

  ['火力交叉','通关主线 3-1「交叉火网」。','三头仙人掌一上场，挤在一排反而吃亏。站位散一点。',1,'adventure_complete',{
    chapter:'第三章 · 深处',adventureIndex:9,...stageReward(3,1)
  }],
  ['脚底不安全','通关主线 3-2「地底来客」。','钻地单位会直接去找后排。别把能放人的格子塞满。',1,'adventure_complete',{
    chapter:'第三章 · 深处',adventureIndex:10,...stageReward(3,2)
  }],
  ['天上也来了','通关主线 3-3「空地交替」。','地面还没清完，侧翼又有空中单位。单靠一种卡不好顶。',1,'adventure_complete',{
    chapter:'第三章 · 深处',adventureIndex:11,...stageReward(3,3)
  }],
  ['炮口后面','通关主线 3-4「炮阵试炼」。','玉米炮手躲在巨盾后面。别跟盾耗到底，找一边先撕开。',1,'adventure_complete',{
    chapter:'第三章 · 深处',adventureIndex:12,challengeOnly:true,...stageReward(3,4)
  }],
  ['风里有冰碴','挑战“疯狂的安娜”1次。','安娜小时候跟母亲学魔法。母亲被杀以后，她剩下的那点东西全变成了恨。',1,'boss_challenge',{
    chapter:'第三章 · 安娜',bossId:'boss_ice',bossChallengeId:'boss_ice',...R('main_checkpoint',4,'boss')
  }],
  ['寒风停了','击败“疯狂的安娜”。','冰封散开以后，路边那些被冻住的施法痕迹才重新露出来。',1,'boss_defeated',{
    chapter:'第三章 · 安娜',bossId:'boss_ice',bossDefeatId:'boss_ice',
    ...R('main_boss',4,'boss',{items:[{id:QUEST_ITEM_IDS.rerollStat,count:1}]})
  }],

  ['树荫下面','通关主线 4-1「树荫防线」。','树精守卫很能拖。火力分得太平均，哪一边都打不穿。',1,'adventure_complete',{
    chapter:'第四章 · 树影',adventureIndex:13,...stageReward(4,1)
  }],
  ['蘑菇回廊','通关主线 4-2「蘑菇回廊」。','地下单位在前面搅，蘑菇仙人在后面撑。别一起追。',1,'adventure_complete',{
    chapter:'第四章 · 树影',adventureIndex:14,...stageReward(4,2)
  }],
  ['剑客合击','通关主线 4-3「剑客合击」。','近战、控制、后排都在场。你那套最顺手的阵容，差不多该拿出来了。',1,'adventure_complete',{
    chapter:'第四章 · 树影',adventureIndex:15,...stageReward(4,3)
  }],
  ['古树挡路','通关主线 4-4「古树攻坚」。','战争古树站在最后面，前面还有整套支援。这是两条普通战线最后一道硬关。',1,'adventure_complete',{
    chapter:'第四章 · 树影',adventureIndex:16,challengeOnly:true,...stageReward(4,4)
  }],
  ['萝莉塔','挑战“树妖萝莉塔”1次。','她很早就没了父母，后来连男友也死在战场。树妖的力量是在那之后找上她的。',1,'boss_challenge',{
    chapter:'第四章 · 萝莉塔',bossId:'boss_forest',bossChallengeId:'boss_forest',...R('main_checkpoint',5,'boss')
  }],
  ['密林安静了','击败“树妖萝莉塔”。','打完以后，附近的树根还在动，只是没再往路上伸。',1,'boss_defeated',{
    chapter:'第四章 · 萝莉塔',bossId:'boss_forest',bossDefeatId:'boss_forest',
    ...R('main_boss',5,'boss',{items:[{id:QUEST_ITEM_IDS.rerollQuality,count:1}]})
  }],
  ['两条路都到头了','完成大陆最终关。','植物线、怪物线都走到这里，最后一场没有绕路。打过去。',1,'adventure_complete',{
    chapter:'终章',finalOnly:true,
    ...R('main_final',5,'adventure',{items:[{id:CARD_EGG_IDS[4],count:1},{id:QUEST_ITEM_IDS.qualityStone,count:1}]})
  }],
]);

// ==================== 支线 ====================
const SIDE_PLANT=sideArc('spl','植物线 · 另一份记录',[
  ['植物线 1-4','通关植物线 1-4。','西瓜多路压上来的那一关，植物线也得自己打过去。',1,'adventure_complete',{route:0,adventureIndex:4,...R('side',1,'adventure')}],
  ['植物线 2-4','通关植物线 2-4。','巨盾加冰系后排。',1,'adventure_complete',{route:0,adventureIndex:8,...R('side',2,'adventure')}],
  ['植物线 3-4','通关植物线 3-4。','炮阵那关，记得别和盾死磕。',1,'adventure_complete',{route:0,adventureIndex:12,...R('side',3,'adventure')}],
  ['植物线 4-4','通关植物线 4-4。','古树攻坚。走到这儿，这条线就只剩会合战了。',1,'adventure_complete',{route:0,adventureIndex:16,...R('side',4,'adventure')}],
]);

const SIDE_MONSTER=sideArc('smo','怪物线 · 另一份记录',[
  ['怪物线 1-4','通关怪物线 1-4。','同一个编号，换成怪物阵容以后手感完全不一样。',1,'adventure_complete',{route:1,adventureIndex:4,...R('side',1,'adventure')}],
  ['怪物线 2-4','通关怪物线 2-4。','这一段开始，食物怎么留比铺多少卡更重要。',1,'adventure_complete',{route:1,adventureIndex:8,...R('side',2,'adventure')}],
  ['怪物线 3-4','通关怪物线 3-4。','把中段打穿。',1,'adventure_complete',{route:1,adventureIndex:12,...R('side',3,'adventure')}],
  ['怪物线 4-4','通关怪物线 4-4。','怪物线最后一道阶段关。',1,'adventure_complete',{route:1,adventureIndex:16,...R('side',4,'adventure')}],
]);

const SIDE_FUN=sideArc('sfu','临时加码',[
  ['三路都上人','赢下1场战斗，并在三个战线都部署过卡牌。','别把整副牌全塞一条路。三路都下过单位，赢了就算。',1,'battle_lane_spread',{minLanes:3,...R('side_growth',2,'adventure')}],
  ['别老点同一张','赢下1场战斗，并至少使用5种不同卡牌。','同一张好用也别一直按。换五种牌上场。',1,'battle_variety',{minDistinctCards:5,...R('side_growth',2,'adventure')}],
  ['1-4，别磨太久','150秒内通关主线 1-4。','这一关打熟以后，两分半够用了。',1,'battle_duration',{adventureIndex:4,maxDuration:150,...R('side_growth',2,'adventure')}],
  ['2-4，一个别倒','零阵亡通关主线 2-4。','盾阵最容易把人拖死。这次全带回来。',1,'battle_nodeath',{adventureIndex:8,...R('side_growth',3,'adventure')}],
  ['3-4，换着打','通关主线 3-4，并在这一场至少使用6种不同卡牌。','炮阵会逼人一直补同一位置。偏不这么打。',1,'battle_variety',{adventureIndex:12,minDistinctCards:6,...R('side_growth',3,'adventure')}],
  ['4-4，三线都开','通关主线 4-4，并在三个战线都部署过卡牌。','最后一道阶段关，三路都得照顾到。',1,'battle_lane_spread',{adventureIndex:16,minLanes:3,...R('side_growth',4,'adventure',{items:[{id:CARD_EGG_IDS[2],count:1}]})}],
]);

const SIDE_WORKSHOP=sideArc('swk','铁匠铺',[
  ['试一次强化','成功强化卡牌1次。','拿一张常用卡试试，成功一次就行。',1,'card_strengthen',{...R('side_growth',1,'strengthen')}],
  ['做一张卡','成功制作1张卡牌。','品质不挑，先把材料变成卡。',1,'card_craft',{...R('side_growth',1,'craft')}],
  ['别让低级材料占满仓库','完成2次材料加工。','十个换一个。先做两次。',2,'material_combine',{...R('side_growth',2,'material')}],
  ['三星','完成1次强化，强化后达到3星或以上。','挑一张真正常用的。',1,'card_strengthen',{minStar:3,...R('side_growth',2,'strengthen')}],
  ['二级制作','成功制作1张2级卡牌。','这次材料会疼一点。',1,'card_craft',{craftLevel:2,...R('side_growth',2,'craft')}],
  ['手熟了','累计成功制作5张卡牌。','第五张做完，工坊差不多就摸熟了。',5,'card_craft',{cumulativeKey:'totalCrafts',...R('side_growth',3,'craft')}],
]);

const SIDE_SUPPLY=sideArc('ssp','补给处',[
  ['一级强化粉','拿到10个一级强化粉。','够前期折腾几次。',10,'item_gain',{itemId:10001,lifetimeItemId:10001,...R('side',1,'collection')}],
  ['二级羊皮纸','拿到6个二级羊皮纸。','做二级卡的时候很快就会用掉。',6,'item_gain',{itemId:50002,lifetimeItemId:50002,...R('side',2,'collection')}],
  ['二级宝石','拿到8个二级宝石。','一次制作要吃三颗，多攒几颗。',8,'item_gain',{itemId:50012,lifetimeItemId:50012,...R('side',2,'collection')}],
  ['DNA样本','拿到5个二级卡牌DNA。','先留着，别看见材料就全加工了。',5,'item_gain',{itemId:50032,lifetimeItemId:50032,...R('side',3,'collection')}],
  ['保护符','拿到3个二级保护符。','失败开始肉疼的时候就知道它好用了。',3,'item_gain',{itemId:50022,lifetimeItemId:50022,...R('side',3,'collection')}],
  ['三级强化粉','拿到12个三级强化粉。','往三星以上推卡，消耗会明显快起来。',12,'item_gain',{itemId:10003,lifetimeItemId:10003,...R('side',3,'collection')}],
]);

const SIDE_COMBAT=sideArc('sbt','战斗记录',[
  ['先赢五场','累计获得5场胜利。','五场，不用连胜。',5,'battle_win',{cumulativeKey:'totalBattleWins',...R('side',1,'adventure')}],
  ['三场没人倒','累计完成3场零阵亡战斗。','基地能掉血，人别倒。',3,'battle_nodeath',{cumulativeKey:'totalNoDeath',...R('side',2,'adventure')}],
  ['三分钟','完成3场180秒内结束的胜利。','打熟的关卡就别拖了。',3,'battle_duration',{maxDuration:180,...R('side',2,'adventure')}],
  ['两分半','完成2场150秒内结束的胜利。','再快一点。',2,'battle_duration',{maxDuration:150,...R('side',3,'adventure')}],
  ['一百个','累计击败100名敌对单位。','打着打着就有了。',100,'kill_enemy',{cumulativeKey:'totalKills',...R('side',3,'adventure')}],
  ['五十场','累计完成50场战斗。','到这时候，哪张牌顺手基本不用看说明了。',50,'battle_complete',{cumulativeKey:'totalBattles',...R('side',4,'adventure')}],
]);

const SIDE_COOP=sideArc('scp','一起守',[
  ['找个人一起打','完成1场多人PVE。','共用的是基地血量，费用还是各花各的。',1,'coop_battle_complete',{...R('side_social',1,null)}],
  ['三场','累计完成3场多人PVE。','三场以后，谁补哪一路应该不用喊那么久了。',3,'coop_battle_complete',{cumulativeKey:'totalCoopBattles',...R('side_social',2,null)}],
  ['十场','累计完成10场多人PVE。','能一起打十场，算熟人了。',10,'coop_battle_complete',{cumulativeKey:'totalCoopBattles',...R('side_social',3,null)}],
]);

const SIDE_PVP=sideArc('spv','竞技场',[
  ['先打一把','完成1场PVP。','输赢都算，先看看真人怎么下牌。',1,'battle_pvp',{...R('side_social',1,null)}],
  ['赢一把','累计获得1场PVP胜利。','一场就行。',1,'pvp_win',{cumulativeKey:'totalPvpWins',...R('side_social',2,null)}],
  ['五场交手','累计完成5场PVP。','碰到的卡组不会都一样。',5,'battle_pvp',{cumulativeKey:'totalPvpBattles',...R('side_social',2,null)}],
  ['五胜','累计获得5场PVP胜利。','五场胜利以后再说这套牌稳不稳。',5,'pvp_win',{cumulativeKey:'totalPvpWins',...R('side_social',3,null)}],
]);

const SIDE_BOSS=[
  ...sideArc('sbd','多特 · 复战',[
    ['再打一场多特','累计挑战“痴情的多特”2次。','第一次忙着过关，第二次看看他的技能到底怎么转。',2,'boss_challenge',{
      requiresMain:'mq06',bossId:'boss_dot',bossChallengeId:'boss_dot',...R('side',2,'boss')
    }],
  ]),
  ...sideArc('sbg','沃里尔 · 复战',[
    ['再打一场沃里尔','累计挑战“愤怒的沃里尔”2次。','他的阵线有节奏，第二次会看得更清楚。',2,'boss_challenge',{
      requiresMain:'mq12',bossId:'boss_gravo',bossChallengeId:'boss_gravo',...R('side',3,'boss')
    }],
  ]),
  ...sideArc('sbi','安娜 · 复战',[
    ['再打一场安娜','累计挑战“疯狂的安娜”2次。','暴风雪起来以后，别急着往空位里塞牌。',2,'boss_challenge',{
      requiresMain:'mq18',bossId:'boss_ice',bossChallengeId:'boss_ice',...R('side',4,'boss')
    }],
  ]),
  ...sideArc('sbf','萝莉塔 · 复战',[
    ['再打一场萝莉塔','累计挑战“树妖萝莉塔”2次。','看清召唤出来的东西，再决定火力往哪边挪。',2,'boss_challenge',{
      requiresMain:'mq24',bossId:'boss_forest',bossChallengeId:'boss_forest',...R('side',4,'boss')
    }],
  ]),
];

const SIDE_QUESTS=[
  ...SIDE_PLANT,
  ...SIDE_MONSTER,
  ...SIDE_FUN,
  ...SIDE_WORKSHOP,
  ...SIDE_SUPPLY,
  ...SIDE_COMBAT,
  ...SIDE_COOP,
  ...SIDE_PVP,
  ...SIDE_BOSS,
];

// ==================== 日常 ====================
const DAILY_QUESTS=[
  q('dq1','出去两趟','完成2个野外冒险关卡。','哪条线都算。',2,'adventure_complete',{...R('daily',1,'adventure')}),
  q('dq2','打三场','完成3场战斗。','输的也算。',3,'battle_complete',{...R('daily',1,'adventure')}),
  q('dq3','赢两场','获得2场战斗胜利。','两场就行。',2,'battle_win',{...R('daily',2,'adventure')}),
  q('dq4','清二十个','击败20名敌对单位。','正常打一会儿就够。',20,'kill_enemy',{...R('daily',1,'adventure')}),
  q('dq5','去趟铁匠铺','成功制作或强化1次。','做哪个都算。',1,'card_upgrade',{...R('daily',2,'workshop')}),
  q('dq6','收点东西','获得8件道具或材料。','不挑种类。',8,'item_gain',{...R('daily',1,'collection')}),
];

// ==================== 周常 ====================
const WEEKLY_QUESTS=[
  q('wq1','十二场','本周完成12场战斗。','一周慢慢打。',12,'battle_complete',{...R('weekly',2,'adventure')}),
  q('wq2','八次冒险','本周完成8个野外冒险关卡。','两条线都算。',8,'adventure_complete',{...R('weekly',2,'adventure')}),
  q('wq3','六胜','本周获得6场胜利。','不要求连着赢。',6,'battle_win',{...R('weekly',3,'adventure')}),
  q('wq4','一百个','本周击败100名敌对单位。','打本的时候顺手记。',100,'kill_enemy',{...R('weekly',2,'adventure')}),
  q('wq5','工坊五次','本周成功制作或强化5次。','两种都算在一起。',5,'card_upgrade',{...R('weekly',3,'workshop')}),
  q('wq6','去见个BOSS','本周挑战任意BOSS 1次。','打输了也算见过。',1,'boss_challenge',{...R('weekly',3,'boss')}),
];

// ==================== 成就 ====================
const ACHIEVEMENT_QUESTS=[
  q('aq1','Lv.10','达到Lv.10。','十级。',10,'level',{...R('achievement',1,null)}),
  q('aq2','Lv.20','达到Lv.20。','二十级。',20,'level',{...R('achievement',2,null)}),
  q('aq3','Lv.30','达到Lv.30。','到这里，常用战团通常已经固定了。',30,'level',{...R('achievement',3,null,{items:[{id:QUEST_ITEM_IDS.rerollStat,count:1}]})}),
  q('aq4','Lv.40','达到Lv.40。','四十级。',40,'level',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.rerollQuality,count:1}]})}),
  q('aq5','Lv.50','达到Lv.50。','满级。',50,'level',{...R('achievement',5,null,{items:[{id:QUEST_ITEM_IDS.qualityStone,count:1}]})}),

  q('aq6','一百个敌人','累计击败100名敌对单位。','第一百个。',100,'kill_total',{...R('achievement',1,null)}),
  q('aq7','五百个敌人','累计击败500名敌对单位。','五百个。',500,'kill_total',{...R('achievement',2,null)}),
  q('aq8','一千个敌人','累计击败1000名敌对单位。','一千个。',1000,'kill_total',{...R('achievement',3,null)}),

  q('aq9','五十场','累计完成50场战斗。','五十场。',50,'battle_total',{...R('achievement',2,null)}),
  q('aq10','两百场','累计完成200场战斗。','两百场。',200,'battle_total',{...R('achievement',4,null)}),
  q('aq11','二十五胜','累计获得25场战斗胜利。','二十五场胜利。',25,'battle_win_total',{...R('achievement',2,null)}),
  q('aq12','百胜','累计获得100场战斗胜利。','一百胜。',100,'battle_win_total',{...R('achievement',4,null)}),

  q('aq13','两条线都走过','累计完成34个野外冒险关卡。','把两条主要路线都走一遍。',34,'adventure_total',{...R('achievement',3,null)}),
  q('aq14','一百次冒险','累计完成100个野外冒险关卡。','一百次。',100,'adventure_total',{...R('achievement',5,null)}),

  q('aq15','十张卡','拥有10张卡牌。','卡组终于有得换了。',10,'card_total',{...R('achievement',1,null)}),
  q('aq16','二十张卡','拥有20张卡牌。','二十张。',20,'card_total',{...R('achievement',2,null)}),
  q('aq17','三十张卡','拥有30张卡牌。','三十张。',30,'card_total',{...R('achievement',3,null,{items:[{id:CARD_EGG_IDS[3],count:1}]})}),

  q('aq18','强化二十次','累计成功强化20次。','二十次成功强化。',20,'strengthen_total',{...R('achievement',2,null)}),
  q('aq19','强化五十次','累计成功强化50次。','五十次。',50,'strengthen_total',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.reverse,count:1}]})}),
  q('aq20','做十张卡','累计成功制作10张卡牌。','十张。',10,'craft_total',{...R('achievement',2,null)}),
  q('aq21','做三十张卡','累计成功制作30张卡牌。','三十张。',30,'craft_total',{...R('achievement',4,null,{items:[{id:QUEST_ITEM_IDS.rerollQuality,count:1}]})}),

  q('aq22','四个BOSS','累计击败4次BOSS。','四场首领胜利。',4,'boss_defeat_total',{...R('achievement',3,null,{items:[{id:CARD_EGG_IDS[3],count:1}]})}),
  q('aq23','十个BOSS','累计击败10次BOSS。','十场。',10,'boss_defeat_total',{...R('achievement',5,null,{items:[{id:QUEST_ITEM_IDS.qualityStone,count:1}]})}),
  q('aq24','PVP十胜','累计获得10场PVP胜利。','十胜。',10,'pvp_win_total',{...R('achievement',3,null)}),
  q('aq25','并肩二十场','累计完成20场多人PVE。','二十场组队。',20,'coop_total',{...R('achievement',3,null)}),
];

// ==================== 挑战 ====================
const CHALLENGE_QUESTS=[
  q('cq1','多特','击败“痴情的多特”。','再赢一次也算。',1,'boss_defeated',{
    requiresMain:'mq04',bossId:'boss_dot',bossDefeatId:'boss_dot',...R('challenge_boss',2,'boss')
  }),
  q('cq2','沃里尔','击败“愤怒的沃里尔”。','把这场首领战拿下。',1,'boss_defeated',{
    requiresMain:'mq10',bossId:'boss_gravo',bossDefeatId:'boss_gravo',...R('challenge_boss',3,'boss')
  }),
  q('cq3','安娜','击败“疯狂的安娜”。','别让冻结把节奏全打散。',1,'boss_defeated',{
    requiresMain:'mq16',bossId:'boss_ice',bossDefeatId:'boss_ice',...R('challenge_boss',4,'boss')
  }),
  q('cq4','萝莉塔','击败“树妖萝莉塔”。','召唤多的时候先别乱换目标。',1,'boss_defeated',{
    requiresMain:'mq22',bossId:'boss_forest',bossDefeatId:'boss_forest',...R('challenge_boss',5,'boss')
  }),

  q('cq5','狂暴的刀牙','击败海底神殿BOSS“狂暴的刀牙”。','第一只。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_shark',bossDefeatId:'boss_shark',...R('challenge_boss',4,'boss')
  }),
  q('cq6','龙虾战士','击败海底神殿BOSS“龙虾战士”。','小心连续突进。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_lobster',bossDefeatId:'boss_lobster',...R('challenge_boss',4,'boss')
  }),
  q('cq7','失控的蓝贝贝','击败海底神殿BOSS“失控的蓝贝贝”。','门开了以后别只盯着BOSS。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_bluebaby',bossDefeatId:'boss_bluebaby',...R('challenge_boss',4,'boss')
  }),
  q('cq8','龟老师','击败海底神殿BOSS“龟老师”。','技能多，慢一点看。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_turtle',bossDefeatId:'boss_turtle',...R('challenge_boss',5,'boss')
  }),
  q('cq9','琴音','击败海底神殿BOSS“人鱼公主琴音”。','最后一个。',1,'boss_defeated',{
    requiresMain:'mq25',bossId:'boss_princess',bossDefeatId:'boss_princess',
    ...R('challenge_boss',5,'boss',{items:[{id:CARD_EGG_IDS[5],count:1}]})
  }),

  q('cq10','五场没人倒','累计完成5场零阵亡战斗。','五场。',5,'battle_nodeath',{
    cumulativeKey:'totalNoDeath',...R('challenge',3,'adventure')
  }),
  q('cq11','两分钟','完成3场120秒内结束的胜利。','两分钟内收尾，做三次。',3,'battle_duration',{
    maxDuration:120,...R('challenge',4,'adventure')
  }),
  q('cq12','首领猎手','累计击败8次BOSS。','八场首领胜利。',8,'boss_defeated',{
    cumulativeKey:'totalBossDefeats',
    ...R('challenge',5,'boss',{items:[{id:CARD_EGG_IDS[4],count:1},{id:QUEST_ITEM_IDS.reverse,count:2}]})
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
  {id:'main',label:'主线任务',subtitle:'1-1 到最终关，每关都有奖励'},
  {id:'side',label:'支线任务',subtitle:'换打法、跑另一条线、做养成'},
  {id:'daily',label:'日常任务',subtitle:'当天随手做'},
  {id:'weekly',label:'周常任务',subtitle:'一周慢慢完成'},
  {id:'achievement',label:'成就',subtitle:'长期记录'},
  {id:'challenge',label:'挑战',subtitle:'BOSS和高难条件'},
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
