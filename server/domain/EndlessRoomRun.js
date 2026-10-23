import { ENDLESS_VERSION, RUN_ITEMS, RUN_CONTRACTS, RUN_BOUNTIES } from '../../src/data/EndlessAdventureRules.js';

// Local journey saves are not an authority for permanent card attributes.
// This mode grants no account rewards; only bounded journey modifiers are accepted.
export function normalizeEndlessRoomRun(input, db, ownedCards = []) {
  const bad = () => { throw new Error('无尽挑战资料无效，请返回营地重新进入'); };
  if (!input || JSON.stringify(input).length > 50000 || input.version !== ENDLESS_VERSION
    || !['trial', 'expedition'].includes(input.mode) || input.phase !== 'battle'
    || typeof input.attempt !== 'string' || !input.attempt || input.attempt.length > 180
    || typeof input.seed !== 'string' || input.seed.length > 128
    || !Array.isArray(input.roster) || !input.roster.length || input.roster.length > 60
    || !Array.isArray(input.deck) || !input.deck.length || input.deck.length > 10
    || new Set(input.deck).size !== input.deck.length
    || !Array.isArray(input.items) || input.items.length > 12 || input.items.some(id => !RUN_ITEMS[id])
    || !Array.isArray(input.contracts ?? []) || (input.contracts ?? []).length > 24
    || (input.contracts ?? []).some(id => !RUN_CONTRACTS[id])
    || (input.bounty != null && !RUN_BOUNTIES[input.bounty])) bad();
  for (const field of ['floor', 'step', 'battles', 'cleared']) {
    if (!Number.isInteger(input[field]) || input[field] < (['floor', 'step'].includes(field) ? 1 : 0) || input[field] > 10000) bad();
  }
  if (input.baseMaxHp !== 1000 || !Number.isFinite(input.baseHp) || input.baseHp <= 0 || input.baseHp > 1000) bad();
  const seen = new Set();
  const roster = input.roster.map(card => {
    if (!card || typeof card.uid !== 'string' || card.uid.length > 80 || seen.has(card.uid)
      || !db.getById(Number(card.cardId))?.isCollectible?.()) bad();
    seen.add(card.uid);
    const basic = { uid: card.uid, cardId: Number(card.cardId), craftQuality: 2, star: 0, strengthLv: 0 };
    if (!card._ownedKey) return basic;
    const match = /^bag:(\d+)$/.exec(String(card._ownedKey));
    const owned = match && ownedCards.find(row => Number(row.slotIndex) === Number(match[1]));
    if (!owned || Number(owned.cardId) !== basic.cardId || (owned.expiresAt && owned.expiresAt <= Date.now())) {
      // Off-deck reserves may have been sold. They cannot be deployed in this room.
      if (input.deck.includes(card.uid)) throw new Error('上阵卡牌的背包位置已变化，请返回营地重新选择');
      return basic;
    }
    return { ...owned, ...basic, craftQuality: owned.craftQuality ?? 2,
      star: owned.star ?? owned.strengthLv ?? 0, strengthLv: owned.strengthLv ?? owned.star ?? 0,
      _ownedKey: card._ownedKey };
  });
  if (input.deck.some(uid => !seen.has(uid))) bad();
  return { version: ENDLESS_VERSION, mode: input.mode, seed: input.seed, attempt: input.attempt, phase: 'battle',
    floor: input.floor, step: input.step, battles: input.battles, cleared: input.cleared,
    baseHp: input.baseHp, baseMaxHp: 1000, items: [...input.items], contracts: [...(input.contracts ?? [])],
    bounty: input.bounty ?? null, roster, deck: [...input.deck],
    preparation: { initial: input.mode === 'trial' && input.cleared === 0,
      swapsLeft: input.mode === 'trial' && input.cleared === 0 ? 10
        : Math.min(1, Math.max(0, Math.floor(Number(input.preparation?.swapsLeft) || 0))) } };
}

// Only selections are accepted here: clients cannot replace encounter/modifier data.
export function updateEndlessRoomDeck(run, entries, db, ownedCards = []) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 10) throw new Error('请选择 1–10 张卡牌');
  const selected = entries.map(entry => {
    const existing = run.roster.find(c => c.uid === entry?.uid);
    if (existing) return existing;
    if (run.mode !== 'trial' || !/^bag:\d+$/.test(entry?._ownedKey || '')) throw new Error('请选择本局储备中的卡牌');
    const owned = ownedCards.find(c => Number(c.slotIndex) === Number(entry._ownedKey.slice(4)));
    if (!owned || (owned.expiresAt && owned.expiresAt <= Date.now())) throw new Error('背包卡牌已变化，请重新进入准备房间');
    return { uid: `owned-${owned.slotIndex}-${owned.cardId}`, cardId: owned.cardId, _ownedKey: entry._ownedKey };
  });
  const keys = selected.map(c => c._ownedKey || c.uid);
  if (new Set(keys).size !== keys.length) throw new Error('同一张卡不能重复上阵');
  const oldKeys = run.deck.map(uid => { const c = run.roster.find(c => c.uid === uid); return c._ownedKey || c.uid; });
  const changed = keys.filter(key => !oldKeys.includes(key)).length;
  const permission = run.preparation ?? { initial: false, swapsLeft: 0 };
  if (!permission.initial && selected.length !== run.deck.length) throw new Error('途中整备只能替换卡牌，不能增减卡槽');
  if (!permission.initial && changed > permission.swapsLeft) throw new Error(`本次整备剩余 ${permission.swapsLeft} 次换卡机会`);
  // Trial pools come from the live bag; expedition reserves must be retained.
  const roster = run.mode === 'trial' ? selected : run.roster;
  const normalized = normalizeEndlessRoomRun({ ...run, roster, deck: selected.map(c => c.uid) }, db, ownedCards);
  normalized.preparation = { ...permission, swapsLeft: permission.initial ? 10 : permission.swapsLeft - changed };
  return normalized;
}
