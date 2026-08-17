// 游戏币管理 - 余额首页（玩家与管理员的公共入口）
const request = require('../../../utils/request');
const { drawBalanceChart } = require('../../../utils/chart');

Page({
  data: {
    user: null,
    balance: 0,
    roleText: '',
    isAdmin: false,
    chartLoading: false
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
      this.loadChart();
    } catch (e) {}
  },

  // 拉取余额流水（正序）并绘制折线图
  async loadChart() {
    if (this.data.chartLoading) return;
    this.setData({ chartLoading: true });
    try {
      const data = await request({
        url: '/api/transactions',
        data: { order: 'asc', limit: 100 }
      });
      // 构造图表点：玩家创建时余额为 0 的起点 + 每笔变动后的余额
      const points = []
      if (this.data.user && this.data.user.created_at) {
        points.push({ time: this.data.user.created_at, balance: 0, pct: null })
      }
      let prev = 0
      for (const t of data.list) {
        // 涨跌幅 = 相对上一个变动点的变化率；前值余额为 0 时无法计算，显示为 null
        const pct = prev === 0 ? null : ((t.balance_after - prev) / prev) * 100
        points.push({ time: t.created_at, balance: t.balance_after, pct })
        prev = t.balance_after
      }
      this.setData({ chartPoints: points })
      this.drawChart()
    } catch (e) {
      // 错误提示已由 request 统一处理
    } finally {
      this.setData({ chartLoading: false })
    }
  },

  // 在 canvas 上绘制折线图
  drawChart() {
    const points = this.data.chartPoints
    if (!points) return
    wx.createSelectorQuery()
      .select('#balanceChart')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res || !res[0] || !res[0].node) return
        try {
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          drawBalanceChart(canvas, ctx, { width: res[0].width, height: res[0].height }, points)
        } catch (e) {
          console.error('绘制折线图失败', e)
        }
      })
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
