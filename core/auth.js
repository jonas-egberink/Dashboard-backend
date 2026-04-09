// core/auth.js
// JWT middleware — beschermt alle routes die inloggen vereisen.
// Gebruik: const { vereisLogin } = require('../../core/auth');

const jwt = require('jsonwebtoken');

function vereisLogin(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Niet ingelogd — stuur een Bearer token mee.' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.gebruiker = { id: payload.id, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Token ongeldig of verlopen.' });
  }
}

module.exports = { vereisLogin };
