// Old document strengthening rules withdrawn. Preserve the pre-reset system.
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
    out.push({item_id:resetDnaId(id),item_name:`${c.card_name??c.name} DNA`,quality:Number(c.card_quality??c.quality),item_type:2,item_img:1,desc:'对应卡牌的DNA；合成成功时必定产出指定卡牌',sell_price:0,resetPrice:100*Number(c.card_quality??c.quality)});
  }
  return out;
}
