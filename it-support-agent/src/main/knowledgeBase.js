'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 지식베이스(매뉴얼) 로딩 및 중앙 서버 동기화 관리.
 *
 * 우선순위(로딩 시):
 *   1) 사용자 데이터 폴더의 캐시 파일 (이전에 서버에서 받아 둔 최신본)
 *   2) 앱에 번들된 기본 파일 (resources/knowledge-base.json)
 *
 * 동기화(syncFromServer):
 *   - config.knowledgeBase.manifestUrl 에서 JSON을 받아
 *   - 형식 검증 후 캐시 파일로 저장하고 메모리 반영
 *   - 네트워크 실패/오프라인이면 조용히 기존 데이터를 유지
 */
class KnowledgeBase {
  /**
   * @param {object} opts
   * @param {string} opts.bundledPath  - 번들 기본 KB 경로
   * @param {string} opts.cachePath    - 캐시 저장 경로(userData)
   * @param {object} opts.config       - 앱 설정
   * @param {(msg:string)=>void} [opts.log]
   */
  constructor({ bundledPath, cachePath, config, log }) {
    this.bundledPath = bundledPath;
    this.cachePath = cachePath;
    this.config = config || {};
    this.log = log || (() => {});
    this.data = { version: 'empty', entries: [], synonyms: {} };
    this.lastSync = null;
    this.lastError = null;
  }

  /** 디스크에서 가장 적합한 KB를 로드(캐시 우선, 없으면 번들) */
  loadFromDisk() {
    const cached = this._readJsonSafe(this.cachePath);
    if (cached && this._isValid(cached)) {
      this.data = this._normalize(cached);
      this.log(`KB loaded from cache (v${this.data.version}, ${this.data.entries.length} entries)`);
      return this.data;
    }
    const bundled = this._readJsonSafe(this.bundledPath);
    if (bundled && this._isValid(bundled)) {
      this.data = this._normalize(bundled);
      this.log(`KB loaded from bundle (v${this.data.version}, ${this.data.entries.length} entries)`);
      return this.data;
    }
    this.log('WARN: no valid KB found, using empty set');
    return this.data;
  }

  /**
   * 중앙 서버에서 최신 매뉴얼을 받아 캐시에 저장한다.
   * 실패 시 throw하지 않고 false를 반환(기존 데이터 유지).
   * @returns {Promise<{updated: boolean, version?: string, error?: string}>}
   */
  async syncFromServer() {
    const kbCfg = this.config.knowledgeBase || {};
    const url = kbCfg.manifestUrl;
    if (!url) {
      return { updated: false, error: 'manifestUrl 미설정' };
    }

    const timeoutMs = kbCfg.syncTimeoutMs || 8000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const remote = await res.json();

      if (!this._isValid(remote)) throw new Error('서버 KB 형식 오류');

      const normalized = this._normalize(remote);

      // 동일 버전이면 갱신 생략
      if (normalized.version && normalized.version === this.data.version) {
        this.lastSync = new Date();
        this.lastError = null;
        this.log(`KB already up to date (v${normalized.version})`);
        return { updated: false, version: normalized.version };
      }

      this._writeJsonSafe(this.cachePath, normalized);
      this.data = normalized;
      this.lastSync = new Date();
      this.lastError = null;
      this.log(`KB synced from server (v${normalized.version}, ${normalized.entries.length} entries)`);
      return { updated: true, version: normalized.version };
    } catch (err) {
      this.lastError = err.message;
      this.log(`KB sync failed: ${err.message} (기존 데이터 유지)`);
      return { updated: false, error: err.message };
    } finally {
      clearTimeout(timer);
    }
  }

  getData() {
    return this.data;
  }

  getStatus() {
    return {
      version: this.data.version,
      entryCount: this.data.entries.length,
      source: this.data.source || 'unknown',
      lastSync: this.lastSync ? this.lastSync.toISOString() : null,
      lastError: this.lastError,
    };
  }

  // ── 내부 유틸 ────────────────────────────────────────────

  _isValid(obj) {
    return obj && typeof obj === 'object' && Array.isArray(obj.entries);
  }

  _normalize(obj) {
    return {
      version: obj.version || 'unknown',
      updatedAt: obj.updatedAt || null,
      source: obj.source || 'remote',
      synonyms: obj.synonyms && typeof obj.synonyms === 'object' ? obj.synonyms : {},
      entries: obj.entries
        .filter((e) => e && e.id && e.title)
        .map((e) => ({
          id: String(e.id),
          title: String(e.title),
          category: e.category || '기타',
          keywords: Array.isArray(e.keywords) ? e.keywords : [],
          tags: Array.isArray(e.tags) ? e.tags : [],
          content: e.content || '',
          links: Array.isArray(e.links)
            ? e.links.filter((l) => l && l.url).map((l) => ({ label: l.label || l.url, url: l.url }))
            : [],
        })),
    };
  }

  _readJsonSafe(p) {
    try {
      if (!p || !fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (err) {
      this.log(`KB read error (${p}): ${err.message}`);
      return null;
    }
  }

  _writeJsonSafe(p, obj) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      this.log(`KB write error (${p}): ${err.message}`);
    }
  }
}

module.exports = { KnowledgeBase };
