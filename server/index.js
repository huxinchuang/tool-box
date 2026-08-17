// tool-box 后端 API 服务入口
// 启动：npm start（默认端口 3000，可用环境变量 PORT 覆盖）
const express = require('express');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS（开发环境全放开，小程序 wx.request 不受浏览器 CORS 限制，此配置主要方便网页调试）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 根路径：简单说明页（避免浏览器访问根路径时看到 Cannot GET 造成困惑）
app.get('/', (req, res) => {
  res.json({
    name: 'tool-box API server',
    status: 'running',
    time: new Date().toISOString(),
    note: '小程序访问的是 /api 接口；本页仅用于确认服务状态',
    endpoints: {
      health: 'GET /api/health',
      login: 'POST /api/auth/login',
      logout: 'POST /api/auth/logout',
      me: 'GET /api/auth/me',
      balance: 'GET /api/balance',
      transactions: 'GET /api/transactions?playerId=&offset=&limit=',
      adminPlayers: 'GET/POST /api/admin/players',
      adminAdjust: 'POST /api/admin/adjust'
    }
  });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 0, data: { status: 'ok', time: new Date().toISOString() } });
});

// 业务路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/balance'));
app.use('/api/admin', require('./routes/admin'));

// 统一错误处理（避免异常堆栈泄露给客户端）
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(err.status || 500).json({ code: err.status || 500, message: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`tool-box API server listening on http://127.0.0.1:${PORT}`);
});
