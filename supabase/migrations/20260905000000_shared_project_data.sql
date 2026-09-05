-- Generisk delt lagring for Livet-fanen (Utstyr, Klær, Gaver m.fl.) — ett rad-per-nøkkel
-- JSONB-lager, samme partnerskaps-scopede RLS-mønster som shared_project_transactions.
-- Nøkkelen ("utstyr", "klaer", "gaver_recipients", ...) styrer hvilken liste raden er.
create table public.shared_project_data (
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  key text not null,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (partnership_id, key)
);

alter table public.shared_project_data enable row level security;

create policy "partners_select" on public.shared_project_data for select
  using (exists (select 1 from public.partnerships
    where partnerships.id = shared_project_data.partnership_id
      and partnerships.status = 'accepted'
      and (partnerships.inviter_id = auth.uid() or partnerships.invitee_id = auth.uid())));

create policy "partners_insert" on public.shared_project_data for insert
  with check (exists (select 1 from public.partnerships
    where partnerships.id = shared_project_data.partnership_id
      and partnerships.status = 'accepted'
      and (partnerships.inviter_id = auth.uid() or partnerships.invitee_id = auth.uid())));

create policy "partners_update" on public.shared_project_data for update
  using (exists (select 1 from public.partnerships
    where partnerships.id = shared_project_data.partnership_id
      and partnerships.status = 'accepted'
      and (partnerships.inviter_id = auth.uid() or partnerships.invitee_id = auth.uid())))
  with check (exists (select 1 from public.partnerships
    where partnerships.id = shared_project_data.partnership_id
      and partnerships.status = 'accepted'
      and (partnerships.inviter_id = auth.uid() or partnerships.invitee_id = auth.uid())));

create policy "partners_delete" on public.shared_project_data for delete
  using (exists (select 1 from public.partnerships
    where partnerships.id = shared_project_data.partnership_id
      and partnerships.status = 'accepted'
      and (partnerships.inviter_id = auth.uid() or partnerships.invitee_id = auth.uid())));

alter publication supabase_realtime add table public.shared_project_data;
