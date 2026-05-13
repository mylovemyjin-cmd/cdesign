-- ============================================
-- DT Tracker 데이터베이스 스키마
-- Migration: 001_initial_schema.sql
-- ============================================

-- 팀 테이블
CREATE TABLE teams (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  group_name  VARCHAR(100),           -- 기능그룹 (Digital Strategy / RBG DT)
  leader_id   INTEGER,                -- FK → users.id (후에 설정)
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자 테이블
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  employee_id VARCHAR(20) UNIQUE NOT NULL,  -- 사번
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(200) UNIQUE NOT NULL,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('HQ','TL','MB','VW')),
  team_id     INTEGER REFERENCES teams(id),
  is_active   BOOLEAN DEFAULT TRUE,
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 팀 리더 FK 설정
ALTER TABLE teams ADD CONSTRAINT fk_team_leader
  FOREIGN KEY (leader_id) REFERENCES users(id);

-- 전략 과제 테이블 (Level 1)
CREATE TABLE strategic_initiatives (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,  -- 예: HGVS, DT2026
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  owner_id    INTEGER REFERENCES users(id),
  year        INTEGER NOT NULL,
  status      VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','completed','paused')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- KPI 테이블
CREATE TABLE kpis (
  id              SERIAL PRIMARY KEY,
  initiative_id   INTEGER REFERENCES strategic_initiatives(id),
  name            VARCHAR(200) NOT NULL,
  unit            VARCHAR(50),              -- %, 건, 억원 등
  target          NUMERIC(15,2) NOT NULL,
  current_value   NUMERIC(15,2) DEFAULT 0,
  achievement_pct NUMERIC(5,2) GENERATED ALWAYS AS
                  (CASE WHEN target = 0 THEN 0 ELSE current_value / target * 100 END) STORED,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 예산 테이블
CREATE TABLE budgets (
  id            SERIAL PRIMARY KEY,
  team_id       INTEGER REFERENCES teams(id),
  initiative_id INTEGER REFERENCES strategic_initiatives(id),
  year          INTEGER NOT NULL,
  quarter       INTEGER CHECK (quarter BETWEEN 1 AND 4),
  allocated     NUMERIC(15,2) NOT NULL DEFAULT 0,  -- 할당 예산
  actual        NUMERIC(15,2) NOT NULL DEFAULT 0,  -- 실제 집행
  description   VARCHAR(300),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 과업 테이블
CREATE TABLE tasks (
  id              SERIAL PRIMARY KEY,
  team_id         INTEGER NOT NULL REFERENCES teams(id),
  owner_id        INTEGER NOT NULL REFERENCES users(id),
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  category        VARCHAR(50),              -- 전략과제, 운영, 프로젝트
  initiative_id   INTEGER REFERENCES strategic_initiatives(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'on_track'
                  CHECK (status IN ('on_track','at_risk','delayed','completed','cancelled')),
  priority        VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  is_highlight    BOOLEAN DEFAULT FALSE,
  quantified_result VARCHAR(300),
  budget_impact   NUMERIC(15,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 주간 보고 테이블
CREATE TABLE weekly_reports (
  id              SERIAL PRIMARY KEY,
  task_id         INTEGER NOT NULL REFERENCES tasks(id),
  week_label      VARCHAR(20) NOT NULL,     -- 예: 2026-W20
  week_start      DATE NOT NULL,
  this_week       TEXT,                     -- 금주 실적
  next_plan       TEXT,                     -- 차주 계획
  issue           TEXT,                     -- 이슈
  budget_impact   TEXT,                     -- 예산 영향
  kpi_update      TEXT,                     -- KPI 업데이트
  ai_summary      TEXT,                     -- AI 정제 결과
  submitted_by    INTEGER REFERENCES users(id),
  submitted_at    TIMESTAMPTZ,
  is_locked       BOOLEAN DEFAULT FALSE,    -- 팀장 제출(Lock)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 이슈/리스크 테이블
CREATE TABLE issues (
  id            SERIAL PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  reporter_id   INTEGER NOT NULL REFERENCES users(id),
  task_id       INTEGER REFERENCES tasks(id),
  type          VARCHAR(20) NOT NULL CHECK (type IN ('issue','risk','request')),
  title         VARCHAR(300) NOT NULL,
  description   TEXT,
  severity      VARCHAR(10) DEFAULT 'medium' CHECK (severity IN ('high','medium','low')),
  status        VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  resolution    TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 변경 이력 테이블 (Audit Log)
CREATE TABLE change_logs (
  id          SERIAL PRIMARY KEY,
  table_name  VARCHAR(50) NOT NULL,
  record_id   INTEGER NOT NULL,
  actor_id    INTEGER REFERENCES users(id),
  action      VARCHAR(20) NOT NULL CHECK (action IN ('create','update','delete','lock','unlock')),
  field_name  VARCHAR(100),
  old_value   TEXT,
  new_value   TEXT,
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 알림 테이블
CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        VARCHAR(30) NOT NULL,   -- deadline, status, issue, update
  title       VARCHAR(200) NOT NULL,
  message     TEXT,
  ref_table   VARCHAR(50),
  ref_id      INTEGER,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_tasks_team ON tasks(team_id);
CREATE INDEX idx_tasks_owner ON tasks(owner_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_weekly_reports_task ON weekly_reports(task_id);
CREATE INDEX idx_weekly_reports_week ON weekly_reports(week_label);
CREATE INDEX idx_change_logs_record ON change_logs(table_name, record_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
