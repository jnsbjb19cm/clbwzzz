/** 把 src/data/UpdateLog.js 的完整更新日志导出成 md（可随时重跑） */
import { writeFileSync, mkdirSync } from 'node:fs';
const { UPDATE_LOG } = await import('../src/data/UpdateLog.js');
const OUT = 'docs/UPDATE-LOG-FULL.md';
const L = [];
L.push('# 《丛林保卫战》更新日志（完整版）', '');
L.push(`> 由 \`scripts/update-log-md-20261015.mjs\` 从 \`src/data/UpdateLog.js\` 自动导出，共 ${UPDATE_LOG.length} 条。`);
L.push('> 游戏内「更新公告」展示的就是同一份数据。', '');
L.push('---', '');
for (const entry of UPDATE_LOG) {
  L.push(`## ${entry.date} · ${entry.title}`, '');
  for (const item of (entry.items ?? [])) L.push(`- ${item}`);
  L.push('');
}
mkdirSync('docs', { recursive: true });
writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('已生成:', OUT, '| 条目数:', UPDATE_LOG.length);
for (const e of UPDATE_LOG.slice(0, 3)) console.log('   ·', e.date, e.title, `(${e.items.length} 条)`);
