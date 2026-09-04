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

export async function run(sql, params = []) {
  mustInit();
  if (isMysql) {
    const [result] = await pool.query(sql, params);
    return mysqlResult(result);
  }
  return sqliteRun(sql, params);
}

export async function get(sql, params = []) {
  mustInit();
  if (isMysql) {
    const [rows] = await pool.query(sql, params);
    return rows[0];
  }
  return sqliteGet(sql, params);
}

export async function all(sql, params = []) {
  mustInit();
  if (isMysql) {
    const [rows] = await pool.query(sql, params);
    return rows;
  }
  return sqliteAll(sql, params);
}

export async function withTransaction(fn) {
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
  deck_no INTEGER NOT NULL CHECK(deck_no BETWEEN 1 AND 3),
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
  PRIMARY KEY(user_id, item_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_stage_progress (
  user_id INTEGER NOT NULL,
  stage_id TEXT NOT NULL,
  cleared INTEGER NOT NULL DEFAULT 0 CHECK(cleared IN (0,1)),
  best_stars INTEGER NOT NULL DEFAULT 0 CHECK(best_stars >= 0),
  clear_count INTEGER NOT NULL DEFAULT 0 CHECK(clear_count >= 0),
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
    PRIMARY KEY(user_id, item_id),
    CONSTRAINT fk_items_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS player_stage_progress (
    user_id BIGINT NOT NULL,
    stage_id VARCHAR(128) NOT NULL,
    cleared TINYINT(1) NOT NULL DEFAULT 0,
    best_stars INT NOT NULL DEFAULT 0,
    clear_count BIGINT NOT NULL DEFAULT 0,
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
}

async function initMysql() {
  const safeDbName = String(config.db.database).replace(/`/g, '');
  const bootstrap = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    connectionLimit: 1,
    connectTimeout: config.db.connectTimeout,
    waitForConnections: true,
    charset: 'utf8mb4',
  });
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
  for (const sql of MYSQL_TABLES) {
    await pool.query(sql);
  }
}

if (isMysql) {
  await initMysql();
} else {
  await initSqlite();
}

const STARTER_DECK = [1, 2, 4, 15, 19, 25, 22, 17, 11, 3];
const STARTER_EXTRA = [5, 6, 8, 12, 13, 20, 21, 23, 24, 26, 27, 28, 30, 31, 32, 33, 35, 36, 37, 38];

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
    for (let deckNo = 1; deckNo <= 3; deckNo += 1) {
      const result = await insertDeck(deckNo, `战团${deckNo}`);
      if (deckNo === 1) {
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
           diamond, honor, arena, selected_deck_no AS selectedDeckNo
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
    SELECT item_id AS itemId, count FROM player_items
    WHERE user_id=? AND count>0 ORDER BY item_id
  `, [userId]);
  const stages = (await all(`
    SELECT stage_id AS stageId, cleared, best_stars AS bestStars,
           clear_count AS clearCount
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
           p.selected_deck_no AS selectedDeckNo
    FROM users u JOIN player_profiles p ON p.user_id=u.id
    WHERE u.id=?
  `, [userId]);
}

export const db = Object.freeze({
  run,
  get,
  all,
});
