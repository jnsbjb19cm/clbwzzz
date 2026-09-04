import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import {
  BASE_HP_SLOT_EDGE,
  BASE_HP_SLOT_W,
  CELL_H,
  CELL_W,
  COLS,
  ENEMY_BASE_FRAC,
  FIELD_BOTTOM,
  FIELD_H,
  FIELD_LEFT,
  FIELD_TOP,
  FIELD_W,
  GAME_H,
  GAME_W,
  HAND_SLOT_FACE_INSET,
  HAND_SLOT_GAP,
  HAND_SLOT_W,
  HAND_SLOTS_HEIGHT,
  HAND_SLOTS_LEFT,
  HAND_SLOTS_TOP,
  HAND_SLOTS_WIDTH,
  BATTLE_UI_PARTS,
  JUNGLE_ASSETS,
  LANES,
  PLAYER_BASE_FRAC,
  RES_FOOD_ICON,
  RES_FOOD_NUM,
  RES_SUN_ICON,
  RES_SUN_NUM,
  cellCenterX,
  cellCenterY,
  cellX,
  cellY,
  adjustMeleeAtk,
  formatBattleDelta,
  isMeleeCard,
  usesFoodCost,
  pointerToCol,
  pointerToLane,
  TRAINING_STAGE_VALUE,
} from '../battle/BattleConfig.js';
import { calculateCardStats } from '../battle/CardStatFormula.js';
import { resolveBattleBackground, COLUMN_RIGHT_W } from '../battle/BattleBackground.js';
import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import {
  guardBattlePromise,
  guardBattleRuntime,
} from '../battle/BattleRuntimeDiagnostics.js';
import {
  formatCraftCardName,
  getCardQualityBgPart,
  getInstanceStatMultiplier,
  getStrengthStarPart,
  resolveCraftQuality,
} from '../core/constants.js';
import { audio } from '../core/AudioManager.js';
import { TALENT_NODE_MAP } from '../core/TalentRegistry.js';
import battleAtlasData from '../data/atlas/preload_battle.json' with { type: 'json' };
import {
  getSkillIcon,
  getSkillMpCost,
  SKILL_HOTKEYS,
} from '../core/SkillRegistry.js';
import { DeckSelectView } from './DeckSelectView.js';
import { SocketClient } from '../network/SocketClient.js';
import { authStore } from '../core/AuthStore.js';

const SKILL_HOTKEY_INDEX = { q: 0, w: 1, e: 2, r: 3, t: 4, y: 5 };
const MAX_SIMULATION_CATCHUP_SECONDS = 2;
const CATCHUP_STEP_SECONDS = 0.05;

function advanceCooldownMap(cooldowns, elapsed) {
  if (!cooldowns || elapsed <= 0) return;
  for (const key of Object.keys(cooldowns)) {
    cooldowns[key] = Math.max(0, (Number(cooldowns[key]) || 0) - elapsed);
  }
}

function advanceBattleByWallTime(engine, elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  let simulated = Math.min(elapsed, MAX_SIMULATION_CATCHUP_SECONDS);
  while (simulated > 0.000001) {
    const step = Math.min(CATCHUP_STEP_SECONDS, simulated);
    engine.tick(step);
    simulated -= step;
  }

  const passive = Math.max(0, elapsed - MAX_SIMULATION_CATCHUP_SECONDS);
  if (passive <= 0) return;
  engine.cooldowns = (engine.cooldowns ?? []).map((cooldown) =>
    Math.max(0, (Number(cooldown) || 0) - passive));
  advanceCooldownMap(engine.skills?.cooldowns, passive);
  engine.updateFx?.(passive);
}

function resolveHandIndexFromTransfer(dataTransfer, fallback) {
  const raw =
    dataTransfer.getData('text/hand-idx') || dataTransfer.getData('text/plain');
  if (raw === '' || raw == null) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export class BattleView {
  constructor(db, {
    cardInventory,
    heroSkills,
    onResourceChange,
    onHeroHpChange,
    onBattleResult,
    onQuestEvent,
    onNavigate,
    stageId = 1,
    boss = null,
    pvp = null,
    training = false,
    trainingFreeRes = true,
    trainingMap = null,
    deckSlots = null,
    tryCard = null,
    tryUsage = null,
  } = {}) {
    this.db = db;
    this.cardInventory = cardInventory;
    this.heroSkills = heroSkills;
    this.onResourceChange = onResourceChange;
    this.onHeroHpChange = onHeroHpChange;
    this.onBattleResult = onBattleResult;
    this.onQuestEvent = onQuestEvent;
    this.onNavigate = onNavigate;
    this.boss = boss;
    this.pvp = pvp || null;
    this.phase = 'deck-select';
    this.stageId = Number(stageId) || 1;
    this.trainingMode = Boolean(training);
    this.trainingFreeRes = trainingFreeRes !== false;
    this.trainingMap = trainingMap || null;
    this.tryCard = tryCard || null;
    this.tryUsage = tryUsage || null;
    this.deckSlots =
      deckSlots ??
      DeckSelectView.loadSavedDeck(this.cardInventory, this.db) ??
      DeckSelectView.defaultDeckSlots(this.cardInventory, this.db);
    // 训练营「用这张卡练习」：把指定卡放进卡组首槽（不覆盖玩家已保存卡组）
    if (tryCard && this.db) {
      const card = this.db.getById?.(Number(tryCard));
      if (card) {
        const slots = Array.isArray(this.deckSlots) ? [...this.deckSlots] : [];
        slots[0] = { cardId: card.id };
        this.deckSlots = slots;
      }
    }
    this.engine = null;
    this.deckSelect = new DeckSelectView();
    this.renderer = null;
    this.raf = null;
    this.lastTs = 0;
    this.lastStatus = 'playing';
    this.lastHandKey = '';
    this.lastInfoKey = '';
    this.dragHandIndex = null;
    this.dropSucceeded = false;
    this.suppressCanvasClickUntil = 0;
    this.skillPanelOpen = false;
    this.lastSkillKey = '';
    this.dragGhostRaf = null;
    this.dragGhostRes = null;
    this.dragGhostClock = 0;
    this._resultReported = false;
    this._resultAudioPlayed = false;
  }

  render(root) {
    this.viewRoot = root;
    if (this.boss) {
      this.deckSlots = DeckSelectView.loadSavedDeck(this.cardInventory, this.db) ?? DeckSelectView.defaultDeckSlots(this.cardInventory, this.db);
      // 野外冒险 BOSS 战需正常结算（基地血量归零判胜负）；不用 trainingMode(它会跳过 checkEnd 结算)
      this.enterBattle(this.deckSlots, 1, { boss: this.boss });
      return;
    }
    if (this.pvp) {
      // PVP：房间容器内渲染野外战斗(本地引擎 + 部署转发，不出怪)
      this.deckSlots = DeckSelectView.loadSavedDeck(this.cardInventory, this.db) ?? DeckSelectView.defaultDeckSlots(this.cardInventory, this.db);
      this.enterBattle(this.deckSlots, 1, { trainingMode: this.trainingMode, boss: this.boss });
      return;
    }
    // 训练营：直接进训练战斗（跳过选卡组界面，保证试用卡/教学条/背景/资源开关生效）
    if (this.trainingMode) {
      this.enterBattle(this.deckSlots, 1, { trainingMode: true, boss: this.boss });
      return;
    }
    if (this.phase === 'deck-select') {
      this.stopLoop();
      this.deckSlots =
        DeckSelectView.loadSavedDeck(this.cardInventory, this.db) ??
        DeckSelectView.defaultDeckSlots(this.cardInventory, this.db);
      this.deckSelect.render(root, {
        db: this.db,
        cardInventory: this.cardInventory,
        deckSlots: this.deckSlots,
        stageId: this.trainingMode ? TRAINING_STAGE_VALUE : this.stageId,
        stages: this.db.stages.slice(0, 20),
        onConfirm: async (slots, sid, opts) => { await this.enterBattle(slots, sid, opts ?? {}); },
        onBack: () => this.onNavigate?.('main'),
      });
      return;
    }
    this.renderBattle(root);
  }

  async enterBattle(deckSlots, stageId, { trainingMode = false, boss = this.boss } = {}) {
    this.deckSlots = deckSlots;
    this.stageId = stageId;
    this.trainingMode = trainingMode;
    // 训练/冒险模式不覆盖用户卡组（避免打完冒险只剩 6 张卡）
    if (!trainingMode) {
      DeckSelectView.saveDeck(deckSlots, this.cardInventory);
    }
    this.phase = 'fighting';
    this.engine = new BattleEngine(this.db, stageId, deckSlots, this.cardInventory, {
      skillLoadout: this.heroSkills?.getLoadout() ?? [],
      heroMpMax: this.heroSkills?.getMpMax() ?? 100,
      trainingMode,
      trainingFreeRes: this.trainingFreeRes,
      boss,
      pvp: Boolean(this.pvp),
      talentBonus: this.talentBonusForBattle(),
    });
    await this.renderBattle(this.viewRoot);
    // 训练营教学：顶部显示当前试用卡的功能/用法提示条（viewRoot HTML 已 set，不被覆盖）
    if (this.trainingMode && this.tryCard && this.viewRoot) {
      const teachCard = this.db?.getById?.(Number(this.tryCard));
      const note = document.createElement('div');
      note.className = 'training-teach-note';
      note.innerHTML = `<b>教学 · ${teachCard?.card_name ?? '试用卡'}</b><span>${this.tryUsage ?? (teachCard?.desc ?? '')}</span>`;
      this.viewRoot.insertAdjacentElement('afterbegin', note);
    }
  }


  /** 计算已解锁天赋的被动加成（hp/mp/atkPct/hpPct） */
  talentBonusForBattle() {
    const out = { hp: 0, mp: 0, atkPct: 0, hpPct: 0 };
    try {
      const ids = this.heroSkills?.unlockedTalents ?? new Set();
      for (const id of ids) {
        const node = TALENT_NODE_MAP.get(id);
        if (!node) continue;
        out.hp += Number(node.hpBonus || 0);
        out.mp += Number(node.mpBonus || 0);
        out.atkPct += Number(node.cardAtkPct || 0);
        out.hpPct += Number(node.cardHpPct || 0);
      }
    } catch {}
    return out;
  }

  /** PVP：连接房间 socket，订阅对手部署(本地引擎敌方半场镜像生成) */
  initPvpSocket() {
    if (!this.pvp || this.pvpSocket) return;
    this.pvpSocket = new SocketClient({ getToken: () => authStore.token });
    // 观战不加入房间成员，只需订阅服务端权威快照。
    if (this.pvp.spectator) return;
    this.pvpSocket
      .joinRoom(Number(this.pvp.roomId))
      .then(() => {
        this.pvpUnsub = this.pvpSocket.on('pvp:deploy', (payload) => {
          if (!payload || !this.engine) return;
          const card = this.db.getById(payload.cardId);
          if (!card) return;
          this.engine.spawnOpponent(card, payload.lane, payload.col);
        });
      })
      .catch(() => {});
  }

  async renderBattle(root) {
    // 训练营教学：顶部显示当前试用卡的功能/用法提示条
    if (this.trainingMode && this.tryCard) {
      const teachCard = this.db?.getById?.(Number(this.tryCard));
      const note = document.createElement('div');
      note.className = 'training-teach-note';
      note.innerHTML = `<b>教学 · ${teachCard?.card_name ?? '试用卡'}</b><span>${this.tryUsage ?? (teachCard?.desc ?? '')}</span>`;
      root.insertAdjacentElement('afterbegin', note);
    }
    if (this.pvp) this.initPvpSocket();
    const stages = this.db.stages.slice(0, 20);
    const stage = this.engine.stage;
    const training = this.trainingMode;

    const stageOptions = stages
      .map(
        (s) =>
          `<option value="${s.stage_id}"${s.stage_id === stage.stage_id ? ' selected' : ''}>${s.stage_name}</option>`,
      )
      .join('');

    const bg = resolveBattleBackground(stage, { trainingMode: training, pvpMode: Boolean(this.pvp), bossId: this.pvp?.bossId ?? this.bossId, trainingMap: this.trainingMap });
    const bgStyle = [
      `--field-left:${FIELD_LEFT}px`,
      `--field-top:${FIELD_TOP}px`,
      `--field-bottom:${FIELD_BOTTOM}px`,
      `--column-right-w:${bg.columnRightW ?? COLUMN_RIGHT_W}px`,
      `--bg-base:url('${bg.baseUrl}')`,
      `--bg-grass:url('${bg.baseUrl}')`,
      `--bg-map:url('${bg.mapUrl}')`,
      `--bg-left:url('${bg.leftColumnUrl}')`,
      `--bg-right:url('${bg.rightColumnUrl}')`,
      `--top-bar-bg:url('${BATTLE_UI_PARTS.topBarBg}')`,
      `--card-bar-bg:url('${BATTLE_UI_PARTS.cardBarBg}')`,
      `--hp-slot-left:url('${BATTLE_UI_PARTS.hpSlotLeft}')`,
      `--hp-slot-right:url('${BATTLE_UI_PARTS.hpSlotRight}')`,
      `--hand-slots-left:${HAND_SLOTS_LEFT}px`,
      `--hand-slots-top:${HAND_SLOTS_TOP}px`,
      `--hand-slots-width:${HAND_SLOTS_WIDTH}px`,
      `--hand-slots-height:${HAND_SLOTS_HEIGHT}px`,
      `--hand-slot-w:${HAND_SLOT_W}px`,
      `--hand-slot-gap:${HAND_SLOT_GAP}px`,
      `--slot-face-inset:${HAND_SLOT_FACE_INSET.top}px ${HAND_SLOT_FACE_INSET.right}px ${HAND_SLOT_FACE_INSET.bottom}px ${HAND_SLOT_FACE_INSET.left}px`,
      `--sun-icon-left:${RES_SUN_ICON.left}px`,
      `--sun-icon-top:${RES_SUN_ICON.top}px`,
      `--food-icon-left:${RES_FOOD_ICON.left}px`,
      `--food-icon-top:${RES_FOOD_ICON.top}px`,
      `--sun-left:${RES_SUN_NUM.left}px`,
      `--sun-top:${RES_SUN_NUM.top}px`,
      `--food-left:${RES_FOOD_NUM.left}px`,
      `--food-top:${RES_FOOD_NUM.top}px`,
    ].join(';');

    root.innerHTML = `
      <div class="page battle-page battle-immersive-page">
        <div class="battle-stage-bar">
          <span class="battle-map-label">🗺️ ${bg.sceneLabel}地图</span>
          ${training
            ? '<span class="immersive-stage">🎯 训练场</span>'
            : `<label>关卡 <select id="stage-picker">${stageOptions}</select></label>`}
          <span class="res-hud res-sun">☀ <b id="battle-sun-hud">${training ? '∞' : this.engine.sunlight}</b></span>
          <span class="res-hud res-food">🍖 <b id="battle-food-hud">${training ? '∞' : this.engine.food}</b></span>
          <button id="restart-btn" class="btn-sm" type="button">重新开始</button>
          <button id="toggle-names-btn" class="btn-sm" type="button">👤 名字</button>
        </div>
        <div class="battle-game-wrap battle-scene" style="${bgStyle}">
          <!-- 左右柱：锚定在战斗容器边缘(wrap 层)，不随战场缩放。
               PVP/BOSS 已改用 pvp-authority-column 作为唯一侧柱层，这里不再生成两套。 -->
          ${this.pvp ? '' : '<div class="bg-layer bg-layer-left-column" aria-hidden="true"></div>'}
          ${this.pvp ? '' : (bg.showRightColumn ? '<div class="bg-layer bg-layer-right-column" aria-hidden="true"></div>' : '')}
          <div class="game-container">
            <div class="bg-stack" aria-hidden="true">
              <div class="bg-layer bg-layer-base"></div>
              <div class="bg-layer bg-layer-map"></div>
            </div>

            <div class="top-ui">
              <div class="top-ui-bg" aria-hidden="true"></div>
              <img class="res-icon res-sun-icon" src="${JUNGLE_ASSETS.resSun}" alt="" draggable="false" />
              <img class="res-icon res-food-icon" src="${JUNGLE_ASSETS.resFood}" alt="" draggable="false" />
              <b id="battle-sun" class="res-num res-sun-num">${this.engine.sunlight}</b>
              <b id="battle-food" class="res-num res-food-num">${this.engine.food}</b>
              <div class="slots-container">
                <div id="hand" class="hand-cards"></div>
              </div>
            </div>

            <div class="base-hp-slot player" title="己方基地">
              <div class="base-hp-bg" aria-hidden="true"></div>
              <div class="hp" id="orb-player-hp">${this.engine.heroHp}</div>
              <div class="label">基地</div>
            </div>
            <div class="base-hp-slot enemy" title="敌方基地">
              <div class="base-hp-bg" aria-hidden="true"></div>
              <div class="hp" id="orb-enemy-hp">${this.engine.enemyHeroHp}</div>
              <div class="label" id="orb-enemy-name">${training ? '木桩基地' : (stage.enemy_name ?? '敌方')}</div>
            </div>

            <div class="battlefield-wrap">
              <div id="place-grid-overlay" class="place-grid-overlay hidden" aria-hidden="true"></div>
              <canvas id="battle-canvas" class="battle-canvas"></canvas>
            </div>

            <div id="skill-panel" class="skill-panel hidden">
              <div class="skill-panel-head">
                <span>英雄技能 <em>Q W E R T Y</em></span>
                <button id="skill-panel-close" type="button" class="skill-panel-close" aria-label="关闭">×</button>
              </div>
              <div id="skill-slots" class="skill-slots"></div>
            </div>

            <div id="base-float-layer" class="base-float-layer" aria-hidden="true"></div>

            <div id="deploy-tip" class="deploy-tip"></div>
            <div id="drag-ghost" class="drag-ghost hidden">
              <canvas id="drag-ghost-canvas" width="96" height="96"></canvas>
              <span id="drag-ghost-label"></span>
            </div>

            <div id="settings-panel" class="settings-panel hidden">
              <button id="settings-mute" type="button">🔊 音效</button>
              <button id="settings-names" type="button">👤 名称：开</button>
              <button id="settings-lowq" type="button">🎨 低画质：关</button>
              <button id="settings-restart" type="button">重新开始</button>
              <button id="settings-close" type="button">关闭</button>
            </div>

            <div id="result-overlay" class="result-overlay hidden">
              <div class="result-card">
                <canvas id="result-icon" width="636" height="214"></canvas>
                <p id="result-desc"></p>
                <div class="result-actions">
                  <button id="result-retry" class="btn-sm">再战</button>
                  <button id="result-next" class="btn-sm btn-ghost hidden">下一关</button>
                  <button id="result-exit" class="btn-sm btn-ghost">退出战斗</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="battle-immersive-dock">
          <div id="card-info" class="card-info-inline immersive-card-info"></div>
          <div class="immersive-dock-actions">
            <div class="immersive-dock-meta">
              <span class="immersive-stage">${training ? '🎯 训练场' : `🗺 ${stage.stage_name}`}</span>
              ${training
                ? ''
                : `<span class="immersive-wave">波 <b id="wave-num">0</b>/<b id="wave-total">${this.engine.totalWaves}</b></span>`}
              <span class="immersive-mp">✦ <b id="battle-mp">${this.engine.heroMp}</b>/<b id="battle-mp-max">${this.engine.heroMpMax}</b></span>
              <span class="immersive-time">⏱ <b id="battle-time">0</b>s</span>
            </div>
            <div class="battle-fab">
              <button id="battle-skill" class="fab-btn" type="button" title="技能栏 Q/W/E/R/T/Y">技能</button>
              <button id="battle-settings" class="fab-btn" type="button">设置</button>
              <button id="battle-back" class="fab-btn fab-primary" type="button">退出</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const canvas = root.querySelector('#battle-canvas');
    this.renderer = new BattleRenderer(canvas);
    this.renderer.resize();
    this.renderer.forceLowQuality = localStorage.getItem('clbwz_low_quality') === '1';
    this.buildPlaceGridOverlay(root);
    this.bindEvents(root);
    this._onBattleResize = () => this.fitBattleScale(root);
    window.addEventListener('resize', this._onBattleResize);
    requestAnimationFrame(() => {
      this.fitBattleScale(root);
      requestAnimationFrame(() => this.fitBattleScale(root));
    });
    this.lastHandKey = '';
    const deckRes = new Set(
      this.engine.deck.map((e) => String(e.card?.spriteRes)).filter(Boolean),
    );
    void unitAnimPlayer.preload(deckRes);
    this.renderHand(root);
    this.renderCardInfo(root);
    this.renderSkillPanel(root);
    this.syncHud(root);
    audio.playBgm('battle', { fade: true });
    skillAnimPlayer.preload(this.engine.skillLoadout ?? []);
    this.startLoop();
  }

  canDragCard(handIndex) {
    if (this.pvp?.spectator) return false;
    const entry = this.engine.deck[handIndex];
    const card = entry?.card;
    if (!card) return false;
    const cost = this.engine.getDeployCost(card);
    const cd = this.engine.cooldowns[handIndex] ?? 0;
    if (this.engine.trainingMode) {
      return this.engine.status === 'playing';
    }
    return (
      this.engine.sunlight >= cost.sun &&
      this.engine.food >= cost.food &&
      cd <= 0 &&
      this.engine.status === 'playing'
    );
  }

  getHandKey() {
    // 冷却液面由 syncCooldownOverlay 逐帧更新；这里只记录启停，避免每秒重建DOM造成跳变。
    const cd = this.engine.deck
      .map((_, i) => `${i}:${(this.engine.cooldowns[i] ?? 0) > 0 ? 1 : 0}`)
      .join('|');
    return `${this.engine.selectedHandIndex}|${this.engine.placingActive}|${this.engine.sunlight}|${this.engine.food}|${cd}`;
  }

  getInfoKey() {
    const entry = this.engine.selectedEntry;
    const card = entry?.card;
    if (!card) return 'none';
    const handIndex = this.engine.selectedHandIndex ?? -1;
    const cd = (this.engine.cooldowns[handIndex] ?? 0).toFixed(0);
    const inst = entry.instance;
    return `${handIndex}|${card.id}|${inst?.craftQuality ?? 0}|${inst?.strengthLv ?? 0}|${cd}|${this.engine.sunlight}|${this.engine.food}|${this.engine.lastDeployError}|${this.engine.placingActive}|${this.engine.skillTargetError}|${this.engine.skills?.pendingSkillId ?? ''}`;
  }

  getSkillKey() {
    const loadout = this.engine.skillLoadout ?? [];
    const cds = loadout
      .map((id) => (id ? (this.engine.skills.cooldowns[id] ?? 0).toFixed(0) : '0'))
      .join('|');
    return `${this.engine.heroMp}|${this.engine.heroMpMax}|${cds}|${this.engine.skills?.pendingSkillId ?? ''}|${this.skillPanelOpen}`;
  }

  isSkillTargeting() {
    return !!this.engine.skills?.pendingSkillId && this.engine.status === 'playing';
  }

  getActionTip() {
    if (this.engine.skillTargetError) return this.engine.skillTargetError;
    if (this.isSkillTargeting()) {
      const card = this.engine.skills.getSkillCard(this.engine.skills.pendingSkillId);
      return card ? `点击战场释放「${card.name}」(Esc 取消)` : '点击战场释放技能';
    }
    return this.engine.lastDeployError || '';
  }

  tryCastSkillBySlot(slotIndex) {
    if (!this.engine || this.engine.status !== 'playing') return;
    const skillId = this.engine.skillLoadout?.[slotIndex];
    if (!skillId) {
      this.engine.skillTargetError = `${SKILL_HOTKEYS[slotIndex] ?? ''} 槽未装备技能`;
      audio.playSfx('click');
      this.lastInfoKey = '';
      this.renderCardInfo(this.viewRoot);
      return;
    }
    const result = this.engine.skills.beginCast(skillId);
    if (!result.ok) {
      this.engine.skillTargetError = result.error;
      audio.playButton('click');
    } else {
      if (!result.needsTarget) {
        // 即时技能音效由 BattleSkillSystem 播放
      } else {
        audio.playClickCard();
      }
      this.engine.skillTargetError = result.needsTarget
        ? `点击战场释放「${result.card.name}」(Esc 取消)`
        : '';
      this.engine.cancelPlacing();
      this.renderer?.setHover(-1, -1);
      this.lastHandKey = '';
    }
    this.lastSkillKey = '';
    this.lastInfoKey = '';
    this.renderHand(this.viewRoot);
    this.renderCardInfo(this.viewRoot);
    this.renderSkillPanel(this.viewRoot);
    this.syncPlaceGridOverlay(this.viewRoot);
  }

  renderSkillPanel(root) {
    const panel = root.querySelector('#skill-panel');
    const slotsEl = root.querySelector('#skill-slots');
    if (!panel || !slotsEl) return;

    panel.classList.toggle('hidden', !this.skillPanelOpen);

    const key = this.getSkillKey();
    if (key === this.lastSkillKey) return;
    this.lastSkillKey = key;

    const loadout = this.engine.skillLoadout ?? [];
    slotsEl.innerHTML = loadout
      .map((skillId, i) => {
        const hotkey = SKILL_HOTKEYS[i] ?? '';
        if (!skillId) {
          return `
            <button type="button" class="skill-slot empty" data-skill-slot="${i}" disabled>
              <em>${hotkey}</em>
              <span>空</span>
            </button>`;
        }
        const card = this.db.getById(skillId);
        if (!card) {
          return `
            <button type="button" class="skill-slot empty" data-skill-slot="${i}" disabled>
              <em>${hotkey}</em>
              <span>无效</span>
            </button>`;
        }
        const mp = getSkillMpCost(card);
        const cd = this.engine.skills.cooldowns[skillId] ?? 0;
        const canCast = this.engine.skills.canCast(skillId).ok;
        const pending = this.engine.skills.pendingSkillId === skillId;
        return `
          <button type="button"
            class="skill-slot${canCast ? '' : ' unavailable'}${pending ? ' pending' : ''}"
            data-skill-slot="${i}"
            title="${card.desc ?? card.name}">
            <em>${hotkey}</em>
            <span class="skill-slot-icon">${getSkillIcon(card)}</span>
            <strong>${card.name}</strong>
            <small>MP ${mp}</small>
            ${cd > 0 ? `<span class="skill-slot-cd">${cd.toFixed(0)}</span>` : ''}
          </button>`;
      })
      .join('');
  }

  renderHand(root) {
    const key = this.getHandKey();
    if (key === this.lastHandKey) return;
    this.lastHandKey = key;

    const hand = root.querySelector('#hand');
    hand.innerHTML = this.engine.deck
      .map((entry, handIndex) => {
        const { card, instance } = entry;
        const cd = this.engine.cooldowns[handIndex] ?? 0;
        const canDrag = this.canDragCard(handIndex);
        const selected =
          this.engine.placingActive && handIndex === this.engine.selectedHandIndex;
        const cq = resolveCraftQuality(instance?.craftQuality ?? 1);
        const label = formatCraftCardName(instance?.craftQuality, card.name);
        const bgPart = getCardQualityBgPart(card.quality);
        const starPart = getStrengthStarPart(instance?.strengthLv ?? 0);
        const shortName = card.name.length > 4 ? `${card.name.slice(0, 4)}…` : card.name;
        const costIcon = usesFoodCost(card) ? '🍖' : '☀';
        return `
          <button type="button" class="deck-slot ${selected ? 'selected' : ''} ${canDrag ? '' : 'unavailable'}"
            data-hand-idx="${handIndex}" draggable="${canDrag}"
            style="--quality:${cq.color}"
            title="${label}(可拖拽到战场)">
            <span class="slot-face">
              <img class="slot-bg" src="/sprites/parts/${bgPart}.png" alt="" draggable="false" />
              <img class="slot-portrait" src="/sprites/cards/${card.spriteRes}.png" alt="${label}" draggable="false" />
              <img class="slot-stars" src="/sprites/parts/${starPart}.png" alt="" draggable="false" />
            </span>
            <span class="slot-meta">
              <span class="slot-name">${shortName}</span>
              <span class="slot-cost">${costIcon}${card.cost}</span>
            </span>
            ${cd > 0 ? `<span class="slot-cd">${cd.toFixed(0)}</span>` : ''}
          </button>
        `;
      })
      .join('');
  }

  renderCardInfo(root) {
    const key = this.getInfoKey();
    if (key === this.lastInfoKey) {
      const tip = root.querySelector('#deploy-tip');
      const actionTip = this.getActionTip();
      if (tip) {
        tip.textContent = actionTip;
        tip.classList.toggle('visible', !!actionTip);
      }
      return;
    }
    this.lastInfoKey = key;

    const entry = this.engine.selectedEntry;
    const card = entry?.card;
    const panel = root.querySelector('#card-info');
    const tip = root.querySelector('#deploy-tip');
    if (!panel) return;

    if (!card || !this.engine.placingActive) {
      const actionTip = this.getActionTip();
      panel.innerHTML = actionTip
        ? `<span class="card-info-hint-skill">${actionTip}</span>`
        : '<span class="card-info-hint-idle">点击或拖拽卡槽中的卡牌进行放置 · 技能键 Q/W/E/R/T/Y</span>';
      if (tip) {
        tip.textContent = actionTip;
        tip.classList.toggle('visible', !!actionTip);
      }
      return;
    }

    const instance = entry.instance;
    const cq = resolveCraftQuality(instance?.craftQuality);
    const displayName = formatCraftCardName(instance?.craftQuality, card.name);
    const mult = getInstanceStatMultiplier(instance?.craftQuality, instance?.strengthLv);
    const atkBase = isMeleeCard(card) ? adjustMeleeAtk(card.atk) : card.atk;
    const atk = Math.round(atkBase * mult);
    const hp = Math.round(card.hp * mult);
    const cost = this.engine.getDeployCost(card);
    const costLabel = usesFoodCost(card) ? `🍖${card.cost}` : `☀${card.cost}`;
    const handIndex = this.engine.selectedHandIndex;
    const cd =
      handIndex != null ? (this.engine.cooldowns[handIndex] ?? 0) : 0;
    const canDeploy = this.engine.trainingMode
      || (this.engine.sunlight >= cost.sun && this.engine.food >= cost.food && cd <= 0);
    const isMovable = card.moveSpeed > 0;

    panel.innerHTML = `
      <img class="card-info-thumb" src="/sprites/cards/${card.spriteRes}.png" alt="" />
      <div class="card-info-text">
        <strong style="color:${cq.color}">${displayName}</strong>
        <span>⚔${atk} ❤${hp} ${costLabel}${(instance?.strengthLv ?? 0) > 0 ? ` · +${instance.strengthLv}` : ''}</span>
        <em>${canDeploy ? (isMovable ? '拖到左侧1-3列' : '拖到左侧1-5列') : cd > 0 ? `冷却${cd.toFixed(0)}s` : '资源不足'}</em>
      </div>
    `;

    if (tip) {
      const actionTip = this.getActionTip();
      tip.textContent = actionTip;
      tip.classList.toggle('visible', !!actionTip);
    }
  }

  syncHud(root) {
    const playerHp = root?.querySelector?.('#orb-player-hp');
    const enemyHp = root?.querySelector?.('#orb-enemy-hp');
    const battleTime = root?.querySelector?.('#battle-time');
    if (!playerHp || !enemyHp || !battleTime) return;
    playerHp.textContent = this.engine.heroHp;
    enemyHp.textContent = this.engine.enemyHeroHp;
    const sunText = this.engine.trainingMode ? '∞' : this.engine.sunlight;
    const foodText = this.engine.trainingMode ? '∞' : this.engine.food;
    const sunEl = root.querySelector('#battle-sun');
    const foodEl = root.querySelector('#battle-food');
    if (sunEl) sunEl.textContent = sunText;
    if (foodEl) foodEl.textContent = foodText;
    const sunHud = root.querySelector('#battle-sun-hud');
    const foodHud = root.querySelector('#battle-food-hud');
    if (sunHud) sunHud.textContent = sunText;
    if (foodHud) foodHud.textContent = foodText;
    battleTime.textContent = Math.floor(this.engine.time);
    const waveNumEl = root.querySelector('#wave-num');
    const waveTotalEl = root.querySelector('#wave-total');
    if (waveNumEl) waveNumEl.textContent = this.engine.waveNumber;
    if (waveTotalEl) waveTotalEl.textContent = this.engine.totalWaves;
    const mpEl = root.querySelector('#battle-mp');
    const mpMaxEl = root.querySelector('#battle-mp-max');
    if (mpEl) mpEl.textContent = this.engine.heroMp;
    if (mpMaxEl) mpMaxEl.textContent = this.engine.heroMpMax;

    this.renderSkillPanel(root);

    this.onResourceChange?.(this.engine.sunlight, this.engine.food);
    this.onHeroHpChange?.(this.engine.heroHp, this.engine.heroMaxHp);

    const log = root.querySelector('#battle-log');
    if (log) {
      log.innerHTML = this.engine.log
        .map((l) => `<li><time>${l.t}s</time>${l.msg}</li>`)
        .join('');
    }

    this.updateResultOverlay(root);
  }

  updateResultOverlay(root) {
    const overlay = root.querySelector('#result-overlay');
    if (!overlay) return;
    if (this.engine.status === 'playing') {
      overlay.classList.add('hidden');
      overlay.classList.remove('result-enter', 'result-win', 'result-lose');
      delete overlay.dataset.result;
      return;
    }
    overlay.classList.remove('hidden');
    const win = this.engine.status === 'win';
    const resultKey = win ? 'win' : 'lose';
    overlay.classList.toggle('result-win', win);
    overlay.classList.toggle('result-lose', !win);
    if (overlay.dataset.result !== resultKey) {
      overlay.dataset.result = resultKey;
      overlay.classList.remove('result-enter');
      void overlay.offsetWidth;
      overlay.classList.add('result-enter');
    }
    if (!this._resultAudioPlayed) {
      audio.stopAll();
      audio.playBattleResult(win);
      this._resultAudioPlayed = true;
    }
    if (!this._resultReported) {
      this._resultReported = true;
      this.onBattleResult?.({
        won: win,
        stage: this.engine.stage,
        mode: this.pvp?.mode ?? 'pve',
        bossId: this.pvp?.bossId ?? this.boss?.id ?? null,
        difficulty: this.pvp?.difficulty ?? this.boss?.difficulty ?? null,
        durationMs: Math.max(0, Math.round((this.engine.time || 0) * 1000)),
        drops: (this.engine.lootDrops ?? []).map((drop) => ({ ...drop })),
      });
      // 任务事件上报：战斗完成 / 通关 / 击杀数 / 时长 / 零伤亡 / 用卡种类
      if (win) this.onQuestEvent?.('adventure_complete', { count: 1 });
      this.onQuestEvent?.('battle_complete', { count: 1 });
      const kills = this.engine.killsThisBattle ?? 0;
      if (kills > 0) this.onQuestEvent?.('kill_enemy', { count: kills });
      const dur = Math.round(this.engine.time || 0);
      this.onQuestEvent?.('battle_duration', { duration: dur });
      if (kills > 0) this.onQuestEvent?.('battle_kill', { count: kills });
      const lostAny = (this.engine.units ?? []).some(
        (u) => u.team === 'player' && u._diedThisBattle,
      );
      if (!lostAny) this.onQuestEvent?.('battle_nodeath', { count: 1 });
    }
    root.querySelector('#result-desc').textContent = win
      ? `成功通关 ${this.engine.stage.stage_name}`
      : '己方基地被攻破，请调整阵容再试';
    // 胜利/失败图标：使用 battle.png 图集的 win_icon / lose_icon(原版 UI 资源)
    this.drawResultIcon(root, win);
    const nextBtn = root.querySelector('#result-next');
    const hasNext = this.db.stages.some(
      (s) => s.stage_id === this.engine.stage.stage_id + 1,
    );
    nextBtn?.classList.toggle('hidden', !win || !hasNext);
  }

  /** 从 battle.png 图集绘制 win_icon / lose_icon(替代 debug 文字标题) */
  drawResultIcon(root, win) {
    const iconCanvas = root.querySelector('#result-icon');
    if (!iconCanvas) return;
    const img = this.renderer?.battleAtlasImage;
    const sprite = (battleAtlasData.sprites ?? []).find(
      (s) => s.name === (win ? 'win_icon' : 'lose_icon'),
    );
    if (!img || !sprite) return;
    const scale = 0.62;
    const w = Math.round(sprite.width * scale);
    const h = Math.round(sprite.height * scale);
    iconCanvas.width = w;
    iconCanvas.height = h;
    const ictx = iconCanvas.getContext('2d');
    ictx.clearRect(0, 0, w, h);
    ictx.drawImage(
      img,
      sprite.x, sprite.y, sprite.width, sprite.height,
      0, 0, w, h,
    );
  }

  isBaseFloatCol(col) {
    return (
      Math.abs(col - PLAYER_BASE_FRAC) < 0.08 ||
      Math.abs(col - ENEMY_BASE_FRAC) < 0.08
    );
  }

  baseFloatCenterX(col) {
    if (Math.abs(col - ENEMY_BASE_FRAC) < 0.08) {
      return GAME_W - BASE_HP_SLOT_EDGE - BASE_HP_SLOT_W / 2;
    }
    return BASE_HP_SLOT_EDGE + BASE_HP_SLOT_W / 2;
  }

  syncBaseFloats(root) {
    const layer = root.querySelector('#base-float-layer');
    if (!layer) return;

    const floats = this.engine.floats.filter((f) => this.isBaseFloatCol(f.col));
    layer.innerHTML = floats
      .map((f) => {
        const alpha = Math.min(1, f.life);
        const x = this.baseFloatCenterX(f.col);
        const y = FIELD_TOP + cellCenterY(f.lane) + f.y * 20;
        const text = formatBattleDelta(f.amount);
        const color = f.amount > 0 ? '#4ade80' : '#f87171';
        return `<span class="base-float" style="left:${x}px;top:${y}px;color:${color};opacity:${alpha}">${text}</span>`;
      })
      .join('');
  }

  syncCooldownOverlay(root) {
    const hand = root?.querySelector?.('#hand');
    if (!hand || !this.engine) return;
    for (const btn of hand.querySelectorAll('[data-hand-idx]')) {
      const i = Number(btn.dataset.handIdx);
      const entry = this.engine.deck?.[i];
      const cd = this.engine.cooldowns?.[i] ?? 0;
      if (cd > 0 && entry?.card) {
        let mask = btn.querySelector('.slot-cd-mask');
        let num = btn.querySelector('.slot-cd');
        if (!mask) {
          mask = document.createElement('span');
          mask.className = 'slot-cd-mask';
          btn.appendChild(mask);
        }
        if (!num) {
          num = document.createElement('span');
          num.className = 'slot-cd';
          btn.appendChild(num);
        }
        const stats = calculateCardStats(
          entry.card,
          entry.instance?.craftQuality ?? 2,
          entry.instance?.star ?? entry.instance?.strengthLv ?? 0,
        );
        const maxCd = Math.max(1e-6, stats.cd);
        const ratio = Math.max(0, Math.min(1, cd / maxCd));
        mask.style.height = `${(ratio * 100).toFixed(2)}%`;
        num.textContent = String(Math.ceil(cd));
        const canDrag = this.canDragCard(i);
        btn.classList.toggle('unavailable', !canDrag);
        btn.draggable = String(canDrag);
      } else {
        btn.querySelector('.slot-cd-mask')?.remove();
        btn.querySelector('.slot-cd')?.remove();
      }
    }
  }

  buildPlaceGridOverlay(root) {
    const overlay = root.querySelector('#place-grid-overlay');
    if (!overlay) return;

    const cells = [];
    for (let lane = 0; lane < LANES; lane++) {
      for (let col = 0; col < COLS; col++) {
        cells.push(
          `<div class="place-grid-cell" data-lane="${lane}" data-col="${col}" style="left:${cellX(col)}px;top:${cellY(lane)}px;width:${CELL_W}px;height:${CELL_H}px"></div>`,
        );
      }
    }
    overlay.innerHTML = cells.join('');
  }

  getPlaceCellState(lane, col) {
    const handIndex = this.engine.selectedHandIndex;

    // 由 engine.canDeploy 统一判定：外星哨兵等可部署到敌方不可移动格的卡，
    // 其合法格子会直接显示为可放置（place-ok），不再被“己方五列”硬限制拦掉。
    if (this.engine.canDeploy?.(lane, col, handIndex, { silent: true })) {
      return 'place-ok';
    }
    const occupied = this.engine
      .getUnitsAt(lane, col)
      .some((u) => u.team === 'player' && u.alive && !u.isMovable?.());
    if (occupied) {
      return 'place-occupied';
    }
    return 'place-forbidden';
  }

  syncPlaceGridOverlay(root) {
    const overlay = root.querySelector('#place-grid-overlay');
    const placing =
      this.engine.placingActive && this.engine.status === 'playing';
    const skillTarget = this.isSkillTargeting();
    const show = placing || skillTarget;

    root.querySelector('.game-container')?.classList.toggle('placing', placing);

    if (overlay) {
      overlay.classList.toggle('hidden', !show);
      overlay.setAttribute('aria-hidden', show ? 'false' : 'true');

      if (show) {
        const hoverLane = this.renderer?.hoverLane ?? -1;
        const hoverCol = this.renderer?.hoverCol ?? -1;
        for (const cell of overlay.querySelectorAll('.place-grid-cell')) {
          const lane = Number(cell.dataset.lane);
          const col = Number(cell.dataset.col);
          cell.className = 'place-grid-cell';
          if (skillTarget) {
            cell.classList.add('skill-target-ok');
            if (lane === hoverLane && col === hoverCol) {
              cell.classList.add('skill-target-hover');
            }
          } else {
            const state = this.getPlaceCellState(lane, col);
            cell.classList.add(state);
            if (state === 'place-ok' && lane === hoverLane && col === hoverCol) {
              cell.classList.add('place-hover');
            }
          }
        }
      }
    }
  }

  blockCanvasClick(ms = 500) {
    this.suppressCanvasClickUntil = performance.now() + ms;
  }

  async tryDeployAt(root, lane, col, handIndex = this.engine.selectedHandIndex) {
    if (this.pvp?.spectator) return false;
    if (
      !this.engine.placingActive ||
      !Number.isInteger(handIndex) ||
      handIndex < 0
    ) {
      return false;
    }
    this.engine.selectCard(handIndex);
    const entry = this.engine.deck[handIndex];
    try {
      if (await this.engine.deploy(lane, col, handIndex)) {
        if (this.pvp) {
          this.pvpSocket?.sendPvpDeploy?.({ cardId: entry.card.id, lane, col });
        }
        this.renderer.requestSprite(entry.card.spriteRes);
        this.renderer.requestBullet(entry.card.spriteRes);
        this.engine.cancelPlacing();
        this.renderer.setHover(-1, -1);
        this.lastHandKey = '';
        this.lastInfoKey = '';
        return true;
      }
    } catch (err) {
      console.error('deploy failed', err);
      this.engine.lastDeployError = '放置失败，请重试';
    }
    audio.playSfx('click');
    this.lastInfoKey = '';
    this.renderCardInfo(root);
    return false;
  }

  bindEvents(root) {
    const canvas = root.querySelector('#battle-canvas');
    const hand = root.querySelector('#hand');
    const ghost = root.querySelector('#drag-ghost');

    canvas.addEventListener('mousemove', (e) => {
      if (!this.engine.placingActive && !this.isSkillTargeting()) {
        this.renderer.setHover(-1, -1);
        return;
      }
      const { lane, col } = this.pointerToCell(e, canvas);
      this.renderer.setHover(lane, col);
    });

    canvas.addEventListener('mouseleave', () => {
      this.renderer.setHover(-1, -1);
    });

    canvas.addEventListener('click', (e) => {
      if (performance.now() < this.suppressCanvasClickUntil) return;
      const { lane, col } = this.pointerToCell(e, canvas);
      if (lane < 0 || col < 0) return;

      if (this.isSkillTargeting()) {
        const result = this.engine.skills.tryTarget(lane, col);
        if (!result.ok) {
          this.engine.skillTargetError = result.error;
          audio.playSfx('click');
        } else {
          audio.playSfx('click');
          this.engine.skillTargetError = '';
        }
        this.lastSkillKey = '';
        this.lastInfoKey = '';
        this.renderCardInfo(root);
        this.renderSkillPanel(root);
        this.syncPlaceGridOverlay(root);
        return;
      }

      if (!this.engine.placingActive || this.engine.selectedHandIndex == null) return;
      void this.tryDeployAt(root, lane, col, this.engine.selectedHandIndex);
    });

    canvas.addEventListener('dragover', (e) => {
      if (this.dragHandIndex == null && !this.engine.placingActive) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const { lane, col } = this.pointerToCell(e, canvas);
      this.renderer.setHover(lane, col);
    });

    canvas.addEventListener('dragleave', () => {
      this.renderer.setHover(-1, -1);
    });

    canvas.addEventListener('drop', async (e) => {
      e.preventDefault();
      const resolved = resolveHandIndexFromTransfer(
        e.dataTransfer,
        this.dragHandIndex,
      );
      if (resolved == null || !Number.isInteger(resolved)) return;
      this.engine.selectCard(resolved);
      const { lane, col } = this.pointerToCell(e, canvas);
      if (lane < 0 || col < 0) {
        this.blockCanvasClick();
        return;
      }
      this.dropSucceeded = await this.tryDeployAt(root, lane, col, resolved);
      this.blockCanvasClick();
      this.dragHandIndex = null;
      ghost?.classList.add('hidden');
    });

    hand.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hand-idx]');
      if (!btn) return;
      e.stopPropagation();
      const handIndex = Number(btn.dataset.handIdx);
      if (
        this.engine.placingActive &&
        this.engine.selectedHandIndex === handIndex
      ) {
        audio.playSfx('click');
        this.blockCanvasClick();
        this.engine.skills?.cancelTargeting();
        this.engine.skillTargetError = '';
        this.engine.cancelPlacing();
        this.renderer.setHover(-1, -1);
        this.lastHandKey = '';
        this.lastInfoKey = '';
        this.lastSkillKey = '';
        this.renderHand(root);
        this.renderCardInfo(root);
        this.renderSkillPanel(root);
        this.syncPlaceGridOverlay(root);
        return;
      }
      audio.playClickCard();
      this.engine.skills?.cancelTargeting();
      this.engine.skillTargetError = '';
      this.engine.selectCard(handIndex);
      this.engine.lastDeployError = '';
      this.lastHandKey = '';
      this.lastInfoKey = '';
      this.lastSkillKey = '';
      this.renderHand(root);
      this.renderCardInfo(root);
      this.renderSkillPanel(root);
      this.syncPlaceGridOverlay(root);
    });

    hand.addEventListener('dragstart', (e) => {
      const btn = e.target.closest('[data-hand-idx]');
      if (!btn) {
        e.preventDefault();
        return;
      }
      const handIndex = Number(btn.dataset.handIdx);
      if (!this.canDragCard(handIndex)) {
        e.preventDefault();
        return;
      }
      this.dropSucceeded = false;
      this.dragHandIndex = handIndex;
      this.engine.skills?.cancelTargeting();
      this.engine.skillTargetError = '';
      this.engine.selectCard(handIndex);
      this.engine.lastDeployError = '';
      e.dataTransfer.setData('text/hand-idx', String(handIndex));
      e.dataTransfer.setData('text/plain', String(handIndex));
      e.dataTransfer.effectAllowed = 'copy';
      // 用同步可用的 1×1 透明 canvas 替换浏览器默认拖拽图标(虚线框/加号)。
      // 之前用 new Image() 加载 data URI 是异步的，调用 setDragImage 时未就绪 → 浏览器显示默认拖拽 UI。
      const transparentDragImage = document.createElement('canvas');
      transparentDragImage.width = 1;
      transparentDragImage.height = 1;
      e.dataTransfer.setDragImage(transparentDragImage, 0, 0);
      const entry = this.engine.deck[handIndex];
      const card = entry?.card;
      if (ghost && card) {
        const label = formatCraftCardName(entry.instance?.craftQuality, card.name);
        const labelEl = root.querySelector('#drag-ghost-label');
        if (labelEl) labelEl.textContent = label;
        this.startDragGhostAnim(card.spriteRes);
        ghost.classList.remove('hidden');
      }
      this.lastInfoKey = '';
      this.renderCardInfo(root);
    });

    hand.addEventListener('dragend', () => {
      this.blockCanvasClick();
      this.dragHandIndex = null;
      this.stopDragGhostAnim();
      ghost?.classList.add('hidden');
      this.renderer.setHover(-1, -1);
      if (!this.dropSucceeded && this.engine.placingActive) {
        // 拖回手牌/未落格：保持选卡态，不部署、不扣费
      }
    });

    document.addEventListener('dragover', (e) => {
      if (this.dragHandIndex == null || !ghost) return;
      const hoverLane = this.renderer?.hoverLane ?? -1;
      const hoverCol = this.renderer?.hoverCol ?? -1;
      const overlay = root.querySelector('#place-grid-overlay');
      const target = overlay && !overlay.classList.contains('hidden') ? overlay : root.querySelector('#battle-canvas');
      if (target && hoverLane >= 0 && hoverCol >= 0) {
        // 按网格 overlay 实际显示矩形映射格位(与 grid-v2 pointerToCell 一致)，
        // 卡牌幽灵跟随目标格中心，不再错位
        const tr = target.getBoundingClientRect();
        ghost.style.left = `${tr.left + ((hoverCol + 0.5) / COLS) * tr.width}px`;
        ghost.style.top = `${tr.top + ((hoverLane + 0.5) / LANES) * tr.height}px`;
      } else {
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
      }
    });

    root.querySelector('#stage-picker')?.addEventListener('change', (e) => {
      audio.playSfx('click');
      this.trainingMode = false;
      this.restartBattle(Number(e.target.value));
    });

    root.querySelector('#restart-btn')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.restartBattle(this.engine.stage.stage_id);
    });

    // 名字显示开关（持久化 localStorage）。顶部按钮与设置面板同步。
    const syncNamesButtons = () => {
      const off = localStorage.getItem('clbwz_show_unit_names') === '0';
      const namesBtn = root.querySelector('#toggle-names-btn');
      const settingsNamesBtn = root.querySelector('#settings-names');
      if (namesBtn) {
        namesBtn.textContent = off ? '👤 名字：关' : '👤 名字：开';
        namesBtn.style.opacity = off ? '0.55' : '1';
      }
      if (settingsNamesBtn) {
        settingsNamesBtn.textContent = off ? '👤 名称：关' : '👤 名称：开';
      }
    };
    const toggleUnitNames = () => {
      audio.playSfx('click');
      const off = localStorage.getItem('clbwz_show_unit_names') === '0';
      localStorage.setItem('clbwz_show_unit_names', off ? '1' : '0');
      syncNamesButtons();
    };
    root.querySelector('#toggle-names-btn')?.addEventListener('click', toggleUnitNames);
    root.querySelector('#settings-names')?.addEventListener('click', toggleUnitNames);
    syncNamesButtons();

    root.querySelector('#result-retry').addEventListener('click', () => {
      audio.playSfx('click');
      this.restartBattle(this.engine.stage.stage_id);
    });

    root.querySelector('#result-next').addEventListener('click', () => {
      audio.playSfx('click');
      this.restartBattle(this.engine.stage.stage_id + 1);
      const picker = root.querySelector('#stage-picker');
      if (picker) picker.value = this.engine.stage.stage_id;
    });

    root.querySelector('#result-exit').addEventListener('click', () => {
      audio.playSfx('click');
      const authorityExit = this.pvp ? document.querySelector('#pvp-exit-ov') : null;
      if (authorityExit) authorityExit.click();
      else this.onNavigate?.('worldmap');
    });

    root.querySelector('#battle-back').addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('main');
    });

    root.querySelector('#battle-skill').addEventListener('click', () => {
      audio.playSfx('click');
      this.skillPanelOpen = !this.skillPanelOpen;
      this.lastSkillKey = '';
      this.renderSkillPanel(root);
    });

    root.querySelector('#skill-panel-close')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.skillPanelOpen = false;
      this.lastSkillKey = '';
      this.renderSkillPanel(root);
    });

    root.querySelector('#skill-slots')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-skill-slot]');
      if (!btn || btn.disabled) return;
      e.stopPropagation();
      this.tryCastSkillBySlot(Number(btn.dataset.skillSlot));
    });

    root.querySelector('#battle-settings').addEventListener('click', () => {
      audio.playSfx('click');
      root.querySelector('#settings-panel').classList.toggle('hidden');
    });

    root.querySelector('#settings-close').addEventListener('click', () => {
      root.querySelector('#settings-panel').classList.add('hidden');
    });

    root.querySelector('#settings-mute').addEventListener('click', () => {
      const muted = audio.toggleMute();
      root.querySelector('#settings-mute').textContent = muted ? '🔇 音效' : '🔊 音效';
    });

    const lowqBtn = root.querySelector('#settings-lowq');
    const syncLowqBtn = () => {
      const low = localStorage.getItem('clbwz_low_quality') === '1' || this.renderer?.forceLowQuality === true;
      if (lowqBtn) lowqBtn.textContent = low ? '🎨 低画质：开' : '🎨 低画质：关';
    };
    lowqBtn?.addEventListener('click', () => {
      audio.playSfx('click');
      const next = !(localStorage.getItem('clbwz_low_quality') === '1' || this.renderer?.forceLowQuality === true);
      localStorage.setItem('clbwz_low_quality', next ? '1' : '0');
      if (this.renderer) this.renderer.forceLowQuality = next;
      syncLowqBtn();
    });
    syncLowqBtn();

    root.querySelector('#settings-restart').addEventListener('click', () => {
      audio.playSfx('click');
      this.restartBattle(this.engine.stage.stage_id);
      root.querySelector('#settings-panel').classList.add('hidden');
    });

    window.addEventListener('keydown', this._onKeydown);
    this._keydownBound = true;
  }

  pointerToCell(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    // 渲染器 2D setTransform(fieldScale)：战场坐标 bx → canvas 像素 bx*s。
    // 反推：bx = (clientX - rect.left) * canvas.width / (rect.width * s)
    const s = this.renderer?.fieldScale || 1;
    const x = (e.clientX - rect.left) * (canvas.width / (rect.width * s));
    const y = (e.clientY - rect.top) * (canvas.height / (rect.height * s));
    return {
      col: pointerToCol(x),
      lane: pointerToLane(y),
    };
  }

  _onKeydown = (e) => {
    // 输入框（战斗聊天、设置等）内不触发战斗快捷键。
    const target = e.target;
    if (target instanceof HTMLElement && (
      target.matches('input, textarea, select')
      || target.isContentEditable
      || Boolean(target.closest?.('.battle-chat-shell'))
    )) return;
    if (this.pvp?.spectator) return;
    if (!this.viewRoot || !this.engine) return;
    if (e.key === 'Escape') {
      this.blockCanvasClick();
      this.engine.skills?.cancelTargeting();
      this.engine.skillTargetError = '';
      this.engine.cancelPlacing();
      this.renderer.setHover(-1, -1);
      this.lastHandKey = '';
      this.lastInfoKey = '';
      this.lastSkillKey = '';
      this.renderHand(this.viewRoot);
      this.renderCardInfo(this.viewRoot);
      this.renderSkillPanel(this.viewRoot);
      this.syncPlaceGridOverlay(this.viewRoot);
      this.viewRoot.querySelector('#settings-panel')?.classList.add('hidden');
      return;
    }
    const skillSlot = SKILL_HOTKEY_INDEX[e.key.toLowerCase()];
    if (skillSlot != null) {
      e.preventDefault();
      this.tryCastSkillBySlot(skillSlot);
      return;
    }
    let idx = -1;
    if (e.key >= '1' && e.key <= '9') idx = Number(e.key) - 1;
    else if (e.key === '0') idx = 9;
    if (idx >= 0 && idx < this.engine.deck.length) {
      audio.playClickCard();
      this.engine.skills?.cancelTargeting();
      this.engine.skillTargetError = '';
      this.engine.selectCard(idx);
      this.lastHandKey = '';
      this.lastInfoKey = '';
      this.lastSkillKey = '';
      this.renderHand(this.viewRoot);
      this.renderCardInfo(this.viewRoot);
      this.renderSkillPanel(this.viewRoot);
      this.syncPlaceGridOverlay(this.viewRoot);
    }
  };

  async restartBattle(stageId) {
    this.stopLoop();
    this.lastStatus = 'playing';
    this._resultReported = false;
    this._resultAudioPlayed = false;
    this.lastHandKey = '';
    this.lastInfoKey = '';
    this.dragHandIndex = null;
    this.dropSucceeded = false;
    this.suppressCanvasClickUntil = 0;
    this.engine = new BattleEngine(this.db, stageId, this.deckSlots, this.cardInventory, {
      skillLoadout: this.heroSkills?.getLoadout() ?? [],
      heroMpMax: this.heroSkills?.getMpMax() ?? 100,
      trainingMode: this.trainingMode,
      boss: this.boss,
      pvp: Boolean(this.pvp),
      talentBonus: this.talentBonusForBattle(),
    });
    this.buildPlaceGridOverlay(this.viewRoot);
    void this.renderer.preloadForEngine(this.engine);
    this.renderHand(this.viewRoot);
    this.renderCardInfo(this.viewRoot);
    this.lastSkillKey = '';
    this.renderSkillPanel(this.viewRoot);
    this.syncHud(this.viewRoot);
    const nameEl = this.viewRoot.querySelector('#orb-enemy-name');
    if (nameEl) nameEl.textContent = this.engine.stage.enemy_name ?? '敌方';
    const picker = this.viewRoot.querySelector('#stage-picker');
    if (picker) picker.value = stageId;
    // 换场地：刷新战斗背景(grass/map/base)
    try {
      const bg = resolveBattleBackground(this.engine.stage, { trainingMode: this.trainingMode, pvpMode: Boolean(this.pvp), bossId: this.pvp?.bossId ?? this.bossId, trainingMap: this.trainingMap });
      const scene = this.viewRoot.querySelector('.battle-game-wrap.battle-scene');
      if (scene) {
        scene.style.setProperty('--bg-grass', `url('${bg.baseUrl}')`);
        scene.style.setProperty('--bg-map', `url('${bg.mapUrl}')`);
        scene.style.setProperty('--bg-base', `url('${bg.baseUrl}')`);
      }
    } catch (e) { /* 背景解析失败忽略 */ }
    const waveTotal = this.viewRoot.querySelector('#wave-total');
    if (waveTotal) waveTotal.textContent = this.engine.totalWaves;
    this.viewRoot.querySelector('#result-overlay')?.classList.add('hidden');
    this.startLoop();
  }

  startLoop() {
    this.lastTs = performance.now();
    this.lastWallClockMs = Date.now();
    void guardBattlePromise('pve.preload', {
      battleTime: this.engine?.time,
      tick: this.engine?.battleTick,
    }, this.renderer.preloadForEngine(this.engine));
    const tick = (ts) => {
      const wallClockMs = Date.now();
      const dt = Math.max(0, (wallClockMs - this.lastWallClockMs) / 1000);
      this.lastWallClockMs = wallClockMs;
      this.lastTs = ts;
      const runtimeContext = {
        battleTime: this.engine?.time,
        tick: this.engine?.battleTick,
        elapsed: dt,
      };
      guardBattleRuntime('pve.simulation', runtimeContext, () => {
        advanceBattleByWallTime(this.engine, dt);
      });
      guardBattleRuntime('pve.render', runtimeContext, () => {
        this.renderer.draw(this.engine);
      });

      // boss 战音乐：场上存在存活 boss → fireBoss.mp3，否则战斗 BGM
      if (this.engine.status === 'playing') {
        const hasBoss = this.engine.units.some((u) => u.alive && u.isBoss);
        const desiredBgm = hasBoss ? 'boss' : 'battle';
        if (desiredBgm !== audio.getBgmKey()) {
          audio.playBgm(desiredBgm, { fade: true });
        }
      }

      if (this.engine.status !== this.lastStatus) {
        if (this.engine.status === 'win' || this.engine.status === 'lose') {
          // 战斗结束前先同步一次 HUD，把基地血量归零显示（避免定格在"6血"旧值造成误判未结算）
          this.syncHud(this.viewRoot);
          // PVE 战斗结束：先停止战斗循环与战斗音效，再播胜利/失败音(顺序不能反，
          // 否则 stopAll 会把刚播的结果音一起掐断——之前 debug 时静音的根因)
          this.stopLoop();
          audio.stopAll();
          audio.playBattleResult(this.engine.status === 'win');
          this._resultAudioPlayed = true;
        }
        this.lastStatus = this.engine.status;
      }

      if (this.viewRoot) guardBattleRuntime('pve.ui-sync', runtimeContext, () => {
        if (!this.__lastFastUiTs || ts - this.__lastFastUiTs >= 33) {
          this.__lastFastUiTs = ts;
          this.syncCooldownOverlay(this.viewRoot);
          this.syncPlaceGridOverlay(this.viewRoot);
        }
        if (!this.__lastSlowUiTs || ts - this.__lastSlowUiTs >= 100) {
          this.__lastSlowUiTs = ts;
          this.renderHand(this.viewRoot);
          this.renderCardInfo(this.viewRoot);
          this.syncHud(this.viewRoot);
        }
        // 基地数字已统一用 canvas 数字精灵绘制(与卡牌同字体)，不再用 DOM 版本
        void 0;
        const canvas = this.viewRoot.querySelector('#battle-canvas');
        if (canvas) {
          const active =
            (this.engine.placingActive || this.isSkillTargeting()) &&
            this.engine.status === 'playing';
          canvas.classList.toggle('placing', active);
          canvas.classList.toggle('skill-targeting', this.isSkillTargeting());
        }
      });
      // 战斗结束后不再续帧(stopLoop 由状态分支触发，这里兜底)
      if (this.engine.status === 'playing') {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.raf = null;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  startDragGhostAnim(spriteRes) {
    this.stopDragGhostAnim();
    this.dragGhostRes = spriteRes;
    this.dragGhostClock = 0;
    void unitAnimPlayer.awaitReady(spriteRes);
    const tick = (ts) => {
      if (this.dragGhostRes == null) return;
      if (!this._dragGhostLastTs) this._dragGhostLastTs = ts;
      const dt = Math.min(0.05, (ts - this._dragGhostLastTs) / 1000);
      this._dragGhostLastTs = ts;
      this.dragGhostClock += dt;
      const canvas = this.viewRoot?.querySelector('#drag-ghost-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        unitAnimPlayer.drawPreview(ctx, this.dragGhostRes, 0, 0, canvas.width, canvas.height, this.dragGhostClock);
      }
      this.dragGhostRaf = requestAnimationFrame(tick);
    };
    this.dragGhostRaf = requestAnimationFrame(tick);
  }

  stopDragGhostAnim() {
    if (this.dragGhostRaf) cancelAnimationFrame(this.dragGhostRaf);
    this.dragGhostRaf = null;
    this.dragGhostRes = null;
    this._dragGhostLastTs = 0;
    const canvas = this.viewRoot?.querySelector('#drag-ghost-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  fitBattleScale(root) {
    const wrap = root.querySelector('.battle-game-wrap');
    const gc = root.querySelector('.game-container');
    const dock = root.querySelector('.battle-immersive-dock');
    if (!wrap || !gc) return;
    // game-container 不再额外缩放(战场内部等比处理，避免双重缩放)
    gc.style.setProperty('--battle-scale', '1');
    // canvas 属性 = 战场显示尺寸(1:1 无拉伸)，渲染器按 fieldScale 等比放大战场：
    // 网格(place-grid-overlay)同 scale → 战场与格子像素对齐，无压缩、无坐标位移
    const stage = root.querySelector('.battlefield-wrap');
    const canvas = root.querySelector('#battle-canvas');
    const grid = root.querySelector('#place-grid-overlay');
    if (stage && canvas) {
      const stageW = Math.max(1, stage.clientWidth);
      const stageH = Math.max(1, stage.clientHeight);
      canvas.width = stageW;
      canvas.height = stageH;
      const scale = Math.min(stageW / FIELD_W, stageH / FIELD_H);
      if (this.renderer) this.renderer.fieldScale = scale;
      if (grid) {
        Object.assign(grid.style, {
          left: '0px',
          top: '0px',
          width: `${stageW}px`,
          height: `${stageH}px`,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        });
      }
    }
  }

  destroy() {
    this.stopDragGhostAnim();
    this.stopLoop();
    if (this._keydownBound) {
      window.removeEventListener('keydown', this._onKeydown);
      this._keydownBound = false;
    }
    if (this._onBattleResize) {
      window.removeEventListener('resize', this._onBattleResize);
      this._onBattleResize = null;
    }
    audio.stopBgm();
  }
}
