const cron = require('node-cron');
const pool = require('../../config/db');
const aiService = require('./ai');
const logger = require('../config/logger');

function scheduleJobs() {
  // 매주 금요일 17:00 — Weekly Briefing 자동 생성
  cron.schedule('0 17 * * 5', async () => {
    logger.info('[Cron] Weekly Briefing 생성 시작');
    try {
      const { rows: teams } = await pool.query(`
        SELECT tm.name, COUNT(t.id) AS total,
          SUM(CASE WHEN t.status='at_risk' THEN 1 ELSE 0 END) AS at_risk,
          SUM(CASE WHEN t.status='delayed' THEN 1 ELSE 0 END) AS delayed
        FROM teams tm LEFT JOIN tasks t ON t.team_id = tm.id GROUP BY tm.name
      `);
      const { rows: issues } = await pool.query(
        `SELECT title, type, severity FROM issues WHERE status='open' ORDER BY severity DESC LIMIT 20`
      );
      const weekLabel = new Date().toISOString().slice(0,10);
      const briefing = await aiService.generateWeeklyBriefing({ teamsSnapshot: teams, issuesSnapshot: issues, weekLabel });

      // 본부장에게 알림 전송
      await pool.query(`
        INSERT INTO notifications (user_id, type, title, message)
        SELECT id, 'briefing', '[AI] ${weekLabel} 주간 브리핑 생성 완료', $1
        FROM users WHERE role = 'HQ'
      `, [briefing]);

      logger.info('[Cron] Weekly Briefing 생성 완료');
    } catch (err) {
      logger.error('[Cron] Weekly Briefing 실패:', err.message);
    }
  }, { timezone: 'Asia/Seoul' });

  // 매일 09:00 — 마감 임박 과업 알림 (D-3, D-1)
  cron.schedule('0 9 * * *', async () => {
    logger.info('[Cron] 마감 임박 알림 처리');
    try {
      const { rows: tasks } = await pool.query(`
        SELECT t.id, t.title, t.owner_id, t.team_id, t.due_date,
               (t.due_date - CURRENT_DATE) AS days_left
        FROM tasks t
        WHERE t.status NOT IN ('completed','cancelled')
          AND (t.due_date - CURRENT_DATE) IN (3, 1, 0, -1)
      `);

      for (const task of tasks) {
        let title, type;
        if (task.days_left > 0) { title = `마감 D-${task.days_left}: ${task.title}`; type = 'deadline'; }
        else { title = `마감 초과: ${task.title}`; type = 'overdue'; }

        await pool.query(`
          INSERT INTO notifications (user_id, type, title, ref_table, ref_id)
          VALUES ($1, $2, $3, 'tasks', $4)
        `, [task.owner_id, type, title, task.id]);
      }
    } catch (err) {
      logger.error('[Cron] 마감 알림 실패:', err.message);
    }
  }, { timezone: 'Asia/Seoul' });

  // 수요일 09:00 — 주간 보고 입력 요청 알림
  cron.schedule('0 9 * * 3', async () => {
    logger.info('[Cron] 주간 보고 입력 요청 알림 발송');
    try {
      await pool.query(`
        INSERT INTO notifications (user_id, type, title)
        SELECT id, 'reminder', '[주간보고] 금주 실적 입력 기한: 목요일 18:00'
        FROM users WHERE role IN ('MB','TL') AND is_active = TRUE
      `);
    } catch (err) {
      logger.error('[Cron] 주간 보고 알림 실패:', err.message);
    }
  }, { timezone: 'Asia/Seoul' });
}

module.exports = { scheduleJobs };
