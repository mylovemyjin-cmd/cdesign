import { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';

// 운영(Ops) 콘솔 — 운영 에이전트 현황/인시던트/질의
// 백엔드 /api/ops/* (본부장 전용) 와 연동. 라우터에 <OpsConsole /> 로 연결하세요.

const SEVERITY_STYLE = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-sky-100 text-sky-700 border-sky-200',
};

function Badge({ level }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${SEVERITY_STYLE[level] || SEVERITY_STYLE.info}`}>
      {level}
    </span>
  );
}

export default function OpsConsole() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/ops/status');
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || '운영 현황을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // 30초마다 갱신
    return () => clearInterval(t);
  }, [load]);

  const approve = async (incidentId) => {
    try {
      await api.post(`/ops/incidents/${incidentId}/approve`, {});
      await load();
    } catch (err) {
      alert(err.response?.data?.error || '조치 승인 실패');
    }
  };

  const runNow = async (monitorId) => {
    try {
      await api.post(`/ops/monitors/${monitorId}/run`, {});
      await load();
    } catch (err) {
      alert(err.response?.data?.error || '실행 실패');
    }
  };

  const ask = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAnswer('');
    try {
      const { data } = await api.post('/ops/ask', { question });
      setAnswer(data.answer);
    } catch (err) {
      setAnswer(err.response?.data?.error || '질의 실패');
    } finally {
      setAsking(false);
    }
  };

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }
  if (!snapshot) {
    return <div className="p-6 text-gray-500">불러오는 중…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{snapshot.agentName}</h1>
          <p className="text-sm text-gray-500">
            갱신 {new Date(snapshot.generatedAt).toLocaleTimeString('ko-KR')}
          </p>
        </div>
        <button onClick={load} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
          새로고침
        </button>
      </header>

      {/* 모니터 상태 카드 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">감시 항목</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {snapshot.monitors.map((m) => (
            <div key={m.id} className="border rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{m.description || m.id}</span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    m.healthy === null ? 'bg-gray-300' : m.healthy ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {m.lastRunAt ? new Date(m.lastRunAt).toLocaleTimeString('ko-KR') : '미실행'}
              </div>
              <button
                onClick={() => runNow(m.id)}
                className="mt-2 text-xs text-sky-600 hover:underline"
              >
                지금 점검
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 열린 인시던트 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          진행 중 인시던트 ({snapshot.openIncidents.length})
        </h2>
        {snapshot.openIncidents.length === 0 ? (
          <p className="text-sm text-gray-400">진행 중인 이상이 없습니다. ✅</p>
        ) : (
          <div className="space-y-2">
            {snapshot.openIncidents.map((inc) => (
              <div key={inc.id} className="border rounded-lg p-3 bg-white">
                <div className="flex items-center gap-2">
                  <Badge level={inc.severity} />
                  <span className="text-sm font-medium">{inc.summary}</span>
                  <span className="ml-auto text-xs text-gray-400">{inc.occurrences}회</span>
                </div>
                {inc.pendingRemediation && (
                  <div className="mt-2 flex items-center justify-between bg-amber-50 rounded p-2">
                    <span className="text-xs text-amber-700">
                      자동조치 대기: {inc.pendingRemediation.description}
                    </span>
                    <button
                      onClick={() => approve(inc.id)}
                      className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
                    >
                      승인·실행
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 자연어 운영 질의 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">운영 질의</h2>
        <form onSubmit={ask} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예: 지금 문제 있는 항목 있어?"
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={asking}
            className="px-4 py-2 text-sm bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50"
          >
            {asking ? '분석 중…' : '질문'}
          </button>
        </form>
        {answer && (
          <div className="mt-3 p-3 bg-gray-50 border rounded text-sm whitespace-pre-wrap">{answer}</div>
        )}
      </section>

      {/* 최근 이벤트 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">최근 이벤트</h2>
        <div className="border rounded-lg divide-y bg-white max-h-72 overflow-auto">
          {snapshot.recentEvents.map((e) => (
            <div key={e.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="text-gray-400 w-16 shrink-0">
                {new Date(e.at).toLocaleTimeString('ko-KR')}
              </span>
              {e.severity && <Badge level={e.severity} />}
              <span className="text-gray-700">{e.message}</span>
            </div>
          ))}
          {snapshot.recentEvents.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">이벤트 없음</div>
          )}
        </div>
      </section>
    </div>
  );
}
