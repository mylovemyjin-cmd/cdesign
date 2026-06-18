CLASS zcl_grc_engine DEFINITION PUBLIC FINAL CREATE PUBLIC.

************************************************************************
* ZCL_GRC_ENGINE
* Orchestrates a full centralized analysis run:
*   - opens a run log (ZGRC_RUN)
*   - iterates over the active systems in the registry (ZGRC_SYSTEM)
*   - collects each system's extract via RFC
*   - analyzes RA + SOD against the in-memory ruleset
*   - applies mitigation controls
*   - persists findings (ZGRC_RESULT) and closes the run
*
* Designed to run interactively or as a background job (see report
* ZGRC_MONITOR).
************************************************************************

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_log,
             sysid   TYPE zgrc_sysid,
             status  TYPE string,      " OK / ERROR
             users   TYPE i,
             findings TYPE i,
             message TYPE string,
           END OF ty_log,
           tt_log TYPE STANDARD TABLE OF ty_log WITH DEFAULT KEY.

    "! Run analysis for the given systems (empty = all active systems).
    "! @parameter it_sysids   | restrict to these system ids (optional)
    "! @parameter iv_risk_type| restrict to SOD / RA (optional)
    "! @parameter ev_runid    | generated run id
    "! @parameter rt_log      | per-system processing log
    METHODS run
      IMPORTING it_sysids        TYPE STANDARD TABLE OPTIONAL
                iv_risk_type     TYPE zgrc_risk_type OPTIONAL
                iv_only_active   TYPE abap_bool DEFAULT abap_true
      EXPORTING ev_runid         TYPE zgrc_runid
      RETURNING VALUE(rt_log)    TYPE tt_log.

  PRIVATE SECTION.
    METHODS open_run
      RETURNING VALUE(rv_runid) TYPE zgrc_runid.
    METHODS close_run
      IMPORTING iv_runid  TYPE zgrc_runid
                iv_status TYPE zgrc_run_status
                iv_total  TYPE i.
    METHODS persist
      IMPORTING it_findings TYPE zif_grc=>tt_violation.
    METHODS read_systems
      IMPORTING it_sysids         TYPE STANDARD TABLE
      RETURNING VALUE(rt_systems) TYPE STANDARD TABLE OF zgrc_system WITH DEFAULT KEY.
ENDCLASS.


CLASS zcl_grc_engine IMPLEMENTATION.

  METHOD run.
    DATA lv_total TYPE i.

    DATA(lv_runid) = open_run( ).
    ev_runid = lv_runid.

    " ruleset loaded once for the whole run
    TRY.
        DATA(lo_ruleset) = zcl_grc_ruleset=>load( iv_risk_type ).
      CATCH zcx_grc INTO DATA(lx).
        close_run( iv_runid = lv_runid iv_status = zif_grc=>c_run_status-error iv_total = 0 ).
        APPEND VALUE #( status = 'ERROR' message = lx->get_text( ) ) TO rt_log.
        RETURN.
    ENDTRY.

    DATA(lo_analyzer)   = NEW zcl_grc_analyzer( lo_ruleset ).
    DATA(lo_mitigation) = NEW zcl_grc_mitigation( ).
    DATA(lt_systems)    = read_systems( it_sysids ).

    LOOP AT lt_systems INTO DATA(ls_sys).
      DATA(ls_log) = VALUE ty_log( sysid = ls_sys-sysid ).
      TRY.
          DATA(lo_collector) = NEW zcl_grc_collector( ls_sys ).
          DATA(ls_extract)   = lo_collector->collect( iv_only_active ).

          DATA(lt_find) = lo_analyzer->analyze( iv_runid   = lv_runid
                                                is_extract = ls_extract ).
          lo_mitigation->apply( CHANGING ct_findings = lt_find ).
          persist( lt_find ).

          ls_log-status   = 'OK'.
          ls_log-users    = lines( ls_extract-users ).
          ls_log-findings = lines( lt_find ).
          lv_total        = lv_total + ls_log-findings.
        CATCH zcx_grc INTO lx.
          ls_log-status  = 'ERROR'.
          ls_log-message = lx->get_text( ).
      ENDTRY.
      APPEND ls_log TO rt_log.
    ENDLOOP.

    close_run( iv_runid = lv_runid iv_status = zif_grc=>c_run_status-finished iv_total = lv_total ).
  ENDMETHOD.

  METHOD open_run.
    GET TIME STAMP FIELD DATA(lv_ts).
    rv_runid = |{ lv_ts }|.
    INSERT zgrc_run FROM @( VALUE #( runid      = rv_runid
                                     start_ts   = lv_ts
                                     status     = zif_grc=>c_run_status-running
                                     started_by = sy-uname ) ).
    COMMIT WORK.
  ENDMETHOD.

  METHOD close_run.
    GET TIME STAMP FIELD DATA(lv_ts).
    UPDATE zgrc_run SET end_ts        = lv_ts,
                        status        = iv_status,
                        total_findings = iv_total
                    WHERE runid = iv_runid.
    COMMIT WORK.
  ENDMETHOD.

  METHOD persist.
    IF it_findings IS INITIAL.
      RETURN.
    ENDIF.
    DATA lt_db TYPE STANDARD TABLE OF zgrc_result.
    GET TIME STAMP FIELD DATA(lv_ts).
    LOOP AT it_findings INTO DATA(ls_f).
      APPEND VALUE #( runid     = ls_f-runid
                      sysid     = ls_f-sysid
                      bname     = ls_f-bname
                      riskid    = ls_f-riskid
                      risk_type = ls_f-risk_type
                      level     = ls_f-level
                      status    = ls_f-status
                      mit_id    = ls_f-mit_id
                      funcs     = ls_f-funcs
                      detail    = ls_f-detail
                      created_ts = lv_ts ) TO lt_db.
    ENDLOOP.
    INSERT zgrc_result FROM TABLE @lt_db.
    COMMIT WORK.
  ENDMETHOD.

  METHOD read_systems.
    DATA lr_sys TYPE RANGE OF zgrc_sysid.
    LOOP AT it_sysids INTO DATA(lv_sysid).
      lr_sys = VALUE #( BASE lr_sys ( sign = 'I' option = 'EQ' low = lv_sysid ) ).
    ENDLOOP.

    SELECT * FROM zgrc_system
      WHERE active = @abap_true
        AND sysid IN @lr_sys
      INTO TABLE @rt_systems.
  ENDMETHOD.

ENDCLASS.
