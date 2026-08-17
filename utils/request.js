// wx.request 封装：自动携带 token、统一错误提示、返回 Promise
// 登录态失效（401）时自动清除本地凭证并跳转登录页
const { baseUrl } = require('./config');

function request({ url, method = 'GET', data = {}, auth = true }) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = wx.getStorageSync('gameToken');
      if (token) header.Authorization = `Bearer ${token}`;
    }

    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header,
      success: (res) => {
        // 登录态失效（登录接口本身除外）
        if (res.statusCode === 401 && auth) {
          wx.removeStorageSync('gameToken');
          wx.removeStorageSync('gameUser');
          wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/game/login/login' });
          }, 800);
          reject(res.data);
          return;
        }
        if (res.data && res.data.code === 0) {
          resolve(res.data.data);
        } else {
          const msg = (res.data && res.data.message) || '请求失败';
          wx.showToast({ title: msg, icon: 'none' });
          reject(res.data);
        }
      },
      fail: (err) => {
        wx.showToast({ title: '网络连接失败，请确认后端服务已启动', icon: 'none' });
        reject(err);
      }
    });
  });
}

module.exports = request;
