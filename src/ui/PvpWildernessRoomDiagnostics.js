import { CardDatabase } from '../core/CardDatabase.js';
import { CardInventoryStore } from '../core/CardInventoryStore.js';
import { HeroSkillStore } from '../core/HeroSkillStore.js';
import { getSkillCooldownSec, getSkillEffect, getSkillMpCost } from '../core/SkillRegistry.js';
import { RoomView } from './RoomView.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpWildernessRoomDiagnostics');

function fixtureRoom() {
  return {
    id: 17,
    name: '野外PVP测试房间',
    mode: 'pvp',
    size: '3v3',
    maxTeamSize: 3,
    mapId: '4',
    allowUnbalanced: false,
    status: 'battling',
    members: [
      {
        userId: 1,
        nickname: '蓝方房主',
        level: 18,
        team: 'blue',
        ready: false,
        connected: true,
        isHost: true,
        selectedDeckNo: 1,
        joinOrder: 1,
      },
      {
        userId: 2,
        nickname: '红方玩家',
        level: 16,
        team: 'red',
        ready: true,
        connected: true,
        isHost: false,
        selectedDeckNo: 1,
        joinOrder: 2,
      },
    ],
    chat: [{ nickname: '红方玩家', text: '准备完成' }],
  };
}

function createData() {
  const db = new CardDatabase();
  const inventory = new CardInventoryStore(db);
  if (inventory.getUsedCount() === 0) inventory.grantAllCollectibleCards();
  const heroSkills = new HeroSkillStore(db);
  return { db, inventory, heroSkills };
}

function neutralIceUnits() {
  const result = [];
  for (let lane = 0; lane < 5; lane += 1) {
    for (const col of [5, 6]) {
      result.push({
        uid: 900000 + lane * 2 + (col - 5),
        cardId: 1000,
        res: 1000,
        team: 'neutral',
        neutral: true,
        lane,
        col,
        velocityCol: 0,
        velocityLane: 0,
        hp: 1400,
        maxHp: 1400,
        atk: 0,
        state: 'default',
        animState: 'default',
        animUntil: 9999,
        attackToken: 0,
        jumpToken: 0,
        forcedToken: 0,
        attackingBase: false,
      });
    }
  }
  return result;
}

function socketStub(room, db) {
  const handlers = new Map();
  let seq = 0;
  let visualEventSeq = 0;
  const units = neutralIceUnits();
  const visualEvents = [];
  const resources = { sun: 15, food: 12 };
  const skill = {
    loadout: [503, 504, 505, null, null, null],
    mp: 100,
    maxMp: 100,
    cooldowns: {},
  };

  const emitLocal = (event, payload) => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };

  const snapshot = () => ({
    protocol: 'server-authoritative-v3',
    seq: ++seq,
    serverNow: Date.now(),
    viewerUserId: 1,
    viewerTeam: 'blue',
    t: seq / 20,
    status: 'playing',
    winner: null,
    heroHp: { blue: 3000, red: 3000 },
    heroMaxHp: { blue: 3000, red: 3000 },
    resources: { ...resources },
    skill: {
      loadout: [...skill.loadout],
      mp: skill.mp,
      maxMp: skill.maxMp,
      cooldowns: { ...skill.cooldowns },
    },
    energy: { blue: resources.sun, red: 0 },
    players: room.members.map((member) => ({
      userId: member.userId,
      nickname: member.nickname,
      team: member.team,
    })),
    neutralIce: { cardId: 1000, columns: [5, 6], lanes: 5 },
    visualEvents: visualEvents.map((event) => ({ ...event })),
    specialAuditVersion: 'pvp-specials-v4',
    units: units.map((unit) => ({ ...unit })),
    projectiles: [],
  });

  const publishSnapshot = () => {
    const next = snapshot();
    emitLocal('pvp:authority:snapshot', next);
    return next;
  };

  const addFixtureDeploy = (payload = {}) => {
    const team = String(payload.team || 'blue');
    const canonicalTeam = team === 'red' ? 'enemy' : 'player';
    const incomingCol = Number(payload.col) || 0;
    const canonicalCol = team === 'red' ? 11 - incomingCol : incomingCol;
    units.push({
      uid: 100000 + units.length + 1,
      cardId: Number(payload.cardId) || 1,
      res: Number(payload.cardId) || 1,
      team: canonicalTeam,
      neutral: false,
      lane: Math.max(0, Math.min(4, Number(payload.lane) || 0)),
      col: Math.max(0, Math.min(11, canonicalCol)),
      velocityCol: canonicalTeam === 'player' ? 0.4 : -0.4,
      velocityLane: 0,
      hp: 100,
      maxHp: 100,
      atk: 10,
      state: 'moving',
      animState: 'moving',
      animUntil: seq / 20 + 0.3,
      attackToken: 0,
      jumpToken: 0,
      forcedToken: 0,
      attackingBase: false,
    });
    return publishSnapshot();
  };

  return {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {
        const current = handlers.get(event) ?? [];
        handlers.set(event, current.filter((item) => item !== handler));
      };
    },
    async emitAck(event, payload = {}) {
      if (event === 'pvp:authority:join') {
        return {
          snapshot: snapshot(),
          userId: 1,
          team: 'blue',
          protocol: 'server-authoritative-v3',
        };
      }
      if (event === 'pvp:authority:set-loadout') {
        if (Array.isArray(payload.loadout)) {
          skill.loadout = Array.from({ length: 6 }, (_, index) => Number(payload.loadout[index]) || null);
        }
        skill.maxMp = Math.max(100, Number(payload.maxMp) || 100);
        skill.mp = Math.min(skill.mp, skill.maxMp);
        return { skill: { ...skill }, snapshot: publishSnapshot() };
      }
      if (event === 'pvp:authority:deploy') {
        return { snapshot: addFixtureDeploy({ ...payload, team: 'blue' }) };
      }
      if (event === 'pvp:authority:cast-skill') {
        const skillId = Number(payload.skillId);
        if (!skill.loadout.includes(skillId)) throw new Error('该技能未装备');
        const card = db.getById(skillId);
        const mpCost = getSkillMpCost(card);
        if (skill.mp < mpCost) throw new Error('MP不足');
        skill.mp -= mpCost;
        skill.cooldowns[skillId] = getSkillCooldownSec(card);
        const result = {
          id: ++visualEventSeq,
          userId: 1,
          team: 'blue',
          skillId,
          effectKind: getSkillEffect(skillId)?.kind ?? null,
          target: payload.target ?? null,
          startedAt: seq / 20,
          duration: 1.2,
          direction: 1,
        };
        visualEvents.push({ ...result, kind: 'skill' });
        emitLocal('pvp:authority:skill-cast', result);
        return { result, snapshot: publishSnapshot() };
      }
      return { ok: true };
    },
    setDeck: async () => room,
    setReady: async (ready) => {
      room.members[1].ready = Boolean(ready);
      return room;
    },
    startGame: async () => room,
    switchTeam: async () => room,
    changeMap: async (mapId) => {
      room.mapId = String(mapId);
      return room;
    },
    setRule: async (value) => {
      room.allowUnbalanced = Boolean(value);
      return room;
    },
    kick: async () => room,
    sendChat: async () => ({}),
    sendPvpDeploy: async () => ({ ok: true }),
    leaveRoom: async () => null,
    disconnect() {},
    emitFixture(event, payload) {
      if (event === 'pvp:deploy') {
        addFixtureDeploy(payload);
        return;
      }
      if (event === 'pvp:authority:skill-cast') {
        const result = {
          id: ++visualEventSeq,
          kind: 'skill',
          effectKind: getSkillEffect(Number(payload.skillId))?.kind ?? null,
          startedAt: seq / 20,
          duration: 1.2,
          ...payload,
        };
        visualEvents.push(result);
        emitLocal(event, result);
        publishSnapshot();
        return;
      }
      emitLocal(event, payload);
    },
    getSnapshot() {
      return snapshot();
    },
  };
}

function ensureFixtureRoot() {
  document.querySelector('#pvp-wilderness-fixture')?.remove();
  const root = document.createElement('div');
  root.id = 'pvp-wilderness-fixture';
  root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#102a18;';
  root.innerHTML = '<div id="lobby-room-inside"></div><div id="lobby-battle" class="hidden"></div>';
  document.body.append(root);
  return root;
}

export function installPvpWildernessRoomDiagnostics() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  window.__renderPvpWildernessRoomFixture = () => {
    window.__pvpFixtureBattle?.destroy?.();
    const { db, inventory } = createData();
    const room = fixtureRoom();
    room.status = 'waiting';
    const root = ensureFixtureRoot();
    const view = new RoomView(db, { cardInventory: inventory, onNavigate: () => {} });
    view.root = root;
    view.room = room;
    view.myTeam = 'blue';
    view.currentUserId = () => 1;
    view.socket = socketStub(room, db);
    view.notice = () => {};
    view.renderRoomInside();
    window.__pvpFixtureView = view;
    return window.__verifyPvpWildernessRoomFinal?.();
  };

  window.__renderPvpWildernessBattleFixture = async (options = {}) => {
    const { db, inventory, heroSkills } = createData();
    const root = ensureFixtureRoot();
    root.innerHTML = '<div id="battle-fixture-root" style="position:absolute;inset:0"></div>';
    const target = root.querySelector('#battle-fixture-root');
    const room = fixtureRoom();
    room.mapId = String(options.mapId ?? room.mapId);
    const socket = socketStub(room, db);
    const deckSlots = inventory.getSlots()
      .map((slot, index) => (slot ? index : -1))
      .filter((index) => index >= 0)
      .slice(0, 10);
    const battle = new BattleView(db, {
      cardInventory: inventory,
      heroSkills,
      pvp: { roomId: room.id, team: 'blue', socket, deckSlots, mapId: room.mapId },
      onNavigate: () => {},
    });
    await battle.render(target);
    window.__pvpFixtureBattle = battle;
    window.__pvpFixtureSocket = socket;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      bridge: window.__verifyPvpBattleBridgeFinal?.(),
      authority: window.__verifyPvpAuthoritySyncFinal?.(),
      combatPolish: window.__verifyPvpCombatPolishFinal?.(),
      enginePvp: battle.engine?.pvp === true,
      waveNumber: battle.engine?.waveNumber ?? null,
      deckCount: battle.engine?.deck?.length ?? 0,
      sharedSocket: battle.pvpSocket === socket,
      skillLoadout: [...(battle.engine?.skillLoadout ?? [])],
      skillCount: (battle.engine?.skillLoadout ?? []).filter(Boolean).length,
      authorityActive: Boolean(battle.__pvpAuthorityActive),
      resources: {
        sun: battle.engine?.sunlight ?? null,
        food: battle.engine?.food ?? null,
      },
      mp: battle.engine?.heroMp ?? null,
      neutralIce: battle.engine?.units?.filter((unit) => unit.pvpNeutral).length ?? 0,
    };
  };

  window.__destroyPvpWildernessFixture = () => {
    window.__pvpFixtureBattle?.destroy?.();
    window.__pvpFixtureBattle = null;
    window.__pvpFixtureSocket = null;
    if (window.__pvpFixtureView) {
      window.__pvpFixtureView.room = null;
      window.__pvpFixtureView.destroy?.();
    }
    window.__pvpFixtureView = null;
    document.querySelector('#pvp-wilderness-fixture')?.remove();
    document.body.classList.remove('pvp-battle-active', 'battle-immersive');
  };
}
