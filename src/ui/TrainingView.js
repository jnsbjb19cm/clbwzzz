import { audio } from '../core/AudioManager.js';
import {
  NEW_PLAYER_TUTORIAL_MARKER,
  getTutorialDeckCards,
  getTutorialDeckSlots,
} from '../tutorial/TutorialConfig.js';
import { installNewPlayerTutorial } from '../tutorial/NewPlayerTutorial.js';

// main.js 还会继续安装多套 BattleView 补丁；延迟到当前模块初始化结束后再装教程补丁，
// 使新手教程成为最终表现层，不被旧的战斗补丁覆盖。
if (typeof queueMicrotask === 'function') queueMicrotask(() => installNewPlayerTutorial());
else Promise.resolve().then(() => installNewPlayerTutorial());

/**
 * 训练营（前端页面）
 * - 「新手教程」：临时教学卡组 + 真实胜负教学，必须亲手击破敌方基地。
 * - 「卡牌教学」：卡一览分页展示，点卡看【功能/作用/用法】+ 开始教学（进训练战斗带该卡）。
 * - 「自由练习」：当前卡组进训练战斗。
 * - 资源无限/正常 开关；训练战斗可换背景。
 */
export class TrainingView {
  constructor(db, cardInventory, player = null, { onNavigate } = {}) {
    this.db = db;
    this.cardInventory = cardInventory;
    this.player = player ?? { level: 1 };
    this.onNavigate = onNavigate;
    this.pickCard = null;
    this.page = 0;
    this.freeRes = true;   // 自由练习默认无限资源
    this.trainingMap = 'grass'; // 训练背景（grass/rock/ice）
  }

  static PAGE = 24;
  static MAPS = [
    { key: 'grass', name: '草地' },
    { key: 'rock', name: '黄沙' },
    { key: 'ice', name: '冰川' },
  ];

  /** 卡牌机制分类 */
  getMechanicOf(card) {
    const style = Number(card.atk_style);
    const view = Number(card.card_view_type);
    const name = String(card.card_name || '');
    if (Number(card.effect_self) === 4) return '自爆';
    if (view === 6) return '飞行';
    if (style === 3 || name.includes('椰子')) return '抛物线/对空';
    if ([2, 3, 17, 18, 19].includes(style)) return '远程';
    if (name.includes('召唤') || Number(card.special_atk_effect) === 17) return '召唤';
    return '近战/防御';
  }

  /** 教学：根据机制生成【用法】提示 */
  getUsage(card) {
    const mech = this.getMechanicOf(card);
    const m = {
      '自爆': '放到敌阵触发/接触后自爆，对接触目标造成大量伤害；注意它不是持续单位。',
      '飞行': '飞行单位在空中行动，普通直线子弹打不到；防空/抛物线/对空远程(数值3)可攻击它。血量≤50%会落地。',
      '抛物线/对空': '抛物线投手/对空远程可攻击飞行单位，优先打空中目标。',
      '远程': '远程单位有较长射程；普通远程(直线)不能打飞行；放后排安全输出。',
      '召唤': '该卡会召唤小怪/分身，召唤时地面出现法阵特效。',
      '近战/防御': '近战单位需走到敌人面前才攻击；防御类可阻挡并作为前排。',
    };
    return m[mech] || '按图鉴描述使用。';
  }

  render(root) {
    this.root = root;
    const cards = this.db?.cards ?? [];
    const deckSlots = this.cardInventory?.getSlots?.() ?? [];
    const tutorialCards = getTutorialDeckCards(this.db, 6);
    const list = cards.filter((c) => Number(c.id) < 500);
    const totalPages = Math.max(1, Math.ceil(list.length / TrainingView.PAGE));
    this.page = Math.min(this.page, totalPages - 1);
    const pageCards = list.slice(this.page * TrainingView.PAGE, (this.page + 1) * TrainingView.PAGE);

    root.innerHTML = `
      <div class="page training-page">
        <header class="training-header">
          <button type="button" id="training-back" class="btn-sm">返回主城</button>
          <h1>训练营</h1>
          <p>先学会怎样获胜，再自由练卡；训练内容不消耗背包卡牌、不产生正式关卡掉落。</p>
        </header>

        <section class="training-body">
          <div class="training-card training-new-player">
            <h2>新手教程</h2>
            <p>使用训练营临时提供的教学卡组，从零完成一场真正的教学战。</p>
            <ul class="training-tutorial-goals">
              <li>学习拖卡、可放置区域、前后排与自动战斗</li>
              <li>认识阳光 / 食物、技能与 MP（MP 每 50 秒恢复 10 点）</li>
              <li>理解失败条件，并亲手把右侧敌方基地打到 0 获胜</li>
            </ul>
            <div class="training-starter-deck" title="教学卡组仅本次训练临时使用">
              ${tutorialCards.map((card) => `
                <div class="training-starter-card">
                  <img src="/sprites/cards/${card.spriteRes ?? card.id}.png" alt="${card.card_name ?? card.name ?? ''}" draggable="false">
                  <span>${card.card_name ?? card.name ?? `卡${card.id}`}</span>
                </div>`).join('')}
            </div>
            <button type="button" id="training-tutorial" class="btn" ${tutorialCards.length ? '' : 'disabled'}>开始新手教程</button>
          </div>

          <div class="training-card">
            <h2>自由练习</h2>
            <p>使用当前保存的卡组，进入练习战斗（不出怪、不结算、不掉落），可换背景、自由放置测试。</p>
            <label class="training-toggle"><input type="checkbox" id="training-free-res" ${this.freeRes ? 'checked' : ''}> 资源无限</label>
            <div class="training-maps">背景：${TrainingView.MAPS.map(m => `<label><input type="radio" name="training-map" value="${m.key}" ${this.trainingMap === m.key ? 'checked' : ''}> ${m.name}</label>`).join('')}</div>
            <button type="button" id="training-free" class="btn" ${deckSlots.length ? '' : 'disabled'}>进入自由练习</button>
          </div>

          <div class="training-card">
            <h2>卡牌教学</h2>
            <p>点下方任意卡牌查看【功能 / 作用 / 用法】，再点「开始教学」进入训练战斗使用它。</p>
          </div>
        </section>

        <section id="training-detail" class="training-detail${this.pickCard ? '' : ' hidden'}"></section>

        <section class="training-list">
          <h3>卡牌一览</h3>
          <div class="training-grid"></div>
          <div class="training-pager">
            <button type="button" class="btn-sm" id="training-prev" ${this.page > 0 ? '' : 'disabled'}>上一页</button>
            <span>第 ${this.page + 1} / ${totalPages} 页</span>
            <button type="button" class="btn-sm" id="training-next" ${this.page < totalPages - 1 ? '' : 'disabled'}>下一页</button>
          </div>
        </section>
      </div>`;

    root.querySelector('#training-back')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('main');
    });
    root.querySelector('#training-tutorial')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('battle', {
        training: true,
        trainingFreeRes: false,
        trainingMap: 'grass',
        deckSlots: getTutorialDeckSlots(this.db, 6),
        tryUsage: NEW_PLAYER_TUTORIAL_MARKER,
      });
    });
    root.querySelectorAll('input[name="training-map"]')?.forEach((r) => r.addEventListener('change', (e) => { if (e.target.checked) this.trainingMap = e.target.value; }));
    root.querySelector('#training-free-res')?.addEventListener('change', (e) => {
      this.freeRes = e.target.checked;
    });
    root.querySelector('#training-free')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('battle', { training: true, trainingFreeRes: this.freeRes, trainingMap: this.trainingMap });
    });
    root.querySelector('#training-prev')?.addEventListener('click', () => {
      this.page = Math.max(0, this.page - 1);
      this.render(root);
    });
    root.querySelector('#training-next')?.addEventListener('click', () => {
      this.page = Math.min(totalPages - 1, this.page + 1);
      this.render(root);
    });
    this.renderList(root, pageCards);
    if (this.pickCard) this.renderDetail(root, this.pickCard);
  }

  renderList(root, pageCards) {
    const grid = root.querySelector('.training-grid');
    grid.innerHTML = pageCards.map((c) => `
      <button type="button" class="training-card-item" data-card="${c.id}" title="${(c.desc || '').slice(0, 30)}">
        <img src="/sprites/cards/${c.id}.png" alt="${c.card_name}" draggable="false">
        <span>${this.getMechanicOf(c)}</span>
      </button>`).join('') || '<p class="training-empty">暂无可用卡牌。</p>';
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-card]');
      if (!btn) return;
      this.pickCard = this.db?.getById?.(Number(btn.dataset.card));
      this.render(this.root);
    });
  }

  renderDetail(root, card) {
    const el = root.querySelector('#training-detail');
    if (!card) return;
    el.innerHTML = `
      <h3>${card.card_name} · <em>${this.getMechanicOf(card)}</em></h3>
      <div class="training-detail-cols">
        <div><b>功能</b><p>${this.getMechanicOf(card)}</p></div>
        <div><b>作用</b><p>${card.desc || '暂无描述。'}</p></div>
        <div><b>用法</b><p>${this.getUsage(card)}</p></div>
      </div>
      <div class="training-detail-actions">
        <button type="button" class="btn" id="training-try">开始教学</button>
        <button type="button" class="btn btn-ghost" id="training-close">关闭</button>
      </div>`;
    el.classList.remove('hidden');
    el.querySelector('#training-try')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('battle', { training: true, tryCard: card.id, trainingFreeRes: this.freeRes, trainingMap: this.trainingMap, tryUsage: this.getUsage(card) });
    });
    el.querySelector('#training-close')?.addEventListener('click', () => {
      this.pickCard = null;
      this.render(this.root);
    });
  }
}
