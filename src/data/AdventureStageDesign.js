// Ordinary-card encounters only. A chapter's fourth node is a challenge, never a BOSS battle.
// Five-wave cadence and paired HP budgets stay shared between the two routes.
export const PLANT_STAGE_DESIGNS = [
  ['初识防线','前排掩护、两翼射击；先处理远程单位。'],
  ['投手加入','南瓜加入后排；尝试远近组合。'],
  ['补给阵地','小麦与投手配合；不要放任后排成长。'],
  ['西瓜突围','普通单位真·西瓜太郎多路推进，考验防线补位。'],
  ['寒冰前哨','寒冰椰子与地刺配合；优先处理控制单位。'],
  ['错峰夹击','上、下路轮流推进，中路留出补位窗口。',2,18,30,17,9],
  ['补给护卫','医生支援轻装阵线；集中火力拆除支援。',2,18,16,22,17],
  ['坚盾连阵','巨盾掩护冰系后排；第五波集中检验破阵能力。',21,18,30,22,54],
  ['交叉火网','三头仙人掌加入，注意分散摆放。',21,25,16,19,17],
  ['地底来客','钻地大蒜与地面部队交错；预留后排补位资源。',2,25,43,22,18],
  ['空地交替','水蜜桃出现在侧翼；兼顾空中与地面。',21,18,40,36,25],
  ['炮阵试炼','玉米炮手与巨盾组成阵地，突破侧翼打开缺口。',21,70,30,36,54],
  ['树荫防线','树精守卫支援前排；不要把火力分得过散。',21,70,69,68,25],
  ['蘑菇回廊','蘑菇仙人与地下单位掩护推进，分批处理。',21,58,43,36,70],
  ['剑客合击','猕猴桃剑客与菠萝勇士交替，控制单位作掩护。',21,70,69,68,54],
  ['古树攻坚','战争古树与全线支援组合；普通怪物的阶段难关。',21,70,55,103,54],
].map(([name,tip,front,ranged,raider,support,special],index)=>({name,tip,index:index+1,front,ranged,raider,support,special}));

// Use genuinely same-tier monster cards, keeping their existing models/skills and database stats.
// Some tiers lack an exact role equivalent; HP and wave DPS are paired by the spawn layer.
const MONSTER_EQUIVALENT = {
  1:83,2:6,4:83,7:5,9:62,14:86,15:62,16:74,17:86,18:92,
  19:24,21:27,22:26,25:63,30:31,36:51,40:23,43:41,54:46,
  55:116,58:118,68:24,69:74,70:20,103:39,
};
export function monsterMirrorWaves(plantWaves) {
  return plantWaves.map(wave=>wave.map(([id,row,col])=>{
    const counterpart=MONSTER_EQUIVALENT[id];
    if (!counterpart) throw new Error(`No monster counterpart for campaign card ${id}`);
    return [counterpart,row,col,id]; // fourth field is HP / wave-DPS reference, never a spawned extra card
  }));
}

export function designedPlantWaves(index) {
  const p=PLANT_STAGE_DESIGNS[index-1];
  if (!p?.front) return null; // first five are authored verbatim in AdventureCampaign.js
  const flank=index%2 ? 1 : 5, opposite=6-flank;
  const waves=[
    [[p.front,3,2],[p.ranged,2,4],[p.ranged,4,4],[p.raider,3,4]],
    [[p.raider,flank,4],[p.special,opposite,5]],
    [[p.front,2,2],[p.support,3,5],[p.raider,opposite,4],[p.ranged,5,4]],
    [[p.special,flank,5],[p.raider,2,4],[p.ranged,4,3]],
    [[p.front,4,2],[p.ranged,1,4],[p.raider,3,4],[p.ranged,5,4],[p.support,2,5]],
  ];
  // Gradual density ramp: 18 → 20 ordinary cards/cycle; challenge nodes add only two.
  if(index>=9)waves[1].push([p.ranged,3,4]);
  if(index>=13)waves[3].push([p.raider,opposite,4]);
  if(index%4===0) { waves[2].push([p.special,4,5]); waves[4].push([p.raider,opposite,4]); }
  return waves;
}

export function finalAdventureWaves() {
  return [
    [[21,3,2],[18,2,4],[83,4,4],[27,3,4]],
    [[43,1,4],[12,5,4],[17,3,5]],
    [[21,2,2],[70,4,5],[26,3,5],[69,5,4]],
    [[58,1,3],[98,5,4],[30,2,4],[41,4,4]],
    [[21,3,2],[55,2,4],[105,4,4],[54,1,5],[51,5,5],[18,3,4]],
  ];
}

export function adventureDesignSummary(route,index) {
  const p=PLANT_STAGE_DESIGNS[index-1];
  if(!p)return {name:'双线会合',tip:'植物与怪物混编的最终难关，无独立 BOSS。'};
  return {name:p.name,tip:route===0?p.tip:`对标植物线 ${Math.ceil(index/4)}-${(index-1)%4+1}：同卡牌等级、同波次、同生命预算与基地血量；使用怪物单位技能组合。`};
}
