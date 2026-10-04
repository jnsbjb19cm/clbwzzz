import { authStore } from '../core/AuthStore.js';
import { resetCraftRate, resetRecipe, resetMaterialDefs } from '../data/ResetEconomy.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function applySnapshot(view,data) {
  if(data.cardInventory)view.cardInventory.applyServerSnapshot?.(data.cardInventory);
  if(data.items&&view.inventory?.state) {
    const slotCount=Math.max(view.inventory.state.slotCount||120,data.items.length);
    const slots=Array(slotCount).fill(null);
    data.items.forEach((item,i)=>{slots[i]={...item};});
    view.inventory.state={...view.inventory.state,slotCount,slots};view.inventory.save?.();
  }
  if(data.profile) { Object.assign(view.player,data.profile); if(authStore.snapshot)authStore.snapshot.profile=data.profile; }
  view.onPlayerUpdate?.();
}
export function renderResetForge(view,root,body) {
  const cards=view.db.cards.filter(c=>c.isCollectible()&&c.quality<=5);
  const target=cards.find(c=>c.id===view.resetTarget)||cards[0];
  const materialDefs=resetMaterialDefs(view.db.cards);
  const useDna=view.resetUseDna!==false;
  body.style.overflow='auto';
  body.innerHTML=`<div class="reset-forge-panel" style="padding:20px;color:#fff;display:block;background:#17383e;width:100%;box-sizing:border-box;overflow:auto"><h2>重置合成</h2><p>独立实例入背包；红卡不可合成。旧配方保留在其他页签。</p><div style="display:flex;gap:20px;flex-wrap:wrap"><section style="flex:1;min-width:240px"><h3>合成卡牌</h3><select data-reset-target>${cards.map(c=>`<option value="${c.id}" ${c.id===target?.id?'selected':''}>${esc(c.name)} · ${c.quality}级</option>`).join('')}</select><p><label><input type="checkbox" data-reset-dna ${useDna?'checked':''}>消耗该卡 DNA</label></p><p>合成成功率 ${Math.round(resetCraftRate(target?.quality)*100)}%；成功后的目标命中率 ${useDna?100:70}%</p><ul>${target?resetRecipe(target.quality,target.id,useDna).map(id=>`<li>${esc(materialDefs.find(m=>m.item_id===id)?.item_name)}：${view.inventory.countItem(id)} / 1</li>`).join(''):''}</ul><button data-reset-action="craft">消耗材料并合成</button></section></div><hr><h3>材料商店（最高蓝色）</h3><select data-reset-item>${materialDefs.filter(m=>m.quality<=3).map(m=>`<option value="${m.item_id}">${esc(m.item_name)} · ${m.resetPrice}金币</option>`).join('')}</select><button data-reset-action="buy">购买 ×1</button><hr><button data-reset-action="seed">测试账号材料补足至9999</button><small> 仅服务端指定的测试账号可用，不会给所有账号发放。</small><p data-reset-message role="status">${esc(view.resetMessage||'')}</p></div>`;
  body.querySelector('[data-reset-target]').onchange=e=>{view.resetTarget=Number(e.target.value);renderResetForge(view,root,body);};
  body.querySelector('[data-reset-dna]').onchange=e=>{view.resetUseDna=e.target.checked;renderResetForge(view,root,body);};
  body.querySelectorAll('[data-reset-action]').forEach(button=>button.onclick=async()=>{
    body.querySelectorAll('button').forEach(b=>{b.disabled=true;});
    try {
      const data=await authStore.api.post('/player/smithy/reset',{action:button.dataset.resetAction,targetCardId:target?.id,useDna,itemId:Number(body.querySelector('[data-reset-item]').value)});
      applySnapshot(view,data);view.resetMessage=data.message;
    } catch(error){view.resetMessage=error.message;}
    if(body.isConnected)renderResetForge(view,root,body);
  });
}
