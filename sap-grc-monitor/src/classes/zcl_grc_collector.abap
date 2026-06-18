CLASS zcl_grc_collector DEFINITION PUBLIC FINAL CREATE PUBLIC.

************************************************************************
* ZCL_GRC_COLLECTOR
* Pulls flattened authorization data from a satellite SAP instance
* through its RFC destination (registered in table ZGRC_SYSTEM) by
* calling the remote FM ZGRC_RFC_EXTRACT_AUTH.
************************************************************************

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING is_system TYPE zgrc_system.

    "! Collect extract from the connected satellite system.
    "! @parameter rs_extract | flattened users / roles / auth values
    "! @raising zcx_grc | RFC or connectivity error
    METHODS collect
      IMPORTING iv_only_active   TYPE abap_bool DEFAULT abap_true
      RETURNING VALUE(rs_extract) TYPE zif_grc=>ty_extract
      RAISING   zcx_grc.

  PRIVATE SECTION.
    DATA ms_system TYPE zgrc_system.
ENDCLASS.


CLASS zcl_grc_collector IMPLEMENTATION.

  METHOD constructor.
    ms_system = is_system.
  ENDMETHOD.

  METHOD collect.
    DATA: lt_users TYPE STANDARD TABLE OF zgrc_s_user,
          lt_roles TYPE STANDARD TABLE OF zgrc_s_user_role,
          lt_auth  TYPE STANDARD TABLE OF zgrc_s_auth_value,
          lv_ts    TYPE timestampl,
          lv_msg   TYPE string.

    IF ms_system-rfc_dest IS INITIAL.
      RAISE EXCEPTION TYPE zcx_grc
        EXPORTING textid = zcx_grc=>no_destination
                  sysid  = ms_system-sysid.
    ENDIF.

    CALL FUNCTION 'ZGRC_RFC_EXTRACT_AUTH'
      DESTINATION ms_system-rfc_dest
      EXPORTING
        iv_sysid              = ms_system-sysid
        iv_only_active        = iv_only_active
      IMPORTING
        ev_extract_ts         = lv_ts
      TABLES
        et_users              = lt_users
        et_user_roles         = lt_roles
        et_auth_values        = lt_auth
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_msg
        system_failure        = 2 MESSAGE lv_msg
        OTHERS                = 3.

    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_grc
        EXPORTING textid = zcx_grc=>rfc_failure
                  sysid  = ms_system-sysid
                  detail = lv_msg.
    ENDIF.

    rs_extract = VALUE #( sysid       = ms_system-sysid
                          extract_ts  = lv_ts
                          users       = CORRESPONDING #( lt_users )
                          user_roles  = CORRESPONDING #( lt_roles )
                          auth_values = CORRESPONDING #( lt_auth ) ).

    " update last sync timestamp on the registry
    UPDATE zgrc_system SET last_sync = lv_ts
                       WHERE sysid = ms_system-sysid.
    COMMIT WORK.
  ENDMETHOD.

ENDCLASS.
