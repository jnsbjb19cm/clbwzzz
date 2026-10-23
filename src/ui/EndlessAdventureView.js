import { authStore } from '../core/AuthStore.js';
import { EndlessRunStore } from '../core/EndlessRunStore.js';
import { loadBattleDeckSlots20260911 } from './DeckGroupPreference20260911.js';
import { EndlessRoomView } from './EndlessRoomView.js';
import { ENDLESS_NAMES, STARTER_TEAMS, RUN_ITEMS, RUN_CONTRACTS, EVENT_LABELS, createEndlessRun, buildEndlessEncounter,
  runModifiers, runRoutes, chooseRunRoute, runEventChoices, runEventPresentation, resolveRunEvent, leaveRunCamp,
  beginRunBattle, settleRunBattle, repairTrialCamp,
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
    root.innerHTML = `<section class="endless-page endless-${this.mode}"><header class="endless-header"><div><small>野外冒险 / ${this.mode==='trial'?'攀登挑战':'分岔旅程'}</small><h1>${ENDLESS_NAMES[this.mode]}</h1></div><button data-home>返回野外冒险</button></header>
      <nav class="endless-tabs">${Object.entries(ENDLESS_NAMES).map(([id,name])=>`<button data-mode="${id}" class="${id===this.mode?'selected':''}">${name}</button>`).join('')}</nav>
      <div class="endless-meta"><span>单人挑战</span><span>本局资产独立</span><span>准备房间选卡</span><details><summary>存档与奖励说明</summary><p>进度按账号保存在本机；卡牌、道具和远征币仅本局有效，不扣永久资产，不计正式排行或主线奖励。刷新从未结算的本场开头重进。</p></details></div>
      ${this.notice?`<p role="alert" class="endless-error">${escape(this.notice)}</p>`:''}
      ${run?this.runMarkup(run):this.startMarkup()}
      <details class="endless-help"><summary>规则与后续玩法点子</summary><p>试炼：混合植物与怪物，每层提高数量和强度，10 层出现精英；通关 5/10/15…层后，可换 1 张上阵卡。场上敌军最多 24 个，其余排队进场。</p><p>远征：最多连续经过两个非战斗节点；每第五节点保证战斗。已揭晓事件不会因刷新重抽；每个奖励只领一次。基地损伤会延续到下一场。</p><p>契约：每通过 10 场必选一项敌方挑战（移速/远程/回复），立刻获得远征币；契约可叠加并有封顶。</p><p>赏金：每场开战前可选一项（无瑕防线 / 三路并进 / 精兵简政），达成额外给远征币，失败无惩罚。</p><p>侦察：营地与远征路线页会预告下一段五层区间的主力敌军与精英层。</p><p>后续候选（未实装）：撤退保险、每周同种子竞速、双人路线投票。</p></details></section>`;
    root.querySelector('[data-home]').onclick = () => this.onNavigate?.('worldmap', { returnToPort: true });
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      this.mode = b.dataset.mode; this.notice = ''; this.pendingChoice = null; this.campSlot = 0;
      this.campPage = 0; this.campSearch = ''; this.selectedCampCard = null; this.render(root);
    });
    root.querySelectorAll('[data-start]').forEach(b => b.onclick = () => this.act(() => this.start(b.dataset.start)));
    root.querySelector('[data-end]')?.addEventListener('click', () => {
      if (window.confirm('结束这次挑战？本局卡牌、道具和远征币不会进入永久背包。')) this.act(() => this.commit({ ...this.run, phase: 'ended', attempt: null }));
    });
    root.querySelector('[data-battle]')?.addEventListener('click', () => this.launchBattle());
    const preview = (kind, id) => {
      this.pendingChoice = { kind, id, runId: this.run.id, step: this.run.step }; this.render(root);
      root.querySelector('.endless-confirm')?.scrollIntoView({ block: 'nearest' });
    };
    root.querySelectorAll('[data-route]').forEach(b => b.onclick = () => preview('route', b.dataset.route));
    root.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => preview('event', b.dataset.choice));
    root.querySelector('[data-choice-cancel]')?.addEventListener('click', () => { this.pendingChoice = null; this.render(root); });
    root.querySelector('[data-choice-confirm]')?.addEventListener('click', () => this.act(() => {
      const selected = this.pendingChoice;
      if (!selected || selected.runId !== this.run.id || selected.step !== this.run.step || selected.kind !== this.run.phase) throw new Error('节点已变化，请重新选择');
      const pool = this.db.getCollectibleCards().filter(c => c.quality <= Math.min(5, 2+Math.floor(this.run.battles/3))).map(c=>c.id);
      this.commit(selected.kind === 'route' ? chooseRunRoute(this.run, selected.id) : resolveRunEvent(this.run, selected.id, pool));
      this.pendingChoice = null;
    }));
    root.querySelector('[data-leave-camp]')?.addEventListener('click', () => this.act(() => this.commit(leaveRunCamp(this.run))));
    root.querySelector('[data-repair]')?.addEventListener('click', () => this.act(() => this.commit(repairTrialCamp(this.run))));
    // 第二批：十层契约（必选一项）与开战前可选赏金（可取消）。
    root.querySelectorAll('[data-contract]').forEach(b => b.onclick = () => this.act(() => this.commit(chooseRunContract(this.run, b.dataset.contract))));
    root.querySelectorAll('[data-bounty]').forEach(b => b.onclick = () => this.act(() => this.commit(chooseRunBounty(this.run, b.dataset.bounty))));
    root.querySelector('[data-bounty-clear]')?.addEventListener('click', () => this.act(() => this.commit(chooseRunBounty(this.run, null))));
  }
  campMarkup(run) {
    return `<article class="endless-panel endless-camp"><small>整备节点 / 战团调整</small><h2>去熟悉的准备房间换卡</h2>
      <p>${run.mode==='trial'?'从自己背包的全部有效卡牌中选择，保留品质与强化。':'只使用本局获得、购买的储备卡；不会加入局外卡牌。'}</p>
      <div class="endless-camp-summary"><strong>${run.initialSetup?'自由组队':run.swapsLeft+' 次替换机会'}</strong><span>原版选卡界面 · 取消不扣次数 · 确定才保存</span></div>
      <div class="endless-battle-actions"><button data-leave-camp>跳过整备</button><button class="primary" data-battle>进入准备房间 →</button></div>
      ${run.mode==='trial'&&!run.initialSetup?`<button data-repair ${run.campRepaired||run.gold<40||run.baseHp>=run.baseMaxHp?'disabled':''}>40 远征币 · 修复基地 +200（本营地一次）</button>`:''}</article>`;
  }
  choiceMarkup(run) {
    const selected = this.pendingChoice;
    if (!selected || selected.runId !== run.id || selected.step !== run.step || selected.kind !== run.phase) return '';
    const choice = (run.phase === 'route' ? runRoutes(run) : runEventChoices(run)).find(c=>c.id===selected.id);
    if (!choice || choice.disabled) return '';
    return `<div class="endless-confirm" role="region" aria-label="确认选择"><div><small>尚未结算 · 可以改选</small><strong>${escape(choice.title)}</strong><p>${escape(choice.detail || (run.phase==='route'?'确认后进入这条路线，其余路线将关闭。':'确认后执行以上行动，消耗与奖励仅限本局。'))}</p></div><button data-choice-cancel>取消</button><button class="primary" data-choice-confirm>${run.phase==='route'?'前往此处':'确认行动'} →</button></div>`;
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
    const prepare='';
    if(run.phase==='ended')body=`<article class="endless-panel"><h2>本次挑战结束</h2><p>完成 ${run.cleared} 场战斗。没有扣除永久卡牌，也没有发放局外奖励。</p></article>${this.startMarkup()}`;
    else if(run.phase==='contract')body=this.contractMarkup(run);
    else if(run.phase==='route')body=`<h2>第 ${run.step} 个节点 · 选择路线</h2><div class="endless-routes">${runRoutes(run).map(r=>`<button data-route="${r.id}" class="event-${r.kind}"><strong>${r.title}</strong><small>${{battle:'查看敌军并进入战斗',reward:'获得本局补给、道具或卡牌',random:'45% 奖励 / 35% 中性 / 20% 负面',neutral:'有代价的交易，也可以离开',negative:'支付代价，避免更大损失',swap:'从储备中替换一张上阵卡',shop:'使用远征币购买卡牌或道具'}[r.kind]}</small></button>`).join('')}</div>${this.scoutMarkup(run)}`;
    else if(run.phase==='camp') {
      body=this.campMarkup(run)+this.scoutMarkup(run);
    } else if(run.phase==='event') {
      const event=runEventPresentation(run);
      body=`<article class="endless-panel endless-event"><small>${run.event.random?'未知路线已揭晓 · ':''}${EVENT_LABELS[run.event.kind]}</small><h2>${escape(event.name)}</h2><p>${escape(event.text)}</p><div class="endless-event-actions">${runEventChoices(run).map(c=>`<button data-choice="${c.id}" aria-pressed="${this.pendingChoice?.id===c.id}" ${c.disabled?'disabled':''}><strong>${escape(c.title)}</strong><small>${escape(c.detail || ({fang:RUN_ITEMS.fang.text,ember:RUN_ITEMS.ember.text,pack:RUN_ITEMS.pack.text,card:'随机援军进入本局储备，在换卡节点上阵',flask:RUN_ITEMS.flask.text}[c.id] || '仅影响本次挑战'))}</small>${c.disabled?'<em>当前条件不足或已购买</em>':''}</button>`).join('')}</div></article>`;
    }
    else {
      const fight=buildEndlessEncounter(run,this.db),counts=new Map();for(const row of fight.roster)counts.set(row.cardId,(counts.get(row.cardId)||0)+1);
      body=`<article class="endless-panel"><h2>${escape(fight.title)}</h2><p>敌军共 ${fight.total} 张 · 同时在场上限 ${fight.aliveCap} · 敌方攻击 ×${fight.atkScale.toFixed(2)} / 生命 ×${fight.hpScale.toFixed(2)}</p><div class="endless-cards">${[...counts].map(([id,count])=>`<div>${this.portrait({cardId:id})}<b>×${count}</b></div>`).join('')}</div><p>清除全部敌军或击破敌方基地即获胜；基地归零或超过 7 分钟失败。无英雄主动技能与局外天赋加成。</p><div class="endless-battle-actions">${prepare}<button class="primary" data-battle>${run.phase==='battle'?'重进本场准备房间':'进入准备房间 →'}</button></div></article>${this.bountyMarkup(run)}${this.scoutMarkup(run)}`;
    }
    return this.journeyMarkup(run)+header+progress+body+this.choiceMarkup(run)+`<details class="endless-loadout"><summary>查看本局卡组、道具与旅程记录</summary><div class="endless-bottom"><section><h3>本局上阵卡组</h3><div class="endless-cards">${run.deck.map(uid=>this.portrait(this.card(uid))).join('')}</div><h3>本局道具 ${run.items.length}/12</h3><p>基础攻击 ×${bonus.atk.toFixed(2)} · 基础生命 ×${bonus.hp.toFixed(2)} · 开战双资源 +${bonus.resource}</p>${run.items.length?run.items.map(id=>`<p class="endless-item"><b>${escape(RUN_ITEMS[id]?.name)}</b> [${RUN_ITEMS[id]?.kind}] ${escape(RUN_ITEMS[id]?.text)}</p>`).join(''):'<p>暂未获得道具</p>'}${this.contractSummary(run)}</section><aside><h3>旅程记录</h3>${run.journal.map(line=>`<p>${escape(line)}</p>`).join('')}</aside></div></details>${run.phase!=='ended'?'<button class="danger" data-end>结束本次挑战</button>':''}`;
  }
  journeyMarkup(run) {
    const stages = run.mode==='trial' ? ['逐层挑战', '五层整备', '准备房间', '进入战斗'] : ['选择路线', '处理事件', '准备房间', '进入战斗'];
    const current = run.phase==='route'?0:['event','camp','contract'].includes(run.phase)?1:run.phase==='battle'?3:2;
    return `<div class="endless-journey"><div><small>${run.mode==='trial'?'下一场试炼':'当前旅程'}</small><strong>${run.mode==='trial'?'第 '+run.floor+' 层':'第 '+run.step+' 节点'}</strong><span>${PHASE_NAMES[run.phase]}</span></div><ol>${stages.map((title,i)=>`<li class="${i===current?'current':''}"><b>${i+1}</b>${title}</li>`).join('')}</ol></div>${run.journal[0]?`<p class="endless-latest">最近：${escape(run.journal[0])}</p>`:''}`;
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
    if (this.closed || this.child) return;
    try {
      this.store.assertOwner();
      if(this.run.phase==='battle')this.commit({...this.run,phase:'ready',attempt:null,preparation:null});
      const camp = this.run.phase === 'camp';
      const preparationOnly = camp && this.run.mode === 'expedition';
      const prepared = beginRunBattle({ ...this.run, phase: 'ready' });
      prepared.preparation = { swapsLeft: camp ? this.run.swapsLeft : 0 };
      const attempt=prepared.attempt;
      const child=new EndlessRoomView(this.db,prepared,{inventory:this.cardInventory, preparationOnly,
        onDeckUpdate: updated => {
          if(this.closed)return;
          const current=this.load();
          this.commit({...current,roster:updated.roster,deck:updated.deck,
            swapsLeft:updated.preparation.swapsLeft});
        },onStart:()=>{
          const current=this.load();
          if(preparationOnly) { this.commit(leaveRunCamp(current)); return; }
          this.commit({...current,phase:'battle',initialSetup:false,swapsLeft:0,
            preparation:null,attempt,attemptNo:prepared.attemptNo});
        },onExit:()=>{
        this.child=null;
        if(!this.closed){const current=this.load();if(current?.phase==='battle'&&current.attempt===attempt)this.commit({...current,phase:'ready',attempt:null});this.render(this.root);}
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
