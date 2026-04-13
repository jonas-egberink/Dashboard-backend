// core/valuta.js
// Centrale wisselkoers helpers voor het dashboard.

let wisselCache = { koersen: {}, bijgewerkt: 0 };
const CACHE_MS = 10 * 60 * 1000;
const FALLBACK_KOERSEN = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  GBp: 0.0117,
  CHF: 1.04,
  JPY: 0.006,
  CAD: 0.68,
  AUD: 0.60,
  SEK: 0.088,
  NOK: 0.085,
  DKK: 0.134,
};

async function getWisselkoersen() {
  const nu = Date.now();
  if (nu - wisselCache.bijgewerkt < CACHE_MS && Object.keys(wisselCache.koersen).length) {
    return wisselCache.koersen;
  }

  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/EUR', {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const json = await resp.json();
    const koersen = {};
    for (const [valuta, rate] of Object.entries(json.rates || {})) {
      koersen[valuta] = 1 / rate;
    }
    koersen.EUR = 1;
    koersen.GBp = koersen.GBP ? koersen.GBP / 100 : FALLBACK_KOERSEN.GBp;

    wisselCache = { koersen, bijgewerkt: nu };
    return koersen;
  } catch (err) {
    console.warn('[wisselkoers] Fout:', err.message);
    return Object.keys(wisselCache.koersen).length ? wisselCache.koersen : FALLBACK_KOERSEN;
  }
}

function factorNaarEUR(valuta = 'EUR', wisselkoersen = {}) {
  if (!valuta || valuta === 'EUR') return 1;
  if (valuta === 'GBp') return wisselkoersen.GBp || ((wisselkoersen.GBP || FALLBACK_KOERSEN.GBP) / 100);
  return wisselkoersen[valuta] || FALLBACK_KOERSEN[valuta] || 1;
}

function naarEUR(bedrag, valuta = 'EUR', wisselkoersen = {}) {
  const nummer = Number(bedrag);
  if (!Number.isFinite(nummer)) return 0;
  return nummer * factorNaarEUR(valuta, wisselkoersen);
}

function vanEUR(bedragEUR, valuta = 'EUR', wisselkoersen = {}) {
  const nummer = Number(bedragEUR);
  if (!Number.isFinite(nummer)) return 0;
  const factor = factorNaarEUR(valuta, wisselkoersen);
  return factor ? nummer / factor : nummer;
}

module.exports = {
  getWisselkoersen,
  factorNaarEUR,
  naarEUR,
  vanEUR,
};

