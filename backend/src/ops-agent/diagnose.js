// AI 진단 & 자연어 운영 질의
// ─────────────────────────────────────────────────────────────
// Anthropic Claude 로 (1) 인시던트 근본원인 가설/권고조치 생성,
// (2) 운영자의 자연어 질문에 현재 상태 기반 답변.
// API 키가 없거나 호출 실패 시 null 을 반환하여 감시 자체는 계속 동작한다.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.OPS_AGENT_MODEL || 'claude-opus-4-8';

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function extractText(response) {
  const block = response.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}

/**
 * 인시던트 진단
 * 수집 신호 + 최근 이벤트를 근거로 근본원인 가설과 권고 조치를 생성.
 * @returns {Promise<{summary:string, hypothesis:string, recommendedActions:string[]}|null>}
 */
async function diagnoseIncident({ monitor, incident, recentEvents }) {
  const c = getClient();
  if (!c) return null;

  const system = `당신은 웹 애플리케이션 운영(SRE)을 보조하는 AI 진단 엔진입니다.
제공된 모니터 정의와 관측 신호만 근거로 분석하세요. 데이터에 없는 내용은 추측하지 마세요.
반드시 아래 JSON 스키마로만 응답하세요(설명 문장 없이):
{"summary": "1문장 상황 요약", "hypothesis": "가장 유력한 근본원인 가설", "recommendedActions": ["조치1", "조치2"]}
모든 텍스트는 한국어로 작성하세요.`;

  const userContent = `[모니터]
id: ${monitor.id}
설명: ${monitor.description || '(없음)'}

[현재 인시던트]
심각도: ${incident.severity}
요약: ${incident.summary}
누적 발생: ${incident.occurrences}회
관측 신호: ${JSON.stringify(incident.signal, null, 2)}

[최근 이벤트]
${JSON.stringify((recentEvents || []).slice(0, 15), null, 2)}`;

  try {
    const response = await c.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: userContent }],
    });
    const text = extractText(response);
    try {
      return JSON.parse(text);
    } catch {
      // JSON 파싱 실패 시 요약만이라도 반환
      return { summary: text.slice(0, 300), hypothesis: '', recommendedActions: [] };
    }
  } catch {
    return null;
  }
}

/**
 * 자연어 운영 질의 응답
 * @returns {Promise<string|null>}
 */
async function answerQuestion({ question, snapshot }) {
  const c = getClient();
  if (!c) return null;

  const system = `당신은 웹 애플리케이션 운영 현황을 설명하는 AI 운영 어시스턴트입니다.
아래 제공된 실시간 운영 스냅샷만 근거로 답하세요. 스냅샷에 없는 내용은 "확인되지 않음"이라고 답하세요.
한국어로 간결하게(3~5문장) 답하세요.

[운영 스냅샷]
${JSON.stringify(snapshot, null, 2)}`;

  try {
    const response = await c.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: question }],
    });
    return extractText(response);
  } catch {
    return null;
  }
}

module.exports = { diagnoseIncident, answerQuestion, isEnabled: () => !!getClient() };
