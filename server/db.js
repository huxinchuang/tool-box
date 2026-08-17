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

module.exports = db;
