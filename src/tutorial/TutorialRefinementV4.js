import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleView } from '../ui/BattleView.js';
import './TutorialRefinementV4.css';

const PATCH_FLAG = Symbol.for('clbwzzz.tutorialRefinementV4');
const TUTORIAL_MARKER = '__clbwz_new_player_tutorial_v1__';
const BLANK_BUFFER_MS = 3000;
const FINAL_FOCUS_MS = 3000;

function isTutorialView(view) {
  return Boolean(
    view
      && view.trainingMode
      && String(view.tryUsage ?? '') === TUTORIAL_MARKER,
  );
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function currentStep(controller) {
  return controller?.steps?.[controller.stepIndex] ?? null;
}

function matchesRule(payload, step) {
  if (!step || step.mode !== 'deploy') return false;
  const rule = step.rule ?? {};
  if (Number(payload?.cardId) !== Number(step.cardId)) return false;
  if (Number.isInteger(rule.lane) && Number(payload?.lane) !== Number(rule.lane)) return false;
  if (Number.isInteger(rule.col) && Number(payload?.col) !== Number(rule.col)) return false;
  if (Array.isArray(rule.allowedCols) && !rule.allowedCols.map(Number).includes(Number(payload?.col))) return false;
  return true;
}

function unitMatchesRule(unit, step) {
  if (!unit?.alive || unit.team !== 'player' || unit.tutorialStaticDefense === true) return false;
  const rule = step?.rule ?? {};
  if (Number(unit.cardId) !== Number(step?.cardId)) return false;
  if (Number.isInteger(rule.lane) && Number(unit.lane) !== Number(rule.lane)) return false;

  // 固定格教学必须仍在该格；可移动卡可能已经向前走，所以 allowedCols 步骤只要求同路且卡牌正确。
  if (Number.isInteger(rule.col) && Number(unit.col) !== Number(rule.col)) return false;
  if (Array.isArray(rule.allowedCols) && finite(unit.moveSpeed, 0) <= 0) {
    if (!rule.allowedCols.map(Number).includes(Number(unit.col))) return false;
  }
  return true;
}

function hasAlreadyCompletedPlacement(controller, step) {
  if (!step || step.mode !== 'deploy') return false;
  if ((controller.__v4DeployHistory ?? []).some((item) => matchesRule(item, step))) return true;
  return (controller.engine?.units ?? []).some((unit) => unitMatchesRule(unit, step));
}

function ensureShortcutLine(controller) {
  const panel = controller?.panel;
  if (!panel) return null;
  let line = panel.querySelector('.new-player-tutorial-shortcuts');
  if (!line) {
    line = document.createElement('div');
    line.className = 'new-player-tutorial-shortcuts';
    const actions = panel.querySelector('.new-player-tutorial-actions');
    if (actions) panel.insertBefore(line, actions);
    else panel.append(line);
  }
  return line;
}

function updateContinueCountdown(controller) {
  const step = currentStep(controller);
  const continueEl = controller?.panel?.querySelector?.('.new-player-tutorial-continue');
  if (!continueEl || step?.mode !== 'blank') return;

  const left = Math.max(0, finite(controller.__v4BlankUnlockAt, 0) - performance.now());
  if (left > 0) {
    continueEl.textContent = `请先观察一下战场……${Math.ceil(left / 1000)} 秒后可点击空白位置继续`;
    controller.panel?.classList.add('tutorial-buffer-locked');
  } else {
    continueEl.textContent = '点击战场任意空白位置继续';
    controller.panel?.classList.remove('tutorial-buffer-locked');
  }
}

function configureStep(controller, view) {
  const step = currentStep(controller);
  if (!step || !view?.engine) return;

  // 剧情/说明和技能指定步骤禁止提前摆未来卡牌；清怪与最终反攻允许自由补线。
  view.engine.tutorialPlacementLocked = step.mode === 'blank' || step.mode === 'skill';

  if (step.mode === 'blank') {
    controller.__v4BlankUnlockAt = performance.now() + BLANK_BUFFER_MS;
  } else {
    controller.__v4BlankUnlockAt = 0;
    controller.panel?.classList.remove('tutorial-buffer-locked');
  }

  controller.__v4FinalFocusUntil = step.key === 'final'
    ? performance.now() + FINAL_FOCUS_MS
    : Number.POSITIVE_INFINITY;

  const shortcut = ensureShortcutLine(controller);
  if (shortcut) {
    if (step.mode === 'deploy') {
      shortcut.innerHTML = '<kbd>1-6</kbd> 选择教学卡牌　·　<kbd>空格</kbd> 按当前教学推荐位置快捷放置';
      shortcut.style.display = '';
    } else if (step.mode === 'win') {
      shortcut.innerHTML = '<kbd>1-6</kbd> 选择卡牌　·　<kbd>空格</kbd> 将当前卡牌快捷放到一个可用位置';
      shortcut.style.display = '';
    } else {
      shortcut.textContent = '';
      shortcut.style.display = 'none';
    }
  }

  updateContinueCountdown(controller);

  // 兼容旧版本中“玩家提前把后续教学卡放下”造成的死步骤：
  // 一旦进入对应步骤，发现要求已经满足，就自动认定完成，不再要求玩家重复放一张。
  if (step.mode === 'deploy' && hasAlreadyCompletedPlacement(controller, step)) {
    const stepIndex = controller.stepIndex;
    window.setTimeout(() => {
      if (
        !controller.destroyed
        && controller.stepIndex === stepIndex
        && hasAlreadyCompletedPlacement(controller, currentStep(controller))
      ) {
        controller.advance?.();
      }
    }, 220);
  }
}

function chooseRuleCell(view, handIndex, rule = null) {
  const engine = view?.engine;
  if (!engine) return null;

  const laneOrder = Number.isInteger(rule?.lane)
    ? [Number(rule.lane)]
    : [2, 1, 3, 0, 4];

  let colOrder;
  if (Number.isInteger(rule?.col)) colOrder = [Number(rule.col)];
  else if (Array.isArray(rule?.allowedCols) && rule.allowedCols.length) colOrder = rule.allowedCols.map(Number);
  else colOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  for (const lane of laneOrder) {
    for (const col of colOrder) {
      if (engine.canDeploy?.(lane, col, handIndex, { silent: true })) {
        return { lane, col };
      }
    }
  }
  return null;
}

async function quickDeploy(view, controller) {
  const step = currentStep(controller);
  const engine = view?.engine;
  if (!step || !engine || engine.status !== 'playing') return;

  let handIndex = -1;
  let rule = null;

  if (step.mode === 'deploy') {
    handIndex = engine.deck?.findIndex((entry) => Number(entry?.card?.id) === Number(step.cardId)) ?? -1;
    rule = step.rule ?? null;
  } else if (step.mode === 'win') {
    handIndex = Number.isInteger(engine.selectedHandIndex) ? engine.selectedHandIndex : -1;
    if (handIndex < 0 || handIndex >= (engine.deck?.length ?? 0)) handIndex = 0;
  } else {
    return;
  }

  if (handIndex < 0 || !engine.deck?.[handIndex]?.card) return;

  engine.skills?.cancelTargeting?.();
  engine.skillTargetError = '';
  engine.selectCard?.(handIndex);
  engine.lastDeployError = '';

  let cell = chooseRuleCell(view, handIndex, rule);

  // 最终反攻时若当前卡暂时无法放置（资源/冷却/位置），尝试下一张当前可用卡。
  if (!cell && step.mode === 'win') {
    for (let index = 0; index < (engine.deck?.length ?? 0); index += 1) {
      engine.selectCard?.(index);
      cell = chooseRuleCell(view, index, null);
      if (cell) {
        handIndex = index;
        break;
      }
    }
  }

  if (!cell) {
    engine.lastDeployError = '当前没有可快捷放置的位置，稍等资源或冷却后再试';
    view.lastInfoKey = '';
    view.renderCardInfo?.(view.viewRoot);
    return;
  }

  view.lastHandKey = '';
  view.lastInfoKey = '';
  view.renderHand?.(view.viewRoot);
  view.renderCardInfo?.(view.viewRoot);
  view.syncPlaceGridOverlay?.(view.viewRoot);
  await view.tryDeployAt?.(view.viewRoot, cell.lane, cell.col, handIndex);
}

function refineController(view, attempt = 0) {
  const controller = view?.__newPlayerTutorial;
  if (!controller) {
    if (attempt < 30) window.setTimeout(() => refineController(view, attempt + 1), 16);
    return;
  }
  if (controller.__v4Refined) return;
  controller.__v4Refined = true;
  controller.__v4DeployHistory = [];

  const originalEnterStep = controller.enterStep.bind(controller);
  controller.enterStep = function enterStepV4(index) {
    const result = originalEnterStep(index);
    configureStep(this, view);
    return result;
  };

  const originalOnDeploy = controller.onDeploy.bind(controller);
  controller.onDeploy = function onDeployV4(payload = {}) {
    this.__v4DeployHistory.push({
      cardId: Number(payload.cardId),
      lane: Number(payload.lane),
      col: Number(payload.col),
      at: performance.now(),
    });
    return originalOnDeploy(payload);
  };

  const originalBlankPointer = controller.handleBlankPointer.bind(controller);
  controller.handleBlankPointer = function handleBlankPointerV4(event) {
    const step = currentStep(this);
    if (step?.mode === 'blank' && performance.now() < finite(this.__v4BlankUnlockAt, 0)) {
      const target = event?.target;
      if (target instanceof Element && this.panel?.contains(target)) {
        return originalBlankPointer(event);
      }
      event?.preventDefault?.();
      event?.stopImmediatePropagation?.();
      this.panel?.classList.remove('tutorial-buffer-bump');
      void this.panel?.offsetWidth;
      this.panel?.classList.add('tutorial-buffer-bump');
      updateContinueCountdown(this);
      return undefined;
    }
    return originalBlankPointer(event);
  };

  const originalUpdateFocus = controller.updateFocus.bind(controller);
  controller.updateFocus = function updateFocusV4() {
    const step = currentStep(this);
    if (step?.key === 'final' && performance.now() >= finite(this.__v4FinalFocusUntil, 0)) {
      if (this.focus) this.focus.style.display = 'none';
      return;
    }
    return originalUpdateFocus();
  };

  const originalMonitor = controller.monitor.bind(controller);
  controller.monitor = function monitorV4() {
    updateContinueCountdown(this);
    return originalMonitor();
  };

  const shortcutHandler = (event) => {
    if (controller.destroyed || controller.completed) return;
    const target = event.target;
    if (target instanceof HTMLElement && (
      target.matches('input, textarea, select')
      || target.isContentEditable
      || Boolean(target.closest?.('.battle-chat-shell'))
    )) return;

    if (event.code !== 'Space') return;
    const step = currentStep(controller);
    if (!step || !['deploy', 'win'].includes(step.mode)) return;

    event.preventDefault();
    event.stopPropagation();
    void quickDeploy(view, controller);
  };
  controller.__v4ShortcutHandler = shortcutHandler;
  document.addEventListener('keydown', shortcutHandler, true);

  const originalDestroy = controller.destroy.bind(controller);
  controller.destroy = function destroyV4() {
    document.removeEventListener('keydown', shortcutHandler, true);
    if (view?.engine) view.engine.tutorialPlacementLocked = false;
    return originalDestroy();
  };

  // start() 在本补丁接管前已经进入第 1 步，因此补一次当前步骤配置。
  configureStep(controller, view);
}

if (!globalThis[PATCH_FLAG]) {
  globalThis[PATCH_FLAG] = true;

  // 教程说明步骤锁定摆卡；部署步骤仍由原 TutorialPlacementRule 精确限制卡牌/行列。
  const previousCanDeploy = BattleEngine.prototype.canDeploy;
  BattleEngine.prototype.canDeploy = function canDeployWithTutorialPacing(
    lane,
    col,
    handIndex = this.selectedHandIndex,
    options = {},
  ) {
    if (this?.tutorialMode === true && this?.tutorialPlacementLocked === true) {
      if (!options?.silent) {
        this.lastDeployError = '勇士，请先完成当前引导，再继续召唤卡牌。';
      }
      return false;
    }
    return previousCanDeploy.call(this, lane, col, handIndex, options);
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderTutorialRefinementV4(root) {
    if (isTutorialView(this)) {
      // 剧情新手教程固定使用 grassbg.png，不跟随自由练习的背景选择。
      this.trainingMap = 'grass';
    }

    const result = await previousRenderBattle.call(this, root);
    if (isTutorialView(this)) {
      window.setTimeout(() => refineController(this), 0);
    }
    return result;
  };
}
