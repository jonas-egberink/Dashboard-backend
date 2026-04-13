-- ══════════════════════════════════════════════════
-- Dashboard Database Schema
-- Plak dit in Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

-- ── GEBRUIKERS ──
-- Elke gebruiker heeft zijn eigen afgeschermde data.
-- Wachtwoorden worden NOOIT hier opgeslagen — dat doet bcrypt in Node.
create table if not exists gebruikers (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  wachtwoord text not null,       -- bcrypt hash
  naam       text,
  aangemaakt timestamptz default now()
);

-- ── AANDELEN ──
-- Elk aandeel hoort bij één gebruiker.
-- Meerdere aankopen van hetzelfde aandeel → meerdere rijen in transacties.
create table if not exists aandelen (
  id         uuid primary key default gen_random_uuid(),
  gebruiker_id uuid not null references gebruikers(id) on delete cascade,
  ticker     text not null,
  naam       text not null,
  exchange   text,
  valuta     text default 'USD',
  type       text default 'EQUITY',
  rekening   text not null default 'Standaard',
  aangemaakt timestamptz default now(),
  unique(gebruiker_id, ticker, rekening) -- één ticker per rekening per gebruiker
);

-- ── TRANSACTIES ──
-- Elke aankoop of verkoop is een aparte rij.
-- Combineren naar totaal doe je in de backend/frontend.
create table if not exists transacties (
  id           uuid primary key default gen_random_uuid(),
  gebruiker_id uuid not null references gebruikers(id) on delete cascade,
  aandeel_id   uuid not null references aandelen(id) on delete cascade,
  type         text not null check (type in ('Buy', 'Sell')),
  datum        date not null,
  aantal       numeric(18,6) not null check (aantal > 0),
  prijs        numeric(18,4) not null check (prijs > 0),
  fees         numeric(18,4) default 0,
  valuta       text not null default 'EUR',
  notitie      text,
  aangemaakt   timestamptz default now()
);

-- ── AUTO-INVEST ──
-- Plannen per rekening/groep, met JSON allocaties per aandeel.
create table if not exists autoinvest_plannen (
  id               uuid primary key default gen_random_uuid(),
  gebruiker_id     uuid not null references gebruikers(id) on delete cascade,
  groep            text not null,
  maandbedrag_input numeric(18,2),
  maandbedrag_valuta text not null default 'EUR',
  maandbedrag_eur  numeric(18,2) not null check (maandbedrag_eur > 0),
  uitvoer_dag      integer not null check (uitvoer_dag between 1 and 31),
  startdatum       date not null,
  einddatum        date,
  actief           boolean not null default true,
  allocaties       jsonb not null default '[]'::jsonb,
  aangemaakt       timestamptz default now(),
  bijgewerkt       timestamptz default now(),
  unique(gebruiker_id, groep),
  check (einddatum is null or einddatum >= startdatum)
);

-- Uitvoeringshistorie van Auto-Invest runs.
create table if not exists autoinvest_runs (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid references autoinvest_plannen(id) on delete set null,
  gebruiker_id      uuid not null references gebruikers(id) on delete cascade,
  groep             text not null,
  scheduled_date    date not null,
  executed_at       timestamptz,
  status            text not null default 'running' check (status in ('running', 'executed', 'failed', 'skipped')),
  totaal_bedrag_eur numeric(18,2),
  details           jsonb not null default '[]'::jsonb,
  reden             text,
  aangemaakt        timestamptz default now(),
  unique(plan_id, scheduled_date)
);

-- ── PAGINA DATA ──
-- Generieke key-value opslag per gebruiker per pagina.
-- Hiermee kun je custom pagina's bouwen zonder extra tabellen.
create table if not exists pagina_data (
  id           uuid primary key default gen_random_uuid(),
  gebruiker_id uuid not null references gebruikers(id) on delete cascade,
  pagina       text not null,     -- bijv. 'projecten', 'goals', 'notities'
  sleutel      text not null,     -- bijv. 'item_1', 'config'
  waarde       jsonb not null,    -- flexibel JSON object
  bijgewerkt   timestamptz default now(),
  unique(gebruiker_id, pagina, sleutel)
);

-- ── ROW LEVEL SECURITY ──
-- Extra bescherming: gebruikers kunnen elkaars data NOOIT zien,
-- zelfs als iemand direct de Supabase API zou aanspreken.
alter table aandelen    enable row level security;
alter table transacties enable row level security;
alter table pagina_data enable row level security;
alter table autoinvest_plannen enable row level security;
alter table autoinvest_runs enable row level security;

-- Policies: alleen eigen data toegankelijk via service key
create policy "eigen aandelen" on aandelen
  using (gebruiker_id = auth.uid());
create policy "eigen transacties" on transacties
  using (gebruiker_id = auth.uid());
create policy "eigen pagina data" on pagina_data
  using (gebruiker_id = auth.uid());
create policy "eigen autoinvest plannen" on autoinvest_plannen
  using (gebruiker_id = auth.uid());
create policy "eigen autoinvest runs" on autoinvest_runs
  using (gebruiker_id = auth.uid());

-- ── INDEXEN ── voor snelle queries
create index if not exists idx_aandelen_gebruiker   on aandelen(gebruiker_id);
create index if not exists idx_aandelen_rekening    on aandelen(gebruiker_id, rekening);
create index if not exists idx_transacties_gebruiker on transacties(gebruiker_id);
create index if not exists idx_transacties_aandeel  on transacties(aandeel_id);
create index if not exists idx_transacties_datum    on transacties(datum desc);
create index if not exists idx_transacties_valuta   on transacties(valuta);
create index if not exists idx_pagina_gebruiker     on pagina_data(gebruiker_id, pagina);
create index if not exists idx_autoinvest_plannen_gebruiker on autoinvest_plannen(gebruiker_id, groep);
create index if not exists idx_autoinvest_runs_gebruiker on autoinvest_runs(gebruiker_id, groep, scheduled_date desc);
create index if not exists idx_autoinvest_runs_plan on autoinvest_runs(plan_id, scheduled_date desc);
