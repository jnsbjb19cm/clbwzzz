import { Router } from 'express';
import { db, getPlayerSnapshot, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const playerRouter = Router();
playerRouter.use(requireAuth);

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

playerRouter.get('/snapshot', async (req, res) => {
  const snapshot = await getPlayerSnapshot(req.user.id);
  if (!snapshot) return res.status(404).json({ message: '玩家数据不存在' });
  return res.json(snapshot);
});

playerRouter.put('/settings', async (req, res) => {
  const musicVolume = clampInt(req.body.musicVolume, 0, 100);
  const effectVolume = clampInt(req.body.effectVolume, 0, 100);
  const showCardName = req.body.showCardName ? 1 : 0;
  await db.run(`
    UPDATE player_settings
    SET music_volume=?, effect_volume=?, show_card_name=?
    WHERE user_id=?
  `, [musicVolume, effectVolume, showCardName, req.user.id]);
  return res.json({ ok: true, settings: { musicVolume, effectVolume, showCardName: Boolean(showCardName) } });
});

playerRouter.put('/profile', async (req, res) => {
  const nickname = String(req.body.nickname || '').trim();
  if (nickname.length < 1 || nickname.length > 20) {
    return res.status(400).json({ message: '昵称长度必须为1到20个字符' });
  }
  await db.run(`
    UPDATE player_profiles SET nickname=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?
  `, [nickname, req.user.id]);
  return res.json({ ok: true, nickname });
});

playerRouter.put('/selected-deck', async (req, res) => {
  const deckNo = clampInt(req.body.deckNo, 1, 3);
  await db.run(`
    UPDATE player_profiles SET selected_deck_no=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?
  `, [deckNo, req.user.id]);
  return res.json({ ok: true, deckNo });
});

playerRouter.put('/decks/:deckNo', async (req, res) => {
  const deckNo = clampInt(req.params.deckNo, 1, 3);
  const rawCards = Array.isArray(req.body.cards) ? req.body.cards : [];
  const cards = rawCards.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (cards.length < 1 || cards.length > 10) {
    return res.status(400).json({ message: '战团必须包含1到10张卡牌' });
  }
  if (new Set(cards).size !== cards.length) {
    return res.status(400).json({ message: '同一战团中不能重复卡牌' });
  }

  const ownedRows = await db.all('SELECT card_id FROM player_cards WHERE user_id=?', [req.user.id]);
  const owned = new Set(ownedRows.map((r) => r.card_id));
  if (cards.some((cardId) => !owned.has(cardId))) {
    return res.status(403).json({ message: '战团中包含未拥有的卡牌' });
  }

  const deck = await db.get('SELECT id FROM player_decks WHERE user_id=? AND deck_no=?', [req.user.id, deckNo]);
  if (!deck) return res.status(404).json({ message: '战团不存在' });

  await withTransaction(async (conn) => {
    await conn.run('DELETE FROM deck_cards WHERE deck_id=?', [deck.id]);
    for (let index = 0; index < cards.length; index += 1) {
      await conn.run('INSERT INTO deck_cards(deck_id,slot_index,card_id) VALUES(?,?,?)', [deck.id, index, cards[index]]);
    }
  });
  return res.json({ ok: true, deckNo, cards });
});

playerRouter.post('/migration/local-snapshot', async (req, res) => {
  const alreadyHasProgress = await db.get(`
    SELECT level, exp, gold, diamond FROM player_profiles WHERE user_id=?
  `, [req.user.id]);
  const isFresh = alreadyHasProgress && alreadyHasProgress.level === 1 && alreadyHasProgress.exp === 0 && alreadyHasProgress.gold === 12800 && alreadyHasProgress.diamond === 50;
  if (!isFresh) {
    return res.status(409).json({ message: '服务器已有正式数据，不能再次导入本地存档' });
  }

  const profile = req.body?.profile ?? {};
  const cards = Array.isArray(req.body?.cardInventory?.cards) ? req.body.cardInventory.cards : [];
  const decks = Array.isArray(req.body?.decks) ? req.body.decks : [];
  const settings = req.body?.settings ?? {};

  await withTransaction(async (conn) => {
    await conn.run(`
      UPDATE player_profiles
      SET level=?, exp=?, hp=?, gold=?, diamond=?, honor=?, arena=?, updated_at=CURRENT_TIMESTAMP
      WHERE user_id=?
    `, [
      clampInt(profile.level, 1, 999),
      clampInt(profile.exp, 0, 2_000_000_000),
      clampInt(profile.hp, 0, 2_000_000_000),
      clampInt(profile.gold, 0, 2_000_000_000),
      clampInt(profile.gem ?? profile.diamond, 0, 2_000_000_000),
      clampInt(profile.honor, 0, 2_000_000_000),
      clampInt(profile.arena, 0, 2_000_000_000),
      req.user.id,
    ]);

    await conn.run(`
      UPDATE player_settings SET music_volume=?, effect_volume=?, show_card_name=? WHERE user_id=?
    `, [
      clampInt(settings.musicVolume, 0, 100),
      clampInt(settings.effectVolume, 0, 100),
      settings.showCardName === false ? 0 : 1,
      req.user.id,
    ]);

    if (cards.length) {
      await conn.run('DELETE FROM player_cards WHERE user_id=?', [req.user.id]);
      for (let index = 0; index < Math.min(cards.length, 500); index += 1) {
        const card = cards[index];
        const cardId = Number(card?.cardId);
        if (!Number.isInteger(cardId) || cardId <= 0) continue;
        const slotIndex = Number.isInteger(card.slotIndex) ? card.slotIndex : index;
        await conn.run(
          'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
          [
            req.user.id,
            slotIndex,
            cardId,
            clampInt(card.star ?? card.strengthLv, 0, 99),
            clampInt(card.craftQuality, 0, 99),
          ],
        );
      }
      await conn.run('UPDATE player_card_bags SET slot_count=? WHERE user_id=?', [
        clampInt(req.body?.cardInventory?.slotCount, 1, 500),
        req.user.id,
      ]);
    }

    for (const entry of decks.slice(0, 3)) {
      const deckNo = clampInt(entry.deckNo, 1, 3);
      const deck = await conn.get('SELECT id FROM player_decks WHERE user_id=? AND deck_no=?', [req.user.id, deckNo]);
      if (!deck) continue;
      const deckCards = Array.isArray(entry.cards)
        ? entry.cards.map((c) => Number(c.cardId ?? c)).filter(Number.isInteger)
        : [];
      if (!deckCards.length || deckCards.length > 10 || new Set(deckCards).size !== deckCards.length) continue;
      await conn.run('DELETE FROM deck_cards WHERE deck_id=?', [deck.id]);
      for (let index = 0; index < deckCards.length; index += 1) {
        await conn.run('INSERT INTO deck_cards(deck_id,slot_index,card_id) VALUES(?,?,?)', [deck.id, index, deckCards[index]]);
      }
    }
  });

  return res.json({ ok: true, snapshot: await getPlayerSnapshot(req.user.id) });
});
