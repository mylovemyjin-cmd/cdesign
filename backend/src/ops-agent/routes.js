// 운영 에이전트 REST API
// ─────────────────────────────────────────────────────────────
// GET  /status              현재 운영 현황 스냅샷
// GET  /incidents           인시던트 목록 (?status=open|resolved)
// GET  /incidents/:id       인시던트 상세
// POST /incidents/:id/approve  대기 중 자동조치 승인·실행 { actionId? }
// POST /monitors/:id/run    모니터 수동 실행
// GET  /events              최근 이벤트
// POST /ask                 자연어 운영 질의 { question }
//
// 인증: createRouter({ auth }) 로 미들웨어 배열을 주입(앱별). 미주입 시 무인증.

const express = require('express');
const { answerQuestion } = require('./diagnose');

function createRouter({ engine, store, auth = [] }) {
  const router = express.Router();
  const guard = Array.isArray(auth) ? auth : [auth];

  router.get('/status', ...guard, (req, res) => {
    res.json(engine.snapshot());
  });

  router.get('/incidents', ...guard, (req, res) => {
    res.json(store.listIncidents({ status: req.query.status }));
  });

  router.get('/incidents/:id', ...guard, (req, res) => {
    const inc = store.getIncident(req.params.id);
    if (!inc) return res.status(404).json({ error: '인시던트를 찾을 수 없습니다.' });
    res.json(inc);
  });

  router.post('/incidents/:id/approve', ...guard, async (req, res) => {
    try {
      const inc = store.getIncident(req.params.id);
      if (!inc) return res.status(404).json({ error: '인시던트를 찾을 수 없습니다.' });
      const actionId = req.body.actionId || inc.pendingRemediation?.actionId;
      if (!actionId) return res.status(400).json({ error: '승인할 조치가 없습니다.' });
      const result = await engine.applyRemediation(inc.id, actionId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/monitors/:id/run', ...guard, async (req, res) => {
    try {
      const result = await engine.runMonitor(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.get('/events', ...guard, (req, res) => {
    res.json(store.listEvents({ limit: parseInt(req.query.limit || '100') }));
  });

  router.post('/ask', ...guard, async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: '질문을 입력하세요.' });
    const answer = await answerQuestion({ question, snapshot: engine.snapshot() });
    if (answer === null) {
      return res.status(503).json({ error: 'AI 질의 기능이 비활성화되어 있습니다 (ANTHROPIC_API_KEY 미설정).' });
    }
    res.json({ answer });
  });

  return router;
}

module.exports = { createRouter };
