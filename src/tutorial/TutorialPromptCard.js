import './TutorialPromptCard.css';

export function installTutorialPromptCard(panel) {
  panel.classList.add('tutorial-prompt-card');
  const handle = panel.querySelector('.new-player-tutorial-progress');
  handle.title = '拖动可移动提示框';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tutorial-prompt-toggle';
  handle.append(toggle);
  const compact = () => ['deploy','skill','win'].includes(panel.dataset.mode);
  const sync = () => {
    const expanded = !panel.classList.contains('is-folded') && (!compact() || panel.classList.contains('is-expanded'));
    toggle.textContent = expanded ? '收起' : '展开';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? '收起教程提示' : '展开教程提示');
  };
  toggle.onclick = () => {
    if (panel.classList.contains('is-folded') || (compact() && !panel.classList.contains('is-expanded'))) {
      panel.classList.remove('is-folded');panel.classList.add('is-expanded');
    } else { panel.classList.add('is-folded');panel.classList.remove('is-expanded'); }
    sync();clampPosition();
  };
  let drag = null, moved = false;
  const position = (left, top) => {
    panel.style.setProperty('left', `${Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, left))}px`, 'important');
    panel.style.setProperty('top', `${Math.max(8, Math.min(innerHeight - panel.offsetHeight - 8, top))}px`, 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
    panel.style.setProperty('transform', 'none', 'important');
  };
  function clampPosition() { if (moved) { const r=panel.getBoundingClientRect();position(r.left,r.top); } }
  handle.onpointerdown = event => {
    if (event.target.closest('button') || event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    drag = {x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    handle.setPointerCapture(event.pointerId);event.preventDefault();
  };
  handle.onpointermove = event => { if (drag) { moved=true;position(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y); } };
  handle.onpointerup = handle.onpointercancel = () => { drag=null; };
  const observer = new MutationObserver(() => {
    panel.classList.remove('is-folded','is-expanded');sync();clampPosition();
  });
  observer.observe(panel,{attributes:true,attributeFilter:['data-step','data-mode']});
  const sizeObserver = new ResizeObserver(clampPosition);sizeObserver.observe(panel);
  window.addEventListener('resize',clampPosition);
  sync();
  return () => { observer.disconnect();sizeObserver.disconnect();window.removeEventListener('resize',clampPosition); };
}
