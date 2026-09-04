import { BattleView } from '../ui/BattleView.js';
import {
  NEW_PLAYER_TUTORIAL_MARKER,
  NEW_PLAYER_TUTORIAL_STORAGE_KEY,
  getTutorialEnemyCards,
} from './TutorialConfig.js';
import './NewPlayerTutorial.css';

const PATCH_FLAG = Symbol.for('clbwzzz.newPlayerTutorialV1');
const PROTECTED_ENEMY_BASE_HP = 800;
const FINAL_ENEMY_BASE_HP = 260;
const TUTORIAL_PLAYER_BASE_HP = 1200;
const TUTORIAL_RESOURCE_START = 40;

function isTutorialView(view) {
  return Boolean(
    view
      && view.trainingMode
      && String(view.tryUsage ?? '') === NEW_PLAYER_TUTORIAL_MARKER,
  );
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cardName(card) {
  return String(card?.name ?? card?.card_name ?? `卡牌${card?.id ?? ''}`);
}

function prepareTutorialEngine(view) {
  const engine = view?.engine;
  if (!engine || engine.__newPlayerTutorialPrepared) return;
  engine.__newPlayerTutorialPrepared = true;
  engine.tutorialMode = true;

  // BattleEngine 是按 trainingMode 构造的：这样 WaveManager 不会生成普通关卡怪、也不会掉落。
  // 教程开始后关闭 engine.trainingMode，使资源、冷却、MP 与胜负判定全部走真实战斗规则。
  engine.trainingMode = false;
  engine.trainingFreeRes = false;
  engine.lootEnabled = false;
  if (engine.wave) {
    engine.wave.trainingMode = true;
    engine.wave.done = true;
    engine.wave.queue = [];
    engine.wave.totalWaves = 0;
  }

  engine.units = [];
  engine.projectiles = [];
  engine.floats = [];
  engine.deployEffects = [];
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
  engine.pushLog?.('新手教程：摧毁右侧敌方基地即可获胜。');
  engine.pushLog?.('教学卡组为临时卡组，不消耗背包卡牌。');

  view._resultReported = false;
  view._resultAudioPlayed = false;
}

class NewPlayerTutorialController {
  constructor(view, root) {
    this.view = view;
    this.root = root;
    this.engine = view.engine;
    this.stepIndex = 0;
    this.deployedCount = 0;
    this.killGoal = 0;
    this.skillMpBefore = this.engine.heroMp;
    this.destroyed = false;
    this.enemyCards = getTutorialEnemyCards(view.db, 5);
    this._onResize = () => this.updateFocus();
  }

  get steps() {
    return [
      {
        key: 'victory',
        title: '第一步：先知道怎样获胜',
        target: '#orb-enemy-hp',
        text: '战场左边是你的基地，右边是敌方基地。<b>把右侧敌方基地生命打到 0 就获胜</b>；如果左侧自己的基地先归零，就会失败。',
        hint: '教程最后不会自动判你完成，你需要亲手击破右侧基地。',
        manual: true,
      },
      {
        key: 'deploy',
        title: '第二步：放下第一张卡',
        target: '#hand',
        text: '下面是训练营临时提供的教学卡组。点击或拖动任意一张卡，把它放到左侧蓝色可放置区域。',
        hint: '可移动卡通常只能放在靠己方 3 列；不可移动卡可以放在己方 5 列。',
      },
      {
        key: 'combat',
        title: '第三步：让卡牌完成第一次战斗',
        target: '#battle-canvas',
        text: '敌人已经出现。卡牌放下后会自动移动、寻找目标并攻击。前排负责接敌，后排远程更适合安全输出。',
        hint: '击败这个教学敌人后会自动进入下一步。',
      },
      {
        key: 'resource',
        title: '第四步：认识阳光和食物',
        target: '#battle-sun-hud',
        text: '部署卡牌需要消耗资源。植物类主要消耗阳光，怪物类主要消耗食物；正式战斗中资源会按规则自动恢复。现在再放下一张卡。',
        hint: '这一步开始使用真实资源和真实卡牌冷却，不再是训练场的无限资源。',
      },
      {
        key: 'skill',
        title: '第五步：学习技能与 MP',
        target: '#battle-skill',
        text: '点击“技能”，再释放一个可用技能。技能会消耗 MP，并进入冷却。<b>正常战斗中 MP 每 50 秒恢复 10 点</b>。',
        hint: '教程已经给你补满 MP，不需要为了演示在这里等待 50 秒。',
      },
      {
        key: 'defend',
        title: '第六步：守住基地并清理敌人',
        target: '#orb-player-hp',
        text: '现在会再来一小波敌人。注意左侧基地生命值：如果敌人突破你的防线，它们会攻击基地。把这波敌人清掉。',
        hint: '守住自己的基地只是前提；最终仍然要推进并摧毁右侧基地才能赢。',
      },
      {
        key: 'final',
        title: '最终训练：亲手赢下一局',
        target: '#battle-canvas',
        text: '教学保护已经解除。清掉剩余敌人，继续部署和推进，<b>把右侧敌方基地生命打到 0</b>。做到这一点才算完成新手教程。',
        hint: '这一步没有“下一步”按钮；真正取得胜利后教程才会完成。',
      },
    ];
  }

  start() {
    this.mount();
    this.enterStep(0);
    window.addEventListener('resize', this._onResize);
    this.timer = window.setInterval(() => this.monitor(), 120);
  }

  mount() {
    this.root.querySelector('.new-player-tutorial-layer')?.remove();
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
        <div class="new-player-tutorial-actions">
          <button type="button" class="new-player-tutorial-exit">退出教程</button>
          <button type="button" class="new-player-tutorial-next">我明白了</button>
        </div>
      </div>`;
    document.body.append(layer);
    this.layer = layer;
    this.panel = layer.querySelector('.new-player-tutorial-panel');
    this.focus = layer.querySelector('.new-player-tutorial-focus');
    this.nextButton = layer.querySelector('.new-player-tutorial-next');

    layer.querySelector('.new-player-tutorial-exit')?.addEventListener('click', () => {
      this.view.onNavigate?.('training');
    });
    this.nextButton?.addEventListener('click', () => {
      const step = this.steps[this.stepIndex];
      if (step?.manual) this.advance();
    });
  }

  enterStep(index) {
    if (this.destroyed) return;
    this.stepIndex = Math.max(0, Math.min(index, this.steps.length - 1));
    const step = this.steps[this.stepIndex];

    if (step.key !== 'final' && this.engine.status === 'playing') {
      // 最终训练前敌方基地处于教学保护状态，避免玩家边看教程边提前把基地打爆。
      this.engine.enemyHeroMaxHp = PROTECTED_ENEMY_BASE_HP;
      this.engine.enemyHeroHp = PROTECTED_ENEMY_BASE_HP;
    }

    if (step.key === 'combat') {
      this.killGoal = finite(this.engine.killsThisBattle) + 1;
      this.spawnWeakEnemies(1);
    } else if (step.key === 'resource') {
      this.engine.sunlight = TUTORIAL_RESOURCE_START;
      this.engine.food = TUTORIAL_RESOURCE_START;
      this.engine.resourceTimer = 0;
    } else if (step.key === 'skill') {
      this.engine.heroMp = this.engine.heroMpMax;
      this.engine.mpTimer = 0;
      this.skillMpBefore = this.engine.heroMp;
      if (this.engine.skills?.cooldowns) this.engine.skills.cooldowns = {};
      this.view.skillPanelOpen = false;
      this.view.lastSkillKey = '';
      this.view.renderSkillPanel?.(this.root);
    } else if (step.key === 'defend') {
      this.killGoal = finite(this.engine.killsThisBattle) + 2;
      this.engine.heroHp = Math.max(this.engine.heroHp, 900);
      this.spawnWeakEnemies(2);
    } else if (step.key === 'final') {
      this.engine.heroHp = Math.max(this.engine.heroHp, 800);
      this.engine.enemyHeroMaxHp = FINAL_ENEMY_BASE_HP;
      this.engine.enemyHeroHp = FINAL_ENEMY_BASE_HP;
      this.spawnWeakEnemies(3, 1);
    }

    this.renderStep();
    this.view.lastHandKey = '';
    this.view.lastInfoKey = '';
    this.view.lastSkillKey = '';
    this.view.renderHand?.(this.root);
    this.view.renderCardInfo?.(this.root);
    this.view.syncHud?.(this.root);
    requestAnimationFrame(() => this.updateFocus());
  }

  renderStep() {
    const step = this.steps[this.stepIndex];
    if (!step || !this.panel) return;
    const total = this.steps.length;
    const current = this.stepIndex + 1;
    this.panel.querySelector('.new-player-tutorial-step').textContent = `${current}/${total}`;
    this.panel.querySelector('.new-player-tutorial-progress-bar i').style.width = `${(current / total) * 100}%`;
    this.panel.querySelector('.new-player-tutorial-title').textContent = step.title;
    this.panel.querySelector('.new-player-tutorial-text').innerHTML = step.text;
    this.panel.querySelector('.new-player-tutorial-hint').innerHTML = step.hint ?? '';
    this.nextButton.style.display = step.manual ? '' : 'none';
    this.panel.classList.remove('complete');
    this.updateFocus();
  }

  updateFocus() {
    if (!this.focus || this.destroyed) return;
    const step = this.steps[this.stepIndex];
    const target = step?.target ? this.root.querySelector(step.target) : null;
    if (!(target instanceof Element)) {
      this.focus.style.display = 'none';
      return;
    }
    const rect = target.getBoundingClientRect();
    const pad = step?.target === '#battle-canvas' ? 5 : 7;
    this.focus.style.display = 'block';
    this.focus.style.left = `${Math.max(3, rect.left - pad)}px`;
    this.focus.style.top = `${Math.max(3, rect.top - pad)}px`;
    this.focus.style.width = `${Math.max(12, rect.width + pad * 2)}px`;
    this.focus.style.height = `${Math.max(12, rect.height + pad * 2)}px`;
  }

  onDeploy() {
    this.deployedCount += 1;
  }

  skillWasUsed() {
    if (finite(this.engine.heroMp, this.engine.heroMpMax) < this.skillMpBefore) return true;
    return Object.values(this.engine.skills?.cooldowns ?? {}).some((value) => finite(value) > 0);
  }

  monitor() {
    if (this.destroyed || !this.engine) return;
    const step = this.steps[this.stepIndex];
    if (!step) return;

    if (step.key !== 'final' && this.engine.status === 'playing') {
      this.engine.enemyHeroMaxHp = PROTECTED_ENEMY_BASE_HP;
      this.engine.enemyHeroHp = PROTECTED_ENEMY_BASE_HP;
    }

    if (this.engine.status === 'lose') {
      this.showFailure();
      return;
    }

    if (step.key === 'deploy' && this.deployedCount >= 1) {
      this.advance();
    } else if (step.key === 'combat' && finite(this.engine.killsThisBattle) >= this.killGoal) {
      this.advance();
    } else if (step.key === 'resource' && this.deployedCount >= 2) {
      this.advance();
    } else if (step.key === 'skill' && this.skillWasUsed()) {
      this.advance();
    } else if (step.key === 'defend' && finite(this.engine.killsThisBattle) >= this.killGoal) {
      this.advance();
    } else if (step.key === 'final' && this.engine.status === 'win') {
      this.complete();
    }

    this.updateFocus();
  }

  advance() {
    if (this.stepIndex >= this.steps.length - 1) return;
    this.enterStep(this.stepIndex + 1);
  }

  spawnWeakEnemies(count, strength = 0) {
    if (!this.enemyCards.length) return;
    const lanes = [2, 1, 3, 0, 4];
    for (let index = 0; index < count; index += 1) {
      const card = this.enemyCards[(finite(this.engine.killsThisBattle) + index) % this.enemyCards.length];
      const lane = lanes[(this.stepIndex + index) % lanes.length];
      const before = new Set(this.engine.units.map((unit) => unit.uid));
      const placed = this.engine.placeEnemyUnit?.(card, lane, false, 10);
      if (!placed) continue;
      const unit = [...this.engine.units].reverse().find(
        (entry) => entry.team === 'enemy' && !before.has(entry.uid),
      );
      if (!unit) continue;

      const hp = 55 + strength * 18 + index * 8;
      unit.maxHp = Math.min(finite(unit.maxHp, hp), hp);
      unit.baseMaxHp = unit.maxHp;
      unit.hp = unit.maxHp;
      unit.atk = Math.min(Math.max(1, finite(unit.atk, 6)), 7 + strength * 2);
      unit.baseAtk = unit.atk;
      unit.tutorialEnemy = true;
      this.engine.pushLog?.(`教学敌人【${cardName(card)}】出现`);
    }
  }

  showFailure() {
    if (!this.panel || this.panel.dataset.failure === '1') return;
    this.panel.dataset.failure = '1';
    this.focus.style.display = 'none';
    this.panel.classList.add('complete');
    this.panel.querySelector('.new-player-tutorial-title').textContent = '基地被攻破了';
    this.panel.querySelector('.new-player-tutorial-text').innerHTML = '这正是失败条件：<b>左侧自己的基地生命归零</b>。回训练营重新开始，再尝试用前排挡住敌人。';
    this.panel.querySelector('.new-player-tutorial-hint').textContent = '教程不会扣除奖励、体力或背包资源。';
    this.nextButton.style.display = '';
    this.nextButton.textContent = '返回训练营';
    this.nextButton.onclick = () => this.view.onNavigate?.('training');
  }

  complete() {
    if (this.completed || this.destroyed) return;
    this.completed = true;
    window.clearInterval(this.timer);
    try {
      localStorage.setItem(NEW_PLAYER_TUTORIAL_STORAGE_KEY, '1');
    } catch {}

    this.root.querySelector('#result-overlay')?.classList.add('hidden');
    this.focus.style.display = 'none';
    this.panel.classList.add('complete');
    this.panel.querySelector('.new-player-tutorial-step').textContent = '完成';
    this.panel.querySelector('.new-player-tutorial-progress-bar i').style.width = '100%';
    this.panel.querySelector('.new-player-tutorial-title').textContent = '新手训练完成！';
    this.panel.querySelector('.new-player-tutorial-text').innerHTML = '你已经亲手完成了完整胜利流程：<b>部署卡牌 → 消耗资源 → 自动战斗 → 使用技能 → 防守基地 → 击破敌方基地</b>。';
    this.panel.querySelector('.new-player-tutorial-hint').innerHTML = '之后可以继续用“自由练习”和“卡牌教学”熟悉特殊卡牌。正式战斗中 MP 仍按 <b>每 50 秒恢复 10 点</b>执行。';
    this.nextButton.style.display = '';
    this.nextButton.textContent = '返回训练营';
    this.nextButton.onclick = () => this.view.onNavigate?.('training');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.clearInterval(this.timer);
    window.removeEventListener('resize', this._onResize);
    this.layer?.remove();
  }
}

export function installNewPlayerTutorial() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderWithNewPlayerTutorial(root) {
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
  BattleView.prototype.tryDeployAt = async function tutorialAwareDeploy(...args) {
    const result = await previousTryDeployAt.apply(this, args);
    if (result && isTutorialView(this)) this.__newPlayerTutorial?.onDeploy?.();
    return result;
  };

  const previousUpdateResultOverlay = BattleView.prototype.updateResultOverlay;
  BattleView.prototype.updateResultOverlay = function tutorialResultOverlay(root) {
    if (!isTutorialView(this)) return previousUpdateResultOverlay.call(this, root);
    // 新手教程不发普通关卡奖励/任务完成事件，最终由教程控制器确认“真实击破基地”。
    root?.querySelector?.('#result-overlay')?.classList.add('hidden');
    return undefined;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyWithNewPlayerTutorial(...args) {
    this.__newPlayerTutorial?.destroy?.();
    this.__newPlayerTutorial = null;
    return previousDestroy.apply(this, args);
  };
}
