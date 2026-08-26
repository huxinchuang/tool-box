// 后端 API 地址配置
// 生产环境（当前）：https://hulaquan.asia（Ubuntu 服务器 + Nginx 反代 + Let's Encrypt 证书）
// 本地开发：127.0.0.1:3000（本地后端，与服务器数据相互独立）
// 注意：正式版/体验版必须使用 HTTPS + 已在微信公众平台配置的 request 合法域名
module.exports = {
  baseUrl: 'https://hulaquan.asia'
  // baseUrl: 'http://127.0.0.1:3000'   // 本地开发用，取消注释并注释上面一行即可切换
};
