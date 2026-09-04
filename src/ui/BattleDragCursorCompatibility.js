const PATCH_FLAG = Symbol.for('clbwzzz.battleDragCursorCompatibility');

export function installBattleDragCursorCompatibility() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  document.addEventListener('dragover', (event) => {
    if (!document.body.classList.contains('battle-immersive')) return;
    const ghost = document.querySelector('#drag-ghost:not(.hidden)');
    if (!ghost) return;
    event.preventDefault();
    try {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    } catch {
      // 某些浏览器的 dataTransfer 在拖拽结束瞬间不可写。
    }
  });
}
