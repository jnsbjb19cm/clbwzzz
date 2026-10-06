import { ADVENTURE_DIFFICULTIES, FOREST_BOSS_IDS, TEMPLE_BOSS_IDS, isAdventureStageUnlocked, isForestUnlocked, BOSS_REGION_PREREQUISITES_ENABLED } from '../data/AdventureCampaign.js';
import { getBossById } from '../data/bossList.js';
import { isBossCleared, isBossUnlocked } from '../core/BossProgress.js';
import './AdventureMapReset.css';

const ART = '/adventure-reset/';
const routes = [
  [[18,66],[14,70],[10,76],[5,84],[12,91],[21,93],[29,91],[36,88],[46,91],[52,89],[59,91],[65,83],[76,85],[82,78],[83,70],[73,62]],
  [[84,10],[90,11],[96,17],[95,27],[91,36],[84,29],[80,19],[73,10],[65,9],[60,15],[51,15],[45,13],[37,12],[23,14],[15,20],[28,42]],
];
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clears = view => view.state.stageClaimed || [];
// 仅地图标识；不改变关卡出怪、难度或解锁规则。
const CHALLENGE_PORTRAITS = [[7,54,25,58],[5,27,45,56]];
function challengeCards(stage, db) {
  const a=stage.adventure;
  if (!a.final && a.node!==4) return null;
  return (a.final ? [56,55,58] : [CHALLENGE_PORTRAITS[a.route][a.act-1]]).map(id=>db.getById(id));
}
function challengeEmblem(cards, final) {
  return `<span class="reset-challenge-emblem ${final?'reset-trio-emblem':''}" aria-hidden="true"><img class="reset-challenge-frame" src="${ART}challenge-frame.png" alt="">${cards.map((card,index)=>`<img class="reset-challenge-portrait reset-portrait-${index}" data-portrait-card="${card.id}" src="/sprites/cards/${card.spriteRes}.png" alt="">`).join('')}</span>`;
}
function setup(root, html) {
  const content = root.querySelector('#worldmap-content');
  content.innerHTML = html;
  return content;
}

export function renderAdventureDestinations(view, root) {
  if (view.onReturnToPort && root.closest('.adventure-scene')) return view.onReturnToPort();
  return view.renderLegacyMapSelect(root);
}

export function renderAdventureMap(view, root) {
  view.refreshProgress?.();
  const stages = view.cardDb.stages.filter(s => s.adventure?.difficulty === 0);
  const variants = stage => view.cardDb.stages.filter(s => s.adventure && s.adventure.route === stage.adventure.route && s.adventure.index === stage.adventure.index && s.adventure.final === stage.adventure.final).sort((a,b)=>a.adventure.difficulty-b.adventure.difficulty);
  const buttons = stages.map(stage => {
    const a = stage.adventure;
    const [x,y] = a.final ? [52,48] : routes[a.route][a.index - 1];
    const unlocked = variants(stage).some(s => isAdventureStageUnlocked(s, clears(view)));
    const cards=challengeCards(stage,view.cardDb);
    const clearedIds=new Set(clears(view).map(Number));
    const cleared=cards ? variants(stage).some(s=>clearedIds.has(s.id)) : clearedIds.has(stage.id);
    const description=`${stage.stage_name}${cards?' · '+cards.map(c=>c.name).join('、'):''}${cleared?' 已通关':' 未通关'}${unlocked?'':' 未解锁'}`;
    const clearBadge = cards && cleared ? '<span class="reset-clear-badge">已通关</span>' : '';
    return `<button class="reset-node ${cards?'reset-challenge-node':''} ${a.final?'reset-final-node':''} ${cleared?'reset-cleared':''}" style="left:${x}%;top:${y}%" data-stage="${stage.id}" ${unlocked?'':'disabled'} aria-label="${escape(description)}" title="${escape(description)}">${cards?challengeEmblem(cards,a.final):`<img src="${ART}${unlocked?'node.png':'node-locked.png'}" alt="">`}<span class="reset-node-label">${a.final?'最终关':`${a.act}-${a.node}${a.challenge?' ◆':''}`}</span>${clearBadge}</button>`;
  }).join('');
  const content = setup(root, `<section class="reset-campaign"><header><button data-back>← 目的地</button><strong>冒险大陆</strong><small>左键点击关卡选择难度</small></header><div class="reset-map-frame"><div class="reset-map-canvas">${buttons}<span class="reset-route-label reset-plant-label">植物线</span><span class="reset-route-label reset-monster-label">怪物线</span></div></div>${difficultyMenuMarkup()}</section>`);
  content.querySelector('[data-back]').onclick = () => { view.selectedMap = null; renderAdventureDestinations(view, root); };
  const menu = content.querySelector('.reset-boss-difficulty');
  let selectedVariants = [];
  content.querySelectorAll('[data-stage]').forEach(button => button.onclick = event => {
    const stage = stages.find(s => s.id === Number(button.dataset.stage));
    selectedVariants = variants(stage);
    menu.querySelectorAll('[data-difficulty]').forEach(option => {
      const candidate = selectedVariants.find(s => ADVENTURE_DIFFICULTIES[s.adventure.difficulty] === option.dataset.difficulty);
      option.disabled = !candidate || !isAdventureStageUnlocked(candidate, clears(view));
      option.title = option.disabled ? '该难度的前置关卡尚未通过' : '';
    });
    openDifficultyMenu(menu, event, button);
  });
  menu.querySelectorAll('[data-difficulty]').forEach(button => button.onclick = () => {
    const stage = selectedVariants.find(s => ADVENTURE_DIFFICULTIES[s.adventure.difficulty] === button.dataset.difficulty);
    if (!stage || !isAdventureStageUnlocked(stage, clears(view))) return;
    menu.hidePopover();
    view.onNavigate?.('room', { stageId: stage.id, mapId: stage.map_id, stageName: stage.stage_name, enemyRandomMode: false, autoCreate: true });
  });
}

function difficultyMenuMarkup() {
  return `<div class="reset-boss-difficulty" popover="auto" role="menu" aria-label="挑战难度">${ADVENTURE_DIFFICULTIES.map(d=>`<button role="menuitem" data-difficulty="${d}">${d}</button>`).join('')}</div>`;
}

function openDifficultyMenu(menu, event, button) {
  menu.showPopover();
  const anchor = button.getBoundingClientRect();
  const x = event.detail ? event.clientX : anchor.left;
  const y = event.detail ? event.clientY : anchor.bottom;
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - menu.offsetWidth - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y + 6, innerHeight - menu.offsetHeight - 4))}px`;
  if (!event.detail) menu.querySelector('button:not(:disabled)')?.focus();
}

const FOREST_ART = {
  // The unit thumbnail is an extracted effect ring; the card portrait is the wizard.
  boss_dot: '/sprites/cards/75.png',
  boss_gravo: `${ART}gravo.png`,
  boss_ice: `${ART}anna.png`,
  boss_forest: `${ART}lolita.png`,
};

// Character image boxes registered to the 960×576 reference; the background scales with them.
const FOREST_PLACEMENT = {
  boss_ice: [38.8, 12.8, 12.4, '1145/1374'],
  boss_gravo: [79.5, 9.5, 12.1, '1086/1448'],
  boss_forest: [13.3, 50.2, 15.5, '1270/1239'],
  boss_dot: [78.2, 63.2, 16.4, '224/242'],
};

// Locked presentation is separate from unlock policy; this release keeps both regions open.
export function bossPortraitMarkup(boss, unlocked, forest = false, cleared = isBossCleared(boss.id)) {
  const src = forest ? FOREST_ART[boss.id] : boss.referenceArt || `/sprites/cards/${boss.sprite}.png`;
  const position = forest ? FOREST_PLACEMENT[boss.id] : null;
  const style = position ? `style="--boss-x:${position[0]}%;--boss-y:${position[1]}%;--boss-width:${position[2]}%;--boss-ratio:${position[3]}"` : '';
  const status = cleared
    ? '<span class="reset-boss-status reset-boss-status-cleared">已通关</span>'
    : (unlocked ? '' : '<span class="reset-boss-status reset-boss-status-locked">未解锁</span>');
  return `<button class="reset-boss-choice ${cleared?'reset-boss-cleared ':''}${unlocked?'':'reset-boss-locked'}" ${style} data-boss="${escape(boss.id)}" ${unlocked?'':'disabled'} aria-haspopup="menu" aria-label="${escape(boss.name)}${cleared?' 已通关':unlocked?' 选择难度':' 未解锁'}"><span class="reset-boss-portrait"><img src="${escape(src)}" alt="">${forest && boss.id==='boss_forest'?'<span class="reset-lolita-butterfly" aria-hidden="true"></span>':''}</span><span class="reset-boss-name">${escape(boss.name)}</span>${status}</button>`;
}

export function renderAdventureBosses(view, root, region) {
  const ids = region === 'temple' ? TEMPLE_BOSS_IDS : FOREST_BOSS_IDS;
  const open = !BOSS_REGION_PREREQUISITES_ENABLED || (isForestUnlocked(clears(view)) && (region !== 'temple' || isBossCleared('boss_forest')));
  if (!open) return renderAdventureDestinations(view, root);
  const forest = region === 'forest';
  const portraits = ids.map(id => getBossById(id)).filter(Boolean).map((b) => {
    const cleared = isBossCleared(b.id) || Boolean(view.state?.clearedMaps?.[region]?.[b.id]);
    return bossPortraitMarkup(b, isBossUnlocked(b.id), forest, cleared);
  }).join('');
  const choices = forest ? `<div class="reset-forest-frame"><nav class="reset-forest-map" aria-label="悲伤密林 BOSS 地图">${portraits}</nav></div>` : `<nav class="reset-boss-choices" aria-label="选择挑战 BOSS">${portraits}</nav>`;
  const content = setup(root, `<section class="reset-boss-list ${forest?'reset-forest':''}"><header><button data-back>← 目的地</button><h2>${forest?'悲伤密林':'海底神殿'}</h2><p>左键点击 BOSS 选择难度</p></header><div class="reset-boss-layout">${choices}</div>${difficultyMenuMarkup()}</section>`);
  content.querySelector('[data-back]').onclick = () => { view.selectedMap = null; renderAdventureDestinations(view, root); };
  const menu = content.querySelector('.reset-boss-difficulty');
  let selectedBoss = null;
  const story = document.createElement('aside');
  story.className = 'reset-boss-story';
  story.id = `reset-boss-story-${region}`;
  story.setAttribute('popover', 'manual');
  story.setAttribute('role', 'tooltip');
  content.append(story);
  const hideStory = () => { if (story.matches(':popover-open')) story.hidePopover(); };
  content.querySelectorAll('[data-boss]').forEach(button => {
    button.setAttribute('aria-describedby', story.id);
    const showStory = () => {
      if (!button.isConnected || menu.matches(':popover-open')) return;
      const boss = getBossById(button.dataset.boss);
      story.innerHTML = `<strong>${escape(boss.name)}</strong><p>${escape(boss.desc || '背景故事待补充。')}</p>${boss.desc ? '' : `<small>已知技能：${escape(boss.skills || '待补充')}</small>`}`;
      if (!story.matches(':popover-open')) story.showPopover();
      const anchor = button.getBoundingClientRect();
      const left = anchor.right + 12 + story.offsetWidth <= innerWidth ? anchor.right + 12 : anchor.left - story.offsetWidth - 12;
      story.style.left = `${Math.max(8, Math.min(left, innerWidth - story.offsetWidth - 8))}px`;
      story.style.top = `${Math.max(8, Math.min(anchor.top, innerHeight - story.offsetHeight - 8))}px`;
    };
    button.addEventListener('pointerenter', showStory);
    button.addEventListener('pointerleave', hideStory);
    // Popover dismissal restores focus synchronously; wait until its toggle is complete.
    button.addEventListener('focus', () => queueMicrotask(() => {
      if (button.matches(':focus-visible')) showStory();
    }));
    button.addEventListener('blur', hideStory);
    button.addEventListener('keydown', event => { if (event.key === 'Escape') hideStory(); });
  });
  content.querySelectorAll('[data-boss]').forEach(button => button.onclick = event => {
    hideStory();
    if (!isBossUnlocked(button.dataset.boss)) return;
    selectedBoss = button.dataset.boss;
    openDifficultyMenu(menu, event, button);
  });
  menu.querySelectorAll('[data-difficulty]').forEach(button => button.onclick = () => {
    if (!selectedBoss || !isBossUnlocked(selectedBoss)) return;
    menu.hidePopover();
    view.onNavigate?.('room', { createBoss: { bossId: selectedBoss, difficulty: button.dataset.difficulty } });
  });
}
