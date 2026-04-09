// modules/nieuws/nieuws.service.js
// Haalt nieuws op via Yahoo Finance RSS voor alle aandelen + watchlist van de gebruiker
// Slaat op in Supabase, verwijdert automatisch na 7 dagen

const supabase = require('../../core/supabase');

const POSITIEF_KEYWORDS = ['beat', 'surge', 'rise', 'gain', 'rally', 'jump', 'record', 'bullish', 'strong', 'growth', 'profit', 'upgrade', 'buy', 'outperform', 'positive', 'boom', 'soar', 'exceed'];
const NEGATIEF_KEYWORDS = ['fall', 'drop', 'decline', 'miss', 'cut', 'bearish', 'loss', 'weak', 'concern', 'short', 'downgrade', 'sell', 'underperform', 'negative', 'crash', 'slump', 'below'];

function detecteerSentiment(titel) {
  const lc = titel.toLowerCase();
  const pos = POSITIEF_KEYWORDS.filter(w => lc.includes(w)).length;
  const neg = NEGATIEF_KEYWORDS.filter(w => lc.includes(w)).length;
  if (pos > neg) return 'positief';
  if (neg > pos) return 'negatief';
  return 'neutraal';
}

async function haalRSSFeed(url) {
  try {
    const resp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();

    // Parse XML
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
    const linkRegex  = /<link>(.*?)<\/link>/;
    const pubRegex   = /<pubDate>(.*?)<\/pubDate>/;
    const descRegex  = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/;

    let match;
    while ((match = itemRegex.exec(json.contents)) !== null) {
      const blok  = match[1];
      const titel = (titleRegex.exec(blok)?.[1] || titleRegex.exec(blok)?.[2] || '').trim();
      const link  = (linkRegex.exec(blok)?.[1] || '').trim();
      const pub   = (pubRegex.exec(blok)?.[1] || '').trim();
      const desc  = (descRegex.exec(blok)?.[1] || descRegex.exec(blok)?.[2] || '').replace(/<[^>]+>/g, '').trim().slice(0, 300);

      if (titel && link) {
        items.push({ titel, link, gepubliceerd: pub ? new Date(pub).toISOString() : new Date().toISOString(), samenvatting: desc });
      }
    }
    return items;
  } catch (err) {
    console.warn('[nieuws] RSS fout:', url, err.message);
    return [];
  }
}

async function haalNieuws(gebruikerId) {
  // 1. Haal aandelen op
  const { data: aandelen } = await supabase
    .from('aandelen')
    .select('ticker, naam')
    .eq('gebruiker_id', gebruikerId);

  // 2. Haal watchlist op
  const { data: watchlistData } = await supabase
    .from('pagina_data')
    .select('waarde')
    .eq('gebruiker_id', gebruikerId)
    .eq('pagina', 'watchlist');

  const watchlistItems = (watchlistData || []).map(r => r.waarde).filter(Boolean);

  // 3. Bouw lijst van tickers om nieuws voor te halen
  const tickerItems = [];

  // Portfolio aandelen
  for (const a of (aandelen || [])) {
    // Zet AMS:VUSA om naar VUSA voor Yahoo RSS
    const yahooTicker = a.ticker.includes(':') ? a.ticker.split(':')[1] : a.ticker;
    tickerItems.push({ ticker: a.ticker, naam: a.naam, yahooTicker, type: 'portfolio' });
  }

  // Watchlist
  for (const w of watchlistItems) {
    if (w.ticker) {
      const yahooTicker = w.ticker.includes(':') ? w.ticker.split(':')[1] : w.ticker;
      tickerItems.push({ ticker: w.ticker, naam: w.naam || w.ticker, yahooTicker, type: 'watchlist' });
    }
  }

  // 4. Algemeen marktnieuws
  const algemeenFeeds = [
    { url: 'https://finance.yahoo.com/news/rssindex', ticker: null, naam: 'Marktnieuws' },
  ];

  let totaalNieuw = 0;

  // 5. Haal nieuws op per ticker
  for (const item of tickerItems) {
    const feed = `https://finance.yahoo.com/rss/headline?s=${item.yahooTicker}`;
    const artikelen = await haalRSSFeed(feed);

    for (const art of artikelen.slice(0, 5)) {
      const { error } = await supabase
        .from('nieuws')
        .upsert({
          gebruiker_id: gebruikerId,
          titel:        art.titel,
          link:         art.link,
          samenvatting: art.samenvatting,
          bron:         'Yahoo Finance',
          gepubliceerd: art.gepubliceerd,
          sentiment:    detecteerSentiment(art.titel),
          ticker:       item.ticker,
          naam:         item.naam,
          gelezen:      false,
        }, { onConflict: 'gebruiker_id,link', ignoreDuplicates: true });

      if (!error) totaalNieuw++;
    }
  }

  // 6. Algemeen nieuws
  for (const feed of algemeenFeeds) {
    const artikelen = await haalRSSFeed(feed.url);
    for (const art of artikelen.slice(0, 8)) {
      await supabase
        .from('nieuws')
        .upsert({
          gebruiker_id: gebruikerId,
          titel:        art.titel,
          link:         art.link,
          samenvatting: art.samenvatting,
          bron:         'Yahoo Finance',
          gepubliceerd: art.gepubliceerd,
          sentiment:    detecteerSentiment(art.titel),
          ticker:       null,
          naam:         'Marktnieuws',
          gelezen:      false,
        }, { onConflict: 'gebruiker_id,link', ignoreDuplicates: true });
    }
  }

  // 7. Verwijder nieuws ouder dan 7 dagen
  await supabase
    .from('nieuws')
    .delete()
    .eq('gebruiker_id', gebruikerId)
    .lt('gepubliceerd', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  return { opgehaald: totaalNieuw, tickers: tickerItems.length };
}

module.exports = { haalNieuws };
