/**
 * 2026-10-11 紧急修复：BagView.js 里 honorRankText20261011 / realStatText20261011 /
 * expInfo20261011 只有调用、没有定义（手动编辑时被删掉了）→ 资料面板渲染即 ReferenceError。
 * 这里把三个函数定义补回模块顶层（函数声明会提升，位置无所谓，但仍放在 import 之后更清晰）。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'src/ui/BagView.js';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const helpers = [
  '',
  '/**',
  ' * 2026-10-11 用户：',
  ' *   · 上榜（荣誉榜只回前 50 名）→ 显示「第 xx 名」',
  ' *   · 未上榜 → 显示「xxxx 积分」（也就是该玩家的荣誉值）',
  ' */',
  'function honorRankText20261011(player) {',
  '  const rank = Number(player?.honorRank ?? 0);',
  '  if (rank > 0) return `第 ${rank} 名`;',
  '  const honor = Math.max(0, Number(player?.honor) || 0);',
  '  return `${honor} 积分`;',
  '}',
  '',
  '/**',
  ' * 2026-10-11 用户：血量/魔法要显示真实值 —— 缺失就显示 —，不再编造默认值。',
  ' */',
  'function realStatText20261011(value) {',
  '  const num = Number(value);',
  "  return Number.isFinite(num) && num > 0 ? num : '—';",
  '}',
  '',
  '/**',
  ' * 2026-10-11 用户：经验显示两个数字（当前绝对经验 / 升到下一级所需经验），',
  ' * 鼠标悬停显示「还需 X 经验升级 · 当前进度 Y%」。',
  ' */',
  'function expInfo20261011(player) {',
  '  const level = Math.max(1, Number(player?.level) || 1);',
  '  const current = Math.max(0, Number(player?.exp) || 0);',
  '  const rows = Array.isArray(levelRows20261011) ? levelRows20261011 : [];',
  '  const row = rows.find((r) => Number(r?.hero_level) === level);',
  '  const nextRow = rows.find((r) => Number(r?.hero_level) === level + 1);',
  '  const need = Math.max(0, Number(row?.lvup_exp ?? nextRow?.lvup_exp ?? 0) || 0);',
  '  const remain = Math.max(0, need - current);',
  '  const pct = need > 0 ? Math.min(100, Math.round((current / need) * 1000) / 10) : 100;',
  '  return { current, next: need, tip: `还需 ${remain} 经验升级 · 当前进度 ${pct}%` };',
  '}',
  '',
].join('\n');

// 插到第一个 import 语句之后（保持文件顶部 import 区整洁）
const lines = s.split('\n');
let insertAt = 0;
for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].startsWith('import ')) insertAt = i + 1;
  else if (insertAt > 0 && lines[i].trim() === '') continue;
  else if (insertAt > 0) break;
}
if (!s.includes('function honorRankText20261011')) {
  lines.splice(insertAt, 0, helpers);
  s = lines.join('\n');
  writeFileSync(p, s.replace(/\n/g, '\r\n'));
  console.log('✔ 三个函数定义已补回（honorRankText / realStatText / expInfo）');
} else {
  console.log('· 已存在定义，无需补');
}
