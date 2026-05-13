const Anthropic = require('@anthropic-ai/sdk');

// API 키는 서버사이드 환경변수에서만 로드 — 클라이언트 미노출
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

/**
 * Leadership Q&A
 * 과업 DB 스냅샷을 context로 주입 후 자연어 답변 생성
 */
async function leadershipQA({ question, tasksSnapshot, role }) {
  const scopeNote = role === 'HQ' ? '전체 팀 데이터' : '해당 팀 데이터만';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `당신은 DT본부 리더십의 AI 어시스턴트입니다.
아래 제공된 ${scopeNote}만 기반으로 답하세요.
데이터에 없는 내용은 절대 추측하지 마세요.
한국어로 3~5문장 이내로 간결하게 답하세요.

[과업 데이터]
${JSON.stringify(tasksSnapshot, null, 2)}`,
    messages: [{ role: 'user', content: question }],
  });

  return response.content[0].text;
}

/**
 * Weekly Briefing 자동 생성
 * 매주 금요일 17:00 cron 트리거
 */
async function generateWeeklyBriefing({ teamsSnapshot, issuesSnapshot, weekLabel }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `당신은 DT본부 주간 브리핑을 작성하는 AI입니다.
아래 데이터를 기반으로 ${weekLabel} 주간 브리핑을 작성하세요.
형식: 1)본부 KPI 요약 2)팀별 현황 3)핵심 리스크 4)다음 주 주요 일정.
경영진 보고용으로 간결하고 명확하게 작성하세요.`,
    messages: [{
      role: 'user',
      content: `팀 현황: ${JSON.stringify(teamsSnapshot)}\n이슈: ${JSON.stringify(issuesSnapshot)}`,
    }],
  });

  return response.content[0].text;
}

/**
 * Smart Alert - 과업 상태 변경 시 코멘트 초안 제안
 * AI가 직접 발송하지 않음 — 팀장 검토 후 수동 전송
 */
async function smartAlert({ task, changeEvent }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `당신은 팀장을 보조하는 AI입니다.
과업 상태 변경에 대해 팀장이 팀원에게 보낼 코멘트 초안을 제안하세요.
2~3문장, 건설적이고 명확하게 작성하세요. 한국어로 작성하세요.
주의: 이 초안은 팀장이 검토 후 직접 전송합니다.`,
    messages: [{
      role: 'user',
      content: `과업: ${task.title}\n변경: ${changeEvent.field} → ${changeEvent.newValue}\n담당자: ${task.ownerName}`,
    }],
  });

  return response.content[0].text;
}

/**
 * 성과 초안 생성 (My Performance)
 */
async function generatePerformanceDraft({ completedTasks, highlights, period }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `당신은 HR 성과 기술을 돕는 AI입니다.
제공된 완료 과업 목록을 기반으로 SuccessFactors 입력용 성과 기술 초안을 작성하세요.
구체적인 수치와 기여도를 강조하고, 1인칭으로 작성하세요.`,
    messages: [{
      role: 'user',
      content: `기간: ${period}\n완료 과업: ${JSON.stringify(completedTasks)}\n핵심 과업: ${JSON.stringify(highlights)}`,
    }],
  });

  return response.content[0].text;
}

module.exports = { leadershipQA, generateWeeklyBriefing, smartAlert, generatePerformanceDraft };
