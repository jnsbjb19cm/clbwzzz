import './MainCityTrialBulletin20260905.css';
import { MainCityView } from './MainCityView.js';
import { RoomView } from './RoomView.js';

const PATCH_FLAG = Symbol.for('clbwz.mainCityTrialBulletin20260905');
const NOTICE_TEXT = '完成日常任务「强化能手」后领取奖励即可满级';
const REFILL_NOTICE_TEXT = '补卡：背包 → 卡牌 → 补全卡；补强化粉和制作材料：铁匠铺 → 强化 → 补发道具';
const LOBBY_NOTICE_TEXT = `公告提示：${NOTICE_TEXT}`;

const FEATURE_GROUPS = Object.freeze([
  {
    title: '试玩福利 · 补发入口',
    items: [
      { route: 'bag', label: '补卡位置', desc: '主城 → 背包 → 卡牌 → 点击「补全卡」' },
      { route: 'smithy', label: '补强化粉和材料', desc: '主城 → 铁匠铺 → 强化 → 点击「补发道具」' },
      { route: 'gallery', label: '全卡体验', desc: '补全后可在图鉴查看全部可收藏卡牌' },
      { route: 'quest', label: '满级捷径', desc: '任务 → 日常 → 强化能手 → 强化1次 → 领取奖励' },
    ],
  },
  {
    title: '战斗玩法',
    items: [
      { route: 'room', label: '游戏大厅', desc: 'PVP / BOSS / 副本 / 练习' },
      { route: 'worldmap', label: '野外冒险', desc: '关卡推进与战斗掉落' },
      { route: 'training', label: '训练营', desc: '新手教程与自由练习' },
    ],
  },
  {
    title: '成长与制作',
    items: [
      { route: 'quest', label: '任务', desc: '主线、日常、成就奖励' },
      { route: 'bag', label: '背包', desc: '卡牌、道具、绑定材料' },
      { route: 'gallery', label: '图鉴', desc: '查看全部卡牌' },
      { route: 'smithy', label: '铁匠铺', desc: '造卡 / 强化 / 加工 / 拆解 / 补发道具' },
      { route: 'shop', label: '商店', desc: '商城与道具' },
    ],
  },
  {
    title: '社交与交易',
    items: [
      { route: 'social', label: '好友', desc: '好友与私聊' },
      { route: 'guild', label: '公会', desc: '公会与公会仓库' },
      { route: 'auction', label: '拍卖行', desc: '非绑定物品交易' },
      { route: 'hall', label: '名人堂', desc: '排行与荣誉' },
      { route: 'settings', label: '设置', desc: '音量与游戏设置' },
    ],
  },
]);

function setClassicTrack(track, text) {
  if (!track) return;
  track.replaceChildren();
  const makeText = () => {
    const node = document.createElement('b');
    node.className = 'classic-broadcast-item';
    node.textContent = text;
    return node;
  };
  const separator = document.createElement('i');
  separator.setAttribute('aria-hidden', 'true');
  separator.textContent = '｜';
  track.append(makeText(), separator, makeText());
}

function applyIdleTrialAnnouncement() {
  if (typeof document === 'undefined') return;
  if (globalThis.__clbwzLastSystemAnnouncement) return;
  for (const bar of document.querySelectorAll('.classic-system-broadcast')) {
    bar.dataset.systemKind = 'trial-tip';
    bar.classList.remove('is-idle');
    const label = bar.querySelector('.classic-broadcast-label');
    if (label) label.textContent = '公告提示';
    setClassicTrack(bar.querySelector('.classic-broadcast-track'), `${NOTICE_TEXT}　｜　${REFILL_NOTICE_TEXT}`);
  }
}

function bulletinMarkup() {
  return `
    <aside class="main-city-trial-bulletin" data-trial-bulletin aria-label="试玩公告与功能总览">
      <div class="trial-bulletin-head">
        <strong>试玩公告 / 功能总览</strong>
        <button type="button" class="trial-bulletin-toggle" data-trial-bulletin-toggle aria-label="收起公告板">−</button>
      </div>
      <div class="trial-bulletin-body">
        <button type="button" class="trial-bulletin-important" data-trial-route="quest">
          <span>公告提示</span>
          <b>${NOTICE_TEXT}</b>
          <small>点击前往任务</small>
        </button>
        <div class="trial-bulletin-refill-guide" aria-label="试玩补发位置">
          <button type="button" data-trial-route="bag">
            <b>补卡位置</b>
            <span>主城 → 背包 → <em>卡牌</em> → 点击「<strong>补全卡</strong>」</span>
          </button>
          <button type="button" data-trial-route="smithy">
            <b>补强化粉和制作材料位置</b>
            <span>主城 → <em>铁匠铺</em> → <em>强化</em> → 点击「<strong>补发道具</strong>」</span>
            <small>包含强化粉1~5级、羊皮纸、宝石、保护符、DNA等；每次各100个，每天最多50次，全部绑定</small>
          </button>
        </div>
        ${FEATURE_GROUPS.map((group) => `
          <section class="trial-bulletin-group">
            <h4>${group.title}</h4>
            <div class="trial-bulletin-grid">
              ${group.items.map((item) => `
                <button type="button" class="trial-bulletin-feature" data-trial-route="${item.route}" title="${item.desc}">
                  <b>${item.label}</b>
                  <span>${item.desc}</span>
                </button>
              `).join('')}
            </div>
          </section>
        `).join('')}
        <p class="trial-bulletin-binding-note">绑定材料参与制作，产物一定继承绑定；拍卖行仅允许可交易的非绑定物品。</p>
      </div>
    </aside>`;
}

function injectMainCityBulletin(view, root) {
  const stage = root?.querySelector?.('.classic-city-stage');
  if (!stage || stage.querySelector('[data-trial-bulletin]')) return;
  stage.insertAdjacentHTML('beforeend', bulletinMarkup());
  const panel = stage.querySelector('[data-trial-bulletin]');
  const toggle = panel?.querySelector('[data-trial-bulletin-toggle]');
  toggle?.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    toggle.textContent = collapsed ? '+' : '−';
    toggle.setAttribute('aria-label', collapsed ? '展开公告板' : '收起公告板');
  });
  panel?.querySelectorAll('[data-trial-route]').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.dataset.trialRoute;
      if (route) view.onNavigate?.(route);
    });
  });
}

function updateLobbyAnnouncement(view) {
  const track = view.root?.querySelector?.('.classic-game-hall .lobby-announcement-track');
  if (!track) return;
  track.textContent = `${LOBBY_NOTICE_TEXT}　｜　补卡：主城 → 背包 → 卡牌 →「补全卡」　｜　补强化粉和制作材料：主城 → 铁匠铺 → 强化 →「补发道具」（每次各100个，每日最多50次，全部绑定）　｜　房间最长保留2小时，无真人玩家的房间会自动回收　｜　绑定材料制作出的产物一定绑定`;
}

export function installMainCityTrialBulletin20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousMainRender = MainCityView.prototype.render;
  MainCityView.prototype.render = function renderWithTrialBulletin20260905(root, ...args) {
    const result = previousMainRender.call(this, root, ...args);
    injectMainCityBulletin(this, root);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(applyIdleTrialAnnouncement);
    } else {
      setTimeout(applyIdleTrialAnnouncement, 0);
    }
    return result;
  };

  const previousRoomRenderShell = RoomView.prototype.renderShell;
  RoomView.prototype.renderShell = function renderShellWithTrialNotice20260905(...args) {
    const result = previousRoomRenderShell.apply(this, args);
    updateLobbyAnnouncement(this);
    return result;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('clbwz:system-announcement', (event) => {
      if (!event.detail?.clear) return;
      requestAnimationFrame(applyIdleTrialAnnouncement);
    });
    window.__verifyMainCityTrialBulletin20260905 = () => ({
      enabled: true,
      bulletin: Boolean(document.querySelector('[data-trial-bulletin]')),
      notice: NOTICE_TEXT,
      refillGuide: REFILL_NOTICE_TEXT,
      lobbyNotice: document.querySelector('.lobby-announcement-track')?.textContent ?? '',
    });
  }
}
