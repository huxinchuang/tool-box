// 认证相关接口：登录 / 登出 / 当前用户
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, createToken, publicUser, requireAuth } = require('../auth');

const router = express.Router();

// POST /api/auth/login  {username, password}
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '账号和密码不能为空' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    return res.status(401).json({ code: 401, message: '账号或密码错误' });
  }
  const token = createToken(user.id);
  res.json({ code: 0, data: { token, user: publicUser(user) } });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ code: 0, message: '已退出登录' });
});

// GET /api/auth/me —— 当前登录用户信息（含最新余额）
// 管理员：余额显示为全部业务玩家的汇总（排除 test* 测试玩家）
router.get('/me', requireAuth, (req, res) => {
  const user = publicUser(req.user);
  if (user.role === 'admin') {
    const { s } = db.prepare(
      `SELECT COALESCE(SUM(balance), 0) AS s FROM users
       WHERE role = 'player'
         AND username NOT LIKE 'test%'
         AND nickname NOT LIKE 'test%'`
    ).get();
    user.balance = s;
  }
  res.json({ code: 0, data: user });
});

module.exports = router;
