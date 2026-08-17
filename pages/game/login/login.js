// 游戏币管理 - 登录页
const request = require('../../../utils/request');

Page({
  data: {
    username: '',
    password: '',
    loading: false
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  async login() {
    const { username, password } = this.data;
    if (!username || !password) {
      wx.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const data = await request({
        url: '/api/auth/login',
        method: 'POST',
        data: { username, password },
        auth: false // 登录接口自身不带 token，401 时由后端返回错误信息而非跳转
      });
      wx.setStorageSync('gameToken', data.token);
      wx.setStorageSync('gameUser', data.user);
      wx.redirectTo({ url: '/pages/game/dashboard/dashboard' });
    } catch (e) {
      // 错误提示已由 request 统一处理
    } finally {
      this.setData({ loading: false });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
