// modules/portfolio/portfolio.service.js
// FIFO berekening van portfolio posities.
// Losgekoppeld van de route zodat je het ook in andere modules kunt hergebruiken.

const supabase          = require('../../core/supabase');
const { getKoersen }    = require('../../core/koersen');

async function berekenPortfolio(gebruikerId) {
  // 1. Haal aandelen op
  const { data: aandelen, error: ae } = await supabase
    .from('aandelen')
    .select('*')
    .eq('gebruiker_id', gebruikerId)
    .order('ticker');
  if (ae) throw ae;

  // 2. Haal alle transacties op
  const { data: transacties, error: te } = await supabase
    .from('transacties')
    .select('*, aandelen(ticker, naam, valuta)')
    .eq('gebruiker_id', gebruikerId)
    .order('datum', { ascending: false });
  if (te) throw te;

  // 3. Live koersen ophalen
  const tickers  = aandelen.map(a => a.ticker);
  const koersen  = tickers.length ? await getKoersen(tickers) : [];
  const koersMap = {};
  koersen.forEach(k => { if (k) koersMap[k.ticker] = k; });

  // 4. Bereken positie per aandeel via FIFO
  const posities = aandelen.map(aandeel => {
    const txs   = transacties.filter(t => t.aandeel_id === aandeel.id);
    const koers = koersMap[aandeel.ticker];

    let aantalAandelen = 0;
    let totaleKost     = 0;
    let grealiseerdGV  = 0;
    const voorraad     = []; // FIFO stapel: [{ aantal, prijs }]

    [...txs]
      .sort((a, b) => new Date(a.datum) - new Date(b.datum))
      .forEach(tx => {
        if (tx.type === 'Buy') {
          voorraad.push({ aantal: tx.aantal, prijs: tx.prijs });
          aantalAandelen += tx.aantal;
          totaleKost     += tx.aantal * tx.prijs + (tx.fees || 0);
        } else if (tx.type === 'Sell') {
          let teVerkopen  = tx.aantal;
          let kostVerkocht = 0;
          while (teVerkopen > 0 && voorraad.length > 0) {
            const lot    = voorraad[0];
            const genomen = Math.min(lot.aantal, teVerkopen);
            kostVerkocht  += genomen * lot.prijs;
            lot.aantal    -= genomen;
            teVerkopen    -= genomen;
            totaleKost    -= genomen * lot.prijs;
            aantalAandelen -= genomen;
            if (lot.aantal <= 0) voorraad.shift();
          }
          grealiseerdGV += (tx.prijs * tx.aantal - (tx.fees || 0)) - kostVerkocht;
        }
      });

    const gemKost    = aantalAandelen > 0 ? totaleKost / aantalAandelen : 0;
    const marktWaarde = aantalAandelen * (koers?.prijs ?? 0);
    const ongrealGV  = aantalAandelen > 0 ? marktWaarde - totaleKost : 0;
    const ongrealPct = totaleKost > 0 ? ongrealGV / totaleKost : 0;

    return {
      id:                  aandeel.id,
      ticker:              aandeel.ticker,
      naam:                aandeel.naam,
      exchange:            aandeel.exchange,
      valuta:              aandeel.valuta,
      aantalAandelen:      rond(aantalAandelen, 6),
      gemiddeldeKostprijs: rond(gemKost),
      totaleKost:          rond(totaleKost),
      marktWaarde:         rond(marktWaarde),
      ongrealiseerdGV:     rond(ongrealGV),
      ongrealiseerdPct:    rond(ongrealPct, 4),
      grealiseerdGV:       rond(grealiseerdGV),
      totaalGV:            rond(ongrealGV + grealiseerdGV),
      huidigePrijs:        koers?.prijs        ?? null,
      dagWijziging:        koers?.wijziging    ?? null,
      dagWijzigingPct:     koers?.wijzigingPct ?? null,
      koersBijgewerkt:     koers?.bijgewerkt   ?? null,
      aantalTransacties:   txs.length,
    };
  });

  // 5. Totaalcijfers
  const actief  = posities.filter(p => p.aantalAandelen > 0);
  const totalen = {
    portfolioWaarde:   rond(actief.reduce((s, p) => s + p.marktWaarde, 0)),
    totaleKost:        rond(actief.reduce((s, p) => s + p.totaleKost, 0)),
    ongrealiseerdGV:   rond(actief.reduce((s, p) => s + p.ongrealiseerdGV, 0)),
    grealiseerdGV:     rond(posities.reduce((s, p) => s + p.grealiseerdGV, 0)),
    aantalTransacties: transacties.length,
  };
  totalen.totaalGV = rond(totalen.ongrealiseerdGV + totalen.grealiseerdGV);

  return { posities, totalen, bijgewerkt: new Date().toISOString() };
}

const rond = (v, d = 2) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

module.exports = { berekenPortfolio };
