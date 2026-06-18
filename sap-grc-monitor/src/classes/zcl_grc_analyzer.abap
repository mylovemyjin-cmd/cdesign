CLASS zcl_grc_analyzer DEFINITION PUBLIC FINAL CREATE PUBLIC.

************************************************************************
* ZCL_GRC_ANALYZER
* Core analysis engine. Given one system's extract and the in-memory
* ruleset, it:
*   1) derives, per user, the set of FUNCTIONS the user can execute
*      (a function is "held" when ALL its permission requirements are
*       covered by the user's granted authorization values),
*   2) evaluates RA risks  (user holds a single critical function),
*   3) evaluates SOD risks (user holds >=2 conflicting functions).
*
* The matching is value-aware: it respects authorization intervals
* (LOW..HIGH) and the '*' full-authorization wildcard.
************************************************************************

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING io_ruleset TYPE REF TO zcl_grc_ruleset.

    "! Analyze one system extract and return raw (un-mitigated) findings.
    "! @parameter iv_runid    | analysis run id (stamped on each finding)
    "! @parameter is_extract  | authorization extract from one system
    "! @parameter rt_findings | violations with status OPEN
    METHODS analyze
      IMPORTING iv_runid          TYPE zgrc_runid
                is_extract        TYPE zif_grc=>ty_extract
      RETURNING VALUE(rt_findings) TYPE zif_grc=>tt_violation.

  PRIVATE SECTION.
    TYPES tt_funcid TYPE SORTED TABLE OF zgrc_funcid WITH UNIQUE KEY table_line.

    DATA mo_ruleset TYPE REF TO zcl_grc_ruleset.

    "! Does the user (its auth values) hold this function?
    METHODS user_holds_function
      IMPORTING it_user_auth     TYPE zif_grc=>tt_auth_value
                is_function      TYPE zif_grc=>ty_function
      RETURNING VALUE(rv_held)   TYPE abap_bool.

    "! Does any granted value cover the required permission value?
    METHODS perm_satisfied
      IMPORTING it_user_auth      TYPE zif_grc=>tt_auth_value
                is_perm           TYPE zif_grc=>ty_func_perm
      RETURNING VALUE(rv_ok)      TYPE abap_bool.

    METHODS value_covers
      IMPORTING iv_g_low    TYPE xuval
                iv_g_high   TYPE xuval
                iv_req_low  TYPE xuval
                iv_req_high TYPE xuval
      RETURNING VALUE(rv_ok) TYPE abap_bool.
ENDCLASS.


CLASS zcl_grc_analyzer IMPLEMENTATION.

  METHOD constructor.
    mo_ruleset = io_ruleset.
  ENDMETHOD.

  METHOD analyze.
    " per-user held functions, keyed for fast lookup
    DATA: BEGIN OF ls_uf,
            bname  TYPE xubname,
            funcs  TYPE tt_funcid,
          END OF ls_uf.
    DATA lt_uf LIKE SORTED TABLE OF ls_uf WITH UNIQUE KEY bname.

    " 1) split auth values by user for performance
    DATA lt_auth LIKE is_extract-auth_values.
    lt_auth = is_extract-auth_values.
    SORT lt_auth BY bname object field.

    LOOP AT is_extract-users INTO DATA(ls_user).
      DATA(lt_user_auth) = VALUE zif_grc=>tt_auth_value( ).
      LOOP AT lt_auth INTO DATA(ls_a) WHERE bname = ls_user-bname.
        APPEND ls_a TO lt_user_auth.
      ENDLOOP.
      IF lt_user_auth IS INITIAL.
        CONTINUE.
      ENDIF.

      CLEAR ls_uf.
      ls_uf-bname = ls_user-bname.
      " evaluate which functions the user holds (all functions referenced
      " by any in-scope risk)
      LOOP AT mo_ruleset->get_risks( ) INTO DATA(ls_risk).
        LOOP AT ls_risk-functions INTO DATA(lv_funcid).
          IF line_exists( ls_uf-funcs[ table_line = lv_funcid ] ).
            CONTINUE.  " already evaluated as held
          ENDIF.
          DATA(ls_function) = mo_ruleset->get_function( lv_funcid ).
          IF ls_function-funcid IS INITIAL.
            CONTINUE.
          ENDIF.
          IF user_holds_function( it_user_auth = lt_user_auth
                                  is_function  = ls_function ) = abap_true.
            INSERT lv_funcid INTO TABLE ls_uf-funcs.
          ENDIF.
        ENDLOOP.
      ENDLOOP.

      IF ls_uf-funcs IS NOT INITIAL.
        INSERT ls_uf INTO TABLE lt_uf.
      ENDIF.
    ENDLOOP.

    " 2) evaluate every risk against each user's held functions
    LOOP AT lt_uf INTO ls_uf.
      LOOP AT mo_ruleset->get_risks( ) INTO ls_risk.
        DATA(lv_matched) = VALUE string( ).
        DATA(lv_cnt)     = 0.
        LOOP AT ls_risk-functions INTO lv_funcid.
          IF line_exists( ls_uf-funcs[ table_line = lv_funcid ] ).
            lv_cnt = lv_cnt + 1.
            lv_matched = COND #( WHEN lv_matched IS INITIAL THEN |{ lv_funcid }|
                                 ELSE |{ lv_matched } + { lv_funcid }| ).
          ENDIF.
        ENDLOOP.

        " RA: any single critical function held -> violation
        " SOD: at least two conflicting functions held -> violation
        DATA(lv_hit) = abap_false.
        IF ls_risk-risk_type = zif_grc=>c_risk_type-critical AND lv_cnt >= 1.
          lv_hit = abap_true.
        ELSEIF ls_risk-risk_type = zif_grc=>c_risk_type-sod AND lv_cnt >= 2.
          lv_hit = abap_true.
        ENDIF.

        IF lv_hit = abap_true.
          APPEND VALUE #( runid     = iv_runid
                          sysid     = is_extract-sysid
                          bname     = ls_uf-bname
                          riskid    = ls_risk-riskid
                          risk_type = ls_risk-risk_type
                          level     = ls_risk-level
                          status    = zif_grc=>c_status-open
                          funcs     = lv_matched
                          detail    = |{ ls_risk-text } [{ lv_matched }]| )
                 TO rt_findings.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD user_holds_function.
    rv_held = abap_true.
    " every permission requirement must be satisfied (AND semantics)
    LOOP AT is_function-perms INTO DATA(ls_perm).
      IF perm_satisfied( it_user_auth = it_user_auth
                         is_perm      = ls_perm ) = abap_false.
        rv_held = abap_false.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD perm_satisfied.
    rv_ok = abap_false.
    LOOP AT it_user_auth INTO DATA(ls_a)
         WHERE object = is_perm-object
           AND field  = is_perm-field.
      IF value_covers( iv_g_low    = ls_a-low
                       iv_g_high   = ls_a-high
                       iv_req_low  = is_perm-low
                       iv_req_high = is_perm-high ) = abap_true.
        rv_ok = abap_true.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD value_covers.
    " full-authorization wildcard granted
    IF iv_g_low = '*'.
      rv_ok = abap_true.
      RETURN.
    ENDIF.

    " effective granted upper bound (single value when HIGH is empty)
    DATA(lv_g_high) = COND xuval( WHEN iv_g_high IS INITIAL THEN iv_g_low
                                  ELSE iv_g_high ).
    DATA(lv_req_high) = COND xuval( WHEN iv_req_high IS INITIAL THEN iv_req_low
                                    ELSE iv_req_high ).

    " required interval [req_low..req_high] must fall inside granted
    " interval [g_low..g_high]
    IF iv_g_low <= iv_req_low AND lv_g_high >= lv_req_high.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
