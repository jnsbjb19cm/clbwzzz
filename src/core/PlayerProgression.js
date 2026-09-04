export const PLAYER_LEVEL_CAP = 50;

export function getExpToNextLevel(level) {
  const safeLevel = Math.max(1, Math.min(PLAYER_LEVEL_CAP, Number(level) || 1));
  if (safeLevel >= PLAYER_LEVEL_CAP) return 0;
  return 200 + safeLevel * 100;
}

export function grantPlayerExp(player, amount) {
  const beforeLevel = Math.max(1, Math.min(PLAYER_LEVEL_CAP, Number(player.level) || 1));
  player.level = beforeLevel;
  player.exp = Math.max(0, Number(player.exp) || 0) + Math.max(0, Number(amount) || 0);
  let levelsGained = 0;
  while (player.level < PLAYER_LEVEL_CAP) {
    const need = getExpToNextLevel(player.level);
    if (player.exp < need) break;
    player.exp -= need;
    player.level += 1;
    levelsGained += 1;
  }
  if (player.level >= PLAYER_LEVEL_CAP) {
    player.level = PLAYER_LEVEL_CAP;
    player.exp = 0;
  }
  return { beforeLevel, level: player.level, levelsGained, exp: player.exp };
}

export function getBattleRewards(stage, won) {
  if (!won) return { exp: 20, gold: 15 };
  const chapter = Math.max(1, Number(stage?.map_id) || 1);
  const stageNum = Math.max(1, Number(stage?.stage_num) || 1);
  return {
    exp: 80 + chapter * 20 + stageNum * 5,
    gold: 60 + chapter * 15 + stageNum * 4,
  };
}