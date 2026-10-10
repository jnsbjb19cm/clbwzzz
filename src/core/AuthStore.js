import { ApiClient } from '../network/ApiClient.js';
// 2026-10-10：玩家数据按账号隔离（修「换号串数据」）—— 登录后立刻切到该账号的存储命名空间。
import { setPlayerStorageUser } from './PlayerStorage20261010.js';
// 2026-10-10：钻地单位规则要拿 token 之后才能跟服务端握手解密。
import { installBurrowCipher20261010 } from '../battle/BurrowCipher20261010.js';

const TOKEN_KEY = 'clbwz_auth_token_v1';
const NEW_PLAYER_TUTORIAL_PROMPT_KEY = 'clbwz_new_player_tutorial_prompt_v1';

export class AuthStore {
  constructor() {
    // 登录态只保留在当前浏览器会话：刷新页面仍可继续，关闭标签页/浏览器后重新进入必须登录。
    // 同时清掉旧版本留在 localStorage 的长期 token，避免升级后仍然自动登录。
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    try { this.token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch { this.token = ''; }
    this.user = null;
    this.snapshot = null;
    this.lastRecoveryCode = '';
    this.api = new ApiClient({ getToken: () => this.token });
  }

  isLoggedIn() { return Boolean(this.token); }

  setToken(token) {
    this.token = String(token || '');
    try {
      localStorage.removeItem(TOKEN_KEY);
      if (this.token) sessionStorage.setItem(TOKEN_KEY, this.token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  async register({ username, password, nickname }) {
    const data = await this.api.post('/auth/register', { username, password, nickname });
    this.setToken(data.token);
    this.user = data.user;
    // 必须在读任何玩家数据（快照 → 背包/卡牌/任务）之前切换命名空间。
    setPlayerStorageUser(data.user?.id);
    installBurrowCipher20261010();
    this.lastRecoveryCode = String(data.recoveryCode || '');
    this.snapshot = await this.api.get('/player/snapshot');
    try { sessionStorage.setItem(NEW_PLAYER_TUTORIAL_PROMPT_KEY, '1'); } catch {}
    return { user: this.user, snapshot: this.snapshot, recoveryCode: this.lastRecoveryCode };
  }

  async login({ username, password }) {
    const data = await this.api.post('/auth/login', { username, password });
    this.setToken(data.token);
    this.user = data.user;
    // 换号的关键一步：先把存储命名空间切到新账号，再去读快照/本地存档。
    setPlayerStorageUser(data.user?.id);
    installBurrowCipher20261010();
    this.lastRecoveryCode = String(data.recoveryCode || '');
    this.snapshot = await this.api.get('/player/snapshot');
    return { user: this.user, snapshot: this.snapshot, recoveryCode: this.lastRecoveryCode };
  }

  async resetPassword({ username, recoveryCode, newPassword }) {
    const data = await this.api.post('/auth/forgot-password/reset', {
      username,
      recoveryCode,
      newPassword,
    });
    this.lastRecoveryCode = String(data.recoveryCode || '');
    return data;
  }

  async restore() {
    if (!this.token) return null;
    try {
      // 刷新页面恢复登录态：先从快照拿到 user id，再切命名空间并重读玩家数据。
      this.snapshot = await this.api.get('/player/snapshot');
      this.user = { id: this.snapshot.profile.userId, nickname: this.snapshot.profile.nickname };
      setPlayerStorageUser(this.user.id);
      installBurrowCipher20261010();
      return { user: this.user, snapshot: this.snapshot };
    } catch (error) {
      if (error.status === 401) this.logout();
      throw error;
    }
  }

  logout() {
    this.setToken('');
    // 2026-10-10：登出后回到「未隔离」命名空间，下一个账号登录时就不会读到上一个号的存档。
    setPlayerStorageUser(null);
    this.user = null;
    this.snapshot = null;
    this.lastRecoveryCode = '';
  }
}

export { NEW_PLAYER_TUTORIAL_PROMPT_KEY };
export const authStore = new AuthStore();
