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

// POST /api/admin/adjust
// 固定模式：{playerId, amount, remark}            amount 正数=增加，负数=减少
// 百分比模式：{playerId, base, percent, remark}   按 base 的 |percent|% 计算增减数量（percent 正数=增加，负数=扣减），remark 为空时自动生成
router.post('/adjust', (req, res) => {
  const { playerId, amount, base, percent, remark } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid) {
    return res.status(400).json({ code: 400, message: '参数错误：需要玩家ID' });
  }

  // ===== 计算变动数量：固定模式 或 百分比模式 =====
  let amt;           // 最终变动数量（±整数）
  let modeText = ''; // 百分比模式的计算说明（用于默认备注）
  const hasAmount = amount !== undefined && amount !== null && amount !== '';
  const hasPercent = base !== undefined && base !== null && base !== ''
    && percent !== undefined && percent !== null && percent !== '';

  if (hasAmount && !hasPercent) {
    amt = parseInt(amount, 10);
    if (isNaN(amt) || amt === 0) {
      return res.status(400).json({ code: 400, message: '参数错误：金额必须是非零整数' });
    }
  } else if (hasPercent && !hasAmount) {
    const b = parseInt(base, 10);
    const p = parseFloat(percent);
    if (!b || b <= 0 || isNaN(b)) {
      return res.status(400).json({ code: 400, message: '基数必须为正整数' });
    }
    if (!p || isNaN(p)) {
      return res.status(400).json({ code: 400, message: '百分比不能为 0' });
    }
    if (Math.abs(p) > 1000) {
      return res.status(400).json({ code: 400, message: '百分比绝对值不能超过 1000' });
    }
    modeText = `按${b}的${p}%`;
    amt = Math.round(b * Math.abs(p) / 100) * (p > 0 ? 1 : -1);
    if (amt === 0) {
      return res.status(400).json({ code: 400, message: '计算结果为 0，请调整基数或百分比' });
    }
  } else {
    return res.status(400).json({ code: 400, message: '参数错误：需要 amount 或 base+percent' });
  }

  const player = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'player'").get(pid);
  if (!player) {
    return res.status(404).json({ code: 404, message: '玩家不存在' });
  }
  // 百分比模式：基数不能超过当前余额（"部分金币"语义）
  if (hasPercent) {
    const b = parseInt(base, 10);
    if (b > player.balance) {
      return res.status(400).json({ code: 400, message: '基数不能超过当前余额', data: { balance: player.balance } });
    }
  }
  const newBalance = player.balance + amt;
  if (newBalance < 0) {
    return res.status(400).json({ code: 400, message: '余额不足，无法扣减', data: { balance: player.balance } });
  }

  // 默认备注：百分比模式自动生成（如 "按2000的5%增加"）
  const finalRemark = String(remark || '').trim() || (modeText ? `${modeText}${amt > 0 ? '增加' : '扣减'}` : '');

  // 余额更新与流水写入在同一事务内，保证原子性
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, pid);
    db.prepare(
      'INSERT INTO transactions (user_id, amount, balance_after, operator_id, remark) VALUES (?, ?, ?, ?, ?)'
    ).run(pid, amt, newBalance, req.user.id, finalRemark);
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
      balance: newBalance,
      mode: hasPercent ? 'percent' : 'fixed',
      ...(hasPercent ? { base: parseInt(base, 10), percent: parseFloat(percent) } : {})
    }
  });
});

module.exports = router;
