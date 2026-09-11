import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window','document','localStorage','sessionStorage','CustomEvent','Image']) globalThis[key] = dom.window[key];
globalThis.confirm = () => true;
const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { AuctionView } = await vite.ssrLoadModule('/src/ui/AuctionView.js');
  const { installAuctionGridPatch } = await vite.ssrLoadModule('/src/ui/AuctionGridPatch.js');
  const { economyItemIcon } = await vite.ssrLoadModule('/src/ui/EconomyItemIcon.js');
  for (const id of [2,3,10001,10002,10003,10004,10005,30055,50011]) {
    const holder = document.createElement('div'); holder.innerHTML = economyItemIcon(id);
    assert.ok(holder.querySelector('img,i,[data-bag-gem-tier]'), `item ${id} must render artwork`);
  }
  const items = [2,3,10001,10002,10003,10004,10005,30055,50011].map(itemId => ({itemId,count:20}));
  let listings = items.map((r,i) => ({...r,kind:'item',listingId:i+1,sellerId:2,sellerName:'卖家',price:100,status:'active'}));
  const card = {kind:'card',cardId:1,star:6,craftQuality:3,count:1,slotIndex:0,saleKey:'test',customName:'测试卡'};
  listings.unshift({...card,listingId:20,sellerId:2,sellerName:'卖家',price:1000,status:'active'});
  let mine = [{...listings[1],status:'sold'}]; const calls=[];
  const view = new AuctionView(); let fail = false;
  view.api = { get: async p => { if(fail) throw Error('网络错误'); return p==='/auction'?{listings}:p.endsWith('/mine')?{listings:mine}:p.endsWith('/my-items')?{items}:{cards:[card]}; }, post:async(p,data)=>{calls.push({p,data});}, delete:async p=>calls.push({p}) };
  installAuctionGridPatch(); const root=document.querySelector('#root'); await view.render(root);
  const click = selector => {const el=root.querySelector(selector); assert.ok(el, selector); el.click();};
  assert.equal(root.querySelectorAll('tbody tr').length,6);
  click('[data-auction-next]'); assert.equal(root.querySelector('[data-auction-page]').textContent,'2 / 2');
  click('[data-auction-category="card"]'); assert.equal(root.querySelectorAll('tbody tr').length,1);
  assert.match(root.querySelector('tbody').textContent,/测试卡/); assert.ok(root.querySelector('.auction-card-art img'));
  click('[data-auction-tab="consign"]'); assert.equal(root.querySelector('[data-auction-consign]').hidden,false);
  assert.equal(root.querySelectorAll('[data-auction-stock]').length,1);
  click('[data-auction-stock="0"]');
  const form=root.querySelector('[data-auction-form]'); assert.equal(form.elements.count.readOnly,true);
  form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(r=>setTimeout(r,20));
  assert.deepEqual(calls[0],{p:'/auction',data:{kind:'card',slotIndex:0,saleKey:'test',price:100}});
  click('[data-auction-category="item"]');
  assert.match(root.querySelector('tbody').textContent,/已售出/); assert.equal(root.querySelectorAll('[data-auction-stock]').length,9);
  click('[data-auction-stock="0"]'); const itemForm=root.querySelector('[data-auction-form]'); itemForm.elements.count.value='2';
  itemForm.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})); await new Promise(r=>setTimeout(r,20));
  assert.deepEqual(calls[1],{p:'/auction',data:{itemId:2,count:2,price:100}});
  fail=true; await view.load(); assert.match(root.querySelector('[data-auction-notice]').textContent,/网络错误/);
  assert.equal(root.querySelectorAll('[data-auction-stock]').length,9,'failed load preserves inventory');
  view.destroy(); console.log('PASS auction DOM: real icon resolvers, categories, paging, consign records, card/item payloads, refresh failure');
} finally { await vite.close(); dom.window.close(); }
