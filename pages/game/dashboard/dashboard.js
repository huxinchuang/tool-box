// 游戏币管理 - 余额首页（玩家与管理员的公共入口）
const request = require('../../../utils/request');

Page({
  data: {
    user: null,
    balance: 0,
    roleText: '',
    isAdmin: false
  },

  onShow() {
    this.loadMe();
  },

  // 拉取最新用户信息（含余额）；token 失效时 request 会自动跳登录页
  async loadMe() {
    try {
      const user = await request({ url: '/api/auth/me' });
      wx.setStorageSync('gameUser', user);
      this.setData({
        user,
        balance: user.balance,
        isAdmin: user.role === 'admin',
        roleText: user.role === 'admin' ? '管理员' : '玩家'
      });
    } catch (e) {}
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/game/history/history' });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/game/admin/admin' });
  },

  async logout() {
    try {
      await request({ url: '/api/auth/logout', method: 'POST' });
    } catch (e) {}
    wx.removeStorageSync('gameToken');
    wx.removeStorageSync('gameUser');
    wx.reLaunch({ url: '/pages/game/login/login' });
  },

  goHome() {
    wx.navigateBack();
  }
});
