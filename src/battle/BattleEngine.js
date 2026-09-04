import {
  COLS,
  ENEMY_BASE_FRAC,
  ENEMY_GRID_EDGE_FRAC,
  ENEMY_MOVABLE_MIN_COL,
  HAND_SLOT_COUNT,
  LANES,
  ENEMY_PLACE_MAX,
  ENEMY_PLACE_MIN,
  MAX_RESOURCE,
  PLAYER_BASE_FRAC,
  PLAYER_GRID_EDGE_FRAC,
  PLAYER_MOVABLE_MAX_COL,
  PLAYER_PLACE_MAX,
  PLAYER_PLACE_MIN,
  RESOURCE_REGEN,
  RESOURCE_REGEN_INTERVAL,
  RESOURCE_START,
  STARTER_DECK,
  TICK_INTERVAL,
  TRAINING_ENEMY_BASE_HP,
  TRAINING_PLAYER_BASE_HP,
  TRAINING_RESOURCE,
  calcHeroHp,
  canPlayerPlaceCol,
  canUnitHitBase,
  getAttackCooldown,
  getMoveColPerSec,
  getProjectileHitFrac,

  roundBattleAmount,
  usesFoodCost,
} from './BattleConfig.js';
import { audio } from '../core/AudioManager.js';
import { formatCraftCardName } from '../core/constants.js';
import { BattleSkillSystem } from '../systems/BattleSkillSystem.js';
import {
  HERO_MP_REGEN,
  HERO_MP_REGEN_INTERVAL,
  HERO_MP_START,
} from '../core/SkillRegistry.js';
import { BattleUnit } from './BattleUnit.js';
import {
  canUnitAttackTargetLayer,
  getUnitAttackLayerMask,
  projectileCanHitTargetLayer,
} from './CombatLayerRules.js';
import { Projectile, resolveProjectileHit } from './Projectile.js';
import { unitAnimPlayer } from './UnitAnimPlayer.js';
import { WaveManager } from './WaveManager.js';
import { getCardTraits, getAttackPattern, isSuicideCard } from '../core/CardTraitRegistry.js';
import { TALENT_NODE_MAP } from '../core/TalentRegistry.js';

export class BattleEngine {
  constructor(
    db,
    stageId = 1,
    deckSlotIndices = [],
    cardInventory = null,
    {
      skillLoadout = [],
      heroMpMax = HERO_MP_START,
      trainingMode = false,
      trainingFreeRes = true,
      pvp = false,
      lootEnabled = !pvp,
      rng = Math.random,
      talentBonus = null,
    } = {},
  ) {
    this.db = db;
    this.cardInventory = cardInventory;
    this.skillLoadout = skillLoadout;
    this.trainingMode = trainingMode;
    this.trainingFreeRes = trainingFreeRes;
    this.lootEnabled = Boolean(lootEnabled) && !trainingMode;
    this.rng = typeof rng === 'function' ? rng : Math.random;
    this.heroMpMax = heroMpMax;
    this.heroMp = heroMpMax;
    this.mpTimer = 0;
    this.activeFields = [];
    this.skillTargetError = '';
    this.stage = db.stages.find((s) => s.stage_id === stageId) ?? db.stages[0];
    // 天赋被动加成（BattleView 从 HeroSkillStore 计算传入，兜底读 globalThis）
    let talentHpBonus = 0;
    let talentMpBonus = 0;
    if (talentBonus) {
      talentHpBonus = Math.max(0, Number(talentBonus.hp) || 0);
      talentMpBonus = Math.max(0, Number(talentBonus.mp) || 0);
    } else {
      try {
        const talentIds = globalThis.heroSkillStore?.unlockedTalents ?? new Set();
        for (const id of talentIds) {
          const node = TALENT_NODE_MAP.get(id);
          if (!node) continue;
          talentHpBonus += Number(node.hpBonus || 0);
          talentMpBonus += Number(node.mpBonus || 0);
        }
      } catch { /* 天赋加成失败不影响战斗 */ }
    }
    const talentAtkPct = talentBonus ? Math.max(0, Number(talentBonus.atkPct) || 0) : 0;
    const talentHpPct = talentBonus ? Math.max(0, Number(talentBonus.hpPct) || 0) : 0;
    this.talentBonus = { hp: talentHpBonus, mp: talentMpBonus, atkPct: talentAtkPct, hpPct: talentHpPct };
    if (trainingMode) {
      this.heroMaxHp = TRAINING_PLAYER_BASE_HP + talentHpBonus;
      this.heroHp = TRAINING_PLAYER_BASE_HP + talentHpBonus;
      this.enemyHeroMaxHp = TRAINING_ENEMY_BASE_HP;
      this.enemyHeroHp = TRAINING_ENEMY_BASE_HP;
      this.sunlight = TRAINING_RESOURCE;
      this.food = TRAINING_RESOURCE;
    } else {
      this.heroMaxHp = calcHeroHp(this.stage.hp) + talentHpBonus;
      this.heroHp = this.heroMaxHp;
      this.enemyHeroMaxHp = this.heroMaxHp;
      this.enemyHeroHp = this.enemyHeroMaxHp;
      this.sunlight = RESOURCE_START;
      this.food = RESOURCE_START;
    }
    this.heroMpMax = heroMpMax + talentMpBonus;
    this.heroMp = this.heroMpMax;
    this.resourceTimer = 0;
    this.tickAcc = 0;
    this.battleTick = 0;
    this.units = [];
    this.projectiles = [];
    this.floats = [];
    this.deployEffects = [];
    this.skillFx = [];
    // 兼容既有动画回归与调试接口；两者始终指向同一特效队列。
    this.skillEffects = this.skillFx;
    this.pendingDamageEvents = [];
    this.impactFx = [];
    this.bumpFx = [];
    this.lootDrops = [];
    this._lootDropSeq = 0;
    this.deck = this.buildDeck(deckSlotIndices);
    this.selectedHandIndex = null;
    this.placingActive = false;
    this.cooldowns = this.deck.map(() => 0);
    this.wave = new WaveManager(this.stage, db, { trainingMode });
    this.status = 'playing';
    this.time = 0;
    this.log = [];
    this.waveNumber = 0;
    this.totalWaves = this.wave.totalWaves;
    this.lastDeployError = '';
    this.skills = new BattleSkillSystem(this, db);
    if (trainingMode) {
      this.pushLog('训练场：无限资源 · 无敌军 · 敌方基地极高血量');
      this.pushLog('操作：自由部署测试 · 技能键 Q/W/E/R/T/Y');
    } else {
      this.pushLog(`开始：${this.stage.stage_name}`);
      this.pushLog('操作：选卡放置 · 技能键 Q/W/E/R/T/Y 或点「技能」');
    }
  }

  buildDeck(deckSlotIndices) {
    const bagSlots = this.cardInventory?.getSlots() ?? [];
    const indices =
      Array.isArray(deckSlotIndices) && deckSlotIndices.length
        ? deckSlotIndices
        : STARTER_DECK.map((id) => this.cardInventory?.findFirstInstance(id)?.index).filter(
            (i) => i != null && i >= 0,
          );

    const entries = [];
    const used = new Set();
    for (const bagIndex of indices) {
      // 训练营教学/试用：卡槽可直接携带临时卡 { cardId }（不在背包也能试用）
      if (bagIndex && typeof bagIndex === 'object' && !Array.isArray(bagIndex)) {
        const cardId = Number(bagIndex.cardId ?? bagIndex.card_id);
        if (!cardId || used.has(cardId)) continue;
        const card = this.db.getById(cardId);
        if (!card) continue;
        used.add(cardId);
        entries.push({ bagIndex: -1, card, instance: { cardId: card.id } });
        if (entries.length >= HAND_SLOT_COUNT) break;
        continue;
      }
      if (used.has(bagIndex)) continue;
      const slot = bagSlots[bagIndex];
      if (!slot) continue;
      const card = this.db.getById(slot.cardId);
      if (!card) continue;
      used.add(bagIndex);
      entries.push({ bagIndex, card, instance: slot });
      if (entries.length >= HAND_SLOT_COUNT) break;
    }

    if (!entries.length) {
      for (const id of STARTER_DECK) {
        const card = this.db.getById(id);
        if (card) entries.push({ bagIndex: -1, card, instance: null });
        if (entries.length >= HAND_SLOT_COUNT) break;
      }
    }
    return entries;
  }

  get selectedEntry() {
    return this.selectedHandIndex != null ? (this.deck[this.selectedHandIndex] ?? null) : null;
  }

  get selectedCard() {
    return this.selectedEntry?.card ?? null;
  }

  /** 手牌、场上单位、本关敌军等 — 战斗 Canvas 需预载的立绘 res */
  getBattleSpriteRes() {
    const set = new Set();
    for (const { card } of this.deck) {
      if (card?.spriteRes != null) set.add(String(card.spriteRes));
    }
    for (const unit of this.units) {
      if (unit.res != null) set.add(String(unit.res));
    }
    const boss = this.db.getById(this.stage.enemy_res);
    if (boss?.spriteRes != null) set.add(String(boss.spriteRes));
    return set;
  }

  getUnitsAt(lane, col) {
    const gridCol = Math.max(0, Math.min(COLS - 1, Math.round(col)));
    return this.units.filter(
      (u) => u.alive && u.lane === lane && this.getUnitGridCol(u) === gridCol,
    );
  }

  getUnitGridCol(unit) {
    return Math.max(0, Math.min(COLS - 1, Math.round(unit.col)));
  }

  canUnitHitTargetLayer(attacker, target) {
    return canUnitAttackTargetLayer(attacker, target);
  }

  isProjectileCollisionTarget(projectile, target) {
    if (!projectile || !target || !target.alive) return false;
    if (target.team === projectile.owner || target.isLowTarget?.()) return false;
    if (target.isTunnelProtected?.()) return false;
    if (projectile.trajectory === 'parabola' && target.pvpNeutral === true) return false;
    return projectileCanHitTargetLayer(projectile, target);
  }

  isValidEnemyTarget(attacker, enemy) {
    if (enemy.team === attacker.team || !enemy.alive) return false;
    if (enemy.isLowTarget()) return false;
    // 钻地阶段与地面/空中战场双向隔离：只能锁定同样仍在地下的敌方地道卡。
    const attackerBuried = Boolean(attacker.isTunnelProtected?.());
    const enemyBuried = Boolean(enemy.isTunnelProtected?.());
    if (attackerBuried !== enemyBuried) return false;
    if (!this.canUnitHitTargetLayer(attacker, enemy)) return false;
    if (attacker.isParabola?.() && enemy.pvpNeutral === true) return false;
    return true;
  }

  getEnemiesInLane(unit, lane) {
    const dir = this.getMoveDir(unit);
    const gridCol = this.getUnitGridCol(unit);
    const found = [];

    const add = (u, dist) => {
      if (!found.some((e) => e.unit.uid === u.uid)) found.push({ unit: u, dist });
    };

    for (const u of this.getUnitsAt(lane, gridCol)) {
      if (this.isValidEnemyTarget(unit, u)) add(u, 0);
    }

    // 连续移动会让两个近战中心在一个大帧内轻微错身。保留一格多的身后接触判定，
    // 使已经接触/身后的单位(如基地前放单位拦截攻击基地的敌人)继续交战，不丢失目标。
    const rearContactTolerance = 1.1;
    for (const u of this.units) {
      if (u.lane !== lane || !this.isValidEnemyTarget(unit, u)) continue;
      const signedDistance = (Number(u.col) - Number(unit.col)) * dir;
      if (signedDistance < 0 && signedDistance >= -rearContactTolerance) {
        add(u, Math.abs(signedDistance));
      }
    }

    for (let d = 1; d <= unit.range; d++) {
      const tc = gridCol + dir * d;
      if (tc < 0 || tc >= COLS) break;
      for (const u of this.getUnitsAt(lane, tc)) {
        if (this.isValidEnemyTarget(unit, u)) add(u, d);
      }
    }

    return found;
  }

  pickPriorityTarget(attacker, entries) {
    if (!entries.length) return null;
    const sorted = [...entries].sort((a, b) => {
      // 最前方目标优先(dist 最小 = 离攻击者最近的前排)
      if (a.dist !== b.dist) return a.dist - b.dist;
      const aMov = a.unit.isMovable() ? 1 : 0;
      const bMov = b.unit.isMovable() ? 1 : 0;
      if (aMov !== bMov) return aMov - bMov;
      if (b.unit.maxHp !== a.unit.maxHp) return b.unit.maxHp - a.unit.maxHp;
      return a.unit.uid - b.unit.uid;
    });
    return sorted[0].unit;
  }

  /** 地刺/陷阱不挡路；普通敌方单位挡路 */
  blocksMovement(blocker, mover) {
    if (!blocker.alive || blocker.team === mover.team || blocker.isLowTarget()) return false;
    if (blocker.isTunnelProtected?.() || mover.isTunnelProtected?.()) return false;
    // 空地单位互相穿行；只有空中单位相撞后落地，才重新参与地面阻挡。
    if (Boolean(blocker.isFlying?.()) !== Boolean(mover.isFlying?.())) return false;
    return true;
  }

  hasBlockingEnemyInCell(unit, gridCol) {
    return this.getUnitsAt(unit.lane, gridCol).some((u) => this.blocksMovement(u, unit));
  }

  requestAerialLanding(unit, { atBase = false } = {}) {
    if (!unit?.alive || unit.viewType !== 6 || unit._aerialLanded) return false;
    unit._aerialWasFlying = true;
    unit._aerialLandingRequested = true;
    if (atBase) unit._baseLandingRequested = true;
    const duration = Math.max(
      0.45,
      Math.min(1.2, unitAnimPlayer.resolveAnimationDuration(unit, 'toGround', 0.72)),
    );
    unit._aerialLandingUntil = Math.max(
      Number(unit._aerialLandingUntil) || 0,
      this.time + duration,
    );
    return true;
  }

  finishAerialLanding(unit) {
    if (!unit?._aerialLandingRequested) return false;
    if (this.time + 1e-9 < (Number(unit._aerialLandingUntil) || 0)) return false;
    unit._aerialLanded = true;
    unit._aerialLandingRequested = false;
    if (Number(unit.cardId) === 45 && !unit._phantomSplitDone) {
      unit._phantomSplitDone = true;
      this.spawnPhantomCrossSplit(unit);
    }
    return true;
  }

  /** 飞行单位血量 ≤50%：立即下坠变地面单位（落地不可逆），并触发落地动画/落地技能 */
  forceAerialLanding(unit) {
    if (!unit?.alive || unit.viewType !== 6 || unit._aerialLanded === true) return false;
    // 不立即标记落地：触发落地动画(toGround)，落完由 finishAerialLanding 置 _aerialLanded(不可逆)
    if (!unit._aerialLandingRequested) {
      this.requestAerialLanding(unit);
    }
    return true;
  }

  spawnPhantomCrossSplit(source) {
    const summonCard = this.db.getById(60);
    if (!summonCard) return [];
    unitAnimPlayer.ensureLoaded([String(summonCard.res)]);
    const centerLane = Math.max(1, Math.min(LANES - 2, Number(source.lane) || 0));
    const centerCol = Math.max(1, Math.min(COLS - 2, Number(source.col) || 0));
    const points = [
      [centerLane - 1, centerCol],
      [centerLane + 1, centerCol],
      [centerLane, centerCol - 1],
      [centerLane, centerCol + 1],
    ].map(([lane, col]) => [
      Math.max(0, Math.min(LANES - 1, lane)),
      Math.max(0, Math.min(COLS - 1, col)),
    ]);
    const summons = points.map(([lane, col]) => this.spawnSummon(
      60,
      lane,
      col,
      source.team,
      { exact: true, deployEffect: true, preload: false, log: false },
    )).filter(Boolean);
    if (summons.length) {
      this.pushDeployEffect(centerLane, centerCol, summons[0].craftQuality);
      this.pushLog(`[${summonCard.name}] \u5341\u5b57\u5206\u88c2 x${summons.length}`);
    }
    return summons;
  }

  landCollidingAerialUnits(unit) {
    if (!unit?.isFlying?.()) return false;
    const contact = this.units.find((other) =>
      other !== unit
      && other?.alive
      && other.team !== unit.team
      && other.lane === unit.lane
      && other.isFlying?.()
      && Math.abs(Number(other.col) - Number(unit.col)) < 0.62);
    if (!contact) return false;
    if (Number(unit.cardId) === 40) {
      unit._aerialContactDetonate = true;
      unit._aerialContactTargetUid = contact.uid;
    }
    if (Number(contact.cardId) === 40) {
      contact._aerialContactDetonate = true;
      contact._aerialContactTargetUid = unit.uid;
    }
    this.requestAerialLanding(unit);
    this.requestAerialLanding(contact);
    return true;
  }

  getMoveDir(unit) {
    if (unit?._burrowReturning || unit?._burrowEmerged) return unit.team === 'player' ? -1 : 1;
    return unit.team === 'player' ? 1 : -1;
  }

  /** 基地前沿格：同格仍有敌人时不可前进/进入攻基地态 */
  hasBaseLaneBlocker(unit) {
    // 飞行单位(飞行水蜜桃自爆等)不受地面单位阻挡——锁定基地可直接自爆/攻击基地
    if (unit.isFlying?.()) return false;
    const gridCol = this.getUnitGridCol(unit);
    const atEnemyBaseCol = unit.team === 'enemy' && gridCol === 0;
    const atPlayerBaseCol = unit.team === 'player' && gridCol === COLS - 1;
    if (!atEnemyBaseCol && !atPlayerBaseCol) return false;
    return this.hasBlockingEnemyInCell(unit, gridCol);
  }

  getAuraBonus(unit) {
    let bonus = 0;
    for (const u of this.units) {
      if (!u.alive || u.team !== unit.team) continue;
      if (u.cardId === 19) {
        const dr = Math.abs(u.lane - unit.lane);
        const dc = Math.abs(u.col - unit.col);
        if (dr <= 1 && dc <= 1) bonus += 4;
      }
      if (u.cardId === 32) {
        // 嗜血稻草人：全屏 +4 攻击
        bonus += 4;
      }
    }
    // 图鉴：可叠加，上限20
    return Math.min(20, bonus);
  }

  /** 移速光环：部落野人(单行)/ 太古野人(全屏)，不可叠加 → 取最大加成(+50%) */
  getMoveSpeedMult(unit) {
    if (!unit.isMovable?.()) return 1;
    let mult = 1;
    // 技能"壮士断腕/全军突击"(buff_as_ms)：移速 +60%
    if (unit.tempAsMsUntil && this.time < unit.tempAsMsUntil) mult *= (unit.asMsSpeedUp ?? 1.6);
    for (const u of this.units) {
      if (!u.alive || u.team !== unit.team || u === unit) continue;
      if (u.cardId === 24 && u.lane === unit.lane) mult = Math.max(mult, 1.5);
      if (u.cardId === 39) mult = Math.max(mult, 1.5);
    }
    return mult;
  }

  /** 攻速光环：部落巫婆(3x3)/ 太古巫婆(全屏)，不可叠加 → 攻速+50%(冷却×2/3) */
  getAtkSpeedMult(unit) {
    let mult = 1;
    // 技能"全军突击/壮士断腕"(buff_as_ms)：攻速提升（冷却缩短）
    if (unit.tempAsMsUntil && this.time < unit.tempAsMsUntil) mult = Math.min(mult, 0.65);
    for (const u of this.units) {
      if (!u.alive || u.team !== unit.team || u === unit) continue;
      if (u.cardId === 51) {
        mult = Math.min(mult, 2 / 3);
      } else if (u.cardId === 26) {
        const dr = Math.abs(u.lane - unit.lane);
        const dc = Math.abs(u.col - unit.col);
        if (dr <= 1 && dc <= 1) mult = Math.min(mult, 2 / 3);
      }
    }
    return mult;
  }

  /** 树精守卫(3x3)/ 巨型树精守卫(全屏)：己方生命上限 +10%(可叠加，上限50%) */
  updateMaxHpAuras() {
    for (const unit of this.units) {
      if (!unit.alive) continue;
      let pct = 0;
      for (const u of this.units) {
        if (!u.alive || u.team !== unit.team || u === unit) continue;
        if (u.cardId === 103) {
          pct += 10;
        } else if (u.cardId === 68) {
          const dr = Math.abs(u.lane - unit.lane);
          const dc = Math.abs(u.col - unit.col);
          if (dr <= 1 && dc <= 1) pct += 10;
        }
      }
      const target = pct > 0
        ? Math.max(1, roundBattleAmount(((unit.baseMaxHp ?? unit.maxHp) * Math.min(50, pct)) / 100))
        : 0;
      const current = unit._treeGuardBonus ?? 0;
      if (target !== current) {
        const diff = target - current;
        unit.maxHp = roundBattleAmount(Math.max(1, unit.maxHp + diff));
        unit.hp = roundBattleAmount(Math.min(unit.maxHp, unit.hp + Math.max(0, diff)));
        unit._treeGuardBonus = target;
      }
    }
  }

  canDeploy(lane, col, handIndex = this.selectedHandIndex, { silent = false } = {}) {
    if (!silent) this.lastDeployError = '';
    if (this.status !== 'playing') {
      if (!silent) this.lastDeployError = '战斗已结束';
      return false;
    }
    const entry = this.deck[handIndex];
    const card = entry?.card;
    if (!card) return false;

    const isMovable = card.moveSpeed > 0;
    const cellUnits = this.getUnitsAt(lane, col);
    const isAlienSentinel = Number(card.id) === 38;
    const sentinelTarget = isAlienSentinel && cellUnits.some(
      (unit) => unit.alive && unit.team === 'enemy' && !unit.isMovable?.() && !unit.isFlying?.(),
    );
    if (isAlienSentinel && !sentinelTarget) {
      if (!silent) this.lastDeployError = '外星哨兵只能放在敌方不可移动单位所在格';
      return false;
    }
    if (!isAlienSentinel && !canPlayerPlaceCol(col, isMovable)) {
      if (!silent) {
        this.lastDeployError = isMovable
          ? '可移动单位只能放在靠我方 3 列'
          : '只能放在我方 1-5 列';
      }
      return false;
    }

    const blocking = cellUnits.filter(
      (u) => u.team === 'player' && u.alive && !u.isMovable?.(),
    );
    if (!isAlienSentinel && blocking.length > 0 && !isMovable) {
      if (!silent) this.lastDeployError = '该格已有单位，不可移动卡牌不能叠放';
      return false;
    }

    if (!this.trainingMode) {
      const cost = this.getDeployCost(card);
      if (this.sunlight < cost.sun || this.food < cost.food) {
        if (!silent) this.lastDeployError = '资源不足';
        return false;
      }
      if ((this.cooldowns[handIndex] ?? 0) > 0) {
        if (!silent) this.lastDeployError = '卡牌冷却中';
        return false;
      }
    }
    return true;
  }

  getDeployCost(card) {
    if (usesFoodCost(card)) return { sun: 0, food: card.cost };
    return { sun: card.cost, food: 0 };
  }

  async deploy(lane, col, handIndex = this.selectedHandIndex) {
    if (!this.canDeploy(lane, col, handIndex)) return false;
    const entry = this.deck[handIndex];
    const card = entry.card;
    const instance =
      entry.instance ??
      (entry.bagIndex >= 0 ? this.cardInventory?.getSlots()[entry.bagIndex] : null) ??
      this.cardInventory?.findFirstInstance(card.id)?.slot ??
      null;
    if (!this.trainingMode || !this.trainingFreeRes) {
      const cost = this.getDeployCost(card);
      this.sunlight -= cost.sun;
      this.food -= cost.food;
    }
    const unit = new BattleUnit({ card, lane, col, team: 'player', instance });
    if (!this.trainingMode) {
      // 部署冷却 = 单位实际冷却(card.json 已烘焙砍半值，含星级缩减，下限 6s)
      this.cooldowns[handIndex] = unit.cardCooldown;
    }
    unitAnimPlayer.resetClock(unit);
    this.initUnitSpawnFade(unit);
    this.units.push(unit);
    this.applyTalentCardBonus(unit);
    this.pushDeployEffect(lane, col, unit.craftQuality);
    const label = instance
      ? formatCraftCardName(instance.craftQuality, card.name, instance.customName)
      : card.name;
    this.pushLog(`部署【${label}】→ 第${lane + 1}路 ${col}列`);
    audio.playSummon(card.id);
    return true;
  }

  /** PVP：对手部署单位到敌方半场(发送者视角 col 镜像到 11-col) */
  spawnOpponent(card, lane, senderCol) {
    if (!card) return;
    const mirrorCol = COLS - 1 - Number(senderCol);
    this.placeEnemyUnit(card, Number(lane), false, mirrorCol);
  }

  spawnEnemy(wave) {
    const card = wave.card;
    if (!card) return;
    if (wave.isWaveStart && !wave.isBoss) {
      this.pushLog(`⚠️ 第 ${wave.waveIndex} 波敌军来袭！`);
    }
    const count = wave.count ?? 1;
    for (let i = 0; i < count; i++) {
      const lane = wave.lane != null && count === 1 ? wave.lane : Math.floor(Math.random() * 5);
      this.placeEnemyUnit(card, lane, wave.isBoss, wave.col);
    }
  }

  /** 技能 543 传送门：生成一个敌方传送门单位（持续 life 秒） */
  spawnPortal(lane, col, life = 12) {
    const card = this.db.getById(543);
    if (!card) return null;
    if (this.getUnitsAt(lane, col).length > 0) return null;
    // 传送门是【己方】召唤物（player team）：不被己方攻击，被敌方攻击摧毁
    const unit = new BattleUnit({ card, lane, col, team: 'player' });
    unit._isPortal = true;
    unit._portalLife = life;
    unit._portalBornAt = this.time;
    this.initUnitSpawnFade(unit);
    this.units.push(unit);
    this.pushDeployEffect(lane, col, 1);
    return unit;
  }

  placeEnemyUnit(card, lane, isBoss = false, preferredCol = null) {
    const isMovable = card.moveSpeed > 0;
    // 不可移动(防御/放置型)单位：优先放配置列(如核桃卫兵在敌方最前排 col 7)，
    // 指定列被占则就近找空位；可移动单位忽略配置列，从后排出生。
    if (!isMovable && preferredCol != null) {
      const target = Math.max(0, Math.min(COLS - 1, Math.round(Number(preferredCol) || 0)));
      const placeAt = (c) => {
        if (c < ENEMY_PLACE_MIN || c > ENEMY_PLACE_MAX) return false;
        if (this.getUnitsAt(lane, c).length > 0) return false;
        const unit = new BattleUnit({ card, lane, col: c, team: 'enemy' });
        unit.isBoss = isBoss;
        this.initUnitSpawnFade(unit);
        this.units.push(unit);
        this.pushDeployEffect(lane, c, 1);
        this.pushLog(`${isBoss ? 'BOSS ' : ''}【${card.name}】→ 第${lane + 1}路 ${c}列`);
        audio.playSummon(card.id);
        return true;
      };
      if (placeAt(target)) return true;
      for (let d = 1; d <= 4; d++) {
        if (placeAt(target - d) || placeAt(target + d)) return true;
      }
      return false;
    }
    for (let c = ENEMY_PLACE_MAX; c >= ENEMY_PLACE_MIN; c--) {
      if (this.getUnitsAt(lane, c).length > 0) continue;
      if (isMovable && c < ENEMY_MOVABLE_MIN_COL) continue;
      const unit = new BattleUnit({ card, lane, col: c, team: 'enemy' });
        unit.isBoss = isBoss;
      this.initUnitSpawnFade(unit);
      this.units.push(unit);
      this.pushDeployEffect(lane, c, 1);
      this.pushLog(`${isBoss ? 'BOSS ' : ''}【${card.name}】→ 第${lane + 1}路`);
      audio.playSummon(card.id);
      return true;
    }
    return false;
  }

  tick(dt) {
    if (this.status !== 'playing') {
      this.updateProjectiles(dt);
      this.updateFloats(dt);
      this.updateDeployEffects(dt);
      this.updateFx(dt);
      return;
    }

    this.time += dt;
    if (this.trainingMode) {
      this.sunlight = TRAINING_RESOURCE;
      this.food = TRAINING_RESOURCE;
      this.heroMp = this.heroMpMax;
    } else {
      this.resourceTimer += dt;
      while (this.resourceTimer >= RESOURCE_REGEN_INTERVAL) {
        this.resourceTimer -= RESOURCE_REGEN_INTERVAL;
        if (this.sunlight < MAX_RESOURCE) this.sunlight = Math.min(MAX_RESOURCE, this.sunlight + RESOURCE_REGEN);
        if (this.food < MAX_RESOURCE) this.food = Math.min(MAX_RESOURCE, this.food + RESOURCE_REGEN);
      }

      this.mpTimer += dt;
      while (this.mpTimer >= HERO_MP_REGEN_INTERVAL) {
        this.mpTimer -= HERO_MP_REGEN_INTERVAL;
        if (this.heroMp < this.heroMpMax) {
          this.heroMp = roundBattleAmount(
            Math.min(this.heroMpMax, this.heroMp + HERO_MP_REGEN),
          );
        }
      }
    }

    this.skills?.tick(dt);
    this.updatePendingDamageEvents();

    for (let i = 0; i < this.cooldowns.length; i++) {
      this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    }

    if (!this.pvp) {
      // 敌方英雄眩晕：暂停波次出怪（enemy_hero_stun 效果）
      if (this.enemySpawnHaltUntil && this.time < this.enemySpawnHaltUntil) {
        // 眩晕中不生成新怪
      } else {
        this.wave.tick(dt, (w) => {
          this.waveNumber = w.waveIndex ?? this.waveNumber + 1;
          this.spawnEnemy(w);
        });
      }
    }
    // 传送门出怪：每秒在传送门位置生成一只敌方小怪（spawn_portal/portal_wave 效果）
    if (this.portalWaveUntil && this.time < this.portalWaveUntil) {
      this._portalWaveAcc = (this._portalWaveAcc ?? 0) + dt;
      while (this._portalWaveAcc >= 1) {
        this._portalWaveAcc -= 1;
        // 单位总数上限（防单位激增掉帧）
        if (this.units.length >= 40) break;
        const gates = this.units.filter((u) => u.alive && u._isPortal);
        if (!gates.length) break;
        const gate = gates[Math.floor(Math.random() * gates.length)];
        // 海之门：传送门出的是【己方】单位，在敌方场地出生后向右攻打敌方基地
        const small = this.db.getById(45) ?? this.db.getById(3);
        if (small) {
          const c = Math.min(COLS - 2, gate.col + 1);
          if (!this.getUnitsAt(gate.lane, c).length) {
            const unit = new BattleUnit({ card: small, lane: gate.lane, col: c, team: 'player' });
            this.initUnitSpawnFade(unit);
            this.units.push(unit);
          }
        }
      }
    }

    this.tickAcc += dt;
    while (this.tickAcc >= TICK_INTERVAL) {
      this.tickAcc -= TICK_INTERVAL;
      this.processBattleTick();
    }

    this.updateUnitMovement(dt);
    this.updateProjectiles(dt);
    this.updateFloats(dt);
    this.updateDeployEffects(dt);
    this.updateFx(dt);
    this.units = this.units.filter(
      (u) => u.alive || (u._deathUntil && this.time < u._deathUntil),
    );
    // 传送门单位超时消失
    this.units = this.units.filter(
      (u) => !u._isPortal || !u._portalLife || this.time < (u._portalBornAt ?? 0) + u._portalLife,
    );
    this.checkEnd();
  }

  processBattleTick() {
    this.battleTick++;
    this.updateMaxHpAuras();
    const snapshot = [...this.units];

    for (const unit of snapshot) {
      if (!unit.alive) continue;
      if (unit.attackingBase && unit.isFlying?.()) {
        this.requestAerialLanding(unit, { atBase: true });
      }
      const finishedLanding = this.finishAerialLanding(unit);
      if (finishedLanding && Number(unit.cardId) === 40
        && (unit._aerialContactDetonate || unit._baseLandingRequested)) {
        this.trySuicideBomber(unit);
        continue;
      }
      // 落地动画是战斗状态的一部分：动画完成前不移动、不攻击。
      if (unit._aerialLandingRequested) {
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }
      // 出土动画只播放一次；完成前不提前攻击，完成后回到普通目标/攻击流程。
      if (unit._burrowEmergeUntil && this.time < unit._burrowEmergeUntil) continue;
      if (unit.isFrozen(this.time) || unit.isStunned(this.time)) continue;

      // 蒲公英医生/精灵：常态化攻击就是治疗(每5秒，与图鉴描述一致)
      if (unit.cardId === 22 || unit.cardId === 36) {
        if (this.battleTick - unit.lastHealTick > 50) {
          unit.lastHealTick = this.battleTick;
          const radius = unit.cardId === 22 ? 1 : 12;
          const healed = this.doAreaHeal(unit.lane, unit.col, unit.team, 10, radius);
          // 治疗即攻击：播放治疗音(addHP.mp3)+ 攻击动画
          if (healed > 0) audio.playHeal(unit);
          unitAnimPlayer.triggerAttack(unit, this);
        }
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }
      // 丛林守护者：移动同时持续为周围3x3格己方单位加血
      if (unit.cardId === 114) {
        if (this.battleTick - unit.lastHealTick > 12) {
          unit.lastHealTick = this.battleTick;
          const healed = this.doAreaHeal(unit.lane, unit.col, unit.team, 3, 1);
          if (healed > 0) audio.playHeal(unit);
        }
      }

      // 怪物工厂/怪物作坊：每隔 15/18 秒制造一只小怪物
      if (unit.cardId === 66 || unit.cardId === 93) {
        const intervalTicks = unit.cardId === 66 ? 96 : 116; // 15s / 18s @ TICK_INTERVAL=0.155
        if (this.battleTick - (unit._lastSummonTick ?? 0) > intervalTicks) {
          unit._lastSummonTick = this.battleTick;
          this.spawnSummon(unit.cardId === 66 ? 67 : 94, unit.lane, unit.col, unit.team);
        }
      }
      // 死神：召出小鬼(每15秒一只)
      if (unit.cardId === 57) {
        if (this.battleTick - (unit._lastSummonTick ?? 0) > 96) {
          unit._lastSummonTick = this.battleTick;
          this.spawnSummon(59, unit.lane, unit.col, unit.team);
        }
      }

      // 接触型特殊功能：吞噬/吸走/魅惑/冰冻(功能性防御单位，不主动攻击)
      const contactHandler = { 34: 'trySwallow', 38: 'tryAbduct', 53: 'tryCharm', 88: 'tryIceShield' }[unit.cardId];
      if (contactHandler) {
        if (unit.cardId === 38 && this.finishAbductionIfReady(unit)) continue;
        this[contactHandler](unit);
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      if (this.trySuicideBomber(unit)) continue;

      if (unit.isSpikeTrap()) {
        this.trySpikeTrap(unit);
      } else {
        this.tryAttack(unit);
      }

      unit.renderX = unit.col;
      unit.renderY = unit.lane;
    }

    this.units = this.units.filter(
      (u) => u.alive || (u._deathUntil && this.time < u._deathUntil),
    );
    for (const u of this.units) {
      if (u.lockedTargetUid && !this.units.some((t) => t.uid === u.lockedTargetUid && t.alive)) {
        u.lockedTargetUid = null;
      }
    }
  }

  doAreaHeal(lane, col, team, amount, radius = 1) {
    let totalHealed = 0;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const tr = lane + dr;
        const tc = col + dc;
        if (tr < 0 || tr >= 5 || tc < 0 || tc >= COLS) continue;
        for (const t of this.getUnitsAt(tr, tc)) {
          if (t.team === team && t.hp < t.maxHp) {
            const healAmt = roundBattleAmount(amount);
            const healed = roundBattleAmount(Math.min(healAmt, t.maxHp - t.hp));
            t.heal(healAmt);
            this.spawnFloat(tr, tc, healed);
            totalHealed += healed;
          }
        }
      }
    }
    return roundBattleAmount(totalHealed);
  }

  chooseTarget(unit) {
    const enemies = this.getEnemiesInLane(unit, unit.lane);
    const traits = getCardTraits(unit.cardId) || {};
    let candidates = enemies;
    // 南瓜投手/怪物面包机/对空远程(atkStyle 3)：优先对空中单位打击
    if (traits.preferFlying || Number(unit.atkStyle) === 3) {
      const flying = enemies.filter((e) => e.unit.isFlying());
      if (flying.length) candidates = flying;
    }
    // 黑暗精灵/暗影法师：直接攻击同行最远的1个敌方单位
    let best;
    if (traits.farthestInLane && candidates.length) {
      best = [...candidates].sort((a, b) => b.dist - a.dist)[0].unit;
    } else {
      best = this.pickPriorityTarget(unit, candidates);
    }
    if (best) {
      // 已进入攻基地状态后，敌方仍可能在前沿格新召唤阻挡者；
      // 必须立刻切回攻击单位，不能隔着新单位继续打基地。
      unit.attackingBase = false;
      return best;
    }

    if (unit.attackingBase) {
      return {
        _isBase: true,
        lane: unit.lane,
        col: unit.getBaseFracCol(),
        team: unit.team === 'player' ? 'enemy' : 'player',
      };
    }

    // 可移动卡牌必须抵达敌方最后一格(attackingBase)才能攻击基地；
    // 不可移动卡牌(射手/防御)可依据射程命中基地。
    if (canUnitHitBase(unit) && !unit.isMovable?.()) {
      const baseFrac = unit.getBaseFracCol();
      return {
        _isBase: true,
        lane: unit.lane,
        col: baseFrac,
        team: unit.team === 'player' ? 'enemy' : 'player',
      };
    }
    return null;
  }

  suicideTargetFilter(bomber, target) {
    if (bomber.cardId === 40) {
      if (bomber._aerialContactDetonate) {
        return String(target.uid) === String(bomber._aerialContactTargetUid);
      }
      return target.isFlying();
    }
    if (bomber.cardId === 65) return !target.isFlying();
    return true;
  }

  /** 同格或 fractional col 接近即视为接触 */
  unitsInSuicideContact(unit) {
    const contactCol = 0.62;
    return this.units.filter((u) => {
      if (!u.alive || u.team === unit.team) return false;
      if (u.lane !== unit.lane) return false;
      if (Math.abs(u.col - unit.col) >= contactCol) return false;
      return this.suicideTargetFilter(unit, u);
    });
  }

  findSuicideVictims(unit) {
    if (Number(unit.cardId) === 40 && unit._aerialContactDetonate) {
      const contact = this.units.find((candidate) => (
        candidate.alive
        && candidate.team !== unit.team
        && String(candidate.uid) === String(unit._aerialContactTargetUid)
      ));
      return contact ? [contact] : [];
    }
    return this.unitsInSuicideContact(unit);
  }

  finishSuicideUnit(unit) {
    unit.alive = false;
    // 自爆结算与视觉移除分离：伤害只结算一次，但单位仍进入正常/冻结死亡动画窗口。
    // `_suicideRemoved` 必须在 markDeath 之后设置，否则 UnitAnimPlayer 会直接跳过动画。
    unit._suicideRemoved = false;
    this.onUnitDeath(unit);
    unit._suicideRemoved = true;
    // 自爆单位(飞行水蜜桃/黑铁土豆雷/热血火龙果)自爆后直接消失，不播死亡动画
    unit.alive = false;
    unit._deathUntil = this.time;
  }

  /** 自爆：仅图鉴标记为自爆的卡(40 飞行水蜜桃/61 黑铁土豆雷/65 热血火龙果) */
  trySuicideBomber(unit) {
    if (!isSuicideCard(unit) || !unit.alive || unit._suicideRemoved) return false;

    const victims = this.findSuicideVictims(unit);
    // 自爆单位到达"敌方基地"位置才可炸基地；飞行单位不受地面阻挡
    const gridCol = this.getUnitGridCol(unit);
    // player 的敌基地在右侧(col COLS-1)；enemy 的敌基地(我方)在左侧(col 0)
    const atBasePos = unit.team === 'player' ? gridCol >= COLS - 1 : gridCol <= 0;
    const atHero = (unit.attackingBase || atBasePos) && !this.hasBaseLaneBlocker(unit);

    if (!victims.length && !atHero) return false;

    const dmg = roundBattleAmount(Math.max(1, unit.atk));
    audio.playAttack(unit.cardId, unit);
    // 自爆特效：在自爆单位位置产生爆炸冲击（作用于接触的本体目标）
    const boomCol = Math.round(unit.col);
    this.spawnImpactFx(unit.lane, boomCol, dmg, unit.res);
    for (const v of victims) {
      v.takeDamage(dmg, this.time);
      this.spawnFloat(v.lane, v.col, -dmg);
      if (!v.alive) {
        v._suicideKilled = true; // 被自爆炸死：不触发死亡分身(如幻飞行忍者45)
        this.onUnitDeath(v);
        this.pushLog(`${unit.name} 炸毁 ${v.name}`);
      }
    }

    if (atHero) {
      const side = unit.team === 'player' ? 'enemy' : 'player';
      this.damageBase(side, dmg);
      this.spawnFloat(unit.lane, unit.getBaseFracCol(), -dmg);
      this.pushLog(`${unit.name} 炸击敌方基地`);
    }

    this.finishSuicideUnit(unit);
    if (victims.length) this.pushLog(`${unit.name} 自爆`);
    return true;
  }

  /** 接触判定：同路、相距 <0.75 列的敌方单位 */
  contactEnemies(unit) {
    return this.units.filter(
      (u) =>
        u.alive &&
        u.team !== unit.team &&
        u.lane === unit.lane &&
        Math.abs(u.col - unit.col) < 0.75 &&
        !u.isLowTarget?.() &&
        this.isValidEnemyTarget(unit, u),
    );
  }

  /** 飞鞋怪：仅首次碰到敌方目标时立刻释放特殊攻击击晕(2.5s)，先手于敌方攻击 */
  tryFirstContactStun(unit) {
    if (unit.cardId !== 23 || unit._firstContactStun || !unit.alive) return false;
    const victims = this.contactEnemies(unit);
    if (!victims.length) return false;
    unit._firstContactStun = true;
    if (unitAnimPlayer.hasAnimState(unit.res, 'secondAttackStatus')) {
      const dur = unitAnimPlayer.animDurationOf(unit.res, 'secondAttackStatus', 0.85);
      unitAnimPlayer.triggerState(unit, this, 'secondAttackStatus', dur);
    }
    audio.playSfx('vertigo', { tier: 'subtle' });
    audio.playSfx('stunning', { tier: 'subtle' });
    for (const v of victims) {
      v.stunnedUntil = Math.max(v.stunnedUntil ?? 0, this.time + 2.5);
      this.pushLog(`【${unit.name}】碰到 ${v.name}，立刻击晕 2.5 秒`);
    }
    return true;
  }

  /** 怪物吸尘器：吸入低品质(非橙/红)敌方单位，10秒消化至死 */
  trySwallow(unit) {
    if (!unit.alive || (unit._swallowCdUntil && this.time < unit._swallowCdUntil)) return false;
    const victims = this.contactEnemies(unit).filter((u) => !u.isFlying?.() && (u.quality ?? 1) < 5);
    if (!victims.length) return false;
    unit._swallowCdUntil = this.time + 2;
    for (const v of victims) {
      v.frozenUntil = Math.max(v.frozenUntil ?? 0, this.time + 10);
      v.dots = v.dots ?? [];
      v.dots.push({ kind: 'swallow', dps: Math.max(1, v.maxHp / 10), until: this.time + 10, every: 1 });
      this.pushLog(`【${unit.name}】吸入 ${v.name}，开始消化`);
    }
    return true;
  }

  /** 外星哨兵：吸走低品质敌方地面单位，吸收过程5秒 */
  tryAbduct(unit) {
    if (!unit.alive || unit._abductUntil || (unit._abductCdUntil && this.time < unit._abductCdUntil)) return false;
    const victims = this.contactEnemies(unit).filter(
      (u) => !u.isFlying?.() && !u.isMovable?.() && (u.quality ?? 1) < 5,
    );
    if (!victims.length) return false;
    unit._abductCdUntil = this.time + 5;
    unit._abductUntil = this.time + 5;
    unit._abductVictimUids = victims.map((victim) => victim.uid);
    for (const v of victims) {
      v.frozenUntil = Math.max(v.frozenUntil ?? 0, this.time + 5);
      this.pushLog(`【${unit.name}】吸走 ${v.name}，吸收中…`);
    }
    return true;
  }

  finishAbductionIfReady(unit) {
    if (!unit?._abductUntil || this.time < unit._abductUntil) return false;
    const victimUids = new Set(unit._abductVictimUids ?? []);
    for (const victim of this.units) {
      if (!victim.alive || !victimUids.has(victim.uid)) continue;
      victim.takeDamage(Math.max(1, victim.hp), this.time);
      if (!victim.alive) this.onUnitDeath(victim);
    }
    unit.takeDamage(Math.max(1, unit.hp), this.time);
    if (!unit.alive) this.onUnitDeath(unit);
    unit._abductUntil = 0;
    unit._abductVictimUids = [];
    return true;
  }

  /** 魅惑妖灵：魅惑低品质敌方单位，使其变为己方单位 */
  tryCharm(unit) {
    if (!unit.alive || (unit._charmCdUntil && this.time < unit._charmCdUntil)) return false;
    const victims = this.contactEnemies(unit).filter((u) => (u.quality ?? 1) < 5);
    if (!victims.length) return false;
    unit._charmCdUntil = this.time + 2;
    audio.playSfx('sound/effect/fire/c53.mp3', { tier: 'subtle' });
    for (const v of victims) {
      v.team = unit.team;
      v._charmed = true;
      this.pushLog(`【${unit.name}】魅惑 ${v.name} → 加入我方`);
    }
    return true;
  }

  /** 魔法冰盾：抵挡远程伤害(隐式挡子弹)，靠近的敌方单位被冰冻并减速 */
  tryIceShield(unit) {
    if (!unit.alive || (unit._iceShieldCdUntil && this.time < unit._iceShieldCdUntil)) return false;
    const victims = this.contactEnemies(unit);
    if (!victims.length) return false;
    unit._iceShieldCdUntil = this.time + 2;
    for (const v of victims) {
      v.frozenUntil = Math.max(v.frozenUntil ?? 0, this.time + 1.5);
      v.slowedUntil = Math.max(v.slowedUntil ?? 0, this.time + 4);
      this.pushLog(`【${unit.name}】冰冻 ${v.name}`);
    }
    return true;
  }

  /** 地刺：同格经过的敌方受到伤害，同时反伤自身 */
  trySpikeTrap(spike) {
    if (!spike.alive || spike.atk <= 0) return false;

    spike.atkTimer -= TICK_INTERVAL;
    if (spike.atkTimer > 0) return false;

    const victims = this.units.filter(
      (u) =>
        u.alive &&
        u.team !== spike.team &&
        u.lane === spike.lane &&
        Math.abs(u.col - spike.col) < 0.5 &&
        !u.isFlying(),
    );
    if (!victims.length) return false;

    spike.atkTimer = getAttackCooldown(spike.atkSpeed);
    const dmg = roundBattleAmount(Math.max(1, spike.atk));
    audio.playAttack(spike.cardId, spike);
    unitAnimPlayer.triggerAttack(spike, this);

    for (const v of victims) {
      v.takeDamage(dmg, this.time);
      this.spawnFloat(v.lane, v.col, -dmg);
      if (!v.alive) {
        this.onUnitDeath(v);
        this.pushLog(`${spike.name} 刺破 ${v.name}`);
      }
    }

    spike.takeDamage(dmg, this.time);
    this.spawnFloat(spike.lane, spike.col, -dmg);
    if (!spike.alive) {
      this.onUnitDeath(spike);
      this.pushLog(`${spike.name} 损毁`);
    }
    return true;
  }

  tryAttack(unit) {
    if (unit.atk <= 0) return false;
    if (isSuicideCard(unit)) return this.trySuicideBomber(unit);
    // 飞鞋怪：首次碰到目标前不普通攻击（第一次攻击 = 接触时的特殊攻击击晕）
    if (unit.cardId === 23 && !unit._firstContactStun && !unit.attackingBase) return false;
    // 跳跃中不攻击：让跳跃动画完整播放，落地后再正常攻击
    if (unit._jumpUntil && this.time < unit._jumpUntil) return false;
    // 减速：攻速减半(冷却计时器递减减半)
    const slowMult = unit.slowedUntil && this.time < unit.slowedUntil ? 0.5 : 1;
    unit.atkTimer -= TICK_INTERVAL * slowMult;
    if (unit.atkTimer > 0) return false;

    if (unit.cardId === 58) return this.tryMushroomAttack(unit);

    if (unit.atkRate === 3 || unit.cardId === 25) {
      return this.tryTripleAttack(unit);
    }

    const target = this.chooseTarget(unit);
    if (!target) return false;

    unit.atkTimer = Math.max(
      getAttackCooldown(unit.atkSpeed) * this.getAtkSpeedMult(unit),
      unitAnimPlayer.resolveAttackDuration(unit),
    );
    const dmg = roundBattleAmount(
      Math.max(1, unit.atk + this.getAuraBonus(unit) + (unit.tempAtkBonus ?? 0)),
    );
    audio.playAttack(unit.cardId, unit);

    if (target._isBase) {
      if (unit.isRanged()) {
        const traj = unit.isParabola() ? 'parabola' : 'straight';
        this.fireProjectile(unit, target, dmg, {
          targetBase: unit.team === 'player' ? 'enemy' : 'player',
          trajectory: traj,
        });
      } else {
        unitAnimPlayer.triggerAttack(unit, this);
        this.damageBase(unit.team === 'player' ? 'enemy' : 'player', dmg);
        this.spawnFloat(unit.lane, target.col, -dmg);
      }
      return true;
    }

    if (unit.isRanged()) {
      const traj = unit.isParabola() ? 'parabola' : 'straight';
      this.fireProjectile(unit, target, dmg, { trajectory: traj, targetUid: target.uid });
    } else {
      unitAnimPlayer.triggerAttack(unit, this);
      // 首次攻击特殊动画并击晕(烘焙了 secondAttackStatus 的单位，如飞鞋怪)
      if (!unit._firstAttackDone && unitAnimPlayer.hasAnimState(unit.res, 'secondAttackStatus')) {
        unit._firstAttackDone = true;
        const dur = unitAnimPlayer.animDurationOf(unit.res, 'secondAttackStatus', 0.85);
        unitAnimPlayer.triggerState(unit, this, 'secondAttackStatus', dur);
        if (target.alive) {
          target.stunnedUntil = Math.max(target.stunnedUntil ?? 0, this.time + 1.5);
          this.pushLog(`【${unit.name}】首次攻击击晕 ${target.name}`);
        }
      }
      // 统一近战结算(包含溅射、特性处理)
      this.resolveMeleeImpact(unit, target, dmg);
      if (!target.alive) {
        this.pushLog(`${unit.name} 击败 ${target.name}`);
      }
    }
    return true;
  }

  tryTripleAttack(unit) {
    const dmg = roundBattleAmount(
      Math.max(1, (unit.atk + this.getAuraBonus(unit) + (unit.tempAtkBonus ?? 0)) * 0.5),
    );

    const rows = [unit.lane];
    if (unit.lane > 0) rows.unshift(unit.lane - 1);
    else rows.push(unit.lane);
    if (unit.lane < LANES - 1) rows.push(unit.lane + 1);
    else rows.push(unit.lane);

    let bullets = 0;
    for (const tr of rows) {
      const best = this.pickPriorityTarget(unit, this.getEnemiesInLane(unit, tr));
      let target;
      if (best) {
        target = best;
      } else if (canUnitHitBase(unit) && !unit.isMovable?.()) {
        target = {
          _isBase: true,
          lane: tr,
          col: unit.getBaseFracCol(),
          team: unit.team === 'player' ? 'enemy' : 'player',
        };
      } else {
        continue;
      }

      const hitCol = target._isBase
        ? target.col
        : getProjectileHitFrac(unit.team, target.col);

      this.fireProjectile(unit, target, dmg, {
        trajectory: 'straight',
        targetUid: target._isBase ? null : target.uid,
        targetBase: target._isBase ? (unit.team === 'player' ? 'enemy' : 'player') : null,
        hitLane: target.lane,
        hitCol,
        resolveCol: hitCol,
      });
      bullets++;
    }

    if (bullets > 0) {
      unit.atkTimer = Math.max(
        getAttackCooldown(unit.atkSpeed) * this.getAtkSpeedMult(unit),
        unitAnimPlayer.resolveAttackDuration(unit),
      );
      audio.playAttack(unit.cardId, unit);
      this.pushLog(`${unit.name} 3路直线攻击 ${bullets} 发`);
      return true;
    }
    return false;
  }

  tryMushroomAttack(unit) {
    // 蘑菇仙人：全图攻击所有敌方在场单位（含地底/飞行），不受空地/地底隔离限制
    const targets = this.units.filter(
      (target) => target.team !== unit.team && target.alive,
    );
    if (!targets.length) return false;

    const attackDuration = unitAnimPlayer.resolveAttackDuration(unit);
    const bubbleDelay = unitAnimPlayer.resolveAnimationFrameDelay(
      unit,
      'attacking',
      20,
      attackDuration * 0.25,
    );
    const damageDelay = unitAnimPlayer.resolveAnimationFrameDelay(
      unit,
      'attacking',
      34,
      attackDuration * 0.425,
    );
    const damage = roundBattleAmount(
      Math.max(1, unit.atk + this.getAuraBonus(unit) + (unit.tempAtkBonus ?? 0)),
    );

    unit.atkTimer = Math.max(
      getAttackCooldown(unit.atkSpeed) * this.getAtkSpeedMult(unit),
      attackDuration,
    );
    unitAnimPlayer.triggerAttack(unit, this, attackDuration);
    audio.playAttack(unit.cardId, unit);

    this.skillFx.push({
      kind: 'mushroom_bubble',
      skillId: 58,
      lane: unit.lane,
      col: unit.col,
      fullScreen: true,
      startAt: this.time + bubbleDelay,
      t: 0,
      duration: Math.max(0.2, attackDuration - bubbleDelay),
      life: Math.max(0.2, attackDuration - bubbleDelay),
    });
    this.skillEffects = this.skillFx;
    this.pendingDamageEvents.push({
      at: this.time + damageDelay,
      sourceUid: unit.uid,
      targetUids: targets.map((target) => target.uid),
      damage,
    });
    return true;
  }

  updatePendingDamageEvents() {
    if (!this.pendingDamageEvents.length) return;
    const pending = [];
    for (const event of this.pendingDamageEvents) {
      if (event.at > this.time + 1e-9) {
        pending.push(event);
        continue;
      }
      const attacker = this.units.find((unit) => unit.uid === event.sourceUid);
      if (!attacker) continue;
      for (const uid of event.targetUids ?? []) {
        const target = this.units.find((unit) => unit.uid === uid && unit.alive);
        if (!target) continue;
        this.spawnImpactFx(target.lane, target.col, event.damage, attacker.res);
        this.applyCardHit(attacker, target, event.damage, {
          ranged: true,
          ignoreCombatLayers: true,
        });
      }
    }
    this.pendingDamageEvents = pending;
  }

  fireProjectile(unit, target, damage, opts = {}) {
    unitAnimPlayer.triggerAttack(unit, this);
    const trajectory = opts.trajectory ?? 'straight';
    const targetBase = opts.targetBase ?? null;
    const isBaseShot = target._isBase || targetBase;
    const baseHitCol = unit.team === 'player' ? ENEMY_BASE_FRAC : PLAYER_BASE_FRAC;
    const hitCol = isBaseShot
      ? baseHitCol
      : (opts.hitCol ?? getProjectileHitFrac(unit.team, target.col));
    const resolveCol = isBaseShot ? baseHitCol : (opts.resolveCol ?? hitCol);
    // 子弹在攻击动画的出手帧(releaseFrame)才发射，与动画动作同步
    const releaseDelay = unitAnimPlayer.resolveAttackReleaseDelay(unit);
    this.projectiles.push(
      new Projectile({
        owner: unit.team,
        lane: unit.lane,
        startCol: unit.col,
        hitLane: opts.hitLane ?? target.lane,
        hitCol,
        resolveCol,
        damage,
        trajectory,
        attackPattern: getAttackPattern(unit.cardId) || null,
        // 黑暗精灵雷电直接命中同行最远目标，无视路径阻挡
        pierce: unit.cardId === 46 || opts.pierce === true,
        targetUid: isBaseShot ? null : (opts.targetUid ?? target.uid),
        targetLayerMask: getUnitAttackLayerMask(unit),
        targetBase,
        sourceUid: unit.uid,
        sourceRes: unit.res,
        icon: trajectory === 'parabola' ? '🥥' : '●',
        delay: releaseDelay,
      }),
    );
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.done) continue;
      if (p.targetUid && !p.collidedUnit) {
        const movingTarget = this.units.find(
          (unit) => unit.uid === p.targetUid
            && this.isProjectileCollisionTarget(p, unit),
        );
        if (movingTarget) {
          p.hitLane = movingTarget.lane;
          p.hitCol = getProjectileHitFrac(p.owner, movingTarget.col);
          p.resolveCol = p.hitCol;
        }
      }
      const prevX = p.x;
      const prevY = p.y;
      p.update(dt);
      if (p.launched) p.flightT = (p.flightT ?? 0) + dt;
      // 即使本帧已经飞到终点，也必须先做整段扫掠碰撞；否则大 dt 会直接越过目标。
      if (p.launched && (p.trajectory === 'straight' || p.trajectory === 'parabola') && !p.visualOnly && !p.pierce) {
        const dir = p.owner === 'player' ? 1 : -1;
        const lo = Math.min(prevX, p.x);
        const hi = Math.max(prevX, p.x);
        const collision = this.units
          .filter((u) => {
            if (!this.isProjectileCollisionTarget(p, u)) return false;
            if ((p.x - prevX) * dir < 0) return false;
            const unitLo = Number(u.col) - 0.5;
            const unitHi = Number(u.col) + 0.5;
            if (hi + 1e-6 < unitLo || lo - 1e-6 > unitHi) return false;
            const contact = dir > 0
              ? Math.max(prevX, unitLo)
              : Math.min(prevX, unitHi);
            const span = p.x - prevX;
            const ratio = Math.abs(span) > 1e-9 ? (contact - prevX) / span : 0;
            const contactLane = prevY + (p.y - prevY) * Math.max(0, Math.min(1, ratio));
            return Math.abs(Number(u.lane) - contactLane) <= 0.5;
          })
          .map((unit) => ({
            unit,
            front: dir > 0
              ? Math.max(prevX, Number(unit.col) - 0.5)
              : Math.min(prevX, Number(unit.col) + 0.5),
          }))
          .sort((a, b) => dir > 0 ? a.front - b.front : b.front - a.front)[0];
        if (collision) {
          p.x = collision.front;
          p.y = collision.unit.lane;
          p.hitLane = collision.unit.lane;
          p.resolveCol = collision.front;
          p.collidedUnit = collision.unit;
          p.targetBase = null;
          p.targetUid = collision.unit.uid;
          p.done = true;
        }
      }
      if (p.done) resolveProjectileHit(p, this);
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  updateUnitMovement(dt) {
    for (const unit of this.units) {
      // 两个空中敌对单位相撞即坠落变地面（不受 attacking/攻击 continue 影响）
      if (unit.alive && unit.isFlying?.()) this.landCollidingAerialUnits(unit);
      if (!unit.alive || !unit.isMovable()) continue;

      // 飞行单位(飞行忍者/幻飞行忍者等)血量 ≤50% 立即下坠变地面单位，落地不可逆，触发落地技能。
      // 飞行水蜜桃(40)保持全程飞行：即便血量低于 50% 也不下坠。
      if (unit.viewType === 6 && unit.cardId !== 40 && unit._aerialLanded !== true && unit.hp / Math.max(1, unit.maxHp) <= 0.5) {
        this.forceAerialLanding(unit);
      }

      this.finishAerialLanding(unit);
      if (unit._aerialLandingRequested) {
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      if (unit.isStunned(this.time)) {
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      // 两个仍在空中的敌对单位相撞时，双方先落地，再按地面规则交战。
      if (this.landCollidingAerialUnits(unit)) {
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      // 钻地单位(地道工兵/钻地大蒜)：从地下直达敌方阵营最后一格，爬出后攻击基地
      if (unit.isTunnelUnit?.() && !unit._burrowEmerged && !unit._burrowReturning && !unit._burrowRefunded) {
        this.updateBurrowMovement(unit, dt);
        continue;
      }

      if (unit._burrowEmergeUntil && this.time < unit._burrowEmergeUntil) {
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      if (unit._burrowReturning) {
        this.updateBurrowReturnMovement(unit, dt);
        continue;
      }

      if (unit.attackingBase) {
        // 飞行水蜜桃在基地直接自爆；其余空中单位先落地再攻击基地。
        if (unit.isFlying?.()) {
          this.requestAerialLanding(unit, { atBase: true });
          unit.renderX = unit.col;
          unit.renderY = unit.lane;
          continue;
        }
        if (this.hasBaseLaneBlocker(unit)) continue;
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      if (unit._attackAnimUntil && this.time < unit._attackAnimUntil) {
        if (Number.isFinite(unit._attackLockCol)) unit.col = unit._attackLockCol;
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      // 冰冻：不可移动
      if (unit.isFrozen(this.time)) {
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      const dir = this.getMoveDir(unit);
      const gridCol = this.getUnitGridCol(unit);

      // 跳跃大耳怪(special 5)：跳跃中从起点插值越过目标格
      if (unit._jumpUntil && this.time < unit._jumpUntil) {
        const span = Math.max(0.001, unit._jumpUntil - unit._jumpStart);
        const frac = Math.min(1, (this.time - unit._jumpStart) / span);
        unit.col = unit._jumpFromCol + (unit._jumpToCol - unit._jumpFromCol) * frac;
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      // 跳跃大耳怪(special 5)：前方一格有阻挡敌人 → 跳过一格越过首个单位(仅一次)；
      // 若落点超出战场(后面是基地)，直接跳到最后一格(COLS-1)打基地
      if (unit.specialEffect === 5 && !unit._jumpedOnce) {
        const aheadCol = gridCol + dir;
        if (aheadCol >= 0 && aheadCol < COLS && this.hasBlockingEnemyInCell(unit, aheadCol)) {
          const jumpCol = Math.max(0, Math.min(COLS - 1, aheadCol + dir));
          if (jumpCol !== gridCol) {
            unit._jumpedOnce = true;
            unit._jumpFromCol = unit.col;
            unit._jumpToCol = jumpCol;
            unit._jumpStart = this.time;
            unit._jumpUntil = this.time + 0.9;
            unit.renderX = unit.col;
            unit.renderY = unit.lane;
            // 跳跃大耳怪：跳跃音效(jump_31.mp3)
            audio.playSfx('jump_31', { tier: 'subtle' });
            continue;
          }
        }
      }

      // 停止移动判定：
      //  - 近战(射程1)：必须「接触」前方格才有敌人阻挡才停 → 走到敌人面前才攻击（修复"距离没到就攻击"）
      //  - 远程(射程>1)：射程内有敌方目标即可停
      // 飞鞋怪例外：必须「碰到」目标才触发特殊攻击击晕，接触前继续前进
      if (unit.cardId === 23 && !unit._firstContactStun) {
        // 继续移动，直到撞到敌人触发 tryFirstContactStun
      } else if (
        this.hasBlockingEnemyInCell(unit, gridCol + dir) ||
        (unit.range > 1 && this.getEnemiesInLane(unit, unit.lane).length > 0)
      ) {
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      if (this.hasBlockingEnemyInCell(unit, gridCol)) {
        // 撞到阻挡敌人：接触点爆闪(bump 特效)，节流避免连续闪烁
        if (!unit._lastBumpAt || this.time - unit._lastBumpAt > 0.6) {
          unit._lastBumpAt = this.time;
          this.spawnBumpFx(unit.lane, unit.col);
        }
        // 飞鞋怪：首次碰到敌方目标立刻释放特殊攻击击晕(先手控制)
        this.tryFirstContactStun(unit);
        if (isSuicideCard(unit) && this.trySuicideBomber(unit)) {
          unit.renderX = unit.col;
          unit.renderY = unit.lane;
        }
        continue;
      }

      let slowFactor = 1;
      if (unit.slowedUntil && this.time < unit.slowedUntil) slowFactor = 0.45;
      const moveMult = this.getMoveSpeedMult(unit);

      const speed = getMoveColPerSec(unit.moveSpeed) * slowFactor * moveMult;
      if (speed <= 0) continue;

      let nextCol = unit.col + dir * speed * dt;

      // 单位中心连续走到网格外沿再切换基地攻击；不能在半格阈值处瞬移到整列中心。
      if (dir < 0 && nextCol <= PLAYER_GRID_EDGE_FRAC) {
        unit.col = PLAYER_GRID_EDGE_FRAC;
        unit.attackingBase = true;
        this.requestAerialLanding(unit, { atBase: true });
        this.pushLog(`【${unit.name}】开始攻击基地`);
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      } else if (dir > 0 && nextCol >= ENEMY_GRID_EDGE_FRAC) {
        unit.col = ENEMY_GRID_EDGE_FRAC;
        unit.attackingBase = true;
        this.requestAerialLanding(unit, { atBase: true });
        this.pushLog(`【${unit.name}】开始攻击基地`);
        unit.renderX = unit.col;
        unit.renderY = unit.lane;
        continue;
      }

      const nextGridCol = Math.max(0, Math.min(COLS - 1, Math.round(nextCol)));
      if (nextGridCol !== gridCol && this.hasBlockingEnemyInCell(unit, nextGridCol)) {
        // 飞鞋怪：接近到接触距离时立刻释放特殊攻击击晕
        this.tryFirstContactStun(unit);
        if (isSuicideCard(unit) && this.trySuicideBomber(unit)) {
          unit.renderX = unit.col;
          unit.renderY = unit.lane;
          continue;
        }
        if (!unit.isFlying()) {
          const boundary = (gridCol + nextGridCol) / 2;
          nextCol = dir > 0 ? Math.min(nextCol, boundary - 0.01) : Math.max(nextCol, boundary + 0.01);
        }
      }

      if (isSuicideCard(unit) && this.unitsInSuicideContact(unit).length) {
        if (this.trySuicideBomber(unit)) {
          unit.renderX = unit.col;
          unit.renderY = unit.lane;
          continue;
        }
      }

      if (Math.abs(nextCol - unit.col) < 1e-6) continue;

      unit.col = nextCol;
      unit.renderX = unit.col;
      unit.renderY = unit.lane;
    }
  }

  updateBurrowReturnMovement(unit, dt) {
    const dir = unit.team === 'player' ? -1 : 1;
    if (unit._attackAnimUntil && this.time < unit._attackAnimUntil) {
      if (Number.isFinite(unit._attackLockCol)) unit.col = unit._attackLockCol;
      unit.renderX = unit.col;
      unit.renderY = unit.lane;
      return;
    }
    const gridCol = this.getUnitGridCol(unit);
    const enemies = this.getEnemiesInLane(unit, unit.lane);
    if (
      this.hasBlockingEnemyInCell(unit, gridCol)
      || this.hasBlockingEnemyInCell(unit, gridCol + dir)
      || (unit.range > 1 && enemies.length > 0)
    ) {
      unit.renderX = unit.col;
      unit.renderY = unit.lane;
      return;
    }
    const speed = getMoveColPerSec(unit.moveSpeed);
    if (speed <= 0) return;
    const ownBaseCol = unit.team === 'player' ? PLAYER_GRID_EDGE_FRAC : ENEMY_GRID_EDGE_FRAC;
    const nextCol = unit.col + dir * speed * dt;
    const arrived = dir < 0 ? nextCol <= ownBaseCol : nextCol >= ownBaseCol;
    unit.col = arrived ? ownBaseCol : nextCol;
    unit.renderX = unit.col;
    unit.renderY = unit.lane;
    unit.attackingBase = false;
    unit._burrowFacingReversed = true;
    if (!arrived) return;

    unit._burrowReturned = true;
    unit._burrowRefundPending = true;
    const refunded = this.onBurrowReturn?.(unit) === true;
    unit._burrowRefunded = refunded;
    unit.hp = 0;
    unit.alive = false;
    this.pushLog(`【${unit.name}】成功返回己方基地${refunded ? '，返还部署资源' : ''}`);
  }

  /** 钻地移动：无视沿途阻挡直达敌方后排，爬出后返向己方基地。 */
  updateBurrowMovement(unit, dt) {
    if (unit.attackingBase) {
      unit.renderX = unit.col;
      unit.renderY = unit.lane;
      return;
    }
    if (unit._burrowTargetCol == null) {
      unit._burrowTargetCol = unit.team === 'player' ? COLS - 1 : 0;
    }
    const dir = this.getMoveDir(unit);
    const speed = getMoveColPerSec(unit.moveSpeed);
    if (speed <= 0) return;
    const targetCol = unit._burrowTargetCol;
    let nextCol = unit.col + dir * speed * dt;
    const arrived = dir > 0 ? nextCol >= targetCol - 0.05 : nextCol <= targetCol + 0.05;
    if (arrived) {
      unit.col = targetCol;
      unit._burrowTargetCol = null;
      unit._burrowEmerged = true;
      unit._burrowReturning = true;
      unit._burrowFacingReversed = true;
      unit.attackingBase = false;
      const emergeDuration = unitAnimPlayer.animDurationOf(unit.res, 'toGround', 0.8);
      unit._burrowEmergeUntil = this.time + emergeDuration;
      unitAnimPlayer.triggerState(unit, this, 'toGround', emergeDuration);
      this.pushLog(`【${unit.name}】在敌方后排爬出，开始返回己方基地`);
    } else {
      unit.col = nextCol;
      // 与循环的 underMoving 动画同步，按一个动画周期补播原版钻地移动音。
      const soundInterval = Math.max(0.8, unitAnimPlayer.resolveAnimationDuration(unit, 'underMoving', 0.9));
      if (this.time >= (Number(unit._burrowNextSoundAt) || 0)) {
        unit._burrowNextSoundAt = this.time + soundInterval;
        audio.playMove(unit.cardId);
      }
    }
    unit.renderX = unit.col;
    unit.renderY = unit.lane;
  }

  damageBase(side, amount) {
    const dmg = roundBattleAmount(amount);
    if (side === 'enemy') {
      this.enemyHeroHp = roundBattleAmount(Math.max(0, this.enemyHeroHp - dmg));
      if (!this.trainingMode) this.pushLog(`敌方基地 -${dmg} HP`);
    } else if (!this.trainingMode) {
      this.heroHp = roundBattleAmount(Math.max(0, this.heroHp - dmg));
      this.pushLog(`己方基地 -${dmg} HP`);
    }
  }

  rollDeathDrop(unit) {
    if (
      !this.lootEnabled
      || !unit
      || unit._lootRolled
      || unit.team !== 'enemy'
      || unit.pvpNeutral === true
      || unit.bossCommanderOnly === true
      || unit.isBoss === true
      || unit.pvpBoss === true
    ) return null;

    unit._lootRolled = true;
    const level = Math.max(1, Math.min(5, Math.floor(Number(unit.quality) || 1)));
    const chance = Math.min(0.42, 0.14 + level * 0.055);
    const roll = Number(this.rng());
    if (!Number.isFinite(roll) || roll >= chance) return null;

    const drop = {
      id: ++this._lootDropSeq,
      itemId: 10000 + level,
      count: 1,
      lane: Math.max(0, Math.min(LANES - 1, Math.floor(Number(unit.lane) || 0))),
      col: Math.max(0, Math.min(COLS - 1, Number(unit.col) || 0)),
      sourceUid: Number(unit.uid) || 0,
      sourceCardId: Number(unit.cardId) || 0,
      createdAt: Number(this.time) || 0,
    };
    this.lootDrops.push(drop);
    this.pushLog(`【${unit.name}】掉落 ${level}级强化粉`);
    return drop;
  }

  onUnitDeath(unit) {
    unitAnimPlayer.markDeath(unit, this);
    // 击杀计数（任务/成就上报）
    if (unit.team !== 'player') {
      this.killsThisBattle = (this.killsThisBattle || 0) + 1;
      this.totalKills = (this.totalKills || 0) + 1;
    }
    if (unit.team === 'player') unit._diedThisBattle = true;
    audio.playDeath(unit.cardId);

    // 重生史莱姆：死亡后满血原地复活，只能复活1次
    if (unit.cardId === 109 && !unit._revivedOnce) {
      unit._revivedOnce = true;
      unit.alive = true;
      unit.hp = unit.maxHp;
      unit._deathUntil = undefined;
      this.pushLog(`【${unit.name}】满血复活！`);
      return;
    }

    // 死神：死亡后满血原地复活2次
    if (unit.cardId === 57 && (unit._reviveCount ?? 0) < 2) {
      unit._reviveCount = (unit._reviveCount ?? 0) + 1;
      unit.alive = true;
      unit.hp = unit.maxHp;
      unit._deathUntil = undefined;
      this.pushLog(`【${unit.name}】满血复活(${unit._reviveCount}/2)`);
      return;
    }

    if (unit._deathResolved) return;
    unit._deathResolved = true;
    this.rollDeathDrop(unit);

    // 软泥忍者怪：死亡后分身出2只小软泥
    if (unit.cardId === 28) {
      for (let i = 0; i < 2; i++) this.spawnSummon(29, unit.lane, unit.col, unit.team);
    }
    // 幻.飞行忍者：正常死亡召唤分身；被自爆炸死(飞行水蜜桃/热血火龙果)不产生分身
    if (unit.cardId === 45 && !unit._suicideKilled) {
      this.spawnSummon(60, unit.lane, unit.col, unit.team);
    }
    // 真.西瓜太郎：死亡后爆炸，对周围3x3格范围内敌方单位造成伤害
    if (unit.cardId === 30) {
      this.deathExplosion(unit, 1, unit.atk);
    }
    // 猕猴桃剑客：死亡后单格附近所有敌方单位眩晕
    if (unit.cardId === 69) {
      this.deathStun(unit, 0, 1.5);
    }
    // 超级猕猴桃剑客：死亡后3x3格范围内所有敌方单位眩晕
    if (unit.cardId === 102) {
      this.deathStun(unit, 1, 2);
    }
  }

  /** 召唤一只卡牌单位到指定位置附近(用于死亡分身/定时造怪) */
  spawnSummon(cardId, lane, col, team, {
    exact = false,
    deployEffect = true,
    preload = true,
    log = true,
  } = {}) {
    const card = this.db.getById(cardId);
    if (!card) return null;
    let placeCol = col;
    if (!exact) {
      const candidates = [col, col - 1, col + 1].filter((x) => x >= 0 && x < COLS);
      for (const cand of candidates) {
        if (this.getUnitsAt(lane, cand).length === 0) {
          placeCol = cand;
          break;
        }
      }
    }
    const unit = new BattleUnit({ card, lane, col: placeCol, team });
    this.initUnitSpawnFade(unit, { preload });
    this.units.push(unit);
    if (deployEffect) this.pushDeployEffect(lane, placeCol, unit.craftQuality);
    if (log) this.pushLog(`【${card.name}】被召唤 → 第${lane + 1}路 ${placeCol}列`);
    return unit;
  }

  /** 死亡爆炸：对周围 (2r+1)x(2r+1) 敌方单位造成伤害，可选眩晕 */
  deathExplosion(unit, radius, damage, stunSec = 0) {
    const t = this.time;
    const centerCol = Math.round(unit.col);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const tr = unit.lane + dr;
        const tc = centerCol + dc;
        if (tr < 0 || tr >= LANES || tc < 0 || tc >= COLS) continue;
        for (const u of this.getUnitsAt(tr, tc)) {
          if (!u.alive || u.team === unit.team || u.isLowTarget?.()) continue;
          const dmg = roundBattleAmount(Math.max(1, damage));
          const dealt = u.takeDamage(dmg, t);
          if (dealt > 0) this.spawnFloat(u.lane, u.col, -dealt);
          if (stunSec && u.alive) u.stunnedUntil = Math.max(u.stunnedUntil ?? 0, t + stunSec);
          if (!u.alive) this.onUnitDeath(u);
        }
      }
    }
    if (radius >= 1) this.pushLog(`【${unit.name}】死亡爆炸 ${2 * radius + 1}x${2 * radius + 1}`);
  }

  /** 死亡眩晕：周围 (2r+1)x(2r+1) 敌方单位眩晕 */
  deathStun(unit, radius, stunSec) {
    const t = this.time;
    const centerCol = Math.round(unit.col);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const tr = unit.lane + dr;
        const tc = centerCol + dc;
        if (tr < 0 || tr >= LANES || tc < 0 || tc >= COLS) continue;
        for (const u of this.getUnitsAt(tr, tc)) {
          if (!u.alive || u.team === unit.team) continue;
          u.stunnedUntil = Math.max(u.stunnedUntil ?? 0, t + stunSec);
        }
      }
    }
    this.pushLog(`【${unit.name}】死亡眩晕 ${2 * radius + 1}x${2 * radius + 1}`);
  }

  /** 技能释放特效(由 BattleSkillSystem.showEffect 调用，渲染器用 skillAnimPlayer 绘制) */
  pushSkillEffect(kind, target, radius, skillId, duration, loop = false) {
    const fullScreen = !target || target.lane == null || target.col == null;
    // 性能：同屏技能特效上限（超限丢弃最旧，避免全屏动画叠加掉帧）
    if (this.skillFx.length >= 10) this.skillFx.splice(0, this.skillFx.length - 9);
    this.skillFx.push({
      kind,
      lane: fullScreen ? Math.floor(LANES / 2) : target.lane,
      col: fullScreen ? Math.floor(COLS / 2) : target.col,
      radius: Number(radius) || 0,
      skillId,
      fullScreen,
      loop: loop === true,
      t: 0,
      duration: Math.max(0.2, Number(duration) || 0.9),
    });
  }

  /** 子弹命中特效(命中点 baoza 爆炸；寿命放宽以容纳长动画，渲染端播完淡出) */
  spawnImpactFx(lane, col, amount, res = null) {
    this.impactFx.push({
      lane,
      col,
      amount: Number(amount) || 0,
      res: res != null ? String(res) : null,
      t: 0,
      life: 2,
    });
  }

  /** 白光斩(帶刀中尉)：对自身前方所有敌方单位造成伤害 */
  whiteSlashStrike(attacker, damage) {
    if (!attacker?.alive) return;
    const dir = attacker.team === 'player' ? 1 : -1;
    const selfC = Math.round(attacker.col ?? 0);
    for (const u of this.units) {
      if (!u.alive || u.team === attacker.team || u.isLowTarget?.()) continue;
      if (!this.canUnitHitTargetLayer(attacker, u)) continue;
      if (u.lane !== attacker.lane) continue;
      const ah = dir * (Math.round(u.col) - selfC);
      if (ah < 0) continue;
      const dealt = u.takeDamage(damage, this.time);
      if (dealt > 0) this.spawnFloat(u.lane, u.col, -dealt);
      if (!u.alive) this.onUnitDeath(u);
    }
  }

  /**
   * 统一命中结算：伤害 + 全部卡牌特性(近战与远程共用)。
   * 覆盖：吸血/命中回血/总生命回血/偷资源/中毒/眩晕/定身/冰冻/减速/灼烧/
   * 克制倍率/加资源/秒杀/白光斩/受害者反射/火图腾灼烧近战。
   */
  applyCardHit(attacker, vic, baseDamage, { ranged = false, ignoreCombatLayers = false } = {}) {
    if (!attacker || !vic || !vic.alive) return 0;
    if (!ignoreCombatLayers && !this.canUnitHitTargetLayer(attacker, vic)) return 0;
    const traits = getCardTraits(attacker.cardId) || {};
    const t = this.time;

    // 火龙：攻击力 = 基础攻击 + 当前所有资源量之和
    let dmg = baseDamage;
    if (getAttackPattern(attacker.cardId)?.addResources) {
      dmg += roundBattleAmount((this.sunlight ?? 0) + (this.food ?? 0));
    }
    // 邪恶狼骑：对防御类伤害 ×2；疯狂战士：对远程/法师伤害 ×2
    if (traits.doubleVsDefender && (vic.isProtector?.() || vic.isDefensive?.() || vic.atkStyle === 1)) dmg *= 2;
    if (traits.doubleVsRanged && vic.isRanged?.()) dmg *= 2;
    // 石巨人：重拳秒杀敌方地面单位，对橙、红卡(quality>=5)无效
    if (traits.executeLowQuality && !vic.isFlying?.() && (vic.quality ?? 1) < 4) dmg = Math.max(dmg, vic.hp);
    dmg = roundBattleAmount(Math.max(1, dmg));

    const dealt = vic.takeDamage(dmg, t);
    if (dealt > 0) this.spawnFloat(vic.lane, vic.col, -dealt);

    let healedAttacker = false;
    if (traits.lifestealRatio) {
      const heal = Math.max(0, dealt * traits.lifestealRatio);
      if (heal > 0) healedAttacker = attacker.heal(heal) > 0 || healedAttacker;
    }
    if (traits.healOnHitRatio) {
      const heal = Math.max(0, dealt * traits.healOnHitRatio);
      if (heal > 0) healedAttacker = attacker.heal(heal) > 0 || healedAttacker;
    }
    // 恢复史莱姆：每攻击一次恢复自身总生命值的20%(8秒冷却)
    if (traits.healMaxHpOnHit && (!attacker._healMaxHpCdUntil || t >= attacker._healMaxHpCdUntil)) {
      healedAttacker = attacker.heal(attacker.maxHp * traits.healMaxHpOnHit) > 0 || healedAttacker;
      attacker._healMaxHpCdUntil = t + (traits.healCooldownSec ?? 0);
    }
    if (healedAttacker) audio.playHeal(attacker);
    // 大肚神偷：偷取1点资源(对英雄无效——打基地不经过此路径)
    if (traits.stealResource) {
      if (this.sunlight < MAX_RESOURCE) this.sunlight += 1;
      if (this.food < MAX_RESOURCE) this.food += 1;
    }

    if (traits.poisonChance && Math.random() < traits.poisonChance) {
      vic.dots = vic.dots ?? [];
      vic.dots.push({ kind: 'poison', dps: traits.poisonDps || 3, until: t + (traits.poisonSec || 5), every: 1 });
    }
    if (traits.stunChance && Math.random() < traits.stunChance) {
      vic.stunnedUntil = Math.max(vic.stunnedUntil || 0, t + (traits.stunSec || 1.5));
    }
    // 超级小麦：定身
    if (traits.rootChance && Math.random() < traits.rootChance) {
      vic.stunnedUntil = Math.max(vic.stunnedUntil || 0, t + (traits.rootSec || 2.5));
    }
    // 极寒大法师：冻结
    if (traits.freezeChance && Math.random() < traits.freezeChance) {
      vic.frozenUntil = Math.max(vic.frozenUntil || 0, t + (traits.freezeSec || 1.5));
    }
    if (traits.slowSec) {
      vic.slowedUntil = Math.max(vic.slowedUntil || 0, t + traits.slowSec);
    }
    if (traits.burnDps && traits.burnSec) {
      vic.dots = vic.dots ?? [];
      vic.dots.push({ kind: 'burn', dps: traits.burnDps, until: t + traits.burnSec, every: 1 });
    }
    // 帶刀中尉：白光斩
    if (traits.whiteSlashChance && Math.random() < traits.whiteSlashChance && attacker.alive) {
      this.whiteSlashStrike(attacker, dealt);
    }

    // 受害者反射：荆棘战士/巨盾核桃卫兵(近战)、战盔巨头怪(远程子弹)
    const vicTraits = getCardTraits(vic.cardId) || {};
    const reflectChance = ranged ? vicTraits.projectileReflectChance : vicTraits.meleeReflectChance;
    if (attacker.alive && reflectChance && Math.random() < reflectChance) {
      const reflectDmg = roundBattleAmount(Math.max(1, dealt * (vicTraits.reflectRatio ?? 0.5)));
      attacker.takeDamage(reflectDmg, t);
      if (!attacker.alive) this.onUnitDeath(attacker);
    }
    // 火图腾：被近战攻击时使攻击者灼烧
    if (!ranged && vicTraits.burnMelee && attacker.alive) {
      attacker.dots = attacker.dots ?? [];
      attacker.dots.push({ kind: 'burn', dps: vicTraits.burnDps || 3, until: t + (vicTraits.burnSec || 5), every: 1 });
    }

    if (!vic.alive) this.onUnitDeath(vic);
    return dealt;
  }

  /** 统一处理子弹命中结算，应用溅射与卡牌特性(中毒、眩晕、吸血、治疗、减速等) */
  resolveProjectileImpact(proj, primary) {
    const engine = this;
    if (!proj || !this.isProjectileCollisionTarget(proj, primary)) return;
    const p = proj.attackPattern || null;

    function splashVictimsLocal(proj, primary) {
      const pat = proj.attackPattern;
      const dir = proj.owner === 'player' ? 1 : -1;
      const ctr = Math.round(primary.col);
      const selfC = Math.round(proj.attackerCol ?? proj.startCol ?? 0);
      const selfL = proj.attackerLane ?? proj.lane;
      const es = engine.units.filter((u) => engine.isProjectileCollisionTarget(proj, u));
      const check = (u) => {
        const c = Math.round(u.col);
        const dl = Math.abs(u.lane - primary.lane);
        const dc = Math.abs(c - ctr);
        const ah = dir * (c - selfC);
        if (!pat) return u.uid === primary.uid;
        switch (pat.kind) {
          case 'forward':     return u.lane === selfL && ah >= -0.15 && ah <= pat.cells + 0.5;
          case 'row_splash':  return u.lane === primary.lane && dc <= pat.radius;
          case 'col_splash':  return Math.abs(u.lane - primary.lane) <= pat.radius && Math.abs(c - ctr) <= 0.5;
          case 'square':      return dl <= pat.radius && dc <= pat.radius;
          case 'square_self': return Math.abs(u.lane - selfL) <= pat.radius && Math.abs(c - selfC) <= pat.radius;
          case 'x':           return dl === dc && dl <= pat.radius;
          case 'cross':       return (dl === 0 || dc === 0) && Math.max(dl, dc) <= pat.radius;
          case 'rect':        return dl <= pat.laneRadius && dir*(c-ctr) >= -pat.colBack && dir*(c-ctr) <= pat.colForward;
          default:            return u.uid === primary.uid;
        }
      };
      const v = es.filter(check);
      if (primary.alive && !v.some(u => u.uid === primary.uid)) v.unshift(primary);
      return v;
    }

    const attacker = this.units.find(u => u.uid === proj.sourceUid) ?? null;

    // spawn impact FX (visual)
    if (primary) this.spawnImpactFx(primary.lane, primary.col, proj.damage, proj.sourceRes);

    // determine victims
    let victims = [];
    if (primary && p && p.kind !== 'all') {
      victims = splashVictimsLocal(proj, primary);
    } else if (p && p.kind === 'all') {
      victims = this.units.filter((u) => this.isProjectileCollisionTarget(proj, u));
    } else if (primary) {
      victims = [primary];
    }

    for (const vic of victims) {
      if (!vic.alive) continue;
      this.applyCardHit(attacker, vic, proj.damage, {
        ranged: true,
        ignoreCombatLayers: true,
      });
    }
  }

  /** 统一处理近战命中结算(近战直接命中时调用)，应用溅射与卡牌特性 */
  resolveMeleeImpact(attacker, primary, damage) {
    if (!attacker || !primary || !this.isValidEnemyTarget(attacker, primary)) return;
    const pat = getAttackPattern(attacker.cardId) || null;

    const splashVictims = (attacker, primary) => {
      const dir = attacker.team === 'player' ? 1 : -1;
      const ctr = Math.round(primary.col);
      const selfC = Math.round(attacker.col ?? 0);
      const selfL = attacker.lane;
      const es = this.units.filter((u) => this.isValidEnemyTarget(attacker, u));
      const check = (u) => {
        const c = Math.round(u.col);
        const dl = Math.abs(u.lane - primary.lane);
        const dc = Math.abs(c - ctr);
        const ah = dir * (c - selfC);
        if (!pat) return u.uid === primary.uid;
        switch (pat.kind) {
          case 'forward':     return u.lane === selfL && ah >= -0.15 && ah <= pat.cells + 0.5;
          case 'row_splash':  return u.lane === primary.lane && dc <= pat.radius;
          case 'col_splash':  return Math.abs(u.lane - primary.lane) <= pat.radius && Math.abs(c - ctr) <= 0.5;
          case 'square':      return dl <= pat.radius && dc <= pat.radius;
          case 'square_self': return Math.abs(u.lane - selfL) <= pat.radius && Math.abs(c - selfC) <= pat.radius;
          case 'x':           return dl === dc && dl <= pat.radius;
          case 'cross':       return (dl === 0 || dc === 0) && Math.max(dl, dc) <= pat.radius;
          case 'rect':        return dl <= pat.laneRadius && dir*(c-ctr) >= -pat.colBack && dir*(c-ctr) <= pat.colForward;
          default:            return u.uid === primary.uid;
        }
      };
      const v = es.filter(check);
      if (primary.alive && !v.some(u => u.uid === primary.uid)) v.unshift(primary);
      return v;
    };

    // spawn visual fx
    this.spawnImpactFx(primary.lane, primary.col, damage, attacker.res);

    // determine victims
    let victims = [];
    if (pat && pat.kind !== 'all') {
      victims = splashVictims(attacker, primary);
    } else if (pat && pat.kind === 'all') {
      victims = this.units.filter((u) => this.isValidEnemyTarget(attacker, u));
    } else {
      victims = [primary];
    }

    for (const vic of victims) {
      if (!this.isValidEnemyTarget(attacker, vic)) continue;
      this.applyCardHit(attacker, vic, damage, { ranged: false });
    }
  }

  /** 碰撞特效(bump)：移动单位撞到阻挡敌人时爆闪 */
  spawnBumpFx(lane, col) {
    this.bumpFx.push({ lane, col, t: 0, life: 0.55 });
  }

  updateFx(dt) {
    for (const fx of this.skillFx) {
      if (fx.startAt != null && this.time < fx.startAt) continue;
      const activeDt = fx.startAt == null
        ? dt
        : Math.max(0, this.time - Math.max(fx.startAt, this.time - dt));
      fx.t += activeDt;
      if (Number.isFinite(fx.life)) fx.life = Math.max(0, fx.life - activeDt);
    }
    this.skillFx = this.skillFx.filter(
      (fx) => (fx.startAt != null && this.time < fx.startAt)
        || (fx.t < fx.duration && (!Number.isFinite(fx.life) || fx.life > 0)),
    );
    this.skillEffects = this.skillFx;
    for (const fx of this.impactFx) fx.t += dt;
    this.impactFx = this.impactFx.filter((fx) => fx.t < fx.life);
    for (const fx of this.bumpFx) fx.t += dt;
    this.bumpFx = this.bumpFx.filter((fx) => fx.t < fx.life);
  }

  spawnFloat(lane, col, amount) {
    const amt = roundBattleAmount(amount);
    const existing = this.floats.find(
      (f) =>
        f.lane === lane &&
        f.col === col &&
        f.life > 0.85 &&
        Math.sign(f.amount) === Math.sign(amt),
    );
    if (existing) {
      existing.amount = roundBattleAmount(existing.amount + amt);
      existing.life = 1.2;
      return;
    }
    this.floats.push({ lane, col, amount: amt, life: 1.2, y: 0 });
    // 卡牌多时浮字数量上限（超出丢最旧，避免每帧渲染大量伤害数字卡顿）
    if (this.floats.length > 40) this.floats.splice(0, this.floats.length - 40);
  }

  updateFloats(dt) {
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= dt * 0.8;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  initUnitSpawnFade(unit, { preload = true } = {}) {
    unit._spawnFadeDur = 0.28;
    unit._spawnFadeStart = null;
    if (!preload) {
      unit._spawnFadeStart = this.time;
      return;
    }
    if (unit.res == null) {
      unit._spawnFadeStart = this.time;
      return;
    }
    const resKey = String(unit.res);
    unitAnimPlayer.ensureLoaded([resKey]);
    if (unitAnimPlayer.hasAnim(resKey)) {
      unit._spawnFadeStart = this.time;
    } else {
      const engine = this;
      void unitAnimPlayer.awaitReady(resKey).then((ok) => {
        if (!unit.alive) return;
        if (ok) {
          unit._spawnFadeStart = engine.time;
        } else {
          unit._spawnFadeDur = 0;
        }
      });
    }
  }

  /** 天赋被动卡牌加成：战意/强壮/杀戮/耐久训练 提升己方单位攻/血 */
  applyTalentCardBonus(unit) {
    if (!unit || unit.team !== 'player' || !this.talentBonus) return;
    const { atkPct, hpPct } = this.talentBonus;
    if (atkPct > 0) {
      unit.atk = roundBattleAmount(unit.atk * (1 + atkPct / 100));
      unit.baseAtk = unit.atk;
    }
    if (hpPct > 0) {
      const add = roundBattleAmount(unit.maxHp * hpPct / 100);
      unit.maxHp = roundBattleAmount(unit.maxHp + add);
      unit.hp = roundBattleAmount(unit.hp + add);
    }
  }

  pushDeployEffect(lane, col, craftQuality = 1) {
    this.deployEffects.push({
      lane,
      col,
      craftQuality,
      life: 0.55,
      maxLife: 0.55,
    });
  }

  updateDeployEffects(dt) {
    for (const fx of this.deployEffects) {
      fx.life -= dt;
    }
    this.deployEffects = this.deployEffects.filter((fx) => fx.life > 0);
  }

  checkEnd() {
    if (this.trainingMode) return;
    if (this.heroHp <= 0) {
      this.status = 'lose';
      this.heroHp = 0;
      this.pushLog('己方基地被攻破，战斗失败');
      return;
    }
    // 关键：只有敌方基地 HP **严格归零(<=0)** 才判胜；低血量(如6血)未归零不结算
    if (this.enemyHeroHp <= 0) {
      this.enemyHeroHp = 0;
      this.status = 'win';
      this.pushLog(`胜利！击破敌方基地 · ${this.stage.stage_name}`);
      return;
    }
    // 清完一波并不等于摧毁基地；冒险战只能由任一方基地 HP 归零结算。
  }

  pushLog(msg) {
    this.log.unshift({ t: this.time.toFixed(1), msg });
    if (this.log.length > 10) this.log.length = 10;
  }

  selectCard(handIndex) {
    if (
      !Number.isInteger(handIndex) ||
      handIndex < 0 ||
      handIndex >= this.deck.length
    ) {
      return;
    }
    this.selectedHandIndex = handIndex;
    this.placingActive = true;
  }

  cancelPlacing() {
    this.placingActive = false;
    this.selectedHandIndex = null;
    this.lastDeployError = '';
  }
}
