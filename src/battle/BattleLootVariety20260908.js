import { BattleEngine } from './BattleEngine.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleLootVariety20260908');

const DROP_TYPES = Object.freeze([
  { max: 0.45, kind: 'strengthen-powder', label: '强化粉', itemId: (level) => 10000 + level },
  { max: 0.68, kind: 'craft-material', label: '羊皮纸', itemId: (level) => 50000 + Math.min(4, level) },
  { max: 0.86, kind: 'craft-material', label: '宝石', itemId: (level) => 50010 + Math.min(4, level) },
  { max: 1.00, kind: 'craft-material', label: '卡牌DNA', itemId: (level) => 50030 + Math.min(4, level) },
]);

function chooseDropType(roll) {
  const value = Number.isFinite(Number(roll)) ? Math.max(0, Math.min(0.999999, Number(roll))) : 0;
  return DROP_TYPES.find((entry) => value < entry.max) ?? DROP_TYPES[0];
}

export function installBattleLootVariety20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  function rollDeathDropVariety20260908(unit) {
    if (
      !this.lootEnabled
      || !unit
      || unit._lootRolled
      || unit.team !== 'enemy'
      || unit.pvpNeutral === true
      || unit.bossCommanderOnly === true
      || unit.isBoss === true
      || unit.pvpBoss === true
    ) return null;

    unit._lootRolled = true;
    const level = Math.max(1, Math.min(5, Math.floor(Number(unit.quality) || 1)));
    const chance = Math.min(0.42, 0.14 + level * 0.055);
    const chanceRoll = Number(this.rng());
    if (!Number.isFinite(chanceRoll) || chanceRoll >= chance) return null;

    const type = chooseDropType(this.rng());
    const materialLevel = Math.min(4, level);
    const drop = {
      id: ++this._lootDropSeq,
      itemId: type.itemId(level),
      count: 1,
      kind: type.kind,
      lootType: type.label,
      level: type.kind === 'strengthen-powder' ? level : materialLevel,
      lane: Math.max(0, Math.min(4, Math.floor(Number(unit.lane) || 0))),
      col: Math.max(0, Math.min(11, Number(unit.col) || 0)),
      sourceUid: Number(unit.uid) || 0,
      sourceCardId: Number(unit.cardId) || 0,
      createdAt: Number(this.time) || 0,
    };
    this.lootDrops.push(drop);
    this.pushLog(`【${unit.name}】掉落 ${drop.level}级${type.label}`);
    return drop;
  }

  rollDeathDropVariety20260908.__battleLootVariety20260908 = true;
  BattleEngine.prototype.rollDeathDrop = rollDeathDropVariety20260908;
}
