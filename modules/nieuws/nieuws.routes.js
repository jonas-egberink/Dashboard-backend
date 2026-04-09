// modules/nieuws/nieuws.routes.js
const express        = require('express');
const supabase       = require('../../core/supabase');
const { vereisLogin} = require('../../core/auth');
const { ok, fout }   = require('../../core/response');
const { haalNieuws } = require('./nieuws.service');
const router         = express.Router();

router.use(vereisLogin);

// GET /api/nieuws — haal opgeslagen nieuws op
router.get('/', async (req, res, next) => {
  try {
    const { ticker, ongelezen, limit = 50 } = req.query;

    let query = supabase
      .from('nieuws')
      .select('*')
      .eq('gebruiker_id', req.gebruiker.id)
      .order('gepubliceerd', { ascending: false })
      .limit(parseInt(limit));

    if (ticker)               query = query.eq('ticker', ticker.toUpperCase());
    if (ongelezen === 'true') query = query.eq('gelezen', false);

    const { data, error } = await query;
    if (error) throw error;
    res.json(ok(data || []));
  } catch (err) { next(err); }
});

// GET /api/nieuws/teller — ongelezen teller voor notificatie bell
router.get('/teller', async (req, res, next) => {
  try {
    const { count, error } = await supabase
      .from('nieuws')
      .select('*', { count: 'exact', head: true })
      .eq('gebruiker_id', req.gebruiker.id)
      .eq('gelezen', false);
    if (error) throw error;
    res.json(ok({ ongelezen: count || 0 }));
  } catch (err) { next(err); }
});

// POST /api/nieuws/verversen — haal vers nieuws op
router.post('/verversen', async (req, res, next) => {
  try {
    const resultaat = await haalNieuws(req.gebruiker.id);
    res.json(ok(resultaat));
  } catch (err) { next(err); }
});

// PATCH /api/nieuws/:id/gelezen
router.patch('/:id/gelezen', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('nieuws')
      .update({ gelezen: true })
      .eq('id', req.params.id)
      .eq('gebruiker_id', req.gebruiker.id);
    if (error) throw error;
    res.json(ok({ ok: true }));
  } catch (err) { next(err); }
});

// PATCH /api/nieuws/alles-gelezen
router.patch('/alles-gelezen', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('nieuws')
      .update({ gelezen: true })
      .eq('gebruiker_id', req.gebruiker.id)
      .eq('gelezen', false);
    if (error) throw error;
    res.json(ok({ ok: true }));
  } catch (err) { next(err); }
});

module.exports = router;
