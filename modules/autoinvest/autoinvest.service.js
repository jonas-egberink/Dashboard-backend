// modules/autoinvest/autoinvest.service.js
// Domeinlogica voor Auto-Invest plannen, previews en uitvoeringen.

const supabase = require('../../core/supabase');
const { getKoersen } = require('../../core/koersen');
const { getWisselkoersen, naarEUR, vanEUR } = require('../../core/valuta');

const AMS_TZ = 'Europe/Amsterdam';
const MARKET_WINDOWS = {
  EU: { key: 'EU', label: 'Europa', open: 9 * 60, close: 17 * 60 + 30 },
  UK: { key: 'UK', label: 'Londen', open: 10 * 60, close: 18 * 60 + 30 },
  US: { key: 'US', label: 'Verenigde Staten', open: 15 * 60 + 30, close: 22 * 60 },
};
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'NMS', 'NYQ', 'ASE', 'PCX', 'BATS', 'NGM', 'NCM']);
const UK_EXCHANGES = new Set(['LSE', 'LON']);
const EU_EXCHANGES = new Set(['AMS', 'EPA', 'ETR', 'FRA', 'BIT', 'BME', 'STO', 'CPH', 'HEL', 'OSL', 'VIE', 'XETRA', 'SWB']);

function rond(waarde, decimalen = 2) {
  const factor = Math.pow(10, decimalen);
  return Math.round((Number(waarde) || 0) * factor) / factor;
}

function fout(bericht, status = 400) {
  const err = new Error(bericht);
  err.status = status;
  return err;
}

function parseDatum(datum) {
  if (!datum) return null;
  const [jaar, maand, dag] = String(datum).split('-').map(Number);
  if (!jaar || !maand || !dag) return null;
  return new Date(Date.UTC(jaar, maand - 1, dag));
}

function formatDatum(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function voegDagenToe(datum, dagen) {
  const d = parseDatum(datum);
  d.setUTCDate(d.getUTCDate() + dagen);
  return formatDatum(d);
}

function laatsteDagVanMaand(jaar, maandIndex) {
  return new Date(Date.UTC(jaar, maandIndex + 1, 0)).getUTCDate();
}

function amsterdamParts(nu = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AMS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(nu).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    jaar: Number(parts.year),
    maand: Number(parts.month),
    dag: Number(parts.day),
    uur: Number(parts.hour),
    minuut: Number(parts.minute),
    datum: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function isHandelsdag(datum) {
  const dag = parseDatum(datum)?.getUTCDay();
  return dag >= 1 && dag <= 5;
}

function verschuifNaarHandelsdag(datum) {
  let kandidaat = datum;
  while (!isHandelsdag(kandidaat)) kandidaat = voegDagenToe(kandidaat, 1);
  return kandidaat;
}

function berekenMaandDatum(jaar, maandIndex, uitvoerDag) {
  const dag = Math.min(Number(uitvoerDag), laatsteDagVanMaand(jaar, maandIndex));
  return verschuifNaarHandelsdag(formatDatum(new Date(Date.UTC(jaar, maandIndex, dag))));
}

function resolveMarketWindow(aandeel) {
  const exchange = String(aandeel.exchange || '').trim().toUpperCase();
  const ticker = String(aandeel.ticker || '').toUpperCase();
  const valuta = String(aandeel.valuta || '').trim();
  const valutaUpper = valuta.toUpperCase();

  if (US_EXCHANGES.has(exchange)) return MARKET_WINDOWS.US;
  if (UK_EXCHANGES.has(exchange) || ticker.endsWith('.L') || valutaUpper === 'GBP' || valuta === 'GBp') return MARKET_WINDOWS.UK;
  if (EU_EXCHANGES.has(exchange)) return MARKET_WINDOWS.EU;
  if (ticker.includes(':')) {
    const prefix = ticker.split(':', 1)[0];
    if (US_EXCHANGES.has(prefix)) return MARKET_WINDOWS.US;
    if (UK_EXCHANGES.has(prefix)) return MARKET_WINDOWS.UK;
    if (EU_EXCHANGES.has(prefix)) return MARKET_WINDOWS.EU;
  }
  if (valutaUpper === 'USD') return MARKET_WINDOWS.US;
  if (valutaUpper === 'GBP' || valuta === 'GBp') return MARKET_WINDOWS.UK;
  return MARKET_WINDOWS.EU;
}

function bepaalMarktStatus(aandelen, nu = new Date()) {
  const parts = amsterdamParts(nu);
  const minutenNu = parts.uur * 60 + parts.minuut;
  const sessies = [...new Map(
    aandelen
      .filter(Boolean)
      .map(aandeel => {
        const sessie = resolveMarketWindow(aandeel);
        return [sessie.key, sessie];
      })
  ).values()];

  if (!isHandelsdag(parts.datum)) {
    return {
      datum: parts.datum,
      open: false,
      reden: 'Vandaag is geen handelsdag.',
      sessies,
      windowStart: null,
      windowEinde: null,
      strategie: 'closed',
    };
  }

  if (!sessies.length) {
    return {
      datum: parts.datum,
      open: false,
      reden: 'Geen marktsessies gevonden voor dit plan.',
      sessies,
      windowStart: null,
      windowEinde: null,
      strategie: 'none',
    };
  }

  let start = Math.max(...sessies.map(s => s.open));
  let einde = Math.min(...sessies.map(s => s.close));
  let strategie = 'overlap';

  if (start >= einde) {
    start = Math.min(...sessies.map(s => s.open));
    einde = Math.max(...sessies.map(s => s.close));
    strategie = 'union';
  }

  const open = minutenNu >= start && minutenNu <= einde;
  return {
    datum: parts.datum,
    open,
    sessies,
    strategie,
    windowStart: minutenNaarTijd(start),
    windowEinde: minutenNaarTijd(einde),
    reden: open ? null : `Uitvoering wacht op marktvenster ${minutenNaarTijd(start)}–${minutenNaarTijd(einde)} (${strategie === 'overlap' ? 'gezamenlijk' : 'fallback'}).`,
  };
}

function minutenNaarTijd(minuten) {
  const uur = String(Math.floor(minuten / 60)).padStart(2, '0');
  const min = String(minuten % 60).padStart(2, '0');
  return `${uur}:${min}`;
}

function normaliseerAllocaties(allocaties, holdingsById) {
  if (!Array.isArray(allocaties) || !allocaties.length) {
    throw fout('Minimaal één verdeling is verplicht.');
  }

  const gezien = new Set();
  const schoon = allocaties.map(item => {
    const aandeelId = String(item?.aandeel_id || '').trim();
    const percentage = Number(item?.percentage);
    if (!aandeelId || !holdingsById[aandeelId]) {
      throw fout('Elke verdeling moet verwijzen naar een aandeel uit deze groep.');
    }
    if (gezien.has(aandeelId)) {
      throw fout('Een aandeel mag maar één keer in de verdeling voorkomen.');
    }
    if (!Number.isFinite(percentage) || percentage < 0) {
      throw fout('Elke verdeling moet een geldig percentage hebben.');
    }
    gezien.add(aandeelId);
    return {
      aandeel_id: aandeelId,
      percentage: rond(percentage, 4),
    };
  });

  const totaal = rond(schoon.reduce((som, item) => som + item.percentage, 0), 4);
  if (Math.abs(totaal - 100) > 0.01) {
    throw fout(`De verdeling moet samen exact 100% zijn. Huidig totaal: ${totaal}%.`);
  }
  if (!schoon.some(item => item.percentage > 0)) {
    throw fout('Minimaal één aandeel moet een percentage groter dan 0 hebben.');
  }

  return schoon.sort((a, b) => {
    const tickerA = holdingsById[a.aandeel_id]?.ticker || '';
    const tickerB = holdingsById[b.aandeel_id]?.ticker || '';
    return tickerA.localeCompare(tickerB, 'nl');
  });
}

function valideerBewaardPlan(plan, holdingsById) {
  const meldingen = [];
  const allocaties = Array.isArray(plan?.allocaties) ? plan.allocaties : [];
  const totaal = rond(allocaties.reduce((som, item) => som + Number(item?.percentage || 0), 0), 4);

  if (!allocaties.length) meldingen.push('Geen allocaties opgeslagen.');
  if (Math.abs(totaal - 100) > 0.01) meldingen.push(`Verdeling is ${totaal}% in plaats van 100%.`);
  allocaties.forEach(item => {
    if (!holdingsById[item.aandeel_id]) meldingen.push(`Aandeel ${item.aandeel_id} bestaat niet meer in deze groep.`);
  });

  return { isGeldig: meldingen.length === 0, meldingen, totaalPercentage: totaal };
}

function berekenVolgendeUitvoering(plan, vanafDatum, verwerkteDatums = new Set()) {
  if (!plan?.uitvoer_dag) return null;

  const grens = parseDatum(vanafDatum) || parseDatum(amsterdamParts().datum);

  let jaar = grens.getUTCFullYear();
  let maand = grens.getUTCMonth();

  for (let i = 0; i < 36; i++) {
    const kandidaat = berekenMaandDatum(jaar, maand, plan.uitvoer_dag);
    const kandidaatDate = parseDatum(kandidaat);
    if (kandidaatDate >= grens && !verwerkteDatums.has(kandidaat)) {
      return kandidaat;
    }
    maand += 1;
    if (maand > 11) {
      maand = 0;
      jaar += 1;
    }
  }

  return null;
}

function lijstVerschuldigdeDatums(plan, alUitgevoerd, vandaag) {
  const start = parseDatum((plan.bijgewerkt || plan.aangemaakt || vandaag).slice(0, 10));
  const laatste = parseDatum(vandaag);
  const resultaten = [];

  let jaar = start.getUTCFullYear();
  let maand = start.getUTCMonth();

  while (Date.UTC(jaar, maand, 1) <= Date.UTC(laatste.getUTCFullYear(), laatste.getUTCMonth(), 1)) {
    const datum = berekenMaandDatum(jaar, maand, plan.uitvoer_dag);
    const dateObj = parseDatum(datum);
    if (dateObj >= start && dateObj <= laatste && !alUitgevoerd.has(datum)) {
      resultaten.push(datum);
    }

    maand += 1;
    if (maand > 11) {
      maand = 0;
      jaar += 1;
    }
  }

  return resultaten;
}

async function haalAandelenOpVoorGebruiker(gebruikerId) {
  const { data: laatsteTxRijen, error: txError } = await supabase
    .from('transacties')
    .select('aandeel_id, valuta, datum, aangemaakt')
    .eq('gebruiker_id', gebruikerId)
    .order('datum', { ascending: false })
    .order('aangemaakt', { ascending: false });
  if (txError) throw txError;

  const laatsteValutaPerAandeel = {};
  (laatsteTxRijen || []).forEach(tx => {
    if (!laatsteValutaPerAandeel[tx.aandeel_id]) {
      laatsteValutaPerAandeel[tx.aandeel_id] = (tx.valuta || '').trim() || null;
    }
  });

  const { data, error } = await supabase
    .from('aandelen')
    .select('id, ticker, naam, exchange, valuta, rekening, type')
    .eq('gebruiker_id', gebruikerId)
    .order('rekening')
    .order('ticker');
  if (error) throw error;

  const tickers = [...new Set(data.map(item => item.ticker).filter(Boolean))];
  const [koersen, wisselkoersen] = await Promise.all([
    tickers.length ? getKoersen(tickers) : Promise.resolve([]),
    getWisselkoersen(),
  ]);

  const koersMap = {};
  koersen.forEach(koers => {
    if (koers?.ticker) koersMap[koers.ticker] = koers;
  });

  return data.map(aandeel => {
    const koers = koersMap[aandeel.ticker];
    const aandeelValuta = aandeel.valuta || koers?.valuta || 'EUR';
    const voorkeurValuta = laatsteValutaPerAandeel[aandeel.id] || aandeelValuta;
    const prijsOrigineel = koers?.prijs ?? null;
    const prijsEUR = prijsOrigineel != null ? rond(naarEUR(prijsOrigineel, aandeelValuta, wisselkoersen), 6) : null;
    const prijsVoorkeur = prijsEUR != null ? rond(vanEUR(prijsEUR, voorkeurValuta, wisselkoersen), 6) : null;
    return {
      ...aandeel,
      valuta: aandeelValuta,
      voorkeurValuta,
      huidigePrijsOrigineel: prijsOrigineel,
      huidigePrijsEUR: prijsEUR,
      huidigePrijsVoorkeur: prijsVoorkeur,
      koersBijgewerkt: koers?.bijgewerkt ? new Date(koers.bijgewerkt).toISOString() : null,
    };
  });
}

async function haalPlannenOpVoorGebruiker(gebruikerId) {
  const { data, error } = await supabase
    .from('autoinvest_plannen')
    .select('*')
    .eq('gebruiker_id', gebruikerId)
    .order('groep');
  if (error) throw error;
  return data || [];
}

async function haalRunsOpVoorGebruiker(gebruikerId) {
  const { data, error } = await supabase
    .from('autoinvest_runs')
    .select('id, plan_id, groep, scheduled_date, executed_at, status, totaal_bedrag_eur, details, reden, aangemaakt')
    .eq('gebruiker_id', gebruikerId)
    .order('executed_at', { ascending: false, nullsFirst: false })
    .order('aangemaakt', { ascending: false });
  if (error) throw error;

  return data || [];
}

function groepeerAandelen(aandelen) {
  return aandelen.reduce((map, aandeel) => {
    const groep = aandeel.rekening || 'Standaard';
    if (!map[groep]) map[groep] = [];
    map[groep].push(aandeel);
    return map;
  }, {});
}

function verrijkAllocaties(plan, holdingsById) {
  return (plan.allocaties || []).map(item => {
    const aandeel = holdingsById[item.aandeel_id] || {};
    return {
      aandeel_id: item.aandeel_id,
      percentage: Number(item.percentage),
      ticker: aandeel.ticker || 'Onbekend',
      naam: aandeel.naam || 'Aandeel ontbreekt',
      exchange: aandeel.exchange || null,
      valuta: aandeel.valuta || null,
      voorkeurValuta: aandeel.voorkeurValuta || aandeel.valuta || null,
      huidigePrijsOrigineel: aandeel.huidigePrijsOrigineel ?? null,
      huidigePrijsEUR: aandeel.huidigePrijsEUR ?? null,
      huidigePrijsVoorkeur: aandeel.huidigePrijsVoorkeur ?? null,
    };
  }).sort((a, b) => a.ticker.localeCompare(b.ticker, 'nl'));
}

function berekenPreview(plan, holdingsById, wisselkoersen = {}) {
  if (!plan) return [];

  const bedragInput = Number(plan.maandbedrag_input ?? plan.maandbedrag_eur ?? 0);
  const bedragValuta = String(plan.maandbedrag_valuta || 'EUR').trim() || 'EUR';

  return verrijkAllocaties(plan, holdingsById)
    .filter(item => item.percentage > 0)
    .map(item => {
      const bedragInvoer = bedragInput * (item.percentage / 100);
      const bedragEUR = naarEUR(bedragInvoer, bedragValuta, wisselkoersen);
      const prijsEUR = Number(item.huidigePrijsEUR);
      const stuks = prijsEUR > 0 ? bedragEUR / prijsEUR : null;
      const prijsDoel = Number(item.huidigePrijsVoorkeur);
      const bedragDoel = stuks != null && prijsDoel > 0 ? stuks * prijsDoel : null;
      return {
        ...item,
        bedragInput: rond(bedragInvoer, 2),
        bedragInputValuta: bedragValuta,
        bedragEUR: rond(bedragEUR, 2),
        bedragDoelValuta: bedragDoel != null ? rond(bedragDoel, 2) : null,
        stuks: stuks != null ? rond(stuks, 6) : null,
      };
    });
}

function bouwGroepView(groep, holdings, plan, laatsteRun, runDatums, vandaag, wisselkoersen = {}) {
  const holdingsById = Object.fromEntries((holdings || []).map(item => [item.id, item]));
  const validatie = plan ? valideerBewaardPlan(plan, holdingsById) : { isGeldig: true, meldingen: [], totaalPercentage: 0 };
  const preview = plan ? berekenPreview(plan, holdingsById, wisselkoersen) : [];
  const volgendeUitvoering = plan ? berekenVolgendeUitvoering(plan, vandaag, runDatums || new Set()) : null;

  return {
    groepId: groep,
    groepNaam: groep,
    holdings: (holdings || []).map(item => ({
      id: item.id,
      ticker: item.ticker,
      naam: item.naam,
      exchange: item.exchange,
      valuta: item.valuta,
      voorkeurValuta: item.voorkeurValuta,
      huidigePrijsOrigineel: item.huidigePrijsOrigineel,
      huidigePrijsEUR: item.huidigePrijsEUR,
      huidigePrijsVoorkeur: item.huidigePrijsVoorkeur,
      koersBijgewerkt: item.koersBijgewerkt,
    })),
    plan: plan ? {
      id: plan.id,
      maandbedrag: Number(plan.maandbedrag_input ?? plan.maandbedrag_eur),
      maandbedragValuta: plan.maandbedrag_valuta || 'EUR',
      maandbedragEur: Number(plan.maandbedrag_eur),
      uitvoerDag: plan.uitvoer_dag,
      actief: !!plan.actief,
      allocaties: verrijkAllocaties(plan, holdingsById),
      volgendeUitvoering,
      validatie,
      bijgewerkt: plan.bijgewerkt,
      aangemaakt: plan.aangemaakt,
    } : null,
    laatsteUitvoering: laatsteRun ? {
      id: laatsteRun.id,
      scheduledDate: laatsteRun.scheduled_date,
      executedAt: laatsteRun.executed_at,
      status: laatsteRun.status,
      totaalBedragEur: Number(laatsteRun.totaal_bedrag_eur || 0),
      reden: laatsteRun.reden,
    } : null,
    preview,
  };
}

async function laadAutoInvestContext(gebruikerId) {
  const [aandelen, plannen, runs, wisselkoersen] = await Promise.all([
    haalAandelenOpVoorGebruiker(gebruikerId),
    haalPlannenOpVoorGebruiker(gebruikerId),
    haalRunsOpVoorGebruiker(gebruikerId),
    getWisselkoersen(),
  ]);

  const holdingsPerGroep = groepeerAandelen(aandelen);
  const plannenPerGroep = Object.fromEntries(plannen.map(plan => [plan.groep, plan]));
  const laatsteRuns = {};
  const runDatumsPerGroep = {};

  runs.forEach(run => {
    if (!laatsteRuns[run.groep]) laatsteRuns[run.groep] = run;
    if (!runDatumsPerGroep[run.groep]) runDatumsPerGroep[run.groep] = new Set();
    if (run.scheduled_date) runDatumsPerGroep[run.groep].add(run.scheduled_date);
  });

  const alleGroepen = [...new Set([
    ...Object.keys(holdingsPerGroep),
    ...Object.keys(plannenPerGroep),
    ...Object.keys(laatsteRuns),
  ])].sort((a, b) => a.localeCompare(b, 'nl'));

  return { holdingsPerGroep, plannenPerGroep, laatsteRuns, runDatumsPerGroep, alleGroepen, wisselkoersen };
}

async function haalAutoInvestOverzichtOp(gebruikerId) {
  const vandaag = amsterdamParts().datum;
  const context = await laadAutoInvestContext(gebruikerId);

  return context.alleGroepen.map(groep => bouwGroepView(
    groep,
    context.holdingsPerGroep[groep] || [],
    context.plannenPerGroep[groep] || null,
    context.laatsteRuns[groep] || null,
    context.runDatumsPerGroep[groep] || new Set(),
    vandaag,
    context.wisselkoersen
  ));
}

async function haalAutoInvestGroepOp(gebruikerId, groepId) {
  const context = await laadAutoInvestContext(gebruikerId);
  const vandaag = amsterdamParts().datum;
  const groep = decodeURIComponent(groepId);

  if (!context.alleGroepen.includes(groep)) {
    throw fout(`Groep "${groep}" niet gevonden.`, 404);
  }

  return bouwGroepView(
    groep,
    context.holdingsPerGroep[groep] || [],
    context.plannenPerGroep[groep] || null,
    context.laatsteRuns[groep] || null,
    context.runDatumsPerGroep[groep] || new Set(),
    vandaag,
    context.wisselkoersen
  );
}

async function slaAutoInvestPlanOp(gebruikerId, groepId, payload) {
  const groep = decodeURIComponent(groepId).trim();
  if (!groep) throw fout('groupId is verplicht.', 400);

  const holdings = (await haalAandelenOpVoorGebruiker(gebruikerId)).filter(item => (item.rekening || 'Standaard') === groep);
  if (!holdings.length) throw fout(`Groep "${groep}" bevat nog geen aandelen.`, 400);

  const holdingsById = Object.fromEntries(holdings.map(item => [item.id, item]));
  const maandbedrag = Number(payload?.maandBedrag ?? payload?.maandBedragEur);
  const maandbedragValuta = String(payload?.maandBedragValuta || 'EUR').trim() || 'EUR';
  const maandbedragEur = naarEUR(maandbedrag, maandbedragValuta);
  const uitvoerDag = Number(payload?.uitvoerDag);
  const startdatum = formatDatum(new Date());
  const actief = payload?.actief !== false;
  const allocaties = normaliseerAllocaties(payload?.allocaties, holdingsById);

  if (!Number.isFinite(maandbedrag) || maandbedrag <= 0) throw fout('maandBedrag moet groter zijn dan 0.');
  if (!Number.isInteger(uitvoerDag) || uitvoerDag < 1 || uitvoerDag > 28) throw fout('uitvoerDag moet tussen 1 en 28 liggen.');

  const { error } = await supabase
    .from('autoinvest_plannen')
    .upsert({
      gebruiker_id: gebruikerId,
      groep,
      maandbedrag_input: rond(maandbedrag, 2),
      maandbedrag_valuta: maandbedragValuta,
      maandbedrag_eur: rond(maandbedragEur, 2),
      uitvoer_dag: uitvoerDag,
      startdatum,
      einddatum: null,
      actief,
      allocaties,
      bijgewerkt: new Date().toISOString(),
    }, { onConflict: 'gebruiker_id,groep' });

  if (error) throw error;
  return haalAutoInvestGroepOp(gebruikerId, groep);
}

async function verwijderAutoInvestPlan(gebruikerId, groepId) {
  const groep = decodeURIComponent(groepId);
  const { error } = await supabase
    .from('autoinvest_plannen')
    .delete()
    .eq('gebruiker_id', gebruikerId)
    .eq('groep', groep);
  if (error) throw error;
  return { verwijderd: true, groep };
}

async function haalAutoInvestGeschiedenisOp(gebruikerId, groepId) {
  const groep = decodeURIComponent(groepId);
  const { data, error } = await supabase
    .from('autoinvest_runs')
    .select('id, plan_id, groep, scheduled_date, executed_at, status, totaal_bedrag_eur, details, reden, aangemaakt')
    .eq('gebruiker_id', gebruikerId)
    .eq('groep', groep)
    .order('scheduled_date', { ascending: false })
    .order('executed_at', { ascending: false, nullsFirst: false });
  if (error) throw error;

  return (data || []).map(run => ({
    id: run.id,
    planId: run.plan_id,
    groep: run.groep,
    scheduledDate: run.scheduled_date,
    executedAt: run.executed_at,
    status: run.status,
    totaalBedragEur: Number(run.totaal_bedrag_eur || 0),
    details: Array.isArray(run.details) ? run.details : [],
    reden: run.reden,
    aangemaakt: run.aangemaakt,
  }));
}

async function claimRun(plan, scheduledDate, bron) {
  const { data, error } = await supabase
    .from('autoinvest_runs')
    .insert({
      plan_id: plan.id,
      gebruiker_id: plan.gebruiker_id,
      groep: plan.groep,
      scheduled_date: scheduledDate,
      status: 'running',
      reden: `Gestart via ${bron}`,
      details: [],
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }
  return data;
}

async function updateRun(runId, patch) {
  const { error } = await supabase
    .from('autoinvest_runs')
    .update(patch)
    .eq('id', runId);
  if (error) throw error;
}

function previewNaarTransacties(plan, preview, uitvoerDatum) {
  return preview
    .filter(item => item.percentage > 0)
    .map(item => {
      if (!item.huidigePrijsVoorkeur || !item.huidigePrijsEUR || !item.stuks) {
        throw fout(`Geen live koers beschikbaar voor ${item.ticker}; uitvoering kan nu niet doorgaan.`);
      }
      return {
        gebruiker_id: plan.gebruiker_id,
        aandeel_id: item.aandeel_id,
        type: 'Buy',
        datum: uitvoerDatum,
        aantal: rond(item.stuks, 6),
        prijs: rond(item.huidigePrijsVoorkeur, 6),
        fees: 0,
        valuta: item.voorkeurValuta || item.valuta || 'EUR',
        notitie: `Auto-Invest ${plan.groep} · schema ${plan.scheduled_date}`,
      };
    });
}

async function voerPlanUit(plan, holdings, scheduledDate, nu, bron) {
  const run = await claimRun(plan, scheduledDate, bron);
  if (!run) return { status: 'skipped', reden: 'Run bestaat al of wordt al verwerkt.' };

  try {
    const holdingsById = Object.fromEntries(holdings.map(item => [item.id, item]));
    const validatie = valideerBewaardPlan(plan, holdingsById);
    if (!validatie.isGeldig) {
      await updateRun(run.id, {
        status: 'failed',
        executed_at: new Date().toISOString(),
        reden: validatie.meldingen.join(' '),
      });
      return { status: 'failed', reden: validatie.meldingen.join(' ') };
    }

    const preview = berekenPreview(plan, holdingsById, await getWisselkoersen());
    const uitvoerDatum = amsterdamParts(nu).datum;
    const transacties = previewNaarTransacties({ ...plan, scheduled_date: scheduledDate }, preview, uitvoerDatum);
    const { data: inserted, error } = await supabase
      .from('transacties')
      .insert(transacties)
      .select('id, aandeel_id, aantal, prijs, valuta, datum, notitie');
    if (error) throw error;

    const idPerAandeel = Object.fromEntries((inserted || []).map(item => [item.aandeel_id, item]));
    const details = preview.map(item => ({
      aandeel_id: item.aandeel_id,
      ticker: item.ticker,
      naam: item.naam,
      percentage: rond(item.percentage, 4),
      bedrag_eur: rond(item.bedragEUR, 2),
      koers_origineel: rond(item.huidigePrijsOrigineel, 6),
      koers_doel_valuta: rond(item.huidigePrijsVoorkeur, 6),
      koers_eur: rond(item.huidigePrijsEUR, 6),
      valuta: item.voorkeurValuta || item.valuta || 'EUR',
      bedrag_doel_valuta: item.bedragDoelValuta != null ? rond(item.bedragDoelValuta, 2) : null,
      aantal: rond(item.stuks, 6),
      transactie_id: idPerAandeel[item.aandeel_id]?.id || null,
      uitvoer_datum: uitvoerDatum,
    }));

    await updateRun(run.id, {
      status: 'executed',
      executed_at: new Date().toISOString(),
      totaal_bedrag_eur: rond(preview.reduce((som, item) => som + item.bedragEUR, 0), 2),
      details,
      reden: null,
    });

    return {
      status: 'executed',
      groep: plan.groep,
      scheduledDate,
      transacties: details.length,
      totaalBedragEur: rond(preview.reduce((som, item) => som + item.bedragEUR, 0), 2),
    };
  } catch (err) {
    await updateRun(run.id, {
      status: 'failed',
      executed_at: new Date().toISOString(),
      reden: err.message,
    });
    return { status: 'failed', groep: plan.groep, scheduledDate, reden: err.message };
  }
}

async function voerVerschuldigdePlannenUit({ nu = new Date(), bron = 'scheduler' } = {}) {
  const vandaag = amsterdamParts(nu).datum;
  const { data: plannen, error } = await supabase
    .from('autoinvest_plannen')
    .select('*')
    .eq('actief', true)
    .order('gebruiker_id')
    .order('groep');
  if (error) throw error;

  const resultaten = [];
  for (const plan of plannen || []) {
    const holdings = (await haalAandelenOpVoorGebruiker(plan.gebruiker_id))
      .filter(item => (item.rekening || 'Standaard') === plan.groep)
      .filter(item => (plan.allocaties || []).some(allocatie => allocatie.aandeel_id === item.id && Number(allocatie.percentage) > 0));

    if (!holdings.length) {
      resultaten.push({ status: 'skipped', groep: plan.groep, reden: 'Geen aandelen met een positieve allocatie in deze groep.' });
      continue;
    }

    const markt = bepaalMarktStatus(holdings, nu);
    if (!markt.open) {
      resultaten.push({ status: 'skipped', groep: plan.groep, reden: markt.reden });
      continue;
    }

    const { data: runs, error: runError } = await supabase
      .from('autoinvest_runs')
      .select('scheduled_date')
      .eq('plan_id', plan.id);
    if (runError) throw runError;

    const uitgevoerd = new Set((runs || []).map(item => item.scheduled_date));
    const dueDates = lijstVerschuldigdeDatums(plan, uitgevoerd, vandaag);
    if (!dueDates.length) {
      resultaten.push({ status: 'skipped', groep: plan.groep, reden: 'Geen verschuldigde uitvoering gevonden.' });
      continue;
    }

    for (const scheduledDate of dueDates) {
      resultaten.push(await voerPlanUit(plan, holdings, scheduledDate, nu, bron));
    }
  }

  return {
    gecontroleerd: (plannen || []).length,
    uitgevoerd: resultaten.filter(item => item.status === 'executed').length,
    mislukt: resultaten.filter(item => item.status === 'failed').length,
    overgeslagen: resultaten.filter(item => item.status === 'skipped').length,
    resultaten,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  haalAutoInvestOverzichtOp,
  haalAutoInvestGroepOp,
  slaAutoInvestPlanOp,
  verwijderAutoInvestPlan,
  haalAutoInvestGeschiedenisOp,
  voerVerschuldigdePlannenUit,
};





