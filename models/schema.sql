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
  aangemaakt timestamptz default now(),
  unique(gebruiker_id, ticker)    -- één ticker per gebruiker
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
  notitie      text,
  aangemaakt   timestamptz default now()
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

-- Policies: alleen eigen data toegankelijk via service key
create policy "eigen aandelen" on aandelen
  using (gebruiker_id = auth.uid());
create policy "eigen transacties" on transacties
  using (gebruiker_id = auth.uid());
create policy "eigen pagina data" on pagina_data
  using (gebruiker_id = auth.uid());

-- ── INDEXEN ── voor snelle queries
create index if not exists idx_aandelen_gebruiker   on aandelen(gebruiker_id);
create index if not exists idx_transacties_gebruiker on transacties(gebruiker_id);
create index if not exists idx_transacties_aandeel  on transacties(aandeel_id);
create index if not exists idx_transacties_datum    on transacties(datum desc);
create index if not exists idx_pagina_gebruiker     on pagina_data(gebruiker_id, pagina);
