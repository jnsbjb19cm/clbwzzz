export class PlaceholderView {
  constructor(module) {
    this.module = module;
  }

  render(root) {
    const titles = {
      smithy: '铁匠铺',
      shop: '商城',
      guild: '公会',
      quest: '任务',
      social: '好友聊天',
      talent: '天赋 & 技能',
      hall: '名人堂',
      auction: '拍卖行',
    };
    root.innerHTML = `
      <div class="placeholder-page">
        <div class="placeholder-card">
          <h2>${titles[this.module] ?? this.module}</h2>
          <p>该模块界面按设计文档规划，核心战斗与图鉴逻辑已可用。</p>
          <p class="muted">返回主城或进入「游戏大厅」体验五路战斗。</p>
        </div>
      </div>
    `;
  }
}
