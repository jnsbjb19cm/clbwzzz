/**
 * P0.5 数值烘焙：让 card.json 成为唯一数据源。
 *
 * 规则(用户确认)：
 * 1. 95 张卡(原 cardBalanceOverrides.js，来自 battle-values.txt)的
 *    card_atk / card_hp / cost_a / atk_speed / move_speed 以 battle-values 为准；
 * 2. 全部 175 张卡的 card_cd = max(6, ceil(原cd / 2))(冷却砍半，向上取整，下限 6s)；
 * 3. 其余卡(不在覆盖表内)保留 card.json 原有数值，仅 cd 砍半。
 *
 * 执行后删除 cardBalanceOverrides.js 并移除 CardDatabase.js 的覆盖应用。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARD_JSON = path.join(root, 'src/data/card.json');
const OVERRIDE_JS = path.join(root, 'src/data/cardBalanceOverrides.js');

function ceilHalf(n) {
  const v = Number(n) || 0;
  return Math.max(6, Math.ceil(v / 2));
}

function readOverrides() {
  const ctx = {};
  vm.createContext(ctx);
  const code =
    fs.readFileSync(OVERRIDE_JS, 'utf8').replace(/export const/g, 'const') +
    '\nglobalThis.ROWS = ROWS;';
  vm.runInContext(code, ctx);
  const map = new Map();
  for (const [id, atk, hp, cost, cd, atkSpeed, moveSpeed] of ctx.ROWS) {
    map.set(Number(id), {
      card_atk: atk,
      card_hp: hp,
      cost_a: cost,
      card_cd: cd,
      atk_speed: atkSpeed,
      move_speed: moveSpeed,
    });
  }
  return map;
}

const rawText = fs.readFileSync(CARD_JSON, 'utf8');
const cards = JSON.parse(rawText);
const overrides = readOverrides();

let applied = 0;
let halved = 0;
const samples = [];
for (const card of cards) {
  const id = Number(card.card_id);
  const ov = overrides.get(id);
  const oldCd = Number(card.card_cd) || 0;
  if (ov) {
    card.card_atk = ov.card_atk;
    card.card_hp = ov.card_hp;
    card.cost_a = ov.cost_a;
    card.atk_speed = ov.atk_speed;
    card.move_speed = ov.move_speed;
    applied += 1;
  }
  const newCd = ceilHalf(ov ? ov.card_cd : oldCd);
  if (newCd !== oldCd) halved += 1;
  card.card_cd = newCd;
  if (samples.length < 6) {
    samples.push({ id, name: card.card_name, atk: card.card_atk, hp: card.card_hp, cd: card.card_cd, cost: card.cost_a });
  }
}

const out = JSON.stringify(cards, null, 2); // 2-space 缩进，与原文件一致
fs.writeFileSync(CARD_JSON, out + (rawText.endsWith('\n') ? '\n' : ''), 'utf8');

console.log(`烘焙完成：共 ${cards.length} 张卡`);
console.log(`- battle-values 数值覆盖：${applied} 张`);
console.log(`- cd 砍半(值有变化)：${halved} 张`);
console.log('样例：');
for (const s of samples) console.log(`  #${s.id} ${s.name}: atk=${s.atk} hp=${s.hp} cd=${s.cd} cost=${s.cost}`);
