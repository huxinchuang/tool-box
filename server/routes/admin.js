// 管理员接口：创建玩家账号、玩家列表、加/减游戏币
const express = require('express');
const db = require('../db');
const { hashPassword, publicUser, requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

// 以下接口全部需要管理员身份
router.use(requireAuth, requireAdmin);

// GET /api/admin/players —— 玩家列表（含余额）
router.get('/players', (req, res) => {
  const list = db.prepare(
    `SELECT id, username, nickname, role, balance, created_at
     FROM users WHERE role = 'player' ORDER BY id DESC`
  ).all();
  res.json({ code: 0, data: list });
});

// POST /api/admin/players  {username, password, nickname}
router.post('/players', (req, res) => {
  const { username, password, nickname } = req.body || {};
  const uname = String(username || '').trim();
  if (!uname || !password) {
    return res.status(400).json({ code: 400, message: '账号和密码不能为空' });
  }
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(uname)) {
    return res.status(400).json({ code: 400, message: '账号只能包含字母、数字、下划线，长度2-32位' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ code: 400, message: '密码至少4位' });
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(uname)) {
    return res.status(400).json({ code: 400, message: '账号已存在' });
  }
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)'
  ).run(uname, hashPassword(String(password)), 'player', String(nickname || '').trim());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ code: 0, data: publicUser(user) });
});

// POST /api/admin/adjust  {playerId, amount, remark}
// amount 为正数=增加游戏币，负数=减少游戏币
router.post('/adjust', (req, res) => {
  const { playerId, amount, remark } = req.body || {};
  const pid = parseInt(playerId, 10);
  const amt = parseInt(amount, 10);
  if (!pid || isNaN(amt) || amt === 0) {
    return res.status(400).json({ code: 400, message: '参数错误：需要玩家ID和非零整数金额' });
  }
  const player = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'player'").get(pid);
  if (!player) {
    return res.status(404).json({ code: 404, message: '玩家不存在' });
  }
  const newBalance = player.balance + amt;
  if (newBalance < 0) {
    return res.status(400).json({ code: 400, message: '余额不足，无法扣减', data: { balance: player.balance } });
  }

  // 余额更新与流水写入在同一事务内，保证原子性
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, pid);
    db.prepare(
      'INSERT INTO transactions (user_id, amount, balance_after, operator_id, remark) VALUES (?, ?, ?, ?, ?)'
    ).run(pid, amt, newBalance, req.user.id, String(remark || '').trim());
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.json({
    code: 0,
    data: {
      playerId: pid,
      username: player.username,
      nickname: player.nickname,
      amount: amt,
      balance: newBalance
    }
  });
});

module.exports = router;
