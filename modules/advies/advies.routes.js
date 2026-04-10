// modules/advies/advies.routes.js
// AI portfolio analyse via Google AI Studio (Gemini)

const express              = require('express');
const { vereisLogin }      = require('../../core/auth');
const { ok, fout }         = require('../../core/response');
const { berekenPortfolio } = require('../portfolio/portfolio.service');
const supabase             = require('../../core/supabase');
const router               = express.Router();

router.use(vereisLogin);

// Cache: max 1x per uur per gebruiker
const adviesCache = new Map();
const CACHE_MS    = 60 * 60 * 1000;

router.post('/', async (req, res, next) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY; // naam behouden, is Google AI Studio key
    if (!apiKey) return res.status(503).json(fout('AI API key niet ingesteld in Railway variables.', 503));

    const uid    = req.gebruiker.id;
    const cached = adviesCache.get(uid);
    if (cached && (Date.now() - cached.tijdstip) < CACHE_MS) {
      return res.json(ok({ ...cached.data, uitCache: true }));
    }

    const portfolio = await berekenPortfolio(uid);
    const actief    = portfolio.posities.filter(p => p.aantalAandelen > 0);

    const { data: watchlistData } = await supabase
      .from('pagina_data').select('waarde')
      .eq('gebruiker_id', uid).eq('pagina', 'watchlist');
    const watchlist = (watchlistData || []).map(r => r.waarde).filter(Boolean);

    const { data: nieuws } = await supabase
      .from('nieuws').select('ticker, titel, sentiment')
      .eq('gebruiker_id', uid)
      .order('gepubliceerd', { ascending: false }).limit(15);

    const portfolioTekst = actief.length
      ? actief.map(p => `- ${p.ticker} (${p.naam}): ${Number(p.aantalAandelen).toFixed(4)} stuks, gem. kostprijs €${Number(p.gemiddeldeKostprijs).toFixed(2)}, huidig €${Number(p.huidigePrijs || 0).toFixed(2)}, ongerealiseerd ${p.ongrealiseerdGV >= 0 ? '+' : ''}€${Number(p.ongrealiseerdGV).toFixed(2)} (${(p.ongrealiseerdPct * 100).toFixed(1)}%), rekening: ${p.rekening}`).join('\n')
      : 'Geen actieve posities.';

    const watchlistTekst = watchlist.length
      ? watchlist.map(w => `- ${w.ticker}: ${w.reden || 'geen reden'}`).join('\n')
      : 'Leeg.';

    const nieuwsTekst = (nieuws || []).length
      ? nieuws.map(n => `- [${n.sentiment}] ${n.ticker || 'Markt'}: ${n.titel}`).join('\n')
      : 'Geen recent nieuws.';

    const prompt = `Je bent een ervaren onafhankelijke beleggingsanalist. Analyseer dit portfolio en geef concrete aanbevelingen.

ACTIEVE POSITIES:
${portfolioTekst}

TOTALEN:
- Portfolio waarde: €${Number(portfolio.totalen.portfolioWaarde).toFixed(2)}
- Ongerealiseerd: ${portfolio.totalen.ongrealiseerdGV >= 0 ? '+' : ''}€${Number(portfolio.totalen.ongrealiseerdGV).toFixed(2)}
- Gerealiseerd: ${portfolio.totalen.grealiseerdGV >= 0 ? '+' : ''}€${Number(portfolio.totalen.grealiseerdGV).toFixed(2)}

WATCHLIST (overweegt te kopen):
${watchlistTekst}

RECENT NIEUWS:
${nieuwsTekst}

Geef je analyse ALLEEN als JSON, geen markdown of tekst erbuiten:
{
  "samenvatting": "2-3 zinnen over de staat van het portfolio",
  "diversificatie": "Beoordeling van spreiding en concentratierisico",
  "aanbevelingen": [
    {
      "ticker": "TICKER of nieuw aandeel",
      "naam": "Volledige naam",
      "actie": "KOPEN of HOUDEN of VERMINDEREN of VERKOPEN",
      "reden": "Concrete onderbouwing in 2-3 zinnen. Wees eerlijk ook over risicos.",
      "risico": "LAAG of MIDDEL of HOOG",
      "tijdshorizon": "KORT of MIDDEL of LANG"
    }
  ],
  "risicos": ["Risico 1", "Risico 2"],
  "disclaimer": "Dit is geen officieel financieel advies. Doe altijd eigen onderzoek."
}

Regels:
- Max 6 aanbevelingen (mix van houden/kopen/verkopen)
- Overweeg ook aandelen van watchlist om te kopen
- Wees eerlijk over verliesposities
- Houd rekening met nieuws en diversificatie`;

    // Google AI Studio endpoint
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.3 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error('Google AI: ' + (err.error?.message || response.status));
    }

    const aiData = await response.json();
    const tekst  = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let advies;
    try {
      advies = JSON.parse(tekst.replace(/```json|```/g, '').trim());
    } catch {
      advies = {
        samenvatting:  'Analyse kon niet worden verwerkt. Probeer opnieuw.',
        diversificatie: '',
        aanbevelingen: [],
        risicos:       [],
        disclaimer:    'Dit is geen officieel financieel advies.',
      };
    }

    const resultaat = { advies, gegenereerd: new Date().toISOString() };
    adviesCache.set(uid, { data: resultaat, tijdstip: Date.now() });
    res.json(ok(resultaat));
  } catch (err) { next(err); }
});

// GET — haal gecached advies op
router.get('/', async (req, res, next) => {
  try {
    const cached = adviesCache.get(req.gebruiker.id);
    if (cached) return res.json(ok({ ...cached.data, uitCache: true }));
    res.json(ok(null));
  } catch (err) { next(err); }
});

module.exports = router;
