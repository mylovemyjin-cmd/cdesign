// 자동 조치 (Remediation)
// ─────────────────────────────────────────────────────────────
// 안전 원칙:
//  1. config.remediations 에 정의된 액션만 실행 가능 (allowlist)
//  2. 기본은 autoApprove=false → 사람 승인(API) 후에만 실행
//  3. 모든 실행은 인시던트 이력에 기록
//
// 액션 정의 예:
//   'restart-worker': {
//     description: '워커 프로세스 재시작',
//     risk: 'high',          // 참고용 라벨
//     autoApprove: false,    // true 면 감지 즉시 자동 실행
//     run: async (ctx) => { ... 조치 ...; return '재시작 완료'; },
//   }

async function executeRemediation({ actionId, remediations, incident, signal, ctx }) {
  const action = remediations && remediations[actionId];
  if (!action) {
    return { ok: false, error: `허용되지 않은 조치: ${actionId}` };
  }
  if (typeof action.run !== 'function') {
    return { ok: false, error: `조치 ${actionId} 에 run() 함수가 없습니다.` };
  }
  const startedAt = new Date().toISOString();
  try {
    const result = await action.run({ ...ctx, incident, signal });
    const record = {
      actionId,
      description: action.description,
      ok: true,
      result: typeof result === 'string' ? result : JSON.stringify(result ?? 'ok'),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    return { ok: true, record };
  } catch (err) {
    const record = {
      actionId,
      description: action.description,
      ok: false,
      error: err.message,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    return { ok: false, error: err.message, record };
  }
}

module.exports = { executeRemediation };
