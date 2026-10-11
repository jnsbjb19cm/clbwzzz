import { authStore } from '../core/AuthStore.js';
import './HallView.css';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Math.max(0, Number(value) || 0);
const tabs = {honor:'荣誉排行',fastest:'竞速纪录',adventure:'冒险进度'};

export class HallView {
  constructor() { this.api = authStore.api; this.tab = 'honor'; this.stage = ''; this.sequence = 0; }

  async render(root) {
    this.root = root;
    root.innerHTML = `<section class="hall-screen">
      <header class="hall-heading"><div><span>森林荣誉榜</span><h2>名人堂</h2></div><button type="button" data-hall-refresh>刷新排行</button></header>
      <nav class="hall-tabs" aria-label="排行榜分类">${Object.entries(tabs).map(([key,label])=>`<button type="button" data-hall-tab="${key}">${label}</button>`).join('')}</nav>
      <div class="hall-toolbar"><p data-hall-description></p><label data-hall-stage-wrap hidden>关卡 <select data-hall-stage aria-label="竞速关卡"></select></label></div>
      <div class="hall-content" data-hall-content aria-live="polite"></div>
      <footer class="hall-footer">以服务器记录为准<span data-hall-status></span></footer>
    </section>`;
    root.querySelector('[data-hall-refresh]').onclick=()=>this.load();
    root.querySelectorAll('[data-hall-tab]').forEach(button=>{button.onclick=()=>{this.tab=button.dataset.hallTab;this.paint();};});
    root.querySelector('[data-hall-stage]').onchange=event=>{this.stage=event.target.value;this.paint();};
    await this.load();
  }

  async load() {
    const sequence=++this.sequence, root=this.root;
    this.loading=true;this.error='';this.paint();
    try {
      const data=await this.api.get('/social/hall-of-fame');
      if(sequence!==this.sequence || !root.querySelector('.hall-screen'))return;
      this.data=data;
      this.updated=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    } catch {
      if(sequence!==this.sequence)return;
      this.error='排行加载失败，请点击刷新重试';
    } finally {
      if(sequence===this.sequence && root.querySelector('.hall-screen')){this.loading=false;this.paint();}
    }
  }

  paint() {
    const root=this.root;
    if(!root?.querySelector('.hall-screen'))return;
    root.querySelectorAll('[data-hall-tab]').forEach(button=>{
      button.classList.toggle('active',button.dataset.hallTab===this.tab);
      button.setAttribute('aria-pressed',String(button.dataset.hallTab===this.tab));
    });
    root.querySelector('[data-hall-refresh]').disabled=this.loading;
    root.querySelector('[data-hall-status]').textContent=this.loading?'正在刷新…':this.error?'刷新失败':this.updated?`更新于 ${this.updated}`:'';
    const groups=Array.isArray(this.data?.fastestGroups)?this.data.fastestGroups:[];
    const stageSelect=root.querySelector('[data-hall-stage]');
    root.querySelector('[data-hall-stage-wrap]').hidden=this.tab!=='fastest'||!groups.length;
    if(!groups.some(g=>String(g.stageId)===this.stage))this.stage=String(groups[0]?.stageId??'');
    stageSelect.innerHTML=groups.map(g=>`<option value="${esc(g.stageId)}" ${String(g.stageId)===this.stage?'selected':''}>${esc(g.stageId)}</option>`).join('');
    const description={honor:'荣誉积累，见证每一场胜利。',fastest:groups.length?'同关卡比较用时，越快排名越高。':'各关卡最佳纪录（用时由短到长）。',adventure:'按已通关数量排列，记录冒险足迹。'};
    root.querySelector('[data-hall-description]').textContent=description[this.tab];
    const content=root.querySelector('[data-hall-content]');
    if(this.loading&&!this.data){content.innerHTML='<div class="hall-empty">正在读取荣誉榜…</div>';return;}
    if(this.error){content.innerHTML=`<div class="hall-empty">${this.error}</div>`;return;}
    const rows=this.tab==='fastest'?(groups.length?groups.find(g=>String(g.stageId)===this.stage)?.top:this.data?.fastest):this.data?.[this.tab];
    if(!Array.isArray(rows)||!rows.length){content.innerHTML='<div class="hall-empty"><b>虚位以待</b><p>还没有这项纪录，等待冒险者留下名字。</p></div>';return;}
    const value=row=>this.tab==='fastest'?`${(number(row.bestTimeMs)/1000).toFixed(2)} 秒`:this.tab==='adventure'?`${number(row.clearedStages)} 关`:number(row.honor).toLocaleString('zh-CN');
    content.innerHTML=`<div class="hall-podium">${rows.slice(0,3).map((row,i)=>`<article class="hall-champion rank-${i+1}"><span class="hall-medal">${['Ⅰ','Ⅱ','Ⅲ'][i]}</span><small>${['冠军','亚军','季军'][i]}</small><h3 title="${esc(row.nickname)}">${esc(row.nickname||'玩家')}</h3><span>Lv.${number(row.level)||1}</span><strong>${value(row)}</strong></article>`).join('')}</div>
      <div class="hall-table-wrap"><table><thead><tr><th>排名</th><th>冒险者</th><th>等级</th><th>${this.tab==='fastest'?'最佳用时':this.tab==='adventure'?'通关数量':'荣誉值'}</th></tr></thead><tbody>${rows.map((row,i)=>`<tr><td><span class="hall-rank rank-${i+1}">${i+1}</span></td><td><span class="hall-player-name">${esc(row.nickname||'玩家')}</span>${row.online?'<small class="hall-online">在线</small>':''}${this.tab==='fastest'&&!groups.length?`<small class="hall-stage-name">${esc(row.stageId)}</small>`:''}</td><td>${number(row.level)||1}</td><td><b>${value(row)}</b></td></tr>`).join('')}</tbody></table></div>`;
  }
}
