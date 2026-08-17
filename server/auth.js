// 认证与安全工具：scrypt 密码哈希、token 会话、鉴权中间件
const crypto = require('crypto');
const db = require('./db');

const TOKEN_TTL_DAYS = 30;

// ========== 密码哈希（scrypt，盐+哈希，无第三方依赖） ==========
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'));
}

// ========== 会话 token ==========
function createToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  return db.prepare(
    `SELECT u.id, u.username, u.password_hash, u.role, u.nickname, u.balance, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).get(token, new Date().toISOString()) || null;
}

// 对外暴露的用户信息（不包含密码哈希）
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    nickname: user.nickname,
    balance: user.balance,
    created_at: user.created_at
  };
}

// ========== 中间件 ==========
// 要求已登录
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = getUserByToken(token);
  if (!user) {
    return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
  }
  req.user = user;
  req.token = token;
  next();
}

// 要求管理员
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '无权限，需要管理员账号' });
  }
  next();
}

module.exports = { hashPassword, verifyPassword, createToken, getUserByToken, publicUser, requireAuth, requireAdmin };
