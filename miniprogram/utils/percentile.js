// Historical national first-attempt pass rates cited by university websites.
// Sources (checked 2026-09-05):
// https://www.nnudy.edu.cn/c132/20231026/i31554.html
// TEM8 cross-check: https://wyxy.nbt.edu.cn/info/1082/7101.htm
// Both rates refer to 2023 national first attempts, not resits or a single school.
// This is a fixed historical reference, not a multi-year average or current ranking.
// No matched empirical mean/spread is available. Assume sigma=12 and infer
// mu=60-sigma*Phi^-1(1-p), so P(score>=60) equals the published pass rate p.
// Display 100*Phi((score-mu)/sigma): the approximate share below the score.
// Round only the final percentage to an integer (0 through 100).
// The untruncated continuous normal model ignores ties and score-boundary masses;
// tails, exam-year differences and subjective score estimates can cause large errors.
// Spread is unvalidated: TEM4 at 70 points exceeds about 85% with sigma=10,
// versus 76% with sigma=15. Integer presentation is not 1% measurement accuracy.
const MODELS = {
  TEM4: { year: 2023, passRate: 0.4856, standardDeviation: 12 },
  TEM8: { year: 2023, passRate: 0.3819, standardDeviation: 12 }
}

const DISCLAIMER = '基于近年全国考试统计数据估算，仅供参考，非官方排名。'

// Standard normal CDF approximation (absolute error below 8e-8).
function normalCdf(z) {
  const x = Math.abs(z)
  const t = 1 / (1 + 0.2316419 * x)
  const tail = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * t *
    (0.319381530 + t * (-0.356563782 + t *
      (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - tail : tail
}

function inverseNormalCdf(probability) {
  let low = -8
  let high = 8
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2
    if (normalCdf(mid) < probability) low = mid
    else high = mid
  }
  return (low + high) / 2
}

// A pass rate alone cannot identify the spread. 12 points is an explicit
// modelling assumption, NOT a published standard deviation or fitted statistic.
const PARAMETERS = Object.keys(MODELS).reduce((parameters, exam) => {
  const model = MODELS[exam]
  parameters[exam] = {
    ...model,
    mean: 60 - model.standardDeviation * inverseNormalCdf(1 - model.passRate)
  }
  return parameters
}, {})

function estimatePercentile(exam, score) {
  if (!Object.prototype.hasOwnProperty.call(PARAMETERS, exam) ||
      typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    return null
  }
  const model = PARAMETERS[exam]
  const exceededPercent = 100 * normalCdf((score - model.mean) / model.standardDeviation)
  return {
    exceededPercent,
    label: `超过约 ${Math.round(exceededPercent)}% 的考生`
  }
}

module.exports = { estimatePercentile, DISCLAIMER }
