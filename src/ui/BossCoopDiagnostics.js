import { CardDatabase } from '../core/CardDatabase.js';
import { CardInventoryStore } from '../core/CardInventoryStore.js';
import { HeroSkillStore } from '../core/HeroSkillStore.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.bossCoopDiagnostics');

function createData() {
  const db = new CardDatabase();
  const inventory = new CardInventoryStore(db);
  if (inventory.getUsedCount() === 0) inventory.grantAllCollectibleCards();
  const heroSkills = new HeroSkillStore(db);
  return { db, inventory, heroSkills };
}

function bossSocketStub() {
  const handlers = new Map();
  let seq = 0;
  const resources = { sun: 15, food: 12 };
  const skill = {
    loadout: [503, 504, 505, null, null, null],
    mp: 100,
    maxMp: 100,
    cooldowns: {},
  };
  const visualEvents = [];
  const units = [
    {
      uid: 700001,
      cardId: 75,
      res: 75,
      team: 'enemy',
      lane: 3,
      col: 10,
      hp: 5000,
      maxHp: 5000,
      atk: 22,
      state: 'idle',
      animState: 'default',
      attackingBase: false,
      boss: true,
      commanderOnly: true,
      bossScale: 4.5,
      velocityCol: 0,
      velocityLane: 0,
      attackToken: 0,
      jumpToken: 0,
      forcedToken: 0,
    },
  ];

  const emitLocal = (event, payload) => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };
  const snapshot = () => ({
    mode: 'boss',
    protocol: 'server-authoritative-boss-v2',
    seq: ++seq,
    serverNow: Date.now(),
    viewerUserId: 1,
    viewerTeam: 'blue',
    t: seq / 20,
    status: 'playing',
    winner: null,
    title: '痴情的多特：',
    boss: {
      id: 'boss_dot',
      name: '痴情的多特',
      difficulty: '简单',
      cardId: 75,
      hp: units[0].hp,
      maxHp: 5000,
      atk: 22,
      lane: 3,
      col: 10,
      commanderOnly: true,
      displayScale: 4.5,
    },
    heroHp: { blue: 3000, red: units[0].hp },
    heroMaxHp: { blue: 3000, red: 5000 },
    resources: { ...resources },
    skill: {
      loadout: [...skill.loadout],
      mp: skill.mp,
      maxMp: skill.maxMp,
      cooldowns: { ...skill.cooldowns },
    },
    energy: { blue: resources.sun, red: 0 },
    players: [
      { userId: 1, nickname: '房主', team: 'blue' },
      { userId: 2, nickname: '队友', team: 'blue' },
    ],
    units: units.map((unit) => ({ ...unit })),
    projectiles: [],
    visualEvents: visualEvents.map((event) => ({ ...event })),
    coopBossVersion: 'coop-boss-v2',
  });

  return {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => handlers.set(event, (handlers.get(event) ?? []).filter((item) => item !== handler));
    },
    async emitAck(event, payload = {}) {
      if (event === 'pvp:authority:join') {
        const next = snapshot();
        emitLocal('pvp:authority:snapshot', next);
        return { snapshot: next, userId: 1, team: 'blue', protocol: next.protocol };
      }
      if (event === 'pvp:authority:set-loadout') {
        if (Array.isArray(payload.loadout)) {
          skill.loadout = Array.from({ length: 6 }, (_, index) => Number(payload.loadout[index]) || null);
        }
        return { skill: { ...skill }, snapshot: snapshot() };
      }
      if (event === 'pvp:authority:deploy') {
        resources.sun = Math.max(0, resources.sun - 1);
        units.push({
          uid: 700000 + units.length + 1,
          cardId: Number(payload.cardId) || 1,
          res: Number(payload.cardId) || 1,
          team: 'player',
          lane: Number(payload.lane) || 0,
          col: Number(payload.col) || 0,
          hp: 100,
          maxHp: 100,
          atk: 10,
          state: 'idle',
          animState: 'default',
          attackingBase: false,
          velocityCol: 0,
          velocityLane: 0,
          attackToken: 0,
          jumpToken: 0,
          forcedToken: 0,
        });
        const next = snapshot();
        emitLocal('pvp:authority:snapshot', next);
        return { snapshot: next };
      }
      if (event === 'pvp:authority:cast-skill') {
        const result = {
          id: ++seq,
          kind: 'skill',
          userId: 1,
          team: 'blue',
          skillId: Number(payload.skillId),
          target: payload.target ?? null,
          startedAt: seq / 20,
          duration: 1,
        };
        visualEvents.push(result);
        emitLocal('pvp:authority:skill-cast', result);
        return { result, snapshot: snapshot() };
      }
      return { ok: true, snapshot: snapshot() };
    },
    emitFixture(event, payload) {
      emitLocal(event, payload);
    },
    emitBossSkill(skillId = 539) {
      const result = {
        id: ++seq,
        kind: 'boss-skill',
        userId: null,
        team: 'red',
        skillId: Number(skillId),
        startedAt: seq / 20,
        duration: 1,
      };
      visualEvents.push(result);
      emitLocal('pvp:authority:snapshot', snapshot());
      return result;
    },
    spawnMinion(cardId = 5, lane = 0, col = 10) {
      units.push({
        uid: 700000 + units.length + 1,
        cardId: Number(cardId),
        res: Number(cardId),
        team: 'enemy',
        lane,
        col,
        hp: 100,
        maxHp: 100,
        atk: 10,
        state: 'moving',
        animState: 'moving',
        attackingBase: false,
        boss: false,
        bossMinion: true,
        velocityCol: -0.2,
        velocityLane: 0,
        attackToken: 0,
        jumpToken: 0,
        forcedToken: 0,
      });
      const next = snapshot();
      emitLocal('pvp:authority:snapshot', next);
      return next;
    },
    getSnapshot() {
      return snapshot();
    },
    disconnect() {},
  };
}

function ensureRoot() {
  document.querySelector('#boss-coop-fixture')?.remove();
  const root = document.createElement('div');
  root.id = 'boss-coop-fixture';
  root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#102a18;';
  document.body.append(root);
  return root;
}

export function installBossCoopDiagnostics() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  window.__renderBossCoopBattleFixture = async () => {
    window.__bossCoopFixtureBattle?.destroy?.();
    const { db, inventory, heroSkills } = createData();
    const root = ensureRoot();
    const socket = bossSocketStub();
    const deckSlots = inventory.getSlots()
      .map((slot, index) => (slot ? index : -1))
      .filter((index) => index >= 0)
      .slice(0, 10);
    const battle = new BattleView(db, {
      cardInventory: inventory,
      heroSkills,
      pvp: {
        mode: 'boss',
        roomId: 77,
        room: {
          id: 77,
          mode: 'boss',
          name: '痴情的多特：',
          bossId: 'boss_dot',
          difficulty: '简单',
        },
        team: 'blue',
        socket,
        deckSlots,
        mapId: '4',
        bossId: 'boss_dot',
        difficulty: '简单',
      },
      onNavigate: () => {},
    });
    await battle.render(root);
    window.__bossCoopFixtureBattle = battle;
    window.__bossCoopFixtureSocket = socket;
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      bridge: window.__verifyBossCoopBridgeFinal?.(),
      presentation: window.__verifyBattlePresentationCompletion20260811?.(),
      authorityActive: Boolean(battle.__pvpAuthorityActive),
      mode: battle.__pvpLatestSnapshot?.mode ?? null,
      boss: battle.__pvpLatestSnapshot?.boss ?? null,
      bossUnits: battle.engine.units.filter((unit) => unit.pvpBoss || unit.isBoss || unit.cardId === 75).length,
      players: document.querySelectorAll('.coop-boss-battle .pvp-column-player').length,
      wave: battle.engine.waveNumber,
      title: document.querySelector('.coop-boss-battle .immersive-stage')?.textContent ?? null,
    };
  };

  window.__destroyBossCoopBattleFixture = () => {
    window.__bossCoopFixtureBattle?.destroy?.();
    window.__bossCoopFixtureBattle = null;
    window.__bossCoopFixtureSocket = null;
    document.querySelector('#boss-coop-fixture')?.remove();
    document.body.classList.remove('pvp-battle-active', 'battle-immersive', 'boss-coop-active');
  };
}
