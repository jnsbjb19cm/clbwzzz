import { BattleView } from './BattleView.js';
import {
  CARD_CATEGORY,
  HAND_SLOT_COUNT,
  JUNGLE_ASSETS,
  getCardCategory,
  usesFoodCost,
} from '../battle/BattleConfig.js';
import {
  formatCraftCardName,
  getCardQualityBgPart,
  getStrengthStarPart,
  resolveCraftQuality,
} from '../core/constants.js';

const PATCH_FLAG = Symbol.for('clbwzzz.exactBattleHandInstalled');

/* ---- 手牌卡牌闪烁(card-flicker，对应 AS BattleCard.updateFlicker)----
 * AS 原版：卡牌可出(不在 CD、可部署)时在卡面上循环播放 card1 图集
 * card-flicker0001~0060 共 16 帧(12fps)；不可出时移除覆盖层。
 * 这里用 .slot-flicker 覆盖层 + rAF 按帧切换 background-position 复刻。 */
const FLICKER_URL = '/atlas/card1.png';
const FLICKER_FPS = 12;
let flickerRafId = null;

function flickerFrameStyle(frame, atlasSize = 2048) {
  const xRange = Math.max(1, atlasSize - frame.width);
  const yRange = Math.max(1, atlasSize - frame.height);
  return {
    backgroundImage: `url('${FLICKER_URL}')`,
    backgroundSize: `${((atlasSize / frame.width) * 100).toFixed(5)}% ${((atlasSize / frame.height) * 100).toFixed(5)}%`,
    backgroundPosition: `${((frame.x / xRange) * 100).toFixed(5)}% ${((frame.y / yRange) * 100).toFixed(5)}%`,
  };
}

function ensureHandFlickerLoop(view) {
  if (flickerRafId != null) return;
  const frames = (view.db?.atlases?.card1?.sprites ?? [])
    .filter((s) => String(s.name).startsWith('card-flicker'))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!frames.length) return;
  const start = performance.now();
  const tick = (now) => {
    const idx = Math.floor((now - start) / (1000 / FLICKER_FPS)) % frames.length;
    const frame = frames[idx];
    if (frame) {
      const st = flickerFrameStyle(frame);
      for (const el of document.querySelectorAll('#hand .slot-flicker')) {
        el.style.backgroundImage = st.backgroundImage;
        el.style.backgroundSize = st.backgroundSize;
        el.style.backgroundPosition = st.backgroundPosition;
      }
    }
    flickerRafId = requestAnimationFrame(tick);
  };
  flickerRafId = requestAnimationFrame(tick);
}

function escapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function resolveFunctionPart(card) {
  const attackStyle = Number(card?.atkStyle ?? card?.atk_style ?? 0);
  const type = Number(card?.type ?? card?.card_type ?? 1);
  if (attackStyle === 1) return { part: 'cardType_2', label: '防御' };
  if (type === 2) return { part: 'cardType_3', label: '辅助' };
  if (type === 3) return { part: 'cardType_4', label: '陷阱' };
  if (getCardCategory(card) === CARD_CATEGORY.ACTIVE_SKILL) {
    return { part: 'cardType_7', label: '主动技能' };
  }
  return { part: 'cardType_1', label: '攻击' };
}

function renderLockedSlot(index) {
  return `
    <button type="button"
      class="deck-slot battle-hand-card locked"
      data-hand-idx="${index}"
      aria-label="未解锁卡槽"
      title="未解锁卡槽"
      disabled>
      <span class="battle-slot-lock" aria-hidden="true">
        <img class="battle-slot-lock-img" src="/battle/jungle/lock.png" alt="" draggable="false" />
      </span>
    </button>
  `;
}

function renderCardSlot(view, entry, handIndex) {
  const { card, instance } = entry;
  const canDrag = view.canDragCard(handIndex);
  const selected = view.engine.placingActive && handIndex === view.engine.selectedHandIndex;
  const craftQualityId = Number(instance?.craftQuality ?? 2);
  const stars = Number(instance?.star ?? instance?.strengthLv ?? 0);
  const craftQuality = resolveCraftQuality(craftQualityId);
  const label = formatCraftCardName(craftQualityId, card.name);
  const cardGrade = Math.min(6, Math.max(1, Number(card.quality) || 1));
  // AS 原版底座按 card_quality(1~6)取 card_bg_X；card.quality 被压缩到 1~5，
  // 会丢掉 6 级(如死神)的底座，故优先用原始 card_quality。
  const qualityBg = getCardQualityBgPart(card.card_quality ?? card.quality);
  const starPart = getStrengthStarPart(stars);
  const costIcon = usesFoodCost(card) ? JUNGLE_ASSETS.resFood : JUNGLE_ASSETS.resSun;
  const functionMeta = resolveFunctionPart(card);

  return `
    <button type="button"
      class="deck-slot battle-hand-card filled card-grade-${cardGrade}${selected ? ' selected' : ''}${canDrag ? '' : ' unavailable'}"
      data-hand-idx="${handIndex}"
      draggable="${canDrag}"
      style="--quality:${craftQuality.color}"
      title="${escapeAttr(label)}(拖拽到战场放置)">
      <span class="slot-face">
        <img class="slot-bg" src="/sprites/parts/${qualityBg}.png" alt="" draggable="false" />
        <img class="slot-portrait" src="/sprites/cards/${card.spriteRes}.png" alt="${escapeAttr(label)}" draggable="false" />
        <img class="slot-stars" src="/sprites/parts/${starPart}.png" alt="" draggable="false" />
        ${canDrag ? '<span class="slot-flicker" aria-hidden="true"></span>' : ''}
      </span>
      <span class="slot-meta">
        <span class="slot-cost" aria-label="消耗${Number(card.cost) || 0}">
          <img src="${costIcon}" alt="" draggable="false" />
          <b>${Number(card.cost) || 0}</b>
        </span>
        <span class="slot-function" title="${functionMeta.label}" aria-label="${functionMeta.label}">
          <img src="/sprites/parts/${functionMeta.part}.png" alt="" draggable="false" />
        </span>
      </span>
    </button>
  `;
}

export function installExactBattleHand() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleView.prototype.renderHand = function renderExactVideoHand(root) {
    const key = this.getHandKey();
    if (key === this.lastHandKey) return;
    this.lastHandKey = key;
    ensureHandFlickerLoop(this);

    const hand = root?.querySelector?.('#hand');
    if (!hand || !this.engine) return;

    // 卡槽材质的唯一所有者是 BattleHandExact.css：保持透明玻璃态。
    hand.classList.remove('opaque-battle-hand');
    hand.classList.add('card-slots', 'video-battle-hand', 'transparent-battle-hand');
    hand.innerHTML = Array.from({ length: HAND_SLOT_COUNT }, (_, handIndex) => {
      const entry = this.engine.deck[handIndex];
      return entry ? renderCardSlot(this, entry, handIndex) : renderLockedSlot(handIndex);
    }).join('');
  };
}
