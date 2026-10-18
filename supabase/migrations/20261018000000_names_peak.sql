-- ============================================================
-- Navnejakten — periode da navnet var mest populært
-- Femårsperioden med høyest andel fødte, og toppåret innenfor den.
-- Beregnes av edge function sync-ssb-names (transform.ts: findPeak); null til neste synk.
-- ============================================================

alter table public.names
  add column peak_from smallint,
  add column peak_to   smallint,
  add column peak_year smallint;
