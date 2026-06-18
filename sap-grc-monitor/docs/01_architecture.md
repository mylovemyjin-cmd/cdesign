# 중앙 집중형 SAP ERP 권한 모니터링 (RA + SOD) — 아키텍처

멀티 인스턴스 SAP ERP 환경에서 사용자/역할 권한을 한 곳에서
**RA(Risk Analysis, 중요 권한/Action 분석)** 와
**SOD(Segregation of Duties, 직무분리 충돌)** 관점으로 모니터링하는
ABAP 기반 솔루션.

## 1. 토폴로지

```
                ┌──────────────────────────────────────────────┐
                │            중앙 모니터링 시스템 (Central)        │
                │                                                │
                │  ZGRC_SYSTEM (시스템/RFC 레지스트리)            │
                │  ZGRC_FUNC / FUNC_ACT / RISK / RISK_FUNC (룰셋) │
                │  ZGRC_MIT_* (완화통제)                          │
                │  ZGRC_RUN / ZGRC_RESULT (실행/결과)            │
                │                                                │
                │  ZCL_GRC_ENGINE ── run()                       │
                │    ├─ ZCL_GRC_COLLECTOR  (RFC 호출/수집)        │
                │    ├─ ZCL_GRC_RULESET    (룰셋 메모리 적재)      │
                │    ├─ ZCL_GRC_ANALYZER   (RA/SOD 판정)          │
                │    └─ ZCL_GRC_MITIGATION (완화통제 반영)         │
                │                                                │
                │  ZGRC_MONITOR (실행/배치)                       │
                │  ZGRC_RESULT_VIEWER (ALV 대시보드/드릴다운)      │
                │  ZI_GRC_VIOLATION (CDS 분석 큐브)               │
                └──────────────────────────────────────────────┘
                       ▲ RFC          ▲ RFC          ▲ RFC
            ┌──────────┴───┐  ┌───────┴──────┐  ┌────┴─────────┐
            │  ERP PRD (P1) │  │  ERP QAS (Q1) │  │  S/4 (S1) ...│
            │ ZGRC_RFC_     │  │ ZGRC_RFC_     │  │ ZGRC_RFC_    │
            │ EXTRACT_AUTH  │  │ EXTRACT_AUTH  │  │ EXTRACT_AUTH │
            │ (위성 배포)    │  │ (위성 배포)    │  │ (위성 배포)   │
            └───────────────┘  └───────────────┘  └──────────────┘
```

- **중앙(Central)**: 룰셋·결과·UI를 보유. 분석 로직 전체가 여기서 실행.
- **위성(Satellite)**: 읽기 전용 RFC 추출 FM `ZGRC_RFC_EXTRACT_AUTH`
  하나만 배포. 권한 원천 데이터(USR02/AGR_USERS/AGR_1251)를
  평탄화(flatten)하여 반환.

## 2. 데이터 흐름 (한 번의 분석 실행)

1. `ZGRC_MONITOR` 또는 배치(SM36)가 `ZCL_GRC_ENGINE->run()` 호출.
2. 엔진이 `ZGRC_RUN`에 실행 헤더 생성(상태 Running).
3. `ZCL_GRC_RULESET=>load()` — 함수/권한요건/리스크를 메모리에 1회 적재.
4. `ZGRC_SYSTEM`의 활성 시스템마다:
   - `ZCL_GRC_COLLECTOR->collect()` → RFC로 추출, `last_sync` 갱신.
   - `ZCL_GRC_ANALYZER->analyze()` → 사용자별 보유 함수 도출 후 RA/SOD 판정.
   - `ZCL_GRC_MITIGATION->apply()` → 유효 완화통제가 있으면 Mitigated 표시.
   - 결과를 `ZGRC_RESULT`에 INSERT.
5. 엔진이 `ZGRC_RUN`을 Finished로 마감(총 위반 건수 기록).
6. `ZGRC_RESULT_VIEWER` 또는 CDS 큐브로 조회/드릴다운.

## 3. 판정 로직 (핵심)

### 권한 매칭 (value-aware)
사용자의 부여 권한값 `[low..high]`(또는 `*` 와일드카드)이
함수가 요구하는 권한값 `[low..high]`을 **구간 포함**하면 해당 요건 충족.
함수의 **모든** 요건(객체/필드)이 충족되어야 그 함수를 "보유"로 판정.
→ TCODE만 보는 단순 매칭이 아니라 권한 객체값까지 검증 (false positive 감소).

### RA vs SOD
- **RA**: 사용자가 임계 리스크의 단일 함수를 보유 → 위반.
- **SOD**: 사용자가 한 리스크의 **2개 이상** 충돌 함수를 동시 보유 → 위반.

## 4. 보안 고려사항

- 위성 RFC FM은 **읽기 전용**. 전용 통신(communication) 기술 사용자로
  최소 권한(S_RFC + 조회 테이블 권한)만 부여.
- RFC Destination은 신뢰 연결(Trusted RFC) 또는 비밀 보관소 사용 권장.
- 추출 데이터에 민감 정보(사용자 권한)가 포함되므로 중앙 시스템의
  `ZGRC_*` 테이블 권한을 GRC 운영자/감사자로 제한.

## 5. 운영 (배치)

- SM36으로 `ZGRC_MONITOR`를 일/주 단위 정기 실행.
- 변형(variant)으로 시스템/리스크유형 범위 지정 가능.
- 실행 이력은 `ZGRC_RUN`, 결과는 `ZGRC_RESULT`에 누적되어 추세 분석 가능.

## 6. 확장 포인트

- 신규 위성: `ZGRC_SYSTEM`에 행 추가 + 위성에 FM 배포 (코드 변경 불필요).
- 신규 리스크/함수: 룰셋 테이블만 유지보수 (코드 변경 불필요).
- 비-ABAP 시스템: `ZGRC_CONN_TYPE` 확장 + 별도 Collector 구현.
- 알림: 신규 Critical 위반 발생 시 `ZGRC_RESULT` 비교 후 이메일/워크플로 연동.
- Fiori: `ZI_GRC_VIOLATION` CDS를 OData로 노출하여 분석 앱 제공.
```
