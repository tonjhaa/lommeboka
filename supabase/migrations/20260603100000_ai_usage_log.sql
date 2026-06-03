-- ============================================================
-- AI-brukslogg og database-basert rate limiting
-- Formål: spore AI-kall per bruker, håndheve daglig kvote
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL,   -- 'permisjon-ai' | 'parse-payslip'
  tokens_est  int,                    -- estimert antall tokens (input)
  created_at  timestamptz DEFAULT now()
);

-- Indeks for rask dagsopptelling per bruker
CREATE INDEX IF NOT EXISTS ai_usage_log_user_day
  ON public.ai_usage_log (user_id, endpoint, created_at);

-- RLS: brukere ser bare sin egen brukslogg (kun lese)
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_log_select_own"
  ON public.ai_usage_log FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT skjer kun fra edge functions via service role — ingen bruker-INSERT-policy.
-- Edge functions bruker supabaseAdmin (SERVICE_ROLE_KEY) for å skrive til tabellen.
