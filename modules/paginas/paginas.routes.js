// modules/paginas/paginas.routes.js
// Generieke key-value opslag per gebruiker per pagina.
// Hiermee sla je data op voor custom pagina's zonder extra DB tabellen.
// Endpoints: GET | PUT | DELETE /api/paginas/:pagina/:sleutel

const express        = require('express');
const supabase       = require('../../core/supabase');
const { vereisLogin} = require('../../core/auth');
const { ok, fout }   = require('../../core/response');
const router         = express.Router();

router.use(vereisLogin);

// GET /api/paginas/:pagina — alle data van één pagina als { sleutel: waarde }
router.get('/:pagina', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('pagina_data')
      .select('sleutel, waarde, bijgewerkt')
      .eq('gebruiker_id', req.gebruiker.id)
      .eq('pagina', req.params.pagina);
    if (error) throw error;
    const resultaat = {};
    data.forEach(rij => { resultaat[rij.sleutel] = rij.waarde; });
    res.json(ok(resultaat));
  } catch (err) { next(err); }
});

// PUT /api/paginas/:pagina/:sleutel — sla één item op (maakt aan of overschrijft)
router.put('/:pagina/:sleutel', async (req, res, next) => {
  try {
    const { waarde } = req.body;
    if (waarde === undefined) return res.status(400).json(fout('waarde is verplicht.', 400));
    const { error } = await supabase
      .from('pagina_data')
      .upsert({
        gebruiker_id: req.gebruiker.id,
        pagina:     req.params.pagina,
        sleutel:    req.params.sleutel,
        waarde,
        bijgewerkt: new Date().toISOString(),
      }, { onConflict: 'gebruiker_id,pagina,sleutel' });
    if (error) throw error;
    res.json(ok({ opgeslagen: true }));
  } catch (err) { next(err); }
});

// DELETE /api/paginas/:pagina/:sleutel — verwijder één item
router.delete('/:pagina/:sleutel', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('pagina_data')
      .delete()
      .eq('gebruiker_id', req.gebruiker.id)
      .eq('pagina', req.params.pagina)
      .eq('sleutel', req.params.sleutel);
    if (error) throw error;
    res.json(ok({ verwijderd: true }));
  } catch (err) { next(err); }
});

// DELETE /api/paginas/:pagina — verwijder alle data van een pagina
router.delete('/:pagina', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('pagina_data')
      .delete()
      .eq('gebruiker_id', req.gebruiker.id)
      .eq('pagina', req.params.pagina);
    if (error) throw error;
    res.json(ok({ verwijderd: true }));
  } catch (err) { next(err); }
});

module.exports = router;
