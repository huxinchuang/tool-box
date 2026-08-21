// 数据库初始化：Node 24 内置 node:sqlite，零安装
// 迁移 MySQL 时只需重写本文件（其余代码均为参数化 SQL，方言差异很小）
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(path.join(DATA_DIR, 'game.db'));

// 初始化表结构（幂等）
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ========== 数据迁移（幂等，每次启动自动执行） ==========
// 迁移 1：transactions 增加 group_id 列（老库没有）
const txCols = db.prepare('PRAGMA table_info(transactions)').all();
if (!txCols.some(c => c.name === 'group_id')) {
  db.exec('ALTER TABLE transactions ADD COLUMN group_id INTEGER REFERENCES groups(id)');
  console.log('[migrate] transactions 增加 group_id 列');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_tx_group ON transactions(group_id, id DESC)');

// 迁移 2：为有流水但完全没有分组的玩家创建"默认"分组并回填
// （注意：删除分组会把流水 group_id 置 NULL，但该玩家已有其他分组，不能被误判）
const needGroup = db.prepare(`
  SELECT DISTINCT t.user_id FROM transactions t
  WHERE t.user_id NOT IN (SELECT user_id FROM groups)
`).all();
for (const { user_id } of needGroup) {
  const info = db.prepare('INSERT INTO groups (user_id, name) VALUES (?, ?)').run(user_id, '默认');
  db.prepare('UPDATE transactions SET group_id = ? WHERE user_id = ? AND group_id IS NULL')
    .run(info.lastInsertRowid, user_id);
  console.log(`[migrate] 玩家 #${user_id} 创建默认分组并回填流水`);
}

// 迁移 3：按分组重算 balance_after（分组内累计余额）
const gids = db.prepare('SELECT id FROM groups').all();
for (const { id: gid } of gids) {
  const txs = db.prepare('SELECT id, amount FROM transactions WHERE group_id = ? ORDER BY id ASC').all(gid);
  let acc = 0;
  for (const t of txs) {
    acc += t.amount;
    db.prepare('UPDATE transactions SET balance_after = ? WHERE id = ?').run(acc, t.id);
  }
}

// 迁移 4：users.balance 重算为所有分组余额之和（保持与流水一致）
const players = db.prepare('SELECT id FROM users WHERE role = ?').all('player');
for (const { id: uid } of players) {
  const { total } = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ?'
  ).get(uid);
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(total, uid);
}

module.exports = db;
