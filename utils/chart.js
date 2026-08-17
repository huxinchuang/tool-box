// utils/chart.js —— 余额变化折线图（Canvas 2D，无第三方依赖）
// 股票风格：左轴=余额，右轴=涨跌幅（相对上一个变动点），红涨绿跌（A股习惯）
// 用法：drawBalanceChart(canvasNode, size, points)
//   points: [{ time: 'YYYY-MM-DD HH:mm:ss', balance: 数字, pct: 数字|null }]
//   pct 为 null 时该点不画右轴标签（前值余额为 0 无法计算百分比）

const UP_COLOR = '#e64340'   // 涨：红
const DOWN_COLOR = '#07c160' // 跌：绿
const FLAT_COLOR = '#999999' // 平
const GRID_COLOR = '#eeeeee'
const TEXT_COLOR = '#999999'
const AXIS_COLOR = '#666666'

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

function drawBalanceChart(canvas, ctx, size, points) {
  const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : (wx.getSystemInfoSync().pixelRatio || 1)
  const w = size.width
  const h = size.height
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)

  ctx.font = '10px PingFang SC, Microsoft YaHei, sans-serif'
  ctx.textBaseline = 'middle'

  // 数据不足
  if (!points || points.length < 2) {
    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = 'center'
    ctx.fillText('暂无余额变化数据', w / 2, h / 2)
    return
  }

  // ===== 坐标范围 =====
  const balances = points.map(p => p.balance)
  let lo = Math.min(0, ...balances)          // 余额轴从 0 开始（余额不为负）
  let hi = Math.max(...balances)
  const pad = (hi - lo) * 0.15 || 1
  hi += pad
  lo -= pad
  if (lo < 0 && Math.min(...balances) >= 0) lo = -pad // 略低于 0 显示余量

  const pcts = points.map(p => p.pct).filter(p => p !== null && isFinite(p))
  let pmax = 1
  if (pcts.length) pmax = Math.max(...pcts.map(Math.abs)) * 1.2
  if (pmax <= 0) pmax = 1

  // ===== 布局 =====
  const margin = { top: 14, right: 44, bottom: 26, left: 42 }
  const plotW = w - margin.left - margin.right
  const plotH = h - margin.top - margin.bottom
  const n = points.length
  const X = i => margin.left + (plotW * i) / (n - 1)
  const Y = b => margin.top + plotH * (1 - (b - lo) / (hi - lo))

  // ===== 网格 + 左轴（余额）+ 右轴（涨跌幅） =====
  const GRID_N = 4
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1
  for (let i = 0; i <= GRID_N; i++) {
    const y = margin.top + (plotH * i) / GRID_N
    ctx.beginPath()
    ctx.moveTo(margin.left, y)
    ctx.lineTo(w - margin.right, y)
    ctx.stroke()

    // 左轴标签
    const b = hi - ((hi - lo) * i) / GRID_N
    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = 'right'
    ctx.fillText(formatAmount(b), margin.left - 6, y)

    // 右轴标签（%）
    const p = pmax - (2 * pmax * i) / GRID_N
    const pText = p === 0 ? '0%' : (p > 0 ? '+' : '') + p.toFixed(1) + '%'
    ctx.textAlign = 'left'
    ctx.fillText(pText, w - margin.right + 6, y)
  }

  // ===== 时间轴标签（最多 5 个） =====
  ctx.textAlign = 'center'
  ctx.fillStyle = TEXT_COLOR
  const labelCount = Math.min(5, n)
  for (let k = 0; k < labelCount; k++) {
    const i = Math.round((k * (n - 1)) / Math.max(labelCount - 1, 1))
    ctx.fillText(formatTime(points[i].time), X(i), h - margin.bottom + 12)
  }

  // ===== 涨跌着色线段 + 面积填充 =====
  const netUp = points[n - 1].balance >= points[0].balance
  const areaGrad = ctx.createLinearGradient(0, margin.top, 0, h - margin.bottom)
  areaGrad.addColorStop(0, (netUp ? UP_COLOR : DOWN_COLOR) + '30') // 19% 透明度
  areaGrad.addColorStop(1, (netUp ? UP_COLOR : DOWN_COLOR) + '00')

  // 面积
  ctx.beginPath()
  ctx.moveTo(X(0), Y(points[0].balance))
  for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(points[i].balance))
  ctx.lineTo(X(n - 1), margin.top + plotH)
  ctx.lineTo(X(0), margin.top + plotH)
  ctx.closePath()
  ctx.fillStyle = areaGrad
  ctx.fill()

  // 线段（每段按自身涨跌着色）
  for (let i = 1; i < n; i++) {
    const prev = points[i - 1].balance
    const cur = points[i].balance
    const color = cur > prev ? UP_COLOR : cur < prev ? DOWN_COLOR : FLAT_COLOR
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(X(i - 1), Y(prev))
    ctx.lineTo(X(i), Y(cur))
    ctx.stroke()
  }

  // ===== 数据点 =====
  for (let i = 0; i < n; i++) {
    const color = i === 0
      ? FLAT_COLOR
      : points[i].balance > points[i - 1].balance ? UP_COLOR
        : points[i].balance < points[i - 1].balance ? DOWN_COLOR : FLAT_COLOR
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(X(i), Y(points[i].balance), i === n - 1 ? 3.5 : 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // ===== 最新值标签 =====
  const last = points[n - 1]
  const lastColor = last.balance > points[n - 2].balance ? UP_COLOR : last.balance < points[n - 2].balance ? DOWN_COLOR : FLAT_COLOR
  const pctText = last.pct === null ? '' : ` (${last.pct >= 0 ? '+' : ''}${last.pct.toFixed(1)}%)`
  ctx.fillStyle = lastColor
  ctx.textAlign = 'left'
  ctx.font = 'bold 11px PingFang SC, Microsoft YaHei, sans-serif'
  ctx.fillText(`${last.balance}${pctText}`, X(n - 1) + 6, Y(last.balance) - 10)
  ctx.font = '10px PingFang SC, Microsoft YaHei, sans-serif'

  // 坐标轴含义提示（右上角）
  ctx.fillStyle = AXIS_COLOR
  ctx.textAlign = 'right'
  ctx.font = '9px PingFang SC, Microsoft YaHei, sans-serif'
  ctx.fillText('左轴:余额  右轴:涨跌幅', w - 2, 8)
  ctx.font = '10px PingFang SC, Microsoft YaHei, sans-serif'
}

module.exports = { drawBalanceChart }
