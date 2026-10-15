import {getPvpCardDb} from '../server/battle/PvpCardDb.js';
import {WaveManager} from '../src/battle/WaveManager.js';
import {getAttackCooldown} from '../src/battle/BattleConfig.js';
import {adventureSubwavePlan} from '../src/data/AdventureStageDesign.js';
import {SUICIDE_CARD_IDS} from '../src/core/CardTraitRegistry.js';
const db=getPvpCardDb(),rows=[],issues=[];
for(const stage of db.stages.filter(s=>s.adventure)){
 const w=new WaveManager(stage,db);for(let cycle=1;cycle<18;cycle++)w.appendAdventureCycle();
 const q=w.queue,groups=new Map();
 for(let i=0;i<q.length;i++){
  const x=q[i];if(i&&x.time<q[i-1].time)issues.push({stage:stage.stage_name,issue:'queue out of time order',wave:x.waveIndex,time:x.time,previous:q[i-1].time});
  if(x.lane<0||x.lane>4||x.col<0||x.col>11)issues.push({stage:stage.stage_name,issue:'invalid cell'});
  if(!groups.has(x.waveIndex))groups.set(x.waveIndex,[]);groups.get(x.waveIndex).push(x);
 }
 const stats=[...groups.values()].map(xs=>({count:xs.length,start:Math.min(...xs.map(x=>x.time)),end:Math.max(...xs.map(x=>x.time)),dps:xs.reduce((s,x)=>s+(SUICIDE_CARD_IDS.has(x.card.id)?0:(Number(x.card.atk)||0)/getAttackCooldown(x.card.atkSpeed)*(x.adventureAttackScale??1)),0)}));
 const interval=stats[1].start-stats[0].start;
 rows.push({name:stage.stage_name,route:stage.adventure.route,index:stage.adventure.index,difficulty:stage.adventure.difficulty,first:stats[0].start,interval,counts:stats.slice(0,5).map(x=>x.count),max:Math.max(...stats.map(x=>x.count)),dps:Math.round(Math.max(...stats.map(x=>x.dps))*10)/10,subwave:adventureSubwavePlan(stage)});
 for(let i=1;i<stats.length;i++)if(stats[i-1].end>stats[i].start)issues.push({stage:stage.stage_name,issue:'subwave overlap',wave:i,end:stats[i-1].end,next:stats[i].start});
}
console.log(JSON.stringify({stages:rows.length,wavesPerStage:90,issueCount:issues.length,issues:issues.slice(0,6),examples:rows.filter(r=>r.route===0&&[1,14,16].includes(r.index)&&[0,1].includes(r.difficulty)),peak:rows.reduce((a,b)=>a.max>b.max?a:b)},null,2));
