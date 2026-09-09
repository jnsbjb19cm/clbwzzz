import craftMaterials from '../../src/data/craftMaterials.json' with { type: 'json' };
import { grantPlayerExp } from '../../src/core/PlayerProgression.js';

function rollUpgradeMaterial(maxTier = 1, rng = Math.random) {
  const tier = 1 + Math.floor(rng() * Math.max(1, Math.min(4, Math.floor(maxTier))));
  const material = craftMaterials.levels.find(row => row.level === tier) ?? craftMaterials.levels[0];
  const roll = rng();
  // 直接使用铁匠铺材料表：羊皮纸35%、宝石30%、强化粉15%、DNA10%、保护符10%。
  if (roll < 0.35) return material.parchment;
  if (roll < 0.65) return material.gem;
  if (roll < 0.80) return 10000 + tier;
  if (roll < 0.90) return material.dna;
  return material.charm;
}

export function attachBattleReport(battle, room) {
  const rows = [...room.members.values()].map(member => ({
    userId: Number(member.userId), nickname: member.nickname,
    team: member.team, level: Number(member.level) || 1,
    isBot: Boolean(member.isBot), kills: 0, losses: 0, score: 0,
    honor: 0, exp: 0, items: [],
  }));
  const byId = new Map(rows.map(row => [row.userId, row]));
  const report = battle.battleReport = {
    status: 'playing', mode: room.mode, winner: null, rows,
    rewardsEnabled: room.mode !== 'pvp' || !room.allowUnbalanced,
    bossName: battle.bossInfo?.name ?? null,
  };
  const engine = battle.engine;
  const previousHit = engine.applyCardHit;
  engine.applyCardHit = function (attacker, victim, ...args) {
    const prior = victim?.__lastDamageOwner;
    const hp = victim?.hp;
    if (victim) victim.__lastDamageOwner = Number(attacker?.pvpOwnerUserId) || null;
    const result = previousHit.call(this, attacker, victim, ...args);
    if (victim?.alive && victim.hp >= hp) victim.__lastDamageOwner = prior;
    return result;
  };
  const previousDeath = engine.onUnitDeath;
  engine.onUnitDeath = function (unit, ...args) {
    const result = previousDeath.call(this, unit, ...args);
    if (!unit || unit.alive || !unit._deathResolved || unit.__reportDeathCounted || unit.pvpNeutral) return result;
    unit.__reportDeathCounted = true;
    const owner = byId.get(Number(unit.pvpOwnerUserId));
    const killer = byId.get(Number(battle.__reportSkillCaster || engine.__pvpActiveSkillOwnerUserId || unit.__lastDamageOwner));
    if (owner) owner.losses += 1;
    if (killer && killer !== owner && (!owner || owner.team !== killer.team)) killer.kills += 1;
    return result;
  };
  const skillMethod = room.mode === 'boss' ? 'applyPlayerSkill' : 'applySkillCast';
  const previousSkill = battle[skillMethod];
  battle[skillMethod] = function (cast, ...args) {
    const prior = this.__reportSkillCaster;
    this.__reportSkillCaster = cast.userId;
    try { return previousSkill.call(this, cast, ...args); }
    finally { this.__reportSkillCaster = prior; }
  };
  if (room.mode !== 'pvp') return;
  // 掉落归属在生成时锁定；划过拾取和自动拾取只确认收取，不重复增加奖励。
  battle.collectLootDrop = function (userId, dropId) {
    const drop = this.engine.lootDrops.find(drop => Number(drop.id) === Number(dropId));
    if (!drop || Number(drop.recipientUserId) !== Number(userId) || Number(userId) <= 0) throw new Error('该掉落不属于你');
    if (!drop.collected) {
      drop.collected = true;
      drop.collectedAt = this.engine.time;
    }
    return { ...drop };
  };
  const previousTick = battle.tick;
  battle.tick = function (...args) {
    const result = previousTick.apply(this, args);
    for (const drop of this.engine.lootDrops) {
      if (!drop.collected && (this.engine.time - drop.createdAt >= 3.2 || this.status !== 'playing')) {
        this.collectLootDrop(drop.recipientUserId, drop.id);
      }
    }
    return result;
  };
  // 死亡掉落按归属队伍分配给真人；双方均可掉落，不能掉给负数人机账户。
  engine.rollDeathDrop = function (unit) {
    if (!report.rewardsEnabled || !unit || unit._lootRolled || unit.pvpNeutral) return null;
    unit._lootRolled = true;
    const owner = byId.get(Number(unit.pvpOwnerUserId));
    if (!owner) return null;
    const recipients = rows.filter(row => row.team !== owner.team && row.userId > 0 && !row.isBot);
    if (!recipients.length) return null;
    const level = Math.max(1, Math.min(5, Number(unit.quality) || 1));
    if (this.rng() >= Math.min(0.42, 0.14 + level * 0.055)) return null;
    const killerId = Number(battle.__reportSkillCaster || unit.__lastDamageOwner);
    const eligible = recipients.filter(row => row.items.reduce((n, item) => n + item.count, 0) < 5);
    const recipient = eligible.find(row => row.userId === killerId) ?? eligible[(this._lootDropSeq || 0) % eligible.length];
    if (!recipient) return null;
    const itemId = rollUpgradeMaterial(level, () => this.rng());
    const existing = recipient.items.find(item => item.itemId === itemId);
    if (existing) existing.count += 1;
    else recipient.items.push({ itemId, count: 1 });
    const drop = {
      id: ++this._lootDropSeq, itemId, count: 1,
      lane: Math.max(0, Math.min(4, Math.floor(unit.lane))),
      col: Math.max(0, Math.min(11, Number(unit.col))),
      sourceUid: unit.uid, sourceCardId: unit.cardId, createdAt: this.time,
      recipientUserId: recipient.userId, recipientNickname: recipient.nickname, rewardTeam: recipient.team,
    };
    this.lootDrops.push(drop);
    return drop;
  };
}

export async function settleBattleReport(conn, battle) {
  const report = battle.battleReport;
  const rows = report.rows.map(row => ({ ...row, items: row.items.map(item => ({ ...item })) }));
  for (const row of rows) {
    const won = row.team === battle.winner;
    row.score = row.kills * 10 + (won ? 100 : 0);
    if (!report.rewardsEnabled || row.userId <= 0 || row.isBot) continue;
    const profile = await conn.get('SELECT level, exp FROM player_profiles WHERE user_id=?', [row.userId]);
    if (!profile) throw new Error('结算玩家资料不存在');
    row.level = Number(profile.level) || 1;
    // 保留原有每场结算材料奖励，并额外发放对局中实际分配的掉落。
    const tier = report.mode === 'boss'
      ? ({ '简单': 1, '普通': 2, '困难': 4 }[battle.difficulty] || 1)
      : Math.max(1, Math.min(4, Math.ceil(row.level / 10)));
    const itemId = rollUpgradeMaterial(tier);
    const existing = row.items.find(item => item.itemId === itemId);
    if (existing) existing.count += 1;
    else row.items.push({ itemId, count: 1 });
    row.exp = won ? 1000 : 500;
    row.honor = won ? 20 : 5;
    const progress = { level: row.level, exp: Number(profile.exp) || 0 };
    grantPlayerExp(progress, row.exp);
    await conn.run('UPDATE player_profiles SET level=?, exp=?, honor=honor+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
      [progress.level, progress.exp, row.honor, row.userId]);
    for (const item of row.items) {
      const owned = await conn.get('SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0', [row.userId, item.itemId]);
      if (owned) await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0', [item.count, row.userId, item.itemId]);
      else await conn.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)', [row.userId, item.itemId, item.count]);
    }
  }
  // 调用者只在事务提交成功后发布此结果，防止界面显示未到账奖励。
  return { ...report, status: 'settled', winner: battle.winner, rows };
}
