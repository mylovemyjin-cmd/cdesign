// 운영 에이전트 설정 예시 (범용)
// ─────────────────────────────────────────────────────────────
// 이 파일을 복사해 앱에 맞게 수정하세요. 엔진은 이 설정만 보고 동작하며
// 앱 도메인 지식(점검 대상, 임계치, 조치, 알림)은 전부 여기에 둡니다.
//
// 구성 요소:
//   monitors[]     감시 항목. collector(수집) + schedule(cron) + evaluate(판정) [+ remediation]
//   remediations{} 자동 조치 정의 (allowlist). 기본 autoApprove=false → 승인 후 실행
//   channels[]     알림 채널 (console/webhook/email/custom)

module.exports = {
  agentName: 'Web App Ops Agent',
  timezone: 'Asia/Seoul',

  monitors: [
    {
      id: 'api-health',
      description: 'API 서버 헬스체크',
      schedule: '*/1 * * * *', // 매 1분
      collector: { type: 'http', url: 'http://localhost:4000/health', timeoutMs: 5000 },
      // evaluate: 신호 → 발견(finding) | null. 수집 실패는 엔진이 자동으로 critical 처리.
      evaluate: (s) => (s.latencyMs > 3000
        ? { severity: 'warning', summary: `응답 지연 ${s.latencyMs}ms` }
        : null),
      remediation: 'restart-api', // 선택: 감지 시 연결할 조치
    },
    {
      id: 'db-connectivity',
      description: 'DB 연결성',
      schedule: '*/2 * * * *',
      collector: { type: 'postgres', query: 'SELECT 1' },
    },
    {
      id: 'error-rate',
      description: '최근 5분 에러 로그 급증',
      schedule: '*/5 * * * *',
      collector: { type: 'logFile', path: 'logs/app.log', sinceMin: 5, match: /ERROR/ },
      evaluate: (s) => (s.count > 20
        ? { severity: 'warning', summary: `최근 5분 에러 ${s.count}건` }
        : null),
    },
    {
      id: 'resource',
      description: '프로세스 자원 사용량',
      schedule: '*/5 * * * *',
      collector: { type: 'process' },
      evaluate: (s) => (s.rssMb > 1024
        ? { severity: 'warning', summary: `메모리 사용 ${s.rssMb}MB` }
        : null),
    },
  ],

  remediations: {
    'restart-api': {
      description: 'API 프로세스 재시작 (프로세스 매니저가 자동 부활시킨다고 가정)',
      risk: 'high',
      autoApprove: false, // 운영자 승인 후 실행
      run: async (ctx) => {
        ctx.logger.warn('[OpsAgent] restart-api 조치 실행 — process.exit 예정');
        // 실제 환경에서는 pm2/k8s 등이 프로세스를 재기동. 데모에선 안전하게 로깅만.
        return '재시작 신호 전송 (데모: 실제 종료 생략)';
      },
    },
  },

  channels: [
    { type: 'console', minSeverity: 'info' },
    { type: 'webhook', minSeverity: 'warning' /* url: process.env.OPS_WEBHOOK_URL */ },
    { type: 'email', minSeverity: 'critical', to: ['ops@example.com'] },
  ],
};
