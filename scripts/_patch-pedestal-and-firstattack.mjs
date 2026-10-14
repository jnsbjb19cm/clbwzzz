// ① 首攻不再重复触发（保留瞬发）② 品质底座开关（默认关：不画 劣质/普通）
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const write = (p, s) => writeFileSync(p, s.replace(/\n/g, '\r\n'));
let n = 0;
const ok = (msg) => { console.log('  ✔ ' + msg); n += 1; };
const miss = (msg) => console.log('  · 未匹配: ' + msg);

// ---------- ① BattleEngine: 首次攻击计时器只清零一次 ----------
{
  const p = 'src/battle/BattleEngine.js';
  let s = read(p);
  const a = `    if (unit.atk > 0) {
      unit.firstAttackReadyAt = this.time + (unit.isRanged() ? 1 : 0);
      unit.atkTimer = 0;
    }`;
  const b = `    if (unit.atk > 0) {
      unit.firstAttackReadyAt = this.time + (unit.isRanged() ? 1 : 0);
      // 2026-10-13（用户 ④）：保留"瞬发首攻"，但**原版的首次攻击计时器不再重复触发**。
      // 原来这里每次调用都 atkTimer = 0 —— 只要 initUnitSpawnFade 被重复调用
      //（预加载路径 preload=true 也会走到这里），冷却就会被反复清零，
      // 于是两套机制各打一枪 -> 单位攻击抽搐。
      // 现在只在**首次真正出生**时清零一次（_spawnFadeInitialized 记账）。
      if (!unit._spawnFadeInitialized) {
        unit._spawnFadeInitialized = true;
        unit.atkTimer = 0;
      }
    }`;
  if (s.includes(a)) { write(p, s.replace(a, b)); ok('BattleEngine: 首攻计时器只清零一次（保留瞬发）'); }
  else miss('initUnitSpawnFade');
}

// ---------- ② 设置默认值：是否显示普通/劣质品质底座（默认关 = 不显示） ----------
{
  const p = 'src/core/GameSettingsStore20260910.js';
  let s = read(p);
  if (!s.includes('showLowQualityPedestal')) {
    const a = "  /** 战斗内显示单位血条。默认开。 */";
    const b = `  /**
   * 2026-10-13 用户：是否显示「普通 / 劣质」品质底座。
   * 默认关（= 不画）：劣质(1) / 普通(2) 的单位不画品质圆盘；精品(3) 及以上照常显示。
   */
  showLowQualityPedestal: false,
  /** 战斗内显示单位血条。默认开。 */`;
    if (s.includes(a)) { write(p, s.replace(a, b)); ok('设置默认值: showLowQualityPedestal = false（默认不显示）'); }
    else miss('GAME_SETTINGS_DEFAULTS');
  } else console.log('  · 设置项已存在');
}

// ---------- ③ 底座绘制处按开关跳过（劣质/普通） ----------
{
  const p = 'src/ui/BattleUnitHaloFinal.js';
  let s = read(p);
  if (!s.includes('showLowQualityPedestal')) {
    if (!s.includes('GameSettingsStore20260910.js')) {
      s = s.replace(
        "import { paintQualityDisc } from './BattleQualityHaloFix20260908.js';",
        "import { paintQualityDisc } from './BattleQualityHaloFix20260908.js';\nimport { gameSettings } from '../core/GameSettingsStore20260910.js';",
      );
    }
    const a = `  try {
    paintQualityDisc(ctx, Number(layout.cx) || 0, (Number(layout.footY) || 0) + 1, unit?.craftQuality ?? 1);
  } catch { /* 真图还没加载好：下面的几何底座先顶上 */ }`;
    const b = `  // 2026-10-13 用户：开关默认关闭 -> 劣质(1)/普通(2) 不画品质底座；精品及以上照常。
  const _qualityForPedestal = Number(unit?.craftQuality) || 1;
  const _showLowPedestal = gameSettings.get('showLowQualityPedestal') === true;
  if (_showLowPedestal || _qualityForPedestal > 2) {
    try {
      paintQualityDisc(ctx, Number(layout.cx) || 0, (Number(layout.footY) || 0) + 1, _qualityForPedestal);
    } catch { /* 真图还没加载好：下面的几何底座先顶上 */ }
  }`;
    if (s.includes(a)) { write(p, s.replace(a, b)); ok('底座绘制: 按开关跳过 劣质/普通'); }
    else miss('paintQualityDisc 调用点');
  } else console.log('  · 绘制处已处理');
}

// ---------- ④ 设置界面加一行（照抄现有开关写法） ----------
{
  const p = 'src/ui/SettingsView.js';
  let s = read(p);
  if (!s.includes('setting-low-pedestal')) {
    // 读值
    const ra = "    const silhouette = gameSettings.get('gallerySilhouetteUnowned') === true;";
    if (s.includes(ra)) {
      s = s.replace(ra, ra + "\n    const showLowPedestal = gameSettings.get('showLowQualityPedestal') === true;");
    } else miss('读值锚点');
    // 行
    const ha = `<label class="gset-row gset-row-check">图鉴：未获得的卡显示为剪影<input id="setting-gallery-silhouette" type="checkbox" \${silhouette ? 'checked' : ''} /></label>`;
    if (s.includes(ha)) {
      s = s.replace(ha, ha + `\n            <label class="gset-row gset-row-check">显示普通/劣质品质底座<input id="setting-low-pedestal" type="checkbox" \${showLowPedestal ? 'checked' : ''} /></label>`);
    } else miss('设置行锚点');
    // 绑定
    const ba = "      gameSettings.set('gallerySilhouetteUnowned', e.target.checked);";
    if (s.includes(ba)) {
      s = s.replace(ba, ba + "\n    });\n    root.querySelector('#setting-low-pedestal')?.addEventListener('change', (e) => {\n      gameSettings.set('showLowQualityPedestal', e.target.checked);");
    } else miss('绑定锚点');
    write(p, s);
    ok('设置界面: 新增「显示普通/劣质品质底座」开关');
  } else console.log('  · 设置行已存在');
}

console.log('改动项:', n);
