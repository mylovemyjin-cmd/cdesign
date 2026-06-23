// 이벤트/인시던트 저장소
// ─────────────────────────────────────────────────────────────
// 기본은 인메모리(프로세스 재시작 시 초기화)이며,
// pg pool 이 주입되고 ops 테이블이 존재하면 best-effort 로 영속화한다.
// 영속화 실패가 운영 감시 자체를 막지 않도록 모든 DB 작업은 try/catch.

const crypto = require('crypto');

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

class OpsStore {
  constructor({ pool, logger, maxEvents = 1000 } = {}) {
    this.pool = pool;
    this.logger = logger || console;
    this.maxEvents = maxEvents;
    this.events = [];                 // 최근 이벤트 링버퍼
    this.incidents = new Map();       // id -> incident
    this.openByMonitor = new Map();   // monitorId -> incidentId (현재 열린 인시던트)
  }

  recordEvent(event) {
    const stored = { id: newId('evt'), at: new Date().toISOString(), ...event };
    this.events.push(stored);
    if (this.events.length > this.maxEvents) this.events.shift();
    this._persistEvent(stored);
    return stored;
  }

  openIncident({ monitorId, severity, summary, signal }) {
    const existingId = this.openByMonitor.get(monitorId);
    if (existingId) {
      // 이미 열린 인시던트 — 심각도/요약 갱신
      const inc = this.incidents.get(existingId);
      inc.severity = severity;
      inc.summary = summary;
      inc.signal = signal;
      inc.lastSeenAt = new Date().toISOString();
      inc.occurrences += 1;
      this._persistIncident(inc);
      return inc;
    }
    const inc = {
      id: newId('inc'),
      monitorId,
      severity,
      summary,
      signal,
      status: 'open',
      diagnosis: null,
      pendingRemediation: null,
      remediationHistory: [],
      occurrences: 1,
      openedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      resolvedAt: null,
    };
    this.incidents.set(inc.id, inc);
    this.openByMonitor.set(monitorId, inc.id);
    this._persistIncident(inc);
    return inc;
  }

  resolveIncident(monitorId) {
    const id = this.openByMonitor.get(monitorId);
    if (!id) return null;
    const inc = this.incidents.get(id);
    inc.status = 'resolved';
    inc.resolvedAt = new Date().toISOString();
    this.openByMonitor.delete(monitorId);
    this._persistIncident(inc);
    return inc;
  }

  getIncident(id) {
    return this.incidents.get(id) || null;
  }

  listIncidents({ status, limit = 100 } = {}) {
    let all = [...this.incidents.values()];
    if (status) all = all.filter((i) => i.status === status);
    return all.sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, limit);
  }

  listEvents({ limit = 100 } = {}) {
    return this.events.slice(-limit).reverse();
  }

  openIncidents() {
    return [...this.openByMonitor.values()].map((id) => this.incidents.get(id));
  }

  // ── 영속화 (best-effort) ───────────────────────────────
  async _persistEvent(event) {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO ops_events (event_id, monitor_id, kind, severity, message, detail, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [event.id, event.monitorId || null, event.kind, event.severity || null,
         event.message || null, JSON.stringify(event.detail || {}), event.at]
      );
    } catch (err) {
      // 테이블 미존재 등 — 인메모리로만 동작
      this.logger.debug?.(`[OpsStore] event 영속화 생략: ${err.message}`);
    }
  }

  async _persistIncident(inc) {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO ops_incidents
           (incident_id, monitor_id, severity, summary, status, occurrences, diagnosis, opened_at, last_seen_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (incident_id) DO UPDATE SET
           severity = EXCLUDED.severity,
           summary = EXCLUDED.summary,
           status = EXCLUDED.status,
           occurrences = EXCLUDED.occurrences,
           diagnosis = EXCLUDED.diagnosis,
           last_seen_at = EXCLUDED.last_seen_at,
           resolved_at = EXCLUDED.resolved_at`,
        [inc.id, inc.monitorId, inc.severity, inc.summary, inc.status, inc.occurrences,
         inc.diagnosis ? JSON.stringify(inc.diagnosis) : null,
         inc.openedAt, inc.lastSeenAt, inc.resolvedAt]
      );
    } catch (err) {
      this.logger.debug?.(`[OpsStore] incident 영속화 생략: ${err.message}`);
    }
  }
}

module.exports = { OpsStore };
