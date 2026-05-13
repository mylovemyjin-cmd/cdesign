const express = require('express');
const router = express.Router();
const { authenticate, requireMinRole, teamScope } = require('../middleware/auth');
const pool = require('../../config/db');
const aiService = require('../services/ai');

// 과업 목록 조회 (팀 범위 적용)
router.get('/', authenticate, teamScope, async (req, res) => {
  try {
    const { status, week } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (req.scopeTeamId) { where.push(`t.team_id = $${idx++}`); params.push(req.scopeTeamId); }
    if (status)           { where.push(`t.status = $${idx++}`); params.push(status); }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await pool.query(`
      SELECT t.*, u.name AS owner_name, tm.name AS team_name,
             si.code AS initiative_code
      FROM tasks t
      JOIN users u  ON t.owner_id    = u.id
      JOIN teams tm ON t.team_id     = tm.id
      LEFT JOIN strategic_initiatives si ON t.initiative_id = si.id
      ${whereSQL}
      ORDER BY t.due_date ASC
    `, params);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 과업 상세
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, u.name AS owner_name, tm.name AS team_name
      FROM tasks t
      JOIN users u  ON t.owner_id = u.id
      JOIN teams tm ON t.team_id  = tm.id
      WHERE t.id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: '과업을 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 과업 생성
router.post('/', authenticate, requireMinRole('MB'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { title, description, category, initiative_id, due_date, priority } = req.body;

    const { rows } = await client.query(`
      INSERT INTO tasks (team_id, owner_id, title, description, category, initiative_id, due_date, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [req.user.team_id, req.user.id, title, description, category, initiative_id, due_date, priority]);

    // 변경 이력 기록
    await client.query(`
      INSERT INTO change_logs (table_name, record_id, actor_id, action, comment)
      VALUES ('tasks', $1, $2, 'create', '과업 생성')
    `, [rows[0].id, req.user.id]);

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 과업 수정 (상태 변경 시 Smart Alert 트리거)
router.patch('/:id', authenticate, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // 기존 데이터 조회
    const { rows: old } = await dbClient.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: '과업을 찾을 수 없습니다.' });

    const task = old[0];
    // 권한 체크: 본인 과업 또는 팀장/본부장만
    const isOwner = task.owner_id === req.user.id;
    const isLeader = ['HQ','TL'].includes(req.user.role);
    if (!isOwner && !isLeader)
      return res.status(403).json({ error: '수정 권한이 없습니다.' });

    const { title, status, due_date, priority, is_highlight, quantified_result } = req.body;

    const { rows } = await dbClient.query(`
      UPDATE tasks SET
        title = COALESCE($1, title),
        status = COALESCE($2, status),
        due_date = COALESCE($3, due_date),
        priority = COALESCE($4, priority),
        is_highlight = COALESCE($5, is_highlight),
        quantified_result = COALESCE($6, quantified_result),
        completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
        updated_at = NOW()
      WHERE id = $7 RETURNING *
    `, [title, status, due_date, priority, is_highlight, quantified_result, req.params.id]);

    // 상태 변경 이력 기록
    if (status && status !== task.status) {
      await dbClient.query(`
        INSERT INTO change_logs (table_name, record_id, actor_id, action, field_name, old_value, new_value)
        VALUES ('tasks', $1, $2, 'update', 'status', $3, $4)
      `, [task.id, req.user.id, task.status, status]);

      // Smart Alert: at_risk/delayed 전환 시 AI 코멘트 초안 (백그라운드)
      if (['at_risk','delayed'].includes(status)) {
        aiService.smartAlert({
          task: { title: task.title, ownerName: req.user.name },
          changeEvent: { field: 'status', newValue: status },
        }).then(draft => {
          // 알림 테이블에 초안 저장 (팀장에게 전달)
          pool.query(`
            INSERT INTO notifications (user_id, type, title, message, ref_table, ref_id)
            SELECT leader_id, 'smart_alert', $1, $2, 'tasks', $3
            FROM teams WHERE id = $4 AND leader_id IS NOT NULL
          `, [`[AI 초안] ${task.title} 상태 변경`, draft, task.id, task.team_id]);
        }).catch(() => {}); // AI 실패해도 과업 수정은 성공
      }
    }

    await dbClient.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

module.exports = router;
