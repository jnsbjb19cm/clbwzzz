// 抛物线卡牌的权威出手帧。浏览器/PVE 烘焙元数据与无头 PVP 服务器共用这一份来源，
// 避免客户端已经按 DragonBones 出手、服务端却仍退回统一 0.22s。
//
// 2026-08-10 源 soldier_skeleton.xml 审计：
// - 20: attacking 顶层 event="atk" 在 frame 8，bullet 也只在 frame 8 显示；主要攻击层同时到峰值。
// - 70: event="atk" 在 frame 15，soldier70-bullet 只在 frame 15 显示。
// - 82: event="atk" 在 frame 11，bullet 只在 frame 11 显示。
// - 9/17/54/72 来自同轮 DragonBones 投掷动作峰值审计。
export const ATTACK_ACTION_FPS = 24;
export const PARABOLA_RELEASE_SOURCE = 'dragonbones-throw-apex-20260810';

export const PARABOLA_RELEASE_FRAME_BY_RES = Object.freeze({
  9: 10,
  17: 9,
  20: 8,
  54: 9,
  70: 15,
  72: 13,
  82: 11,
});

export function getParabolaReleaseFrame(res) {
  const frame = PARABOLA_RELEASE_FRAME_BY_RES[Number(res)];
  return Number.isInteger(frame) ? frame : null;
}

export function getParabolaReleaseDelaySec(res) {
  const frame = getParabolaReleaseFrame(res);
  return frame == null ? null : frame / ATTACK_ACTION_FPS;
}
