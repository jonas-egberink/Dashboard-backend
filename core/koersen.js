// core/koersen.js
// Yahoo Finance wrapper met 2-minuten cache.

const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance();

const cache  = new Map();
const MAX_MS = 2 * 60 * 1000;

// ── EXCHANGE MAPPING ──────────────────────────────────────────
const EXCHANGE_MAP = {
  'AMS':    '.AS',
  'EPA':    '.PA',
  'ETR':    '.DE',
  'LON':    '.L',
  'BIT':    '.MI',
  'BME':    '.MC',
  'STO':    '.ST',
  'CPH':    '.CO',
  'HEL':    '.HE',
  'OSL':    '.OL',
  'VIE':    '.VI',
  'TSX':    '.TO',
  'ASX':    '.AX',
  'HKG':    '.HK',
  'TYO':    '.T',
  'SHA':    '.SS',
  'SHE':    '.SZ',
  'NASDAQ': '',
  'NYSE':   '',
};

function normaliseerTicker(ticker) {
  const schoon = ticker.trim().toUpperCase();
  if (!schoon.includes(':')) return schoon;
  const [exchange, symbool] = schoon.split(':', 2);
  const suffix = EXCHANGE_MAP[exchange];
  if (suffix === undefined) return symbool;
  return symbool + suffix;
}

async function getKoers(ticker) {
  const yTicker = normaliseerTicker(ticker);
  const nu      = Date.now();
  const cached  = cache.get(yTicker);
  if (cached && (nu - cached.bijgewerkt) < MAX_MS) return cached;

  try {
    const q = await yf.quote(yTicker, {}, { validateResult: false });
    const data = {
      ticker,
      yTicker,
      prijs:        q.regularMarketPrice         ?? null,
      opening:      q.regularMarketOpen          ?? null,
      daghoog:      q.regularMarketDayHigh       ?? null,
      daglaag:      q.regularMarketDayLow        ?? null,
      wijziging:    q.regularMarketChange        ?? null,
      wijzigingPct: q.regularMarketChangePercent ?? null,
      naam:         q.longName || q.shortName    || ticker,
      valuta:       q.currency                   ?? 'EUR',
      exchange:     q.exchange                   ?? '',
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
    const q = await yf.quote(yTicker, {}, { validateResult: false });
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
