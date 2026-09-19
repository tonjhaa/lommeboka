-- ============================================================
-- Navnejakten v2 — notater på matcher
-- Hver partner har sitt eget notat per match; begge ser begge notatene.
-- Notater kan bare skrives på navn som ER en match, og leses bare mens matchen finnes —
-- de kan dermed aldri avsløre en vurdering som ikke allerede er en felles match.
-- ============================================================

create table public.name_match_notes (
  partnership_id  uuid not null references public.partnerships(id) on delete cascade,
  name_id         uuid not null references public.names(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  note            text not null check (char_length(note) between 1 and 280),
  updated_at      timestamptz not null default now(),
  primary key (partnership_id, name_id, user_id)
);

alter table public.name_match_notes enable row level security;

create policy "notes_select_partners" on public.name_match_notes for select to authenticated
  using (exists (select 1 from public.name_matches m
    join public.partnerships p on p.id = m.partnership_id
    where m.partnership_id = name_match_notes.partnership_id and m.name_id = name_match_notes.name_id
      and p.status = 'accepted' and (p.inviter_id = auth.uid() or p.invitee_id = auth.uid())));

create policy "notes_insert_own" on public.name_match_notes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.name_matches m
    join public.partnerships p on p.id = m.partnership_id
    where m.partnership_id = name_match_notes.partnership_id and m.name_id = name_match_notes.name_id
      and p.status = 'accepted' and (p.inviter_id = auth.uid() or p.invitee_id = auth.uid())));

create policy "notes_update_own" on public.name_match_notes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notes_delete_own" on public.name_match_notes for delete to authenticated
  using (user_id = auth.uid());
