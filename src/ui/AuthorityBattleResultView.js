import { BattleView } from './BattleView.js';
import { ItemDatabase } from '../core/ItemDatabase.js';
import { itemIconMarkup } from './ItemIcon.js';
import './AuthorityBattleResultView.css';

const items = new ItemDatabase();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

function teamTable(report, team) {
  const rows = report.rows.filter(row => row.team === team);
  const settled = report.status === 'settled';
  const name = team === 'red' ? '红队' : '蓝队';
  const outcome = report.winner === team ? '胜利' : report.winner ? '失败' : '平局';
  const rewardValue = value => settled ? `+${Number(value) || 0}` : '—';
  const fields = [
    ['名称', row => escapeHtml(row.nickname)],
    ['等级', row => `Lv.${Number(row.level) || 1}`],
    ['杀敌', row => Number(row.kills) || 0],
    ['伤亡', row => Number(row.losses) || 0],
    ['本局积分', row => Number(row.kills) * 10 + (report.winner === team ? 100 : 0)],
    ['功勋', row => rewardValue(row.honor)],
    ['经验', row => rewardValue(row.exp)],
    ['加成', () => '—'],
    ['战利品', row => !settled ? '等待结算' : row.items.length ? row.items.map(item =>
      `<span class="authority-prize">${itemIconMarkup(item.itemId, 32)}<span>${escapeHtml(items.getById(item.itemId)?.name ?? '道具')} ×${Number(item.count)}</span></span>`,
    ).join('') : '无'],
  ];
  return `<section class="authority-team authority-team-${team}"><h3>${name}<strong>${outcome}</strong></h3>
    <table aria-label="${name}战斗结果"><tbody>${fields.map(([label, render]) =>
      `<tr><th scope="row">${label}</th>${rows.length ? rows.map(row => `<td>${render(row)}</td>`).join('') : '<td>—</td>'}</tr>`,
    ).join('')}</tbody></table></section>`;
}

export function installAuthorityBattleResultView() {
  const previous = BattleView.prototype.updateResultOverlay;
  BattleView.prototype.updateResultOverlay = function (root) {
    const result = previous.call(this, root);
    const report = this.__authorityBattleReport;
    const card = root?.querySelector('#result-overlay .result-card');
    if (!report || !card || this.engine?.status === 'playing') return result;
    card.classList.add('authority-result-card');
    let board = card.querySelector('.authority-scoreboard');
    if (!board) {
      board = document.createElement('div');
      board.className = 'authority-scoreboard';
      card.querySelector('.result-actions')?.before(board);
    }
    // UI 可每帧刷新，只在结算数据变化时更新表格。
    const signature = JSON.stringify(report);
    if (board.dataset.report !== signature) {
      board.dataset.report = signature;
      const notice = report.status === 'error' ? '奖励结算失败，尚未发放'
        : report.status !== 'settled' ? '正在结算奖励…'
          : report.rewardsEnabled ? '奖励已发放至背包' : '不对等战斗：无道具、经验和功勋奖励';
      board.innerHTML = `<h2>战斗结果</h2><div class="authority-team-tables">${report.mode === 'pvp'
        ? teamTable(report, 'red') + teamTable(report, 'blue')
        : teamTable(report, 'blue')}</div><p class="authority-settlement-note" role="status">${escapeHtml(notice)}</p>`;
    }
    const desc = card.querySelector('#result-desc');
    if (desc) desc.textContent = report.mode === 'boss' ? report.bossName : '红蓝对决';
    return result;
  };
}
