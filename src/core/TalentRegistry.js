export const TALENT_NODES = [
  { id: 'core', name: '勇者之心', branch: 'center', x: 50, y: 50, cost: 0, prerequisites: [], hpBonus: 0, desc: '天赋树核心。' },

  { id: 'north_vitality', name: '生命锻炼', branch: 'north', x: 50, y: 40, cost: 1, prerequisites: ['core'], hpBonus: 100, desc: '基地生命上限 +100。' },
  { id: 'north_bark', name: '树皮护体', kind: 'minor', branch: 'north', x: 42, y: 34, cost: 1, prerequisites: ['north_vitality'], hpBonus: 35, desc: '小天赋：基地生命上限 +35。' },
  { id: 'north_breath', name: '自然呼吸', kind: 'minor', branch: 'north', x: 58, y: 34, cost: 1, prerequisites: ['north_vitality'], mpBonus: 8, desc: '小天赋：魔力上限 +8。' },
  { id: 'medical', name: '医疗术', branch: 'north', x: 50, y: 30, cost: 1, prerequisites: ['north_vitality'], skillId: 502, hpBonus: 50, desc: '解锁医疗术，基地生命上限 +50。' },
  { id: 'sacred_revival', name: '神圣复苏', branch: 'north', x: 50, y: 10, cost: 1, prerequisites: ['medical'], skillId: 559, hpBonus: 100, desc: '为己方所有单位回复30点生命值（主动技能）。' },

  { id: 'east_power', name: '稳固阵线', branch: 'east', x: 60, y: 50, cost: 1, prerequisites: ['core'], hpBonus: 75, desc: '基地生命上限 +75。' },
  { id: 'east_focus', name: '专注', kind: 'minor', branch: 'east', x: 66, y: 42, cost: 1, prerequisites: ['east_power'], mpBonus: 6, desc: '小天赋：魔力上限 +6。' },
  { id: 'east_guard', name: '护阵', kind: 'minor', branch: 'east', x: 66, y: 58, cost: 1, prerequisites: ['east_power'], hpBonus: 35, desc: '小天赋：基地生命上限 +35。' },
  { id: 'tomato_bomb', name: '番茄炸弹', branch: 'east', x: 70, y: 50, cost: 1, prerequisites: ['east_power'], skillId: 500, desc: '对3*3范围内的所有敌方单位造成60点伤害（主动技能）' },
  { id: 'stone', name: '巨石', branch: 'east', x: 80, y: 42, cost: 1, prerequisites: ['tomato_bomb'], skillId: 501, desc: ' 直接对敌方英雄造成60点伤害（主动技能）' },
  { id: 'fire_wall', name: '火墙', branch: 'east', x: 80, y: 58, cost: 1, prerequisites: ['tomato_bomb'], skillId: 507, desc: '在纵向1X5的范围内竖起一道火墙,对该范围内的所有敌方单位造成每秒10点伤害,持续10秒（主动技能）' },
  { id: 'meteor_rain', name: '陨石雨', branch: 'east', x: 90, y: 42, cost: 1, prerequisites: ['tomato_bomb', 'stone'], skillId: 517, desc: '对敌方全屏所有单位造成80点伤害（主动技能）' },
  { id: 'firebird', name: '幻·火鸟', branch: 'east', x: 90, y: 58, cost: 1, prerequisites: ['tomato_bomb'], skillId: 537, desc: '对敌方全屏所有单位造成70点伤害，并附加"灼烧"效果，每秒造成10点灼烧伤害，持续5秒（主动技能）' },

  { id: 'south_mana', name: '魔力扩容', branch: 'south', x: 50, y: 60, cost: 1, prerequisites: ['core'], mpBonus: 20, hpBonus: 50, desc: '魔力上限 +20，基地生命 +50。' },
  { id: 'south_well', name: '魔力泉', kind: 'minor', branch: 'south', x: 42, y: 64, cost: 1, prerequisites: ['south_mana'], mpBonus: 8, desc: '小天赋：魔力上限 +8。' },
  { id: 'south_anchor', name: '扎根', kind: 'minor', branch: 'south', x: 58, y: 64, cost: 1, prerequisites: ['south_mana'], hpBonus: 35, desc: '小天赋：基地生命上限 +35。' },
  { id: 'thunderbolt', name: '雷弹', branch: 'south', x: 40, y: 70, cost: 1, prerequisites: ['south_mana'], skillId: 560, desc: '对橫向一整条线上的所有敌方单位造成100点伤害（主动技能）。' },
  { id: 'lightning_hammer', name: '闪电锤', branch: 'south', x: 60, y: 70, cost: 1, prerequisites: ['south_mana'], skillId: 506, desc: '对单格内的所有敌方单位造成120点伤害（主动技能）。' },
  { id: 'thunderstorm', name: '雷霆风暴', branch: 'south', x: 50, y: 80, cost: 1, prerequisites: ['thunderbolt', 'lightning_hammer'], skillId: 558, hpBonus: 75, desc: '对敌方所有卡牌造成10点伤害，持续2秒，期间会记录"雷霆风暴"造成的伤害，然后对场上最高血量的卡牌单位造成记录的伤害(主动技能)。' },

  { id: 'west_resolve', name: '坚韧意志', branch: 'west', x: 40, y: 50, cost: 1, prerequisites: ['core'], hpBonus: 100, desc: '基地生命上限 +100。' },
  { id: 'west_antidote', name: '抗毒', kind: 'minor', branch: 'west', x: 34, y: 42, cost: 1, prerequisites: ['west_resolve'], hpBonus: 35, desc: '小天赋：基地生命上限 +35。' },
  { id: 'west_reserve', name: '魔力储备', kind: 'minor', branch: 'west', x: 34, y: 58, cost: 1, prerequisites: ['west_resolve'], mpBonus: 6, desc: '小天赋：魔力上限 +6。' },
  { id: 'poison_mist', name: '毒雾', branch: 'west', x: 28, y: 42, cost: 1, prerequisites: ['west_resolve'], skillId: 514, desc: '使3*3范围内的所有敌方单位中毒,每秒造成4点伤害,持续10秒（主动技能）。' },
  { id: 'battle_roar', name: '疯狂咆哮', branch: 'west', x: 28, y: 58, cost: 1, prerequisites: ['west_resolve'], skillId: 522, desc: '瞬间提高己方所有单位的攻击力10点,持续15秒（主动技能）' },
  { id: 'fatal_curse', name: '致命诅咒', branch: 'west', x: 20, y: 36, cost: 1, prerequisites: ['poison_mist'], skillId: 539, desc: '对敌方所有卡牌造成中毒效果，并每秒扣除8点血量，持续10秒，在此技能造成的中毒持续期间，使敌方处于中毒状态下的卡牌单位受到的非中毒伤害伤害提高3点（主动技能）。' },
  { id: 'guardian_shield', name: '圣盾术', branch: 'west', x: 20, y: 64, cost: 1, prerequisites: ['battle_roar'], skillId: 518, hpBonus: 75, desc: '我方所有在场卡牌获得10S的圣咏效果，期间不会受到任何伤害，且免疫任何负面效果。（主动技能）。' },

  // ============ 被动技能（点亮后永久生效）============
  { id: 'passive_will', name: '战意', kind: 'passive', branch: 'center', x: 58, y: 76, cost: 1, prerequisites: ['core'], cardAtkPct: 5, desc: '被动：所有卡牌攻击力永久 +5%。' },
  { id: 'passive_strong', name: '强壮', kind: 'passive', branch: 'center', x: 72, y: 78, cost: 1, prerequisites: ['core'], cardHpPct: 5, desc: '被动：所有卡牌生命值永久 +5%。' },
  { id: 'passive_sacred', name: '神圣眷顾', kind: 'passive', branch: 'center', x: 62, y: 84, cost: 1, prerequisites: ['passive_will'], hpBonus: 50, desc: '被动：基地生命上限 +50。' },
  { id: 'passive_focus', name: '魔法专注', kind: 'passive', branch: 'center', x: 72, y: 84, cost: 1, prerequisites: ['passive_strong'], mpBonus: 20, desc: '被动：魔力上限 +20。' },
  { id: 'passive_gamble', name: '破釜沉舟', kind: 'passive', branch: 'center', x: 62, y: 90, cost: 1, prerequisites: ['passive_sacred'], cardAtkPct: 10, desc: '被动：己方基地血量低于100时全单位攻击 +10%。' },
  { id: 'passive_tough', name: '坚韧不屈', kind: 'passive', branch: 'center', x: 72, y: 90, cost: 1, prerequisites: ['passive_focus'], damageReductionPct: 10, desc: '被动：己方基地血量低于100时全单位受伤 -10%。' },
  { id: 'passive_war', name: '战神祝福', kind: 'passive', branch: 'center', x: 62, y: 96, cost: 1, prerequisites: ['passive_gamble'], cardAtkPct: 5, desc: '被动：稻草人系攻击加成 +50%（攻击力 +5%）。' },
  { id: 'passive_gift', name: '天使之赐', kind: 'passive', branch: 'center', x: 72, y: 96, cost: 1, prerequisites: ['passive_tough'], cardHpPct: 5, desc: '被动：蒲公英系治疗效果 +50%（生命 +5%）。' },
  { id: 'passive_god', name: '神佑之体', kind: 'passive', branch: 'center', x: 56, y: 94, cost: 1, prerequisites: ['passive_war'], hpBonus: 100, desc: '被动：基地生命上限 +100。' },
  { id: 'passive_wisdom', name: '神圣智慧', kind: 'passive', branch: 'center', x: 78, y: 94, cost: 1, prerequisites: ['passive_gift'], mpBonus: 50, desc: '被动：魔力上限 +50。' },
  { id: 'passive_slay', name: '杀戮', kind: 'passive', branch: 'center', x: 56, y: 88, cost: 1, prerequisites: ['passive_god'], cardAtkPct: 10, desc: '被动：所有卡牌攻击力永久 +10%（可与战意叠加）。' },
  { id: 'passive_endure', name: '耐久训练', kind: 'passive', branch: 'center', x: 78, y: 88, cost: 1, prerequisites: ['passive_wisdom'], cardHpPct: 10, desc: '被动：所有卡牌生命值永久 +10%（可与强壮叠加）。' },

  // ============ 更多小天赋（生命/魔力）============
  { id: 'north_vigor', name: '活力', kind: 'minor', branch: 'north', x: 42, y: 28, cost: 1, prerequisites: ['north_vitality'], hpBonus: 30, desc: '小天赋：基地生命上限 +30。' },
  { id: 'north_mana2', name: '冥想', kind: 'minor', branch: 'north', x: 58, y: 28, cost: 1, prerequisites: ['north_vitality'], mpBonus: 6, desc: '小天赋：魔力上限 +6。' },
  { id: 'east_might', name: '强攻', kind: 'minor', branch: 'east', x: 66, y: 34, cost: 1, prerequisites: ['east_power'], hpBonus: 30, desc: '小天赋：基地生命上限 +30。' },
  { id: 'east_mana2', name: '洞察', kind: 'minor', branch: 'east', x: 66, y: 64, cost: 1, prerequisites: ['east_power'], mpBonus: 6, desc: '小天赋：魔力上限 +6。' },
  { id: 'south_might', name: '坚韧', kind: 'minor', branch: 'south', x: 34, y: 72, cost: 1, prerequisites: ['south_mana'], hpBonus: 30, desc: '小天赋：基地生命上限 +30。' },
  { id: 'south_mana2', name: '聚能', kind: 'minor', branch: 'south', x: 70, y: 70, cost: 1, prerequisites: ['south_mana'], mpBonus: 6, desc: '小天赋：魔力上限 +6。' },
  { id: 'west_might', name: '壁垒', kind: 'minor', branch: 'west', x: 34, y: 34, cost: 1, prerequisites: ['west_resolve'], hpBonus: 30, desc: '小天赋：基地生命上限 +30。' },
  { id: 'west_mana2', name: '回响', kind: 'minor', branch: 'west', x: 34, y: 64, cost: 1, prerequisites: ['west_resolve'], mpBonus: 6, desc: '小天赋：魔力上限 +6。' },

  // ============ 更多主动技能（技能提取.md 补充实装）============
  { id: 'holy_light', name: '圣光术', branch: 'north', x: 50, y: 20, cost: 1, prerequisites: ['medical'], skillId: 504, desc: '瞬间提高基地200点生命值，并赋予基地"圣咏"效果，8秒内基地血量降低到10以下时，锁定至10。' },
  { id: 'ice_arrow', name: '冰霜之箭', branch: 'east', x: 90, y: 34, cost: 1, prerequisites: ['stone'], skillId: 528, desc: '对单格內的所有敌方单位造成72点伤害，且攻击正在被灼烧状态下的卡牌威力提高25%（主动技能）。 ' },
  { id: 'rock_break', name: '岩破术', branch: 'east', x: 90, y: 50, cost: 1, prerequisites: ['meteor_rain'], skillId: 529, desc: '对单格內的所有敌方单位造成65点伤害,且攻击正在减速状态下的卡牌威力提高25%（主动技能）。' },
  { id: 'war_cry', name: '恐惧咆哮', branch: 'east', x: 80, y: 66, cost: 1, prerequisites: ['firebird'], skillId: 541, desc: '瞬间提高己方所有单位的攻击力30点,持续15秒（主动技能）。' },
  { id: 'thunder_arrow', name: '雷鸣之箭', branch: 'south', x: 40, y: 80, cost: 1, prerequisites: ['thunderbolt'], skillId: 526, desc: '对单格內的所有敌方单位造成75点伤害攻击，且正在冰冻状态的卡牌威力提高30%（主动技能）。' },
  { id: 'magic_arrow', name: '魔刺突袭', branch: 'south', x: 66, y: 76, cost: 1, prerequisites: ['lightning_hammer'], skillId: 533, desc: '对3*3范围內的所有敌方单位造成60点伤害（主动技能）。' },
  { id: 'illusion', name: '幻之境', branch: 'west', x: 10, y: 28, cost: 1, prerequisites: ['fatal_curse'], skillId: 550, desc: '令敌方的3-5张卡牌暂时消失10秒,技能结束后回归原位置，但同时恢复至血量最大值（主动技能）。' },
  { id: 'iron_body', name: '铁壳功', branch: 'west', x: 10, y: 72, cost: 1, prerequisites: ['guardian_shield'], skillId: 547, desc: '使己方基地在10秒内不受到任何伤害（主动技能）' },
];

export const TALENT_NODE_MAP = new Map(TALENT_NODES.map((node) => [node.id, node]));
export const TALENT_SKILL_IDS = new Set(TALENT_NODES.map((node) => node.skillId).filter(Boolean));

export function getTalentPointBudget(playerLevel) {
  return Math.max(1, Math.min(50, Number(playerLevel) || 1));
}
