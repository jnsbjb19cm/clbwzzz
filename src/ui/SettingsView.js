import { audio } from '../core/AudioManager.js';
import { authStore } from '../core/AuthStore.js';
import {
  FULLSCREEN_FX_SCALE_RANGE,
  GAME_SETTINGS_DEFAULTS,
  gameSettings,
} from '../core/GameSettingsStore20260910.js';
import {
  applyGraphicsQualityPreset,
  readBagAutoOrganizeFlag,
  readUnitNameFlag,
  setBagAutoOrganizeFlag,
  setUnitNameFlag,
} from '../core/BattleClientFlags20260910.js';
import { syncBattleDisplayRuntime } from './BattleDisplayRuntime20260911.js';

/** 画质档位的中文名。 */
const QUALITY_LABEL = Object.freeze({ low: '低', medium: '中', high: '高' });

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/**
 * 2026-09-10：设置页重做（第二版）。
 *
 * 每个开关都接了真实读取点（见 BattleClientFlags20260910.js / BattleDisplayRuntime20260911.js）：
 *   - 显示单位名字 / 低画质       → 战斗代码读的 localStorage 键
 *   - 画质预设（低/中/高）        → 批量写入低画质、伤害数字等真实开关
 *   - 单位血条 / 伤害数字 / FPS   → 读取时刻判断，改完立即生效
 *   - BGM 总开关 + 分场景开关      → AudioManager.playBgm 与音效音量互不影响
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
    const bagAuto = readBagAutoOrganizeFlag();
    const quality = gameSettings.get('graphicsQuality') ?? 'medium';
    const unitHp = gameSettings.get('showUnitHp') !== false;
    const damageNumbers = gameSettings.get('showDamageNumbers') === true;
    const perfPanel = gameSettings.get('showPerfPanel') === true;
    const bgmOn = gameSettings.get('bgmEnabled') !== false;
    const bgmCity = gameSettings.get('bgmCity') !== false;
    const bgmRoom = gameSettings.get('bgmRoom') !== false;
    const bgmBattle = gameSettings.get('bgmBattle') !== false;

    root.innerHTML = `
      <div class="page gset-page gset-chrome">
        <section class="gset-panel">
          <h2 class="gset-title">设置</h2>

          <div class="gset-block">
            <h3>声音</h3>
            <label class="gset-row">BGM 音量<input id="setting-music" type="range" min="0" max="100" value="${Math.round(audio.volume * 100)}" /></label>
            <label class="gset-row">音效音量<input id="setting-sfx" type="range" min="0" max="100" value="${Math.round(audio.sfxVolume * 100)}" /></label>
            <label class="gset-row gset-row-check">背景音乐总开关<input id="setting-bgm" type="checkbox" ${bgmOn ? 'checked' : ''} /></label>
            <label class="gset-row gset-row-check">主城 BGM<input id="setting-bgm-city" type="checkbox" ${bgmCity ? 'checked' : ''} /></label>
            <label class="gset-row gset-row-check">房间 BGM<input id="setting-bgm-room" type="checkbox" ${bgmRoom ? 'checked' : ''} /></label>
            <label class="gset-row gset-row-check">战斗 BGM<input id="setting-bgm-battle" type="checkbox" ${bgmBattle ? 'checked' : ''} /></label>
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
            <div class="gset-row gset-row-stack">
              <span>画质</span>
              <div class="gset-seg" id="setting-quality">
                <button type="button" class="gset-seg-btn${quality === 'low' ? ' active' : ''}" data-quality="low">低</button>
                <button type="button" class="gset-seg-btn${quality === 'medium' ? ' active' : ''}" data-quality="medium">中</button>
                <button type="button" class="gset-seg-btn${quality === 'high' ? ' active' : ''}" data-quality="high">高</button>
              </div>
            </div>
            <label class="gset-row gset-row-check">战斗内显示单位名字<input id="setting-unit-names" type="checkbox" ${unitNames ? 'checked' : ''} /></label>
            <label class="gset-row gset-row-check">战斗内显示单位血条<input id="setting-unit-hp" type="checkbox" ${unitHp ? 'checked' : ''} /></label>
            <label class="gset-row gset-row-check">伤害数字<input id="setting-damage-numbers" type="checkbox" ${damageNumbers ? 'checked' : ''} /></label>
            <label class="gset-row">全屏技能特效大小<input id="setting-fx-scale" type="range" min="${FULLSCREEN_FX_SCALE_RANGE.min * 100}" max="${FULLSCREEN_FX_SCALE_RANGE.max * 100}" step="${FULLSCREEN_FX_SCALE_RANGE.step * 100}" value="${Math.round(fxScale * 100)}" /></label>
            <p class="gset-hint">当前特效 <b id="setting-fx-value">${Math.round(fxScale * 100)}%</b>：陨石雨 / 暴风雪这类全屏技能占战场的比例，越小越不挡视野。低画质=强制简化特效并关掉伤害数字；高画质=完整特效 + 伤害数字。</p>
          </div>

          <div class="gset-block">
            <h3>性能</h3>
            <label class="gset-row gset-row-check">FPS / 性能面板<input id="setting-perf-panel" type="checkbox" ${perfPanel ? 'checked' : ''} /></label>
            <p class="gset-hint">开启后左上角显示帧率与战斗中的单位 / 特效数量，用于判断卡顿来源（关闭时不产生任何开销）。</p>
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

    root.querySelector('#setting-quality').addEventListener('click', (e) => {
      const level = e.target.closest('[data-quality]')?.dataset.quality;
      if (!level) return;
      applyGraphicsQualityPreset(level);
      // 2026-09-11：原来是 this.render(root) 整页重绘，面板被换掉导致滚动条回顶。
      // 画质预设只会改到「分段选中态 / 单位名字 / 血条 / 伤害数字」这几个控件，就地同步即可。
      const syncQualityUi = () => {
        root.querySelectorAll('#setting-quality [data-quality]').forEach((button) => {
          button.classList.toggle('active', button.dataset.quality === level);
        });
        const names = root.querySelector('#setting-unit-names');
        if (names) names.checked = readUnitNameFlag();
        const hp = root.querySelector('#setting-unit-hp');
        if (hp) hp.checked = gameSettings.get('showUnitHp') !== false;
        const damage = root.querySelector('#setting-damage-numbers');
        if (damage) damage.checked = gameSettings.get('showDamageNumbers') === true;
      };
      syncQualityUi();
      this.flash(`画质已切换为「${QUALITY_LABEL[level]}」，进行中的战斗下一帧生效。`);
    });

    root.querySelector('#setting-unit-hp').addEventListener('change', (e) => {
      gameSettings.set('showUnitHp', e.target.checked);
      this.flash(e.target.checked ? '已显示单位血条。' : '已隐藏单位血条。');
    });

    root.querySelector('#setting-damage-numbers').addEventListener('change', (e) => {
      gameSettings.set('showDamageNumbers', e.target.checked);
      this.flash(e.target.checked ? '已开启伤害数字。' : '已关闭伤害数字。');
    });

    root.querySelector('#setting-perf-panel').addEventListener('change', (e) => {
      gameSettings.set('showPerfPanel', e.target.checked);
      this.flash(e.target.checked ? 'FPS / 性能面板已开启。' : 'FPS / 性能面板已关闭。');
    });

    const bgmKeys = [
      ['#setting-bgm', 'bgmEnabled'],
      ['#setting-bgm-city', 'bgmCity'],
      ['#setting-bgm-room', 'bgmRoom'],
      ['#setting-bgm-battle', 'bgmBattle'],
    ];
    for (const [selector, key] of bgmKeys) {
      root.querySelector(selector).addEventListener('change', (e) => {
        gameSettings.set(key, e.target.checked);
        syncBattleDisplayRuntime();   // 关掉的如果是正在放的那首，立即停
      });
    }

    const fxInput = root.querySelector('#setting-fx-scale');
    fxInput.addEventListener('input', (e) => {
      const value = gameSettings.set('fullscreenFxScale', Number(e.target.value) / 100);
      root.querySelector('#setting-fx-value').textContent = `${Math.round(value * 100)}%`;
    });
  }
}
