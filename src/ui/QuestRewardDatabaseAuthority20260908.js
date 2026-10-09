import { authStore } from '../core/AuthStore.js';
import { QuestView } from './QuestView.js';
import { questPeriodKey } from '../data/QuestPeriods.js';
import { audio } from '../core/AudioManager.js';

const PATCH_FLAG = Symbol.for('clbwz.questRewardDatabaseAuthority20260908');

function applyProfile(view, profile) {
  if (!view?.player || !profile) return;
  const values = {
    level: Number(profile.level),
    exp: Number(profile.exp),
    hp: Number(profile.hp),
    gold: Number(profile.gold),
    gem: Number(profile.diamond ?? profile.gem),
    honor: Number(profile.honor),
    arena: Number(profile.arena),
  };
  for (const [key, value] of Object.entries(values)) {
    if (Number.isFinite(value)) view.player[key] = value;
  }
}

function applyItems(view, items) {
  if (!view?.inventory?.state || !Array.isArray(items)) return;
  const slotCount = Math.max(120, Number(view.inventory.state.slotCount) || 120, items.length);
  const slots = Array.from({ length: slotCount }, () => null);
  let cursor = 0;
  for (const raw of items) {
    const itemId = Number(raw?.itemId);
    const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
    if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0 || cursor >= slots.length) continue;
    slots[cursor++] = { itemId, count, bound: Boolean(raw?.bound ?? raw?.isBound) };
  }
  view.inventory.state = { ...view.inventory.state, slots, slotCount };
  view.inventory.save?.();
}

function rewardPayload(entry) {
  return {
    gold: Math.max(0, Number(entry?.gold) || 0),
    gem: Math.max(0, Number(entry?.gem) || 0),
    honor: Math.max(0, Number(entry?.honor) || 0),
    exp: Math.max(0, Number(entry?.exp) || 0),
    // 2026-10-09：卡片奖励可能是 { id, craftQuality }（「精良的寒冰椰子」），不能再无脑 Number()。
    cards: Array.isArray(entry?.cards)
      ? entry.cards.map((card) => {
        const id = Math.floor(Number(card?.id ?? card));
        if (!Number.isInteger(id) || id <= 0) return null;
        const craftQuality = Math.max(1, Math.min(5, Math.floor(Number(card?.craftQuality) || 1)));
        return { id, craftQuality };
      }).filter(Boolean)
      : [],
    items: Array.isArray(entry?.items)
      ? entry.items.map((item) => ({ id: Number(item?.id), count: Math.max(1, Number(item?.count) || 1) }))
      : [],
  };
}

export function installQuestRewardDatabaseAuthority20260908() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  QuestView.prototype.claim = async function claimDatabaseAuthority20260908(root, entry) {
    const state = this.stateFor(entry);
    if (!state.ready || state.claimed) return;
    const category = String(this.category || 'main');
    const period = questPeriodKey(category);
    const questId = String(entry?.id ?? entry?.lv ?? '');
    if (!questId) {
      this.toast(root, '任务ID无效');
      return;
    }
    const claimKey = `${category}:${questId}:${period}`;
    this._pendingQuestClaims ??= new Set();
    if (this._pendingQuestClaims.has(claimKey)) return;
    this._pendingQuestClaims.add(claimKey);
    const refreshClaim = (message) => {
      this.recordClaim(category, entry, period);
      if (root?.isConnected && root.querySelector('.quest-page')) {
        this.renderContent(root);
        this.toast(root, message);
      }
    };

    const button = root?.querySelector?.(`.quest-detail-claim[data-entry="${CSS.escape(questId)}"]`);
    if (button) button.disabled = true;
    try {
      const data = await authStore.api.post('/player/quests/claim-reward', {
        category,
        questId,
        period,
        reward: rewardPayload(entry),
      });
      applyProfile(this, data.profile);
      applyItems(this, data.items);
      if (data.cardInventory && this.cardInventory?.applyServerSnapshot) {
        this.cardInventory.applyServerSnapshot(data.cardInventory);
      }

      // Persist the requested category, not the category selected after awaiting the server.
      refreshClaim(`领取成功：${entry.name}`);
      audio.playSfx('click');
      this.onPlayerUpdate?.();
    } catch (error) {
      if (error?.status === 409 && (error?.data?.alreadyClaimed === true || /该任务奖励已(?:经)?领取/.test(error?.message || ''))) {
        refreshClaim('该奖励已领取，任务状态已同步；不会重复发放奖励。');
        return;
      }
      this.toast(root, error?.message || '领取任务奖励失败');
      if (button?.isConnected) button.disabled = false;
    } finally {
      this._pendingQuestClaims.delete(claimKey);
    }
  };
}
