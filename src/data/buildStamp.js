/**
 * 构建标记（2026-10-11）：用户几次"看不到改动生效"，需要一个一眼能确认版本的标识。
 * 每次改动后把这里的时间/条目更新一下；启动时会 console.log 出来，
 * 也可以在控制台执行 __clbwzBuild() 查看当前跑的到底是哪一版。
 */
export const BUILD_STAMP = 'clbwz 2026-10-11 · 图标规则⑤（1弓 2刀 3盾 4鼓 5特殊 6飞行 7钻地）';

if (typeof window !== 'undefined') {
  window.__clbwzBuild = () => BUILD_STAMP;
}
