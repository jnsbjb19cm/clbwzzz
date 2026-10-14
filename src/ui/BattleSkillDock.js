import { BattleView } from './BattleView.js';
import './BattleSkillDock20261013.css';
const MANA_BOTTLE = new URL('../../resources/img/魔瓶.png', import.meta.url).href;

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
      <img class="skill-dock-bottle" src="${MANA_BOTTLE}" alt="魔力" draggable="false" />
      <b class="skill-dock-mp-value"></b>
    `;
    panel.prepend(mp);
    const controls = document.createElement('div');
    controls.className = 'skill-dock-controls';
    controls.innerHTML = '<button type="button" aria-label="展开技能栏">▲</button><button type="button" aria-label="收起技能栏">▼</button>';
    controls.children[0].onclick = () => panel.classList.remove('dock-collapsed');
    controls.children[1].onclick = () => panel.classList.add('dock-collapsed');
    panel.append(controls);
  }

  const current = Math.max(0, Number(view.engine.heroMp) || 0);
  const maximum = Math.max(1, Number(view.engine.heroMpMax) || 1);
  const ratio = Math.max(0, Math.min(1, current / maximum));
  mp.querySelector('.skill-dock-mp-value').textContent = String(Math.floor(current));
  panel.style.setProperty('--mana-ratio', String(ratio));
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
