import { BattleView } from './BattleView.js';
import { getSkillEffect, getSkillMpCost } from '../core/SkillRegistry.js';
import { audio } from '../core/AudioManager.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpAuthorityResourceFinal');
const COLS = 12;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function localTarget(view, target) {
  if (!target) return null;
  return {
    lane: Number(target.lane),
    col: String(view.pvp?.team || 'blue') === 'red'
      ? COLS - 1 - Number(target.col)
      : Number(target.col),
  };
}

function canonicalTarget(view, target) {
  if (!target) return null;
  return {
    lane: Number(target.lane),
    col: String(view.pvp?.team || 'blue') === 'red'
      ? COLS - 1 - Number(target.col)
      : Number(target.col),
  };
}

function applyAuthorityState(view, snapshot) {
  if (!view?.pvp || !view.engine || !snapshot) return;
  // 观战没有个人资源/技能，也不渲染手牌技能 UI。
  if (view.pvp?.spectator) return;
  const resources = snapshot.resources;
  if (resources) {
    view.engine.sunlight = Math.max(0, finite(resources.sun, view.engine.sunlight));
    view.engine.food = Math.max(0, finite(resources.food, view.engine.food));
  }

  const skill = snapshot.skill;
  if (skill) {
    view.engine.heroMp = Math.max(0, finite(skill.mp, view.engine.heroMp));
    view.engine.heroMpMax = Math.max(1, finite(skill.maxMp, view.engine.heroMpMax));
    if (Array.isArray(skill.loadout)) view.engine.skillLoadout = [...skill.loadout];
    if (view.engine.skills) view.engine.skills.cooldowns = { ...(skill.cooldowns ?? {}) };
    if (skill.deployCooldowns && view.engine.deck) {
      for (let index = 0; index < view.engine.deck.length; index += 1) {
        const cardId = Number(view.engine.deck[index]?.card?.id);
        if (!Number.isFinite(cardId)) continue;
        view.engine.cooldowns[index] = Math.max(0, finite(skill.deployCooldowns[String(cardId)], 0));
      }
    }
  }

  view.lastHandKey = '';
  view.lastInfoKey = '';
  view.lastSkillKey = '';
  if (view.viewRoot) {
    view.renderHand(view.viewRoot);
    view.renderCardInfo(view.viewRoot);
    view.renderSkillPanel(view.viewRoot);
    view.syncHud(view.viewRoot);
  }
}

function showAuthoritySkill(view, payload = {}) {
  if (!view.engine?.skills) return;
  const skillId = Number(payload.skillId);
  const effect = getSkillEffect(skillId);
  if (!effect) return;
  const target = localTarget(view, payload.target);
  view.engine.skills.showEffect(skillId, effect, target);
  audio.playSkill(skillId);
  view.lastSkillKey = '';
  view.lastInfoKey = '';
  if (view.viewRoot) {
    view.renderSkillPanel(view.viewRoot);
    view.renderCardInfo(view.viewRoot);
  }
}

function startVisualFxLoop(view) {
  if (view.__pvpAuthorityFxRaf) cancelAnimationFrame(view.__pvpAuthorityFxRaf);
  view.__pvpAuthorityFxRaf = null;
}

async function sendSkillCast(view, skillId, target = null) {
  if (view.__pvpSkillPending) return false;
  view.__pvpSkillPending = true;
  try {
    const response = await view.pvpSocket.emitAck('pvp:authority:cast-skill', {
      skillId: Number(skillId),
      target: canonicalTarget(view, target),
    });
    view.engine.skills?.cancelTargeting?.();
    view.engine.skillTargetError = '';
    applyAuthorityState(view, response?.snapshot ?? view.__pvpLatestSnapshot);
    return true;
  } catch (error) {
    view.engine.skillTargetError = error?.message || '技能释放失败';
    view.lastInfoKey = '';
    if (view.viewRoot) view.renderCardInfo(view.viewRoot);
    return false;
  } finally {
    view.__pvpSkillPending = false;
  }
}

function installSkillTargetCapture(view) {
  const canvas = view.viewRoot?.querySelector?.('#battle-canvas');
  if (!canvas || view.__pvpSkillCaptureHandler) return;
  view.__pvpSkillCaptureCanvas = canvas;
  view.__pvpSkillCaptureHandler = (event) => {
    if (!view.__pvpAuthorityActive || !view.isSkillTargeting?.()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const { lane, col } = view.pointerToCell(event, canvas);
    if (lane < 0 || col < 0) return;
    const skillId = view.engine.skills?.pendingSkillId;
    if (!skillId) return;
    view.blockCanvasClick?.(400);
    void sendSkillCast(view, skillId, { lane, col });
  };
  canvas.addEventListener('click', view.__pvpSkillCaptureHandler, true);
}

function removeSkillTargetCapture(view) {
  if (view.__pvpSkillCaptureCanvas && view.__pvpSkillCaptureHandler) {
    view.__pvpSkillCaptureCanvas.removeEventListener('click', view.__pvpSkillCaptureHandler, true);
  }
  view.__pvpSkillCaptureCanvas = null;
  view.__pvpSkillCaptureHandler = null;
}

function installResourceSync(view) {
  if (!view.pvp || !view.__pvpAuthorityActive || view.__pvpResourceSyncInstalled) return;
  if (view.pvp.spectator) return; // 观战不连接个人资源/技能
  view.__pvpResourceSyncInstalled = true;

  if (view.pvpSocket?.on) {
    view.__pvpResourceSnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => applyAuthorityState(view, snapshot));
    view.__pvpResourceFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => applyAuthorityState(view, snapshot));
    view.__pvpSkillCastUnsub = view.pvpSocket.on('pvp:authority:skill-cast', (payload) => showAuthoritySkill(view, payload));
  }

  installSkillTargetCapture(view);
  startVisualFxLoop(view);
  requestAnimationFrame(() => applyAuthorityState(view, view.__pvpLatestSnapshot));
  setTimeout(() => applyAuthorityState(view, view.__pvpLatestSnapshot), 150);

  if (view.pvpSocket?.emitAck) {
    // maxMp 只能由服务器账号/天赋状态推导，客户端不再上报一个可篡改数字。
    void view.pvpSocket.emitAck('pvp:authority:set-loadout', {
      loadout: [...(view.engine?.skillLoadout ?? [])],
    }).then((response) => applyAuthorityState(view, response?.snapshot ?? view.__pvpLatestSnapshot))
      .catch((error) => {
        view.engine.skillTargetError = error?.message || '技能配置同步失败';
        view.lastInfoKey = '';
        if (view.viewRoot) view.renderCardInfo(view.viewRoot);
      });
  }
}

function cleanupResourceSync(view) {
  view.__pvpResourceSnapshotUnsub?.();
  view.__pvpResourceFinishedUnsub?.();
  view.__pvpSkillCastUnsub?.();
  view.__pvpResourceSnapshotUnsub = null;
  view.__pvpResourceFinishedUnsub = null;
  view.__pvpSkillCastUnsub = null;
  if (view.__pvpAuthorityFxRaf) cancelAnimationFrame(view.__pvpAuthorityFxRaf);
  view.__pvpAuthorityFxRaf = null;
  removeSkillTargetCapture(view);
  view.__pvpResourceSyncInstalled = false;
}

export function installPvpAuthorityResourceFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderPvpResourceSync(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installResourceSync(this);
    return result;
  };

  const previousCanDragCard = BattleView.prototype.canDragCard;
  BattleView.prototype.canDragCard = function canDragWithPersonalResources(handIndex) {
    if (this.pvp?.spectator) return false;
    if (!this.pvp || !this.__pvpAuthorityActive) return previousCanDragCard.call(this, handIndex);
    const entry = this.engine?.deck?.[handIndex];
    const card = entry?.card;
    if (!card) return false;
    const cost = this.engine.getDeployCost(card);
    return this.engine.status === 'playing'
      && this.engine.sunlight >= cost.sun
      && this.engine.food >= cost.food
      && finite(this.engine.cooldowns?.[handIndex]) <= 0
      && !this.__pvpDeployPending;
  };

  const previousTryDeployAt = BattleView.prototype.tryDeployAt;
  BattleView.prototype.tryDeployAt = async function deployWithPersonalResources(
    root,
    lane,
    col,
    handIndex = this.engine?.selectedHandIndex,
  ) {
    if (this.pvp?.spectator) return false;
    if (!this.pvp || !this.__pvpAuthorityActive || !this.pvpSocket?.emitAck) {
      return previousTryDeployAt.call(this, root, lane, col, handIndex);
    }
    if (this.__pvpDeployPending || !Number.isInteger(handIndex) || handIndex < 0) return false;

    const entry = this.engine?.deck?.[handIndex];
    const card = entry?.card;
    if (!card) return false;
    const cost = this.engine.getDeployCost(card);
    if (this.engine.sunlight < cost.sun || this.engine.food < cost.food) {
      this.engine.lastDeployError = '资源不足';
      this.lastInfoKey = '';
      this.renderCardInfo(root);
      return false;
    }

    this.__pvpDeployPending = true;
    try {
      const canonicalCol = String(this.pvp?.team || 'blue') === 'red'
        ? COLS - 1 - Number(col)
        : Number(col);
      const instance = entry.instance ?? {};
      const response = await this.pvpSocket.emitAck('pvp:authority:deploy', {
        cardId: card.id,
        lane: Number(lane),
        col: canonicalCol,
        craftQuality: Number(instance.craftQuality ?? 1),
        strengthLv: Number(instance.strengthLv ?? instance.star ?? 0),
        attributeRoll: instance.attributeRoll ? { ...instance.attributeRoll } : null,
        customName: typeof instance.customName === 'string' ? instance.customName : null,
        awakened: Boolean(instance.awakened),
      });
      // 冷却只采用服务器 snapshot.skill.deployCooldowns；不再由客户端公式自行宣布最终值。
      applyAuthorityState(this, response?.snapshot ?? this.__pvpLatestSnapshot);
      this.engine.cancelPlacing();
      this.renderer?.setHover?.(-1, -1);
      this.renderer?.requestSprite?.(card.spriteRes);
      this.renderer?.requestBullet?.(card.spriteRes);
      this.lastHandKey = '';
      this.lastInfoKey = '';
      this.renderHand(root);
      this.renderCardInfo(root);
      this.syncPlaceGridOverlay(root);
      return true;
    } catch (error) {
      this.engine.lastDeployError = error?.message || '服务器拒绝放置';
      this.lastInfoKey = '';
      this.renderCardInfo(root);
      return false;
    } finally {
      this.__pvpDeployPending = false;
    }
  };

  const previousTryCastSkillBySlot = BattleView.prototype.tryCastSkillBySlot;
  BattleView.prototype.tryCastSkillBySlot = function castSkillThroughAuthority(slotIndex) {
    if (this.pvp?.spectator) return;
    if (!this.pvp || !this.__pvpAuthorityActive || !this.pvpSocket?.emitAck) {
      return previousTryCastSkillBySlot.call(this, slotIndex);
    }
    if (!this.engine || this.engine.status !== 'playing' || this.__pvpSkillPending) return;
    const skillId = this.engine.skillLoadout?.[slotIndex];
    if (!skillId) {
      this.engine.skillTargetError = '该技能槽未装备技能';
      this.lastInfoKey = '';
      this.renderCardInfo(this.viewRoot);
      return;
    }
    const card = this.db.getById(skillId);
    const effect = getSkillEffect(skillId);
    if (!card || !effect) {
      this.engine.skillTargetError = '技能数据无效';
      this.lastInfoKey = '';
      this.renderCardInfo(this.viewRoot);
      return;
    }
    const mpCost = getSkillMpCost(card);
    const cooldown = finite(this.engine.skills?.cooldowns?.[skillId]);
    if (this.engine.heroMp < mpCost) {
      this.engine.skillTargetError = `MP不足(需要 ${mpCost})`;
      this.lastInfoKey = '';
      this.renderCardInfo(this.viewRoot);
      return;
    }
    if (cooldown > 0) {
      this.engine.skillTargetError = `技能冷却中(${Math.ceil(cooldown)}秒)`;
      this.lastInfoKey = '';
      this.renderCardInfo(this.viewRoot);
      return;
    }

    this.engine.cancelPlacing();
    this.renderer?.setHover?.(-1, -1);
    if (effect.needsTarget) {
      this.engine.skills.pendingSkillId = skillId;
      this.engine.skills.pendingEffect = effect;
      this.engine.skillTargetError = `点击战场释放「${card.name}」(Esc 取消)`;
      audio.playClickCard();
      this.lastSkillKey = '';
      this.lastInfoKey = '';
      this.renderSkillPanel(this.viewRoot);
      this.renderCardInfo(this.viewRoot);
      this.syncPlaceGridOverlay(this.viewRoot);
      return;
    }

    void sendSkillCast(this, skillId);
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyPvpResourceSync() {
    cleanupResourceSync(this);
    return previousDestroy.call(this);
  };
}
