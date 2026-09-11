export const ROOM_INVITE_TTL_MS_20260906 = 45_000;

/** 2026-09-10：被邀请方拒绝后，这段时间内不再接收同一个邀请人的邀请。 */
export const ROOM_INVITE_SNOOZE_MS_20260910 = 5 * 60 * 1000;

/** 2026-09-10：拒绝时回给邀请人的固定文案。 */
export const ROOM_INVITE_REJECT_MESSAGE_20260910 = '不好意思，我现在没时间，抱歉啦';

export const ROOM_INVITE_SNOOZE_HINT_20260910 = '对方刚刚拒绝过你，5 分钟内不再接收你的邀请';

export function normalizeLobbyPresence20260906(value) {
  const state = String(value ?? '').trim().toLowerCase();
  if (state === 'lobby' || state === 'room' || state === 'battle') return state;
  return 'offline';
}

export function canInviteLobbyPlayer20260906({
  inviterUserId,
  targetUserId,
  targetOnline,
  targetPresence,
  targetHasRoom,
} = {}) {
  const inviter = Number(inviterUserId);
  const target = Number(targetUserId);
  if (!Number.isFinite(inviter) || !Number.isFinite(target) || inviter <= 0 || target <= 0) return false;
  if (inviter === target) return false;
  if (!targetOnline || targetHasRoom) return false;
  // 2026-09-10：从「必须在大厅」放宽为「只要对方空闲就能邀请」。
  // 未上报 presence 的连接（offline）也算空闲；正在房间内或战斗中的人不算空闲。
  const presence = normalizeLobbyPresence20260906(targetPresence);
  return presence !== 'room' && presence !== 'battle';
}
