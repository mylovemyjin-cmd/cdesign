# 운영·유지보수 에이전트 (Ops Agent)

어떤 Express + (선택)PostgreSQL 웹 애플리케이션에든 붙일 수 있는 **범용 운영 에이전트** 모듈입니다. 운영 담당자가 없어도 시스템 상태를 자동으로 감시하고, 이상을 감지·진단·조치하며, 자연어 질문에 답합니다.

## 핵심 개념

엔진은 앱 도메인을 전혀 모릅니다. **무엇을 감시/조치/알림할지는 전부 설정(config)** 으로 주입합니다.

```
수집(collect) → 판정(evaluate) → [AI 진단] → [자동 조치] → 알림(notify)
                      └─ 정상 복구 시 → 인시던트 해소(resolve) → 복구 알림
```

| 구성 요소 | 역할 |
|---|---|
| **collector** | 외부 상태 관측 → 신호(signal). `http` / `postgres` / `logFile` / `process` / `custom` |
| **evaluate** | 신호 → 발견(finding: `{severity, summary}`) 또는 `null` |
| **diagnose** | Claude 로 근본원인 가설·권고조치 생성 (API 키 없으면 자동 생략) |
| **remediate** | 허용목록(allowlist) 기반 안전 조치. 기본은 승인 후 실행 |
| **notify** | `console` / `webhook` / `email` / `custom` 채널 |

## 드롭인 사용법

```js
const { createOpsAgent } = require('./ops-agent');
const config = require('../config/ops.config'); // 앱별 설정

const ops = createOpsAgent({
  config,
  pool,                              // (선택) pg Pool — postgres collector/영속화에 사용
  logger,                           // (선택) winston 등. 없으면 console
  auth: [authenticate, requireRole], // (선택) 운영 API 보호 미들웨어
});

app.use('/api/ops', ops.router);
ops.start();   // cron 감시 시작 (종료 시 ops.stop())
```

## 설정 스키마

`config.example.js` 를 복사해 작성하세요.

```js
module.exports = {
  agentName: 'My App Ops',
  timezone: 'Asia/Seoul',
  monitors: [
    {
      id: 'api-health',
      description: 'API 헬스체크',
      schedule: '*/1 * * * *',                        // cron
      collector: { type: 'http', url: '...', timeoutMs: 5000 },
      evaluate: (signal) => signal.latencyMs > 3000
        ? { severity: 'warning', summary: '응답 지연' } : null,
      remediation: 'restart-api',                     // 선택
      allowCollectorError: false,                     // true 면 수집 실패를 인시던트로 안 봄
    },
  ],
  remediations: {
    'restart-api': {
      description: 'API 재시작', risk: 'high', autoApprove: false,
      run: async (ctx) => { /* ctx.pool, ctx.logger, ctx.incident, ctx.signal */ return '완료'; },
    },
  },
  channels: [
    { type: 'console', minSeverity: 'info' },
    { type: 'webhook', minSeverity: 'warning', url: process.env.OPS_WEBHOOK_URL },
    { type: 'email',   minSeverity: 'critical', to: ['ops@example.com'] },
    { type: 'custom',  minSeverity: 'warning', deliver: async (payload, ctx) => { /* ... */ } },
  ],
};
```

## REST API (`/api/ops`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/status` | 운영 현황 스냅샷 (모니터 상태, 열린 인시던트, 최근 이벤트) |
| GET | `/incidents?status=open` | 인시던트 목록 |
| GET | `/incidents/:id` | 인시던트 상세 (진단·조치 이력 포함) |
| POST | `/incidents/:id/approve` | 대기 중 자동조치 승인·실행 `{ actionId? }` |
| POST | `/monitors/:id/run` | 모니터 수동 실행 |
| GET | `/events?limit=100` | 최근 이벤트 |
| POST | `/ask` | 자연어 운영 질의 `{ question }` (AI 활성 시) |

## 안전 설계

- **자동 조치는 allowlist만 실행** — `config.remediations` 에 정의된 액션만 가능
- **기본은 사람 승인** — `autoApprove: true` 를 명시한 조치만 자동 실행
- **AI 실패 격리** — `ANTHROPIC_API_KEY` 미설정/호출 실패해도 감시는 계속 동작
- **영속화 best-effort** — ops 테이블 없어도 인메모리로 동작 (`database/migrations/002_ops_agent.sql` 적용 시 이력 유지)

## 환경 변수

| 변수 | 설명 |
|---|---|
| `OPS_AGENT_ENABLED` | `true` 일 때 활성화 |
| `OPS_AGENT_MODEL` | 진단/질의 모델 (기본 `claude-opus-4-8`) |
| `ANTHROPIC_API_KEY` | AI 진단·질의용 (없으면 해당 기능만 비활성) |
| `OPS_WEBHOOK_URL` | 웹훅 채널 기본 URL |
| `OPS_ALERT_EMAILS` | 이메일 채널 수신자 (쉼표 구분) |
| `SMTP_*` | 이메일 발송 설정 (nodemailer) |
