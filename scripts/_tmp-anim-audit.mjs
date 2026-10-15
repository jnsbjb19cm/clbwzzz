import { readFileSync, readdirSync, existsSync } from 'node:fs';
const cards = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const list = (Array.isArray(cards) ? cards : (cards.cards ?? [])).filter((c) => Number(c.show_card) === 1 && Number(c.card_id) < 500);
const packIds = (dir) => new Set(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));
const unit = packIds('assets/sprites/unit_anim');
const bullet = packIds('assets/sprites/bullets/anim');
const skill = packIds('assets/sprites/skill_anim');
console.log(`可用动画包: unit_anim ${unit.size} 个 | bullets ${bullet.size} 个 | skill_anim ${skill.size} 个 | 卡牌 ${list.length} 张\n`);
const missUnit = [];
const missBullet = [];
for (const c of list) {
  const res = String(Number(c.res));
  if (!unit.has(res)) missUnit.push(`#${c.card_id} ${c.card_name}(res ${res})`);
  const atkStyle = Number(c.atk_style);
  if (atkStyle === 2 || atkStyle === 3 || atkStyle === 5) {          // 远程/对空/弱对空 → 应有子弹动画
    if (!bullet.has(res)) missBullet.push(`#${c.card_id} ${c.card_name}(res ${res}, 攻${atkStyle})`);
  }
}
console.log('① 缺【单位动画包】的卡 (' + missUnit.length + '):');
console.log('   ' + (missUnit.join(' | ') || '（无）'));
console.log('\n② 远程卡缺【子弹动画包】的卡 (' + missBullet.length + '):');
console.log('   ' + (missBullet.join(' | ') || '（无）'));
// 技能动画配置
try {
  const cfgSrc = readFileSync('src/battle/SkillAnimationConfig.js', 'utf8');
  const ids = [...cfgSrc.matchAll(/\b(\d{3,4})\b/g)].map((m) => m[1]);
  const referenced = [...new Set(ids)].filter((id) => Number(id) >= 500);
  const missing = referenced.filter((id) => !skill.has(id));
  console.log(`\n③ SkillAnimationConfig 引用的技能动画 id (${referenced.length} 个): ${referenced.slice(0, 30).join(',')}`);
  console.log('   其中【文件不存在】的 (' + missing.length + '): ' + (missing.join(',') || '（无）'));
  const unused = [...skill].filter((id) => !referenced.includes(id));
  console.log('   有文件但【没被引用】的 (' + unused.length + '): ' + (unused.slice(0, 20).join(',') || '（无）'));
} catch (e) { console.log('\n③ 读 SkillAnimationConfig 失败:', e.message); }
