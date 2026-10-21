import { authStore } from '../core/AuthStore.js';
import { EndlessRunStore } from '../core/EndlessRunStore.js';
import { loadBattleDeckSlots20260911 } from './DeckGroupPreference20260911.js';
import { EndlessRoomView } from './EndlessRoomView.js';
import { ENDLESS_NAMES, STARTER_TEAMS, RUN_ITEMS, RUN_CONTRACTS, EVENT_LABELS, createEndlessRun, buildEndlessEncounter,
  runModifiers, runRoutes, chooseRunRoute, runEventChoices, resolveRunEvent, swapRunCard, leaveRunCamp,
  beginRunBattle, settleRunBattle, repairTrialCamp, swapRunOwnedCard,
  runScout, runContractChoices, chooseRunContract, runBountyChoices, chooseRunBounty, runContractModifiers } from '../data/EndlessAdventureRules.js';
import './EndlessAdventureView.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const owner = () => authStore.user?.id ?? authStore.snapshot?.profile?.userId;
const PHASE_NAMES = { ready: '准备战斗', route: '选择路线', event: '处理事件', camp: '整备营地', contract: '十层契约', battle: '战斗未结算', ended: '挑战结束' };


export class EndlessAdventureView {
  constructor(db, cardInventory, { mode = 'trial', onNavigate } = {}) {
    this.db = db; this.cardInventory = cardInventory; this.mode = mode in ENDLESS_NAMES ? mode : 'trial';
    this.onNavigate = onNavigate; this.notice = ''; this.child = null; this.closed = false;
    try { this.store = new EndlessRunStore(owner(), { currentOwner: owner }); }
    catch (error) { this.notice = error.message; }
    this.onOwnerChange = () => { this.destroy(); this.onNavigate?.('worldmap', { returnToPort: true }); };
    window.addEventListener('clbwz:player-changed', this.onOwnerChange);
  }
  load() { return this.store?.read().runs[this.mode] ?? null; }
  commit(run) { this.store.save(run); this.run = run; }
  card(uid) { return this.run.roster.find(card => card.uid === uid); }
  cardName(instance) { return this.db.getById(instance?.cardId)?.name || `卡牌 ${instance?.cardId}`; }
  portrait(instance, extra = '') {
    const card = this.db.getById(instance?.cardId);
    const stars = Number(instance?.strengthLv ?? instance?.star) || 0;
    const tint = ['','#92947e','#59915f','#43859f','#8567a8','#b6a359'][card?.quality || 1];
    return `<span class="endless-card ${extra}" style="--card-tint:${tint}"><span class="endless-card-stars">${stars?'★'.repeat(Math.min(10,stars)):''}</span><img loading="lazy" src="/sprites/cards/${escape(card?.spriteRes || '1')}.png" alt=""><span>${escape(card?.name || '未知卡牌')}</span><small>${stars} 星 · ${['','','普通','精良','优秀','完美'][instance?.craftQuality || 2] || '普通'}</small></span>`;
  }
  act(fn) {
    if (this.closed) return;
    try { this.store?.assertOwner(); fn(); this.notice = ''; }
    catch (error) { this.notice = error.message; }
    this.render(this.root);
  }
  render(root) {
    if (this.closed) return;
    this.root = root;
    try { this.run = this.load(); } catch (error) { this.notice = error.message; this.run = null; }
    const run = this.run;
    root.innerHTML = `<section class="endless-page"><header class="endless-header"><div><small>野外冒险 / 单人玩法</small><h1>${ENDLESS_NAMES[this.mode]}</h1></div><button data-home>返回野外冒险</button></header>
      <nav class="endless-tabs">${Object.entries(ENDLESS_NAMES).map(([id,name])=>`<button data-mode="${id}" class="${id===this.mode?'selected':''}">${name}</button>`).join('')}</nav>
      <p class="endless-safety">单人首版 · 本机按账号保存 · 卡牌/道具/远征币仅本局有效，不扣永久资产、不计正式排行或主线奖励。刷新会从未结算的本层开头重进。</p>
      ${this.notice?`<p role="alert" class="endless-error">${escape(this.notice)}</p>`:''}
      ${run?this.runMarkup(run):this.startMarkup()}
      <details class="endless-help"><summary>规则与后续玩法点子</summary><p>试炼：混合植物与怪物，每层提高数量和强度，10 层出现精英；通关 5/10/15…层后，可换 1 张上阵卡。场上敌军最多 24 个，其余排队进场。</p><p>远征：最多连续经过两个非战斗节点；每第五节点保证战斗。已揭晓事件不会因刷新重抽；每个奖励只领一次。基地损伤会延续到下一场。</p><p>契约：每通过 10 场必选一项敌方挑战（移速/远程/回复），立刻获得远征币；契约可叠加并有封顶。</p><p>赏金：每场开战前可选一项（无瑕防线 / 三路并进 / 精兵简政），达成额外给远征币，失败无惩罚。</p><p>侦察：营地与远征路线页会预告下一段五层区间的主力敌军与精英层。</p><p>后续候选（未实装）：撤退保险、每周同种子竞速、双人路线投票。</p></details></section>`;
    root.querySelector('[data-home]').onclick = () => this.onNavigate?.('worldmap', { returnToPort: true });
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      this.mode = b.dataset.mode; this.notice = ''; this.campSlot = 0;
      this.campPage = 0; this.campSearch = ''; this.selectedCampCard = null; this.render(root);
    });
    root.querySelectorAll('[data-start]').forEach(b => b.onclick = () => this.act(() => this.start(b.dataset.start)));
    root.querySelector('[data-end]')?.addEventListener('click', () => {
      if (window.confirm('结束这次挑战？本局卡牌、道具和远征币不会进入永久背包。')) this.act(() => this.commit({ ...this.run, phase: 'ended', attempt: null }));
    });
    root.querySelector('[data-battle]')?.addEventListener('click', () => this.launchBattle());
    root.querySelectorAll('[data-route]').forEach(b => b.onclick = () => this.act(() => this.commit(chooseRunRoute(this.run,b.dataset.route))));
    root.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => this.act(() => {
      const pool = this.db.getCollectibleCards().filter(c => c.quality <= Math.min(5, 2+Math.floor(this.run.battles/3))).map(c=>c.id);
      this.commit(resolveRunEvent(this.run,b.dataset.choice,pool));
    }));
    root.querySelector('[data-prepare]')?.addEventListener('click', () => this.act(() => {
      if (this.run.mode !== 'trial' || this.run.phase !== 'ready' || this.run.cleared !== 0) return;
      this.selectedCampCard = null; this.campSlot = 0;
      this.commit({...this.run,phase:'camp',initialSetup:true,swapsLeft:10});
    }));
    root.querySelectorAll('[data-slot-button]').forEach(b=>b.onclick=()=>{this.campSlot=Number(b.dataset.slotButton);this.render(root);});
    root.querySelectorAll('[data-camp-card]').forEach(b=>b.onclick=()=>{
      this.selectedCampCard=b.dataset.campCard;
      const scroll=root.querySelector('.endless-page')?.scrollTop||0;
      this.render(root);root.querySelector('.endless-page').scrollTop=scroll;
    });
    root.querySelectorAll('[data-camp-page]').forEach(b=>b.onclick=()=>{this.campPage=Number(b.dataset.campPage);this.render(root);});
    const search=()=>{this.campSearch=root.querySelector('[data-camp-search]').value.trim();this.campPage=0;this.render(root);};
    root.querySelector('[data-camp-filter]')?.addEventListener('click',search);
    root.querySelector('[data-camp-search]')?.addEventListener('keydown',e=>{if(e.key==='Enter')search();});
    root.querySelector('[data-swap]')?.addEventListener('click', () => this.act(() => {
      const candidate=this.campCandidates?.find(c=>c.key===this.selectedCampCard);
      if(!candidate)throw new Error('请先选择替换卡槽和一张卡牌');
      const index=this.campSlot||0;
      if(this.run.mode==='trial') {
        const live=this.cardInventory.getSlots()[candidate.bagIndex];
        if(JSON.stringify(live)!==candidate.fingerprint || (live.expiresAt && live.expiresAt<=Date.now()))throw new Error('背包已变化，请重新选择卡牌');
        if(this.run.deck.some((uid,i)=>i!==index&&this.card(uid)?._ownedKey===candidate.key))throw new Error('这张背包卡已在本局其他卡槽上阵');
        this.commit(swapRunOwnedCard(this.run,index,{...live,_ownedKey:candidate.key}));
      } else this.commit(swapRunCard(this.run,index,candidate.key));
      this.selectedCampCard=null;
    }));
    root.querySelector('[data-leave-camp]')?.addEventListener('click', () => this.act(() => this.commit(leaveRunCamp(this.run))));
    root.querySelector('[data-repair]')?.addEventListener('click', () => this.act(() => this.commit(repairTrialCamp(this.run))));
    // 第二批：十层契约（必选一项）与开战前可选赏金（可取消）。
    root.querySelectorAll('[data-contract]').forEach(b => b.onclick = () => this.act(() => this.commit(chooseRunContract(this.run, b.dataset.contract))));
    root.querySelectorAll('[data-bounty]').forEach(b => b.onclick = () => this.act(() => this.commit(chooseRunBounty(this.run, b.dataset.bounty))));
    root.querySelector('[data-bounty-clear]')?.addEventListener('click', () => this.act(() => this.commit(chooseRunBounty(this.run, null))));
  }
  campMarkup(run) {
    const trial=run.mode==='trial', index=Math.max(0,Math.min(this.campSlot||0,run.deck.length-1));
    this.campSlot=index;
    const pool=trial?this.cardInventory.getSlots().flatMap((slot,i)=>{
      if(!slot||!this.db.getById(slot.cardId)?.isCollectible?.()||(slot.expiresAt&&slot.expiresAt<=Date.now()))return [];
      return [{key:`bag:${i}`,bagIndex:i,slot:JSON.parse(JSON.stringify(slot)),fingerprint:JSON.stringify(slot)}];
    }):run.roster.filter(c=>!run.deck.includes(c.uid)).map(slot=>({key:slot.uid,slot}));
    this.campCandidates=pool;
    const search=String(this.campSearch||'').toLowerCase();
    const filtered=pool.filter(c=>`${this.cardName(c.slot)} ${c.slot.cardId}`.toLowerCase().includes(search));
    const pages=Math.max(1,Math.ceil(filtered.length/24));this.campPage=Math.max(0,Math.min(this.campPage||0,pages-1));
    if(!filtered.some(c=>c.key===this.selectedCampCard))this.selectedCampCard=filtered[0]?.key||null;
    const selected=pool.find(c=>c.key===this.selectedCampCard);
    return `<article class="endless-panel endless-camp"><div class="endless-section-heading"><div><small>阵容整备</small><h2>${run.initialSetup?'出发前调整战团':`整备营地 · 剩余 ${run.swapsLeft} 次换卡`}</h2></div><button data-leave-camp class="primary">完成整备 →</button></div>
      <p>${trial?'选择一个上阵卡槽，再从你背包的全部有效卡牌中替换。不限当前战团，保留品质与强化；原卡不会被消耗。':'从本局获得的储备卡中选择替换。新卡可通过奖励事件和商店获得。'}</p>
      <div class="endless-deck-picker">${run.deck.map((uid,i)=>`<button data-slot-button="${i}" aria-pressed="${index===i}" class="${index===i?'selected':''}"><b>卡槽 ${i+1}</b>${this.portrait(this.card(uid))}</button>`).join('')}</div>
      <div class="endless-camp-toolbar"><h3>${trial?'我的全部背包':'本局储备'} <small>${pool.length} 张</small></h3><label>查找卡牌 <input data-camp-search value="${escape(this.campSearch||'')}" placeholder="名称 / ID"></label><button data-camp-filter>查找</button></div>
      <div class="endless-card-picker">${filtered.slice(this.campPage*24,this.campPage*24+24).map(c=>`<button data-camp-card="${c.key}" aria-pressed="${c.key===this.selectedCampCard}" class="${c.key===this.selectedCampCard?'selected':''}">${this.portrait(c.slot)}</button>`).join('')||'<p>没有符合条件的卡牌。</p>'}</div>
      <div class="endless-camp-footer"><div><button data-camp-page="${this.campPage-1}" ${this.campPage===0?'disabled':''}>上一页</button><span>${this.campPage+1} / ${pages}</span><button data-camp-page="${this.campPage+1}" ${this.campPage+1>=pages?'disabled':''}>下一页</button></div><button class="primary" data-swap ${run.swapsLeft&&selected?'':'disabled'}>用${selected?'「'+escape(this.cardName(selected.slot))+'」':'所选卡'}替换卡槽 ${index+1}</button></div>
      ${trial&&!run.initialSetup?`<button data-repair ${run.campRepaired||run.gold<40||run.baseHp>=run.baseMaxHp?'disabled':''}>40 远征币 · 基地修复 +200（本营地一次）</button>`:''}</article>`;
  }
  startMarkup() {
    return `<div class="endless-intro"><h2>${this.mode==='trial'?'一层一阵，看看你能走多远':'每条路线，都是一次取舍'}</h2><p>${this.mode==='trial'?'递增敌军、混合阵容、五层整备。':'奖励、随机遭遇、交易、陷阱与战斗；卡牌和道具共同改变本局打法。'}</p></div>
      <div class="endless-start-grid">${STARTER_TEAMS.map(t=>`<article><h3>${t.name}</h3><div class="endless-cards">${t.cards.map(id=>this.portrait({cardId:id})).join('')}</div><button data-start="${t.id}" ${this.store?'':'disabled'}>以这套借用卡组启程</button></article>`).join('')}
      <article><h3>携带自己的卡组</h3><p>复制当前选中战团。保留已有品质与星级，但不移动、消耗或改写原卡。与标准借用卡组分开记录本机最佳成绩。</p><button data-start="owned" ${this.store?'':'disabled'}>复制当前战团启程</button></article></div>`;
  }
  start(starter) {
    let ownedDeck=[],ownedReserve=[];
    if (starter==='owned') {
      const slots=this.cardInventory.getSlots();
      const available=c=>c&&this.db.getById(c.cardId)?.isCollectible?.()&&(!c.expiresAt||c.expiresAt>Date.now());
      const selected=loadBattleDeckSlots20260911(this.cardInventory,this.db);
      ownedDeck=selected.map(i=>Number.isInteger(i)?slots[i]:slots.find(c=>available(c)&&c.cardId===i?.cardId)).filter(available);
      const used=new Set(ownedDeck);ownedReserve=slots.filter(c=>available(c)&&!used.has(c));
      ownedDeck=ownedDeck.map(c=>({...c,_ownedKey:`bag:${slots.indexOf(c)}`}));
      if(!ownedDeck.length)throw new Error('当前战团没有可用卡牌，请先在准备房间保存一套卡组');
    }
    const seed=globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random()}`;
    this.commit(createEndlessRun({mode:this.mode,seed,starter,ownedDeck,ownedReserve}));
  }
  runMarkup(run) {
    const bonus=runModifiers(run),best=this.store.read().best[`${this.mode}:${run.source==='owned'?'owned':'standard'}`]||0;
    const completedInBand=run.cleared%5, bandStart=Math.floor(run.cleared/5)*5+1;
    const progress=run.mode==='trial'&&run.phase!=='ended'?`<div class="endless-progress"><div><b>下一次整备 · 通关第 ${bandStart+4} 层</b><small>每 5 层可从自己的全部背包换 1 张卡</small></div><ol aria-label="本段五层进度">${Array.from({length:5},(_,i)=>`<li class="${i<completedInBand?'done':i===completedInBand?'current':''}"><span>${i<completedInBand?'✓':bandStart+i}</span><small>${i===4?'营地':'战斗'}</small></li>`).join('')}</ol></div>`:'';
    const header=`<div class="endless-stats"><span>已过 ${run.cleared} 战</span><span>基地 ${run.baseHp}/${run.baseMaxHp}</span><span>远征币 ${run.gold}（仅本局）</span><span>${PHASE_NAMES[run.phase]}</span><span>契约 ${(run.contracts||[]).length} 项</span><span>本机最佳 ${best} 战</span></div>`;
    let body='';
    const prepare=run.mode==='trial'&&run.phase==='ready'&&run.cleared===0
      ? '<button data-prepare>调整战团 · 从背包换卡</button>' : '';
    if(run.phase==='ended')body=`<article class="endless-panel"><h2>本次挑战结束</h2><p>完成 ${run.cleared} 场战斗。没有扣除永久卡牌，也没有发放局外奖励。</p></article>${this.startMarkup()}`;
    else if(run.phase==='contract')body=this.contractMarkup(run);
    else if(run.phase==='route')body=`<h2>第 ${run.step} 个节点 · 选择路线</h2><div class="endless-routes">${runRoutes(run).map(r=>`<button data-route="${r.id}" class="event-${r.kind}"><strong>${r.title}</strong><small>${{battle:'查看敌军并进入战斗',reward:'获得本局补给、道具或卡牌',random:'45% 奖励 / 35% 中性 / 20% 负面',neutral:'有代价的交易，也可以离开',negative:'支付代价，避免更大损失',swap:'从储备中替换一张上阵卡',shop:'使用远征币购买卡牌或道具'}[r.kind]}</small></button>`).join('')}</div>${this.scoutMarkup(run)}`;
    else if(run.phase==='camp') {
      body=this.campMarkup(run)+this.scoutMarkup(run);
    } else if(run.phase==='event')body=`<article class="endless-panel"><h2>${run.event.random?'随机揭晓 · ':''}${EVENT_LABELS[run.event.kind]}</h2><div class="endless-event-actions">${runEventChoices(run).map(c=>`<button data-choice="${c.id}" ${c.disabled?'disabled':''}>${escape(c.title)}</button>`).join('')}</div><p>商店的每件商品限购一次。新卡进入储备，需在换卡节点上阵。</p></article>`;
    else {
      const fight=buildEndlessEncounter(run,this.db),counts=new Map();for(const row of fight.roster)counts.set(row.cardId,(counts.get(row.cardId)||0)+1);
      body=`<article class="endless-panel"><h2>${escape(fight.title)}</h2><p>敌军共 ${fight.total} 张 · 同时在场上限 ${fight.aliveCap} · 敌方攻击 ×${fight.atkScale.toFixed(2)} / 生命 ×${fight.hpScale.toFixed(2)}</p><div class="endless-cards">${[...counts].map(([id,count])=>`<div>${this.portrait({cardId:id})}<b>×${count}</b></div>`).join('')}</div><p>清除全部敌军或击破敌方基地即获胜；基地归零或超过 7 分钟失败。无英雄主动技能与局外天赋加成。</p><div class="endless-battle-actions">${prepare}<button class="primary" data-battle>${run.phase==='battle'?'从本层开头重新进入':'进入战斗'}</button></div></article>${this.bountyMarkup(run)}${this.scoutMarkup(run)}`;
    }
    return header+progress+body+`<div class="endless-bottom"><section><h3>本局上阵卡组</h3><div class="endless-cards">${run.deck.map(uid=>this.portrait(this.card(uid))).join('')}</div><h3>本局道具 ${run.items.length}/12</h3><p>基础攻击 ×${bonus.atk.toFixed(2)} · 基础生命 ×${bonus.hp.toFixed(2)} · 开战双资源 +${bonus.resource}</p>${run.items.length?run.items.map(id=>`<p class="endless-item"><b>${escape(RUN_ITEMS[id]?.name)}</b> [${RUN_ITEMS[id]?.kind}] ${escape(RUN_ITEMS[id]?.text)}</p>`).join(''):'<p>暂未获得道具</p>'}${this.contractSummary(run)}</section><aside><h3>旅程记录</h3>${run.journal.map(line=>`<p>${escape(line)}</p>`).join('')}</aside></div>${run.phase!=='ended'?'<button class="danger" data-end>结束本次挑战</button>':''}`;
  }
  contractMarkup(run) {
    const choices=runContractChoices(run);
    return `<article class="endless-panel endless-contract"><div class="endless-section-heading"><div><small>已通过 ${run.cleared} 战 · 十层契约</small><h2>选择一项敌方挑战契约</h2></div></div>
      <p>契约会持续影响本局剩余战斗，签约立刻发放远征币。三项必须选一项——用难度换补给。</p>
      <div class="endless-contract-options">${choices.map(c=>`<button data-contract="${c.id}"><strong>${c.name}</strong><small>${c.text}</small><em>+${c.gold} 远征币</em></button>`).join('')}</div>
      ${this.contractSummary(run)}</article>`;
  }
  contractSummary(run) {
    const mods=runContractModifiers(run),names=(run.contracts||[]).map(id=>RUN_CONTRACTS[id]?.name).filter(Boolean);
    if(!names.length)return '';
    const parts=[];
    if(mods.speed>0)parts.push(`敌方移速 +${Math.round(mods.speed*100)}%`);
    if(mods.rangedAtk>0)parts.push(`敌方远程攻击 +${Math.round(mods.rangedAtk*100)}%`);
    if(mods.regen>0)parts.push(`敌方每 2 秒回复 ${(mods.regen*100).toFixed(1)}% 生命`);
    return `<p class="endless-contract-list"><b>已生效契约</b>：${names.map(n=>escape(n)).join('、')}${parts.length?`（${parts.join(' · ')}）`:''}</p>`;
  }
  bountyMarkup(run) {
    if(run.phase!=='ready')return '';
    const current=run.bounty??null;
    return `<article class="endless-panel endless-bounties"><div class="endless-section-heading"><div><small>本场可选赏金</small><h3>达成条件额外发远征币</h3></div>${current?'<button data-bounty-clear>取消选择</button>':''}</div>
      <p>赏金失败不会有任何惩罚，只影响本场额外奖励。每场开战前重新选择。</p>
      <div class="endless-bounty-options">${runBountyChoices(run).map(b=>`<button data-bounty="${b.id}" aria-pressed="${current===b.id}" class="${current===b.id?'selected':''}"><strong>${b.name}</strong><small>${b.text}</small><em>+${b.gold} 远征币</em></button>`).join('')}</div></article>`;
  }
  scoutMarkup(run) {
    let scout;
    try{scout=runScout(run,this.db);}catch{return '';}
    const themes=[...new Set(scout.floors.map(f=>f.theme))].join(' / ');
    return `<article class="endless-panel endless-scout"><div class="endless-section-heading"><div><small>五层侦察</small><h3>第 ${scout.bandStart}–${scout.bandEnd} 战预告</h3></div></div>
      <p>主力敌军：${scout.enemies.map(e=>`${escape(e.name)} ×${e.count}`).join(' · ')}</p>
      <p>敌军主题：${escape(themes)}</p>
      ${scout.eliteFloor?`<p class="endless-scout-elite">第 ${scout.eliteFloor} 战为精英战：敌军生命 ×1.2、攻击 ×1.1。</p>`:'<p>本区间没有精英战。</p>'}</article>`;
  }
  async launchBattle() {
    try {
      this.store.assertOwner();
      if(this.run.phase==='battle')this.commit({...this.run,phase:'ready',attempt:null});
      this.commit(beginRunBattle(this.run));
      const attempt=this.run.attempt;
      const child=new EndlessRoomView(this.db,this.run,{onExit:()=>{
        this.child=null;if(!this.closed)this.render(this.root);
      },onResult:result=>{
        if(this.closed || child.closed)return;
        try{const current=this.load();if(current?.attempt!==attempt || result.attempt!==attempt)return;this.commit(settleRunBattle(current,result));}
        catch(error){this.notice=error.message;}
      }});
      this.child=child;
      this.root.innerHTML='<div class="endless-battle-host"></div>';
      await child.render(this.root.firstElementChild);
      await child.ready;
    }catch(error){await this.child?.destroy();this.child=null;this.notice=error.message;if(!this.closed)this.render(this.root);}
  }
  destroy(){this.closed=true;this.child?.destroy();this.child=null;window.removeEventListener('clbwz:player-changed',this.onOwnerChange);}
}
