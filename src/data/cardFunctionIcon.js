/**
 * 卡牌「功能图标」的**唯一映射源**（2026-10-11 用户需求）。
 *
 * 用户原话：
 *   · 所有远程攻击 → 弓箭那个箭头（也就是花生射手的那个图标）
 *   · 所有近战可攻击（除了松果战士）→ 火图腾那张「刀」（近战攻击）
 *   · 辅助类卡牌 → 原魔法冰盾的「鼓」
 *   · 防御类（火图腾、松果战士）→ 用户选定 cardType_3（盾形）
 *   · 带特殊效果的卡（蘑菇仙人、火龙、剧毒巫师、带刀中尉、火球术士、外星哨兵）
 *     → 用户选定 cardType_7（火焰形，原「主动技能」那张）
 *   · 其余（技能卡 / 精灵 / 法师 / 地刺 / 工厂 / 陷阱 等）**保持不变** ——
 *     用户说"如果其它卡的效果图不合理，先让我看一眼"，所以这里不碰它们，
 *     由调用方继续走各自原来的兜底逻辑。
 *
 * 归类依据（来自 src/data/card.json 实际数据）：
 *   atk_style=2/3   → 远程（花生射手 atk_style=2、仙人掌、南瓜投手、寒冰椰子…）
 *   atk_style=7     → 近战（跑鞋怪、西瓜太郎…共 48 张）
 *   atk_style=1     → 防御（核桃卫兵、稻草人、巨盾核桃卫兵、火图腾…共 21 张）
 *   card_type=2/3   → 辅助（蒲公英医生/精灵/魅惑妖灵/魔法冰盾/黑铁土豆雷…）
 *   松果战士(11)    → 防御（用户点名"除了松果战士"：它主要靠抵挡，不是攻击型近战）
 */
export const CARD_FUNCTION_ICON_FRAMES = Object.freeze({
  // 2026-10-11 用户给的**权威对照**（我此前把 5/6/7 认错了，现按用户为准）：
  //   1=远程攻击(弓箭) 2=近战攻击(刀) 3=防御(盾) 4=辅助(鼓)
  //   5=特殊(蘑菇仙人等) 6=飞行(所有飞行单位) 7=钻地(钻地大蒜/地道工兵)
  远程攻击: 'cardType_1',
  近战攻击: 'cardType_2',
  防御: 'cardType_3',
  辅助: 'cardType_4',
  特殊效果: 'cardType_5',
  飞行: 'cardType_6',
  钻地: 'cardType_7',
});

/** 飞行单位：card_view_type=6（BattleUnit.isFlying() 就是这个判定） */
const FLYING_VIEW_TYPE = 6;
/** 钻地单位：card_view_type=7（地道工兵 41 / 钻地大蒜 43） */
const BURROW_VIEW_TYPE = 7;

/** 用户点名的"带特殊效果"卡（蘑菇仙人 / 火龙 / 剧毒巫师 / 带刀中尉 / 火球术士 / 外星哨兵） */
export const SPECIAL_EFFECT_CARD_IDS = Object.freeze([58, 56, 75, 76, 104, 38]);

/** 抵挡型但会反击的卡：用户明确"除了松果战士"，所以它算防御 */
export const DEFENSE_CARD_IDS = Object.freeze([
  11,   // 松果战士（用户点名"除了松果战士"）
  88,   // 魔法冰盾（用户：「魔法冰盾是盾」）
  62,   // 喷喷怪（用户：防御）
  101,  // 超级喷喷怪（用户：防御）
]);

/**
 * 辅助（鼓）的严格标准 —— 用户：「鼓必须是实打实给增益、而且自身没有输出手段的」。
 *   蒲公英医生(22)：atk=0，每 5 秒为周围 3x3 己方回血 → 纯增益 ✔
 *   蒲公英精灵(36)：atk=0，全屏己方回血 → 纯增益 ✔
 *   魔法冰盾(88)  ：抵挡远程伤害 + 冰冻减速（用户点名"原魔法冰盾的鼓图标"，作为标准图）✔
 * 被排除的（有输出或只是特殊机制）→ 归"特殊效果"：怪物吸尘器(34,吞噬)、魅惑妖灵(53,魅惑)、
 * 黑铁土豆雷(61,高伤)、怪物工厂(66)/怪物作坊(93,造怪)、传送门(78,吞噬)、超级喷喷怪(101)。
 */
export const SUPPORT_BUFF_CARD_IDS = Object.freeze([
  19,  // 稻草人
  32,  // 嗜血稻草人
  22,  // 蒲公英医生
  36,  // 蒲公英精灵
  26,  // 部落巫婆
  51,  // 太古巫婆
  24,  // 部落野人（用户：「部落野人和太古野人的图标应是鼓」）
  39,  // 太古野人
  127, // 花生队长（用户：支援类 = 鼓）
]);

/** 特殊机制卡（非纯增益、也非靠普攻输出）→ 特殊效果(火焰) */
export const SPECIAL_MECHANIC_CARD_IDS = Object.freeze([
  34, 53, 61, 66, 78, 93,   // 吞噬/魅惑/爆炸/造怪/传送
  15, 52,                   // 地刺 / 强化地刺（用户：属于特殊 = 5）
]);

const REMOTE_ATK_STYLES = Object.freeze([2, 3]);   // 远程单体 / 远程范围
/** 用户点名归"远程(弓箭)"但不属于上面 atk_style 的卡 */
const REMOTE_CARD_IDS = Object.freeze([72]);       // 燃烧瓶专家
const MELEE_ATK_STYLE = 7;                          // 近战
const DEFENSE_ATK_STYLE = 1;                        // 防御（只挡不打）

/**
 * 返回这张卡应显示的功能图标。
 * @returns {{frame: string, label: string, rule: string}} 命中规则时返回；
 *          **返回 null 表示"本模块不管这张卡"**，调用方沿用自己原来的兜底逻辑。
 */
export function cardFunctionIcon(card) {
  if (!card) return null;
  const cardId = Number(card?.card_id ?? card?.id ?? card?.cardId ?? 0);
  const atkStyle = Number(card?.atk_style ?? card?.atkStyle ?? 0);
  const quality = Number(card?.card_quality ?? card?.quality ?? 1);
  const viewType = Number(card?.card_view_type ?? card?.viewType ?? card?.view_type ?? -1);
  const moving = Number(card?.move_speed ?? card?.moveSpeed ?? 0) > 0;

  // ① 特殊效果（火焰）—— 三类：
  //    a. 用户点名的那几张
  //    b. 高等级（5 级以上）"可攻击可移动"的近战精英（石巨人/死神/战争古树…）
  //    c. 有特殊机制但**既不是纯增益、也不靠普攻输出**的卡（吞噬/魅惑/爆炸/造怪/传送/守卫喷吐）
  if (SPECIAL_EFFECT_CARD_IDS.includes(cardId) || SPECIAL_MECHANIC_CARD_IDS.includes(cardId)) {
    return { frame: CARD_FUNCTION_ICON_FRAMES.特殊效果, label: '特殊效果', rule: 'special' };
  }
  if (atkStyle === MELEE_ATK_STYLE && quality >= 5) {
    return { frame: CARD_FUNCTION_ICON_FRAMES.特殊效果, label: '特殊效果', rule: 'special-high-melee' };
  }
  // ② 钻地（cardType_7）：地道工兵(41)/钻地大蒜(43) —— view_type=7
  if (viewType === BURROW_VIEW_TYPE) {
    return { frame: CARD_FUNCTION_ICON_FRAMES.钻地, label: '钻地', rule: 'burrow' };
  }
  // ③ 飞行（cardType_6）：所有飞行单位（view_type=6：飞行忍者12/飞行水蜜桃40/幻·飞行忍者45）
  //    必须在近战/远程之前判断，否则飞行忍者会被当成"1-4 级近战刀"。
  if (viewType === FLYING_VIEW_TYPE) {
    return { frame: CARD_FUNCTION_ICON_FRAMES.飞行, label: '飞行', rule: 'flying' };
  }
  // ④ 辅助（鼓）—— 用户点名：稻草人(19)/嗜血稻草人(32)/蒲公英医生(22)/蒲公英精灵(36)/
  //    部落巫婆(26)/太古巫婆(51)。必须**先于防御**判断：这几张里有 atk_style=1 的（会被防御规则抢走）。
  if (SUPPORT_BUFF_CARD_IDS.includes(cardId)) {
    return { frame: CARD_FUNCTION_ICON_FRAMES.辅助, label: '辅助', rule: 'support' };
  }
  // ③ 防御（盾）：只挡不打（atk_style=1）＋ 用户点名的松果战士(11) 与魔法冰盾(88)
  if (atkStyle === DEFENSE_ATK_STYLE || DEFENSE_CARD_IDS.includes(cardId)) {
    return { frame: CARD_FUNCTION_ICON_FRAMES.防御, label: '防御', rule: 'defense' };
  }
  // ④ 远程攻击（弓箭）：远程单体 / 远程范围
  if (REMOTE_ATK_STYLES.includes(atkStyle) || REMOTE_CARD_IDS.includes(cardId)) {
    return { frame: CARD_FUNCTION_ICON_FRAMES.远程攻击, label: '远程攻击', rule: 'remote' };
  }
  // ⑤ 近战攻击（刀）：用户标准 —— **1~4 级的近战**（不再要求"可移动"，站的近战也算）
  if (atkStyle === MELEE_ATK_STYLE && quality <= 4) {
    return { frame: CARD_FUNCTION_ICON_FRAMES.近战攻击, label: '近战攻击', rule: 'melee' };
  }
  // ⑥ 其余 → 交给调用方的原有逻辑（技能卡/精灵/法师/地刺…用户要先看一眼）
  return null;
}

/** 标签 → 图标帧（给"只知道标签"的旧代码用，例如房间卡组的按标签取图）。 */
export const CARD_FUNCTION_FRAME_BY_LABEL = Object.freeze({
  ...CARD_FUNCTION_ICON_FRAMES,
  攻击: 'cardType_1',
  远程: 'cardType_1',
  陷阱: 'cardType_4',
  突击: 'cardType_5',
  主动技能: 'cardType_7',
  主动: 'cardType_7',
});

/**
 * 图标对照台（临时工具，方便确认"哪张图 = 鼓/盾/月亮"）。
 * 控制台执行：__clbwzIconBench()
 * 会把 cardType_1~7 平铺出来并标上编号，直接看就能对号。
 */
if (typeof window !== 'undefined') {
  window.__clbwzIconBench = () => {
    const old = document.getElementById('clbwz-icon-bench');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'clbwz-icon-bench';
    box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99999;'
      + 'background:rgba(0,0,0,.9);padding:16px;border-radius:12px;display:flex;gap:14px;'
      + 'font:700 14px/1.2 "Microsoft YaHei",sans-serif;color:#fff;';
    box.innerHTML = [1, 2, 3, 4, 5, 6, 7].map((n) => `
      <div style="text-align:center">
        <img src="/sprites/parts/cardType_${n}.png" alt="" style="width:64px;height:64px;image-rendering:pixelated" />
        <div style="margin-top:6px">cardType_${n}</div>
        <div style="opacity:.7;font-weight:400">${CARD_FUNCTION_ICON_FRAMES ? '' : ''}</div>
      </div>`).join('');
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
    return '已显示 cardType_1~7（点一下关闭）。告诉我「鼓 / 盾 / 月亮」分别是哪一号即可。';
  };
}
