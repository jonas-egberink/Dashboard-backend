-- ══════════════════════════════════════════════════
-- Migratie: transactie valuta
-- Plak dit in Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

-- Voeg valuta kolom toe aan transacties
-- Standaard EUR want de meeste gebruikers kopen in EUR
alter table transacties add column if not exists valuta text not null default 'EUR';

-- Index voor snelle queries
create index if not exists idx_transacties_valuta on transacties(valuta);
