@AbapCatalog.sqlViewName: 'ZIGRCVIOL'
@AbapCatalog.compiler.compareFilter: true
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'GRC Access Violations (cross-system)'
@Analytics.dataCategory: #CUBE

define view ZI_GRC_VIOLATION
  as select from zgrc_result as res
    left outer join zgrc_risk   as risk on risk.riskid = res.riskid
    left outer join zgrc_system as sys  on sys.sysid   = res.sysid
{
  key res.runid                    as RunId,
  key res.sysid                    as SystemId,
      sys.descr                    as SystemDescr,
  key res.bname                    as UserName,
  key res.riskid                   as RiskId,
      risk.text                    as RiskText,
      risk.bproc                   as BusinessProcess,
      res.risk_type                as RiskType,
      res.level                    as RiskLevel,
      res.status                   as Status,
      res.mit_id                   as MitigationId,
      res.funcs                    as ConflictingFunctions,
      res.detail                   as Detail,
      res.created_ts               as CreatedAt,
      // measures
      @Aggregation.default: #SUM
      cast( 1 as abap.int4 )       as ViolationCount,
      @Aggregation.default: #SUM
      case res.status
        when 'O' then cast( 1 as abap.int4 )
        else cast( 0 as abap.int4 )
      end                          as OpenCount,
      @Aggregation.default: #SUM
      case res.level
        when 'C' then cast( 1 as abap.int4 )
        else cast( 0 as abap.int4 )
      end                          as CriticalCount
}
