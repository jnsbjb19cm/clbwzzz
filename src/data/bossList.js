/**
 * BOSS 挑战数据(悲伤密林 · BOSS试炼)。
 * 供：世界地图、战斗大厅创建 BOSS 房间、服务端多人 BOSS 对战共用。
 *
 * lane/col 使用全局 0-based 战场坐标：玩家侧 0..4，中间 5..6，敌方侧 7..11。
 * 因此“敌方第四行第二列”（以敌方基地向战场方向数）= lane=3,col=10。
 */
export const BOSS_LIST = [
  {
    id: 'boss_dot',
    name: '痴情的多特',
    difficulty: '简单',
    order: 1,
    // 多特的实际形象是剧毒巫师(75)。
    sprite: '75',
    cardId: 75,
    hp: 5000,
    atk: 22,
    cd: 22,
    img: '剧毒巫师',
    lane: 3,
    col: 10,
    immobile: true,
    commanderOnly: true,
    displayScale: 4.5,
    // 出怪是独立 BOSS 机制；多特本体不普通攻击，只负责指挥、技能和召怪。
    // 多特：灵巧突袭 + 后排机关。外星哨兵(38)由独立吸取机制额外召唤。
    minionCardIds: [28, 20, 18],
    minionInterval: 20,
    minionSpawnCol: 10,
    minionCap: 6,
    skillIds: [539, 538, 522,534,541],
    skills: '神圣复苏(70HP+10s)、剧毒诅咒(30s)、疯狂咆哮(+10s)、横扫千军、恐惧咆哮',
    dialog: '你们，都要付出代价！',
    reward: '金币+5000 经验+2000',
    dna: '剧毒精华',
    desc: '多特本是一名医生，为人善良而真诚。可是，突如其来的战争却夺走了他深爱妻子的性命。自从妻子在他怀中停止呼吸的那一刻开始，他的性情变得阴郁而偏激。他将内心深处对战争的仇恨，全部发泄到了战场之中。',
  },
  {
    id: 'boss_gravo',
    name: '愤怒的沃里尔',
    difficulty: '简单',
    order: 2,
    sprite: '76',
    cardId: 76,
    hp: 5000,
    atk: 30,
    cd: 12,
    img: '带刀中尉',
    lane: 3,
    col: 10,
    immobile: true,
    commanderOnly: true,
    displayScale: 4,
    minionCardIds: [27, 21, 35, 31],
    minionInterval: 20,
    minionSpawnCol: 10,
    minionCap: 6,
    skillIds: [522, 538, 523, 527],
    skills: '疯狂咆哮(双倍)、神圣复苏、雷弹(50伤害)、雷霆风暴',
    dialog: '你们...要付出代价！',
    reward: '金币+5000 经验+2000',
    dna: '狂暴核心',
    desc: '沃里尔曾是一名忠诚异常的军官，他拥有强大的战斗能力。然而，一场战争夺走了他的妻子和儿子，让他心中充满了悲痛与愤怒。人们一度认为他已经疯了，但事实上，他只是无法接受失去至亲的痛苦。从那以后，沃里尔将所有的愤怒与仇恨倾注于战斗之中，他发誓要让那些夺走他幸福的人付出代价。',
  },
  {
    id: 'boss_fire',
    name: '火焰的复仇',
    difficulty: '中等',
    order: 3,
    sprite: '104',
    cardId: 104,
    hp: 10000,
    atk: 25,
    cd: 10,
    img: '火球术士',
    lane: 3,
    col: 10,
    immobile: true,
    commanderOnly: true,
    displayScale: 4,
    minionCardIds: [70, 27, 20, 18],
    minionInterval: 20,
    minionSpawnCol: 10,
    minionCap: 7,
    skillIds: [537, 522, 538],
    skills: '火鸟(灼烧双倍)、疯狂咆哮、神圣复苏',
    dialog: '火焰将吞噬一切！感受灼烧的痛苦吧！',
    reward: '金币+8000 经验+3000',
    dna: '烈焰之心',
    desc: '被火焰扭曲了心智的火球术士，将复仇视为存在的唯一意义。',
  },
  {
    id: 'boss_forest',
    name: '树妖洛丽塔',
    difficulty: '中等',
    order: 4,
    sprite: '118',
    cardId: 118,
    hp: 10000,
    atk: 18,
    cd: 16,
    img: '狂暴法师',
    lane: 3,
    col: 10,
    immobile: true,
    commanderOnly: true,
    displayScale: 4,
    minionCardIds: [70, 21, 35, 8],
    minionInterval: 20,
    minionSpawnCol: 10,
    minionCap: 7,
    skillIds: [527, 538, 522, 539, 537],
    skills: '雷霆风暴、神圣复苏、疯狂咆哮(+10s),幻火鸟(灼烧双倍)',
    dialog: '现在，轮到你们付出代价。',
    reward: '金币+8000 经验+3000',
    dna: '古树之魂',
    desc: '萝莉塔从小父母双亡，由年迈的外婆抚养长大。因为童年的不幸经历，她自幼胆小孤僻，不愿与外界接触。然而，年少的她尝尽了世态炎凉，逐渐变得坚强。在成长过程中，萝莉塔结识了一位男友，本以为终于找到了属于自己的幸福。可是，男友却被强行抓走参军，并最终死于沙场。这场悲剧彻底击碎了萝莉塔最后的希望。在绝望之中，她意外接触到了神秘的自然力量，并开始学习各种强大的魔法。最终，她与树妖融合，决心将自己曾经承受的一切痛苦与仇恨，全部归还给这个黑暗的世界。',
  },
  {
    id: 'boss_ice',
    name: '疯狂的安娜',
    difficulty: '困难',
    order: 5,
    sprite: '77',
    cardId: 77,
    hp: 10000,
    atk: 28,
    cd: 8,
    img: '极寒大法师',
    lane: 3,
    col: 10,
    immobile: true,
    commanderOnly: true,
    displayScale: 4,
    minionCardIds: [28, 18, 31, 21],
    minionInterval: 20,
    minionSpawnCol: 10,
    minionCap: 8,
    skillIds: [503, 522, 537, 538],
    skills: '暴风雪(冰封+1s)、疯狂咆哮、火鸟,神圣复苏',
    dialog: '极寒之风将冻结你们的一切...包括希望。',
    reward: '金币+10000 经验+5000',
    dna: '极寒核晶',
    desc: '安娜从小就和母亲学习魔法，精通各种法术，而母亲对她也是悉心照料，疼爱有加，但由于敌人对魔法的占有欲他们绑架了安娜的母亲并残忍的杀害了她，从此安娜的内心就充满了仇恨，拥有强大魔法的她毅然成为了一部杀戮机器',
  },
];

/** 可选难度(创建 BOSS 房间时选择) */
export const BOSS_DIFFICULTIES = ['简单', '普通', '困难'];

/** 难度 → 属性倍率(普通=1.5x，困难=2x) */
export const BOSS_DIFFICULTY_MULT = { 简单: 1, 普通: 1.5, 困难: 2 };

/** 按 id 查 BOSS */
export function getBossById(id) {
  return BOSS_LIST.find((b) => b.id === id) ?? null;
}

/** 房间标题规则：PVP={昵称}的房间；BOSS={BOSS名}：{难度}；PVE=关卡名 */
export function roomDisplayName({ mode, nickname, bossId, difficulty, stageName }) {
  if (mode === 'boss') {
    const boss = getBossById(bossId);
    return boss ? `${boss.name}：${difficulty ?? boss.difficulty}` : 'BOSS 挑战';
  }
  if (mode === 'pvp') {
    return `${nickname || '玩家'}的房间`;
  }
  return String(stageName || '冒险房间');
}
