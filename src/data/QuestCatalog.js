import { balanceQuestReward, levelReward } from './QuestRewardBalance.js';
export const MAX_PLAYER_LEVEL = 50;
// ======================== 世界观 ========================
// 远古纪元，魔幻森林「翠庭」由七大守护神树庇护。
// 暗影裂缝「噬渊」撕裂天空，混沌军团倾巢而出。
// 你——年轻的战术指挥官，手持「丛林法典」，
// 召唤森林勇士，抵御黑暗侵袭。
// ========================================================

// ---- 主线：翠庭征途(5章，每章6-8条，共34条)----
const MAIN_QUESTS = [
  // 第一章：边境防线 (m1-m7)
  { id:'m1', name:'翠庭之召', desc:'完成1次冒险关卡。', story:'翠庭古树下，七长老燃起莹火法阵。你的丛林法典开始发光——前线告急，即刻前往边境建立据点。', goal:1, event:'adventure_complete', gold:1200, exp:240, items:[{id:10001,count:3}] },
  { id:'m2', name:'先锋试炼', desc:'完成3场战斗。', requires:'m1', story:'铁木将军注视着你的表现。每场胜利都是对法典力量的印证——他需要一个值得信赖的副手。', goal:3, event:'battle_complete', gold:2000, gem:15, exp:380, cards:[25] },
  { id:'m3', name:'清剿边境', desc:'击败40个敌人。', requires:'m2', story:'噬渊裂缝涌出的第一批怪物溃散至密林。趁胜追击，夺回失地。', goal:40, event:'kill_enemy', gold:2800, honor:30, exp:520, items:[{id:10002,count:3}] },
  { id:'m4', name:'扩充法典', desc:'收集5张不同卡牌。', requires:'m3', story:'法典中沉睡着远古森林勇士。收集不同卡牌，组建应对多维度威胁的均衡军团。', goal:5, event:'card_collect', gem:30, honor:45, cards:[27], items:[{id:30055,count:15}] },
  { id:'m5', name:'锤炼之力', desc:'强化卡牌2次。', requires:'m4', story:'前往「锻造古树」——一棵流淌熔岩之血的千年古木。用星辉精华淬炼勇士。', goal:2, event:'card_strengthen', gold:3500, gem:25, exp:700, cards:[46] },
  { id:'m6', name:'边境镇守', desc:'击败80个敌人。', requires:'m5', story:'敌军的反扑比预期更猛烈。铁木将军调来援军，但需要你守住正面防线。', goal:80, event:'kill_enemy', gold:4200, honor:50, exp:850, cards:[52] },
  { id:'m7', name:'第一章·凯旋', desc:'完成6个关卡。', requires:'m6', story:'边境防线终于稳固。铁木将军授予你「边防守卫者」勋章。但真正的战斗远未结束。', goal:6, event:'adventure_complete', gold:5500, gem:35, honor:80, cards:[58], items:[{id:10003,count:2}] },

  // 第二章：迷雾远征 (m8-m14)
  { id:'m8', name:'雾中有声', desc:'击败100个敌人。', requires:'m7', story:'迷雾之森深处传来低沉的嗡鸣——那是噬渊的第一个封印「雾门」在松动。', goal:100, event:'kill_enemy', gold:4800, honor:55, exp:950, cards:[63] },
  { id:'m9', name:'星坠指引', desc:'收集8张卡牌。', requires:'m8', story:'卷轴贤者破译了古老的星图。星坠平原上隐藏着通往雾门的秘径，而你需要足够多的卡牌来激活星门。', goal:8, event:'card_collect', gem:40, honor:70, cards:[71], items:[{id:10004,count:3}] },
  { id:'m10', name:'封印之门', desc:'完成10个关卡。', requires:'m9', story:'星门开启，你踏入星坠平原。雾门就在前方——它被九重暗影锁链束缚，每重都是一场恶战。', goal:10, event:'adventure_complete', gold:6000, gem:45, honor:90, cards:[77,21] },
  { id:'m11', name:'断锁裂空', desc:'击败150个敌人。', requires:'m10', story:'每击杀一个敌人，便有一道暗影锁链崩断。雾门之后，远古守护者的石像隐约可见。', goal:150, event:'kill_enemy', gold:6500, gem:30, honor:75, cards:[84], items:[{id:10005,count:3}] },
  { id:'m12', name:'星辉灌顶', desc:'强化卡牌4次。', requires:'m11', story:'三位远古守护者的石像需要星辉之力才能苏醒。用淬炼中释放的星辉能量灌注它们。', goal:4, event:'card_strengthen', gold:7000, gem:50, honor:100, cards:[90,88] },
  { id:'m13', name:'守护者苏醒', desc:'收集12张卡牌。', requires:'m12', story:'石像裂开，三位远古守护者——「星盾」「月刃」「焰羽」复活。它们将随你一起征讨噬渊。', goal:12, event:'card_collect', gem:60, honor:120, cards:[95,97] },
  { id:'m14', name:'第二章·破雾', desc:'完成14个关卡。', requires:'m13', story:'雾门被彻底封印，三千年来笼罩星坠平原的迷雾终于散去。翠庭的版图扩大了一倍。', goal:14, event:'adventure_complete', gold:8000, gem:55, honor:140, cards:[101], items:[{id:31055,count:3}] },

  // 第三章：深渊暗流 (m15-m21)
  { id:'m15', name:'暗井再现', desc:'击败200个敌人。', requires:'m14', story:'侦察队在金色森林以北发现了深渊入口——「暗井」。这是噬渊的第二个大裂隙。', goal:200, event:'kill_enemy', gold:7500, honor:80, exp:1200, cards:[98] },
  { id:'m16', name:'铁木试炼', desc:'完成16个关卡。', requires:'m15', story:'铁木将军在试炼谷中布下七重考验。这不是战力测试——是战略智慧的终极较量。', goal:16, event:'adventure_complete', gold:8500, gem:60, honor:150, cards:[104,82] },
  { id:'m17', name:'深渊先锋', desc:'击败250个敌人。', requires:'m16', story:'暗井深处涌出的怪物远比边境的更强大。它们具备基础的战术意识，会集中攻击薄弱环节。', goal:250, event:'kill_enemy', gold:9000, gem:40, honor:100, cards:[107], items:[{id:10005,count:4}] },
  { id:'m18', name:'法典共鸣', desc:'强化卡牌累计6次。', requires:'m17', story:'法典开始自主发光——每次强化都有金色符文浮现。这是「共鸣觉醒」，古老的力量正在苏醒。', goal:6, event:'card_strengthen', gold:10000, gem:70, honor:160, cards:[109,87], items:[{id:31055,count:5}] },
  { id:'m19', name:'神木', desc:'收集16张卡牌。', requires:'m18', story:'七位守护神树的力量散落各地。每收集一张卡牌都可能蕴含一片——重组传说中的「神木军团」。', goal:16, event:'card_collect', gem:80, honor:180, cards:[110,116] },
  { id:'m20', name:'暗井封印', desc:'击败300个敌人。', requires:'m19', story:'暗井中隐约可见一座倒悬的黑塔——那是凋零之王的行宫。必须在它完全显现之前封住入口。', goal:300, event:'kill_enemy', gold:12000, gem:50, honor:130, cards:[114], items:[{id:10004,count:8}] },
  { id:'m21', name:'第三章·镇渊', desc:'完成20个关卡。', requires:'m20', story:'暗井被封锁，深渊中传来的战鼓声暂时平息。但所有人都知道，这只是暴风雨前的宁静。', goal:20, event:'adventure_complete', gold:15000, gem:80, honor:200, cards:[105], items:[{id:31055,count:6}] },

  // 第四章：金色森林 (m22-m27)
  { id:'m22', name:'光冠之地', desc:'击败350个敌人。', requires:'m21', story:'金色森林——守护神树「光冠」的领地，整个翠庭最神圣的所在。凋零之王的先锋部队已经抵达。', goal:350, event:'kill_enemy', gold:13000, honor:100, exp:1500, cards:[113] },
  { id:'m23', name:'圣林守护', desc:'完成22个关卡。', requires:'m22', story:'光冠神树洒下金色花粉，为你和卡牌们提供持续回复效果。但敌军数量是之前的十倍。', goal:22, event:'adventure_complete', gold:16000, gem:70, honor:170, cards:[118], items:[{id:10005,count:6}] },
  { id:'m24', name:'凋亡骑士', desc:'击败400个敌人。', requires:'m23', story:'「凋亡骑士团」现身——它们是被混沌能量腐化的远古守护者尸体。每击杀一个都是一种解脱。', goal:400, event:'kill_enemy', gold:18000, gem:55, honor:150, cards:[119] },
  { id:'m25', name:'神树共鸣', desc:'强化卡牌累计8次。', requires:'m24', story:'光冠神树与你的法典产生了共鸣。每一页都闪耀着从未见过的金色符文——这是传说淬炼的法门。', goal:8, event:'card_strengthen', gold:20000, gem:90, honor:220, cards:[56,57], items:[{id:31055,count:8}] },
  { id:'m26', name:'全员集结', desc:'收集20张卡牌。', requires:'m25', story:'翠庭全部战力已经集结——铁木将军、三位远古守护者、神木召来的传说战士。决战在即。', goal:20, event:'card_collect', gem:120, honor:300, cards:[100,92,73] },
  { id:'m27', name:'第四章·圣光', desc:'完成25个关卡。', requires:'m26', story:'光冠神树发出前所未有的金色光芒——它在用最后的力量净化森林。不要辜负这份牺牲。', goal:25, event:'adventure_complete', gold:25000, gem:100, honor:350, cards:[102], items:[{id:10005,count:10}] },

  // 第五章：终末之战 (m28-m34)
  { id:'m28', name:'凋零降临', desc:'击败450个敌人。', requires:'m27', story:'噬渊完全裂开——凋零之王亲自降临。它吞噬了最后一棵尚未苏醒的守护神树，化作「噬光古木」。', goal:450, event:'kill_enemy', gold:20000, gem:80, honor:200, cards:[103] },
  { id:'m29', name:'终极布阵', desc:'收集24张卡牌。', requires:'m28', story:'这是最后的机会。布置你最强的阵容，利用每一种卡牌的独特能力来对抗凋零之王的七大阶段形态。', goal:24, event:'card_collect', gem:150, honor:400, cards:[115,117] },
  { id:'m30', name:'巅峰淬炼', desc:'强化卡牌累计10次。', requires:'m29', story:'锻造古树开出了最后一朵火莲——这种传说中的淬炼方式一生只能用一次。把它用在你最珍视的卡牌上。', goal:10, event:'card_strengthen', gold:25000, gem:120, honor:350, cards:[54], items:[{id:31055,count:10}] },
  { id:'m31', name:'噬光之战', desc:'击败550个敌人。', requires:'m30', story:'凋零之王释放了「永夜领域」——天空变黑，只有光冠的余晖能提供微弱的照明。在黑暗中坚持。', goal:550, event:'kill_enemy', gold:28000, gem:100, honor:250, cards:[85,86] },
  { id:'m32', name:'五章凯旋', desc:'完成28个关卡。', requires:'m31', story:'战线推进到了噬渊边缘。胜利的味道混合着硝烟与花香——翠庭从未像今天这样接近和平。', goal:28, event:'adventure_complete', gold:32000, gem:140, honor:450, cards:[72,75] },
  { id:'m33', name:'永恒封印', desc:'击败650个敌人。', requires:'m32', story:'随着凋零之王被击退，噬渊裂缝开始缓缓闭合。将最后的混沌残余从翠庭的地面上抹去。', goal:650, event:'kill_enemy', gold:38000, gem:160, honor:550, cards:[111,112,62] },
  { id:'m34', name:'终章·荣光', desc:'完成30个关卡。', requires:'m33', story:'噬渊闭合了。七大守护神树同时开花——这是翠庭三千年来第一次看到这奇迹景象。你的名字将被永远刻在翠庭史诗的第一页。', goal:30, event:'adventure_complete', gold:50000, gem:250, honor:1000, cards:[120,48,30], items:[{id:31055,count:20}] },
];

// ---- 支线任务(含前置链，共42条)----
const SIDE_QUESTS = [
  // 战斗系
  { id:'s1', name:'战术演练', desc:'完成2场战斗。', story:'训练营老兵「石拳」发来切磋邀请。', goal:2, event:'battle_complete', gold:900, exp:180, items:[{id:10001,count:2}] },
  { id:'s2', name:'百战老兵', desc:'完成8场战斗。', requires:'s1', story:'石拳对你刮目相看：看来新兵里真有能打的。再接再厉，拿下第八场胜利。', goal:8, event:'battle_complete', gold:2800, honor:25, exp:500, cards:[48] },
  { id:'s3', name:'战神之姿', desc:'完成20场战斗。', requires:'s2', story:'铁木将军翻看战斗日志——你的胜率让他罕见地露出笑容。赢得二十场胜利，证明这一微笑没有白费。', goal:20, event:'battle_complete', gold:6000, gem:35, honor:80, cards:[85,86] },
  { id:'s4', name:'斩将夺旗', desc:'击败30个敌人。', story:'暗影斥候「影刃」试图偷袭补给线。消灭来犯敌军。', goal:30, event:'kill_enemy', gold:1500, honor:18, items:[{id:10003,count:1}] },
  { id:'s5', name:'暗影猎手', desc:'击败150个敌人。', requires:'s4', story:'影刃的分队已被歼灭，但更多的暗影魔从噬渊涌出。继续猎杀，保护后方。', goal:150, event:'kill_enemy', gold:4000, gem:25, honor:55, cards:[76] },
  { id:'s6', name:'千颅猎杀', desc:'击败400个敌人。', requires:'s5', story:'混沌军团将你列入「必杀名单」——而你将这个名字变成荣誉。', goal:400, event:'kill_enemy', gold:10000, gem:60, honor:150, cards:[95,96], items:[{id:10004,count:8}] },
  { id:'s7', name:'万夫莫敌', desc:'击败1000个敌人。', requires:'s6', story:'噬渊怪物开始畏惧。混沌内部流传着一句话：遇到丛林指挥官，立刻撤退。', goal:1000, event:'kill_enemy', gold:25000, gem:120, honor:350, cards:[62,73], items:[{id:10005,count:15}] },

  // 经济系
  { id:'s8', name:'淘金热', desc:'获得1000金币。', story:'密林矿洞发现古代金脉。', goal:1000, event:'gold_gain', gold:700, items:[{id:10002,count:1}] },
  { id:'s9', name:'金币洪流', desc:'获得8000金币。', requires:'s8', story:'矿洞深处发现了一条富金矿脉。继续开采，为军团储备充足。', goal:8000, event:'gold_gain', gold:2500, gem:20, items:[{id:10003,count:3}] },
  { id:'s10', name:'金库充盈', desc:'获得30000金币。', requires:'s9', story:'翠庭金库在战乱中一度枯竭。如今重新充盈——长老会决定重赏经济贡献者。', goal:30000, event:'gold_gain', gold:8000, gem:55, honor:120, cards:[57] },
  { id:'s11', name:'富可敌国', desc:'获得80000金币。', requires:'s10', story:'你的金库金币堆积如山。卷轴贤者开玩笑说：你这是在为和平后的翠庭经济做储备啊。', goal:80000, event:'gold_gain', gold:20000, gem:100, honor:250, cards:[56,100], items:[{id:31055,count:10}] },

  // 收集系
  { id:'s12', name:'收藏启蒙', desc:'收集6张不同卡牌。', story:'卷轴贤者用稀有卡牌换取你的收藏证明。', goal:6, event:'card_collect', gem:15, cards:[63] },
  { id:'s13', name:'图鉴扩充', desc:'收集14张卡牌。', requires:'s12', story:'法典已经填满了三分之一。卷轴贤者兴奋地开始编纂丛林法典注释版。', goal:14, event:'card_collect', gem:55, honor:100, cards:[82,84], items:[{id:31055,count:3}] },
  { id:'s14', name:'全图鉴挑战', desc:'收集22张卡牌。', requires:'s13', story:'法典的大部分空白页都已被填满——你离完整的丛林召唤图鉴只差最后几步。', goal:22, event:'card_collect', gem:120, honor:250, cards:[113,115,117] },
  { id:'s15', name:'传奇收藏家', desc:'收集30张卡牌。', requires:'s14', story:'卷轴贤者流下激动的泪水：翠庭有史以来最完整的召唤图鉴，在你手中完成。', goal:30, event:'card_collect', gem:200, honor:500, cards:[118,119,120], items:[{id:31055,count:15}] },

  // 制作/强化系
  { id:'s16', name:'工坊初试', desc:'制作卡牌1次。', story:'「炽焰工坊」已经点火。', goal:1, event:'card_craft', gem:12, exp:180, items:[{id:30055,count:10}] },
  { id:'s17', name:'熔炉烈焰', desc:'强化+制作累计4次。', requires:'s16', story:'熔炉燃起蓝色火焰——趁热打铁，淬炼精锐。', goal:4, event:'card_upgrade', gold:2500, gem:18, cards:[52] },
  { id:'s18', name:'星铸大师', desc:'制作卡牌8次。', requires:'s17', story:'工坊大师「焰锤」亲临指导。完成八次制作，习得星铸秘术。', goal:8, event:'card_craft', gem:55, honor:80, cards:[87,90], items:[{id:31055,count:5}] },
  { id:'s19', name:'终极淬炼', desc:'强化卡牌累计15次。', requires:'s18', story:'锻造古树树冠开出最后一朵火莲——只有传奇工匠才能驾驭的最高级淬炼仪式。', goal:15, event:'card_strengthen', gold:12000, gem:100, honor:200, cards:[72,75] },

  // 冒险系
  { id:'s20', name:'远征补给线', desc:'完成5个关卡。', story:'后勤专员需要在前线建立补给站。', goal:5, event:'adventure_complete', gold:2500, gem:20, honor:30, items:[{id:10002,count:3}] },
  { id:'s21', name:'无尽远征', desc:'完成12个关卡。', requires:'s20', story:'翠庭外围每寸土地都曾被混沌染指。收复它们，让森林恢复生机。', goal:12, event:'adventure_complete', gold:5000, gem:35, honor:65, cards:[104] },
  { id:'s22', name:'征途漫漫', desc:'完成18个关卡。', requires:'s21', story:'你已踏遍翠庭大半地图。每一条路上都有战斗、牺牲和胜利的故事。', goal:18, event:'adventure_complete', gold:8000, gem:55, honor:120, cards:[105,114] },

  // 额外杂项
  { id:'s23', name:'魔法入门', desc:'使用道具5次。', story:'卷轴贤者教你使用魔法道具的基本法门。', goal:5, event:'item_use', gold:1200, gem:15, exp:250, items:[{id:30055,count:8}] },
  { id:'s24', name:'道具达人', desc:'使用道具20次。', requires:'s23', story:'你已经能熟练使用各种魔法道具。卷轴贤者表示已经没什么可教你的了。', goal:20, event:'item_use', gold:4000, gem:40, honor:60, cards:[54] },
  { id:'s25', name:'荣誉之路', desc:'累计获得500荣誉。', story:'荣誉是翠庭最珍视的货币——它代表了你的贡献。', goal:500, event:'honor_gain', gold:3000, gem:25, exp:400 },
  { id:'s26', name:'万荣之勋', desc:'累计获得3000荣誉。', requires:'s25', story:'长老会特别授予你「翠庭之星」勋章。整个森林都在传颂你的功绩。', goal:3000, event:'honor_gain', gold:10000, gem:80, honor:200, cards:[111] },
  { id:'s27', name:'精英猎手', desc:'单场战斗击败15个敌人。', story:'铁木将军设下挑战：一鼓作气干掉十五个。', goal:15, event:'battle_kill', gold:2000, gem:20, honor:35 },
  { id:'s28', name:'杀戮机器', desc:'单场战斗击败30个敌人。', requires:'s27', story:'三十连杀——铁木将军沉默片刻后鼓掌。他承认：你比他年轻时更强。', goal:30, event:'battle_kill', gold:5000, gem:50, honor:80, cards:[77] },
  { id:'s29', name:'每日坚持', desc:'累计登录3天。', story:'翠庭的晨露每日为你而凝结。', goal:3, event:'daily_login', gold:1500, gem:10, items:[{id:10001,count:3}] },
  { id:'s30', name:'常驻指挥官', desc:'累计登录14天。', requires:'s29', story:'连续作战十四天——你已成为翠庭不可获取的中坚力量。', goal:14, event:'daily_login', gold:5000, gem:45, honor:100, cards:[71] },
  { id:'s31', name:'速战速决', desc:'1分钟内完成一场战斗。', story:'速度就是生命。一分钟内解决战斗，向敌人展示翠庭的闪电战力。', goal:60, event:'battle_duration', gold:2500, gem:18, exp:350 },
  { id:'s32', name:'闪电将军', desc:'30秒内完成一场战斗。', requires:'s31', story:'三十秒——铁木将军甚至没看清你是如何布阵的。敌人已经在溃逃。', goal:30, event:'battle_duration', gold:5000, gem:40, honor:70, cards:[88] },
  { id:'s33', name:'不死军团', desc:'完成5场战斗无任何卡牌阵亡。', story:'珍惜每一位丛林勇士的生命。零伤亡作战，赢得干净利落的胜利。', goal:5, event:'battle_nodeath', gold:4000, gem:30, honor:60, cards:[97] },
  { id:'s34', name:'完美指挥官', desc:'完成15场战斗无卡牌阵亡。', requires:'s33', story:'十五场零亡——你的指挥艺术已臻化境。翠庭的勇士们愿意为你赴汤蹈火。', goal:15, event:'battle_nodeath', gold:12000, gem:80, honor:200, cards:[101,109] },
  { id:'s35', name:'战术大师', desc:'使用5种不同卡牌通过一个关卡。', story:'多样化的阵容是应对复杂战局的关键。用五种不同的卡牌征服一个关卡。', goal:5, event:'team_diversity', gold:3500, gem:25, honor:45, cards:[55] },
  { id:'s36', name:'全兵种统领', desc:'使用8种不同卡牌通过关卡。', requires:'s35', story:'八种不同的卡牌——你展现了翠庭军团阵容的无限可能性。', goal:8, event:'team_diversity', gold:8000, gem:60, honor:120, cards:[92,98] },
  { id:'s37', name:'新手礼遇', desc:'完成1次任意操作。', story:'欢迎来到翠庭。这个简单委托是长老会为你准备的入职礼物。', goal:1, event:'any', gold:500, gem:5, exp:100, items:[{id:10001,count:2}] },
  { id:'s38', name:'试金之路', desc:'完成任意5个委托。', requires:'s37', story:'五个委托完成——你已经熟悉了翠庭的运作方式。更多的奖励等待着勤奋的指挥官。', goal:5, event:'quest_complete', gold:2000, gem:15, honor:30, cards:[30] },
  { id:'s39', name:'委托狂人', desc:'累计完成20个委托。', requires:'s38', story:'二十个委托——卷轴贤者笑称：翠庭的委托榜上已经没有你不认识的任务了。', goal:20, event:'quest_complete', gold:6000, gem:45, honor:100, cards:[114,116] },
  { id:'s40', name:'完美主义者', desc:'累计完成50个委托。', requires:'s39', story:'五十个委托——铁木将军说：如果每个指挥官都像你这样，噬渊三年前就该消失了。', goal:50, event:'quest_complete', gold:15000, gem:100, honor:300, cards:[120,112] },
  { id:'s41', name:'探索迷雾', desc:'发现1个隐藏关卡。', story:'某些关卡需要特殊条件才能触发。去探索那些迷雾中的秘密吧。', goal:1, event:'adventure_complete', gold:3000, gem:30, honor:50, cards:[63] },
  { id:'s42', name:'秘境之主', desc:'发现3个隐藏关卡。', requires:'s41', story:'三个秘境已被发掘——卷轴贤者更新了地图，将你的名字写在了新区域的发现者一栏。', goal:3, event:'adventure_complete', gold:8000, gem:80, honor:150, cards:[110,107] },
  // 系列六：深渊讨伐
  { id:'s43', name:'深渊初探', desc:'完成一场深渊关卡。', story:'暗井被封印后，深渊中出现了新的裂隙。长老会需要勇敢的指挥官去调查。', goal:1, event:'adventure_complete', gold:4000, gem:30, honor:45, cards:[98] },
  { id:'s44', name:'深渊猎手', desc:'在深渊中击败100个敌人。', requires:'s43', story:'深渊中的怪物远比地面的更强韧。但它们携带着稀有的暗影精华——这是制作高级道具的关键材料。', goal:100, event:'kill_enemy', gold:6000, gem:45, honor:70, items:[{id:10005,count:5}] },
  { id:'s45', name:'深渊征服者', desc:'在深渊中击败300个敌人。', requires:'s44', story:'深渊第三层的守卫——「暗影巨像」已被你击倒。它的核心是一块纯净的暗影水晶，锻造古树出价极高。', goal:300, event:'kill_enemy', gold:15000, gem:80, honor:180, cards:[115,117], items:[{id:31055,count:12}] },
  // 系列七：竞技场
  { id:'s46', name:'角斗场冠军', desc:'在竞技场赢得3连胜。', story:'翠庭角斗场重新开放——战士们在这里切磋技艺，而你被邀请成为头号种子。', goal:3, event:'battle_complete', gold:5000, gem:35, honor:60, cards:[76] },
  { id:'s47', name:'不败神话', desc:'在竞技场赢得10连胜。', requires:'s46', story:'十连胜——角斗场的观众开始称你为「不败战神」。你的每场战斗都有大批观众围观。', goal:10, event:'battle_complete', gold:12000, gem:70, honor:150, cards:[95,96] },
  { id:'s48', name:'王者对决', desc:'击败竞技场隐藏BOSS。', requires:'s47', story:'角斗场最深处关押着一位被混沌腐化的前冠军——「暗影剑圣」。击败他，让他安息。', goal:1, event:'battle_complete', gold:20000, gem:120, honor:300, cards:[111,112], items:[{id:31055,count:15}] },
  // 系列八：种田经营
  { id:'s49', name:'后勤专家', desc:'同时拥有50,000金币和2,000荣誉。', story:'翠庭长老会重视全面发展的指挥官。财富与荣誉兼备者方可进入长老会议事。', goal:1, event:'level', gold:5000, gem:30, honor:50, cards:[54] },
  { id:'s50', name:'翠庭商会', desc:'在商城消费累计50,000金币。', story:'翠庭商会会长注意到你惊人的购买力。他决定送你一张VIP凭证和稀有卡牌。', goal:50000, event:'shop_spend', gold:3000, gem:50, honor:80, cards:[100] },
  { id:'s51', name:'投资大师', desc:'在商城消费累计150,000金币。', requires:'s50', story:'商会会长亲自登门拜访：你的消费能力已经带动了整个翠庭经济的复苏。', goal:150000, event:'shop_spend', gold:10000, gem:100, honor:200, cards:[56,57], items:[{id:31055,count:10}] },
  // 系列九：收集控
  { id:'s52', name:'品质收集者', desc:'拥有3张传说品质卡牌。', story:'传说卡牌是翠庭最珍贵的收藏品。三张——足以让任何收藏家眼红。', goal:3, event:'card_collect', gold:8000, gem:80, honor:120, cards:[82] },
  { id:'s53', name:'传说殿堂', desc:'拥有8张传说品质卡牌。', requires:'s52', story:'八张传说——卷轴贤者激动地在你的法典扉页上签名。你的收藏已经超越翠庭博物馆。', goal:8, event:'card_collect', gold:25000, gem:200, honor:400, cards:[119,120], items:[{id:10005,count:20}] },
  // 系列十：极限挑战
  { id:'s54', name:'极限挑战', desc:'用不超过3张卡牌通关一个关卡。', story:'少即是多。用最精简的阵容证明——指挥艺术不在于数量。', goal:3, event:'adventure_complete', gold:6000, gem:40, honor:80, cards:[72] },
  { id:'s55', name:'孤胆英雄', desc:'用1张卡牌单刷通关一个关卡。', requires:'s54', story:'一张卡牌通关——铁木将军沉默了整整一分钟，然后说：报告怎么写。', goal:1, event:'adventure_complete', gold:15000, gem:100, honor:250, cards:[73,85] },
  { id:'s56', name:'无伤通关', desc:'任一关卡全员满血通关。', story:'零伤害——完美的布阵和时机掌控。你的操作仿佛预知了敌人的每一步行动。', goal:1, event:'battle_nodeath', gold:10000, gem:60, honor:150, cards:[105,114] },
  { id:'s57', name:'速通达人', desc:'15秒内完成一场战斗。', story:'十五秒——敌人还没反应过来就被全歼。翠庭的书记官不得不慢放你的战斗录像来记录。', goal:15, event:'battle_duration', gold:8000, gem:80, honor:100, cards:[88,90] },
  { id:'s58', name:'全能战士', desc:'完成以上所有支线。', requires:'s57', story:'全部支线完成——翠庭的每一笔委托、每一个挑战都有你的名字。你是真正的全能指挥官。', goal:1, event:'quest_complete', gold:50000, gem:250, honor:600, cards:[121,118,116], items:[{id:31055,count:30}] },
];

// ---- 日常任务(15条)----
const DAILY_QUESTS = [
  { id:'d1', name:'每日征战', desc:'完成3场战斗。', story:'保持战备状态。', goal:3, event:'battle_complete', gold:1000, exp:200, items:[{id:10001,count:3}] },
  { id:'d2', name:'清场时刻', desc:'击败20个敌人。', story:'巡逻中剿灭残余怪物。', goal:20, event:'kill_enemy', gold:1500, gem:10, exp:280 },
  { id:'d3', name:'财源广进', desc:'获得3000金币。', story:'今日财富积累。', goal:3000, event:'gold_gain', gold:800, gem:12, items:[{id:10002,count:2}] },
  { id:'d4', name:'卡牌养成', desc:'制作或强化1次。', story:'每天进步一点点。', goal:1, event:'card_upgrade', gem:22, exp:300, items:[{id:30055,count:25}] },
  { id:'d5', name:'百战勇士', desc:'完成5场战斗。', story:'赢得今天荣誉。', goal:5, event:'battle_complete', gold:2200, honor:20, exp:400 },
  { id:'d6', name:'猎手之日', desc:'击败50个敌人。', story:'收割暗影之魂。', goal:50, event:'kill_enemy', gold:3000, gem:18, items:[{id:10003,count:3}] },
  { id:'d7', name:'探索精神', desc:'完成1个关卡。', story:'每天踏出一步。', goal:1, event:'adventure_complete', gold:1500, gem:15, exp:250 },
  { id:'d8', name:'金币滚滚', desc:'获得8000金币。', story:'加速经济复苏。', goal:8000, event:'gold_gain', gold:2000, gem:25, honor:15 },
  { id:'d9', name:'收藏日常', desc:'收集1张新卡牌。', story:'法典空白页等待着。', goal:1, event:'card_collect', gem:20, exp:280, items:[{id:10002,count:2}] },
  { id:'d10', name:'全能指挥官', desc:'击败30敌+获3000金。', story:'战力经济双全才是好指挥。', goal:1, event:'battle_complete', gold:2500, gem:30, honor:25, exp:500, items:[{id:10004,count:2}] },
  { id:'d11', name:'速战速决', desc:'完成1场战斗(3分钟内)。', story:'快速解决战斗——效率就是生命。', goal:180, event:'battle_duration', gold:1800, gem:16, exp:300 },
  { id:'d12', name:'精英猎杀', desc:'击败3个精英怪物。', story:'精英怪携带着更好的战利品。', goal:3, event:'elite_kill', gold:3500, gem:28, honor:20, items:[{id:10005,count:2}] },
  { id:'d13', name:'完美者', desc:'完成1场零伤亡战斗。', story:'保护好每一位勇士。', goal:1, event:'battle_nodeath', gold:2000, gem:22, honor:30, items:[{id:31055,count:3}] },
  { id:'d14', name:'强化能手', desc:'强化卡牌1次。', story:'淬炼你的精锐。', goal:1, event:'card_strengthen', gold:1800, gem:15, exp:380000, items:[{id:10003,count:2}] },
  { id:'d15', name:'秘境探寻', desc:'使用道具3次。', story:'灵活运用道具作战。', goal:3, event:'item_use', gold:2200, gem:18, exp:380, items:[{id:30055,count:15}] },
];

// ---- 成就(20条)----
const ACHIEVEMENT_QUESTS = [
  { id:'a1', name:'初露锋芒', desc:'达到Lv.5。', story:'从菜鸟成长为值得信赖的指挥官。', goal:5, event:'level', gold:2000, gem:30, honor:60, cards:[30] },
  { id:'a2', name:'中流砥柱', desc:'达到Lv.10。', story:'翠庭最耀眼的中层新星。「星辉之盾」勋章由长老会特别铸造。', goal:10, event:'level', gold:4000, gem:60, honor:150, cards:[54,48] },
  { id:'a3', name:'封将时刻', desc:'达到Lv.15。', story:'铁木将军举荐你为新任将军。绣有你名的战旗在古树下升起。', goal:15, event:'level', gold:7000, gem:100, honor:300, cards:[72,75] },
  { id:'a4', name:'红莲之证', desc:'达到Lv.18——获得逆天红卡！', story:'锻造古树在你达到十八级时绽放了红莲——这是翠庭三千年来首次。红莲中浮现一张散发着逆天光芒的卡牌：「炼狱炎龙」。', goal:18, event:'level', gold:15000, gem:200, honor:500, cards:[121] },
  { id:'a5', name:'传说降临', desc:'达到Lv.20。', story:'名字铭刻在翠庭丰碑之上。军团在你麾下攻无不克。', goal:20, event:'level', gold:18000, gem:150, honor:450, cards:[85,86,73] },
  { id:'a6', name:'丛林之王', desc:'达到Lv.25。', story:'七位守护神树同时共鸣——你就是传说中的丛林之王。', goal:25, event:'level', gold:35000, gem:300, honor:1000, cards:[118,119,100,57] },
  { id:'a7', name:'百人斩', desc:'累计击败100敌。', story:'第一百个敌人倒下，战士们发出震天欢呼。', goal:100, event:'kill_total', gold:3000, gem:35, honor:70, cards:[62] },
  { id:'a8', name:'五百斩', desc:'累计击败500敌。', requires:'a7', story:'五百——混沌军团开始重新评估翠庭的防御力量。', goal:500, event:'kill_total', gold:8000, gem:70, honor:180, cards:[76,95] },
  { id:'a9', name:'千人斩', desc:'累计击败1000敌。', requires:'a8', story:'混沌军团将你列为「优先铲除目标」——这是对你最高的评价。', goal:1000, event:'kill_total', gold:20000, gem:150, honor:400, cards:[110,104] },
  { id:'a10', name:'万人屠', desc:'累计击败5000敌。', requires:'a9', story:'五千——噬渊开始畏惧这个名字。混沌中流传着一句话：「不要踏入丛林指挥官的防线」。', goal:5000, event:'kill_total', gold:50000, gem:300, honor:800, cards:[120,112,103] },
  { id:'a11', name:'卡牌学徒', desc:'收集10张卡牌。', story:'法典已填满三分之一。', goal:10, event:'card_total', gem:40, honor:60, cards:[52] },
  { id:'a12', name:'卡牌大师', desc:'收集20张卡牌。', requires:'a11', story:'大半书页已满——卷轴贤者说你已是卡牌学者。', goal:20, event:'card_total', gem:100, honor:200, cards:[92,97] },
  { id:'a13', name:'全图鉴大师', desc:'收集30张卡牌。', requires:'a12', story:'翠庭有史以来最完整的召唤图鉴在你手中诞生。', goal:30, event:'card_total', gem:250, honor:500, cards:[116,113,115] },
  { id:'a14', name:'富甲一方', desc:'金币达到50000。', story:'翠庭金库的规模已经恢复到战前水平。', goal:50000, event:'gold_total', gem:80, honor:120, cards:[56] },
  { id:'a15', name:'荣誉加身', desc:'荣誉达到1000。', story:'你的名字在下层士兵中传为神话。', goal:1000, event:'honor_total', gold:8000, gem:60, honor:100, cards:[77] },
  { id:'a16', name:'战斗狂人', desc:'完成50场战斗。', story:'五十场——铁木将军说你是翠庭最勤奋的指挥官。', goal:50, event:'battle_total', gold:10000, gem:80, honor:180, cards:[90,105] },
  { id:'a17', name:'关卡征服者', desc:'完成30个关卡。', story:'翠庭的全部前线据点都插上了你的战旗。', goal:30, event:'adventure_total', gold:15000, gem:120, honor:250, cards:[114,102] },
  { id:'a18', name:'淬炼达人', desc:'累计强化20次。', story:'锻造古树的树冠开始绽放永恒之花——传说只有最勤奋的工匠才能看到这景象。', goal:20, event:'strengthen_total', gold:10000, gem:100, honor:200, cards:[56,57], items:[{id:31055,count:15}] },
  { id:'a19', name:'道具大师', desc:'累计使用道具100次。', story:'卷轴贤者承认：你对魔法道具的运用已经超越了他。', goal:100, event:'item_total', gold:8000, gem:80, honor:150, cards:[82,84] },
  { id:'a20', name:'完美传奇', desc:'完成全部成就。', requires:'a19', story:'全部成就解锁。翠庭历史为你重新书写。从此，这将是一个由你开创的时代。', goal:20, event:'level', gold:100000, gem:500, honor:2000, cards:[121,120,118], items:[{id:31055,count:50}] },
];

// ---- 周常任务(12条，每周一重置)----
const WEEKLY_QUESTS = [
  { id:'w1', name:'周常征战', desc:'本周完成20场战斗。', story:'持续作战是保持战力的最佳方式。铁木将军每周都会统计前线总战绩。', goal:20, event:'battle_complete', gold:5000, gem:30, honor:50, exp:800, items:[{id:10003,count:5}] },
  { id:'w2', name:'周常猎杀', desc:'本周击败200个敌人。', story:'噬渊不会因为周末而停歇。200个——这是翠庭每周最低的防御指标。', goal:200, event:'kill_enemy', gold:8000, gem:45, honor:80, cards:[62], items:[{id:10004,count:5}] },
  { id:'w3', name:'远征周', desc:'本周完成8个关卡。', story:'每周推进八次前线——这是铁木将军为你制定的远征计划。', goal:8, event:'adventure_complete', gold:6000, gem:35, honor:60, cards:[71] },
  { id:'w4', name:'金币周', desc:'本周获得30,000金币。', story:'翠庭每周的财政报告都指望你了。赚够三万金，商会会给你特别分红。', goal:30000, event:'gold_gain', gold:4000, gem:25, items:[{id:10005,count:3}] },
  { id:'w5', name:'制作周', desc:'本周制作/强化卡牌5次。', story:'锻造古树每周需要一定的星辉能量来维持熔炉。你的淬炼会为熔炉充能。', goal:5, event:'card_upgrade', gem:50, honor:45, cards:[52,87], items:[{id:31055,count:8}] },
  { id:'w6', name:'收藏周', desc:'本周收集3张新卡牌。', story:'卷轴贤者每周都在等着新卡牌登记入册。三张新卡会让他开心一整个周末。', goal:3, event:'card_collect', gem:55, honor:40, cards:[77], items:[{id:30055,count:20}] },
  { id:'w7', name:'荣誉周', desc:'本周获得500荣誉。', story:'每周的荣誉统计会上报长老会——五百荣誉是对你本周功绩的最佳证明。', goal:500, event:'honor_gain', gold:6000, gem:35, honor:100, cards:[98] },
  { id:'w8', name:'零伤亡周', desc:'本周完成3场零伤亡战斗。', story:'珍惜每一位勇士的生命。三场零亡作战——你本周的指挥堪称完美。', goal:3, event:'battle_nodeath', gold:7000, gem:50, honor:80, cards:[97,101] },
  { id:'w9', name:'精英猎杀周', desc:'本周击败10个精英怪。', story:'精英怪物携带更精良的战利品。十只精英——本周猎杀指标达标。', goal:10, event:'elite_kill', gold:10000, gem:60, honor:100, cards:[109], items:[{id:10005,count:8}] },
  { id:'w10', name:'竞技之周', desc:'本周竞技场5连胜。', story:'角斗场每周都有排行榜更新。五连胜可以让你稳居本周前五名。', goal:5, event:'battle_complete', gold:8000, gem:55, honor:120, cards:[88,95] },
  { id:'w11', name:'消费达人', desc:'本周商城消费20,000金币。', story:'翠庭商会每周都有销售额KPI——而你成了他们最依赖的金主。', goal:20000, event:'shop_spend', gold:5000, gem:40, items:[{id:31055,count:10}] },
  { id:'w12', name:'全能之星', desc:'本周完成以上任意6项。', story:'六项周常完成——你是本周翠庭最全面的指挥官。长老会决定给你特别表彰。', goal:6, event:'battle_complete', gold:15000, gem:100, honor:200, cards:[110,114,116], items:[{id:31055,count:20}] },
];

// ---- 挑战任务(15条，一次性高难度)----
const CHALLENGE_QUESTS = [
  { id:'c1', name:'深渊之主', desc:'击败深渊最终BOSS「噬渊之主」。', story:'深渊最底层沉睡着被混沌扭曲的远古神兽。击败它，终结深渊的威胁。', goal:1, event:'adventure_complete', gold:30000, gem:200, honor:500, cards:[121,118] },
  { id:'c2', name:'千人斩之证', desc:'单场战斗击败50个敌人。', story:'五十连杀——你的阵线构建堪称艺术品。翠庭角斗场会播放这场战斗的录像作为教材。', goal:50, event:'battle_kill', gold:12000, gem:80, honor:200, cards:[103,112] },
  { id:'c3', name:'三色军团', desc:'同一场战斗使用红/蓝/绿三种品质卡牌各1张。', story:'不同品质的卡牌之间存在微妙的能量共振。掌握这种共振，战力倍增。', goal:3, event:'battle_complete', gold:8000, gem:60, honor:100, cards:[55] },
  { id:'c4', name:'元素大师', desc:'同一场战斗使用火/冰/雷/光/暗五种属性卡牌。', story:'五种元素同时激活——这是翠庭法典中记载的「五芒元素阵」。传说只有传奇指挥官才能驾驭。', goal:5, event:'battle_complete', gold:15000, gem:120, honor:300, cards:[119,120] },
  { id:'c5', name:'极限输出', desc:'单张卡牌在一场战斗中造成10,000伤害。', story:'一万伤害——锻造古树的检测仪器超载了。焰锤大师连夜赶制新的伤害计量器。', goal:10000, event:'kill_enemy', gold:10000, gem:80, honor:150, cards:[96] },
  { id:'c6', name:'铁壁防线', desc:'一场战斗中所有卡牌存活且承受总伤害低于1,000。', story:'铜墙铁壁般的防线。敌军疯狂攻击，但你的阵线毫发无伤。', goal:1000, event:'low_damage_taken', gold:10000, gem:70, honor:180, cards:[101] },
  { id:'c7', name:'速杀', desc:'5秒内击败BOSS关卡。', story:'BOSS还没来得及释放技能就倒下了。铁木将军反复确认了三次时间记录。', goal:5, event:'battle_duration', gold:20000, gem:150, honor:350, cards:[85,86] },
  { id:'c8', name:'穷兵黩武', desc:'消耗金币使金币归零(零花钱也算)。', story:'把钱花光也是需要勇气的——尤其是在翠庭这种金币能买一切的地方。', goal:0, event:'gold_gain', gold:5000, gem:25, honor:30, cards:[30] },
  { id:'c9', name:'全职猎人', desc:'击杀怪物图鉴中所有类型的怪物。', story:'翠庭怪物图鉴共有二十余种。全部击杀——你将获得「全职猎人」的永久称号。', goal:25, event:'kill_total', gold:25000, gem:180, honor:400, cards:[113,107] },
  { id:'c10', name:'隐藏王者', desc:'发现并通关5个隐藏关卡。', story:'五个秘境——每一个都藏着独一无二的传说和宝藏。你已经比任何探险家都更了解翠庭。', goal:5, event:'adventure_complete', gold:20000, gem:150, honor:300, cards:[118,119] },
  { id:'c11', name:'极限强化', desc:'将一张卡牌强化到Lv.10。', story:'十级强化——这张卡牌已经超越了它的生物极限。锻造古树的火莲为此盛开了三天。', goal:10, event:'card_strengthen', gold:18000, gem:120, honor:250, cards:[56,57] },
  { id:'c12', name:'天选之人', desc:'一次十连抽中同时获得传说和逆天卡牌。', story:'这个概率——卷轴贤者说应该用数学来算一下。焰锤大师说：不用算了，这就是天意。', goal:2, event:'card_collect', gold:30000, gem:250, honor:500, cards:[121,120] },
  { id:'c13', name:'和平使者', desc:'不放置任何攻击型卡牌通关一个关卡。', story:'只用防御和辅助卡牌通关——你证明了和平主义在翠庭也能生存。铁木将军看完了全程录像，若有所思。', goal:0, event:'battle_complete', gold:12000, gem:100, honor:200, cards:[57] },
  { id:'c14', name:'终末降临', desc:'击败全部主线BOSS(包括隐藏BOSS)。', story:'所有BOSS——从第一章的噬渊先锋到终章的凋零之王——全部倒在你的脚下。', goal:10, event:'adventure_complete', gold:50000, gem:300, honor:800, cards:[121,120,119] },
  { id:'c15', name:'翠庭传奇', desc:'完成所有挑战。', story:'全部挑战完成——翠庭的历史碑文需要重新刻。长老会一致通过：将今年定为「军团纪元·元年」。', goal:15, event:'quest_complete', gold:100000, gem:500, honor:2000, cards:[121,120,119,118,116,115], items:[{id:31055,count:50}] },
];

// ============ 挂载 ============
const QUEST_GROUPS = { main:MAIN_QUESTS, side:SIDE_QUESTS, daily:DAILY_QUESTS, weekly:WEEKLY_QUESTS, achievement:ACHIEVEMENT_QUESTS, challenge:CHALLENGE_QUESTS };
const CATEGORIES = [
  { id:'main', label:'主线任务', subtitle:'翠庭征途' },
  { id:'side', label:'支线任务', subtitle:'额外委托' },
  { id:'daily', label:'日常任务', subtitle:'每日重置' },
  { id:'weekly', label:'周常任务', subtitle:'每周一重置' },
  { id:'achievement', label:'成就', subtitle:'里程碑' },
  { id:'challenge', label:'挑战', subtitle:'高难度' },
  { id:'level', label:'等级奖励', subtitle:'Lv.1-50' },
];

const LEVEL_REWARDS = Array.from({length:MAX_PLAYER_LEVEL},(_,i)=>levelReward(i+1));

for (const [category, quests] of Object.entries(QUEST_GROUPS)) {
  quests.forEach((quest,index)=>Object.assign(quest,balanceQuestReward(quest,category,index)));
}

export { QUEST_GROUPS, ACHIEVEMENT_QUESTS, CATEGORIES, LEVEL_REWARDS };
export function findQuestReward(category,questId) {
  const entries=category==='level'?LEVEL_REWARDS:QUEST_GROUPS[category];
  return entries?.find(entry=>String(entry.id)===String(questId))??null;
}
