/**
 * 顶栏 UI 校准报告(读取 battleUiLayout.json)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const layout = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/battle/battleUiLayout.json'), 'utf8'),
);

const topW = layout.canvas.w - layout.topUi.left - layout.topUi.right;
const hr = layout.handRow;
const handTotal = hr.slotW * 10 + hr.gap * 9;

console.log('=== 顶栏 UI 校准报告 ===\n');
console.log('顶栏区域:', layout.topUi, 'width:', topW);
console.log('资源:', layout.resources);
console.log('卡槽行:', hr, '总宽:', handTotal);
console.log('\n9-slice 资产:');
for (const f of ['top_bar_cap_left.png', 'top_bar_sky_mid.png', 'top_bar_cap_right.png']) {
  const p = path.join(ROOT, 'assets/battle/background', f);
  console.log(fs.existsSync(p) ? `[ok] ${f}` : `[缺失] ${f}`);
}
console.log('\n比对: npm run verify:battle-ui');