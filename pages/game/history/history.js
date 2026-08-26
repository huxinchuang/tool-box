// 游戏币管理 - 变动历史页
// 支持分页加载；管理员可带 playerId 参数查看指定玩家的历史
const request = require('../../../utils/request');

Page({
  // 分享：右上角菜单转发入口
  onShareAppMessage() {
    return {
      title: '工具箱 - 游戏币管理',
      path: '/pages/home/home'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '工具箱 - 游戏币管理'
    };
  },

  data: {
    list: [],
    total: 0,
    offset: 0,
    limit: 20,
    hasMore: true,
    loading: false,
    playerId: 0,
    groupIds: '',
    titleText: '变动历史'
  },

  onLoad(options) {
    const playerId = options.playerId ? parseInt(options.playerId, 10) : 0;
    const groupIds = options.groupIds || '';
    const titleText = options.playerLabel ? `${options.playerLabel}的变动历史` : '变动历史';
    wx.setNavigationBarTitle({ title: titleText });
    this.setData({ playerId, groupIds, titleText });
    this.loadMore(true);
  },

  async loadMore(reset = false) {
    if (this.data.loading || (!reset && !this.data.hasMore)) return;
    this.setData({ loading: true });
    try {
      const offset = reset ? 0 : this.data.offset;
      const data = await request({
        url: '/api/transactions',
        data: {
          offset,
          limit: this.data.limit,
          ...(this.data.playerId ? { playerId: this.data.playerId } : {}),
          ...(this.data.groupIds ? { groupId: this.data.groupIds } : {})
        }
      });
      const list = data.list.map(t => ({
        id: t.id,
        amount: t.amount,
        amountText: t.amount > 0 ? `+${t.amount}` : String(t.amount),
        amountClass: t.amount > 0 ? 'amount-plus' : 'amount-minus',
        balanceAfter: t.balance_after,
        remark: t.remark,
        groupName: t.group_name || '',
        operator: t.operator_nickname || t.operator_username || '',
        timeText: (t.created_at || '').replace('T', ' ').slice(0, 19)
      }));
      this.setData({
        list: reset ? list : this.data.list.concat(list),
        total: data.total,
        offset: offset + list.length,
        hasMore: offset + list.length < data.total
      });
    } catch (e) {
      // 错误提示已由 request 统一处理
    } finally {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    this.loadMore();
  }
});
