-- ══════════════════════════════════════════════════
-- Migratie: rekeningen toevoegen aan aandelen
-- Plak dit in Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

-- Voeg rekening kolom toe aan aandelen tabel
alter table aandelen add column if not exists rekening text not null default 'Standaard';

-- Index voor snelle queries per rekening
create index if not exists idx_aandelen_rekening on aandelen(gebruiker_id, rekening);
