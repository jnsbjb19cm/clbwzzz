import { itemIconMarkup } from './ItemIcon.js';
import { authStore } from '../core/AuthStore.js';
import { resolveCraftQuality } from '../core/constants.js';
import { reconcileAdventureQuestClears } from '../core/AdventureQuestReconcile.js';
import { audio } from '../core/AudioManager.js';
import { grantPlayerExp } from '../core/PlayerProgression.js';
import { InventoryStore } from '../core/ItemDatabase.js';
import { CardInventoryStore } from '../core/CardInventoryStore.js';
import { BattleView } from './BattleView.js';
import { questPeriodKey } from '../data/QuestPeriods.js';
import { markBossCleared } from '../core/BossProgress.js';
import { dataCount, progressDelta, requirementsMet, cumulativeProgress, syncCumulativeProgress, visibleQuests, backfillQuestProgressFromHistory } from '../battle/QuestProgressRules.js';
import { MAX_PLAYER_LEVEL, QUEST_GROUPS, ACHIEVEMENT_QUESTS, CATEGORIES, LEVEL_REWARDS } from '../data/QuestCatalog.js';

const STORAGE_KEY = 'clbwz_quest_v12';
const OLD_STORAGE_KEYS = ['clbwz_quest_v11', 'clbwz_quest_v10', 'clbwz_quest_v9', 'clbwz_quest_v8', 'clbwz_quest_v7', 'clbwz_quest_v6', 'clbwz_quest_v5', 'clbwz_quest_v4', 'clbwz_quest_v3'];

function todayKey(){return questPeriodKey('daily');}
function weekKey(){return questPeriodKey('weekly');}
function defaultState(){
  return {
    dailyDate:todayKey(),weeklyDate:weekKey(),dailyProgress:{},dailyClaimed:[],weeklyProgress:{},weeklyClaimed:[],
    mainProgress:{},mainClaimed:[],sideProgress:{},sideClaimed:[],achievementProgress:{},achievementClaimed:[],
    challengeProgress:{},challengeClaimed:[],levelClaimed:[],
    _extra:{totalKills:0,totalBattles:0,totalBattleWins:0,totalAdventures:0,totalUpgrades:0,totalStrengthens:0,totalCrafts:0,totalMaterialCombines:0,totalItems:0,totalItemGains:0,totalBossChallenges:0,totalBossDefeats:0,totalNoDeath:0,totalPvpBattles:0,totalPvpWins:0,totalCoopBattles:0,totalQuests:0,totalGold:0,totalHonor:0,loginDays:0,
      // 2026-10-09：新任务目录用到的长期统计（教程/技能/购买/转盘/挂机/公会/世界频道/好友/指定卡击杀与获取使用/区域到访）。
      totalStrengthenAttempts:0,totalSkillCasts:0,totalSkillLearns:0,totalShopBuys:0,totalWheelSpins:0,totalFriendAdds:0,totalWorldChats:0,totalGuildJoins:0,totalTutorials:0,totalPlayMinutes:0,totalAdventureAttempts:0,
      questBackfillV13:false,
      itemGainsById:{},bossChallengesById:{},bossDefeatsById:{},adventureClears:{},cardKillsById:{},cardObtainsById:{},cardUsesById:{},areasVisited:{}},
  };
}
function normalizeState(state){
  const r={...defaultState(),...state};
  if(r.dailyDate!==todayKey()){r.dailyDate=todayKey();r.dailyProgress={};r.dailyClaimed=[];}
  if(r.weeklyDate!==weekKey()){r.weeklyDate=weekKey();r.weeklyProgress={};r.weeklyClaimed=[];}
  for(const key of ['dailyProgress','weeklyProgress','mainProgress','sideProgress','achievementProgress','challengeProgress'])r[key]=r[key]??{};
  for(const key of ['dailyClaimed','weeklyClaimed','mainClaimed','sideClaimed','achievementClaimed','challengeClaimed'])r[key]=Array.isArray(r[key])?r[key]:[];
  r.levelClaimed=Array.isArray(r.levelClaimed)?r.levelClaimed:(r.planClaimed??[]);
  r._extra={...defaultState()._extra,...(r._extra??{})};
  for(const mapKey of ['itemGainsById','bossChallengesById','bossDefeatsById','adventureClears','cardKillsById','cardObtainsById','cardUsesById','areasVisited']){
    r._extra[mapKey]={...(r._extra[mapKey]??{})};
  }
  return r;
}
function migrateLegacyState(rawState){
  const old=normalizeState(rawState);
  const fresh=defaultState();
  // 任务系统重做后不继承旧任务ID进度，只保留真实长期统计和已领等级奖励。
  fresh._extra={...fresh._extra,...(old._extra??{})};
  for(const mapKey of ['itemGainsById','bossChallengesById','bossDefeatsById','adventureClears','cardKillsById','cardObtainsById','cardUsesById','areasVisited']){
    fresh._extra[mapKey]={...(old._extra?.[mapKey]??{})};
  }
  fresh.levelClaimed=[...(old.levelClaimed??[])];
  return normalizeState(fresh);
}
function applyBackfillOnce(state){
  // 2026-10-09：任务目录整体重写后，用保留的长期统计给新任务回填一次进度（只跑一次，不补 claimed）。
  if(state._extra?.questBackfillV13)return state;
  try{backfillQuestProgressFromHistory(state,{playerLevel:Number(state._lastPlayerLevel)||1});}catch{}
  state._extra=state._extra||{};state._extra.questBackfillV13=true;
  return state;
}
function loadState(){
  try{
    const current=localStorage.getItem(STORAGE_KEY);
    if(current)return applyBackfillOnce(normalizeState(JSON.parse(current)));
    for(const key of OLD_STORAGE_KEYS){
      const raw=localStorage.getItem(key);
      if(!raw)continue;
      const migrated=migrateLegacyState(JSON.parse(raw));
      localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));
      return applyBackfillOnce(migrated);
    }
  }catch{}
  return applyBackfillOnce(defaultState());
}
function saveState(state){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(normalizeState(state)));}catch{}}
function escaped(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function brokenText(v){return /[?]/.test(String(v??''));}
function rewardIcon(k){return'<i class="quest-reward-icon '+k+'" aria-hidden="true"></i>';}
function rewardChips(reward,cardDb,itemDb){
  const out=[];
  if(reward.gold)out.push('<span class="quest-reward-chip">'+rewardIcon('gold')+'金币 '+reward.gold+'</span>');
  if(reward.gem)out.push('<span class="quest-reward-chip">'+rewardIcon('gem')+'钻石 '+reward.gem+'</span>');
  if(reward.honor)out.push('<span class="quest-reward-chip">'+rewardIcon('honor')+'荣誉 '+reward.honor+'</span>');
  if(reward.exp)out.push('<span class="quest-reward-chip">'+rewardIcon('exp')+'经验 '+reward.exp+'</span>');
  for(const raw of reward.cards||[]){
    // 2026-10-09：奖励卡显示卡图标；带制作品质（如「精良的寒冰椰子」）时在名字前标品质。
    const id=Number(raw?.id??raw);
    const cq=Math.max(1,Math.min(5,Number(raw?.craftQuality)||1));
    const card=cardDb?.getById?.(id);const n=card?.name;
    const label=(cq>1?resolveCraftQuality(cq).name+'·':'')+(n&&!brokenText(n)?n:'卡牌 '+id);
    const icon=card?.spriteRes?'<img class="quest-reward-card-icon" src="/sprites/cards/'+escaped(card.spriteRes)+'.png" alt="" loading="lazy"/>':rewardIcon('card');
    out.push('<span class="quest-reward-chip quest-reward-chip-card">'+icon+escaped(label)+'</span>');
  }
  for(const it of reward.items||[]){const n=itemDb?.getById(it.id)?.name;out.push('<span class="quest-reward-chip">'+itemIconMarkup(it.id,40)+escaped(n&&!brokenText(n)?n:'道具 '+it.id)+' ×'+it.count+'</span>');}
  return out.join('');
}

/**
 * 2026-10-06：背包里现有的数量。
 * "收集X个材料"的目标材料是**服务端掉落**的（BOSS 通关奖励，见 AdventureAccess.js），
 * 那种入库不会走客户端 addItem，事件累加统计不到 → 这里兜底读一次背包当前数量。
 */
function ownedItemCount(itemId){
  try{
    const app=globalThis.__clbwzAppInstance;
    const inv=app?.inventory??app?.itemInventory??app?.views?.bag?.inventory??null;
    if(!inv)return 0;
    if(typeof inv.getCount==='function')return Math.max(0,Number(inv.getCount(itemId)||0));
    const list=typeof inv.getItems==='function'?inv.getItems():(typeof inv.getAll==='function'?inv.getAll():inv.items);
    if(Array.isArray(list)){
      return list.filter((it)=>Number(it?.itemId??it?.id)===Number(itemId)).reduce((sum,it)=>sum+Math.max(0,Number(it?.count||0)),0);
    }
  }catch{/* 读背包失败不影响任务进度 */}
  return 0;
}

export class QuestView{
  static _suppressItemGain=false;
  static _suppressCardObtain=false;

  constructor(cardDb,cardInventory,player,{onPlayerUpdate,itemDb,inventory}={}){
    this.cardDb=cardDb;this.cardInventory=cardInventory;this.player=player;this.onPlayerUpdate=onPlayerUpdate;
    this.itemDb=itemDb;this.inventory=inventory;this.state=loadState();this.category='main';
    this.selected={main:null,side:null,daily:null,weekly:null,achievement:null,challenge:null,level:null};
  }

  static dispatch(event,data={}){
    // 铁匠铺原有回调只上报 count；从统一卡牌背包钩子补足星级/制作等级。
    if(event==='card_strengthen'&&data.star==null&&globalThis.__clbwzQuestLastStrengthStar!=null){data={...data,star:globalThis.__clbwzQuestLastStrengthStar};}
    if(event==='card_craft'&&data.craftLevel==null&&globalThis.__clbwzQuestLastAddedCardLevel!=null){data={...data,craftLevel:globalThis.__clbwzQuestLastAddedCardLevel};}

    const state=loadState();
    let changed=false;
    const completed=[];
    const extra=state._extra||{};
    if(event==='kill_enemy')extra.totalKills=(extra.totalKills||0)+dataCount(data);
    if(event==='battle_complete')extra.totalBattles=(extra.totalBattles||0)+dataCount(data);
    if(event==='battle_win')extra.totalBattleWins=(extra.totalBattleWins||0)+dataCount(data);
    if(event==='battle_nodeath')extra.totalNoDeath=(extra.totalNoDeath||0)+dataCount(data);
    if(event==='battle_pvp')extra.totalPvpBattles=(extra.totalPvpBattles||0)+dataCount(data);
    if(event==='pvp_win')extra.totalPvpWins=(extra.totalPvpWins||0)+dataCount(data);
    if(event==='coop_battle_complete')extra.totalCoopBattles=(extra.totalCoopBattles||0)+dataCount(data);
    if(event==='adventure_complete'){
      extra.totalAdventures=(extra.totalAdventures||0)+dataCount(data);
      const route=Number(data?.route),index=Number(data?.adventureIndex),difficulty=Number(data?.difficulty);
      if(Number.isFinite(route)&&Number.isFinite(index)&&index>0){
        extra.adventureClears[route+':'+index]=1;
        if(Number.isFinite(difficulty))extra.adventureClears[route+':'+index+':'+difficulty]=1;
      }
      if(data?.final)extra.adventureClears.final=1;
    }
    if(event==='card_craft'||event==='card_strengthen'||event==='card_upgrade')extra.totalUpgrades=(extra.totalUpgrades||0)+dataCount(data);
    if(event==='card_strengthen')extra.totalStrengthens=(extra.totalStrengthens||0)+dataCount(data);
    if(event==='card_craft')extra.totalCrafts=(extra.totalCrafts||0)+dataCount(data);
    if(event==='material_combine')extra.totalMaterialCombines=(extra.totalMaterialCombines||0)+dataCount(data);
    if(event==='item_use')extra.totalItems=(extra.totalItems||0)+dataCount(data);
    if(event==='item_gain'){
      const n=dataCount(data);extra.totalItemGains=(extra.totalItemGains||0)+n;
      const itemKey=String(Number(data?.itemId)||0);if(itemKey!=='0')extra.itemGainsById[itemKey]=(extra.itemGainsById[itemKey]||0)+n;
    }
    if(event==='boss_challenge'){
      const n=dataCount(data);extra.totalBossChallenges=(extra.totalBossChallenges||0)+n;
      const bossKey=String(data?.bossId||'');if(bossKey)extra.bossChallengesById[bossKey]=(extra.bossChallengesById[bossKey]||0)+n;
    }
    if(event==='boss_defeated'){
      const n=dataCount(data);extra.totalBossDefeats=(extra.totalBossDefeats||0)+n;
      const bossKey=String(data?.bossId||'');if(bossKey)extra.bossDefeatsById[bossKey]=(extra.bossDefeatsById[bossKey]||0)+n;
    }
    if(event==='quest_complete')extra.totalQuests=(extra.totalQuests||0)+dataCount(data);
    if(event==='gold_gain')extra.totalGold=(extra.totalGold||0)+Math.max(0,Number(data?.amount||0));
    if(event==='honor_gain')extra.totalHonor=(extra.totalHonor||0)+Math.max(0,Number(data?.amount||0));
    // 2026-10-09：新任务目录的长期统计。
    if(event==='card_strengthen_attempt')extra.totalStrengthenAttempts=(extra.totalStrengthenAttempts||0)+dataCount(data);
    if(event==='skill_cast')extra.totalSkillCasts=(extra.totalSkillCasts||0)+dataCount(data);
    if(event==='skill_learn')extra.totalSkillLearns=(extra.totalSkillLearns||0)+dataCount(data);
    if(event==='shop_buy')extra.totalShopBuys=(extra.totalShopBuys||0)+dataCount(data);
    if(event==='lucky_wheel')extra.totalWheelSpins=(extra.totalWheelSpins||0)+dataCount(data);
    if(event==='friend_add')extra.totalFriendAdds=(extra.totalFriendAdds||0)+dataCount(data);
    if(event==='world_chat')extra.totalWorldChats=(extra.totalWorldChats||0)+dataCount(data);
    if(event==='guild_join')extra.totalGuildJoins=(extra.totalGuildJoins||0)+dataCount(data);
    if(event==='tutorial_complete')extra.totalTutorials=(extra.totalTutorials||0)+dataCount(data);
    if(event==='adventure_attempt')extra.totalAdventureAttempts=(extra.totalAdventureAttempts||0)+dataCount(data);
    if(event==='playtime'){const m=Math.max(0,Number(data?.minutes||0));extra.totalPlayMinutes=(extra.totalPlayMinutes||0)+(m||dataCount(data));}
    if(event==='kill_card'){const n=dataCount(data);const key=String(Number(data?.cardId)||0);if(key!=='0')extra.cardKillsById[key]=(extra.cardKillsById[key]||0)+n;}
    if(event==='card_obtain'){const n=dataCount(data);const key=String(Number(data?.cardId)||0);if(key!=='0')extra.cardObtainsById[key]=(extra.cardObtainsById[key]||0)+n;}
    if(event==='card_use'){const n=dataCount(data);const key=String(Number(data?.cardId)||0);if(key!=='0')extra.cardUsesById[key]=(extra.cardUsesById[key]||0)+n;}
    if(event==='visit_area'){const n=dataCount(data);const key=String(data?.areaId||'');if(key)extra.areasVisited[key]=(extra.areasVisited[key]||0)+n;}
    state._extra=extra;changed=true;

    const ach=state.achievementProgress??{};
    for(const quest of ACHIEVEMENT_QUESTS){
      if(state.achievementClaimed?.includes(quest.id))continue;
      if(quest.event==='level')ach[quest.id]=state._lastPlayerLevel||1;
      else if(quest.event==='kill_total')ach[quest.id]=Math.min(quest.goal,extra.totalKills||0);
      else if(quest.event==='card_total')ach[quest.id]=Math.min(quest.goal,state._lastCardCount||0);
      else if(quest.event==='gold_total')ach[quest.id]=Math.min(quest.goal,extra.totalGold||0);
      else if(quest.event==='honor_total')ach[quest.id]=Math.min(quest.goal,extra.totalHonor||0);
      else if(quest.event==='battle_win_total')ach[quest.id]=Math.min(quest.goal,extra.totalBattleWins||0);
      else if(quest.event==='craft_total')ach[quest.id]=Math.min(quest.goal,extra.totalCrafts||0);
      else if(quest.event==='material_total')ach[quest.id]=Math.min(quest.goal,extra.totalMaterialCombines||0);
      else if(quest.event==='boss_defeat_total')ach[quest.id]=Math.min(quest.goal,extra.totalBossDefeats||0);
      else if(quest.event==='no_death_total')ach[quest.id]=Math.min(quest.goal,extra.totalNoDeath||0);
      else if(quest.event==='pvp_total')ach[quest.id]=Math.min(quest.goal,extra.totalPvpBattles||0);
      else if(quest.event==='pvp_win_total')ach[quest.id]=Math.min(quest.goal,extra.totalPvpWins||0);
      else if(quest.event==='coop_total')ach[quest.id]=Math.min(quest.goal,extra.totalCoopBattles||0);
      else if(quest.event==='item_id_total')ach[quest.id]=Math.min(quest.goal,extra.itemGainsById?.[String(quest.itemId)]||0);
      else if(quest.event==='battle_total')ach[quest.id]=Math.min(quest.goal,extra.totalBattles||0);
      else if(quest.event==='adventure_total')ach[quest.id]=Math.min(quest.goal,extra.totalAdventures||0);
      else if(quest.event==='strengthen_total')ach[quest.id]=Math.min(quest.goal,extra.totalStrengthens||0);
      else if(quest.event==='item_total')ach[quest.id]=Math.min(quest.goal,extra.totalItems||0);
      else if(quest.event==='item_gain_total')ach[quest.id]=Math.min(quest.goal,extra.totalItemGains||0);
      else if(quest.event==='achieve_total')ach[quest.id]=ACHIEVEMENT_QUESTS.filter((x)=>x.id!==quest.id&&state.achievementClaimed.includes(x.id)).length;
    }
    state.achievementProgress=ach;

    for(const [cat,quests] of Object.entries(QUEST_GROUPS)){
      if(cat==='achievement')continue;
      const pk=cat+'Progress',ck=cat+'Claimed';
      state[pk]=state[pk]??{};state[ck]=state[ck]??[];
      for(const quest of quests){
        if(state[ck].includes(quest.id))continue;
        if(!requirementsMet(state,cat,quest))continue;
        const before=state[pk][quest.id]||0;
        let after=before;
        if(quest.event==='boss_unlock'){
          const needed=Number(quest.unlockAdventures||((quest.bossId==='boss_dot')?12:0));
          if(needed>0&&Number(extra.totalAdventures||0)>=needed)after=quest.goal;
        }else{
          // 2026-10-09：只要 cumulativeProgress 有定义（累计统计/等级/自动完成/指定卡统计），就用它；
          // 否则按本次事件增量推进。
          const cumulative=cumulativeProgress(quest,state,ownedItemCount);
          if(cumulative!=null)after=Math.min(quest.goal,cumulative);
          else{
            const delta=progressDelta(quest,event,data);
            if(delta)after=Math.min(quest.goal,before+delta);
          }
        }
        if(after===before)continue;
        state[pk][quest.id]=after;
        if(before<quest.goal&&after>=quest.goal)completed.push({category:cat,quest});
        changed=true;
      }
    }
    if(changed)saveState(state);
    if(typeof window!=='undefined')for(const detail of completed)window.dispatchEvent(new CustomEvent('clbwz:quest-complete',{detail}));
    return completed;
  }

  render(root){
    this._questEvents?.abort();this._questEvents=new AbortController();
    window.addEventListener('clbwz:quest-complete',()=>{if(root.isConnected&&root.querySelector('.quest-page'))this.renderContent(root);else this._questEvents.abort();},{signal:this._questEvents.signal});
    root.innerHTML=[
      '<div class="page quest-page quest-page-formal"><div class="quest-window">',
      '<header class="quest-window-title"><h1>任务日志</h1><p>推进主线，处理支线委托，并领取日常、周常、成就与挑战奖励</p></header>',
      '<div class="quest-workspace"><aside class="quest-category-rail" id="quest-category-rail"></aside>',
      '<section class="quest-list-panel"><div class="quest-list-panel-head"><h2 id="quest-list-title"></h2><span id="quest-list-meta"></span></div><div id="quest-list" class="quest-list"></div></section>',
      '<section id="quest-detail" class="quest-detail-parchment"></section></div></div><p id="quest-toast" class="bag-toast hidden"></p></div>',
    ].join('');
    const parentClose = root.closest('.city-modal-window')?.querySelector('.city-modal-close');
    if (parentClose) {
      const close = document.createElement('button'); close.type = 'button'; close.className = 'reference-quest-close';
      close.textContent = '×'; close.setAttribute('aria-label', '关闭任务');
      close.addEventListener('click', () => parentClose.click());
      root.querySelector('.quest-window-title').append(close);
    }
    root.querySelector('#quest-category-rail').innerHTML=CATEGORIES.map((c)=>'<button type="button" class="quest-category-btn" data-category="'+c.id+'"><strong>'+c.label+'</strong><small>'+c.subtitle+'</small></button>').join('');
    root.querySelectorAll('.quest-category-btn').forEach((b)=>b.addEventListener('click',()=>{audio.playSfx('click');this.category=b.dataset.category;this.renderContent(root);}));
    this.renderContent(root);
  }

  entries(){
    if(this.category==='level')return LEVEL_REWARDS;
    const raw=QUEST_GROUPS[this.category]||[];
    if(['daily','weekly','achievement','challenge'].includes(this.category))return raw;
    return visibleQuests(this.category,this.state,raw);
  }
  stateFor(entry){
    if(this.category==='level'){
      const progress=Math.min(MAX_PLAYER_LEVEL,this.player.level||1);return{progress,goal:entry.lv,claimed:this.state.levelClaimed.includes(entry.lv),ready:progress>=entry.lv};
    }
    if(this.category==='achievement'){
      const progress=this.state.achievementProgress?.[entry.id]||0;return{progress,goal:entry.goal,claimed:this.state.achievementClaimed?.includes(entry.id),ready:progress>=entry.goal};
    }
    const pk=this.category+'Progress',ck=this.category+'Claimed',progress=(this.state[pk]||{})[entry.id]||0;
    return{progress,goal:entry.goal,claimed:(this.state[ck]||[]).includes(entry.id),ready:progress>=entry.goal};
  }
  selectedEntry(entries){
    const sid=this.selected[this.category];let entry=entries.find((x)=>String(x.id)===String(sid));
    if(!entry){entry=entries[0];this.selected[this.category]=entry?.id??null;}return entry;
  }
  renderContent(root){
    this.state=loadState();
    const clearedIds=(authStore.snapshot?.stages || []).filter(s=>s.cleared).map(s=>s.stageId);
    // Logged-in progress is authoritative; local progress is only the offline fallback.
    if(!authStore.snapshot){
      try{clearedIds.push(...(JSON.parse(localStorage.getItem('clbwz_worldmap_v1')||'{}').stageClaimed||[]));}catch{}
    }
    reconcileAdventureQuestClears(this.state,this.cardDb?.stages,clearedIds);
    syncCumulativeProgress(this.state,ownedItemCount);
    saveState(this.state);
    const extra=this.state._extra||{};
    for(const quest of ACHIEVEMENT_QUESTS){
      if(this.state.achievementClaimed?.includes(quest.id))continue;
      if(quest.event==='level')this.state.achievementProgress[quest.id]=this.player.level||1;
      if(quest.event==='kill_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalKills||0);
      if(quest.event==='card_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,this.cardInventory?.getUsedCount?.()||0);
      if(quest.event==='gold_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalGold||0);
      if(quest.event==='honor_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalHonor||0);
      if(quest.event==='battle_win_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalBattleWins||0);
      if(quest.event==='craft_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalCrafts||0);
      if(quest.event==='material_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalMaterialCombines||0);
      if(quest.event==='boss_defeat_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalBossDefeats||0);
      if(quest.event==='no_death_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalNoDeath||0);
      if(quest.event==='pvp_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalPvpBattles||0);
      if(quest.event==='pvp_win_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalPvpWins||0);
      if(quest.event==='coop_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalCoopBattles||0);
      if(quest.event==='item_id_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.itemGainsById?.[String(quest.itemId)]||0);
      if(quest.event==='battle_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalBattles||0);
      if(quest.event==='adventure_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalAdventures||0);
      if(quest.event==='strengthen_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalStrengthens||0);
      if(quest.event==='item_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalItems||0);
      if(quest.event==='item_gain_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalItemGains||0);
      if(quest.event==='achieve_total')this.state.achievementProgress[quest.id]=ACHIEVEMENT_QUESTS.filter((x)=>x.id!==quest.id&&this.state.achievementClaimed.includes(x.id)).length;
    }
    this.state._lastPlayerLevel=this.player.level||1;this.state._lastCardCount=this.cardInventory?.getUsedCount?.()||0;saveState(this.state);

    const entries=[...this.entries()].sort((a,b)=>{const sa=this.stateFor(a),sb=this.stateFor(b);return Number(sa.claimed)-Number(sb.claimed)||Number(sb.ready)-Number(sa.ready);});
    const selected=this.selectedEntry(entries),cat=CATEGORIES.find((c)=>c.id===this.category);
    root.querySelectorAll('.quest-category-btn').forEach((b)=>b.classList.toggle('active',b.dataset.category===this.category));
    root.querySelector('#quest-list-title').textContent=cat?.label||'任务';
    const active=entries.filter((e)=>!this.stateFor(e).claimed);
    root.querySelector('#quest-list-meta').textContent=this.category==='daily'?todayKey()+' 重置':this.category==='weekly'?weekKey()+' 周重置':active.length+' / '+entries.length+' 项';
    const renderItem=(entry,index)=>{const s=this.stateFor(entry),pct=Math.min(100,s.progress/Math.max(s.goal,1)*100),selectedClass=String(entry.id)===String(selected?.id)?' selected':'',status=s.claimed?'已领取':s.ready?'可领取':s.progress+' / '+s.goal;return`<button type="button" class="quest-list-item ${selectedClass}${s.claimed?' claimed':''}" data-entry="${entry.id}"><span class="quest-list-icon quest-icon-${index%6}"></span><span class="quest-list-copy"><strong>${escaped(entry.name)}</strong><span>${escaped(entry.desc)}</span><span class="quest-list-progress"><i style="width:${pct}%"></i></span></span><em class="quest-list-state ${s.claimed?'claimed':s.ready?'ready':''}">${status}</em></button>`;};
    const completed=entries.filter((e)=>this.stateFor(e).claimed),list=root.querySelector('#quest-list');
    list.innerHTML=active.map(renderItem).join('')+(completed.length?'<div class="quest-list-section-sep">已完成</div>'+completed.map(renderItem).join(''):'');
    list.querySelectorAll('.quest-list-item').forEach((b)=>b.addEventListener('click',()=>{audio.playSfx('click');this.selected[this.category]=b.dataset.entry;this.renderContent(root);}));
    this.renderDetail(root,selected);
  }
  renderDetail(root,entry){
    const detail=root.querySelector('#quest-detail');if(!entry){detail.innerHTML='<div class="quest-parchment-empty">选择一个任务查看详情</div>';return;}
    const s=this.stateFor(entry),pct=Math.min(100,s.progress/Math.max(s.goal,1)*100),label=entry.chapter||entry.arc||(this.category==='level'?'成长计划':this.category==='achievement'?'里程碑':'任务委托'),action=s.claimed?'<span class="quest-detail-claimed">已领取</span>':s.ready?'<button type="button" class="quest-claim-btn quest-detail-claim" data-entry="'+entry.id+'">领取奖励</button>':'<span class="quest-detail-locked">继续完成</span>';
    // 2026-10-09：领奖时要扣的东西（材料 + 金币），在详情里先讲清楚。
    const submitParts=[];
    if(entry.consumeGold)submitParts.push('金币 '+Math.max(0,Math.floor(Number(entry.consumeGold)||0)));
    for(const c of entry.consumeItems||[])submitParts.push(escaped(this.itemDb?.getById?.(Number(c.id))?.name||('道具 '+c.id))+' ×'+Math.max(0,Math.floor(Number(c.count)||0)));
    const submitNote=submitParts.length?('<section class="quest-detail-block"><h3>需要提交</h3><p>'+submitParts.join('、')+'（领奖时扣除）</p></section>'):'';
    detail.innerHTML=['<div class="quest-parchment-inner"><p class="quest-detail-kicker">',escaped(label),'</p><h2>',escaped(entry.name),'</h2><div class="quest-parchment-rule"></div><section class="quest-detail-block"><h3>任务目标</h3><p>',escaped(entry.desc),'</p><div class="quest-detail-progress"><i style="width:',pct,'%"></i></div><span>',s.progress,' / ',s.goal,'</span></section><section class="quest-detail-block"><h3>任务说明</h3><p>',escaped(entry.story||entry.desc),'</p></section>',submitNote,'<section class="quest-detail-block quest-detail-rewards"><h3>任务奖励</h3><div>',rewardChips(entry,this.cardDb,this.itemDb),'</div></section><footer class="quest-detail-footer">',action,'</footer></div>'].join('');
    detail.querySelector('.quest-detail-claim')?.addEventListener('click',()=>this.claim(root,entry));
  }
  recordClaim(category,entry,period=questPeriodKey(category)){
    this.state=loadState();
    if(period!==questPeriodKey(category))return false;
    const key=category+'Claimed',id=category==='level'?entry.lv:entry.id;
    this.state[key]??=[];
    if(!this.state[key].some(value=>String(value)===String(id))){
      this.state[key].push(id);
      this.state._extra.totalQuests=(this.state._extra.totalQuests||0)+1;
    }
    saveState(this.state);return true;
  }
  claim(root,entry){
    const s=this.stateFor(entry);if(!s.ready||s.claimed)return;
    if(this.category==='level')this.state.levelClaimed.push(entry.lv);else if(this.category==='achievement')this.state.achievementClaimed.push(entry.id);else this.state[this.category+'Claimed'].push(entry.id);
    const extra=this.state._extra||{};extra.totalQuests=(extra.totalQuests||0)+1;this.state._extra=extra;
    this.grantReward(entry);saveState(this.state);this.onPlayerUpdate?.();audio.playSfx('click');this.toast(root,'领取成功：'+entry.name);this.renderContent(root);
  }
  grantReward(reward){
    if(reward.gold)this.player.gold=(this.player.gold||0)+reward.gold;
    if(reward.gem)this.player.gem=(this.player.gem||0)+reward.gem;
    if(reward.honor)this.player.honor=(this.player.honor||0)+reward.honor;
    if(reward.exp)grantPlayerExp(this.player,reward.exp);
    QuestView._suppressItemGain=true;
    QuestView._suppressCardObtain=true;
    try{
      for(const raw of reward.cards||[]){
        const id=Number(raw?.id??raw);
        const cq=Math.max(1,Math.min(5,Number(raw?.craftQuality)||1));
        this.cardInventory?.addCard(id,0,{craftQuality:cq,strengthLv:0});
      }
      for(const item of reward.items||[])this.inventory?.addItem(item.id,item.count);
      // 2026-10-06：材料提交类任务，领奖后本地同步扣掉（服务端已扣，这里只对齐界面）
      for(const entry of (reward.consumeItems||[])){
        const id=Number(entry?.id);const need=Math.max(0,Math.floor(Number(entry?.count)||0));
        if(Number.isInteger(id)&&id>0&&need>0)this.inventory?.consumeItem?.(id,need);
      }
    }finally{QuestView._suppressItemGain=false;QuestView._suppressCardObtain=false;}
  }
  toast(root,message){const t=root.querySelector('#quest-toast');if(!t)return;t.textContent=message;t.classList.remove('hidden');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.add('hidden'),2200);}
}

// 2026-10-09：任务事件入口挂全局 —— 底层系统用 core/QuestEventBus.js 上报，避免 import 成环。
globalThis.__clbwzQuestDispatch = (event, data) => QuestView.dispatch(event, data);

// ---- 任务运行时桥接：不改背包/战斗核心，只在原型外层补任务事件。 ----
if(!InventoryStore.prototype.__questItemGainPatched){
  const originalAddItem=InventoryStore.prototype.addItem;
  InventoryStore.prototype.addItem=function(itemId,count=1){
    const ok=originalAddItem.call(this,itemId,count);
    if(ok&&!QuestView._suppressItemGain)QuestView.dispatch('item_gain',{itemId:Number(itemId),count:Number(count)||1});
    return ok;
  };
  InventoryStore.prototype.__questItemGainPatched=true;
}

if(!CardInventoryStore.prototype.__questCardMetaPatched){
  const originalUpdateSlot=CardInventoryStore.prototype.updateSlot;
  CardInventoryStore.prototype.updateSlot=function(index,patch){
    const before=this.getSlots?.()[index];
    const beforeStar=Number(before?.star??before?.strengthLv??0);
    const ok=originalUpdateSlot.call(this,index,patch);
    if(ok){
      const after=this.getSlots?.()[index];
      const afterStar=Number(after?.star??after?.strengthLv??0);
      if(afterStar>beforeStar)globalThis.__clbwzQuestLastStrengthStar=afterStar;
    }
    return ok;
  };
  const originalAddCard=CardInventoryStore.prototype.addCard;
  CardInventoryStore.prototype.addCard=function(cardId,star=0,opts={}){
    const result=originalAddCard.call(this,cardId,star,opts);
    if(result?.ok){
      const card=this.cardDb?.getById?.(Number(cardId));
      globalThis.__clbwzQuestLastAddedCardLevel=Number(card?.quality||1);
      // 2026-10-09：「合成或从卡蛋中获得幼小玉米」这类任务要跟踪卡牌入库来源。
      if(!QuestView._suppressCardObtain)QuestView.dispatch('card_obtain',{cardId:Number(cardId),count:1});
    }
    return result;
  };
  CardInventoryStore.prototype.__questCardMetaPatched=true;
}

if(!BattleView.prototype.__questBossResultPatched){
  const originalUpdateResultOverlay=BattleView.prototype.updateResultOverlay;
  BattleView.prototype.updateResultOverlay=function(root){
    const bossId=this.pvp?.bossId??this.boss?.id??null;
    const wasReported=Boolean(this._resultReported);
    const originalQuestEvent=this.onQuestEvent;
    if(bossId&&originalQuestEvent){
      // BOSS战是独立系统：BOSS胜利不能误计为一次野外冒险通关。
      this.onQuestEvent=(event,data)=>{if(event==='adventure_complete')return;originalQuestEvent(event,data);};
    }
    try{originalUpdateResultOverlay.call(this,root);}finally{this.onQuestEvent=originalQuestEvent;}
    if(!wasReported&&this._resultReported&&bossId){
      QuestView.dispatch('boss_challenge',{bossId,count:1});
      if(this.engine?.status==='win'){
        QuestView.dispatch('boss_defeated',{bossId,count:1});
        markBossCleared(bossId,this.pvp?.difficulty??this.boss?.difficulty??'简单');
      }
    }
  };
  BattleView.prototype.__questBossResultPatched=true;
}
