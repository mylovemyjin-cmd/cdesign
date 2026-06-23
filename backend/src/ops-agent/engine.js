// 운영 에이전트 엔진 (오케스트레이터)
// ─────────────────────────────────────────────────────────────
// 흐름 (모니터별 1 tick):
//   1) 수집(collect) → 신호(signal)
//   2) 판정(evaluate) → 발견(finding) | null
//   3) finding 이면 인시던트 open/update → AI 진단 → 자동조치(허용 시) → 알림
//   4) finding 없고 열린 인시던트가 있으면 → resolve → 해소 알림
//
// 엔진은 앱 도메인을 전혀 모른다. 무엇을 어떻게 감시/조치/알림할지는 config 가 결정.

const cron = require('node-cron');
const { collect } = require('./collectors');
const { notify } = require('./notify');
const { diagnoseIncident } = require('./diagnose');
const { executeRemediation } = require('./remediate');

class OpsEngine {
  constructor({ config, store, pool, logger }) {
    this.config = config;
    this.store = store;
    this.pool = pool;
    this.logger = logger || console;
    this.tasks = [];
    this.lastResults = new Map(); // monitorId -> { signal, finding, at }
  }

  get ctx() {
    return { pool: this.pool, logger: this.logger };
  }

  // cron 스케줄 등록
  start() {
    const tz = this.config.timezone || 'UTC';
    for (const monitor of this.config.monitors || []) {
      if (!monitor.schedule) {
        this.logger.warn(`[OpsAgent] 모니터 '${monitor.id}' 에 schedule 이 없어 건너뜀`);
        continue;
      }
      const task = cron.schedule(
        monitor.schedule,
        () => this.runMonitor(monitor.id).catch((e) =>
          this.logger.error(`[OpsAgent] 모니터 '${monitor.id}' tick 오류: ${e.message}`)
        ),
        { timezone: tz }
      );
      this.tasks.push(task);
    }
    this.logger.info(
      `[OpsAgent] '${this.config.agentName || 'Ops Agent'}' 시작 — 모니터 ${this.config.monitors?.length || 0}개`
    );
  }

  stop() {
    this.tasks.forEach((t) => t.stop());
    this.tasks = [];
  }

  // 단일 모니터 1회 실행 (스케줄 및 수동 트리거 공용)
  async runMonitor(monitorId) {
    const monitor = (this.config.monitors || []).find((m) => m.id === monitorId);
    if (!monitor) throw new Error(`모니터를 찾을 수 없음: ${monitorId}`);

    const signal = await collect(monitor.collector, this.ctx);

    // 판정: 수집 자체 실패는 자동으로 critical, 그 외엔 evaluate 규칙 적용
    let finding = null;
    if (signal.ok === false && !monitor.allowCollectorError) {
      finding = { severity: 'critical', summary: `${monitor.description || monitorId} 수집 실패: ${signal.error || '알 수 없음'}` };
    } else if (typeof monitor.evaluate === 'function') {
      finding = monitor.evaluate(signal) || null;
    }

    this.lastResults.set(monitorId, { signal, finding, at: new Date().toISOString() });

    if (finding) {
      await this._handleFinding(monitor, finding, signal);
    } else {
      await this._handleHealthy(monitor);
    }
    return { signal, finding };
  }

  async _handleFinding(monitor, finding, signal) {
    const wasOpen = this.store.openByMonitor.has(monitor.id);
    const incident = this.store.openIncident({
      monitorId: monitor.id,
      severity: finding.severity,
      summary: finding.summary,
      signal,
    });

    this.store.recordEvent({
      monitorId: monitor.id,
      kind: wasOpen ? 'incident_update' : 'incident_open',
      severity: finding.severity,
      message: finding.summary,
      detail: { signal },
    });

    // 신규 인시던트일 때만 AI 진단 (중복 호출 방지)
    if (!wasOpen) {
      const diagnosis = await diagnoseIncident({
        monitor,
        incident,
        recentEvents: this.store.listEvents({ limit: 15 }),
      });
      if (diagnosis) {
        incident.diagnosis = diagnosis;
        this.store._persistIncident(incident);
      }

      await this._maybeRemediate(monitor, incident, signal);

      await notify(
        this.config.channels || [],
        {
          severity: finding.severity,
          title: `[감지] ${monitor.description || monitor.id}`,
          message: this._composeMessage(incident),
          incidentId: incident.id,
          monitorId: monitor.id,
        },
        this.ctx
      );
    }
  }

  async _handleHealthy(monitor) {
    if (!this.store.openByMonitor.has(monitor.id)) return;
    const resolved = this.store.resolveIncident(monitor.id);
    this.store.recordEvent({
      monitorId: monitor.id,
      kind: 'incident_resolved',
      severity: 'info',
      message: `${monitor.description || monitor.id} 정상 복구`,
    });
    await notify(
      this.config.channels || [],
      {
        severity: 'info',
        title: `[복구] ${monitor.description || monitor.id}`,
        message: '이전에 감지된 이상이 정상으로 복구되었습니다.',
        incidentId: resolved?.id,
        monitorId: monitor.id,
      },
      this.ctx
    );
  }

  // 자동 조치: autoApprove 인 경우 즉시 실행, 아니면 승인 대기로 표시
  async _maybeRemediate(monitor, incident, signal) {
    const actionId = monitor.remediation;
    if (!actionId) return;
    const action = (this.config.remediations || {})[actionId];
    if (!action) {
      this.logger.warn(`[OpsAgent] 모니터 '${monitor.id}' 의 조치 '${actionId}' 미정의`);
      return;
    }

    if (!action.autoApprove) {
      // 승인 대기 — API 로 승인 시 실행
      incident.pendingRemediation = { actionId, description: action.description, risk: action.risk };
      this.store._persistIncident(incident);
      this.store.recordEvent({
        monitorId: monitor.id,
        kind: 'remediation_pending',
        severity: 'warning',
        message: `자동조치 '${actionId}' 승인 대기`,
      });
      return;
    }

    await this.applyRemediation(incident.id, actionId);
  }

  // 조치 실행 (자동승인 또는 운영자 수동 승인 진입점)
  async applyRemediation(incidentId, actionId) {
    const incident = this.store.getIncident(incidentId);
    if (!incident) throw new Error(`인시던트를 찾을 수 없음: ${incidentId}`);

    const { ok, record, error } = await executeRemediation({
      actionId,
      remediations: this.config.remediations || {},
      incident,
      signal: incident.signal,
      ctx: this.ctx,
    });

    if (record) {
      incident.remediationHistory.push(record);
      incident.pendingRemediation = null;
      this.store._persistIncident(incident);
    }
    this.store.recordEvent({
      monitorId: incident.monitorId,
      kind: ok ? 'remediation_success' : 'remediation_failed',
      severity: ok ? 'info' : 'warning',
      message: ok ? `자동조치 '${actionId}' 완료` : `자동조치 '${actionId}' 실패: ${error}`,
      detail: record,
    });

    await notify(
      this.config.channels || [],
      {
        severity: ok ? 'info' : 'warning',
        title: ok ? `[조치완료] ${actionId}` : `[조치실패] ${actionId}`,
        message: ok ? (record.result || '조치 완료') : (error || '조치 실패'),
        incidentId,
        monitorId: incident.monitorId,
      },
      this.ctx
    );

    return { ok, record, error };
  }

  _composeMessage(incident) {
    let msg = incident.summary;
    if (incident.diagnosis) {
      msg += `\n[가설] ${incident.diagnosis.hypothesis || '-'}`;
      if (incident.diagnosis.recommendedActions?.length) {
        msg += `\n[권고] ${incident.diagnosis.recommendedActions.join(' / ')}`;
      }
    }
    if (incident.pendingRemediation) {
      msg += `\n[조치대기] '${incident.pendingRemediation.actionId}' — 승인 필요`;
    }
    return msg;
  }

  // 운영 현황 스냅샷 (상태 API / 자연어 질의 컨텍스트)
  snapshot() {
    const monitors = (this.config.monitors || []).map((m) => {
      const last = this.lastResults.get(m.id);
      return {
        id: m.id,
        description: m.description,
        lastRunAt: last?.at || null,
        healthy: last ? !last.finding : null,
        lastSignal: last?.signal || null,
      };
    });
    return {
      agentName: this.config.agentName || 'Ops Agent',
      generatedAt: new Date().toISOString(),
      monitors,
      openIncidents: this.store.openIncidents().map((i) => ({
        id: i.id,
        monitorId: i.monitorId,
        severity: i.severity,
        summary: i.summary,
        occurrences: i.occurrences,
        openedAt: i.openedAt,
        pendingRemediation: i.pendingRemediation,
      })),
      recentEvents: this.store.listEvents({ limit: 20 }),
    };
  }
}

module.exports = { OpsEngine };
