const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const calculatorSource = readFileSync(
  resolve(__dirname, '../miniprogram/pages/calculator/calculator.js'),
  'utf8'
)

function createPage({ stored, getStorageError, setStorageError } = {}) {
  let definition
  const storageWrites = []
  const scrollCalls = []
  const wx = {
    getStorageSync() {
      if (getStorageError) throw getStorageError
      return stored
    },
    setStorageSync(key, value) {
      if (setStorageError) throw setStorageError
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

  return { page, storageWrites, scrollCalls }
}

function loadPage(options) {
  const harness = createPage(options)
  harness.page.onLoad()
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
  assert.equal(storageWrites.at(-1).value.current, 'TEM4')
})

test('restores the selected exam and its saved values', () => {
  const { page } = loadPage({ stored: { current: 'TEM8', TEM8_0: '18' } })

  assert.equal(page.data.current, 'TEM8')
  assert.equal(page.data.formTitle, '专八成绩')
  assert.equal(page.data.rows.length, 6)
  assert.equal(page.data.rows[0].value, '18')
})

test('falls back safely when storage cannot be read or written', () => {
  const { page } = loadPage({
    getStorageError: new Error('unavailable'),
    setStorageError: new Error('full')
  })

  assert.equal(page.data.current, 'TEM4')
  assert.doesNotThrow(() => page.save())
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

test('input updates the row, clears its error, and persists the value', () => {
  const { page, storageWrites } = loadPage()
  page.data.rows[2].error = true

  page.handleInput({
    currentTarget: { dataset: { index: 2 } },
    detail: { value: '15' }
  })

  assert.equal(page.data.rows[2].value, '15')
  assert.equal(page.data.rows[2].error, false)
  assert.equal(storageWrites.at(-1).value.TEM4_2, '15')
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
  const { page } = loadPage({ stored: { current: 'TEM8' } })
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
