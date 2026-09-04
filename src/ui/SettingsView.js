import { audio } from '../core/AudioManager.js';
import { authStore } from '../core/AuthStore.js';

export class SettingsView {
  constructor() {
    this.api = authStore.api;
  }

  async render(root) {
    root.innerHTML = `
      <div style="max-width:520px;margin:20px auto;padding:20px;color:#fff;background:#101d10;border:1px solid #3a5a3a;border-radius:12px;">
        <h2 style="margin:0 0 16px;">设置</h2>
        <label style="display:block;margin:14px 0;">音乐音量
          <input id="setting-music" type="range" min="0" max="100" value="${Math.round(audio.volume * 100)}" style="width:100%;" />
        </label>
        <label style="display:block;margin:14px 0;">音效音量
          <input id="setting-sfx" type="range" min="0" max="100" value="${Math.round(audio.sfxVolume * 100)}" style="width:100%;" />
        </label>
        <label style="display:block;margin:14px 0;color:#bbb;">显示卡牌名称
          <input id="setting-names" type="checkbox" style="margin-left:8px;" ${authStore.snapshot?.settings?.showCardName === false ? '' : 'checked'} />
        </label>
        <button id="setting-mute" type="button" style="padding:8px 16px;border-radius:8px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">${audio.isMuted() ? '恢复声音' : '静音'}</button>
      </div>`;
    this.root = root;
    root.querySelector('#setting-music').addEventListener('input', (e) => {
      audio.volume = Number(e.target.value) / 100;
      if (audio.bgm) audio.bgm.volume = audio.volume;
    });
    root.querySelector('#setting-sfx').addEventListener('input', (e) => {
      audio.sfxVolume = Number(e.target.value) / 100;
    });
    root.querySelector('#setting-mute').addEventListener('click', (e) => {
      e.currentTarget.textContent = audio.toggleMute() ? '恢复声音' : '静音';
    });
    root.querySelector('#setting-names').addEventListener('change', async (e) => {
      const showCardName = e.target.checked;
      try {
        await this.api.put('/player/settings', { showCardName });
      } catch (error) {
        e.target.checked = !showCardName;
      }
    });
  }
}
