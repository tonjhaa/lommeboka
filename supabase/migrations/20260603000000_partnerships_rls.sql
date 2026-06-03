-- ============================================================
-- Partnerships — tabell og Row Level Security
-- Opprettet: 2026-06-03
-- Formål: Sikre at kun inviter og invitee kan lese/endre sitt eget partnerskap.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partnerships (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  invitee_email   text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at      timestamptz DEFAULT now(),
  accepted_at     timestamptz,
  UNIQUE (inviter_id, invitee_email)
);

-- RLS
ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;

-- SELECT: inviter og invitee (etter aksept) kan se sine egne rader.
-- Mottakere av pending invitasjon kan se rader der invitee_email matcher.
CREATE POLICY "partnerships_select"
  ON public.partnerships FOR SELECT
  USING (
    auth.uid() = inviter_id
    OR auth.uid() = invitee_id
    OR (invitee_email = auth.jwt() ->> 'email' AND status = 'pending')
  );

-- INSERT: kun inviter_id = innlogget bruker er tillatt.
CREATE POLICY "partnerships_insert"
  ON public.partnerships FOR INSERT
  WITH CHECK (auth.uid() = inviter_id);

-- UPDATE: kun inviter eller invitee kan oppdatere sitt eget partnerskap.
CREATE POLICY "partnerships_update"
  ON public.partnerships FOR UPDATE
  USING (
    auth.uid() = inviter_id
    OR auth.uid() = invitee_id
    OR (invitee_email = auth.jwt() ->> 'email' AND status = 'pending')
  );

-- DELETE: ikke tillatt via RLS — bruk UPDATE status = 'rejected' i stedet.
-- (ingen DELETE-policy = ingen kan slette direkte)
