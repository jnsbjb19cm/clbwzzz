import { audio } from '../core/AudioManager.js';
import { authStore } from '../core/AuthStore.js';
import {
  FULLSCREEN_FX_SCALE_RANGE,
  GAME_SETTINGS_DEFAULTS,
  gameSettings,
} from '../core/GameSettingsStore20260910.js';
import {
  readBagAutoOrganizeFlag,
  readLowQualityFlag,
  readUnitNameFlag,
  setBagAutoOrganizeFlag,
  setLowQualityFlag,
  setUnitNameFlag,
} from '../core/BattleClientFlags20260910.js';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/**
 * 2026-09-10：设置页重做（第二版）。
 *
 * 上一版只有音量 / 卡名 / 静音 + 图鉴剪影 + 特效大小，功能太少。这一版按「有没有真实读取点」
 * 补上：战斗内显示单位名字、低画质模式、背包自动整理，以及两个危险操作（重看教程 / 重置本机
 * 试玩数据）。这些开关都直接读写战斗与背包代码真正读取的 localStorage 键（见
 * BattleClientFlags20260910.js），不是摆设。
 *
 * 危险操作走游戏内弹窗二次确认，不用浏览器 confirm（和铁匠铺保持一致）。
 */
export class SettingsView {
  constructor() {
    this.api = authStore.api;
  }

  async render(root) {
    const settings = authStore.snapshot?.settings ?? {};
    const showCardName = settings.showCardName === false ? false : true;
    const silhouette = gameSettings.get('gallerySilhouetteUnowned') === true;
    const fxScale = Number(gameSettings.get('fullscreenFxScale')) || GAME_SETTINGS_DEFAULTS.fullscreenFxScale;
    const unitNames = readUnitNameFlag();
    const lowQuality = readLowQualityFlag();
    const bagAuto = readBagAutoOrganizeFlag();

    root.innerHTML = `
      <div class="page gset-page gset-chrome">
        <section class="gset-panel">
          <h2 class="gset-title">设置</h2>

          <div class="gset-block">
            <h3>声音</h3>
            <label class="gset-row">音乐音量<input id="setting-music" type="range" min="0" max="100" value="${Math.round(audio.volume * 100)}" /></label>
            <label class="gset-row">音效音量<input id="setting-sfx" type="range" min="0" max="100" value="${Math.round(audio.sfxVolume * 100)}" /></label>
            <div class="gset-actions gset-actions-inline">
              <button id="setting-mute" type="button" class="gset-btn">${audio.isMuted() ? '恢复声音' : '静音'}</button>
            </div>
          </div>

          <div class="gset-block">
            <h3>界面</h3>
            <label class="gset-row gset-row-check">显示卡牌名称<input id="setting-names" type="checkbox" ${showCardName ? 'checked' : ''} /></label>
            <label class="gset-row gset-row-check">图鉴：未获得的卡显示为剪影<input id="setting-gallery-silhouette" type="checkbox" ${silhouette ? 'checked' : ''} /></label>
            <label class="gset-row gset-row-check">背包自动整理<input id="setting-bag-auto" type="checkbox" ${bagAuto ? 'checked' : ''} /></label>
            <p class="gset-hint">关闭剪影时（默认）未获得的卡也正常显示立绘；背包自动整理会在打开背包时按品质/等级排序。</p>
          </div>

          <div class="gset-block">
            <h3>战斗表现</h3>
            <label class="gset-row gset-row-check">战斗内显示单位名字<input id="setting-unit-names" type="checkbox" ${unitNames ? 'checked' : ''} /></label>
            <label class="gset-row gset-row-check">低画质模式（性能优先）<input id="setting-low-quality" type="checkbox" ${lowQuality ? 'checked' : ''} /></label>
            <label class="gset-row">全屏技能特效大小<input id="setting-fx-scale" type="range" min="${FULLSCREEN_FX_SCALE_RANGE.min * 100}" max="${FULLSCREEN_FX_SCALE_RANGE.max * 100}" step="${FULLSCREEN_FX_SCALE_RANGE.step * 100}" value="${Math.round(fxScale * 100)}" /></label>
            <p class="gset-hint">当前特效 <b id="setting-fx-value">${Math.round(fxScale * 100)}%</b>：陨石雨 / 暴风雪这类全屏技能占战场的比例，越小越不挡视野。低画质会关掉部分特效细节，卡顿时可开。</p>
          </div>

          <p class="gset-toast" id="setting-toast" role="status" aria-live="polite" hidden></p>
        </section>
      </div>`;

    this.root = root;
    this.bind(root);
  }

  /**
   * 危险操作的游戏内确认弹窗（与铁匠铺一致，不用浏览器 confirm）。
   * 2026-09-11：暂时没有调用方（原来的重置/重看教程入口已按用户要求移除），保留给后续危险设置项。
   */
  confirm(message, { confirmText = '确定', cancelText = '取消' } = {}) {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'gset-modal';
      host.innerHTML = `
        <div class="gset-modal-card" role="dialog" aria-modal="true">
          <p class="gset-modal-text">${escapeHtml(message)}</p>
          <div class="gset-actions">
            <button type="button" class="gset-btn" data-act="ok">${escapeHtml(confirmText)}</button>
            <button type="button" class="gset-btn gset-btn-ghost" data-act="cancel">${escapeHtml(cancelText)}</button>
          </div>
        </div>`;
      const finish = (value) => {
        host.remove();
        resolve(value);
      };
      host.addEventListener('click', (e) => {
        if (e.target === host) return finish(false);
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'ok') return finish(true);
        if (act === 'cancel') return finish(false);
        return undefined;
      });
      this.root?.append(host);
      host.querySelector('[data-act="ok"]')?.focus();
    });
  }

  /** 面板底部的小提示（原来的常驻说明块已按用户要求去掉，改成短暂提示）。 */
  flash(message) {
    const toast = this.root?.querySelector('#setting-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      if (toast.isConnected) {
        toast.hidden = true;
        toast.textContent = '';
      }
    }, 2600);
  }

  bind(root) {
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

    root.querySelector('#setting-bag-auto').addEventListener('change', (e) => {
      setBagAutoOrganizeFlag(e.target.checked);
    });

    root.querySelector('#setting-unit-names').addEventListener('change', (e) => {
      setUnitNameFlag(e.target.checked);
    });

    root.querySelector('#setting-low-quality').addEventListener('change', (e) => {
      setLowQualityFlag(e.target.checked);
      this.flash(e.target.checked ? '已开启低画质模式（进行中的战斗下一帧生效）。' : '已关闭低画质模式。');
    });

    const fxInput = root.querySelector('#setting-fx-scale');
    fxInput.addEventListener('input', (e) => {
      const value = gameSettings.set('fullscreenFxScale', Number(e.target.value) / 100);
      root.querySelector('#setting-fx-value').textContent = `${Math.round(value * 100)}%`;
    });
  }
}
