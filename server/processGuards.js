/**
 * 进程级兜底（2026-10-07 全站 502 事故）。
 *
 * Node 15 起，未处理的 Promise rejection 默认会**终止进程**；未捕获异常同理。
 * 对这种「单进程 + 反向代理」的部署来说，任何一个漏网的异常
 * （比如某个库 emit 了没人监听的 'error'、某处忘了 catch）
 * 都会让**所有**接口一起变成 502 —— 现场就是转盘报错之后，
 * /api/player/snapshot 和 socket.io 全部 502。
 *
 * 这里把它们降级成「打日志、继续跑」：
 *   · unhandledRejection：绝大多数只是某个请求的异步链断了，没必要整站陪葬；
 *   · uncaughtException  ：风险略高，但比起「直接下线，等你有空手动重启」，
 *                          记日志活下来对玩家更友好。
 * 真要更稳的话，再配个进程守护（pm2 / systemd / docker restart）做自动重启。
 */
export function installProcessGuards() {
  if (typeof process === 'undefined' || globalThis.__clbwzProcessGuards) return;
  globalThis.__clbwzProcessGuards = true;

  process.on('unhandledRejection', (reason) => {
    console.error('[clbwzzz] 未处理的 Promise rejection（已忽略，服务继续运行）:', reason?.stack || reason?.message || reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[clbwzzz] 未捕获异常（已忽略，服务继续运行）:', error?.stack || error?.message || error);
  });
}
