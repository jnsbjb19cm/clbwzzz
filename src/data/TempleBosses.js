// DOCX gives names and skill sets, but no HP/ATK/animation or loot values.
// Reuse the existing late-forest balance and assets until authored data is supplied.
const shared = { region:'temple', difficulty:'简单', hp:10000, atk:28, cd:16,
  lane:3,col:10,immobile:true,commanderOnly:true,displayScale:4,
  minionCardIds:[28,18,31,21],minionInterval:20,minionSpawnCol:10,minionCap:8,
  reward:'沿用现有 BOSS 结算',dna:'沿用现有掉落',placeholderArt:true,dialog:'守护海底神殿！' };
export const TEMPLE_BOSSES = [
  {id:'boss_shark',name:'狂暴的刀牙',cardId:81,skillIds:[534,538,546,517,541,540],skills:'横扫千军、全军复苏、湍流、陨石雨、恐惧咆哮、全军突击'},
  {id:'boss_lobster',name:'龙虾战士',cardId:95,skillIds:[534,546,530,559,541,556],skills:'横扫千军、湍流、波涛术、神圣复苏、恐惧咆哮、利齿突袭',referenceArt:'/adventure-reset/lobster.jpg'},
  {id:'boss_bluebaby',name:'失控的蓝贝贝',cardId:79,skillIds:[543,550,546,538,530,541,535],skills:'海之门、幻之境、湍流、全军复苏、波涛术、恐惧咆哮、巨冰术',referenceArt:'/adventure-reset/bluebaby.jpg'},
  {id:'boss_turtle',name:'龟老师',cardId:85,skillIds:[522,529,527,528,526,557,538,547,558,543,549],skills:'疯狂咆哮、岩破术、元素箭、致命诅咒、全军复苏、铁壳功、雷霆风暴、海之门、死亡触手',referenceArt:'/adventure-reset/turtle.jpg'},
  {id:'boss_princess',name:'人鱼公主琴音',cardId:53,skillIds:[543,538,558,535,529,530,546,544,536,557,542,556],skills:'海之门、全军复苏、雷霆风暴、巨冰术、岩破术、波涛术、湍流、海妖之歌、凝冰术、致命诅咒、海妖之声、利齿突袭',referenceArt:'/adventure-reset/princess.jpg'},
].map((boss,index)=>({...shared,...boss,order:index+1,sprite:String(boss.cardId),img:'现有战斗模型（待专用动画）'}));
