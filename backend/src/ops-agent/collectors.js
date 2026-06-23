// 신호 수집기 (Collectors)
// ─────────────────────────────────────────────────────────────
// 각 수집기는 외부 상태를 관찰하여 "신호(signal)" 객체를 반환한다.
// 앱에 종속되지 않도록, 무엇을 어떻게 관찰할지는 모두 config 로 주입받는다.
//
// 공통 반환 형태: { ok: boolean, latencyMs: number, error?: string, ... }
//
// 지원 타입:
//   http     - HTTP 엔드포인트 헬스/응답 점검
//   postgres - SQL 쿼리 실행 결과
//   logFile  - 로그 파일에서 패턴 매칭 횟수 집계
//   process  - 현재 프로세스 메모리/업타임 등 자원 지표
//   custom   - config 에서 직접 정의한 run(ctx) 함수

const fs = require('fs').promises;
const os = require('os');

async function runHttp(spec) {
  const start = Date.now();
  const timeoutMs = spec.timeoutMs || 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(spec.url, {
      method: spec.method || 'GET',
      headers: spec.headers,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    const expected = spec.expectStatus || 200;
    return {
      ok: res.status === expected,
      status: res.status,
      latencyMs,
    };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function runPostgres(spec, ctx) {
  if (!ctx.pool) {
    return { ok: false, error: 'DB pool 이 주입되지 않았습니다.' };
  }
  const start = Date.now();
  try {
    const result = await ctx.pool.query(spec.query, spec.params || []);
    return {
      ok: true,
      latencyMs: Date.now() - start,
      rowCount: result.rowCount,
      rows: result.rows,
    };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function runLogFile(spec) {
  const start = Date.now();
  try {
    const content = await fs.readFile(spec.path, 'utf8');
    const lines = content.split('\n');
    const pattern = spec.match instanceof RegExp ? spec.match : new RegExp(spec.match || 'ERROR');

    // 최근 N분 필터 (로그 라인이 [ISO timestamp] 로 시작한다고 가정)
    let candidates = lines;
    if (spec.sinceMin) {
      const cutoff = Date.now() - spec.sinceMin * 60 * 1000;
      candidates = lines.filter((line) => {
        const m = line.match(/^\[([^\]]+)\]/);
        if (!m) return false;
        const ts = Date.parse(m[1]);
        return !Number.isNaN(ts) && ts >= cutoff;
      });
    }

    const matches = candidates.filter((line) => pattern.test(line));
    return {
      ok: true,
      latencyMs: Date.now() - start,
      count: matches.length,
      samples: matches.slice(-5),
    };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message, count: 0 };
  }
}

function runProcess() {
  const mem = process.memoryUsage();
  return {
    ok: true,
    latencyMs: 0,
    uptimeSec: Math.round(process.uptime()),
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    loadAvg1: os.loadavg()[0],
    freeMemMb: Math.round(os.freemem() / 1024 / 1024),
  };
}

// collector 명세를 실행하여 신호를 반환
async function collect(spec, ctx) {
  switch (spec.type) {
    case 'http':
      return runHttp(spec, ctx);
    case 'postgres':
      return runPostgres(spec, ctx);
    case 'logFile':
      return runLogFile(spec, ctx);
    case 'process':
      return runProcess(spec, ctx);
    case 'custom':
      if (typeof spec.run !== 'function') {
        return { ok: false, error: 'custom collector 에 run() 함수가 없습니다.' };
      }
      return spec.run(ctx);
    default:
      return { ok: false, error: `알 수 없는 collector 타입: ${spec.type}` };
  }
}

module.exports = { collect };
