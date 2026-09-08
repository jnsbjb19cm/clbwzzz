import { authStore } from '../core/AuthStore.js';
import { HeroSkillStore } from '../core/HeroSkillStore.js';
import { DEFAULT_SKILL_LOADOUT } from '../core/SkillRegistry.js';
import { App } from './App.js';

const PATCH_FLAG = Symbol.for('clbwz.playerStateDatabaseBridge20260908');
const STORAGE_TO_STATE = new Map([
  ['clbwz_quest_v5', 'quest'],
  ['clbwz_hero_skills_v1', 'hero_skills'],
  ['clbwz_boss_progress_v1', 'boss_progress'],
  ['clbwz_worldmap_v1', 'worldmap'],
  ['clbwz_player_v1', 'player_meta'],
]);
const HERO_STORES = new Set();
const APPS = new Set();

function parseStored(raw) {
  try {
    const value = JSON.parse(String(raw || ''));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function applyHeroState(store, state) {
  if (!store || !state || typeof state !== 'object') return;
  const unlocked = Array.isArray(state.unlockedTalents)
    ? state.unlockedTalents.filter((id) => typeof id === 'string')
    : ['core'];
  if (!unlocked.includes('core')) unlocked.unshift('core');
  store.unlockedTalents = new Set(unlocked);
  store.consumedExtra = Math.max(0, Number(state.consumedExtra) || 0);
  const incoming = Array.isArray(state.loadout) ? state.loadout : DEFAULT_SKILL_LOADOUT;
  store.loadout = Array.from({ length: DEFAULT_SKILL_LOADOUT.length }, (_, index) => {
    const value = incoming[index];
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : (value == null ? null : DEFAULT_SKILL_LOADOUT[index] ?? null);
  });
}

function resetHeroState(store) {
  if (!store) return;
  store.unlockedTalents = new Set(['core']);
  store.consumedExtra = 0;
  store.loadout = [...DEFAULT_SKILL_LOADOUT];
}

function applyPlayerMeta(app, state) {
  if (!app?.player || !state || typeof state !== 'object') return;
  const allowed = ['buffs', 'extraTalentPoints', 'coupon', 'rank', 'guildName'];
  for (const key of allowed) {
    if (state[key] !== undefined) app.player[key] = state[key];
  }
}

function resetPlayerMeta(app) {
  if (!app?.player) return;
  for (const key of ['buffs', 'extraTalentPoints', 'coupon', 'rank', 'guildName']) delete app.player[key];
}

export function installPlayerStateDatabaseBridge20260908() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const storageProto = globalThis.Storage?.prototype;
  const originalSetItem = storageProto?.setItem;
  const originalRemoveItem = storageProto?.removeItem;
  const originalGetItem = storageProto?.getItem;

  if (storageProto && originalSetItem && originalGetItem) {
    storageProto.setItem = function setItemWithDatabaseMirror20260908(key, value) {
      const result = originalSetItem.call(this, key, value);
      if (this !== globalThis.localStorage) return result;
      const stateKey = STORAGE_TO_STATE.get(String(key));
      if (!stateKey || !authStore.isLoggedIn?.()) return result;
      const parsed = parseStored(value);
      if (!parsed) return result;
      void authStore.api.put(`/player/state/${stateKey}`, { state: parsed }).catch(() => {});
      return result;
    };
  }

  const originalHeroLoad = HeroSkillStore.prototype.load;
  HeroSkillStore.prototype.load = function loadWithDatabaseRegistration20260908() {
    const state = originalHeroLoad.call(this);
    HERO_STORES.add(this);
    return state;
  };

  const originalPlayerLoad = App.prototype.loadPlayer;
  App.prototype.loadPlayer = function loadPlayerWithDatabaseRegistration20260908() {
    const state = originalPlayerLoad.call(this);
    APPS.add(this);
    return state;
  };

  async function hydrateOne(storageKey, stateKey, { allowMigration }) {
    let remote = null;
    try {
      remote = await authStore.api.get(`/player/state/${stateKey}`);
    } catch {
      return;
    }
    if (remote?.state && typeof remote.state === 'object') {
      originalSetItem?.call(globalThis.localStorage, storageKey, JSON.stringify(remote.state));
      if (stateKey === 'hero_skills') HERO_STORES.forEach((store) => applyHeroState(store, remote.state));
      if (stateKey === 'player_meta') APPS.forEach((app) => applyPlayerMeta(app, remote.state));
      return;
    }

    const local = parseStored(originalGetItem?.call(globalThis.localStorage, storageKey));
    if (allowMigration && local) {
      try { await authStore.api.put(`/player/state/${stateKey}`, { state: local }); } catch {}
      if (stateKey === 'hero_skills') HERO_STORES.forEach((store) => applyHeroState(store, local));
      if (stateKey === 'player_meta') APPS.forEach((app) => applyPlayerMeta(app, local));
      return;
    }

    originalRemoveItem?.call(globalThis.localStorage, storageKey);
    if (stateKey === 'hero_skills') HERO_STORES.forEach(resetHeroState);
    if (stateKey === 'player_meta') APPS.forEach(resetPlayerMeta);
  }

  async function hydrateAll({ allowMigration = true } = {}) {
    for (const [storageKey, stateKey] of STORAGE_TO_STATE.entries()) {
      await hydrateOne(storageKey, stateKey, { allowMigration });
    }
  }

  for (const method of ['login', 'register', 'restore']) {
    const original = authStore[method]?.bind(authStore);
    if (!original) continue;
    authStore[method] = async (...args) => {
      const result = await original(...args);
      if (result) await hydrateAll({ allowMigration: method !== 'register' });
      return result;
    };
  }
}
