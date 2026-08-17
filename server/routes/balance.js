// 余额与变动历史接口（登录即可访问）
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/balance —— 当前登录用户余额
router.get('/balance', requireAuth, (req, res) => {
  res.json({ code: 0, data: { balance: req.user.balance } });
});

// GET /api/transactions?playerId=&offset=&limit=&order=
// 玩家只能查自己的历史；管理员可带 playerId 查任意玩家的历史
// order: desc（默认，最新在前）| asc（最早在前，用于画折线图）
router.get('/transactions', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const playerId = req.query.playerId ? parseInt(req.query.playerId, 10) : null;
  const targetId = playerId || req.user.id;
  if (targetId !== req.user.id && !isAdmin) {
    return res.status(403).json({ code: 403, message: '无权查看其他玩家的记录' });
  }

  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const list = db.prepare(`
    SELECT t.id, t.amount, t.balance_after, t.remark, t.created_at,
           u.nickname  AS player_nickname,
           u.username  AS player_username,
           o.nickname  AS operator_nickname,
           o.username  AS operator_username
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN users o ON o.id = t.operator_id
    WHERE t.user_id = ?
    ORDER BY t.id ${order}
    LIMIT ? OFFSET ?
  `).all(targetId, limit, offset);

  const total = db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE user_id = ?').get(targetId).c;

  res.json({ code: 0, data: { list, total, offset, limit } });
});

module.exports = router;
