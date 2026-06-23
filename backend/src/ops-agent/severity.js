// 심각도 등급 — 범용 (앱 비종속)
// info < warning < critical
const SEVERITY_ORDER = { info: 1, warning: 2, critical: 3 };

function severityRank(level) {
  return SEVERITY_ORDER[level] || 0;
}

// a 가 b 이상인지 (a >= b)
function meetsMinSeverity(level, minLevel) {
  return severityRank(level) >= severityRank(minLevel);
}

module.exports = { SEVERITY_ORDER, severityRank, meetsMinSeverity };
