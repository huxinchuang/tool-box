// 初始化默认管理员账号（幂等，可重复执行）
// 用法：npm run seed
// 可通过环境变量覆盖默认账号密码：ADMIN_USERNAME / ADMIN_PASSWORD
const db = require('./db');
const { hashPassword } = require('./auth');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin888';

const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
if (exists) {
  console.log(`管理员账号 "${ADMIN_USERNAME}" 已存在，跳过创建`);
} else {
  db.prepare(
    "INSERT INTO users (username, password_hash, role, nickname) VALUES (?, ?, 'admin', ?)"
  ).run(ADMIN_USERNAME, hashPassword(ADMIN_PASSWORD), '管理员');
  console.log(`已创建管理员账号: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  console.log('提示：默认密码仅用于本地开发，请尽快修改（修改方式见 README）');
}
