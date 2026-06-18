CLASS zcl_grc_mitigation DEFINITION PUBLIC FINAL CREATE PUBLIC.

************************************************************************
* ZCL_GRC_MITIGATION
* Applies mitigation controls to raw findings. A violation that is
* covered by a currently valid mitigation assignment (table
* ZGRC_MIT_ASGN) is flagged MITIGATED instead of OPEN, so reporting
* can distinguish accepted/controlled risks from net-new exposures.
************************************************************************

  PUBLIC SECTION.
    METHODS constructor.

    "! Mark mitigated findings in place.
    METHODS apply
      CHANGING ct_findings TYPE zif_grc=>tt_violation.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_asgn,
             sysid  TYPE zgrc_sysid,
             bname  TYPE xubname,
             riskid TYPE zgrc_riskid,
             mit_id TYPE zgrc_mitid,
             valid_to TYPE dats,
           END OF ty_asgn.
    DATA mt_asgn TYPE SORTED TABLE OF ty_asgn
                 WITH NON-UNIQUE KEY sysid bname riskid.
ENDCLASS.


CLASS zcl_grc_mitigation IMPLEMENTATION.

  METHOD constructor.
    " load currently valid mitigation assignments once
    SELECT sysid, bname, riskid, mit_id, valid_to
      FROM zgrc_mit_asgn
      WHERE valid_from <= @sy-datum
        AND valid_to   >= @sy-datum
        AND active      = @abap_true
      INTO TABLE @mt_asgn.
  ENDMETHOD.

  METHOD apply.
    LOOP AT ct_findings ASSIGNING FIELD-SYMBOL(<fs>).
      " exact match on system+user+risk; wildcard system ('*') allowed
      READ TABLE mt_asgn INTO DATA(ls_a)
           WITH KEY sysid  = <fs>-sysid
                    bname  = <fs>-bname
                    riskid = <fs>-riskid.
      IF sy-subrc <> 0.
        READ TABLE mt_asgn INTO ls_a
             WITH KEY sysid  = '*'
                      bname  = <fs>-bname
                      riskid = <fs>-riskid.
      ENDIF.
      IF sy-subrc = 0.
        <fs>-status = zif_grc=>c_status-mitigated.
        <fs>-mit_id = ls_a-mit_id.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
