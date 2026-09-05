const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const calculatorSource = readFileSync(
  resolve(__dirname, '../miniprogram/pages/calculator/calculator.js'),
  'utf8'
)

function createPage({ stored } = {}) {
  let definition
  const storageWrites = []
  const storageReads = []
  const scrollCalls = []
  const wx = {
    getStorageSync(key) {
      storageReads.push(key)
      return stored
    },
    setStorageSync(key, value) {
      storageWrites.push({ key, value: { ...value } })
    },
    nextTick(callback) {
      callback()
    },
    pageScrollTo(options) {
      scrollCalls.push(options)
    }
  }

  vm.runInNewContext(calculatorSource, {
    require: createRequire(resolve(__dirname, '../miniprogram/pages/calculator/calculator.js')),
    Page(pageDefinition) {
      definition = pageDefinition
    },
    wx
  })

  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(update) {
      for (const [path, value] of Object.entries(update)) {
        const match = /^rows\[(\d+)]\.(\w+)$/.exec(path)
        if (match) {
          this.data.rows[Number(match[1])][match[2]] = value
        } else {
          this.data[path] = value
        }
      }
    }
  }

  return { page, storageWrites, storageReads, scrollCalls }
}

function loadPage(options) {
  const harness = createPage(options)
  harness.page.onLoad()
  harness.page.onShow?.()
  return harness
}

function fillRows(page, values) {
  page.data.rows = page.data.rows.map((row, index) => ({
    ...row,
    value: String(values[index])
  }))
}

test('loads TEM4 by default and builds its seven score rows', () => {
  const { page, storageWrites } = loadPage()

  assert.equal(page.data.current, 'TEM4')
  assert.equal(page.data.formTitle, '专四成绩')
  assert.equal(page.data.rows.length, 7)
  assert.equal(page.data.rows[1].quantityText, '20 题')
  assert.equal(page.data.rows[1].placeholder, '你的正确题数')
  assert.equal(page.data.rows[0].unit, '/ 10 分')
  assert.equal(storageWrites.length, 0)
})

test('new sessions ignore legacy stored scores and open both exams empty', () => {
  const { page, storageReads, storageWrites } = loadPage({
    stored: { current: 'TEM8', TEM4_0: '9', TEM8_0: '18' }
  })
  assert.equal(page.data.current, 'TEM4')
  assert.ok(page.data.rows.every((row) => row.value === ''))
  page.showExam('TEM8')
  assert.equal(page.data.rows.length, 6)
  assert.ok(page.data.rows.every((row) => row.value === ''))
  assert.equal(storageReads.length, 0)
  assert.equal(storageWrites.length, 0)
})

function input(page, index, value) {
  page.handleInput({ currentTarget: { dataset: { index } }, detail: { value } })
}

function switchTo(page, exam) {
  page.switchExam({ currentTarget: { dataset: { exam } } })
}

test('switching exams retains separate in-memory inputs including zero and cleared fields', () => {
  const { page, storageReads, storageWrites } = loadPage()
  input(page, 0, '8.5')
  input(page, 1, '0')
  switchTo(page, 'TEM8')
  assert.equal(page.data.rows[0].value, '')
  input(page, 0, '18')
  switchTo(page, 'TEM4')
  assert.equal(page.data.rows[0].value, '8.5')
  assert.equal(page.data.rows[1].value, '0')
  input(page, 0, '')
  switchTo(page, 'TEM8')
  assert.equal(page.data.rows[0].value, '18')
  switchTo(page, 'TEM4')
  assert.equal(page.data.rows[0].value, '')
  assert.equal(page.data.rows[1].value, '0')
  assert.equal(storageReads.length, 0)
  assert.equal(storageWrites.length, 0)
})

for (const exam of ['TEM4', 'TEM8']) {
  for (const action of ['cancel share', 'complete share', 'timeline share', 'background']) {
    test(`${exam} preserves all session state after ${action} and repeated returns`, () => {
      const { page, storageReads, storageWrites } = loadPage()
      const otherExam = exam === 'TEM4' ? 'TEM8' : 'TEM4'
      switchTo(page, otherExam)
      input(page, 0, '8')
      switchTo(page, exam)
      page.data.rows.forEach((row, index) => input(page, index, String(row.max)))
      input(page, 0, '0')
      page.calculate()
      const before = JSON.stringify({ data: page.data, saved: page.saved })
      const title = page.getShareTitle()
      for (let i = 0; i < 3; i += 1) {
        // Success and cancellation have the same page hide/show lifecycle;
        // neither requires a share outcome callback to restore the state.
        if (action === 'timeline share') {
          assert.equal(page.onShareTimeline().title, title)
        } else if (action !== 'background') {
          const share = page.onShareAppMessage()
          assert.equal(share.title, title)
          assert.equal(share.path, '/pages/calculator/calculator')
        }
        page.onHide?.()
        page.onShow?.()
        assert.equal(JSON.stringify({ data: page.data, saved: page.saved }), before)
      }
      assert.equal(page.data.resultVisible, true)
      assert.ok(page.data.percentile.label.startsWith('超过约 '))
      switchTo(page, otherExam)
      assert.equal(page.data.rows[0].value, '8')
      switchTo(page, exam)
      assert.equal(page.data.rows[0].value, '0')
      page.calculate()
      assert.equal(page.getShareTitle(), title)
      assert.equal(storageReads.length, 0)
      assert.equal(storageWrites.length, 0)
    })
  }
}

test('a fresh launch starts empty after a previous session calculated and shared', () => {
  const { page, storageWrites } = loadPage()
  for (const exam of ['TEM4', 'TEM8']) {
    switchTo(page, exam)
    page.data.rows.forEach((row, index) => input(page, index, String(row.max)))
    page.calculate()
    page.onShareAppMessage()
  }
  page.onUnload?.()
  assert.equal(storageWrites.length, 0)

  const fresh = loadPage({ stored: { current: 'TEM8', TEM4_0: '9', TEM8_0: '18' } }).page
  assert.equal(fresh.data.current, 'TEM4')
  assert.equal(fresh.data.score, 0)
  assert.equal(fresh.data.grade, '')
  assert.equal(fresh.data.resultVisible, false)
  assert.equal(fresh.data.resultError, false)
  assert.equal(fresh.data.resultMessage, '')
  assert.equal(fresh.data.summary, '')
  assert.equal(fresh.data.percentile, null)
  assert.equal(fresh.data.focusedIndex, -1)
  assert.equal(fresh.onShareAppMessage().title, '专四成绩估分器｜测测你能考多少分')
  assert.ok(fresh.data.rows.every((row) => row.value === '' && !row.error))
  switchTo(fresh, 'TEM8')
  assert.ok(fresh.data.rows.every((row) => row.value === '' && !row.error))
  fresh.data.rows.forEach((row, index) => input(fresh, index, String(row.max)))
  fresh.calculate()
  assert.equal(fresh.data.score, 100)
  assert.equal(fresh.data.percentile.label, '超过约 100% 的考生')
  assert.equal(fresh.onShareAppMessage().title, '我预估专八100分（优秀）｜你也来测测')
})

test('switching exam resets result state and ignores the active tab', () => {
  const { page } = loadPage()
  page.data.resultVisible = true
  page.data.summary = 'old result'

  page.switchExam({ currentTarget: { dataset: { exam: 'TEM8' } } })
  assert.equal(page.data.current, 'TEM8')
  assert.equal(page.data.resultVisible, false)
  assert.equal(page.data.summary, '')

  const rows = page.data.rows
  page.switchExam({ currentTarget: { dataset: { exam: 'TEM8' } } })
  assert.equal(page.data.rows, rows)
})

test('input updates the row, clears its error, and keeps the value in memory', () => {
  const { page, storageWrites } = loadPage()
  page.data.rows[2].error = true

  page.handleInput({
    currentTarget: { dataset: { index: 2 } },
    detail: { value: '15' }
  })

  assert.equal(page.data.rows[2].value, '15')
  assert.equal(page.data.rows[2].error, false)
  assert.equal(page.saved.TEM4_2, '15')
  assert.equal(storageWrites.length, 0)
})

test('focus and blur track the active row', () => {
  const { page } = loadPage()

  page.handleFocus({ currentTarget: { dataset: { index: 3 } } })
  assert.equal(page.data.focusedIndex, 3)
  page.handleBlur()
  assert.equal(page.data.focusedIndex, -1)
})

test('rejects blank, non-numeric, negative, over-maximum, and invalid-step values', () => {
  const { page, scrollCalls } = loadPage()
  fillRows(page, ['', 'abc', -1, 11, 1.5, 7.3, 0])

  page.calculate()

  assert.equal(page.data.resultVisible, true)
  assert.equal(page.data.resultError, true)
  assert.deepEqual(
    Array.from(page.data.rows, (row) => row.error),
    [true, true, true, true, true, true, false]
  )
  assert.match(page.data.resultMessage, /每一项都要填写/)
  assert.equal(page.data.summary, '')
  assert.equal(scrollCalls.length, 1)
  assert.equal(scrollCalls[0].selector, '#result')
  assert.equal(scrollCalls[0].duration, 300)
})

test('calculates a TEM4 score, summary, and excellent grade', () => {
  const { page, scrollCalls } = loadPage()
  fillRows(page, [8.5, 18, 16, 9, 8, 7.5, 17])

  page.calculate()

  assert.equal(page.data.score, 84)
  assert.equal(page.data.grade, '优秀')
  assert.equal(page.data.resultError, false)
  assert.match(page.data.summary, /听写 8.5 分/)
  assert.match(page.data.summary, /写作 17 分/)
  assert.equal(scrollCalls.length, 1)
})

test('calculates TEM8 totals and rounds to one decimal place', () => {
  const { page } = loadPage()
  switchTo(page, 'TEM8')
  fillRows(page, [20, 10, 12.5, 8, 11, 16])

  page.calculate()

  assert.equal(page.data.score, 77.5)
  assert.equal(page.data.grade, '良好')
})

test('assigns grades at each boundary', () => {
  const cases = [
    { score: 59.5, grade: '未合格' },
    { score: 60, grade: '合格' },
    { score: 70, grade: '良好' },
    { score: 80, grade: '优秀' }
  ]

  for (const { score, grade } of cases) {
    const { page } = loadPage()
    fillRows(page, [score, 0, 0, 0, 0, 0, 0])
    page.data.rows[0].max = 100
    page.calculate()
    assert.equal(page.data.grade, grade, `expected ${score} to be ${grade}`)
  }
})

test('percentile follows the calculated exam and clears on switches and errors', () => {
  const { page } = loadPage()
  assert.equal(page.data.percentile, null)
  fillRows(page, [6, 12, 12, 6, 6, 6, 12])
  page.calculate()
  assert.equal(page.data.score, 60)
  assert.equal(page.data.percentile.label, '超过约 51% 的考生')
  assert.equal(page.data.percentileDisclaimer, '基于近年全国考试统计数据估算，仅供参考，非官方排名。')

  page.switchExam({ currentTarget: { dataset: { exam: 'TEM8' } } })
  assert.equal(page.data.percentile, null)
  fillRows(page, [15, 8, 10, 6, 9, 12])
  page.calculate()
  assert.equal(page.data.score, 60)
  assert.equal(page.data.percentile.label, '超过约 62% 的考生')
  fillRows(page, ['', 8, 10, 6, 9, 12])
  page.calculate()
  assert.equal(page.data.resultError, true)
  assert.equal(page.data.percentile, null)
})

test('percentile leaves direct and timeline share titles and paths unchanged', () => {
  for (const exam of ['TEM4', 'TEM8']) {
    const { page } = loadPage()
    switchTo(page, exam)
    const name = exam === 'TEM4' ? '专四' : '专八'
    const generic = `${name}成绩估分器｜测测你能考多少分`
    assert.equal(page.onShareAppMessage().title, generic)
    fillRows(page, page.data.rows.map((row) => row.max))
    page.calculate()
    assert.equal(page.data.score, 100)
    assert.equal(page.onShareAppMessage().title, `我预估${name}100分（优秀）｜你也来测测`)
    assert.equal(page.onShareAppMessage().path, '/pages/calculator/calculator')
    assert.equal(page.onShareTimeline().title, page.onShareAppMessage().title)
    page.data.rows[0].value = ''
    page.calculate()
    assert.equal(page.onShareAppMessage().title, generic)
    assert.equal(page.onShareTimeline().title, generic)
  }
})
