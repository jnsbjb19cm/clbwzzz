/**
 * 做题充值 · 服务端权威（2026-10-14 用户需求）
 *
 * 规则：
 *   · 选择题：选对给钻石（按难度）
 *   · 简答题：只返回参考答案，不发钻石
 *   · 设计题：答案要点命中率 ≥80% 给钻石；未达标 → 本题不发，但**下一题答对双倍**（最多双倍）
 *   · **一周最多 600 钻石**（服务端硬上限，跨设备/重登都有效）
 */
import express from 'express';
import { db } from '../database.js';
import {
  QUESTIONS, WEEKLY_DIAMOND_CAP, DIAMOND_BY_DIFFICULTY,
  quizQuestionById, publicQuestion, gradeAnswer,
} from '../quiz/quizBank11408.js';

export const quizAuthorityRouter20261014 = express.Router();

const TABLE_SQL = 'CREATE TABLE IF NOT EXISTS player_quiz_state ('
  + 'user_id INTEGER NOT NULL, week_key TEXT, earned INTEGER DEFAULT 0, '
  + 'double_next INTEGER DEFAULT 0, PRIMARY KEY(user_id))';

let tableReady = null;
async function ensureTable() {
  if (!tableReady) tableReady = db.run(TABLE_SQL).catch(() => null);
  await tableReady;
}

/** 周一为一周起点，key = YYYY-MM-DD（周一那天的日期） */
function currentWeekKey() {
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7;          // 周一=0
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

async function readState(userId) {
  await ensureTable();
  const weekKey = currentWeekKey();
  const row = await db.get('SELECT week_key, earned, double_next FROM player_quiz_state WHERE user_id=?', [userId]);
  if (!row || row.week_key !== weekKey) {
    await db.run(
      'UPDATE player_quiz_state SET week_key=?, earned=0, double_next=0 WHERE user_id=?', [weekKey, userId],
    ).then((r) => {
      if (!Number(r?.changes ?? r?.affectedRows ?? 0)) {
        return db.run('INSERT INTO player_quiz_state(user_id, week_key, earned, double_next) VALUES(?,?,0,0)', [userId, weekKey]);
      }
      return null;
    }).catch(() => null);
    return { weekKey, earned: 0, doubleNext: false };
  }
  return { weekKey, earned: Number(row.earned) || 0, doubleNext: Number(row.double_next) === 1 };
}

async function writeState(userId, weekKey, earned, doubleNext) {
  await db.run('INSERT INTO player_quiz_state(user_id, week_key, earned, double_next) VALUES(?,?,?,?) '
    + 'ON DUPLICATE KEY UPDATE week_key=VALUES(week_key), earned=VALUES(earned), double_next=VALUES(double_next)',
  [userId, weekKey, earned, doubleNext ? 1 : 0]).catch(async () => {
    // SQLite 不支持上面的 upsert 语法时走这里
    await db.run('UPDATE player_quiz_state SET week_key=?, earned=?, double_next=? WHERE user_id=?', [weekKey, earned, doubleNext ? 1 : 0, userId]);
  });
}

function statePayload(state) {
  return {
    weekKey: state.weekKey,
    earned: state.earned,
    cap: WEEKLY_DIAMOND_CAP,
    remaining: Math.max(0, WEEKLY_DIAMOND_CAP - state.earned),
    doubleNext: Boolean(state.doubleNext),
  };
}

/** 题目列表（不含答案） */
quizAuthorityRouter20261014.get('/quiz/questions', (req, res) => {
  res.json({ questions: QUESTIONS.map(publicQuestion), cap: WEEKLY_DIAMOND_CAP });
});

/** 本周状态 */
quizAuthorityRouter20261014.get('/quiz/state', async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(401).json({ message: '登录状态无效' });
    return res.json(statePayload(await readState(userId)));
  } catch (error) {
    console.error('[quiz] state 失败', error);
    return res.status(500).json({ message: '读取做题状态失败' });
  }
});

/** 交卷：服务端判分 + 发钻石（周上限 600，双倍规则） */
quizAuthorityRouter20261014.post('/quiz/answer', async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(401).json({ message: '登录状态无效' });
    const question = quizQuestionById(req.body?.questionId);
    if (!question) return res.status(404).json({ message: '题目不存在' });

    const result = gradeAnswer(question, req.body ?? {});
    const state = await readState(userId);

    let granted = 0;
    let doubled = false;
    let note = '';

    if (result.kind === 'short') {
      note = '简答题只提供参考答案，不发放钻石';
    } else if (result.correct) {
      let amount = Number(result.diamonds) || 0;
      if (state.doubleNext) { amount *= 2; doubled = true; }
      const room = Math.max(0, WEEKLY_DIAMOND_CAP - state.earned);
      granted = Math.min(amount, room);
      if (granted > 0) {
        await db.run('UPDATE player_profiles SET diamond=diamond+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [granted, userId]);
      }
      note = room <= 0 ? '本周已达 600 钻石上限，下周再来' : '';
      await writeState(userId, state.weekKey, state.earned + granted, false);
    } else if (result.kind === 'design') {
      // 设计题未达标：本题不发，但下一题答对双倍（最多双倍）
      note = `要点命中 ${Math.round((result.hitRatio ?? 0) * 100)}%，需 ≥${Math.round((result.needed ?? 0.8) * 100)}%；本题不发钻石，下一题答对**双倍**`;
      await writeState(userId, state.weekKey, state.earned, true);
    } else {
      note = '答错了，再接再厉';
      await writeState(userId, state.weekKey, state.earned, false);
    }

    const after = await readState(userId);
    return res.json({
      ok: true,
      correct: result.correct,
      kind: result.kind,
      correctIndex: result.correctIndex ?? null,
      reference: result.reference ?? null,
      hitRatio: result.hitRatio ?? null,
      hitKeywords: result.hitKeywords ?? null,
      missKeywords: result.missKeywords ?? null,
      granted, doubled, note,
      state: statePayload(after),
    });
  } catch (error) {
    console.error('[quiz] answer 失败', error);
    return res.status(500).json({ message: '判分失败，请稍后重试' });
  }
});
