// modules/transacties/transacties.routes.js
const express        = require('express');
const supabase       = require('../../core/supabase');
const { vereisLogin} = require('../../core/auth');
const { ok, fout }   = require('../../core/response');
const router         = express.Router();

router.use(vereisLogin);

// GET /api/transacties — ?aandeel_id= &ticker= &type= &van= &tot=
router.get('/', async (req, res, next) => {
  try {
    const { ticker, type, van, tot, aandeel_id } = req.query;
    let query = supabase
      .from('transacties')
      .select('*, aandelen(ticker, naam, valuta, exchange)')
      .eq('gebruiker_id', req.gebruiker.id)
      .order('datum', { ascending: false })
      .order('aangemaakt', { ascending: false });

    if (type)       query = query.eq('type', type);
    if (van)        query = query.gte('datum', van);
    if (tot)        query = query.lte('datum', tot);
    if (aandeel_id) query = query.eq('aandeel_id', aandeel_id);

    if (ticker) {
      const { data: a } = await supabase
        .from('aandelen').select('id')
        .eq('gebruiker_id', req.gebruiker.id)
        .eq('ticker', ticker.toUpperCase()).single();
      if (a) query = query.eq('aandeel_id', a.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const geformatteerd = data.map(t => ({
      id:         t.id,
      aandeel_id: t.aandeel_id,
      datum:      t.datum,
      type:       t.type,
      ticker:     t.aandelen?.ticker ?? '',
      naam:       t.aandelen?.naam   ?? '',
      valuta:     t.valuta || t.aandelen?.valuta || 'EUR',
      aantal:     t.aantal,
      prijs:      t.prijs,
      fees:       t.fees,
      totaal:     Math.round((t.aantal * t.prijs + t.fees) * 100) / 100,
      notitie:    t.notitie,
    }));

    res.json(ok(geformatteerd));
  } catch (err) { next(err); }
});

// POST /api/transacties
router.post('/', async (req, res, next) => {
  try {
    const { aandeel_id, type, datum, aantal, prijs, fees, valuta, notitie } = req.body;
    if (!aandeel_id || !type || !datum || !aantal || !prijs)
      return res.status(400).json(fout('aandeel_id, type, datum, aantal en prijs zijn verplicht.', 400));
    if (!['Buy', 'Sell'].includes(type))
      return res.status(400).json(fout('type moet "Buy" of "Sell" zijn.', 400));

    const { data: aandeel } = await supabase
      .from('aandelen').select('id, ticker')
      .eq('id', aandeel_id).eq('gebruiker_id', req.gebruiker.id).single();
    if (!aandeel) return res.status(403).json(fout('Aandeel niet gevonden.', 403));

    const { data, error } = await supabase
      .from('transacties')
      .insert({
        gebruiker_id: req.gebruiker.id,
        aandeel_id, type, datum,
        aantal:  parseFloat(aantal),
        prijs:   parseFloat(prijs),
        fees:    parseFloat(fees ?? 0),
        valuta:  (valuta || 'EUR').toUpperCase(),
        notitie: notitie ?? null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(ok(data, 201));
  } catch (err) { next(err); }
});

// PATCH /api/transacties/bulk-valuta — pas valuta aan voor alle transacties van een aandeel
router.patch('/bulk-valuta', async (req, res, next) => {
  try {
    const { aandeel_id, valuta } = req.body;
    if (!aandeel_id || !valuta) return res.status(400).json(fout('aandeel_id en valuta zijn verplicht.', 400));

    // Verifieer dat het aandeel van deze gebruiker is
    const { data: aandeel } = await supabase
      .from('aandelen').select('id')
      .eq('id', aandeel_id).eq('gebruiker_id', req.gebruiker.id).single();
    if (!aandeel) return res.status(403).json(fout('Aandeel niet gevonden.', 403));

    const { error } = await supabase
      .from('transacties')
      .update({ valuta: valuta.toUpperCase() })
      .eq('aandeel_id', aandeel_id)
      .eq('gebruiker_id', req.gebruiker.id);
    if (error) throw error;
    res.json(ok({ bijgewerkt: true }));
  } catch (err) { next(err); }
});

// PATCH /api/transacties/:id — pas bestaande transactie aan
router.patch('/:id', async (req, res, next) => {
  try {
    const { type, datum, aantal, prijs, fees, valuta, notitie } = req.body;
    const { data: bestaand } = await supabase
      .from('transacties').select('id')
      .eq('id', req.params.id).eq('gebruiker_id', req.gebruiker.id).single();
    if (!bestaand) return res.status(404).json(fout('Transactie niet gevonden.', 404));

    const update = {};
    if (type    !== undefined) update.type    = type;
    if (datum   !== undefined) update.datum   = datum;
    if (aantal  !== undefined) update.aantal  = parseFloat(aantal);
    if (prijs   !== undefined) update.prijs   = parseFloat(prijs);
    if (fees    !== undefined) update.fees    = parseFloat(fees);
    if (valuta  !== undefined) update.valuta  = valuta.toUpperCase();
    if (notitie !== undefined) update.notitie = notitie;

    const { data, error } = await supabase
      .from('transacties').update(update)
      .eq('id', req.params.id).eq('gebruiker_id', req.gebruiker.id)
      .select().single();
    if (error) throw error;
    res.json(ok(data));
  } catch (err) { next(err); }
});

// DELETE /api/transacties/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('transacties').delete()
      .eq('id', req.params.id).eq('gebruiker_id', req.gebruiker.id);
    if (error) throw error;
    res.json(ok({ verwijderd: true }));
  } catch (err) { next(err); }
});

module.exports = router;
