CLASS zcx_grc DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.

************************************************************************
* ZCX_GRC - exception class for the GRC access monitor
************************************************************************

  PUBLIC SECTION.
    INTERFACES if_t100_message.

    CONSTANTS:
      BEGIN OF no_destination,
        msgid TYPE symsgid VALUE 'ZGRC',
        msgno TYPE symsgno VALUE '001',
        attr1 TYPE scx_attrname VALUE 'SYSID',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF no_destination,
      BEGIN OF rfc_failure,
        msgid TYPE symsgid VALUE 'ZGRC',
        msgno TYPE symsgno VALUE '002',
        attr1 TYPE scx_attrname VALUE 'SYSID',
        attr2 TYPE scx_attrname VALUE 'DETAIL',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF rfc_failure,
      BEGIN OF empty_ruleset,
        msgid TYPE symsgid VALUE 'ZGRC',
        msgno TYPE symsgno VALUE '003',
        attr1 TYPE scx_attrname VALUE '',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF empty_ruleset.

    DATA sysid  TYPE zgrc_sysid READ-ONLY.
    DATA detail TYPE string     READ-ONLY.

    METHODS constructor
      IMPORTING textid   LIKE if_t100_message=>t100key OPTIONAL
                previous LIKE previous                  OPTIONAL
                sysid    TYPE zgrc_sysid                OPTIONAL
                detail   TYPE string                    OPTIONAL.
ENDCLASS.


CLASS zcx_grc IMPLEMENTATION.

  METHOD constructor.
    super->constructor( previous = previous ).
    me->sysid  = sysid.
    me->detail = detail.
    CLEAR me->textid.
    IF textid IS INITIAL.
      if_t100_message~t100key = if_t100_message=>default_textid.
    ELSE.
      if_t100_message~t100key = textid.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
