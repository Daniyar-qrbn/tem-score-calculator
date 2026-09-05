const assert = require('node:assert/strict')
const test = require('node:test')
const { estimatePercentile } = require('../miniprogram/utils/percentile')

test('60 points reproduces each national pass-rate anchor', () => {
  assert.ok(Math.abs(estimatePercentile('TEM4', 60).exceededPercent - 51.44) < 0.0001)
  assert.ok(Math.abs(estimatePercentile('TEM8', 60).exceededPercent - 61.81) < 0.0001)
  assert.equal(estimatePercentile('TEM4', 60).label, '超过约 51% 的考生')
  assert.equal(estimatePercentile('TEM8', 60).label, '超过约 62% 的考生')
})

test('70-point estimates match independently calculated normal-CDF values', () => {
  assert.ok(Math.abs(estimatePercentile('TEM4', 70).exceededPercent - 80.77) < 0.02)
  assert.ok(Math.abs(estimatePercentile('TEM8', 70).exceededPercent - 87.16) < 0.02)
})

test('both models are bounded and monotonic across all valid half-point scores', () => {
  for (const exam of ['TEM4', 'TEM8']) {
    let previous = 0
    for (let score = 0; score <= 100; score += 0.5) {
      const result = estimatePercentile(exam, score)
      assert.ok(Number.isFinite(result.exceededPercent))
      assert.ok(result.exceededPercent >= previous && result.exceededPercent <= 100)
      assert.match(result.label, /^超过约 \d+% 的考生$/)
      previous = result.exceededPercent
    }
    assert.equal(estimatePercentile(exam, 0).label, '超过约 0% 的考生')
    assert.equal(estimatePercentile(exam, 100).label, '超过约 100% 的考生')
  }
})

test('invalid scores and unsupported exams cannot produce a ranking', () => {
  for (const score of [NaN, Infinity, -Infinity, -0.5, 100.5, '', '60', null, undefined]) {
    assert.equal(estimatePercentile('TEM4', score), null)
  }
  for (const exam of ['CET4', '', 'toString', '__proto__', null]) {
    assert.equal(estimatePercentile(exam, 60), null)
  }
})
