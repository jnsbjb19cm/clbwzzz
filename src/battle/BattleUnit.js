import {
  REMOTE_RANGE,
  getAttackCooldown,
  getMoveEvery,
  getOpponentBaseFracCol,
  roundBattleAmount,
} from './BattleConfig.js';
import {
  calculateCardStats,
  normalizeBattleCraftQuality,
} from './CardStatFormula.js';
import { sanitizeCustomCardName } from '../core/constants.js';

let uid = 0;
const FORCED_TARGETABLE_CARD_IDS = new Set([34, 53, 62]);

export class BattleUnit {
  constructor({ card, lane, col, team, instance }) {
    this.uid = ++uid;
    this.cardId = card.id;
    this.name = card.name;
    this.customName = sanitizeCustomCardName(instance?.customName);
    this.res = card.spriteRes;
    this.lane = lane;
    this.col = col;
    this.team = team;
    this.craftQuality = normalizeBattleCraftQuality(instance?.craftQuality);
    this.star = Math.max(0, Number(instance?.star ?? instance?.strengthLv) || 0);
    this.strengthLv = this.star;

    const stats = calculateCardStats(card, this.craftQuality, this.star);
    this.maxHp = Math.max(1, roundBattleAmount(stats.hp));
    this.baseMaxHp = this.maxHp;
    this.hp = this.maxHp;
    this.atk = roundBattleAmount(stats.atk);
    this.cardCooldown = stats.cd;
    this.statFormula = stats;

    this.atkSpeed = card.atkSpeed ?? 2;
    this.moveSpeed = card.moveSpeed || 0;
    this.atkStyle = card.atkStyle;
    this.viewType = card.viewType;
    this.quality = card.quality;
    this.cardType = card.type;
    this.atkRate = card.atk_rate ?? card.atkRate ?? 1;
    this.specialEffect = card.special_atk_effect ?? card.specialEffect ?? 0;
    this.effectSelf = card.effectSelf;
    this.effectScope = card.effectScope;
    this.atkTimer = getAttackCooldown(this.atkSpeed);
    if (this.atkStyle === 9) this.atkTimer = 0;
    this.moveEvery = getMoveEvery(this.moveSpeed);
    this.moveTick = 0;
    this.battleTick = 0;
    this.lockedTargetUid = null;
    this.lastHealTick = 0;
    this.slowedUntil = 0;
    this.frozenUntil = 0;
    this.stunnedUntil = 0;
    this.invulnUntil = 0;
    this._jumped = false;
    this._jumpedOver = false;
    this._jumpUntil = 0;
    this._firstContactStun = false;
    this._stunFlashUntil = 0;
    this._suppressAttackAnimUntil = 0;
    this._firstAttackDone = false;
    this.tempAtkBonus = 0;
    this.atkBuffUntil = 0;
    this.dots = [];
    this.alive = true;
    this.attackingBase = false;
    this.renderX = col;
    this.renderY = lane;
  }

  isMovable() {
    return this.moveSpeed > 0;
  }

  isTunnelUnit() {
    return this.viewType === 7 || this.atkStyle === 6;
  }

  isTunnelProtected() {
    return this.alive
      && this.isTunnelUnit()
      && !this._burrowEmerged
      && !this._burrowRefunded;
  }

  isProtector() {
    return this.atkStyle === 1 && (this.cardType === 2 || this.cardId === 2 || this.cardId === 21);
  }

  isLowTarget() {
    if (FORCED_TARGETABLE_CARD_IDS.has(this.cardId)) return false;
    return this.atkStyle === 9;
  }

  /** 地刺/强化地刺(atk_style=9) */
  isSpikeTrap() {
    return this.atkStyle === 9;
  }

  isFlying() {
    return this.viewType === 6
      && !this._aerialLandingRequested
      && !this._baseLandingRequested
      && !this._aerialLanded;
  }

  isRanged() {
    return [2, 3, 17, 18, 19].includes(this.atkStyle) || this.viewType === 1 || this.cardId === 46;
  }

  isMelee() {
    return this.atkStyle === 7 || this.viewType === 2;
  }

  isDefensive() {
    return this.atkStyle === 1 && this.atk <= 0;
  }

  get range() {
    // 远程：全图；近战：1 格(可攻击相邻格，避免差一格/同速追逐永远打不到)
    return this.isRanged() ? REMOTE_RANGE : 1;
  }

  isParabola() {
    return this.atkStyle === 3 || this.cardId === 72 || this.name.includes('椰子');
  }

  takeDamage(amount, now = 0) {
    if (this.invulnUntil && now < this.invulnUntil) return 0;
    const raw = Number(amount);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    const dmg = roundBattleAmount(raw);
    if (dmg <= 0) return 0;
    this.hp = roundBattleAmount(this.hp - dmg);
    if (this.hp <= 0) this.alive = false;
    return dmg;
  }

  isFrozen(now) {
    return this.frozenUntil && now < this.frozenUntil;
  }

  isStunned(now) {
    return this.stunnedUntil && now < this.stunnedUntil;
  }

  heal(amount) {
    const raw = Number(amount);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    const healAmt = roundBattleAmount(raw);
    const before = this.hp;
    this.hp = roundBattleAmount(Math.min(this.maxHp, this.hp + healAmt));
    return roundBattleAmount(this.hp - before);
  }

  getBaseFracCol() {
    return getOpponentBaseFracCol(this.team);
  }
}
