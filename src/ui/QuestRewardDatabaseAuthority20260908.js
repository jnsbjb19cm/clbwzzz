import { authStore } from '../core/AuthStore.js';
import { QuestView } from './QuestView.js';

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
    cards: Array.isArray(entry?.cards) ? entry.cards.map(Number).filter(Number.isInteger) : [],
    items: Array.isArray(entry?.items)
      ? entry.items.map((item) => ({ id: Number(item?.id), count: Math.max(1, Number(item?.count) || 1) }))
      : [],
  };
}

export function installQuestRewardDatabaseAuthority20260908() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalClaim = QuestView.prototype.claim;
  QuestView.prototype.claim = async function claimDatabaseAuthority20260908(root, entry) {
    const state = this.stateFor(entry);
    if (!state.ready || state.claimed) return;
    const category = String(this.category || 'main');
    const questId = String(entry?.id ?? entry?.lv ?? '');
    if (!questId) {
      this.toast(root, '任务ID无效');
      return;
    }

    const button = root?.querySelector?.(`.quest-detail-claim[data-entry="${CSS.escape(questId)}"]`);
    if (button) button.disabled = true;
    try {
      const data = await authStore.api.post('/player/quests/claim-reward', {
        category,
        questId,
        reward: rewardPayload(entry),
      });
      applyProfile(this, data.profile);
      applyItems(this, data.items);
      if (data.cardInventory && this.cardInventory?.applyServerSnapshot) {
        this.cardInventory.applyServerSnapshot(data.cardInventory);
      }

      // 原 claim 仍负责本地任务状态/声音/UI，但奖励发放必须禁用，避免本地二次加值。
      const originalGrantReward = this.grantReward;
      this.grantReward = () => {};
      try {
        originalClaim.call(this, root, entry);
      } finally {
        this.grantReward = originalGrantReward;
      }
      this.onPlayerUpdate?.();
    } catch (error) {
      this.toast(root, error?.message || '领取任务奖励失败');
      if (button?.isConnected) button.disabled = false;
    }
  };
}
