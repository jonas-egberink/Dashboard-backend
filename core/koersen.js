// core/koersen.js
// Yahoo Finance wrapper met 2-minuten cache.
// Gebruik: const { getKoers, getKoersen, zoekAandeel } = require('../../core/koersen');

const yahooFinance = require('yahoo-finance2').default;

const cache  = new Map();
const MAX_MS = 2 * 60 * 1000; // 2 minuten — veilig zonder API limieten

// ── EXCHANGE MAPPING ──────────────────────────────────────────
// Zet "EXCHANGE:TICKER" notaties om naar Yahoo Finance formaat
const EXCHANGE_MAP = {
  'AMS':    '.AS',   // Amsterdam (Euronext)
  'EPA':    '.PA',   // Parijs (Euronext)
  'ETR':    '.DE',   // Frankfurt (XETRA)
  'LON':    '.L',    // Londen (LSE)
  'BIT':    '.MI',   // Milaan
  'BME':    '.MC',   // Madrid
  'STO':    '.ST',   // Stockholm
  'CPH':    '.CO',   // Kopenhagen
  'HEL':    '.HE',   // Helsinki
  'OSL':    '.OL',   // Oslo
  'VIE':    '.VI',   // Wenen
  'JSE':    '.JO',   // Johannesburg
  'TSX':    '.TO',   // Toronto
  'ASX':    '.AX',   // Australië
  'HKG':    '.HK',   // Hong Kong
  'TYO':    '.T',    // Tokyo
  'SHA':    '.SS',   // Shanghai
  'SHE':    '.SZ',   // Shenzhen
  'NASDAQ': '',      // Nasdaq — geen suffix nodig
  'NYSE':   '',      // NYSE — geen suffix nodig
};

/**
 * Zet een ticker om naar Yahoo Finance formaat.
 * "AMS:VUSA" → "VUSA.AS"
 * "NASDAQ:AAPL" → "AAPL"
 * "AAPL" → "AAPL" (ongewijzigd)
 */
function normaliseerTicker(ticker) {
  const schoon = ticker.trim().toUpperCase();
  if (!schoon.includes(':')) return schoon;

  const [exchange, symbool] = schoon.split(':', 2);
  const suffix = EXCHANGE_MAP[exchange];

  if (suffix === undefined) {
    // Onbekende exchange — probeer het symbool alleen
    return symbool;
  }
  return symbool + suffix;
}

async function getKoers(ticker) {
  const yTicker = normaliseerTicker(ticker);
  const nu      = Date.now();
  const cached  = cache.get(yTicker);
  if (cached && (nu - cached.bijgewerkt) < MAX_MS) return cached;

  try {
    const q    = await yahooFinance.quote(yTicker, {}, { validateResult: false });
    const data = {
      ticker,          // originele ticker bewaren
      yTicker,         // Yahoo Finance ticker
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
    cache.set(yTicker, data);
    return data;
  } catch (err) {
    console.warn(`[koersen] ${ticker} (${yTicker}): ${err.message}`);
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
  const yTicker = normaliseerTicker(ticker);
  try {
    const q = await yahooFinance.quote(yTicker, {}, { validateResult: false });
    if (!q || !q.regularMarketPrice) return { ticker: ticker.toUpperCase(), gevonden: false };
    return {
      ticker:   ticker.toUpperCase(),
      yTicker,
      naam:     q.longName || q.shortName || ticker,
      exchange: q.exchange  ?? '',
      valuta:   q.currency  ?? 'EUR',
      type:     q.quoteType ?? 'EQUITY',
      prijs:    q.regularMarketPrice ?? null,
      gevonden: true,
    };
  } catch (err) {
    console.warn(`[zoek] ${ticker} (${yTicker}): ${err.message}`);
    return { ticker: ticker.toUpperCase(), gevonden: false };
  }
}

module.exports = { getKoers, getKoersen, zoekAandeel, normaliseerTicker };
