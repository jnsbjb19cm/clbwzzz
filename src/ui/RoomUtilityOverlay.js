import { BagView } from './BagView.js';
import { QuestView } from './QuestView.js';
import { ShopView } from './ShopView.js';
import { SmithyView } from './SmithyView.js';
import { audio } from '../core/AudioManager.js';

const SUPPORTED_ROOM_TOOLS = new Set(['bag', 'quest', 'shop', 'smithy']);

function roomActive(app) {
  return app?.route === 'room' && Boolean(app?.views?.room?.room);
}

function titleFor(route) {
  return {
    bag: '背包',
    quest: '任务',
    shop: '商城',
    smithy: '打造',
  }[route] ?? '房间功能';
}

export class RoomUtilityOverlay {
  constructor(app) {
    this.app = app;
    this.route = null;
    this.node = null;
    this._navigateHandler = (event) => this.handleNavigateEvent(event);
    this._settingCapture = (event) => this.handleSettingClick(event);
  }

  install() {
    window.addEventListener('clbwz:navigate', this._navigateHandler, true);
    document.addEventListener('click', this._settingCapture, true);
  }

  destroy() {
    window.removeEventListener('clbwz:navigate', this._navigateHandler, true);
    document.removeEventListener('click', this._settingCapture, true);
    this.close();
  }

  handleNavigateEvent(event) {
    if (!roomActive(this.app)) return;
    const route = String(event?.detail?.route || '');
    if (!SUPPORTED_ROOM_TOOLS.has(route)) return;

    // 房间工具不是全局页面导航：必须保留 RoomView、Socket 和 room BGM。
    event.stopImmediatePropagation();
    event.preventDefault?.();
    this.open(route, event.detail?.opts ?? {});
  }

  handleSettingClick(event) {
    if (!roomActive(this.app)) return;
    const button = event.target?.closest?.('#setting-btn');
    if (!button) return;
    // 部分旧 room polish 会在 document click 阶段关闭下拉并覆盖 modal 状态；
    // 最后一个 microtask 再确认设置弹窗保持打开。
    queueMicrotask(() => {
      const modal = this.app.views.room?.root?.querySelector?.('#setting-modal');
      if (modal instanceof HTMLElement) modal.style.display = 'flex';
    });
  }

  ensureNode() {
    const roomRoot = this.app.views.room?.root;
    if (!roomRoot) return null;
    this.node?.remove?.();

    const overlay = document.createElement('section');
    overlay.className = 'room-utility-overlay';
    overlay.dataset.roomUtility = 'true';
    overlay.innerHTML = `
      <div class="room-utility-window" role="dialog" aria-modal="true">
        <header class="room-utility-header">
          <strong data-room-utility-title></strong>
          <button type="button" data-room-utility-close aria-label="关闭">×</button>
        </header>
        <div class="room-utility-content"></div>
      </div>`;
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:9000',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:rgba(4,12,16,.58)',
      'backdrop-filter:blur(2px)',
    ].join(';');
    const win = overlay.querySelector('.room-utility-window');
    win.style.cssText = [
      'position:relative',
      'width:min(94vw,1480px)',
      'height:min(90vh,860px)',
      'overflow:hidden',
      'border:2px solid rgba(119,212,220,.9)',
      'border-radius:12px',
      'background:#132c32',
      'box-shadow:0 18px 60px rgba(0,0,0,.55)',
    ].join(';');
    const header = overlay.querySelector('.room-utility-header');
    header.style.cssText = 'height:46px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:rgba(8,31,38,.94);color:#e8ffff;';
    const close = overlay.querySelector('[data-room-utility-close]');
    close.style.cssText = 'width:34px;height:34px;border:0;border-radius:8px;background:#194e5a;color:#fff;font-size:24px;cursor:pointer;';
    const content = overlay.querySelector('.room-utility-content');
    content.style.cssText = 'position:absolute;left:0;right:0;top:46px;bottom:0;overflow:auto;';

    close.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.close();
    });
    roomRoot.append(overlay);
    this.node = overlay;
    return overlay;
  }

  open(route, opts = {}) {
    if (!roomActive(this.app) || !SUPPORTED_ROOM_TOOLS.has(route)) return false;
    const overlay = this.ensureNode();
    if (!overlay) return false;
    this.route = route;
    overlay.querySelector('[data-room-utility-title]').textContent = titleFor(route);
    const content = overlay.querySelector('.room-utility-content');
    content.innerHTML = '';

    const navigateInsideRoom = (nextRoute, nextOpts = {}) => {
      if (SUPPORTED_ROOM_TOOLS.has(nextRoute)) {
        this.open(nextRoute, nextOpts);
      }
    };

    if (route === 'bag') {
      new BagView(
        this.app.itemDb,
        this.app.inventory,
        this.app.db,
        this.app.cardInventory,
        this.app.player,
        {
          onPlayerUpdate: () => this.app.updatePlayerDisplay(),
          onNavigate: navigateInsideRoom,
        },
      ).render(content);
    } else if (route === 'quest') {
      new QuestView(this.app.db, this.app.cardInventory, this.app.player, {
        onPlayerUpdate: () => this.app.updatePlayerDisplay(),
        itemDb: this.app.itemDb,
        inventory: this.app.inventory,
      }).render(content);
    } else if (route === 'shop') {
      new ShopView(
        this.app.itemDb,
        this.app.inventory,
        this.app.db,
        this.app.cardInventory,
        this.app.player,
        { onPlayerUpdate: () => this.app.updatePlayerDisplay() },
      ).render(content);
    } else if (route === 'smithy') {
      new SmithyView(
        this.app.db,
        this.app.itemDb,
        this.app.inventory,
        this.app.cardInventory,
        this.app.player,
        {
          onPlayerUpdate: () => this.app.updatePlayerDisplay(),
          onQuestEvent: (name, data) => QuestView.dispatch(name, data),
          initialTab: opts.tab,
          initialCardIndex: opts.cardIndex,
        },
      ).render(content);
    }

    // 工具面板打开期间保持房间音乐，不切主城 BGM。
    audio.playBgm('room');
    return true;
  }

  close() {
    this.node?.remove?.();
    this.node = null;
    this.route = null;
    if (roomActive(this.app)) audio.playBgm('room');
  }
}
