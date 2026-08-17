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
    adjustType: 'fixed', // fixed=固定数量 | percent=百分比
    selectedPlayer: null,
    adjustAmount: '',
    adjustBase: '',
    adjustPercent: '',
    adjustRemark: '',
    previewText: ''
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
    // 注意：dataset 取出的 id 是字符串，需要转成数字再和列表里的数字 id 比较
    const player = this.data.players.find(p => p.id === parseInt(id, 10));
    if (!player) return;
    this.setData({
      showAdjust: true,
      adjustMode: mode,
      adjustType: 'fixed',
      selectedPlayer: player,
      adjustAmount: '',
      adjustBase: '',
      adjustPercent: '',
      adjustRemark: '',
      previewText: ''
    });
  },

  closeAdjust() {
    this.setData({ showAdjust: false, selectedPlayer: null });
  },

  // 切换固定数量 / 百分比模式
  switchAdjustType(e) {
    this.setData({
      adjustType: e.currentTarget.dataset.type,
      adjustAmount: '',
      adjustBase: '',
      adjustPercent: '',
      previewText: ''
    });
  },

  onAdjustInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value }, () => {
      if (this.data.adjustType === 'percent') this.updatePreview();
    });
  },

  // 百分比模式实时预览：基数 × 百分比 = 增减数量 → 新余额
  updatePreview() {
    const { adjustMode, selectedPlayer, adjustBase, adjustPercent } = this.data;
    if (!selectedPlayer) return;
    const base = parseInt(adjustBase, 10);
    const pct = parseFloat(adjustPercent);
    if (!base || base <= 0) { this.setData({ previewText: '' }); return; }
    if (base > selectedPlayer.balance) {
      this.setData({ previewText: `⚠️ 基数不能超过当前余额 ${selectedPlayer.balance}` });
      return;
    }
    if (!pct || isNaN(pct)) { this.setData({ previewText: '' }); return; }
    const sign = adjustMode === 'add' ? 1 : -1;
    const amount = Math.round(base * pct / 100) * sign;
    if (amount === 0) {
      this.setData({ previewText: '⚠️ 计算结果为 0，请调整基数或百分比' });
      return;
    }
    const newBalance = selectedPlayer.balance + amount;
    const actionText = amount > 0 ? '增加' : '扣减';
    this.setData({
      previewText: `按 ${base} 的 ${pct}% ${actionText} ${Math.abs(amount)} 币 → 余额 ${selectedPlayer.balance} → ${newBalance}`
    });
  },

  noop() {},

  async confirmAdjust() {
    const { selectedPlayer, adjustMode, adjustType, adjustAmount, adjustBase, adjustPercent, adjustRemark } = this.data;
    if (!selectedPlayer) return;
    const actionText = adjustMode === 'add' ? '增加' : '扣减';

    let payload;
    if (adjustType === 'percent') {
      const base = parseInt(adjustBase, 10);
      const pct = parseFloat(adjustPercent);
      if (!base || base <= 0) {
        wx.showToast({ title: '请输入正确的基数', icon: 'none' });
        return;
      }
      if (base > selectedPlayer.balance) {
        wx.showToast({ title: '基数不能超过当前余额', icon: 'none' });
        return;
      }
      if (!pct || isNaN(pct)) {
        wx.showToast({ title: '请输入正确的百分比', icon: 'none' });
        return;
      }
      // 正百分比=增加，负百分比=扣减
      payload = {
        playerId: selectedPlayer.id,
        base,
        percent: adjustMode === 'add' ? Math.abs(pct) : -Math.abs(pct),
        remark: adjustRemark
      };
    } else {
      const amt = parseInt(adjustAmount, 10);
      if (isNaN(amt) || amt <= 0) {
        wx.showToast({ title: '请输入正确的数量', icon: 'none' });
        return;
      }
      payload = {
        playerId: selectedPlayer.id,
        amount: adjustMode === 'add' ? amt : -amt,
        remark: adjustRemark
      };
    }

    try {
      await request({
        url: '/api/admin/adjust',
        method: 'POST',
        data: payload
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
