// 游戏币管理 - 管理员页（仅管理员可访问）
// 功能：创建玩家账号、玩家列表、分组管理（创建/重命名/删除）、给玩家加/减币（固定/百分比）
const request = require('../../../utils/request');

Page({
  data: {
    players: [],
    loading: false,
    // 创建账号表单
    createForm: { username: '', password: '', nickname: '' },
    // 分组管理面板
    showGroupPanel: false,
    groupPlayer: null,
    groupList: [],
    newGroupName: '',
    // 加减币面板
    showAdjust: false,
    adjustMode: 'add', // add | deduct
    adjustType: 'fixed', // fixed=固定数量 | percent=百分比
    selectedPlayer: null,
    playerGroups: [],        // 选中玩家的分组（加减币选择用）
    selectedGroupIndex: 0,   // 加减币面板选中的分组下标
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

  // ========== 分组管理 ==========
  async openGroupPanel(e) {
    const pid = parseInt(e.currentTarget.dataset.id, 10);
    const player = this.data.players.find(p => p.id === pid);
    if (!player) return;
    this.setData({ showGroupPanel: true, groupPlayer: player, newGroupName: '', groupList: [] });
    await this.loadGroupList(pid);
  },

  closeGroupPanel() {
    this.setData({ showGroupPanel: false, groupPlayer: null });
  },

  async loadGroupList(pid) {
    try {
      const list = await request({ url: `/api/admin/groups?playerId=${pid}` });
      this.setData({ groupList: list });
    } catch (e) {}
  },

  onNewGroupInput(e) {
    this.setData({ newGroupName: e.detail.value });
  },

  async createGroup() {
    const { groupPlayer, newGroupName } = this.data;
    if (!groupPlayer || !newGroupName.trim()) {
      wx.showToast({ title: '请输入分组名', icon: 'none' });
      return;
    }
    try {
      await request({
        url: '/api/admin/groups',
        method: 'POST',
        data: { playerId: groupPlayer.id, name: newGroupName.trim() }
      });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ newGroupName: '' });
      await this.loadGroupList(groupPlayer.id);
    } catch (e) {}
  },

  async renameGroup(e) {
    const gid = parseInt(e.currentTarget.dataset.id, 10);
    const group = this.data.groupList.find(g => g.id === gid);
    if (!group) return;
    const res = await new Promise(resolve => {
      wx.showModal({
        title: '重命名分组',
        editable: true,
        placeholderText: '请输入新名称',
        content: group.name,
        success: resolve
      });
    });
    if (!res.confirm || !res.content || !res.content.trim()) return;
    try {
      await request({ url: `/api/admin/groups/${gid}`, method: 'PUT', data: { name: res.content.trim() } });
      wx.showToast({ title: '已重命名', icon: 'success' });
      await this.loadGroupList(this.data.groupPlayer.id);
    } catch (e) {}
  },

  async deleteGroup(e) {
    const gid = parseInt(e.currentTarget.dataset.id, 10);
    const group = this.data.groupList.find(g => g.id === gid);
    if (!group) return;
    const res = await new Promise(resolve => {
      wx.showModal({
        title: '删除分组',
        content: group.balance !== 0
          ? `该分组还有 ${group.balance} 个游戏币，不能删除`
          : `确定删除分组「${group.name}」吗？`,
        showCancel: group.balance === 0,
        confirmText: group.balance === 0 ? '删除' : '知道了',
        success: resolve
      });
    });
    if (!res.confirm || group.balance !== 0) return;
    try {
      await request({ url: `/api/admin/groups/${gid}`, method: 'DELETE' });
      wx.showToast({ title: '已删除', icon: 'success' });
      await this.loadGroupList(this.data.groupPlayer.id);
    } catch (e) {}
  },

  // ========== 加/减游戏币 ==========
  async openAdjust(e) {
    const { id, mode } = e.currentTarget.dataset;
    // 注意：dataset 取出的 id 是字符串，需要转成数字再和列表里的数字 id 比较
    const player = this.data.players.find(p => p.id === parseInt(id, 10));
    if (!player) return;
    this.setData({
      showAdjust: true,
      adjustMode: mode,
      adjustType: 'fixed',
      selectedPlayer: player,
      playerGroups: [],
      selectedGroupIndex: 0,
      adjustAmount: '',
      adjustBase: '',
      adjustPercent: '',
      adjustRemark: '',
      previewText: ''
    });
    // 加载该玩家分组，供分组选择器使用
    try {
      const groups = await request({ url: `/api/admin/groups?playerId=${player.id}` });
      this.setData({ playerGroups: groups, selectedGroupIndex: 0 });
      if (groups.length === 0) {
        wx.showToast({ title: '该玩家还没有分组，请先创建', icon: 'none' });
      }
    } catch (e) {}
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

  // 加减币面板：选择分组
  onGroupChange(e) {
    this.setData({ selectedGroupIndex: Number(e.detail.value) }, () => {
      if (this.data.adjustType === 'percent') this.updatePreview();
    });
  },

  // 当前选中分组的余额
  selectedGroupBalance() {
    const { playerGroups, selectedGroupIndex } = this.data;
    const g = playerGroups[selectedGroupIndex];
    return g ? g.balance : 0;
  },

  onAdjustInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value }, () => {
      if (this.data.adjustType === 'percent') this.updatePreview();
    });
  },

  // 百分比模式实时预览：基数 × 百分比 = 增减数量 → 新余额（按选中分组）
  updatePreview() {
    const { adjustMode, selectedPlayer, adjustBase, adjustPercent } = this.data;
    if (!selectedPlayer) return;
    const gBalance = this.selectedGroupBalance();
    const gName = this.data.playerGroups[this.data.selectedGroupIndex]
      ? this.data.playerGroups[this.data.selectedGroupIndex].name : '';
    const base = parseInt(adjustBase, 10);
    const pct = parseFloat(adjustPercent);
    if (!base || base <= 0) { this.setData({ previewText: '' }); return; }
    if (base > gBalance) {
      this.setData({ previewText: `⚠️ 基数不能超过「${gName}」余额 ${gBalance}` });
      return;
    }
    if (!pct || isNaN(pct)) { this.setData({ previewText: '' }); return; }
    const sign = adjustMode === 'add' ? 1 : -1;
    const amount = Math.round(base * pct / 100) * sign;
    if (amount === 0) {
      this.setData({ previewText: '⚠️ 计算结果为 0，请调整基数或百分比' });
      return;
    }
    const newBalance = gBalance + amount;
    const actionText = amount > 0 ? '增加' : '扣减';
    this.setData({
      previewText: `「${gName}」按 ${base} 的 ${pct}% ${actionText} ${Math.abs(amount)} 币 → ${gBalance} → ${newBalance}`
    });
  },

  noop() {},

  async confirmAdjust() {
    const {
      selectedPlayer, adjustMode, adjustType, adjustAmount,
      adjustBase, adjustPercent, adjustRemark, playerGroups, selectedGroupIndex
    } = this.data;
    if (!selectedPlayer) return;
    const actionText = adjustMode === 'add' ? '增加' : '扣减';

    // 目标分组
    const group = playerGroups[selectedGroupIndex];
    if (!group) {
      wx.showToast({ title: '请先为该玩家创建分组', icon: 'none' });
      return;
    }

    let payload;
    if (adjustType === 'percent') {
      const base = parseInt(adjustBase, 10);
      const pct = parseFloat(adjustPercent);
      if (!base || base <= 0) {
        wx.showToast({ title: '请输入正确的基数', icon: 'none' });
        return;
      }
      if (base > group.balance) {
        wx.showToast({ title: '基数不能超过该分组余额', icon: 'none' });
        return;
      }
      if (!pct || isNaN(pct)) {
        wx.showToast({ title: '请输入正确的百分比', icon: 'none' });
        return;
      }
      // 正百分比=增加，负百分比=扣减
      payload = {
        playerId: selectedPlayer.id,
        groupId: group.id,
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
        groupId: group.id,
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
