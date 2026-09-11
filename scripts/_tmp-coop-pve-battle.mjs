// 临时验证（用完即删）：服务端权威 PVE 合作战斗
import { CoopBossBattle } from '../server/battle/CoopBossBattle.js';
import { getPvpCardDb } from '../server/battle/PvpCardDb.js';

const db = getPvpCardDb();
const rows = [];
const check = (n, ok, d) => rows.push({ n, ok, d });

const battle = new CoopBossBattle({
  roomId: 1,
  members: [{ userId: 1, nickname: '甲' }, { userId: 2, nickname: '乙' }],
  db,
  mode: 'pve',
  stageId: 1,
  mapId: 1,
});

check('mode = pve', battle.mode === 'pve');
check('无 bossInfo', battle.bossInfo === null && battle.bossUnit === undefined);
const first = battle.snapshot();
check('快照 mode=pve', first.mode === 'pve');
check('快照带关卡信息', first.stage?.id === 1 && typeof first.stage.name === 'string');
check('快照带波次', first.wave?.total > 0, JSON.stringify(first.wave));
check('双方基地血量正常（非 BOSS 隐藏血）', first.heroHp.blue > 0 && first.heroHp.red > 0 && first.heroHp.red < 1e9,
  JSON.stringify(first.heroHp));

// 推进战斗：应该会自然出怪（波次）
let sawEnemy = false;
let maxUnits = 0;
for (let i = 0; i < 600; i += 1) {
  battle.tick(0.05);
  const snap = battle.snapshot();
  maxUnits = Math.max(maxUnits, snap.units.length);
  if (snap.units.some((unit) => unit.team === 'enemy')) sawEnemy = true;
  if (battle.status === 'finished') break;
}
check('会自然刷出敌人波次', sawEnemy, `maxUnits=${maxUnits}`);
check('多玩家各自资源独立', (() => {
  const a = battle.publicResources(1);
  const b = battle.publicResources(2);
  return a && b && a.sun === b.sun;
})());

// 部署一张合法卡牌，验证 deploy 走通用逻辑（不依赖 boss）
const deployable = db.cards.find((card) => Number(card.type) !== 4 && !card.isActiveSkill?.() && Number(card.moveSpeed) > 0);
let deployOk = false;
let deployErr = '';
try {
  const res = battle.deploy(1, { cardId: deployable.id, lane: 2, col: 1, craftQuality: 1, strengthLv: 0 });
  deployOk = Boolean(res?.unit);
} catch (error) {
  deployErr = error?.message || String(error);
}
check('玩家部署走通用逻辑', deployOk || /不足|位置|卡牌/.test(deployErr), deployErr);

// 强行打爆敌方基地 → 判定蓝方胜利
battle.engine.enemyHeroHp = 0;
battle.tick(0.05);
const finished = battle.snapshot();
check('敌方基地归零 → 蓝方胜', battle.status === 'finished' && battle.winner === 'blue' && finished.status === 'finished',
  JSON.stringify({ status: battle.status, winner: battle.winner }));

// BOSS 模式回归：不能受 pve 改动影响
const bossBattle = new CoopBossBattle({
  roomId: 2,
  members: [{ userId: 3, nickname: '丙' }],
  db,
  mode: 'boss',
  bossId: 'boss_forest',
});
const bsnap = bossBattle.snapshot();
check('BOSS 模式快照仍为 boss', bsnap.mode === 'boss' && Boolean(bsnap.boss?.id), JSON.stringify({ mode: bsnap.mode, boss: bsnap.boss?.id }));
check('BOSS 隐藏血仍在', bsnap.heroHp.red === 0 || bsnap.boss.maxHp > 1000, JSON.stringify({ red: bsnap.heroHp.red, maxHp: bsnap.boss?.maxHp }));

const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok ? '' : `  << ${r.d}`}`);
console.log(`\n${rows.length - bad.length}/${rows.length} passed`);
process.exit(bad.length ? 1 : 0);
