const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { authenticate, requireMinRole, teamScope } = require('../middleware/auth');
const aiService = require('../services/ai');
const pool = require('../../config/db');

// AI 엔드포인트는 별도 Rate Limit (분당 10회)
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

// Leadership Q&A (팀장 이상)
router.post('/qa', authenticate, requireMinRole('TL'), teamScope, aiLimiter, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: '질문을 입력하세요.' });

    // 권한 범위에 맞는 과업 데이터 조회
    const whereClause = req.scopeTeamId ? 'WHERE t.team_id = $1' : '';
    const params = req.scopeTeamId ? [req.scopeTeamId] : [];

    const { rows: tasks } = await pool.query(`
      SELECT t.id, t.title, t.status, t.due_date, u.name AS owner, tm.name AS team
      FROM tasks t
      JOIN users u ON t.owner_id = u.id
      JOIN teams tm ON t.team_id = tm.id
      ${whereClause}
      ORDER BY t.updated_at DESC LIMIT 100
    `, params);

    const answer = await aiService.leadershipQA({
      question,
      tasksSnapshot: tasks,
      role: req.user.role,
    });

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'AI 응답 생성 실패', detail: err.message });
  }
});

// Weekly Briefing 수동 생성 (본부장 전용)
router.post('/briefing', authenticate, requireMinRole('HQ'), aiLimiter, async (req, res) => {
  try {
    const { weekLabel } = req.body;
    const { rows: teams } = await pool.query(`
      SELECT tm.name, COUNT(t.id) AS total,
        SUM(CASE WHEN t.status='on_track' THEN 1 ELSE 0 END) AS on_track,
        SUM(CASE WHEN t.status='at_risk' THEN 1 ELSE 0 END) AS at_risk,
        SUM(CASE WHEN t.status='delayed' THEN 1 ELSE 0 END) AS delayed
      FROM teams tm LEFT JOIN tasks t ON t.team_id = tm.id
      GROUP BY tm.name
    `);

    const { rows: issues } = await pool.query(`
      SELECT title, type, severity, status FROM issues
      WHERE status IN ('open','in_progress') ORDER BY severity DESC LIMIT 20
    `);

    const briefing = await aiService.generateWeeklyBriefing({
      teamsSnapshot: teams,
      issuesSnapshot: issues,
      weekLabel: weekLabel || new Date().toISOString().slice(0, 10),
    });

    res.json({ briefing });
  } catch (err) {
    res.status(500).json({ error: 'Briefing 생성 실패', detail: err.message });
  }
});

// 성과 초안 생성
router.post('/performance-draft', authenticate, requireMinRole('MB'), aiLimiter, async (req, res) => {
  try {
    const { period } = req.body;
    const { rows: tasks } = await pool.query(`
      SELECT title, category, quantified_result, is_highlight, completed_at
      FROM tasks
      WHERE owner_id = $1 AND status = 'completed'
      ORDER BY completed_at DESC
    `, [req.user.id]);

    const draft = await aiService.generatePerformanceDraft({
      completedTasks: tasks,
      highlights: tasks.filter(t => t.is_highlight),
      period,
    });

    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: '성과 초안 생성 실패', detail: err.message });
  }
});

module.exports = router;
