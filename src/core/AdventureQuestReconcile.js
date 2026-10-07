// Restore stage objectives from actual cleared stages; never replay reward or
// daily/cumulative events when opening the task window.
export function reconcileAdventureQuestClears(state, stages, clearedIds) {
  const cleared = new Set((clearedIds || []).map(Number));
  state._extra ??= {};
  const progress = state._extra.adventureClears ??= {};
  for (const stage of stages || []) {
    if (!cleared.has(Number(stage.id ?? stage.stage_id)) || !stage.adventure) continue;
    const {route,index,difficulty,final} = stage.adventure;
    progress[`${route}:${index}`] = 1;
    progress[`${route}:${index}:${difficulty}`] = 1;
    if (final) progress.final = 1;
  }
}
