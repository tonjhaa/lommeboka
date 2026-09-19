-- ============================================================
-- Navnejakten — «Tinder for babynavn» for to partnere
-- Opprettet: 2026-09-19
--
-- Personvern: name_votes er PRIVAT per bruker (RLS: user_id = auth.uid()) og er
-- bevisst IKKE i supabase_realtime. Partnerens vurderinger kan aldri leses direkte.
-- Matcher (begge har sagt «yes») opprettes av en SECURITY DEFINER-trigger og er
-- synlige for begge partnere via name_matches.
-- ============================================================

-- ── SSB-data (offentlig, lesbar for innloggede; skrives kun av edge function med service role)

create table public.names (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  gender        text not null check (gender in ('girl', 'boy')),
  letters       smallint not null,
  latest_year   smallint not null,
  latest_count  integer  not null,
  latest_rank   integer,
  latest_share  numeric(6, 3),
  trend         text check (trend in ('rising', 'stable', 'falling')),
  timeless      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name, gender)
);

create table public.name_statistics (
  name_id  uuid not null references public.names(id) on delete cascade,
  year     smallint not null,
  count    integer not null,
  share    numeric(6, 3),
  rank     integer,
  primary key (name_id, year)
);

create table public.ssb_sync_log (
  id             uuid primary key default gen_random_uuid(),
  synced_at      timestamptz not null default now(),
  source_table   text not null,
  source_updated timestamptz,
  latest_year    smallint,
  names_count    integer,
  stats_count    integer,
  status         text not null check (status in ('ok', 'error')),
  error          text
);

alter table public.names           enable row level security;
alter table public.name_statistics enable row level security;
alter table public.ssb_sync_log    enable row level security;

create policy "names_read"      on public.names           for select to authenticated using (true);
create policy "name_stats_read" on public.name_statistics for select to authenticated using (true);
create policy "ssb_sync_read"   on public.ssb_sync_log    for select to authenticated using (true);

create index name_statistics_year_idx on public.name_statistics (year);
create index names_gender_rank_idx    on public.names (gender, latest_rank);

-- ── Private vurderinger

create table public.name_votes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name_id     uuid not null references public.names(id) on delete cascade,
  vote        text not null check (vote in ('no', 'maybe', 'yes')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name_id)
);

create index name_votes_name_idx on public.name_votes (name_id, vote);

alter table public.name_votes enable row level security;

create policy "votes_select_own" on public.name_votes for select to authenticated using (user_id = auth.uid());
create policy "votes_insert_own" on public.name_votes for insert to authenticated with check (user_id = auth.uid());
create policy "votes_update_own" on public.name_votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "votes_delete_own" on public.name_votes for delete to authenticated using (user_id = auth.uid());

-- ── Matcher (delt per partnerskap)

create table public.name_matches (
  id              uuid primary key default gen_random_uuid(),
  partnership_id  uuid not null references public.partnerships(id) on delete cascade,
  name_id         uuid not null references public.names(id) on delete cascade,
  matched_at      timestamptz not null default now(),
  unique (partnership_id, name_id)
);

alter table public.name_matches enable row level security;

-- Kun lesing for partnerne. Ingen insert/update/delete-policy: matcher opprettes og fjernes av triggeren under.
create policy "matches_select_partners" on public.name_matches for select to authenticated
  using (exists (select 1 from public.partnerships p
    where p.id = name_matches.partnership_id and p.status = 'accepted'
      and (p.inviter_id = auth.uid() or p.invitee_id = auth.uid())));

-- ── Favoritter (private)

create table public.name_favorites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  name_id     uuid not null references public.names(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, name_id)
);

alter table public.name_favorites enable row level security;
create policy "favorites_own" on public.name_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Match-trigger
-- pg_advisory_xact_lock serialiserer to samtidige «yes» på samme navn, slik at begge transaksjonene
-- ikke går glipp av hverandre (READ COMMITTED ser ikke uncommittede rader).

create or replace function public.name_votes_sync_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid;
  v_name    uuid;
  v_vote    text;
  v_p       public.partnerships%rowtype;
  v_partner uuid;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id; v_name := old.name_id; v_vote := null;
  else
    v_user := new.user_id; v_name := new.name_id; v_vote := new.vote;
  end if;

  select * into v_p from public.partnerships
   where status = 'accepted' and (inviter_id = v_user or invitee_id = v_user)
   limit 1;
  if not found then return null; end if;

  v_partner := case when v_p.inviter_id = v_user then v_p.invitee_id else v_p.inviter_id end;

  perform pg_advisory_xact_lock(hashtextextended(v_p.id::text || v_name::text, 0));

  if v_vote = 'yes' then
    if exists (select 1 from public.name_votes
                where user_id = v_partner and name_id = v_name and vote = 'yes') then
      insert into public.name_matches (partnership_id, name_id)
      values (v_p.id, v_name)
      on conflict (partnership_id, name_id) do nothing;
    end if;
  else
    delete from public.name_matches where partnership_id = v_p.id and name_id = v_name;
  end if;

  return null;
end;
$$;

revoke execute on function public.name_votes_sync_match() from public, anon, authenticated;

create trigger name_votes_match_sync
  after insert or update of vote or delete on public.name_votes
  for each row execute function public.name_votes_sync_match();

-- ── Partnerens samlede tall (kun aggregater — aldri enkeltnavn)

create or replace function public.name_partner_stats()
returns table (rated bigint, yes_count bigint, maybe_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*), count(*) filter (where v.vote = 'yes'), count(*) filter (where v.vote = 'maybe')
    from public.name_votes v
   where v.user_id = (
     select case when p.inviter_id = auth.uid() then p.invitee_id else p.inviter_id end
       from public.partnerships p
      where p.status = 'accepted' and (p.inviter_id = auth.uid() or p.invitee_id = auth.uid())
      limit 1
   );
$$;

revoke execute on function public.name_partner_stats() from public, anon;
grant  execute on function public.name_partner_stats() to authenticated;

-- ── Finalen: felles økt per partnerskap, egen privat kjøring per bruker

create table public.name_finals (
  id              uuid primary key default gen_random_uuid(),
  partnership_id  uuid not null references public.partnerships(id) on delete cascade,
  created_by      uuid not null references auth.users(id) on delete cascade,
  name_ids        uuid[] not null,
  created_at      timestamptz not null default now()
);

alter table public.name_finals enable row level security;

create policy "finals_select_partners" on public.name_finals for select to authenticated
  using (exists (select 1 from public.partnerships p
    where p.id = name_finals.partnership_id and p.status = 'accepted'
      and (p.inviter_id = auth.uid() or p.invitee_id = auth.uid())));

create policy "finals_insert_partners" on public.name_finals for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.partnerships p
    where p.id = name_finals.partnership_id and p.status = 'accepted'
      and (p.inviter_id = auth.uid() or p.invitee_id = auth.uid())));

create table public.name_final_runs (
  final_id    uuid not null references public.name_finals(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  state       jsonb not null,
  status      text not null default 'in_progress' check (status in ('in_progress', 'done')),
  result      jsonb,
  updated_at  timestamptz not null default now(),
  primary key (final_id, user_id)
);

alter table public.name_final_runs enable row level security;
create policy "final_runs_own" on public.name_final_runs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Begge rangeringer utleveres først når BEGGE er ferdige.
create or replace function public.name_final_results(p_final_id uuid)
returns table (user_id uuid, result jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_id, r.result
    from public.name_final_runs r
    join public.name_finals f on f.id = r.final_id
    join public.partnerships p on p.id = f.partnership_id
   where r.final_id = p_final_id
     and r.status = 'done'
     and p.status = 'accepted'
     and (p.inviter_id = auth.uid() or p.invitee_id = auth.uid())
     and (select count(*) from public.name_final_runs r2
           where r2.final_id = p_final_id and r2.status = 'done') = 2;
$$;

-- Har partneren fullført? (kun ja/nei)
create or replace function public.name_final_partner_done(p_final_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.name_final_runs r
      join public.name_finals f on f.id = r.final_id
      join public.partnerships p on p.id = f.partnership_id
     where r.final_id = p_final_id and r.status = 'done' and r.user_id <> auth.uid()
       and p.status = 'accepted' and (p.inviter_id = auth.uid() or p.invitee_id = auth.uid())
  );
$$;

revoke execute on function public.name_final_results(uuid)       from public, anon;
revoke execute on function public.name_final_partner_done(uuid)  from public, anon;
grant  execute on function public.name_final_results(uuid)       to authenticated;
grant  execute on function public.name_final_partner_done(uuid)  to authenticated;

-- Matcher vises live hos den som stemte først (RLS på name_matches gjelder også for realtime).
alter publication supabase_realtime add table public.name_matches;
