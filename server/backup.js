// 每周数据库自动备份脚本
// - 使用 VACUUM INTO 做在线安全备份（原子操作，运行中执行不会损坏）
// - 自动保留最近 4 份备份，删除更旧的
// - 恢复：把 data/backups/game.db.<日期>.bak 复制回 data/game.db 即可
// 定时：crontab 每周执行（见部署说明）
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = 4; // 保留份数

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // 20260827
const target = path.join(BACKUP_DIR, `game.db.${stamp}.bak`);

// 在线安全备份（原子）；同一天重复执行时覆盖当天的备份
if (fs.existsSync(target)) fs.unlinkSync(target);
const db = new DatabaseSync(path.join(DATA_DIR, 'game.db'));
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

// 保留最近 KEEP 份
const files = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith('game.db.') && f.endsWith('.bak'))
  .sort()
  .reverse();
for (const f of files.slice(KEEP)) {
  fs.unlinkSync(path.join(BACKUP_DIR, f));
}

const sizeKB = (fs.statSync(target).size / 1024).toFixed(1);
console.log(`[backup] 已备份 ${path.basename(target)} (${sizeKB} KB)，当前保留 ${Math.min(files.length, KEEP)} 份`);
