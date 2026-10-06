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
  // 2026-10-06：金币下调（原来一条关口就给 2K+，发得太猛），经验保持不变。
  const rawGold=checkpoint?baseGold+stepGold*3+240:baseGold+stepGold*(n-1);
  return R(checkpoint?'main_checkpoint':'main_step',t,'none',{
    gold:Math.round(rawGold*0.45),
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

function mainArc(prefix,chapterLabel,rows){
  return rows.map((row,index)=>{
    const [name,desc,story,goal,event,extra={}]=row;
    const id=`${prefix}${String(index+1).padStart(2,'0')}`;
    return q(id,name,desc,story,goal,event,{
      chapter:chapterLabel,
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
  ['进攻的第一步','通关植物线 1-1。','士兵，这是你的第一战！先派西瓜战士顶住，突破他们的防线！',1,'adventure_complete',{adventureIndex:1,...stageReward(1,1)}],
  ['小试牛刀','通关植物线 1-2。','干得好！继续往前推，让他们见识见识蒙斯特族的厉害！',1,'adventure_complete',{adventureIndex:2,...stageReward(1,2)}],
  ['拆补给点','通关植物线 1-3。','对面小麦在后面回血！先拆掉这处补给点，不然打不动！',1,'adventure_complete',{adventureIndex:3,...stageReward(1,3)}],
  ['第一道口子','通关植物线 1-4「西瓜突围」。','西瓜从好几条路一起冲上来了！顶住缺口，把战线推过这片林地！',1,'adventure_complete',{adventureIndex:4,challengeOnly:true,...stageReward(1,4)}],

  ['冰线前哨','通关植物线 2-1「寒冰前哨」。','情况不妙！埃尔夫族把寒冰单位摆到了前线！',1,'adventure_complete',{adventureIndex:5,...stageReward(2,1)}],
  ['错峰夹击','通关植物线 2-2「错峰夹击」。','上路刚松、下路就顶！别把所有兵力一次压上去！',1,'adventure_complete',{adventureIndex:6,...stageReward(2,2)}],
  ['阵后医者','通关植物线 2-3「补给护卫」。','轻装阵线后面跟着医生！先把医生解决掉，不然打掉多少回多少！',1,'adventure_complete',{adventureIndex:7,...stageReward(2,3)}],
  ['敲开盾阵','通关植物线 2-4「坚盾连阵」。','巨盾挡在前面，冰系单位躲在后面！集中火力，先撕开一边！',1,'adventure_complete',{adventureIndex:8,challengeOnly:true,...stageReward(2,4)}],

  ['火线交叉','通关植物线 3-1「交叉火网」。','仙人掌把几条路都封住了！队伍别挤在一起，分开推进！',1,'adventure_complete',{adventureIndex:9,...stageReward(3,1)}],
  ['地底来客','通关植物线 3-2「地底来客」。','小心！有单位从地下绕后了，后排也要留人守着！',1,'adventure_complete',{adventureIndex:10,...stageReward(3,2)}],
  ['空地交替','通关植物线 3-3「空地交替」。','空中和地面轮着来！一套打法撑不住，两路都要顾上！',1,'adventure_complete',{adventureIndex:11,...stageReward(3,3)}],
  ['拔掉炮阵','通关植物线 3-4「炮阵试炼」。','玉米炮手缩在盾后面！别跟他正面耗，从一侧打穿！',1,'adventure_complete',{adventureIndex:12,challengeOnly:true,...stageReward(3,4)}],

  ['树荫防线','通关植物线 4-1「树荫防线」。','树精守卫把最后一段路卡死了！火力集中，一个一个清！',1,'adventure_complete',{adventureIndex:13,...stageReward(4,1)}],
  ['蘑菇回廊','通关植物线 4-2「蘑菇回廊」。','地下牵制、蘑菇支援都在拖时间！别在这里停太久！',1,'adventure_complete',{adventureIndex:14,...stageReward(4,2)}],
  ['剑客拦路','通关植物线 4-3「剑客合击」。','剑客和勇士轮着顶上来了！离终点只剩两步，稳住！',1,'adventure_complete',{adventureIndex:15,...stageReward(4,3)}],
  ['推到尽头','通关植物线 4-4「古树攻坚」。','战争古树守着最后一道关口！打穿这里，植物线就推到头了！',1,'adventure_complete',{adventureIndex:16,challengeOnly:true,...stageReward(4,4)}],
]);

const MONSTER_MAIN=routeMainChain('me',1,'怪物线 · 埃尔夫族反击',[
  ['夺回林口','通关怪物线 1-1。','英雄，蒙斯特族已经压进外围！反击就从这里开始，先把林口夺回来！',1,'adventure_complete',{adventureIndex:1,...stageReward(1,1)}],
  ['步步紧逼','通关怪物线 1-2。','对面还在往前补兵！别给他们重新站稳的时间，往前顶！',1,'adventure_complete',{adventureIndex:2,...stageReward(1,2)}],
  ['断其后援','通关怪物线 1-3。','蒙斯特族的后续兵力接上来了！把这一段截断，前面的压力就小了！',1,'adventure_complete',{adventureIndex:3,...stageReward(1,3)}],
  ['守住第一次反扑','通关怪物线 1-4。','对面开始多路压回来了！刚抢回来的地方，一定要守住！',1,'adventure_complete',{adventureIndex:4,challengeOnly:true,...stageReward(1,4)}],

  ['反攻二区','通关怪物线 2-1。','第一段稳住了！埃尔夫族继续往深处追，别停！',1,'adventure_complete',{adventureIndex:5,...stageReward(2,1)}],
  ['识破主攻','通关怪物线 2-2。','他们轮着换路压人！看清主攻方向，再补兵！',1,'adventure_complete',{adventureIndex:6,...stageReward(2,2)}],
  ['先断支援','通关怪物线 2-3。','对面开始护着支援单位走了！先把后面的东西处理掉！',1,'adventure_complete',{adventureIndex:7,...stageReward(2,3)}],
  ['反推第二道线','通关怪物线 2-4。','这一段的阵形硬得多！正面推不动，就换一路打！',1,'adventure_complete',{adventureIndex:8,challengeOnly:true,...stageReward(2,4)}],

  ['压回交叉口','通关怪物线 3-1。','蒙斯特族把火力铺开了！反击队别全挤在一条线上！',1,'adventure_complete',{adventureIndex:9,...stageReward(3,1)}],
  ['守住后排','通关怪物线 3-2。','有单位从地下绕过来了！前线往前推，后面也不能空着！',1,'adventure_complete',{adventureIndex:10,...stageReward(3,2)}],
  ['空地齐防','通关怪物线 3-3。','他们换着从空中和地面试探！阵容得补齐，两路都得管！',1,'adventure_complete',{adventureIndex:11,...stageReward(3,3)}],
  ['拔掉第三道阵地','通关怪物线 3-4。','这不是追击战了，是一块完整阵地！打掉它，再往4区走！',1,'adventure_complete',{adventureIndex:12,challengeOnly:true,...stageReward(3,4)}],

  ['追击四区','通关怪物线 4-1。','蒙斯特族退到最后一段区域了！英雄，继续追！',1,'adventure_complete',{adventureIndex:13,...stageReward(4,1)}],
  ['速战脱困','通关怪物线 4-2。','最后这段路不好走！他们就想把反击队拖散，别上当！',1,'adventure_complete',{adventureIndex:14,...stageReward(4,2)}],
  ['最后的拦截队','通关怪物线 4-3。','只剩最后一关！把这支拦截队清掉！',1,'adventure_complete',{adventureIndex:15,...stageReward(4,3)}],
  ['把战线推回去','通关怪物线 4-4。','这是他们在怪物线上的最后阵地！拿下它，反击就到终点了！',1,'adventure_complete',{adventureIndex:16,challengeOnly:true,...stageReward(4,4)}],
]);

// 2026-10-06：主线逐步发齐 **2 级卡**（27 张）—— 每通一关给一张，两条线走完正好集齐。
const MAIN_TIER2_AWARDS=[9,11,12,14,15,16,17,61,62,65,69,74,84,85,86,87,88,90,500,501,530,531,532,557,558,559,560];
[...PLANT_MAIN,...MONSTER_MAIN].forEach((quest,index)=>{
  const cardId=MAIN_TIER2_AWARDS[index];
  if(cardId) quest.cards=[...(quest.cards||[]),cardId];
});

// 2026-10-06：强化/制作类的补充任务各给一张 1 级卡（低阶卡，不抢 2 级卡的位置）。
const FILLER_TIER1_AWARDS={mfx04:1,mfx17:2,mfx39:3,mfx40:5,mfx41:6,mfx42:8,mfx43:59};

const FINAL_MAIN=q('mf01','双线会合','完成冒险大陆最终关。','两条线都走到尽头了！最终的战场已经打开，英雄，准备出发！',1,'adventure_complete',{
  chapter:'终章 · 双线会合',
  requires:['mp16','me16'],
  finalOnly:true,
  ...R('main_final',5,'adventure',{items:[{id:CARD_EGG_IDS[4],count:1},{id:QUEST_ITEM_IDS.qualityStone,count:1}]})
});


// 2026-10-06：序幕 · 初来乍到 —— 第一次上手该做的事，一个不落地走一遍。
const NOVICE_MAIN=mainArc('ns','序幕 · 初来乍到',[
  ['初来乍到','完成1场战斗（输赢都算）。','',1,'battle_complete',{...R('main_step',1,'adventure')}],
  ['初次胜利','赢下1场战斗。','',1,'battle_win',{...R('main_step',1,'adventure')}],
  ['制作卡片','成功制作1张卡牌。','',1,'card_craft',{...R('main_step',2,'craft')}],
  ['强化粉的加工','完成1次材料加工（强化粉）。','',1,'material_combine',{...R('main_step',2,'material')}],
]);


// ==================== 主线补充（"小水"）====================
// 2026-10-06：主线不能全是关卡推进，穿插一批轻松目标。
// 事件类型跟成就/支线完全一致（同质化），挂在对应关卡之后解锁，**不挡主线推进**。
// 补充任务的实物奖励：按任务类型发材料（金币不值钱、材料才顶用）
function fillerMaterial(event){
  if(event==='card_strengthen'||event==='material_combine')return {id:10001,count:3}; // 一级强化粉
  if(event==='card_craft')return {id:50001,count:2};                                  // 一级羊皮纸
  if(event==='item_gain')return {id:50011,count:2};                                   // 一级宝石
  if(event==='battle_pvp'||event==='pvp_win'||event==='coop_battle_complete')return {id:50021,count:1}; // 一级保护符
  return {id:50002,count:1};                                                          // 默认二级羊皮纸
}

const MAIN_FILLER=([
  ['mfx01','初上战场','完成1场战斗。','打一场就熟了！输了也没关系，来！','mp01',1,'battle_complete',R('filler',1,'adventure')],
  ['mfx02','多带几张','赢下1场战斗，并至少使用5种不同卡牌。','别老用同一张牌！换五种上场试试！','mp02',1,'battle_variety',R('filler',1,'adventure',{minDistinctCards:5})],
  ['mfx03','三路开花','赢下1场战斗，并在三个战线都部署过卡牌。','三条路都放上人，别让对面钻空子！','mp04',1,'battle_lane_spread',R('filler',2,'adventure',{minLanes:3})],
  ['mfx04','炉子热起来','成功强化卡牌1次。','手上的牌该磨了！去铁匠铺强化一次！','mp05',1,'card_strengthen',R('filler',2,'strengthen')],
  ['mfx05','收点材料','获得8件道具或材料。','仓库空着可不行！收八件道具或材料回来！','mp06',8,'item_gain',R('filler',2,'collection')],
  ['mfx06','十合为一','完成1次材料加工。','十个一级粉换一个二级的，先把仓库腾出来！','mp07',1,'material_combine',R('filler',2,'material')],
  ['mfx07','一个都别少','零阵亡完成1场战斗。','这一场一个都别倒下！全都带回来！','mp08',1,'battle_nodeath',R('filler',3,'adventure')],
  ['mfx08','速战速决','完成1场180秒内结束的胜利。','三分钟就能打完的仗，别拖成五分钟！','mp09',1,'battle_duration',R('filler',2,'adventure',{maxDuration:180})],
  ['mfx09','做张新卡','成功制作1张卡牌。','材料放着不会自己变成卡！去做一张！','mp10',1,'card_craft',R('filler',3,'craft')],
  ['mfx10','百人斩','累计击败100名敌对单位。','一百个敌人！冲上去，别客气！','mp12',100,'kill_enemy',R('filler',3,'adventure',{cumulativeKey:'totalKills'})],
  ['mfx11','再下五城','累计获得5场战斗胜利。','再来五场胜利！让对面记住这座营地！','mp14',5,'battle_win',R('filler',3,'adventure',{cumulativeKey:'totalBattleWins'})],
  ['mfx12','三线齐开','在三个战线都部署过卡牌并赢下战斗。','这一战三条线都要有人！一个都不能空着！','mp16',1,'battle_lane_spread',R('filler',4,'adventure',{minLanes:3})],
  ['mfx13','反击开幕','完成1场战斗。','反击开始了！先打一场热热身！','me01',1,'battle_complete',R('filler',1,'adventure')],
  ['mfx14','后勤跟上','获得10件道具或材料。','后勤得跟上！收十件物资回来！','me04',10,'item_gain',R('filler',3,'collection')],
  ['mfx15','老兵手艺','累计成功强化3次。','强化三次！让主力卡再硬一点！','me08',3,'card_strengthen',R('filler',3,'strengthen',{cumulativeKey:'totalStrengthens'})],
  ['mfx16','决战准备','累计获得10场战斗胜利。','决战之前把状态调好！再赢十场！','me16',10,'battle_win',R('filler',4,'adventure',{cumulativeKey:'totalBattleWins'})],
  // 第二批（2026-10-06）：强化/工坊为主，外加等级、累计、PVP、组队、BOSS 的同质水任务。
  ['mfx17','淬火成钢','累计成功强化5次。','炉子别凉！累计强化五次！','mp07',5,'card_strengthen',R('filler',3,'strengthen',{cumulativeKey:'totalStrengthens'})],
  ['mfx18','四星之路','完成1次强化，强化后达到4星或以上。','四星！挑你最顺手的那张卡冲一冲！','mp13',1,'card_strengthen',R('filler',4,'strengthen',{minStar:4})],
  ['mfx19','二级工艺','成功制作1张2级卡牌。','二级卡的材料会疼一点，忍一忍！','mp12',1,'card_craft',R('filler',3,'craft',{craftLevel:2})],
  ['mfx20','三级工艺','成功制作1张3级卡牌。','三级！这一步迈过去，主力就成型了！','me06',1,'card_craft',R('filler',4,'craft',{craftLevel:3})],
  ['mfx21','研磨不休','累计成功制作5张卡牌。','第五张做完，工坊就算摸熟了！','mp15',5,'card_craft',R('filler',3,'craft',{cumulativeKey:'totalCrafts'})],
  ['mfx22','加工不停','累计完成3次材料加工。','十个换一个，做三次！仓库清爽多了！','mp11',3,'material_combine',R('filler',3,'material',{cumulativeKey:'totalMaterialCombines'})],
  ['mfx23','三级的斤两','拿到12个三级强化粉。','三星往上，粉吃得快！先备十二包！','me03',12,'item_gain',R('filler',4,'collection',{itemId:10003,lifetimeItemId:10003})],
  ['mfx24','留三张符','拿到3个二级保护符。','失败要掉星的！手里留三张符踏实！','mp16',3,'item_gain',R('filler',3,'collection',{itemId:50022,lifetimeItemId:50022})],
  ['mfx25','十级学徒','达到Lv.10。','十级了！卡组总算能凑出两套！','mp06',10,'level',R('filler',2,null)],
  ['mfx26','二十级老兵','达到Lv.20。','二十级！该有一张自己养出来的主力卡了！','me05',20,'level',R('filler',3,null)],
  ['mfx27','三十级指挥官','达到Lv.30。','三十级！从现在起，你说了算！','me16',30,'level',R('filler',4,null)],
  ['mfx28','十战之师','累计完成10场战斗。','十场，输赢都算！打完记得看看回放！','mp08',10,'battle_complete',R('filler',2,'adventure',{cumulativeKey:'totalBattles'})],
  ['mfx29','身经二十战','累计完成20场战斗。','二十场！对面的套路该见全了！','me10',20,'battle_complete',R('filler',3,'adventure',{cumulativeKey:'totalBattles'})],
  ['mfx30','屠戮三百','累计击败300名敌对单位。','三百个！巡逻队都记不下这么多名字！','me07',300,'kill_enemy',R('filler',3,'adventure',{cumulativeKey:'totalKills'})],
  ['mfx31','百战之师','累计击败500名敌对单位。','五百个！基地前面那块地都踩实了！','me14',500,'kill_enemy',R('filler',4,'adventure',{cumulativeKey:'totalKills'})],
  ['mfx32','八卡齐上','赢下1场战斗，并至少使用8种不同卡牌。','八种卡一起上！看对面怎么应付！','me12',1,'battle_variety',R('filler',4,'adventure',{minDistinctCards:8})],
  ['mfx33','首战竞技场','完成1场PVP。','竞技场开门了！进去打一场看看！','mf01',1,'battle_pvp',R('filler',3,null)],
  ['mfx34','竞技场首胜','累计获得1场PVP胜利。','赢一场！真人对手可不会让着你！','mf01',1,'pvp_win',R('filler',4,null,{cumulativeKey:'totalPvpWins'})],
  ['mfx35','结伴同行','完成1场多人PVE。','喊个人一起打！基地血量是共用的！','mf01',1,'coop_battle_complete',R('filler',3,null)],
  ['mfx36','会一会首领','挑战任意BOSS 1次。','去见见首领！打输了也算见过世面！','mf01',1,'boss_challenge',R('filler',4,'boss')],
  ['mfx37','首领初捷','累计击败1次BOSS。','首领倒下的那一刻，你会上瘾的！','mf01',1,'boss_defeated',R('filler',5,'boss',{cumulativeKey:'totalBossDefeats'})],
  ['mfx38','物资补给','获得20件道具或材料。','后勤车空了！再收二十件回来！','me11',20,'item_gain',R('filler',3,'collection')],
  // 第三批（2026-10-06）："XX不能停"系列 + 收集向，每条都带剧情味文案。
  ['mfx39','强化不能停','累计成功强化8次。','炉子一凉就手生！强化不能停，累计八次！','mp13',8,'card_strengthen',R('filler',4,'strengthen',{cumulativeKey:'totalStrengthens'})],
  ['mfx40','强化不能停 II','累计成功强化15次。','铁匠说你这手已经稳了！再来十五次！','me09',15,'card_strengthen',R('filler',5,'strengthen',{cumulativeKey:'totalStrengthens'})],
  ['mfx41','合成不能停','累计成功制作8张卡牌。','材料留着不会生崽！合成不能停，八张起步！','mp14',8,'card_craft',R('filler',4,'craft',{cumulativeKey:'totalCrafts'})],
  ['mfx42','合成不能停 II','累计成功制作15张卡牌。','第十五张出炉！工坊的炉子都认得你了！','me13',15,'card_craft',R('filler',5,'craft',{cumulativeKey:'totalCrafts'})],
  ['mfx43','加工不能停','累计完成6次材料加工。','仓库又堆满了！加工不能停，六次清仓！','mp12',6,'material_combine',R('filler',4,'material',{cumulativeKey:'totalMaterialCombines'})],
  ['mfx44','破阵不能停','累计击败800名敌对单位。','林子都被清出一片空地了！继续，八百个！','me15',800,'kill_enemy',R('filler',5,'adventure',{cumulativeKey:'totalKills'})],
  ['mfx45','出征不能停','累计完成30场战斗。','三十场！营地门口那条路你都走熟了！','me16',30,'battle_complete',R('filler',4,'adventure',{cumulativeKey:'totalBattles'})],
  ['mfx46','攻伐不能停','累计获得30场战斗胜利。','三十胜！对面听到你的名字就缩了！','me16',30,'battle_win',R('filler',5,'adventure',{cumulativeKey:'totalBattleWins'})],
  ['mfx47','探险不能停','累计完成12个野外冒险关卡。','地图上还有没走过的角落！再探十二关！','me09',12,'adventure_complete',R('filler',4,'adventure',{cumulativeKey:'totalAdventures'})],
  ['mfx48','宝石储备','拿到10个二级宝石。','一炉吃三颗，十颗才够折腾三轮！','mp10',10,'item_gain',R('filler',3,'collection',{itemId:50012,lifetimeItemId:50012})],
  ['mfx49','纸张够用','拿到8个二级羊皮纸。','做二级卡要纸张，八张先备着！','mp11',8,'item_gain',R('filler',3,'collection',{itemId:50002,lifetimeItemId:50002})],
  ['mfx50','DNA备货','拿到6个二级卡牌DNA。','好东西先囤着！六份，别急着加工！','mp13',6,'item_gain',R('filler',4,'collection',{itemId:50032,lifetimeItemId:50032})],
  ['mfx51','四级强化粉','拿到5个四级强化粉。','四星往上，粉的消耗是断崖式的！备五包！','me08',5,'item_gain',R('filler',4,'collection',{itemId:10004,lifetimeItemId:10004})],
  ['mfx52','五级强化粉','拿到3个五级强化粉。','五级粉，高级卡才吃得下！先弄三包！','me15',3,'item_gain',R('filler',5,'collection',{itemId:10005,lifetimeItemId:10005})],
  ['mfx53','重置材料','拿到2个反转材料。','洗错了还能重来！反转材料留两份！','me16',2,'item_gain',R('filler',4,'material',{itemId:50041,lifetimeItemId:50041})],
  ['mfx54','品质之石','拿到1个品质石。','品质石！一颗就能换一张卡的命！','mf01',1,'item_gain',R('filler',5,'collection',{itemId:82,lifetimeItemId:82})],
  ['mfx55','十卡齐上','赢下1场战斗，并至少使用10种不同卡牌。','十种卡一起上！这才是排面！','me16',1,'battle_variety',R('filler',5,'adventure',{minDistinctCards:10})],
  ['mfx56','一个都别少 II','累计完成3场零阵亡战斗。','带出去多少人，就带回来多少人！三次！','me14',3,'battle_nodeath',R('filler',4,'adventure',{cumulativeKey:'totalNoDeath'})],
  ['mfx57','极限速通','完成1场120秒内结束的胜利。','两分钟！别让对面看清你的摆位！','me16',1,'battle_duration',R('filler',5,'adventure',{maxDuration:120})],
  ['mfx58','三线齐开 II','在三个战线都部署过卡牌，并赢下2场战斗。','三条线都要人！再来两场！','mf01',2,'battle_lane_spread',R('filler',5,'adventure',{minLanes:3})],
  ['mfx59','首领巡礼','累计击败5次BOSS。','五只首领！挑最强的那个先上！','mf01',5,'boss_defeated',R('filler',5,'boss',{cumulativeKey:'totalBossDefeats'})],
  ['mfx60','竞技场十战','累计完成10场PVP。','十场！竞技场里什么套路都能见到！','mf01',10,'battle_pvp',R('filler',4,null,{cumulativeKey:'totalPvpBattles'})],
  ['mfx61','竞技场十胜','累计获得10场PVP胜利。','十胜！排队的时候，有人开始认得你了！','mf01',10,'pvp_win',R('filler',5,null,{cumulativeKey:'totalPvpWins'})],
  ['mfx62','并肩十场','累计完成10场多人PVE。','十场并肩！这人以后喊一句就到！','mf01',10,'coop_battle_complete',R('filler',5,null,{cumulativeKey:'totalCoopBattles'})],
]).map(([id,name,desc,story,requires,goal,event,reward])=>({
  id,name,desc,story,goal,event,requires,chapter:'主线补充',
  ...reward,
  // 2026-10-06：补充任务走"轻档"（filler profile，金币几十到一百出头），另外必给一份材料；
  // 强化/制作类再各给一张 1 级卡。
  items:[...(reward.items||[]),fillerMaterial(event)],
  ...(FILLER_TIER1_AWARDS[id]?{cards:[FILLER_TIER1_AWARDS[id]]}:{}),
}));

const MAIN_QUESTS=[...NOVICE_MAIN,...PLANT_MAIN,...MONSTER_MAIN,FINAL_MAIN,...MAIN_FILLER];

// ==================== 支线 ====================
const SIDE_FUN=sideArc('sfu','临时加码',[
  ['三线齐开','赢下1场战斗，并在三个战线都部署过卡牌。','',1,'battle_lane_spread',{minLanes:3,...R('side_growth',2,'adventure')}],
  ['阵容多变','赢下1场战斗，并至少使用5种不同卡牌。','',1,'battle_variety',{minDistinctCards:5,...R('side_growth',2,'adventure')}],
  ['西瓜速攻','150秒内通关主线 1-4。','',1,'battle_duration',{adventureIndex:4,maxDuration:150,...R('side_growth',2,'adventure')}],
  ['坚盾无伤','零阵亡通关主线 2-4。','',1,'battle_nodeath',{adventureIndex:8,...R('side_growth',3,'adventure')}],
  ['炮阵多变','通关主线 3-4，并在这一场至少使用6种不同卡牌。','',1,'battle_variety',{adventureIndex:12,minDistinctCards:6,...R('side_growth',3,'adventure')}],
  ['古树三线','通关主线 4-4，并在三个战线都部署过卡牌。','',1,'battle_lane_spread',{adventureIndex:16,minLanes:3,...R('side_growth',4,'adventure',{items:[{id:CARD_EGG_IDS[2],count:1}]})}],
]);

const SIDE_WORKSHOP=sideArc('swk','铁匠铺',[
  ['初次强化','成功强化卡牌1次。','',1,'card_strengthen',{...R('side_growth',1,'strengthen')}],
  ['初次制卡','成功制作1张卡牌。','',1,'card_craft',{...R('side_growth',1,'craft')}],
  ['十合一','完成2次材料加工。','',2,'material_combine',{...R('side_growth',2,'material')}],
  ['三星起步','完成1次强化，强化后达到3星或以上。','',1,'card_strengthen',{minStar:3,...R('side_growth',2,'strengthen')}],
  ['二级工艺','成功制作1张2级卡牌。','',1,'card_craft',{craftLevel:2,...R('side_growth',2,'craft')}],
  ['熟能生巧','累计成功制作5张卡牌。','',5,'card_craft',{cumulativeKey:'totalCrafts',...R('side_growth',3,'craft')}],
]);

const SIDE_SUPPLY=sideArc('ssp','补给处',[
  ['第一把粉','拿到10个一级强化粉。','',10,'item_gain',{itemId:10001,lifetimeItemId:10001,...R('side',1,'collection')}],
  ['有纸好办事','拿到6个二级羊皮纸。','',6,'item_gain',{itemId:50002,lifetimeItemId:50002,...R('side',2,'collection')}],
  ['攒点硬货','拿到8个二级宝石。','',8,'item_gain',{itemId:50012,lifetimeItemId:50012,...R('side',2,'collection')}],
  ['留一手','拿到5个二级卡牌DNA。','',5,'item_gain',{itemId:50032,lifetimeItemId:50032,...R('side',3,'collection')}],
  ['上保险','拿到3个二级保护符。','',3,'item_gain',{itemId:50022,lifetimeItemId:50022,...R('side',3,'collection')}],
  ['三星的敲门砖','拿到12个三级强化粉。','',12,'item_gain',{itemId:10003,lifetimeItemId:10003,...R('side',3,'collection')}],
]);

const SIDE_COMBAT=sideArc('sbt','战斗记录',[
  ['旗开得胜','累计获得5场胜利。','',5,'battle_win',{cumulativeKey:'totalBattleWins',...R('side',1,'adventure')}],
  ['全身而退','累计完成3场零阵亡战斗。','',3,'battle_nodeath',{cumulativeKey:'totalNoDeath',...R('side',2,'adventure')}],
  ['速战速决','完成3场180秒内结束的胜利。','',3,'battle_duration',{maxDuration:180,...R('side',2,'adventure')}],
  ['兵贵神速','完成2场150秒内结束的胜利。','',2,'battle_duration',{maxDuration:150,...R('side',3,'adventure')}],
  ['一鼓作气','累计击败100名敌对单位。','',100,'kill_enemy',{cumulativeKey:'totalKills',...R('side',3,'adventure')}],
  ['渐入佳境','累计完成50场战斗。','',50,'battle_complete',{cumulativeKey:'totalBattles',...R('side',4,'adventure')}],
]);

const SIDE_COOP=sideArc('scp','一起守',[
  ['并肩作战','完成1场多人PVE。','',1,'coop_battle_complete',{...R('side_social',1,null)}],
  ['同心协力','累计完成3场多人PVE。','',3,'coop_battle_complete',{cumulativeKey:'totalCoopBattles',...R('side_social',2,null)}],
  ['同袍之谊','累计完成10场多人PVE。','',10,'coop_battle_complete',{cumulativeKey:'totalCoopBattles',...R('side_social',3,null)}],
]);

const SIDE_PVP=sideArc('spv','竞技场',[
  ['牛刀小试','完成1场PVP。','',1,'battle_pvp',{...R('side_social',1,null)}],
  ['首战告捷','累计获得1场PVP胜利。','',1,'pvp_win',{cumulativeKey:'totalPvpWins',...R('side_social',2,null)}],
  ['五度交锋','累计完成5场PVP。','',5,'battle_pvp',{cumulativeKey:'totalPvpBattles',...R('side_social',2,null)}],
  ['小有名气','累计获得5场PVP胜利。','',5,'pvp_win',{cumulativeKey:'totalPvpWins',...R('side_social',3,null)}],
]);


// 2026-10-06：秘境材料 —— 先打完那只 BOSS，对应 NPC 才会上门要材料。
// 材料由 BOSS 掉落（见 server/domain/AdventureAccess.js 的 recordAdventureBossClear）。
const SIDE_MATERIALS=[
  q('smt_dot','讨伐痴情的多特','击败BOSS「痴情的多特」。','',1,'boss_defeated',{
    arc:'秘境材料',bossId:'boss_dot',bossDefeatId:'boss_dot',
    ...R('side_social',3,'boss',{items:[{id:QUEST_ITEM_IDS.bossMaterial.dot,count:2}]})
  }),
  q('smt_dot2','以毒攻毒','收集50个多特的巫蛊。','我是卡尔医师！多特的毒术果然高明，但也不是无药可医。我们正在研究一种能抵御多特毒术的药物，眼下需要大量毒蛊做试验，想从里面找出以毒攻毒的路子。勇者，你愿意帮我们吗？当然，不会让你白跑一趟。',50,'item_gain',{
    arc:'秘境材料',requires:'smt_dot',itemId:QUEST_ITEM_IDS.bossMaterial.dot,lifetimeItemId:QUEST_ITEM_IDS.bossMaterial.dot,
    consumeItems:[{id:QUEST_ITEM_IDS.bossMaterial.dot,count:50}],
    cards:[75],gold:1200,exp:600,
    ...R('side_social',3,'boss',{items:[{id:QUEST_ITEM_IDS.bossMaterial.dot,count:1}]})
  }),

  q('smt_gravo','讨伐愤怒的沃里尔','击败BOSS「愤怒的沃里尔」。','',1,'boss_defeated',{
    arc:'秘境材料',requires:'smt_dot2',bossId:'boss_gravo',bossDefeatId:'boss_gravo',
    ...R('side_social',3,'boss',{items:[{id:QUEST_ITEM_IDS.bossMaterial.gravo,count:2}]})
  }),
  q('smt_gravo2','铠甲的研发','收集100个沃里尔的铠甲。','你好勇士，我是莱曼将军！据调查，沃里尔的战斗力之所以如此强大，是因为他身穿那件用神秘材料制作的铠甲。据说这种材料不光异常坚硬，还能散发一种神奇的力量，让人变得英勇善战。我们现在需要一批沃里尔的铠甲碎片用来研究，希望你能协助我们。',100,'item_gain',{
    arc:'秘境材料',requires:'smt_gravo',itemId:QUEST_ITEM_IDS.bossMaterial.gravo,lifetimeItemId:QUEST_ITEM_IDS.bossMaterial.gravo,
    consumeItems:[{id:QUEST_ITEM_IDS.bossMaterial.gravo,count:100}],
    gold:1500,exp:800,...R('side_social',3,'strengthen',{items:[{id:QUEST_ITEM_IDS.rerollStat,count:1}]})
  }),

  q('smt_ice','讨伐疯狂的安娜','击败BOSS「疯狂的安娜」。','',1,'boss_defeated',{
    arc:'秘境材料',requires:'smt_gravo2',bossId:'boss_ice',bossDefeatId:'boss_ice',
    ...R('side_social',4,'boss',{items:[{id:QUEST_ITEM_IDS.bossMaterial.ice,count:2}]})
  }),
  q('smt_ice2','海德的请求','收集100个安娜的冰晶。','年轻人，我是来自遥远国度的商人海德。我的国家正面临一场巨大的灾难，已经沉睡了百年的火山即将喷发，破坏力惊人，甚至将吞噬整个国家。据说这里有位名叫安娜的大魔法师，她提炼出的冰晶有神奇的降温作用，我国国王命我不惜一切代价获得它。',100,'item_gain',{
    arc:'秘境材料',requires:'smt_ice',itemId:QUEST_ITEM_IDS.bossMaterial.ice,lifetimeItemId:QUEST_ITEM_IDS.bossMaterial.ice,
    consumeItems:[{id:QUEST_ITEM_IDS.bossMaterial.ice,count:100}],
    gold:1500,exp:800,cards:[77],
    ...R('side_social',4,'boss')
  }),

  q('smt_forest','讨伐树妖萝莉塔','击败BOSS「树妖萝莉塔」。','',1,'boss_defeated',{
    arc:'秘境材料',requires:'smt_ice2',bossId:'boss_forest',bossDefeatId:'boss_forest',
    ...R('side_social',5,'boss',{items:[{id:QUEST_ITEM_IDS.bossMaterial.forest,count:2}]})
  }),
  q('smt_forest2','神秘的魔法','收集100个树妖的精元。','我是魔法师麦伦。咳咳，年纪大了，身体也大不如前，想让魔法能力再进一步，实在有些力不从心。我听说从树妖身上可以得到一种精元，不仅能让人重返年轻，还能让魔法功力大增。咳咳，年轻人，能帮我拿来一些吗？作为交换，我会教你一个强大的魔法技能。',100,'item_gain',{
    arc:'秘境材料',requires:'smt_forest',itemId:QUEST_ITEM_IDS.bossMaterial.forest,lifetimeItemId:QUEST_ITEM_IDS.bossMaterial.forest,
    consumeItems:[{id:QUEST_ITEM_IDS.bossMaterial.forest,count:100}],
    gold:2000,exp:1000,...R('side_social',5,'boss',{items:[{id:QUEST_ITEM_IDS.bossSkillBook,count:1}]})
  }),
];

const SIDE_QUESTS=[  ...SIDE_FUN,
  ...SIDE_MATERIALS,
  ...SIDE_WORKSHOP,
  ...SIDE_SUPPLY,
  ...SIDE_COMBAT,
  ...SIDE_COOP,
  ...SIDE_PVP,];

// ==================== 日常 ====================
const DAILY_QUESTS=[
  q('dq1','两趟巡逻','完成2个野外冒险关卡。','',2,'adventure_complete',{...R('daily',1,'adventure')}),
  q('dq2','每日操练','完成3场战斗。','',3,'battle_complete',{...R('daily',1,'adventure')}),
  q('dq3','小试身手','获得2场战斗胜利。','',2,'battle_win',{...R('daily',2,'adventure')}),
  q('dq4','清剿','击败20名敌对单位。','',20,'kill_enemy',{...R('daily',1,'adventure')}),
  q('dq5','切磋琢磨','成功制作或强化1次。','',1,'card_upgrade',{...R('daily',2,'workshop')}),
  q('dq6','多多益善','获得8件道具或材料。','',8,'item_gain',{...R('daily',1,'collection')}),
  // 2026-10-06：补回试玩公告（MainCityTrialBulletin20260905.js）里承诺的「强化能手」。
  // 强化 1 次 → 领奖直接满级：380000 经验是试玩期专门留的体验值，不参与正常奖励平衡。
  q('dq7','强化能手','强化卡牌1次。','',1,'card_strengthen',{...R('daily',5,null,{gold:1800,gem:15,exp:380000,items:[{id:QUEST_ITEM_IDS.powder[3],count:2}]})}),

];

// ==================== 周常 ====================
const WEEKLY_QUESTS=[
  q('wq1','战斗训练','本周完成12场战斗。','',12,'battle_complete',{...R('weekly',2,'adventure')}),
  q('wq2','探索专家','本周完成8个野外冒险关卡。','',8,'adventure_complete',{...R('weekly',2,'adventure')}),
  q('wq3','常胜将军','本周获得6场胜利。','',6,'battle_win',{...R('weekly',3,'adventure')}),
  q('wq4','本周百人斩','本周击败100名敌对单位。','',100,'kill_enemy',{...R('weekly',2,'adventure')}),
  q('wq5','千锤百炼','本周成功制作或强化5次。','',5,'card_upgrade',{...R('weekly',3,'workshop')}),
  q('wq6','迎战强敌','本周挑战任意BOSS 1次。','',1,'boss_challenge',{...R('weekly',3,'boss')}),
];

// ==================== 成就 ====================
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

// ==================== 挑战 ====================
const CHALLENGE_QUESTS=[
  q('cq1','痴情的多特','击败悲伤密林BOSS「痴情的多特」。','小心！多特的毒术很厉害，已经有很多的战士因此受伤了。',1,'boss_defeated',{
    bossId:'boss_dot',bossDefeatId:'boss_dot',...R('challenge_boss',2,'boss')
  }),
  q('cq2','愤怒的沃里尔','击败悲伤密林BOSS「愤怒的沃里尔」。','沃里尔的指挥非常出色，尽量多带治疗卡牌，防止他突破防线。',1,'boss_defeated',{
    requires:'cq1',bossId:'boss_gravo',bossDefeatId:'boss_gravo',...R('challenge_boss',3,'boss')
  }),
  q('cq3','疯狂的安娜','击败悲伤密林BOSS「疯狂的安娜」。','那些可恶的家伙，居然这么对待安娜……但现在不是哀悼的时候。勇士，请你制止住安娜疯狂的行为。',1,'boss_defeated',{
    requires:'cq2',bossId:'boss_ice',bossDefeatId:'boss_ice',...R('challenge_boss',4,'boss')
  }),
  q('cq4','树妖萝莉塔','击败悲伤密林BOSS「树妖萝莉塔」。','萝莉塔的根会缠住你的前排。带一张清场的卡，别让它长起来。',1,'boss_defeated',{
    requires:'cq3',bossId:'boss_forest',bossDefeatId:'boss_forest',...R('challenge_boss',5,'boss')
  }),

  q('cq5','狂暴的刀牙','击败海底神殿BOSS「狂暴的刀牙」。','它能把倒下的兵整队拉回来！别给它复苏的机会，一波压死！',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_shark',bossDefeatId:'boss_shark',...R('challenge_boss',4,'boss')
  }),
  q('cq6','龙虾战士','击败海底神殿BOSS「龙虾战士」。','它一突袭就能咬穿前排！手里留一张卡，随时补位！',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_lobster',bossDefeatId:'boss_lobster',...R('challenge_boss',4,'boss')
  }),
  q('cq7','失控的蓝贝贝','击败海底神殿BOSS“失控的蓝贝贝”。','它会开海之门放小怪，还会布幻境！先堵住门口，别被幻影骗了！',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_bluebaby',bossDefeatId:'boss_bluebaby',...R('challenge_boss',4,'boss')
  }),
  q('cq8','龟老师','击败海底神殿BOSS“龟老师”。','铁壳功一开，输出全白打！等它技能间隙再压上去！',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_turtle',bossDefeatId:'boss_turtle',...R('challenge_boss',5,'boss')
  }),
  q('cq9','琴音','击败海底神殿BOSS“人鱼公主琴音”。','她的歌声会让你的卡停手！关键卡别一次全摆上去！',1,'boss_defeated',{
    requiresMain:'mf01',bossId:'boss_princess',bossDefeatId:'boss_princess',
    ...R('challenge_boss',5,'boss',{items:[{id:CARD_EGG_IDS[5],count:1}]})
  }),

  q('cq10','战争与和平','累计完成5场零阵亡战斗。','大家都要活下去啊。',5,'battle_nodeath',{
    cumulativeKey:'totalNoDeath',...R('challenge',3,'adventure')
  }),
  q('cq11','「闪」击战','完成3场120秒内结束的胜利。','两分钟？！我突破防线都要五分钟，你怎么做到的？？？',3,'battle_duration',{
    maxDuration:120,...R('challenge',4,'adventure')
  }),
  q('cq12','首领猎手','累计击败8次BOSS。','今天要「特殊照顾」哪位呢？',8,'boss_defeated',{
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
