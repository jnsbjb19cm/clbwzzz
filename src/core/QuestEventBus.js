/**
 * 2026-10-09：任务事件总线。
 *
 * 各系统（教程、转盘、铁匠铺、战斗、商店、公会、聊天…）只需要上报「发生了什么」，
 * 不必 import QuestView —— 那会把 UI 依赖（CSS/DOM）拖进底层模块，也容易成环。
 * QuestView 在模块加载时把 dispatch 挂到 globalThis.__clbwzQuestDispatch，
 * 这里只做一次可选调用，任务系统不在场时静默忽略。
 */
export function emitQuestEvent(event, data = {}) {
  try {
    globalThis.__clbwzQuestDispatch?.(event, data);
  } catch (error) {
    // 2026-10-09：这里原来把异常静默吞掉 —— 用户报「买了东西/发了世界频道任务不涨」时，
    // 若真是 dispatch 内部出错，控制台一点线索都没有。现在至少打出事件名和堆栈。
    console.error(`[quest] 任务事件「${event}」处理失败（进度可能没记上）`, error);
  }
}
