const { Pool } = require('pg');

// 환경변수에서만 읽음 — 코드에 직접 입력 금지
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('DB Pool error:', err.message);
});

module.exports = pool;
