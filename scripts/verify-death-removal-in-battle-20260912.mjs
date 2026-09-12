// 端到端验证（需要 API 服务 3001 + vite 5173）：真实战斗里的死亡表现
//
//   ① 没有死亡动画的卡牌（花生射手 res 1）→ 死亡后直接消除，不再站着 2 秒
//   ② 有死亡动画的卡牌（跑鞋怪 res 3，death 34 帧 → 上限 2 秒）→ 尸体会保留到动画放完
//   ③ 致命攻击打到基地时，飘出的伤害数字只扣到 0（基地只剩 20 血 → 显示 -20）
//
// 用法：
//   1) npm run server   （端口 3001）
//   2) npm run dev      （端口 5173）
//   3) node scripts/verify-death-removal-in-battle-20260912.mjs
import { chromium } from 'playwright';

const API = process.env.API_BASE || 'http://127.0.0.1:3001';
const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);

const user = await (async () => {
  for (let i = 0; i < 6; i += 1) {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `death_${stamp}${i}`, password: 'e2e-pass-123', nickname: '死亡表现验证' }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (json?.token) return json;
    await sleep(1200);
  }
  throw new Error(`注册失败（API ${API} 是否已启动？）`);
})();

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });
await ctx.addInitScript((token) => {
  try { sessionStorage.setItem('clbwz_auth_token_v1', token); } catch { /* ignore */ }
}, user.token);

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto(WEB, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 60000 });
await sleep(2500);

const out = await page.evaluate(async () => {
  const app = globalThis.__clbwzAppInstance;
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  const result = {};
  const modUrl = (pattern, fallback) => performance.getEntriesByType('resource')
    .map((e) => e.name).filter((n) => pattern.test(n)).sort((a, b) => b.length - a.length)[0] ?? fallback;
  const { unitAnimPlayer } = await import(modUrl(/\/src\/battle\/UnitAnimPlayer\.js(\?|$)/, '/src/battle/UnitAnimPlayer.js'));

  // 进单机战斗
  app.navigate('battle', { stageId: 1 });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (app.views?.battle?.engine) break;
    await sleep2(300);
  }
  const view = app.views?.battle ?? null;
  if (view && !view.engine) {
    await view.enterBattle(view.deckSlots ?? [], 1, {});
    await sleep2(2000);
  }
  const engine = view?.engine ?? null;
  result.battleStarted = Boolean(engine);
  if (!engine) return result;

  // 等两张卡的素材包加载完（decision 依赖"包已加载"）
  await unitAnimPlayer.awaitReady('1');
  await unitAnimPlayer.awaitReady('3');
  result.deathAnim = {
    noDeath: unitAnimPlayer.deathAnimState('1'),
    hasDeath: unitAnimPlayer.deathAnimState('3'),
  };

  // ① / ② 死亡之后多久消失
  const noDeathUnit = engine.spawnSummon(1, 0, 10, 'enemy');
  const hasDeathUnit = engine.spawnSummon(3, 1, 10, 'enemy');
  result.spawned = { noDeath: Boolean(noDeathUnit), hasDeath: Boolean(hasDeathUnit) };
  if (noDeathUnit && hasDeathUnit) {
    noDeathUnit.takeDamage(99999, engine.time);
    hasDeathUnit.takeDamage(99999, engine.time);
    engine.onUnitDeath(noDeathUnit);
    engine.onUnitDeath(hasDeathUnit);
    result.linger = {
      noDeath: Number(((noDeathUnit._deathUntil ?? 0) - engine.time).toFixed(3)),
      hasDeath: Number(((hasDeathUnit._deathUntil ?? 0) - engine.time).toFixed(3)),
    };
    // 让引擎推进 2 帧（真实循环也在跑，这里只保证至少推进过）
    engine.tick(0.05);
    engine.tick(0.05);
    result.after100ms = {
      noDeathInUnits: engine.units.some((u) => u.uid === noDeathUnit.uid),
      hasDeathInUnits: engine.units.some((u) => u.uid === hasDeathUnit.uid),
    };
    // 再等 2.4 秒：有死亡动画的也应该消失了
    await sleep2(2400);
    engine.tick(0.05);
    result.after2_5s = {
      noDeathInUnits: engine.units.some((u) => u.uid === noDeathUnit.uid),
      hasDeathInUnits: engine.units.some((u) => u.uid === hasDeathUnit.uid),
    };
  }

  // ②.5 血量下限 + "瞬间消失也要显示伤害数字"
  const { gameSettings } = await import(modUrl(/\/src\/core\/GameSettingsStore20260910\.js(\?|$)/, '/src/core/GameSettingsStore20260910.js'));
  gameSettings.set('showDamageNumbers', true);
  const noPopUnit = engine.spawnSummon(1, 2, 6, 'enemy');
  if (noPopUnit) {
    engine.units = engine.units.filter((u) => u.uid === noPopUnit.uid);
    // 用小数血量验证"致命一击的飘字显示剩余血量（3.2 不四舍五入成 3）"
    noPopUnit.hp = 3.2;
    noPopUnit.maxHp = 3.2;
    noPopUnit.__damagePops20260911 = [];
    engine.floats = [];
    // 只走 takeDamage + onUnitDeath（例如反射/吞噬），伤害数字完全依赖单位身上的 pop
    noPopUnit.takeDamage(500, engine.time);
    engine.onUnitDeath(noPopUnit);
    const orphans = engine.__orphanDamagePops20260911 ?? [];
    // 用假 ctx 调真实 drawFloats，确认数字会被画出来
    const drawn = [];
    const fakeCtx = {
      font: '', textAlign: '', textBaseline: '', lineWidth: 0, strokeStyle: '', fillStyle: '',
      save() {}, restore() {},
      fillText(text) { drawn.push(String(text)); },
      strokeText(text) { drawn.push(String(text)); },
      drawImage() {},
    };
    const { BattleRenderer } = await import(modUrl(/\/src\/battle\/BattleRenderer\.js(\?|$)/, '/src/battle/BattleRenderer.js'));
    BattleRenderer.prototype.drawFloats.call({
      battleAtlasImage: null,
      requestBattleAtlas() {},
      _effectSliceStart: () => 0,
      isBaseFloat: () => false,
    }, fakeCtx, engine);
    engine.tick(0.05);
    result.lethal = {
      hpAfterKill: noPopUnit.hp,
      lastDamageDealt: noPopUnit.lastDamageDealt,
      orphanCount: orphans.length,
      orphanAmounts: orphans.map((x) => x.amount),
      drawnNumbers: drawn,
      removedFromUnits: engine.units.some((u) => u.uid === noPopUnit.uid) === false,
    };
  }

  // ③ 打基地的致命伤害：飘字只扣到 0
  //    生产里的出手是在"攻击动画出手帧"结算的（BattleAttackTimingFix 把攻击排进
  //    engine._pendingAttackReleases），所以这里要轮询一段时间收集飘字。
  const attacker = engine.spawnSummon(3, 3, 11, 'player');
  if (attacker) {
    engine.units = engine.units.filter((u) => u.uid === attacker.uid);
    attacker.atkTimer = 0;
    attacker._jumpUntil = 0;
    attacker.atk = 500;            // 一击远超基地剩余血量，用来验证"不显示溢出伤害"
    engine.enemyHeroHp = 20;
    const originalChooseTarget = engine.chooseTarget;
    engine.chooseTarget = () => ({ _isBase: true, lane: attacker.lane, col: 11 });
    engine.floats = [];
    const attacked = engine.tryAttack(attacker);
    engine.chooseTarget = originalChooseTarget;
    const seenFloats = [];
    // 出手帧由攻击动画决定（可能 1~2 秒），这里最多轮询 5 秒，看到目标数值就提前结束
    for (let i = 0; i < 100; i += 1) {
      for (const f of engine.floats) {
        if (!seenFloats.includes(f.amount)) seenFloats.push(f.amount);
      }
      if (seenFloats.includes(-20)) break;
      await sleep2(50);
    }
    result.baseHit = {
      attacked,
      atk: attacker.atk,
      seenFloats,
      enemyHeroHp: engine.enemyHeroHp,
      queued: (engine._pendingAttackReleases ?? []).length,
    };
  }
  // ④ 联机（服务端权威）时：客户端自己知道"没有死亡动画"就不该再把尸体建出来
  //    服务端会在自己的 2 秒死亡窗口里继续下发这个单位，这里用假快照 + visibilitychange
  //    触发 PvpAuthoritySyncFinal 的 applySnapshot(force) 来验证不会被重建。
  app.navigate('room', { stageId: 1, autoCreate: true, stageName: '神秘之森' });
  const roomDeadline = Date.now() + 20000;
  while (Date.now() < roomDeadline) {
    if (app.views?.room?.room?.mode === 'pve') break;
    await sleep2(300);
  }
  await sleep2(1500);
  document.querySelector('#room-ready-btn')?.click();
  const startDeadline = Date.now() + 20000;
  while (Date.now() < startDeadline) {
    if (app.views?.room?.roomBattleView?.engine) break;
    await sleep2(300);
  }
  await sleep2(2500);
  const coopView = app.views?.room?.roomBattleView ?? null;
  const coopEngine = coopView?.engine ?? null;
  result.coopStarted = Boolean(coopEngine);
  if (coopEngine) {
    await unitAnimPlayer.awaitReady('1');
    await unitAnimPlayer.awaitReady('3');
    const t = Number(coopEngine.time) || 0;
    const deadEnemy = (uid, cardId, lane) => ({
      uid, cardId, team: 'enemy', lane, col: 10, hp: 0, maxHp: 23, atk: 7,
      alive: false, deathStartedAt: t, deathUntil: t + 2,
    });
    coopView.__pvpLatestSnapshot = {
      t,
      units: [deadEnemy(99001, 1, 0), deadEnemy(99002, 3, 1)],
    };
    document.dispatchEvent(new Event('visibilitychange'));
    await sleep2(250);
    coopEngine.tick(0.05);
    const find = (uid) => coopEngine.units.find((u) => Number(u.uid) === uid) ?? null;
    const noAnim = find(99001);
    const hasAnim = find(99002);
    result.coopSnapshot = {
      noAnimInUnits: Boolean(noAnim),
      hasAnimInUnits: Boolean(hasAnim),
      hasAnimLinger: hasAnim ? Number(((hasAnim._deathUntil ?? 0) - coopEngine.time).toFixed(2)) : null,
    };

    // ⑤ 联机死亡结算数字：单位从快照里"消失"就是死亡，必须补一个数字
    //    （走 PvpRound2VisualFix 的真实 socket 监听 → applySnapshotDeltas）
    const socket = coopView.pvpSocket?.connect?.();
    const canDispatch = typeof socket?.emitReserved === 'function';
    result.coopDeathNumber = { canDispatch };
    if (canDispatch) {
      const mk = (uid, hp, lane = 2, col = 5) => ({
        uid, cardId: 1, team: 'enemy', lane, col, hp, maxHp: 30, atk: 5, alive: true, state: 'idle',
      });
      // 用引擎当前基地血量构造快照，避免基地扣血产生额外飘字干扰断言
      const snap = (units) => {
        const own = String(coopView.pvp?.team || 'blue');
        const other = own === 'red' ? 'blue' : 'red';
        const ownHp = Number(coopEngine.heroHp) || 900;
        const enemyHp = Number(coopEngine.enemyHeroHp) || 900;
        return {
          t: Number(coopEngine.time) + 0.05,
          units,
          heroHp: { [own]: ownHp, [other]: enemyHp },
          heroMaxHp: { [own]: Number(coopEngine.heroMaxHp) || ownHp, [other]: Number(coopEngine.enemyHeroMaxHp) || enemyHp },
          heroMp: { [own]: 100, [other]: 100 },
          status: 'playing',
          wave: { number: 1, total: null },
        };
      };
      // 同步连发（中间不 await），避免真实服务端快照插进来把基线状态冲掉
      const emitSync = (units) => socket.emitReserved('pvp:authority:snapshot', snap(units));
      const sleep2b = (ms) => new Promise((r) => setTimeout(r, ms));
      const floatAmounts = () => (coopEngine.__pvpAuthorityFloats ?? []).map((f) => ({ a: f.amount, l: f.lane, c: Number(Number(f.col).toFixed(2)) }));

      // ① 基线：99010 在场（两次，确保 initialized）
      coopEngine.__pvpAuthorityFloats = [];
      emitSync([mk(99010, 30)]);
      emitSync([mk(99010, 30)]);
      // ② 99010 从快照消失 = 死亡 → 结算数字应是它剩下的 30
      emitSync([mk(99011, 30, 3, 5)]);
      await sleep2b(150);
      result.coopDeathNumber.afterVanishing = floatAmounts();

      // ③ 幻之境(550) 离场：不算死亡，不该出数字（99011 从快照消失但处于离场记录里）
      coopEngine.__phaseOutRecords20260830 = [{ uid: 99011 }];
      coopEngine.__pvpAuthorityFloats = [];
      emitSync([]);
      await sleep2b(150);
      result.coopDeathNumber.afterPhaseOut = floatAmounts();
      coopEngine.__phaseOutRecords20260830 = [];

      // ④ 普通掉血仍然要有数字（30 → 20 = -10）
      coopEngine.__pvpAuthorityFloats = [];
      emitSync([mk(99012, 30, 4, 5)]);
      emitSync([mk(99012, 20, 4, 5)]);
      await sleep2b(150);
      result.coopDeathNumber.afterHpDrop = floatAmounts();
    }
  }
  return result;
});

console.log(JSON.stringify(out, null, 1));
console.log('页面错误:', errors.length ? errors.slice(0, 3) : '无');

const failures = [];
const expect = (name, ok, detail) => {
  console.log(`${ok ? '  ok   ' : '  FAIL '}${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(name);
};
expect('战斗已开始', out.battleStarted === true);
expect('花生射手(res 1) 判定为"没有死亡动画"', out.deathAnim?.noDeath === false, String(out.deathAnim?.noDeath));
expect('跑鞋怪(res 3) 判定为"有死亡动画"', out.deathAnim?.hasDeath === true, String(out.deathAnim?.hasDeath));
expect('两个单位都成功生成', out.spawned?.noDeath === true && out.spawned?.hasDeath === true, JSON.stringify(out.spawned));
expect('无死亡动画：死亡时不占位（0 秒）', out.linger?.noDeath === 0, `占位 ${out.linger?.noDeath} 秒`);
expect('有死亡动画：占位 2 秒（动画上限）', out.linger?.hasDeath === 2, `占位 ${out.linger?.hasDeath} 秒`);
expect('100ms 后无死亡动画的单位已从场上消失', out.after100ms?.noDeathInUnits === false);
expect('100ms 后有死亡动画的单位还在播死亡动画', out.after100ms?.hasDeathInUnits === true);
expect('2.5 秒后两个单位都不在场上了', out.after2_5s?.noDeathInUnits === false && out.after2_5s?.hasDeathInUnits === false, JSON.stringify(out.after2_5s));
expect('基地只剩 20 血被打 → 飘字是 -20（不是溢出的 -500）',
  out.baseHit?.seenFloats?.includes(-20) === true && out.baseHit?.seenFloats?.includes(-500) !== true,
  JSON.stringify(out.baseHit));
expect('联机房间战斗已开始', out.coopStarted === true);
expect('联机快照：没有死亡动画的尸体不会被重建出来', out.coopSnapshot?.noAnimInUnits === false, JSON.stringify(out.coopSnapshot));
expect('联机快照：有死亡动画的单位仍然按服务端窗口保留', out.coopSnapshot?.hasAnimInUnits === true, JSON.stringify(out.coopSnapshot));
expect('致命一击后血量夹到 0（不是负血）', out.lethal?.hpAfterKill === 0, JSON.stringify(out.lethal));
expect('瞬间消除的单位：伤害数字仍被画出来，且显示小数 -3.2（不四舍五入）',
  out.lethal?.drawnNumbers?.includes('-3.2') === true, JSON.stringify(out.lethal?.drawnNumbers));
expect('瞬间消除的单位：数字挂在引擎级队列继续飘（数值=剩余血量 3.2）',
  out.lethal?.orphanCount === 1 && out.lethal?.orphanAmounts?.[0] === 3.2, JSON.stringify(out.lethal));
expect('联机：单位从快照消失（死亡）会补出结算数字 -30（lane2 = 消失的那个单位）',
  (out.coopDeathNumber?.afterVanishing ?? []).some((f) => f.a === -30 && f.l === 2), JSON.stringify(out.coopDeathNumber?.afterVanishing));
expect('联机：幻之境离场不算死亡（不会出现该单位血量的数字）',
  (out.coopDeathNumber?.afterPhaseOut ?? []).every((f) => f.l !== 3 || f.a !== -30),
  JSON.stringify(out.coopDeathNumber?.afterPhaseOut));
expect('联机：普通掉血数字不受影响（lane4 上 30→20 飘 -10）',
  (out.coopDeathNumber?.afterHpDrop ?? []).some((f) => f.a === -10 && f.l === 4), JSON.stringify(out.coopDeathNumber?.afterHpDrop));
expect('无页面报错', errors.length === 0, errors[0] ?? '');

await browser.close();
console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
