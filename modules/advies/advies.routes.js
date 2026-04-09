// modules/advies/advies.routes.js
// AI portfolio analyse via Claude API
// DISCLAIMER: Geen officieel financieel advies.

const express              = require('express');
const { vereisLogin }      = require('../../core/auth');
const { ok, fout }         = require('../../core/response');
const { berekenPortfolio } = require('../portfolio/portfolio.service');
const supabase             = require('../../core/supabase');
const router               = express.Router();

router.use(vereisLogin);

router.post('/', async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json(fout('ANTHROPIC_API_KEY niet ingesteld in Railway variables.', 503));
    }

    // Portfolio data ophalen
    const portfolio = await berekenPortfolio(req.gebruiker.id);
    const actief    = portfolio.posities.filter(p => p.aantalAandelen > 0);

    // Watchlist ophalen
    const { data: watchlistData } = await supabase
      .from('pagina_data')
      .select('waarde')
      .eq('gebruiker_id', req.gebruiker.id)
      .eq('pagina', 'watchlist');
    const watchlist = (watchlistData || []).map(r => r.waarde).filter(Boolean);

    // Recent nieuws ophalen voor context
    const { data: nieuws } = await supabase
      .from('nieuws')
      .select('ticker, titel, sentiment')
      .eq('gebruiker_id', req.gebruiker.id)
      .order('gepubliceerd', { ascending: false })
      .limit(20);

    // Portfolio samenvatting
    const portfolioTekst = actief.length
      ? actief.map(p =>
          `- ${p.ticker} (${p.naam}): ${fmt(p.aantalAandelen, 4)} stuks @ gem. €${fmt(p.gemiddeldeKostprijs)}, huidige koers €${fmt(p.huidigePrijs)}, ongerealiseerd ${p.ongrealiseerdGV >= 0 ? '+' : ''}€${fmt(p.ongrealiseerdGV)} (${fmt(p.ongrealiseerdPct * 100, 1)}%), rekening: ${p.rekening}`
        ).join('\n')
      : 'Geen actieve posities.';

    const watchlistTekst = watchlist.length
      ? watchlist.map(w => `- ${w.ticker} (${w.naam}): ${w.reden || 'geen reden'}, tags: ${w.tags || 'geen'}`).join('\n')
      : 'Leeg.';

    const nieuwsTekst = (nieuws || []).length
      ? nieuws.slice(0, 10).map(n => `- [${n.sentiment}] ${n.ticker || 'Markt'}: ${n.titel}`).join('\n')
      : 'Geen recent nieuws beschikbaar.';

    const prompt = `Je bent een ervaren onafhankelijke financieel analist. Analyseer dit portfolio en geef concrete, eerlijke aanbevelingen.

PORTFOLIO (actieve posities):
${portfolioTekst}

TOTALEN:
- Waarde: €${fmt(portfolio.totalen.portfolioWaarde)}
- Ongerealiseerd: ${portfolio.totalen.ongrealiseerdGV >= 0 ? '+' : ''}€${fmt(portfolio.totalen.ongrealiseerdGV)}
- Gerealiseerd: ${portfolio.totalen.grealiseerdGV >= 0 ? '+' : ''}€${fmt(portfolio.totalen.grealiseerdGV)}

WATCHLIST (overweegt te kopen):
${watchlistTekst}

RECENT NIEUWS:
${nieuwsTekst}

Geef je analyse ALLEEN als JSON, geen tekst erbuiten:
{
  "samenvatting": "2-3 zinnen over de staat van het portfolio",
  "diversificatie": "Beoordeling van spreiding en concentratierisico",
  "aanbevelingen": [
    {
      "ticker": "TICKER",
      "naam": "Naam",
      "actie": "KOPEN of HOUDEN of VERMINDEREN of VERKOPEN",
      "reden": "Concrete onderbouwing in 2-3 zinnen. Wees eerlijk, ook over risicos.",
      "risico": "LAAG of MIDDEL of HOOG",
      "tijdshorizon": "KORT (< 1 jaar) of MIDDEL (1-3 jaar) of LANG (> 3 jaar)"
    }
  ],
  "risicos": ["Risico 1", "Risico 2", "Risico 3"],
  "disclaimer": "Dit is geen officieel financieel advies. Doe altijd eigen onderzoek voor je investeert."
}

Regels:
- Geef max 5 aanbevelingen, focus op de meest relevante
- Wees eerlijk over verlieslatende posities
- Overweeg nieuws bij je analyse
- Houd rekening met concentratierisico`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error('Claude API: ' + (err.error?.message || response.status));
    }

    const aiData = await response.json();
    const tekst  = aiData.content?.[0]?.text || '{}';

    let advies;
    try {
      advies = JSON.parse(tekst.replace(/```json|```/g, '').trim());
    } catch {
      advies = {
        samenvatting: 'De analyse kon niet worden verwerkt. Probeer het opnieuw.',
        aanbevelingen: [],
        risicos: [],
        disclaimer: 'Dit is geen officieel financieel advies.'
      };
    }

    res.json(ok({ advies, gegenereerd: new Date().toISOString() }));
  } catch (err) { next(err); }
});

// Hulpfunctie voor nette getallen in de prompt
function fmt(v, d = 2) {
  return Number(v).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

module.exports = router;
