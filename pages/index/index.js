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
    generatedImage: '',
    isLoading: false
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`form.${field}`]: value
    });
  },

  addRecord() {
    let { date, truckNum, spec, pieces, weight, price } = this.data.form;
    const rawRecords = this.data.rawRecords;

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
    const total = (weightNum * priceNum).toFixed(2);
    const piecesValue = pieces || '';

    const newRecord = {
      date: date || '',
      truckNum,
      spec,
      pieces: piecesValue,
      weight: weightNum,
      price: priceNum,
      total
    };
    const newRawRecords = [...rawRecords, newRecord];
    this.setData({ rawRecords: newRawRecords }, () => {
      this.updateDisplay();
    });
    this.setData({
      form: { date: '', truckNum: '', spec: '', pieces: '', weight: '', price: '' }
    });
  },

  updateDisplay() {
    const rawRecords = this.data.rawRecords;
    if (rawRecords.length === 0) {
      this.setData({ displayRows: [] });
      return;
    }

    // 1. 找出合并块：连续且 date, truckNum, weight, price 都相同的记录
    const blocks = []; // 每个元素 { startIndex, endIndex, mergeCount, record }
    let i = 0;
    while (i < rawRecords.length) {
      let j = i;
      while (j + 1 < rawRecords.length &&
             rawRecords[j+1].date === rawRecords[i].date &&
             rawRecords[j+1].truckNum === rawRecords[i].truckNum &&
             rawRecords[j+1].weight === rawRecords[i].weight &&
             rawRecords[j+1].price === rawRecords[i].price) {
        j++;
      }
      blocks.push({
        startIndex: i,
        endIndex: j,
        mergeCount: j - i + 1,
        record: rawRecords[i]
      });
      i = j + 1;
    }

    // 2. 根据每个块生成视觉行
    const rows = [];
    for (let block of blocks) {
      const { startIndex, endIndex, mergeCount, record } = block;
      for (let sub = 0; sub < mergeCount; sub++) {
        const originalRecord = rawRecords[startIndex + sub];
        const isFirst = (sub === 0);
        rows.push({
          date: isFirst ? record.date : '',
          truckNum: isFirst ? record.truckNum : '',
          spec: originalRecord.spec,
          pieces: originalRecord.pieces,
          weight: isFirst ? record.weight : '',
          price: isFirst ? record.price : '',
          total: isFirst ? record.total : '',
          showDate: isFirst,
          showTruckNum: isFirst,
          showWeight: isFirst,
          showPrice: isFirst,
          showTotal: isFirst,
          dateRowspan: isFirst ? mergeCount : 0,
          truckNumRowspan: isFirst ? mergeCount : 0,
          weightRowspan: isFirst ? mergeCount : 0,
          priceRowspan: isFirst ? mergeCount : 0,
          totalRowspan: isFirst ? mergeCount : 0
        });
      }
    }
    this.setData({ displayRows: rows });
  },

  deleteLastRecord() {
    let rawRecords = this.data.rawRecords;
    if (rawRecords.length === 0) {
      wx.showToast({ title: '无记录可删除', icon: 'none' });
      return;
    }
    rawRecords.pop();
    this.setData({ rawRecords }, () => {
      this.updateDisplay();
    });
  },

  async generateImage() {
    if (this.data.isLoading) return;
    const { displayRows } = this.data;
    if (displayRows.length === 0) {
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
        const rowCells = [];
        if (row.showDate) rowCells.push(row.date); else rowCells.push(null);
        if (row.showTruckNum) rowCells.push(row.truckNum); else rowCells.push(null);
        rowCells.push(row.spec);
        rowCells.push(row.pieces);
        if (row.showWeight) rowCells.push(String(row.weight)); else rowCells.push(null);
        if (row.showPrice) rowCells.push(String(row.price)); else rowCells.push(null);
        if (row.showTotal) rowCells.push(String(row.total)); else rowCells.push(null);
        allRows.push(rowCells);
      }

      const colWidths = new Array(colCount).fill(0);
      for (let i = 0; i < allRows.length; i++) {
        for (let j = 0; j < colCount; j++) {
          const text = allRows[i][j];
          if (text !== null && text !== undefined) {
            const textWidth = ctx.measureText(String(text)).width;
            const cellWidth = textWidth + paddingLR * 2;
            if (cellWidth > colWidths[j]) colWidths[j] = cellWidth;
          }
        }
      }
      for (let i = 0; i < colWidths.length; i++) {
        colWidths[i] = Math.max(colWidths[i], 60);
      }

      const totalWidth = colWidths.reduce((a, b) => a + b, 0);
      const totalHeight = allRows.length * rowHeight;
      if (totalWidth > 4096 || totalHeight > 4096) throw new Error('表格尺寸过大');
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
          drawCtx.fillRect(0, 0, totalWidth, rowHeight);
          drawCtx.fillStyle = '#000000';
        } else {
          drawCtx.fillStyle = '#FFFFFF';
          drawCtx.fillRect(0, startY, totalWidth, rowHeight);
          drawCtx.fillStyle = '#000000';
        }
        for (let j = 0; j < colCount; j++) {
          const text = row[j];
          if (text !== null && text !== undefined && text !== '') {
            const textX = startX + paddingLR;
            const textY = startY + rowHeight / 2;
            drawCtx.fillText(String(text), textX, textY);
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
        wx.canvasToTempFilePath({ canvas, success: res => resolve(res.tempFilePath), fail: reject });
      });
      this.setData({ generatedImage: tempFilePath });
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