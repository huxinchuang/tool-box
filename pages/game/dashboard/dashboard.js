// 游戏币管理 - 余额首页（玩家与管理员的公共入口）
// 支持余额分组：可单选分组 / 多选对比 / 全部总和
const request = require('../../../utils/request');
const { drawBalanceChart } = require('../../../utils/chart');

Page({
  data: {
    user: null,
    balance: 0,             // 当前展示范围的余额
    scopeLabel: '全部',      // 展示范围说明
    roleText: '',
    isAdmin: false,
    chartLoading: false,
    groups: [],             // 我的分组 [{id, name, balance, created_at}]
    displayGroups: [],      // 渲染用（带 active 标记）
    selectedGroupIds: [],   // 选中的分组 id（空 = 全部）
    groupSummary: [],       // 多选时的分组余额摘要
    hasGroups: false
  },

  onShow() {
    this.loadMe();
  },

  // 拉取最新用户信息；token 失效时 request 会自动跳登录页
  async loadMe() {
    try {
      const user = await request({ url: '/api/auth/me' });
      wx.setStorageSync('gameUser', user);
      this.setData({
        user,
        isAdmin: user.role === 'admin',
        roleText: user.role === 'admin' ? '管理员' : '玩家'
      });
      await this.loadGroups();
      this.refreshDisplay();
      this.loadChart();
    } catch (e) {}
  },

  // 拉取我的分组
  async loadGroups() {
    try {
      const groups = await request({ url: '/api/groups' });
      this.setData({ groups, hasGroups: groups.length > 0 });
    } catch (e) {
      this.setData({ groups: [], hasGroups: false });
    }
  },

  // 计算当前展示范围的余额与摘要
  refreshDisplay() {
    const { groups, selectedGroupIds } = this.data;
    const selected = groups.filter(g => selectedGroupIds.includes(g.id));
    let balance;
    let scopeLabel;
    let groupSummary;
    if (selectedGroupIds.length === 0) {
      balance = groups.reduce((s, g) => s + g.balance, 0);
      scopeLabel = '全部';
      groupSummary = [];
    } else {
      balance = selected.reduce((s, g) => s + g.balance, 0);
      scopeLabel = selected.length === 1 ? selected[0].name : `已选 ${selected.length} 个分组`;
      groupSummary = selected.map(g => ({ id: g.id, name: g.name, balance: g.balance }));
    }
    this.setData({
      balance,
      scopeLabel,
      groupSummary,
      displayGroups: groups.map(g => ({ ...g, active: selectedGroupIds.includes(g.id) }))
    });
  },

  // 选中"全部"
  selectAllGroups() {
    this.setData({ selectedGroupIds: [] }, () => {
      this.refreshDisplay();
      this.loadChart();
    });
  },

  // 多选/取消分组
  toggleGroup(e) {
    const gid = parseInt(e.currentTarget.dataset.id, 10);
    const sel = this.data.selectedGroupIds.slice();
    const idx = sel.indexOf(gid);
    if (idx >= 0) sel.splice(idx, 1);
    else sel.push(gid);
    this.setData({ selectedGroupIds: sel }, () => {
      this.refreshDisplay();
      this.loadChart();
    });
  },

  // 拉取选中范围的流水并绘制折线图
  async loadChart() {
    if (this.data.chartLoading) return;
    this.setData({ chartLoading: true });
    try {
      const { selectedGroupIds, groups, user } = this.data;
      const series = [];

      if (selectedGroupIds.length === 0) {
        // 全部：总趋势（0 起点 + 所有流水累计）
        const data = await request({ url: '/api/transactions', data: { order: 'asc', limit: 200 } });
        const points = [];
        if (user && user.created_at) points.push({ time: user.created_at, balance: 0, pct: null });
        let prev = 0;
        let total = 0;
        for (const t of data.list) {
          total += t.amount;
          const pct = prev === 0 ? null : ((total - prev) / prev) * 100;
          points.push({ time: t.created_at, balance: total, pct });
          prev = total;
        }
        series.push({ name: '全部', points });
      } else {
        // 选中分组：每个分组一条序列（分组内累计余额）
        for (const g of groups.filter(x => selectedGroupIds.includes(x.id))) {
          const data = await request({
            url: '/api/transactions',
            data: { order: 'asc', groupId: g.id, limit: 200 }
          });
          const points = [];
          if (data.list.length > 0 && g.created_at) points.push({ time: g.created_at, balance: 0 });
          let acc = 0;
          for (const t of data.list) {
            acc += t.amount;
            points.push({ time: t.created_at, balance: acc });
          }
          series.push({ name: g.name, points });
        }
      }

      this.setData({ chartSeries: series }, () => this.drawChart());
    } catch (e) {
      // 错误提示已由 request 统一处理
    } finally {
      this.setData({ chartLoading: false });
    }
  },

  // 在 canvas 上绘制折线图（单线或多线对比）
  drawChart() {
    const series = this.data.chartSeries;
    if (!series || !series.length) return;
    wx.createSelectorQuery()
      .select('#balanceChart')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res || !res[0] || !res[0].node) return;
        try {
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          drawBalanceChart(canvas, ctx, { width: res[0].width, height: res[0].height }, series);
        } catch (e) {
          console.error('绘制折线图失败', e);
        }
      });
  },

  goHistory() {
    const ids = this.data.selectedGroupIds.join(',');
    wx.navigateTo({ url: '/pages/game/history/history' + (ids ? `?groupIds=${ids}` : '') });
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
