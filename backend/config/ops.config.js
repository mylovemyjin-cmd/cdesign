// 운영 에이전트 설정 — DT본부 Weekly Task Tracker 전용
// ─────────────────────────────────────────────────────────────
// 범용 엔진(src/ops-agent)에 이 앱의 감시 항목/임계치/조치/알림을 주입한다.
// 엔진은 이 파일만 보고 동작하므로, 이 앱의 도메인 지식은 모두 여기에 모인다.

module.exports = {
  agentName: 'DT Tracker Ops Agent',
  timezone: 'Asia/Seoul',

  monitors: [
    // ── 인프라 헬스 ──────────────────────────────────────
    {
      id: 'api-health',
      description: 'API 서버 헬스체크',
      schedule: '*/1 * * * *',
      collector: {
        type: 'http',
        url: `http://localhost:${process.env.PORT || 4000}/health`,
        timeoutMs: 5000,
      },
      evaluate: (s) =>
        s.latencyMs > 3000 ? { severity: 'warning', summary: `헬스체크 응답 지연 ${s.latencyMs}ms` } : null,
    },
    {
      id: 'db-connectivity',
      description: 'PostgreSQL 연결성',
      schedule: '*/2 * * * *',
      collector: { type: 'postgres', query: 'SELECT 1 AS ok' },
    },
    {
      id: 'error-rate',
      description: '최근 10분 에러 로그 급증',
      schedule: '*/5 * * * *',
      collector: { type: 'logFile', path: 'logs/app.log', sinceMin: 10, match: /ERROR/ },
      allowCollectorError: true, // 로그 파일이 아직 없을 수 있음 → 수집 실패를 인시던트로 취급하지 않음
      evaluate: (s) =>
        s.count > 30 ? { severity: 'warning', summary: `최근 10분 에러 로그 ${s.count}건` } : null,
    },
    {
      id: 'resource',
      description: '프로세스 메모리 사용량',
      schedule: '*/10 * * * *',
      collector: { type: 'process' },
      evaluate: (s) =>
        s.rssMb > 1024 ? { severity: 'warning', summary: `메모리 사용 ${s.rssMb}MB (RSS)` } : null,
    },

    // ── 데이터 품질 (앱 도메인) ──────────────────────────
    {
      id: 'overdue-tasks',
      description: '마감 초과 미완료 과업',
      schedule: '0 9 * * *', // 매일 09:00
      collector: {
        type: 'postgres',
        query: `SELECT COUNT(*)::int AS n FROM tasks
                WHERE due_date < CURRENT_DATE AND status NOT IN ('completed','cancelled')`,
      },
      evaluate: (s) => {
        const n = s.rows?.[0]?.n || 0;
        if (n === 0) return null;
        return { severity: n > 10 ? 'warning' : 'info', summary: `마감 초과 미완료 과업 ${n}건` };
      },
    },
    {
      id: 'stale-high-issues',
      description: '7일 이상 미해결 고위험 이슈',
      schedule: '0 9 * * *',
      collector: {
        type: 'postgres',
        query: `SELECT COUNT(*)::int AS n FROM issues
                WHERE severity = 'high' AND status IN ('open','in_progress')
                  AND created_at < NOW() - INTERVAL '7 days'`,
      },
      evaluate: (s) => {
        const n = s.rows?.[0]?.n || 0;
        return n > 0 ? { severity: 'warning', summary: `7일 이상 미해결 고위험 이슈 ${n}건` } : null;
      },
    },
    {
      id: 'budget-overrun',
      description: '예산 초과 집행 (actual > allocated)',
      schedule: '0 8 * * 1', // 매주 월요일 08:00
      collector: {
        type: 'postgres',
        query: `SELECT COUNT(*)::int AS n FROM budgets
                WHERE allocated > 0 AND actual > allocated AND year = EXTRACT(YEAR FROM CURRENT_DATE)`,
      },
      evaluate: (s) => {
        const n = s.rows?.[0]?.n || 0;
        return n > 0 ? { severity: 'warning', summary: `예산 초과 집행 항목 ${n}건` } : null;
      },
    },
  ],

  remediations: {
    // 데이터 정합성 자동 보정 예시: 본부장에게 마감 초과 요약 알림 재발송
    // (파괴적이지 않은 안전한 조치만 정의)
    'notify-hq-overdue': {
      description: '본부장에게 마감 초과 현황 알림 발송',
      risk: 'low',
      autoApprove: true, // 안전 조치이므로 자동 실행
      run: async (ctx) => {
        const { rows } = await ctx.pool.query(
          `SELECT COUNT(*)::int AS n FROM tasks
           WHERE due_date < CURRENT_DATE AND status NOT IN ('completed','cancelled')`
        );
        const n = rows?.[0]?.n || 0;
        await ctx.pool.query(
          `INSERT INTO notifications (user_id, type, title, message)
           SELECT id, 'ops_alert', '[운영] 마감 초과 과업 점검', $1 FROM users WHERE role = 'HQ'`,
          [`현재 마감 초과 미완료 과업이 ${n}건 있습니다. 대시보드에서 확인하세요.`]
        );
        return `본부장 ${n}건 알림 발송 완료`;
      },
    },
  },

  channels: [
    { type: 'console', minSeverity: 'info' },
    {
      type: 'email',
      minSeverity: 'critical',
      to: (process.env.OPS_ALERT_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    { type: 'webhook', minSeverity: 'warning' /* OPS_WEBHOOK_URL 사용 */ },
    {
      // 인앱 알림: 기존 notifications 테이블에 본부장(HQ) 대상으로 적재
      type: 'custom',
      minSeverity: 'warning',
      deliver: async (payload, ctx) => {
        await ctx.pool.query(
          `INSERT INTO notifications (user_id, type, title, message)
           SELECT id, 'ops_alert', $1, $2 FROM users WHERE role = 'HQ' AND is_active = TRUE`,
          [payload.title.slice(0, 200), payload.message]
        );
      },
    },
  ],
};

// 마감 초과 모니터에 자동조치 연결
module.exports.monitors.find((m) => m.id === 'overdue-tasks').remediation = 'notify-hq-overdue';
