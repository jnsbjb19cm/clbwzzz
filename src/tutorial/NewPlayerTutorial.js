import { BattleView } from '../ui/BattleView.js';
import {
  NEW_PLAYER_TUTORIAL_MARKER,
  NEW_PLAYER_TUTORIAL_STORAGE_KEY,
  TUTORIAL_CARD_IDS,
} from './TutorialConfig.js';
import './NewPlayerTutorial.css';
import './TrainingResponsiveFix.css';

const PATCH_FLAG = Symbol.for('clbwzzz.newPlayerTutorialStoryV3');
const PROTECTED_ENEMY_BASE_HP = 800;
const FINAL_ENEMY_BASE_HP = 260;
const TUTORIAL_PLAYER_BASE_HP = 1200;
const TUTORIAL_RESOURCE_START = 40;
const MIDDLE_LANE = 2; // 第三路，lane 从 0 开始。
const STATIC_DEFENSE_LANES = [0, 1, 4]; // 留出第三路做主教学线。
const PLAYER_STATIC_DEFENSE_COL = 4;
const ENEMY_STATIC_DEFENSE_COL = 7;
const PREFERRED_DEFENSE_CARD_IDS = [2, 21];

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isTutorialView(view) {
  return Boolean(
    view
      && view.trainingMode
      && String(view.tryUsage ?? '') === NEW_PLAYER_TUTORIAL_MARKER,
  );
}

function cardMoveSpeed(card) {
  return finite(card?.moveSpeed ?? card?.move_speed, 0);
}

function cardAtkStyle(card) {
  return finite(card?.atkStyle ?? card?.atk_style, -1);
}

function cardCategory(card) {
  return finite(card?.card_category ?? card?.category, -1);
}

function getTutorialDefenseCards(db, limit = 2) {
  const all = (db?.cards ?? []).filter((card) => {
    const id = Number(card?.id ?? card?.card_id);
    const category = cardCategory(card);
    return Number.isFinite(id)
      && id > 0
      && id < 500
      && cardMoveSpeed(card) <= 0
      && (category === 0 || category === 1 || category === -1);
  });
  const byId = new Map(all.map((card) => [Number(card.id ?? card.card_id), card]));
  const selected = [];
  const used = new Set();
  const add = (card) => {
    const id = Number(card?.id ?? card?.card_id);
    if (!card || !id || used.has(id) || selected.length >= limit) return;
    used.add(id);
    selected.push(card);
  };

  PREFERRED_DEFENSE_CARD_IDS.map((id) => byId.get(id)).filter(Boolean).forEach(add);
  all.filter((card) => cardAtkStyle(card) === 1).forEach(add);
  all.forEach(add);
  return selected.slice(0, limit);
}

function prepareTutorialEngine(view) {
  const engine = view?.engine;
  if (!engine || engine.__newPlayerTutorialPrepared) return;

  engine.__newPlayerTutorialPrepared = true;
  engine.tutorialMode = true;
  engine.tutorialBaseProtected = true;
  engine.tutorialPlacementRule = null;

  // 先借 trainingMode 创建一个没有普通波次的 BattleEngine，再切回真实资源/MP/胜负规则。
  engine.trainingMode = false;
  engine.trainingFreeRes = false;
  engine.lootEnabled = false;
  if (engine.wave) {
    engine.wave.trainingMode = true;
    engine.wave.done = true;
    engine.wave.queue = [];
    engine.wave.totalWaves = 0;
    engine.waveNumber = 0;
    engine.totalWaves = 0;
  }

  engine.units = [];
  engine.projectiles = [];
  engine.floats = [];
  engine.deployEffects = [];
  engine.skillFx = [];
  engine.skillEffects = engine.skillFx;
  engine.impactFx = [];
  engine.bumpFx = [];
  engine.lootDrops = [];
  engine.killsThisBattle = 0;

  engine.heroMaxHp = TUTORIAL_PLAYER_BASE_HP;
  engine.heroHp = TUTORIAL_PLAYER_BASE_HP;
  engine.enemyHeroMaxHp = PROTECTED_ENEMY_BASE_HP;
  engine.enemyHeroHp = PROTECTED_ENEMY_BASE_HP;
  engine.sunlight = TUTORIAL_RESOURCE_START;
  engine.food = TUTORIAL_RESOURCE_START;
  engine.resourceTimer = 0;
  engine.mpTimer = 0;
  engine.heroMp = engine.heroMpMax;
  engine.status = 'playing';
  engine.time = 0;
  engine.cooldowns = engine.deck.map(() => 0);
  if (engine.skills?.cooldowns) engine.skills.cooldowns = {};

  // 剧情教程必须能找到暴风雪；不修改玩家保存在天赋页里的真实技能配置。
  const oldLoadout = Array.isArray(engine.skillLoadout) ? [...engine.skillLoadout] : [];
  const rest = oldLoadout.filter((id) => id && Number(id) !== TUTORIAL_CARD_IDS.BLIZZARD);
  engine.skillLoadout = [TUTORIAL_CARD_IDS.BLIZZARD, ...rest].slice(0, 6);
  while (engine.skillLoadout.length < 6) engine.skillLoadout.push(null);

  engine.pushLog?.('埃尔夫族训练：守住左侧家园，最终击破右侧蒙斯特基地。');
  engine.pushLog?.('教学卡组为训练营临时卡组，不消耗背包卡牌。');

  view._resultReported = false;
  view._resultAudioPlayed = false;
}

class NewPlayerTutorialController {
  constructor(view, root) {
    this.view = view;
    this.root = root;
    this.engine = view.engine;
    this.stepIndex = 0;
    this.destroyed = false;
    this.completed = false;
    this.defenseCards = getTutorialDefenseCards(view.db, 2);
    this.slimeUids = new Set();
    this.runnerUids = new Set();
    this.blizzardCooldownBefore = 0;
    this._onResize = () => this.updateFocus();
    this._onBlankPointer = (event) => this.handleBlankPointer(event);
  }

  get steps() {
    return [
      {
        key: 'story',
        mode: 'blank',
        title: '勇士，请帮助我们守住家园',
        text: '勇士，我们是一直与森林和平共处的<b>埃尔夫族</b>。可现在，蒙斯特族正在入侵我们的领地。我们不愿让这片森林陷入战火……如果你愿意，请帮助我们一起守住家园。',
        hint: '点击任意空白位置继续。',
      },
      {
        key: 'peanut',
        mode: 'deploy',
        cardId: TUTORIAL_CARD_IDS.PEANUT,
        title: '先召唤花生射手',
        text: '勇士，请你帮我们度过眼前的难关。先<b>点击或拖动花生射手</b>，把它放到第三路，让我们建立第一道远程火力。',
        hint: '花生射手是远距离攻击单位，会发射直线花生子弹攻击同一路上的目标。',
        rule: {
          cardId: TUTORIAL_CARD_IDS.PEANUT,
          cardName: '花生射手',
          lane: MIDDLE_LANE,
          allowedCols: [0, 1, 2],
          laneMessage: '勇士，请先把花生射手放在第三路。',
          colMessage: '花生射手适合后排，请先放在第三路靠近基地的三列。',
        },
      },
      {
        key: 'peanut-info',
        mode: 'blank',
        title: '很好，这就是远程射手',
        text: '花生射手会留在原地，从较远的位置持续发射直线子弹。把远程单位留在后排，通常能让它们更安全地输出。',
        hint: '点击任意空白位置继续。',
      },
      {
        key: 'walnut',
        mode: 'deploy',
        cardId: TUTORIAL_CARD_IDS.WALNUT,
        title: '小心，蒙斯特族的跑鞋怪来了！',
        text: '敌方已经从<b>第三路</b>召唤了跑鞋怪。我们需要防御类卡牌挡住它。<b>核桃卫兵</b>生命较高，是可靠的前排——勇士，请把它放在第三路第四列。',
        hint: '核桃卫兵不会主动追敌，它的价值是挡在前线，为后排争取输出时间。',
        enter: () => this.spawnRunner(),
        rule: {
          cardId: TUTORIAL_CARD_IDS.WALNUT,
          cardName: '核桃卫兵',
          lane: MIDDLE_LANE,
          col: 3,
          laneMessage: '核桃卫兵要挡住第三路的跑鞋怪，请放在第三路。',
          colMessage: '勇士，请把核桃卫兵放在第三路第四列。',
        },
      },
      {
        key: 'blocked',
        mode: 'blank',
        title: '太棒了，防线建立起来了',
        text: '做得很好，勇士。核桃卫兵会顶在前面承受伤害，花生射手则能从后方继续攻击。<b>防御与输出互相配合</b>，战线才会更稳定。',
        hint: '点击任意空白位置继续。',
      },
      {
        key: 'runner',
        mode: 'deploy',
        cardId: TUTORIAL_CARD_IDS.RUNNER,
        title: '我们也开始反击吧',
        text: '勇士，现在轮到我们推进了。放下一只<b>跑鞋怪</b>，让它沿着第三路向蒙斯特族的阵地发起反击。',
        hint: '跑鞋怪属于可移动卡牌。可移动卡牌只能放在靠近己方基地的三列。',
        rule: {
          cardId: TUTORIAL_CARD_IDS.RUNNER,
          cardName: '跑鞋怪',
          lane: MIDDLE_LANE,
          allowedCols: [0, 1, 2],
          laneMessage: '这次反击从第三路开始，请把跑鞋怪放在第三路。',
          colMessage: '可移动卡牌只能放在靠近己方基地的三列。',
        },
      },
      {
        key: 'placement-rule',
        mode: 'blank',
        title: '记住两种放置范围',
        text: '<b>可移动卡牌</b>只能放在靠近己方基地的三列；<b>不可移动卡牌</b>可以使用己方五列。看到放置高亮时，蓝色区域就是当前卡牌允许部署的位置。',
        hint: '点击任意空白位置继续。',
      },
      {
        key: 'spike',
        mode: 'deploy',
        cardId: TUTORIAL_CARD_IDS.SPIKE,
        title: '在前排布置地刺',
        text: '地刺可以攻击<b>本格内经过的地面单位</b>。不过每次攻击都会产生磨损，它自己也会受到伤害，所以最好把地刺放在防御卡牌的前方。勇士，请放到第三路第五列。',
        hint: '核桃卫兵在第四列，地刺放在它前面的第五列，敌人靠近时会先踩到地刺。',
        rule: {
          cardId: TUTORIAL_CARD_IDS.SPIKE,
          cardName: '地刺',
          lane: MIDDLE_LANE,
          col: 4,
          laneMessage: '地刺这一步需要布置在第三路。',
          colMessage: '勇士，请把地刺放在第三路第五列，也就是核桃卫兵前方。',
        },
      },
      {
        key: 'spike-success',
        mode: 'blank',
        title: '很好，地刺已经就位',
        text: '太棒了，勇士！地刺和核桃卫兵已经组成前排。小心，蒙斯特族又派来了一只跑鞋怪——让我们的防线来应对它。',
        hint: '点击任意空白位置继续。',
        enter: () => this.spawnRunner(),
      },
      {
        key: 'cactus',
        mode: 'deploy',
        cardId: TUTORIAL_CARD_IDS.CACTUS,
        title: '再补一名后排射手',
        text: '勇士，你还可以在后排放置<b>仙人掌</b>。它同样是远距离射手，会发射直线刺子弹攻击目标。让后排火力更充足一些吧。',
        hint: '把仙人掌放在第三路靠近己方基地的后排区域。',
        rule: {
          cardId: TUTORIAL_CARD_IDS.CACTUS,
          cardName: '仙人掌',
          lane: MIDDLE_LANE,
          allowedCols: [0, 1, 2],
          laneMessage: '勇士，请先把仙人掌补到第三路的战线上。',
          colMessage: '仙人掌适合后排，请放在靠近己方基地的三列。',
        },
      },
      {
        key: 'slime-alert',
        mode: 'blank',
        title: '不好，软泥怪正在从五路涌来！',
        text: '蒙斯特族一次召唤了很多<b>软泥怪</b>——第 1、2、3、4、5 路都出现了两只。数量太多，单靠当前战线会很吃力。',
        hint: '点击任意空白位置，打开技能教学。',
        enter: () => this.spawnSlimeWave(),
      },
      {
        key: 'blizzard',
        mode: 'skill',
        title: '勇士，请使用「暴风雪」！',
        text: '使用<b>暴风雪</b>把这些软泥怪短暂冰封，为我们争取时间继续建立战线。技能栏已经打开，请点击高亮的「暴风雪」。',
        hint: '这里高亮的是实际释放技能的槽位。暴风雪会冻结全场敌人，并附带短暂减速。',
        enter: () => this.prepareBlizzardStep(),
      },
      {
        key: 'mp-info',
        mode: 'blank',
        title: '太好了，它们被冻结了',
        text: '做得很好，勇士！技能释放后会消耗对应的<b>魔力值 MP</b>，同时进入冷却。正常战斗中，MP <b>每 50 秒恢复 10 点</b>。',
        hint: '小心，暴风雪结束后敌人仍会继续行动。点击任意空白位置继续。',
      },
      {
        key: 'scarecrow',
        mode: 'deploy',
        cardId: TUTORIAL_CARD_IDS.SCARECROW,
        title: '用稻草人强化我们的战线',
        text: '<b>稻草人</b>可以增强附近 3×3 范围内的我方卡牌。勇士，尝试在第三路战线附近放下一张稻草人，让周围单位获得支援。',
        hint: '它本身不是主力输出，更适合放在能覆盖多张友军的位置。',
        rule: {
          cardId: TUTORIAL_CARD_IDS.SCARECROW,
          cardName: '稻草人',
          lane: MIDDLE_LANE,
          allowedCols: [0, 1, 2, 3],
          laneMessage: '这一步把稻草人放在第三路，方便观察 3×3 支援范围。',
          colMessage: '勇士，请把稻草人放在第三路战线附近。',
        },
      },
      {
        key: 'victory-rule',
        mode: 'blank',
        title: '最后，再记住胜利与失败',
        target: () => this.root.querySelector('.base-hp-slot.enemy'),
        text: '左侧是<b>埃尔夫基地</b>，右侧是<b>蒙斯特基地</b>。我们的基地生命先归零，战斗就会失败；把右侧蒙斯特基地生命打到 0，我们就能取得胜利。',
        hint: '现在先把这批软泥怪全部击败。点击任意空白位置继续。',
      },
      {
        key: 'clear-slimes',
        mode: 'wait-enemies',
        title: '守住阵线，把软泥怪清理干净',
        target: '#battle-canvas',
        text: '勇士，软泥怪还在推进。继续利用前排、防御、远程火力和技能，把这批入侵者全部击败。',
        hint: '当这一批软泥怪全部被击败后，我们就开始最后的反攻。',
      },
      {
        key: 'counterattack',
        mode: 'blank',
        title: '太棒了，勇士！我们守住了！',
        text: '这批软泥怪已经被击败。我们的防线还在，蒙斯特族的攻势却被打乱了——现在正是机会。<b>让我们乘胜追击，击败他们！</b>',
        hint: '点击任意空白位置，开始最后的反攻。',
      },
      {
        key: 'final',
        mode: 'win',
        title: '反攻开始：击破蒙斯特基地',
        target: () => this.root.querySelector('.base-hp-slot.enemy'),
        text: '继续召唤你需要的卡牌，让它们向右推进。勇士，<b>亲手把右侧蒙斯特基地的生命打到 0</b>，这场教学战才真正结束。',
        hint: '现在不再限制你的卡牌和放置位置。守住左侧基地，并击破右侧基地。',
        enter: () => this.beginFinalAttack(),
      },
    ];
  }

  start() {
    this.decorateBattleUi();
    this.setupStaticDefenses();
    this.mount();
    this.enterStep(0);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('pointerdown', this._onBlankPointer, true);
    this.timer = window.setInterval(() => this.monitor(), 100);
  }

  decorateBattleUi() {
    const playerLabel = this.root.querySelector('.base-hp-slot.player .label');
    const enemyLabel = this.root.querySelector('#orb-enemy-name');
    if (playerLabel) playerLabel.textContent = '埃尔夫基地';
    if (enemyLabel) enemyLabel.textContent = '蒙斯特基地';
  }

  setupStaticDefenses() {
    if (!this.defenseCards.length || this.engine.__tutorialStaticDefensesReady) return;
    this.engine.__tutorialStaticDefensesReady = true;

    STATIC_DEFENSE_LANES.forEach((lane, index) => {
      const playerCard = this.defenseCards[index % this.defenseCards.length];
      const enemyCard = this.defenseCards[(index + 1) % this.defenseCards.length] ?? playerCard;
      this.spawnStaticDefense(playerCard, lane, PLAYER_STATIC_DEFENSE_COL, 'player');
      this.spawnStaticDefense(enemyCard, lane, ENEMY_STATIC_DEFENSE_COL, 'enemy');
    });

    this.engine.pushLog?.('双方预摆防御阵地已就位：这些教学防御卡不会移动、不会攻击。');
  }

  spawnStaticDefense(card, lane, col, team) {
    const cardId = Number(card?.id ?? card?.card_id);
    if (!cardId) return null;
    const unit = this.engine.spawnSummon?.(cardId, lane, col, team, {
      exact: true,
      deployEffect: true,
      preload: true,
      log: false,
    });
    if (!unit) return null;

    unit.tutorialStaticDefense = true;
    unit.moveSpeed = 0;
    unit.atk = 0;
    unit.baseAtk = 0;
    unit.atkSpeed = 0;
    unit.atkTimer = 999999;
    unit.lockedTargetUid = null;
    unit.specialEffect = 0;
    unit.specialAtkEffect = 0;
    const targetHp = team === 'player' ? 360 : 300;
    unit.maxHp = Math.max(targetHp, finite(unit.maxHp, targetHp));
    unit.baseMaxHp = unit.maxHp;
    unit.hp = unit.maxHp;
    return unit;
  }

  mount() {
    document.querySelector('.new-player-tutorial-layer')?.remove();
    const layer = document.createElement('section');
    layer.className = 'new-player-tutorial-layer';
    layer.innerHTML = `
      <div class="new-player-tutorial-focus" aria-hidden="true"></div>
      <div class="new-player-tutorial-panel">
        <div class="new-player-tutorial-progress">
          <span class="new-player-tutorial-step"></span>
          <span class="new-player-tutorial-progress-bar"><i></i></span>
        </div>
        <h2 class="new-player-tutorial-title"></h2>
        <p class="new-player-tutorial-text"></p>
        <div class="new-player-tutorial-hint"></div>
        <div class="new-player-tutorial-continue"></div>
        <div class="new-player-tutorial-actions">
          <button type="button" class="new-player-tutorial-exit">退出教程</button>
          <button type="button" class="new-player-tutorial-next">返回训练营</button>
        </div>
      </div>`;
    document.body.append(layer);

    this.layer = layer;
    this.panel = layer.querySelector('.new-player-tutorial-panel');
    this.focus = layer.querySelector('.new-player-tutorial-focus');
    this.nextButton = layer.querySelector('.new-player-tutorial-next');
    this.nextButton.style.display = 'none';

    layer.querySelector('.new-player-tutorial-exit')?.addEventListener('click', () => {
      this.view.onNavigate?.('training');
    });
  }

  enterStep(index) {
    if (this.destroyed) return;
    const steps = this.steps;
    this.stepIndex = Math.max(0, Math.min(index, steps.length - 1));
    const step = steps[this.stepIndex];

    this.clearDirectHighlights();
    this.engine.cancelPlacing?.();
    this.engine.tutorialPlacementRule = step.mode === 'deploy' ? { ...step.rule } : null;

    if (step.mode !== 'win') {
      this.engine.tutorialBaseProtected = true;
      if (this.engine.status === 'playing') {
        this.engine.enemyHeroMaxHp = PROTECTED_ENEMY_BASE_HP;
        this.engine.enemyHeroHp = PROTECTED_ENEMY_BASE_HP;
      }
    }

    step.enter?.();
    this.renderStep();

    this.view.lastHandKey = '';
    this.view.lastInfoKey = '';
    this.view.lastSkillKey = '';
    this.view.renderHand?.(this.root);
    this.view.renderCardInfo?.(this.root);
    this.view.renderSkillPanel?.(this.root);
    this.view.syncPlaceGridOverlay?.(this.root);
    this.view.syncHud?.(this.root);

    requestAnimationFrame(() => {
      this.applyDirectHighlight();
      this.updateFocus();
    });
  }

  renderStep() {
    const step = this.steps[this.stepIndex];
    if (!step || !this.panel) return;
    const total = this.steps.length;
    const current = this.stepIndex + 1;

    this.panel.dataset.step = step.key;
    this.panel.classList.toggle('is-skill-step', step.mode === 'skill');
    this.panel.classList.remove('complete', 'failure');
    this.panel.querySelector('.new-player-tutorial-step').textContent = `${current}/${total}`;
    this.panel.querySelector('.new-player-tutorial-progress-bar i').style.width = `${(current / total) * 100}%`;
    this.panel.querySelector('.new-player-tutorial-title').textContent = step.title;
    this.panel.querySelector('.new-player-tutorial-text').innerHTML = step.text;
    this.panel.querySelector('.new-player-tutorial-hint').innerHTML = step.hint ?? '';
    this.panel.querySelector('.new-player-tutorial-continue').textContent = step.mode === 'blank'
      ? '点击任意空白位置继续'
      : '';
    this.nextButton.style.display = 'none';
  }

  handButtonForCard(cardId) {
    const index = this.engine.deck?.findIndex((entry) => Number(entry?.card?.id) === Number(cardId)) ?? -1;
    return index >= 0 ? this.root.querySelector(`[data-hand-idx="${index}"]`) : null;
  }

  cellForRule(rule) {
    if (!rule || !Number.isInteger(rule.lane) || !Number.isInteger(rule.col)) return null;
    return this.root.querySelector(`.place-grid-cell[data-lane="${rule.lane}"][data-col="${rule.col}"]`);
  }

  skillButtonForBlizzard() {
    const index = this.engine.skillLoadout?.findIndex((id) => Number(id) === TUTORIAL_CARD_IDS.BLIZZARD) ?? -1;
    return index >= 0 ? this.root.querySelector(`[data-skill-slot="${index}"]`) : null;
  }

  resolveStepTarget() {
    const step = this.steps[this.stepIndex];
    if (!step) return null;

    if (step.mode === 'deploy') {
      const selectedId = Number(this.engine.selectedCard?.id);
      if (selectedId === Number(step.cardId)) {
        const exactCell = this.cellForRule(step.rule);
        if (exactCell) return exactCell;
        return this.root.querySelector('#battle-canvas');
      }
      return this.handButtonForCard(step.cardId) ?? this.root.querySelector('#hand');
    }

    if (step.mode === 'skill') {
      return this.skillButtonForBlizzard() ?? this.root.querySelector('#skill-panel');
    }

    if (typeof step.target === 'function') return step.target();
    if (typeof step.target === 'string') return this.root.querySelector(step.target);
    return null;
  }

  updateFocus() {
    if (!this.focus || this.destroyed) return;
    const target = this.resolveStepTarget();
    if (!(target instanceof Element)) {
      this.focus.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    const pad = target.matches?.('#battle-canvas') ? 4 : 7;
    this.focus.style.display = 'block';
    this.focus.style.left = `${Math.max(3, rect.left - pad)}px`;
    this.focus.style.top = `${Math.max(3, rect.top - pad)}px`;
    this.focus.style.width = `${Math.max(12, rect.width + pad * 2)}px`;
    this.focus.style.height = `${Math.max(12, rect.height + pad * 2)}px`;
  }

  clearDirectHighlights() {
    document.querySelectorAll('.tutorial-direct-highlight').forEach((el) => {
      el.classList.remove('tutorial-direct-highlight');
    });
  }

  applyDirectHighlight() {
    this.clearDirectHighlights();
    const target = this.resolveStepTarget();
    if (target instanceof Element && this.steps[this.stepIndex]?.mode === 'skill') {
      target.classList.add('tutorial-direct-highlight');
    }
  }

  handleBlankPointer(event) {
    if (this.destroyed || this.completed) return;
    const step = this.steps[this.stepIndex];
    if (step?.mode !== 'blank') return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.panel?.contains(target)) return;
    if (target.closest('button, input, select, textarea, a, .deck-slot, .skill-slot')) return;

    event.preventDefault();
    event.stopPropagation();
    this.advance();
  }

  onDeploy({ cardId, lane, col } = {}) {
    if (this.destroyed) return;
    const step = this.steps[this.stepIndex];
    if (step?.mode !== 'deploy') return;
    if (Number(cardId) !== Number(step.cardId)) return;

    const rule = step.rule ?? {};
    if (Number.isInteger(rule.lane) && Number(lane) !== Number(rule.lane)) return;
    if (Number.isInteger(rule.col) && Number(col) !== Number(rule.col)) return;
    if (Array.isArray(rule.allowedCols) && !rule.allowedCols.map(Number).includes(Number(col))) return;

    this.advance();
  }

  spawnRunner() {
    const card = this.view.db?.getById?.(TUTORIAL_CARD_IDS.RUNNER);
    if (!card) return null;
    const col = this.findFreeEnemyCol(MIDDLE_LANE, [11, 10, 9, 8]);
    const unit = this.engine.spawnSummon?.(TUTORIAL_CARD_IDS.RUNNER, MIDDLE_LANE, col, 'enemy', {
      exact: true,
      deployEffect: true,
      preload: true,
      log: false,
    });
    if (!unit) return null;

    unit.tutorialEnemy = true;
    unit.maxHp = Math.min(finite(unit.maxHp, 30), 30);
    unit.baseMaxHp = unit.maxHp;
    unit.hp = unit.maxHp;
    unit.atk = Math.min(Math.max(1, finite(unit.atk, 4)), 4);
    unit.baseAtk = unit.atk;
    this.runnerUids.add(unit.uid);
    this.engine.pushLog?.('蒙斯特族【跑鞋怪】从第三路出现！');
    return unit;
  }

  findFreeEnemyCol(lane, candidates = [11, 10, 9, 8]) {
    for (const col of candidates) {
      if (!(this.engine.getUnitsAt?.(lane, col)?.length)) return col;
    }
    return candidates[candidates.length - 1] ?? 11;
  }

  spawnSlimeWave() {
    if (this.slimeUids.size) return;
    const card = this.view.db?.getById?.(TUTORIAL_CARD_IDS.SLIME);
    if (!card) return;

    for (let lane = 0; lane < 5; lane += 1) {
      for (let n = 0; n < 2; n += 1) {
        const preferred = n === 0 ? [11, 10, 9, 8] : [10, 11, 9, 8];
        const col = this.findFreeEnemyCol(lane, preferred);
        const unit = this.engine.spawnSummon?.(TUTORIAL_CARD_IDS.SLIME, lane, col, 'enemy', {
          exact: true,
          deployEffect: true,
          preload: true,
          log: false,
        });
        if (!unit) continue;

        unit.tutorialEnemy = true;
        unit.tutorialSlime = true;
        unit.maxHp = Math.min(finite(unit.maxHp, 34), 34);
        unit.baseMaxHp = unit.maxHp;
        unit.hp = unit.maxHp;
        unit.atk = Math.min(Math.max(1, finite(unit.atk, 4)), 4);
        unit.baseAtk = unit.atk;
        this.slimeUids.add(unit.uid);
      }
    }

    this.engine.pushLog?.('警报：蒙斯特族在五路各召唤了 2 只软泥怪！');
  }

  prepareBlizzardStep() {
    this.engine.heroMp = this.engine.heroMpMax;
    this.engine.mpTimer = 0;
    if (this.engine.skills?.cooldowns) this.engine.skills.cooldowns[TUTORIAL_CARD_IDS.BLIZZARD] = 0;
    this.blizzardCooldownBefore = finite(this.engine.skills?.cooldowns?.[TUTORIAL_CARD_IDS.BLIZZARD], 0);
    this.view.skillPanelOpen = true;
    this.view.lastSkillKey = '';
    this.view.renderSkillPanel?.(this.root);
  }

  ensureBlizzardVisible() {
    if (this.steps[this.stepIndex]?.mode !== 'skill') return;
    if (!this.view.skillPanelOpen) {
      this.view.skillPanelOpen = true;
      this.view.lastSkillKey = '';
      this.view.renderSkillPanel?.(this.root);
    }
    this.applyDirectHighlight();
  }

  blizzardWasUsed() {
    const cooldown = finite(this.engine.skills?.cooldowns?.[TUTORIAL_CARD_IDS.BLIZZARD], 0);
    return cooldown > this.blizzardCooldownBefore + 0.01;
  }

  slimesCleared() {
    if (!this.slimeUids.size) return false;
    for (const uid of this.slimeUids) {
      if (this.engine.units.some((unit) => unit.uid === uid && unit.alive)) return false;
    }
    return true;
  }

  beginFinalAttack() {
    this.engine.tutorialPlacementRule = null;
    this.engine.tutorialBaseProtected = false;
    this.engine.enemyHeroMaxHp = FINAL_ENEMY_BASE_HP;
    this.engine.enemyHeroHp = FINAL_ENEMY_BASE_HP;
    this.engine.heroHp = Math.max(700, finite(this.engine.heroHp, TUTORIAL_PLAYER_BASE_HP));
    this.engine.pushLog?.('反攻开始：击破蒙斯特基地！');
  }

  monitor() {
    if (this.destroyed || this.completed || !this.engine) return;
    const step = this.steps[this.stepIndex];
    if (!step) return;

    if (step.mode !== 'win' && this.engine.status === 'playing') {
      this.engine.tutorialBaseProtected = true;
      this.engine.enemyHeroMaxHp = PROTECTED_ENEMY_BASE_HP;
      this.engine.enemyHeroHp = PROTECTED_ENEMY_BASE_HP;
    }

    if (this.engine.status === 'lose') {
      this.showFailure();
      return;
    }

    if (step.mode === 'skill') {
      this.ensureBlizzardVisible();
      if (this.blizzardWasUsed()) this.advance();
    } else if (step.mode === 'wait-enemies') {
      if (this.slimesCleared()) this.advance();
    } else if (step.mode === 'win' && this.engine.status === 'win') {
      this.complete();
    }

    this.updateFocus();
  }

  advance() {
    if (this.stepIndex >= this.steps.length - 1) return;
    this.enterStep(this.stepIndex + 1);
  }

  showFailure() {
    if (!this.panel || this.panel.classList.contains('failure')) return;
    window.clearInterval(this.timer);
    this.engine.tutorialPlacementRule = null;
    this.focus.style.display = 'none';
    this.clearDirectHighlights();
    this.panel.classList.add('failure');
    this.panel.querySelector('.new-player-tutorial-step').textContent = '训练失败';
    this.panel.querySelector('.new-player-tutorial-title').textContent = '埃尔夫基地被攻破了';
    this.panel.querySelector('.new-player-tutorial-text').innerHTML = '没关系，勇士。现在你已经看到了失败条件：<b>左侧基地生命归零就会失败</b>。重新整理前排与后排，再试一次就好。';
    this.panel.querySelector('.new-player-tutorial-hint').textContent = '新手教程不会消耗背包卡牌，也不会产生正式关卡损失。';
    this.panel.querySelector('.new-player-tutorial-continue').textContent = '';
    this.nextButton.style.display = '';
    this.nextButton.textContent = '返回训练营';
    this.nextButton.onclick = () => this.view.onNavigate?.('training');
  }

  complete() {
    if (this.completed || this.destroyed) return;
    this.completed = true;
    window.clearInterval(this.timer);
    this.engine.tutorialPlacementRule = null;
    this.clearDirectHighlights();

    try {
      localStorage.setItem(NEW_PLAYER_TUTORIAL_STORAGE_KEY, '1');
    } catch {}

    this.root.querySelector('#result-overlay')?.classList.add('hidden');
    this.focus.style.display = 'none';
    this.panel.classList.add('complete');
    this.panel.querySelector('.new-player-tutorial-step').textContent = '完成';
    this.panel.querySelector('.new-player-tutorial-progress-bar i').style.width = '100%';
    this.panel.querySelector('.new-player-tutorial-title').textContent = '谢谢你，勇士！';
    this.panel.querySelector('.new-player-tutorial-text').innerHTML = '蒙斯特族的进攻被击退了。你已经完成了完整的战斗流程：<b>远程布阵 → 防御阻挡 → 移动反攻 → 地刺前排 → 技能控场 → 3×3 支援 → 守住基地 → 击破敌方基地</b>。';
    this.panel.querySelector('.new-player-tutorial-hint').innerHTML = '埃尔夫族会记住你的帮助。之后可以在训练营继续使用“自由练习”和“卡牌教学”熟悉更多卡牌。';
    this.panel.querySelector('.new-player-tutorial-continue').textContent = '';
    this.nextButton.style.display = '';
    this.nextButton.textContent = '返回训练营';
    this.nextButton.onclick = () => this.view.onNavigate?.('training');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.clearInterval(this.timer);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('pointerdown', this._onBlankPointer, true);
    this.engine && (this.engine.tutorialPlacementRule = null);
    this.clearDirectHighlights();
    this.layer?.remove();
  }
}

export function installNewPlayerTutorial() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderWithStoryTutorial(root) {
    if (isTutorialView(this)) prepareTutorialEngine(this);
    const result = await previousRenderBattle.call(this, root);
    if (isTutorialView(this)) {
      this.__newPlayerTutorial?.destroy?.();
      this.__newPlayerTutorial = new NewPlayerTutorialController(this, root);
      this.__newPlayerTutorial.start();
    }
    return result;
  };

  const previousTryDeployAt = BattleView.prototype.tryDeployAt;
  BattleView.prototype.tryDeployAt = async function tutorialAwareDeploy(root, lane, col, handIndex = this.engine?.selectedHandIndex) {
    const cardId = Number(this.engine?.deck?.[handIndex]?.card?.id);
    const result = await previousTryDeployAt.call(this, root, lane, col, handIndex);
    if (result && isTutorialView(this)) {
      this.__newPlayerTutorial?.onDeploy?.({ cardId, lane, col, handIndex });
    }
    return result;
  };

  const previousUpdateResultOverlay = BattleView.prototype.updateResultOverlay;
  BattleView.prototype.updateResultOverlay = function tutorialResultOverlay(root) {
    if (!isTutorialView(this)) return previousUpdateResultOverlay.call(this, root);
    // 剧情教程不触发普通关卡奖励/任务结算；最终胜利由教程控制器确认。
    root?.querySelector?.('#result-overlay')?.classList.add('hidden');
    return undefined;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyWithStoryTutorial(...args) {
    this.__newPlayerTutorial?.destroy?.();
    this.__newPlayerTutorial = null;
    return previousDestroy.apply(this, args);
  };
}
