const jwt = require('jsonwebtoken');

if (!process.env.ADMIN_JWT_SECRET) {
  throw new Error('Missing required env var ADMIN_JWT_SECRET');
}

function requireAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    const err = new Error('Missing Authorization token');
    err.statusCode = 401;
    throw err;
  }

  try {
    return jwt.verify(token, process.env.ADMIN_JWT_SECRET);
  } catch (e) {
    const err = new Error('Invalid or expired token');
    err.statusCode = 401;
    throw err;
  }
}

module.exports = { requireAdmin };
