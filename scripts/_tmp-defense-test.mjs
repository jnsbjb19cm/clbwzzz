const { isDefenseGrowthCard } = await import('../src/core/constants.js');
const cases = [[2,'核桃卫兵',0,80],[21,'巨盾核桃卫兵',0,120],[68,'树精守卫',0,80],[38,'外星哨兵',0,60],[93,'怪物作坊',0,116],[19,'稻草人',0,23],[1,'花生射手',6,20]];
for (const [id, name, atk, hp] of cases) {
  console.log(`  #${id} ${name}(攻${atk}/血${hp}): ${isDefenseGrowthCard({ id, atk, hp }) ? '防御成长' : '普通成长'}`);
}
