// 운영 에이전트 — 모듈 진입점
// ─────────────────────────────────────────────────────────────
// 어떤 Express + (선택)PostgreSQL 웹앱에든 드롭인할 수 있는 범용 운영 에이전트.
//
// 사용 예:
//   const { createOpsAgent } = require('./ops-agent');
//   const ops = createOpsAgent({ config, pool, logger, auth: [authenticate] });
//   app.use('/api/ops', ops.router);
//   ops.start();   // cron 감시 시작
//
// config 스키마는 ./config.example.js 참고.

const { OpsStore } = require('./store');
const { OpsEngine } = require('./engine');
const { createRouter } = require('./routes');

function createOpsAgent({ config, pool, logger, auth = [] }) {
  if (!config) throw new Error('createOpsAgent: config 가 필요합니다.');

  const store = new OpsStore({ pool, logger });
  const engine = new OpsEngine({ config, store, pool, logger });
  const router = createRouter({ engine, store, auth });

  return {
    engine,
    store,
    router,
    start: () => engine.start(),
    stop: () => engine.stop(),
  };
}

module.exports = { createOpsAgent };
