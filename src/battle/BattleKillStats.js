// Cumulative battle totals survive missed snapshots and reconnects; never add a
// snapshot delta on the client (repeated snapshots must not count twice).
export function recordBattleKill(engine, unit) {
  if (!unit || unit._questKillRecorded || unit.pvpNeutral
    || !['player', 'enemy'].includes(unit.team) || !(Number(unit.cardId) > 0)) return;
  unit._questKillRecorded = true;
  let defeatedTeam = unit.team;
  if ((engine.__questPerspectiveTeam ?? engine.__talentPerspectiveTeam20260912) === 'red') {
    defeatedTeam = defeatedTeam === 'player' ? 'enemy' : 'player';
  }
  const creditedTeam = defeatedTeam === 'enemy' ? 'player' : 'enemy';
  const all = engine.killCountsByTeam ??= { player: {}, enemy: {} };
  const counts = all[creditedTeam];
  const id = Number(unit.cardId);
  counts[id] = (counts[id] || 0) + 1;
  if (creditedTeam === 'player') {
    engine.killedCardCounts = { ...counts };
    engine.killsThisBattle = Object.values(counts).reduce((sum, n) => sum + n, 0);
    engine.totalKills = (engine.totalKills || 0) + 1;
  }
}

export function snapshotBattleKills(engine) {
  return { player: { ...engine.killCountsByTeam?.player }, enemy: { ...engine.killCountsByTeam?.enemy } };
}

export function syncBattleKills(engine, countsByTeam, team = 'player') {
  if (!countsByTeam?.[team]) return;
  engine.killedCardCounts = Object.fromEntries(Object.entries(countsByTeam[team])
    .filter(([id, count]) => Number(id) > 0 && Number.isFinite(Number(count)) && Number(count) > 0)
    .map(([id, count]) => [id, Math.floor(Number(count))]));
  engine.killsThisBattle = Object.values(engine.killedCardCounts).reduce((sum, n) => sum + n, 0);
}
