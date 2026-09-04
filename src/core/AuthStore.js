import { ApiClient } from '../network/ApiClient.js';

const TOKEN_KEY = 'clbwz_auth_token_v1';

export class AuthStore {
  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY) || '';
    this.user = null;
    this.snapshot = null;
    this.api = new ApiClient({ getToken: () => this.token });
  }

  isLoggedIn() { return Boolean(this.token); }

  setToken(token) {
    this.token = String(token || '');
    if (this.token) localStorage.setItem(TOKEN_KEY, this.token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async register({ username, password, nickname }) {
    const data = await this.api.post('/auth/register', { username, password, nickname });
    this.setToken(data.token);
    this.user = data.user;
    this.snapshot = await this.api.get('/player/snapshot');
    return { user: this.user, snapshot: this.snapshot };
  }

  async login({ username, password }) {
    const data = await this.api.post('/auth/login', { username, password });
    this.setToken(data.token);
    this.user = data.user;
    this.snapshot = await this.api.get('/player/snapshot');
    return { user: this.user, snapshot: this.snapshot };
  }

  async restore() {
    if (!this.token) return null;
    try {
      this.snapshot = await this.api.get('/player/snapshot');
      this.user = { id: this.snapshot.profile.userId, nickname: this.snapshot.profile.nickname };
      return { user: this.user, snapshot: this.snapshot };
    } catch (error) {
      if (error.status === 401) this.logout();
      throw error;
    }
  }

  logout() {
    this.setToken('');
    this.user = null;
    this.snapshot = null;
  }
}

export const authStore = new AuthStore();
