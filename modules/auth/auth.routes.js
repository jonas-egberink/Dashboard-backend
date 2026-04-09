// modules/auth/auth.routes.js
// Endpoints: POST /api/auth/login | /registreer   GET /api/auth/ik

const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const supabase   = require('../../core/supabase');
const { vereisLogin } = require('../../core/auth');
const { ok, fout }   = require('../../core/response');
const router     = express.Router();

// ── Hulpfunctie: maak een JWT token ──────────────────────────
function maakToken(gebruiker) {
  return jwt.sign(
    { id: gebruiker.id, email: gebruiker.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ── POST /api/auth/registreer ─────────────────────────────────
router.post('/registreer', async (req, res, next) => {
  try {
    const { email, wachtwoord, naam } = req.body;
    if (!email || !wachtwoord)        return res.status(400).json(fout('Email en wachtwoord zijn verplicht.', 400));
    if (wachtwoord.length < 8)        return res.status(400).json(fout('Wachtwoord moet minimaal 8 tekens zijn.', 400));

    const hash = await bcrypt.hash(wachtwoord, 12);
    const { data, error } = await supabase
      .from('gebruikers')
      .insert({ email: email.toLowerCase().trim(), wachtwoord: hash, naam })
      .select('id, email, naam')
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json(fout('Dit emailadres is al in gebruik.', 409));
      throw error;
    }

    res.status(201).json(ok({ token: maakToken(data), gebruiker: data }, 201));
  } catch (err) { next(err); }
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, wachtwoord } = req.body;
    if (!email || !wachtwoord) return res.status(400).json(fout('Email en wachtwoord zijn verplicht.', 400));

    const { data: gebruiker } = await supabase
      .from('gebruikers')
      .select('id, email, naam, wachtwoord')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (!gebruiker) return res.status(401).json(fout('Onjuist emailadres of wachtwoord.', 401));

    const geldig = await bcrypt.compare(wachtwoord, gebruiker.wachtwoord);
    if (!geldig)  return res.status(401).json(fout('Onjuist emailadres of wachtwoord.', 401));

    const { wachtwoord: _, ...veilig } = gebruiker;
    res.json(ok({ token: maakToken(veilig), gebruiker: veilig }));
  } catch (err) { next(err); }
});

// ── GET /api/auth/ik ──────────────────────────────────────────
router.get('/ik', vereisLogin, async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('gebruikers')
      .select('id, email, naam, aangemaakt')
      .eq('id', req.gebruiker.id)
      .single();
    res.json(ok(data));
  } catch (err) { next(err); }
});

module.exports = router;
