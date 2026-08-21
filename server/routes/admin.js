// 管理员接口：创建玩家账号、玩家列表、加/减游戏币
const express = require('express');
const db = require('../db');
const { hashPassword, publicUser, requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

// 以下接口全部需要管理员身份
router.use(requireAuth, requireAdmin);

// 编码防护：拒绝包含 U+FFFD（替换字符）的文本，防止乱码数据入库
function assertCleanText(value, fieldName) {
  if (typeof value === 'string' && value.includes('\uFFFD')) {
    const err = new Error(`${fieldName} 包含无法识别的乱码字符，请使用 UTF-8 编码`);
    err.status = 400;
    throw err;
  }
}

// ========== 分组辅助函数 ==========
// 分组实时余额 = 该分组所有流水 amount 之和
function groupBalance(gid) {
  return db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS b FROM transactions WHERE group_id = ?'
  ).get(gid).b;
}

function getGroup(gid) {
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(gid);
}

// ========== 分组管理接口 ==========

// GET /api/admin/groups?playerId= —— 玩家的分组列表（含实时余额）
router.get('/groups', (req, res) => {
  const pid = parseInt(req.query.playerId, 10);
  const player = pid ? db.prepare("SELECT * FROM users WHERE id = ? AND role = 'player'").get(pid) : null;
  if (!player) {
    return res.status(404).json({ code: 404, message: '玩家不存在' });
  }
  const list = db.prepare('SELECT id, name, created_at FROM groups WHERE user_id = ? ORDER BY id ASC').all(pid)
    .map(g => ({ ...g, balance: groupBalance(g.id) }));
  res.json({ code: 0, data: list });
});

// POST /api/admin/groups  {playerId, name} —— 创建分组
router.post('/groups', (req, res) => {
  const { playerId, name } = req.body || {};
  const pid = parseInt(playerId, 10);
  const gname = String(name || '').trim();
  assertCleanText(gname, '分组名');
  if (!pid || !gname) {
    return res.status(400).json({ code: 400, message: '玩家ID和分组名不能为空' });
  }
  if (gname.length > 20) {
    return res.status(400).json({ code: 400, message: '分组名最多20个字符' });
  }
  const player = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'player'").get(pid);
  if (!player) {
    return res.status(404).json({ code: 404, message: '玩家不存在' });
  }
  const info = db.prepare('INSERT INTO groups (user_id, name) VALUES (?, ?)').run(pid, gname);
  res.json({ code: 0, data: { id: info.lastInsertRowid, user_id: pid, name: gname, balance: 0 } });
});

// PUT /api/admin/groups/:id  {name} —— 重命名分组
router.put('/groups/:id', (req, res) => {
  const gid = parseInt(req.params.id, 10);
  const gname = String((req.body || {}).name || '').trim();
  assertCleanText(gname, '分组名');
  if (!gid || !gname) {
    return res.status(400).json({ code: 400, message: '分组ID和分组名不能为空' });
  }
  if (gname.length > 20) {
    return res.status(400).json({ code: 400, message: '分组名最多20个字符' });
  }
  const group = getGroup(gid);
  if (!group) {
    return res.status(404).json({ code: 404, message: '分组不存在' });
  }
  db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(gname, gid);
  res.json({ code: 0, data: { id: gid, name: gname, balance: groupBalance(gid) } });
});

// DELETE /api/admin/groups/:id —— 删除分组（有余额时拒绝）
router.delete('/groups/:id', (req, res) => {
  const gid = parseInt(req.params.id, 10);
  if (!gid) {
    return res.status(400).json({ code: 400, message: '分组ID不能为空' });
  }
  const group = getGroup(gid);
  if (!group) {
    return res.status(404).json({ code: 404, message: '分组不存在' });
  }
  const balance = groupBalance(gid);
  if (balance !== 0) {
    return res.status(400).json({ code: 400, message: '分组有余额，不能删除', data: { balance } });
  }
  // 余额为 0：流水保留但解除分组归属（历史可查），删除分组本身
  db.prepare('UPDATE transactions SET group_id = NULL WHERE group_id = ?').run(gid);
  db.prepare('DELETE FROM groups WHERE id = ?').run(gid);
  res.json({ code: 0, message: '分组已删除' });
});

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
  const unick = String(nickname || '').trim();
  assertCleanText(uname, '账号');
  assertCleanText(unick, '昵称');
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
  ).run(uname, hashPassword(String(password)), 'player', unick);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ code: 0, data: publicUser(user) });
});

// POST /api/admin/adjust
// 固定模式：{playerId, amount, remark}            amount 正数=增加，负数=减少
// 百分比模式：{playerId, base, percent, remark}   按 base 的 |percent|% 计算增减数量（percent 正数=增加，负数=扣减），remark 为空时自动生成
// groupId 可选：指定操作作用于哪个分组；缺省取玩家第一个分组，玩家无分组时返回 400
router.post('/adjust', (req, res) => {
  const { playerId, groupId, amount, base, percent, remark } = req.body || {};
  const pid = parseInt(playerId, 10);
  assertCleanText(remark, '备注');
  if (!pid) {
    return res.status(400).json({ code: 400, message: '参数错误：需要玩家ID' });
  }

  const player = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'player'").get(pid);
  if (!player) {
    return res.status(404).json({ code: 404, message: '玩家不存在' });
  }

  // ===== 解析目标分组 =====
  let gid = groupId ? parseInt(groupId, 10) : null;
  let group = null;
  if (gid) {
    group = db.prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?').get(gid, pid);
    if (!group) {
      return res.status(400).json({ code: 400, message: '分组不存在或不属于该玩家' });
    }
  } else {
    const first = db.prepare('SELECT * FROM groups WHERE user_id = ? ORDER BY id ASC').get(pid);
    if (!first) {
      return res.status(400).json({ code: 400, message: '该玩家还没有分组，请先创建分组' });
    }
    gid = first.id;
    group = first;
  }
  const gBalance = groupBalance(gid);

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
    // 百分比模式的基数以"该分组余额"为上限
    if (b > gBalance) {
      return res.status(400).json({ code: 400, message: '基数不能超过该分组余额', data: { balance: gBalance } });
    }
    modeText = `按${b}的${p}%`;
    amt = Math.round(b * Math.abs(p) / 100) * (p > 0 ? 1 : -1);
    if (amt === 0) {
      return res.status(400).json({ code: 400, message: '计算结果为 0，请调整基数或百分比' });
    }
  } else {
    return res.status(400).json({ code: 400, message: '参数错误：需要 amount 或 base+percent' });
  }

  const newGroupBalance = gBalance + amt;
  if (newGroupBalance < 0) {
    return res.status(400).json({ code: 400, message: '余额不足，无法扣减', data: { balance: gBalance } });
  }
  const newUserBalance = player.balance + amt;

  // 默认备注：百分比模式自动生成（如 "按2000的5%增加"）
  const finalRemark = String(remark || '').trim() || (modeText ? `${modeText}${amt > 0 ? '增加' : '扣减'}` : '');

  // 分组余额更新（流水）与玩家总余额更新在同一事务内，保证原子性
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newUserBalance, pid);
    db.prepare(
      'INSERT INTO transactions (user_id, group_id, amount, balance_after, operator_id, remark) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(pid, gid, amt, newGroupBalance, req.user.id, finalRemark);
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
      groupId: gid,
      groupName: group.name,
      amount: amt,
      groupBalance: newGroupBalance,
      balance: newUserBalance,
      mode: hasPercent ? 'percent' : 'fixed',
      ...(hasPercent ? { base: parseInt(base, 10), percent: parseFloat(percent) } : {})
    }
  });
});

module.exports = router;
