REPORT zgrc_seed_demo.

************************************************************************
* ZGRC_SEED_DEMO
* Loads a small demonstration ruleset (functions, one SOD risk, one RA
* risk) so the monitor can be tried out immediately after the DDIC
* objects are created. Idempotent: deletes prior demo rows first.
*
* NOT for productive use - maintain the real ruleset via SM30/table
* maintenance as described in docs/02_ruleset_guide.md.
************************************************************************

PARAMETERS p_exec TYPE abap_bool AS CHECKBOX.

START-OF-SELECTION.

  IF p_exec = abap_false.
    WRITE: / 'Set the checkbox to insert demo ruleset rows.'.
    RETURN.
  ENDIF.

  " ---- clean previous demo rows ----------------------------------
  DELETE FROM zgrc_func      WHERE funcid LIKE 'F_DEMO%'.
  DELETE FROM zgrc_func_act  WHERE funcid LIKE 'F_DEMO%'.
  DELETE FROM zgrc_risk      WHERE riskid LIKE 'R_DEMO%'.
  DELETE FROM zgrc_risk_func WHERE riskid LIKE 'R_DEMO%'.

  " ---- functions --------------------------------------------------
  INSERT zgrc_func FROM TABLE @( VALUE #(
    ( funcid = 'F_DEMO_VEND' text = 'Create Vendor Master (demo)' )
    ( funcid = 'F_DEMO_PAY'  text = 'Execute Payment Run (demo)' )
    ( funcid = 'F_DEMO_TAB'  text = 'Direct Table Maintenance (demo)' ) ) ).

  INSERT zgrc_func_act FROM TABLE @( VALUE #(
    ( funcid = 'F_DEMO_VEND' seqnr = '0001' object = 'S_TCODE'    field = 'TCD'   low = 'XK01' )
    ( funcid = 'F_DEMO_VEND' seqnr = '0002' object = 'F_LFA1_APP' field = 'ACTVT' low = '01' )
    ( funcid = 'F_DEMO_PAY'  seqnr = '0001' object = 'S_TCODE'    field = 'TCD'   low = 'F110' )
    ( funcid = 'F_DEMO_PAY'  seqnr = '0002' object = 'F_REGU_BUK' field = 'ACTVT' low = '21' high = '31' )
    ( funcid = 'F_DEMO_TAB'  seqnr = '0001' object = 'S_TCODE'    field = 'TCD'   low = 'SM30' )
    ( funcid = 'F_DEMO_TAB'  seqnr = '0002' object = 'S_TABU_DIS' field = 'ACTVT' low = '02' ) ) ).

  " ---- risks ------------------------------------------------------
  INSERT zgrc_risk FROM TABLE @( VALUE #(
    ( riskid = 'R_DEMO_SOD' risk_type = 'SOD' level = 'C'
      bproc = 'Purchase-to-Pay' text = 'Vendor create + Payment run (demo)' active = abap_true )
    ( riskid = 'R_DEMO_RA'  risk_type = 'RA' level = 'H'
      bproc = 'Basis' text = 'Direct table maintenance (demo)' active = abap_true ) ) ).

  INSERT zgrc_risk_func FROM TABLE @( VALUE #(
    ( riskid = 'R_DEMO_SOD' funcid = 'F_DEMO_VEND' )
    ( riskid = 'R_DEMO_SOD' funcid = 'F_DEMO_PAY' )
    ( riskid = 'R_DEMO_RA'  funcid = 'F_DEMO_TAB' ) ) ).

  COMMIT WORK.
  WRITE: / 'Demo ruleset inserted. Register a system in ZGRC_SYSTEM and run ZGRC_MONITOR.'.
