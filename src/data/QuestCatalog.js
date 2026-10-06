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

function routeMainChain(prefix,route,chapterLabel,rows){
  return rows.map((row,index)=>{
    const [name,desc,story,goal,event,extra={}]=row;
    const id=`${prefix}${String(index+1).padStart(2,'0')}`;
    return q(id,name,desc,story,goal,event,{
      chapter:chapterLabel,
      route,
      ...(index>0?{requires:`${prefix}${String(index).padStart(2,'0')}`}:{}),
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
// 植物线：蒙斯特族推进。怪物线：埃尔夫族反击。
// 两条线各自推进、各自领奖；最终关要求两条线都完成 4-4。

const PLANT_MAIN=routeMainChain('mp',0,'植物线 · 蒙斯特族推进',[
  ['踩进林口','通关植物线 1-1「初识防线」。','蒙斯特族前队已经摸到林口。埃尔夫族把远程单位压在后面，先把第一层防线撞开。',1,'adventure_complete',{adventureIndex:1,...stageReward(1,1)}],
  ['投手露头','通关植物线 1-2「投手加入」。','南瓜投手补进后排了。前面有人顶着，后面就会一直砸。',1,'adventure_complete',{adventureIndex:2,...stageReward(1,2)}],
  ['拆补给点','通关植物线 1-3「补给阵地」。','小麦开始给后排续力。蒙斯特族想继续往里压，先把这处补给阵地拆掉。',1,'adventure_complete',{adventureIndex:3,...stageReward(1,3)}],
  ['第一道口子','通关植物线 1-4「西瓜突围」。','西瓜从几路一起顶上来。把缺口撑住，蒙斯特族才能把战线推过第一片林地。',1,'adventure_complete',{adventureIndex:4,challengeOnly:true,...stageReward(1,4)}],

  ['冰线前哨','通关植物线 2-1「寒冰前哨」。','埃尔夫族把寒冰单位摆到前沿，路开始不好走了。',1,'adventure_complete',{adventureIndex:5,...stageReward(2,1)}],
  ['两边轮着压','通关植物线 2-2「错峰夹击」。','上路刚松，下路就顶。别把蒙斯特族的兵力一次全压出去。',1,'adventure_complete',{adventureIndex:6,...stageReward(2,2)}],
  ['医生在后面','通关植物线 2-3「补给护卫」。','轻装阵线后面跟着医生。拖得越久，前面的伤越像没打过。',1,'adventure_complete',{adventureIndex:7,...stageReward(2,3)}],
  ['敲开盾阵','通关植物线 2-4「坚盾连阵」。','巨盾挡路，冰系单位躲后面。蒙斯特族得先撕开一边。',1,'adventure_complete',{adventureIndex:8,challengeOnly:true,...stageReward(2,4)}],

  ['火线交叉','通关植物线 3-1「交叉火网」。','仙人掌把几条路都照住了。推进队挤在一起，只会一起挨打。',1,'adventure_complete',{adventureIndex:9,...stageReward(3,1)}],
  ['地下也有人','通关植物线 3-2「地底来客」。','钻地单位开始绕后。蒙斯特族的后排也得留人照看。',1,'adventure_complete',{adventureIndex:10,...stageReward(3,2)}],
  ['天上地下一起','通关植物线 3-3「空地交替」。','空中、地面轮着来，单靠一套推进节奏撑不住。',1,'adventure_complete',{adventureIndex:11,...stageReward(3,3)}],
  ['拔掉炮阵','通关植物线 3-4「炮阵试炼」。','玉米炮手缩在盾后面。别跟正面耗，把一侧打穿。',1,'adventure_complete',{adventureIndex:12,challengeOnly:true,...stageReward(3,4)}],

  ['树荫压下来','通关植物线 4-1「树荫防线」。','树精守卫把最后一段路卡得很死。火力得集中。',1,'adventure_complete',{adventureIndex:13,...stageReward(4,1)}],
  ['穿过蘑菇回廊','通关植物线 4-2「蘑菇回廊」。','地下牵制、蘑菇支援都在拖时间。蒙斯特族不能在这里停太久。',1,'adventure_complete',{adventureIndex:14,...stageReward(4,2)}],
  ['剑客拦路','通关植物线 4-3「剑客合击」。','剑客和勇士轮着顶上来。离终点只差两步。',1,'adventure_complete',{adventureIndex:15,...stageReward(4,3)}],
  ['推到尽头','通关植物线 4-4「古树攻坚」。','战争古树守着植物线最后一道关口。打穿这里，蒙斯特族这一路就推到头了。',1,'adventure_complete',{adventureIndex:16,challengeOnly:true,...stageReward(4,4)}],
]);

const MONSTER_MAIN=routeMainChain('me',1,'怪物线 · 埃尔夫族反击',[
  ['把林口抢回来','通关怪物线 1-1。','蒙斯特族已经压进外围。埃尔夫族的反击从这里开始，先把林口夺回来。',1,'adventure_complete',{adventureIndex:1,...stageReward(1,1)}],
  ['往前顶一格','通关怪物线 1-2。','对面还在往前补兵。别给它们重新站稳的时间。',1,'adventure_complete',{adventureIndex:2,...stageReward(1,2)}],
  ['截掉补兵','通关怪物线 1-3。','蒙斯特族的后续兵力已经接上。把这一段截断，前面的压力会小很多。',1,'adventure_complete',{adventureIndex:3,...stageReward(1,3)}],
  ['守住第一次反扑','通关怪物线 1-4。','对面开始多路压回来了。埃尔夫族得把刚抢回来的地方守住。',1,'adventure_complete',{adventureIndex:4,challengeOnly:true,...stageReward(1,4)}],

  ['反击进2区','通关怪物线 2-1。','第一段稳住以后，埃尔夫族开始往更深处追。',1,'adventure_complete',{adventureIndex:5,...stageReward(2,1)}],
  ['别被带着跑','通关怪物线 2-2。','蒙斯特族轮着换路压人。看清主攻方向，再补兵。',1,'adventure_complete',{adventureIndex:6,...stageReward(2,2)}],
  ['先打支援','通关怪物线 2-3。','对面开始护着支援单位走。先把后面的东西处理掉。',1,'adventure_complete',{adventureIndex:7,...stageReward(2,3)}],
  ['反推第二道线','通关怪物线 2-4。','这一段的阵形硬得多。埃尔夫族得正面把它推回去。',1,'adventure_complete',{adventureIndex:8,challengeOnly:true,...stageReward(2,4)}],

  ['压回交叉口','通关怪物线 3-1。','蒙斯特族把火力铺开了。反击队不能全挤在一条线上。',1,'adventure_complete',{adventureIndex:9,...stageReward(3,1)}],
  ['看住后排','通关怪物线 3-2。','有单位开始从地下绕。前线往前推，后面也不能空。',1,'adventure_complete',{adventureIndex:10,...stageReward(3,2)}],
  ['空地都要管','通关怪物线 3-3。','蒙斯特族换着从空中和地面试探，反击阵容得更完整。',1,'adventure_complete',{adventureIndex:11,...stageReward(3,3)}],
  ['拔掉第三道阵地','通关怪物线 3-4。','这不是追击战了，是一块完整阵地。打掉它，再往4区走。',1,'adventure_complete',{adventureIndex:12,challengeOnly:true,...stageReward(3,4)}],

  ['追进4区','通关怪物线 4-1。','蒙斯特族已经退到最后一段区域。埃尔夫族继续追。',1,'adventure_complete',{adventureIndex:13,...stageReward(4,1)}],
  ['别让它们借地形拖住','通关怪物线 4-2。','最后这段路不好走，对面就等着把反击队拖散。',1,'adventure_complete',{adventureIndex:14,...stageReward(4,2)}],
  ['最后的拦截队','通关怪物线 4-3。','离4-4只剩一关。把这支拦截队清掉。',1,'adventure_complete',{adventureIndex:15,...stageReward(4,3)}],
  ['把战线推回去','通关怪物线 4-4。','这是蒙斯特族在怪物线上的最后一道阶段阵地。拿下它，埃尔夫族的反击就走到终点。',1,'adventure_complete',{adventureIndex:16,challengeOnly:true,...stageReward(4,4)}],
]);

const FINAL_MAIN=q('mf01','双线会合','完成冒险大陆最终关。','蒙斯特族的推进线和埃尔夫族的反击线都走到尽头，最后一场才会开放。',1,'adventure_complete',{
  chapter:'终章 · 双线会合',
  requires:['mp16','me16'],
  finalOnly:true,
  ...R('main_final',5,'adventure',{items:[{id:CARD_EGG_IDS[4],count:1},{id:QUEST_ITEM_IDS.qualityStone,count:1}]})
});

const MAIN_QUESTS=[...PLANT_MAIN,...MONSTER_MAIN,FINAL_MAIN];

// ==================== 支线 ====================
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

const SIDE_QUESTS=[  ...SIDE_FUN,
  ...SIDE_WORKSHOP,
  ...SIDE_SUPPLY,
  ...SIDE_COMBAT,
  ...SIDE_COOP,
  ...SIDE_PVP,];

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
  q('cq1','痴情的多特','击败悲伤密林BOSS“痴情的多特”。','悲伤密林的第一只BOSS。打过多特，下一只才解锁。',1,'boss_defeated',{
    bossId:'boss_dot',bossDefeatId:'boss_dot',...R('challenge_boss',2,'boss')
  }),
  q('cq2','愤怒的沃里尔','击败悲伤密林BOSS“愤怒的沃里尔”。','多特倒下后，沃里尔才会开放。',1,'boss_defeated',{
    requires:'cq1',bossId:'boss_gravo',bossDefeatId:'boss_gravo',...R('challenge_boss',3,'boss')
  }),
  q('cq3','疯狂的安娜','击败悲伤密林BOSS“疯狂的安娜”。','击败沃里尔后，才轮到安娜。',1,'boss_defeated',{
    requires:'cq2',bossId:'boss_ice',bossDefeatId:'boss_ice',...R('challenge_boss',4,'boss')
  }),
  q('cq4','树妖萝莉塔','击败悲伤密林BOSS“树妖萝莉塔”。','安娜之后，悲伤密林最后开放萝莉塔。',1,'boss_defeated',{
    requires:'cq3',bossId:'boss_forest',bossDefeatId:'boss_forest',...R('challenge_boss',5,'boss')
  }),

  q('cq5','狂暴的刀牙','击败海底神殿BOSS“狂暴的刀牙”。','第一只。',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_shark',bossDefeatId:'boss_shark',...R('challenge_boss',4,'boss')
  }),
  q('cq6','龙虾战士','击败海底神殿BOSS“龙虾战士”。','小心连续突进。',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_lobster',bossDefeatId:'boss_lobster',...R('challenge_boss',4,'boss')
  }),
  q('cq7','失控的蓝贝贝','击败海底神殿BOSS“失控的蓝贝贝”。','门开了以后别只盯着BOSS。',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_bluebaby',bossDefeatId:'boss_bluebaby',...R('challenge_boss',4,'boss')
  }),
  q('cq8','龟老师','击败海底神殿BOSS“龟老师”。','技能多，慢一点看。',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_turtle',bossDefeatId:'boss_turtle',...R('challenge_boss',5,'boss')
  }),
  q('cq9','琴音','击败海底神殿BOSS“人鱼公主琴音”。','最后一个。',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_princess',bossDefeatId:'boss_princess',
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
  {id:'main',label:'主线任务',subtitle:'植物线：蒙斯特推进｜怪物线：埃尔夫反击'},
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
