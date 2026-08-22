const EXAMS = {
  TEM4: [
    { part: 'PART I', name: '听写', quantity: '1 篇', max: 10, full: 10, type: 'score' },
    { part: 'PART II', name: '听力理解', max: 20, full: 20, type: 'count' },
    { part: 'PART III', name: '语言知识', max: 20, full: 20, type: 'count' },
    { part: 'PART IV', name: '完形填空', max: 10, full: 10, type: 'count' },
    { part: 'PART V', name: 'Section A 阅读选择题', max: 10, full: 10, type: 'count' },
    { part: '', name: 'Section B 阅读简答题', quantity: '5 题', max: 10, full: 10, type: 'score' },
    { part: 'PART VI', name: '写作', quantity: '1 篇', max: 20, full: 20, type: 'score' }
  ],
  TEM8: [
    { part: 'PART I', name: '听力理解', max: 25, full: 25, type: 'count' },
    { part: 'PART II', name: 'Section A 阅读选择题', max: 14, full: 14, type: 'count' },
    { part: '', name: 'Section B 阅读简答题', quantity: '8 题', max: 16, full: 16, type: 'score' },
    { part: 'PART III', name: '语言知识（改错）', max: 10, full: 10, type: 'count' },
    { part: 'PART IV', name: '汉译英', quantity: '1 篇', max: 15, full: 15, type: 'score' },
    { part: 'PART V', name: '写作', quantity: '1 篇', max: 20, full: 20, type: 'score' }
  ]
}

const STORAGE_KEY = 'tem_simple_scores_v3'

function readSavedData() {
  try {
    const value = wx.getStorageSync(STORAGE_KEY)
    return value && typeof value === 'object' ? value : {}
  } catch (error) {
    return {}
  }
}

function makeRows(exam, saved) {
  return EXAMS[exam].map((item, index) => ({
    ...item,
    index,
    value: saved[`${exam}_${index}`] || '',
    error: false,
    quantityText: item.quantity || (item.type === 'count' ? `${item.max} 题` : '—'),
    placeholder: item.type === 'count' ? '你的正确题数' : '你的预估分值',
    unit: item.type === 'count' ? '' : `/ ${item.max} 分`
  }))
}

Page({
  data: {
    current: 'TEM4',
    formTitle: '专四成绩',
    rows: [],
    focusedIndex: -1,
    resultVisible: false,
    resultError: false,
    resultMessage: '',
    score: 0,
    grade: '',
    summary: ''
  },

  onLoad() {
    this.saved = readSavedData()
    const current = this.saved.current === 'TEM8' ? 'TEM8' : 'TEM4'
    this.showExam(current)
  },

  save() {
    this.saved.current = this.data.current
    try {
      wx.setStorageSync(STORAGE_KEY, this.saved)
    } catch (error) {
      // 存储空间不可用时不影响本次估分。
    }
  },

  showExam(current) {
    this.setData({
      current,
      formTitle: current === 'TEM4' ? '专四成绩' : '专八成绩',
      rows: makeRows(current, this.saved),
      resultVisible: false,
      resultError: false,
      resultMessage: '',
      summary: ''
    })
    this.save()
  },

  switchExam(event) {
    const current = event.currentTarget.dataset.exam
    if (current !== this.data.current) {
      this.showExam(current)
    }
  },

  handleInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const value = event.detail.value
    this.saved[`${this.data.current}_${index}`] = value
    this.setData({
      [`rows[${index}].value`]: value,
      [`rows[${index}].error`]: false
    })
    this.save()
  },

  handleFocus(event) {
    this.setData({ focusedIndex: Number(event.currentTarget.dataset.index) })
  },

  handleBlur() {
    this.setData({ focusedIndex: -1 })
  },

  calculate() {
    let total = 0
    let hasError = false
    const summaryParts = []
    const rows = this.data.rows.map((row) => {
      const raw = String(row.value).trim()
      const value = Number(raw)
      const invalidStep = row.type === 'count' ? !Number.isInteger(value) : !Number.isInteger(value * 2)
      const error = raw === '' || !Number.isFinite(value) || value < 0 || value > row.max || invalidStep

      if (error) {
        hasError = true
      } else {
        const itemScore = row.type === 'count' ? value / row.max * row.full : value
        total += itemScore
        summaryParts.push(`${row.name} ${Math.round(itemScore * 10) / 10} 分`)
      }

      return { ...row, error }
    })

    if (hasError) {
      this.setData({
        rows,
        resultVisible: true,
        resultError: true,
        resultMessage: '请检查标红的输入框，每一项都要填写，没做对可以填 0。',
        summary: ''
      })
      this.scrollToResult()
      return
    }

    const score = Math.round(total * 10) / 10
    const grade = score >= 80 ? '优秀' : score >= 70 ? '良好' : score >= 60 ? '合格' : '未合格'
    this.setData({
      rows,
      resultVisible: true,
      resultError: false,
      resultMessage: '',
      score,
      grade,
      summary: summaryParts.join(' · ')
    })
    this.save()
    this.scrollToResult()
  },

  scrollToResult() {
    wx.nextTick(() => {
      wx.pageScrollTo({
        selector: '#result',
        duration: 300
      })
    })
  },
  getShareTitle() {
    const exam = this.data.current === 'TEM8' ? '专八' : '专四'

    if (this.data.resultVisible && !this.data.resultError) {
      return `我预估${exam}${this.data.score}分（${this.data.grade}）｜你也来测测`
    }

    return `${exam}成绩估分器｜测测你能考多少分`
  },

  onShareAppMessage() {
    return {
      title: this.getShareTitle(),
      path: '/pages/calculator/calculator'
    }
  },

  onShareTimeline() {
    return {
      title: this.getShareTitle()
    }
  }
})
