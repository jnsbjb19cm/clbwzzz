/**
 * 钻石充值 → 做题充值（2026-10-14 用户需求）
 *
 * 入口：大厅「钻石充值」按钮（.classic-recharge-btn，可能有多处）
 *   ① 一键充值 → 提示「本游戏完全免费，请勿充值」
 *   ② 做题充值 → 11408 题库答题：选择题选对给钻石、简答题给参考答案、
 *      设计题按要点命中率 ≥80% 给钻石（未达标本题不发、下一题答对双倍，最多双倍）
 *      一周最多 600 钻石（服务端权威，见 server/routes/quizAuthority20261014.js）
 */
import { authStore } from '../core/AuthStore.js';

const PATCH_FLAG = Symbol.for('clbwz.diamondRechargeQuiz20261014');
const API = '/api/player/quiz';

function el(html) {
  const box = document.createElement('div');
  box.innerHTML = html.trim();
  return box.firstElementChild;
}

function ensureModalStyle() {
  if (document.getElementById('quiz-modal-style')) return;
  const style = document.createElement('style');
  style.id = 'quiz-modal-style';
  style.textContent = `
.quiz-mask{position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}
.quiz-panel{width:min(680px,94vw);max-height:88vh;overflow:auto;background:#241a12;border:2px solid #d7b773;border-radius:12px;padding:18px 20px;color:#f6e9d2;font-family:SimSun,'宋体',serif;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.quiz-panel h3{margin:0 0 10px;color:#ffe0a0;font-size:20px}
.quiz-row{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
.quiz-btn{flex:1 1 180px;padding:12px 14px;border-radius:8px;border:1px solid #d7b773;background:#6b4a24;color:#fff;font-size:16px;cursor:pointer}
.quiz-btn:hover{background:#815a2c}
.quiz-btn.ghost{background:transparent;color:#e8d6b0}
.quiz-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:14px;color:#cbb17a;margin:6px 0 10px}
.quiz-title{font-size:17px;line-height:1.55;margin:6px 0 12px;color:#fff}
.quiz-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:10px 12px;border-radius:8px;border:1px solid #6d5535;background:#2f2318;color:#f2e6cf;font-size:15px;cursor:pointer}
.quiz-opt:hover{border-color:#d7b773}
.quiz-opt.is-correct{border-color:#57d07a;background:#1e3a26}
.quiz-opt.is-wrong{border-color:#e06464;background:#3a1e1e}
.quiz-text{width:100%;min-height:110px;background:#1c1409;color:#f6e9d2;border:1px solid #6d5535;border-radius:8px;padding:10px;font-size:14px;font-family:inherit}
.quiz-out{margin-top:12px;padding:10px 12px;border-radius:8px;background:#1c1409;border:1px dashed #6d5535;font-size:14px;line-height:1.6;white-space:pre-wrap}
.quiz-progress{height:10px;border-radius:6px;background:#3a2c1d;overflow:hidden;margin:6px 0 2px}
.quiz-progress > i{display:block;height:100%;background:linear-gradient(90deg,#ffd75e,#ffa726)}
.quiz-badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#7a3ea8;color:#fff;font-size:12px}
.quiz-note{color:#ffb3b3;font-size:13px}
`;
  document.head.appendChild(style);
}

function closeAny() {
  document.querySelectorAll('.quiz-mask').forEach((node) => node.remove());
}

function openShell(title, bodyHtml) {
  closeAny();
  ensureModalStyle();
  const mask = el('<div class="quiz-mask"><div class="quiz-panel"><h3>'
    + title + '</h3><div class="quiz-body"></div></div></div>');
  mask.querySelector('.quiz-body').innerHTML = bodyHtml;
  mask.addEventListener('click', (event) => { if (event.target === mask) mask.remove(); });
  document.body.appendChild(mask);
  return mask;
}

/* ---------- ① 充值弹窗 ---------- */
function openRechargeDialog() {
  const mask = openShell('💎 钻石充值', [
    '<div class="quiz-row">',
    '<button type="button" class="quiz-btn" data-act="onekey">一键充值</button>',
    '<button type="button" class="quiz-btn" data-act="quiz">做题充值</button>',
    '<button type="button" class="quiz-btn ghost" data-act="close">关闭</button>',
    '</div>',
    '<div style="font-size:13px;color:#cbb17a;line-height:1.6">',
    '本游戏为学习性质的小项目。「做题充值」通过答题获得钻石，一周最多 600 颗。',
    '</div>',
  ].join(''));
  mask.addEventListener('click', (event) => {
    const act = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
    const action = act ? act.dataset.act : '';
    if (!action) return;
    if (action === 'close') { mask.remove(); return; }
    if (action === 'onekey') {
      const notice = openShell('谢谢你的心意', [
        '<p style="font-size:18px;line-height:1.7;color:#ffe0a0;margin:6px 0 14px">',
        '本游戏完全免费，请勿充值',
        '</p>',
        '<div class="quiz-row"><button type="button" class="quiz-btn" data-act="back">返回</button></div>',
      ].join(''));
      notice.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('[data-act="back"]')) openRechargeDialog();
      });
      return;
    }
    if (action === 'quiz') { mask.remove(); void openQuizPanel(); }
  });
}

/* ---------- ② 做题充值 ---------- */
async function fetchJson(path, options) {
  try {
    return options ? await authStore.api.post(path, options) : await authStore.api.get(path);
  } catch (error) {
    return { __error: (error && error.message) || '网络错误' };
  }
}

function progressHtml(state) {
  const earned = Number(state && state.earned ? state.earned : 0);
  const cap = Number(state && state.cap ? state.cap : 600);
  const pct = cap > 0 ? Math.min(100, Math.round((earned / cap) * 100)) : 0;
  return [
    '<div class="quiz-meta">',
    '<span>本周已得 <b style="color:#ffd75e">' + earned + '</b> / ' + cap + ' 💎</span>',
    '<span>剩余 ' + Math.max(0, cap - earned) + ' 💎</span>',
    (state && state.doubleNext) ? '<span class="quiz-badge">下一题答对双倍</span>' : '',
    '</div>',
    '<div class="quiz-progress"><i style="width:' + pct + '%"></i></div>',
  ].join('');
}

async function openQuizPanel() {
  const mask = openShell('📚 做题充值 · 11408', '<div class="quiz-note">加载中…</div>');
  const body = mask.querySelector('.quiz-body');
  const listRes = await fetchJson(API + '/questions');
  const stateRes = await fetchJson(API + '/state');
  if (listRes.__error || stateRes.__error) {
    body.innerHTML = '<div class="quiz-note">' + (listRes.__error || stateRes.__error) + '</div>';
    return;
  }
  const questions = Array.isArray(listRes.questions) ? listRes.questions : [];
  if (!questions.length) { body.innerHTML = '<div class="quiz-note">题库为空</div>'; return; }

  let index = 0;
  let state = stateRes;

  const showOut = (html) => {
    const out = body.querySelector('.quiz-out');
    if (!out) return;
    out.hidden = false;
    out.innerHTML = html;
  };

  const submit = async (payload) => {
    const res = await fetchJson(API + '/answer', Object.assign({ questionId: body.dataset.qid }, payload));
    if (res.__error) { showOut(res.__error); return; }
    if (res.state) state = res.state;
    const head = res.correct === true
      ? '<b style="color:#7de3a1">✔ 答对了' + (res.doubled ? '（双倍）' : '') + '</b> +' + res.granted + ' 💎'
      : (res.correct === false
        ? '<b style="color:#ff9b9b">✘ 答错</b>'
        : '<b style="color:#ffd75e">参考答案</b>');
    const parts = [head];
    if (res.correctIndex != null) parts.push('正确答案：' + String.fromCharCode(65 + Number(res.correctIndex)));
    if (res.reference) parts.push(res.reference);
    if (res.hitRatio != null) {
      const miss = (res.missKeywords && res.missKeywords.length) ? '\n未命中：' + res.missKeywords.join('、') : '';
      parts.push('要点命中 ' + Math.round(res.hitRatio * 100) + '%' + miss);
    }
    if (res.note) parts.push(res.note);
    showOut(parts.join('<br>'));
  };

  const render = () => {
    const q = questions[index % questions.length];
    const kindLabel = q.kind === 'choice' ? '选择题' : (q.kind === 'short' ? '简答题' : '设计题');
    let interaction = '';
    if (q.kind === 'choice') {
      interaction = (q.options || []).map((text, i) => '<button type="button" class="quiz-opt" data-opt="'
        + i + '">' + String.fromCharCode(65 + i) + '. ' + text + '</button>').join('');
    } else if (q.kind === 'short') {
      interaction = '<div class="quiz-row"><button type="button" class="quiz-btn" data-act="reveal">查看参考答案</button></div>';
    } else {
      interaction = '<textarea class="quiz-text" placeholder="写下你的设计思路（要点写全更容易达标）"></textarea>'
        + '<div class="quiz-row"><button type="button" class="quiz-btn" data-act="submit-design">提交作答</button></div>';
    }
    body.innerHTML = progressHtml(state)
      + '<div class="quiz-meta"><span>' + kindLabel + '</span><span>难度 ' + q.difficulty + '</span>'
      + '<span>答对可得 <b style="color:#ffd75e">' + q.diamonds + '</b> 💎</span>'
      + '<span>' + (q.topic || '') + '</span></div>'
      + '<div class="quiz-title">第 ' + (index + 1) + ' 题：' + q.title + '</div>'
      + interaction
      + '<div class="quiz-out" hidden></div>'
      + '<div class="quiz-row"><button type="button" class="quiz-btn" data-act="next">下一题</button>'
      + '<button type="button" class="quiz-btn ghost" data-act="close">关闭</button></div>';
    body.dataset.qid = q.id;
    body.dataset.kind = q.kind;
  };

  body.addEventListener('click', async (event) => {
    const optNode = event.target && event.target.closest ? event.target.closest('[data-opt]') : null;
    if (optNode) {
      const picked = Number(optNode.dataset.opt);
      body.querySelectorAll('.quiz-opt').forEach((node) => { node.disabled = true; });
      optNode.classList.add('is-correct');
      await submit({ choiceIndex: picked });
      return;
    }
    const actNode = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
    const action = actNode ? actNode.dataset.act : '';
    if (!action) return;
    if (action === 'next') { index += 1; render(); return; }
    if (action === 'close') { mask.remove(); return; }
    if (action === 'reveal') {
      const res = await fetchJson(API + '/answer', { questionId: body.dataset.qid });
      showOut(res.reference || '暂无参考答案');
      return;
    }
    if (action === 'submit-design') {
      const area = body.querySelector('.quiz-text');
      const text = area ? area.value : '';
      if (String(text).trim().length < 10) { showOut('请至少写 10 个字，把要点写清楚'); return; }
      await submit({ text });
    }
  });

  render();
}

export function installDiamondRechargeQuiz() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  // 事件委托（capture）：无论「钻石充值」按钮由哪个界面渲染出来都能接住
  document.addEventListener('click', (event) => {
    const target = event.target;
    const btn = target && target.closest ? target.closest('.classic-recharge-btn') : null;
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (!authStore || !authStore.isLoggedIn || !authStore.isLoggedIn()) { window.alert('请先登录'); return; }
    openRechargeDialog();
  }, true);
}
