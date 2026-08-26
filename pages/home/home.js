// 工具箱首页：选择要使用的工具
Page({
  // 分享：右上角菜单转发入口
  onShareAppMessage() {
    return {
      title: '工具箱 - 货车记账与游戏币管理',
      path: '/pages/home/home'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '工具箱 - 货车记账与游戏币管理'
    };
  },

  // 进入货车运输记账工具
  goToTruck() {
    wx.navigateTo({
      url: '/pages/index/index'
    });
  },

  // 进入游戏币管理工具（已登录直接进余额页，否则先登录）
  goToGame() {
    const token = wx.getStorageSync('gameToken');
    const url = token ? '/pages/game/dashboard/dashboard' : '/pages/game/login/login';
    wx.navigateTo({
      url
    });
  }
});
