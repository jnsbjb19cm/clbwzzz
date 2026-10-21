import { emitQuestEvent } from './QuestEventBus.js';

// Only explicit acquisition receipts count. A full inventory snapshot (login,
// reconnect, sorting or strengthening) must never look like newly obtained cards.
export function recordCardObtainReceipt(data, dispatch = emitQuestEvent) {
  if (data?.ok !== true || !Array.isArray(data.cards)) return;
  for (const card of data.cards) {
    const cardId = Number(card?.cardId);
    if (Number.isInteger(cardId) && cardId > 0) dispatch('card_obtain', { cardId, count: 1 });
  }
}
