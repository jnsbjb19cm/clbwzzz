import { audio } from '../core/AudioManager.js';
import { TALENT_NODE_MAP, TALENT_NODES } from '../core/TalentRegistry.js';
import {
  getSkillCooldownSec,
  getSkillEffect,
  getSkillIcon,
  getSkillMpCost,
  SKILL_HOTKEYS,
} from '../core/SkillRegistry.js';

export class TalentView {
  constructor(cardDb, heroSkills, player = null, { onPlayerUpdate, onNavigate } = {}) {
    this.cardDb = cardDb;
    this.heroSkills = heroSkills;
    this.player = player ?? { level: 1 };
    this.onPlayerUpdate = onPlayerUpdate;
    this.onNavigate = onNavigate;
    this.pickSlot = 0;
  }

  render(root) {
    this.cameraAbort?.abort();
    this.cameraResizeObserver?.disconnect();
    this.root = root;
    const loadout = this.heroSkills.getLoadout();
    const pool = this.heroSkills.getSkillCards().filter(
      (card) => getSkillEffect(card.id) && this.heroSkills.isSkillUnlocked(card.id),
    );
    const extra = this.player.extraTalentPoints || 0;
    const available = this.heroSkills.getAvailableTalentPoints(this.player.level, extra);
    const spent = this.heroSkills.getSpentTalentPoints?.() ?? 0;
    root.innerHTML = `
      <div class="page talent-page classic-talent-screen">
        <header class="talent-header">
          <nav class="classic-talent-tabs" aria-label="角色页面">
            <button type="button" id="talent-profile-tab">资料</button>
            <button type="button" class="active">天赋</button>
          </nav>
          <div><h1>天赋树</h1><p>沿路线逐步解锁技能与属性，被动成长位于下方。</p></div>
          <div class="talent-header-actions">
            <div class="talent-points" aria-label="天赋点数">
              <span><b class="talent-points-remaining">${available}</b><small>剩余天赋点</small></span>
              <span><b class="talent-points-used">${spent}</b><small>使用天赋点</small></span>
            </div>
            <button type="button" id="talent-back-bag" class="btn-sm talent-back-bag">返回背包</button>
          </div>
        </header>
        <section class="talent-tree-panel classic-talent-tree">
          <div class="talent-branch-legend" aria-label="天赋分支">
            <span class="talent-legend-item north"><i></i>生命与治疗</span>
            <span class="talent-legend-item east"><i></i>火力与范围</span>
            <span class="talent-legend-item south"><i></i>魔力与雷电</span>
            <span class="talent-legend-item west"><i></i>控制与防御</span>
            <span class="talent-legend-item passive"><i></i>永久被动</span>
          </div>
          <div class="talent-tree-viewport" id="talent-tree-viewport">
            <div class="talent-camera-controls" aria-label="天赋树视图控制">
              <button type="button" data-talent-camera="zoom-out" aria-label="缩小天赋树">−</button>
              <button type="button" data-talent-camera="reset" aria-label="居中显示天赋树">居中</button>
              <button type="button" data-talent-camera="zoom-in" aria-label="放大天赋树">＋</button>
            </div>
            <div class="talent-camera" id="talent-camera">
            <div class="talent-tree-board talent-tree-canvas" id="talent-tree-board">
            <span class="talent-main-rail talent-main-rail-hp" aria-hidden="true"><b>HP</b></span>
            <span class="talent-main-rail talent-main-rail-mp" aria-hidden="true"><b>MP</b></span>
            <span class="talent-zone-label talent-zone-north">生命与治疗</span>
            <span class="talent-zone-label talent-zone-east">火力与范围</span>
            <span class="talent-zone-label talent-zone-south">魔力与雷电</span>
            <span class="talent-zone-label talent-zone-west">控制与防御</span>
            <span class="talent-zone-label talent-zone-passive">永久被动</span>
            ${this.renderConnections()}
            ${TALENT_NODES.map((node) => this.renderTalentNode(node)).join('')}
            </div>
            </div>
            <aside class="talent-hover-card" id="talent-hover-card" aria-live="polite">
              <strong>天赋说明</strong><p>悬浮圆形节点查看消耗、前置条件和效果。</p><small>拖动画布浏览整棵技能树。</small>
            </aside>
          </div>
          <p id="talent-tip" class="talent-tip">每提升1级获得1点天赋，当前最高50级。</p>
        </section>
        <section class="talent-equipped"><h2>战斗技能栏</h2><div class="talent-slots" id="talent-slots"></div></section>
        <section class="talent-pool"><h2>已解锁主动技能</h2><div class="talent-pool-grid" id="talent-pool"></div></section>
        <div class="talent-actions"><button type="button" id="talent-reset" class="btn-sm btn-ghost">重置天赋与技能栏</button></div>
      </div>`;
    this.renderSlots(root, loadout);
    this.renderPool(root, pool, loadout);
    this.bindEvents(root);
  }

  renderConnections() {
    const paths = TALENT_NODES.flatMap((node) => node.prerequisites.map((parentId) => {
      const parent = TALENT_NODE_MAP.get(parentId);
      if (!parent) return '';
      const unlocked = this.heroSkills.isTalentUnlocked(node.id)
        && this.heroSkills.isTalentUnlocked(parent.id);
      const x1 = parent.x * 12;
      const y1 = parent.y * 12;
      const x2 = node.x * 12;
      const y2 = node.y * 12;
      const mostlyVertical = Math.abs(y2 - y1) >= Math.abs(x2 - x1);
      const d = mostlyVertical
        ? `M ${x1} ${y1} L ${x1} ${(y1 + y2) / 2} L ${x2} ${(y1 + y2) / 2} L ${x2} ${y2}`
        : `M ${x1} ${y1} L ${(x1 + x2) / 2} ${y1} L ${(x1 + x2) / 2} ${y2} L ${x2} ${y2}`;
      return `<path data-talent-link="${parent.id}:${node.id}" class="talent-link${unlocked ? ' unlocked' : ''}" d="${d}"></path>`;
    })).join('');
    return `<svg class="classic-talent-links" viewBox="0 0 1200 1200" aria-hidden="true">${paths}</svg>`;
  }

  renderTalentNode(node) {
    const unlocked = this.heroSkills.isTalentUnlocked(node.id);
    const available = this.heroSkills.canUnlockTalent(node.id, this.player.level, this.player.extraTalentPoints || 0);
    const classes = (unlocked ? 'unlocked' : available ? 'available' : 'locked')
      + (node.kind === 'minor' ? ' minor' : '')
      + ` branch-${node.branch}`;
    const skill = node.skillId ? this.cardDb.getById(node.skillId) : null;
    const icon = skill ? getSkillIcon(skill) : node.id === 'core' ? '✦' : '◆';
    const prereqNames = node.prerequisites
      .filter((id) => !this.heroSkills.isTalentUnlocked(id))
      .map((id) => TALENT_NODE_MAP.get(id)?.name)
      .filter(Boolean);
    const title = prereqNames.length ? `需要先解锁：${prereqNames.join('、')}` : node.desc;
    return `<button type="button" class="talent-node classic-talent-node ${classes}" data-node="${node.id}" style="--x:${node.x}%;--y:${node.y}%" title="${title}">
      <span>${icon}</span><strong>${node.name}</strong><small>${unlocked ? '已解锁' : node.cost ? `${node.cost}点` : '核心'}</small>${available ? '<i class="talent-node-plus" aria-hidden="true">+</i>' : ''}
    </button>`;
  }

  renderSlots(root, loadout) {
    const el = root.querySelector('#talent-slots');
    el.innerHTML = loadout.map((skillId, index) => {
      const card = skillId ? this.cardDb.getById(skillId) : null;
      const hotkey = SKILL_HOTKEYS[index] ?? '';
      if (!card) return `<button type="button" class="talent-slot empty${index === this.pickSlot ? ' picking' : ''}" data-slot="${index}"><em>${hotkey}</em><span>空</span></button>`;
      const effect = getSkillEffect(card.id);
      return `<button type="button" class="talent-slot filled${index === this.pickSlot ? ' picking' : ''}" data-slot="${index}" title="${card.desc ?? ''}"><em>${hotkey}</em><span class="talent-skill-icon">${getSkillIcon(card)}</span><strong>${card.name}</strong><small>MP ${getSkillMpCost(card)} · CD ${getSkillCooldownSec(card)}s</small><small class="talent-fx">${effect?.label ?? ''}</small></button>`;
    }).join('');
  }

  renderPool(root, pool, loadout) {
    const el = root.querySelector('#talent-pool');
    el.innerHTML = pool.length ? pool.map((card) => {
      const equipped = loadout.includes(card.id);
      return `<button type="button" class="talent-pool-card${equipped ? ' equipped' : ''}" data-id="${card.id}" title="${card.desc ?? ''}"><span class="talent-skill-icon">${getSkillIcon(card)}</span><strong>${card.name}</strong><small>MP ${getSkillMpCost(card)}</small>${equipped ? '<em>已装备</em>' : ''}</button>`;
    }).join('') : '<p class="talent-empty">先在上方天赋树解锁主动技能。</p>';
  }

  bindEvents(root) {
    const tip = root.querySelector('#talent-tip');
    // 镜头系统：单一 pointer 会话、光标中心缩放、严格边界夹取。
    const viewport = root.querySelector('#talent-tree-viewport');
    const camera = root.querySelector('#talent-camera');
    const BOARD = 1200;
    const controller = new AbortController();
    this.cameraAbort = controller;
    const signal = controller.signal;
    let { zoom = 0.5, panX = 0, panY = 0 } = this.cameraState ?? {};
    let dragging = false;
    let pointerId = null;
    let sx = 0;
    let sy = 0;
    let startX = 0;
    let startY = 0;

    const clampCamera = () => {
      const vw = viewport.clientWidth || 600;
      const vh = viewport.clientHeight || 600;
      const scaled = BOARD * zoom;
      panX = scaled <= vw
        ? (vw - scaled) / 2
        : Math.max(vw - scaled, Math.min(0, panX));
      panY = scaled <= vh
        ? (vh - scaled) / 2
        : Math.max(vh - scaled, Math.min(0, panY));
    };
    const updateCamera = () => {
      clampCamera();
      camera.style.transformOrigin = '0 0';
      camera.style.transform = `translate3d(${panX.toFixed(2)}px, ${panY.toFixed(2)}px, 0) scale(${zoom.toFixed(4)})`;
      viewport.dataset.cameraBounded = 'true';
      viewport.dataset.cameraZoom = zoom.toFixed(4);
      viewport.dataset.cameraPanX = panX.toFixed(2);
      viewport.dataset.cameraPanY = panY.toFixed(2);
      this.cameraState = { zoom, panX, panY };
    };
    const fitView = () => {
      const vw = viewport.clientWidth || 600;
      const vh = viewport.clientHeight || 600;
      zoom = Math.max(0.3, Math.min(1.6, Math.min(vw / BOARD, vh / BOARD) * 0.94));
      panX = (vw - BOARD * zoom) / 2;
      panY = (vh - BOARD * zoom) / 2;
      updateCamera();
    };
    const zoomAt = (nextZoom, clientX, clientY) => {
      const oldZoom = zoom;
      zoom = Math.max(0.3, Math.min(1.8, nextZoom));
      const rect = viewport.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      panX = mx - (mx - panX) * (zoom / oldZoom);
      panY = my - (my - panY) * (zoom / oldZoom);
      updateCamera();
    };

    if (this.cameraState) updateCamera();
    else fitView();
    requestAnimationFrame(() => {
      if (this.cameraState) updateCamera();
      else fitView();
    });
    this.cameraResizeObserver = new ResizeObserver(() => updateCamera());
    this.cameraResizeObserver.observe(viewport);

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(zoom * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX, e.clientY);
    }, { passive: false, signal });
    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('[data-node], .talent-camera-controls')) return;
      dragging = true;
      pointerId = e.pointerId;
      viewport.setPointerCapture(pointerId);
      sx = e.clientX; sy = e.clientY; startX = panX; startY = panY;
      viewport.classList.add('is-dragging');
    }, { signal });
    viewport.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      panX = startX + (e.clientX - sx);
      panY = startY + (e.clientY - sy);
      updateCamera();
    }, { signal });
    const finishDrag = (e) => {
      if (pointerId != null && e.pointerId !== pointerId) return;
      dragging = false;
      if (pointerId != null && viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
      pointerId = null;
      viewport.classList.remove('is-dragging');
    };
    viewport.addEventListener('pointerup', finishDrag, { signal });
    viewport.addEventListener('pointercancel', finishDrag, { signal });
    root.querySelector('[data-talent-camera="zoom-in"]')?.addEventListener('click', () => {
      const rect = viewport.getBoundingClientRect();
      zoomAt(zoom * 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, { signal });
    root.querySelector('[data-talent-camera="zoom-out"]')?.addEventListener('click', () => {
      const rect = viewport.getBoundingClientRect();
      zoomAt(zoom / 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, { signal });
    root.querySelector('[data-talent-camera="reset"]')?.addEventListener('click', fitView, { signal });
    root.querySelector('#talent-back-bag')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('bag');
    });
    root.querySelector('#talent-profile-tab')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('bag');
    });
    const treeBoard = root.querySelector('#talent-tree-board');
    const hoverCard = root.querySelector('#talent-hover-card');
    const showTalentDetail = (button) => {
      const node = TALENT_NODE_MAP.get(button?.dataset.node);
      if (!node || !hoverCard) return;
      const skill = node.skillId ? this.cardDb.getById(node.skillId) : null;
      const prerequisites = node.prerequisites
        .map((id) => TALENT_NODE_MAP.get(id)?.name)
        .filter(Boolean);
      hoverCard.querySelector('strong').textContent = node.name;
      hoverCard.querySelector('p').textContent = node.desc;
      hoverCard.querySelector('small').textContent = [
        node.cost ? `消耗天赋点：${node.cost}` : '核心节点',
        prerequisites.length ? `前置：${prerequisites.join('、')}` : '',
        skill ? `MP ${getSkillMpCost(skill)} · CD ${getSkillCooldownSec(skill)}s` : '',
      ].filter(Boolean).join(' · ');
      hoverCard.dataset.node = node.id;
      hoverCard.classList.add('visible');
    };
    const hideTalentDetail = () => hoverCard?.classList.remove('visible');
    treeBoard?.addEventListener('pointerover', (event) => {
      const button = event.target.closest('[data-node]');
      if (button) showTalentDetail(button);
    }, { signal });
    treeBoard?.addEventListener('pointerout', (event) => {
      const from = event.target.closest?.('[data-node]');
      const to = event.relatedTarget?.closest?.('[data-node]');
      if (from && from !== to) hideTalentDetail();
    }, { signal });
    treeBoard?.addEventListener('focusin', (event) => {
      const button = event.target.closest('[data-node]');
      if (button) showTalentDetail(button);
    }, { signal });
    treeBoard?.addEventListener('focusout', hideTalentDetail, { signal });
    treeBoard?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-node]');
      if (!button) return;
      const nodeId = button.dataset.node;
      const node = TALENT_NODE_MAP.get(nodeId);
      if (this.heroSkills.isTalentUnlocked(nodeId)) {
        tip.textContent = `${node.name}：${node.desc}`;
        return;
      }
      // Create ref object so HeroSkillStore can mutate extraTalentPoints
      const ref = { value: this.player.extraTalentPoints || 0 };
      if (!this.heroSkills.unlockTalent(nodeId, this.player.level, ref)) {
        const missing = node.prerequisites
          .filter((id) => !this.heroSkills.isTalentUnlocked(id))
          .map((id) => TALENT_NODE_MAP.get(id)?.name)
          .filter(Boolean);
        tip.textContent = missing.length
          ? `需要先解锁：${missing.join('、')}`
          : '可用天赋点不足，请先提升玩家等级。';
        return;
      }
      this.player.extraTalentPoints = ref.value;
      audio.playSfx('click');
      this.onPlayerUpdate?.();
      const rect = button.getBoundingClientRect();
      this.render(root);
      this.spawnTalentBurst(root, rect, nodeId);
    });

    root.querySelector('#talent-slots')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-slot]');
      if (!button) return;
      audio.playClickCard();
      this.pickSlot = Number(button.dataset.slot);
      this.refreshSkills(root);
    });

    root.querySelector('#talent-pool')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-id]');
      if (!button) return;
      const id = Number(button.dataset.id);
      const loadout = this.heroSkills.getLoadout();
      const existing = loadout.indexOf(id);
      if (existing >= 0 && existing !== this.pickSlot) {
        tip.textContent = '该技能已装备在其他槽位。';
        return;
      }
      if (!this.heroSkills.setSlot(this.pickSlot, id)) {
        tip.textContent = '该技能尚未解锁。';
        return;
      }
      audio.playClickCard();
      this.refreshSkills(root);
    });

    root.querySelector('#talent-reset')?.addEventListener('click', () => {
      // 返还解锁时消耗的额外技能点
      const refund = this.heroSkills.resetTalents();
      if (refund > 0) {
        this.player.extraTalentPoints = (this.player.extraTalentPoints || 0) + refund;
        this.onPlayerUpdate?.();
      }
      this.pickSlot = 0;
      audio.playSfx('click');
      this.render(root);
    });
  }


  /** 天赋激活动画：金色粒子爆发 + 节点光环（第五人格人格脉络风格） */
  spawnTalentBurst(root, rect, nodeId) {
    const board = root.querySelector('#talent-tree-board');
    if (rect && rect.width > 0) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const count = 26;
      for (let i = 0; i < count; i++) {
        const spark = document.createElement('span');
        spark.className = 'talent-spark';
        const ang = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 110;
        spark.style.left = `${cx}px`;
        spark.style.top = `${cy}px`;
        spark.style.setProperty('--bx', `${Math.cos(ang) * dist}px`);
        spark.style.setProperty('--by', `${Math.sin(ang) * dist}px`);
        document.body.appendChild(spark);
        setTimeout(() => spark.remove(), 900);
      }
    }
    const nodeEl = board?.querySelector(`[data-node="${nodeId}"]`);
    nodeEl?.classList.add('just-unlocked');
    setTimeout(() => nodeEl?.classList.remove('just-unlocked'), 800);
  }

  refreshSkills(root) {
    const loadout = this.heroSkills.getLoadout();
    const pool = this.heroSkills.getSkillCards().filter(
      (card) => getSkillEffect(card.id) && this.heroSkills.isSkillUnlocked(card.id),
    );
    this.renderSlots(root, loadout);
    this.renderPool(root, pool, loadout);
  }
}
