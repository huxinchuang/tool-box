// 游戏币管理 - 管理员页（仅管理员可访问）
// 功能：创建玩家账号、查看玩家列表、给玩家加/减游戏币、查看玩家历史
const request = require('../../../utils/request');

Page({
  data: {
    players: [],
    loading: false,
    // 创建账号表单
    createForm: { username: '', password: '', nickname: '' },
    // 加减币面板
    showAdjust: false,
    adjustMode: 'add', // add | deduct
    selectedPlayer: null,
    adjustAmount: '',
    adjustRemark: ''
  },

  onShow() {
    this.loadPlayers();
  },

  async loadPlayers() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const players = await request({ url: '/api/admin/players' });
      this.setData({ players });
    } catch (e) {
      // 错误提示已由 request 统一处理
    } finally {
      this.setData({ loading: false });
    }
  },

  // ========== 创建玩家账号 ==========
  onCreateInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`createForm.${field}`]: e.detail.value });
  },

  async createPlayer() {
    const { username, password, nickname } = this.data.createForm;
    if (!username || !password) {
      wx.showToast({ title: '账号和密码不能为空', icon: 'none' });
      return;
    }
    if (password.length < 4) {
      wx.showToast({ title: '密码至少4位', icon: 'none' });
      return;
    }
    try {
      await request({
        url: '/api/admin/players',
        method: 'POST',
        data: { username, password, nickname }
      });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ createForm: { username: '', password: '', nickname: '' } });
      this.loadPlayers();
    } catch (e) {}
  },

  // ========== 加/减游戏币 ==========
  openAdjust(e) {
    const { id, mode } = e.currentTarget.dataset;
    const player = this.data.players.find(p => p.id === id);
    if (!player) return;
    this.setData({
      showAdjust: true,
      adjustMode: mode,
      selectedPlayer: player,
      adjustAmount: '',
      adjustRemark: ''
    });
  },

  closeAdjust() {
    this.setData({ showAdjust: false, selectedPlayer: null });
  },

  onAdjustInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  noop() {},

  async confirmAdjust() {
    const { selectedPlayer, adjustMode, adjustAmount, adjustRemark } = this.data;
    const amt = parseInt(adjustAmount, 10);
    if (!selectedPlayer || isNaN(amt) || amt <= 0) {
      wx.showToast({ title: '请输入正确的数量', icon: 'none' });
      return;
    }
    const amount = adjustMode === 'add' ? amt : -amt;
    const actionText = adjustMode === 'add' ? '增加' : '扣减';
    try {
      await request({
        url: '/api/admin/adjust',
        method: 'POST',
        data: { playerId: selectedPlayer.id, amount, remark: adjustRemark }
      });
      wx.showToast({ title: `${actionText}成功`, icon: 'success' });
      this.setData({ showAdjust: false, selectedPlayer: null });
      this.loadPlayers();
    } catch (e) {}
  },

  // ========== 查看玩家历史 ==========
  viewHistory(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/game/history/history?playerId=${id}&playerLabel=${encodeURIComponent(name)}`
    });
  }
});
