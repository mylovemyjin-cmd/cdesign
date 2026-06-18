# DDIC – Domains & Data Elements (SE11)

Create these before the tables. Namespace prefix `ZGRC`.

## Domains

| Domain            | Type   | Length | Notes / Fixed values |
|-------------------|--------|--------|----------------------|
| `ZGRC_SYSID`      | CHAR   | 8      | Logical SAP system id (registry key) |
| `ZGRC_FUNCID`     | CHAR   | 10     | Function id |
| `ZGRC_RISKID`     | CHAR   | 10     | Risk id |
| `ZGRC_MITID`      | CHAR   | 10     | Mitigation control id |
| `ZGRC_RUNID`      | CHAR   | 21     | Analysis run id (timestamp string) |
| `ZGRC_TEXT`       | CHAR   | 100    | Generic description |
| `ZGRC_RISK_TYPE`  | CHAR   | 3      | Fixed: `SOD` (Segregation of Duties), `RA` (critical action/permission) |
| `ZGRC_RISK_LVL`   | CHAR   | 1      | Fixed: `C` Critical, `H` High, `M` Medium, `L` Low |
| `ZGRC_VSTATUS`    | CHAR   | 1      | Fixed: `O` Open, `M` Mitigated, `R` Remediated |
| `ZGRC_RUN_STATUS` | CHAR   | 1      | Fixed: `R` Running, `F` Finished, `E` Error |
| `ZGRC_CONN_TYPE`  | CHAR   | 4      | Fixed: `ABAP` |

## Data Elements

One data element per domain, same name, e.g. data element `ZGRC_SYSID`
uses domain `ZGRC_SYSID`. Reuse SAP standard data elements where they
already exist:

| Field meaning        | Reuse standard element |
|----------------------|------------------------|
| User name            | `XUBNAME`              |
| Auth object          | `XUOBJECT`             |
| Auth field           | `FIELDNAME`            |
| Auth value           | `XUVAL`                |
| Role name            | `AGR_NAME`             |
| RFC destination      | `RFCDEST`              |
| Timestamp (long)     | `TIMESTAMPL`           |

## Structures (for the RFC interface)

These flat structures back the RFC table parameters of
`ZGRC_RFC_EXTRACT_AUTH`. Fields mirror `ZIF_GRC` type definitions.

- `ZGRC_S_USER`       → fields of `zif_grc=>ty_user`
- `ZGRC_S_USER_ROLE`  → fields of `zif_grc=>ty_user_role`
- `ZGRC_S_AUTH_VALUE` → fields of `zif_grc=>ty_auth_value`
