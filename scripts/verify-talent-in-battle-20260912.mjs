// 端到端验证（需要 API 服务 + vite 开发服务器在跑）：
// 被动天赋 / 技能改动必须真实作用于游戏内战斗。
//
// 覆盖：
//   ① 单机战斗：12 个被动全解锁后，引擎里的 talentBonus 完整（512/513/515/516 生效前提）、
//      基地生命上限 750+150、魔力上限 100+70、技能栏按玩家 loadout 出技能
//   ② 联机房间战斗（野外冒险）：技能栏按玩家 loadout 出技能（此前是空技能栏）、可施放且扣 MP
//   ③ 被禁用的 13 个技能不再出现在技能池
//
// 联机战斗的被动不在此断言：联机单位属性/基地血量/MP 由服务端权威快照覆盖
// （见 PvpAuthoritySyncFinal / PvpAuthorityResourceFinal），客户端天赋无法真正生效。
//
// 用法：
//   1) npm run server   （或 node server/index.js，端口 3001）
//   2) npm run dev      （端口 5173）
//   3) node scripts/verify-talent-in-battle-20260912.mjs
import { chromium } from 'playwright';

const API = process.env.API_BASE || 'http://127.0.0.1:3001';
const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);

const ALL_PASSIVES = [
  'core', 'passive_will', 'passive_slay', 'passive_strong', 'passive_endure',
  'passive_sacred', 'passive_god', 'passive_gamble', 'passive_tough',
  'passive_war', 'passive_gift', 'passive_focus', 'passive_wisdom',
];
const LOADOUT = [505, 540, 500, 503, 504, null];
const DISABLED = [542, 543, 544, 545, 546, 548, 549, 551, 552, 553, 554, 555, 556];

async function register(prefix, nickname) {
  for (let i = 0; i < 6; i += 1) {
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: `${prefix}_${stamp}${i}`, password: 'e2e-pass-123', nickname }),
      });
      const json = await res.json();
      if (json?.token) return json;
    } catch { /* retry */ }
    await sleep(1200);
  }
  throw new Error(`注册失败（API ${API} 是否已启动？）`);
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const user = await register('talents', '天赋伤害验证');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });
await ctx.addInitScript(({ token, passives, loadout }) => {
  try {
    sessionStorage.setItem('clbwz_auth_token_v1', token);
    localStorage.setItem('clbwz_hero_skills_v1', JSON.stringify({ loadout, unlockedTalents: passives, consumedExtra: 0 }));
  } catch { /* ignore */ }
}, { token: user.token, passives: ALL_PASSIVES, loadout: LOADOUT });

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto(WEB, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 60000 });
await sleep(2500);

const out = await page.evaluate(async (disabled) => {
  const app = globalThis.__clbwzAppInstance;
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  const result = {};
  // dev HMR 会生成 ?t= 版本的模块，必须用页面真正加载过的那份
  const modUrl = (pattern, fallback) => performance.getEntriesByType('resource')
    .map((e) => e.name).filter((n) => pattern.test(n)).sort((a, b) => b.length - a.length)[0] ?? fallback;
  const { getSkillEffect } = await import(modUrl(/\/src\/core\/SkillRegistry\.js(\?|$)/, '/src/core/SkillRegistry.js'));

  result.mpMax = app.heroSkills.getMpMax();
  result.poolIds = app.heroSkills.getSkillCards()
    .filter((card) => getSkillEffect(card.id) && app.heroSkills.isSkillUnlocked(card.id))
    .map((card) => card.id);
  result.disabledInPool = disabled.filter((id) => result.poolIds.includes(id));

  // ---- ① 单机战斗 ----
  app.navigate('battle', { stageId: 1 });
  const soloDeadline = Date.now() + 15000;
  while (Date.now() < soloDeadline) {
    if (app.views?.battle?.engine) break;
    await sleep2(300);
  }
  const soloView = app.views?.battle ?? null;
  if (soloView && !soloView.engine) {
    await soloView.enterBattle(soloView.deckSlots ?? [], 1, {});
    await sleep2(2000);
  }
  const soloEngine = soloView?.engine ?? null;
  result.solo = soloEngine ? {
    talentBonus: { ...soloEngine.talentBonus },
    heroMaxHp: soloEngine.heroMaxHp,
    heroMpMax: soloEngine.heroMpMax,
    loadout: soloEngine.skillLoadout,
  } : null;

  // ---- ② 联机房间战斗（野外冒险 PVE）----
  app.navigate('room', { stageId: 1, autoCreate: true, stageName: '神秘之森' });
  const roomDeadline = Date.now() + 20000;
  while (Date.now() < roomDeadline) {
    if (app.views?.room?.room?.mode === 'pve') break;
    await sleep2(300);
  }
  await sleep2(2000);
  document.querySelector('#room-ready-btn')?.click();
  const startDeadline = Date.now() + 20000;
  while (Date.now() < startDeadline) {
    if (app.views?.room?.roomBattleView) break;
    await sleep2(300);
  }
  await sleep2(3000);
  const coopEngine = app.views?.room?.roomBattleView?.engine ?? null;
  if (coopEngine) {
    result.coop = { loadout: coopEngine.skillLoadout };
    const mpBefore = coopEngine.heroMp;
    result.coopCan505 = coopEngine.skills.canCast(505);
    result.coopCast505 = coopEngine.skills.beginCast(505);
    // 立即读取：联机战斗会被服务端快照同步 MP，延迟读会被覆盖
    result.coopMpSpent = Math.round((mpBefore - coopEngine.heroMp) * 100) / 100;
    result.coopCan500Target = coopEngine.skills.beginCast(500).needsTarget === true;
    await sleep2(600);
  }
  return result;
}, DISABLED);

const failures = [];
const expect = (name, ok, detail) => {
  console.log(`${ok ? '  ok   ' : '  FAIL '}${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(name);
};

console.log('页面错误:', errors.length ? errors.slice(0, 3) : '无');
expect('单机战斗已开始', Boolean(out.solo));
expect('单机：talentBonus 保留家族/低血字段（512/513/515/516 生效）',
  out.solo?.talentBonus?.lowBaseAtkPct === 10 && out.solo?.talentBonus?.lowBaseDamageReductionPct === 10
  && out.solo?.talentBonus?.scarecrowAtkPct === 5 && out.solo?.talentBonus?.dandelionHealPct === 50,
  JSON.stringify(out.solo?.talentBonus));
expect('单机：基地生命上限 = 750 + 150 = 900（510/519/小天赋生效）', out.solo?.heroMaxHp === 900, `heroMaxHp=${out.solo?.heroMaxHp}`);
expect('单机：引擎魔力上限 = 100 + 70 = 170（511/521 生效）', out.solo?.heroMpMax === 170, `heroMpMax=${out.solo?.heroMpMax}`);
expect('单机：技能栏按玩家 loadout 出技能', out.solo?.loadout?.includes(505) === true, JSON.stringify(out.solo?.loadout));
expect('联机战斗已开始', Boolean(out.coop));
expect('联机：技能栏按玩家 loadout 出技能（原先是空技能栏）',
  out.coop?.loadout?.includes(505) === true && out.coop?.loadout?.includes(500) === true,
  JSON.stringify(out.coop?.loadout));
expect('联机：505 可施放且真的扣了 MP', out.coopCan505?.ok === true && out.coopMpSpent > 0, `MP -${out.coopMpSpent}`);
expect('联机：500 需要选中目标', out.coopCan500Target === true);
expect('技能池不含被禁用的技能', out.disabledInPool?.length === 0, `池内禁用=${JSON.stringify(out.disabledInPool)}`);
expect('技能池 = 13 个（35 个有效果 - 22 个天赋树技能）', out.poolIds?.length === 13, `pool=${out.poolIds?.length}`);
expect('无页面报错', errors.length === 0, errors[0] ?? '');

await browser.close();
console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
