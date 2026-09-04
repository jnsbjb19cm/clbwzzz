import { CardDatabase } from '../core/CardDatabase.js';
import { ItemDatabase, InventoryStore } from '../core/ItemDatabase.js';
import { CardInventoryStore } from '../core/CardInventoryStore.js';
import { HeroSkillStore } from '../core/HeroSkillStore.js';
import { audio } from '../core/AudioManager.js';
import { authStore } from '../core/AuthStore.js';
import { CardGallery } from './CardGallery.js';
import { getCraftMaterialImage } from './SmithyMaterialArtwork.js';
import { BattleView } from './BattleView.js';
import { MainCityView } from './MainCityView.js';
import { BagView } from './BagView.js';
import { SmithyView } from './SmithyView.js';
import { TrainingView } from './TrainingView.js';
import { TalentView } from './TalentView.js';
import { PlaceholderView } from './PlaceholderView.js';
import { QuestView } from './QuestView.js';
import { FriendView } from './FriendView.js';
import { HallView } from './HallView.js';
import { GuildView } from './GuildView.js';
import { AuctionView } from './AuctionView.js';
import { SettingsView } from './SettingsView.js';
import { ShopView } from './ShopView.js';
import { WorldMapView, markWorldStageCleared } from './WorldMapView.js';
import { RoomView } from './RoomView.js';
import { LoginView } from './LoginView.js';
import { getBattleRewards, grantPlayerExp } from '../core/PlayerProgression.js';

const BOTTOM_NAV = [
  { id: 'shop', label: '\u5546\u57CE' },
  { id: 'bag', label: '\u80CC\u5305' },
  { id: 'quest', label: '\u4EFB\u52A1' },
  { id: 'smithy', label: '\u6253\u9020' },
  { id: 'gallery', label: '\u56FE\u9274' },
  { id: 'social', label: '\u597D\u53CB' },
  { id: 'battle', label: '\u5927\u5385' },
  { id: 'worldmap', label: '\u66F4\u591A' },
  { id: 'settings', label: '\u8BBE\u7F6E' },
  { id: 'main', label: '\u8FD4\u56DE' },
];                                                   /*UI索引值  */

const PLACEHOLDER_MODULES = new Set(['guild', 'social', 'hall', 'auction']);
const CITY_OVERLAY_ROUTES = new Set(['gallery', 'guild', 'quest', 'worldmap', 'social', 'hall', 'auction', 'settings']);

const CITY_BGM_ROUTES = new Set([
  'main',
  'gallery',
  'bag',
  'smithy',
  'talent',
  'shop',
  'guild',
  'quest',
  'worldmap',
  'social',
]);

export class App {
  constructor(root) {
    this.root = root;
    this.db = new CardDatabase();
    this.itemDb = new ItemDatabase();
    this.inventory = new InventoryStore(this.itemDb);
    this.cardInventory = new CardInventoryStore(this.db);
    if (this.cardInventory.getUsedCount() === 0) this.cardInventory.grantAllCollectibleCards();
    this.heroSkills = new HeroSkillStore(this.db);
    this.route = 'main';
    this.views = {};
    this.stats = this.db.getStats();
    this.player = this.loadPlayer();
  }

  mount() {
    // 登录门：未登录先注册/登录(取名)，登录后才进入主城
    if (!authStore.isLoggedIn()) {
      this.root.innerHTML = '';
      const login = new LoginView({
        onSuccess: () => {
          this.root.innerHTML = '';
          this.bootstrap();
        },
      });
      login.render(this.root);
      return;
    }
    // 已有 token：刷新页面后恢复用户/快照(否则 currentUserId 为空，房主判定失效)
    if (!authStore.user) {
      authStore.restore().catch(() => {}).then(() => this.bootstrap());
      return;
    }
    this.bootstrap();
  }

  bootstrap() {
    this.root.innerHTML = '';
    this.root.append(this.renderShell());
    this.bindInteractionGuards();
    this.bindGlobalNotices();
    this.navigate('main');
    this.bindNav();
  }

  bindInteractionGuards() {
    if (this._guardsBound) return;
    this._guardsBound = true;

    document.addEventListener(
      'dragstart',
      (e) => {
        const t = e.target;
        if (t instanceof HTMLImageElement) {
          e.preventDefault();
          return;
        }
        if (t instanceof HTMLCanvasElement && !t.closest('#drag-ghost')) {
          e.preventDefault();
        }
      },
      true,
    );

    document.addEventListener('contextmenu', (e) => {
      const t = e.target;
      if (
        t instanceof HTMLImageElement ||
        t instanceof HTMLCanvasElement ||
        t?.closest?.('.game-container')
      ) {
        e.preventDefault();
      }
    });

    document.addEventListener('selectstart', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (t?.closest?.('.game-container, .battle-page, .deck-slot, .drag-ghost')) {
        e.preventDefault();
      }
    });
  }

  renderShell() {
    const el = document.createElement('div');
    el.className = 'app-shell';
    el.innerHTML = `
      <div id="view-root" class="view-root"></div>
      <div id="global-notice" class="global-notice hidden"><div><h2 id="global-notice-title"></h2><p id="global-notice-desc"></p><button type="button" id="global-notice-close">\u786E\u5B9A</button></div></div>
      <nav class="bottom-nav">${BOTTOM_NAV.map((n) => `<button type="button" class="bottom-nav-btn" data-route="${n.id}">${n.label}</button>`).join('')}
        <button type="button" class="bottom-nav-btn bottom-nav-logout" data-route="__logout" title="切换账号">登出</button>
      </nav>
    `;
    return el;
  }

  bindNav() {
    this.root.querySelectorAll('.bottom-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playSfx('click');
        if (btn.dataset.route === '__logout') {
          authStore.logout();
          this.views = {};
          this.mount();
          return;
        }
        this.navigate(btn.dataset.route);
      });
    });
  }

  static PLAYER_STORAGE_KEY = 'clbwz_player_v1';

  static DEFAULT_PLAYER = { level: 1, exp: 0, hp: 1000, gold: 12800, gem: 50, honor: 120, arena: 80 };

  loadPlayer() {
    try {
      const raw = localStorage.getItem(App.PLAYER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...App.DEFAULT_PLAYER, ...parsed };
      }
    } catch {  }
    return { ...App.DEFAULT_PLAYER };
  }

  savePlayer() {
    try {
      localStorage.setItem(App.PLAYER_STORAGE_KEY, JSON.stringify(this.player));
    } catch {  }
  }

  syncMuteDisplay() {} // deprecated - no more top HUD

  updateResourceDisplay(sun, food) {
    const sunEl = this.root.querySelector('#ui-sun');
    const foodEl = this.root.querySelector('#ui-food');
    if (sunEl) sunEl.textContent = sun ?? '--';
    if (foodEl) foodEl.textContent = food ?? '--';
  }

  updateHeroHpBar(hp, maxHp) {
    const bar = this.root.querySelector('.hero-hp-bar div');
    if (!bar || hp == null || !maxHp) return;
    bar.style.width = `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%`;
  }

  updatePlayerDisplay() {
    const goldEl = this.root.querySelector('#ui-gold');
    const gemEl = this.root.querySelector('#ui-gem');
    const levelEl = this.root.querySelector('#ui-level');
    if (goldEl) goldEl.textContent = this.player.gold;
    if (gemEl) gemEl.textContent = this.player.gem;
    if (levelEl) levelEl.textContent = `Lv.${this.player.level}`;
    this.savePlayer();
  }

  bindGlobalNotices() {
    if (this._noticesBound) return;
    this._noticesBound = true;
    this.root.addEventListener('click', (event) => {
      if (event.target.closest('#global-notice-close')) {
        this.dismissGlobalNotice();
      }
    });
    window.addEventListener('clbwz:quest-complete', (event) => {
      const quest = event.detail?.quest;
      this.showGlobalNotice('Quest complete', quest?.name ?? 'Quest complete');
    });
  }

  showGlobalNotice(title, desc) {
    const notice = this.root.querySelector('#global-notice');
    if (!notice) return;
    this._noticeQueue = this._noticeQueue ?? [];
    if (!notice.classList.contains('hidden')) {
      this._noticeQueue.push({ title, desc });
      return;
    }
    notice.querySelector('#global-notice-title').textContent = title;
    notice.querySelector('#global-notice-desc').innerHTML = desc;
    notice.classList.remove('hidden');
  }

  dismissGlobalNotice() {
    const notice = this.root.querySelector('#global-notice');
    if (!notice) return;
    notice.classList.add('hidden');
    const next = this._noticeQueue?.shift();
    if (next) this.showGlobalNotice(next.title, next.desc);
  }

  handleBattleResult({ won, stage, drops = [], durationMs = 0 }) {
    const reward = getBattleRewards(stage, won);
    let totalGold = reward.gold;
    let totalExp = reward.exp;
    const special = won ? markWorldStageCleared(stage.stage_id ?? stage.id) : { firstClear: false, rewards: [] };
    if (won && (stage?.stage_id || drops.length)) {
      authStore.api.post('/player/stage-result', {
        stageId: stage?.stage_id ?? null,
        won,
        durationMs,
        bestStars: stage?.stars ?? 1,
        drops: drops.map((drop) => ({ itemId: Number(drop?.itemId), count: Number(drop?.count) || 1 })),
      }).catch(() => {});
    }
    const specialText = [];
    const dropTotals = new Map();
    for (const drop of Array.isArray(drops) ? drops : []) {
      const itemId = Number(drop?.itemId);
      const count = Math.max(1, Math.min(99, Math.floor(Number(drop?.count) || 1)));
      if (!this.itemDb.getById(itemId)) continue;
      dropTotals.set(itemId, (dropTotals.get(itemId) ?? 0) + count);
    }
    for (const [itemId, count] of dropTotals) {
      const item = this.itemDb.getById(itemId);
      const img = getCraftMaterialImage(itemId);
      const iconHtml = img ? `<img src="${img}" alt="" style="width:34px;height:34px;vertical-align:middle;margin-right:6px;border-radius:6px;background:#243b24;">` : '';
      if (this.inventory.addItem(itemId, count)) {
        specialText.push(`<div style="text-align:left;margin:4px 0;">${iconHtml}战斗掉落：${item.name} ×${count}</div>`);
      } else {
        specialText.push(`<div style="text-align:left;margin:4px 0;">${iconHtml}掉落未拾取（背包已满）：${item.name} ×${count}</div>`);
      }
    }
    if (special.firstClear) {
      for (const entry of special.rewards) {
        if (entry.type === 3) {
          totalGold += entry.amount;
          specialText.push(`\u9996\u901a\u91d1\u5e01 +${entry.amount}`);
        } else if (entry.type === 27) {
          totalExp += entry.amount;
          specialText.push(`\u9996\u901a\u7ecf\u9a8c +${entry.amount}`);
        } else if (entry.type === 2) {
          const result = this.cardInventory.addCard(entry.amount, 0, { craftQuality: 1 });
          if (result.ok) {
            specialText.push(`\u9996\u901a\u5361\u724c\uff1a ${this.db.getById(entry.amount)?.name ?? entry.amount}`);
            QuestView.dispatch('card_collect', { count: 1 });
          }
        } else if (entry.type === 1) {
          this.inventory.addItem(entry.amount, 1);
          specialText.push(`\u9996\u901a\u9053\u5177\uff1a ${entry.amount}`);
        }
      }
    }
    if (won && this._pendingBoss) { this._pendingBoss = null; }
    this.player.gold = (Number(this.player.gold) || 0) + totalGold;
    const progress = grantPlayerExp(this.player, totalExp);
    QuestView.dispatch('gold_gain', { amount: totalGold });
    this.updatePlayerDisplay();
    const levelText = progress.levelsGained > 0 ? `\uff0c\u7b49\u7ea7 ${progress.level}` : '';
    const dropHtml = specialText.length ? `<div style="margin-top:8px;">${specialText.join('')}</div>` : '';
    this.showGlobalNotice(
      won ? '\u5192\u9669\u80dc\u5229' : '\u6218\u6597\u7ed3\u675f',
      `<div>\u91d1\u5e01 +${totalGold}; \u7ecf\u9a8c +${totalExp}${levelText}</div>${dropHtml}`,
    );
  }

  syncRouteBgm(route, prevRoute) {
    if (route === 'battle') return;
    // 房间(含房间 PVP 编队/等待)：房间专属音乐 gameRoom.mp3
    if (route === 'room') {
      audio.playBgm('room', { fade: prevRoute === 'battle' });
      return;
    }
    if (!CITY_BGM_ROUTES.has(route)) return;
    const fromBattle = prevRoute === 'battle';
    const firstBoot = audio.getBgmKey() == null;
    audio.playBgm('city', { fade: fromBattle || firstBoot });
  }

  navigate(route, opts = {}) {
    const prevRoute = this.route;

    if (this.views.battle) {
      this.views.battle.destroy();
      this.views.battle = null;
    }
    if (this.views.room) {
      this.views.room.destroy();
      this.views.room = null;
    }
    document.body.classList.toggle('battle-immersive', route === 'battle');

    this.route = route;
    this.routeOpts = opts;
    this.root.querySelectorAll('.bottom-nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.route === route);
    });

    const viewRoot = this.root.querySelector('#view-root');
    viewRoot.innerHTML = '';
    let renderRoot = viewRoot;
    if (CITY_OVERLAY_ROUTES.has(route)) {
      const city = new MainCityView((nextRoute) => this.navigate(nextRoute));
      city.render(viewRoot);
      const overlay = document.createElement('section');
      overlay.className = 'city-modal-overlay';
      overlay.innerHTML = `<div class="city-modal-window"><button type="button" class="city-modal-close" aria-label="\u5173\u95ed">X</button><div class="city-modal-content"></div></div>`;
      overlay.querySelector('.city-modal-close').addEventListener('click', () => this.navigate('main'));
      viewRoot.append(overlay);
      renderRoot = overlay.querySelector('.city-modal-content');
    }

    if (route === 'main') {
      const city = new MainCityView((r) => this.navigate(r));
      city.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'gallery') {
      const gallery = new CardGallery(this.db);
      gallery.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'bag') {
      const bag = new BagView(
        this.itemDb,
        this.inventory,
        this.db,
        this.cardInventory,
        this.player,
        {
          onPlayerUpdate: () => this.updatePlayerDisplay(),
          onNavigate: (r, o) => this.navigate(r, o),
        },
      );
      bag.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'training') {
      const training = new TrainingView(
        this.db,
        this.cardInventory,
        this.player,
        { onNavigate: (r, o) => this.navigate(r, o) },
      );
      training.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'smithy') {
      const smithy = new SmithyView(
        this.db,
        this.itemDb,
        this.inventory,
        this.cardInventory,
        this.player,
        {
          onPlayerUpdate: () => this.updatePlayerDisplay(),
          onQuestEvent: (event, data) => QuestView.dispatch(event, data),
          initialTab: opts.tab,
          initialCardIndex: opts.cardIndex,
        },
      );
      smithy.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'worldmap') {
      const wm = new WorldMapView(
        this.player, this.db, this.cardInventory, this.inventory,
        { onPlayerUpdate: () => this.updatePlayerDisplay(), onNavigate: (r, o) => this.navigate(r, o) },
      );
      wm.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'quest') {
      const quest = new QuestView(this.db, this.cardInventory, this.player, {
        onPlayerUpdate: () => this.updatePlayerDisplay(),
        itemDb: this.itemDb,
        inventory: this.inventory,
      });
      quest.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'shop') {
      const shop = new ShopView(
        this.itemDb, this.inventory, this.db, this.cardInventory, this.player,
        {
          onPlayerUpdate: () => this.updatePlayerDisplay(),
          onNavigate: (nextRoute) => this.navigate(nextRoute),
        },
      );
      shop.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'talent') {
      const talent = new TalentView(this.db, this.heroSkills, this.player, {
        onPlayerUpdate: () => this.updatePlayerDisplay(),
        onNavigate: (nextRoute) => this.navigate(nextRoute),
      });
      talent.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'battle') {
      const battle = new BattleView(this.db, {
        cardInventory: this.cardInventory,
        heroSkills: this.heroSkills,
        player: this.player,
        onResourceChange: (sun, food) => this.updateResourceDisplay(sun, food),
        onHeroHpChange: (hp, maxHp) => this.updateHeroHpBar(hp, maxHp),
        onQuestEvent: (event, data) => QuestView.dispatch(event, data),
        onBattleResult: (result) => this.handleBattleResult(result),
        onNavigate: (route, opts) => this.navigate(route, opts),
        pvp: this.routeOpts?.pvp,
        stageId: this.routeOpts?.stageId,
        enemyRandomMode: this.routeOpts?.enemyRandomMode ?? false,
        boss: this.routeOpts?.boss || null,
        training: this.routeOpts?.training ?? false,
        trainingFreeRes: this.routeOpts?.trainingFreeRes ?? true,
        trainingMap: this.routeOpts?.trainingMap ?? (this.routeOpts?.training ? 'grass' : null),
        deckSlots: this.routeOpts?.deckSlots,
        tryCard: this.routeOpts?.tryCard,
        tryUsage: this.routeOpts?.tryUsage,
      });
      battle.render(renderRoot);
      this.views.battle = battle;
    } else if (route === 'room') {
      const room = new RoomView(this.db, {
        cardInventory: this.cardInventory,
        itemDb: this.itemDb,
        inventory: this.inventory,
        player: this.player,
        createBoss: opts?.createBoss,
        stageId: opts?.stageId,
        mapId: opts?.mapId,
        stageName: opts?.stageName,
        enemyRandomMode: opts?.enemyRandomMode ?? false,
        autoCreate: opts?.autoCreate,
        onPlayerUpdate: () => this.updatePlayerDisplay(),
        onNavigate: (r, o) => this.navigate(r, o),
      });
      room.render(renderRoot);
      this.views.room = room;
    } else if (route === 'social') {
      const friend = new FriendView();
      friend.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'hall') {
      const hall = new HallView();
      hall.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'guild') {
      const guild = new GuildView();
      guild.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'auction') {
      const auction = new AuctionView();
      auction.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (route === 'settings') {
      const settings = new SettingsView();
      settings.render(renderRoot);
      this.updateResourceDisplay('--', '--');
    } else if (PLACEHOLDER_MODULES.has(route)) {
      new PlaceholderView(route).render(renderRoot);
      this.updateResourceDisplay('--', '--');
    }

    this.syncRouteBgm(route, prevRoute);
    this.syncMuteDisplay();
  }
}
