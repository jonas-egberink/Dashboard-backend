-- ══════════════════════════════════════════════════
-- Migratie: nieuws opslag
-- Plak dit in Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

-- Nieuws items opslaan per gebruiker
create table if not exists nieuws (
  id           uuid primary key default gen_random_uuid(),
  gebruiker_id uuid not null references gebruikers(id) on delete cascade,
  titel        text not null,
  link         text not null,
  samenvatting text,
  bron         text,
  gepubliceerd timestamptz,
  aangemaakt   timestamptz default now(),
  gelezen      boolean default false,
  sentiment    text check (sentiment in ('positief', 'negatief', 'neutraal')) default 'neutraal',
  -- Koppeling aan aandelen (NULL = algemeen marktnieuws)
  ticker       text,
  naam         text,
  unique(gebruiker_id, link)  -- geen duplicaten
);

-- Automatisch verwijder nieuws ouder dan 7 dagen
-- (wordt ook via de backend gedaan bij elke fetch)
create index if not exists idx_nieuws_gebruiker    on nieuws(gebruiker_id, aangemaakt desc);
create index if not exists idx_nieuws_ticker       on nieuws(gebruiker_id, ticker);
create index if not exists idx_nieuws_gelezen      on nieuws(gebruiker_id, gelezen);
create index if not exists idx_nieuws_gepubliceerd on nieuws(gepubliceerd desc);

-- RLS
alter table nieuws enable row level security;
create policy "eigen nieuws" on nieuws using (gebruiker_id = auth.uid());
