require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { scheduleJobs } = require('./services/scheduler');
const logger = require('./config/logger');

// 라우터
const authRoutes     = require('./routes/auth');
const taskRoutes     = require('./routes/tasks');
const reportRoutes   = require('./routes/reports');
const issueRoutes    = require('./routes/issues');
const aiRoutes       = require('./routes/ai');
const teamRoutes     = require('./routes/teams');
const kpiRoutes      = require('./routes/kpis');
const budgetRoutes   = require('./routes/budgets');
const adminRoutes    = require('./routes/admin');

const app = express();

// ── 보안 미들웨어 ──────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// API Rate Limit (AI 엔드포인트는 별도 제한 적용)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);

// ── 라우터 등록 ──────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/tasks',   taskRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/issues',  issueRoutes);
app.use('/api/ai',      aiRoutes);
app.use('/api/teams',   teamRoutes);
app.use('/api/kpis',    kpiRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/admin',   adminRoutes);

// ── 헬스체크 ──────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── 에러 핸들러 ──────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ── 서버 시작 ──────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`DT Tracker API running on port ${PORT}`);
  scheduleJobs();  // cron 등록 (Weekly Briefing 등)
});
