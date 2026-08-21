// 余额与变动历史接口（登录即可访问）
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/balance —— 当前登录用户总余额
router.get('/balance', requireAuth, (req, res) => {
  res.json({ code: 0, data: { balance: req.user.balance } });
});

// GET /api/groups —— 当前登录用户的分组列表（含各分组实时余额）
router.get('/groups', requireAuth, (req, res) => {
  const list = db.prepare('SELECT id, name, created_at FROM groups WHERE user_id = ? ORDER BY id ASC').all(req.user.id)
    .map(g => ({
      id: g.id,
      name: g.name,
      created_at: g.created_at,
      balance: db.prepare('SELECT COALESCE(SUM(amount), 0) AS b FROM transactions WHERE group_id = ?').get(g.id).b
    }));
  res.json({ code: 0, data: list });
});

// GET /api/transactions?playerId=&groupId=&offset=&limit=&order=
// 玩家只能查自己的历史；管理员可带 playerId 查任意玩家的历史
// groupId 可传单个或多个（逗号分隔，如 groupId=1,2）按分组筛选
// order: desc（默认，最新在前）| asc（最早在前，用于画折线图）
router.get('/transactions', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const playerId = req.query.playerId ? parseInt(req.query.playerId, 10) : null;
  const targetId = playerId || req.user.id;
  if (targetId !== req.user.id && !isAdmin) {
    return res.status(403).json({ code: 403, message: '无权查看其他玩家的记录' });
  }

  // 解析分组筛选（支持逗号分隔多分组）
  let groupClause = '';
  let groupParams = [];
  if (req.query.groupId) {
    const gids = String(req.query.groupId).split(',').map(s => parseInt(s, 10)).filter(n => n);
    if (gids.length) {
      // 校验分组归属：玩家只能筛自己的分组
      const owned = db.prepare(
        `SELECT id FROM groups WHERE user_id = ? AND id IN (${gids.map(() => '?').join(',')})`
      ).all(targetId, ...gids).map(g => g.id);
      if (owned.length !== gids.length) {
        return res.status(403).json({ code: 403, message: '包含无权访问的分组' });
      }
      groupClause = ` AND t.group_id IN (${gids.map(() => '?').join(',')})`;
      groupParams = gids;
    }
  }

  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const list = db.prepare(`
    SELECT t.id, t.amount, t.balance_after, t.remark, t.created_at,
           t.group_id,
           g.name AS group_name,
           u.nickname  AS player_nickname,
           u.username  AS player_username,
           o.nickname  AS operator_nickname,
           o.username  AS operator_username
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN groups g ON g.id = t.group_id
    LEFT JOIN users o ON o.id = t.operator_id
    WHERE t.user_id = ?${groupClause}
    ORDER BY t.id ${order}
    LIMIT ? OFFSET ?
  `).all(targetId, ...groupParams, limit, offset);

  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM transactions t WHERE t.user_id = ?${groupClause}`
  ).get(targetId, ...groupParams).c;

  res.json({ code: 0, data: { list, total, offset, limit } });
});

module.exports = router;
