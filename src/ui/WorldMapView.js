import { audio } from '../core/AudioManager.js';
import worldMapData from '../data/worldMap.json';
import stageInfoData from '../data/stageInfo.json';
import worldMapAtlas from '../data/atlas/preload_worldMap.json';
import { BOSS_LIST } from '../data/bossList.js';
import {
  isBossCleared,
  isBossUnlocked,
  markBossCleared,
} from '../core/BossProgress.js';

export { isBossUnlocked, markBossCleared } from '../core/BossProgress.js';

const STORAGE_KEY = 'clbwz_worldmap_v1';
const BOSS_MAP_SELECT_ART = new URL('../../resources/background/bossmap.png', import.meta.url).href;
const LOGICAL_W = 1100;
const LOGICAL_H = 600;
const ART_W = 1500;
const ART_H = 1049;
const ATLAS_W = 2048;
const CHAPTERS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
const frames = new Map(worldMapAtlas.sprites.map((frame) => [frame.name, frame]));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function parseRewards(value) {
  if (!value) return [];
  return value.split(',').map((part) => {
    const [type, , amount] = part.split('|').map(Number);
    return { type, amount };
  });
}

function rewardText(rewards) {
  const labels = { 1: '道具', 2: '卡牌', 3: '金币', 27: '经验' };
  return rewards.map((reward) => (labels[reward.type] || '奖励') + ' ' + reward.amount).join(' · ') || '暂无奖励';
}

function initialState() {
  return { stageClaimed: [], chapterUnlocked: 1, randomEnemy: false };
}

function loadState() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return { ...initialState(), ...JSON.parse(data) };
  } catch { /* Storage is optional. */ }
  return initialState();
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function markWorldStageCleared(stageId) {
  const id = Number(stageId);
  const stage = stageInfoData.find((entry) => Number(entry.id ?? entry.stage_id) === id);
  if (!stage) return { firstClear: false, rewards: [] };
  const state = loadState();
  if (state.stageClaimed.includes(id)) return { firstClear: false, rewards: [] };
  state.stageClaimed.push(id);
  state.chapterUnlocked = Math.max(state.chapterUnlocked, Math.min(worldMapData.length, Number(stage.map_id || 1) + 1));
  saveState(state);
  return { firstClear: true, rewards: parseRewards(stage.reward), stage };
}

const stagesByMap = {};
for (const stage of stageInfoData) {
  (stagesByMap[stage.map_id] ||= []).push(stage);
}
Object.values(stagesByMap).forEach((stages) => stages.sort((a, b) => (a.stage_num || 0) - (b.stage_num || 0)));

function stagePosition(index, total) {
  const marginX = 60;
  const marginY = 50;
  const rowSize = Math.ceil(total / 2);
  const row = Math.floor(index / rowSize);
  const col = index % rowSize;
  return {
    x: Math.round(marginX + (row % 2 ? rowSize - 1 - col : col) * ((800 - marginX * 2) / Math.max(rowSize - 1, 1))),
    y: Math.round(marginY + row * (400 - marginY * 2)),
  };
}

function brokenText(value) {
  return /[-�]/.test(String(value ?? ''));
}

function chapterName(id) {
  return '第' + (CHAPTERS[id] || id) + '章';
}

function stageName(stage, index) {
  const name = String(stage?.stage_name || '').trim();
  return name && !brokenText(name) ? name : '第 ' + (index + 1) + ' 关';
}

function atlasStyle(name) {
  const frame = frames.get(name);
  if (!frame) return '';
  return [
    '--atlas-size:', (ATLAS_W * 100 / ART_W).toFixed(5), 'cqw;',
    '--frame-width:', (frame.width * 100 / ART_W).toFixed(5), 'cqw;',
    '--frame-height:', (frame.height * 100 / ART_W).toFixed(5), 'cqw;',
    '--frame-offset-x:', (-frame.x * 100 / ART_W).toFixed(5), 'cqw;',
    '--frame-offset-y:', (-frame.y * 100 / ART_W).toFixed(5), 'cqw;',
  ].join('');
}

export class WorldMapView {
  constructor(player, cardDb, cardInventory, inventory, hooks = {}) {
    this.player = player;
    this.cardDb = cardDb;
    this.cardInventory = cardInventory;
    this.inventory = inventory;
    this.onPlayerUpdate = hooks.onPlayerUpdate;
    this.onNavigate = hooks.onNavigate;
    this.state = loadState();
    this.selectedChapter = null;
    this.selectedMap = null; // null=地图选择, 'continent'=冒险大陆, 'forest'=悲伤密林
  }

  render(root) {
    root.innerHTML = '<div class="page worldmap-page" style="position:absolute;inset:0;"><div class="worldmap-content" id="worldmap-content" style="position:absolute;inset:0;"></div><p class="bag-toast hidden" id="worldmap-toast"></p></div>';
    if (this.selectedMap === null) this.renderMapSelect(root);
    else this.renderMap(root);
  }

  renderMapSelect(root) {
    const content = root.querySelector('#worldmap-content');
    const modalWin = root.closest('.city-modal-window');
    if (modalWin) modalWin.style.background = 'transparent';
    content.innerHTML = `
      <div class="worldmap-select-art" style="background-image:url('${BOSS_MAP_SELECT_ART}');--world-art-ratio:${ART_W}/${ART_H}">
        <div class="worldmap-select-hotspots">
          <article class="worldmap-destination-row available" data-destination="continent">
            <button type="button" class="map-select-btn" data-map="continent">冒险大陆</button>
            <div class="worldmap-destination-info"><span>开放时段：全天</span><span>船票：免费</span></div>
            <button type="button" class="map-go-btn" data-map="continent">立即前往 &gt;&gt;</button>
          </article>
          <article class="worldmap-destination-row available" data-destination="forest">
            <button type="button" class="map-select-btn" data-map="forest">悲伤密林</button>
            <div class="worldmap-destination-info"><span>开放时段：全天</span><span>船票：免费</span></div>
            <button type="button" class="map-go-btn" data-map="forest">立即前往 &gt;&gt;</button>
          </article>
          <article class="worldmap-destination-row locked" data-destination="temple">
            <span class="map-select-btn">海底神殿</span>
            <div class="worldmap-destination-info"><span>开放时段：20:00-21:00</span><span>船票：免费</span></div>
            <span class="worldmap-map-locked">暂未开放</span>
          </article>
          <article class="worldmap-destination-row locked" data-destination="locked-1">
            <span class="map-select-btn">暂未开放</span>
            <div class="worldmap-destination-info"><span>开放时段：暂未开放</span><span>船票：免费</span></div>
            <span class="worldmap-map-locked">立即前往 &gt;&gt;</span>
          </article>
          <article class="worldmap-destination-row locked" data-destination="locked-2">
            <span class="map-select-btn">暂未开放</span>
            <div class="worldmap-destination-info"><span>开放时段：暂未开放</span><span>船票：免费</span></div>
            <span class="worldmap-map-locked">立即前往 &gt;&gt;</span>
          </article>
        </div>
      </div>
    `;
    content.querySelectorAll('[data-map="continent"]').forEach(b => {
      if (b.classList.contains('map-go-btn')) b.addEventListener('click', () => { this.selectedMap = 'continent'; this.renderMap(root); });
    });
    content.querySelectorAll('[data-map="forest"]').forEach(b => {
      if (b.classList.contains('map-go-btn')) b.addEventListener('click', () => { this.selectedMap = 'forest'; this._renderForest(root); });
    });
  }

  _renderForest(root) {
    const content = root.querySelector('#worldmap-content');
    const BOSSES = BOSS_LIST;

    content.innerHTML = `
      <div class="worldmap-select-art worldmap-select-art-muted" style="background-image:url('${BOSS_MAP_SELECT_ART}')"></div>
      <div style="position:absolute;inset:0;">
      <div style="position:relative;width:100%;height:100%;background:linear-gradient(180deg,#1a3a1a 0%,#0d1f0d 50%,#061206 100%);color:#fff;overflow:auto;padding:20px;">
        <button type="button" style="position:absolute;top:10px;left:10px;background:#333;color:#fff;border:none;padding:6px 12px;cursor:pointer;border-radius:4px;"
          onclick="arguments[0].target.closest('#worldmap-content').__back?.()">← 返回地图</button>
        <h2 style="text-align:center;font-size:22px;font-weight:700;margin:30px 0 8px;">悲伤密林 · BOSS试炼</h2>
        <p style="text-align:center;color:#8ac;font-size:13px;margin:0 0 20px;">痴情的多特→ 愤怒的格拉沃 → 火焰的复仇→ 森林的反击→ 极寒地的报复</p>
        <div id="forest-bosses" style="display:flex;flex-direction:column;gap:12px;max-width:620px;margin:0 auto;">
          ${BOSSES.map((b,i) => {
            const cleared = isBossCleared(b.id) || this.state.clearedMaps?.['forest']?.[b.id];
            const legacyPrevCleared = i === 0
              || this.state.clearedMaps?.['forest']?.[BOSSES[i - 1].id];
            const locked = !cleared && !isBossUnlocked(b.id) && !legacyPrevCleared;
            return `<div style="display:flex;align-items:center;gap:14px;padding:14px;background:${cleared?'linear-gradient(135deg,#1a2e1a,#1a1a2e)':locked?'linear-gradient(135deg,#111,#1a1a1a)':'linear-gradient(135deg,#2a1a1a,#1a1a2a)'};border:1px solid ${cleared?'#3a5a3a':locked?'#333':'#5a3a2a'};border-radius:8px;cursor:${locked?'not-allowed':'pointer'};opacity:${locked?'0.5':'1'};" class="boss-entry" data-boss-idx="${i}" ${locked?'title=\"需先击败上一个BOSS\"':''}>
              <div style="width:64px;height:64px;border:2px solid ${cleared?'#6a6':locked?'#444':'#c96'};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;background:rgba(0,0,0,0.3);">
                ${cleared?'✓':locked?'🔒':'💀'}
              </div>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="color:${cleared?'#6a6':locked?'#555':'#f96'};font-weight:700;font-size:16px;">【${b.order}】${b.name}</span>
                  ${cleared?'<span style="color:#6a6;font-size:11px;">已击败</span>':locked?'<span style="color:#555;font-size:11px;">未解锁</span>':''}
                </div>
                <div style="color:#aaa;font-size:11px;margin:3px 0;">${b.img} — ${b.skills}</div>
                <div style="color:#fd6;font-size:11px;">${b.reward} | 🧬${b.dna}</div>
                ${!locked ? `<div style="display:flex;gap:4px;margin-top:6px;">
                  <button class="diff-btn" data-idx="${i}" data-dif="EASY" style="padding:3px 8px;background:#2a5;color:#fff;border:1px solid #3b6;border-radius:3px;cursor:pointer;font-size:10px;">简单</button>
                  <button class="diff-btn" data-idx="${i}" data-dif="NORM" style="padding:3px 8px;background:#ca0;color:#fff;border:1px solid #db2;border-radius:3px;cursor:pointer;font-size:10px;">普通</button>
                  <button class="diff-btn" data-idx="${i}" data-dif="HARD" style="padding:3px 8px;background:#c22;color:#fff;border:1px solid #d44;border-radius:3px;cursor:pointer;font-size:10px;">困难</button>
                </div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
        <div id="boss-dialog" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:999;align-items:center;justify-content:center;"></div>
      </div>
    `;

    content.querySelector('button').addEventListener('click', () => { this.selectedMap = null; this.renderMapSelect(root); });

    content.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = BOSSES[Number(btn.dataset.idx)];
        const dif = btn.dataset.dif;
        const mult = dif==='EASY'?1:dif==='NORM'?1.5:2;
        const dl = dif==='EASY'?'简单':dif==='NORM'?'普通':'困难';
        const dHp = Math.round(b.hp * mult); const dAtk = Math.round(b.atk * mult);
        // 确认对话框
        const dia = content.querySelector('#boss-dialog');
        dia.style.display = 'flex';
        dia.innerHTML = `<div style="background:#1a1a2e;border:2px solid #c96;border-radius:10px;padding:24px;max-width:420px;text-align:center;">
          <img src="/sprites/cards/${b.sprite}.png" style="width:100px;height:100px;object-fit:contain;margin-bottom:8px;">
          <h3 style="color:#f96;margin:0 0 4px;">${String(b.name).replace(/([^)]*)$/, '')}(${dl})</h3>
          <p style="color:#aaa;font-size:11px;margin:0;">${b.img}</p>
          <p style="color:#ccc;font-style:italic;margin:8px 0;">"${b.dialog}"</p>
          <div style="text-align:left;color:#aaa;font-size:12px;margin:8px 0;">
            <div>❤️ HP: ${dHp} | ⚔️ ATK: ${dAtk}</div>
            <div>🎯 ${b.skills}</div><div>🏆 ${b.reward} | 🧬 ${b.dna}</div>
          </div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
            <button style="padding:8px 20px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;" class="boss-cancel">取消</button>
            <button style="padding:8px 20px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:700;" class="boss-fight">⚔️ 挑战</button>
          </div></div>`;
        dia.querySelector('.boss-cancel').addEventListener('click', () => { dia.style.display = 'none'; });
        dia.querySelector('.boss-fight').addEventListener('click', () => {
          dia.style.display = 'none';
          // BOSS 战：创建 BOSS 房间(选难度)，大厅可加入/组队(1VE/2VE/3VE)
          if (typeof this.onNavigate === 'function') {
            this.onNavigate('room', { createBoss: { bossId: b.id, difficulty: dl } });
            this._pendingBoss = b;
            this._pendingBossRoot = root;
          }
        });
      });
    });
  }

  /** BOSS战斗获胜后调用 */
  onBossCleared(bossId) {
    if (!this.state.clearedMaps) this.state.clearedMaps = {};
    if (!this.state.clearedMaps['forest']) this.state.clearedMaps['forest'] = {};
    this.state.clearedMaps['forest'][bossId] = true;
    markBossCleared(bossId);
    saveState(this.state);
  }

  renderMap(root) {
    const content = root.querySelector('#worldmap-content');
    const modalWin = root.closest('.city-modal-window');
    if (modalWin) modalWin.style.background = 'transparent';
    if (this.selectedChapter !== null) {
      this.renderChapter(content, root);
      return;
    }

    const lines = worldMapData.map((chapter, index) => {
      if (!index) return '';
      const previous = worldMapData[index - 1];
      return '<line x1="' + previous.x + '" y1="' + previous.y + '" x2="' + chapter.x + '" y2="' + chapter.y + '" />';
    }).join('');

    const chapters = worldMapData.map((chapter) => {
      const unlocked = this.state.chapterUnlocked >= chapter.id;
      const stages = stagesByMap[chapter.id] || [];
      const complete = stages.filter((stage) => this.state.stageClaimed.includes(stage.id)).length;
      const percent = stages.length ? Math.round(complete / stages.length * 100) : 0;
      const frame = (unlocked ? 'over_' : 'lock_') + chapter.res;
      return [
        '<button type="button" class="worldmap-node ', unlocked ? 'unlocked' : 'locked', '" data-chapter="', chapter.id,
        '" style="left:', chapter.x / LOGICAL_W * 100, '%;top:', chapter.y / LOGICAL_H * 100, '%;"', unlocked ? '' : ' disabled', '>',
        '<span class="worldmap-region-sprite" style="', atlasStyle(frame), '"></span>',
        unlocked ? '' : '<span class="worldmap-lock-sprite" style="' + atlasStyle('map_node_lock') + '"></span>',
        '<span class="worldmap-node-label">', chapterName(chapter.id), '</span>',
        unlocked ? '<span class="worldmap-node-pct">' + percent + '%</span>' : '<span class="worldmap-node-lock">锁定</span>',
        '</button>',
      ].join('');
    }).join('');

    content.innerHTML = [
      '<div class="worldmap-overlay"><div class="worldmap-header"><div class="worldmap-title-row">',
      '<button type="button" class="worldmap-back-btn" id="wm-back-main">返回主城</button><h1>世界地图</h1></div>',
      '<p class="worldmap-hint">选择章节开启主线征程。已开放 ', Math.min(this.state.chapterUnlocked, worldMapData.length), ' / ', worldMapData.length, ' 章</p></div>',
      '<div class="worldmap-img-wrap" aria-label="世界地图"><div class="worldmap-art" role="img" aria-label="世界地图地形"></div>',
      '<svg class="worldmap-svg" viewBox="0 0 ', LOGICAL_W, ' ', LOGICAL_H, '" aria-hidden="true">', lines, '</svg>', chapters, '</div></div>',
    ].join('');

    this.mountRandomToggle(content.querySelector('.worldmap-title-row'), root);
    content.querySelectorAll('.worldmap-node.unlocked').forEach((button) => button.addEventListener('click', () => {
      audio.playSfx('click');
      this.selectedChapter = Number(button.dataset.chapter);
      this.renderMap(root);
    }));
    content.querySelector('#wm-back-main')?.addEventListener('click', () => {
      audio.playSfx('click');
      if (this.selectedMap === 'continent') { this.selectedMap = null; this.renderMapSelect(root); }
      else if (this.selectedMap === 'forest') { this.selectedMap = null; this.renderMapSelect(root); }
      else this.onNavigate?.('main');
    });
  }

  renderChapter(content, root) {
    const chapter = worldMapData.find((entry) => entry.id === this.selectedChapter);
    if (!chapter) {
      this.selectedChapter = null;
      this.renderMap(root);
      return;
    }
    const stages = stagesByMap[chapter.id] || [];
    const bg = stages[0]?.mapBg_res || 1;
    const lines = stages.map((stage, index) => {
      if (!index) return '';
      const previous = stagePosition(index - 1, stages.length);
      const current = stagePosition(index, stages.length);
      return '<line x1="' + previous.x + '" y1="' + previous.y + '" x2="' + current.x + '" y2="' + current.y + '" />';
    }).join('');
    const nodes = stages.map((stage, index) => {
      const position = stagePosition(index, stages.length);
      const claimed = this.state.stageClaimed.includes(stage.id);
      const unlocked = claimed || index === 0 || this.state.stageClaimed.includes(stages[index - 1].id);
      return [
        '<button type="button" class="ch-stage-node ', claimed ? 'claimed' : unlocked ? 'unlocked' : 'locked',
        '" data-sid="', stage.id, '" style="left:', position.x / 8, '%;top:', position.y / 4, '%;" title="', escapeHtml(stageName(stage, index)), '">',
        unlocked ? '<span class="ch-stage-num">' + stage.stage_num + '</span>' : '<span class="ch-stage-lock" aria-hidden="true"></span>',
        claimed ? '<span class="ch-stage-check">已领</span>' : unlocked ? '<span class="ch-stage-chest">奖励</span>' : '',
        '<span class="ch-stage-name">', escapeHtml(stageName(stage, index)), '</span></button>',
      ].join('');
    }).join('');

    content.innerHTML = [
      '<div class="ch-stage-view"><div class="ch-stage-top"><button type="button" class="worldmap-back-btn" id="ch-back">返回地图</button>',
      '<h2>', chapterName(chapter.id), '</h2><span class="ch-stage-count">', stages.length, ' 关</span></div>',
      '<div class="ch-stage-map" style="aspect-ratio:1363/768;"><img src="/battle/background/map-', bg, '.png" alt="', chapterName(chapter.id), '关卡地图" class="ch-stage-bg" />',
      '<svg class="ch-stage-svg" viewBox="0 0 800 400" aria-hidden="true">', lines, '</svg>', nodes, '</div>',
      '<div class="ch-stage-detail" id="ch-stage-detail"><p>选择关卡查看主线奖励</p></div></div>',
    ].join('');

    this.mountRandomToggle(content.querySelector('.ch-stage-top'), root);
    content.querySelector('#ch-back')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.selectedChapter = null;
      this.renderMap(root);
    });
    content.querySelectorAll('.ch-stage-node:not(.locked)').forEach((button) => button.addEventListener('click', () => {
      const stage = stageInfoData.find((entry) => entry.id === Number(button.dataset.sid));
      if (stage) this.showStageDetail(content, root, stage, stages.findIndex((entry) => entry.id === stage.id));
    }));
  }

  showStageDetail(content, root, stage, index) {
    const detail = content.querySelector('#ch-stage-detail');
    const claimed = this.state.stageClaimed.includes(stage.id);
    const desc = brokenText(stage.desc) ? '完成关卡后可获得主线进度与特殊奖励。' : (stage.desc || '完成关卡后可获得主线进度与特殊奖励。');
    if (claimed) {
      detail.innerHTML = '<div class="ch-stage-detail-inner claimed"><div class="ch-detail-left"><h3>\u5df2\u5b8c\u6210\uff1a' + escapeHtml(stageName(stage, index)) + '</h3><p>' + escapeHtml(desc) + '</p><p class="ch-detail-muted">\u5956\u52b1\u5df2\u9886\u53d6\uff1b\u53ef\u91cd\u590d\u6311\u6218\uff0c\u4e0d\u91cd\u590d\u53d1\u5956\u3002</p><div class="ch-detail-btns"><button type="button" class="ch-battle-btn ch-battle-replay">\u518d\u6b21\u6311\u6218</button></div></div><div class="ch-detail-right"><span class="ch-chest-icon">🎁</span><span>\u5df2\u9886\u53d6</span></div></div>';
      detail.querySelector('.ch-battle-replay')?.addEventListener('click', () => {
        audio.playSfx('click');
        this.onNavigate?.('battle', { stageId: stage.id, chapterId: this.selectedChapter, enemyRandomMode: this.state.randomEnemy });
      });
      return;
    }    const enemy = brokenText(stage.enemy_name) ? '未知' : (stage.enemy_name || '未知');
    const rewards = parseRewards(stage.reward);
    detail.innerHTML = [
      '<div class="ch-stage-detail-inner"><div class="ch-detail-left"><h3>主线：', escapeHtml(stageName(stage, index)), '</h3><p>', escapeHtml(desc), '</p>',
      '<p class="ch-detail-muted">敌人：', escapeHtml(enemy), '</p><p class="ch-detail-muted">特殊奖励：', escapeHtml(rewardText(rewards)), '</p>',
      '<div class="ch-detail-btns"><button type="button" class="ch-battle-btn">进入战斗</button></div><p class="ch-detail-muted">首次通关后自动发放特殊奖励。</p></div>',
      '<div class="ch-detail-right"><span class="ch-chest-icon">🎁</span><span class="ch-detail-ready">未领取</span></div></div>',
    ].join('');

    detail.querySelector('.ch-battle-btn')?.addEventListener('click', () => {
      audio.playSfx('click');
      saveState(this.state);
      // 野外冒险：直接创建该关卡房间(房间名=关卡名)，进入准备房间后可调整卡牌再开始
      this.onNavigate?.('room', {
        stageId: stage.id,
        mapId: stage.map_id,
        stageName: stageName(stage, index),
        enemyRandomMode: this.state.randomEnemy,
        autoCreate: true,
      });
    });
  }

  claimStage(root, content, stageId, rewards) {
    if (this.state.stageClaimed.includes(stageId)) return;
    this.state.stageClaimed.push(stageId);
    this.state.chapterUnlocked = Math.max(this.state.chapterUnlocked, this.selectedChapter + 1);
    const message = ['主线奖励'];
    rewards.forEach((reward) => {
      if (reward.type === 3) {
        this.player.gold = (this.player.gold || 0) + reward.amount;
        message.push('金币 ' + reward.amount);
      } else if (reward.type === 27) {
        this.player.exp = (this.player.exp || 0) + reward.amount;
        message.push('经验 ' + reward.amount);
      } else if (reward.type === 2 && this.cardInventory) {
        const result = this.cardInventory.addCard(reward.amount, 0, { craftQuality: 1 });
        if (result.ok) message.push('卡牌 ' + (this.cardDb.getById(reward.amount)?.name || reward.amount));
      } else if (reward.type === 1 && this.inventory) {
        this.inventory.addItem(reward.amount, 1);
        message.push('道具 ' + reward.amount);
      }
    });
    saveState(this.state);
    this.onPlayerUpdate?.();
    this.toast(root, message.join(' · '));
    this.renderChapter(content, root);
  }

  mountRandomToggle(host, root) {
    if (!host) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `worldmap-random-toggle${this.state.randomEnemy ? ' active' : ''}`;
    button.textContent = this.state.randomEnemy ? '敌方卡组：随机' : '敌方卡组：固定';
    button.title = '固定模式严格使用每关配置；随机模式仅随机已解锁卡池。';
    button.addEventListener('click', () => {
      this.state.randomEnemy = !this.state.randomEnemy;
      saveState(this.state);
      audio.playSfx('click');
      this.renderMap(root);
    });
    host.append(button);
  }

  toast(root, message) {
    const toast = root.querySelector('#worldmap-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
  }
}
