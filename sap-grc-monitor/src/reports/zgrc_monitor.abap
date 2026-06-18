REPORT zgrc_monitor.

************************************************************************
* ZGRC_MONITOR
* Central RA + SOD monitoring driver.
*  - Run an analysis across selected (or all) connected SAP instances
*  - Display the per-system processing log
* Can be scheduled as a periodic background job (SM36) for continuous
* monitoring; results are stored in ZGRC_RESULT and viewed with
* report ZGRC_RESULT_VIEWER.
************************************************************************

TABLES zgrc_system.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS s_sysid FOR zgrc_system-sysid.
PARAMETERS p_rtype TYPE zgrc_risk_type AS LISTBOX VISIBLE LENGTH 20.
PARAMETERS p_actv  TYPE abap_bool AS CHECKBOX DEFAULT 'X'.   " only active users
SELECTION-SCREEN END OF BLOCK b1.

START-OF-SELECTION.

  DATA lt_sysid TYPE STANDARD TABLE OF zgrc_sysid.
  LOOP AT s_sysid INTO DATA(ls_so) WHERE sign = 'I' AND option = 'EQ'.
    APPEND ls_so-low TO lt_sysid.
  ENDLOOP.

  DATA(lo_engine) = NEW zcl_grc_engine( ).
  DATA lv_runid TYPE zgrc_runid.

  DATA(lt_log) = lo_engine->run(
    EXPORTING it_sysids      = lt_sysid
              iv_risk_type   = p_rtype
              iv_only_active = p_actv
    IMPORTING ev_runid       = lv_runid ).

  cl_demo_output=>begin_section( |Analysis run { lv_runid }| ).

  TRY.
      cl_salv_table=>factory(
        IMPORTING r_salv_table = DATA(lo_alv)
        CHANGING  t_table      = lt_log ).
      lo_alv->get_functions( )->set_all( ).
      lo_alv->get_columns( )->set_optimize( ).
      lo_alv->display( ).
    CATCH cx_salv_msg INTO DATA(lx).
      MESSAGE lx->get_text( ) TYPE 'I'.
  ENDTRY.
