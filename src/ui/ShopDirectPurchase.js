// A separate confirmation never borrows, clears or checks out the user's cart.
export function openShopDirectPurchase(view, root, product, trigger) {
  if (view._shopPurchasePending || root.querySelector('[data-shop-direct-dialog]')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'shop-direct-dialog';
  dialog.dataset.shopDirectDialog = '';
  dialog.setAttribute('aria-labelledby', 'shop-direct-title');
  dialog.innerHTML = `<form>
    <h2 id="shop-direct-title">直接购买</h2><h3 data-product-name></h3>
    <label>购买数量（份）<span class="shop-direct-stepper">
      <button type="button" data-quantity-minus aria-label="减少数量">−</button>
      <input data-buy-quantity aria-label="购买数量" type="number" min="1" max="99" step="1" value="1" required>
      <button type="button" data-quantity-plus aria-label="增加数量">＋</button>
    </span></label>
    <p data-buy-count></p><p data-buy-total aria-live="polite"></p>
    <p data-buy-error role="status"></p>
    <footer><button type="button" data-buy-cancel>取消</button><button type="submit" data-buy-confirm>确认购买</button></footer>
  </form>`;
  root.querySelector('.classic-shop-screen').append(dialog);
  dialog.querySelector('[data-product-name]').textContent = product.name;
  const input = dialog.querySelector('[data-buy-quantity]');
  const error = dialog.querySelector('[data-buy-error]');
  const confirm = dialog.querySelector('[data-buy-confirm]');
  let submitting = false;
  const quantity = () => Number(input.value);
  const valid = () => Number.isInteger(quantity()) && quantity() >= 1 && quantity() <= 99;
  const update = () => {
    const amount = valid() ? quantity() : 0;
    const cost = view.resolveClassicCartCost([{product, quantity:amount}]);
    const count = product.data?.effect?.type === 'inventory' ? Number(product.data.effect.count) || 1 : 1;
    dialog.querySelector('[data-buy-count]').textContent = `每份 ${count} ${product.kind === 'pack' ? '包' : '个'}，合计 ${amount * count} ${product.kind === 'pack' ? '包' : '个'}`;
    dialog.querySelector('[data-buy-total]').textContent = `总价：${cost.gold ? `${cost.gold} 金币` : ''}${cost.gold && cost.gem ? ' + ' : ''}${cost.gem ? `${cost.gem} 钻石` : ''}${!cost.gold && !cost.gem ? '0' : ''}`;
    const affordable = (Number(view.player.gold) || 0) >= cost.gold && (Number(view.player.gem) || 0) >= cost.gem;
    error.textContent = !valid() ? '请输入 1–99 之间的整数' : !affordable ? '余额不足，请减少购买数量' : '';
    confirm.disabled = submitting || !valid() || !affordable;
  };
  input.addEventListener('input', update);
  for (const [selector, delta] of [['[data-quantity-minus]', -1], ['[data-quantity-plus]', 1]]) {
    dialog.querySelector(selector).addEventListener('click', () => {
      input.value = String(Math.max(1, Math.min(99, Math.floor(quantity() || 1) + delta)));
      update();
    });
  }
  const close = () => { if (!submitting) dialog.close(); };
  dialog.querySelector('[data-buy-cancel]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (submitting) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); }, {once:true});
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !valid() || confirm.disabled) return;
    const requested = quantity();
    submitting = true;
    dialog.querySelectorAll('button,input').forEach(el => { el.disabled = true; });
    confirm.textContent = '购买中…';
    try {
      // Installed by the database authority layer; never fall back to local deduction.
      const result = await view.purchaseClassicDirect(root, product, requested);
      if (result.purchased === requested) {
        submitting = false;
        dialog.close();
        view.toast(root, `已购买：${product.name} ×${result.purchased} 份`);
        return;
      }
      input.value = String(requested - result.purchased);
      submitting = false;
      update();
      error.textContent = `${result.purchased ? `已购买 ${result.purchased} 份；剩余 ${requested - result.purchased} 份未购买。` : ''}${result.message || '购买失败'}`;
    } catch (failure) {
      error.textContent = failure?.message || '购买失败，请查看背包后再试';
    } finally {
      submitting = false;
      dialog.querySelectorAll('button,input').forEach(el => { el.disabled = false; });
      const cost = view.resolveClassicCartCost([{product, quantity:valid() ? quantity() : 0}]);
      confirm.disabled = !valid() || (Number(view.player.gold) || 0) < cost.gold || (Number(view.player.gem) || 0) < cost.gem;
      confirm.textContent = '确认购买';
    }
  });
  update();
  dialog.showModal();
  input.focus();
  input.select();
}
