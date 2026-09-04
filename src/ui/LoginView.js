/**
 * 登录 / 注册界面(含取名)。
 *
 * - 首次进入显示注册(昵称取名 + 用户名 + 密码)，已有账号可切登录。
 * - 成功后写入 authStore(token + user + snapshot)，回调进入主城。
 */
import { authStore } from '../core/AuthStore.js';

export class LoginView {
  constructor({ onSuccess } = {}) {
    this.onSuccess = onSuccess;
    this.mode = 'login';
    this.busy = false;
  }

  render(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <h1 class="login-title">丛林保卫战</h1>
          <p class="login-sub">注册账号，取名加入对战房间</p>
          <div class="login-tabs">
            <button type="button" class="login-tab" data-mode="login">登录</button>
            <button type="button" class="login-tab" data-mode="register">注册(取名)</button>
          </div>
          <form id="login-form" autocomplete="off">
            <label class="login-field">
              <span>用户名(3 位以上)</span>
              <input id="login-username" type="text" maxlength="20" required />
            </label>
            <label class="login-field" id="login-nickname-wrap" hidden>
              <span>昵称(游戏中显示的名字)</span>
              <input id="login-nickname" type="text" maxlength="12" placeholder="输入你的名字…" />
            </label>
            <label class="login-field">
              <span>密码(6 位以上)</span>
              <input id="login-password" type="password" maxlength="32" required />
            </label>
            <div class="login-error" id="login-error"></div>
            <button type="submit" id="login-submit" class="login-submit">进入游戏</button>
          </form>
        </div>
      </div>`;

    this.root.querySelectorAll('.login-tab').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
    this.root.querySelector('#login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    this.setMode('register');
  }

  setMode(mode) {
    this.mode = mode;
    this.root.querySelectorAll('.login-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    this.root.querySelector('#login-nickname-wrap').hidden = mode !== 'register';
    this.root.querySelector('#login-submit').textContent =
      mode === 'register' ? '注册并进入' : '登录';
    this.setError('');
  }

  setError(text) {
    const el = this.root.querySelector('#login-error');
    if (el) el.textContent = text;
  }

  async submit() {
    if (this.busy) return;
    const username = this.root.querySelector('#login-username').value.trim();
    const password = this.root.querySelector('#login-password').value;
    const nickname = this.root.querySelector('#login-nickname').value.trim();
    if (username.length < 3) return this.setError('用户名至少 3 位');
    if (password.length < 6) return this.setError('密码至少 6 位');
    if (this.mode === 'register' && nickname.length < 1) {
      return this.setError('请先给自己取个名字');
    }

    this.busy = true;
    const btn = this.root.querySelector('#login-submit');
    btn.disabled = true;
    btn.textContent = '请稍候…';
    this.setError('');
    try {
      if (this.mode === 'register') {
        await authStore.register({ username, password, nickname });
      } else {
        await authStore.login({ username, password });
      }
      this.onSuccess?.();
    } catch (error) {
      this.setError(error.message || '操作失败');
      this.busy = false;
      btn.disabled = false;
      btn.textContent = this.mode === 'register' ? '注册并进入' : '登录';
    }
  }
}
