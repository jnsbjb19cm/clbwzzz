export const ROOM_INVITE_TTL_MS_20260906 = 45_000;

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
  return normalizeLobbyPresence20260906(targetPresence) === 'lobby';
}
