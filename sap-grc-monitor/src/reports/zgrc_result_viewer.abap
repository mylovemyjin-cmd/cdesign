REPORT zgrc_result_viewer.

************************************************************************
* ZGRC_RESULT_VIEWER
* Cross-system dashboard / drill-down over stored analysis results.
* Filters by run, system, user, risk type, risk level and status, and
* shows an interactive ALV (with totals by risk level) so auditors can
* review violations across all monitored instances from one screen.
************************************************************************

TABLES zgrc_result.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS     p_runid TYPE zgrc_runid.
SELECT-OPTIONS s_sysid FOR zgrc_result-sysid.
SELECT-OPTIONS s_bname FOR zgrc_result-bname.
SELECT-OPTIONS s_rtype FOR zgrc_result-risk_type.
SELECT-OPTIONS s_level FOR zgrc_result-level.
SELECT-OPTIONS s_stat  FOR zgrc_result-status.
PARAMETERS     p_open  TYPE abap_bool AS CHECKBOX DEFAULT 'X'.  " open only
SELECTION-SCREEN END OF BLOCK b1.

START-OF-SELECTION.

  IF p_runid IS INITIAL.
    " default to the latest finished run
    SELECT MAX( runid ) FROM zgrc_run
      WHERE status = @zif_grc=>c_run_status-finished
      INTO @p_runid.
  ENDIF.

  IF p_open = abap_true AND s_stat[] IS INITIAL.
    s_stat = VALUE #( ( sign = 'I' option = 'EQ' low = zif_grc=>c_status-open ) ).
  ENDIF.

  SELECT r~sysid, r~bname, r~risk_type, r~riskid, k~text AS risk_text,
         r~level, r~status, r~mit_id, r~funcs, r~detail
    FROM zgrc_result AS r
    LEFT OUTER JOIN zgrc_risk AS k ON k~riskid = r~riskid
    WHERE r~runid     = @p_runid
      AND r~sysid     IN @s_sysid
      AND r~bname     IN @s_bname
      AND r~risk_type IN @s_rtype
      AND r~level     IN @s_level
      AND r~status    IN @s_stat
    ORDER BY r~level, r~sysid, r~bname
    INTO TABLE @DATA(lt_out).

  IF lt_out IS INITIAL.
    MESSAGE |No violations for run { p_runid }| TYPE 'I'.
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory(
        IMPORTING r_salv_table = DATA(lo_alv)
        CHANGING  t_table      = lt_out ).

      lo_alv->get_functions( )->set_all( ).
      lo_alv->get_columns( )->set_optimize( ).

      " subtotal counts by risk level
      DATA(lo_agg)  = lo_alv->get_aggregations( ).
      DATA(lo_sort) = lo_alv->get_sorts( ).
      lo_sort->add_sort( columnname = 'LEVEL' subtotal = abap_true ).

      DATA(lo_disp) = lo_alv->get_display_settings( ).
      lo_disp->set_list_header( |GRC Access Violations - Run { p_runid }| ).
      lo_disp->set_striped_pattern( abap_true ).

      lo_alv->display( ).
    CATCH cx_salv_msg INTO DATA(lx).
      MESSAGE lx->get_text( ) TYPE 'I'.
  ENDTRY.
