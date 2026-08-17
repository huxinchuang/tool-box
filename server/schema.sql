-- ============================================================
-- 游戏币管理数据库结构（SQLite 方言）
-- 迁移到 MySQL 时的差异已在每处标注（主要差异：自增列与时间默认值）
-- 数据库文件：server/data/game.db（首次启动自动创建）
-- ============================================================

-- 用户表（管理员 + 玩家）
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,          -- MySQL: INT AUTO_INCREMENT PRIMARY KEY
  username      TEXT    NOT NULL UNIQUE,                    -- MySQL: VARCHAR(64) NOT NULL UNIQUE
  password_hash TEXT    NOT NULL,                           -- MySQL: VARCHAR(128)（scrypt 盐+哈希）
  role          TEXT    NOT NULL DEFAULT 'player'
                CHECK (role IN ('admin','player')),         -- MySQL: ENUM('admin','player') 或 VARCHAR(16)
  nickname      TEXT    NOT NULL DEFAULT '',                -- MySQL: VARCHAR(64)
  balance       INTEGER NOT NULL DEFAULT 0,                 -- 游戏币余额（整数，单位为“个”）
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))  -- MySQL: DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 游戏币变动流水（每次加/减币一条记录，不可修改，只追加）
CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  amount        INTEGER NOT NULL,                           -- 变动数量：正数=增加，负数=减少
  balance_after INTEGER NOT NULL,                           -- 变动后的余额快照
  operator_id   INTEGER REFERENCES users(id),               -- 操作人（管理员）；管理员自身的操作记录可为空
  remark        TEXT    NOT NULL DEFAULT '',                -- 备注（如“充值”“消费扣减”）
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tx_user     ON transactions(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_tx_operator ON transactions(operator_id);

-- 登录会话（token 有效期内有效）
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,                           -- MySQL: CHAR(64)
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at TEXT    NOT NULL                               -- ISO 时间字符串，按字典序比较
);
