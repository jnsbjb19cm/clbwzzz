// Single-player run rules. No inventory, account currency or network side effects.
export const ENDLESS_VERSION = 1;
export const ENDLESS_NAMES = Object.freeze({ trial: '无尽试炼', expedition: '秘境远征' });
export const STARTER_TEAMS = Object.freeze([
  { id: 'balanced', name: '均衡小队', cards: [1, 2, 3, 7, 9, 22], reserve: [4, 6, 11, 17] },
  { id: 'plants', name: '植物守卫', cards: [1, 2, 4, 7, 9, 22], reserve: [11, 14, 16, 17] },
  { id: 'monsters', name: '怪物突击', cards: [3, 5, 6, 8, 12, 20], reserve: [23, 24, 26, 28] },
]);
export const RUN_ITEMS = Object.freeze({
  fang: { name: '猎手獠牙', kind: '增益', text: '上阵卡牌基础攻击 +10%', atk: .10 },
  bark: { name: '古树护符', kind: '增益', text: '上阵卡牌基础生命 +15%', hp: .15 },
  ember: { name: '余烬契约', kind: '利弊并存', text: '基础攻击 +18%，基础生命 −8%', atk: .18, hp: -.08 },
  pack: { name: '破损补给包', kind: '利弊并存', text: '开战阳光和食物各 +6，基础攻击 −5%', resource: 6, atk: -.05 },
  thorn: { name: '荆棘诅咒', kind: '减益', text: '上阵卡牌基础生命 −10%', hp: -.10 },
  fatigue: { name: '疲惫印记', kind: '减益', text: '上阵卡牌基础攻击 −8%', atk: -.08 },
  flask: { name: '未知药瓶', kind: '随机', text: '获得时随机确定攻击 +10%、生命 +15% 或攻击 −8%；结果立即显示' },
});
export const EVENT_LABELS = Object.freeze({ battle: '战斗', reward: '奖励', random: '随机事件', neutral: '中性事件', negative: '负面事件', swap: '更换卡牌', shop: '流动商店' });

// 2026-10-21 第二批玩法（见 docs/endless-modes-20261020.md「第二批：契约 / 侦察 / 赏金」）：
// 每十层签一项「敌方挑战契约」：明确展示收益（远征币），难度只加机制、不再纯堆攻击和生命。
export const RUN_CONTRACTS = Object.freeze({
  swift: { name: '迅捷之约', text: '敌方移动单位移速 +20%', gold: 60, speed: .20 },
  volley: { name: '齐射之约', text: '敌方远程单位攻击 +18%', gold: 70, rangedAtk: .18 },
  mending: { name: '复苏之约', text: '敌方每 2 秒回复 1.5% 最大生命', gold: 80, regen: .015 },
});
// 每场开战前可选一项「赏金」：达成额外发远征币，失败只记录、不影响本局。
export const RUN_BOUNTIES = Object.freeze({
  flawless: { name: '无瑕防线', text: '本场基地不损失生命', gold: 80 },
  spread: { name: '三路并进', text: '本场至少在 3 条不同路部署卡牌', gold: 60 },
  focused: { name: '精兵简政', text: '本场最多使用 4 种不同卡牌', gold: 70 },
});
const THEMES = [
  { name: '林缘遭遇', plants: [1, 2, 4, 7, 9], monsters: [3, 5, 6, 8, 12] },
  { name: '盾阵与突袭', plants: [2, 11, 16, 21, 68], monsters: [5, 8, 23, 27, 31] },
  { name: '寒霜封锁', plants: [1, 4, 17, 25, 54], monsters: [6, 12, 28, 38, 77] },
  { name: '补给争夺', plants: [7, 9, 19, 22, 36], monsters: [3, 20, 24, 26, 51] },
  { name: '纵深火力', plants: [9, 16, 18, 25, 70], monsters: [6, 27, 28, 48, 63] },
  { name: '混编精锐', plants: [17, 21, 36, 54, 58], monsters: [23, 31, 35, 45, 75] },
];
export const RUN_EVENTS = Object.freeze({
  spring: { kind: 'reward', name: '林间泉水', text: '树根之间涌出清泉。带走补给，或让受损的基地得到休整。', choices: [
    { id: 'spring-heal', title: '就地休整', detail: '基地恢复 250 生命', heal: 250 },
    { id: 'spring-gold', title: '收集沿途补给', detail: '获得 45 远征币', gold: 45 }] },
  cache: { kind: 'reward', name: '失落的军需箱', text: '封条已经松动，里面的物资只能带走一份。', choices: [
    { id: 'cache-bark', title: '取走古树护符', detail: '本局卡牌基础生命 +15% · 占用 1 个道具位', item: 'bark' },
    { id: 'cache-gold', title: '取走钱袋', detail: '获得 75 远征币', gold: 75 }] },
  caravan: { kind: 'neutral', name: '迷途商队', text: '商队愿意用一件货物换取路费，你也可以不做交易。', choices: [
    { id: 'caravan-pack', title: '购买补给包', detail: '花费 20 币；开战双资源 +6，基础攻击 −5%', cost: 20, item: 'pack' },
    { id: 'caravan-leave', title: '交换路讯后离开', detail: '不获得奖励，也不损失资产' }] },
  shrine: { kind: 'neutral', name: '净化石碑', text: '石碑可以抹去一次不利印记。已有的其他道具不受影响。', choices: [
    { id: 'shrine-cleanse', title: '净化一件负面道具', detail: '花费 30 币；移除最早获得的荆棘诅咒或疲惫印记', cost: 30, cleanse: true },
    { id: 'shrine-leave', title: '保持现状', detail: '不发生变化' }] },
  ruins: { kind: 'neutral', name: '回声遗迹', text: '深入遗迹可能找到财富，也可能被落石击中。结果在本节点固定，刷新不会重抽。', choices: [
    { id: 'ruins-risk', title: '深入搜寻', detail: '60% 获得 90 币；40% 基地损失 120 生命（不致死）', risk: true },
    { id: 'ruins-safe', title: '只搜寻入口', detail: '稳妥获得 15 远征币', gold: 15 }] },
  bridge: { kind: 'negative', name: '断裂吊桥', text: '回头的路已被封住。修桥需要材料，强行通过则会损伤基地。', choices: [
    { id: 'bridge-pay', title: '购买木料修桥', detail: '花费 25 远征币，无其他损失', cost: 25 },
    { id: 'bridge-cross', title: '强行通过', detail: '基地损失 150 生命（不致死）', damage: 150 }] },
});

export function runEventPresentation(run) {
  return RUN_EVENTS[run.event?.variant] || { name: EVENT_LABELS[run.event?.kind], text: '选择一项行动；确认后才会结算收益或代价。' };
}
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function requireRule(value, message) { if (!value) throw new Error(message); }
const copy = value => JSON.parse(JSON.stringify(value));
export function runRandom(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (values, random) => values[Math.floor(random() * values.length)];
function log(run, text) { run.journal.unshift(text); run.journal = run.journal.slice(0, 30); }
function addCard(run, cardId) {
  requireRule(run.roster.length < 60, '本局卡牌储备已满（60 张）');
  const uid = `card-${run.nextCard++}`;
  run.roster.push({ uid, cardId, craftQuality: 2, star: 0, strengthLv: 0 });
  return uid;
}
function addItem(run, id) {
  requireRule(run.items.length < 12, '本局道具已满（12 件）');
  let resolved = id;
  if (id === 'flask') resolved = pick(['fang', 'bark', 'fatigue'], runRandom(`${run.seed}:${run.step}:flask:${run.items.length}`));
  requireRule(RUN_ITEMS[resolved], '道具不存在');
  run.items.push(resolved);
  log(run, `${id === 'flask' ? '未知药瓶结果：' : '获得：'}${RUN_ITEMS[resolved].name}`);
}
export function createEndlessRun({ mode, seed, starter = 'balanced', ownedDeck = [], ownedReserve = [] }) {
  requireRule(mode in ENDLESS_NAMES, '玩法不存在');
  const team = STARTER_TEAMS.find(t => t.id === starter);
  requireRule(team || starter === 'owned', '初始卡组不存在');
  const run = { version: ENDLESS_VERSION, id: String(seed), seed: String(seed), mode, source: starter,
    phase: mode === 'trial' ? 'ready' : 'route', floor: 1, step: 1, battles: 0, cleared: 0,
    gold: 60, baseHp: 1000, baseMaxHp: 1000, items: [], roster: [], deck: [], nextCard: 1,
    sinceCombat: 0, event: null, swapsLeft: 0, journal: [], attempt: null,
    // 第二批：十层契约（可叠加，带封顶）与本场赏金（每场重选）。旧存档缺这两个字段时按空值处理。
    contracts: [], bounty: null };
  const entries = starter === 'owned' ? ownedDeck : team.cards.map(cardId => ({ cardId }));
  requireRule(entries.length >= 1 && entries.length <= 10, '请选择 1–10 张上阵卡牌');
  for (const entry of entries) {
    const uid = addCard(run, Number(entry.cardId));
    const stars = Math.max(0, Number(entry.strengthLv ?? entry.star) || 0);
    Object.assign(run.roster.at(-1), copy(entry), { uid, cardId: Number(entry.cardId), star: stars, strengthLv: stars });
    run.deck.push(uid);
  }
  // Personal cards are copies. Expedition reserves are earned inside the run.
  if (mode === 'trial') {
    const reserve = starter === 'owned' ? ownedReserve : team.reserve.map(cardId => ({ cardId }));
    for (const entry of reserve.slice(0, 60 - run.roster.length)) {
      const uid = addCard(run, Number(entry.cardId));
      const stars = Math.max(0, Number(entry.strengthLv ?? entry.star) || 0);
      Object.assign(run.roster.at(-1), copy(entry), { uid, cardId: Number(entry.cardId), star: stars, strengthLv: stars });
    }
  }
  log(run, '启程：本局资产独立，不修改永久卡牌和背包。');
  return run;
}
export function runModifiers(run) {
  let atk = 1, hp = 1, resource = 0;
  for (const id of run.items) { const item = RUN_ITEMS[id]; if (!item) continue; atk += item.atk || 0; hp += item.hp || 0; resource += item.resource || 0; }
  return { atk: clamp(atk, .5, 2.5), hp: clamp(hp, .5, 2.5), resource: clamp(resource, 0, 30) };
}
/** 已叠加契约对敌方的机制加成（可叠加、带封顶，绝不改敌方基础攻击/生命）。 */
export function runContractModifiers(run) {
  let speed = 0, rangedAtk = 0, regen = 0;
  for (const id of run.contracts ?? []) {
    const contract = RUN_CONTRACTS[id];
    if (!contract) continue;
    speed += contract.speed || 0; rangedAtk += contract.rangedAtk || 0; regen += contract.regen || 0;
  }
  return { speed: Math.min(.6, speed), rangedAtk: Math.min(.54, rangedAtk), regen: Math.min(.045, regen) };
}
/** 十层契约：每十层从三项里必须选一项（难度换补给）。 */
export function runContractChoices(run) {
  requireRule(run.phase === 'contract', '当前没有契约可选');
  return Object.entries(RUN_CONTRACTS).map(([id, contract]) => ({ id, ...contract }));
}
export function chooseRunContract(run, id) {
  requireRule(run.phase === 'contract', '当前没有契约可选');
  const contract = RUN_CONTRACTS[id]; requireRule(contract, '契约不存在');
  const next = copy(run);
  next.contracts = [...(next.contracts ?? []), id];
  next.gold += contract.gold;
  log(next, `签订契约「${contract.name}」：${contract.text}，立得 ${contract.gold} 远征币`);
  next.phase = next.mode === 'trial' ? (next.cleared % 5 === 0 ? 'camp' : 'ready') : 'route';
  if (next.phase === 'camp') { next.swapsLeft = 1; next.campRepaired = false; }
  return next;
}
/** 五层侦察：预告当前五层区间的主力敌军、主题与精英层（不泄露全部阵容）。 */
export function runScout(run, db) {
  const floor = Math.max(1, run.mode === 'trial' ? run.floor : run.battles + 1);
  const bandStart = Math.floor((floor - 1) / 5) * 5 + 1, bandEnd = bandStart + 4;
  const floors = [], enemies = new Map();
  for (let index = bandStart; index <= bandEnd; index += 1) {
    const encounter = buildEndlessEncounter(run, db, index);
    floors.push({ floor: index, theme: encounter.theme, elite: encounter.elite, total: encounter.total });
    for (const row of encounter.roster) enemies.set(row.cardId, (enemies.get(row.cardId) || 0) + 1);
  }
  const top = [...enemies.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4)
    .map(([cardId, count]) => ({ cardId, count, name: db.getById(cardId)?.name ?? `卡牌 ${cardId}` }));
  const elite = floors.find(item => item.elite) ?? null;
  return { floor, bandStart, bandEnd, floors, enemies: top, eliteFloor: elite?.floor ?? null };
}
/** 本场可选赏金：每场开战前重选，失败无惩罚。 */
export function runBountyChoices(run) {
  requireRule(run.phase === 'ready', '只能在开战前选择赏金');
  return Object.entries(RUN_BOUNTIES).map(([id, bounty]) => ({ id, ...bounty }));
}
export function chooseRunBounty(run, id) {
  requireRule(run.phase === 'ready', '只能在开战前选择赏金');
  requireRule(id == null || RUN_BOUNTIES[id], '赏金不存在');
  const next = copy(run);
  // 再点一次同一项 = 取消选择（赏金是可选，不强制）。
  next.bounty = (id == null || next.bounty === id) ? null : id;
  log(next, next.bounty ? `选定本场赏金「${RUN_BOUNTIES[next.bounty].name}」：${RUN_BOUNTIES[next.bounty].text}` : '已取消本场赏金');
  return next;
}
/** 结算时判断赏金条件是否达成。stats 来自真实战斗引擎：{ lanes, cardIds, baseDamage }。 */
export function runBountyMet(id, stats = {}) {
  const lanes = Array.isArray(stats?.lanes) ? stats.lanes.length : (stats?.lanes instanceof Set ? stats.lanes.size : 0);
  const cards = Array.isArray(stats?.cardIds) ? stats.cardIds.length : (stats?.cardIds instanceof Set ? stats.cardIds.size : 0);
  if (id === 'flawless') return !(Number(stats?.baseDamage) > 0);
  if (id === 'spread') return lanes >= 3;
  if (id === 'focused') return cards > 0 && cards <= 4;
  return false;
}
function settleBounty(run, stats) {
  const id = run.bounty ?? null;
  run.bounty = null;
  const bounty = id ? RUN_BOUNTIES[id] : null;
  if (!bounty) return null;
  const met = runBountyMet(id, stats);
  if (met) { run.gold += bounty.gold; log(run, `赏金达成「${bounty.name}」：+${bounty.gold} 远征币`); }
  else log(run, `赏金未达成「${bounty.name}」（不扣任何东西）`);
  return { id, met, gold: met ? bounty.gold : 0 };
}
export function buildEndlessEncounter(run, db, floorOverride = null) {
  const requestedFloor = Number.isFinite(Number(floorOverride)) && Number(floorOverride) >= 1
    ? Math.floor(Number(floorOverride))
    : null;
  const floor = Math.max(1, requestedFloor ?? Math.floor(run.mode === 'trial' ? run.floor : run.battles + 1));
  const theme = THEMES[Math.floor((floor - 1) / 5) % THEMES.length];
  const tier = Math.min(5, 1 + Math.floor((floor - 1) / 4));
  const usable = id => { const card = db.getById(id); return card?.isCollectible?.() && card.quality <= tier; };
  const plants = [...new Set([1, 7, ...theme.plants])].filter(usable);
  const monsters = [...new Set([3, 6, ...theme.monsters])].filter(usable);
  requireRule(plants.length && monsters.length, '缺少可用的敌方卡牌');
  const random = runRandom(`${run.seed}:fight:${floor}`), total = Math.min(100, 4 + floor * 2);
  const roster = Array.from({ length: total }, (_, i) => ({ cardId: pick(i % 2 ? monsters : plants, random), lane: (i + floor) % 5, col: 7 + Math.floor(random() * 4) }));
  const elite = floor % 10 === 0;
  return { floor, theme: theme.name, title: `${ENDLESS_NAMES[run.mode]} · 第 ${floor} 战 · ${theme.name}${elite ? '·精英' : ''}`,
    roster, total, aliveCap: 24, elite, mapId: [2, 4, 7, 8, 9, 10, 11][Math.floor((floor - 1) / 5) % 7],
    plantIds: plants, monsterIds: monsters,
    hpScale: Math.min(1000, (1 + (floor - 1) * .065) * (elite ? 1.2 : 1)),
    atkScale: Math.min(600, (1 + (floor - 1) * .035) * (elite ? 1.1 : 1)),
    enemyBaseHp: Math.min(100000, 180 + floor * 35), durationLimit: 420 };
}
export function runRoutes(run) {
  requireRule(run.phase === 'route', '当前不能选择路线');
  const random = runRandom(`${run.seed}:routes:${run.step}`);
  const pool = ['reward', 'random', 'neutral', 'negative', 'swap', 'shop'];
  const kinds = ['battle'];
  if (run.sinceCombat < 2 && run.step % 5 !== 0) {
    const a = Math.floor(random() * pool.length); kinds.push(pool.splice(a, 1)[0], pick(pool, random));
  }
  return kinds.map((kind, i) => ({ id: `${run.step}:${i}`, kind, title: EVENT_LABELS[kind] }));
}
export function chooseRunRoute(run, id) {
  const route = runRoutes(run).find(r => r.id === id); requireRule(route, '路线已经更新');
  const next = copy(run), random = runRandom(`${run.seed}:event:${run.step}:${id}`);
  let kind = route.kind;
  if (kind === 'random') { const r = random(); kind = r < .45 ? 'reward' : r < .8 ? 'neutral' : 'negative'; }
  next.event = { id, kind, random: route.kind === 'random', bought: [] };
  const variants = Object.entries(RUN_EVENTS).filter(([, event]) => event.kind === kind).map(([key]) => key);
  if (variants.length && random() < .75) next.event.variant = pick(variants, random);
  next.phase = kind === 'battle' ? 'ready' : kind === 'swap' ? 'camp' : 'event';
  next.swapsLeft = kind === 'swap' ? 1 : 0;
  log(next, `${route.title}${route.kind === 'random' ? '揭晓：' + EVENT_LABELS[kind] : ''}`);
  return next;
}
function finishEvent(run) { run.step++; run.sinceCombat++; run.event = null; run.phase = 'route'; return run; }
export function runEventChoices(run) {
  requireRule(run.phase === 'event', '当前没有可处理的事件');
  const full = run.items.length >= 12;
  const variant = RUN_EVENTS[run.event.variant];
  if (variant) return variant.choices.map(choice => ({ ...choice, disabled:
    (choice.cost > run.gold) || (choice.item && full) || (choice.heal && run.baseHp >= run.baseMaxHp)
    || (choice.cleanse && !run.items.some(id => ['thorn','fatigue'].includes(id))) }));
  switch (run.event.kind) {
    case 'reward': return [{ id: 'gold', title: '获得 60 远征币' }, { id: 'flask', title: '获得未知药瓶', disabled: full }, { id: 'card', title: '获得一张本局援军卡', disabled: run.roster.length >= 60 }];
    case 'neutral': return [{ id: 'heal', title: '花 25 远征币，恢复基地 20% 生命', disabled: run.gold < 25 || run.baseHp >= run.baseMaxHp }, { id: 'leave', title: '原路离开（无变化）' }];
    case 'negative': return [{ id: 'toll', title: '支付 20 远征币避开陷阱', disabled: run.gold < 20 }, { id: 'wound', title: '基地损失最大生命的 10%（不会直接致死）' }, { id: 'thorn', title: '承受荆棘诅咒：本局卡牌基础生命 −10%', disabled: full }];
    case 'shop': return [
      { id: 'fang', title: '猎手獠牙 · 40 远征币', cost: 40, disabled: full },
      { id: 'ember', title: '余烬契约 · 50 远征币', cost: 50, disabled: full },
      { id: 'pack', title: '破损补给包 · 35 远征币', cost: 35, disabled: full },
      { id: 'card', title: '援军卡 · 45 远征币', cost: 45, disabled: run.roster.length >= 60 },
      { id: 'leave', title: '离开商店' },
    ].map(o => ({ ...o, disabled: o.disabled || (o.cost && run.gold < o.cost) || run.event.bought.includes(o.id) }));
    default: throw new Error('不支持的事件');
  }
}
export function resolveRunEvent(run, id, availableCards) {
  const choice = runEventChoices(run).find(c => c.id === id); requireRule(choice && !choice.disabled, '该选项不可用');
  const next = copy(run);
  if (RUN_EVENTS[run.event.variant]) {
    if (choice.cost) next.gold -= choice.cost;
    if (choice.gold) next.gold += choice.gold;
    if (choice.heal) next.baseHp = Math.min(next.baseMaxHp, next.baseHp + choice.heal);
    if (choice.damage) next.baseHp = Math.max(1, next.baseHp - choice.damage);
    if (choice.item) addItem(next, choice.item);
    if (choice.cleanse) next.items.splice(next.items.findIndex(id => ['thorn','fatigue'].includes(id)), 1);
    if (choice.risk) {
      const won = runRandom(`${run.seed}:${run.step}:ruins`)() < .6;
      if (won) next.gold += 90;
      else next.baseHp = Math.max(1, next.baseHp - 120);
      log(next, won ? '遗迹搜寻：获得 90 远征币' : '遗迹落石：基地损失 120 生命（保底 1 点）');
    }
    log(next, `${RUN_EVENTS[run.event.variant].name} · ${choice.title}：${choice.detail}`);
    return finishEvent(next);
  }
  if (choice.cost) next.gold -= choice.cost;
  if (id === 'card') { requireRule(availableCards.length, '暂无援军卡'); addCard(next, pick(availableCards, runRandom(`${next.seed}:card:${next.step}`))); log(next, '援军卡加入储备，可在换卡事件上阵。'); }
  else if (id === 'gold') next.gold += 60;
  else if (id === 'heal') { next.gold -= 25; next.baseHp = Math.min(next.baseMaxHp, next.baseHp + Math.round(next.baseMaxHp * .2)); }
  else if (id === 'toll') next.gold -= 20;
  else if (id === 'wound') next.baseHp = Math.max(1, next.baseHp - Math.round(next.baseMaxHp * .1));
  else if (id !== 'leave') addItem(next, id);
  log(next, choice.title);
  if (next.event.kind === 'shop' && id !== 'leave') { next.event.bought.push(id); return next; }
  return finishEvent(next);
}
export function swapRunCard(run, index, uid) {
  requireRule(run.phase === 'camp' && run.swapsLeft > 0, '当前没有换卡机会');
  requireRule(Number.isInteger(index) && index >= 0 && index < run.deck.length, '卡槽无效');
  requireRule(run.roster.some(c => c.uid === uid) && !run.deck.includes(uid), '请选择储备中未上阵的卡');
  const next = copy(run); next.deck[index] = uid; next.swapsLeft--; log(next, '已使用一次换卡机会'); return next;
}
export function leaveRunCamp(run) {
  requireRule(run.phase === 'camp', '当前不在营地');
  const next = copy(run); next.swapsLeft = 0;
  if (next.mode === 'trial') { next.phase = 'ready'; next.initialSetup = false; return next; }
  return finishEvent(next);
}
// The UI passes only an owned, non-expired inventory instance. Keep the selected
// instance's stats, never grant a permanent card or restrict selection to a deck.
export function swapRunOwnedCard(run, index, entry) {
  requireRule(run.mode === 'trial' && run.phase === 'camp' && run.swapsLeft > 0, '当前没有换卡机会');
  requireRule(Number.isInteger(index) && index >= 0 && index < run.deck.length, '卡槽无效');
  requireRule(entry && Number.isInteger(Number(entry.cardId)) && Number(entry.cardId) > 0, '请选择背包中的有效卡牌');
  const next = copy(run), uid = `card-${next.nextCard++}`;
  const stars = Math.max(0, Number(entry.strengthLv ?? entry.star) || 0);
  next.roster.push({ ...copy(entry), uid, cardId: Number(entry.cardId), star: stars, strengthLv: stars });
  next.deck[index] = uid; next.swapsLeft--;
  // Trial swaps always come from the current bag; unused old snapshots need not accumulate.
  next.roster = next.roster.filter(card => next.deck.includes(card.uid));
  log(next, '已从背包复制一张卡到本局，原卡未消耗'); return next;
}
export function repairTrialCamp(run) {
  requireRule(run.mode === 'trial' && run.phase === 'camp' && !run.campRepaired, '本次营地不能再次修复');
  requireRule(run.gold >= 40 && run.baseHp < run.baseMaxHp, '远征币不足或基地已满血');
  const next = copy(run); next.gold -= 40; next.baseHp = Math.min(next.baseMaxHp, next.baseHp + 200);
  next.campRepaired = true; log(next, '营地修复：消耗 40 远征币，基地恢复 200 生命'); return next;
}
export function beginRunBattle(run) {
  requireRule(run.phase === 'ready', '当前不能开战');
  const next = copy(run); next.phase = 'battle'; next.attemptNo = (next.attemptNo || 0) + 1;
  next.attempt = `${next.id}:${next.step}:${next.battles}:${next.attemptNo}`; return next;
}
export function settleRunBattle(run, { attempt, won, baseHp, bountyStats } = {}) {
  requireRule(run.phase === 'battle' && attempt === run.attempt, '这场战斗已经结算或不属于当前进度');
  const next = copy(run); next.attempt = null;
  next.baseHp = clamp(Math.round(Number(baseHp) || 0), 0, next.baseMaxHp);
  if (!won || next.baseHp <= 0) { next.phase = 'ended'; next.bounty = null; log(next, '挑战结束'); return next; }
  next.battles++; next.cleared++; next.gold += 25 + Math.min(75, next.battles * 2); next.sinceCombat = 0;
  const bounty = settleBounty(next, bountyStats);
  if (bounty) next.lastBounty = bounty;
  log(next, `第 ${next.battles} 战胜利，局内补给已入账`);
  if (next.mode === 'trial') {
    next.floor++; next.step++;
    // Every five completed floors, never before floor five and never at floor zero.
    next.baseHp = Math.min(next.baseMaxHp, next.baseHp + 80);
    // 每十层先签契约，再进五层营地（营地换卡/修复仍保留）。
    if (next.cleared % 10 === 0) next.phase = 'contract';
    else if (next.cleared % 5 === 0) { next.phase = 'camp'; next.swapsLeft = 1; next.campRepaired = false; }
    else next.phase = 'ready';
  } else {
    next.step++; next.floor++; next.phase = next.battles % 10 === 0 ? 'contract' : 'route'; next.event = null;
  }
  return next;
}
