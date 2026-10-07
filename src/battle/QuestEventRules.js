/**
 * 战斗结果 → 任务事件的规则（纯函数，方便单测）。
 *
 * 2026-10-07：野外冒险(PVE)联机战斗也是 `BattleView` + `this.pvp`（mode='pve'）。
 * 旧代码用 `!this.pvp` 判断"不是 PVP 才上报冒险通关"，把联机冒险也挡掉了，
 * 于是所有以关卡为目标的**主线任务**永远不涨（P0）。这里把规则单独抽出来。
 */
export function shouldReportAdventureComplete({ win, adventure, bossId, pvp } = {}) {
  if (!win) return false;
  // 必须是真的野外冒险关卡（带 adventure 元数据）。
  if (!adventure) return false;
  // BOSS 战不算冒险通关，它走 boss_challenge / boss_defeated。
  if (bossId) return false;
  // 没有 pvp 结构 = 单机 PVE，算冒险。
  if (!pvp) return true;
  // 真 PVP 不算；PVE 联机（野外冒险房间）算。
  return String(pvp.mode || '') === 'pve';
}
