import { BAG_MAX_STACK, CARD_QUALITY } from './constants.js';

/** 道具实体 - 对应 item.xml 单条记录 */
export class Item {
  constructor(raw) {
    this.id = raw.item_id;
    this.name = raw.item_name;
    this.img = raw.item_img;
    this.desc = raw.desc ?? '';
    this.type = raw.item_type;
    this.showType = raw.show_type ?? '';
    this.quality = raw.quality ?? 1;
    this.maxStack = BAG_MAX_STACK;
    this.sellPrice = raw.sell_price ?? 0;
    this.function = raw.function;
    this.effectValue = raw.effect_value ?? 0;
    this.sex = raw.use_sex ?? 0;
  }

  get qualityInfo() {
    return CARD_QUALITY[this.quality] ?? CARD_QUALITY[1];
  }
}
