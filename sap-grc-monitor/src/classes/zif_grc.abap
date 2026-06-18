INTERFACE zif_grc PUBLIC.

************************************************************************
* ZIF_GRC - Central GRC Access Monitoring shared types & constants
*
* Centralized RA (Risk Analysis) + SOD (Segregation of Duties)
* monitoring across multiple SAP ERP instances.
************************************************************************

  "---------------------------------------------------------------
  " Constants
  "---------------------------------------------------------------
  CONSTANTS:
    " Risk type
    BEGIN OF c_risk_type,
      sod      TYPE zgrc_risk_type VALUE 'SOD',  " Segregation of Duties (>=2 functions)
      critical TYPE zgrc_risk_type VALUE 'RA',   " Critical action / permission (1 function)
    END OF c_risk_type.

  CONSTANTS:
    " Risk level
    BEGIN OF c_risk_level,
      critical TYPE zgrc_risk_lvl VALUE 'C',
      high     TYPE zgrc_risk_lvl VALUE 'H',
      medium   TYPE zgrc_risk_lvl VALUE 'M',
      low      TYPE zgrc_risk_lvl VALUE 'L',
    END OF c_risk_level.

  CONSTANTS:
    " Violation status
    BEGIN OF c_status,
      open      TYPE zgrc_vstatus VALUE 'O',  " open violation
      mitigated TYPE zgrc_vstatus VALUE 'M',  " covered by a mitigation control
      remediated TYPE zgrc_vstatus VALUE 'R', " no longer present (cleared)
    END OF c_status.

  CONSTANTS:
    " Analysis run status
    BEGIN OF c_run_status,
      running  TYPE zgrc_run_status VALUE 'R',
      finished TYPE zgrc_run_status VALUE 'F',
      error    TYPE zgrc_run_status VALUE 'E',
    END OF c_run_status.

  CONSTANTS:
    " Connector / instance type
    BEGIN OF c_conn_type,
      abap TYPE zgrc_conn_type VALUE 'ABAP',
    END OF c_conn_type.

  "---------------------------------------------------------------
  " Types - extracted authorization data (from satellite systems)
  "---------------------------------------------------------------
  TYPES:
    " One user master record on a satellite system
    BEGIN OF ty_user,
      sysid     TYPE zgrc_sysid,
      bname     TYPE xubname,       " user id
      ustyp     TYPE xuustyp,       " user type (A dialog, B system, ...)
      gltgv     TYPE xubcda,        " valid from
      gltgb     TYPE xubcbe,        " valid to
      uflag     TYPE xuuflag,       " lock status
      class     TYPE xuclass,       " user group
      fullname  TYPE ad_namtext,
    END OF ty_user,
    tt_user TYPE STANDARD TABLE OF ty_user WITH DEFAULT KEY.

  TYPES:
    " Role assignment of a user
    BEGIN OF ty_user_role,
      sysid     TYPE zgrc_sysid,
      bname     TYPE xubname,
      agr_name  TYPE agr_name,      " role name
      from_dat  TYPE agr_users-from_dat,
      to_dat    TYPE agr_users-to_dat,
    END OF ty_user_role,
    tt_user_role TYPE STANDARD TABLE OF ty_user_role WITH DEFAULT KEY.

  TYPES:
    " Flattened authorization value granted to a user (via roles/profiles)
    " This is the atomic fact the analyzer reasons over.
    BEGIN OF ty_auth_value,
      sysid     TYPE zgrc_sysid,
      bname     TYPE xubname,
      object    TYPE xuobject,      " authorization object e.g. S_TCODE
      field     TYPE fieldname,     " auth field e.g. TCD, ACTVT
      low       TYPE xuval,         " from value
      high      TYPE xuval,         " to value (interval)
      source    TYPE agr_name,      " originating role (provenance)
    END OF ty_auth_value,
    tt_auth_value TYPE STANDARD TABLE OF ty_auth_value WITH DEFAULT KEY.

  TYPES:
    " Complete extract payload returned by the satellite RFC
    BEGIN OF ty_extract,
      sysid       TYPE zgrc_sysid,
      extract_ts  TYPE timestampl,
      users       TYPE tt_user,
      user_roles  TYPE tt_user_role,
      auth_values TYPE tt_auth_value,
    END OF ty_extract.

  "---------------------------------------------------------------
  " Types - ruleset (loaded in memory by ZCL_GRC_RULESET)
  "---------------------------------------------------------------
  TYPES:
    " A permission requirement for a function action
    BEGIN OF ty_func_perm,
      object TYPE xuobject,
      field  TYPE fieldname,
      low    TYPE xuval,
      high   TYPE xuval,
    END OF ty_func_perm,
    tt_func_perm TYPE STANDARD TABLE OF ty_func_perm WITH DEFAULT KEY.

  TYPES:
    " A function = set of permission requirements that all must be met
    BEGIN OF ty_function,
      funcid TYPE zgrc_funcid,
      text   TYPE zgrc_text,
      perms  TYPE tt_func_perm,
    END OF ty_function,
    tt_function TYPE SORTED TABLE OF ty_function WITH UNIQUE KEY funcid.

  TYPES:
    " A risk references one (RA) or many (SOD) functions
    BEGIN OF ty_risk,
      riskid    TYPE zgrc_riskid,
      risk_type TYPE zgrc_risk_type,
      level     TYPE zgrc_risk_lvl,
      bproc     TYPE zgrc_text,        " business process
      text      TYPE zgrc_text,
      functions TYPE STANDARD TABLE OF zgrc_funcid WITH DEFAULT KEY,
    END OF ty_risk,
    tt_risk TYPE STANDARD TABLE OF ty_risk WITH DEFAULT KEY.

  "---------------------------------------------------------------
  " Types - analysis output
  "---------------------------------------------------------------
  TYPES:
    " A single violation finding (what gets persisted to ZGRC_RESULT)
    BEGIN OF ty_violation,
      runid     TYPE zgrc_runid,
      sysid     TYPE zgrc_sysid,
      bname     TYPE xubname,
      riskid    TYPE zgrc_riskid,
      risk_type TYPE zgrc_risk_type,
      level     TYPE zgrc_risk_lvl,
      status    TYPE zgrc_vstatus,
      mit_id    TYPE zgrc_mitid,      " mitigation control if mitigated
      funcs     TYPE string,          " conflicting functions, e.g. F001 + F002
      detail    TYPE string,          " human readable evidence path
    END OF ty_violation,
    tt_violation TYPE STANDARD TABLE OF ty_violation WITH DEFAULT KEY.

ENDINTERFACE.
