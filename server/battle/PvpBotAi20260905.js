import { PvpBattle } from './PvpBattle.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpBotAi20260905');
const BOT_DECK_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 8, 9, 11, 15, 17, 19, 20, 21, 22, 25, 26, 30, 31, 32, 33, 35, 36, 37, 38]);

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
      startedAt: (Number(battle.engine?.time) || 0) + 2.2 + Math.random() * 0.9,
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

function chooseLane(battle, team, state, card) {
  const movable = isMovable(card);
  const recent = state.laneHistory.slice(-4);
  const lastLane = recent.at(-1);
  const previousLane = recent.at(-2);
  const sameLaneTwice = lastLane != null && lastLane === previousLane;
  const minDeployCount = Math.min(...state.laneDeployCount);

  const lanes = Array.from({ length: 5 }, (_, lane) => {
    const stats = laneStats(battle, team, lane);
    const recentHits = recent.filter((value) => value === lane).length;
    const underused = Math.max(0, state.laneDeployCount[lane] - minDeployCount);

    // 防守压力仍然优先，但不能无脑把所有兵堆到同一路。
    let score = stats.enemy.length * 1.45
      + stats.enemyMovable * 0.65
      + stats.enemyNearBase * 2.75
      - stats.ownMovable * 0.95
      - stats.ownFixed * 0.30
      - recentHits * 2.35
      - underused * 0.80
      + Math.random() * 1.35;

    // 可移动卡更鼓励走兵少的线路，形成多路推进。
    if (movable) {
      if (stats.ownMovable === 0) score += 2.4;
      else if (stats.ownMovable === 1) score += 0.7;
      if (state.laneDeployCount[lane] === minDeployCount) score += 1.1;
    }

    // 连续两次已经走同一路，第三次默认强烈避开；只有基地告急才允许继续补防。
    if (sameLaneTwice && lane === lastLane && stats.enemyNearBase < 2) score -= 8.0;

    // 如果某一路已经明显拥挤，也要主动分流。
    if (stats.own.length >= 5 && stats.enemyNearBase === 0) score -= 4.5;

    return { lane, score, urgent: stats.enemyNearBase >= 2 };
  });

  lanes.sort((a, b) => b.score - a.score);
  const best = lanes[0];
  if (!best) return Math.floor(Math.random() * 5);

  // 非紧急状态在前 3 条候选路线里留一点随机性，避免每局路线完全固定。
  if (!best.urgent) {
    const top = lanes.slice(0, 3);
    const roll = Math.random();
    if (roll > 0.72 && top[1]) return top[1].lane;
    if (roll > 0.92 && top[2]) return top[2].lane;
  }
  return best.lane;
}

function chooseCard(battle, userId, state) {
  const now = Number(battle.engine?.time) || 0;
  const team = teamOfMember(battle, userId);
  const ownSide = ownEngineSide(team);
  const ownMovableCount = (battle.engine.units ?? []).filter((u) => u.alive && u.team === ownSide && u.isMovable?.()).length;

  const legal = BOT_DECK_IDS
    .map((id) => battle.db?.getById?.(id))
    .filter(isDirectDeployCard)
    .filter((card) => card.name !== '石巨人' && card.card_name !== '石巨人')
    .filter((card) => cardQuality(card) <= 4)
    .filter((card) => now + 1e-6 >= Number(state.cardReadyAt.get(Number(card.id)) || 0))
    .filter((card) => affordable(battle, userId, card));

  if (!legal.length) return null;
  const movable = legal.filter(isMovable);
  const fixed = legal.filter((card) => !isMovable(card));
  const preferMovable = ownMovableCount < 2 ? 0.94 : ownMovableCount < 5 ? 0.78 : 0.64;
  let pool = Math.random() < preferMovable && movable.length ? movable : fixed.length ? fixed : movable;

  // 资源紧张时更偏向便宜卡，避免 AI 因连续抽到高费卡显得“发呆”。
  pool = [...pool].sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0));
  const pickWindow = Math.max(1, Math.ceil(pool.length * 0.55));
  return pool[Math.floor(Math.random() * pickWindow)] ?? pool[0];
}

function candidateCols(team, movable) {
  if (team === 'blue') {
    return movable ? [4, 3, 2, 1] : [0, 1, 2, 3];
  }
  return movable ? [7, 8, 9, 10] : [11, 10, 9, 8];
}

function recordLane(state, lane) {
  state.laneHistory.push(Number(lane));
  if (state.laneHistory.length > 8) state.laneHistory.splice(0, state.laneHistory.length - 8);
  state.laneDeployCount[lane] = Number(state.laneDeployCount[lane] || 0) + 1;

  // 长局中缓慢衰减历史计数，避免早期选择永久影响后续路线。
  if (state.deployCount > 0 && state.deployCount % 16 === 0) {
    state.laneDeployCount = state.laneDeployCount.map((count) => Math.floor(Number(count) * 0.65));
  }
}

function trySmartDeploy(battle, userId, state) {
  const now = Number(battle.engine?.time) || 0;
  if (now < state.startedAt || now < state.thinkAt || now < state.globalReadyAt) return false;
  state.thinkAt = now + 0.42 + Math.random() * 0.38;

  const card = chooseCard(battle, userId, state);
  if (!card) return false;
  const team = teamOfMember(battle, userId);
  const lane = chooseLane(battle, team, state, card);
  const cols = candidateCols(team, isMovable(card));
  const orderedCols = Math.random() < 0.35 ? [...cols].sort(() => Math.random() - 0.5) : cols;

  for (const col of orderedCols) {
    state.smartDeployPermit = true;
    try {
      battle.deploy(userId, { cardId: Number(card.id), lane, col });
      recordLane(state, lane);
      return true;
    } catch {
      // 换一个合法落点继续尝试；资源/CD不足会在下一轮思考时再试。
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
  PvpBattle.prototype.deploy = function deployWithBotSoftCooldown(userId, payload = {}) {
    if (!isBotUserId(userId)) return previousDeploy.call(this, userId, payload);

    const state = stateFor(this, userId);
    // registerPvpAuthorityHandlers 里还保留旧随机 AI。只允许本智能 AI 发起 bot 部署，
    // 这样不会出现“旧 AI + 新 AI”同时出兵、随机挤到同一路的问题。
    if (!state.smartDeployPermit) throw new Error('旧人机部署已由智能AI接管');

    const now = Number(this.engine?.time) || 0;
    const card = this.db?.getById?.(Number(payload.cardId));
    if (!card) throw new Error('人机卡牌不存在');
    if (now + 1e-6 < Number(state.globalReadyAt || 0)) throw new Error('人机部署间隔中');
    if (now + 1e-6 < Number(state.cardReadyAt.get(Number(card.id)) || 0)) throw new Error('人机卡牌冷却中');

    const result = previousDeploy.call(this, userId, payload);
    // 遵循真实资源；CD 使用原卡约 68%~78% 的软冷却，不锁得和真人完全一样。
    const softCd = Math.max(1.05, cardCooldown(card) * (0.68 + Math.random() * 0.10));
    state.cardReadyAt.set(Number(card.id), now + softCd);
    state.globalReadyAt = now + 0.82 + Math.random() * 0.48;
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
      trySmartDeploy(this, userId, state);
    }
    return result;
  };
}
