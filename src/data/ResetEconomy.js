// Old document strengthening rules withdrawn. Preserve the pre-reset system.
import items from './item.json' with { type: 'json' };

/**
 * 2026-10-10（用户反馈）：数据库里本来就有「XXDNA」条目（30001~30058），
 * 每条都带**自己的** item_img（PC 上例：30001 花生神射手DNA 的 item_img = 30001）。
 * 所以这里生成时优先复用数据库的 id / 名字 / 图标，不要再用 item_img:1 那种通用图。
 */
const DB_DNA_BY_NAME = new Map();
for (const entry of items) {
  const matched = /^(.+?)DNA$/.exec(String(entry.item_name ?? '').trim());
  if (matched) DB_DNA_BY_NAME.set(matched[1].trim(), entry);
}

export const RESET_TIER_NAMES = ['','白色','绿色','蓝色','紫色','橙色','红色'];
export const resetDnaId = cardId => 71000 + Number(cardId);
export const resetCraftRate = tier => tier >= 1 && tier <= 5 ? (110-tier*10)/100 : 0;
export const resetRecipe = (tier,cardId,useDna=false) => [51000+tier,51010+tier,51020+tier,...(useDna?[resetDnaId(cardId)]:[])];
export function resetMaterialDefs(cards) {
  const out=[];
  for(let tier=1;tier<=5;tier++) for(const [offset,name] of [[0,'羊皮纸'],[10,'合成宝石'],[20,'合成药剂']]) {
    out.push({item_id:51000+offset+tier,item_name:`${RESET_TIER_NAMES[tier]}${name}`,quality:tier,item_type:2,item_img:1,desc:'重置配方材料；每次合成消耗1个',sell_price:0,resetPrice:100*tier});
  }
  for(const c of cards) {
    const id=Number(c.card_id??c.id);
    if(id<=0||id>=500||Number(c.show_card??(c.visible?1:0))!==1||[122,123,124].includes(id))continue;
    // 2026-10-10（用户反馈）：文案用原话「…必定为<卡名>」；图标不能再用 item_img:1 这个通用图，
    // 有数据库专属 DNA 条目（如 30001 花生神射手DNA）就用它自己的 item_img，否则回退 50030+品质。
    const dnaName=String(c.card_name??c.name);
    const dbDna=DB_DNA_BY_NAME.get(dnaName);
    out.push({item_id:dbDna?Number(dbDna.item_id):resetDnaId(id),item_name:dbDna?String(dbDna.item_name):`${dnaName} DNA`,quality:Number(c.card_quality??c.quality),item_type:2,item_img:dbDna?Number(dbDna.item_img):50030+Number(c.card_quality??c.quality),desc:`合成卡牌时使用，在合成添加后如果合成成功必定为${dnaName}`,sell_price:0,resetPrice:100*Number(c.card_quality??c.quality)});
  }
  return out;
}
