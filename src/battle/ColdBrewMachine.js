import { unitAnimPlayer } from './UnitAnimPlayer.js';
export const COLD_BREW_CARD_ID = 126;
export const COLD_BREW_ATTACK_INTERVAL = 3.9;
export function attackColdBrew(engine, unit, dt) {
  unit.atkTimer -= dt * (((unit.slowedUntil || 0) > engine.time || (unit.resetTorrentUntil || 0) > engine.time) ? .5 : 1);
  if(unit.atkTimer>0)return false;
  const hits=new Map();
  let fired=0;
  const random=engine.rng || Math.random;
  for(let shot=0;shot<8;shot++) {
    const pool=engine.units.filter(u=>u.alive&&u.team!==unit.team&&u.team!=='neutral'&&!u.pvpNeutral&&!u.bossCommanderOnly&&(hits.get(u.uid)||0)<2);
    if(!pool.length)break;
    const target=pool[Math.min(pool.length-1,Math.floor(Math.max(0,random())*pool.length))];
    hits.set(target.uid,(hits.get(target.uid)||0)+1);
    const damage=(unit.atk+(unit.tempAtkBonus||0)+engine.getAuraBonus(unit))*(target.isRanged?.()?.5:1);
    engine.skills.hitUnit(target,damage);
    fired++;
    if(!target.alive || (target.debuffImmuneUntil||0)>engine.time)continue;
    const protectedFromFreeze=(target.coldBrewImmuneUntil||0)>engine.time;
    if(random()>=(protectedFromFreeze?.25:.5))continue;
    const slowed=Math.max(target.slowedUntil||0,target.resetSandUntil||0,target.resetTorrentUntil||0)>engine.time;
    if(slowed&&!protectedFromFreeze) {
      target.frozenUntil=Math.max(target.frozenUntil||0,engine.time+1);
      target.coldBrewImmuneUntil=engine.time+2;
    } else target.slowedUntil=Math.max(target.slowedUntil||0,engine.time+1.5);
  }
  if(fired) { unit.atkTimer=COLD_BREW_ATTACK_INTERVAL; unitAnimPlayer.triggerAttack(unit,engine); }
  return fired>0;
}
