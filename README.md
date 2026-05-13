# DT본부 Weekly Task Tracker

AI-Powered Team & HQ Reporting System for Hanon Systems DT HQ

## 프로젝트 구조

```
cdesign/
├── frontend/          # React 프론트엔드
│   └── src/
│       ├── components/  # 공통 컴포넌트
│       ├── pages/       # 화면별 페이지
│       ├── hooks/       # 커스텀 훅
│       ├── utils/       # 유틸리티
│       └── styles/      # 글로벌 스타일
├── backend/           # Node.js + Express 백엔드
│   └── src/
│       ├── routes/      # API 라우터
│       ├── controllers/ # 비즈니스 로직
│       ├── middleware/  # 인증/권한 미들웨어
│       ├── models/      # DB 모델
│       └── services/    # AI, 알림 등 외부 서비스
│   └── config/          # 설정 파일 (환경변수 참조)
├── database/          # DB 스키마 및 시드
│   ├── migrations/      # 테이블 생성 스크립트
│   └── seeds/           # 초기 데이터
└── docs/              # 설계 문서
```

## 주요 기능

- **대시보드**: 전체 과업 KPI, 상태 요약, 이슈 현황
- **주간 보고**: 팀원 입력 → 팀장 검토 → 본부 제출
- **AI 기능**: Leadership Q&A, Weekly Briefing, Smart Alert
- **전략/KPI 거버넌스**: 전략 과제 트리, KPI 트래킹
- **예산 트래킹**: Actual vs Budget, 번다운 차트
- **회의 모드**: 본부장 전용 전체화면 회의 뷰
- **Admin**: 팀/사용자/권한 관리

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React 18, TailwindCSS, Recharts |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| Auth | SSO (SAML 2.0 / OAuth2) + JWT |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| 배포 | Docker + Nginx |

## 환경 설정

```bash
# backend/.env 파일 생성 (절대 Git에 커밋하지 말 것)
cp backend/.env.example backend/.env
# .env 파일에 실제 값 입력
```

## 개발 시작

```bash
# 백엔드
cd backend && npm install && npm run dev

# 프론트엔드
cd frontend && npm install && npm run dev

# DB 마이그레이션
cd backend && npm run migrate
```

## 권한 체계

| Role | 코드 | 설명 |
|---|---|---|
| 본부장 | HQ | 전체 데이터 접근, AI 전체 범위 |
| 팀장 | TL | 팀 범위 데이터, AI 팀 범위 |
| 팀원 | MB | 본인 과업 입력/수정 |
| Viewer | VW | 요약 조회만 |

## 보안 주의사항

- `.env` 파일은 절대 커밋 금지 (`.gitignore`에 포함됨)
- API Key, DB 비밀번호 등 민감정보는 환경변수로만 관리
- 모든 AI API 호출은 서버사이드에서만 처리
