Page({
  data: {
    form: {
      date: '',
      truckNum: '',
      spec: '',
      pieces: '',
      weight: '',
      price: ''
    },
    rawRecords: [],
    displayRows: [],
    freightRow: null,
    freightPrice: 30,
    appendix: '',
    generatedImage: '',
    isLoading: false
  },

  onLoad() {
    const freightPrice = wx.getStorageSync('freightPrice');
    const appendix = wx.getStorageSync('appendix');
    if (freightPrice) this.setData({ freightPrice: parseFloat(freightPrice) });
    if (appendix) this.setData({ appendix });
    this.updateDisplay();
  },

  // ========== 舍入规则：小数部分<0.9舍去，≥0.9进位 ==========
  roundSpecial(value) {
    if (isNaN(value)) return 0;
    const intPart = Math.floor(value);
    const decimal = value - intPart;
    if (decimal < 0.9) {
      return intPart;
    } else {
      return Math.ceil(value);
    }
  },

  // 日期处理
  normalizeDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    dateStr = dateStr.trim();
    if (dateStr === '') return '';
    if (/^\d{8}$/.test(dateStr)) {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const date = new Date(`${year}-${month}-${day}`);
      if (isNaN(date.getTime())) return '';
      return `${year}-${month}-${day}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      return dateStr;
    }
    return '';
  },

  formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${year}年${parseInt(month, 10)}月${parseInt(day, 10)}日`;
  },

  // 输入监听
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onFreightPriceInput(e) {
    let price = parseFloat(e.detail.value);
    if (isNaN(price)) price = 30;
    this.setData({ freightPrice: price });
    wx.setStorageSync('freightPrice', price);
    this.updateDisplay();
  },

  onAppendixInput(e) {
    const text = e.detail.value;
    this.setData({ appendix: text });
    wx.setStorageSync('appendix', text);
  },

  // 添加记录
  addRecord() {
    let { date, truckNum, spec, pieces, weight, price } = this.data.form;
    const rawRecords = this.data.rawRecords;

    let normalizedDate = '';
    if (date && date.trim() !== '') {
      normalizedDate = this.normalizeDate(date);
      if (!normalizedDate) {
        wx.showToast({ title: '日期格式错误，使用 20260312 或 2026-03-12', icon: 'none' });
        return;
      }
    } else if (rawRecords.length > 0) {
      normalizedDate = rawRecords[rawRecords.length - 1].date;
    }

    if (!truckNum && rawRecords.length > 0) {
      truckNum = rawRecords[rawRecords.length - 1].truckNum;
    } else if (!truckNum && rawRecords.length === 0) {
      wx.showToast({ title: '请填写车号（首条记录不能为空）', icon: 'none' });
      return;
    }

    if (!spec || !weight || !price) {
      wx.showToast({ title: '规格、重量、单价不能为空', icon: 'none' });
      return;
    }
    const weightNum = parseFloat(weight);
    const priceNum = parseFloat(price);
    if (isNaN(weightNum) || isNaN(priceNum)) {
      wx.showToast({ title: '重量和单价必须是数字', icon: 'none' });
      return;
    }
    // 计算总价并应用舍入规则
    const rawTotal = weightNum * priceNum;
    const total = this.roundSpecial(rawTotal);

    const newRecord = {
      date: normalizedDate,
      truckNum,
      spec,
      pieces: pieces || '',
      weight: weightNum,
      price: priceNum,
      total: total
    };
    this.setData({ rawRecords: [...rawRecords, newRecord] }, () => {
      this.updateDisplay();
    });
    this.setData({ form: { date: '', truckNum: '', spec: '', pieces: '', weight: '', price: '' } });
  },

  // 获取分组块（连续且日期、车号、重量、单价完全相同）
  getGroupBlocks() {
    const raw = this.data.rawRecords;
    if (raw.length === 0) return [];
    const blocks = [];
    let i = 0;
    while (i < raw.length) {
      let j = i;
      while (j + 1 < raw.length &&
             raw[j+1].date === raw[i].date &&
             raw[j+1].truckNum === raw[i].truckNum &&
             raw[j+1].weight === raw[i].weight &&
             raw[j+1].price === raw[i].price) {
        j++;
      }
      blocks.push({
        start: i,
        end: j,
        mergeCount: j - i + 1,
        record: raw[i]
      });
      i = j + 1;
    }
    return blocks;
  },

  // 运费重量：每组只计一次重量
  calcDistinctWeightSum() {
    const blocks = this.getGroupBlocks();
    return blocks.reduce((sum, block) => sum + block.record.weight, 0);
  },

  // 总价合计：每组只计一次总价（已经是舍入后的整数）
  calcTotalSum() {
    const blocks = this.getGroupBlocks();
    return blocks.reduce((sum, block) => sum + block.record.total, 0);
  },

  // 更新显示：不合并单元格，但重复组的后续行隐藏重量/单价/总价
  updateDisplay() {
    const rawRecords = this.data.rawRecords;
    if (rawRecords.length === 0) {
      this.setData({ displayRows: [], freightRow: null });
      return;
    }

    const blocks = this.getGroupBlocks();
    const rows = [];
    for (let block of blocks) {
      const blockRecords = rawRecords.slice(block.start, block.end + 1);
      for (let sub = 0; sub < blockRecords.length; sub++) {
        const isFirst = (sub === 0);
        const record = blockRecords[sub];
        rows.push({
          date: this.formatDisplayDate(record.date),
          truckNum: record.truckNum,
          spec: record.spec,
          pieces: record.pieces,
          weight: isFirst ? record.weight : '',
          price: isFirst ? record.price : '',
          total: isFirst ? record.total : '',
          showWeight: isFirst,
          showPrice: isFirst,
          showTotal: isFirst
        });
      }
    }

    const distinctWeight = this.calcDistinctWeightSum();
    const rawFreightTotal = distinctWeight * this.data.freightPrice;
    const freightTotal = this.roundSpecial(rawFreightTotal);
    const freightRow = {
      weight: distinctWeight.toFixed(2),
      price: this.data.freightPrice,
      total: freightTotal
    };
    this.setData({ displayRows: rows, freightRow });
  },

  // 删除最后一条原始记录
  deleteLastRecord() {
    if (this.data.rawRecords.length === 0) {
      wx.showToast({ title: '无记录可删除', icon: 'none' });
      return;
    }
    this.setData({ rawRecords: this.data.rawRecords.slice(0, -1) }, () => {
      this.updateDisplay();
    });
  },

  // 生成图片
  async generateImage() {
    if (this.data.isLoading) return;
    const { displayRows, freightRow, appendix } = this.data;
    if (displayRows.length === 0 && !freightRow) {
      wx.showToast({ title: '没有数据可生成', icon: 'none' });
      return;
    }
    this.setData({ isLoading: true, generatedImage: '' });
    wx.showLoading({ title: '生成图片中...' });

    try {
      const query = wx.createSelectorQuery();
      const canvasNode = await new Promise((resolve, reject) => {
        query.select('#excelCanvas').fields({ node: true, size: true }).exec(res => {
          if (res && res[0]) resolve(res[0]);
          else reject(new Error('获取canvas失败'));
        });
      });
      const canvas = canvasNode.node;
      const ctx = canvas.getContext('2d');

      const fontSize = 12;
      const fontFamily = 'PingFang SC, Microsoft YaHei, sans-serif';
      ctx.font = `${fontSize}px ${fontFamily}`;
      const paddingLR = 8;
      const paddingTB = 6;
      const rowHeight = fontSize + paddingTB * 2 + 4;

      const headers = ['日期', '车号', '规格', '件数', '重量/吨', '单价', '总价'];
      const colCount = headers.length;
      let allRows = [headers];

      for (let row of displayRows) {
        allRows.push([
          row.date,
          row.truckNum,
          row.spec,
          row.pieces,
          row.showWeight ? String(row.weight) : '',
          row.showPrice ? String(row.price) : '',
          row.showTotal ? String(row.total) : ''
        ]);
      }

      if (freightRow) {
        allRows.push(['运费', '运费', '运费', '运费', freightRow.weight, freightRow.price, String(freightRow.total)]);
      }

      const totalSum = this.calcTotalSum() + (freightRow ? freightRow.total : 0);
      const totalSumFixed = totalSum.toFixed(2);
      const blocks = this.getGroupBlocks();
      let latestDate = '';
      const dates = blocks.map(b => b.record.date).filter(d => d);
      if (dates.length) {
        latestDate = this.formatDisplayDate(dates.sort().reverse()[0]);
      }
      const summaryText = `${latestDate || '至今'}止合计结欠货款 ${totalSumFixed} 元`;
      allRows.push([summaryText, null, null, null, null, null, null]);

      if (appendix && appendix.trim()) {
        allRows.push([appendix, null, null, null, null, null, null]);
      }

      // 计算列宽
      const colWidths = new Array(colCount).fill(0);
      for (let i = 0; i < allRows.length; i++) {
        for (let j = 0; j < colCount; j++) {
          let text = allRows[i][j];
          if (text === null || text === undefined) continue;
          text = String(text);
          const w = ctx.measureText(text).width + paddingLR * 2;
          if (w > colWidths[j]) colWidths[j] = w;
        }
      }
      for (let i = 0; i < colWidths.length; i++) {
        colWidths[i] = Math.max(colWidths[i], 60);
      }

      const totalWidth = colWidths.reduce((a, b) => a + b, 0);
      const totalHeight = allRows.length * rowHeight;
      if (totalWidth > 4096 || totalHeight > 4096) throw new Error('表格过大');
      canvas.width = totalWidth;
      canvas.height = totalHeight;

      const drawCtx = canvas.getContext('2d');
      drawCtx.font = `${fontSize}px ${fontFamily}`;
      drawCtx.textBaseline = 'middle';
      drawCtx.textAlign = 'left';
      drawCtx.fillStyle = '#FFFFFF';
      drawCtx.fillRect(0, 0, totalWidth, totalHeight);

      drawCtx.strokeStyle = '#D0D0D0';
      drawCtx.lineWidth = 1;
      for (let i = 0; i <= allRows.length; i++) {
        const y = i * rowHeight;
        drawCtx.beginPath();
        drawCtx.moveTo(0, y);
        drawCtx.lineTo(totalWidth, y);
        drawCtx.stroke();
      }
      let xPos = 0;
      for (let j = 0; j <= colCount; j++) {
        drawCtx.beginPath();
        drawCtx.moveTo(xPos, 0);
        drawCtx.lineTo(xPos, totalHeight);
        drawCtx.stroke();
        if (j < colCount) xPos += colWidths[j];
      }

      let startY = 0;
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        let startX = 0;
        if (i === 0) {
          drawCtx.fillStyle = '#F2F2F2';
          drawCtx.fillRect(0, startY, totalWidth, rowHeight);
          drawCtx.fillStyle = '#000000';
        } else {
          const isFreight = (freightRow && i === (1 + displayRows.length));
          drawCtx.fillStyle = isFreight ? '#FFF9E6' : '#FFFFFF';
          drawCtx.fillRect(0, startY, totalWidth, rowHeight);
          drawCtx.fillStyle = '#000000';
        }
        for (let j = 0; j < colCount; j++) {
          const text = row[j];
          if (text !== null && text !== undefined && text !== '') {
            drawCtx.fillText(String(text), startX + paddingLR, startY + rowHeight / 2);
          }
          startX += colWidths[j];
        }
        startY += rowHeight;
      }

      drawCtx.beginPath();
      drawCtx.lineWidth = 2;
      drawCtx.strokeStyle = '#333333';
      drawCtx.strokeRect(0, 0, totalWidth, totalHeight);

      const tempFilePath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas,
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        });
      });
      if (tempFilePath && typeof tempFilePath === 'string') {
        this.setData({ generatedImage: tempFilePath });
      } else {
        throw new Error('生成的图片路径无效');
      }
      wx.hideLoading();
      wx.showToast({ title: '生成成功', icon: 'success' });
    } catch (err) {
      console.error(err);
      wx.hideLoading();
      wx.showToast({ title: err.message || '生成失败', icon: 'error' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  saveImage() {
    if (!this.data.generatedImage) {
      wx.showToast({ title: '请先生成图片', icon: 'none' });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: this.data.generatedImage,
      success: () => wx.showToast({ title: '保存成功', icon: 'success' }),
      fail: (err) => {
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '提示',
            content: '需要授权保存图片到相册',
            success: res => res.confirm && wx.openSetting()
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'error' });
        }
      }
    });
  },

  previewImage() {
    if (this.data.generatedImage) {
      wx.previewImage({ urls: [this.data.generatedImage] });
    }
  }
});