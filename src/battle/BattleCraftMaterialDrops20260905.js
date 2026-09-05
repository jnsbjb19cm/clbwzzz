import { BattleEngine } from './BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleCraftMaterialDrops20260905');

const MATERIAL_BY_TIER = Object.freeze({
  1: { parchment: 50001, gem: 50011, charm: 50021, dna: 50031 },
  2: { parchment: 50002, gem: 50012, charm: 50022, dna: 50032 },
  3: { parchment: 50003, gem: 50013, charm: 50023, dna: 50033 },
  4: { parchment: 50004, gem: 50014, charm: 50024, dna: 50034 },
});

function eligible(engine, unit) {
  return Boolean(
    engine?.lootEnabled
      && unit
      && !unit._lootRolled
      && unit.team === 'enemy'
      && unit.pvpNeutral !== true
      && unit.bossCommanderOnly !== true
      && unit.isBoss !== true
      && unit.pvpBoss !== true,
  );
}

function chooseMaterial(engine, tier) {
  const table = MATERIAL_BY_TIER[tier] ?? MATERIAL_BY_TIER[1];
  const roll = Number(engine.rng?.() ?? Math.random());
  // 制作材料掉率内部权重：羊皮纸 38% / 宝石 32% / DNA 20% / 保护符 10%。
  if (roll < 0.38) return { itemId: table.parchment, label: `${tier}级羊皮纸` };
  if (roll < 0.70) return { itemId: table.gem, label: `${tier}级宝石` };
  if (roll < 0.90) return { itemId: table.dna, label: `${tier}级卡牌DNA` };
  return { itemId: table.charm, label: `${tier}级保护符` };
}

export function installBattleCraftMaterialDrops20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRollDeathDrop = BattleEngine.prototype.rollDeathDrop;
  BattleEngine.prototype.rollDeathDrop = function rollDeathDropWithCraftMaterials(unit) {
    const canRollCraft = eligible(this, unit);
    const primary = previousRollDeathDrop.call(this, unit);
    if (!canRollCraft) return primary;

    const tier = Math.max(1, Math.min(4, Math.floor(Number(unit?.quality) || 1)));
    // 制作材料独立掉落：低品质约 12%，高品质最高 24%；与原有强化粉可同时掉落。
    const chance = 0.08 + tier * 0.04;
    const chanceRoll = Number(this.rng?.() ?? Math.random());
    if (!Number.isFinite(chanceRoll) || chanceRoll >= chance) return primary;

    const material = chooseMaterial(this, tier);
    const drop = {
      id: ++this._lootDropSeq,
      itemId: material.itemId,
      count: 1,
      lane: Math.max(0, Math.min(4, Math.floor(Number(unit.lane) || 0))),
      col: Math.max(0, Math.min(11, Number(unit.col) || 0)),
      sourceUid: Number(unit.uid) || 0,
      sourceCardId: Number(unit.cardId) || 0,
      createdAt: Number(this.time) || 0,
      kind: 'craft-material',
    };
    this.lootDrops.push(drop);
    this.pushLog?.(`【${unit.name}】额外掉落 ${material.label}`);
    return primary ?? drop;
  };
}
