/**
 * 登录 / 注册 / 忘记密码。
 *
 * - 登录只填写账号和密码；注册时额外填写游戏昵称。
 * - 登录态仅持续当前浏览器会话，重新打开网站需要再次登录。
 * - 注册与老账号首次升级会展示一次恢复码；忘记密码使用“账号 + 恢复码”重置。
 */
import { authStore } from '../core/AuthStore.js';

export class LoginView {
  constructor({ onSuccess } = {}) {
    this.onSuccess = onSuccess;
    this.mode = 'login';
    this.busy = false;
    this.recoveryNext = 'game';
    this.pendingSuccessMeta = {};
  }

  render(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <h1 class="login-title">丛林保卫战</h1>
          <p class="login-sub" id="login-sub">登录账号进入魔幻森林</p>

          <div class="login-tabs" id="login-tabs">
            <button type="button" class="login-tab" data-mode="login">登录</button>
            <button type="button" class="login-tab" data-mode="register">注册</button>
          </div>

          <form id="login-form" autocomplete="off">
            <label class="login-field">
              <span>账号（3 位以上）</span>
              <input id="login-username" type="text" maxlength="20" autocomplete="username" required />
            </label>
            <label class="login-field" id="login-nickname-field" hidden>
              <span>游戏昵称（1～20 个字符）</span>
              <input id="login-nickname" type="text" maxlength="20" autocomplete="off" placeholder="给你的勇士取个名字" />
            </label>
            <label class="login-field">
              <span>密码（6 位以上）</span>
              <input id="login-password" type="password" maxlength="64" autocomplete="current-password" required />
            </label>
            <div class="login-error" id="login-error"></div>
            <button type="submit" id="login-submit" class="login-submit">登录</button>
            <button type="button" id="login-forgot" style="display:block;margin:10px auto 0;border:0;background:transparent;color:#476d2b;text-decoration:underline;cursor:pointer;font-size:13px;">忘记密码？</button>
          </form>

          <form id="login-reset-form" autocomplete="off" hidden>
            <label class="login-field">
              <span>账号</span>
              <input id="reset-username" type="text" maxlength="20" autocomplete="username" required />
            </label>
            <label class="login-field">
              <span>恢复码</span>
              <input id="reset-code" type="text" maxlength="32" autocomplete="off" placeholder="例如 ABCD-EFGH-IJKL" required />
            </label>
            <label class="login-field">
              <span>新密码（6 位以上）</span>
              <input id="reset-password" type="password" maxlength="64" autocomplete="new-password" required />
            </label>
            <label class="login-field">
              <span>再次输入新密码</span>
              <input id="reset-password-confirm" type="password" maxlength="64" autocomplete="new-password" required />
            </label>
            <div class="login-error" id="reset-error"></div>
            <button type="submit" id="reset-submit" class="login-submit">重置密码</button>
            <button type="button" id="reset-back" style="display:block;margin:10px auto 0;border:0;background:transparent;color:#476d2b;text-decoration:underline;cursor:pointer;font-size:13px;">返回登录</button>
          </form>

          <section id="login-recovery-panel" hidden style="margin-top:14px;padding:14px;border:1px solid rgba(88,112,47,.55);border-radius:10px;background:rgba(245,255,211,.82);text-align:left;">
            <h3 style="margin:0 0 8px;color:#38581f;font-size:16px;">请保存你的账号恢复码</h3>
            <p style="margin:0 0 10px;color:#50623e;font-size:12px;line-height:1.6;">以后忘记密码时，需要用它重置密码。恢复码只显示这一次，不会保存在浏览器里。</p>
            <div id="login-recovery-code" style="padding:10px;border-radius:8px;background:#fff;border:1px dashed #6c8b3a;color:#273b18;text-align:center;font:700 18px/1.2 monospace;letter-spacing:1px;user-select:text;"></div>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button type="button" id="login-recovery-copy" class="login-submit" style="flex:1;margin:0;">复制恢复码</button>
              <button type="button" id="login-recovery-confirm" class="login-submit" style="flex:1;margin:0;">我已保存</button>
            </div>
            <div class="login-error" id="recovery-tip" style="margin-top:6px;"></div>
          </section>
        </div>
      </div>`;

    this.root.querySelectorAll('.login-tab').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
    this.root.querySelector('#login-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
    this.root.querySelector('#login-forgot').addEventListener('click', () => this.setMode('reset'));
    this.root.querySelector('#reset-back').addEventListener('click', () => this.setMode('login'));
    this.root.querySelector('#login-reset-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submitReset();
    });
    this.root.querySelector('#login-recovery-copy').addEventListener('click', () => void this.copyRecoveryCode());
    this.root.querySelector('#login-recovery-confirm').addEventListener('click', () => {
      if (this.recoveryNext === 'game') this.onSuccess?.(this.pendingSuccessMeta || {});
      else this.setMode('login');
    });

    this.setMode('login');
  }

  setMode(mode) {
    this.mode = mode === 'register' || mode === 'reset' ? mode : 'login';
    const isReset = this.mode === 'reset';
    const isRegister = this.mode === 'register';
    const form = this.root.querySelector('#login-form');
    const resetForm = this.root.querySelector('#login-reset-form');
    const tabs = this.root.querySelector('#login-tabs');
    const recovery = this.root.querySelector('#login-recovery-panel');
    const nicknameField = this.root.querySelector('#login-nickname-field');
    const nicknameInput = this.root.querySelector('#login-nickname');

    if (form) form.hidden = isReset;
    if (resetForm) resetForm.hidden = !isReset;
    if (tabs) tabs.hidden = isReset;
    if (recovery) recovery.hidden = true;
    if (nicknameField) nicknameField.hidden = !isRegister;
    if (nicknameInput) nicknameInput.required = isRegister;

    this.root.querySelectorAll('.login-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.mode);
    });

    const submit = this.root.querySelector('#login-submit');
    const forgot = this.root.querySelector('#login-forgot');
    const password = this.root.querySelector('#login-password');
    if (submit) submit.textContent = isRegister ? '注册并进入' : '登录';
    if (forgot) forgot.hidden = this.mode !== 'login';
    if (password) password.autocomplete = isRegister ? 'new-password' : 'current-password';

    const sub = this.root.querySelector('#login-sub');
    if (sub) {
      sub.textContent = isReset
        ? '使用账号恢复码重置密码'
        : isRegister
          ? '创建账号，并给你的勇士取一个名字'
          : '登录账号进入魔幻森林';
    }
    this.setError('');
    this.setResetError('');
    this.busy = false;
  }

  setError(text) {
    const el = this.root.querySelector('#login-error');
    if (el) el.textContent = text;
  }

  setResetError(text) {
    const el = this.root.querySelector('#reset-error');
    if (el) el.textContent = text;
  }

  showRecoveryCode(code, next = 'game', successMeta = {}) {
    const recoveryCode = String(code || '').trim();
    this.pendingSuccessMeta = successMeta || {};
    if (!recoveryCode) {
      if (next === 'game') this.onSuccess?.(this.pendingSuccessMeta);
      else this.setMode('login');
      return;
    }
    this.recoveryNext = next;
    this.root.querySelector('#login-form').hidden = true;
    this.root.querySelector('#login-reset-form').hidden = true;
    this.root.querySelector('#login-tabs').hidden = true;
    const panel = this.root.querySelector('#login-recovery-panel');
    panel.hidden = false;
    this.root.querySelector('#login-recovery-code').textContent = recoveryCode;
    this.root.querySelector('#recovery-tip').textContent = '';
    const sub = this.root.querySelector('#login-sub');
    if (sub) sub.textContent = next === 'game' ? '账号创建完成' : '密码重置完成';
  }

  async copyRecoveryCode() {
    const text = this.root.querySelector('#login-recovery-code')?.textContent?.trim();
    if (!text) return;
    const tip = this.root.querySelector('#recovery-tip');
    try {
      await navigator.clipboard.writeText(text);
      if (tip) tip.textContent = '已复制，请保存到安全的位置。';
    } catch {
      if (tip) tip.textContent = '无法自动复制，请手动选中恢复码复制。';
    }
  }

  async submit() {
    if (this.busy) return;
    const username = this.root.querySelector('#login-username').value.trim();
    const password = this.root.querySelector('#login-password').value;
    const nickname = this.root.querySelector('#login-nickname')?.value?.trim() ?? '';
    if (username.length < 3) return this.setError('账号至少 3 位');
    if (password.length < 6) return this.setError('密码至少 6 位');
    if (this.mode === 'register' && (nickname.length < 1 || nickname.length > 20)) {
      return this.setError('游戏昵称需要 1～20 个字符');
    }

    this.busy = true;
    const btn = this.root.querySelector('#login-submit');
    btn.disabled = true;
    btn.textContent = '请稍候…';
    this.setError('');
    try {
      const isNewAccount = this.mode === 'register';
      const result = isNewAccount
        ? await authStore.register({ username, password, nickname })
        : await authStore.login({ username, password });
      this.busy = false;
      btn.disabled = false;
      const successMeta = { isNewAccount, nickname: result?.snapshot?.profile?.nickname ?? nickname };
      if (result?.recoveryCode) {
        this.showRecoveryCode(result.recoveryCode, 'game', successMeta);
      } else {
        this.onSuccess?.(successMeta);
      }
    } catch (error) {
      this.setError(error.message || '操作失败');
      this.busy = false;
      btn.disabled = false;
      btn.textContent = this.mode === 'register' ? '注册并进入' : '登录';
    }
  }

  async submitReset() {
    if (this.busy) return;
    const username = this.root.querySelector('#reset-username').value.trim();
    const recoveryCode = this.root.querySelector('#reset-code').value.trim();
    const newPassword = this.root.querySelector('#reset-password').value;
    const confirm = this.root.querySelector('#reset-password-confirm').value;

    if (username.length < 3) return this.setResetError('账号至少 3 位');
    if (recoveryCode.length < 8) return this.setResetError('请输入正确的恢复码');
    if (newPassword.length < 6) return this.setResetError('新密码至少 6 位');
    if (newPassword !== confirm) return this.setResetError('两次输入的新密码不一致');

    this.busy = true;
    const btn = this.root.querySelector('#reset-submit');
    btn.disabled = true;
    btn.textContent = '正在重置…';
    this.setResetError('');
    try {
      const result = await authStore.resetPassword({ username, recoveryCode, newPassword });
      this.busy = false;
      btn.disabled = false;
      btn.textContent = '重置密码';
      this.showRecoveryCode(result?.recoveryCode, 'login');
    } catch (error) {
      this.busy = false;
      btn.disabled = false;
      btn.textContent = '重置密码';
      this.setResetError(error.message || '密码重置失败');
    }
  }
}
