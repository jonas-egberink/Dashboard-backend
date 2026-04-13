-- ══════════════════════════════════════════════════
-- Migratie: Auto-Invest plannen en uitvoeringen
-- Plak dit in Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

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
  aangemaakt       timestamptz not null default now(),
  bijgewerkt       timestamptz not null default now(),
  unique(gebruiker_id, groep),
  check (einddatum is null or einddatum >= startdatum)
);

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
  aangemaakt        timestamptz not null default now(),
  unique(plan_id, scheduled_date)
);

alter table autoinvest_plannen enable row level security;
alter table autoinvest_runs enable row level security;

create policy "eigen autoinvest plannen" on autoinvest_plannen
  using (gebruiker_id = auth.uid());

create policy "eigen autoinvest runs" on autoinvest_runs
  using (gebruiker_id = auth.uid());

create index if not exists idx_autoinvest_plannen_gebruiker on autoinvest_plannen(gebruiker_id, groep);
create index if not exists idx_autoinvest_runs_gebruiker on autoinvest_runs(gebruiker_id, groep, scheduled_date desc);
create index if not exists idx_autoinvest_runs_plan on autoinvest_runs(plan_id, scheduled_date desc);

-- Backward-compatible upgrades voor bestaande tabellen
alter table autoinvest_plannen add column if not exists maandbedrag_input numeric(18,2);
alter table autoinvest_plannen add column if not exists maandbedrag_valuta text not null default 'EUR';

update autoinvest_plannen
set maandbedrag_input = coalesce(maandbedrag_input, maandbedrag_eur)
where maandbedrag_input is null;


