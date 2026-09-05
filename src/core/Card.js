import {
  CARD_CATEGORY,
  isMonsterCard,
  isPlantCard,
} from '../battle/BattleConfig.js';
import cardLoreJson from '../data/cardLore.json' with { type: 'json' };
import { ATK_STYLE, CARD_QUALITY, CARD_TYPE, VIEW_TYPE } from './constants.js';

export const EXPERIENCE_CARD_IDS = new Set([122, 123, 124]);

const CARD_LORE_BY_ID = new Map(
  cardLoreJson.map((entry) => [Number(entry.card_id), entry]),
);

/**
 * 卡牌实体 - 对应原 card.xml 单条记录
 */
export class Card {
  constructor(raw) {
    Object.assign(this, raw);
    this.id = raw.card_id;
    this.name = raw.card_name;

    const lore = CARD_LORE_BY_ID.get(this.id);
    // desc 保留原始战斗功能说明；trait 与 intro 明确拆开。
    this.trait = String(raw.desc ?? '').trim();
    this.intro = String(lore?.intro ?? '').trim();
    // 兼容现有 UI 中已经使用的 flavor 字段。
    this.flavor = this.intro;

    this.atk = this.id === 56 ? 18 : raw.card_atk;
    this.hp = this.id === 56 ? 180 : raw.card_hp;
    this.cost = raw.cost_a;
    /* 当前规则只保留1~5级；旧数据中的6级统一降为5级。 */
    this.quality = Math.max(1, Math.min(5, Number(raw.card_quality) || 1));
    this.category = raw.card_category;
    this.type = raw.card_type;
    this.cooldown = raw.card_cd;
    this.moveSpeed = raw.move_speed;
    this.atkSpeed = raw.atk_speed;
    this.atkStyle = raw.atk_style;
    this.viewType = raw.card_view_type;
    this.visible = raw.show_card === 1;
    this.spriteRes = String(raw.res);
    this.isExperienceCard = EXPERIENCE_CARD_IDS.has(this.id);
    this.galleryVisible = this.visible && !this.isExperienceCard;
    this.battleUsable = !this.isExperienceCard;
  }

  get qualityInfo() {
    return CARD_QUALITY[this.quality] ?? CARD_QUALITY[1];
  }

  get typeLabel() {
    return CARD_TYPE[this.type] ?? '未知';
  }

  get atkStyleLabel() {
    return ATK_STYLE[this.atkStyle] ?? `方式${this.atkStyle}`;
  }

  get viewTypeLabel() {
    return VIEW_TYPE[this.viewType] ?? `显示${this.viewType}`;
  }

  /** 是否为可收集的士兵/技能卡 */
  isCollectible() {
    return this.visible && this.id < 500 && !this.isExperienceCard;
  }

  /** 背包可以保存普通卡牌和经验材料卡，但经验材料卡不能出战。 */
  isInventoryCard() {
    return this.isCollectible() || this.isExperienceCard;
  }

  /** 是否为召唤物 */
  isSummon() {
    return !this.visible && this.type === 1;
  }

  /** 是否为主动技能卡 */
  isActiveSkill() {
    return this.category === CARD_CATEGORY.ACTIVE_SKILL;
  }

  isPassiveSkill() {
    return this.category === CARD_CATEGORY.PASSIVE_SKILL;
  }

  isSpecialCard() {
    return this.category === CARD_CATEGORY.SPECIAL;
  }

  /** 植物卡消耗阳光，怪物卡消耗食物 */
  isPlant() {
    return isPlantCard(this);
  }

  isMonster() {
    return isMonsterCard(this);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      atk: this.atk,
      hp: this.hp,
      cost: this.cost,
      quality: this.quality,
      category: this.category,
      card_category: this.category,
      type: this.type,
      desc: this.desc,
      trait: this.trait,
      intro: this.intro,
      flavor: this.flavor,
      cooldown: this.cooldown,
      atkStyle: this.atkStyle,
      viewType: this.viewType,
      spriteRes: this.spriteRes,
      isExperienceCard: this.isExperienceCard,
      galleryVisible: this.galleryVisible,
      battleUsable: this.battleUsable,
    };
  }
}
