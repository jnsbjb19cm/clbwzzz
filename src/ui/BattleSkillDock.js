import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.referenceSkillDock');

function syncMpBar(view, root) {
  const panel = root?.querySelector?.('#skill-panel');
  if (!panel || !view?.engine) return;

  panel.classList.add('reference-skill-dock');
  panel.classList.remove('hidden');

  let mp = panel.querySelector('.reference-skill-mp');
  if (!mp) {
    mp = document.createElement('div');
    mp.className = 'reference-skill-mp';
    mp.innerHTML = `
      <button type="button" class="skill-dock-arrow skill-dock-arrow-up" aria-label="上一组技能">▲</button>
      <div class="skill-dock-mp-track" aria-label="英雄技能能量">
        <i></i>
      </div>
      <button type="button" class="skill-dock-arrow skill-dock-arrow-down" aria-label="下一组技能">▼</button>
    `;
    panel.appendChild(mp);
  }

  const current = Math.max(0, Number(view.engine.heroMp) || 0);
  const maximum = Math.max(1, Number(view.engine.heroMpMax) || 1);
  const ratio = Math.max(0, Math.min(1, current / maximum));
  const fill = mp.querySelector('.skill-dock-mp-track > i');
  if (fill) fill.style.width = `${(ratio * 100).toFixed(2)}%`;
  mp.title = `技能能量 ${Math.round(current)}/${Math.round(maximum)}`;
}

export function installReferenceSkillDock() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithSkillDock(root) {
    this.skillPanelOpen = true;
    const result = await originalRenderBattle.call(this, root);
    this.skillPanelOpen = true;
    this.lastSkillKey = '';
    this.renderSkillPanel(root);
    syncMpBar(this, root);
    return result;
  };

  const originalRenderSkillPanel = BattleView.prototype.renderSkillPanel;
  BattleView.prototype.renderSkillPanel = function renderReferenceSkillDock(root) {
    this.skillPanelOpen = true;
    originalRenderSkillPanel.call(this, root);
    syncMpBar(this, root);
  };

  const originalSyncHud = BattleView.prototype.syncHud;
  BattleView.prototype.syncHud = function syncHudWithReferenceSkillDock(root) {
    originalSyncHud.call(this, root);
    syncMpBar(this, root);
  };
}
