-- ============================================
-- 초기 데이터 시드
-- Seed: 001_initial_data.sql
-- ============================================

-- 팀 데이터
INSERT INTO teams (name, group_name) VALUES
  ('Digital Innovation',    'Digital Strategy & Solutions'),
  ('ERP',                   'Digital Strategy & Solutions'),
  ('Application',           'Digital Strategy & Solutions'),
  ('Infra & Security',      'Digital Strategy & Solutions'),
  ('EU DT',                 'RBG DT & Infosec'),
  ('APAC & China DT',       'RBG DT & Infosec'),
  ('Americas DT',           'RBG DT & Infosec'),
  ('Information Security',  'RBG DT & Infosec');

-- 본부장 계정 (초기 관리자)
INSERT INTO users (employee_id, name, email, role, team_id) VALUES
  ('HQ001', 'DT본부장', 'dt-head@hanon.com', 'HQ', NULL);

-- 전략 과제 예시
INSERT INTO strategic_initiatives (code, name, owner_id, year, status) VALUES
  ('HGVS',   'HGVS 통합 플랫폼 구축',   1, 2026, 'active'),
  ('DT2026', 'DT혁신 2026 로드맵 실행', 1, 2026, 'active');

-- KPI 예시
INSERT INTO kpis (initiative_id, name, unit, target) VALUES
  (1, 'Boardroom Dashboard 구축 완료율', '%',   100),
  (1, '시스템 연동 모듈 수',             '건',  5),
  (2, 'AI 리터러시 향상율',              '%',   80),
  (2, '디지털 전환 과제 완료율',         '%',   75);
