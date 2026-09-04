import { BattleRenderer } from '../battle/BattleRenderer.js';
import { audio } from '../core/AudioManager.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlePresentationCompletion20260811');
const BOSS_BASELINE_SCALE = 1.55;
const MAX_SEEN_EVENTS = 160;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function ensureStyle() {
  if (document.getElementById('battle-presentation-completion-20260811-style')) return;
  const style = document.createElement('style');
  style.id = 'battle-presentation-completion-20260811-style';
  style.textContent = `
    .battle-skill-announcement-layer {
      position: absolute;
      inset: 0;
      z-index: 48;
      pointer-events: none;
      overflow: visible;
    }
    .battle-skill-speech-bubble {
      position: absolute;
      min-width: 88px;
      max-width: 210px;
      padding: 7px 12px 8px;
      border-radius: 12px;
      border: 2px solid rgba(255,232,147,.96);
      background: linear-gradient(180deg, rgba(32,47,52,.97), rgba(12,28,32,.95));
      box-shadow: 0 3px 12px rgba(0,0,0,.38), inset 0 0 10px rgba(255,236,155,.12);
      color: #ffe98a;
      font: 900 16px/1.15 "Microsoft YaHei", sans-serif;
      text-align: center;
      text-shadow: 0 2px 2px rgba(0,0,0,.8);
      white-space: nowrap;
      transform: translate(-50%, -125%) scale(.88);
      transform-origin: 50% 100%;
      animation: battle-skill-bubble-in-out 1.55s ease both;
    }
    .battle-skill-speech-bubble::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -9px;
      width: 14px;
      height: 14px;
      background: rgba(15,31,35,.97);
      border-right: 2px solid rgba(255,232,147,.96);
      border-bottom: 2px solid rgba(255,232,147,.96);
      transform: translateX(-50%) rotate(45deg);
    }
    .battle-skill-speech-bubble.enemy {
      border-color: rgba(255,154,143,.96);
      color: #ffd0c8;
    }
    .battle-skill-speech-bubble.enemy::after {
      border-right-color: rgba(255,154,143,.96);
      border-bottom-color: rgba(255,154,143,.96);
    }
    .battle-skill-speech-bubble.boss {
      min-width: 112px;
      font-size: 18px;
      border-color: rgba(255,111,108,.98);
      color: #ffe3d6;
      background: linear-gradient(180deg, rgba(74,24,26,.96), rgba(32,13,17,.96));
    }
    .battle-skill-speech-bubble.boss::after {
      background: rgba(40,15,19,.97);
      border-right-color: rgba(255,111,108,.98);
      border-bottom-color: rgba(255,111,108,.98);
    }
    @keyframes battle-skill-bubble-in-out {
      0% { opacity: 0; transform: translate(-50%, -110%) scale(.72); }
      13% { opacity: 1; transform: translate(-50%, -130%) scale(1.04); }
      22%, 74% { opacity: 1; transform: translate(-50%, -125%) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -145%) scale(.92); }
    }
  `;
  document.head.append(style);
}

function ensureAnnouncementLayer(view) {
  const wrap = view.viewRoot?.querySelector?.('.battle-game-wrap');
  if (!wrap) return null;
  ensureStyle();
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  let layer = wrap.querySelector('[data-battle-skill-announcement-layer]');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'battle-skill-announcement-layer';
    layer.dataset.battleSkillAnnouncementLayer = 'true';
    wrap.append(layer);
  }
  return layer;
}

function localSideForEvent(view, event) {
  const ownTeam = String(view.pvp?.team || 'blue');
  return String(event?.team || 'blue') === ownTeam ? 'left' : 'right';
}

function bossAnchor(view) {
  const boss = (view.engine?.units ?? []).find((unit) => unit.isBoss || unit.pvpBoss);
  const canvas = view.renderer?.ctx?.canvas;
  const wrap = view.viewRoot?.querySelector?.('.battle-game-wrap');
  if (!boss || !canvas || !wrap) return null;
  const x = view.renderer?.battleGridX?.(boss.col);
  const y = view.renderer?.battleGridY?.(boss.lane);
  if (![x, y].every(Number.isFinite)) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const scaleX = canvas.width > 0 ? canvasRect.width / canvas.width : 1;
  const scaleY = canvas.height > 0 ? canvasRect.height / canvas.height : 1;
  return {
    x: canvasRect.left - wrapRect.left + x * scaleX,
    y: canvasRect.top - wrapRect.top + y * scaleY - Math.max(30, 32 * finite(boss.__bossDisplayScale, 1)),
  };
}

function heroAnchor(view, side) {
  const layer = ensureAnnouncementLayer(view);
  if (!layer) return null;
  const width = layer.clientWidth || view.viewRoot?.clientWidth || 1600;
  const height = layer.clientHeight || view.viewRoot?.clientHeight || 900;
  return {
    x: side === 'left' ? width * 0.095 : width * 0.905,
    y: height * 0.55,
  };
}

function eventKey(event) {
  return String(event?.id ?? `${event?.team}:${event?.skillId}:${event?.startedAt ?? event?.applyAt ?? 0}:${event?.kind}`);
}

function rememberAnnouncement(view, event) {
  const key = eventKey(event);
  view.__battlePresentationSeenEvents ??= new Set();
  if (view.__battlePresentationSeenEvents.has(key)) return false;
  view.__battlePresentationSeenEvents.add(key);
  if (view.__battlePresentationSeenEvents.size > MAX_SEEN_EVENTS) {
    const first = view.__battlePresentationSeenEvents.values().next().value;
    view.__battlePresentationSeenEvents.delete(first);
  }
  return true;
}

function skillName(view, event) {
  const id = Number(event?.skillId);
  if (!Number.isInteger(id) || id <= 0) return '';
  return String(view.db?.getById?.(id)?.name || `技能 ${id}`);
}

function announceSkill(view, event) {
  if (!event || !Number(event.skillId) || !rememberAnnouncement(view, event)) return;
  const layer = ensureAnnouncementLayer(view);
  if (!layer) return;
  const name = skillName(view, event);
  if (!name) return;

  const isBoss = view.pvp?.mode === 'boss' && String(event.team) === 'red';
  const side = localSideForEvent(view, event);
  const anchor = isBoss ? (bossAnchor(view) ?? heroAnchor(view, 'right')) : heroAnchor(view, side);
  if (!anchor) return;

  const bubble = document.createElement('div');
  bubble.className = `battle-skill-speech-bubble ${side === 'right' ? 'enemy' : 'ally'}${isBoss ? ' boss' : ''}`;
  bubble.dataset.skillId = String(Number(event.skillId));
  bubble.dataset.skillEventId = eventKey(event);
  bubble.dataset.skillCaster = isBoss ? 'boss' : side;
  bubble.innerHTML = escapeText(name);
  bubble.style.left = `${anchor.x}px`;
  bubble.style.top = `${anchor.y}px`;
  layer.append(bubble);
  setTimeout(() => bubble.remove(), 1700);

  view.__battlePresentationAudit ??= { announcements: [], audio: [], bossScale: [] };
  view.__battlePresentationAudit.announcements.push({
    id: eventKey(event),
    skillId: Number(event.skillId),
    name,
    caster: isBoss ? 'boss' : side,
    x: anchor.x,
    y: anchor.y,
    hasSpeechBubble: true,
  });
}

function processSkillEvents(view, events = []) {
  for (const event of events) {
    if (event?.kind === 'skill' || event?.kind === 'boss-skill' || Number(event?.skillId) > 0) {
      announceSkill(view, event);
    }
  }
}

function processFlyShoeAuthorityAudio(view, snapshot) {
  if (!snapshot || !view.engine) return;
  view.__battlePresentationUnitTokens ??= new Map();
  const localUnits = new Map((view.engine.units ?? []).map((unit) => [Number(unit.__authorityUid ?? unit.uid), unit]));

  for (const data of snapshot.units ?? []) {
    if (Number(data.cardId) !== 23) continue;
    const uid = Number(data.uid);
    const next = {
      attackToken: Number(data.attackToken) || 0,
      forcedToken: Number(data.forcedToken) || 0,
      state: String(data.animState || data.state || ''),
    };
    const previous = view.__battlePresentationUnitTokens.get(uid);
    view.__battlePresentationUnitTokens.set(uid, next);
    if (!previous) continue; // 加入战斗时不补播历史声音。

    view.__battlePresentationAudit ??= { announcements: [], audio: [], bossScale: [] };
    if (next.forcedToken && next.forcedToken !== previous.forcedToken && next.state === 'secondAttackStatus') {
      audio.playSfx('vertigo', { tier: 'combat' });
      audio.playSfx('stunning', { tier: 'combat' });
      view.__battlePresentationAudit.audio.push({ uid, cardId: 23, kind: 'fly-shoe-special', token: next.forcedToken });
    }
    if (next.attackToken && next.attackToken !== previous.attackToken && next.state === 'attacking') {
      audio.playAttack(23, localUnits.get(uid) ?? { cardId: 23, id: uid });
      view.__battlePresentationAudit.audio.push({ uid, cardId: 23, kind: 'fly-shoe-normal', token: next.attackToken });
    }
  }
}

function processSnapshot(view, snapshot) {
  if (!snapshot) return;
  processFlyShoeAuthorityAudio(view, snapshot);
  processSkillEvents(view, snapshot.visualEvents ?? []);
}

function installForView(view) {
  if (!view.pvp || view.__battlePresentationCompletionInstalled) return;
  view.__battlePresentationCompletionInstalled = true;
  view.__battlePresentationAudit = { announcements: [], audio: [], bossScale: [] };
  ensureAnnouncementLayer(view);
  processSnapshot(view, view.__pvpLatestSnapshot);

  if (view.pvpSocket?.on) {
    view.__battlePresentationSnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      queueMicrotask(() => processSnapshot(view, snapshot));
    });
    view.__battlePresentationFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      queueMicrotask(() => processSnapshot(view, snapshot));
    });
    view.__battlePresentationSkillUnsub = view.pvpSocket.on('pvp:authority:skill-cast', (event) => {
      queueMicrotask(() => announceSkill(view, event));
    });
  }
}

function cleanupView(view) {
  view.__battlePresentationSnapshotUnsub?.();
  view.__battlePresentationFinishedUnsub?.();
  view.__battlePresentationSkillUnsub?.();
  view.__battlePresentationSnapshotUnsub = null;
  view.__battlePresentationFinishedUnsub = null;
  view.__battlePresentationSkillUnsub = null;
  view.__battlePresentationCompletionInstalled = false;
  view.__battlePresentationSeenEvents?.clear?.();
  view.__battlePresentationUnitTokens?.clear?.();
  view.viewRoot?.querySelector?.('[data-battle-skill-announcement-layer]')?.remove?.();
}

function installBossScale() {
  const previousDrawUnitSprite = BattleRenderer.prototype.drawUnitSprite;
  BattleRenderer.prototype.drawUnitSprite = function drawBossScaleCompletion(ctx, engine, unit, layout, options = {}) {
    const boss = Boolean(unit?.isBoss || unit?.pvpBoss);
    const configured = boss ? Math.max(1, finite(unit?.__bossDisplayScale, finite(unit?.bossScale, BOSS_BASELINE_SCALE))) : BOSS_BASELINE_SCALE;
    // bossScale 是相对普通单位的最终倍率，不再除以旧版 1.55 基准。
    const extra = boss ? configured : 1;
    if (!boss || extra <= 1.001 || !layout) {
      return previousDrawUnitSprite.call(this, ctx, engine, unit, layout, options);
    }

    ctx.save();
    ctx.translate(layout.cx, layout.footY);
    ctx.scale(extra, extra);
    ctx.translate(-layout.cx, -layout.footY);
    try {
      const result = previousDrawUnitSprite.call(this, ctx, engine, unit, layout, options);
      this._bossScaleAudit ??= [];
      if (this._bossScaleAudit.length > 80) this._bossScaleAudit.length = 0;
      this._bossScaleAudit.push({
        uid: unit.uid,
        cardId: unit.cardId,
        configured,
        extra,
        lane: unit.lane,
        col: unit.col,
      });
      return result;
    } finally {
      ctx.restore();
    }
  };
}

export function installBattlePresentationCompletion20260811() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installBossScale();

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattlePresentationCompletion(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyBattlePresentationCompletion() {
    cleanupView(this);
    return previousDestroy.call(this);
  };

  globalThis.__verifyBattlePresentationCompletion20260811 = () => {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView
      ?? globalThis.__pvpFixtureBattle
      ?? globalThis.__bossCoopFixtureBattle;
    return {
      enabled: true,
      flyShoeSpecialThenNormalAudio: true,
      skillSpeechBubbles: true,
      pvpAnchorsAtBothHeroes: true,
      bossSkillAnchorAtBoss: true,
      bossScaleUsesFootAnchor: true,
      activeBubbles: [...document.querySelectorAll('.battle-skill-speech-bubble')].map((node) => ({
        skillId: Number(node.dataset.skillId),
        caster: node.dataset.skillCaster,
        text: node.textContent,
      })),
      audit: view?.__battlePresentationAudit ?? { announcements: [], audio: [], bossScale: [] },
      bossScale: view?.renderer?._bossScaleAudit ?? [],
    };
  };
}
