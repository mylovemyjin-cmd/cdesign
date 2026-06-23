-- ============================================
-- 운영 에이전트(Ops Agent) 영속화 테이블 (선택)
-- Migration: 002_ops_agent.sql
-- 이 테이블이 없어도 에이전트는 인메모리로 동작합니다.
-- 재시작 후에도 인시던트/이벤트 이력을 유지하려면 적용하세요.
-- ============================================

-- 운영 이벤트 로그 (감지/조치/복구 등)
CREATE TABLE IF NOT EXISTS ops_events (
  id          SERIAL PRIMARY KEY,
  event_id    VARCHAR(40) UNIQUE NOT NULL,
  monitor_id  VARCHAR(60),
  kind        VARCHAR(40) NOT NULL,   -- incident_open, incident_resolved, remediation_success ...
  severity    VARCHAR(10),            -- info | warning | critical
  message     TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 인시던트 (모니터별 이상 상태)
CREATE TABLE IF NOT EXISTS ops_incidents (
  id            SERIAL PRIMARY KEY,
  incident_id   VARCHAR(40) UNIQUE NOT NULL,
  monitor_id    VARCHAR(60) NOT NULL,
  severity      VARCHAR(10) NOT NULL,
  summary       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',  -- open | resolved
  occurrences   INTEGER DEFAULT 1,
  diagnosis     JSONB,
  opened_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ops_events_created ON ops_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_events_monitor ON ops_events(monitor_id);
CREATE INDEX IF NOT EXISTS idx_ops_incidents_status ON ops_incidents(status);
CREATE INDEX IF NOT EXISTS idx_ops_incidents_monitor ON ops_incidents(monitor_id);
