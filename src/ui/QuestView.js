import { itemIconMarkup } from './ItemIcon.js';
import { audio } from '../core/AudioManager.js';
import { grantPlayerExp } from '../core/PlayerProgression.js';

const STORAGE_KEY = 'clbwz_quest_v5';
import { MAX_PLAYER_LEVEL, QUEST_GROUPS, ACHIEVEMENT_QUESTS, CATEGORIES, LEVEL_REWARDS } from '../data/QuestCatalog.js';

// ============ 工具函数 ============
function todayKey(){return new Date().toISOString().slice(0,10);}
function weekKey(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay()+1);return d.toISOString().slice(0,10);}
function defaultState(){
  return {dailyDate:todayKey(),weeklyDate:weekKey(),dailyProgress:{},dailyClaimed:[],weeklyProgress:{},weeklyClaimed:[],mainProgress:{},mainClaimed:[],sideProgress:{},sideClaimed:[],achievementProgress:{},achievementClaimed:[],challengeProgress:{},challengeClaimed:[],levelClaimed:[],_extra:{totalKills:0,totalBattles:0,totalAdventures:0,totalUpgrades:0,totalItems:0,totalQuests:0,totalGold:0,totalHonor:0,loginDays:0}};
}
function normalizeState(state){
  const r={...defaultState(),...state};
  if(r.dailyDate!==todayKey()){r.dailyDate=todayKey();r.dailyProgress={};r.dailyClaimed=[];}
  if(r.weeklyDate!==weekKey()){r.weeklyDate=weekKey();r.weeklyProgress={};r.weeklyClaimed=[];}
  r.levelClaimed=r.levelClaimed??r.planClaimed??[];
  r.achievementProgress=r.achievementProgress??{};
  r.achievementClaimed=r.achievementClaimed??[];
  r.challengeProgress=r.challengeProgress??{};
  r.challengeClaimed=r.challengeClaimed??[];
  r.weeklyProgress=r.weeklyProgress??{};
  r.weeklyClaimed=r.weeklyClaimed??[];
  r._extra=r._extra??{totalKills:0,totalBattles:0,totalAdventures:0,totalUpgrades:0,totalItems:0,totalQuests:0,totalGold:0,totalHonor:0,loginDays:0};
  return r;
}
function loadState(){
  try{const raw=localStorage.getItem(STORAGE_KEY)||localStorage.getItem('clbwz_quest_v4')||localStorage.getItem('clbwz_quest_v3');if(raw)return normalizeState(JSON.parse(raw));}catch{}
  return defaultState();
}
function saveState(state){localStorage.setItem(STORAGE_KEY,JSON.stringify(normalizeState(state)));}
function escaped(v){var s=String(v??'');return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function brokenText(v){return /[?]/.test(String(v??''));}
function rewardIcon(k){return'<i class="quest-reward-icon '+k+'" aria-hidden="true"></i>';}
function rewardChips(reward,cardDb,itemDb){
  const s=[];
  if(reward.gold)s.push('<span class="quest-reward-chip">'+rewardIcon('gold')+'金币 '+reward.gold+'</span>');
  if(reward.gem)s.push('<span class="quest-reward-chip">'+rewardIcon('gem')+'钻石 '+reward.gem+'</span>');
  if(reward.honor)s.push('<span class="quest-reward-chip">'+rewardIcon('honor')+'荣誉 '+reward.honor+'</span>');
  if(reward.exp)s.push('<span class="quest-reward-chip">'+rewardIcon('exp')+'经验 '+reward.exp+'</span>');
  for(const id of reward.cards||[]){const n=cardDb?.getById(id)?.name;s.push('<span class="quest-reward-chip">'+rewardIcon('card')+escaped(n&&!brokenText(n)?n:'卡牌 '+id)+'</span>');}
  for(const it of reward.items||[]){const n=itemDb?.getById(it.id)?.name;s.push('<span class="quest-reward-chip">'+itemIconMarkup(it.id,26)+escaped(n&&!brokenText(n)?n:'道具 '+it.id)+' ×'+it.count+'</span>');}
  return s.join('');
}
function progressDelta(quest,event,data){
  if(quest.event==='card_upgrade'&&(event==='card_craft'||event==='card_strengthen'))return 1;
  if(quest.event==='any')return 1;
  if(quest.event!==event)return 0;
  if(event==='gold_gain')return Math.max(0,Number(data?.amount||0));
  if(event==='honor_gain')return Math.max(0,Number(data?.amount||0));
  if(event==='kill_enemy'||event==='card_collect'||event==='battle_kill'||event==='elite_kill'||event==='item_use'||event==='team_diversity'||event==='quest_complete'||event==='discover_secret')return Math.max(0,Number(data?.count||1));
  if(event==='battle_duration'){
    const dur=Number(data?.duration||999);
    return dur<=quest.goal?1:0;
  }
  return 1;
}

// ============ 可见任务过滤(前置条件) ============
function visibleQuests(category, claimedIds, allQuests) {
  if(category==='daily'||category==='weekly'||category==='challenge') return allQuests;
  const result=[];
  for(const q of allQuests){
    if(!q.requires){result.push(q);continue;}
    if(claimedIds.includes(q.requires)) result.push(q);
  }
  return result;
}

export class QuestView{
  constructor(cardDb,cardInventory,player,{onPlayerUpdate,itemDb,inventory}={}){
    this.cardDb=cardDb;this.cardInventory=cardInventory;
    this.player=player;this.onPlayerUpdate=onPlayerUpdate;
    this.itemDb=itemDb;this.inventory=inventory;
    this.state=loadState();
    this.category='main';this.selected={main:null,side:null,daily:null,achievement:null,level:null};
  }
  static dispatch(event,data){
    const state=loadState();
    let changed=false;
    const completed=[];
    const extra=state._extra||{};
    // auto-track totals
    if(event==='kill_enemy')extra.totalKills=(extra.totalKills||0)+Math.max(0,Number(data?.count||1));
    if(event==='battle_complete')extra.totalBattles=(extra.totalBattles||0)+1;
    if(event==='adventure_complete')extra.totalAdventures=(extra.totalAdventures||0)+1;
    if(event==='card_craft'||event==='card_strengthen'||event==='card_upgrade')extra.totalUpgrades=(extra.totalUpgrades||0)+1;
    if(event==='item_use')extra.totalItems=(extra.totalItems||0)+(data?.count||1);
    if(event==='quest_complete')extra.totalQuests=(extra.totalQuests||0)+1;
    if(event==='gold_gain')extra.totalGold=(extra.totalGold||0)+Math.max(0,Number(data?.amount||0));
    if(event==='honor_gain')extra.totalHonor=(extra.totalHonor||0)+Math.max(0,Number(data?.amount||0));
    state._extra=extra;changed=true;

    // Achievement progress from totals
    const ach=state.achievementProgress={};
    for(const q of ACHIEVEMENT_QUESTS){
      if(state.achievementClaimed?.includes(q.id))continue;
      if(q.event==='level'){ach[q.id]=state._lastPlayerLevel||1;changed=true;continue;}
      if(q.event==='kill_total'){ach[q.id]=Math.min(q.goal,extra.totalKills||0);changed=true;continue;}
      if(q.event==='card_total'){ach[q.id]=Math.min(q.goal,state._lastCardCount||0);changed=true;continue;}
      if(q.event==='gold_total'){ach[q.id]=Math.min(q.goal,extra.totalGold||0);changed=true;continue;}
      if(q.event==='honor_total'){ach[q.id]=Math.min(q.goal,extra.totalHonor||0);changed=true;continue;}
      if(q.event==='battle_total'){ach[q.id]=Math.min(q.goal,extra.totalBattles||0);changed=true;continue;}
      if(q.event==='adventure_total'){ach[q.id]=Math.min(q.goal,extra.totalAdventures||0);changed=true;continue;}
      if(q.event==='strengthen_total'){ach[q.id]=Math.min(q.goal,extra.totalUpgrades||0);changed=true;continue;}
      if(q.event==='item_total'){ach[q.id]=Math.min(q.goal,extra.totalItems||0);changed=true;continue;}
      if(q.event==='achieve_total'){
        const cnt=ACHIEVEMENT_QUESTS.filter(aq=>aq.id!==q.id&&state.achievementClaimed.includes(aq.id)).length;
        ach[q.id]=cnt;changed=true;continue;
      }
    }
    state.achievementProgress=ach;

    // Regular quests
    for(const [cat,quests] of Object.entries(QUEST_GROUPS)){
      if(cat==='achievement')continue;
      const pk=cat+'Progress',ck=cat+'Claimed';
      for(const q of quests){
        if((state[ck]||[]).includes(q.id))continue;
        // prerequisite check (except daily)
        if(q.requires&&cat!=='daily'){
          if(!(state[ck]||[]).includes(q.requires))continue;
        }
        const delta=progressDelta(q,event,data);
        if(!delta)continue;
        if(!state[pk])state[pk]={};
        const before=state[pk][q.id]||0;
        const after=Math.min(q.goal,before+delta);
        state[pk][q.id]=after;
        if(before<q.goal&&after>=q.goal)completed.push({category:cat,quest:q});
        changed=true;
      }
    }
    if(changed)saveState(state);
    if(typeof window!=='undefined'){
      for(const d of completed){window.dispatchEvent(new CustomEvent('clbwz:quest-complete',{detail:d}));}
    }
    return completed;
  }

  render(root){
    this._questEvents?.abort();
    this._questEvents=new AbortController();
    window.addEventListener('clbwz:quest-complete',()=>{
      if(root.isConnected && root.querySelector('.quest-page'))this.renderContent(root);
      else this._questEvents.abort();
    },{signal:this._questEvents.signal});
    root.innerHTML=[
      '<div class="page quest-page quest-page-formal"><div class="quest-window">',
      '<header class="quest-window-title"><h1>任务委托</h1><p>完成各类委托获取金币、钻石、荣誉、卡牌与道具奖励　｜　前置任务需先完成</p></header>',
      '<div class="quest-workspace"><aside class="quest-category-rail" id="quest-category-rail"></aside>',
      '<section class="quest-list-panel"><div class="quest-list-panel-head"><h2 id="quest-list-title"></h2><span id="quest-list-meta"></span></div><div id="quest-list" class="quest-list"></div></section>',
      '<section id="quest-detail" class="quest-detail-parchment"></section></div></div><p id="quest-toast" class="bag-toast hidden"></p></div>',
    ].join('');
    root.querySelector('#quest-category-rail').innerHTML=CATEGORIES.map(c=>'<button type="button" class="quest-category-btn" data-category="'+c.id+'"><strong>'+c.label+'</strong><small>'+c.subtitle+'</small></button>').join('');
    root.querySelectorAll('.quest-category-btn').forEach(b=>b.addEventListener('click',()=>{audio.playSfx('click');this.category=b.dataset.category;this.renderContent(root);}));
    this.renderContent(root);
  }

  entries(){
    if(this.category==='level')return LEVEL_REWARDS;
    const raw=QUEST_GROUPS[this.category]||[];
    if(this.category==='daily'||this.category==='weekly'||this.category==='achievement'||this.category==='challenge')return raw;
    const claimed=this.state[this.category+'Claimed']||[];
    return visibleQuests(this.category,claimed,raw);
  }
  stateFor(entry){
    if(this.category==='level'){
      const p=Math.min(MAX_PLAYER_LEVEL,this.player.level||1);
      return{progress:p,goal:entry.lv,claimed:this.state.levelClaimed.includes(entry.lv),ready:p>=entry.lv};
    }
    if(this.category==='achievement'){
      const p=this.state.achievementProgress?.[entry.id]||0;
      return{progress:p,goal:entry.goal,claimed:this.state.achievementClaimed?.includes(entry.id),ready:p>=entry.goal};
    }
    const pk=this.category+'Progress',ck=this.category+'Claimed';
    return{progress:(this.state[pk]||{})[entry.id]||0,goal:entry.goal,claimed:(this.state[ck]||[]).includes(entry.id),ready:((this.state[pk]||{})[entry.id]||0)>=entry.goal};
  }
  selectedEntry(entries){
    const sid=this.selected[this.category];
    let e=entries.find(x=>String(x.id)===String(sid));
    if(!e){e=entries[0];this.selected[this.category]=e?.id??null;}
    return e;
  }
  renderContent(root){
    this.state=loadState();
    // update achievement from extra stats
    const ex=this.state._extra||{};
    for(const q of ACHIEVEMENT_QUESTS){
      if(this.state.achievementClaimed?.includes(q.id))continue;
      if(q.event==='level')this.state.achievementProgress[q.id]=this.player.level||1;
      if(q.event==='kill_total')this.state.achievementProgress[q.id]=Math.min(q.goal,ex.totalKills||0);
      if(q.event==='card_total')this.state.achievementProgress[q.id]=Math.min(q.goal,this.cardInventory?.count?.()||0);
      if(q.event==='gold_total')this.state.achievementProgress[q.id]=Math.min(q.goal,ex.totalGold||0);
      if(q.event==='honor_total')this.state.achievementProgress[q.id]=Math.min(q.goal,ex.totalHonor||0);
      if(q.event==='battle_total')this.state.achievementProgress[q.id]=Math.min(q.goal,ex.totalBattles||0);
      if(q.event==='adventure_total')this.state.achievementProgress[q.id]=Math.min(q.goal,ex.totalAdventures||0);
      if(q.event==='strengthen_total')this.state.achievementProgress[q.id]=Math.min(q.goal,ex.totalUpgrades||0);
      if(q.event==='item_total')this.state.achievementProgress[q.id]=Math.min(q.goal,ex.totalItems||0);
      if(q.event==='achieve_total'){
        const cnt=ACHIEVEMENT_QUESTS.filter(aq=>aq.id!==q.id&&this.state.achievementClaimed.includes(aq.id)).length;
        this.state.achievementProgress[q.id]=cnt;
      }
    }
    // save level to state
    this.state._lastPlayerLevel=this.player.level||1;
    this.state._lastCardCount=this.cardInventory?.count?.()||0;
    saveState(this.state);

    const entries=[...this.entries()].sort((a,b)=>{
      const sa=this.stateFor(a),sb=this.stateFor(b);
      return Number(sa.claimed)-Number(sb.claimed)||Number(sb.ready)-Number(sa.ready);
    });
    const selected=this.selectedEntry(entries);
    const cat=CATEGORIES.find(c=>c.id===this.category);
    root.querySelectorAll('.quest-category-btn').forEach(b=>b.classList.toggle('active',b.dataset.category===this.category));
    root.querySelector('#quest-list-title').textContent=cat?.label||'任务';
    const active=entries.filter(e=>!this.stateFor(e).claimed);
    root.querySelector('#quest-list-meta').textContent=this.category==='daily'?todayKey()+' 重置':this.category==='weekly'?weekKey()+' 周重置':active.length+' / '+entries.length+' 项';

    const list=root.querySelector('#quest-list');
    const renderItem=(entry,i)=>{
      const s=this.stateFor(entry);
      const pct=Math.min(100,s.progress/Math.max(s.goal,1)*100);
      const sc=String(entry.id)===String(selected?.id)?' selected':'';
      const sl=s.claimed?'已领取':s.ready?'可领取':s.progress+' / '+s.goal;
      return`<button type="button" class="quest-list-item ${sc}${s.claimed?' claimed':''}" data-entry="${entry.id}">
        <span class="quest-list-icon quest-icon-${i%6}"></span>
        <span class="quest-list-copy"><strong>${escaped(entry.name)}</strong>
        <span>${escaped(entry.desc)}</span>
        <span class="quest-list-progress"><i style="width:${pct}%"></i></span></span>
        <em class="quest-list-state ${s.claimed?'claimed':s.ready?'ready':''}">${sl}</em>
      </button>`;
    };
    const completed=entries.filter(e=>this.stateFor(e).claimed);
    let html=active.map((e,i)=>renderItem(e,i)).join('');
    if(completed.length){html+='<div class="quest-list-section-sep">已完成</div>'+completed.map((e,i)=>renderItem(e,i)).join('');}
    list.innerHTML=html;
    list.querySelectorAll('.quest-list-item').forEach(b=>b.addEventListener('click',()=>{audio.playSfx('click');this.selected[this.category]=b.dataset.entry;this.renderContent(root);}));
    this.renderDetail(root,selected);
  }
  renderDetail(root,entry){
    const detail=root.querySelector('#quest-detail');
    if(!entry){detail.innerHTML='<div class="quest-parchment-empty">选择一个任务查看详情</div>';return;}
    const s=this.stateFor(entry);
    const pct=Math.min(100,s.progress/Math.max(s.goal,1)*100);
    const action=s.claimed?'<span class="quest-detail-claimed">已领取</span>':s.ready?'<button type="button" class="quest-claim-btn quest-detail-claim" data-entry="'+entry.id+'">领取奖励</button>':'<span class="quest-detail-locked">继续完成</span>';
    detail.innerHTML=[
      '<div class="quest-parchment-inner"><p class="quest-detail-kicker">',this.category==='level'?'成长计划':this.category==='achievement'?'里程碑':'任务委托','</p>',
      '<h2>',escaped(entry.name),'</h2><div class="quest-parchment-rule"></div>',
      '<section class="quest-detail-block"><h3>任务目标</h3><p>',escaped(entry.desc),'</p>',
      '<div class="quest-detail-progress"><i style="width:',pct,'%"></i></div><span>',s.progress,' / ',s.goal,'</span></section>',
      '<section class="quest-detail-block"><h3>背景故事</h3><p>',escaped(entry.story||entry.desc),'</p></section>',
      '<section class="quest-detail-block quest-detail-rewards"><h3>任务奖励</h3><div>',rewardChips(entry,this.cardDb,this.itemDb),'</div></section>',
      '<footer class="quest-detail-footer">',action,'</footer></div>',
    ].join('');
    detail.querySelector('.quest-detail-claim')?.addEventListener('click',()=>this.claim(root,entry));
  }
  claim(root,entry){
    const s=this.stateFor(entry);
    if(!s.ready||s.claimed)return;
    if(this.category==='level')this.state.levelClaimed.push(entry.lv);
    else if(this.category==='achievement')this.state.achievementClaimed.push(entry.id);
    else this.state[this.category+'Claimed'].push(entry.id);
    // Track quest completion for s38-s40
    const ex=this.state._extra||{};ex.totalQuests=(ex.totalQuests||0)+1;this.state._extra=ex;
    this.grantReward(entry);
    saveState(this.state);
    this.onPlayerUpdate?.();
    audio.playSfx('click');
    this.toast(root,'领取成功：'+entry.name);
    this.renderContent(root);
  }
  grantReward(reward){
    if(reward.gold)this.player.gold=(this.player.gold||0)+reward.gold;
    if(reward.gem)this.player.gem=(this.player.gem||0)+reward.gem;
    if(reward.honor)this.player.honor=(this.player.honor||0)+reward.honor;
    if(reward.exp)grantPlayerExp(this.player,reward.exp);
    for(const id of reward.cards||[])this.cardInventory?.addCard(id,0,{craftQuality:1,strengthLv:0});
    for(const it of reward.items||[])this.inventory?.addItem(it.id,it.count);
  }
  toast(root,message){
    const t=root.querySelector('#quest-toast');
    if(!t)return;
    t.textContent=message;t.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer=setTimeout(()=>t.classList.add('hidden'),2200);
  }
}
