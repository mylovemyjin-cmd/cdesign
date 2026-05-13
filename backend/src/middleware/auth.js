const jwt = require('jsonwebtoken');

// JWT 검증 미들웨어
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: '인증이 필요합니다.' });

  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
};

// 역할 기반 권한 제어 (RBAC)
// 역할 계층: HQ > TL > MB > VW
const ROLE_LEVEL = { HQ: 4, TL: 3, MB: 2, VW: 1 };

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.user.role))
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  next();
};

const requireMinRole = (minRole) => (req, res, next) => {
  if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[minRole])
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  next();
};

// 팀 범위 접근 제어: 본부장은 전체, 팀장/팀원은 자기 팀만
const teamScope = (req, res, next) => {
  const { role, team_id } = req.user;
  if (role === 'HQ') {
    req.scopeTeamId = null;  // 전체 허용
  } else {
    req.scopeTeamId = team_id;
  }
  next();
};

module.exports = { authenticate, requireRole, requireMinRole, teamScope };
