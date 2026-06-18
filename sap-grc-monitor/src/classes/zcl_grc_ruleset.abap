CLASS zcl_grc_ruleset DEFINITION PUBLIC FINAL CREATE PRIVATE.

************************************************************************
* ZCL_GRC_RULESET
* Loads the access-risk ruleset (functions, permissions, risks) from
* the central DDIC tables into memory once, so the analyzers can
* evaluate every user without re-reading the database.
*
* Use the factory method LOAD to obtain a populated instance.
************************************************************************

  PUBLIC SECTION.
    "! Load the active ruleset into memory.
    "! @parameter iv_risk_type | optional filter (SOD / RA), space = all
    CLASS-METHODS load
      IMPORTING iv_risk_type     TYPE zgrc_risk_type OPTIONAL
      RETURNING VALUE(ro_ruleset) TYPE REF TO zcl_grc_ruleset
      RAISING   zcx_grc.

    "! All risks in scope.
    METHODS get_risks
      RETURNING VALUE(rt_risks) TYPE zif_grc=>tt_risk.

    "! Lookup one function definition (with its permission requirements).
    METHODS get_function
      IMPORTING iv_funcid          TYPE zgrc_funcid
      RETURNING VALUE(rs_function) TYPE zif_grc=>ty_function.

  PRIVATE SECTION.
    DATA mt_functions TYPE zif_grc=>tt_function.
    DATA mt_risks     TYPE zif_grc=>tt_risk.

    METHODS load_functions.
    METHODS load_risks
      IMPORTING iv_risk_type TYPE zgrc_risk_type.
ENDCLASS.


CLASS zcl_grc_ruleset IMPLEMENTATION.

  METHOD load.
    ro_ruleset = NEW #( ).
    ro_ruleset->load_functions( ).
    ro_ruleset->load_risks( iv_risk_type ).

    IF ro_ruleset->mt_risks IS INITIAL.
      RAISE EXCEPTION TYPE zcx_grc
        EXPORTING textid = zcx_grc=>empty_ruleset.
    ENDIF.
  ENDMETHOD.

  METHOD load_functions.
    " function headers
    SELECT funcid, text FROM zgrc_func
      INTO TABLE @DATA(lt_func).

    " all permission requirements at once
    SELECT funcid, object, field, low, high FROM zgrc_func_act
      INTO TABLE @DATA(lt_perm).
    SORT lt_perm BY funcid.

    LOOP AT lt_func INTO DATA(ls_func).
      DATA(ls_function) = VALUE zif_grc=>ty_function(
        funcid = ls_func-funcid
        text   = ls_func-text ).
      LOOP AT lt_perm INTO DATA(ls_perm) WHERE funcid = ls_func-funcid.
        APPEND VALUE #( object = ls_perm-object
                        field  = ls_perm-field
                        low    = ls_perm-low
                        high   = ls_perm-high ) TO ls_function-perms.
      ENDLOOP.
      INSERT ls_function INTO TABLE mt_functions.
    ENDLOOP.
  ENDMETHOD.

  METHOD load_risks.
    DATA lr_type TYPE RANGE OF zgrc_risk_type.
    IF iv_risk_type IS NOT INITIAL.
      lr_type = VALUE #( ( sign = 'I' option = 'EQ' low = iv_risk_type ) ).
    ENDIF.

    SELECT riskid, risk_type, level, bproc, text
      FROM zgrc_risk
      WHERE risk_type IN @lr_type
        AND active    = @abap_true
      INTO TABLE @DATA(lt_risk).

    SELECT riskid, funcid FROM zgrc_risk_func
      INTO TABLE @DATA(lt_rf).
    SORT lt_rf BY riskid.

    LOOP AT lt_risk INTO DATA(ls_risk).
      DATA(ls_r) = VALUE zif_grc=>ty_risk(
        riskid    = ls_risk-riskid
        risk_type = ls_risk-risk_type
        level     = ls_risk-level
        bproc     = ls_risk-bproc
        text      = ls_risk-text ).
      LOOP AT lt_rf INTO DATA(ls_rf) WHERE riskid = ls_risk-riskid.
        APPEND ls_rf-funcid TO ls_r-functions.
      ENDLOOP.

      " a SOD risk needs at least two functions to form a conflict
      IF ls_r-risk_type = zif_grc=>c_risk_type-sod
         AND lines( ls_r-functions ) < 2.
        CONTINUE.
      ENDIF.
      IF ls_r-functions IS INITIAL.
        CONTINUE.
      ENDIF.
      APPEND ls_r TO mt_risks.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_risks.
    rt_risks = mt_risks.
  ENDMETHOD.

  METHOD get_function.
    READ TABLE mt_functions INTO rs_function WITH KEY funcid = iv_funcid.
  ENDMETHOD.

ENDCLASS.
