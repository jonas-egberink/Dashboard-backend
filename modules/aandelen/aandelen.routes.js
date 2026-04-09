// modules/aandelen/aandelen.routes.js
// Endpoints: GET | POST | DELETE /api/aandelen   GET /api/aandelen/zoek

const express              = require('express');
const supabase             = require('../../core/supabase');
const { zoekAandeel }      = require('../../core/koersen');
const { vereisLogin }      = require('../../core/auth');
const { ok, fout }         = require('../../core/response');
const router               = express.Router();

router.use(vereisLogin);

// ── GET /api/aandelen ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('aandelen')
      .select('*')
      .eq('gebruiker_id', req.gebruiker.id)
      .order('ticker');
    if (error) throw error;
    res.json(ok(data));
  } catch (err) { next(err); }
});

// ── GET /api/aandelen/zoek?ticker=AAPL ───────────────────────
// Zoek een ticker op Yahoo Finance — gebruik dit vóór je toevoegt
router.get('/zoek', async (req, res, next) => {
  try {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json(fout('ticker parameter is verplicht.', 400));
    const info = await zoekAandeel(ticker.trim().toUpperCase());
    res.json(ok(info));
  } catch (err) { next(err); }
});

// ── GET /api/aandelen/:id/koers ───────────────────────────────
router.get('/:id/koers', async (req, res, next) => {
  try {
    const { data: aandeel } = await supabase
      .from('aandelen')
      .select('ticker')
      .eq('id', req.params.id)
      .eq('gebruiker_id', req.gebruiker.id)
      .single();
    if (!aandeel) return res.status(404).json(fout('Aandeel niet gevonden.', 404));
    const koers = await zoekAandeel(aandeel.ticker);
    res.json(ok(koers));
  } catch (err) { next(err); }
});

// ── POST /api/aandelen ────────────────────────────────────────
// Stuur alleen { ticker } — backend haalt naam/exchange/valuta automatisch op
router.post('/', async (req, res, next) => {
  try {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json(fout('ticker is verplicht.', 400));

    const schoon = ticker.trim().toUpperCase();

    // Al in bezit?
    const { data: bestaand } = await supabase
      .from('aandelen')
      .select('id')
      .eq('gebruiker_id', req.gebruiker.id)
      .eq('ticker', schoon)
      .single();
    if (bestaand) return res.status(409).json(fout(`${schoon} staat al in je lijst.`, 409));

    // Info ophalen
    const info = await zoekAandeel(schoon);
    if (!info.gevonden) return res.status(404).json(fout(`Ticker ${schoon} niet gevonden op Yahoo Finance.`, 404));

    const { data, error } = await supabase
      .from('aandelen')
      .insert({
        gebruiker_id: req.gebruiker.id,
        ticker:   info.ticker,
        naam:     info.naam,
        exchange: info.exchange,
        valuta:   info.valuta,
        type:     info.type,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(ok({ ...data, huidigePrijs: info.prijs }, 201));
  } catch (err) { next(err); }
});

// ── DELETE /api/aandelen/:id ──────────────────────────────────
// Verwijdert het aandeel én alle bijbehorende transacties (cascade in DB)
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('aandelen')
      .delete()
      .eq('id', req.params.id)
      .eq('gebruiker_id', req.gebruiker.id);
    if (error) throw error;
    res.json(ok({ verwijderd: true }));
  } catch (err) { next(err); }
});

module.exports = router;
