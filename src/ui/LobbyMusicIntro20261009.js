import { audio } from '../core/AudioManager.js';
import { gameSettings } from '../core/GameSettingsStore20260910.js';
import { lobbyMusicChoice, lobbyMusicSrc } from '../core/BattleClientFlags20260910.js';

/**
 * 2026-10-09（用户要求）：首次进入游戏时弹一次「选择大厅音乐」，可以试听 A / B。
 *
 * 交互设计：
 *   - 点「音乐A / 音乐B」就是**试听**：直接切到那一首并播放（和正式播放走同一条路径，
 *     所以听到的就是最终效果，不需要另写一套试听逻辑）。
 *   - 点「就用这首」确认：记下选择，并且**以后不再弹出**。
 *   - 卡片里明确告知玩家：之后还能在「设置 → 大厅音乐」里随时更换。
 *
 * 只弹一次的实现：写到 GameSettingsStore 的 lobbyMusicIntroSeen（默认 false）。
 * 走 store 而不是另开 localStorage 键，符合本项目"设置只有一处权威"的约定。
 */
const SEEN_KEY = 'lobbyMusicIntroSeen';
const DIALOG_CLASS = 'lobby-music-intro';

/** 是否已经弹过（弹过就不再弹）。 */
export function lobbyMusicIntroSeen() {
  return gameSettings.get(SEEN_KEY) === true;
}

/** 试听 / 直接切到某一首：和设置页改音乐是同一条路径。 */
function applyChoice(choice, { fade = true } = {}) {
  gameSettings.set('lobbyMusic', choice);
  audio.playBgm('city', { src: lobbyMusicSrc(), fade });
}

/**
 * 首次进入大厅时调用。返回是否真的弹了窗（已弹过 / 环境不支持则返回 false）。
 */
export function maybeShowLobbyMusicIntro() {
  if (lobbyMusicIntroSeen()) return false;
  if (typeof document === 'undefined' || typeof document.body?.append !== 'function') return false;
  if (document.querySelector(`.${DIALOG_CLASS}`)) return false;

  let choice = lobbyMusicChoice();

  const dialog = document.createElement('div');
  dialog.className = `${DIALOG_CLASS} smithy-confirm-dialog`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = `
    <section class="smithy-confirm-card">
      <h3>选择大厅音乐</h3>
      <p>点一下就能试听。选好之后，还能在「设置 → 大厅音乐」里随时更换。</p>
      <div class="lobby-music-options">
        <button type="button" class="lobby-music-option" data-music-choice="A">
          <b>音乐A</b>
          <span>新大厅曲</span>
        </button>
        <button type="button" class="lobby-music-option" data-music-choice="B">
          <b>音乐B</b>
          <span>原来的主城曲</span>
        </button>
      </div>
      <div class="smithy-confirm-actions">
        <button type="button" class="bag-action" data-music-confirm>就用这首</button>
      </div>
    </section>`;
  document.body.append(dialog);

  const syncOptions = () => {
    dialog.querySelectorAll('[data-music-choice]').forEach((button) => {
      const active = button.dataset.musicChoice === choice;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };
  syncOptions();

  dialog.addEventListener('click', (event) => {
    const option = event.target.closest('[data-music-choice]');
    if (option) {
      choice = option.dataset.musicChoice;
      applyChoice(choice);   // 点即试听
      syncOptions();
      return;
    }
    if (!event.target.closest('[data-music-confirm]')) return;
    applyChoice(choice, { fade: false });          // 确保确定下来的就是听得见的那首
    gameSettings.set(SEEN_KEY, true);              // 以后不再弹
    dialog.remove();
  });

  return true;
}
