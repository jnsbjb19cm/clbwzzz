import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import { config } from './config.js';

const isMysql = config.db.client === 'mysql';

let sqlite = null;
let pool = null;

function mustInit() {
  if (isMysql) {
    if (!pool) throw new Error('MySQL 连接池尚未初始化');
  } else if (!sqlite) {
    throw new Error('SQLite 尚未初始化');
  }
}

function sqliteRun(sql, params = []) {
  return sqlite.prepare(sql).run(...params);
}

function sqliteGet(sql, params = []) {
  return sqlite.prepare(sql).get(...params);
}

function sqliteAll(sql, params = []) {
  return sqlite.prepare(sql).all(...params);
}

function mysqlResult(result) {
  return { ...result, lastInsertRowid: result.insertId };
}

function sqliteConn() {
  return {
    run: async (sql, params = []) => sqliteRun(sql, params),
    get: async (sql, params = []) => sqliteGet(sql, params),
    all: async (sql, params = []) => sqliteAll(sql, params),
  };
}

function mysqlConn(connection) {
  return {
    run: async (sql, params = []) => {
      const [result] = await connection.query(sql, params);
      return mysqlResult(result);
    },
    get: async (sql, params = []) => {
      const [rows] = await connection.query(sql, params);
      return rows[0];
    },
    all: async (sql, params = []) => {
      const [rows] = await connection.query(sql, params);
      return rows;
    },
  };
}

/* ---------------------------------------------------------------------------
 * 数据库初始化状态（2026-10-07 全站 502 事故）
 *
 * 原来这里是**模块级顶层 await**：`if (isMysql) await initMysql(); else await initSqlite();`
 * 只要初始化抛错（MySQL 挂了 / 权限不足 / 某条 DDL 失败），整个模块加载失败 →
 * 进程在还没 listen 之前就退出 → 反向代理对**所有**接口返回 502（现场表现：
 * 先是转盘报错，随后 snapshot、socket.io 握手全 502）。
 *
 * 现在改成：失败只记日志、服务照常启动（代理能拿到真正的 HTTP 报错而不是 502），
 * 之后每次访问数据库前会按冷却时间自动重试初始化，MySQL 恢复后无需人工重启。
 * ------------------------------------------------------------------------- */
let dbReady = false;
let dbInitError = null;
let dbInitPromise = null;
let dbInitFailedAt = 0;
const DB_INIT_RETRY_COOLDOWN_MS = 15000;
/** 数据库不可用时被延后的建表语句（见 whenDatabaseReady） */
const pendingDdl = [];

/** 初始化（幂等）：成功返回 true，失败抛错并记录 */
export async function ensureDatabaseReady() {
  if (dbReady) return true;
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = (async () => {
    if (isMysql) await initMysql();
    else await initSqlite();
    dbReady = true;
    dbInitError = null;
    void flushPendingDdl();   // 数据库恢复后，把延后的建表补上
    return true;
  })()
    .catch((error) => {
      dbInitError = error;
      dbInitFailedAt = Date.now();
      throw error;
    })
    .finally(() => { dbInitPromise = null; });
  return dbInitPromise;
}

/** 给 /api/health 用：数据库到底连上没有、上次为什么失败 */
export function databaseStatus() {
  return {
    ready: dbReady,
    client: isMysql ? 'mysql' : 'sqlite',
    error: dbInitError ? String(dbInitError?.code || dbInitError?.message || dbInitError) : null,
    deferredDdl: pendingDdl.length,
  };
}

/** 不走就绪检查的裸执行（给建表用） */
async function execRaw(sql) {
  if (isMysql) {
    const [result] = await pool.query(sql);
    return mysqlResult(result);
  }
  return sqliteRun(sql);
}

/**
 * 模块顶层建表专用（2026-10-07 全站 502 事故）。
 *
 * `server/routes/*.js` 里有两处模块顶层 `await db.run(CREATE TABLE …)`：
 * 数据库连不上（或某条 DDL 失败）时，模块加载直接失败 → 进程还没 listen 就退出
 * → 反向代理对**所有**接口回 502。这里把它变成：
 *   · 数据库正常：和以前一样 await 建完表（行为不变）；
 *   · 数据库不可用：**只记日志不抛**，把这条 DDL 挂到 pendingDdl，
 *     等数据库恢复（initialize 成功）后自动补执行。
 */
export async function whenDatabaseReady(sql, label = 'ddl') {
  try {
    await ensureDatabaseReady();
    await execRaw(sql);
  } catch (error) {
    console.error(`[clbwzdb] ${label} 初始化失败（已延后，数据库恢复后自动补）:`, error?.code || error?.message || error);
    pendingDdl.push({ sql, label });
  }
}

async function flushPendingDdl() {
  if (!pendingDdl.length || !dbReady) return;
  const batch = pendingDdl.splice(0, pendingDdl.length);
  for (const task of batch) {
    try {
      await execRaw(task.sql);
      console.log(`[clbwzdb] 补建表成功：${task.label}`);
    } catch (error) {
      console.error(`[clbwzdb] 补建表失败：${task.label}`, error?.code || error?.message || error);
      pendingDdl.push(task);
    }
  }
}

/** 查询前确保已初始化；失败过就按冷却时间重试（避免每个请求都去连一次死库） */
async function ensureReadyForQuery() {
  if (dbReady) return;
  const cooling = dbInitFailedAt && (Date.now() - dbInitFailedAt) < DB_INIT_RETRY_COOLDOWN_MS;
  if (dbInitError && cooling) return;
  try {
    await ensureDatabaseReady();
  } catch {
    /* 交给下面的 mustInit() 抛出清晰错误 */
  }
}

export async function run(sql, params = []) {
  await ensureReadyForQuery();
  mustInit();
  if (isMysql) {
    const [result] = await pool.query(sql, params);
    return mysqlResult(result);
  }
  return sqliteRun(sql, params);
}

export async function get(sql, params = []) {
  await ensureReadyForQuery();
  mustInit();
  if (isMysql) {
    const [rows] = await pool.query(sql, params);
    return rows[0];
  }
  return sqliteGet(sql, params);
}

export async function all(sql, params = []) {
  await ensureReadyForQuery();
  mustInit();
  if (isMysql) {
    const [rows] = await pool.query(sql, params);
    return rows;
  }
  return sqliteAll(sql, params);
}

export async function withTransaction(fn) {
  await ensureReadyForQuery();
  mustInit();
  if (!isMysql) {
    await run('BEGIN');
    try {
      const result = await fn(sqliteConn());
      await run('COMMIT');
      return result;
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(mysqlConn(connection));
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS player_profiles (
  user_id INTEGER PRIMARY KEY,
  nickname TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1),
  exp INTEGER NOT NULL DEFAULT 0 CHECK(exp >= 0),
  hp INTEGER NOT NULL DEFAULT 1000 CHECK(hp >= 0),
  gold INTEGER NOT NULL DEFAULT 12800 CHECK(gold >= 0),
  diamond INTEGER NOT NULL DEFAULT 50 CHECK(diamond >= 0),
  honor INTEGER NOT NULL DEFAULT 120 CHECK(honor >= 0),
  arena INTEGER NOT NULL DEFAULT 80 CHECK(arena >= 0),
  selected_deck_no INTEGER NOT NULL DEFAULT 1 CHECK(selected_deck_no BETWEEN 1 AND 3),
  -- 2026-09-11：4 个卡组页签（默认 + 战团1~3）的"当前选择"用组名存这里，
  -- selected_deck_no 保持 1~3 兼容旧数据（默认组沿用旧值 1）。
  selected_deck_group TEXT NOT NULL DEFAULT 'default',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_settings (
  user_id INTEGER PRIMARY KEY,
  music_volume INTEGER NOT NULL DEFAULT 80 CHECK(music_volume BETWEEN 0 AND 100),
  effect_volume INTEGER NOT NULL DEFAULT 80 CHECK(effect_volume BETWEEN 0 AND 100),
  show_card_name INTEGER NOT NULL DEFAULT 1 CHECK(show_card_name IN (0,1)),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slot_index INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  star INTEGER NOT NULL DEFAULT 0 CHECK(star >= 0),
  craft_quality INTEGER NOT NULL DEFAULT 1 CHECK(craft_quality >= 0),
  UNIQUE(user_id, slot_index),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_player_cards_user_card ON player_cards(user_id, card_id);

CREATE TABLE IF NOT EXISTS player_card_bags (
  user_id INTEGER PRIMARY KEY,
  slot_count INTEGER NOT NULL DEFAULT 200 CHECK(slot_count >= 1),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  deck_no INTEGER NOT NULL CHECK(deck_no BETWEEN 0 AND 3),
  name TEXT NOT NULL,
  UNIQUE(user_id, deck_no),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id INTEGER NOT NULL,
  slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 9),
  card_id INTEGER NOT NULL,
  PRIMARY KEY(deck_id, slot_index),
  FOREIGN KEY(deck_id) REFERENCES player_decks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_items (
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  is_bound INTEGER NOT NULL DEFAULT 1 CHECK(is_bound IN (0,1)),
  PRIMARY KEY(user_id, item_id, is_bound),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_stage_progress (
  user_id INTEGER NOT NULL,
  stage_id TEXT NOT NULL,
  cleared INTEGER NOT NULL DEFAULT 0 CHECK(cleared IN (0,1)),
  best_stars INTEGER NOT NULL DEFAULT 0 CHECK(best_stars >= 0),
  clear_count INTEGER NOT NULL DEFAULT 0 CHECK(clear_count >= 0),
  best_time_ms INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, stage_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_quests (
  user_id INTEGER NOT NULL,
  quest_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0),
  claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, quest_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_hero_skills (
  user_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1),
  unlocked INTEGER NOT NULL DEFAULT 0 CHECK(unlocked IN (0,1)),
  PRIMARY KEY(user_id, skill_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, friend_id),
  UNIQUE(friend_id, user_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sender_id, receiver_id),
  FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notice TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 5),
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('president','vice_president','elite','member')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id, user_id),
  FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id, user_id),
  FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_warehouse (
  guild_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(guild_id, item_id),
  FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auction_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1 CHECK(count >= 1),
  price INTEGER NOT NULL DEFAULT 1 CHECK(price >= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','sold','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS battle_results (
  id TEXT PRIMARY KEY,
  room_id INTEGER,
  mode TEXT NOT NULL,
  stage_id TEXT,
  winner_team TEXT,
  started_at TEXT,
  ended_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_battle_results (
  battle_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  team TEXT NOT NULL,
  won INTEGER NOT NULL CHECK(won IN (0,1)),
  settled INTEGER NOT NULL DEFAULT 0 CHECK(settled IN (0,1)),
  PRIMARY KEY(battle_id, user_id),
  FOREIGN KEY(battle_id) REFERENCES battle_results(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_id TEXT,
  amount INTEGER NOT NULL DEFAULT 1,
  UNIQUE(battle_id, user_id, reward_type, reward_id),
  FOREIGN KEY(battle_id) REFERENCES battle_results(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

const MYSQL_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_profiles (
    user_id BIGINT PRIMARY KEY,
    nickname VARCHAR(64) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    exp BIGINT NOT NULL DEFAULT 0,
    hp BIGINT NOT NULL DEFAULT 1000,
    gold BIGINT NOT NULL DEFAULT 12800,
    diamond BIGINT NOT NULL DEFAULT 50,
    honor BIGINT NOT NULL DEFAULT 120,
    arena BIGINT NOT NULL DEFAULT 80,
    selected_deck_no INT NOT NULL DEFAULT 1,
    selected_deck_group VARCHAR(16) NOT NULL DEFAULT 'default',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_profiles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_settings (
    user_id BIGINT PRIMARY KEY,
    music_volume INT NOT NULL DEFAULT 80,
    effect_volume INT NOT NULL DEFAULT 80,
    show_card_name TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_settings_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_cards (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    slot_index INT NOT NULL,
    card_id INT NOT NULL,
    star INT NOT NULL DEFAULT 0,
    craft_quality INT NOT NULL DEFAULT 1,
    UNIQUE KEY uk_player_cards_user_slot(user_id, slot_index),
    KEY idx_player_cards_user_card(user_id, card_id),
    CONSTRAINT fk_cards_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_card_bags (
    user_id BIGINT PRIMARY KEY,
    slot_count INT NOT NULL DEFAULT 200,
    CONSTRAINT fk_cardbags_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_decks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    deck_no INT NOT NULL,
    name VARCHAR(64) NOT NULL,
    UNIQUE KEY uk_decks_user_deck(user_id, deck_no),
    CONSTRAINT fk_decks_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id BIGINT NOT NULL,
    slot_index INT NOT NULL,
    card_id INT NOT NULL,
    PRIMARY KEY(deck_id, slot_index),
    CONSTRAINT fk_deckcards_deck FOREIGN KEY(deck_id) REFERENCES player_decks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_items (
    user_id BIGINT NOT NULL,
    item_id INT NOT NULL,
    count BIGINT NOT NULL DEFAULT 0,
    is_bound TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY(user_id, item_id, is_bound),
    CONSTRAINT fk_items_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_stage_progress (
    user_id BIGINT NOT NULL,
    stage_id VARCHAR(128) NOT NULL,
    cleared TINYINT(1) NOT NULL DEFAULT 0,
    best_stars INT NOT NULL DEFAULT 0,
    clear_count BIGINT NOT NULL DEFAULT 0,
    best_time_ms BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, stage_id),
    CONSTRAINT fk_stage_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_quests (
    user_id BIGINT NOT NULL,
    quest_id VARCHAR(128) NOT NULL,
    progress INT NOT NULL DEFAULT 0,
    claimed TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, quest_id),
    CONSTRAINT fk_quests_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_hero_skills (
    user_id BIGINT NOT NULL,
    skill_id VARCHAR(128) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    unlocked TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, skill_id),
    CONSTRAINT fk_heaskills_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS friends (
    user_id BIGINT NOT NULL,
    friend_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, friend_id),
    UNIQUE KEY uk_friends_reverse(friend_id, user_id),
    CONSTRAINT fk_friends_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_friends_friend FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS friend_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sender_id BIGINT NOT NULL,
    receiver_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_friend_request(sender_id, receiver_id),
    CONSTRAINT fk_freq_sender FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_freq_receiver FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS guilds (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    notice TEXT NOT NULL,
    level INT NOT NULL DEFAULT 1,
    created_by BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_guild_creator FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS guild_members (
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, user_id),
    CONSTRAINT fk_gm_guild FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    CONSTRAINT fk_gm_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS guild_join_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_guild_join(guild_id, user_id),
    CONSTRAINT fk_gjr_guild FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    CONSTRAINT fk_gjr_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS guild_warehouse (
    guild_id BIGINT NOT NULL,
    item_id INT NOT NULL,
    count BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, item_id),
    CONSTRAINT fk_gw_guild FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS auction_listings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id BIGINT NOT NULL,
    item_id INT NOT NULL,
    count BIGINT NOT NULL DEFAULT 1,
    price BIGINT NOT NULL DEFAULT 1,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_auction_seller FOREIGN KEY(seller_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS battle_results (
    id VARCHAR(64) PRIMARY KEY,
    room_id BIGINT NULL,
    mode VARCHAR(32) NOT NULL,
    stage_id VARCHAR(128) NULL,
    winner_team VARCHAR(32) NULL,
    started_at DATETIME NULL,
    ended_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_battle_results (
    battle_id VARCHAR(64) NOT NULL,
    user_id BIGINT NOT NULL,
    team VARCHAR(32) NOT NULL,
    won TINYINT(1) NOT NULL,
    settled TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY(battle_id, user_id),
    CONSTRAINT fk_battleresults_battle FOREIGN KEY(battle_id) REFERENCES battle_results(id) ON DELETE CASCADE,
    CONSTRAINT fk_battleresults_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_rewards (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    battle_id VARCHAR(64) NOT NULL,
    user_id BIGINT NOT NULL,
    reward_type VARCHAR(32) NOT NULL,
    reward_id VARCHAR(128) NULL,
    amount BIGINT NOT NULL DEFAULT 1,
    UNIQUE KEY uk_rewards_battle_user(battle_id, user_id, reward_type, reward_id),
    CONSTRAINT fk_rewards_battle FOREIGN KEY(battle_id) REFERENCES battle_results(id) ON DELETE CASCADE,
    CONSTRAINT fk_rewards_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function initSqlite() {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  sqlite = new Database(config.databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.exec(SQLITE_SCHEMA);
  migrateSqlite();
}

function migrateSqlite() {
  const tableColumns = (table) => new Set(
    sqlite.prepare(`PRAGMA table_info("${table}")`).all().map((row) => String(row.name)),
  );

  // 旧 player_stage_progress 缺少 best_time_ms
  const stageCols = tableColumns('player_stage_progress');
  if (!stageCols.has('best_time_ms')) {
    sqlite.exec('ALTER TABLE player_stage_progress ADD COLUMN best_time_ms INTEGER NOT NULL DEFAULT 0');
  }

  // 旧 player_profiles 缺少 selected_deck_group（4 个组的选择）
  const profileCols = tableColumns('player_profiles');
  if (!profileCols.has('selected_deck_group')) {
    sqlite.exec("ALTER TABLE player_profiles ADD COLUMN selected_deck_group TEXT NOT NULL DEFAULT 'default'");
  }

  // 旧 player_decks 只允许 deck_no 1~3（默认组没地方放），重建为 0~3。
  // deck_cards 通过 deck_id 关联，主键值原样拷贝，所以外键依然有效。
  const deckTableSql = String(
    sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='player_decks'").get()?.sql ?? '',
  );
  if (deckTableSql.includes('BETWEEN 1 AND 3')) {
    // 注意：不能直接 RENAME 旧表——SQLite 会把 deck_cards 的外键一起改指向改名后的表，
    // 删掉旧表后外键就成了悬空引用。正确顺序：建新表 → 拷数据 → 删旧表 → 把新表改成正式名。
    sqlite.pragma('foreign_keys = OFF');
    sqlite.pragma('legacy_alter_table = ON');
    sqlite.exec(`
      BEGIN;
      CREATE TABLE player_decks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        deck_no INTEGER NOT NULL CHECK(deck_no BETWEEN 0 AND 3),
        name TEXT NOT NULL,
        UNIQUE(user_id, deck_no),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO player_decks_new(id,user_id,deck_no,name)
        SELECT id,user_id,deck_no,name FROM player_decks;
      DROP TABLE player_decks;
      ALTER TABLE player_decks_new RENAME TO player_decks;
      COMMIT;
    `);
    sqlite.pragma('legacy_alter_table = OFF');
    sqlite.pragma('foreign_keys = ON');
  }

  // 修复：如果 deck_cards 的外键还指向 player_decks_old（曾经用错顺序的迁移会留下
  // 这种悬空引用，之后任何写 deck_cards 都会报 no such table: main.player_decks_old），
  // 就按正确结构重建 deck_cards。这里只重建表结构，数据原样搬过去。
  const deckCardsSql = String(
    sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='deck_cards'").get()?.sql ?? '',
  );
  if (deckCardsSql.includes('player_decks_old')) {
    sqlite.pragma('foreign_keys = OFF');
    sqlite.pragma('legacy_alter_table = ON');
    sqlite.exec(`
      BEGIN;
      CREATE TABLE deck_cards_new (
        deck_id INTEGER NOT NULL,
        slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 9),
        card_id INTEGER NOT NULL,
        PRIMARY KEY(deck_id, slot_index),
        FOREIGN KEY(deck_id) REFERENCES player_decks(id) ON DELETE CASCADE
      );
      INSERT INTO deck_cards_new(deck_id,slot_index,card_id)
        SELECT deck_id,slot_index,card_id FROM deck_cards;
      DROP TABLE deck_cards;
      ALTER TABLE deck_cards_new RENAME TO deck_cards;
      COMMIT;
    `);
    sqlite.pragma('legacy_alter_table = OFF');
    sqlite.pragma('foreign_keys = ON');
  }

  // 给每个已有玩家补一个默认组（deck_no=0），内容先沿用战团1，避免"默认组空着被别的组顶替"
  sqlite.exec(`
    INSERT INTO player_decks(user_id, deck_no, name)
    SELECT u.id, 0, '默认' FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM player_decks d WHERE d.user_id=u.id AND d.deck_no=0);
  `);
  sqlite.exec(`
    INSERT INTO deck_cards(deck_id, slot_index, card_id)
    SELECT d0.id, dc.slot_index, dc.card_id
    FROM player_decks d0
    JOIN player_decks d1 ON d1.user_id=d0.user_id AND d1.deck_no=1
    JOIN deck_cards dc ON dc.deck_id=d1.id
    WHERE d0.deck_no=0 AND NOT EXISTS (SELECT 1 FROM deck_cards x WHERE x.deck_id=d0.id);
  `);

  // 旧 player_items 缺少 is_bound 或主键仍是 (user_id,item_id)，重建为新结构
  const itemCols = tableColumns('player_items');
  if (!itemCols.has('is_bound')) {
    sqlite.exec(`
      BEGIN;
      ALTER TABLE player_items RENAME TO player_items_old;
      CREATE TABLE player_items (
        user_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
        is_bound INTEGER NOT NULL DEFAULT 1 CHECK(is_bound IN (0,1)),
        PRIMARY KEY(user_id, item_id, is_bound),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO player_items(user_id,item_id,count,is_bound)
        SELECT user_id,item_id,count,1 FROM player_items_old;
      DROP TABLE player_items_old;
      COMMIT;
    `);
  }
}

/**
 * 给 mysql2 连接池挂 'error' 监听（2026-10-07 全站 502 的根因）。
 *
 * mysql2 的池子在**连接层**出错时（MySQL 重启、wait_timeout 掐断、PROTOCOL_CONNECTION_LOST、
 * 网络抖动…）会执行 pool.emit('error')。EventEmitter 的 'error' 事件**没有监听器就会直接抛**，
 * 变成未捕获异常 → 整个 Node 进程退出 → 反向代理对**所有**接口返回 502。
 * 现场表现就是：先是某个接口报错，紧接着 /api/player/snapshot 和 socket.io 全部 502。
 *
 * 这里只记日志、不让进程死：单条连接坏了由池子自己重连，不该拖垮整个服务。
 */
export function guardPool(target, label = 'mysql-pool') {
  if (!target || typeof target.on !== 'function') return target;
  target.on('error', (error) => {
    console.error(`[clbwzdb] ${label} 连接出错（已忽略，服务继续运行）:`, error?.code || error?.message || error);
  });
  return target;
}

async function initMysql() {
  const safeDbName = String(config.db.database).replace(/`/g, '');
  const bootstrap = guardPool(mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    connectionLimit: 1,
    connectTimeout: config.db.connectTimeout,
    waitForConnections: true,
    charset: 'utf8mb4',
  }), 'mysql-bootstrap');
  try {
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${safeDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (error) {
    console.warn(`[clbwzzz] 自动创建数据库失败(${error.code || error.message})，请确认数据库 ${safeDbName} 已存在且有建表权限`);
  } finally {
    await bootstrap.end();
  }

  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    connectionLimit: config.db.poolSize,
    connectTimeout: config.db.connectTimeout,
    waitForConnections: true,
    charset: 'utf8mb4',
  });
  guardPool(pool, 'mysql-pool');
  for (const sql of MYSQL_TABLES) {
    await pool.query(sql);
  }
  await migrateMysql();
}

async function migrateMysql() {
  const hasColumn = async (table, column) => {
    const [rows] = await pool.query(`
      SELECT 1 AS x
      FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name=? AND column_name=?
      LIMIT 1
    `, [table, column]);
    return Boolean(rows[0]);
  };

  if (!(await hasColumn('player_stage_progress', 'best_time_ms'))) {
    await pool.query('ALTER TABLE player_stage_progress ADD COLUMN best_time_ms BIGINT NOT NULL DEFAULT 0');
  }

  if (!(await hasColumn('player_profiles', 'selected_deck_group'))) {
    await pool.query("ALTER TABLE player_profiles ADD COLUMN selected_deck_group VARCHAR(16) NOT NULL DEFAULT 'default'");
  }
  await pool.query(`
    INSERT INTO player_decks(user_id, deck_no, name)
    SELECT u.id, 0, '默认' FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM player_decks d WHERE d.user_id=u.id AND d.deck_no=0)
  `);
  await pool.query(`
    INSERT INTO deck_cards(deck_id, slot_index, card_id)
    SELECT d0.id, dc.slot_index, dc.card_id
    FROM player_decks d0
    JOIN player_decks d1 ON d1.user_id=d0.user_id AND d1.deck_no=1
    JOIN deck_cards dc ON dc.deck_id=d1.id
    WHERE d0.deck_no=0 AND NOT EXISTS (SELECT 1 FROM deck_cards x WHERE x.deck_id=d0.id)
  `);

  if (!(await hasColumn('player_items', 'is_bound'))) {
    await pool.query('ALTER TABLE player_items ADD COLUMN is_bound TINYINT(1) NOT NULL DEFAULT 1');
    // 旧表主键 (user_id,item_id) 升为新主键 (user_id,item_id,is_bound)
    await pool.query('ALTER TABLE player_items DROP PRIMARY KEY');
    await pool.query('ALTER TABLE player_items ADD PRIMARY KEY (user_id,item_id,is_bound)');
  }
}

// 启动时初始化数据库：失败**只记日志、不终止进程**。
// 以前这里是裸的顶层 await，初始化一抛错整个模块就加载失败、进程直接退出，
// 反向代理就会对所有接口回 502（外面只看得到"全站挂了"，看不到真正原因）。
try {
  await ensureDatabaseReady();
  console.log(`[clbwzdb] 数据库就绪（${isMysql ? 'mysql' : 'sqlite'}）`);
} catch (error) {
  dbInitError = error;
  dbInitFailedAt = Date.now();
  console.error(`[clbwzdb] 数据库初始化失败（${isMysql ? 'mysql' : 'sqlite'}）：`, error?.code || error?.message || error);
  console.error('[clbwzdb] 服务仍会启动：数据接口会返回错误信息（不再是 502），数据库恢复后会自动重试初始化');
}

/**
 * 2026-10-10（用户要求）：新号试玩只给「花生射手 + 核桃卫兵」两张卡，道具一件不给。
 * 原来是 10 张 + 20 张 = 30 张，而且客户端空背包时还会再发全卡
 * （见 App 构造里的 grantAllCollectibleCards），那处也一起收掉了。
 * 1 = 花生射手，2 = 核桃卫兵 —— 正好是新手教程要用的那两张。
 */
const STARTER_DECK = [1, 2];
const STARTER_EXTRA = [];

export async function createPlayerData(userId, nickname) {
  await withTransaction(async (conn) => {
    await conn.run('INSERT INTO player_profiles(user_id,nickname) VALUES(?,?)', [userId, nickname]);
    await conn.run('INSERT INTO player_settings(user_id) VALUES(?)', [userId]);
    await conn.run('INSERT INTO player_card_bags(user_id) VALUES(?)', [userId]);

    const insertDeck = (deckNo, name) => conn.run(
      'INSERT INTO player_decks(user_id,deck_no,name) VALUES(?,?,?)',
      [userId, deckNo, name],
    );
    const insertDeckCard = (deckId, slotIndex, cardId) => conn.run(
      'INSERT INTO deck_cards(deck_id,slot_index,card_id) VALUES(?,?,?)',
      [deckId, slotIndex, cardId],
    );
    // 2026-09-11：4 个组都入库（0=默认，1~3=战团1~3）。
    const DECK_NAMES = { 0: '默认', 1: '战团1', 2: '战团2', 3: '战团3' };
    for (let deckNo = 0; deckNo <= 3; deckNo += 1) {
      const result = await insertDeck(deckNo, DECK_NAMES[deckNo]);
      if (deckNo === 0 || deckNo === 1) {
        for (let index = 0; index < STARTER_DECK.length; index += 1) {
          await insertDeckCard(result.lastInsertRowid, index, STARTER_DECK[index]);
        }
      }
    }

    const allCards = [...new Set([...STARTER_DECK, ...STARTER_EXTRA])];
    const insertCard = (slotIndex, cardId) => conn.run(
      'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
      [userId, slotIndex, cardId, 0, 1],
    );
    for (let index = 0; index < allCards.length; index += 1) {
      await insertCard(index, allCards[index]);
    }
  });
}

export async function getPlayerSnapshot(userId) {
  const profile = await get(`
    SELECT user_id AS userId, nickname, level, exp, hp, gold,
           diamond, honor, arena, selected_deck_no AS selectedDeckNo,
           selected_deck_group AS selectedDeckGroup
    FROM player_profiles WHERE user_id=?
  `, [userId]);
  if (!profile) return null;

  const settingsRow = await get(`
    SELECT music_volume AS musicVolume, effect_volume AS effectVolume,
           show_card_name AS showCardName
    FROM player_settings WHERE user_id=?
  `, [userId]);
  const settings = {
    ...settingsRow,
    showCardName: Boolean(settingsRow?.showCardName),
  };

  const bag = await get(
    'SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?',
    [userId],
  );
  const cards = await all(`
    SELECT slot_index AS slotIndex, card_id AS cardId, star,
           craft_quality AS craftQuality
    FROM player_cards WHERE user_id=? ORDER BY slot_index
  `, [userId]);
  const items = await all(`
    SELECT item_id AS itemId, SUM(count) AS count
    FROM player_items
    WHERE user_id=? AND count>0
    GROUP BY item_id
    ORDER BY item_id
  `, [userId]);
  const stages = (await all(`
    SELECT stage_id AS stageId, cleared, best_stars AS bestStars,
           clear_count AS clearCount, best_time_ms AS bestTimeMs
    FROM player_stage_progress WHERE user_id=? ORDER BY stage_id
  `, [userId])).map((row) => ({ ...row, cleared: Boolean(row.cleared) }));
  const quests = (await all(`
    SELECT quest_id AS questId, progress, claimed
    FROM player_quests WHERE user_id=? ORDER BY quest_id
  `, [userId])).map((row) => ({ ...row, claimed: Boolean(row.claimed) }));
  const heroSkills = (await all(`
    SELECT skill_id AS skillId, level, unlocked
    FROM player_hero_skills WHERE user_id=? ORDER BY skill_id
  `, [userId])).map((row) => ({ ...row, unlocked: Boolean(row.unlocked) }));

  const decks = await all(`
    SELECT id, deck_no AS deckNo, name FROM player_decks
    WHERE user_id=? ORDER BY deck_no
  `, [userId]);
  for (const deck of decks) {
    deck.cards = await all(`
      SELECT slot_index AS slotIndex, card_id AS cardId
      FROM deck_cards WHERE deck_id=? ORDER BY slot_index
    `, [deck.id]);
  }

  return {
    profile,
    settings,
    cardInventory: { slotCount: bag?.slotCount ?? 200, cards },
    decks,
    items,
    stages,
    quests,
    heroSkills,
  };
}

export async function getSocketUser(userId) {
  return get(`
    SELECT u.id, u.username, p.nickname, p.level,
           p.selected_deck_no AS selectedDeckNo,
           p.selected_deck_group AS selectedDeckGroup
    FROM users u JOIN player_profiles p ON p.user_id=u.id
    WHERE u.id=?
  `, [userId]);
}

export const db = Object.freeze({
  run,
  get,
  all,
});
