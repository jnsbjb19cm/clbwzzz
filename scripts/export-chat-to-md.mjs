/**
 * 将 Grok session 对话导出为可读 Markdown
 */
import fs from 'fs';
import path from 'path';

const CHAT = 'D:/clbwz/保卫战素材/对话导出-2026-06-21/chat_history.jsonl';
const UPDATES =
  'C:/Users/佰震/.grok/sessions/C%3A%5CUsers%5C%E4%BD%B0%E9%9C%87/019ed3f3-4f60-79e3-91d1-0a4c1e15a75f/updates.jsonl';
const OUT = 'D:/clbwz/对话.md';

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function clean(text) {
  if (!text) return '';
  return text
    .replace(/<system_reminder>[\s\S]*?<\/system_reminder>/g, '')
    .replace(/<user_info>[\s\S]*?<\/user_info>/g, '')
    .replace(/<rules>[\s\S]*?<\/rules>/g, '')
    .replace(/<agent_skills>[\s\S]*?<\/agent_skills>/g, '')
    .replace(/<mcp_file_system>[\s\S]*?<\/mcp_file_system>/g, '')
    .replace(/<user_query>\s*/g, '')
    .replace(/<\/user_query>/g, '')
    .replace(/<transcript_location>[\s\S]*?<\/transcript_location>/g, '')
    .trim();
}

function extractUser(text) {
  const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
  return clean(m ? m[1] : text);
}

function isNoiseUser(text) {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith('You are an AI coding assistant')) return true;
  if (t.startsWith('<mcp_file_system>')) return true;
  if (t.includes('Plan mode is still active') && !t.includes('<user_query>')) return true;
  return false;
}

function buildFromUpdates(rows) {
  const turns = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const body = current.parts.join('');
    if (body.trim()) turns.push({ ...current, body });
    current = null;
  };

  for (const row of rows) {
    const u = row?.params?.update;
    if (!u) continue;
    const kind = u.sessionUpdate;
    const text = u.content?.text ?? '';

    if (kind === 'user_message_chunk') {
      if (!current || current.role !== 'user') {
        flush();
        current = { role: 'user', parts: [], ts: row.timestamp };
      }
      current.parts.push(text);
    } else if (kind === 'agent_message_chunk') {
      if (!current || current.role !== 'assistant') {
        flush();
        current = { role: 'assistant', parts: [], ts: row.timestamp };
      }
      current.parts.push(text);
    } else if (kind === 'tool_call') {
      if (!current || current.role !== 'assistant') {
        flush();
        current = { role: 'assistant', parts: [], ts: row.timestamp };
      }
      const title = u.title || u.rawInput?.description || 'tool';
      current.parts.push(`\n\n> [工具] ${title}\n`);
    }
  }
  flush();
  return turns;
}

function buildFromChat(rows) {
  const turns = [];
  for (const e of rows) {
    if (e.type === 'user') {
      const raw =
        typeof e.content === 'string'
          ? e.content
          : Array.isArray(e.content)
            ? e.content.map((p) => p.text ?? '').join('')
            : '';
      if (e.synthetic_reason === 'system_reminder') continue;
      const body = extractUser(raw);
      if (isNoiseUser(body)) continue;
      if (e.synthetic_reason === 'compaction_meta') {
        turns.push({ role: 'system', body: '【对话上下文压缩摘要】\n\n' + body.slice(0, 6000) });
        continue;
      }
      turns.push({ role: 'user', body });
    } else if (e.type === 'assistant') {
      const body = clean(typeof e.content === 'string' ? e.content : '');
      if (!body) continue;
      let full = body;
      if (e.tool_calls?.length) {
        full += `\n\n> 调用: ${e.tool_calls.map((t) => t.name).join(', ')}\n`;
      }
      turns.push({ role: 'assistant', body: full });
    }
  }
  return turns;
}

function mergeTurns(primary, secondary) {
  const seen = new Set();
  const all = [];
  for (const t of [...primary, ...secondary]) {
    const key = `${t.role}:${t.body.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(t);
  }
  return all;
}

const updates = readJsonl(UPDATES);
const chat = readJsonl(CHAT);
const updateTurns = buildFromUpdates(updates);
const chatTurns = buildFromChat(chat);
const turns = updateTurns.length > chatTurns.length ? updateTurns : mergeTurns(updateTurns, chatTurns);

const now = new Date().toISOString().slice(0, 10);
let md = `# Grok Agent 对话记录\n\n`;
md += `- 导出日期: ${now}\n`;
md += `- 项目: D:\\clbwz\\保卫战素材\n`;
md += `- Session: 019ed3f3-4f60-79e3-91d1-0a4c1e15a75f\n`;
md += `- 原始 chat: ${CHAT}\n`;
md += `- 原始 updates: ${UPDATES}\n`;
md += `- 共 ${turns.length} 条消息\n\n`;

let userN = 0;
for (const t of turns) {
  if (t.role === 'user') {
    userN++;
    md += `\n---\n\n## 用户 #${userN}\n\n${t.body}\n`;
  } else if (t.role === 'assistant') {
    md += `\n### 助手\n\n${t.body}\n`;
  } else {
    md += `\n### ${t.role}\n\n${t.body}\n`;
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md, 'utf8');
console.log(`OK: ${turns.length} turns -> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);