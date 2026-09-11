/**
 * 2026-09-11：违规昵称强制整改。
 *
 * 上线（进入主城）时检查当前昵称：
 *  - 合规 → 什么都不做；
 *  - 违规 → 弹出不可关闭的改名弹窗，要求立刻改成合规昵称；
 *  - 玩家点「不修改」→ 调服务端兜底接口，把昵称改成「违规昵称+随机字符」。
 *
 * 服务端 `/player/rename` 在当前昵称违规时免费改名；`/player/moderation/nickname-fallback`
 * 负责兜底。这样客户端即使被绕过，服务端也保持权威。
 */
import { authStore } from '../core/AuthStore.js';
import { containsBlockedWord, validateNickname } from '../core/ContentFilter.js';

const OVERLAY_ID = 'forced-rename-overlay';
let busy = false;

function applyNickname(nickname) {
  const value = String(nickname || '').trim();
  if (authStore.snapshot?.profile) authStore.snapshot.profile.nickname = value;
  if (authStore.user) authStore.user.nickname = value;
  try {
    window.dispatchEvent(new CustomEvent('clbwz:nickname-changed', { detail: { nickname: value } }));
  } catch {
    /* ignore */
  }
}

function closeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
  busy = false;
}

function buildOverlay(currentNickname) {
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(10,14,8,.9);display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="width:min(460px,94vw);box-sizing:border-box;background:linear-gradient(180deg,#fffaea,#ecd9ab 72%,#e0c893);border:3px solid #8a5a20;border-radius:14px;padding:18px;color:#3a2a12;box-shadow:0 14px 30px rgba(0,0,0,.55);">
      <h2 style="margin:0 0 8px;font-size:20px;text-align:center;color:#7a1f12;">昵称包含违规词汇</h2>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#5b451f;">
        当前昵称「<b>${currentNickname}</b>」包含低俗/色情/涉政等违规词汇，必须立即修改后才能继续游戏。
        如果不修改，系统将自动把你的昵称改为「违规昵称+随机字符」。
      </p>
      <label style="display:block;font-size:13px;font-weight:700;margin-bottom:6px;">新昵称（1~20 个字符）</label>
      <input id="forced-rename-input" maxlength="20" autocomplete="off" placeholder="输入新的游戏昵称"
        style="width:100%;box-sizing:border-box;padding:9px 11px;border:2px solid #a9803c;border-radius:8px;background:#fff;color:#2f2410;font-size:14px;" />
      <div id="forced-rename-msg" style="min-height:18px;margin-top:6px;color:#b02a1a;font-size:12px;"></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:8px;">
        <button type="button" id="forced-rename-confirm" style="padding:9px 22px;border:2px solid #5f7a2a;border-radius:10px;background:linear-gradient(180deg,#e6f5b4,#a9d264);color:#23310f;font-weight:800;cursor:pointer;">立即修改</button>
        <button type="button" id="forced-rename-skip" style="padding:9px 22px;border:2px solid #a9803c;border-radius:10px;background:linear-gradient(180deg,#fff6dc,#e2cd9b);color:#5b451f;font-weight:800;cursor:pointer;">不修改（自动改名）</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#forced-rename-input');
  const msg = overlay.querySelector('#forced-rename-msg');
  const confirmBtn = overlay.querySelector('#forced-rename-confirm');
  const skipBtn = overlay.querySelector('#forced-rename-skip');
  input.focus();

  confirmBtn.addEventListener('click', async () => {
    if (busy) return;
    const nickname = String(input.value || '').trim();
    const check = validateNickname(nickname);
    if (!check.ok) { msg.textContent = check.message; return; }
    busy = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = '提交中…';
    try {
      const data = await authStore.api.post('/player/rename', { nickname });
      applyNickname(data?.nickname ?? nickname);
      closeOverlay();
      window.dispatchEvent(new CustomEvent('clbwz:system-announcement', {
        detail: { title: '系统', text: `昵称已修改为「${data?.nickname ?? nickname}」` },
      }));
    } catch (error) {
      msg.textContent = error?.message || '改名失败，请重试';
      busy = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = '立即修改';
    }
  });

  skipBtn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    skipBtn.disabled = true;
    skipBtn.textContent = '处理中…';
    try {
      const data = await authStore.api.post('/player/moderation/nickname-fallback', {});
      applyNickname(data?.nickname ?? '');
      closeOverlay();
    } catch (error) {
      msg.textContent = error?.message || '自动改名失败，请重试';
      busy = false;
      skipBtn.disabled = false;
      skipBtn.textContent = '不修改（自动改名）';
    }
  });

  return overlay;
}

/** 检查并在需要时弹出强制改名；返回是否弹了。 */
export function enforceNicknameCompliance20260911() {
  if (typeof document === 'undefined') return false;
  const nickname = authStore.snapshot?.profile?.nickname ?? authStore.user?.nickname ?? '';
  if (!nickname || !containsBlockedWord(nickname)) return false;
  buildOverlay(nickname);
  return true;
}
