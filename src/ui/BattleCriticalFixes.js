import { BattleEngine } from '../battle/BattleEngine.js';
import { usesFoodCost } from '../battle/BattleConfig.js';
import { calculateCardStats } from '../battle/CardStatFormula.js';
import { formatCraftCardName, resolveCraftQuality } from '../core/constants.js';
import { BattleView } from './BattleView.js';
import { DeckSelectView } from './DeckSelectView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleCriticalFixes');

function makeTransparentDragImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, 1, 1);
  return canvas;
}

function resetBattleTransientState(view) {
  view.stopLoop();
  view.lastStatus = 'playing';
  view.lastHandKey = '';
  view.lastInfoKey = '';
  view.lastSkillKey = '';
  view.dragHandIndex = null;
  view.dropSucceeded = false;
  view.suppressCanvasClickUntil = 0;
  view.stopDragGhostAnim?.();
  view.viewRoot?.querySelector('#drag-ghost')?.classList.add('hidden');
}

function createBattleEngine(view, stageId, trainingMode) {
  return new BattleEngine(view.db, stageId, view.deckSlots, view.cardInventory, {
    skillLoadout: view.heroSkills?.getLoadout() ?? [],
    heroMpMax: view.heroSkills?.getMpMax() ?? 100,
    trainingMode,
    boss: view.boss ?? null,
  });
}

function renderExactCardInfo(root) {
  const entry = this.engine?.selectedEntry;
  const card = entry?.card;
  const panel = root?.querySelector?.('#card-info');
  const tip = root?.querySelector?.('#deploy-tip');
  if (!panel) return;

  if (!card || !this.engine.placingActive) {
    const actionTip = this.getActionTip();
    panel.innerHTML = actionTip
      ? `<span class="card-info-hint-skill">${actionTip}</span>`
      : '<span class="card-info-hint-idle">点击或拖拽卡槽中的卡牌进行放置 · 技能键 Q/W/E/R/T/Y</span>';
    if (tip) {
      tip.textContent = actionTip;
      tip.classList.toggle('visible', Boolean(actionTip));
    }
    return;
  }

  const instance = entry.instance;
  const craftQuality = Number(instance?.craftQuality ?? 2);
  const stars = Number(instance?.star ?? instance?.strengthLv ?? 0);
  const stats = calculateCardStats(card, craftQuality, stars);
  const quality = resolveCraftQuality(craftQuality);
  const displayName = formatCraftCardName(craftQuality, card.name);
  const costLabel = usesFoodCost(card) ? `🍖${card.cost}` : `☀${card.cost}`;
  const handIndex = this.engine.selectedHandIndex;
  const cooldown = handIndex != null ? (this.engine.cooldowns[handIndex] ?? 0) : 0;
  const cost = this.engine.getDeployCost(card);
  const canDeploy = this.engine.trainingMode
    || (this.engine.sunlight >= cost.sun && this.engine.food >= cost.food && cooldown <= 0);
  const isMovable = card.moveSpeed > 0;

  panel.innerHTML = `
    <img class="card-info-thumb" src="/sprites/cards/${card.spriteRes}.png" alt="" />
    <div class="card-info-text">
      <strong style="color:${quality.color}">${displayName}</strong>
      <span>⚔${stats.atk} ❤${stats.hp} ${costLabel} · CD ${stats.cd}s${stars > 0 ? ` · ${stars}星` : ''}</span>
      <em>${canDeploy ? (isMovable ? '拖到左侧1-3列' : '拖到左侧1-5列') : cooldown > 0 ? `冷却${cooldown.toFixed(0)}s` : '资源不足'}</em>
    </div>`;

  if (tip) {
    const actionTip = this.getActionTip();
    tip.textContent = actionTip;
    tip.classList.toggle('visible', Boolean(actionTip));
  }
}

export function installBattleCriticalFixes() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const transparentDragImage = makeTransparentDragImage();
  /* 冒泡到 document 后执行，确保覆盖 BattleView 原 dragstart 中临时 Image 的设置。 */
  document.addEventListener('dragstart', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('#hand [data-hand-idx]')) return;
    try {
      event.dataTransfer?.setDragImage(transparentDragImage, 0, 0);
    } catch {
      // 某些浏览器不允许在非原生拖拽对象上设置预览，忽略即可。
    }
  });

  const originalDeploy = BattleEngine.prototype.deploy;
  BattleEngine.prototype.deploy = async function deployWithExactCooldown(lane, col, handIndex = this.selectedHandIndex) {
    const entry = this.deck?.[handIndex];
    const result = await originalDeploy.call(this, lane, col, handIndex);
    if (result && !this.trainingMode && entry?.card) {
      const instance = entry.instance
        ?? (entry.bagIndex >= 0 ? this.cardInventory?.getSlots?.()?.[entry.bagIndex] : null)
        ?? null;
      const stats = calculateCardStats(
        entry.card,
        instance?.craftQuality ?? 2,
        instance?.star ?? instance?.strengthLv ?? 0,
      );
      this.cooldowns[handIndex] = stats.cd;
    }
    return result;
  };

  BattleView.prototype.enterBattle = async function enterBattleFixed(
    deckSlots,
    stageId,
    { trainingMode = false, boss = null } = {},
  ) {
    this.deckSlots = deckSlots;
    this.stageId = stageId;
    this.trainingMode = trainingMode;
    this.boss = boss ?? this.boss ?? null;
    DeckSelectView.saveDeck(deckSlots, this.cardInventory);
    this.phase = 'fighting';
    this.engine = createBattleEngine(this, stageId, trainingMode);
    await this.renderBattle(this.viewRoot);
  };

  BattleView.prototype.restartBattle = async function restartBattleFixed(stageId) {
    resetBattleTransientState(this);
    this.engine = createBattleEngine(this, stageId, this.trainingMode);
    this.buildPlaceGridOverlay(this.viewRoot);
    void this.renderer?.preloadForEngine(this.engine);
    this.renderHand(this.viewRoot);
    this.renderCardInfo(this.viewRoot);
    this.renderSkillPanel(this.viewRoot);
    this.syncHud(this.viewRoot);
    const nameElement = this.viewRoot?.querySelector('#orb-enemy-name');
    if (nameElement) nameElement.textContent = this.engine.stage.enemy_name ?? '敌方';
    const picker = this.viewRoot?.querySelector('#stage-picker');
    if (picker) picker.value = String(stageId);
    const waveTotal = this.viewRoot?.querySelector('#wave-total');
    if (waveTotal) waveTotal.textContent = String(this.engine.totalWaves);
    this.viewRoot?.querySelector('#result-overlay')?.classList.add('hidden');
    this.startLoop();
  };

  BattleView.prototype.renderCardInfo = renderExactCardInfo;
}
