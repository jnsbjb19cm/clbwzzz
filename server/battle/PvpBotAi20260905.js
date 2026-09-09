import { TALENT_NODES, getTalentPointBudget } from '../../src/core/TalentRegistry.js';
import { PvpBattle } from './PvpBattle.js';
import { getCardTraits } from '../../src/core/CardTraitRegistry.js';
import { DEFAULT_SKILL_LOADOUT, getSkillEffect, getSkillMpCost } from '../../src/core/SkillRegistry.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpBotAi20260905');
const BOT_DECK_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 8, 9, 11, 15, 17, 19, 20, 21, 22, 25, 26, 30, 31, 32, 33, 35, 36, 37, 38]);
const BOT_DEPLOY_TIME_SCALE_20260906 = 2;

function scaledDeployDelay(seconds) {
  return Math.max(0, Number(seconds) || 0) * BOT_DEPLOY_TIME_SCALE_20260906;
}

function isBotUserId(userId) {
  return Number(userId) < 0;
}

function isMovable(card) {
  return Number(card?.moveSpeed ?? card?.move_speed) > 0;
}

function cardQuality(card) {
  return Number(card?.quality ?? card?.card_quality) || 1;
}

function cardCooldown(card) {
  return Math.max(0.8, Number(card?.cooldown ?? card?.card_cd) || 2.5);
}

function isDirectDeployCard(card) {
  if (!card) return false;
  if (card.isActiveSkill?.()) return false;
  return Number(card.type ?? card.card_type) !== 4;
}

function stateFor(battle, userId) {
  battle.__smartBotState ??= new Map();
  const id = Number(userId);
  if (!battle.__smartBotState.has(id)) {
    battle.__smartBotState.set(id, {
      // 开局只观察 3~6 秒，后续仍使用独立的慢速出牌节奏。
      startedAt: (Number(battle.engine?.time) || 0)
        + 3.0 + Math.random() * 3.0,
      thinkAt: 0,
      globalReadyAt: 0,
      cardReadyAt: new Map(),
      deployCount: 0,
      laneHistory: [],
      laneDeployCount: [0, 0, 0, 0, 0],
      smartDeployPermit: false,
    });
  }
  return battle.__smartBotState.get(id);
}

function teamOfMember(battle, userId) {
  return battle.teamBlue.some((member) => Number(member.userId) === Number(userId)) ? 'blue' : 'red';
}

function affordable(battle, userId, card) {
  const resource = battle.resourcesOf(userId);
  const cost = battle.deployCost(card);
  return resource.sun + 1e-6 >= cost.sun && resource.food + 1e-6 >= cost.food;
}

function ownEngineSide(team) {
  return team === 'blue' ? 'player' : 'enemy';
}

function laneStats(battle, team, lane) {
  const ownSide = ownEngineSide(team);
  const enemySide = ownSide === 'player' ? 'enemy' : 'player';
  const own = (battle.engine.units ?? []).filter((u) => u.alive && u.lane === lane && u.team === ownSide);
  const enemy = (battle.engine.units ?? []).filter((u) => u.alive && u.lane === lane && u.team === enemySide);
  const ownMovable = own.filter((u) => u.isMovable?.()).length;
  const ownFixed = own.length - ownMovable;
  const enemyMovable = enemy.filter((u) => u.isMovable?.()).length;
  const enemyNearBase = enemy.filter((u) => {
    const col = Number(u.col) || 0;
    return team === 'blue' ? col <= 4.5 : col >= 6.5;
  }).length;
  return {
    own,
    enemy,
    ownMovable,
    ownFixed,
    enemyMovable,
    enemyNearBase,
  };
}

function hasBaseThreat(battle, team) {
  return Array.from({ length: 5 }, (_, lane) => laneStats(battle, team, lane))
    .some(stats => stats.enemyNearBase > 0);
}

function deploymentReadyAt(battle, userId, state) {
  // 战术停顿可因紧急防守缩短；单卡 CD 和资源仍由正常部署接口强制校验。
  const normal = Math.max(Number(state.startedAt) || 0, Number(state.globalReadyAt) || 0);
  if (!hasBaseThreat(battle, teamOfMember(battle, userId))) return normal;
  const emergency = state.lastDeployAt == null ? state.startedAt : state.lastDeployAt + 6;
  return Math.min(normal, emergency);
}

function configureBotSkills(battle, member, state) {
  if (state.skillsConfigured) return;
  const unlocked = new Set(['core']);
  let budget = getTalentPointBudget(member.level);
  const branches = ['north', 'east', 'south', 'west'];
  const branch = branches[Math.abs(Number(member.userId)) % branches.length];
  while (budget > 0) {
    const eligible = TALENT_NODES.filter(node => !unlocked.has(node.id)
      && Number(node.cost || 0) <= budget && node.prerequisites.every(id => unlocked.has(id)))
      .sort((a, b) => Number(b.branch === branch) - Number(a.branch === branch)
        || Number(Boolean(b.skillId)) - Number(Boolean(a.skillId)));
    if (!eligible.length) break;
    const node = eligible[0];
    unlocked.add(node.id);
    budget -= Number(node.cost || 0);
  }
  const learned = TALENT_NODES.filter(node => node.skillId && unlocked.has(node.id)).map(node => node.skillId);
  const allowed = new Set([...learned, ...DEFAULT_SKILL_LOADOUT.filter(Boolean)]);
  const preferred = Array.isArray(member.skillLoadout) ? member.skillLoadout : [504, ...learned.reverse(), 503, 505];
  const loadout = [...new Set(preferred)].filter(id => allowed.has(id) && battle.db.getById(id) && getSkillEffect(id)).slice(0, 6);
  battle.setSkillLoadout(member.userId, [...loadout, ...Array(6 - loadout.length).fill(null)]);
  state.skillsConfigured = true;
}

function chooseDeployment(battle, userId, state) {
  const now = Number(battle.engine.time) || 0;
  const team = teamOfMember(battle, userId);
  const personalUnits = (battle.engine.units || []).filter(u => u.alive && Number(u.pvpOwnerUserId) === Number(userId));
  const personalMoving = personalUnits.filter(u => u.isMovable?.()).length;
  const personalFixed = personalUnits.length - personalMoving;
  const serverCooldowns = battle.publicDeployCooldowns?.(userId) || {};
  const resource = battle.resourcesOf(userId);
  const legal = BOT_DECK_IDS.map(id => battle.db.getById(id))
    .filter(isDirectDeployCard)
    .filter(card => card.id !== 35 && card.id !== 38 && cardQuality(card) <= 4)
    .filter(card => now >= Number(state.cardReadyAt.get(Number(card.id)) || 0))
    .filter(card => !(serverCooldowns[card.id] > 0) && affordable(battle, userId, card));
  const choices = [];
  const canAffordMoving = legal.some(isMovable);
  for (let lane = 0; lane < 5; lane += 1) {
    const stats = laneStats(battle, team, lane);
    const flying = stats.enemy.filter(u => u.isFlying?.()).length;
    const wounded = stats.own.filter(u => u.hp < u.maxHp * 0.65).length;
    const defenders = stats.own.filter(u => u.atkStyle === 1).length;
    const threats = stats.enemy.reduce((n, u) => n + Math.max(0, Number(u.atk) || 0), 0);
    for (const card of legal) {
      const traits = getCardTraits(card.id) || {};
      const movable = isMovable(card);
      const guard = Number(card.atkStyle) === 1;
      const healer = Number(card.viewType) === 4;
      const antiAir = Number(card.atkStyle) === 3 || Number(card.viewType) === 6;
      const cost = battle.deployCost(card);
      // 常态以推进为主：至少两次移动卡部署后才考虑一次固定防守卡。
      const urgent = stats.enemyNearBase > 0;
      if (!movable && !urgent && (personalFixed >= 2 || (canAffordMoving && (state.deployCount < 2 || (state.movingSinceFixed || 0) < 2)))) continue;
      if (!movable && !urgent && personalFixed >= 3) continue;
      if (guard && ((!urgent && defenders) || !stats.enemy.length)) continue;
      if (healer && wounded < 2) continue;
      if (!urgent && personalUnits.length >= 2 && ((cost.sun > 0 && resource.sun - cost.sun < 2) || (cost.food > 0 && resource.food - cost.food < 2))) continue;
      let score = stats.enemyNearBase * 8 + stats.enemy.length * 2 - stats.own.length * 1.2;
      score += movable ? (personalMoving < 3 ? 12 : 7) : (stats.enemy.length ? 0 : -12);
      if (flying) score += antiAir ? 12 + flying * 3 : -8;
      if (urgent) {
        score += 100;
        // 家门口先解当前威胁，不能被移动卡配比挤掉对空或近身防守。
        if (flying) score += antiAir ? 30 : -35;
        else if (guard && !defenders) score += 18;
        else if (Number(card.atk) > 0) score += 12;
        if (healer) score -= 30;
      }
      if (guard) score += !flying && threats > 0 && !defenders ? 8 : -9;
      if (healer) score += wounded >= 2 ? wounded * 5 : -18;
      if (traits.doubleVsDefender && stats.enemy.some(u => u.atkStyle === 1)) score += 8;
      if (card.id === 25 && stats.enemy.length >= 3) score += 7;
      if (stats.own.some(u => Number(u.cardId) === Number(card.id))) score -= 4;
      score += Math.min(4, Number(card.atk || 0) / 8) - (cost.sun + cost.food) * 0.06;
      score += Math.random() * 1.5;
      for (const [index, col] of candidateCols(team, movable, guard, stats).entries()) {
        if (!movable && (battle.engine.getUnitsAt?.(lane, col) || []).some(u => u.alive && !u.pvpNeutral && !u.isMovable?.())) continue;
        choices.push({ card, lane, col, score: score - index });
      }
    }
  }
  return choices.sort((a, b) => b.score - a.score);
}

function trySmartSkill(battle, member, state) {
  if (member.botDifficulty !== 'advanced') return;
  const now = battle.engine.time;
  if (now < state.startedAt || now < (state.skillThinkAt || 0)) return;
  state.skillThinkAt = now + 1.1;
  const userId = Number(member.userId);
  const team = teamOfMember(battle, userId);
  const lanes = Array.from({ length: 5 }, (_, lane) => laneStats(battle, team, lane));
  const enemies = lanes.flatMap(l => l.enemy);
  const own = lanes.flatMap(l => l.own);
  const danger = lanes.reduce((n, l) => n + l.enemyNearBase, 0);
  const hp = team === 'blue' ? battle.engine.heroHp : battle.engine.enemyHeroHp;
  const maxHp = team === 'blue' ? battle.engine.heroMaxHp : battle.engine.enemyHeroMaxHp;
  const skills = battle.skillStateOf(userId);
  if (skills.pending.length || now < (state.skillReadyAt || 0)) return;
  const reserve = Math.max(35, [503, 504].filter(id => skills.loadout.includes(id)).reduce((sum, id) => sum + getSkillMpCost(battle.db.getById(id)), 0));
  battle.__botEffectUntil ??= new Map();
  const emergency = danger > 0 && hp < maxHp * 0.25;
  if (state.deployCount === 0 && !emergency) return;
  const candidates = [];
  for (const skillId of skills.loadout.filter(Boolean)) {
    const effect = getSkillEffect(skillId), card = battle.db.getById(skillId);
    if (!effect || !card || (skills.cooldowns[skillId] || 0) > 0 || skills.mp < getSkillMpCost(card)) continue;
    const mpCost = getSkillMpCost(card);
    if ((!emergency && skills.mp - mpCost < reserve) || now < (battle.__botEffectUntil.get(team + ':' + effect.kind) || 0)) continue;
    let score = 0, target = null;
    if (effect.kind === 'heal_hero' && ((hp < maxHp * 0.55 && maxHp - hp >= effect.amount) || emergency)) score = 20 + danger;
    if (effect.kind === 'freeze_all_enemies' && (danger >= 3 || (enemies.length >= 6 && own.length >= 3)) && enemies.some(u => !(u.frozenUntil > now))) score = 12 + danger;
    if (['buff_max_hp', 'buff_atk_allies', 'buff_as_ms'].includes(effect.kind)
      && own.filter(u => u.isMovable?.() && enemies.some(e => e.lane === u.lane && Math.abs(e.col - u.col) < 2)).length >= 4) score = 8;
    if (effect.kind === 'base_invulnerable' && emergency) score = 28;
    if (effect.kind === 'invuln_all_allies' && own.filter(u => u.hp < u.maxHp * 0.4).length >= 3 && danger) score = 16;
    if (effect.kind === 'enemy_hero_damage' && (team === 'blue' ? battle.engine.enemyHeroHp : battle.engine.heroHp) <= effect.damage) score = 30;
    if (['damage_all_enemies', 'firebird', 'fatal_curse', 'thunderstorm'].includes(effect.kind) && enemies.length >= 5) score = 10 + enemies.length;
    if (['heal_all_allies', 'sacred_revival'].includes(effect.kind) && own.filter(u => u.hp < u.maxHp * 0.6).length >= 2) score = 10;
    if (effect.needsTarget && enemies.length) {
      const ranked = enemies.map(u => ({ u, hits: enemies.filter(v => effect.kind === 'row_damage'
        ? v.lane === u.lane : effect.kind === 'fire_wall' ? Math.abs(v.col - u.col) < 0.55 : Math.abs(v.lane - u.lane) <= (effect.radiusLane ?? effect.radius ?? 0)
          && Math.abs(v.col - u.col) <= (effect.radiusCol ?? effect.radius ?? 0)).length }))
        .sort((a, b) => b.hits - a.hits || b.u.atk - a.u.atk);
      const best = ranked[0];
      const damage = Number(effect.damage) || Number(effect.dps || 0) * Math.min(3, Number(effect.duration) || 3);
      const returnValue = enemies.filter(u => effect.kind === 'row_damage' ? u.lane === best.u.lane
        : effect.kind === 'fire_wall' ? Math.abs(u.col - best.u.col) < 0.55
          : Math.abs(u.lane - best.u.lane) <= (effect.radiusLane ?? effect.radius ?? 0)
            && Math.abs(u.col - best.u.col) <= (effect.radiusCol ?? effect.radius ?? 0))
        .reduce((sum, u) => sum + Math.min(u.hp, damage), 0);
      if ((best.hits >= 2 && returnValue >= Math.max(80, mpCost * 6)) || (emergency && best.u.hp <= damage)) {
        score = 6 + best.hits;
        target = { lane: Math.max(0, Math.min(4, Math.floor(best.u.lane))), col: Math.max(0, Math.min(11, Math.floor(best.u.col))) };
      }
    }
    if (score > 0) candidates.push({ skillId, target, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return;
  try {
    const choice = candidates[0];
    battle.castSkill(userId, choice);
    state.skillReadyAt = now + 12;
    const effect = getSkillEffect(choice.skillId);
    battle.__botEffectUntil.set(team + ':' + effect.kind, now + Math.max(5, effect.duration || effect.freezeSec || 0));
  } catch { /* 正常技能接口负责装备、MP、冷却及落点校验。 */ }
}

function candidateCols(team, movable, guard = false, stats = null) {
  const blue = team === 'blue';
  const columns = movable ? (blue ? [2, 1, 0] : [9, 10, 11])
    : guard ? (blue ? [4, 3, 2, 1, 0] : [7, 8, 9, 10, 11])
      : (blue ? [0, 1, 2, 3, 4] : [11, 10, 9, 8, 7]);
  if (!stats?.enemyNearBase) return columns;
  const nearest = blue ? Math.min(...stats.enemy.map(unit => Number(unit.col)))
    : Math.max(...stats.enemy.map(unit => Number(unit.col)));
  // 新单位落在基地与最靠近基地的敌人之间，不能放在突破者背后向外走。
  const intercept = columns.filter(col => blue ? col <= nearest : col >= nearest);
  if (!intercept.length) return [blue ? 0 : 11];
  if (guard || movable) return intercept.sort((a, b) => Math.abs(a - nearest) - Math.abs(b - nearest));
  return intercept;
}

function recordLane(state, lane) {
  state.laneHistory.push(Number(lane));
  if (state.laneHistory.length > 8) state.laneHistory.splice(0, state.laneHistory.length - 8);
  state.laneDeployCount[lane] = Number(state.laneDeployCount[lane] || 0) + 1;

  if (state.deployCount > 0 && state.deployCount % 16 === 0) {
    state.laneDeployCount = state.laneDeployCount.map((count) => Math.floor(Number(count) * 0.65));
  }
}

function trySmartDeploy(battle, userId, state) {
  const now = Number(battle.engine?.time) || 0;
  if (now < state.thinkAt) return false;
  // 等待出牌时也只按决策频率扫描战线，不在每个服务器 tick 重复遍历全场。
  state.thinkAt = now + 0.70 + Math.random() * 0.45;
  if (now < deploymentReadyAt(battle, userId, state)) return false;

  const choices = chooseDeployment(battle, userId, state);
  // 先尝试不同卡牌的最佳落点，避免前十个候选其实都是同一张失败卡。
  const firstByCard = new Map();
  for (const choice of choices) if (!firstByCard.has(choice.card.id)) firstByCard.set(choice.card.id, choice);
  const first = [...firstByCard.values()];
  const ordered = [...first, ...choices.filter(choice => firstByCard.get(choice.card.id) !== choice)];
  for (const choice of ordered.slice(0, 20)) {
    const { card, lane, col } = choice;
    state.smartDeployPermit = true;
    try {
      battle.deploy(userId, { cardId: Number(card.id), lane, col });
      state.lastDeployError = null;
      recordLane(state, lane);
      state.movingSinceFixed = isMovable(card) ? (state.movingSinceFixed || 0) + 1 : 0;
      return true;
    } catch (error) {
      // 不绕过校验、不扣负资源；当前候选失败时尝试另一个合法选择。
      state.lastDeployError = String(error?.message || error);
    } finally {
      state.smartDeployPermit = false;
    }
  }
  if (ordered.length && state.lastDeployError
      && (state.lastReportedDeployError !== state.lastDeployError || now >= (state.reportDeployErrorAt || 0))) {
    state.lastReportedDeployError = state.lastDeployError;
    state.reportDeployErrorAt = now + 30;
    console.warn('[pvp-bot] deploy rejected', {
      roomId: battle.roomId, userId, team: teamOfMember(battle, userId),
      time: Math.round(now), reason: state.lastDeployError,
    });
  }
  return false;
}

export function installPvpBotAi20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDeploy = PvpBattle.prototype.deploy;
  PvpBattle.prototype.deploy = function deployWithBotCooldown(userId, payload = {}) {
    if (!isBotUserId(userId)) return previousDeploy.call(this, userId, payload);

    const state = stateFor(this, userId);
    if (!state.smartDeployPermit) throw new Error('旧人机部署已由智能AI接管');

    const now = Number(this.engine?.time) || 0;
    const card = this.db?.getById?.(Number(payload.cardId));
    if (!card) throw new Error('人机卡牌不存在');
    if (now + 1e-6 < deploymentReadyAt(this, userId, state)) throw new Error('人机部署间隔中');
    if (now + 1e-6 < Number(state.cardReadyAt.get(Number(card.id)) || 0)) throw new Error('人机卡牌冷却中');

    const result = previousDeploy.call(this, userId, payload);

    // 同一张卡严格使用完整原始 CD；资源仍由 previousDeploy 真正扣除。
    state.cardReadyAt.set(Number(card.id), now + cardCooldown(card));
    // 每个人机常态间隔 12~18 秒，紧急防守最短 6 秒；资源和原始卡牌 CD 仍须满足。
    state.lastDeployAt = now;
    state.globalReadyAt = now + scaledDeployDelay(6.0 + Math.random() * 3.0);
    // 每个人机独立出牌；只扣自己的资源并使用自己的冷却。
    state.deployCount += 1;
    return result;
  };

  const previousTick = PvpBattle.prototype.tick;
  PvpBattle.prototype.tick = function tickWithSmarterBots(dt) {
    const result = previousTick.call(this, dt);
    if (this.status !== 'playing') return result;

    for (const member of [...this.teamBlue, ...this.teamRed]) {
      const userId = Number(member?.userId);
      if (!isBotUserId(userId)) continue;
      const state = stateFor(this, userId);
      // 各人机独立决策；单个技能配置/候选异常不能让其余人机停止行动。
      try { configureBotSkills(this, member, state); }
      catch (error) { state.lastSkillError = String(error?.message || error); }
      try { trySmartDeploy(this, userId, state); }
      catch (error) { state.lastDeployError = String(error?.message || error); }
      try { trySmartSkill(this, member, state); }
      catch (error) { state.lastSkillError = String(error?.message || error); }
    }
    return result;
  };
}

export const PVP_BOT_AI_TIMING_20260906 = Object.freeze({
  deployTimeScale: BOT_DEPLOY_TIME_SCALE_20260906,
  openingDelaySec: [3.0, 6.0],
  personalDeployDelaySec: [12.0, 18.0],
  emergencyDeployDelaySec: 6.0,
  teamDeployDelaySec: [0, 0],
});
