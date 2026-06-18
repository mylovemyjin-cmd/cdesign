FUNCTION zgrc_rfc_extract_auth.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_SYSID) TYPE  ZGRC_SYSID
*"     VALUE(IV_USER_FROM) TYPE  XUBNAME OPTIONAL
*"     VALUE(IV_USER_TO) TYPE  XUBNAME OPTIONAL
*"     VALUE(IV_ONLY_ACTIVE) TYPE  ABAP_BOOL DEFAULT 'X'
*"  EXPORTING
*"     VALUE(EV_EXTRACT_TS) TYPE  TIMESTAMPL
*"  TABLES
*"     ET_USERS STRUCTURE  ZGRC_S_USER
*"     ET_USER_ROLES STRUCTURE  ZGRC_S_USER_ROLE
*"     ET_AUTH_VALUES STRUCTURE  ZGRC_S_AUTH_VALUE
*"----------------------------------------------------------------------
************************************************************************
* Remote-enabled extractor deployed on EACH satellite SAP instance.
* The central monitor calls this via an RFC destination and receives
* the flattened authorization data needed for RA/SOD analysis.
*
* Authorization to call this FM must be controlled by S_RFC and a
* dedicated read-only technical (communication) user on the satellite.
************************************************************************

  DATA: lr_user TYPE RANGE OF xubname.

  GET TIME STAMP FIELD ev_extract_ts.

  IF iv_user_from IS NOT INITIAL.
    lr_user = VALUE #( ( sign   = 'I'
                         option = COND #( WHEN iv_user_to IS INITIAL THEN 'EQ' ELSE 'BT' )
                         low    = iv_user_from
                         high   = iv_user_to ) ).
  ENDIF.

  "--------------------------------------------------------------------
  " 1) User master (USR02 + name)
  "--------------------------------------------------------------------
  SELECT u~bname, u~ustyp, u~gltgv, u~gltgb, u~uflag, u~class,
         a~name_text AS fullname
    FROM usr02 AS u
    LEFT OUTER JOIN user_addr AS a ON a~bname = u~bname
    WHERE u~bname IN @lr_user
    INTO TABLE @DATA(lt_user).

  LOOP AT lt_user INTO DATA(ls_user).
    " optional: skip locked / expired users
    IF iv_only_active = abap_true.
      IF ls_user-uflag <> 0.
        CONTINUE.                       " globally / locally locked
      ENDIF.
      IF ls_user-gltgb IS NOT INITIAL AND ls_user-gltgb < sy-datum.
        CONTINUE.                       " validity expired
      ENDIF.
    ENDIF.
    APPEND VALUE #( sysid    = iv_sysid
                    bname    = ls_user-bname
                    ustyp    = ls_user-ustyp
                    gltgv    = ls_user-gltgv
                    gltgb    = ls_user-gltgb
                    uflag    = ls_user-uflag
                    class    = ls_user-class
                    fullname = ls_user-fullname ) TO et_users.
  ENDLOOP.

  IF et_users IS INITIAL.
    RETURN.
  ENDIF.

  "--------------------------------------------------------------------
  " 2) Role assignments (AGR_USERS), only currently valid ones
  "--------------------------------------------------------------------
  SELECT uname AS bname, agr_name, from_dat, to_dat
    FROM agr_users
    FOR ALL ENTRIES IN @et_users
    WHERE uname    = @et_users-bname
      AND from_dat <= @sy-datum
      AND to_dat   >= @sy-datum
    INTO TABLE @DATA(lt_role).

  LOOP AT lt_role INTO DATA(ls_role).
    APPEND VALUE #( sysid    = iv_sysid
                    bname    = ls_role-bname
                    agr_name = ls_role-agr_name
                    from_dat = ls_role-from_dat
                    to_dat   = ls_role-to_dat ) TO et_user_roles.
  ENDLOOP.

  IF et_user_roles IS INITIAL.
    RETURN.
  ENDIF.

  "--------------------------------------------------------------------
  " 3) Authorization values per role (AGR_1251) -> flatten to user level
  "    AGR_1251 holds object/field/low/high maintained in PFCG roles.
  "--------------------------------------------------------------------
  SELECT DISTINCT agr_name, object, field, low, high
    FROM agr_1251
    FOR ALL ENTRIES IN @et_user_roles
    WHERE agr_name = @et_user_roles-agr_name
      AND deleted  = @space            " active (non-deleted) auth values only
    INTO TABLE @DATA(lt_agr).

  " Build an index role -> auth values for fast expansion
  SORT lt_agr BY agr_name.

  LOOP AT et_user_roles INTO DATA(ls_ur).
    LOOP AT lt_agr INTO DATA(ls_agr) WHERE agr_name = ls_ur-agr_name.
      APPEND VALUE #( sysid  = iv_sysid
                      bname  = ls_ur-bname
                      object = ls_agr-object
                      field  = ls_agr-field
                      low    = ls_agr-low
                      high   = ls_agr-high
                      source = ls_agr-agr_name ) TO et_auth_values.
    ENDLOOP.
  ENDLOOP.

ENDFUNCTION.
