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

function chooseLane(battle, team) {
  const ownSide = ownEngineSide(team);
  const enemySide = ownSide === 'player' ? 'enemy' : 'player';
  const lanes = Array.from({ length: 5 }, (_, lane) => {
    const own = (battle.engine.units ?? []).filter((u) => u.alive && u.lane === lane && u.team === ownSide);
    const enemy = (battle.engine.units ?? []).filter((u) => u.alive && u.lane === lane && u.team === enemySide);
    const ownMovable = own.filter((u) => u.isMovable?.()).length;
    const ownFixed = own.length - ownMovable;
    const enemyMovable = enemy.filter((u) => u.isMovable?.()).length;
    const enemyNearBase = enemy.filter((u) => {
      const col = Number(u.col) || 0;
      return team === 'blue' ? col <= 4.5 : col >= 6.5;
    }).length;
    const score = enemy.length * 1.8 + enemyMovable * 0.7 + enemyNearBase * 2.4
      - ownMovable * 0.75 - ownFixed * 0.35 + Math.random() * 1.7;
    return { lane, score };
  });
  lanes.sort((a, b) => b.score - a.score);
  return lanes[0]?.lane ?? Math.floor(Math.random() * 5);
}

function chooseCard(battle, userId, state) {
  const now = Number(battle.engine?.time) || 0;
  const team = teamOfMember(battle, userId);
  const ownSide = ownEngineSide(team);
  const ownMovableCount = (battle.engine.units ?? []).filter((u) => u.alive && u.team === ownSide && u.isMovable?.()).length;

  const legal = BOT_DECK_IDS
    .map((id) => battle.db?.getById?.(id))
    .filter(Boolean)
    .filter((card) => card.name !== '石巨人' && card.card_name !== '石巨人')
    .filter((card) => cardQuality(card) <= 4)
    .filter((card) => now + 1e-6 >= Number(state.cardReadyAt.get(Number(card.id)) || 0))
    .filter((card) => affordable(battle, userId, card));

  if (!legal.length) return null;
  const movable = legal.filter(isMovable);
  const fixed = legal.filter((card) => !isMovable(card));
  const preferMovable = ownMovableCount < 2 ? 0.92 : 0.70;
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

function trySmartDeploy(battle, userId, state) {
  const now = Number(battle.engine?.time) || 0;
  if (now < state.startedAt || now < state.thinkAt || now < state.globalReadyAt) return false;
  state.thinkAt = now + 0.42 + Math.random() * 0.38;

  const card = chooseCard(battle, userId, state);
  if (!card) return false;
  const team = teamOfMember(battle, userId);
  const lane = chooseLane(battle, team);
  const cols = candidateCols(team, isMovable(card));
  const orderedCols = Math.random() < 0.35 ? [...cols].sort(() => Math.random() - 0.5) : cols;

  for (const col of orderedCols) {
    try {
      battle.deploy(userId, { cardId: Number(card.id), lane, col });
      return true;
    } catch {
      // 换一个合法落点继续尝试；资源/CD不足会在下一轮思考时再试。
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
    const now = Number(this.engine?.time) || 0;
    const card = this.db?.getById?.(Number(payload.cardId));
    if (!card) throw new Error('人机卡牌不存在');
    if (now + 1e-6 < Number(state.globalReadyAt || 0)) throw new Error('人机部署间隔中');
    if (now + 1e-6 < Number(state.cardReadyAt.get(Number(card.id)) || 0)) throw new Error('人机卡牌冷却中');

    const result = previousDeploy.call(this, userId, payload);
    // “遵循 CD，但不用卡得太死”：人机按原卡牌 CD 的约 72% 进入软冷却，并带一点随机扰动。
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
