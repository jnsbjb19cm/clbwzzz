import { BattleUnit } from '../battle/BattleUnit.js';

export const RESET_SKILLS = {
  542: { kind: 'reset_hero_sleep', duration: 7, label: '海妖之声：对方英雄7秒不能出牌或施法' },
  543: { kind: 'reset_portals', label: '海之门：敌方阵营召唤3～5个传送门' },
  544: { kind: 'reset_siren_song', duration: 10, label: '海妖之歌：全体治疗80、移速+10%，敌方眩晕4秒' },
  546: { kind: 'reset_torrent', cooldown: 16, label: '湍流：敌方末列40伤害，攻速移速减半8秒' },
  548: { kind: 'reset_blind', cooldown: 8, label: '致盲：敌方远程停攻4秒' },
  549: { kind: 'reset_tentacles', cooldown: 22, label: '死亡触手：当前血量超过400的敌人扣50%最大生命' },
  551: { kind: 'reset_last_stand', label: '壮士断腕：基地曾低于200时可用一次，全军攻击+50%，每3秒损失10生命' },
  552: { kind: 'reset_sand', cooldown: 30, label: '沙洞：敌方移动卡减速20%，持续15秒' },
  553: { kind: 'reset_regrowth', label: '断腕再生：基地曾低于100时，牺牲双方最高血量卡恢复生命' },
  555: { kind: 'reset_surround', label: '围剿：以全场生命总和攻击最高血量敌人，上限900' },
  556: { kind: 'reset_fangs', label: '利齿突袭：全敌军10～50伤害，满层时在场友军攻击永久+1' },
  557: { kind: 'reset_curse', label: '致命诅咒：全敌軍每秒中毒8点，持续10秒' },
};

export function resetSkillSide(engine) {
  return engine.__pvpActiveSkillSide === 'enemy' || engine.__talentPerspectiveTeam20260912 === 'red' ? 'enemy' : 'player';
}
function stateFor(engine, side) {
  engine.resetSkillState ??= {};
  return engine.resetSkillState[side] ??= { below200: false, below100: false, lastStand: false, regrowthUses: 0, fangs: 0 };
}
export function resetSkillError(engine, skillId, side = resetSkillSide(engine)) {
  if ((engine.resetHeroLockedUntil?.[side] || 0) > engine.time) return '海妖之声生效中：暂时不能出牌或施法';
  const state = stateFor(engine, side);
  const mirrored = resetSkillSide(engine) === 'enemy';
  const hp = (side === 'enemy') !== mirrored ? engine.enemyHeroHp : engine.heroHp;
  state.below200 ||= hp < 200;
  state.below100 ||= hp < 100;
  if (Number(skillId) === 551 && (!state.below200 || state.lastStand)) return '壮士断腕需基地曾低于200生命，且每场只能使用一次';
  if (Number(skillId) === 553 && !state.below100) return '断腕再生需基地曾低于100生命';
  return null;
}

const immune = (unit, now) => Number(unit.debuffImmuneUntil || 0) > now;
const roll = engine => Math.max(0, Math.min(.999999, (engine.rng || Math.random)()));
export function applyResetSkill(system, id, effect) {
  if (!RESET_SKILLS[id]) return false;
  const engine = system.engine, now = engine.time, side = resetSkillSide(engine);
  const state = stateFor(engine, side);
  if (resetSkillError(engine, id, side)) return true;
  const allies = engine.units.filter(u => u.alive && u.team === 'player');
  const enemies = engine.units.filter(u => u.alive && u.team === 'enemy' && !u.bossCommanderOnly && !u.pvpNeutral);
  const status = (unit, key, duration) => { if (!immune(unit, now)) unit[key] = Math.max(unit[key] || 0, now + duration); };
  const highest = units => [...units].sort((a,b) => b.hp-a.hp || a.uid-b.uid)[0];
  switch (Number(id)) {
    case 542: {
      engine.resetHeroLockedUntil ??= {};
      const enemySide = side === 'player' ? 'enemy' : 'player';
      engine.resetHeroLockedUntil[enemySide] = Math.max(engine.resetHeroLockedUntil[enemySide] || 0, now + 7);
      break;
    }
    case 543: {
      const card = system.db.getById(78);
      if (!card) break;
      const cells = [];
      for(let lane=0;lane<5;lane++) for(let col=side==='player'?7:0;col<=(side==='player'?11:4);col++) {
        if (!engine.getUnitsAt(lane,col).length) cells.push({lane,col});
      }
      const count = Math.min(cells.length, 3 + Math.floor(roll(engine)*3));
      for(let i=0;i<count;i++) {
        const cell = cells.splice(Math.floor(roll(engine)*cells.length),1)[0];
        const unit = new BattleUnit({card,...cell,team:'player'});
        unit._isPortal=true; unit._portalBornAt=now; unit._portalLife=12;
        engine.initUnitSpawnFade?.(unit); engine.units.push(unit);
      }
      break;
    }
    case 544:
      for(const u of allies) { const amount=u.heal(80); if(amount>0)engine.spawnFloat(u.lane,u.col,amount); u.resetSongUntil=now+(effect.duration||10); }
      for(const u of enemies) status(u,'stunnedUntil',4);
      break;
    case 546:
      for(const u of enemies.filter(u=>Math.round(u.col)===(side==='player'?11:0))) {
        system.hitUnit(u,40); status(u,'resetTorrentUntil',8);
      }
      break;
    case 548: for(const u of enemies.filter(u=>u.isRanged?.()))status(u,'resetBlindUntil',4); break;
    case 549: for(const u of enemies.filter(u=>u.hp>400))system.hitUnit(u,u.maxHp*.5,{ignoreVulnerability:true}); break;
    case 551: state.lastStand=true; state.nextDrain=now+3; break;
    case 552: for(const u of enemies.filter(u=>u.isMovable?.()))status(u,'resetSandUntil',15); break;
    case 553: {
      const victims=[highest(allies.filter(u=>!u.bossCommanderOnly)),highest(enemies)].filter(Boolean);
      let amount=0;
      for(const u of victims) {
        if(immune(u,now) || (u.invulnUntil||0)>now)continue;
        amount+=u.maxHp; u.hp=0; u.alive=false; engine.onUnitDeath(u);
      }
      if(amount>0) engine.heroHp=Math.min(engine.heroMaxHp,engine.heroHp+Math.max(10,amount-50*state.regrowthUses));
      state.regrowthUses++;
      break;
    }
    case 555: { const u=highest(enemies); if(u)system.hitUnit(u,Math.min(900,[...allies,...enemies].reduce((sum,x)=>sum+x.hp,0))); break; }
    case 556:
      state.fangs=Math.min(50,state.fangs+10);
      for(const u of enemies) system.hitUnit(u,state.fangs);
      if(state.fangs===50)for(const u of allies) { if(!u.resetFangsBonus){u.atk+=1;u.resetFangsBonus=true;} }
      break;
    case 557:
      for(const u of enemies) if(!immune(u,now)) { u.dots ??=[]; u.dots.push({kind:'poison',dps:8,every:1,nextAt:now+1,until:now+10}); }
      break;
  }
  return true;
}

export function tickResetSkills(system) {
  const e=system.engine;
  for(const side of ['player','enemy']) {
    const state=stateFor(e,side), hp=side==='player'?e.heroHp:e.enemyHeroHp;
    state.below200 ||= hp<200; state.below100 ||= hp<100;
    if(!state.lastStand)continue;
    const allies=e.units.filter(u=>u.alive&&u.team===side&&!u.bossCommanderOnly);
    for(const u of allies)if(!u.resetLastStandApplied){u.atk*=1.5;u.resetLastStandApplied=true;}
    while(e.time>=state.nextDrain) {
      for(const u of allies)if(u.alive)system.hitUnit(u,10,{ignoreVulnerability:true});
      state.nextDrain+=3;
    }
  }
}
