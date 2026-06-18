# 룰셋 정의 가이드 (Function / Risk / Mitigation)

룰셋은 **코드 변경 없이** 테이블 유지보수만으로 관리한다.

## 1. 개념

| 개념 | 테이블 | 의미 |
|------|--------|------|
| Function | `ZGRC_FUNC` + `ZGRC_FUNC_ACT` | 하나의 업무 능력(예: "공급업체 마스터 생성"). 여러 권한 요건의 묶음 |
| Risk | `ZGRC_RISK` + `ZGRC_RISK_FUNC` | 위험. RA=함수 1개 / SOD=함수 2개 이상 충돌 |
| Mitigation | `ZGRC_MIT_CTRL` + `ZGRC_MIT_ASGN` | 보완 통제. 특정 사용자×리스크×시스템 위반을 "관리됨"으로 처리 |

## 2. Function 정의 예시

함수 `F_VEND_CREATE` = "공급업체 마스터 생성"

`ZGRC_FUNC`
| FUNCID | TEXT |
|--------|------|
| F_VEND_CREATE | Create Vendor Master |

`ZGRC_FUNC_ACT` (모든 행을 AND로 충족해야 보유)
| FUNCID | SEQNR | OBJECT | FIELD | LOW | HIGH |
|--------|-------|--------|-------|-----|------|
| F_VEND_CREATE | 0001 | S_TCODE | TCD   | XK01 |  |
| F_VEND_CREATE | 0002 | F_LFA1_APP | ACTVT | 01 |  |

함수 `F_PAY_RUN` = "지급 실행"
| FUNCID | SEQNR | OBJECT | FIELD | LOW | HIGH |
|--------|-------|--------|-------|-----|------|
| F_PAY_RUN | 0001 | S_TCODE | TCD | F110 |  |
| F_PAY_RUN | 0002 | F_REGU_BUK | ACTVT | 21 | 31 |

> 값 표기: 단일값은 LOW만, 구간은 LOW+HIGH. 전체권한은 LOW=`*`.

## 3. Risk 정의 예시

### SOD 리스크 (직무분리 충돌)
`ZGRC_RISK`
| RISKID | RISK_TYPE | LEVEL | BPROC | TEXT | ACTIVE |
|--------|-----------|-------|-------|------|--------|
| R_P2P_01 | SOD | C | Purchase-to-Pay | 공급업체 생성 + 지급 실행 겸직 | X |

`ZGRC_RISK_FUNC`
| RISKID | FUNCID |
|--------|--------|
| R_P2P_01 | F_VEND_CREATE |
| R_P2P_01 | F_PAY_RUN |

→ 한 사용자가 위 두 함수를 **동시에** 보유하면 위반.

### RA 리스크 (단일 중요 권한)
| RISKID | RISK_TYPE | LEVEL | BPROC | TEXT | ACTIVE |
|--------|-----------|-------|-------|------|--------|
| R_BASIS_01 | RA | C | Basis | SE16/SM30 직접 테이블 변경 | X |

`ZGRC_RISK_FUNC`: `R_BASIS_01` → `F_TABLE_EDIT` (함수 1개) → 보유 시 즉시 위반.

## 4. Mitigation 정의 예시

`ZGRC_MIT_CTRL`
| MIT_ID | TEXT | OWNER |
|--------|------|-------|
| M001 | 월별 지급 내역 사후 검토 | CFO_REVIEW |

`ZGRC_MIT_ASGN`
| MIT_ID | SYSID | BNAME | RISKID | VALID_FROM | VALID_TO | APPROVER | ACTIVE |
|--------|-------|-------|--------|------------|----------|----------|--------|
| M001 | P1 | HONG | R_P2P_01 | 2026-01-01 | 2026-12-31 | KIM | X |
| M001 | *  | LEE  | R_P2P_01 | 2026-01-01 | 2026-12-31 | KIM | X |

→ 유효기간 내 위반은 OPEN 대신 **MITIGATED**. `SYSID='*'`는 전 시스템 적용.

## 5. 유지보수 팁

- 표준 GRC 룰셋(SAP delivered)을 참고해 비즈니스 프로세스(P2P, O2C,
  R2R, HR, Basis)별로 함수/리스크를 구성.
- 함수 정의는 권한 객체값까지 명시할수록 오탐(false positive)이 감소.
- 신규 위반 모니터링은 직전 run의 `ZGRC_RESULT`와 비교해 delta만 알림.
