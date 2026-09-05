// Vercel Serverless Function: Admin authentication
// Replaces the old client-side plaintext email/password check in admin.html.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH || !ADMIN_JWT_SECRET) {
  throw new Error('Missing required env vars: ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_JWT_SECRET');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });
    }

    const emailMatches = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const passwordMatches = emailMatches && await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

    if (!emailMatches || !passwordMatches) {
      // Generic message on purpose — never reveal which field was wrong.
      return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign({ sub: ADMIN_EMAIL, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '12h' });
    return res.status(200).json({ success: true, token });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
