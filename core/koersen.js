// core/koersen.js
// Yahoo Finance wrapper met 2-minuten cache.
// Gebruik: const { getKoers, getKoersen, zoekAandeel } = require('../../core/koersen');

const yahooFinance = require('yahoo-finance2').default;

const cache  = new Map();
const MAX_MS = 2 * 60 * 1000; // 2 minuten — veilig zonder API limieten

async function getKoers(ticker) {
  const nu     = Date.now();
  const cached = cache.get(ticker);
  if (cached && (nu - cached.bijgewerkt) < MAX_MS) return cached;

  try {
    const q    = await yahooFinance.quote(ticker);
    const data = {
      ticker,
      prijs:        q.regularMarketPrice          ?? null,
      opening:      q.regularMarketOpen           ?? null,
      daghoog:      q.regularMarketDayHigh        ?? null,
      daglaag:      q.regularMarketDayLow         ?? null,
      wijziging:    q.regularMarketChange         ?? null,
      wijzigingPct: q.regularMarketChangePercent  ?? null,
      naam:         q.longName || q.shortName     || ticker,
      valuta:       q.currency                    ?? 'USD',
      exchange:     q.exchange                    ?? '',
      bijgewerkt:   nu,
    };
    cache.set(ticker, data);
    return data;
  } catch (err) {
    console.warn(`[koersen] ${ticker}: ${err.message}`);
    return cached ? { ...cached, oud: true } : null;
  }
}

async function getKoersen(tickers) {
  const results = await Promise.allSettled(tickers.map(t => getKoers(t)));
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { ticker: tickers[i], prijs: null }
  );
}

async function zoekAandeel(ticker) {
  try {
    const q = await yahooFinance.quote(ticker);
    return {
      ticker:   ticker.toUpperCase(),
      naam:     q.longName || q.shortName || ticker,
      exchange: q.exchange  ?? '',
      valuta:   q.currency  ?? 'USD',
      type:     q.quoteType ?? 'EQUITY',
      prijs:    q.regularMarketPrice ?? null,
      gevonden: true,
    };
  } catch {
    return { ticker, gevonden: false };
  }
}

module.exports = { getKoers, getKoersen, zoekAandeel };
