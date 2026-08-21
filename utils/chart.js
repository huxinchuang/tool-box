// utils/chart.js —— 余额变化折线图（Canvas 2D，无第三方依赖）
// 单序列模式（原行为）：左轴=余额，右轴=涨跌幅（相对上一个变动点），红涨绿跌（A股习惯）
// 多序列模式（分组对比）：左轴=余额，各序列独立颜色 + 图例 + 时间轴对齐
// 用法：drawBalanceChart(canvasNode, ctx, size, series)
//   series: [{ name, points: [{ time: 'YYYY-MM-DD HH:mm:ss', balance: 数字, pct: 数字|null }] }]
//   pct 仅单序列模式使用；多序列模式忽略

// 暗色金融主题配色（参考冷西西指数页：GitHub 暗色风，红涨绿跌）
const UP_COLOR = '#ef5350'   // 涨：红
const DOWN_COLOR = '#26a69a' // 跌：青绿
const FLAT_COLOR = '#8b949e' // 平
const BG_COLOR = '#161b22'   // 画布背景（面板色）
const GRID_COLOR = 'rgba(48, 54, 61, 0.6)'
const TEXT_COLOR = '#8b949e'
// 多序列对比调色板
const PALETTE = ['#58a6ff', '#ef5350', '#26a69a', '#e3b341', '#a371f7', '#f0883e', '#39c5bb']

function formatAmount(v) {
  if (v === 0) return '0'
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + '万'
  return String(Math.round(v))
}

function formatTime(time) {
  // 'YYYY-MM-DD HH:mm:ss' -> 'MM-DD HH:mm'
  const t = String(time || '')
  const m = t.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/)
  if (!m) return t
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`
}

function parseTime(time) {
  // iOS 需要把 'YYYY-MM-DD HH:mm:ss' 转成带 T 的格式才能解析
  return new Date(String(time || '').replace(' ', 'T')).getTime()
}

function drawBalanceChart(canvas, ctx, size, series) {
  const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : (wx.getSystemInfoSync().pixelRatio || 1)
  const w = size.width
  const h = size.height
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)

  ctx.font = '10px PingFang SC, Microsoft YaHei, sans-serif'
  ctx.textBaseline = 'middle'

  // 归一化序列
  const raw = Array.isArray(series) ? series : [series]
  const data = raw.map((s, i) => ({
    name: s.name || '',
    color: s.color || PALETTE[i % PALETTE.length],
    points: s.points || []
  })).filter(d => d.points.length > 0)
  const multi = data.length > 1

  // 数据不足
  const allPoints = data.flatMap(d => d.points)
  if (allPoints.length < 2) {
    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = 'center'
    ctx.fillText('暂无余额变化数据', w / 2, h / 2)
    return
  }

  // 暗色画布背景
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, w, h)

  // ===== 布局 =====
  const margin = { top: multi ? 36 : 14, right: multi ? 14 : 44, bottom: 26, left: 42 }
  const plotW = w - margin.left - margin.right
  const plotH = h - margin.top - margin.bottom

  // 多线模式：时间轴范围（跨所有序列）
  let tMin = Infinity
  let tMax = -Infinity
  if (multi) {
    for (const p of allPoints) {
      const t = parseTime(p.time)
      if (isFinite(t)) {
        if (t < tMin) tMin = t
        if (t > tMax) tMax = t
      }
    }
    if (!isFinite(tMin)) { tMin = 0; tMax = 1 }
    if (tMax === tMin) tMax = tMin + 1
  }

  // ===== 余额范围（跨所有序列） =====
  // 左轴从 0 开始：余额不会为负，底部固定 0，只向上留余量
  let lo = Math.min(0, ...allPoints.map(p => p.balance))
  let hi = Math.max(...allPoints.map(p => p.balance))
  const pad = (hi - lo) * 0.15 || 1
  hi += pad
  if (lo < 0) lo -= pad // 仅当存在负余额时才向下扩展

  // 坐标函数
  const X = (d, i) => {
    if (multi) {
      const t = parseTime(d.points[i].time)
      return margin.left + (plotW * (t - tMin)) / (tMax - tMin)
    }
    return margin.left + (plotW * i) / (d.points.length - 1)
  }
  const Y = b => margin.top + plotH * (1 - (b - lo) / (hi - lo))

  // ===== 网格 + 左轴（余额） =====
  const GRID_N = 4
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1
  for (let i = 0; i <= GRID_N; i++) {
    const y = margin.top + (plotH * i) / GRID_N
    ctx.beginPath()
    ctx.moveTo(margin.left, y)
    ctx.lineTo(w - margin.right, y)
    ctx.stroke()

    const b = hi - ((hi - lo) * i) / GRID_N
    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = 'right'
    ctx.fillText(formatAmount(b), margin.left - 6, y)
  }

  // ===== 右轴（涨跌幅）：仅单序列模式 =====
  if (!multi) {
    const d0 = data[0]
    const pcts = d0.points.map(p => p.pct).filter(p => p !== null && isFinite(p))
    let pmax = 1
    if (pcts.length) pmax = Math.max(...pcts.map(Math.abs)) * 1.2
    if (pmax <= 0) pmax = 1
    for (let i = 0; i <= GRID_N; i++) {
      const y = margin.top + (plotH * i) / GRID_N
      const p = pmax - (2 * pmax * i) / GRID_N
      const pText = p === 0 ? '0%' : (p > 0 ? '+' : '') + p.toFixed(1) + '%'
      ctx.textAlign = 'left'
      ctx.fillStyle = TEXT_COLOR
      ctx.fillText(pText, w - margin.right + 6, y)
    }
  }

  // ===== 时间轴标签（最多 5 个） =====
  ctx.textAlign = 'center'
  ctx.fillStyle = TEXT_COLOR
  if (multi) {
    // 取所有序列点的并集时间，均匀抽 5 个
    const times = allPoints.map(p => parseTime(p.time)).filter(isFinite)
    const labelCount = Math.min(5, times.length)
    for (let k = 0; k < labelCount; k++) {
      const t = times[Math.round((k * (times.length - 1)) / Math.max(labelCount - 1, 1))]
      const x = margin.left + (plotW * (t - tMin)) / (tMax - tMin)
      ctx.fillText(formatTime(new Date(t).toISOString().replace('T', ' ').slice(0, 19)), x, h - margin.bottom + 12)
    }
  } else {
    const d0 = data[0]
    const labelCount = Math.min(5, d0.points.length)
    for (let k = 0; k < labelCount; k++) {
      const i = Math.round((k * (d0.points.length - 1)) / Math.max(labelCount - 1, 1))
      ctx.fillText(formatTime(d0.points[i].time), X(d0, i), h - margin.bottom + 12)
    }
  }

  // ===== 图例（多线模式，画在顶部） =====
  if (multi) {
    let lx = margin.left
    ctx.textAlign = 'left'
    ctx.font = '9px PingFang SC, Microsoft YaHei, sans-serif'
    for (const d of data) {
      ctx.fillStyle = d.color
      ctx.beginPath()
      ctx.arc(lx + 3, 10, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillText(d.name, lx + 10, 10)
      lx += 14 + ctx.measureText(d.name).width + 14
    }
    ctx.font = '10px PingFang SC, Microsoft YaHei, sans-serif'
  } else {
    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = 'right'
    ctx.font = '9px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillText('左轴:余额  右轴:涨跌幅', w - 2, 8)
    ctx.font = '10px PingFang SC, Microsoft YaHei, sans-serif'
  }

  // ===== 各序列：面积 + 折线 + 数据点 =====
  for (const d of data) {
    const n = d.points.length
    if (n < 1) continue

    // 面积填充（单线模式用涨跌色，多线模式用序列色）
    const areaColor = multi ? d.color : (d.points[n - 1].balance >= d.points[0].balance ? UP_COLOR : DOWN_COLOR)
    const areaGrad = ctx.createLinearGradient(0, margin.top, 0, h - margin.bottom)
    areaGrad.addColorStop(0, areaColor + '30')
    areaGrad.addColorStop(1, areaColor + '00')
    ctx.beginPath()
    ctx.moveTo(X(d, 0), Y(d.points[0].balance))
    for (let i = 1; i < n; i++) ctx.lineTo(X(d, i), Y(d.points[i].balance))
    ctx.lineTo(X(d, n - 1), margin.top + plotH)
    ctx.lineTo(X(d, 0), margin.top + plotH)
    ctx.closePath()
    ctx.fillStyle = areaGrad
    ctx.fill()

    // 线段
    for (let i = 1; i < n; i++) {
      const prev = d.points[i - 1].balance
      const cur = d.points[i].balance
      let color
      if (multi) {
        color = d.color
      } else {
        color = cur > prev ? UP_COLOR : cur < prev ? DOWN_COLOR : FLAT_COLOR
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(X(d, i - 1), Y(prev))
      ctx.lineTo(X(d, i), Y(cur))
      ctx.stroke()
    }

    // 数据点
    for (let i = 0; i < n; i++) {
      let color
      if (multi) {
        color = d.color
      } else {
        color = i === 0 ? FLAT_COLOR
          : d.points[i].balance > d.points[i - 1].balance ? UP_COLOR
            : d.points[i].balance < d.points[i - 1].balance ? DOWN_COLOR : FLAT_COLOR
      }
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(X(d, i), Y(d.points[i].balance), i === n - 1 ? 3.5 : 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // 最新值标注（多线模式在终点点旁标"名称 余额"，单线模式保留涨跌幅）
    const last = d.points[n - 1]
    const lastColor = multi ? d.color
      : last.balance > d.points[n - 2].balance ? UP_COLOR
        : last.balance < d.points[n - 2].balance ? DOWN_COLOR : FLAT_COLOR
    ctx.fillStyle = lastColor
    ctx.textAlign = 'left'
    ctx.font = 'bold 10px PingFang SC, Microsoft YaHei, sans-serif'
    if (multi) {
      ctx.fillText(`${d.name} ${last.balance}`, X(d, n - 1) + 6, Y(last.balance) - 8)
    } else {
      const pctText = last.pct === null ? '' : ` (${last.pct >= 0 ? '+' : ''}${last.pct.toFixed(1)}%)`
      ctx.fillText(`${last.balance}${pctText}`, X(d, n - 1) + 6, Y(last.balance) - 10)
    }
    ctx.font = '10px PingFang SC, Microsoft YaHei, sans-serif'
  }
}

module.exports = { drawBalanceChart }
