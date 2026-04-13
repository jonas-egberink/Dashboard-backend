// modules/portfolio/portfolio.service.js
// FIFO berekening van portfolio posities, gegroepeerd per rekening.
// Alle bedragen worden omgezet naar EUR via live wisselkoersen.

const supabase                  = require('../../core/supabase');
const { getKoersen }            = require('../../core/koersen');
const { getWisselkoersen, naarEUR } = require('../../core/valuta');

async function berekenPortfolio(gebruikerId) {
  // 1. Wisselkoersen ophalen
  const wisselkoersen = await getWisselkoersen();

  // 2. Aandelen ophalen
  const { data: aandelen, error: ae } = await supabase
    .from('aandelen')
    .select('*')
    .eq('gebruiker_id', gebruikerId)
    .order('rekening')
    .order('ticker');
  if (ae) throw ae;

  // 3. Transacties ophalen — inclusief eigen valuta per transactie
  const { data: transacties, error: te } = await supabase
    .from('transacties')
    .select('*, aandelen(ticker, naam, valuta)')
    .eq('gebruiker_id', gebruikerId)
    .order('datum', { ascending: true });
  if (te) throw te;

  // 4. Live koersen ophalen
  const tickers  = aandelen.map(a => a.ticker);
  const koersen  = tickers.length ? await getKoersen(tickers) : [];
  const koersMap = {};
  koersen.forEach(k => { if (k) koersMap[k.ticker] = k; });

  // 5. Bereken positie per aandeel via FIFO
  const posities = aandelen.map(aandeel => {
    const txs   = transacties.filter(t => t.aandeel_id === aandeel.id);
    const koers = koersMap[aandeel.ticker];
    const valuta = aandeel.valuta || koers?.valuta || 'EUR';

    let aantalAandelen = 0;
    let totaleKostEUR  = 0;
    let grealiseerdEUR = 0;
    const voorraad     = []; // FIFO: { aantal, prijsEUR }

    txs.forEach(tx => {
      // Gebruik de valuta van de transactie zelf (niet het aandeel)
      // zodat USD-aankopen correct omgezet worden
      const txValuta = tx.valuta || valuta || 'EUR';
      const prijsEUR = naarEUR(tx.prijs, txValuta, wisselkoersen);
      const feesEUR  = naarEUR(tx.fees || 0, txValuta, wisselkoersen);

      if (tx.type === 'Buy') {
        voorraad.push({ aantal: tx.aantal, prijsEUR });
        aantalAandelen += tx.aantal;
        totaleKostEUR  += tx.aantal * prijsEUR + feesEUR;
      } else if (tx.type === 'Sell') {
        let teVerkopen   = tx.aantal;
        let kostVerkocht = 0;
        while (teVerkopen > 0 && voorraad.length > 0) {
          const lot     = voorraad[0];
          const genomen = Math.min(lot.aantal, teVerkopen);
          kostVerkocht   += genomen * lot.prijsEUR;
          lot.aantal     -= genomen;
          teVerkopen     -= genomen;
          totaleKostEUR  -= genomen * lot.prijsEUR;
          aantalAandelen -= genomen;
          if (lot.aantal <= 0) voorraad.shift();
        }
        grealiseerdEUR += (tx.prijs * tx.aantal - (tx.fees || 0)) * (wisselkoersen[valuta] || 1) - kostVerkocht;
      }
    });

    const gemKostEUR   = aantalAandelen > 0 ? totaleKostEUR / aantalAandelen : 0;
    const huidigEUR    = naarEUR(koers?.prijs ?? 0, valuta, wisselkoersen);
    const marktWaarde  = aantalAandelen * huidigEUR;
    const ongrealGV    = aantalAandelen > 0 ? marktWaarde - totaleKostEUR : 0;
    const ongrealPct   = totaleKostEUR > 0 ? ongrealGV / totaleKostEUR : 0;

    // dagwijziging is al een percentage bij Yahoo Finance v3 (bijv. 0.45 = 0.45%)
    // Niet meer *100 doen — dat deed Yahoo Finance v2
    const dagWijzigingPct = koers?.wijzigingPct ?? null;

    return {
      id:                  aandeel.id,
      ticker:              aandeel.ticker,
      naam:                aandeel.naam,
      exchange:            aandeel.exchange,
      valuta,
      rekening:            aandeel.rekening || 'Standaard',
      aantalAandelen:      rond(aantalAandelen, 6),
      gemiddeldeKostprijs: rond(gemKostEUR),
      totaleKost:          rond(totaleKostEUR),
      marktWaarde:         rond(marktWaarde),
      ongrealiseerdGV:     rond(ongrealGV),
      ongrealiseerdPct:    rond(ongrealPct, 4),
      grealiseerdGV:       rond(grealiseerdEUR),
      totaalGV:            rond(ongrealGV + grealiseerdEUR),
      huidigePrijs:        huidigEUR > 0 ? rond(huidigEUR) : null,
      huidigePrijsOrigineel: koers?.prijs ?? null,
      dagWijziging:        koers?.wijziging ?? null,
      dagWijzigingPct,     // direct percentage, geen *100 nodig
      koersBijgewerkt:     koers?.bijgewerkt ?? null,
      aantalTransacties:   txs.length,
    };
  });

  // 6. Groepeer per rekening
  const rekeningMap = {};
  posities.forEach(p => {
    const r = p.rekening;
    if (!rekeningMap[r]) rekeningMap[r] = [];
    rekeningMap[r].push(p);
  });

  const rekeningen = Object.entries(rekeningMap).map(([naam, pos]) => {
    // Tel posities met aantal > 0 én posities die transacties hebben
    const actief = pos.filter(p => p.aantalAandelen > 0);
    // Toon ook posities met 0 aandelen maar wel transacties (volledig verkocht)
    const metTransacties = pos.filter(p => p.aantalTransacties > 0);
    return {
      naam,
      posities: pos,
      totalen: {
        portfolioWaarde: rond(actief.reduce((s, p) => s + p.marktWaarde, 0)),
        totaleKost:      rond(actief.reduce((s, p) => s + p.totaleKost, 0)),
        ongrealiseerdGV: rond(actief.reduce((s, p) => s + p.ongrealiseerdGV, 0)),
        grealiseerdGV:   rond(pos.reduce((s, p) => s + p.grealiseerdGV, 0)),
        totaalGV:        rond(pos.reduce((s, p) => s + p.totaalGV, 0)),
        // Correcte teller: posities met aandelen > 0 OF nog niet volledig uitgeboekt
        aantalAandelen:  actief.length || metTransacties.length,
      },
    };
  });

  // 7. Totaalcijfers
  const actief  = posities.filter(p => p.aantalAandelen > 0);
  const totalen = {
    portfolioWaarde:   rond(actief.reduce((s, p) => s + p.marktWaarde, 0)),
    totaleKost:        rond(actief.reduce((s, p) => s + p.totaleKost, 0)),
    ongrealiseerdGV:   rond(actief.reduce((s, p) => s + p.ongrealiseerdGV, 0)),
    grealiseerdGV:     rond(posities.reduce((s, p) => s + p.grealiseerdGV, 0)),
    aantalTransacties: transacties.length,
  };
  totalen.totaalGV = rond(totalen.ongrealiseerdGV + totalen.grealiseerdGV);

  return { posities, rekeningen, totalen, bijgewerkt: new Date().toISOString() };
}

const rond = (v, d = 2) => Math.round((v || 0) * Math.pow(10, d)) / Math.pow(10, d);

module.exports = { berekenPortfolio, getWisselkoersen };
