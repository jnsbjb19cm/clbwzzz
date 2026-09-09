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
      // 人机放卡节奏整体减半：开局观察时间也按同一倍率延长。
      startedAt: (Number(battle.engine?.time) || 0)
        + scaledDeployDelay(6.0 + Math.random() * 2.0),
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

function configureBotSkills(battle, member, state) {
  if (state.skillsConfigured) return;
  state.skillsConfigured = true;
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
  let best = null;
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
      const urgent = stats.enemyNearBase >= 2;
      if (!movable && !urgent && (personalFixed >= 2 || state.deployCount < 2 || (state.movingSinceFixed || 0) < 2)) continue;
      if (!movable && personalFixed >= 3) continue;
      if (guard && (defenders || !stats.enemy.length)) continue;
      if (healer && wounded < 2) continue;
      if (!urgent && ((cost.sun > 0 && resource.sun - cost.sun < 10) || (cost.food > 0 && resource.food - cost.food < 10))) continue;
      let score = stats.enemyNearBase * 8 + stats.enemy.length * 2 - stats.own.length * 1.2;
      score += movable ? (personalMoving < 3 ? 12 : 7) : (stats.enemy.length ? 0 : -12);
      if (flying) score += antiAir ? 12 + flying * 3 : -8;
      if (guard) score += !flying && threats > 0 && !defenders ? 8 : -9;
      if (healer) score += wounded >= 2 ? wounded * 5 : -18;
      if (traits.doubleVsDefender && stats.enemy.some(u => u.atkStyle === 1)) score += 8;
      if (card.id === 25 && stats.enemy.length >= 3) score += 7;
      if (stats.own.some(u => Number(u.cardId) === Number(card.id))) score -= 4;
      score += Math.min(4, Number(card.atk || 0) / 8) - (cost.sun + cost.food) * 0.06;
      score += Math.random() * 1.5;
      for (const col of candidateCols(team, movable, guard)) {
        if (!movable && (battle.engine.getUnitsAt?.(lane, col) || []).some(u => u.alive && !u.pvpNeutral && !u.isMovable?.())) continue;
        if (!best || score > best.score) best = { card, lane, col, score };
        break;
      }
    }
  }
  return best;
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

function candidateCols(team, movable, guard = false) {
  if (guard) return team === 'blue' ? [4, 3, 2, 1, 0] : [7, 8, 9, 10, 11];
  if (team === 'blue') {
    return movable ? [2, 1, 0] : [0, 1, 2, 3, 4];
  }
  return movable ? [9, 10, 11] : [11, 10, 9, 8, 7];
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
  if (
    now < state.startedAt
    || now < state.thinkAt
    || now < state.globalReadyAt
  ) return false;

  // 判断频率保持较快，保证人机仍会响应战线变化；真正出卡受独立部署间隔和原始卡牌 CD 限制。
  state.thinkAt = now + 0.70 + Math.random() * 0.45;

  const choice = chooseDeployment(battle, userId, state);
  if (!choice) return false;
  const { card, lane } = choice;
  const orderedCols = [choice.col];

  for (const col of orderedCols) {
    state.smartDeployPermit = true;
    try {
      battle.deploy(userId, { cardId: Number(card.id), lane, col });
      recordLane(state, lane);
      state.movingSinceFixed = isMovable(card) ? (state.movingSinceFixed || 0) + 1 : 0;
      return true;
    } catch {
      // 资源、CD 或位置不满足时，不透支、不强放，等下一轮正常判断。
    } finally {
      state.smartDeployPermit = false;
    }
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
    if (now + 1e-6 < Number(state.globalReadyAt || 0)) throw new Error('人机部署间隔中');
    if (now + 1e-6 < Number(state.cardReadyAt.get(Number(card.id)) || 0)) throw new Error('人机卡牌冷却中');

    const result = previousDeploy.call(this, userId, payload);

    // 同一张卡严格使用完整原始 CD；资源仍由 previousDeploy 真正扣除。
    state.cardReadyAt.set(Number(card.id), now + cardCooldown(card));
    // 每个人机至少间隔 12~18 秒；资源不足或原始卡牌 CD 未到继续等待。
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
      configureBotSkills(this, member, state);
      trySmartSkill(this, member, state);
      trySmartDeploy(this, userId, state);
    }
    return result;
  };
}

export const PVP_BOT_AI_TIMING_20260906 = Object.freeze({
  deployTimeScale: BOT_DEPLOY_TIME_SCALE_20260906,
  openingDelaySec: [12.0, 16.0],
  personalDeployDelaySec: [12.0, 18.0],
  teamDeployDelaySec: [0, 0],
});
