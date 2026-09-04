import { createRequire } from 'node:module';
import { db } from './database.js';

const require = createRequire(import.meta.url);
const itemJson = require('../src/data/item.json');
const cardJson = require('../src/data/card.json');

const itemNames = new Map(
  itemJson.map((item) => [Number(item.item_id ?? item.id), String(item.item_name ?? item.name ?? '')]),
);
const cardNames = new Map(
  cardJson.map((card) => [Number(card.card_id ?? card.id), String(card.card_name ?? card.name ?? '')]),
);

export const WIN_STREAK_ANNOUNCE_FROM = 3;

let ioRef = null;
let streakTableReady = null;

function safePlayerName(value) {
  const text = String(value ?? '').trim().slice(0, 40);
  return text || '玩家';
}

function positiveInt(value, fallback = 1) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function installGlobalAnnouncementTransport(io) {
  ioRef = io ?? null;
  return ioRef;
}

export function buildSystemAnnouncement(text, kind = 'system', meta = {}) {
  return {
    nickname: '系统',
    text: String(text ?? '').trim().slice(0, 300),
    channel: 'world',
    system: true,
    kind: String(kind || 'system'),
    at: Date.now(),
    ...meta,
  };
}

export function broadcastSystemAnnouncement(text, kind = 'system', meta = {}) {
  const payload = buildSystemAnnouncement(text, kind, meta);
  if (!payload.text || !ioRef) return false;
  ioRef.emit('lobby:chat', payload);
  return true;
}

export function getItemDisplayName(itemId) {
  const id = Number(itemId);
  return itemNames.get(id) || `道具#${id}`;
}

export function getCardDisplayName(cardId) {
  const id = Number(cardId);
  return cardNames.get(id) || `卡牌#${id}`;
}

export function announceItemDrop({ nickname, itemId, count = 1, source = 'battle' } = {}) {
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const amount = positiveInt(count);
  const playerName = safePlayerName(nickname);
  const itemName = getItemDisplayName(id);
  return broadcastSystemAnnouncement(
    `【掉落】恭喜 ${playerName} 在战斗中获得【${itemName}】×${amount}！`,
    'item-drop',
    { itemId: id, count: amount, source: String(source || 'battle') },
  );
}

export function announceStrengthen({ nickname, cardId, star, double = false } = {}) {
  const id = Number(cardId);
  const targetStar = Math.floor(Number(star));
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(targetStar) || targetStar < 6) return false;
  const playerName = safePlayerName(nickname);
  const cardName = getCardDisplayName(id);
  const verb = double ? '升变' : '强化';
  return broadcastSystemAnnouncement(
    `【强化】恭喜 ${playerName} 将【${cardName}】${verb}至 ${targetStar} 星！`,
    'strengthen',
    { cardId: id, star: targetStar, double: Boolean(double) },
  );
}

async function ensureWinStreakTable() {
  if (!streakTableReady) {
    streakTableReady = db.run(`
      CREATE TABLE IF NOT EXISTS player_win_streaks (
        user_id BIGINT PRIMARY KEY,
        current_streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => {
      streakTableReady = null;
      throw error;
    });
  }
  await streakTableReady;
}

export async function recordPvpWinStreak({ userId, nickname, won } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return { currentStreak: 0, bestStreak: 0, announced: false };
  await ensureWinStreakTable();

  const previous = await db.get(
    'SELECT current_streak AS currentStreak, best_streak AS bestStreak FROM player_win_streaks WHERE user_id=?',
    [id],
  );
  const previousCurrent = Math.max(0, Number(previous?.currentStreak) || 0);
  const previousBest = Math.max(0, Number(previous?.bestStreak) || 0);
  const currentStreak = won ? previousCurrent + 1 : 0;
  const bestStreak = Math.max(previousBest, currentStreak);

  if (previous) {
    await db.run(
      'UPDATE player_win_streaks SET current_streak=?, best_streak=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
      [currentStreak, bestStreak, id],
    );
  } else {
    await db.run(
      'INSERT INTO player_win_streaks(user_id,current_streak,best_streak) VALUES(?,?,?)',
      [id, currentStreak, bestStreak],
    );
  }

  const announced = Boolean(won && currentStreak >= WIN_STREAK_ANNOUNCE_FROM && broadcastSystemAnnouncement(
    `【连胜】${safePlayerName(nickname)} 已取得 ${currentStreak} 连胜，势不可挡！`,
    'win-streak',
    { userId: id, streak: currentStreak, bestStreak },
  ));

  return { currentStreak, bestStreak, announced };
}
