/**
 * 做题充值 · 题库（11408 = 计算机学科专业基础 408 风格）
 *
 * 2026-10-14 用户要求：
 *   · 选择题：选对给钻石（按难度给不同数量）
 *   · 简答题：给出参考答案（不发钻石，只作学习）
 *   · 设计题：开始作答，答案命中 ≥80% 要点即给钻石
 *   · 一周最多获得 600 钻石（服务端硬上限）
 *   · 设计题若未达标：本题不给钻石，但**下一题答对双倍**（最多双倍）
 *
 * ★ 题库是数据：直接往 QUESTIONS 里加题即可（id 唯一、difficulty 1~3）★
 */

export const WEEKLY_DIAMOND_CAP = 600;

/** 难度 → 钻石（1=基础 2=进阶 3=综合） */
export const DIAMOND_BY_DIFFICULTY = Object.freeze({ 1: 8, 2: 12, 3: 20 });

export const QUESTIONS = Object.freeze([
  {
    id: 'q-ds-01', kind: 'choice', difficulty: 1, topic: '数据结构',
    title: '在长度为 n 的顺序表中间位置插入一个元素，平均需要移动多少个元素？',
    options: ['n/2', '(n-1)/2', 'n', '(n+1)/2'], answerIndex: 0,
  },
  {
    id: 'q-ds-02', kind: 'choice', difficulty: 1, topic: '数据结构',
    title: '具有 n 个结点的完全二叉树，其高度（根为第 1 层）为？',
    options: ['⌊log2 n⌋', '⌊log2 n⌋+1', '⌈log2 n⌉', '⌈log2(n+1)⌉'], answerIndex: 1,
  },
  {
    id: 'q-os-01', kind: 'choice', difficulty: 2, topic: '操作系统',
    title: '时间片轮转调度中，时间片设置得过大会导致？',
    options: ['退化为先来先服务', '上下文切换过于频繁', '响应时间变短', '不会产生饥饿'], answerIndex: 0,
  },
  {
    id: 'q-co-01', kind: 'choice', difficulty: 2, topic: '计算机组成原理',
    title: 'Cache 与主存之间采用全相联映射时，其主要优点是？',
    options: ['硬件实现最简单', '块冲突概率最低、命中率较高', '地址转换最快', '不需要替换算法'], answerIndex: 1,
  },
  {
    id: 'q-net-01', kind: 'choice', difficulty: 3, topic: '计算机网络',
    title: 'TCP 拥塞控制中，慢开始阶段拥塞窗口的增长方式是？',
    options: ['线性增长', '指数增长', '对数增长', '保持不变'], answerIndex: 1,
  },
  {
    id: 'q-ds-03', kind: 'choice', difficulty: 3, topic: '数据结构',
    title: '对 n 个元素进行归并排序，最坏情况下的时间复杂度是？',
    options: ['O(n)', 'O(n log n)', 'O(n^2)', 'O(log n)'], answerIndex: 1,
  },
  {
    id: 'q-short-01', kind: 'short', difficulty: 2, topic: '操作系统',
    title: '简述进程与线程的区别（至少答出 3 点）。',
    reference: '① 进程是资源分配的基本单位，线程是 CPU 调度的基本单位；'
      + '② 同一进程的线程共享该进程的地址空间与资源，进程之间相互独立；'
      + '③ 线程创建/切换开销远小于进程；④ 进程间通信需借助内核机制（管道、共享内存等），'
      + '线程间可直接通过共享变量通信（需同步）；⑤ 一个进程崩溃通常不影响其它进程，而一个线程崩溃可能导致整个进程退出。',
  },
  {
    id: 'q-short-02', kind: 'short', difficulty: 1, topic: '计算机网络',
    title: '简述 TCP 三次握手的过程。',
    reference: '客户端发送 SYN=1、seq=x；服务器回复 SYN=1、ACK=1、seq=y、ack=x+1；'
      + '客户端再发送 ACK=1、ack=y+1。三次握手用于确认双方的收发能力并同步初始序号，防止历史连接请求造成误连。',
  },
  {
    id: 'q-design-01', kind: 'design', difficulty: 3, topic: '数据结构',
    title: '设计一个支持 O(1) 获取最小值的栈（MinStack），请说明数据结构与各操作实现要点。',
    keywords: ['辅助栈', '最小值', '同步入栈', '同步出栈', 'push', 'pop', 'top', 'O(1)', '比较', 'top 相同'],
    minHitRatio: 0.8,
  },
  {
    id: 'q-design-02', kind: 'design', difficulty: 3, topic: '操作系统',
    title: '设计一个简单的读者-写者问题解决方案（读者优先），说明信号量与计数变量的用法。',
    keywords: ['互斥量', '计数器', '读者优先', 'count', 'mutex', '写者等待', '第一个读者', '最后一个读者', '临界区', '信号量'],
    minHitRatio: 0.8,
  },
]);

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
export function quizQuestionById(id) { return BY_ID.get(String(id)) ?? null; }

/** 对外（客户端）可见的题目：**不含答案** */
export function publicQuestion(question) {
  const base = {
    id: question.id, kind: question.kind, difficulty: question.difficulty,
    topic: question.topic, title: question.title,
    diamonds: DIAMOND_BY_DIFFICULTY[question.difficulty] ?? 8,
  };
  if (question.kind === 'choice') base.options = [...question.options];
  return base;
}

/** 判分：选择=选项一致；设计=关键词命中率≥阈值；简答=只给参考答案不发钻石 */
export function gradeAnswer(question, payload) {
  if (!question) return { ok: false, correct: false, reason: '题目不存在' };
  if (question.kind === 'choice') {
    const picked = Number(payload?.choiceIndex);
    const correct = Number.isInteger(picked) && picked === Number(question.answerIndex);
    return {
      ok: true, correct, kind: 'choice',
      correctIndex: question.answerIndex,
      diamonds: correct ? (DIAMOND_BY_DIFFICULTY[question.difficulty] ?? 8) : 0,
    };
  }
  if (question.kind === 'design') {
    const text = String(payload?.text ?? '').toLowerCase();
    const keys = question.keywords ?? [];
    const hit = keys.filter((k) => text.includes(String(k).toLowerCase()));
    const ratio = keys.length ? hit.length / keys.length : 0;
    const need = Number(question.minHitRatio) || 0.8;
    const correct = ratio >= need;
    return {
      ok: true, correct, kind: 'design',
      hitRatio: Math.round(ratio * 1000) / 1000, needed: need,
      hitKeywords: hit, missKeywords: keys.filter((k) => !hit.includes(k)),
      reference: question.reference ?? null,
      diamonds: correct ? (DIAMOND_BY_DIFFICULTY[question.difficulty] ?? 8) : 0,
    };
  }
  // 简答题：只给参考答案，不发钻石
  return { ok: true, correct: null, kind: 'short', reference: question.reference ?? '', diamonds: 0 };
}
