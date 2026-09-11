import { audio } from '../core/AudioManager.js';
import { authStore } from '../core/AuthStore.js';
import {
  FULLSCREEN_FX_SCALE_RANGE,
  GAME_SETTINGS_DEFAULTS,
  gameSettings,
} from '../core/GameSettingsStore20260910.js';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/**
 * 2026-09-10：设置页重做。
 *
 * 之前是一段内联样式的深绿小卡片，只有音量 / 显示卡牌名 / 静音；图鉴剪影、全屏特效大小
 * 这类开关根本没地方调。现在统一成游戏面板风格，并把客户端总设置（GameSettingsStore）
 * 里的项都放进来，改完立即生效、持久化在本地。
 */
export class SettingsView {
  constructor() {
    this.api = authStore.api;
    this.unsubscribe = null;
  }

  async render(root) {
    const settings = authStore.snapshot?.settings ?? {};
    const showCardName = settings.showCardName === false ? false : true;
    const silhouette = gameSettings.get('gallerySilhouetteUnowned') === true;
    const fxScale = Number(gameSettings.get('fullscreenFxScale')) || GAME_SETTINGS_DEFAULTS.fullscreenFxScale;

    root.innerHTML = `
      <div class="page settings-page settings-chrome-20260910">
        <section class="settings-panel">
          <h2 class="settings-title">设置</h2>

          <div class="settings-block">
            <h3>声音</h3>
            <label class="settings-row">音乐音量<input id="setting-music" type="range" min="0" max="100" value="${Math.round(audio.volume * 100)}" /></label>
            <label class="settings-row">音效音量<input id="setting-sfx" type="range" min="0" max="100" value="${Math.round(audio.sfxVolume * 100)}" /></label>
            <button id="setting-mute" type="button" class="settings-btn">${audio.isMuted() ? '恢复声音' : '静音'}</button>
          </div>

          <div class="settings-block">
            <h3>界面</h3>
            <label class="settings-row settings-row-check">显示卡牌名称<input id="setting-names" type="checkbox" ${showCardName ? 'checked' : ''} /></label>
            <label class="settings-row settings-row-check">图鉴：未获得的卡显示为剪影<input id="setting-gallery-silhouette" type="checkbox" ${silhouette ? 'checked' : ''} /></label>
            <p class="settings-hint">关闭时（默认）未获得的卡也正常显示立绘。</p>
          </div>

          <div class="settings-block">
            <h3>战斗表现</h3>
            <label class="settings-row">全屏技能特效大小<input id="setting-fx-scale" type="range" min="${FULLSCREEN_FX_SCALE_RANGE.min * 100}" max="${FULLSCREEN_FX_SCALE_RANGE.max * 100}" step="${FULLSCREEN_FX_SCALE_RANGE.step * 100}" value="${Math.round(fxScale * 100)}" /></label>
            <p class="settings-hint">当前 <b id="setting-fx-value">${Math.round(fxScale * 100)}%</b>：陨石雨 / 暴风雪这类全屏技能占战场的比例，越小越不挡视野。</p>
          </div>

          <div class="settings-actions">
            <button id="setting-reset" type="button" class="settings-btn settings-btn-ghost">恢复默认（界面与特效）</button>
          </div>
        </section>
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
      const next = e.target.checked;
      // 服务端这个接口是整行覆盖，必须把音量一起带上，否则会被写成 0（历史 bug）。
      try {
        await this.api.put('/player/settings', {
          showCardName: next,
          musicVolume: Math.round(audio.volume * 100),
          effectVolume: Math.round(audio.sfxVolume * 100),
        });
        if (authStore.snapshot) {
          authStore.snapshot.settings = { ...(authStore.snapshot.settings ?? {}), showCardName: next };
        }
      } catch {
        e.target.checked = !next;
      }
    });

    root.querySelector('#setting-gallery-silhouette').addEventListener('change', (e) => {
      gameSettings.set('gallerySilhouetteUnowned', e.target.checked);
    });

    const fxInput = root.querySelector('#setting-fx-scale');
    fxInput.addEventListener('input', (e) => {
      const percent = Number(e.target.value);
      const value = gameSettings.set('fullscreenFxScale', percent / 100);
      root.querySelector('#setting-fx-value').textContent = `${Math.round(value * 100)}%`;
    });

    root.querySelector('#setting-reset').addEventListener('click', () => {
      gameSettings.reset();
      this.render(root);
    });
  }
}
