# SAP GRC Access Monitor (ABAP) — 멀티 인스턴스 RA + SOD 중앙 모니터링

여러 SAP ERP 인스턴스의 사용자 권한을 **하나의 중앙 시스템**에서
**RA(중요 권한/Action 분석)** 와 **SOD(직무분리 충돌)** 관점으로
모니터링하는 ABAP 솔루션. 위성 시스템에는 읽기 전용 RFC 추출 함수
하나만 배포하고, 분석·룰셋·리포팅은 모두 중앙에서 수행한다.

## 핵심 특징

- **중앙 집중형**: 시스템 레지스트리(`ZGRC_SYSTEM`)에 RFC 대상만 등록하면
  코드 변경 없이 신규 인스턴스 추가.
- **RA + SOD 동시 분석**: 단일 중요 함수(RA) / 2개 이상 충돌 함수(SOD).
- **권한값 기반 매칭**: TCODE뿐 아니라 권한 객체값(구간/와일드카드)까지
  검증하여 오탐 감소.
- **완화통제(Mitigation)** 반영: 유효한 통제가 있는 위반은 `MITIGATED`.
- **실행 이력/추세**: `ZGRC_RUN`/`ZGRC_RESULT` 누적, ALV 대시보드 + CDS 큐브.
- **배치 가능**: SM36으로 정기 실행.

## 구성 요소

```
sap-grc-monitor/
├── docs/
│   ├── 01_architecture.md        # 토폴로지 / 데이터 흐름 / 판정 로직
│   └── 02_ruleset_guide.md       # Function/Risk/Mitigation 정의 방법
├── ddic/
│   ├── 01_domains_dataelements.md
│   └── 02_tables.md              # 전체 테이블 스펙 (SE11)
└── src/
    ├── rfc/zgrc_rfc_extract_auth.abap   # 위성 배포 RFC 추출 FM
    ├── classes/
    │   ├── zif_grc.abap                 # 공용 타입/상수
    │   ├── zcx_grc.abap                 # 예외 클래스
    │   ├── zcl_grc_collector.abap       # RFC 수집
    │   ├── zcl_grc_ruleset.abap         # 룰셋 메모리 적재
    │   ├── zcl_grc_analyzer.abap        # RA/SOD 판정 엔진
    │   ├── zcl_grc_mitigation.abap      # 완화통제 반영
    │   └── zcl_grc_engine.abap          # 실행 오케스트레이션
    ├── reports/
    │   ├── zgrc_monitor.abap            # 분석 실행/배치 드라이버
    │   ├── zgrc_result_viewer.abap      # ALV 대시보드/드릴다운
    │   └── zgrc_seed_demo.abap          # 데모 룰셋 적재
    └── cds/zi_grc_violation.ddls.asddls # 분석용 CDS 큐브
```

## 설치 (요약)

1. **중앙 시스템**: `ddic/`의 도메인·데이터엘리먼트·구조·테이블을 SE11로 생성.
2. **중앙 시스템**: `src/classes`, `src/reports`, `src/cds`의 ABAP 오브젝트 생성.
   메시지 클래스 `ZGRC`(001~003) 생성.
3. **각 위성 시스템**: `src/rfc/zgrc_rfc_extract_auth.abap`를 RFC 가능 FM으로 생성.
4. **중앙 시스템**: 위성별 RFC Destination(SM59) 생성 → `ZGRC_SYSTEM`에 등록.
5. **룰셋**: `02_ruleset_guide.md`에 따라 함수/리스크/완화통제 유지보수
   (빠른 체험은 `ZGRC_SEED_DEMO` 실행).

> abapGit 사용 시: 본 디렉터리의 소스를 패키지로 임포트 후 활성화.

## 실행

- 대화식/배치: `ZGRC_MONITOR` (시스템·리스크유형 범위 지정 가능).
- 결과 조회: `ZGRC_RESULT_VIEWER` (run/시스템/사용자/레벨/상태 필터, 레벨별 소계).
- 분석/BI: CDS `ZI_GRC_VIOLATION`을 OData/Analytics로 노출.

## 보안

위성 RFC FM은 읽기 전용이며, 전용 통신 사용자에 최소 권한만 부여한다.
권한 원천 데이터는 민감하므로 중앙 `ZGRC_*` 테이블 접근을
GRC 운영자/감사자로 제한한다. 자세한 내용은 `docs/01_architecture.md` §4.
```
