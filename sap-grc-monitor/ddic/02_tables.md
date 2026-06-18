# DDIC – Transparent Tables (SE11)

All tables are client-dependent (`MANDT` as first key field) unless noted.
Delivery class `C` (customizing) for ruleset/registry tables, `A`
(application data) for result/run tables.

---

## ZGRC_SYSTEM — Connected SAP instance registry (master/config)

| Field      | Key | Element        | Description |
|------------|-----|----------------|-------------|
| MANDT      | ✓   | MANDT          | Client |
| SYSID      | ✓   | ZGRC_SYSID     | Logical system id |
| DESCR      |     | ZGRC_TEXT      | Description |
| CONN_TYPE  |     | ZGRC_CONN_TYPE | Connector type (ABAP) |
| RFC_DEST   |     | RFCDEST        | RFC destination to the satellite |
| ACTIVE     |     | ABAP_BOOL      | Included in monitoring |
| LAST_SYNC  |     | TIMESTAMPL     | Last successful extract |

## ZGRC_FUNC — Function header (ruleset)

| Field  | Key | Element     | Description |
|--------|-----|-------------|-------------|
| MANDT  | ✓   | MANDT       | Client |
| FUNCID | ✓   | ZGRC_FUNCID | Function id |
| TEXT   |     | ZGRC_TEXT   | Function description |

## ZGRC_FUNC_ACT — Function → permission requirements (ruleset)

A function is *held* by a user only when **all** its rows are covered.

| Field  | Key | Element     | Description |
|--------|-----|-------------|-------------|
| MANDT  | ✓   | MANDT       | Client |
| FUNCID | ✓   | ZGRC_FUNCID | Function id |
| SEQNR  | ✓   | NUMC4       | Sequence (allows several auth objects) |
| OBJECT |     | XUOBJECT    | Authorization object (e.g. S_TCODE) |
| FIELD  |     | FIELDNAME   | Field (e.g. TCD, ACTVT) |
| LOW    |     | XUVAL       | Required value / interval low |
| HIGH   |     | XUVAL       | Interval high (optional) |

## ZGRC_RISK — Risk header (ruleset)

| Field     | Key | Element        | Description |
|-----------|-----|----------------|-------------|
| MANDT     | ✓   | MANDT          | Client |
| RISKID    | ✓   | ZGRC_RISKID    | Risk id |
| RISK_TYPE |     | ZGRC_RISK_TYPE | SOD / RA |
| LEVEL     |     | ZGRC_RISK_LVL  | C/H/M/L |
| BPROC     |     | ZGRC_TEXT      | Business process |
| TEXT      |     | ZGRC_TEXT      | Risk description |
| ACTIVE    |     | ABAP_BOOL      | Active in ruleset |

## ZGRC_RISK_FUNC — Risk → functions (ruleset)

SOD risk = ≥2 functions; RA risk = 1 function.

| Field  | Key | Element     | Description |
|--------|-----|-------------|-------------|
| MANDT  | ✓   | MANDT       | Client |
| RISKID | ✓   | ZGRC_RISKID | Risk id |
| FUNCID | ✓   | ZGRC_FUNCID | Function id |

## ZGRC_MIT_CTRL — Mitigation control catalogue

| Field   | Key | Element    | Description |
|---------|-----|------------|-------------|
| MANDT   | ✓   | MANDT      | Client |
| MIT_ID  | ✓   | ZGRC_MITID | Control id |
| TEXT    |     | ZGRC_TEXT  | Control description |
| OWNER   |     | XUBNAME    | Control owner |

## ZGRC_MIT_ASGN — Mitigation assignment (user × risk × system)

`SYSID = '*'` means the control applies on all systems.

| Field      | Key | Element     | Description |
|------------|-----|-------------|-------------|
| MANDT      | ✓   | MANDT       | Client |
| MIT_ID     | ✓   | ZGRC_MITID  | Control id |
| SYSID      | ✓   | ZGRC_SYSID  | System id ('*' = all) |
| BNAME      | ✓   | XUBNAME     | User |
| RISKID     | ✓   | ZGRC_RISKID | Mitigated risk |
| VALID_FROM |     | DATS        | Valid from |
| VALID_TO   |     | DATS        | Valid to |
| APPROVER   |     | XUBNAME     | Approver |
| ACTIVE     |     | ABAP_BOOL   | Active |

## ZGRC_RUN — Analysis run log (application data)

| Field          | Key | Element         | Description |
|----------------|-----|-----------------|-------------|
| MANDT          | ✓   | MANDT           | Client |
| RUNID          | ✓   | ZGRC_RUNID      | Run id |
| START_TS       |     | TIMESTAMPL      | Start |
| END_TS         |     | TIMESTAMPL      | End |
| STATUS         |     | ZGRC_RUN_STATUS | R/F/E |
| STARTED_BY     |     | XUBNAME         | Triggered by |
| TOTAL_FINDINGS |     | INT4            | Total violations |

## ZGRC_RESULT — Violation findings (application data)

| Field      | Key | Element        | Description |
|------------|-----|----------------|-------------|
| MANDT      | ✓   | MANDT          | Client |
| RUNID      | ✓   | ZGRC_RUNID     | Run id |
| SYSID      | ✓   | ZGRC_SYSID     | System |
| BNAME      | ✓   | XUBNAME        | User |
| RISKID     | ✓   | ZGRC_RISKID    | Risk |
| RISK_TYPE  |     | ZGRC_RISK_TYPE | SOD / RA |
| LEVEL      |     | ZGRC_RISK_LVL  | Risk level |
| STATUS     |     | ZGRC_VSTATUS   | Open/Mitigated/Remediated |
| MIT_ID     |     | ZGRC_MITID     | Mitigation control (if any) |
| FUNCS      |     | STRING         | Conflicting functions |
| DETAIL     |     | STRING         | Evidence text |
| CREATED_TS |     | TIMESTAMPL     | Created |

**Indexes:** `ZGRC_RESULT` secondary index on `(SYSID, STATUS, LEVEL)`
and on `(BNAME)` for user-centric drill-down.
