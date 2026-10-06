import { itemIconMarkup } from './ItemIcon.js';
import { audio } from '../core/AudioManager.js';
import { grantPlayerExp } from '../core/PlayerProgression.js';
import { InventoryStore } from '../core/ItemDatabase.js';
import { CardInventoryStore } from '../core/CardInventoryStore.js';
import { BattleView } from './BattleView.js';
import { questPeriodKey } from '../data/QuestPeriods.js';
import { markBossCleared } from '../core/BossProgress.js';
import { MAX_PLAYER_LEVEL, QUEST_GROUPS, ACHIEVEMENT_QUESTS, CATEGORIES, LEVEL_REWARDS } from '../data/QuestCatalog.js';

const STORAGE_KEY = 'clbwz_quest_v8';
const OLD_STORAGE_KEYS = ['clbwz_quest_v7', 'clbwz_quest_v6', 'clbwz_quest_v5', 'clbwz_quest_v4', 'clbwz_quest_v3'];

function todayKey(){return questPeriodKey('daily');}
function weekKey(){return questPeriodKey('weekly');}
function defaultState(){
  return {
    dailyDate:todayKey(),weeklyDate:weekKey(),dailyProgress:{},dailyClaimed:[],weeklyProgress:{},weeklyClaimed:[],
    mainProgress:{},mainClaimed:[],sideProgress:{},sideClaimed:[],achievementProgress:{},achievementClaimed:[],
    challengeProgress:{},challengeClaimed:[],levelClaimed:[],
    _extra:{totalKills:0,totalBattles:0,totalBattleWins:0,totalAdventures:0,totalUpgrades:0,totalStrengthens:0,totalCrafts:0,totalMaterialCombines:0,totalItems:0,totalItemGains:0,totalBossChallenges:0,totalBossDefeats:0,totalNoDeath:0,totalPvpBattles:0,totalPvpWins:0,totalCoopBattles:0,totalQuests:0,totalGold:0,totalHonor:0,loginDays:0,itemGainsById:{},bossChallengesById:{},bossDefeatsById:{},adventureClears:{}},
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
  r._extra.itemGainsById={...(r._extra.itemGainsById??{})};
  r._extra.bossChallengesById={...(r._extra.bossChallengesById??{})};
  r._extra.bossDefeatsById={...(r._extra.bossDefeatsById??{})};
  r._extra.adventureClears={...(r._extra.adventureClears??{})};
  return r;
}
function loadState(){
  try{
    const keys=[STORAGE_KEY,...OLD_STORAGE_KEYS];
    for(const key of keys){const raw=localStorage.getItem(key);if(raw)return normalizeState(JSON.parse(raw));}
  }catch{}
  return defaultState();
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
  for(const id of reward.cards||[]){const n=cardDb?.getById(id)?.name;out.push('<span class="quest-reward-chip">'+rewardIcon('card')+escaped(n&&!brokenText(n)?n:'卡牌 '+id)+'</span>');}
  for(const it of reward.items||[]){const n=itemDb?.getById(it.id)?.name;out.push('<span class="quest-reward-chip">'+itemIconMarkup(it.id,26)+escaped(n&&!brokenText(n)?n:'道具 '+it.id)+' ×'+it.count+'</span>');}
  return out.join('');
}

function dataCount(data){return Math.max(0,Number(data?.count??data?.amount??1)||0);}

function progressDelta(quest,event,data){
  // 综合工坊任务：造卡、强化任一成功都计数。
  if(quest.event==='card_upgrade'&&(event==='card_craft'||event==='card_strengthen'))return dataCount(data)||1;
  if(quest.event==='any')return 1;

  // 收集指定道具：事件记录本次新增；带 lifetimeItemId 的永久任务还会读取长期收集统计。
  if(quest.event==='item_gain'){
    if(event!=='item_gain')return 0;
    if(quest.itemId&&Number(quest.itemId)!==Number(data?.itemId))return 0;
    return dataCount(data);
  }

  // 材料加工只认铁匠铺明确上报的成功事件，避免“加工产物入库”与加工本身重复计数。
  if(quest.event==='material_combine'){
    if(event!=='material_combine')return 0;
    if(quest.materialKind&&data?.materialKind&&quest.materialKind!==data.materialKind)return 0;
    if(quest.materialLevel&&data?.materialLevel&&Number(data.materialLevel)!==Number(quest.materialLevel))return 0;
    return dataCount(data)||1;
  }

  // BOSS挑战与冒险模式严格分开，按BOSS id精确匹配。
  if(quest.event==='boss_challenge'||quest.event==='boss_defeated'){
    if(event!==quest.event)return 0;
    if(quest.bossId&&String(quest.bossId)!==String(data?.bossId??''))return 0;
    return dataCount(data)||1;
  }

  if(quest.event!==event)return 0;

  if(event==='adventure_complete'){
    if(quest.route!=null&&Number(data?.route)!==Number(quest.route))return 0;
    if(quest.adventureIndex!=null&&Number(data?.adventureIndex)!==Number(quest.adventureIndex))return 0;
    if(quest.minAdventureIndex!=null&&Number(data?.adventureIndex||0)<Number(quest.minAdventureIndex))return 0;
    if(quest.challengeOnly&&!data?.challenge)return 0;
    if(quest.finalOnly&&!data?.final)return 0;
    return dataCount(data)||1;
  }

  if(event==='card_strengthen'){
    if(quest.minStar&&Number(data?.star||0)<Number(quest.minStar))return 0;
    return dataCount(data)||1;
  }
  if(event==='card_craft'){
    if(quest.craftLevel&&Number(data?.craftLevel||0)!==Number(quest.craftLevel))return 0;
    return dataCount(data)||1;
  }
  if(event==='gold_gain'||event==='honor_gain'||event==='player_healed'||event==='shop_spend')return Math.max(0,Number(data?.amount||0));
  if(['kill_enemy','card_collect','battle_kill','elite_kill','item_use','team_diversity','quest_complete','discover_secret','mine_collect'].includes(event))return dataCount(data);
  if(event==='battle_duration')return Number(data?.duration||999)<=Number(quest.maxDuration??180)?1:0;
  return dataCount(data)||1;
}

function requirementIds(requires){
  if(!requires)return[];
  return Array.isArray(requires)?requires:[requires];
}
function questComplete(state,category,questId){
  const quest=(QUEST_GROUPS[category]||[]).find((entry)=>String(entry.id)===String(questId));
  if(!quest)return true;
  const claimed=state[category+'Claimed']||[];
  const progress=state[category+'Progress']||{};
  return claimed.some((id)=>String(id)===String(questId))||Number(progress[quest.id]||0)>=Number(quest.goal||0);
}
function requirementsMet(state,category,quest){
  const localOk=requirementIds(quest.requires).every((id)=>questComplete(state,category,id));
  const mainOk=requirementIds(quest.requiresMain).every((id)=>questComplete(state,'main',id));
  return localOk&&mainOk;
}
function cumulativeProgress(quest,state){
  if(quest.cumulativeKey)return Math.max(0,Number(state?._extra?.[quest.cumulativeKey]||0));
  if(quest.lifetimeItemId!=null)return Math.max(0,Number(state?._extra?.itemGainsById?.[String(quest.lifetimeItemId)]||0));
  if(quest.bossChallengeId)return Math.max(0,Number(state?._extra?.bossChallengesById?.[String(quest.bossChallengeId)]||0));
  if(quest.bossDefeatId)return Math.max(0,Number(state?._extra?.bossDefeatsById?.[String(quest.bossDefeatId)]||0));
  if(quest.adventureKey)return Math.max(0,Number(state?._extra?.adventureClears?.[String(quest.adventureKey)]||0));
  return null;
}
function syncCumulativeProgress(state){
  for(const [category,quests] of Object.entries(QUEST_GROUPS)){
    if(category==='achievement')continue;
    const progress=state[category+'Progress']??(state[category+'Progress']={});
    for(const quest of quests){
      if(cumulativeProgress(quest,state)==null||!requirementsMet(state,category,quest))continue;
      progress[quest.id]=Math.min(Number(quest.goal||0),cumulativeProgress(quest,state)??0);
    }
  }
}
function visibleQuests(category,state,allQuests){
  if(category==='daily'||category==='weekly'||category==='achievement')return allQuests;
  return allQuests.filter((entry)=>requirementsMet(state,category,entry));
}

export class QuestView{
  static _suppressItemGain=false;

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
      else if(quest.event==='strengthen_total')ach[quest.id]=Math.min(quest.goal,extra.totalUpgrades||0);
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
        }else if(quest.cumulativeKey){
          after=Math.min(quest.goal,cumulativeProgress(quest,state)??0);
        }else{
          const delta=progressDelta(quest,event,data);
          if(delta)after=Math.min(quest.goal,before+delta);
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
      '<header class="quest-window-title"><h1>任务委托</h1><p>完成主线、支线、日常与BOSS委托，获取金币、经验、荣誉、卡蛋与养成材料</p></header>',
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
    syncCumulativeProgress(this.state);
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
      if(quest.event==='strengthen_total')this.state.achievementProgress[quest.id]=Math.min(quest.goal,extra.totalUpgrades||0);
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
    detail.innerHTML=['<div class="quest-parchment-inner"><p class="quest-detail-kicker">',escaped(label),'</p><h2>',escaped(entry.name),'</h2><div class="quest-parchment-rule"></div><section class="quest-detail-block"><h3>任务目标</h3><p>',escaped(entry.desc),'</p><div class="quest-detail-progress"><i style="width:',pct,'%"></i></div><span>',s.progress,' / ',s.goal,'</span></section><section class="quest-detail-block"><h3>背景故事</h3><p>',escaped(entry.story||entry.desc),'</p></section><section class="quest-detail-block quest-detail-rewards"><h3>任务奖励</h3><div>',rewardChips(entry,this.cardDb,this.itemDb),'</div></section><footer class="quest-detail-footer">',action,'</footer></div>'].join('');
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
    try{
      for(const id of reward.cards||[])this.cardInventory?.addCard(id,0,{craftQuality:1,strengthLv:0});
      for(const item of reward.items||[])this.inventory?.addItem(item.id,item.count);
    }finally{QuestView._suppressItemGain=false;}
  }
  toast(root,message){const t=root.querySelector('#quest-toast');if(!t)return;t.textContent=message;t.classList.remove('hidden');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.add('hidden'),2200);}
}

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
